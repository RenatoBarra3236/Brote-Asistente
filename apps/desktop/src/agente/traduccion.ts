// Traduce los eventos crudos del Gateway a sucesos de la conversación. Parte de
// `estadoDesde` del spike (packages/adapter/src/spike.ts) y de lo observado en el paso 3
// (docs/referencias-tecnicas.md). No decide estados: eso lo hace `conversacion.ts`.

import type { Decision, Marco } from "./transporte.ts";

export interface Aprobacion {
  id: string;
  /** Sale de `presentation.kind`; `approval.resolve` lo pide de vuelta. */
  kind: string;
  /** Pregunta legible, por ejemplo "¿Ejecuto este comando?". */
  titulo: string;
  /** Lo que se va a hacer, por ejemplo el comando o la ruta del archivo. */
  detalle: string;
  decisiones: Decision[];
}

export type Suceso =
  | { tipo: "mensaje-usuario"; texto: string }
  | { tipo: "inicio"; runId: string | null }
  | { tipo: "pensando" }
  | { tipo: "texto"; delta?: string; texto?: string }
  | { tipo: "herramienta-inicio"; id: string; nombre: string; etiqueta: string }
  | { tipo: "herramienta-fin"; id: string; error: boolean }
  | { tipo: "aprobacion"; aprobacion: Aprobacion }
  | { tipo: "aprobacion-fin"; id: string; resultado: string }
  | { tipo: "fin"; texto?: string }
  | { tipo: "detenido" }
  | { tipo: "error"; mensaje: string };

const DECISIONES: readonly Decision[] = ["allow-once", "allow-always", "deny"];
const MENSAJE_ERROR = "Algo falló al responder.";

/** Un evento del Gateway → un suceso, o `null` si no cambia nada (eventos `chat`, `tick`, etc.). */
export function traducir(marco: Marco): Suceso | null {
  const payload = marco.payload;
  switch (marco.event) {
    case "agent":
      return desdeAgente(payload);
    case "session.approval":
      return desdeAprobacion(payload);
    case "session.message": {
      // Las respuestas del agente ya llegan por `agent`; aquí solo interesa el mensaje del
      // usuario, que puede venir de este personaje o de otro dispositivo (el celular).
      const mensaje = payload?.message;
      if (mensaje?.role !== "user") return null;
      const texto = textoDeContenido(mensaje.content);
      return texto ? { tipo: "mensaje-usuario", texto } : null;
    }
    case "chat": {
      // `chat` repite el flujo del agente resumido; solo interesa su cierre. Los comandos de
      // OpenClaw (por ejemplo "/new") responden únicamente con este `final`, sin eventos `agent`:
      // sin esto la isla se quedaría en "pensando".
      // Si el turno falla o se cancela, también llega solo por aquí (por ejemplo, un 401 del modelo).
      if (payload?.state === "error") return { tipo: "error", mensaje: mensajeDeError({ message: payload.errorMessage }) };
      if (payload?.state === "aborted") return { tipo: "detenido" };
      if (payload?.state !== "final") return null;
      const texto = textoDeContenido(payload.message?.content);
      return texto ? { tipo: "fin", texto } : { tipo: "fin" };
    }
    default:
      // `sessions.changed`, `tick`, etc. no cambian nada.
      return null;
  }
}

