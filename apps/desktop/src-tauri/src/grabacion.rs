//! Captura del micrófono para "Grabar y transcribir" (sección 8 de docs/plan-rediseno.md, fase 3).
//! Se hace aquí, en Rust, y no en el WebView, para que el permiso del micrófono sea de Brote.app.
//! Solo manual: graba cuando el usuario lo pide y para cuando lo pide (o a las 3 h). El resultado es un
//! WAV mono de 16 kHz y 16 bits en `~/.asistente-prototipo/grabaciones/<id>.wav`, escrito de a poco
//! con el encabezado siempre válido (si la app se cierra a la mitad, el archivo se puede leer).
//! La parte de arriba es lógica pura (con pruebas); la captura con `cpal` va más abajo.

/// Tasa del WAV que entiende whisper.cpp.
pub const TASA_WAV: u32 = 16_000;
/// Tope de una grabación (igual que `MAX_DURACION_SEG` del motor).
pub const MAX_SEGUNDOS: u64 = 3 * 60 * 60;

/// ¿Es un id de grabación `AAAA-MM-DD-HHMMSS` (igual que `idDeGrabacion` del motor)? Rust no inventa
/// ids: los pone la ventana y aquí solo se acepta la forma exacta, para que nunca sirva de ruta.
pub fn id_valido(id: &str) -> bool {
    let b = id.as_bytes();
    if b.len() != 17 || b[4] != b'-' || b[7] != b'-' || b[10] != b'-' {
        return false;
    }
    let digitos = |desde: usize, hasta: usize| b[desde..hasta].iter().all(u8::is_ascii_digit);
    if !(digitos(0, 4) && digitos(5, 7) && digitos(8, 10) && digitos(11, 17)) {
        return false;
    }
    let n = |desde: usize, hasta: usize| id[desde..hasta].parse::<u32>().unwrap_or(99);
    (1..=12).contains(&n(5, 7)) && (1..=31).contains(&n(8, 10)) && n(11, 13) < 24 && n(13, 15) < 60 && n(15, 17) < 60
}

/// Encabezado WAV (PCM, mono, 16 bits, 16 kHz) para `bytes_datos` bytes de muestras.
pub fn encabezado_wav(bytes_datos: u32) -> [u8; 44] {
    let mut h = [0u8; 44];
    h[0..4].copy_from_slice(b"RIFF");
    h[4..8].copy_from_slice(&bytes_datos.saturating_add(36).to_le_bytes());
    h[8..16].copy_from_slice(b"WAVEfmt ");
    h[16..20].copy_from_slice(&16u32.to_le_bytes());
    h[20..22].copy_from_slice(&1u16.to_le_bytes()); // PCM
    h[22..24].copy_from_slice(&1u16.to_le_bytes()); // mono
    h[24..28].copy_from_slice(&TASA_WAV.to_le_bytes());
    h[28..32].copy_from_slice(&(TASA_WAV * 2).to_le_bytes()); // bytes por segundo
    h[32..34].copy_from_slice(&2u16.to_le_bytes()); // bytes por muestra
    h[34..36].copy_from_slice(&16u16.to_le_bytes());
    h[36..40].copy_from_slice(b"data");
    h[40..44].copy_from_slice(&bytes_datos.to_le_bytes());
    h
}

/// Una muestra de -1,0..1,0 a entero de 16 bits (recorta lo que se pasa).
pub fn a_i16(muestra: f32) -> i16 {
    (muestra.clamp(-1.0, 1.0) * 32767.0).round() as i16
}

/// Junta los canales de un bloque intercalado en uno solo (promedio). `canales` 0 se trata como 1.
pub fn a_mono(intercalado: &[f32], canales: usize) -> Vec<f32> {
    let canales = canales.max(1);
    intercalado.chunks_exact(canales).map(|trama| trama.iter().sum::<f32>() / canales as f32).collect()
}

/// Pasa de la tasa del micrófono a 16 kHz promediando cada ventana (así no se cuelan agudos falsos al
/// bajar la tasa). Guarda lo que le sobra entre bloque y bloque.
pub struct Remuestreador {
    paso: f64,
    fase: f64,
    suma: f64,
}

impl Remuestreador {
    pub fn nuevo(tasa_entrada: u32) -> Self {
        Remuestreador { paso: f64::from(tasa_entrada.max(1)) / f64::from(TASA_WAV), fase: 0.0, suma: 0.0 }
    }

