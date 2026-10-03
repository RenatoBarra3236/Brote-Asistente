//! Conectores (Todoist, Notion, GitHub, Canva y servidores MCP propios) desde "Configurar Brote".
//! La lógica está en `packages/adapter/src/conectores.ts` y la ejecuta el script `configurar`; aquí
//! solo se lanza ese script con pedidos de una lista cerrada, se pasa cada fase a la ventana (evento
//! `conector`) y se abre la página de autorización, nunca una dirección cualquiera: https y con un
//! host permitido para ESE conector.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, State};

use crate::entorno;

/// Los conectores del catálogo y los hosts donde puede estar su página de autorización. Debe
/// coincidir con `CATALOGO` en conectores.ts (lo revisa una prueba de packages/adapter). Sin hosts =
/// se conecta con un token personal.
const CONECTORES: &[(&str, &[&str])] = &[
    ("todoist", &["todoist.com", "app.todoist.com"]),
    ("notion", &["mcp.notion.com", "www.notion.so", "notion.so"]),
    ("github", &[]),
    ("canva", &["mcp.canva.com", "www.canva.com", "canva.com"]),
];

/// Nombres que un conector propio no puede usar.
const RESERVADOS: &[&str] = &["gastos", "todoist", "notion", "github", "canva"];

/// Dónde se permite la página de autorización de la conexión en curso.
#[derive(Clone)]
enum Permitidos {
    Hosts(&'static [&'static str]),
    /// Conector propio: el host del servidor o un subdominio de su dominio.
    Propio(String),
}

struct EnCurso {
    id: String,
    permitidos: Permitidos,
    hijo: Arc<Mutex<Child>>,
    entrada: Option<ChildStdin>,
}

#[derive(Default)]
pub struct Conexiones(Mutex<Option<EnCurso>>);

/// El host de una URL https (en minúsculas, sin puerto), o `None` si no es https, trae usuario o
/// contraseña, o tiene caracteres raros.
fn host_https(url: &str) -> Option<String> {
    if url.len() > 4000 || url.chars().any(|c| c.is_whitespace() || c.is_control() || c == '"' || c == '\\') {
        return None;
    }
    let resto = url.get(..8).filter(|i| i.eq_ignore_ascii_case("https://")).map(|_| &url[8..])?;
    let autoridad = resto.split(['/', '?', '#']).next().unwrap_or("");
    if autoridad.contains('@') {
        return None;
    }
    let host = autoridad.rsplit_once(':').map_or(autoridad, |(h, puerto)| if puerto.chars().all(|c| c.is_ascii_digit()) { h } else { autoridad });
    if host.is_empty() || !host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
        return None;
    }
    Some(host.to_ascii_lowercase())
}

fn autorizacion_permitida(url: &str, permitidos: &Permitidos) -> bool {
    let Some(host) = host_https(url) else { return false };
    match permitidos {
        Permitidos::Hosts(hosts) => hosts.contains(&host.as_str()),
        Permitidos::Propio(servidor) => {
            let Some(propio) = host_https(servidor) else { return false };
            let partes: Vec<&str> = propio.split('.').collect();
            let dominio = partes[partes.len().saturating_sub(2)..].join(".");
            host == propio || host == dominio || host.ends_with(&format!(".{dominio}"))
        }
    }
}

/// Nombre de un conector propio: [a-z0-9-], 2 a 32, sin guion al borde, no reservado.
fn nombre_valido(nombre: &str) -> bool {
    (2..=32).contains(&nombre.len())
        && nombre.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !nombre.starts_with('-')
        && !nombre.ends_with('-')
        && !RESERVADOS.contains(&nombre)
}

/// La URL de un servidor propio: https, sin espacios ni símbolos que cmd interprete en Windows.
fn url_servidor_valida(url: &str) -> bool {
    url.len() <= 500 && host_https(url).is_some() && !url.chars().any(|c| matches!(c, '%' | '^' | '\'' | '`' | '<' | '>'))
}

fn token_valido(token: &str) -> bool {
    (20..=400).contains(&token.len()) && token.chars().all(|c| c.is_ascii_alphanumeric() || "_-.~+/=".contains(c))
}

/// Si `id` es un conector del catálogo o un nombre propio válido (para desconectar).
pub fn id_valido(id: &str) -> bool {
    CONECTORES.iter().any(|(c, _)| *c == id) || nombre_valido(id)
}

