//! Modelos de whisper.cpp para "Grabar y transcribir" (sección 8 de docs/plan-rediseno.md). La ventana
//! solo puede pedir uno de la lista cerrada de abajo: Rust arma la dirección (host oficial de ggml en
//! Hugging Face, fijada a un commit), descarga con el `curl` del sistema (solo https, también al seguir
//! redirecciones, con tope de tamaño), verifica tamaño y SHA-256 y recién entonces deja el archivo con
//! su nombre final (escritura atómica, permisos 600; la carpeta, 700). La lista debe coincidir con
//! packages/motor/src/modelos-whisper.ts (lo revisa una prueba del motor).

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, State};

use crate::configuracion::carpeta_datos;
use crate::entorno;

const COMMIT: &str = "5359861c739e955e79d9a303bcbc70fb988958b1";
const HOST: &str = "huggingface.co";

/// (id, archivo, bytes, sha256). Cifras verificadas el 5-10-2026 con `x-linked-size` / `x-linked-etag`.
const MODELOS: &[(&str, &str, u64, &str)] = &[
    ("base", "ggml-base.bin", 147_951_465, "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"),
    ("small", "ggml-small.bin", 487_601_967, "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b"),
    ("medium", "ggml-medium.bin", 1_533_763_059, "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208"),
    ("large-v3-turbo", "ggml-large-v3-turbo.bin", 1_624_555_275, "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69"),
];

struct Ficha {
    archivo: &'static str,
    bytes: u64,
    sha256: &'static str,
}

fn ficha(id: &str) -> Option<Ficha> {
    MODELOS.iter().find(|m| m.0 == id).map(|m| Ficha { archivo: m.1, bytes: m.2, sha256: m.3 })
}

fn url_de(archivo: &str) -> String {
    format!("https://{HOST}/ggerganov/whisper.cpp/resolve/{COMMIT}/{archivo}")
}

/// La carpeta de modelos (700): `ASISTENTE_MODELOS` o `~/.asistente-prototipo/modelos`.
pub fn carpeta_modelos() -> Result<PathBuf, String> {
    let carpeta = match std::env::var_os("ASISTENTE_MODELOS") {
        Some(propia) => PathBuf::from(propia),
        None => carpeta_datos()?.join("modelos"),
    };
    std::fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&carpeta, std::fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    Ok(carpeta)
}

/// Cuánto pesa un archivo, o 0 si no está.
fn tamano(ruta: &Path) -> u64 {
    std::fs::metadata(ruta).map(|m| m.len()).unwrap_or(0)
}

/// El SHA-256 de un archivo, leído por trozos (los modelos pesan GB).
fn sha256_de(ruta: &Path) -> Result<String, String> {
    let mut archivo = std::fs::File::open(ruta).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut trozo = vec![0u8; 1 << 20];
    loop {
        let n = archivo.read(&mut trozo).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&trozo[..n]);
    }
    Ok(hash.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Revisa que el archivo tenga el tamaño y el hash de la lista; si no, dice por qué.
fn verificar(ruta: &Path, ficha: &Ficha) -> Result<(), String> {
    if tamano(ruta) != ficha.bytes {
        return Err("el archivo descargado no tiene el tamaño esperado".into());
    }
    if sha256_de(ruta)? != ficha.sha256 {
        return Err("el archivo descargado no coincide con el original (SHA-256 distinto); no lo usé".into());
    }
    Ok(())
}

fn curl() -> &'static str {
    if cfg!(target_os = "macos") {
        "/usr/bin/curl"
    } else if cfg!(windows) {
        "curl.exe"
    } else {
        "curl"
    }
}

/// Los argumentos de curl: solo https (también en redirecciones), falla con errores HTTP, tope de tamaño
/// y sin leer ~/.curlrc. La dirección sale de la lista cerrada, nunca de la ventana.
fn argumentos_curl(url: &str, destino: &Path, bytes: u64) -> Vec<String> {
    vec![
        // `--disable` solo vale como primer argumento (no leer ~/.curlrc).
        "--disable".into(),
        "--silent".into(),
        "--show-error".into(),
        "--fail".into(),
        "--location".into(),
        "--proto".into(),
        "=https".into(),
        "--proto-redir".into(),
        "=https".into(),
        "--max-redirs".into(),
        "5".into(),
        "--max-filesize".into(),
        bytes.to_string(),
        "--connect-timeout".into(),
        "20".into(),
        "--output".into(),
        destino.to_string_lossy().into_owned(),
        url.into(),
    ]
}

