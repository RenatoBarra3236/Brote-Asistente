// Dónde viven el agente y su memoria, leído de la configuración de OpenClaw para que funcione en
// cualquier computador (no solo en el de quien escribió el código). Nunca falla: sin OpenClaw
// instalado devuelve los valores por defecto.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * La carpeta de OpenClaw. Respeta sus perfiles (`OPENCLAW_PROFILE=prueba` → `~/.openclaw-prueba`),
 * que sirven para probar una instalación desde cero sin tocar la de verdad.
 */
export const CARPETA_OPENCLAW: string =
  process.env.OPENCLAW_STATE_DIR ??
  join(homedir(), process.env.OPENCLAW_PROFILE ? `.openclaw-${process.env.OPENCLAW_PROFILE}` : ".openclaw");

export const CONFIG_OPENCLAW: string = process.env.OPENCLAW_CONFIG_PATH ?? join(CARPETA_OPENCLAW, "openclaw.json");

function leerConfig(): any {
  try {
    return JSON.parse(readFileSync(CONFIG_OPENCLAW, "utf8"));
  } catch {
    return {};
  }
}

const config = leerConfig();
const entradas: Record<string, any> = config?.agents?.entries ?? {};

/** El agente del personaje: `OPENCLAW_AGENT`, o el primero configurado, o "main". */
export const AGENTE: string = process.env.OPENCLAW_AGENT ?? Object.keys(entradas)[0] ?? "main";

/** El workspace del agente, donde OpenClaw guarda su memoria (memory/, MEMORY.md, USER.md). */
export const WORKSPACE: string =
  process.env.OPENCLAW_WORKSPACE ??
  entradas[AGENTE]?.workspace ??
  config?.agents?.defaults?.workspace ??
  join(CARPETA_OPENCLAW, "workspace");

/**
 * La memoria propia de Claude Code para un proyecto: `~/.claude/projects/<ruta>/memory`, donde
 * Claude Code reemplaza por "-" todo lo que no es letra o número de la ruta del proyecto.
 */
export function memoriaDeClaudeCode(proyecto: string): string {
  return join(homedir(), ".claude", "projects", proyecto.replace(/[^A-Za-z0-9]/g, "-"), "memory");
}
