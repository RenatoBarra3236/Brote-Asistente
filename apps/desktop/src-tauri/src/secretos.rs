//! Secretos de Brote en el Llavero de macOS / Administrador de credenciales de Windows.
//!
//! Solo la app toca el Llavero. Al puente y a `configurar.ts` les pasa los secretos por la entrada
//! estándar (nunca por argumentos ni variables de entorno) y quedan en su memoria. En los archivos
//! (`aula.json`, `calendario.json`) queda `enLlavero: true` en lugar del secreto. Sin Llavero
//! (Linux, o si falla) el archivo conserva el secreto con permisos 600, como antes.
//! Qué se guarda: el token del aula y la dirección iCal. Nunca se registra un valor.

#[cfg(test)]
use std::collections::HashMap;
#[cfg(test)]
use std::sync::Mutex;

const SERVICIO: &str = "com.asistente.prototipo";
pub const AULA_TOKEN: &str = "aula-token";
pub const ICAL: &str = "ical";

/// Dónde se guardan los secretos (un trait para probar sin tocar el Llavero real).
pub trait Almacen: Send + Sync {
    fn leer(&self, nombre: &str) -> Result<Option<String>, String>;
    fn guardar(&self, nombre: &str, valor: &str) -> Result<(), String>;
    fn borrar(&self, nombre: &str) -> Result<(), String>;
}

/// El Llavero del sistema. En Linux no hay: siempre falla y los secretos siguen en el archivo.
pub struct Llavero;

