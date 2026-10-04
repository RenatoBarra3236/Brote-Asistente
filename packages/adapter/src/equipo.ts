// El equipo de Brote en OpenClaw: los comandos para crear, configurar y borrar especialistas, para
// darle a Brote la lista de a quiénes puede delegar (`subagents.allowAgents`) y para conectar las
// cuentas de IA. Lo usan configurar.ts (Configurar Brote → Equipo y Cuentas de IA) y el puente (el
// freno por plan). No importa configurar.ts: empaquetado dentro del puente, su `import.meta.main`
// sería verdadero.
//
// Verificado en el Mac (3-10-2026, OpenClaw 2026.9.7): `agents add <id> --role researcher
// --non-interactive --json`, `config set agents.entries.<id>.model google/gemini-3.5-flash`,
// `config set agents.entries.<brote>.subagents '{"allowAgents":[…],"delegationMode":"suggest"}'
// --strict-json` ("Change will apply without restarting the gateway"), `models auth list --agent <id>`
// ("Profiles:\n- google:manual [google/api_key]") y `agents delete <id>`. Lo demás sale de la
// documentación del paquete fijado.

import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { IAS, MODELOS_PERMITIDOS, type Especialista, type IdIA } from "@asistente/motor";
import { CARPETA_OPENCLAW } from "./rutas.ts";

/** Dónde vive cada especialista: fuera del workspace de Brote, así su memoria no se mezcla con la de Brote. */
export function carpetaEspecialista(id: string, carpetaOpenclaw = CARPETA_OPENCLAW): string {
  return join(carpetaOpenclaw, "equipo", id);
}

export function argsAgregar(especialista: Especialista, workspace: string): string[] {
  return [
    "agents",
    "add",
    especialista.id,
    ...(especialista.rolOpenClaw ? ["--role", especialista.rolOpenClaw] : []),
    "--workspace",
    workspace,
    "--non-interactive",
    "--json",
  ];
}

export function argsModelo(id: string, modelo: string): string[] {
  if (!MODELOS_PERMITIDOS.includes(modelo)) throw new Error("Modelo no permitido");
  return ["config", "set", `agents.entries.${id}.model`, modelo];
}

/** Los modelos de Claude corren con Claude Code (la cuenta Pro/Max del usuario), como Brote. */
export function argsRuntimeClaude(modelo: string): string[] {
  return ["config", "set", `agents.defaults.models["${modelo}"].agentRuntime.id`, "claude-cli"];
}

export function argsIdentidad(especialista: Especialista): string[] {
  return ["agents", "set-identity", "--agent", especialista.id, "--name", especialista.nombre, "--emoji", especialista.emoji];
}

/** Sin `--force` pide confirmación y falla fuera de una terminal. Su carpeta va a la Papelera. */
export function argsBorrar(id: string): string[] {
  return ["agents", "delete", id, "--force", "--json"];
}

/**
 * A quiénes puede delegar Brote. Sin nadie, se quita `subagents` entero: con `allowAgents` vacío no
 * está claro qué haría `delegationMode` (sin la lista, OpenClaw solo deja delegar en el mismo agente).
 */
export function argsDelegacion(brote: string, permitidos: readonly string[]): string[] {
  if (permitidos.length === 0) return ["config", "unset", `agents.entries.${brote}.subagents`];
  return [
    "config",
    "set",
    `agents.entries.${brote}.subagents`,
    JSON.stringify({ allowAgents: permitidos, delegationMode: "suggest" }),
    "--strict-json",
  ];
}

/** La lista que tiene hoy Brote en openclaw.json. */
export function delegacionActual(config: any, brote: string | null): string[] {
  const lista = brote ? config?.agents?.entries?.[brote]?.subagents?.allowAgents : null;
  return Array.isArray(lista) ? lista.filter((id): id is string => typeof id === "string") : [];
}

/** La clave llega por la entrada estándar (nunca como argumento): así lo pide la documentación para automatizar. */
export function argsClave(proveedor: string, agente?: string): string[] {
  return ["models", "auth", "paste-api-key", "--provider", proveedor, ...(agente ? ["--agent", agente] : [])];
}

export function argsListaAuth(agente?: string): string[] {
  return ["models", "auth", "list", ...(agente ? ["--agent", agente] : [])];
}

export interface Perfil {
  id: string;
  proveedor: string;
  tipo: string;
}

