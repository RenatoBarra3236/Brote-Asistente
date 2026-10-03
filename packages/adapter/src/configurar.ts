// Asistente de primera configuración (paso 10): revisa que esté todo lo que Brote necesita y
// arregla lo que se pueda arreglar solo. Lo usa la ventana "Configurar Brote" a través de Rust:
//
//   node configurar.mjs revisar          → JSON con el estado de cada paso
//   node configurar.mjs rapido           → JSON { listo }: solo lee archivos (para decidir al iniciar)
//   node configurar.mjs aplicar <paso>   → JSON { ok, detalle }
//
// Con `OPENCLAW_PROFILE=prueba` trabaja sobre un OpenClaw aislado (~/.openclaw-prueba), para
// probar una instalación desde cero sin tocar la de verdad.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { descargarIcal, eventosDeIcal, leerCalendarioMacAhora, leerUrlIcal } from "@asistente/motor";
import { CONFIG_OPENCLAW } from "./rutas.ts";

/** La versión de OpenClaw con la que se probó Brote (ver CLAUDE.md). */
export const VERSION_OPENCLAW = "2026.9.7";
/** Sonnet rinde mucho más que Opus con los límites de una cuenta Pro. */
export const MODELO = "anthropic/claude-sonnet-5-5";
const EN_WINDOWS = process.platform === "win32";

export type Estado = "ok" | "falta" | "opcional";

/**
 * Qué se puede hacer para arreglar un paso:
 *   automatica: el script lo hace (`aplicar <paso>`)
 *   terminal:   hace falta interactuar; Rust abre una terminal con un comando de una lista cerrada
 *   enlace:     hay que instalar algo a mano desde una página oficial
 */
export type Accion =
  | { tipo: "automatica"; etiqueta: string; requiereConsentimiento?: boolean }
  | { tipo: "terminal"; etiqueta: string; terminal: "login-claude" | "memoria-local" }
  | { tipo: "enlace"; etiqueta: string; enlace: "node" | "claude-code" | "privacidad-calendarios" }
  /** La dirección iCal secreta: la ventana muestra un campo y Rust la guarda (con permisos 600). */
  | { tipo: "ical"; etiqueta: string; configurada: boolean };

export interface Paso {
  id: string;
  titulo: string;
  estado: Estado;
  detalle: string;
  accion?: Accion;
}

/** Dónde quedan los archivos que OpenClaw usa de Brote (el servidor de gastos), fuera de la app. */
const CARPETA_APP = join(homedir(), ".asistente-prototipo", "app");

/**
 * Dónde están los recursos: junto a este script si viene empaquetado en la app; en el repo si no.
 * `mcp` son los archivos del servidor de gastos que hay que copiar fuera de la app (vacío en
 * desarrollo, donde se registra el `.ts` del repo tal cual porque importa otros módulos).
 */
function recursos(): { mcp: string[]; servidor: string; skill: string; plantillas: string } {
  const aqui = dirname(fileURLToPath(import.meta.url));
  if (existsSync(join(aqui, "mcp.mjs"))) {
    return {
      // El servidor y los módulos que Vite separó en archivos comunes (se copian todos).
      mcp: ["mcp.mjs", ...readdirSync(aqui).filter((n) => n.startsWith("comun-") && n.endsWith(".mjs"))].map((n) => join(aqui, n)),
      servidor: join(CARPETA_APP, "mcp.mjs"),
      skill: join(aqui, "skill", "gastos"),
      plantillas: join(aqui, "plantillas"),
    };
  }
  const repo = join(aqui, "..", "..", "..");
  return {
    mcp: [],
    servidor: join(repo, "packages", "motor", "src", "mcp.ts"),
    skill: join(repo, "packages", "motor", "skill", "gastos"),
    plantillas: join(repo, "packages", "adapter", "plantillas"),
  };
}

