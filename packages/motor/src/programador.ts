// Modo programador: Brote muestra en vivo las sesiones de Claude Code del usuario (no las de
// OpenClaw, que ya se ven en la isla). Los datos llegan por los hooks oficiales de Claude Code: un
// script pequeño (packages/adapter/src/hook.ts) resume cada evento y se lo pasa al puente por
// localhost. Aquí está la lógica pura: interpretar los eventos, llevar el estado de cada sesión y
// describirlo. Nunca se leen credenciales de Claude; el uso del plan no llega por los hooks, así
// que no se muestra.

import { readFileSync } from "node:fs";
import { request } from "node:http";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

/** Dónde deja el puente el puerto y el token de su servidor local (permisos 600). */
export const RUTA_CONEXION_HOOKS = join(homedir(), ".asistente-prototipo", "hooks.json");

/** Lo que el script del hook manda al puente (ya resumido: solo lo que Brote necesita). */
export interface EventoHook {
  evento: string;
  sesion: string;
  cwd: string;
  herramienta?: string;
  /** Lo justo de la entrada de la herramienta para describirla. */
  entrada?: { archivo?: string; comando?: string; patron?: string; descripcion?: string; url?: string };
  idHerramienta?: string;
  tipoNotificacion?: string;
  mensaje?: string;
  /** `false` en `claude -p` / SDK: Claude Code espera al hook, así que el permiso no se lleva a la isla. */
  interactiva?: boolean;
}

export type EstadoSesion = "pensando" | "trabajando" | "permiso" | "esperando" | "lista" | "error";

export interface SesionClaude {
  id: string;
  /** El nombre de la carpeta del proyecto. */
  proyecto: string;
  cwd: string;
  estado: EstadoSesion;
  /** "Editando lib.rs…", "Ejecutando npm test…". */
  actividad: string;
  ultimaActividadMs: number;
}

/** Lo que Brote hace al recibir un evento: celebrar cuando Claude termina, preocuparse si falla. */
export type Reaccion = "termino" | "fallo" | null;

/** Valida y limpia lo que llega por HTTP (viene de un script nuestro, pero igual se revisa). */
export function leerEventoHook(datos: unknown): EventoHook | null {
  const d = datos as Record<string, unknown> | null;
  const texto = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  if (!d || !texto(d.evento, 60) || !texto(d.sesion, 200) || !texto(d.cwd, 1000)) return null;
  const e = (d.entrada ?? {}) as Record<string, unknown>;
  const entrada = {
    archivo: texto(e.archivo, 500),
    comando: texto(e.comando, 300),
    patron: texto(e.patron, 120),
    descripcion: texto(e.descripcion, 200),
    url: texto(e.url, 300),
  };
  return {
    evento: texto(d.evento, 60)!,
    sesion: texto(d.sesion, 200)!,
    cwd: texto(d.cwd, 1000)!,
    herramienta: texto(d.herramienta, 120),
    entrada: Object.values(entrada).some(Boolean) ? entrada : undefined,
    idHerramienta: texto(d.idHerramienta, 200),
    tipoNotificacion: texto(d.tipoNotificacion, 60),
    mensaje: texto(d.mensaje, 300),
    interactiva: d.interactiva !== false,
  };
}

/** Si la sesión la lanzó OpenClaw (corre en su carpeta o en el workspace del agente): se ignora. */
export function esDeOpenClaw(cwd: string, carpetas: string[]): boolean {
  const ruta = resolve(cwd);
  return carpetas.some((carpeta) => {
    const base = resolve(carpeta);
    return ruta === base || ruta.startsWith(base + sep);
  });
}

/** Una línea de como mucho `max` letras (sin los "…": los pone quien la usa). */
function corto(texto: string, max = 40): string {
  const linea = texto.replace(/\s+/g, " ").trim();
  return linea.length > max ? linea.slice(0, max - 1).trimEnd() : linea;
}

/**
 * Lo que de verdad hace un comando: Claude Code suele anteponer `cd <ruta> &&` (o `;`), que no
 * dice nada. Si el comando es solo un `cd`, queda "cd". "cd /Users/x/app && npm test" → "npm test".
 */
