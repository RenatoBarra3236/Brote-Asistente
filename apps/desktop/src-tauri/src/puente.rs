//! El puente con el agente: un proceso Node (`packages/adapter/src/puente.ts`) que mantiene la
//! conexión con el Gateway de OpenClaw. Rust lo lanza, le pasa los pedidos de la ventana por la
//! entrada estándar y reenvía cada línea de su salida a la ventana como evento `puente`.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

pub struct Puente {
    hijo: Mutex<Option<Child>>,
    entrada: Mutex<Option<ChildStdin>>,
    /// El último aviso de conexión: la ventana lo pide al arrancar, porque los eventos
    /// emitidos antes de que empiece a escuchar se pierden.
    conexion: Arc<Mutex<String>>,
}

fn aviso_desconectado(detalle: &str) -> String {
    serde_json::json!({ "tipo": "conexion", "conectado": false, "detalle": detalle }).to_string()
}

impl Puente {
    /// Lanza el puente. Si no se puede, queda desconectado y la ventana muestra el motivo.
    pub fn iniciar(app: &AppHandle) -> Puente {
        let script = crate::entorno::script_del_puente(app);
        let conexion = Arc::new(Mutex::new(aviso_desconectado("Conectando con OpenClaw…")));
        let Some((node, _)) = crate::entorno::buscar_node() else {
            let detalle = format!("No encontré Node {} o superior: instálalo desde nodejs.org", crate::entorno::NODE_MINIMO);
            eprintln!("[puente] {detalle}");
            *conexion.lock().unwrap() = aviso_desconectado(&detalle);
            return Puente { hijo: Mutex::new(None), entrada: Mutex::new(None), conexion };
        };

        let lanzado = crate::entorno::sin_consola(&mut Command::new(&node))
            .arg(&script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn();
        let mut hijo = match lanzado {
            Ok(hijo) => hijo,
            Err(error) => {
                eprintln!("[puente] no se pudo lanzar `{} {}`: {error}", node.display(), script.display());
                *conexion.lock().unwrap() = aviso_desconectado(&format!("No pude iniciar el puente con OpenClaw ({error})"));
                return Puente { hijo: Mutex::new(None), entrada: Mutex::new(None), conexion };
            }
        };

        let salida = hijo.stdout.take().expect("salida del puente");
        let entrada = hijo.stdin.take();
        let app = app.clone();
        let ultima = conexion.clone();
        std::thread::spawn(move || {
            for linea in BufReader::new(salida).lines() {
                let Ok(linea) = linea else { break };
                if linea.starts_with(r#"{"tipo":"conexion""#) {
                    *ultima.lock().unwrap() = linea.clone();
                }
                let _ = app.emit("puente", linea);
            }
            let aviso = aviso_desconectado("El puente con OpenClaw se cerró");
            *ultima.lock().unwrap() = aviso.clone();
            let _ = app.emit("puente", aviso);
        });

        Puente { hijo: Mutex::new(Some(hijo)), entrada: Mutex::new(entrada), conexion }
    }

    /// Envía un pedido (una línea JSON) al puente.
    pub fn escribir(&self, linea: &str) -> Result<(), String> {
        if linea.contains('\n') {
            return Err("el pedido debe ser una sola línea".into());
        }
        let mut entrada = self.entrada.lock().unwrap();
        let entrada = entrada.as_mut().ok_or("el puente con OpenClaw no está corriendo")?;
        writeln!(entrada, "{linea}").and_then(|_| entrada.flush()).map_err(|e| e.to_string())
    }

    pub fn conexion(&self) -> String {
        self.conexion.lock().unwrap().clone()
    }

    /// Cierra la entrada para que el puente se desconecte solo; si tarda, lo termina.
    pub fn detener(&self) {
        self.entrada.lock().unwrap().take();
        let Some(mut hijo) = self.hijo.lock().unwrap().take() else { return };
        let limite = Instant::now() + Duration::from_millis(1500);
        while Instant::now() < limite {
            if let Ok(Some(_)) = hijo.try_wait() {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let _ = hijo.kill();
        let _ = hijo.wait();
    }
}
