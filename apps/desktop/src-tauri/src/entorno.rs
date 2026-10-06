//! Dónde están Node y el puente. Una app abierta desde el Finder (o el menú Inicio) no hereda el
//! PATH de la terminal, y con nvm o similares Node no está en las rutas de siempre: hay que buscarlo.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use tauri::{AppHandle, Manager};

/// En Windows, que un proceso hijo (Node) no abra una ventana de consola. En el resto, nada.
pub fn sin_consola(comando: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        comando.creation_flags(CREATE_NO_WINDOW);
    }
    comando
}

/// Brote usa el plan de Claude Code, no la clave de API (que es solo para programar y vive en `~/.zshrc`):
/// si la app se abre desde una terminal que la tiene, los procesos de Node no deben heredarla.
pub fn sin_clave_api(comando: &mut Command) -> &mut Command {
    comando.env_remove("ANTHROPIC_API_KEY")
}

/// La versión mínima de Node: la que pide OpenClaw y la que usa el puente (`node:sqlite`).
pub const NODE_MINIMO: u32 = 24;

fn home() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}

/// La versión principal de un ejecutable de Node ("v24.21.0" → 24), si responde.
pub fn version_de(node: &Path) -> Option<u32> {
    let salida = sin_consola(Command::new(node).arg("--version")).stdin(Stdio::null()).output().ok()?;
    let texto = String::from_utf8_lossy(&salida.stdout);
    texto.trim().trim_start_matches('v').split('.').next()?.parse().ok()
}

/// Las instalaciones de nvm, de la versión más nueva a la más antigua.
fn nodes_de_nvm(home: &Path) -> Vec<PathBuf> {
    let carpeta = home.join(".nvm/versions/node");
    let Ok(entradas) = std::fs::read_dir(&carpeta) else { return vec![] };
    let mut versiones: Vec<(Vec<u32>, PathBuf)> = entradas
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let nombre = e.file_name().to_string_lossy().trim_start_matches('v').to_string();
            let numeros: Vec<u32> = nombre.split('.').filter_map(|n| n.parse().ok()).collect();
            (!numeros.is_empty()).then(|| (numeros, e.path().join("bin/node")))
        })
        .collect();
    versiones.sort_by(|a, b| b.0.cmp(&a.0));
    versiones.into_iter().map(|(_, ruta)| ruta).collect()
}

/// Los lugares donde suele estar Node, en orden de preferencia.
fn candidatos() -> Vec<PathBuf> {
    let mut lista = vec![];
    if let Ok(propio) = std::env::var("ASISTENTE_NODE") {
        lista.push(PathBuf::from(propio));
    }
    let nombre = if cfg!(windows) { "node.exe" } else { "node" };
    if let Some(path) = std::env::var_os("PATH") {
        lista.extend(std::env::split_paths(&path).map(|carpeta| carpeta.join(nombre)));
    }
    if let Some(home) = home() {
        if cfg!(windows) {
            if let Some(datos) = std::env::var_os("APPDATA") {
                lista.push(PathBuf::from(datos).join("nvm").join("nodejs").join(nombre));
            }
            lista.push(home.join(".volta").join("bin").join(nombre));
        } else {
            lista.extend(nodes_de_nvm(&home));
            lista.push(home.join(".volta/bin/node"));
            lista.push(home.join(".local/share/fnm/aliases/default/bin/node"));
            lista.push(home.join(".asdf/shims/node"));
        }
    }
    if cfg!(windows) {
        lista.push(PathBuf::from(r"C:\Program Files\nodejs\node.exe"));
    } else {
        lista.push(PathBuf::from("/opt/homebrew/bin/node"));
        lista.push(PathBuf::from("/usr/local/bin/node"));
        lista.push(PathBuf::from("/usr/bin/node"));
    }
    lista
}

/// El primer Node instalado que cumpla la versión mínima, con su versión.
pub fn buscar_node() -> Option<(PathBuf, u32)> {
    candidatos()
        .into_iter()
        .filter(|ruta| ruta.is_file())
        .find_map(|ruta| version_de(&ruta).filter(|v| *v >= NODE_MINIMO).map(|v| (ruta, v)))
}

/// El Node que viaja dentro de la app (`recursos/node/node[.exe]`, lo deja `empaquetar-node`). Solo existe
/// en la app empaquetada: en desarrollo se usa el Node del sistema.
pub fn node_embebido(app: &AppHandle) -> Option<PathBuf> {
    let nombre = if cfg!(windows) { "node.exe" } else { "node" };
    let ruta = recursos(app)?.join("node").join(nombre);
    ruta.is_file().then_some(ruta)
}

