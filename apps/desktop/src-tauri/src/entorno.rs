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
