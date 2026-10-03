// El aula del estudiante (Canvas o Moodle), solo lectura: qué tiene que entregar y cuándo. Brote
// muestra la próxima entrega en la isla, avisa 24 h y 2 h antes, y responde "¿qué entregas tengo?".
//
// Configuración: ~/.asistente-prototipo/aula.json { tipo: "canvas" | "moodle", url, token } con
// permisos 600. La escribe Rust desde "Configurar Brote" (configuracion.rs: `guardar_aula`); aquí
// solo se lee. El token es personal (Canvas: Cuenta → Configuración → Nuevo token de acceso; Moodle:
// Preferencias → Claves de seguridad, servicio de la app móvil). Nunca se pide la contraseña, y ni la
// URL con el token ni el token mismo se registran: los errores dicen solo qué falló.
//
// APIs (forma real, ver las respuestas armadas en pruebas/datos/):
//   Canvas  GET /api/v1/users/self/todo, /api/v1/users/self/upcoming_events,
//               /api/v1/courses?enrollment_state=active   (Authorization: Bearer <token>)
//   Moodle  POST /webservice/rest/server.php  wstoken, wsfunction, moodlewsrestformat=json:
//               core_webservice_get_site_info (para el id del usuario), core_enrol_get_users_courses,
//               core_calendar_get_action_events_by_timesort
// La lógica (normalizar, describir, avisar) es pura; leer es lo único que usa la red.

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

export type Plataforma = "canvas" | "moodle";

export interface ConfigAula {
  tipo: Plataforma;
  /** El origen del campus (https), sin barra final. */
  url: string;
  token: string;
}

/** Una entrega normalizada, venga de Canvas o de Moodle. */
export interface Entrega {
  curso: string;
  titulo: string;
  entregaMs: number;
  url: string | null;
  entregada: boolean;
}

export type LecturaAula = { entregas: Entrega[] } | { error: "token" | "red" | "respuesta" };

// ---------------------------------------------------------------- configuración

export const RUTA_CONFIG_AULA = process.env.ASISTENTE_AULA ?? join(homedir(), ".asistente-prototipo", "aula.json");

