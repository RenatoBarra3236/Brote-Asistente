// Brote usa el plan de Claude Code del usuario, no una clave de API (ver sin-clave.ts: evita heredarla de la
// terminal). Esto cubre lo otro: que alguien la deje puesta a propósito en un lugar que Brote no controla.
// Solo se miran NOMBRES de variables, nunca sus valores, y nunca credenciales.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { leerSettings } from "./hooks-claude.ts";
import { CONFIG_OPENCLAW } from "./rutas.ts";

const VARIABLE = "ANTHROPIC_API_KEY";

export type FuenteClave = "settings-claude" | "config-openclaw" | "servicio-gateway";

export const DESCRIPCION_FUENTE: Record<FuenteClave, string> = {
  "settings-claude": "el `env` de ~/.claude/settings.json",
  "config-openclaw": "la configuración de OpenClaw",
  "servicio-gateway": "el servicio del Gateway (launchd)",
};

/** ¿Algún objeto anidado tiene una clave llamada ANTHROPIC_API_KEY? (solo el nombre, no el valor) */
export function tieneNombreDeClave(valor: unknown, profundidad = 0): boolean {
  if (profundidad > 12 || valor === null || typeof valor !== "object") return false;
  for (const [nombre, hijo] of Object.entries(valor as Record<string, unknown>)) {
    if (nombre === VARIABLE) return true;
    if (tieneNombreDeClave(hijo, profundidad + 1)) return true;
  }
  return false;
}

/** ¿El plist menciona la variable como clave? (solo busca el nombre) */
export function plistTieneClave(plist: string): boolean {
  return plist.includes(`<key>${VARIABLE}</key>`);
}

export function rutaPlistGateway(): string {
  return join(homedir(), "Library", "LaunchAgents", "ai.openclaw.gateway.plist");
}

function leerTexto(ruta: string): string | null {
  try {
    return existsSync(ruta) ? readFileSync(ruta, "utf8") : null;
  } catch {
    return null;
  }
}

/** Dónde quedó configurada una clave de API de Claude a propósito. Nunca lanza. */
export function fuentesDeClaveApi(
  leer = {
    settings: (): unknown => leerSettings(),
    openclaw: (): unknown => {
      const t = leerTexto(CONFIG_OPENCLAW);
      return t ? JSON.parse(t) : null;
    },
    plist: (): string | null => (process.platform === "darwin" ? leerTexto(rutaPlistGateway()) : null),
  },
): FuenteClave[] {
  const fuentes: FuenteClave[] = [];
  try {
    const env = (leer.settings() as { env?: unknown } | null)?.env;
    if (env && typeof env === "object" && VARIABLE in (env as object)) fuentes.push("settings-claude");
  } catch {
    // archivo ilegible: no se sabe, no se avisa
  }
  try {
    if (tieneNombreDeClave(leer.openclaw())) fuentes.push("config-openclaw");
  } catch {
    // idem
  }
  try {
    const plist = leer.plist();
    if (plist && plistTieneClave(plist)) fuentes.push("servicio-gateway");
  } catch {
    // idem
  }
  return fuentes;
}

/** El texto del aviso, sin valores. Vacío si no hay nada que avisar. */
export function avisoClaveApi(fuentes: FuenteClave[], apiKeySource?: string): string | null {
  if (fuentes.length === 0 && !apiKeySource) return null;
  const donde = fuentes.length > 0 ? ` Está en ${fuentes.map((f) => DESCRIPCION_FUENTE[f]).join(" y en ")}.` : "";
  const origen = apiKeySource ? ` (Claude Code dice que viene de ${apiKeySource})` : "";
  return `Brote quedó usando una clave de API de Claude${origen} en vez de tu plan Pro o Max: gastaría saldo de la API.${donde} Quítala de ahí (la clave sirve para programar, déjala solo en tu terminal).`;
}
