//! El asistente "Configurar Brote" (paso 10). La revisión y los arreglos los hace un script de
//! Node (`packages/adapter/src/configurar.ts`); aquí solo se lanza y se abren terminales o páginas
//! de una lista cerrada: la ventana nunca puede pedir un comando o una dirección cualquiera.

use std::process::{Command, Stdio};

use tauri::AppHandle;

use crate::entorno;

/// Pasos que el script sabe aplicar (ver `aplicar` en configurar.ts).
const PASOS: &[&str] = &[
    "openclaw", "agente", "modelo", "gateway", "identidad", "permisos", "skill", "mcp", "memoria", "calendario-mac",
    "programador", "programador-quitar", "statusline", "statusline-quitar",
];

pub fn script(app: &AppHandle) -> std::path::PathBuf {
    match entorno::recursos(app) {
        Some(carpeta) => carpeta.join("configurar.mjs"),
        None => std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../packages/adapter/src/configurar.ts"),
    }
}

/// Dónde puede estar Homebrew (Apple Silicon e Intel). Lista cerrada: el comando de la terminal se
/// arma solo con estas rutas.
const RUTAS_BREW: &[&str] = &["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];

/// La ruta de Homebrew, si está instalado (solo en macOS).
fn brew() -> Option<&'static str> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    RUTAS_BREW.iter().copied().find(|ruta| std::path::Path::new(ruta).exists())
}

/// Lo que devuelve la revisión cuando ni siquiera hay Node para correr el script. Con Homebrew se
/// ofrece instalarlo con él (en una terminal, a la vista); si no, la página oficial.
fn sin_node(con_brew: bool) -> String {
    let descargar = serde_json::json!({ "tipo": "enlace", "etiqueta": "Descargar Node", "enlace": "node" });
    let (accion, alternativa) = if con_brew {
        (serde_json::json!({ "tipo": "terminal", "etiqueta": "Instalar con Homebrew", "terminal": "brew-node" }), descargar)
    } else {
        (descargar, serde_json::Value::Null)
    };
    serde_json::json!([{
        "id": "node",
        "titulo": "Node",
        "estado": "falta",
        "detalle": format!("No encontré Node {} o superior. Brote lo necesita para funcionar.", entorno::NODE_MINIMO),
        "accion": accion,
        "alternativa": alternativa,
    }])
    .to_string()
}