/// El Node que usan el puente y el asistente: el del sistema si hay uno de la versión mínima y, si no, el de
/// la app (así Brote funciona sin instalar nada; la IA, que usa OpenClaw, sigue pidiendo el del sistema).
/// El tercer valor dice si es el de la app. `ASISTENTE_SOLO_NODE_EMBEBIDO=1` ignora el del sistema (solo
/// para probar ese camino).
pub fn node_para_brote(app: &AppHandle) -> Option<(PathBuf, u32, bool)> {
    let sistema = if std::env::var_os("ASISTENTE_SOLO_NODE_EMBEBIDO").is_some() { None } else { buscar_node() };
    let embebido = node_embebido(app).and_then(|ruta| version_de(&ruta).filter(|v| *v >= NODE_MINIMO).map(|v| (ruta, v)));
    elegir_node(sistema, embebido)
}

/// El del sistema gana; el de la app es el respaldo.
fn elegir_node(sistema: Option<(PathBuf, u32)>, embebido: Option<(PathBuf, u32)>) -> Option<(PathBuf, u32, bool)> {
    match (sistema, embebido) {
        (Some((ruta, version)), _) => Some((ruta, version, false)),
        (None, Some((ruta, version))) => Some((ruta, version, true)),
        (None, None) => None,
    }
}

/// Avisa al script (configurar, puente) que corre con el Node de la app y no con el del sistema: así
/// «Node» en la revisión significa «el que necesita la IA».
pub fn marcar_embebido(comando: &mut Command, embebido: bool) -> &mut Command {
    if embebido {
        comando.env("ASISTENTE_NODE_EMBEBIDO", "1");
    }
    comando
}

/// Dónde están los archivos que la app lleva adentro (el puente, el servidor MCP y la skill).
/// En desarrollo se usa el código del repo directamente, sin empaquetar.
pub fn recursos(app: &AppHandle) -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        return None;
    }
    app.path().resource_dir().ok().map(|carpeta| carpeta.join("recursos"))
}

/// El script del puente: el `.ts` del repo en desarrollo, o el `.mjs` empaquetado en la app.
pub fn script_del_puente(app: &AppHandle) -> PathBuf {
    match recursos(app) {
        Some(carpeta) => carpeta.join("puente.mjs"),
        None => PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../packages/adapter/src/puente.ts"),
    }
}

#[cfg(all(test, unix))]
mod pruebas {
    use super::*;

    #[test]
    fn el_node_del_sistema_gana_y_el_de_la_app_es_el_respaldo() {
        let sistema = Some((PathBuf::from("/sistema/node"), 24));
        let app = Some((PathBuf::from("/app/node"), 24));
        assert_eq!(elegir_node(sistema.clone(), app.clone()), Some((PathBuf::from("/sistema/node"), 24, false)));
        assert_eq!(elegir_node(None, app), Some((PathBuf::from("/app/node"), 24, true)));
        assert_eq!(elegir_node(sistema, None), Some((PathBuf::from("/sistema/node"), 24, false)));
        assert_eq!(elegir_node(None, None), None);
    }

    #[test]
    fn marca_solo_cuando_es_el_de_la_app() {
        let mut con = Command::new("env");
        marcar_embebido(&mut con, true);
        assert!(con.get_envs().any(|(k, _)| k == "ASISTENTE_NODE_EMBEBIDO"));
        let mut sin = Command::new("env");
        marcar_embebido(&mut sin, false);
        assert!(sin.get_envs().next().is_none());
    }

    #[test]
    fn quita_la_clave_heredada_y_deja_el_resto() {
        let mut comando = Command::new("sh");
        comando.args(["-c", "printf '%s|%s' \"${ANTHROPIC_API_KEY-vacia}\" \"$PRUEBA_OTRA\""]).env("PRUEBA_OTRA", "se-conserva");
        // Simula la herencia: la clave está en el entorno del proceso padre (esta prueba).
        std::env::set_var("ANTHROPIC_API_KEY", "sk-ant-falsa");
        let salida = sin_clave_api(&mut comando).output().unwrap();
        std::env::remove_var("ANTHROPIC_API_KEY");
        assert_eq!(String::from_utf8_lossy(&salida.stdout), "vacia|se-conserva");
    }
}