#[cfg(any(target_os = "macos", target_os = "windows"))]
impl Llavero {
    fn entrada(nombre: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICIO, nombre).map_err(|e| e.to_string())
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
impl Almacen for Llavero {
    fn leer(&self, nombre: &str) -> Result<Option<String>, String> {
        match Self::entrada(nombre)?.get_password() {
            Ok(valor) => Ok(Some(valor)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    fn guardar(&self, nombre: &str, valor: &str) -> Result<(), String> {
        Self::entrada(nombre)?.set_password(valor).map_err(|e| e.to_string())
    }
    fn borrar(&self, nombre: &str) -> Result<(), String> {
        match Self::entrada(nombre)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
impl Almacen for Llavero {
    fn leer(&self, _: &str) -> Result<Option<String>, String> {
        Err("este sistema no tiene Llavero".into())
    }
    fn guardar(&self, _: &str, _: &str) -> Result<(), String> {
        Err("este sistema no tiene Llavero".into())
    }
    fn borrar(&self, _: &str) -> Result<(), String> {
        Err("este sistema no tiene Llavero".into())
    }
}

/// El almacén que usa la app (en las pruebas, uno en memoria).
pub fn almacen() -> &'static dyn Almacen {
    static LLAVERO: Llavero = Llavero;
    &LLAVERO
}

/// Un almacén en memoria, para las pruebas. `falla` simula un Llavero que no responde.
#[cfg(test)]
#[derive(Default)]
pub struct EnMemoria {
    pub datos: Mutex<HashMap<String, String>>,
    pub falla: bool,
}

#[cfg(test)]
impl Almacen for EnMemoria {
    fn leer(&self, nombre: &str) -> Result<Option<String>, String> {
        if self.falla {
            return Err("sin Llavero".into());
        }
        Ok(self.datos.lock().unwrap().get(nombre).cloned())
    }
    fn guardar(&self, nombre: &str, valor: &str) -> Result<(), String> {
        if self.falla {
            return Err("sin Llavero".into());
        }
        self.datos.lock().unwrap().insert(nombre.into(), valor.into());
        Ok(())
    }
    fn borrar(&self, nombre: &str) -> Result<(), String> {
        if self.falla {
            return Err("sin Llavero".into());
        }
        self.datos.lock().unwrap().remove(nombre);
        Ok(())
    }
}

/// Guarda un secreto en el Llavero; si no se puede, devuelve `false` y quien llama lo deja en el archivo.
/// Después de guardar lo vuelve a leer: solo así se da por seguro (y el archivo se limpia).
pub fn guardar_verificado(almacen: &dyn Almacen, nombre: &str, valor: &str) -> bool {
    almacen.guardar(nombre, valor).is_ok() && matches!(almacen.leer(nombre), Ok(Some(v)) if v == valor)
}

/// El JSON `{ "tipo": "secretos", … }` que se le manda al puente (una línea).
/// Solo incluye lo que hay: lo que falta se olvida del otro lado.
pub fn linea_para_el_puente(almacen: &dyn Almacen, archivos: &Archivos) -> String {
    let mut datos = serde_json::json!({ "tipo": "secretos" });
    if archivos.aula_en_llavero {
        if let Ok(Some(token)) = almacen.leer(AULA_TOKEN) {
            datos["aulaToken"] = token.into();
        }
    }
    if archivos.ical_en_llavero {
        if let Ok(Some(url)) = almacen.leer(ICAL) {
            datos["ical"] = url.into();
        }
    }
    datos.to_string()
}

/// Qué archivos delegan su secreto al Llavero (según la marca `enLlavero`).
#[derive(Default, Debug, PartialEq, Eq)]
pub struct Archivos {
    pub aula_en_llavero: bool,
    pub ical_en_llavero: bool,
}

fn marca(ruta: &std::path::Path) -> bool {
    std::fs::read_to_string(ruta)
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .is_some_and(|v| v.get("enLlavero").and_then(|m| m.as_bool()) == Some(true))
}

pub fn leer_marcas(carpeta: &std::path::Path) -> Archivos {
    Archivos { aula_en_llavero: marca(&carpeta.join("aula.json")), ical_en_llavero: marca(&carpeta.join("calendario.json")) }
}

/// Mueve al Llavero lo que quedó en texto plano de versiones anteriores. Idempotente: por cada archivo
/// copia, relee para verificar y recién entonces reescribe el archivo sin el secreto. Si algo falla,
/// el archivo queda como estaba. Devuelve qué se migró (para el registro, sin valores).
pub fn migrar(almacen: &dyn Almacen, carpeta: &std::path::Path) -> Vec<&'static str> {
    use crate::configuracion::escribir_privado;
    let mut hechos = Vec::new();
    let aula = carpeta.join("aula.json");
    if let Some(mut v) = std::fs::read_to_string(&aula).ok().and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()) {
        if let Some(token) = v.get("token").and_then(|t| t.as_str()).map(str::to_owned) {
            if guardar_verificado(almacen, AULA_TOKEN, &token) {
                let objeto = v.as_object_mut().unwrap();
                objeto.remove("token");
                objeto.insert("enLlavero".into(), true.into());
                if escribir_privado(&aula, &v.to_string()).is_ok() {
                    hechos.push("aula");
                }
            }
        }
    }
    let calendario = carpeta.join("calendario.json");
    if let Some(mut v) = std::fs::read_to_string(&calendario).ok().and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()) {
        if let Some(url) = v.get("ical").and_then(|t| t.as_str()).map(str::to_owned) {
            if guardar_verificado(almacen, ICAL, &url) {
                let objeto = v.as_object_mut().unwrap();
                objeto.remove("ical");
                objeto.insert("enLlavero".into(), true.into());
                if escribir_privado(&calendario, &v.to_string()).is_ok() {
                    hechos.push("calendario");
                }
            }
        }
    }
    hechos
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn carpeta(nombre: &str) -> std::path::PathBuf {
        let c = std::env::temp_dir().join(format!("brote-secretos-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&c);
        std::fs::create_dir_all(&c).unwrap();
        c
    }

    #[test]
    fn migra_y_deja_el_archivo_sin_secreto() {
        let c = carpeta("migra");
        std::fs::write(c.join("aula.json"), r#"{"tipo":"canvas","url":"https://c.cl","token":"TOKEN-DE-PRUEBA-1234"}"#).unwrap();
        std::fs::write(c.join("calendario.json"), r#"{"ical":"https://calendar.example/secreta.ics"}"#).unwrap();
        let a = EnMemoria::default();
        assert_eq!(migrar(&a, &c), vec!["aula", "calendario"]);
        let aula = std::fs::read_to_string(c.join("aula.json")).unwrap();
        assert!(!aula.contains("TOKEN-DE-PRUEBA") && aula.contains("enLlavero") && aula.contains("canvas"));
        assert!(!std::fs::read_to_string(c.join("calendario.json")).unwrap().contains("secreta.ics"));
        assert_eq!(a.leer(AULA_TOKEN).unwrap().as_deref(), Some("TOKEN-DE-PRUEBA-1234"));
        // Idempotente: una segunda vez no hace nada.
        assert!(migrar(&a, &c).is_empty());
        let linea = linea_para_el_puente(&a, &leer_marcas(&c));
        assert!(linea.contains("aulaToken") && linea.contains("ical"));
        std::fs::remove_dir_all(&c).unwrap();
    }

    #[test]
    fn si_el_llavero_falla_el_archivo_queda_como_estaba() {
        let c = carpeta("falla");
        let original = r#"{"tipo":"canvas","url":"https://c.cl","token":"TOKEN-DE-PRUEBA-1234"}"#;
        std::fs::write(c.join("aula.json"), original).unwrap();
        let a = EnMemoria { falla: true, ..Default::default() };
        assert!(migrar(&a, &c).is_empty());
        assert_eq!(std::fs::read_to_string(c.join("aula.json")).unwrap(), original);
        assert_eq!(leer_marcas(&c), Archivos::default());
        std::fs::remove_dir_all(&c).unwrap();
    }

    #[test]
    fn la_linea_del_puente_omite_lo_que_no_hay() {
        let a = EnMemoria::default();
        assert_eq!(linea_para_el_puente(&a, &Archivos::default()), r#"{"tipo":"secretos"}"#);
    }
}
