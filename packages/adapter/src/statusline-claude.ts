// Instalar y desinstalar la statusline de Brote en la configuración de Claude Code del usuario
// (~/.claude/settings.json, o $CLAUDE_CONFIG_DIR/settings.json). Es un subpaso OPCIONAL de la
// función "Uso del plan" en Configurar Brote, con consentimiento explícito. Reglas (las mismas de los
// hooks del modo programador, hooks-claude.ts, de donde se reusan la lectura y la escritura):
//   - Respaldo de settings.json antes de escribir y escritura atómica; si no es JSON válido, no se toca.
//   - Si el usuario ya tenía una statusline, no se pisa: se guarda tal cual en
//     ~/.asistente-prototipo/statusline-original.json (600) y la de Brote la corre y muestra su salida.
//     Al desinstalar vuelve exactamente la que había (o ninguna, si no había).
//   - La de Brote se reconoce por la marca `--brote` y el nombre del script.
// La lógica (instalar, quitar, reconocer) es pura y tiene pruebas.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { escribirPrivado } from "@asistente/motor";
import { MARCA } from "./hooks-claude.ts";

export const RUTA_ORIGINAL = join(homedir(), ".asistente-prototipo", "statusline-original.json");

/** Si una statusLine de settings.json es la de Brote. */
export function esStatuslineDeBrote(statusLine: unknown): boolean {
  const comando = (statusLine as { command?: unknown } | null)?.command;
  return typeof comando === "string" && comando.includes(MARCA) && /statusline\.(mjs|ts)/.test(comando);
}

export function statuslineInstalada(config: any): boolean {
  return esStatuslineDeBrote(config?.statusLine);
}

/**
 * Pone la statusline de Brote. Devuelve la configuración nueva y la statusline original que hay que
 * guardar (`null`: no había ninguna). Si la de Brote ya estaba, se conserva la original guardada antes.
 * La de Brote hereda los demás campos de la original (padding, refreshInterval…), para que se vea igual.
 */
export function instalarStatusline(config: any, comando: string, originalGuardada: unknown = null): { config: any; original: unknown } {
  const copia = structuredClone(config ?? {});
  const actual = copia.statusLine;
  const original = actual === undefined ? null : esStatuslineDeBrote(actual) ? originalGuardada : actual;
  const base = original && typeof original === "object" && !Array.isArray(original) ? original : { padding: 0 };
  // Asignar sobre la clave que ya existe la deja en su lugar: al desinstalar queda donde estaba.
  copia.statusLine = { ...base, type: "command", command: comando };
  return { config: copia, original: original ?? null };
}

/**
 * Quita la statusline de Brote y deja la original (o ninguna). Si la statusline actual no es la de
 * Brote (el usuario la cambió después), no se toca.
 */
export function quitarStatusline(config: any, original: unknown = null): any {
  const copia = structuredClone(config ?? {});
  if (!esStatuslineDeBrote(copia.statusLine)) return copia;
  if (original === null || original === undefined) delete copia.statusLine;
  else copia.statusLine = structuredClone(original);
  return copia;
}

// ---------------------------------------------------------------- archivo de la original

/** La statusline original guardada (`null` si no había o no existe el archivo). */
export function leerOriginalGuardada(ruta = RUTA_ORIGINAL): unknown {
  try {
    return JSON.parse(readFileSync(ruta, "utf8"))?.statusLine ?? null;
  } catch {
    return null;
  }
}

export function guardarOriginal(original: unknown, ruta = RUTA_ORIGINAL): void {
  escribirPrivado(ruta, `${JSON.stringify({ statusLine: original ?? null }, null, 2)}\n`);
}

export function borrarOriginal(ruta = RUTA_ORIGINAL): void {
  if (existsSync(ruta)) rmSync(ruta, { force: true });
}
