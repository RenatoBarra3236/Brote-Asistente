//! Mostrar o abrir una descarga. La ventana solo puede pedir archivos que de verdad estén dentro de
//! la carpeta de descargas (ruta real, sin `..` ni enlaces que salgan de ella), y solo se abren
//! documentos: un programa o instalador se muestra en el Finder / Explorador, nunca se ejecuta.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Documentos que se abren con su app por defecto (la misma lista que `sePuedeAbrir` en descargas.ts).
const SE_PUEDEN_ABRIR: &[&str] = &[
    "pdf", "doc", "docx", "odt", "rtf", "txt", "md", "csv", "ppt", "pptx", "odp", "key", "xls", "xlsx", "ods", "numbers",
    "pages", "epub", "png", "jpg", "jpeg", "gif", "webp", "heic", "svg", "mp3", "m4a", "wav", "mp4", "mov",
];

/// La carpeta de descargas: `ASISTENTE_DESCARGAS` o "Downloads" en la carpeta personal (como en descargas.ts).
fn carpeta_descargas() -> Option<PathBuf> {
    if let Some(propia) = std::env::var_os("ASISTENTE_DESCARGAS") {
        return Some(PathBuf::from(propia));
    }
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })?;
    Some(PathBuf::from(home).join("Downloads"))
}

/// La ruta real del archivo si está dentro de `carpeta` (en cualquier nivel) y es un archivo.
pub fn validar(ruta: &Path, carpeta: &Path) -> Result<PathBuf, String> {
    let carpeta = carpeta.canonicalize().map_err(|_| "no encuentro la carpeta de descargas".to_string())?;
    let real = ruta.canonicalize().map_err(|_| "esa descarga ya no está".to_string())?;
    if !real.starts_with(&carpeta) || real == carpeta {
        return Err("solo puedo mostrar archivos de la carpeta de descargas".into());
    }
    if !real.is_file() {
        return Err("no es un archivo".into());
    }
    Ok(real)
}

pub fn se_puede_abrir(ruta: &Path) -> bool {
    ruta.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| SE_PUEDEN_ABRIR.contains(&e.to_ascii_lowercase().as_str()))
}

/// En Windows `canonicalize` antepone `\\?\`, que el Explorador no entiende.
#[cfg(target_os = "windows")]
fn para_el_sistema(ruta: &Path) -> String {
    let texto = ruta.display().to_string();
    texto.strip_prefix(r"\\?\").map(str::to_string).unwrap_or(texto)
}

/// Muestra la descarga seleccionada en el Finder / Explorador, o la abre si se pidió y es un documento.
#[tauri::command]
pub fn mostrar_descarga(ruta: String, abrir: bool) -> Result<(), String> {
    let carpeta = carpeta_descargas().ok_or("no encuentro la carpeta de descargas")?;
    let real = validar(Path::new(&ruta), &carpeta)?;
    let abrir = abrir && se_puede_abrir(&real);

    #[cfg(target_os = "macos")]
    let lanzado = if abrir {
        Command::new("open").arg("--").arg(&real).status()
    } else {
        Command::new("open").arg("-R").arg("--").arg(&real).status()
    };
    #[cfg(target_os = "windows")]
    let lanzado = {
        use std::os::windows::process::CommandExt;
        let texto = para_el_sistema(&real);
        if texto.contains('"') {
            return Err("ruta no válida".into());
        }
        if abrir {
            Command::new("explorer").arg(&texto).status()
        } else {
            Command::new("explorer").raw_arg(format!("/select,\"{texto}\"")).status()
        }
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let lanzado = Command::new("xdg-open")
        .arg(if abrir { real.as_path() } else { real.parent().unwrap_or(&carpeta) })
        .status();
    lanzado.map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn solo_archivos_dentro_de_descargas() {
        let base = std::env::temp_dir().join(format!("brote-descargas-{}", std::process::id()));
        let descargas = base.join("Downloads");
        std::fs::create_dir_all(descargas.join("sub")).unwrap();
        std::fs::write(descargas.join("apunte.pdf"), "x").unwrap();
        std::fs::write(descargas.join("sub/foto.png"), "x").unwrap();
        std::fs::write(base.join("secreto.txt"), "x").unwrap();

        assert!(validar(&descargas.join("apunte.pdf"), &descargas).is_ok());
        assert!(validar(&descargas.join("sub/foto.png"), &descargas).is_ok());
        assert!(validar(&descargas.join("../secreto.txt"), &descargas).is_err());
        assert!(validar(&base.join("secreto.txt"), &descargas).is_err());
        assert!(validar(&descargas, &descargas).is_err());
        assert!(validar(&descargas.join("sub"), &descargas).is_err());
        assert!(validar(&descargas.join("no-existe.pdf"), &descargas).is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(base.join("secreto.txt"), descargas.join("enlace.txt")).unwrap();
            assert!(validar(&descargas.join("enlace.txt"), &descargas).is_err());
        }
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn solo_abre_documentos() {
        assert!(se_puede_abrir(Path::new("/x/Guía.PDF")));
        assert!(!se_puede_abrir(Path::new("/x/instalador.dmg")));
        assert!(!se_puede_abrir(Path::new("/x/setup.exe")));
        assert!(!se_puede_abrir(Path::new("/x/sin-extension")));
    }
}