/// Conecta un conector: OAuth (catálogo o propio, con `url`) o con un token (GitHub). Cada línea del
/// script llega a la ventana como evento `conector`; el token va por la entrada, nunca como argumento.
#[tauri::command]
pub fn conector_conectar(
    app: AppHandle,
    conexiones: State<Conexiones>,
    id: String,
    url: Option<String>,
    token: Option<String>,
) -> Result<(), String> {
    let (argumentos, permitidos): (Vec<String>, Permitidos) = match CONECTORES.iter().find(|(c, _)| *c == id) {
        Some((c, &[])) => {
            token.as_deref().map(str::trim).filter(|t| token_valido(t)).ok_or("ese token no parece válido")?;
            (vec!["conectar-token".into(), (*c).into()], Permitidos::Hosts(&[]))
        }
        Some((c, hosts)) => (vec!["conectar".into(), (*c).into()], Permitidos::Hosts(hosts)),
        None => {
            let url = url.as_deref().map(str::trim).filter(|u| url_servidor_valida(u)).ok_or("la dirección debe ser https")?;
            if !nombre_valido(&id) {
                return Err("nombre no válido".into());
            }
            (vec!["conectar-propio".into(), id.clone(), url.to_string()], Permitidos::Propio(url.to_string()))
        }
    };
    let mut en_curso = conexiones.0.lock().unwrap();
    if en_curso.as_ref().is_some_and(|c| c.hijo.lock().unwrap().try_wait().ok().flatten().is_none()) {
        return Err("ya hay una conexión en curso".into());
    }
    let (node, _) = entorno::buscar_node().ok_or("no encontré Node")?;
    let mut hijo = entorno::sin_consola(&mut Command::new(node))
        .arg(crate::configuracion::script(&app))
        .args(&argumentos)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let salida = hijo.stdout.take().ok_or("sin salida")?;
    let mut entrada = hijo.stdin.take();
    if let (Some(token), Some(entrada)) = (token.as_deref().map(str::trim), entrada.as_mut()) {
        if argumentos[0] == "conectar-token" {
            writeln!(entrada, "{token}").and_then(|_| entrada.flush()).map_err(|e| e.to_string())?;
        }
    }
    let hijo = Arc::new(Mutex::new(hijo));
    let esperar = hijo.clone();
    let id_evento = id.clone();
    std::thread::spawn(move || {
        let mut final_visto = false;
        for linea in BufReader::new(salida).lines() {
            let Ok(linea) = linea else { break };
            let Ok(mut fase) = serde_json::from_str::<serde_json::Value>(&linea) else { continue };
            final_visto |= matches!(fase["fase"].as_str(), Some("listo" | "error" | "cancelado"));
            fase["id"] = serde_json::Value::String(id_evento.clone());
            let _ = app.emit("conector", fase);
        }
        // Sin `wait()`, que tendría tomado el candado mientras Cancelar lo necesita.
        while matches!(esperar.lock().unwrap().try_wait(), Ok(None)) {
            std::thread::sleep(Duration::from_millis(100));
        }
        if !final_visto {
            let _ = app.emit("conector", serde_json::json!({ "id": id_evento, "fase": "error", "detalle": "El proceso terminó sin avisar." }));
        }
    });
    *en_curso = Some(EnCurso { id, permitidos, hijo, entrada });
    Ok(())
}

