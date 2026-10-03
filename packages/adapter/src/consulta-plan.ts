// La consulta mínima del plan de Claude: un `claude -p` con lo justo para recibir el evento
// `rate_limit_event` de Claude Code, que trae el % de la sesión de 5 h y de la semana con su hora
// exacta de reinicio. No lee credenciales: es el mismo `claude` del usuario informando sus límites.
//
// Medido en el Mac del usuario (Claude Code 2.1.283): ~585 tokens de Haiku (US$ 0,001 en valor API)
// y ~3,6 s. Sin herramientas, sin MCP, sin la configuración del usuario (así no corren sus hooks ni
// aparece en el modo programador) y sin guardar la sesión (no ensucia el conteo de tokens). Es el
// respaldo de las fuentes gratis (statusline y app de Claude): el puente decide cuándo correrla.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { leerEventoLimites, type LecturaPlan } from "@asistente/motor";

export const ARGS_CONSULTA_PLAN: readonly string[] = [
  "-p",
  "ok",
  "--model",
  "haiku",
  "--output-format",
  "stream-json",
  "--verbose",
  "--max-turns",
  "1",
  "--effort",
  "low",
  "--system-prompt",
  "Responde ok.",
  "--tools",
  "",
  "--strict-mcp-config",
  "--setting-sources",
  "",
  "--disable-slash-commands",
  "--no-session-persistence",
];

/**
 * Dónde está `claude`: el PATH, la carpeta de este Node (los `npm -g`) y las del instalador nativo.
 * (No se importa `buscarPrograma` de configurar.ts: empaquetado dentro del puente, su
 * `import.meta.main` sería verdadero y correría el script de configuración.)
 */
export function buscarClaude(entorno: NodeJS.ProcessEnv = process.env): string | null {
  const windows = process.platform === "win32";
  const carpetas = [...(entorno.PATH ?? "").split(delimiter), dirname(process.execPath), join(homedir(), ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  for (const carpeta of carpetas.filter(Boolean)) {
    const ruta = join(carpeta, windows ? "claude.exe" : "claude");
    if (existsSync(ruta)) return ruta;
  }
  return null;
}

/** Lo que tarda como mucho (ms). */
const LIMITE_MS = 45_000;

/** Sin la clave de API (usaría esa cuenta y no el plan) ni las variables de OpenClaw. */
export function entornoConsulta(entorno: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const limpio: NodeJS.ProcessEnv = {};
  for (const [clave, valor] of Object.entries(entorno)) {
    if (clave === "ANTHROPIC_API_KEY" || clave.startsWith("OPENCLAW_")) continue;
    limpio[clave] = valor;
  }
  // Abierto desde el Finder el PATH es mínimo: el `claude` de npm necesita encontrar `node`.
  limpio.PATH = [dirname(process.execPath), entorno.PATH ?? ""].filter(Boolean).join(delimiter);
  return limpio;
}

/**
 * Corre la consulta y devuelve la lectura, o `null` si no hay `claude`, falló o no trajo el evento.
 * En Windows solo se busca `claude.exe` (un `.cmd` pasaría los argumentos vacíos por cmd).
 */
export function consultarPlan(programa: string | null = buscarClaude()): Promise<LecturaPlan | null> {
  if (!programa) return Promise.resolve(null);
  return new Promise((listo) => {
    execFile(
      programa,
      [...ARGS_CONSULTA_PLAN],
      { cwd: tmpdir(), env: entornoConsulta(), timeout: LIMITE_MS, maxBuffer: 2 * 1024 * 1024, windowsHide: true, encoding: "utf8" },
      (_error, salida) => listo(leerEventoLimites(salida ?? "", Date.now())),
    );
  });
}