/// Corre el script: `revisar`, `rapido` o `aplicar <paso>`. Devuelve su salida (JSON).
#[tauri::command]
pub async fn configuracion(app: AppHandle, orden: String, paso: Option<String>) -> Result<String, String> {
    let mut argumentos = vec![orden.clone()];
    match (orden.as_str(), paso) {
        ("revisar" | "rapido" | "conectores", None) => {}
        ("desconectar", Some(id)) if crate::conectores::id_valido(&id) => argumentos.push(id),
        ("aplicar", Some(paso)) if PASOS.contains(&paso.as_str()) => argumentos.push(paso),
        _ => return Err("pedido no válido".into()),
    }
    let Some((node, _)) = entorno::buscar_node() else {
        return Ok(if orden == "rapido" { r#"{"listo":false}"#.into() } else { sin_node(brew().is_some()) });
    };
    let script = script(&app);
    // El script puede tardar (instalar OpenClaw, configurarlo): se corre fuera del hilo principal.
    tauri::async_runtime::spawn_blocking(move || {
        let salida = entorno::sin_consola(entorno::sin_clave_api(&mut Command::new(node)))
            .arg(script)
            .args(argumentos)
            .stdin(Stdio::null())
            .output()
            .map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&salida.stdout).trim().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// El comando de cada terminal que se puede abrir (lista cerrada). `brew` es la ruta de Homebrew,
/// que solo puede ser una de `RUTAS_BREW`.
fn comando_terminal(cual: &str, brew: Option<&'static str>) -> Option<String> {
    match cual {
        "login-claude" => Some("claude".into()),
        "memoria-local" => Some("openclaw configure --section model".into()),
        // Cuentas de IA del equipo de Brote: inicios de sesión en el navegador y, si pegarla en la
        // ventana falla, la clave de Gemini en la terminal (OpenClaw la pide sin mostrarla).
        "login-chatgpt" => Some("openclaw models auth login --provider openai".into()),
        "login-grok" => Some("openclaw models auth login --provider xai --method oauth".into()),
        "clave-gemini" => Some("openclaw models auth paste-api-key --provider google".into()),
        "brew-node" => brew.filter(|ruta| RUTAS_BREW.contains(ruta)).map(|ruta| format!("{ruta} install node")),
        _ => None,
    }
}

/// Abre una terminal con uno de los comandos que necesitan interacción del usuario.
#[tauri::command]
pub fn abrir_terminal(cual: String) -> Result<(), String> {
    let comando = comando_terminal(&cual, brew()).ok_or("terminal no válida")?;
    let comando = comando.as_str();
    #[cfg(target_os = "macos")]
    let lanzado = Command::new("osascript")
        .args(["-e", &format!("tell application \"Terminal\" to do script \"{comando}\""), "-e", "tell application \"Terminal\" to activate"])
        .status();
    #[cfg(target_os = "windows")]
    let lanzado = Command::new("cmd").args(["/c", "start", "", "cmd", "/k", comando]).status();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let lanzado = Command::new("x-terminal-emulator").args(["-e", comando]).status();
    lanzado.map(|_| ()).map_err(|e| e.to_string())
}

/// Abre en el navegador una de las páginas oficiales para instalar lo que falta.
#[tauri::command]
pub fn abrir_enlace(cual: String) -> Result<(), String> {
    let direccion = match cual.as_str() {
        "node" => "https://nodejs.org/es/download",
        "claude-code" => "https://claude.com/claude-code",
        "aistudio-clave" => "https://aistudio.google.com/apikey",
        "privacidad-calendarios" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars",
        "privacidad-descargas" => "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders",
        "privacidad-automatizacion" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
        _ => return Err("enlace no válido".into()),
    };
    #[cfg(target_os = "macos")]
    let abierto = Command::new("open").arg(direccion).status();
    #[cfg(target_os = "windows")]
    let abierto = Command::new("cmd").args(["/c", "start", "", direccion]).status();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let abierto = Command::new("xdg-open").arg(direccion).status();
    abierto.map(|_| ()).map_err(|e| e.to_string())
}

/// Reinicia la app: después de configurar, el puente tiene que volver a conectarse con todo nuevo.
#[tauri::command]
pub fn reiniciar(app: AppHandle) {
    app.restart();
}

/// La carpeta de datos de Brote (`~/.asistente-prototipo`), solo para el usuario.
pub fn carpeta_datos() -> Result<std::path::PathBuf, String> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).ok_or("no encuentro la carpeta personal")?;
    let carpeta = std::path::PathBuf::from(home).join(".asistente-prototipo");
    std::fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&carpeta, std::fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    Ok(carpeta)
}

/// Escribe un archivo que solo puede leer el usuario (permisos 600 en macOS y Linux).
pub fn escribir_privado(ruta: &std::path::Path, contenido: &str) -> Result<(), String> {
    use std::io::Write;
    let mut opciones = std::fs::OpenOptions::new();
    opciones.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        opciones.mode(0o600);
        if ruta.exists() {
            std::fs::set_permissions(ruta, std::fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
        }
    }
    let mut archivo = opciones.open(ruta).map_err(|e| e.to_string())?;
    archivo.write_all(contenido.as_bytes()).map_err(|e| e.to_string())
}

/// La dirección iCal, validada: solo https (webcal:// es lo mismo), sin espacios, de largo razonable.
pub fn validar_url_ical(texto: &str) -> Result<String, String> {
    let limpio = texto.trim();
    let limpio = match limpio.get(..9) {
        Some(inicio) if inicio.eq_ignore_ascii_case("webcal://") => format!("https://{}", &limpio[9..]),
        _ => limpio.to_string(),
    };
    let resto = limpio
        .get(..8)
        .filter(|inicio| inicio.eq_ignore_ascii_case("https://"))
        .map(|_| &limpio[8..])
        .ok_or("la dirección debe empezar con https:// (o webcal://)")?;
    let host = resto.split(['/', '?', '#']).next().unwrap_or("");
    if limpio.len() > 2000 || host.is_empty() || limpio.chars().any(|c| c.is_whitespace() || c.is_control() || c == '"') {
        return Err("esa no parece una dirección iCal".into());
    }
    Ok(limpio)
}

/// Guarda (o borra, con `None`) la dirección iCal secreta en `~/.asistente-prototipo/calendario.json`.
/// La lee el puente (calendario.ts), que nota el cambio solo en menos de un minuto.
#[tauri::command]
pub fn guardar_calendario(url: Option<String>) -> Result<(), String> {
    let ruta = carpeta_datos()?.join("calendario.json");
    match url {
        Some(url) => {
            let url = validar_url_ical(&url)?;
            escribir_privado(&ruta, &serde_json::json!({ "ical": url }).to_string())
        }
        None => match std::fs::remove_file(&ruta) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        },
    }
}

/// Plataformas de aula que Brote sabe leer (packages/motor/src/aula.ts).
const AULAS: &[&str] = &["canvas", "moodle"];

/// La dirección del campus: https y solo el origen (Brote arma las rutas de la API).
pub fn validar_url_aula(texto: &str) -> Result<String, String> {
    let limpio = texto.trim().trim_end_matches('/');
    let resto = limpio
        .get(..8)
        .filter(|inicio| inicio.eq_ignore_ascii_case("https://"))
        .map(|_| &limpio[8..])
        .ok_or("la dirección del campus debe empezar con https://")?;
    let (host, ruta) = resto.split_once('/').map_or((resto, ""), |(h, r)| (h, r));
    let host_ok = !host.is_empty() && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == ':');
    let ruta_ok = ruta.chars().all(|c| c.is_ascii_alphanumeric() || "/-_.~".contains(c));
    if limpio.len() > 300 || !host_ok || !ruta_ok {
        return Err("esa no parece la dirección de un campus (por ejemplo https://campus.miu.cl)".into());
    }
    Ok(format!("https://{}{}", host.to_ascii_lowercase(), if ruta.is_empty() { String::new() } else { format!("/{ruta}") }))
}

