#[cfg(target_os = "macos")]
mod notch;
mod puente;

use puente::Puente;
use tauri::{AppHandle, LogicalPosition, Manager, RunEvent, State, WebviewWindow};

/// Cómo vive el personaje: en el notch (macOS) o en una ventana flotante (el resto).
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Diseno {
    modo: &'static str,
    notch_ancho: f64,
    notch_alto: f64,
}

impl Diseno {
    fn flotante() -> Self {
        Diseno { modo: "flotante", notch_ancho: 0.0, notch_alto: 0.0 }
    }
}

#[derive(serde::Serialize)]
struct Desplazamiento {
    x: f64,
    y: f64,
}

#[tauri::command]
fn diseno(diseno: State<Diseno>) -> Diseno {
    diseno.inner().clone()
}

/// Con quién habla el personaje: con OpenClaw a través del puente, o con el simulador
/// si la app se abrió con `ASISTENTE_SIMULADO=1`.
struct Agente {
    puente: Option<Puente>,
}

#[tauri::command]
fn agente_modo(agente: State<Agente>) -> &'static str {
    if agente.puente.is_some() { "real" } else { "simulado" }
}

/// El último aviso de conexión del puente (una línea JSON).
#[tauri::command]
fn agente_conexion(agente: State<Agente>) -> Result<String, String> {
    agente.puente.as_ref().map(Puente::conexion).ok_or_else(|| "sin puente".into())
}

/// Envía un pedido al puente (una línea JSON armada por la ventana).
#[tauri::command]
fn agente_escribir(agente: State<Agente>, linea: String) -> Result<(), String> {
    agente.puente.as_ref().ok_or("sin puente")?.escribir(&linea)
}

/// Abre (o trae al frente) la ventana "Lo que sé de ti". Es asíncrono porque crear ventanas
/// desde un comando síncrono puede bloquear el hilo principal.
#[tauri::command]
async fn abrir_memoria(app: AppHandle) -> Result<(), String> {
    let ventana = match app.get_webview_window("memoria") {
        Some(ventana) => ventana,
        None => tauri::WebviewWindowBuilder::new(&app, "memoria", tauri::WebviewUrl::App("memoria.html".into()))
            .title("Lo que sé de ti")
            .inner_size(480.0, 660.0)
            .min_inner_size(380.0, 420.0)
            .center()
            .build()
            .map_err(|e| e.to_string())?,
    };
    #[cfg(target_os = "macos")]
    app.run_on_main_thread(|| unsafe { notch::activar_app() })
        .map_err(|e| e.to_string())?;
    ventana.show().map_err(|e| e.to_string())?;
    ventana.unminimize().map_err(|e| e.to_string())?;
    ventana.set_focus().map_err(|e| e.to_string())
}

/// En macOS la app no tiene Dock ni menú, así que Cmd + Q lo maneja el propio personaje.
#[tauri::command]
fn salir(app: AppHandle) {
    app.exit(0);
}

/// Distancia del cursor al centro de la ventana, en píxeles lógicos.
/// Sirve para que los ojos sigan al cursor aunque no esté sobre la ventana.
#[tauri::command]
fn cursor_relativo(window: WebviewWindow) -> Result<Desplazamiento, String> {
    let cursor = window.cursor_position().map_err(|e| e.to_string())?;
    let posicion = window.outer_position().map_err(|e| e.to_string())?;
    let tamano = window.outer_size().map_err(|e| e.to_string())?;
    let escala = window.scale_factor().map_err(|e| e.to_string())?;
    let centro_x = posicion.x as f64 + tamano.width as f64 / 2.0;
    let centro_y = posicion.y as f64 + tamano.height as f64 / 2.0;
    Ok(Desplazamiento {
        x: (cursor.x - centro_x) / escala,
        y: (cursor.y - centro_y) / escala,
    })
}

/// Ventana flotante en la esquina inferior derecha de la pantalla principal.
fn ubicar_en_esquina(ventana: &WebviewWindow) -> tauri::Result<()> {
    let Some(monitor) = ventana.primary_monitor()? else {
        return Ok(());
    };
    let escala = monitor.scale_factor();
    let area = monitor.work_area();
    let origen = area.position.to_logical::<f64>(escala);
    let tamano_area = area.size.to_logical::<f64>(escala);
    let tamano_ventana = ventana.outer_size()?.to_logical::<f64>(escala);
    ventana.set_position(LogicalPosition::new(
        origen.x + tamano_area.width - tamano_ventana.width - 24.0,
        origen.y + tamano_area.height - tamano_ventana.height - 24.0,
    ))
}

/// macOS: ventana arriba al centro, pegada al notch y sobre la barra de menú.
/// Sin notch (por ejemplo, un monitor externo) se simula la isla con el alto de la barra.
#[cfg(target_os = "macos")]
fn preparar_ventana(ventana: &WebviewWindow) -> tauri::Result<Diseno> {
    use objc2_foundation::{NSPoint, NSRect, NSSize};
    const ANCHO: f64 = 440.0;
    const ALTO: f64 = 220.0;

    let Some(pantalla) = (unsafe { notch::pantalla_principal() }) else {
        ubicar_en_esquina(ventana)?;
        return Ok(Diseno::flotante());
    };
    let centro_pantalla = pantalla.marco.origin.x + pantalla.marco.size.width / 2.0;
    let (notch_ancho, notch_alto, centro) = pantalla
        .notch
        .unwrap_or((180.0, pantalla.alto_barra.max(24.0), centro_pantalla));

    let arriba = pantalla.marco.origin.y + pantalla.marco.size.height;
    let marco = NSRect::new(NSPoint::new(centro - ANCHO / 2.0, arriba - ALTO), NSSize::new(ANCHO, ALTO));
    unsafe { notch::subir_sobre_la_barra(ventana.ns_window()?, marco) };
    Ok(Diseno { modo: "notch", notch_ancho, notch_alto })
}

#[cfg(not(target_os = "macos"))]
fn preparar_ventana(ventana: &WebviewWindow) -> tauri::Result<Diseno> {
    ubicar_en_esquina(ventana)?;
    Ok(Diseno::flotante())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // App de accesorio (sin ícono en el Dock): es lo que permite a la ventana aparecer
            // también sobre apps en pantalla completa, como las demás apps de notch.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let ventana = app
                .get_webview_window("personaje")
                .expect("falta la ventana del personaje en tauri.conf.json");
            let diseno = preparar_ventana(&ventana)?;
            app.manage(diseno);

            let simulado = std::env::var("ASISTENTE_SIMULADO").is_ok_and(|v| v == "1");
            let puente = (!simulado).then(|| Puente::iniciar(app.handle()));
            app.manage(Agente { puente });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            diseno,
            cursor_relativo,
            salir,
            agente_modo,
            agente_conexion,
            agente_escribir,
            abrir_memoria
        ])
        .build(tauri::generate_context!())
        .expect("error al iniciar la app del personaje")
        .run(|app, evento| {
            // Al cerrar la app, el puente se desconecta del Gateway antes de terminar.
            if let RunEvent::Exit = evento {
                if let Some(puente) = app.try_state::<Agente>().as_ref().and_then(|a| a.puente.as_ref()) {
                    puente.detener();
                }
            }
        });
}
