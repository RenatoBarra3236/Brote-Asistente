//! Las funciones de Brote que se prenden y apagan en Configurar Brote → Funciones, y el orden de las
//! tarjetas de Inicio. Se guardan en `~/.asistente-prototipo/funciones.json` (permisos 600); las leen
//! el puente (que no arranca lo apagado), el servidor MCP y la isla. La lógica está en
//! packages/motor/src/funciones.ts; aquí solo se valida contra listas cerradas y se escribe.

use crate::configuracion::{carpeta_datos, escribir_privado};

/// Ids de las funciones: deben coincidir con `IDS_FUNCIONES` de funciones.ts (lo revisa una prueba del motor).
const FUNCIONES: &[&str] = &[
    "gastos", "temporizadores", "calendario", "aula", "musica", "descargas", "equipo", "programador", "uso-del-plan",
    "memoria-local", "especialistas", "grabaciones", "estudio",
];

/// Ids de las tarjetas de Inicio: deben coincidir con `IDS_TARJETAS` de funciones.ts.
const TARJETAS: &[&str] = &["temporizadores", "calendario", "aula", "musica", "descargas", "claude"];

/// Revisa lo que manda la ventana y arma el JSON a guardar. Rechaza ids desconocidos, valores que no
/// son booleanos y tarjetas repetidas: la ventana nunca puede escribir otra cosa en el archivo.
pub fn validar(activas: &serde_json::Map<String, serde_json::Value>, orden: &[String], ocultas: &[String], sin_ia: bool) -> Result<String, String> {
    let mut limpias = serde_json::Map::new();
    for (id, valor) in activas {
        if !FUNCIONES.contains(&id.as_str()) {
            return Err(format!("función desconocida: {id}"));
        }
        let valor = valor.as_bool().ok_or("cada función va prendida o apagada")?;
        limpias.insert(id.clone(), serde_json::Value::Bool(valor));
    }
    for lista in [orden, ocultas] {
        for (i, tarjeta) in lista.iter().enumerate() {
            if !TARJETAS.contains(&tarjeta.as_str()) {
                return Err(format!("tarjeta desconocida: {tarjeta}"));
            }
            if lista[..i].contains(tarjeta) {
                return Err(format!("tarjeta repetida: {tarjeta}"));
            }
        }
    }
    let mut archivo = serde_json::json!({
        "version": 1,
        "activas": limpias,
        "tarjetas": { "orden": orden, "ocultas": ocultas },
    });
    // «Empezar sin IA»: solo se escribe cuando es verdadero (sin el campo, Brote se prepara con la IA).
    if sin_ia {
        archivo["sinIA"] = serde_json::Value::Bool(true);
    }
    Ok(archivo.to_string())
}

/// Guarda las funciones (las lee el puente en menos de unos segundos, por la fecha del archivo).
#[tauri::command]
pub fn guardar_funciones(
    activas: serde_json::Map<String, serde_json::Value>,
    orden: Vec<String>,
    ocultas: Vec<String>,
    sin_ia: Option<bool>,
) -> Result<(), String> {
    let contenido = validar(&activas, &orden, &ocultas, sin_ia.unwrap_or(false))?;
    escribir_privado(&carpeta_datos()?.join("funciones.json"), &contenido)
}

/// El contenido de funciones.json, o `None` si todavía no existe (la ventana usa los valores por
/// defecto y, en la primera configuración, ofrece elegir).
#[tauri::command]
pub fn leer_funciones() -> Result<Option<String>, String> {
    match std::fs::read_to_string(carpeta_datos()?.join("funciones.json")) {
        Ok(texto) => Ok(Some(texto)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn mapa(texto: &str) -> serde_json::Map<String, serde_json::Value> {
        serde_json::from_str(texto).unwrap()
    }

    #[test]
    fn solo_funciones_y_tarjetas_conocidas() {
        let ok = validar(&mapa(r#"{"musica":false,"programador":true}"#), &["aula".into(), "musica".into()], &["descargas".into()], false).unwrap();
        let leido: serde_json::Value = serde_json::from_str(&ok).unwrap();
        assert_eq!(leido["activas"]["musica"], false);
        assert!(leido.get("sinIA").is_none());
        let sin_ia: serde_json::Value = serde_json::from_str(&validar(&mapa("{}"), &[], &[], true).unwrap()).unwrap();
        assert_eq!(sin_ia["sinIA"], true);
        assert_eq!(leido["tarjetas"]["orden"][0], "aula");
        assert!(validar(&mapa(r#"{"rm -rf":true}"#), &[], &[], false).is_err());
        assert!(validar(&mapa(r#"{"musica":"sí"}"#), &[], &[], false).is_err());
        assert!(validar(&mapa("{}"), &["../x".into()], &[], false).is_err());
        assert!(validar(&mapa("{}"), &["aula".into(), "aula".into()], &[], false).is_err());
        assert!(validar(&mapa("{}"), &[], &["otra".into()], false).is_err());
    }
}