/** La URL del campus: https, solo letras, números y separadores comunes, sin consulta ni usuario. */
export function normalizarUrlAula(texto: string): string | null {
  const limpio = texto.trim().replace(/\/+$/, "");
  if (limpio.length > 300 || /[\s?#@"'<>\\]/.test(limpio)) return null;
  try {
    const url = new URL(limpio);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export function tokenAulaValido(token: string): boolean {
  return /^[A-Za-z0-9~_.-]{16,300}$/.test(token);
}

export function leerConfigAula(ruta = RUTA_CONFIG_AULA): ConfigAula | null {
  try {
    const datos = JSON.parse(readFileSync(ruta, "utf8"));
    const url = typeof datos?.url === "string" ? normalizarUrlAula(datos.url) : null;
    if ((datos?.tipo !== "canvas" && datos?.tipo !== "moodle") || !url || typeof datos.token !== "string" || !tokenAulaValido(datos.token)) return null;
    return { tipo: datos.tipo, url, token: datos.token };
  } catch {
    return null;
  }
}

/** Cuándo cambió la configuración (para notar que el usuario guardó otra). */
export function marcaConfigAula(ruta = RUTA_CONFIG_AULA): number {
  try {
    return statSync(ruta).mtimeMs;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------- pedidos (puros)

export interface Pedido {
  url: string;
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: string };
}

/** Los tres pedidos a Canvas. El token va en la cabecera, no en la URL. */
export function pedidosCanvas(config: ConfigAula): { todo: Pedido; proximos: Pedido; cursos: Pedido } {
  const pedido = (ruta: string): Pedido => ({
    url: `${config.url}${ruta}`,
    init: { method: "GET", headers: { authorization: `Bearer ${config.token}`, accept: "application/json" } },
  });
  return {
    todo: pedido("/api/v1/users/self/todo?per_page=100"),
    proximos: pedido("/api/v1/users/self/upcoming_events?per_page=100"),
    cursos: pedido("/api/v1/courses?enrollment_state=active&per_page=100"),
  };
}

/** Un pedido a Moodle, por POST para que el token no quede en la URL (ni en registros de proxies). */
export function pedidoMoodle(config: ConfigAula, funcion: string, parametros: Record<string, string | number> = {}): Pedido {
  const cuerpo = new URLSearchParams({ wstoken: config.token, wsfunction: funcion, moodlewsrestformat: "json" });
  for (const [clave, valor] of Object.entries(parametros)) cuerpo.set(clave, String(valor));
  return {
    url: `${config.url}/webservice/rest/server.php`,
    init: { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: cuerpo.toString() },
  };
}

// ---------------------------------------------------------------- normalizar (puro)

function textoLimpio(valor: unknown, maximo = 200): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return limpio ? limpio.slice(0, maximo) : null;
}

function fechaMs(valor: unknown): number | null {
  if (typeof valor !== "string") return null;
  const ms = Date.parse(valor);
  return Number.isFinite(ms) ? ms : null;
}

/** Solo enlaces https (para mostrarlos o dárselos al agente); nunca javascript: ni archivos. */
function enlace(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  try {
    return new URL(valor).protocol === "https:" ? valor : null;
  } catch {
    return null;
  }
}

/**
 * Canvas → entregas. `todo` trae lo pendiente (assignment o quiz, sin entregar); `upcoming_events`
 * trae tareas con fecha (type "assignment"; los eventos de calendario se ignoran) que pueden estar
 * entregadas (`user_submitted`). Se juntan por id, y el curso sale de la lista de cursos.
 */
export function interpretarCanvas(todo: unknown, proximos: unknown, cursos: unknown): Entrega[] {
  const nombres = new Map<number, string>();
  for (const curso of Array.isArray(cursos) ? cursos : []) {
    const nombre = textoLimpio(curso?.name) ?? textoLimpio(curso?.course_code);
    if (Number.isInteger(curso?.id) && nombre) nombres.set(curso.id, nombre);
  }
  const deContexto = (codigo: unknown): number | null => {
    const id = typeof codigo === "string" ? /^course_(\d+)$/.exec(codigo)?.[1] : null;
    return id ? Number(id) : null;
  };
  const porId = new Map<string, Entrega>();
  const agregar = (clave: string, curso: number | null, tarea: any, entregada: boolean) => {
    const entregaMs = fechaMs(tarea?.due_at);
    const titulo = textoLimpio(tarea?.name) ?? textoLimpio(tarea?.title);
    if (entregaMs === null || !titulo) return;
    const anterior = porId.get(clave);
    porId.set(clave, {
      curso: (curso !== null ? nombres.get(curso) : undefined) ?? anterior?.curso ?? "Curso",
      titulo,
      entregaMs,
      url: enlace(tarea?.html_url) ?? anterior?.url ?? null,
      // Si aparece en "por hacer", no está entregada.
      entregada: anterior ? anterior.entregada && entregada : entregada,
    });
  };
  for (const item of Array.isArray(proximos) ? proximos : []) {
    if (item?.type !== "assignment" || !item.assignment) continue;
    const tarea = item.assignment;
    const estado = tarea.submission?.workflow_state;
    const entregada = tarea.user_submitted === true || estado === "submitted" || estado === "graded" || estado === "pending_review";
    agregar(`a${tarea.id}`, Number.isInteger(tarea.course_id) ? tarea.course_id : deContexto(item.context_code), tarea, entregada);
  }
  for (const item of Array.isArray(todo) ? todo : []) {
    if (item?.type !== "submitting") continue;
    const curso = Number.isInteger(item.course_id) ? item.course_id : null;
    if (item.assignment) agregar(`a${item.assignment.id}`, curso ?? item.assignment.course_id ?? null, item.assignment, false);
    else if (item.quiz) agregar(`q${item.quiz.id}`, curso, { ...item.quiz, name: item.quiz.title }, false);
  }
  return [...porId.values()].sort((a, b) => a.entregaMs - b.entregaMs);
}

/**
 * Moodle → entregas. Los "action events" son lo que el usuario tiene que hacer (entregar una tarea,
 * responder un cuestionario); cuando ya lo hizo, Moodle deja de devolverlos o los devuelve sin acción.
 * `actionable: false` (por ejemplo, un cuestionario que aún no abre) sigue pendiente.
 */
export function interpretarMoodle(respuesta: unknown, cursos: unknown): Entrega[] {
  const nombres = new Map<number, string>();
  for (const curso of Array.isArray(cursos) ? cursos : []) {
    const nombre = textoLimpio(curso?.fullname) ?? textoLimpio(curso?.shortname);
    if (Number.isInteger(curso?.id) && nombre) nombres.set(curso.id, nombre);
  }
  const eventos = (respuesta as any)?.events;
  const entregas: Entrega[] = [];
  for (const e of Array.isArray(eventos) ? eventos : []) {
    const titulo = textoLimpio(e?.activityname) ?? textoLimpio(e?.name);
    const segundos = Number.isFinite(e?.timesort) ? e.timesort : e?.timestart;
    if (!titulo || !Number.isFinite(segundos)) continue;
    entregas.push({
      curso: textoLimpio(e.course?.fullname) ?? nombres.get(e.course?.id) ?? "Curso",
      titulo,
      entregaMs: segundos * 1000,
      url: enlace(e.action?.url) ?? enlace(e.url),
      // Moodle devuelve lo pendiente; un evento sin acción es algo que ya se hizo.
      entregada: !e.action,
    });
  }
  return entregas.sort((a, b) => a.entregaMs - b.entregaMs);
}

/** Una respuesta de error de Moodle (llega con HTTP 200): `{ exception, errorcode, message }`. */
export function errorMoodle(respuesta: unknown): "token" | "respuesta" | null {
  const r = respuesta as any;
  if (!r || typeof r !== "object" || Array.isArray(r) || !("exception" in r || "errorcode" in r)) return null;
  return /invalidtoken|accessexception|servicenotavailable/i.test(String(r.errorcode ?? "")) ? "token" : "respuesta";
}

// ---------------------------------------------------------------- lectura (red)

type Buscador = (url: string, init: Pedido["init"] & { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

class ErrorAula extends Error {
  readonly tipo: "token" | "red" | "respuesta";
  constructor(tipo: "token" | "red" | "respuesta") {
    super(tipo);
    this.tipo = tipo;
  }
}

async function pedirJson(buscar: Buscador, pedido: Pedido, tiempoMs: number): Promise<unknown> {
  let respuesta;
  try {
    respuesta = await buscar(pedido.url, { ...pedido.init, signal: AbortSignal.timeout(tiempoMs) });
  } catch {
    throw new ErrorAula("red");
  }
  if (respuesta.status === 401 || respuesta.status === 403) throw new ErrorAula("token");
  if (!respuesta.ok) throw new ErrorAula("respuesta");
  try {
    return await respuesta.json();
  } catch {
    throw new ErrorAula("respuesta");
  }
}

/**
 * Lee las entregas del aula. Nunca lanza ni registra nada: devuelve `{ error }` con el tipo de
 * problema (token inválido o vencido, sin red, respuesta rara).
 */
export async function leerAula(config: ConfigAula, ahoraMs = Date.now(), buscar: Buscador = fetch as unknown as Buscador, tiempoMs = 20_000): Promise<LecturaAula> {
  try {
    if (config.tipo === "canvas") {
      const pedidos = pedidosCanvas(config);
      const [todo, proximos, cursos] = await Promise.all([
        pedirJson(buscar, pedidos.todo, tiempoMs),
        pedirJson(buscar, pedidos.proximos, tiempoMs),
        pedirJson(buscar, pedidos.cursos, tiempoMs).catch(() => []),
      ]);
      return { entregas: interpretarCanvas(todo, proximos, cursos) };
    }
    const sitio = await pedirJson(buscar, pedidoMoodle(config, "core_webservice_get_site_info"), tiempoMs);
    const error = errorMoodle(sitio);
    if (error) throw new ErrorAula(error);
    const usuario = (sitio as any)?.userid;
    if (!Number.isInteger(usuario)) throw new ErrorAula("respuesta");
    const [cursos, eventos] = await Promise.all([
      pedirJson(buscar, pedidoMoodle(config, "core_enrol_get_users_courses", { userid: usuario }), tiempoMs).catch(() => []),
      pedirJson(
        buscar,
        pedidoMoodle(config, "core_calendar_get_action_events_by_timesort", { timesortfrom: Math.floor((ahoraMs - DIA) / 1000), limitnum: 50 }),
        tiempoMs,
      ),
    ]);
    const errorEventos = errorMoodle(eventos);
    if (errorEventos) throw new ErrorAula(errorEventos);
    return { entregas: interpretarMoodle(eventos, errorMoodle(cursos) ? [] : cursos) };
  } catch (error) {
    return { error: error instanceof ErrorAula ? error.tipo : "respuesta" };
  }
}

export function describirErrorAula(error: "token" | "red" | "respuesta"): string {
  if (error === "token") return "El aula no aceptó tu token (¿venció o lo borraste?). Pega uno nuevo en 🌱 → Configurar Brote.";
  if (error === "red") return "No pude conectarme con tu aula (¿sin internet?).";
  return "Tu aula respondió algo que no entendí. Revisa la dirección del campus en 🌱 → Configurar Brote.";
}

// ---------------------------------------------------------------- describir y avisar (puro)

/** Lo que falta entregar desde ahora, de lo más urgente a lo menos (opcional: dentro de `dias`). */
export function pendientes(entregas: Entrega[], ahoraMs: number, dias?: number): Entrega[] {
  return entregas
    .filter((e) => !e.entregada && e.entregaMs > ahoraMs && (dias === undefined || e.entregaMs <= ahoraMs + dias * DIA))
    .sort((a, b) => a.entregaMs - b.entregaMs);
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function inicioDelDia(ms: number, dias = 0): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias).getTime();
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** "en 45 min", "en 3 h", "hoy a las 23:59", "mañana a las 08:00", "el jueves a las 23:59", "el 14/10". */
export function cuandoVence(entregaMs: number, ahoraMs: number): string {
  const falta = entregaMs - ahoraMs;
  const d = new Date(entregaMs);
  const hora = `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
  if (falta <= 0) return "ya venció";
  if (falta < HORA) return `en ${Math.max(1, Math.round(falta / MINUTO))} min`;
  if (falta < 6 * HORA) {
    const horas = Math.floor(falta / HORA);
    const minutos = Math.round((falta % HORA) / MINUTO);
    return `en ${horas} h${minutos ? ` ${minutos} min` : ""}`;
  }
  const dia = inicioDelDia(entregaMs);
  if (dia === inicioDelDia(ahoraMs)) return `hoy a las ${hora}`;
  if (dia === inicioDelDia(ahoraMs, 1)) return `mañana a las ${hora}`;
  if (dia < inicioDelDia(ahoraMs, 7)) return `el ${DIAS_SEMANA[d.getDay()]} a las ${hora}`;
  return `el ${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}`;
}

/** "Informe 2 (Cálculo II) mañana a las 23:59": lo que muestra la isla. */
export function etiquetaEntrega(e: Entrega, ahoraMs: number): string {
  return `${e.titulo} · ${cuandoVence(e.entregaMs, ahoraMs)}`;
}

/** "¿Qué entregas tengo?" (las próximas 6) y "¿qué tengo que entregar esta semana?". */
export function describirEntregas(entregas: Entrega[] | null, ahoraMs: number, soloSemana = false): string {
  if (entregas === null) {
    return "📚 Todavía no veo tu aula. Conéctala en 🌱 → Configurar Brote (Canvas o Moodle, con un token personal).";
  }
  const lista = pendientes(entregas, ahoraMs, soloSemana ? 7 : undefined);
  if (lista.length === 0) {
    return soloSemana ? "📚 No tienes entregas esta semana. ¡A disfrutar! 🌱" : "📚 No tienes entregas pendientes. ¡Al día! 🌱";
  }
  const mostradas = lista.slice(0, 6);
  const lineas = mostradas.map((e) => `• ${e.titulo} (${e.curso}): ${cuandoVence(e.entregaMs, ahoraMs)}`);
  const mas = lista.length > mostradas.length ? `\n…y ${lista.length - mostradas.length} más.` : "";
  const cuantas = lista.length === 1 ? "1 entrega" : `${lista.length} entregas`;
  return `📚 ${soloSemana ? `Esta semana tienes ${cuantas}` : `Tienes ${cuantas} pendiente${lista.length === 1 ? "" : "s"}`}:\n${lineas.join("\n")}${mas}`;
}

/** Cuánto antes avisa Brote (cada aviso, una sola vez por entrega). */
export const AVISOS_ENTREGA = [
  { antesMs: 24 * HORA, texto: (e: Entrega) => `📚 Mañana a esta hora vence «${e.titulo}» (${e.curso}). ¡Tú puedes! 🌱` },
  { antesMs: 2 * HORA, texto: (e: Entrega) => `⏰ En 2 horas vence «${e.titulo}» (${e.curso}). ¡Último empujón!` },
] as const;

/**
 * Avisa una vez 24 h antes y otra 2 h antes de cada entrega pendiente. Si Brote se abre con menos
 * tiempo, da solo el aviso más cercano (no los dos juntos).
 */
export class AvisadorEntregas {
  private avisados = new Set<string>();

  revisar(entregas: Entrega[], ahoraMs: number): string[] {
    const avisos: string[] = [];
    for (const e of pendientes(entregas, ahoraMs)) {
      const falta = e.entregaMs - ahoraMs;
      const toca = AVISOS_ENTREGA.filter((a) => falta <= a.antesMs);
      if (toca.length === 0) continue;
      const clave = (antes: number) => `${e.curso}|${e.titulo}|${e.entregaMs}|${antes}`;
      const masCercano = toca[toca.length - 1];
      if (!this.avisados.has(clave(masCercano.antesMs))) avisos.push(masCercano.texto(e));
      for (const a of toca) this.avisados.add(clave(a.antesMs));
    }
    if (this.avisados.size > 1000) this.avisados = new Set([...this.avisados].slice(-400));
    return avisos;
  }
}