    pub fn procesar(&mut self, mono: &[f32], salida: &mut Vec<f32>) {
        for &muestra in mono {
            let mut resto = 1.0;
            while resto > 1e-12 {
                let falta = self.paso - self.fase;
                if resto >= falta - 1e-12 {
                    self.suma += f64::from(muestra) * falta;
                    salida.push((self.suma / self.paso) as f32);
                    self.suma = 0.0;
                    self.fase = 0.0;
                    resto -= falta;
                } else {
                    self.suma += f64::from(muestra) * resto;
                    self.fase += resto;
                    resto = 0.0;
                }
            }
        }
    }
}

/// Escribe el WAV de a poco. El encabezado se reescribe cada pocos segundos (`refrescar`), así que si la
/// app se cierra a la mitad el archivo queda válido hasta la última vez que se refrescó.
pub struct EscritorWav {
    archivo: std::fs::File,
    muestras: u64,
    sin_refrescar: u64,
}

impl EscritorWav {
    /// Crea `<carpeta>/<id>.wav` (600) y falla si ya existe: una grabación nunca pisa a otra.
    pub fn crear(carpeta: &std::path::Path, id: &str) -> Result<Self, String> {
        use std::io::Write;
        if !id_valido(id) {
            return Err("id de grabación no válido".into());
        }
        let mut opciones = std::fs::OpenOptions::new();
        opciones.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opciones.mode(0o600);
        }
        let mut archivo = opciones.open(carpeta.join(format!("{id}.wav"))).map_err(|e| e.to_string())?;
        archivo.write_all(&encabezado_wav(0)).map_err(|e| e.to_string())?;
        Ok(EscritorWav { archivo, muestras: 0, sin_refrescar: 0 })
    }

    /// Agrega muestras (ya a 16 kHz mono). Devuelve `false` cuando se llegó al tope de 3 h: las que sobran
    /// se descartan y quien llama debe detener la captura.
    pub fn agregar(&mut self, muestras: &[f32]) -> Result<bool, String> {
        use std::io::Write;
        let tope = MAX_SEGUNDOS * u64::from(TASA_WAV);
        let caben = (tope - self.muestras).min(muestras.len() as u64) as usize;
        let bytes: Vec<u8> = muestras[..caben].iter().flat_map(|m| a_i16(*m).to_le_bytes()).collect();
        self.archivo.write_all(&bytes).map_err(|e| e.to_string())?;
        self.muestras += caben as u64;
        self.sin_refrescar += caben as u64;
        if self.sin_refrescar >= u64::from(TASA_WAV) * 5 {
            self.refrescar()?;
        }
        Ok(self.muestras < tope)
    }

    /// Reescribe el encabezado con el largo real y vuelve al final del archivo.
    pub fn refrescar(&mut self) -> Result<(), String> {
        use std::io::{Seek, SeekFrom, Write};
        let datos = u32::try_from(self.muestras * 2).map_err(|_| "la grabación es demasiado larga")?;
        self.archivo.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        self.archivo.write_all(&encabezado_wav(datos)).map_err(|e| e.to_string())?;
        self.archivo.seek(SeekFrom::End(0)).map_err(|e| e.to_string())?;
        self.sin_refrescar = 0;
        Ok(())
    }

    /// Cierra el archivo con el encabezado final. Devuelve los segundos grabados.
    pub fn terminar(mut self) -> Result<u64, String> {
        self.refrescar()?;
        self.archivo.sync_all().map_err(|e| e.to_string())?;
        Ok(self.muestras / u64::from(TASA_WAV))
    }

    pub fn segundos(&self) -> u64 {
        self.muestras / u64::from(TASA_WAV)
    }
}

// ---- Captura (cpal) y comandos de Tauri ----

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use tauri::{AppHandle, Emitter, State};

use crate::configuracion::carpeta_datos;

/// Cuánto esperar sin una sola muestra distinta de cero antes de avisar "no llega sonido".
const SEGUNDOS_SIN_SONIDO: u64 = 8;

/// Una grabación en curso: el hilo que captura y cómo pedirle que pare.
struct Activa {
    id: String,
    parar: Sender<()>,
    hilo: std::thread::JoinHandle<Result<Grabado, String>>,
}

/// Lo que quedó grabado: los segundos y, si la captura se cortó sola, por qué (el audio hasta ahí se conserva).
struct Grabado {
    segundos: u64,
    corte: Option<String>,
}

