// Instalar y desinstalar los hooks del modo programador en la configuración de Claude Code del
// usuario (~/.claude/settings.json, o $CLAUDE_CONFIG_DIR/settings.json). Es un paso OPCIONAL de
// "Configurar Brote", con consentimiento explícito. Reglas:
//   - Nunca se tocan los hooks del usuario: solo se agregan o quitan los de Brote, que se reconocen
//     por la marca `--brote` en el comando.
//   - Antes de escribir se respalda el archivo (settings.json.brote-<fecha>.bak); quedan solo los últimos 3.
//   - Si el archivo no es JSON válido, no se toca.
// La lógica (agregar, quitar, reconocer) es pura y tiene pruebas.

import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

/** La marca que distingue los hooks de Brote de los del usuario. */
export const MARCA = "--brote";

/**
 * Los eventos que escucha Brote. Todos son asíncronos (Claude Code no los espera) salvo
 * `PermissionRequest`, que puede devolver la decisión de la isla (Claude Code ya mostró su diálogo).
 */
export const EVENTOS: { evento: string; esperar: boolean }[] = [
  { evento: "SessionStart", esperar: false },
  { evento: "UserPromptSubmit", esperar: false },
  { evento: "PreToolUse", esperar: false },
  { evento: "PostToolUse", esperar: false },
  { evento: "PermissionRequest", esperar: true },
  { evento: "Notification", esperar: false },
  { evento: "Stop", esperar: false },
  { evento: "StopFailure", esperar: false },
  { evento: "SessionEnd", esperar: false },
];

export function rutaSettings(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json");
}

/** El comando del hook: `"node" "hook.mjs" --brote`. Rechaza rutas que una shell podría interpretar. */
export function comandoHook(node: string, script: string, plataforma: string = process.platform): string {
  // Claude Code lo corre en una shell: nada que pueda expandirse o cortar las comillas.
  const prohibidos = plataforma === "win32" ? /["$`%\n]/ : /["$`\\\n]/;
  for (const ruta of [node, script]) {
    if (prohibidos.test(ruta)) throw new Error(`Ruta con caracteres no admitidos: ${ruta}`);
  }
  return `"${node}" "${script}" ${MARCA}`;
}

function esDeBrote(hook: unknown): boolean {
  const comando = (hook as { command?: unknown } | null)?.command;
  return typeof comando === "string" && comando.includes(MARCA) && /hook\.(mjs|ts)/.test(comando);
}

/** Quita los hooks de Brote; deja intacto todo lo demás (y borra los grupos que quedaron vacíos). */
export function quitarHooks(config: any): any {
  const copia = structuredClone(config ?? {});
  const hooks = copia.hooks;
  if (!hooks || typeof hooks !== "object") return copia;
  for (const [evento, grupos] of Object.entries<any>(hooks)) {
    if (!Array.isArray(grupos)) continue;
    const limpios = grupos
      .map((grupo) =>
        grupo && Array.isArray(grupo.hooks) && grupo.hooks.some(esDeBrote) ? { ...grupo, hooks: grupo.hooks.filter((h: unknown) => !esDeBrote(h)) } : grupo,
      )
      .filter((grupo) => !(grupo && Array.isArray(grupo.hooks) && grupo.hooks.length === 0));
    if (limpios.length === 0) delete hooks[evento];
    else hooks[evento] = limpios;
  }
  if (Object.keys(hooks).length === 0) delete copia.hooks;
  return copia;
}

/** Agrega los hooks de Brote (reemplazando los de una instalación anterior, nunca los del usuario). */
export function agregarHooks(config: any, comando: string): any {
  const copia = quitarHooks(config);
  if (copia.hooks !== undefined && (typeof copia.hooks !== "object" || Array.isArray(copia.hooks))) {
    throw new Error("La sección «hooks» de tu configuración de Claude Code tiene un formato que no conozco; no la toqué.");
  }
  copia.hooks ??= {};
  for (const { evento, esperar } of EVENTOS) {
    const hook = esperar ? { type: "command", command: comando, timeout: 60 } : { type: "command", command: comando, timeout: 5, async: true };
    const grupos = Array.isArray(copia.hooks[evento]) ? copia.hooks[evento] : [];
    copia.hooks[evento] = [...grupos, { hooks: [hook] }];
  }
  return copia;
}

/** Si los hooks de Brote están instalados (en todos los eventos). */
export function hooksInstalados(config: any): boolean {
  const hooks = config?.hooks;
  return EVENTOS.every(({ evento }) => Array.isArray(hooks?.[evento]) && hooks[evento].some((g: any) => Array.isArray(g?.hooks) && g.hooks.some(esDeBrote)));
}

// ---------------------------------------------------------------- archivo

/** La configuración actual (`{}` si no existe). Lanza un error si existe pero no es JSON. */
export function leerSettings(ruta = rutaSettings()): any {
  if (!existsSync(ruta)) return {};
  const texto = readFileSync(ruta, "utf8");
  try {
    const datos = texto.trim() ? JSON.parse(texto) : {};
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) throw new Error();
    return datos;
  } catch {
    throw new Error(`${ruta} no es JSON válido; no lo toqué. Revísalo y vuelve a intentar.`);
  }
}

/** Cuántos respaldos `settings.json.brote-<fecha>.bak` se conservan. */
export const RESPALDOS_A_CONSERVAR = 3;

/**
 * Borra los respaldos viejos de Brote junto a `ruta`, dejando los más recientes. Solo toca archivos con
 * exactamente la forma `<archivo>.brote-<fecha ISO>.bak`; la fecha ordena por el nombre. Nunca falla.
 */
export function podarRespaldos(ruta: string, conservar = RESPALDOS_A_CONSERVAR): void {
  try {
    const prefijo = `${basename(ruta)}.brote-`;
    const forma = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.bak$/;
    const viejos = readdirSync(dirname(ruta))
      .filter((nombre) => nombre.startsWith(prefijo) && forma.test(nombre.slice(prefijo.length)))
      .sort()
      .slice(0, -conservar);
    for (const nombre of viejos) rmSync(join(dirname(ruta), nombre), { force: true });
  } catch {
    // Podar es un favor: si falla, no debe romper la instalación.
  }
}

/** Escribe con respaldo previo y de forma atómica, conservando los permisos del archivo. */
export function escribirSettings(config: any, ruta = rutaSettings(), ahora = new Date()): string | null {
  mkdirSync(dirname(ruta), { recursive: true });
  let respaldo: string | null = null;
  let modo: number | null = null;
  if (existsSync(ruta)) {
    const fecha = ahora.toISOString().replace(/[:.]/g, "-");
    respaldo = `${ruta}.brote-${fecha}.bak`;
    copyFileSync(ruta, respaldo);
    modo = statSync(ruta).mode & 0o777;
  }
  const temporal = `${ruta}.brote-${process.pid}.tmp`;
  writeFileSync(temporal, `${JSON.stringify(config, null, 2)}\n`, { mode: modo ?? 0o600 });
  if (modo !== null) chmodSync(temporal, modo);
  renameSync(temporal, ruta);
  if (respaldo) podarRespaldos(ruta);
  return respaldo;
}
