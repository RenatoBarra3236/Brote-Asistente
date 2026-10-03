// Asistente de primera configuración (paso 10): revisa que esté todo lo que Brote necesita y
// arregla lo que se pueda arreglar solo. Lo usa la ventana "Configurar Brote" a través de Rust:
//
//   node configurar.mjs revisar          → JSON con el estado de cada paso
//   node configurar.mjs rapido           → JSON { listo }: solo lee archivos (para decidir al iniciar)
//   node configurar.mjs aplicar <paso>   → JSON { ok, detalle }
//   node configurar.mjs conectores       → JSON { catalogo, propios }: el estado de cada conector
//   node configurar.mjs conectar <id>    → una línea JSON por fase (ver `conectar`); "cancelar" por la entrada lo corta
//   node configurar.mjs conectar-propio <nombre> <url>   igual, para un servidor MCP agregado por URL
//   node configurar.mjs conectar-token <id>              igual; el token llega en la primera línea de la entrada
//   node configurar.mjs desconectar <id> → JSON { ok, detalle }
//
// Con `OPENCLAW_PROFILE=prueba` trabaja sobre un OpenClaw aislado (~/.openclaw-prueba), para
// probar una instalación desde cero sin tocar la de verdad.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { descargarIcal, describirErrorAula, eventosDeIcal, leerAula, leerCalendarioMacAhora, leerConfigAula, leerUrlIcal, pendientes } from "@asistente/motor";
import {
  ARGS_PROBAR,
  ARGS_RECARGAR,
  argsAgregarConToken,
  argsAgregarOauth,
  argsLogin,
  argsLogout,
  argsQuitar,
  conectorDe,
  estadoConectores,
  guardadoAlAgregar,
  guardarConectados,
  herramientasPorServidor,
  leerLineaLogin,
  ocultarSecretos,
  urlDeServidor,
  validarNombre,
  validarUrlServidor,
} from "./conectores.ts";
import { agregarHooks, comandoHook, escribirSettings, hooksInstalados, leerSettings, quitarHooks, rutaSettings } from "./hooks-claude.ts";
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
  | { tipo: "automatica"; etiqueta: string; requiereConsentimiento?: boolean; textoConsentimiento?: string }
  | { tipo: "terminal"; etiqueta: string; terminal: "login-claude" | "memoria-local" }
  | { tipo: "enlace"; etiqueta: string; enlace: "node" | "claude-code" | "privacidad-calendarios" }
  /** La dirección iCal secreta: la ventana muestra un campo y Rust la guarda (con permisos 600). */
  | { tipo: "ical"; etiqueta: string; configurada: boolean }
  /** El aula (Canvas o Moodle): dirección del campus y token personal; Rust los guarda (permisos 600). */
  | { tipo: "aula"; etiqueta: string; configurada: boolean; plataforma: "canvas" | "moodle" | null };

export interface Paso {
  id: string;
  titulo: string;
  estado: Estado;
  detalle: string;
  accion?: Accion;
  /** Un segundo botón para deshacer el paso (por ejemplo, desinstalar los hooks). */
  quitar?: { paso: string; etiqueta: string };
}

/** Dónde quedan los archivos que OpenClaw usa de Brote (el servidor de gastos), fuera de la app. */
const CARPETA_APP = join(homedir(), ".asistente-prototipo", "app");

/**
 * Dónde están los recursos: junto a este script si viene empaquetado en la app; en el repo si no.
 * `mcp` son los archivos del servidor de gastos que hay que copiar fuera de la app (vacío en
 * desarrollo, donde se registra el `.ts` del repo tal cual porque importa otros módulos).
 */
function recursos(): { mcp: string[]; servidor: string; skill: string; plantillas: string; hook: { origen: string | null; destino: string } } {
  const aqui = dirname(fileURLToPath(import.meta.url));
  if (existsSync(join(aqui, "mcp.mjs"))) {
    return {
      // El servidor y los módulos que Vite separó en archivos comunes (se copian todos).
      mcp: ["mcp.mjs", ...readdirSync(aqui).filter((n) => n.startsWith("comun-") && n.endsWith(".mjs"))].map((n) => join(aqui, n)),
      servidor: join(CARPETA_APP, "mcp.mjs"),
      skill: join(aqui, "skill", "gastos"),
      plantillas: join(aqui, "plantillas"),
      hook: { origen: join(aqui, "hook.mjs"), destino: join(CARPETA_APP, "hook.mjs") },
    };
  }
  const repo = join(aqui, "..", "..", "..");
  return {
    mcp: [],
    servidor: join(repo, "packages", "motor", "src", "mcp.ts"),
    skill: join(repo, "packages", "motor", "skill", "gastos"),
    plantillas: join(repo, "packages", "adapter", "plantillas"),
    // En desarrollo se usa el .ts del repo tal cual (Node lo corre sin compilar).
    hook: { origen: null, destino: join(repo, "packages", "adapter", "src", "hook.ts") },
  };
}