export function comandoUtil(comando: string): string {
  let resto = comando.trim();
  for (;;) {
    const m = resto.match(/^(?:cd|pushd|Set-Location)\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;|\|\|)\s*/i);
    if (!m) break;
    resto = resto.slice(m[0].length);
  }
  return resto || comando.trim().split(/\s+/)[0];
}

/** "Editando lib.rs…", "Ejecutando npm test…", "Buscando «useState»…". */
export function describirHerramienta(herramienta: string | undefined, entrada: EventoHook["entrada"]): string {
  const archivo = entrada?.archivo ? basename(entrada.archivo) : null;
  switch (herramienta) {
    case undefined:
      return "Pensando…";
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return archivo ? `Editando ${archivo}…` : "Editando…";
    case "Write":
      return archivo ? `Escribiendo ${archivo}…` : "Escribiendo un archivo…";
    case "Read":
      return archivo ? `Leyendo ${archivo}…` : "Leyendo…";
    case "Bash":
    case "PowerShell":
      return entrada?.comando ? `Ejecutando ${corto(comandoUtil(entrada.comando))}…` : "Ejecutando un comando…";
    case "Grep":
    case "Glob":
      return entrada?.patron ? `Buscando «${corto(entrada.patron, 30)}»…` : "Buscando en el código…";
    case "WebFetch":
    case "WebSearch":
      return "Buscando en la web…";
    case "Task":
    case "Agent":
      return "Trabajando con un subagente…";
    case "TodoWrite":
    case "TaskCreate":
    case "TaskUpdate":
      return "Ordenando sus tareas…";
  }
  const mcp = herramienta.match(/^mcp__[^_]+(?:_[^_]+)*__(.+)$/);
  return `Usando ${corto(mcp ? mcp[1] : herramienta, 30)}…`;
}

/** Cuánto sigue a la vista una sesión que no hace nada (y cuándo se olvida del todo). */
const QUIETA_VISIBLE_MS = 10 * 60_000;
const OLVIDAR_MS = 3 * 60 * 60_000;

/** El estado de todas las sesiones de Claude Code abiertas. */
export class SesionesClaude {
  private sesiones = new Map<string, SesionClaude>();

  aplicar(e: EventoHook, ahora: number): Reaccion {
    if (e.evento === "SessionEnd") {
      this.sesiones.delete(e.sesion);
      return null;
    }
    const sesion = this.sesiones.get(e.sesion) ?? {
      id: e.sesion,
      proyecto: basename(e.cwd) || e.cwd,
      cwd: e.cwd,
      estado: "esperando" as EstadoSesion,
      actividad: "Lista para empezar",
      ultimaActividadMs: ahora,
    };
    sesion.ultimaActividadMs = ahora;
    sesion.cwd = e.cwd;
    sesion.proyecto = basename(e.cwd) || e.cwd;
    this.sesiones.set(e.sesion, sesion);
    let reaccion: Reaccion = null;
    switch (e.evento) {
      case "SessionStart":
        sesion.estado = "esperando";
        sesion.actividad = "Lista para empezar";
        break;
      case "UserPromptSubmit":
        sesion.estado = "pensando";
        sesion.actividad = "Pensando…";
        break;
      case "PreToolUse":
        sesion.estado = "trabajando";
        sesion.actividad = describirHerramienta(e.herramienta, e.entrada);
        break;
      case "PostToolUse":
      case "PostToolUseFailure":
        sesion.estado = "pensando";
        sesion.actividad = "Pensando…";
        break;
      case "PermissionRequest":
        sesion.estado = "permiso";
        sesion.actividad = `Pide permiso: ${describirHerramienta(e.herramienta, e.entrada).replace(/…$/, "")}`;
        break;
      case "Notification":
        if (e.tipoNotificacion === "idle_prompt") {
          sesion.estado = "esperando";
          sesion.actividad = "Esperando tu respuesta";
        } else if (e.tipoNotificacion === "permission_prompt" && sesion.estado !== "permiso") {
          sesion.estado = "permiso";
          sesion.actividad = "Pide permiso";
        }
        break;
      case "Stop":
        sesion.estado = "lista";
        sesion.actividad = "Terminó ✓";
        reaccion = "termino";
        break;
      case "StopFailure":
        sesion.estado = "error";
        sesion.actividad = "Se detuvo por un error";
        reaccion = "fallo";
        break;
    }
    return reaccion;
  }