#[derive(Default)]
pub struct Grabadora {
    activa: Mutex<Option<Activa>>,
}

/// La carpeta de audios (700): `ASISTENTE_GRABACIONES` o `~/.asistente-prototipo/grabaciones`.
pub fn carpeta_grabaciones() -> Result<std::path::PathBuf, String> {
    let carpeta = match std::env::var_os("ASISTENTE_GRABACIONES") {
        Some(propia) => std::path::PathBuf::from(propia),
        None => carpeta_datos()?.join("grabaciones"),
    };
    std::fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&carpeta, std::fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    Ok(carpeta)
}

fn emitir(app: &AppHandle, fase: &str, id: &str, segundos: u64, detalle: Option<&str>) {
    let _ = app.emit("grabacion", serde_json::json!({ "fase": fase, "id": id, "segundos": segundos, "detalle": detalle }));
}

/// El punto rojo junto al 🌱 de la barra de menú (en Windows, el texto de ayuda del ícono).
fn marcar_en_barra(app: &AppHandle, grabando: bool) {
    if let Some(icono) = app.tray_by_id("brote") {
        #[cfg(target_os = "macos")]
        let _ = icono.set_title(Some(if grabando { "🌱🔴" } else { "🌱" }));
        let _ = icono.set_tooltip(Some(if grabando { "Brote · grabando" } else { "Brote" }));
    }
}

/// Texto para el usuario según por qué falló abrir el micrófono.
fn explicar(e: &cpal::Error) -> String {
    match e.kind() {
        cpal::ErrorKind::PermissionDenied => {
            if cfg!(target_os = "macos") {
                "macOS no le dio permiso a Brote para usar el micrófono: actívalo en Ajustes del Sistema → Privacidad y seguridad → Micrófono.".into()
            } else {
                "El sistema no le dio permiso a Brote para usar el micrófono: revisa Configuración → Privacidad → Micrófono.".into()
            }
        }
        cpal::ErrorKind::DeviceNotAvailable => "No encuentro un micrófono conectado.".into(),
        cpal::ErrorKind::DeviceBusy => "El micrófono está ocupado por otra aplicación.".into(),
        _ => format!("No pude abrir el micrófono: {e}"),
    }
}