/** Carpetas donde buscar programas: la de este Node (ahí quedan los `npm -g`), el PATH y las típicas. */
function carpetasDeProgramas(): string[] {
  const carpetas = [dirname(process.execPath), ...(process.env.PATH ?? "").split(delimiter)];
  if (EN_WINDOWS) carpetas.push(join(process.env.APPDATA ?? "", "npm"));
  else carpetas.push(join(homedir(), ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin");
  return [...new Set(carpetas.filter(Boolean))];
}

/** La ruta de un programa (`openclaw`, `claude`, `npm`), o `null` si no está. */
export function buscarPrograma(nombre: string): string | null {
  const variantes = EN_WINDOWS ? [`${nombre}.cmd`, `${nombre}.exe`, nombre] : [nombre];
  for (const carpeta of carpetasDeProgramas()) {
    for (const variante of variantes) {
      const ruta = join(carpeta, variante);
      if (existsSync(ruta)) return ruta;
    }
  }
  return null;
}

/**
 * Ejecuta un programa con el PATH ampliado (los scripts de npm necesitan encontrar `node`). Sin
 * `ANTHROPIC_API_KEY`: OpenClaw no la tiene, y Claude Code debe revisarse como lo verá OpenClaw (si
 * la clave viene de la configuración de Claude Code, igual se detecta).
 */
function ejecutar(programa: string, args: string[], tiempoMs = 60_000): { codigo: number; salida: string } {
  const { ANTHROPIC_API_KEY: _clave, ...entorno } = process.env;
  const resultado = spawnSync(programa, args, {
    encoding: "utf8",
    timeout: tiempoMs,
    shell: EN_WINDOWS,
    windowsHide: true,
    env: { ...entorno, PATH: carpetasDeProgramas().join(delimiter), NO_COLOR: "1" },
  });
  return { codigo: resultado.status ?? 1, salida: `${resultado.stdout ?? ""}${resultado.stderr ?? ""}` };
}

function openclaw(args: string[], tiempoMs?: number): { codigo: number; salida: string } {
  const programa = buscarPrograma("openclaw");
  if (!programa) return { codigo: 1, salida: "OpenClaw no está instalado" };
  // Con un perfil (pruebas), se pasa explícito: nunca debe tocarse la instalación de verdad por error.
  const perfil = process.env.OPENCLAW_PROFILE;
  return ejecutar(programa, perfil ? ["--profile", perfil, ...args] : args, tiempoMs);
}

function leerConfig(): any {
  try {
    return JSON.parse(readFileSync(CONFIG_OPENCLAW, "utf8"));
  } catch {
    return null;
  }
}

function agente(config: any): { id: string; workspace: string } | null {
  const entradas = Object.entries<any>(config?.agents?.entries ?? {});
  if (entradas.length === 0) return null;
  const [id, datos] = entradas[0];
  return { id, workspace: datos?.workspace ?? config?.agents?.defaults?.workspace ?? join(dirname(CONFIG_OPENCLAW), "workspace") };
}

// ---------------------------------------------------------------- revisión

export function revisar(): Paso[] {
  const pasos: Paso[] = [];
  const version = Number(process.versions.node.split(".")[0]);
  pasos.push({
    id: "node",
    titulo: "Node",
    estado: version >= 24 ? "ok" : "falta",
    detalle: `Node ${process.versions.node}${version >= 24 ? "" : ": Brote necesita Node 24 o superior"}`,
    accion: version >= 24 ? undefined : { tipo: "enlace", etiqueta: "Descargar Node", enlace: "node" },
  });

  const versionOpenclaw = openclaw(["--version"]).salida.match(/(\d{4}\.\d+\.\d+)/)?.[1];
  pasos.push({
    id: "openclaw",
    titulo: "OpenClaw",
    estado: versionOpenclaw === VERSION_OPENCLAW ? "ok" : "falta",
    detalle: !versionOpenclaw
      ? "No está instalado. Es el agente que le da cerebro a Brote."
      : versionOpenclaw === VERSION_OPENCLAW
        ? `Versión ${versionOpenclaw}`
        : `Tienes la ${versionOpenclaw}; Brote se probó con la ${VERSION_OPENCLAW}.`,
    accion:
      versionOpenclaw === VERSION_OPENCLAW
        ? undefined
        : { tipo: "automatica", etiqueta: versionOpenclaw ? `Cambiar a ${VERSION_OPENCLAW}` : "Instalar OpenClaw" },
  });

  const claude = buscarPrograma("claude");
  let sesion: any = null;
  if (claude) {
    try {
      sesion = JSON.parse(ejecutar(claude, ["auth", "status"]).salida);
    } catch {
      sesion = null;
    }
  }
  const suscripcion = String(sesion?.subscriptionType ?? "");
  const conPlan = sesion?.loggedIn === true && /pro|max|team|enterprise/i.test(suscripcion);
  pasos.push({
    id: "claude",
    titulo: "Claude Code con tu cuenta",
    estado: conPlan && !sesion?.apiKeySource ? "ok" : "falta",
    detalle: !claude
      ? "No está instalado. Brote usa Claude Code con tu suscripción Pro o Max."
      : !sesion?.loggedIn
        ? "Instalado, pero sin sesión iniciada."
        : !conPlan
          ? `Tu cuenta no tiene un plan Pro o Max (${suscripcion || "sin plan"}).`
          : sesion?.apiKeySource
            ? `Claude Code está usando una API key (${sesion.apiKeySource}) en vez de tu cuenta. Quita ANTHROPIC_API_KEY de tu configuración.`
            : `Sesión iniciada (${suscripcion}).`,
    accion: !claude
      ? { tipo: "enlace", etiqueta: "Instalar Claude Code", enlace: "claude-code" }
      : !sesion?.loggedIn
        ? { tipo: "terminal", etiqueta: "Iniciar sesión", terminal: "login-claude" }
        : undefined,
  });

  const config = leerConfig();
  const elAgente = agente(config);
  const configurado = Boolean(config?.gateway?.auth?.token && elAgente);
  pasos.push({
    id: "agente",
    titulo: "Agente de OpenClaw",
    estado: configurado ? "ok" : "falta",
    detalle: configurado
      ? `Agente «${elAgente!.id}», solo accesible desde este computador.`
      : "Falta configurar OpenClaw: un agente que use Claude Code y que solo escuche en este computador.",
    accion: configurado ? undefined : { tipo: "automatica", etiqueta: "Configurar OpenClaw", requiereConsentimiento: true },
  });

  const modelo = config?.agents?.defaults?.model?.primary;
  const conClaudeCode = config?.agents?.defaults?.models?.[MODELO]?.agentRuntime?.id === "claude-cli";
  const modeloListo = modelo === MODELO && conClaudeCode;
  pasos.push({
    id: "modelo",
    titulo: "Modelo",
    estado: modeloListo ? "ok" : "falta",
    detalle: modeloListo
      ? "Claude Sonnet 5.5 a través de Claude Code."
      : `Brote debe usar ${MODELO} con Claude Code (hoy: ${modelo ?? "ninguno"}).`,
    accion: modeloListo || !configurado ? undefined : { tipo: "automatica", etiqueta: "Usar Sonnet" },
  });

  const enMarcha = configurado && /Connectivity probe: ok/.test(openclaw(["gateway", "status"]).salida);
  pasos.push({
    id: "gateway",
    titulo: "OpenClaw en marcha",
    estado: enMarcha ? "ok" : "falta",
    detalle: enMarcha ? "Funcionando." : "El servicio de OpenClaw no está corriendo.",
    accion: enMarcha || !configurado ? undefined : { tipo: "automatica", etiqueta: "Encender" },
  });

  const identidad = elAgente ? leerTexto(join(elAgente.workspace, "IDENTITY.md")) : "";
  const esBrote = /\*\*Name:\*\*\s*Brote/.test(identidad);
  pasos.push({
    id: "identidad",
    titulo: "Brote 🌱",
    estado: esBrote ? "ok" : "falta",
    detalle: esBrote ? "El agente se llama Brote y tiene su personalidad." : "El agente todavía no es Brote (nombre y personalidad).",
    accion: esBrote || !elAgente ? undefined : { tipo: "automatica", etiqueta: "Darle su identidad" },
  });

  const politica = configurado ? openclaw(["exec-policy", "show"]).salida : "";
  const prudente = /allowlist · ask on miss/.test(politica);
  pasos.push({
    id: "permisos",
    titulo: "Permisos prudentes",
    estado: prudente ? "ok" : "falta",
    detalle: prudente
      ? "Brote te pide permiso antes de ejecutar comandos."
      : "OpenClaw podría ejecutar comandos sin preguntarte. Brote debe pedir permiso.",
    accion: prudente || !configurado ? undefined : { tipo: "automatica", etiqueta: "Pedir permiso siempre" },
  });

  const conSkill = configurado && /\bgastos\b/.test(openclaw(["skills", "list"]).salida);
  pasos.push({
    id: "skill",
    titulo: "Skill de gastos",
    estado: conSkill ? "ok" : "falta",
    detalle: conSkill ? "El agente sabe cuándo usar tus gastos." : "Falta enseñarle al agente a usar tus gastos.",
    accion: conSkill || !configurado ? undefined : { tipo: "automatica", etiqueta: "Instalar skill" },
  });

  const servidor = config?.mcp?.servers?.gastos;
  const rutaMcp = recursos().servidor;
  const conServidor = Array.isArray(servidor?.args) && servidor.args.includes(rutaMcp) && existsSync(rutaMcp);
  pasos.push({
    id: "mcp",
    titulo: "Gastos compartidos con el agente",
    estado: conServidor ? "ok" : "falta",
    detalle: conServidor
      ? "El agente lee y anota en la misma base que Brote."
      : "Falta conectar tus gastos con el agente (servidor MCP de gastos).",
    accion: conServidor || !configurado ? undefined : { tipo: "automatica", etiqueta: "Conectar" },
  });

  const busqueda = config?.memory?.search ?? {};
  const memoriaTransparente =
    JSON.stringify(busqueda.sources) === JSON.stringify(["memory"]) && busqueda.rememberAcrossConversations === false;
  pasos.push({
    id: "memoria",
    titulo: "Memoria transparente",
    estado: memoriaTransparente ? "ok" : "falta",
    detalle: memoriaTransparente
      ? "Todo lo que Brote recuerda se ve en «Lo que sé de ti»."
      : "OpenClaw también busca en transcripciones que el panel no muestra.",
    accion: memoriaTransparente || !configurado ? undefined : { tipo: "automatica", etiqueta: "Ajustar" },
  });

  const memoriaLocal = busqueda.provider === "local" && Boolean(config?.models?.providers?.["llama-cpp"]?.localService);
  pasos.push({
    id: "memoria-local",
    titulo: "Búsqueda por significado (opcional)",
    estado: memoriaLocal ? "ok" : "opcional",
    detalle: memoriaLocal
      ? "La memoria busca por significado, en tu computador y sin costo."
      : "Sin esto, Brote busca en su memoria por palabras exactas. Descarga un modelo de ~0,3 GB.",
    accion:
      memoriaLocal || !configurado ? undefined : { tipo: "terminal", etiqueta: "Configurar en la terminal", terminal: "memoria-local" },
  });
  return pasos;
}

/** Pasos opcionales de las funcionalidades para PC (calendario…), que necesitan esperar. */
export async function revisarOpcionales(): Promise<Paso[]> {
  const pasos: Paso[] = [];
  if (process.platform === "darwin") {
    const permiso = leerCalendarioMacAhora(Date.now())?.permiso ?? null;
    pasos.push({
      id: "calendario-mac",
      titulo: "Calendario del Mac (opcional)",
      estado: permiso === 3 ? "ok" : "opcional",
      detalle:
        permiso === 3
          ? "Brote ve tus eventos (iCloud, Google, Exchange… los de la app Calendario) y te avisa 10 min antes."
          : permiso === 2 || permiso === 1 || permiso === 4
            ? "Brote no tiene acceso a tus calendarios. Actívalo en Privacidad y seguridad → Calendarios → Brote (acceso completo)."
            : "Para que Brote te diga qué tienes hoy y te avise antes de cada clase. macOS te va a pedir permiso.",
      accion:
        permiso === 3
          ? undefined
          : permiso === 0 || permiso === null
            ? { tipo: "automatica", etiqueta: "Permitir acceso" }
            : { tipo: "enlace", etiqueta: "Abrir Privacidad", enlace: "privacidad-calendarios" },
    });
  }
  const url = leerUrlIcal();
  let detalle = "Pega la «dirección secreta en formato iCal» de Google Calendar (Configuración → tu calendario → Integrar el calendario). Queda solo en este computador.";
  let estado: Estado = "opcional";
  if (url) {
    const texto = await descargarIcal(url);
    const cuantos = texto ? eventosDeIcal(texto, Date.now()).length : null;
    estado = texto ? "ok" : "opcional";
    detalle = texto
      ? `Conectado: ${cuantos === 1 ? "1 evento" : `${cuantos} eventos`} entre hoy y pasado mañana.`
      : "Guardaste una dirección, pero no pude descargarla. Revisa que esté bien copiada y que tengas internet.";
  }
  pasos.push({
    id: "calendario-ical",
    titulo: "Calendario por dirección iCal (opcional)",
    estado,
    detalle,
    accion: { tipo: "ical", etiqueta: "Guardar", configurada: url !== null },
  });
  return pasos;
}

/** Lo justo para decidir al iniciar si abrir el asistente, sin ejecutar programas (es rápido). */
export function rapido(): { listo: boolean } {
  const config = leerConfig();
  const elAgente = agente(config);
  const servidor = config?.mcp?.servers?.gastos;
  return {
    listo: Boolean(
      config?.gateway?.auth?.token &&
        elAgente &&
        Array.isArray(servidor?.args) &&
        servidor.args.includes(recursos().servidor) &&
        /\*\*Name:\*\*\s*Brote/.test(leerTexto(join(elAgente.workspace, "IDENTITY.md"))),
    ),
  };
}

function leerTexto(ruta: string): string {
  try {
    return readFileSync(ruta, "utf8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------- arreglos

function exigir(resultado: { codigo: number; salida: string }, que: string): string {
  if (resultado.codigo !== 0) throw new Error(`${que}: ${resultado.salida.trim().split("\n").slice(-3).join(" ")}`);
  return resultado.salida;
}

export function aplicar(id: string): string {
  const config = leerConfig();
  const elAgente = agente(config);
  switch (id) {
    case "openclaw": {
      const npm = buscarPrograma("npm");
      if (!npm) throw new Error("No encontré npm (viene con Node)");
      exigir(
        ejecutar(npm, ["install", "-g", `openclaw@${VERSION_OPENCLAW}`, "--allow-scripts=openclaw"], 600_000),
        "No pude instalar OpenClaw",
      );
      return `OpenClaw ${VERSION_OPENCLAW} instalado.`;
    }
    case "agente":
      exigir(
        openclaw(
          [
            "onboard",
            "--non-interactive",
            "--accept-risk",
            "--mode",
            "local",
            "--flow",
            "quickstart",
            "--auth-choice",
            "anthropic-cli",
            "--gateway-bind",
            "loopback",
            "--gateway-auth",
            "token",
            "--agent-name",
            "Brote",
            "--skip-channels",
            // En pruebas (perfil aislado) se usa otro puerto y no se instala un servicio permanente.
            ...(process.env.ASISTENTE_PRUEBA_PUERTO
              ? ["--gateway-port", process.env.ASISTENTE_PRUEBA_PUERTO, "--skip-daemon"]
              : ["--install-daemon"]),
          ],
          300_000,
        ),
        "No pude configurar OpenClaw",
      );
      aplicar("modelo");
      return "OpenClaw quedó configurado con Claude Code, solo para este computador.";
    case "modelo":
      exigir(openclaw(["config", "set", "agents.defaults.model.primary", MODELO]), "No pude elegir el modelo");
      exigir(
        openclaw(["config", "set", `agents.defaults.models["${MODELO}"].agentRuntime.id`, "claude-cli"]),
        "No pude conectar el modelo con Claude Code",
      );
      return "Brote usará Claude Sonnet 5.5 con tu cuenta.";
    case "gateway": {
      const puerto = process.env.ASISTENTE_PRUEBA_PUERTO;
      if (puerto && process.env.OPENCLAW_PROFILE) {
        // En pruebas no hay servicio instalado: se lanza el Gateway del perfil aislado aparte.
        const programa = buscarPrograma("openclaw");
        if (!programa) throw new Error("OpenClaw no está instalado");
        spawn(programa, ["--profile", process.env.OPENCLAW_PROFILE, "gateway", "--port", puerto], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
          env: { ...process.env, PATH: carpetasDeProgramas().join(delimiter) },
        }).unref();
        return `OpenClaw de prueba encendido en el puerto ${puerto}.`;
      }
      exigir(openclaw(["gateway", "start"], 120_000), "No pude encender OpenClaw");
      return "OpenClaw está funcionando.";
    }
    case "identidad": {
      if (!elAgente) throw new Error("Primero hay que configurar OpenClaw");
      mkdirSync(elAgente.workspace, { recursive: true });
      for (const archivo of ["IDENTITY.md", "SOUL.md"]) {
        copyFileSync(join(recursos().plantillas, archivo), join(elAgente.workspace, archivo));
      }
      exigir(openclaw(["agents", "set-identity", "--agent", elAgente.id, "--from-identity"]), "No pude registrar la identidad");
      return "Ahora el agente es Brote 🌱";
    }
    case "permisos":
      exigir(openclaw(["exec-policy", "preset", "cautious"]), "No pude ajustar los permisos");
      return "Brote te pedirá permiso antes de ejecutar comandos.";
    case "skill":
      exigir(openclaw(["skills", "install", recursos().skill, "--as", "gastos", "--force"]), "No pude instalar la skill");
      return "Skill de gastos instalada.";
    case "mcp": {
      // Se copia fuera de la app para que la ruta registrada no cambie si la app se mueve.
      const { mcp, servidor } = recursos();
      mkdirSync(CARPETA_APP, { recursive: true });
      for (const origen of mcp) copyFileSync(origen, join(CARPETA_APP, origen.split(/[\\/]/).pop()!));
      if (config?.mcp?.servers?.gastos) openclaw(["mcp", "remove", "gastos"]);
      exigir(
        openclaw(["mcp", "add", "gastos", "--command", process.execPath, "--arg", servidor]),
        "No pude conectar el servidor de gastos",
      );
      return "Tus gastos quedaron conectados con el agente.";
    }
    case "calendario-mac": {
      const lectura = leerCalendarioMacAhora(Date.now(), true);
      if (lectura?.permiso !== 3) throw new Error("Brote no quedó con acceso al Calendario. Puedes activarlo en Privacidad y seguridad → Calendarios.");
      return "Listo: Brote ve tu calendario 📅";
    }
    case "memoria":
      exigir(openclaw(["config", "set", "memory.search.sources", '["memory"]']), "No pude ajustar la memoria");
      exigir(openclaw(["config", "set", "memory.search.rememberAcrossConversations", "false"]), "No pude ajustar la memoria");
      return "La memoria quedó limitada a lo que ves en «Lo que sé de ti».";
    default:
      throw new Error(`Paso desconocido: ${id}`);
  }
}

// ---------------------------------------------------------------- línea de comandos

/** Pasos que no tocan la configuración de OpenClaw: no hace falta reiniciarlo. */
const SIN_REINICIO = ["openclaw", "gateway", "calendario-mac"];

if (import.meta.main) {
  const [orden, paso] = process.argv.slice(2);
  let respuesta: unknown;
  try {
    if (orden === "revisar") respuesta = [...revisar(), ...(await revisarOpcionales())];
    else if (orden === "rapido") respuesta = rapido();
    else if (orden === "aplicar" && paso) {
      const detalle = aplicar(paso);
      // Los cambios de configuración necesitan reiniciar OpenClaw para aplicarse.
      if (!SIN_REINICIO.includes(paso) && leerConfig()) openclaw(["gateway", "restart"], 120_000);
      respuesta = { ok: true, detalle };
    } else respuesta = { ok: false, detalle: "Uso: configurar revisar | rapido | aplicar <paso>" };
  } catch (error) {
    respuesta = { ok: false, detalle: error instanceof Error ? error.message : String(error) };
  }
  process.stdout.write(`${JSON.stringify(respuesta)}\n`);
}