/// Cancela la conexión en curso: le pide al script que corte el inicio de sesión y, si en 5 s no
/// terminó, lo termina.
#[tauri::command]
pub fn conector_cancelar(conexiones: State<Conexiones>) -> Result<(), String> {
    let Some(mut en_curso) = conexiones.0.lock().unwrap().take() else { return Ok(()) };
    if let Some(mut entrada) = en_curso.entrada.take() {
        let _ = writeln!(entrada, "cancelar").and_then(|_| entrada.flush());
    }
    let hijo = en_curso.hijo.clone();
    std::thread::spawn(move || {
        let limite = Instant::now() + Duration::from_secs(5);
        while Instant::now() < limite {
            if let Ok(Some(_)) = hijo.lock().unwrap().try_wait() {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = hijo.lock().unwrap().kill();
    });
    Ok(())
}

/// Abre en el navegador la página de autorización de la conexión en curso, solo si es https y su
/// host está entre los permitidos de ese conector.
#[tauri::command]
pub fn abrir_autorizacion(conexiones: State<Conexiones>, id: String, url: String) -> Result<(), String> {
    let en_curso = conexiones.0.lock().unwrap();
    let en_curso = en_curso
        .as_ref()
        .filter(|c| c.id == id && matches!(c.hijo.lock().unwrap().try_wait(), Ok(None)))
        .ok_or("no hay una conexión en curso para ese conector")?;
    if !autorizacion_permitida(&url, &en_curso.permitidos) {
        return Err("esa dirección no es la página de autorización del servicio".into());
    }
    #[cfg(target_os = "macos")]
    let abierto = Command::new("open").arg(&url).status();
    // `start` pasa por cmd, que corta la dirección en cada "&": rundll32 la recibe entera.
    #[cfg(target_os = "windows")]
    let abierto = entorno::sin_consola(Command::new("rundll32").args(["url.dll,FileProtocolHandler", &url])).status();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let abierto = Command::new("xdg-open").arg(&url).status();
    abierto.map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const TODOIST: &str = "https://todoist.com/oauth/authorize?response_type=code&client_id=abc&code_challenge=x&code_challenge_method=S256&redirect_uri=http%3A%2F%2F127.0.0.1%3A8989%2Foauth%2Fcallback&state=s&scope=data%3Aread_write";

    fn hosts(id: &str) -> Permitidos {
        Permitidos::Hosts(CONECTORES.iter().find(|(c, _)| *c == id).unwrap().1)
    }

    #[test]
    fn autorizacion_solo_en_los_hosts_del_conector() {
        assert!(autorizacion_permitida(TODOIST, &hosts("todoist")));
        assert!(autorizacion_permitida("https://mcp.notion.com/authorize?x=1", &hosts("notion")));
        for mala in [
            TODOIST.replacen("https", "http", 1),
            "https://todoist.com.malo.cl/oauth".into(),
            "https://todoist.com@malo.cl/oauth".into(),
            "https://malo.cl/?r=https://todoist.com".into(),
            "https://todoist.com:8443x/oauth".into(),
            "file:///etc/passwd".into(),
            "https://todoist.com/a b".into(),
            "javascript:alert(1)".into(),
        ] {
            assert!(!autorizacion_permitida(&mala, &hosts("todoist")), "{mala}");
        }
        assert!(!autorizacion_permitida("https://mcp.notion.com/authorize", &hosts("todoist")));
        // GitHub usa token: nunca abre una página de autorización.
        assert!(!autorizacion_permitida("https://github.com/login/oauth/authorize", &hosts("github")));
    }

    #[test]
    fn autorizacion_de_un_conector_propio() {
        let propio = Permitidos::Propio("https://mcp.ejemplo.cl/mcp".into());
        assert!(autorizacion_permitida("https://mcp.ejemplo.cl/authorize", &propio));
        assert!(autorizacion_permitida("https://login.ejemplo.cl/oauth", &propio));
        assert!(!autorizacion_permitida("https://ejemplo.cl.malo.com/oauth", &propio));
        assert!(!autorizacion_permitida("http://login.ejemplo.cl/oauth", &propio));
    }

    #[test]
    fn nombres_urls_y_tokens() {
        assert!(nombre_valido("mi-wiki"));
        for malo in ["a", "Mi", "-a", "a-", "a_b", "gastos", "todoist", "con espacio", "../x"] {
            assert!(!nombre_valido(malo), "{malo}");
        }
        assert!(url_servidor_valida("https://wiki.ejemplo.cl/mcp"));
        for mala in ["http://x.cl/mcp", "https://x.cl/%41", "https://x.cl/a^b", "https://u:p@x.cl/mcp", "x.cl/mcp"] {
            assert!(!url_servidor_valida(mala), "{mala}");
        }
        assert!(token_valido(&format!("github_pat_{}", "A".repeat(40))));
        assert!(!token_valido("corto"));
        assert!(!token_valido(&format!("con espacio {}", "a".repeat(30))));
        assert!(id_valido("todoist") && id_valido("mi-wiki") && !id_valido("gastos") && !id_valido("../x"));
    }
}