/// El hilo de captura: abre el micrófono por defecto, convierte a mono 16 kHz y escribe el WAV.
/// Avisa por `listo` si pudo empezar (o por qué no) y sigue hasta que le piden parar o llega al tope.
fn capturar(app: AppHandle, id: String, parar: Receiver<()>, listo: Sender<Result<(), String>>) -> Result<Grabado, String> {
    let carpeta = carpeta_grabaciones()?;
    let escritor = Arc::new(Mutex::new(Some(EscritorWav::crear(&carpeta, &id)?)));
    let (tasa, canales) = (Arc::new(Mutex::new(0u32)), Arc::new(Mutex::new(0usize)));
    let hubo_sonido = Arc::new(AtomicBool::new(false));
    let lleno = Arc::new(AtomicBool::new(false));
    let fallo: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

    let abrir = || -> Result<cpal::Stream, String> {
        let dispositivo = cpal::default_host().default_input_device().ok_or("No encuentro un micrófono conectado.")?;
        let config = dispositivo.default_input_config().map_err(|e| explicar(&e))?;
        *tasa.lock().unwrap() = config.sample_rate();
        *canales.lock().unwrap() = usize::from(config.channels());
        let (formato, config) = (config.sample_format(), config.config());
        let mut remuestreo = Remuestreador::nuevo(config.sample_rate);
        let n_canales = usize::from(config.channels);
        let (escritor, hubo_sonido, lleno, fallo_cb) = (escritor.clone(), hubo_sonido.clone(), lleno.clone(), fallo.clone());
        let fallo_err = fallo.clone();
        let mut procesar = move |datos: Vec<f32>| {
            if datos.iter().any(|m| m.abs() > 1e-4) {
                hubo_sonido.store(true, Ordering::Relaxed);
            }
            let mut fuera = Vec::new();
            remuestreo.procesar(&a_mono(&datos, n_canales), &mut fuera);
            if let Some(e) = escritor.lock().unwrap().as_mut() {
                match e.agregar(&fuera) {
                    Ok(true) => {}
                    Ok(false) => lleno.store(true, Ordering::Relaxed),
                    Err(m) => *fallo_cb.lock().unwrap() = Some(m),
                }
            }
        };
        let en_error = move |e: cpal::Error| {
            *fallo_err.lock().unwrap() = Some(explicar(&e));
        };
        macro_rules! entrada {
            ($t:ty) => {
                dispositivo.build_input_stream(config, move |d: &[$t], _| procesar(d.iter().map(|m| f32::from_sample(*m)).collect()), en_error, None)
            };
        }
        use cpal::{Sample, SampleFormat};
        let flujo = match formato {
            SampleFormat::F32 => entrada!(f32),
            SampleFormat::I16 => entrada!(i16),
            SampleFormat::U16 => entrada!(u16),
            SampleFormat::I32 => entrada!(i32),
            SampleFormat::U8 => entrada!(u8),
            SampleFormat::F64 => entrada!(f64),
            otro => return Err(format!("Este micrófono usa un formato de audio que Brote no entiende ({otro:?}).")),
        }
        .map_err(|e| explicar(&e))?;
        flujo.play().map_err(|e| explicar(&e))?;
        Ok(flujo)
    };

    let flujo = match abrir() {
        Ok(f) => f,
        Err(m) => {
            // No quedó nada grabado: se borra el archivo vacío.
            drop(escritor.lock().unwrap().take());
            let _ = std::fs::remove_file(carpeta.join(format!("{id}.wav")));
            let _ = listo.send(Err(m.clone()));
            return Err(m);
        }
    };
    let _ = listo.send(Ok(()));

    let inicio = Instant::now();
    let mut avisado_sin_sonido = false;
    let mut ultimo_segundo = u64::MAX;
    // `corte`: la captura terminó sola (el usuario no pidió parar) y se avisa a la ventana para que la cierre.
    let corte = loop {
        match parar.recv_timeout(Duration::from_millis(250)) {
            Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break None,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        if let Some(m) = fallo.lock().unwrap().take() {
            emitir(&app, "terminada", &id, 0, Some(&m));
            break Some(m);
        }
        if lleno.load(Ordering::Relaxed) {
            let m = "Llegué al tope de 3 horas por grabación.".to_string();
            emitir(&app, "terminada", &id, MAX_SEGUNDOS, Some(&m));
            break Some(m);
        }
        let segundos = escritor.lock().unwrap().as_ref().map_or(0, |e| e.segundos());
        if segundos != ultimo_segundo {
            ultimo_segundo = segundos;
            emitir(&app, "grabando", &id, segundos, None);
        }
        if !avisado_sin_sonido && !hubo_sonido.load(Ordering::Relaxed) && inicio.elapsed() >= Duration::from_secs(SEGUNDOS_SIN_SONIDO) {
            avisado_sin_sonido = true;
            let ayuda = if cfg!(windows) {
                "No me llega sonido del micrófono. Revisa que el micrófono esté conectado y que en Configuración → Privacidad → Micrófono esté permitido para aplicaciones de escritorio."
            } else {
                "No me llega sonido del micrófono. Revisa que esté conectado y que el permiso de Brote esté activo."
            };
            emitir(&app, "sin-sonido", &id, segundos, Some(ayuda));
        }
    };
    drop(flujo);
    let escritor = escritor.lock().unwrap().take();
    let segundos = escritor.map_or(Ok(0), |e| e.terminar())?;
    Ok(Grabado { segundos, corte })
}

/// Empieza a grabar. La ventana pone el `id` (`idDeGrabacion`, hora local). Solo la pide el usuario.
#[tauri::command]
pub async fn grabacion_iniciar(app: AppHandle, estado: State<'_, Grabadora>, id: String) -> Result<(), String> {
    if !id_valido(&id) {
        return Err("id de grabación no válido".into());
    }
    if estado.activa.lock().unwrap().is_some() {
        return Err("ya hay una grabación en curso".into());
    }
    let (parar, recibir_parar) = mpsc::channel();
    let (avisar, saber) = mpsc::channel();
    let (app_hilo, id_hilo) = (app.clone(), id.clone());
    let hilo = std::thread::spawn(move || capturar(app_hilo, id_hilo, recibir_parar, avisar));
    // En macOS, la primera vez, aquí aparece el aviso de permiso: se espera fuera del hilo principal.
    let respuesta = tauri::async_runtime::spawn_blocking(move || saber.recv_timeout(Duration::from_secs(120))).await.map_err(|e| e.to_string())?;
    match respuesta {
        Ok(Ok(())) => {}
        Ok(Err(m)) => {
            let _ = hilo.join();
            emitir(&app, "error", &id, 0, Some(&m));
            return Err(m);
        }
        Err(_) => {
            let _ = parar.send(());
            return Err("el micrófono no respondió".into());
        }
    }
    let mut activa = estado.activa.lock().unwrap();
    if activa.is_some() {
        let _ = parar.send(());
        return Err("ya hay una grabación en curso".into());
    }
    *activa = Some(Activa { id: id.clone(), parar, hilo });
    marcar_en_barra(&app, true);
    emitir(&app, "grabando", &id, 0, None);
    Ok(())
}

/// Detiene la grabación en curso y devuelve `{ id, segundos, corte }` (`corte`: por qué terminó sola, si fue así).
/// También emite `grabacion` con fase `lista`. Vale también tras un evento `terminada`.
#[tauri::command]
pub async fn grabacion_detener(app: AppHandle, estado: State<'_, Grabadora>) -> Result<serde_json::Value, String> {
    let activa = estado.activa.lock().unwrap().take().ok_or("no hay una grabación en curso")?;
    let Activa { id, parar, hilo } = activa;
    let _ = parar.send(());
    let resultado = tauri::async_runtime::spawn_blocking(move || hilo.join().map_err(|_| "la captura se cayó".to_string())?)
        .await
        .map_err(|e| e.to_string())?;
    marcar_en_barra(&app, false);
    match resultado {
        Ok(Grabado { segundos, corte }) => {
            emitir(&app, "lista", &id, segundos, corte.as_deref());
            Ok(serde_json::json!({ "id": id, "segundos": segundos, "corte": corte }))
        }
        Err(m) => {
            emitir(&app, "error", &id, 0, Some(&m));
            Err(m)
        }
    }
}

/// Qué se está grabando ahora (`null` si nada).
#[tauri::command]
pub fn grabacion_estado(estado: State<'_, Grabadora>) -> Option<String> {
    estado.activa.lock().unwrap().as_ref().map(|a| a.id.clone())
}

/// Al cerrar la app: deja el WAV con su encabezado final.
pub fn detener_al_salir(app: &AppHandle) {
    use tauri::Manager;
    if let Some(estado) = app.try_state::<Grabadora>() {
        if let Some(a) = estado.activa.lock().unwrap().take() {
            let _ = a.parar.send(());
            let _ = a.hilo.join();
        }
    }
    marcar_en_barra(app, false);
}

#[cfg(test)]
mod pruebas_puras {
    use super::*;

    #[test]
    fn ids_solo_con_la_forma_exacta() {
        assert!(id_valido("2026-10-05-103000"));
        for malo in ["", "../../x", "2026-10-05-10300", "2026-13-05-103000", "2026-10-05-250000", "2026-10-05-106000", "2026-10-05-1030a0", "2026-10-05-103000.wav"] {
            assert!(!id_valido(malo), "{malo}");
        }
    }

    #[test]
    fn encabezado_wav_valido() {
        let h = encabezado_wav(32_000);
        assert_eq!(&h[0..4], b"RIFF");
        assert_eq!(u32::from_le_bytes(h[4..8].try_into().unwrap()), 32_036);
        assert_eq!(u32::from_le_bytes(h[24..28].try_into().unwrap()), 16_000);
        assert_eq!(u32::from_le_bytes(h[28..32].try_into().unwrap()), 32_000);
        assert_eq!(u32::from_le_bytes(h[40..44].try_into().unwrap()), 32_000);
        assert_eq!(&h[36..40], b"data");
        // El tope de 3 h cabe de sobra: 3 h × 32.000 B/s = 345,6 MB.
        assert!(MAX_SEGUNDOS * u64::from(TASA_WAV) * 2 < u64::from(u32::MAX));
    }

    #[test]
    fn muestras_a_16_bits_con_recorte() {
        assert_eq!(a_i16(0.0), 0);
        assert_eq!(a_i16(1.0), 32767);
        assert_eq!(a_i16(-1.0), -32767);
        assert_eq!(a_i16(3.5), 32767);
        assert_eq!(a_i16(-9.0), -32767);
    }

    #[test]
    fn estereo_a_mono_promedia() {
        assert_eq!(a_mono(&[1.0, 0.0, 0.5, 0.5], 2), vec![0.5, 0.5]);
        assert_eq!(a_mono(&[0.25, 0.75], 1), vec![0.25, 0.75]);
        assert_eq!(a_mono(&[1.0, 1.0, 1.0], 2), vec![1.0]); // lo que sobra no se usa
    }

    #[test]
    fn remuestrear_48k_a_16k_da_un_tercio_y_conserva_el_nivel() {
        let mut r = Remuestreador::nuevo(48_000);
        let mut fuera = Vec::new();
        // En dos bloques de tamaño raro: el resultado no debe depender de cómo llegan.
        r.procesar(&vec![0.5; 1000], &mut fuera);
        r.procesar(&vec![0.5; 4721], &mut fuera);
        assert_eq!(fuera.len(), 5721 / 3);
        assert!(fuera.iter().all(|m| (m - 0.5).abs() < 1e-5));
    }

    #[test]
    fn remuestrear_44k1_cuenta_bien_y_silencio_sigue_siendo_silencio() {
        let mut r = Remuestreador::nuevo(44_100);
        let mut fuera = Vec::new();
        r.procesar(&vec![0.0; 44_100], &mut fuera);
        assert!((fuera.len() as i64 - 16_000).abs() <= 1);
        assert!(fuera.iter().all(|m| *m == 0.0));
    }

    #[test]
    fn remuestrear_a_la_misma_tasa_no_cambia_nada() {
        let mut r = Remuestreador::nuevo(16_000);
        let mut fuera = Vec::new();
        r.procesar(&[0.1, -0.2, 0.3], &mut fuera);
        assert_eq!(fuera.len(), 3);
        assert!((fuera[1] + 0.2).abs() < 1e-6);
    }

    fn temporal(nombre: &str) -> std::path::PathBuf {
        let c = std::env::temp_dir().join(format!("brote-grabacion-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&c);
        std::fs::create_dir_all(&c).unwrap();
        c
    }

    #[test]
    fn el_wav_queda_valido_aunque_no_se_cierre() {
        let c = temporal("abierto");
        let mut e = EscritorWav::crear(&c, "2026-10-05-103000").unwrap();
        // 6 s: pasa los 5 s y se refresca solo, sin llamar a `terminar` (como si la app se cerrara).
        e.agregar(&vec![0.25; 16_000 * 6]).unwrap();
        let bytes = std::fs::read(c.join("2026-10-05-103000.wav")).unwrap();
        assert_eq!(u32::from_le_bytes(bytes[40..44].try_into().unwrap()), 16_000 * 6 * 2);
        assert_eq!(bytes.len(), 44 + 16_000 * 6 * 2);
        assert_eq!(i16::from_le_bytes(bytes[44..46].try_into().unwrap()), 8192);
        let _ = std::fs::remove_dir_all(c);
    }

    #[test]
    fn terminar_deja_el_largo_exacto_y_permisos_600() {
        let c = temporal("cerrado");
        let mut e = EscritorWav::crear(&c, "2026-10-05-103000").unwrap();
        e.agregar(&[0.0; 100]).unwrap();
        e.agregar(&[0.0; 50]).unwrap();
        assert_eq!(e.terminar().unwrap(), 0);
        let ruta = c.join("2026-10-05-103000.wav");
        let bytes = std::fs::read(&ruta).unwrap();
        assert_eq!(u32::from_le_bytes(bytes[40..44].try_into().unwrap()), 300);
        assert_eq!(u32::from_le_bytes(bytes[4..8].try_into().unwrap()), 336);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(&ruta).unwrap().permissions().mode() & 0o777, 0o600);
        }
        let _ = std::fs::remove_dir_all(c);
    }

    #[test]
    fn no_pisa_otra_grabacion_ni_acepta_ids_raros() {
        let c = temporal("pisar");
        EscritorWav::crear(&c, "2026-10-05-103000").unwrap();
        assert!(EscritorWav::crear(&c, "2026-10-05-103000").is_err());
        assert!(EscritorWav::crear(&c, "../2026-10-05-103000").is_err());
        let _ = std::fs::remove_dir_all(c);
    }

    #[test]
    fn corta_en_el_tope_de_3_horas() {
        let c = temporal("tope");
        let mut e = EscritorWav::crear(&c, "2026-10-05-103000").unwrap();
        let tope = (MAX_SEGUNDOS * u64::from(TASA_WAV)) as usize;
        e.muestras = (tope - 10) as u64; // sin escribir 3 h de verdad
        assert!(!e.agregar(&[0.1; 50]).unwrap());
        assert_eq!(e.muestras as usize, tope);
        let _ = std::fs::remove_dir_all(c);
    }
}
