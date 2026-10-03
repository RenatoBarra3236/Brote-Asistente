// El hook de Claude Code del modo programador. Claude Code lo ejecuta en cada evento (sesión que
// empieza, herramienta que se usa, permiso que se pide, turno que termina…) y le pasa el evento en
// JSON por la entrada estándar. Este script lo resume y se lo manda al puente de Brote por
// localhost, con el token de ~/.asistente-prototipo/hooks.json (permisos 600).
//
// Reglas, para nunca estorbar a Claude Code:
//   - Siempre sale con código 0 y, salvo un permiso respondido en la isla, sin imprimir nada.
//   - Termina en menos de 1 s (si Brote no está abierto, al tiro).
//   - La única espera larga es `PermissionRequest`: Claude Code ya mostró su diálogo y no espera al
//     hook, así que el usuario puede responder en la terminal o en la isla. Si nadie responde en la
//     isla, no se imprime nada y todo sigue como siempre.
//   - Las sesiones que lanza OpenClaw se ignoran (ya se ven en la isla, y sus permisos los maneja él).
//   - No lee credenciales ni el texto de los mensajes: solo el nombre de la herramienta y lo justo
//     para describirla ("Editando lib.rs…").
//
// Sin dependencias ni imports de otros módulos del repo: se empaqueta solo (hook.mjs) y arranca rápido.

import { readFileSync } from "node:fs";
import { request } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

/** Lo más que se espera en un evento normal (Node ya tardó en arrancar): el total queda bajo 1 s. */
const LIMITE_MS = 450;
/** Corte total de un evento normal, por si algo se cuelga. */
const CORTE_MS = 850;
/** Lo más que se espera una decisión de la isla (Claude Code le da 60 s al hook). */
const LIMITE_PERMISO_MS = 50_000;

/**
 * Si la sesión es interactiva. En `claude -p` y el SDK (CLAUDE_CODE_ENTRYPOINT "sdk-…") no hay diálogo
 * y Claude Code sí espera la decisión del hook: ahí el permiso no se lleva a la isla.
 */
export function esInteractiva(entorno: NodeJS.ProcessEnv): boolean {
  return !/^sdk/i.test(entorno.CLAUDE_CODE_ENTRYPOINT ?? "");
}

/** Lo que se le manda al puente: solo lo que Brote necesita para mostrar la sesión. */
export function resumir(entrada: any, interactiva = true): Record<string, unknown> | null {
  if (!entrada || typeof entrada !== "object" || typeof entrada.hook_event_name !== "string") return null;
  const ti = entrada.tool_input && typeof entrada.tool_input === "object" ? entrada.tool_input : {};
  const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  return {
    evento: entrada.hook_event_name,
    sesion: texto(entrada.session_id, 200),
    cwd: texto(entrada.cwd, 1000),
    herramienta: texto(entrada.tool_name, 120),
    entrada: entrada.tool_name
      ? {
          archivo: texto(ti.file_path ?? ti.notebook_path ?? ti.path, 500),
          comando: texto(ti.command, 300),
          patron: texto(ti.pattern ?? ti.query, 120),
          descripcion: texto(ti.description, 200),
          url: texto(ti.url, 300),
        }
      : undefined,
    idHerramienta: texto(entrada.tool_use_id, 200),
    tipoNotificacion: texto(entrada.notification_type, 60),
    mensaje: entrada.hook_event_name === "Notification" ? texto(entrada.message, 300) : undefined,
    interactiva,
  };
}

/** Las sesiones que lanza OpenClaw llevan sus variables de entorno: esas se ignoran. */
export function esDeOpenClaw(entorno: NodeJS.ProcessEnv): boolean {
  return Object.keys(entorno).some((nombre) => nombre.startsWith("OPENCLAW_"));
}

/** Lo que el hook imprime para Claude Code si la isla respondió el permiso (o nada). */
export function salidaPermiso(respuesta: string): string | null {
  try {
    const decision = JSON.parse(respuesta)?.decision;
    if (decision !== "allow" && decision !== "deny") return null;
    return JSON.stringify({ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: decision } } });
  } catch {
    return null;
  }
}

function leerEntrada(limiteMs: number): Promise<string> {
  return new Promise((listo) => {
    let texto = "";
    const plazo = setTimeout(() => listo(texto), limiteMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (parte) => {
      if (texto.length < 1_000_000) texto += parte;
    });
    process.stdin.on("end", () => {
      clearTimeout(plazo);
      listo(texto);
    });
    process.stdin.on("error", () => listo(texto));
  });
}

function enviar(puerto: number, token: string, cuerpo: string, limiteMs: number): Promise<string | null> {
  return new Promise((listo) => {
    const pedido = request(
      {
        host: "127.0.0.1",
        port: puerto,
        path: "/evento",
        method: "POST",
        timeout: limiteMs,
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(cuerpo), authorization: `Bearer ${token}` },
      },
      (respuesta) => {
        let texto = "";
        respuesta.setEncoding("utf8");
        respuesta.on("data", (parte) => (texto += parte));
        respuesta.on("end", () => listo(respuesta.statusCode === 200 ? texto : null));
        respuesta.on("error", () => listo(null));
      },
    );
    const plazo = setTimeout(() => pedido.destroy(), limiteMs);
    pedido.on("close", () => clearTimeout(plazo));
    pedido.on("timeout", () => pedido.destroy());
    pedido.on("error", () => listo(null));
    pedido.end(cuerpo);
  });
}

async function principal(alargarCorte: (ms: number) => void): Promise<void> {
  if (esDeOpenClaw(process.env)) return;
  const texto = await leerEntrada(250);
  let entrada: any;
  try {
    entrada = JSON.parse(texto);
  } catch {
    return;
  }
  const resumen = resumir(entrada, esInteractiva(process.env));
  if (!resumen) return;
  let conexion: { puerto?: unknown; token?: unknown };
  try {
    conexion = JSON.parse(readFileSync(join(homedir(), ".asistente-prototipo", "hooks.json"), "utf8"));
  } catch {
    return; // Brote no está instalado o nunca se abrió.
  }
  if (!Number.isInteger(conexion.puerto) || typeof conexion.token !== "string") return;
  const esPermiso = resumen.evento === "PermissionRequest" && resumen.interactiva === true;
  if (esPermiso) alargarCorte(LIMITE_PERMISO_MS + 2000);
  const respuesta = await enviar(conexion.puerto as number, conexion.token, JSON.stringify(resumen), esPermiso ? LIMITE_PERMISO_MS : LIMITE_MS);
  const salida = esPermiso && respuesta ? salidaPermiso(respuesta) : null;
  if (salida) process.stdout.write(`${salida}\n`);
}

if (import.meta.main) {
  // Pase lo que pase, se sale con código 0 y a tiempo.
  let corte = setTimeout(() => process.exit(0), CORTE_MS);
  const alargarCorte = (ms: number) => {
    clearTimeout(corte);
    corte = setTimeout(() => process.exit(0), ms);
  };
  principal(alargarCorte).then(
    () => process.exit(0),
    () => process.exit(0),
  );
}