function desdeAgente(payload: any): Suceso | null {
  const data = payload?.data ?? {};
  const fase = String(data.phase ?? "");
  switch (payload?.stream) {
    case "lifecycle":
      if (fase === "start") return { tipo: "inicio", runId: typeof payload.runId === "string" ? payload.runId : null };
      if (fase === "end") {
        const texto = data.terminalReply?.text;
        return typeof texto === "string" ? { tipo: "fin", texto } : { tipo: "fin" };
      }
      if (/error|fail|abort/i.test(fase)) return { tipo: "error", mensaje: mensajeDeError(data) };
      return null;
    case "run_status":
    case "thinking":
      return { tipo: "pensando" };
    case "assistant": {
      const suceso: Extract<Suceso, { tipo: "texto" }> = { tipo: "texto" };
      if (typeof data.delta === "string") suceso.delta = data.delta;
      if (typeof data.text === "string") suceso.texto = data.text;
      return suceso.delta === undefined && suceso.texto === undefined ? null : suceso;
    }
    case "item":
      // `item` trae un título legible; `tool` trae los argumentos. Ambos marcan inicio y fin.
      if (data.kind !== "tool") return null;
      if (fase === "start") {
        const nombre = String(data.name ?? "herramienta");
        return {
          tipo: "herramienta-inicio",
          id: idHerramienta(data),
          nombre,
          etiqueta: etiquetaConector(data.conector) ?? etiquetaHerramienta(nombre, undefined, data.meta),
        };
      }
      if (fase === "end") return { tipo: "herramienta-fin", id: idHerramienta(data), error: data.status === "failed" };
      return null;
    case "tool":
      if (fase === "start") {
        const nombre = String(data.name ?? "herramienta");
        return {
          tipo: "herramienta-inicio",
          id: idHerramienta(data),
          nombre,
          etiqueta: etiquetaConector(data.conector) ?? etiquetaHerramienta(nombre, data.args),
        };
      }
      if (fase === "result") return { tipo: "herramienta-fin", id: idHerramienta(data), error: data.isError === true };
      return null;
    case "error":
      return { tipo: "error", mensaje: mensajeDeError(data) };
    default:
      return null;
  }
}

function desdeAprobacion(payload: any): Suceso | null {
  const aprobacion = payload?.approval;
  if (typeof aprobacion?.id !== "string") return null;
  if (payload.phase === "pending") {
    const presentacion = aprobacion.presentation ?? {};
    const { titulo, detalle } = describirAprobacion(presentacion);
    const permitidas: unknown[] = Array.isArray(presentacion.allowedDecisions) ? presentacion.allowedDecisions : [];
    const decisiones = DECISIONES.filter((d) => permitidas.includes(d));
    return {
      tipo: "aprobacion",
      aprobacion: {
        id: aprobacion.id,
        kind: String(presentacion.kind ?? "exec"),
        titulo,
        detalle,
        decisiones: decisiones.length > 0 ? decisiones : ["allow-once", "deny"],
      },
    };
  }
  if (payload.phase === "terminal") {
    return { tipo: "aprobacion-fin", id: aprobacion.id, resultado: String(aprobacion.status ?? "") };
  }
  return null;
}

/** Texto corto para la burbuja mientras corre una herramienta, por ejemplo "Leyendo USER.md…". */
export function etiquetaHerramienta(nombre: string, args?: any, meta?: unknown): string {
  // Sin argumentos (evento `item`), `meta` trae lo esencial: "from ~/ruta" o el comando.
  const resto = typeof meta === "string" ? meta.replace(/^from\s+/, "").trim() : "";
  const ruta = String(args?.file_path ?? args?.notebook_path ?? args?.path ?? resto);
  switch (nombre) {
    case "Read":
      return ruta ? `Leyendo ${nombreArchivo(ruta)}…` : "Leyendo un archivo…";
    case "Write":
      return ruta ? `Escribiendo ${nombreArchivo(ruta)}…` : "Escribiendo un archivo…";
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return ruta ? `Editando ${nombreArchivo(ruta)}…` : "Editando un archivo…";
    case "Bash": {
      const comando = String(args?.command ?? resto).trim();
      return comando ? `Ejecutando \`${recortar(comando, 40)}\`…` : "Ejecutando un comando…";
    }
    case "Grep": {
      const patron = args?.pattern;
      return typeof patron === "string" ? `Buscando «${recortar(patron, 30)}»…` : "Buscando en archivos…";
    }
    case "Glob":
      return "Buscando archivos…";
    case "WebFetch": {
      const sitio = dominio(args?.url ?? resto);
      return sitio ? `Abriendo ${sitio}…` : "Abriendo una página…";
    }
    case "WebSearch": {
      const consulta = args?.query;
      return typeof consulta === "string" ? `Buscando «${recortar(consulta, 30)}» en la web…` : "Buscando en la web…";
    }
    case "Task":
    case "Agent":
      return "Delegando una tarea…";
    case "TodoWrite":
      return "Ordenando las tareas…";
    default:
      return `Usando ${nombre}…`;
  }
}