/// Cancelación de la descarga en curso (una a la vez).
#[derive(Default)]
pub struct DescargaModelo {
    en_curso: Arc<AtomicBool>,
    cancelar: Arc<AtomicBool>,
}

fn crear_parcial(ruta: &Path) -> Result<(), String> {
    let mut opciones = std::fs::OpenOptions::new();
    opciones.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opciones.mode(0o600);
    }
    opciones.open(ruta).map(|_| ()).map_err(|e| e.to_string())
}

/// Descarga un modelo de la lista. Emite el evento `modelo` con `{ modelo, fase, bytes, total }` (fase
/// `descargando` | `verificando` | `listo` | `error` | `cancelado`) y devuelve cuando terminó.
#[tauri::command]
pub async fn modelo_descargar(app: AppHandle, estado: State<'_, DescargaModelo>, modelo: String) -> Result<(), String> {
    let ficha = ficha(&modelo).ok_or("ese modelo no está en la lista")?;
    if estado.en_curso.swap(true, Ordering::SeqCst) {
        return Err("ya hay una descarga en curso".into());
    }
    estado.cancelar.store(false, Ordering::SeqCst);
    let en_curso = estado.en_curso.clone();
    let cancelar = estado.cancelar.clone();
    let resultado = tauri::async_runtime::spawn_blocking(move || descargar(&app, &modelo, &ficha, &cancelar)).await.map_err(|e| e.to_string());
    en_curso.store(false, Ordering::SeqCst);
    resultado?
}

fn descargar(app: &AppHandle, modelo: &str, ficha: &Ficha, cancelar: &AtomicBool) -> Result<(), String> {
    let emitir = |fase: &str, bytes: u64, detalle: Option<&str>| {
        let _ = app.emit("modelo", serde_json::json!({ "modelo": modelo, "fase": fase, "bytes": bytes, "total": ficha.bytes, "detalle": detalle }));
    };
    let carpeta = carpeta_modelos()?;
    let final_ = carpeta.join(ficha.archivo);
    // Ya está completo y verificado: no se descarga de nuevo.
    if verificar(&final_, ficha).is_ok() {
        emitir("listo", ficha.bytes, None);
        return Ok(());
    }
    let parcial = carpeta.join(format!("{}.parte", ficha.archivo));
    let fallar = |mensaje: String| -> Result<(), String> {
        let _ = std::fs::remove_file(&parcial);
        emitir("error", 0, Some(&mensaje));
        Err(mensaje)
    };
    crear_parcial(&parcial)?;
    let mut hijo = match entorno::sin_consola(&mut Command::new(curl()))
        .args(argumentos_curl(&url_de(ficha.archivo), &parcial, ficha.bytes))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(h) => h,
        Err(_) => return fallar("no pude lanzar curl para descargar el modelo".into()),
    };
    loop {
        match hijo.try_wait() {
            Ok(Some(estado)) => {
                if !estado.success() {
                    let mut texto = String::new();
                    if let Some(mut e) = hijo.stderr.take() {
                        let _ = e.read_to_string(&mut texto);
                    }
                    let ultima = texto.lines().last().unwrap_or("").trim().to_string();
                    return fallar(format!("la descarga falló{}", if ultima.is_empty() { String::new() } else { format!(": {ultima}") }));
                }
                break;
            }
            Ok(None) => {}
            Err(e) => return fallar(e.to_string()),
        }
        if cancelar.load(Ordering::SeqCst) {
            let _ = hijo.kill();
            let _ = hijo.wait();
            let _ = std::fs::remove_file(&parcial);
            emitir("cancelado", 0, None);
            return Err("descarga cancelada".into());
        }
        emitir("descargando", tamano(&parcial), None);
        std::thread::sleep(Duration::from_millis(500));
    }
    emitir("verificando", ficha.bytes, None);
    if let Err(motivo) = verificar(&parcial, ficha) {
        return fallar(motivo);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&parcial, std::fs::Permissions::from_mode(0o600));
    }
    if let Err(e) = std::fs::rename(&parcial, &final_) {
        return fallar(e.to_string());
    }
    emitir("listo", ficha.bytes, None);
    Ok(())
}

