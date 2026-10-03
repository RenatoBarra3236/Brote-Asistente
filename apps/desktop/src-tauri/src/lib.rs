#[cfg(target_os = "macos")]
mod notch;
mod configuracion;
mod descargas;
mod entorno;
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

/// Abre (o trae al frente) una ventana normal de la app. Como la app es de tipo accesorio, en
/// macOS hay que activarla para que la ventana quede al frente.
async fn abrir_ventana(app: &AppHandle, etiqueta: &str, pagina: &str, titulo: &str, tamano: (f64, f64)) -> Result<(), String> {
    let ventana = match app.get_webview_window(etiqueta) {
        Some(ventana) => ventana,
        None => tauri::WebviewWindowBuilder::new(app, etiqueta, tauri::WebviewUrl::App(pagina.into()))
            .title(titulo)
            .inner_size(tamano.0, tamano.1)
            .min_inner_size(380.0, 420.0)
            // Sin Dock, una ventana minimizada no tendría desde dónde volver: se cierra y se
            // reabre desde 🌱 en la barra de menú (o con 🧠 en la isla).
            .minimizable(false)
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

/// La ventana "Lo que sé de ti". Asíncrono: crear ventanas desde un comando síncrono puede
/// bloquear el hilo principal.
#[tauri::command]
async fn abrir_memoria(app: AppHandle) -> Result<(), String> {
    abrir_ventana(&app, "memoria", "memoria.html", "Lo que sé de ti", (480.0, 660.0)).await
}

/// La ventana "Configurar Brote".
#[tauri::command]
async fn abrir_configuracion(app: AppHandle) -> Result<(), String> {
    abrir_ventana(&app, "configuracion", "configuracion.html", "Configurar Brote", (520.0, 720.0)).await
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

/// Tamaño de la ventana flotante (Windows y, para probar, macOS con `ASISTENTE_MODO=flotante`).
const ANCHO_FLOTANTE: f64 = 400.0;
const ALTO_FLOTANTE: f64 = 280.0;

/// Ventana flotante en la esquina inferior derecha de la pantalla principal.
fn ubicar_en_esquina(ventana: &WebviewWindow) -> tauri::Result<()> {
    // Lugar para Brote (a la derecha) y para el panel de conversación (a su izquierda).
    ventana.set_size(tauri::LogicalSize::new(ANCHO_FLOTANTE, ALTO_FLOTANTE))?;
    let Some(monitor) = ventana.primary_monitor()? else {
        return Ok(());
    };
    let escala = monitor.scale_factor();
    let area = monitor.work_area();
    let origen = area.position.to_logical::<f64>(escala);
    let tamano_area = area.size.to_logical::<f64>(escala);
    // El tamaño fijo, no `outer_size()`: justo después de `set_size` todavía puede dar el anterior.
    ventana.set_position(LogicalPosition::new(
        origen.x + tamano_area.width - ANCHO_FLOTANTE - 24.0,
        origen.y + tamano_area.height - ALTO_FLOTANTE - 24.0,
    ))
}

/// macOS: ventana arriba al centro, pegada al notch y sobre la barra de menú.
/// Sin notch (por ejemplo, un monitor externo) se simula la isla con el alto de la barra.
#[cfg(target_os = "macos")]
fn preparar_ventana(ventana: &WebviewWindow) -> tauri::Result<Diseno> {
    use objc2_foundation::{NSPoint, NSRect, NSSize};
    const ANCHO: f64 = 440.0;
    const ALTO: f64 = 220.0;

    // Para probar en un Mac la experiencia de Windows (ventana flotante en vez de notch).
    if std::env::var("ASISTENTE_MODO").is_ok_and(|modo| modo == "flotante") {
        ubicar_en_esquina(ventana)?;
        return Ok(Diseno::flotante());
    }

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

/// El ícono 🌱 en la barra de menú (o la bandeja en Windows). La app no tiene Dock ni menú propio,
/// así que desde aquí se abre lo demás y, sobre todo, se puede salir.
fn crear_icono_de_barra(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::TrayIconBuilder;

    let memoria = MenuItem::with_id(app, "memoria", "Lo que sé de ti", true, None::<&str>)?;
    let configurar = MenuItem::with_id(app, "configurar", "Configurar Brote…", true, None::<&str>)?;
    let salir = MenuItem::with_id(app, "salir", "Salir de Brote", true, None::<&str>)?;
    let separador = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&memoria, &configurar, &separador, &salir])?;

    let mut icono = TrayIconBuilder::with_id("brote")
        .tooltip("Brote")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, evento| {
            let app = app.clone();
            match evento.id.as_ref() {
                "memoria" => {
                    tauri::async_runtime::spawn(async move {
                        let _ = abrir_memoria(app).await;
                    });
                }
                "configurar" => {
                    tauri::async_runtime::spawn(async move {
                        let _ = abrir_configuracion(app).await;
                    });
                }
                "salir" => app.exit(0),
                _ => {}
            }
        });
    // En macOS la barra de menú muestra el brote como texto; en Windows hace falta un ícono.
    if cfg!(target_os = "macos") {
        icono = icono.title("🌱");
    } else if let Some(imagen) = app.default_window_icon() {
        icono = icono.icon(imagen.clone());
    }
    icono.build(app)?;
    Ok(())
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
            crear_icono_de_barra(app)?;

            // Si falta configurar algo (por ejemplo, en un computador nuevo), se abre el asistente.
            let manija = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let listo = configuracion::configuracion(manija.clone(), "rapido".into(), None)
                    .await
                    .is_ok_and(|salida| salida.contains("\"listo\":true"));
                if !listo {
                    let _ = abrir_configuracion(manija).await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            diseno,
            cursor_relativo,
            salir,
            agente_modo,
            agente_conexion,
            agente_escribir,
            abrir_memoria,
            abrir_configuracion,
            configuracion::configuracion,
            configuracion::abrir_terminal,
            configuracion::abrir_enlace,
            configuracion::reiniciar,
            descargas::mostrar_descarga
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