/**
 * Carpetas donde buscar programas: primero el PATH (el mismo `openclaw` que el usuario usa en su
 * terminal; las pruebas ponen ahí uno falso), después la de este Node (ahí quedan los `npm -g`
 * cuando Brote se abre desde el Finder, con un PATH mínimo) y las típicas.
 */
function carpetasDeProgramas(): string[] {
  const carpetas = [...(process.env.PATH ?? "").split(delimiter), dirname(process.execPath)];
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
function ejecutar(programa: string, args: string[], tiempoMs = 60_000): { codigo: number; salida: string; stdout: string } {
  const resultado = spawnSync(programa, EN_WINDOWS ? args.map(citar) : args, {
    encoding: "utf8",
    timeout: tiempoMs,
    shell: EN_WINDOWS,
    windowsHide: true,
    env: entornoProgramas(),
  });
  // `stdout` aparte: lo que se lee como JSON (OpenClaw escribe avisos como "[state/lease] Waiting…" en stderr).
  return { codigo: resultado.status ?? 1, salida: `${resultado.stdout ?? ""}${resultado.stderr ?? ""}`, stdout: resultado.stdout ?? "" };
}

function entornoProgramas(): NodeJS.ProcessEnv {
  const { ANTHROPIC_API_KEY: _clave, ...entorno } = process.env;
  return { ...entorno, PATH: carpetasDeProgramas().join(delimiter), NO_COLOR: "1" };
}

/** En Windows los argumentos pasan por cmd: los que tienen espacios o símbolos van entre comillas. */
function citar(argumento: string): string {
  return /[\s&|<>()]/.test(argumento) ? `"${argumento}"` : argumento;
}

/** Los argumentos para OpenClaw, con el perfil si hay uno. */
function conPerfil(args: readonly string[]): string[] {
  // Con un perfil (pruebas), se pasa explícito: nunca debe tocarse la instalación de verdad por error.
  const perfil = process.env.OPENCLAW_PROFILE;
  return perfil ? ["--profile", perfil, ...args] : [...args];
}

function openclaw(args: readonly string[], tiempoMs?: number): { codigo: number; salida: string; stdout: string } {
  const programa = buscarPrograma("openclaw");
  if (!programa) return { codigo: 1, salida: "OpenClaw no está instalado", stdout: "" };
  return ejecutar(programa, conPerfil(args), tiempoMs);
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
      sesion = JSON.parse(ejecutar(claude, ["auth", "status"]).stdout);
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
  const conServidor = Array.isArray(servidor?.args) && servidor.args.includes(rutaMcp) && existsSync(rutaMcp) && mcpAlDia();
  pasos.push({
    id: "mcp",
    titulo: "Gastos compartidos con el agente",
    estado: conServidor ? "ok" : "falta",
    detalle: conServidor
      ? "El agente lee y anota en la misma base que Brote."
      : existsSync(rutaMcp) && !mcpAlDia()
        ? "Brote se actualizó: hay que pasarle al agente las herramientas nuevas (descargas, música, calendario…)."
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
  let settings: any = null;
  let errorSettings: string | null = null;
  try {
    settings = leerSettings();
  } catch (error) {
    errorSettings = (error as Error).message;
  }
  const conHooks = settings !== null && hooksInstalados(settings);
  pasos.push({
    id: "programador",
    titulo: "Modo programador (opcional)",
    estado: conHooks ? "ok" : "opcional",
    detalle: errorSettings
      ? errorSettings
      : conHooks
        ? "Brote muestra tus sesiones de Claude Code en vivo y te deja responder sus permisos desde la isla."
        : "Si programas con Claude Code, Brote muestra en la isla qué está haciendo cada sesión (\"Editando lib.rs…\"), celebra cuando termina y te deja responder sus permisos.",
    accion:
      conHooks || errorSettings
        ? undefined
        : {
            tipo: "automatica",
            etiqueta: "Instalar",
            requiereConsentimiento: true,
            textoConsentimiento:
              ` Acepto que Brote agregue sus hooks a mi configuración de Claude Code (${rutaSettings()}). Se respalda el archivo, ` +
              "no se tocan mis otros hooks, no se leen mis credenciales ni el texto de mis mensajes, y puedo desinstalarlo cuando quiera.",
          },
    quitar: conHooks ? { paso: "programador-quitar", etiqueta: "Desinstalar" } : undefined,
  });

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

  // El aula: se prueba el token al revisar (nunca se muestra ni se registra).
  const aula = leerConfigAula();
  let detalleAula =
    "Brote te muestra tu próxima entrega y te avisa 24 h y 2 h antes. Pega la dirección de tu campus y un token personal " +
    "(nunca tu contraseña). Solo lectura: Brote no puede entregar nada ni ver tus notas.";
  let estadoAula: Estado = "opcional";
  if (aula) {
    const lectura = await leerAula(aula, Date.now());
    if ("entregas" in lectura) {
      const cuantas = pendientes(lectura.entregas, Date.now()).length;
      estadoAula = "ok";
      detalleAula = `Conectado a ${aula.tipo === "canvas" ? "Canvas" : "Moodle"} (${new URL(aula.url).host}): ${cuantas === 1 ? "1 entrega pendiente" : `${cuantas} entregas pendientes`}.`;
    } else detalleAula = describirErrorAula(lectura.error);
  }
  pasos.push({
    id: "aula",
    titulo: "Aula: Canvas o Moodle (opcional)",
    estado: estadoAula,
    detalle: detalleAula,
    accion: { tipo: "aula", etiqueta: "Guardar", configurada: aula !== null, plataforma: aula?.tipo ?? null },
  });
  return pasos;
}

/**
 * Si la copia del servidor MCP fuera de la app es la de esta versión de Brote (al actualizar la app,
 * la copia vieja no tendría las herramientas nuevas). En desarrollo no hay copia: siempre al día.
 */
function mcpAlDia(): boolean {
  return recursos().mcp.every((origen) => {
    try {
      return readFileSync(origen).equals(readFileSync(join(CARPETA_APP, origen.split(/[\\/]/).pop()!)));
    } catch {
      return false;
    }
  });
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
    case "programador": {
      const { hook } = recursos();
      if (hook.origen) {
        mkdirSync(CARPETA_APP, { recursive: true });
        copyFileSync(hook.origen, hook.destino);
      }
      const respaldo = escribirSettings(agregarHooks(leerSettings(), comandoHook(process.execPath, hook.destino)));
      return `Modo programador instalado. ${respaldo ? `Respaldé tu configuración en ${respaldo}. ` : ""}Las sesiones nuevas de Claude Code ya aparecen en la isla.`;
    }
    case "programador-quitar": {
      const actual = leerSettings();
      if (!hooksInstalados(actual) && JSON.stringify(quitarHooks(actual)) === JSON.stringify(actual)) return "El modo programador no estaba instalado.";
      const respaldo = escribirSettings(quitarHooks(actual));
      return `Desinstalé los hooks de Brote; tus otros hooks quedaron igual.${respaldo ? ` Respaldo: ${respaldo}` : ""}`;
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

// ---------------------------------------------------------------- conectores

/** El estado de cada conector (y deja al día ~/.asistente-prototipo/conectores.json para el puente). */
export function conectores(): ReturnType<typeof estadoConectores> {
  const config = leerConfig();
  const enConfig = Object.keys(config?.mcp?.servers ?? {}).some((n) => urlDeServidor(config.mcp.servers[n]) !== null);
  // El probe se conecta a cada servidor: solo vale la pena si hay alguno por URL.
  const probe = enConfig ? openclaw(ARGS_PROBAR, 90_000) : null;
  const estado = estadoConectores(config, probe && probe.codigo === 0 ? herramientasPorServidor(probe.stdout) : null);
  guardarLista(estado);
  return estado;
}

function guardarLista(estado: ReturnType<typeof estadoConectores>): void {
  try {
    mkdirSync(join(homedir(), ".asistente-prototipo"), { recursive: true, mode: 0o700 });
    guardarConectados(estado.catalogo.filter((c) => c.estado === "conectado").map((c) => c.id));
  } catch {
    // Sin la lista, el puente pregunta por todo: es lo seguro.
  }
}

/** Una línea JSON con la fase de una conexión (la lee Rust y la pasa a la ventana). */
function fase(datos: { fase: "agregando" | "autorizar" | "esperando" | "listo" | "error" | "cancelado"; url?: string; detalle?: string }): void {
  process.stdout.write(`${JSON.stringify(datos)}\n`);
}

/** La primera línea de la entrada (el token) y, después, si llega "cancelar" o se cierra. */
function escucharEntrada(): { primera: Promise<string>; cancelado: Promise<void> } {
  const lineas = createInterface({ input: process.stdin });
  let darPrimera: (texto: string) => void = () => {};
  let darCancelado: () => void = () => {};
  const primera = new Promise<string>((listo) => (darPrimera = listo));
  const cancelado = new Promise<void>((listo) => (darCancelado = listo));
  let leida = false;
  lineas.on("line", (linea) => {
    if (!leida) {
      leida = true;
      darPrimera(linea.trim());
      if (linea.trim() !== "cancelar") return;
    }
    if (linea.trim() === "cancelar") darCancelado();
  });
  lineas.on("close", () => {
    darPrimera("");
    darCancelado();
  });
  return { primera, cancelado };
}

/** Recarga los servidores MCP de OpenClaw y cuenta las herramientas del recién conectado. */
function terminarConexion(nombre: string, titulo: string): string {
  openclaw(ARGS_RECARGAR, 60_000);
  const probe = openclaw(ARGS_PROBAR, 90_000);
  const cuantas = probe.codigo === 0 ? (herramientasPorServidor(probe.stdout)?.get(nombre) ?? 0) : 0;
  guardarLista(estadoConectores(leerConfig(), probe.codigo === 0 ? herramientasPorServidor(probe.stdout) : null));
  const herramientas = cuantas > 0 ? ` (${cuantas} herramientas)` : "";
  return `${titulo} quedó conectado${herramientas}. El agente lo usará desde su próximo mensaje.`;
}

/**
 * Agrega el servidor (si hace falta) y abre el inicio de sesión OAuth. Fases por la salida:
 *   { fase: "agregando" } → { fase: "autorizar", url } → { fase: "esperando" } → { fase: "listo", detalle }
 * o { fase: "error", detalle } / { fase: "cancelado" }. "cancelar" por la entrada (o cerrarla) mata el login.
 */
async function conectarOauth(nombre: string, url: string, titulo: string, cancelado: Promise<void>): Promise<void> {
  const programa = buscarPrograma("openclaw");
  if (!programa) return fase({ fase: "error", detalle: "OpenClaw no está instalado." });
  fase({ fase: "agregando" });
  const actual = urlDeServidor(leerConfig()?.mcp?.servers?.[nombre]);
  if (actual !== null && actual !== url && actual.replace(/\/$/, "") !== url.replace(/\/$/, "")) openclaw(argsQuitar(nombre));
  if (actual === null || actual.replace(/\/$/, "") !== url.replace(/\/$/, "")) {
    const agregado = openclaw(argsAgregarOauth(nombre, url));
    if (agregado.codigo !== 0 || !guardadoAlAgregar(agregado.salida, nombre)) {
      return fase({ fase: "error", detalle: `No pude agregar ${titulo}: ${ocultarSecretos(ultimas(agregado.salida))}` });
    }
  }
  const login = spawn(programa, conPerfil(argsLogin(nombre)), {
    stdio: ["ignore", "pipe", "pipe"],
    shell: EN_WINDOWS,
    windowsHide: true,
    env: entornoProgramas(),
  });
  let listo = false;
  let ultimasLineas: string[] = [];
  const leer = (flujo: NodeJS.ReadableStream) =>
    createInterface({ input: flujo }).on("line", (linea) => {
      ultimasLineas = [...ultimasLineas, linea].slice(-3);
      const leida = leerLineaLogin(linea);
      if (leida.tipo === "autorizar") fase({ fase: "autorizar", url: leida.url });
      else if (leida.tipo === "esperando") fase({ fase: "esperando" });
      else if (leida.tipo === "listo") listo = true;
    });
  leer(login.stdout);
  leer(login.stderr);
  const plazo = setTimeout(() => login.kill(), 10 * 60_000);
  let cancelo = false;
  void cancelado.then(() => {
    cancelo = true;
    login.kill();
  });
  const codigo = await new Promise<number | null>((fin) => login.on("close", fin));
  clearTimeout(plazo);
  if (cancelo && !listo) return fase({ fase: "cancelado" });
  if (!listo || codigo !== 0) {
    return fase({ fase: "error", detalle: `No se completó la autorización de ${titulo}. ${ocultarSecretos(ultimasLineas.join(" "))}`.trim() });
  }
  fase({ fase: "listo", detalle: terminarConexion(nombre, titulo) });
}

/** GitHub y otros sin OAuth dinámico: el token va en la cabecera. Nunca se muestra ni se registra. */
function conectarConToken(nombre: string, url: string, titulo: string, token: string): void {
  fase({ fase: "agregando" });
  let args: string[];
  try {
    args = argsAgregarConToken(nombre, url, token);
  } catch (error) {
    return fase({ fase: "error", detalle: (error as Error).message });
  }
  if (urlDeServidor(leerConfig()?.mcp?.servers?.[nombre]) !== null) openclaw(argsQuitar(nombre));
  const agregado = openclaw(args);
  if (agregado.codigo !== 0 || !guardadoAlAgregar(agregado.salida, nombre)) {
    return fase({ fase: "error", detalle: `No pude agregar ${titulo}: ${ocultarSecretos(ultimas(agregado.salida), [token])}` });
  }
  const detalle = terminarConexion(nombre, titulo);
  if (!/\(\d+ herramientas\)/.test(detalle)) {
    return fase({ fase: "error", detalle: `${titulo} quedó guardado, pero no respondió: revisa que el token sea válido y no haya vencido.` });
  }
  fase({ fase: "listo", detalle });
}

/** Cierra la sesión (si era OAuth) y quita el servidor de la configuración de OpenClaw. */
export function desconectar(nombre: string): string {
  const config = leerConfig();
  if (urlDeServidor(config?.mcp?.servers?.[nombre]) === null) throw new Error("Ese conector no estaba conectado.");
  // Logout borra las credenciales OAuth que guardó OpenClaw (nunca las leemos); con token no aplica.
  openclaw(argsLogout(nombre));
  exigir(openclaw(argsQuitar(nombre)), "No pude quitar el conector");
  openclaw(ARGS_RECARGAR, 60_000);
  guardarLista(estadoConectores(leerConfig(), null));
  return `${conectorDe(nombre)?.nombre ?? nombre} quedó desconectado.`;
}

function ultimas(salida: string): string {
  return salida.trim().split("\n").slice(-3).join(" ");
}

/** Valida el pedido de conexión y lo lanza. Siempre termina con una fase final. */
async function ordenConectar(orden: string, args: string[]): Promise<void> {
  const entrada = escucharEntrada();
  if (orden === "conectar" || orden === "conectar-token") {
    const conector = conectorDe(args[0] ?? "");
    if (!conector) return fase({ fase: "error", detalle: "Conector desconocido." });
    if (orden === "conectar") {
      if (conector.auth !== "oauth") return fase({ fase: "error", detalle: `${conector.nombre} se conecta con un token.` });
      return conectarOauth(conector.id, conector.url, conector.nombre, entrada.cancelado);
    }
    if (conector.auth !== "token") return fase({ fase: "error", detalle: `${conector.nombre} se conecta con OAuth.` });
    return conectarConToken(conector.id, conector.url, conector.nombre, await entrada.primera);
  }
  // Conector propio: nombre nuevo y URL https. Nunca queda nada permitido sin preguntar.
  const [nombre = "", texto = ""] = args;
  const existentes = Object.keys(leerConfig()?.mcp?.servers ?? {});
  const error = validarNombre(nombre, existentes);
  if (error) return fase({ fase: "error", detalle: error });
  const url = validarUrlServidor(texto);
  if (!url) return fase({ fase: "error", detalle: "La dirección debe empezar con https:// y no tener espacios ni símbolos raros." });
  return conectarOauth(nombre, url, nombre, entrada.cancelado);
}

// ---------------------------------------------------------------- línea de comandos

/** Pasos que no tocan la configuración de OpenClaw: no hace falta reiniciarlo. */
const SIN_REINICIO = ["openclaw", "gateway", "calendario-mac", "programador", "programador-quitar"];

if (import.meta.main) {
  const [orden, paso, ...resto] = process.argv.slice(2);
  let respuesta: unknown;
  if (orden === "conectar" || orden === "conectar-token" || orden === "conectar-propio") {
    await ordenConectar(orden, [paso, ...resto].filter((a): a is string => typeof a === "string"));
    process.exit(0);
  }
  try {
    if (orden === "conectores") respuesta = conectores();
    else if (orden === "desconectar" && paso) respuesta = { ok: true, detalle: desconectar(paso) };
    else if (orden === "revisar") respuesta = [...revisar(), ...(await revisarOpcionales())];
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
