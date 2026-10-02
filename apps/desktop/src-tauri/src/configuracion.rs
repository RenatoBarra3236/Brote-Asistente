//! El asistente "Configurar Brote" (paso 10). La revisión y los arreglos los hace un script de
//! Node (`packages/adapter/src/configurar.ts`); aquí solo se lanza y se abren terminales o páginas
//! de una lista cerrada: la ventana nunca puede pedir un comando o una dirección cualquiera.

use std::process::{Command, Stdio};

use tauri::AppHandle;

use crate::entorno;

/// Pasos que el script sabe aplicar (ver `aplicar` en configurar.ts).
const PASOS: &[&str] = &["openclaw", "agente", "modelo", "gateway", "identidad", "permisos", "skill", "mcp", "memoria"];

fn script(app: &AppHandle) -> std::path::PathBuf {
    match entorno::recursos(app) {
        Some(carpeta) => carpeta.join("configurar.mjs"),
        None => std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../packages/adapter/src/configurar.ts"),
    }
}

/// Lo que devuelve la revisión cuando ni siquiera hay Node para correr el script.
fn sin_node() -> String {
    serde_json::json!([{
        "id": "node",
        "titulo": "Node",
        "estado": "falta",
        "detalle": format!("No encontré Node {} o superior. Instálalo y vuelve a revisar.", entorno::NODE_MINIMO),
        "accion": { "tipo": "enlace", "etiqueta": "Descargar Node", "enlace": "node" }
    }])
    .to_string()
}

/// Corre el script: `revisar`, `rapido` o `aplicar <paso>`. Devuelve su salida (JSON).
#[tauri::command]
pub async fn configuracion(app: AppHandle, orden: String, paso: Option<String>) -> Result<String, String> {
    let mut argumentos = vec![orden.clone()];
    match (orden.as_str(), paso) {
        ("revisar" | "rapido", None) => {}
        ("aplicar", Some(paso)) if PASOS.contains(&paso.as_str()) => argumentos.push(paso),
        _ => return Err("pedido no válido".into()),
    }
    let Some((node, _)) = entorno::buscar_node() else {
        return Ok(if orden == "rapido" { r#"{"listo":false}"#.into() } else { sin_node() });
    };
    let script = script(&app);
    // El script puede tardar (instalar OpenClaw, configurarlo): se corre fuera del hilo principal.
    tauri::async_runtime::spawn_blocking(move || {
        let salida = entorno::sin_consola(&mut Command::new(node))
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

/// Abre una terminal con uno de los comandos que necesitan interacción del usuario.
#[tauri::command]
pub fn abrir_terminal(cual: String) -> Result<(), String> {
    let comando = match cual.as_str() {
        "login-claude" => "claude",
        "memoria-local" => "openclaw configure --section model",
        _ => return Err("terminal no válida".into()),
    };
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
