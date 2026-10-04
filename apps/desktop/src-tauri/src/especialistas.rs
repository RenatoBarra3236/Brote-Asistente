//! El equipo de Brote desde "Configurar Brote" (Cuentas de IA y Equipo). La lógica está en
//! `packages/adapter/src/configurar.ts` (órdenes `equipo`, `especialista`, `especialista-quitar` y
//! `cuenta-clave`); aquí solo se valida contra listas cerradas y se lanza el script. Las instrucciones
//! y la clave van por la entrada estándar: nunca como argumento, nunca en un registro.

use std::io::Write;
use std::process::{Command, Stdio};

use tauri::AppHandle;

use crate::entorno;

/// Los especialistas del catálogo: deben coincidir con `IDS_ESPECIALISTAS` de
/// packages/motor/src/especialistas.ts (lo revisa una prueba del motor).
const ESPECIALISTAS: &[&str] = &["tutor", "investigador", "redactor", "revisor", "planificador"];

/// Los modelos que se pueden elegir: solo los del catálogo de OpenClaw 2026.9.7 que validan. Deben
/// coincidir con `MODELOS_PERMITIDOS` de especialistas.ts.
const MODELOS: &[&str] = &[
    "anthropic/claude-sonnet-5-5", "anthropic/claude-haiku-4-5", "google/gemini-3.5-flash-lite", "google/gemini-3.5-flash", "google/gemini-3-flash-preview",
    "openai/gpt-6-astra", "openai/gpt-5.4-mini", "xai/grok-4.7",
];

/// Las cuentas de IA que se conectan pegando una clave en la ventana.
const CUENTAS_CON_CLAVE: &[&str] = &["gemini"];

const MAX_INSTRUCCIONES: usize = 2000;
/// La personalidad (SOUL.md) del especialista: debe coincidir con `MAX_PERSONALIDAD` de especialistas.ts.
const MAX_PERSONALIDAD: usize = 3000;

fn especialista_valido(id: &str) -> bool {
    ESPECIALISTAS.contains(&id)
}

fn modelo_valido(modelo: &str) -> bool {
    MODELOS.contains(&modelo)
}

/// Texto simple: sin caracteres de control (salvo saltos de línea y tabulaciones) y de largo razonable.
fn instrucciones_validas(texto: &str) -> bool {
    texto.chars().count() <= MAX_INSTRUCCIONES && !texto.chars().any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t')
}

/// La personalidad: texto simple, no vacío y de largo razonable.
fn personalidad_valida(texto: &str) -> bool {
    !texto.trim().is_empty()
        && texto.chars().count() <= MAX_PERSONALIDAD
        && !texto.chars().any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t')
}

/// Lo que va por la entrada del script: las instrucciones y, si se editó, la personalidad (JSON).
fn entrada_especialista(instrucciones: &str, personalidad: Option<&str>) -> String {
    serde_json::json!({ "instrucciones": instrucciones, "personalidad": personalidad }).to_string()
}