/** Un conector (Todoist, Notion…) con el nombre que le pone el puente: "Todoist · Buscar tareas". */
interface Conector {
  servicio: string;
  accion: string;
  propio?: boolean;
}

function esConector(valor: any): valor is Conector {
  return typeof valor?.servicio === "string" && typeof valor?.accion === "string";
}

function etiquetaConector(conector: unknown): string | null {
  return esConector(conector) ? `${conector.servicio} · ${conector.accion}…` : null;
}

/** Los argumentos de una herramienta de un conector, cortos: "content: Comprar pan · dueString: mañana". */
function resumirArgumentos(args: any, crudo: string): string {
  if (!args || typeof args !== "object" || Array.isArray(args)) return recortar(crudo, 200);
  const partes = Object.entries(args)
    .filter(([, valor]) => valor !== null && valor !== undefined && valor !== "")
    .map(([clave, valor]) => `${clave}: ${typeof valor === "string" ? valor : JSON.stringify(valor)}`);
  return recortar(partes.join(" · "), 200);
}

/** Pregunta y detalle legibles a partir de `approval.presentation`. */
export function describirAprobacion(presentacion: any): { titulo: string; detalle: string } {
  // El título original es del estilo "claude-cli native tool: Bash".
  const titulo = String(presentacion?.title ?? "");
  const herramienta = String(presentacion?.toolName ?? titulo.split(":").pop() ?? "").trim();
  const crudo = String(presentacion?.detail ?? presentacion?.description ?? "");
  let args: any = null;
  try {
    args = JSON.parse(crudo);
  } catch {
    // El detalle no siempre es JSON: se muestra tal cual.
  }
  const ruta = args?.file_path ?? args?.notebook_path;
  if (esConector(presentacion?.conector)) {
    const { servicio, accion, propio } = presentacion.conector;
    return { titulo: `${servicio} · ${accion}${propio ? " (servicio agregado por ti)" : ""}`, detalle: resumirArgumentos(args, crudo) };
  }
  switch (herramienta) {
    case "Bash":
      return { titulo: "¿Ejecuto este comando?", detalle: recortar(String(args?.command ?? crudo), 200) };
    case "Read":
      return { titulo: "¿Leo este archivo?", detalle: String(ruta ?? crudo) };
    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return { titulo: "¿Modifico este archivo?", detalle: String(ruta ?? crudo) };
    case "WebFetch":
      return { titulo: "¿Abro esta página?", detalle: String(args?.url ?? crudo) };
    default:
      return {
        titulo: herramienta ? `¿Uso ${herramienta}?` : "¿Me das permiso?",
        detalle: recortar(crudo || titulo, 200),
      };
  }
}

function idHerramienta(data: any): string {
  return String(data.toolCallId ?? data.itemId ?? data.name ?? "herramienta");
}

function mensajeDeError(data: any): string {
  for (const valor of [data?.message, data?.error?.message, data?.error, data?.reason, data?.text]) {
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return MENSAJE_ERROR;
}

/** El contenido de un mensaje puede ser texto o una lista de bloques `{ type: "text", text }`. */
function textoDeContenido(contenido: unknown): string {
  if (typeof contenido === "string") return contenido.trim();
  if (!Array.isArray(contenido)) return "";
  return contenido
    .map((bloque) => (bloque?.type === "text" && typeof bloque.text === "string" ? bloque.text : ""))
    .join("")
    .trim();
}

function nombreArchivo(ruta: string): string {
  return ruta.split(/[\\/]/).filter(Boolean).pop() ?? ruta;
}

function dominio(url: unknown): string {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function recortar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}
