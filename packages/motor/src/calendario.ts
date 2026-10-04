// El calendario del estudiante: lo que tiene hoy, mañana y su próxima clase, y un aviso 10 min
// antes. Dos fuentes, que se juntan:
//   - macOS: los calendarios del Mac (iCloud, Google, Exchange… los que estén en la app Calendario)
//     con EventKit desde `osascript -l JavaScript`. No usa `Application("Calendar")`, que abre la app
//     Calendario y es muy lento; EventKit lee sin abrir nada. Pide permiso de Calendario.
//   - Cualquier sistema: una dirección iCal secreta (Google Calendar → Configuración → "Dirección
//     secreta en formato iCal"), guardada en ~/.asistente-prototipo/calendario.json con permisos 600.
//     La escribe Rust desde "Configurar Brote" (configuracion.rs); aquí solo se lee.
// La lógica (describir, avisar, combinar) es pura; los eventos no salen del computador.

import { execFile, execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { leerSecretos, versionSecretos } from "./secretos.ts";
import { eventosIcs, type EventoCalendario } from "./ics.ts";
import type { Comando } from "./musica.ts";

export type { EventoCalendario } from "./ics.ts";

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;

/** Cuánto antes de un evento avisa Brote. */
export const AVISO_ANTES_MS = 10 * MINUTO;

// ---------------------------------------------------------------- lógica

function inicioDelDia(ms: number, dias = 0): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias).getTime();
}