/// Una clave de Google AI Studio: letras, números, "_" y "-".
fn clave_valida(clave: &str) -> bool {
    (20..=200).contains(&clave.len()) && clave.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Corre el script con una orden de la lista y, si hay, el texto por la entrada. Devuelve su salida (JSON).
async fn correr(app: AppHandle, argumentos: Vec<String>, entrada: Option<String>) -> Result<String, String> {
    let (node, _) = entorno::buscar_node().ok_or("no encontré Node")?;
    let script = crate::configuracion::script(&app);
    tauri::async_runtime::spawn_blocking(move || {
        let mut hijo = entorno::sin_consola(entorno::sin_clave_api(&mut Command::new(node)))
            .arg(script)
            .args(argumentos)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(mut stdin) = hijo.stdin.take() {
            // Al soltar `stdin` se cierra la entrada y el script sabe que terminó el texto.
            stdin.write_all(entrada.unwrap_or_default().as_bytes()).map_err(|e| e.to_string())?;
        }
        let salida = hijo.wait_with_output().map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&salida.stdout).trim().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// El estado del equipo y de las cuentas de IA.
#[tauri::command]
pub async fn equipo_estado(app: AppHandle) -> Result<String, String> {
    correr(app, vec!["equipo".into()], None).await
}

/// Prende o actualiza un especialista con un modelo de la lista, sus instrucciones y, si se editó, su
/// personalidad (su SOUL.md).
#[tauri::command]
pub async fn especialista_guardar(
    app: AppHandle,
    id: String,
    modelo: String,
    instrucciones: String,
    personalidad: Option<String>,
) -> Result<String, String> {
    if !especialista_valido(&id) {
        return Err("especialista desconocido".into());
    }
    if !modelo_valido(&modelo) {
        return Err("ese modelo no está en la lista".into());
    }
    if !instrucciones_validas(&instrucciones) {
        return Err("las instrucciones deben ser texto simple, de hasta 2000 caracteres".into());
    }
    if personalidad.as_deref().is_some_and(|p| !personalidad_valida(p)) {
        return Err("la personalidad debe ser texto simple, de hasta 3000 caracteres".into());
    }
    let entrada = entrada_especialista(&instrucciones, personalidad.as_deref());
    correr(app, vec!["especialista".into(), id, modelo], Some(entrada)).await
}

/// Apaga un especialista (lo borra de OpenClaw; su carpeta va a la Papelera).
#[tauri::command]
pub async fn especialista_quitar(app: AppHandle, id: String) -> Result<String, String> {
    if !especialista_valido(&id) {
        return Err("especialista desconocido".into());
    }
    correr(app, vec!["especialista-quitar".into(), id], None).await
}

/// Guarda la clave de una cuenta de IA (Gemini). La clave va por la entrada del script.
#[tauri::command]
pub async fn cuenta_clave(app: AppHandle, cuenta: String, clave: String) -> Result<String, String> {
    if !CUENTAS_CON_CLAVE.contains(&cuenta.as_str()) {
        return Err("esa cuenta no se conecta con una clave".into());
    }
    let clave = clave.trim().to_string();
    if !clave_valida(&clave) {
        return Err("esa clave no parece válida".into());
    }
    correr(app, vec!["cuenta-clave".into(), cuenta], Some(clave)).await
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn solo_especialistas_y_modelos_de_la_lista() {
        assert!(especialista_valido("tutor") && especialista_valido("planificador"));
        for malo in ["", "jefe", "asistente-multiplataforma", "../tutor", "tutor --force"] {
            assert!(!especialista_valido(malo), "{malo}");
        }
        assert!(modelo_valido("google/gemini-3.5-flash"));
        // Aparecen al consultar con la clave, pero la validación de OpenClaw los rechaza.
        for malo in ["google/gemini-flash-latest", "google/gemini-3.8-flash", "anthropic/claude-sonnet-5-5 --x", ""] {
            assert!(!modelo_valido(malo), "{malo}");
        }
    }

    #[test]
    fn personalidad_y_entrada() {
        assert!(personalidad_valida("Paciente.\nSocrático."));
        for mala in ["", "   ", "con \u{7} campana"] {
            assert!(!personalidad_valida(mala), "{mala:?}");
        }
        assert!(!personalidad_valida(&"x".repeat(3001)));
        let entrada: serde_json::Value = serde_json::from_str(&entrada_especialista("Cita.", Some("Curioso"))).unwrap();
        assert_eq!(entrada["instrucciones"], "Cita.");
        assert_eq!(entrada["personalidad"], "Curioso");
        let sin: serde_json::Value = serde_json::from_str(&entrada_especialista("{raro", None)).unwrap();
        assert!(sin["personalidad"].is_null());
        assert_eq!(sin["instrucciones"], "{raro");
    }

    #[test]
    fn instrucciones_y_claves() {
        assert!(instrucciones_validas("Cita siempre.\nEn español."));
        assert!(!instrucciones_validas("con \u{7} campana"));
        assert!(!instrucciones_validas(&"x".repeat(2001)));
        assert!(clave_valida(&format!("AIza{}", "B".repeat(35))));
        for mala in ["corta", "con espacio aaaaaaaaaaaaaaaaaaaaaa", "AIza$$$$$$$$$$$$$$$$$$$$$$$$"] {
            assert!(!clave_valida(mala), "{mala}");
        }
        assert!(CUENTAS_CON_CLAVE.contains(&"gemini") && !CUENTAS_CON_CLAVE.contains(&"chatgpt"));
    }
}