/**
 * La salida de `openclaw models auth list`: "Profiles:\n- google:manual [google/api_key]". Nunca trae
 * la clave (lo dice la documentación). Lo que no se reconoce se ignora.
 */
export function leerPerfiles(salida: string): Perfil[] {
  const perfiles: Perfil[] = [];
  for (const linea of salida.split("\n")) {
    const m = linea.match(/^\s*-\s+([\w.-]+):([\w.@-]+)\s+\[([\w.-]+)\/([\w.-]+)\]/);
    if (m) perfiles.push({ id: `${m[1]}:${m[2]}`, proveedor: m[3], tipo: m[4] });
  }
  return perfiles;
}

/** Las cuentas de IA conectadas (sin Claude, que va por Claude Code), según los perfiles de OpenClaw. */
export function cuentasConectadas(perfiles: readonly Perfil[]): Set<IdIA> {
  const conectadas = new Set<IdIA>();
  for (const cuenta of IAS) if (cuenta.id !== "claude" && perfiles.some((p) => p.proveedor === cuenta.proveedor)) conectadas.add(cuenta.id);
  return conectadas;
}

/** Una clave de Google AI Studio: letras, números, "_" y "-", de largo razonable. */
export function claveValida(clave: string): boolean {
  return /^[A-Za-z0-9_-]{20,200}$/.test(clave);
}

/** Oculta una clave si aparece en un texto que se va a mostrar (por ejemplo, un error de la CLI). */
export function sinClave(texto: string, clave: string): string {
  return clave ? texto.split(clave).join("•••") : texto;
}

// ---------------------------------------------------------------- freno por plan

/** ~/.asistente-prototipo/equipo.json (600): si el freno por plan está puesto. Lo escribe el puente. */
export function rutaFreno(): string {
  return process.env.ASISTENTE_EQUIPO ?? join(homedir(), ".asistente-prototipo", "equipo.json");
}

export function leerFreno(ruta = rutaFreno()): boolean {
  try {
    return JSON.parse(readFileSync(ruta, "utf8"))?.frenado === true;
  } catch {
    return false;
  }
}

export function guardarFreno(frenado: boolean, ruta = rutaFreno()): void {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  const temporal = `${ruta}.${process.pid}.tmp`;
  writeFileSync(temporal, JSON.stringify({ version: 1, frenado }), { mode: 0o600 });
  chmodSync(temporal, 0o600);
  renameSync(temporal, ruta);
}

// ---------------------------------------------------------------- para el puente

/** Dónde está `openclaw`: el PATH, la carpeta de este Node (los `npm -g`) y las típicas. */
export function buscarOpenclaw(entorno: NodeJS.ProcessEnv = process.env): string | null {
  const windows = process.platform === "win32";
  const carpetas = [...(entorno.PATH ?? "").split(delimiter), dirname(process.execPath), join(homedir(), ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  for (const carpeta of carpetas.filter(Boolean)) {
    for (const nombre of windows ? ["openclaw.cmd", "openclaw.exe"] : ["openclaw"]) {
      const ruta = join(carpeta, nombre);
      if (existsSync(ruta)) return ruta;
    }
  }
  return null;
}

/** Corre `openclaw` sin esperar (el puente no se bloquea). Con el perfil, si hay uno. */
export function correrOpenclaw(args: readonly string[]): Promise<{ codigo: number; salida: string }> {
  const programa = buscarOpenclaw();
  if (!programa) return Promise.resolve({ codigo: 1, salida: "OpenClaw no está instalado" });
  const perfil = process.env.OPENCLAW_PROFILE;
  const windows = process.platform === "win32";
  return new Promise((listo) => {
    execFile(
      programa,
      [...(perfil ? ["--profile", perfil] : []), ...args].map((a) => (windows && /[\s&|<>()"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)),
      {
        timeout: 60_000,
        windowsHide: true,
        shell: windows,
        encoding: "utf8",
        env: { ...process.env, PATH: [dirname(process.execPath), process.env.PATH ?? ""].filter(Boolean).join(delimiter), NO_COLOR: "1" },
      },
      (error, stdout, stderr) => {
        const codigo = (error as { code?: unknown } | null)?.code;
        listo({ codigo: error ? (typeof codigo === "number" ? codigo : 1) : 0, salida: `${stdout ?? ""}${stderr ?? ""}` });
      },
    );
  });
}