/// Un token personal de Canvas o Moodle: ASCII visible, sin espacios ni comillas.
pub fn validar_token_aula(token: &str) -> Result<String, String> {
    let limpio = token.trim();
    if !(16..=300).contains(&limpio.len()) || !limpio.chars().all(|c| c.is_ascii_alphanumeric() || "~_-.".contains(c)) {
        return Err("ese token no parece válido (cópialo completo, sin espacios)".into());
    }
    Ok(limpio.to_string())
}

/// Guarda (o borra, con `tipo: None`) el aula en `~/.asistente-prototipo/aula.json` con permisos 600.
/// El token nunca se registra; lo lee el puente (aula.ts), que nota el cambio solo.
#[tauri::command]
pub fn guardar_aula(tipo: Option<String>, url: Option<String>, token: Option<String>) -> Result<(), String> {
    let ruta = carpeta_datos()?.join("aula.json");
    let Some(tipo) = tipo else {
        return match std::fs::remove_file(&ruta) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        };
    };
    if !AULAS.contains(&tipo.as_str()) {
        return Err("plataforma no válida".into());
    }
    let url = validar_url_aula(url.as_deref().unwrap_or(""))?;
    let token = validar_token_aula(token.as_deref().unwrap_or(""))?;
    escribir_privado(&ruta, &serde_json::json!({ "tipo": tipo, "url": url, "token": token }).to_string())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn terminales_de_una_lista_cerrada() {
        assert_eq!(comando_terminal("login-claude", None).unwrap(), "claude");
        assert_eq!(comando_terminal("brew-node", Some("/opt/homebrew/bin/brew")).unwrap(), "/opt/homebrew/bin/brew install node");
        // Sin Homebrew (o con una ruta que no es de la lista) no hay comando.
        assert!(comando_terminal("brew-node", None).is_none());
        assert!(comando_terminal("brew-node", Some("/tmp/brew")).is_none());
        assert!(comando_terminal("rm -rf ~", None).is_none());
        assert_eq!(comando_terminal("login-grok", None).unwrap(), "openclaw models auth login --provider xai --method oauth");
        assert_eq!(comando_terminal("clave-gemini", None).unwrap(), "openclaw models auth paste-api-key --provider google");
        let sin = serde_json::from_str::<serde_json::Value>(&sin_node(false)).unwrap();
        assert_eq!(sin[0]["accion"]["enlace"], "node");
        let con = serde_json::from_str::<serde_json::Value>(&sin_node(true)).unwrap();
        assert_eq!(con[0]["accion"]["terminal"], "brew-node");
        assert_eq!(con[0]["alternativa"]["enlace"], "node");
    }

    #[test]
    fn solo_direcciones_ical_https() {
        assert_eq!(
            validar_url_ical(" webcal://calendar.google.com/calendar/ical/x/private-y/basic.ics ").unwrap(),
            "https://calendar.google.com/calendar/ical/x/private-y/basic.ics"
        );
        assert!(validar_url_ical("https://ejemplo.cl/a.ics").is_ok());
        for mala in ["http://ejemplo.cl/a.ics", "file:///etc/passwd", "https://", "https:///a", "https://a b.cl", "ejemplo.cl", "https://a.cl/\"x"] {
            assert!(validar_url_ical(mala).is_err(), "{mala}");
        }
    }

    #[test]
    fn aula_solo_https_y_tokens_limpios() {
        assert_eq!(validar_url_aula(" https://Campus.MiU.cl/ ").unwrap(), "https://campus.miu.cl");
        assert_eq!(validar_url_aula("https://aula.miu.cl/moodle").unwrap(), "https://aula.miu.cl/moodle");
        for mala in ["http://campus.miu.cl", "campus.miu.cl", "https://", "https://a b.cl", "https://x.cl/?t=1", "https://u@x.cl", "file:///etc"] {
            assert!(validar_url_aula(mala).is_err(), "{mala}");
        }
        assert_eq!(validar_token_aula(" 1234~AbCdEfGhIjKlMnOpQr ").unwrap(), "1234~AbCdEfGhIjKlMnOpQr");
        assert!(validar_token_aula("0123456789abcdef0123456789abcdef").is_ok());
        for malo in ["corto", "con espacio 12345678901234", "comilla\"12345678901234567", &"a".repeat(301)] {
            assert!(validar_token_aula(malo).is_err(), "{malo}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn escribe_con_permisos_600() {
        use std::os::unix::fs::PermissionsExt;
        let ruta = std::env::temp_dir().join(format!("brote-privado-{}.json", std::process::id()));
        std::fs::write(&ruta, "viejo").unwrap();
        std::fs::set_permissions(&ruta, std::fs::Permissions::from_mode(0o644)).unwrap();
        escribir_privado(&ruta, "{}").unwrap();
        assert_eq!(std::fs::metadata(&ruta).unwrap().permissions().mode() & 0o777, 0o600);
        assert_eq!(std::fs::read_to_string(&ruta).unwrap(), "{}");
        std::fs::remove_file(&ruta).unwrap();
    }
}