  /** Las sesiones para mostrar: las que trabajan y las quietas recientes, de la más activa a la menos. */
  visibles(ahora: number): SesionClaude[] {
    for (const [id, s] of this.sesiones) if (ahora - s.ultimaActividadMs > OLVIDAR_MS) this.sesiones.delete(id);
    const ocupada = (s: SesionClaude) => s.estado === "pensando" || s.estado === "trabajando" || s.estado === "permiso";
    return [...this.sesiones.values()]
      .filter((s) => ocupada(s) || ahora - s.ultimaActividadMs < QUIETA_VISIBLE_MS)
      .sort((a, b) => Number(ocupada(b)) - Number(ocupada(a)) || b.ultimaActividadMs - a.ultimaActividadMs)
      .map((s) => ({ ...s }));
  }

  /** Si alguna sesión está trabajando (Brote se pone a trabajar con ella). */
  trabajando(ahora: number): boolean {
    return this.visibles(ahora).some((s) => s.estado === "pensando" || s.estado === "trabajando");
  }
}

export function describirSesiones(sesiones: SesionClaude[]): string {
  if (sesiones.length === 0) return "⌨️ No veo sesiones de Claude Code activas (o el modo programador no está instalado: 🌱 → Configurar Brote).";
  const lineas = sesiones.map((s) => `• ${s.proyecto}: ${s.actividad}`);
  return `⌨️ Claude Code:\n${lineas.join("\n")}`;
}

/**
 * Para el servidor MCP: le pregunta algo al puente de Brote por el servidor local con token
 * (servidor-hooks.ts). Devuelve la respuesta, o `null` si Brote no está abierto o no respondió.
 * Lo que necesita permisos de macOS (música, calendario) se pide así: el MCP corre dentro de
 * OpenClaw, que no los tiene, y el puente corre dentro de Brote, que sí.
 */
export function pedirAlPuente(ruta: string, cuerpo?: object, opciones: { conexion?: string; limiteMs?: number } = {}): Promise<any | null> {
  let conexion: { puerto?: unknown; token?: unknown };
  try {
    conexion = JSON.parse(readFileSync(opciones.conexion ?? process.env.ASISTENTE_CONEXION_HOOKS ?? RUTA_CONEXION_HOOKS, "utf8"));
  } catch {
    return Promise.resolve(null);
  }
  if (!Number.isInteger(conexion.puerto) || typeof conexion.token !== "string") return Promise.resolve(null);
  return new Promise((listo) => {
    const pedido = request(
      {
        host: "127.0.0.1",
        port: conexion.puerto as number,
        path: ruta,
        method: cuerpo ? "POST" : "GET",
        headers: { authorization: `Bearer ${conexion.token}`, ...(cuerpo ? { "content-type": "application/json" } : {}) },
      },
      (respuesta) => {
        let texto = "";
        respuesta.setEncoding("utf8");
        respuesta.on("data", (parte) => (texto += parte));
        respuesta.on("end", () => {
          try {
            listo(respuesta.statusCode === 200 ? JSON.parse(texto) : null);
          } catch {
            listo(null);
          }
        });
      },
    );
    const plazo = setTimeout(() => pedido.destroy(), opciones.limiteMs ?? 2000);
    pedido.on("close", () => clearTimeout(plazo));
    pedido.on("error", () => listo(null));
    pedido.end(cuerpo ? JSON.stringify(cuerpo) : undefined);
  });
}

/** Las sesiones que ve el puente (o `null` si Brote no está abierto). */
export async function pedirSesiones(ruta?: string, limiteMs = 2000): Promise<unknown[] | null> {
  const datos = await pedirAlPuente("/sesiones", undefined, { conexion: ruta, limiteMs });
  return Array.isArray(datos?.sesiones) ? datos.sesiones : null;
}