/** Junta las fuentes sin repetir (el mismo evento puede estar en el Mac y en el iCal). */
export function combinar(...fuentes: (EventoCalendario[] | null)[]): EventoCalendario[] {
  const vistos = new Set<string>();
  const todos: EventoCalendario[] = [];
  for (const evento of fuentes.flatMap((f) => f ?? [])) {
    const clave = `${evento.titulo.trim().toLowerCase()}|${evento.inicioMs}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    todos.push(evento);
  }
  return todos.sort((a, b) => a.inicioMs - b.inicioMs);
}

/** Los eventos de un día (0 = hoy, 1 = mañana), incluidos los de día completo. */
export function delDia(eventos: EventoCalendario[], ahoraMs: number, dias: number): EventoCalendario[] {
  const desde = inicioDelDia(ahoraMs, dias);
  const hasta = inicioDelDia(ahoraMs, dias + 1);
  return eventos.filter((e) => e.inicioMs < hasta && e.finMs > desde);
}

/** El próximo evento con hora que todavía no termina (si ya empezó, es el que está pasando). */
export function proximoEvento(eventos: EventoCalendario[], ahoraMs: number, horizonteMs = DIA): EventoCalendario | null {
  return eventos.find((e) => !e.todoElDia && e.finMs > ahoraMs && e.inicioMs < ahoraMs + horizonteMs) ?? null;
}

/** Los eventos con hora de las próximas `horas` (para el agente). */
export function proximos(eventos: EventoCalendario[], ahoraMs: number, horas = 24): EventoCalendario[] {
  return eventos.filter((e) => e.finMs > ahoraMs && e.inicioMs < ahoraMs + horas * 60 * MINUTO);
}

/** "08:30". */
export function hora(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "en 25 min", "en 2 h 10 min", "ahora", "a las 08:30" (si es otro día). */
export function cuandoEs(evento: EventoCalendario, ahoraMs: number): string {
  if (evento.inicioMs <= ahoraMs) return "ahora";
  const minutos = Math.round((evento.inicioMs - ahoraMs) / MINUTO);
  if (inicioDelDia(evento.inicioMs) !== inicioDelDia(ahoraMs)) {
    return inicioDelDia(evento.inicioMs) === inicioDelDia(ahoraMs, 1) ? `mañana a las ${hora(evento.inicioMs)}` : `a las ${hora(evento.inicioMs)}`;
  }
  if (minutos < 1) return "en menos de un minuto";
  if (minutos < 60) return `en ${minutos} min`;
  if (minutos < 180) {
    const resto = minutos % 60;
    return `en ${Math.floor(minutos / 60)} h${resto ? ` ${resto} min` : ""}`;
  }
  return `a las ${hora(evento.inicioMs)}`;
}

/** "Cálculo en 25 min": lo que muestra la isla. */
export function etiquetaProximo(evento: EventoCalendario, ahoraMs: number): string {
  const cuando = cuandoEs(evento, ahoraMs);
  return cuando === "ahora" ? `${evento.titulo} (ahora, hasta las ${hora(evento.finMs)})` : `${evento.titulo} ${cuando}`;
}

function linea(evento: EventoCalendario): string {
  const lugar = evento.lugar ? ` (${evento.lugar})` : "";
  if (evento.todoElDia) return `• Todo el día: ${evento.titulo}${lugar}`;
  return `• ${hora(evento.inicioMs)}–${hora(evento.finMs)} ${evento.titulo}${lugar}`;
}

export function describirDia(eventos: EventoCalendario[], ahoraMs: number, dias: 0 | 1): string {
  const lista = delDia(eventos, ahoraMs, dias);
  const cual = dias === 0 ? "hoy" : "mañana";
  if (lista.length === 0) return `📅 No tienes nada en el calendario ${cual}. ¡Día libre! 🌱`;
  return `📅 ${dias === 0 ? "Hoy" : "Mañana"} tienes:\n${lista.map(linea).join("\n")}`;
}

export function describirProximo(eventos: EventoCalendario[], ahoraMs: number): string {
  const evento = proximoEvento(eventos, ahoraMs);
  if (!evento) return "📅 No tienes nada más en las próximas 24 horas.";
  const lugar = evento.lugar ? `, en ${evento.lugar}` : "";
  const cuando = cuandoEs(evento, ahoraMs);
  if (cuando === "ahora") return `📅 Ahora mismo: ${evento.titulo}${lugar} (hasta las ${hora(evento.finMs)}).`;
  const aLas = cuando.includes("a las") ? "" : ` (${hora(evento.inicioMs)})`;
  return `📅 Lo próximo: ${evento.titulo} ${cuando}${aLas}${lugar}.`;
}

/** Avisa una vez, 10 min antes de cada evento con hora (también si Brote se abrió 5 min antes). */
export class AvisadorCalendario {
  private avisados = new Set<string>();

  revisar(eventos: EventoCalendario[], ahoraMs: number): string[] {
    const avisos: string[] = [];
    for (const e of eventos) {
      if (e.todoElDia || e.inicioMs < ahoraMs - MINUTO || e.inicioMs - ahoraMs > AVISO_ANTES_MS) continue;
      const clave = `${e.titulo}|${e.inicioMs}`;
      if (this.avisados.has(clave)) continue;
      this.avisados.add(clave);
      const minutos = Math.max(0, Math.round((e.inicioMs - ahoraMs) / MINUTO));
      const lugar = e.lugar ? ` en ${e.lugar}` : "";
      avisos.push(minutos === 0 ? `📅 ¡Empieza ${e.titulo}${lugar}!` : `📅 En ${minutos} min: ${e.titulo}${lugar}. ¡Vamos! 🌱`);
    }
    // Lo viejo no hace falta recordarlo.
    if (this.avisados.size > 500) this.avisados = new Set([...this.avisados].slice(-200));
    return avisos;
  }
}

// ---------------------------------------------------------------- iCal

/** Lo que se guarda en ~/.asistente-prototipo/calendario.json (lo escribe Rust, con permisos 600). */
export const RUTA_CONFIG_CALENDARIO = join(homedir(), ".asistente-prototipo", "calendario.json");

/** `webcal://` es lo mismo que `https://`. Solo se acepta https (nunca un archivo local ni http). */
export function normalizarUrlIcal(texto: string): string | null {
  const limpio = texto.trim().replace(/^webcal:\/\//i, "https://");
  if (limpio.length > 2000 || /\s/.test(limpio)) return null;
  try {
    const url = new URL(limpio);
    return url.protocol === "https:" && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

export function leerUrlIcal(ruta = RUTA_CONFIG_CALENDARIO): string | null {
  try {
    const datos = JSON.parse(readFileSync(ruta, "utf8"));
    // Con `enLlavero` la dirección no está en el archivo: la entregó la app (ver secretos.ts).
    const ical = typeof datos?.ical === "string" ? datos.ical : datos?.enLlavero === true ? leerSecretos().ical : null;
    return ical ? normalizarUrlIcal(ical) : null;
  } catch {
    return null;
  }
}

/** Cuándo cambió la configuración (para notar que el usuario guardó otra dirección). */
export function marcaConfigCalendario(ruta = RUTA_CONFIG_CALENDARIO): number {
  try {
    return statSync(ruta).mtimeMs + versionSecretos();
  } catch {
    return 0;
  }
}

const TAMANO_MAXIMO_ICS = 15 * 1024 * 1024;

/** Descarga el .ics (o `null` si falla). Nunca registra la dirección: es secreta. */
export async function descargarIcal(url: string, tiempoMs = 20_000): Promise<string | null> {
  try {
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(tiempoMs), headers: { accept: "text/calendar" } });
    if (!respuesta.ok) return null;
    const datos = await respuesta.arrayBuffer();
    if (datos.byteLength > TAMANO_MAXIMO_ICS) return null;
    const texto = new TextDecoder().decode(datos);
    return texto.includes("BEGIN:VCALENDAR") ? texto : null;
  } catch {
    return null;
  }
}

/** La ventana que se lee: desde el comienzo de hoy, tres días (cubre "mañana" y las próximas 24 h). */
export function ventana(ahoraMs: number): { desde: number; hasta: number } {
  return { desde: inicioDelDia(ahoraMs), hasta: inicioDelDia(ahoraMs, 3) };
}

export function eventosDeIcal(texto: string, ahoraMs: number): EventoCalendario[] {
  const { desde, hasta } = ventana(ahoraMs);
  return eventosIcs(texto, desde, hasta);
}

// ---------------------------------------------------------------- macOS (EventKit)

/**
 * JXA con EventKit. `pedir`: si el permiso no se ha decidido, lo pide (solo desde "Configurar
 * Brote"; la revisión periódica nunca pregunta). Devuelve { permiso, eventos? }; permiso 3 =
 * acceso completo (2 negado, 0 sin decidir, 4 solo escritura).
 */
function scriptEventKit(desdeMs: number, hastaMs: number, pedir: boolean): string {
  return `
ObjC.import("EventKit");
const TIPO_EVENTO = $.EKEntityTypeEvent || 0;
function main() {
  const almacen = $.EKEventStore.alloc.init;
  let permiso = Number($.EKEventStore.authorizationStatusForEntityType(TIPO_EVENTO));
  if (permiso === 0 && ${pedir ? "true" : "false"}) {
    let listo = false;
    const alResponder = function (ok, error) { listo = true; };
    if (almacen.respondsToSelector("requestFullAccessToEventsWithCompletion:")) almacen.requestFullAccessToEventsWithCompletion(alResponder);
    else almacen.requestAccessToEntityTypeCompletion(TIPO_EVENTO, alResponder);
    const limite = Date.now() + 120000;
    while (!listo && Date.now() < limite) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.2));
    permiso = Number($.EKEventStore.authorizationStatusForEntityType(TIPO_EVENTO));
  }
  if (permiso !== 3) return JSON.stringify({ permiso: permiso });
  const lector = $.EKEventStore.alloc.init;
  const desde = $.NSDate.dateWithTimeIntervalSince1970(${Math.floor(desdeMs / 1000)});
  const hasta = $.NSDate.dateWithTimeIntervalSince1970(${Math.floor(hastaMs / 1000)});
  // $() es nil (todos los calendarios): null llega como NSNull y EventKit le llama count.
  const encontrados = lector.eventsMatchingPredicate(lector.predicateForEventsWithStartDateEndDateCalendars(desde, hasta, $()));
  const eventos = [];
  for (let i = 0; i < encontrados.count; i++) {
    const e = encontrados.objectAtIndex(i);
    eventos.push({
      titulo: ObjC.unwrap(e.title),
      lugar: ObjC.unwrap(e.location),
      inicio: e.startDate.timeIntervalSince1970 * 1000,
      fin: e.endDate.timeIntervalSince1970 * 1000,
      todoElDia: e.isAllDay === true || e.allDay === true,
    });
  }
  return JSON.stringify({ permiso: permiso, eventos: eventos });
}
let salida;
try {
  salida = main();
} catch (error) {
  salida = JSON.stringify({ permiso: -1, error: String(error) });
}
salida;`;
}

export function comandoEventKit(desdeMs: number, hastaMs: number, pedir = false): Comando {
  return { programa: "osascript", args: ["-l", "JavaScript", "-e", scriptEventKit(desdeMs, hastaMs, pedir)] };
}

export interface LecturaMac {
  /** 3 = acceso completo; 0 = sin decidir; 2 = negado; 4 = solo escritura; 1 = restringido; -1 = falló el script. */
  permiso: number;
  eventos: EventoCalendario[] | null;
  /** Si el script falló adentro de EventKit, el motivo (para el registro del puente). */
  error?: string;
}

export function interpretarEventKit(salida: string): LecturaMac | null {
  try {
    const datos = JSON.parse(salida.trim());
    if (typeof datos?.permiso !== "number") return null;
    if (!Array.isArray(datos.eventos)) {
      return typeof datos.error === "string" ? { permiso: datos.permiso, eventos: null, error: datos.error.slice(0, 300) } : { permiso: datos.permiso, eventos: null };
    }
    const eventos: EventoCalendario[] = [];
    for (const e of datos.eventos) {
      if (typeof e?.inicio !== "number" || typeof e?.fin !== "number") continue;
      const titulo = typeof e.titulo === "string" && e.titulo.trim() ? e.titulo.trim() : "(sin título)";
      const lugar = typeof e.lugar === "string" && e.lugar.trim() ? e.lugar.trim() : null;
      eventos.push({ titulo, lugar, inicioMs: Math.round(e.inicio), finMs: Math.round(e.fin), todoElDia: e.todoElDia === true });
    }
    return { permiso: datos.permiso, eventos: eventos.sort((a, b) => a.inicioMs - b.inicioMs) };
  } catch {
    return null;
  }
}

/** Los eventos del Mac (o `null` fuera de macOS, sin permiso o si falla). */
export function leerCalendarioMac(ahoraMs: number, pedir = false): Promise<LecturaMac | null> {
  if (process.platform !== "darwin") return Promise.resolve(null);
  const { desde, hasta } = ventana(ahoraMs);
  const comando = comandoEventKit(desde, hasta, pedir);
  return new Promise((listo) => {
    execFile(comando.programa, comando.args, { encoding: "utf8", timeout: pedir ? 150_000 : 20_000 }, (error, salida) =>
      listo(error ? null : interpretarEventKit(salida)),
    );
  });
}

/** Lo mismo, de forma síncrona (servidor MCP y "Configurar Brote"). */
export function leerCalendarioMacAhora(ahoraMs: number, pedir = false): LecturaMac | null {
  if (process.platform !== "darwin") return null;
  const { desde, hasta } = ventana(ahoraMs);
  const comando = comandoEventKit(desde, hasta, pedir);
  try {
    const salida = execFileSync(comando.programa, comando.args, { encoding: "utf8", timeout: pedir ? 150_000 : 20_000, stdio: ["ignore", "pipe", "ignore"] });
    return interpretarEventKit(salida);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- crear eventos (macOS)

export interface NuevoEvento {
  titulo: string;
  lugar: string | null;
  inicioMs: number;
  finMs: number;
}

export type ResultadoCreacion =
  | { ok: true; calendario: string | null }
  | { ok: false; motivo: "sin-permiso" | "no-disponible" | "invalido" | "fallo"; detalle?: string };

const DURACION_MAXIMA_MS = DIA;

/** Revisa un evento antes de crearlo: título razonable, empieza a futuro (hasta un año) y dura hasta un día. */
export function validarEvento(e: NuevoEvento, ahoraMs: number): string | null {
  if (!e.titulo.trim() || e.titulo.length > 200) return "El título debe tener entre 1 y 200 letras";
  if (e.lugar !== null && e.lugar.length > 200) return "El lugar es demasiado largo";
  if (!Number.isFinite(e.inicioMs) || !Number.isFinite(e.finMs)) return "Fecha inválida";
  if (e.inicioMs < ahoraMs - DIA || e.inicioMs > ahoraMs + 366 * DIA) return "El evento debe ser desde ayer hasta dentro de un año";
  if (e.finMs <= e.inicioMs || e.finMs - e.inicioMs > DURACION_MAXIMA_MS) return "El evento debe durar entre 1 minuto y 24 horas";
  return null;
}

/**
 * JXA que crea el evento en el calendario por defecto del Mac. Los datos van como un literal JSON
 * (nunca pegados como código). Con permiso 3 (completo) o 4 (solo escritura); nunca pide permiso.
 */
function scriptCrear(e: NuevoEvento): string {
  const datos = JSON.stringify({ titulo: e.titulo, lugar: e.lugar, inicio: e.inicioMs / 1000, fin: e.finMs / 1000 });
  return `
ObjC.import("EventKit");
const DATOS = ${datos};
function main() {
  const permiso = Number($.EKEventStore.authorizationStatusForEntityType($.EKEntityTypeEvent || 0));
  if (permiso !== 3 && permiso !== 4) return JSON.stringify({ ok: false, permiso: permiso });
  const almacen = $.EKEventStore.alloc.init;
  const calendario = almacen.defaultCalendarForNewEvents;
  if (!calendario || calendario.isNil()) return JSON.stringify({ ok: false, permiso: permiso, error: "No hay un calendario por defecto para eventos nuevos" });
  const evento = $.EKEvent.eventWithEventStore(almacen);
  evento.setTitle($(DATOS.titulo));
  if (DATOS.lugar) evento.setLocation($(DATOS.lugar));
  evento.setStartDate($.NSDate.dateWithTimeIntervalSince1970(DATOS.inicio));
  evento.setEndDate($.NSDate.dateWithTimeIntervalSince1970(DATOS.fin));
  evento.setCalendar(calendario);
  const error = Ref();
  const ok = almacen.saveEventSpanError(evento, $.EKSpanThisEvent || 0, error);
  if (!ok) return JSON.stringify({ ok: false, permiso: permiso, error: error[0] ? ObjC.unwrap(error[0].localizedDescription) : "EventKit no lo guardó" });
  return JSON.stringify({ ok: true, permiso: permiso, calendario: ObjC.unwrap(calendario.title) });
}
let salida;
try {
  salida = main();
} catch (error) {
  salida = JSON.stringify({ ok: false, permiso: -1, error: String(error) });
}
salida;`;
}

export function comandoCrearEventoMac(e: NuevoEvento): Comando {
  return { programa: "osascript", args: ["-l", "JavaScript", "-e", scriptCrear(e)] };
}

export function interpretarCreacion(salida: string | null): ResultadoCreacion {
  try {
    const datos = JSON.parse((salida ?? "").trim());
    if (datos?.ok === true) return { ok: true, calendario: typeof datos.calendario === "string" ? datos.calendario : null };
    if (typeof datos?.permiso === "number" && datos.permiso >= 0 && datos.permiso !== 3 && datos.permiso !== 4) return { ok: false, motivo: "sin-permiso" };
    return { ok: false, motivo: "fallo", detalle: typeof datos?.error === "string" ? datos.error.slice(0, 200) : undefined };
  } catch {
    return { ok: false, motivo: "fallo", detalle: "osascript no respondió" };
  }
}

/** Crea el evento en el Calendario del Mac (síncrono: es un pedido del usuario y tarda menos de un segundo). */
export function crearEventoMacAhora(e: NuevoEvento, ahoraMs = Date.now()): ResultadoCreacion {
  const invalido = validarEvento(e, ahoraMs);
  if (invalido) return { ok: false, motivo: "invalido", detalle: invalido };
  if (process.platform !== "darwin") return { ok: false, motivo: "no-disponible" };
  const comando = comandoCrearEventoMac(e);
  try {
    return interpretarCreacion(execFileSync(comando.programa, comando.args, { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] }));
  } catch (error) {
    const detalle = String((error as { stderr?: unknown }).stderr ?? error).trim().slice(0, 200);
    return { ok: false, motivo: "fallo", detalle };
  }
}

/** "hoy a las 15:42", "mañana a las 10:00", "el 2026-10-08 a las 09:00". */
export function cuandoDia(ms: number, ahoraMs: number): string {
  const dia = inicioDelDia(ms) === inicioDelDia(ahoraMs) ? "hoy" : inicioDelDia(ms) === inicioDelDia(ahoraMs, 1) ? "mañana" : null;
  if (dia) return `${dia} a las ${hora(ms)}`;
  const d = new Date(ms);
  return `el ${d.getDate()}/${d.getMonth() + 1} a las ${hora(ms)}`;
}

/** Lo que dice Brote después de intentar crear el evento. */
export function describirCreacion(e: NuevoEvento, resultado: ResultadoCreacion, ahoraMs: number): string {
  const cuando = cuandoDia(e.inicioMs, ahoraMs);
  if (resultado.ok) {
    const donde = resultado.calendario ? ` en tu calendario «${resultado.calendario}»` : " en tu Calendario";
    return `📅 Listo: «${e.titulo}» ${cuando}${donde}. Te aviso 10 min antes 🌱`;
  }
  switch (resultado.motivo) {
    case "sin-permiso":
      return "📅 Para crear eventos necesito permiso para tu Calendario: 🌱 → Configurar Brote → Calendario del Mac → Permitir acceso.";
    case "no-disponible":
      return "📅 Solo puedo crear eventos en el Calendario del Mac (la dirección iCal de Google es de solo lectura).";
    case "invalido":
      return `📅 No pude crear ese evento: ${resultado.detalle ?? "datos inválidos"}.`;
    default:
      return `📅 No pude guardar «${e.titulo}» en el Calendario${resultado.detalle ? ` (${resultado.detalle})` : ""}.`;
  }
}