/// Corta la descarga en curso (si hay).
#[tauri::command]
pub fn modelo_cancelar(estado: State<'_, DescargaModelo>) {
    estado.cancelar.store(true, Ordering::SeqCst);
}

/// Qué modelos están completos (tamaño exacto; el hash se verificó al descargar).
#[tauri::command]
pub fn modelos_estado() -> Result<serde_json::Value, String> {
    let carpeta = carpeta_modelos()?;
    let mut estado = serde_json::Map::new();
    for (id, archivo, bytes, _) in MODELOS {
        estado.insert((*id).into(), serde_json::Value::Bool(tamano(&carpeta.join(archivo)) == *bytes));
    }
    Ok(serde_json::Value::Object(estado))
}

/// Borra un modelo descargado (solo los de la lista, con su nombre exacto, dentro de la carpeta de modelos).
#[tauri::command]
pub fn modelo_borrar(modelo: String) -> Result<(), String> {
    let ficha = ficha(&modelo).ok_or("ese modelo no está en la lista")?;
    let ruta = carpeta_modelos()?.join(ficha.archivo);
    match std::fs::remove_file(&ruta) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn temporal(nombre: &str) -> PathBuf {
        let carpeta = std::env::temp_dir().join(format!("brote-modelos-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&carpeta);
        std::fs::create_dir_all(&carpeta).unwrap();
        carpeta
    }

    #[test]
    fn solo_modelos_de_la_lista_y_direcciones_oficiales() {
        assert!(ficha("small").is_some());
        assert!(ficha("../small").is_none());
        assert!(ficha("tiny").is_none());
        assert!(ficha("").is_none());
        for (_, archivo, _, sha) in MODELOS {
            let url = url_de(archivo);
            assert!(url.starts_with("https://huggingface.co/ggerganov/whisper.cpp/resolve/"));
            assert!(url.contains(COMMIT));
            assert_eq!(sha.len(), 64);
            assert!(sha.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        }
    }

    #[test]
    fn curl_solo_https_con_tope_y_sin_configuracion_ajena() {
        let args = argumentos_curl("https://huggingface.co/x.bin", Path::new("/tmp/x.parte"), 1234);
        let junta = args.join(" ");
        assert!(junta.contains("--proto =https") && junta.contains("--proto-redir =https"));
        assert!(junta.contains("--max-filesize 1234") && junta.contains("--fail"));
        assert_eq!(args[0], "--disable");
        assert_eq!(args.last().unwrap(), "https://huggingface.co/x.bin");
    }

    #[test]
    fn verifica_tamano_y_hash() {
        let carpeta = temporal("hash");
        let archivo = carpeta.join("a.bin");
        std::fs::write(&archivo, b"hola").unwrap();
        // SHA-256 de "hola"
        let sha = "b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79";
        assert_eq!(sha256_de(&archivo).unwrap(), sha);
        assert!(verificar(&archivo, &Ficha { archivo: "a.bin", bytes: 4, sha256: sha }).is_ok());
        assert!(verificar(&archivo, &Ficha { archivo: "a.bin", bytes: 5, sha256: sha }).unwrap_err().contains("tamaño"));
        let distinto = verificar(&archivo, &Ficha { archivo: "a.bin", bytes: 4, sha256: "0000000000000000000000000000000000000000000000000000000000000000" }).unwrap_err();
        assert!(distinto.contains("SHA-256"));
        let _ = std::fs::remove_dir_all(carpeta);
    }

    #[cfg(unix)]
    #[test]
    fn el_parcial_nace_con_permisos_600() {
        use std::os::unix::fs::PermissionsExt;
        let carpeta = temporal("permisos");
        let parcial = carpeta.join("m.parte");
        crear_parcial(&parcial).unwrap();
        assert_eq!(std::fs::metadata(&parcial).unwrap().permissions().mode() & 0o777, 0o600);
        let _ = std::fs::remove_dir_all(carpeta);
    }
}
