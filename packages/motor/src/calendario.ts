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
    return typeof datos?.ical === "string" ? normalizarUrlIcal(datos.ical) : null;
  } catch {
    return null;
  }
}

/** Cuándo cambió la configuración (para notar que el usuario guardó otra dirección). */
export function marcaConfigCalendario(ruta = RUTA_CONFIG_CALENDARIO): number {
  try {
    return statSync(ruta).mtimeMs;
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
  const encontrados = lector.eventsMatchingPredicate(lector.predicateForEventsWithStartDateEndDateCalendars(desde, hasta, null));
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
main();`;
}

export function comandoEventKit(desdeMs: number, hastaMs: number, pedir = false): Comando {
  return { programa: "osascript", args: ["-l", "JavaScript", "-e", scriptEventKit(desdeMs, hastaMs, pedir)] };
}

export interface LecturaMac {
  /** 3 = acceso completo; 0 = sin decidir; 2 = negado; 4 = solo escritura; 1 = restringido. */
  permiso: number;
  eventos: EventoCalendario[] | null;
}

export function interpretarEventKit(salida: string): LecturaMac | null {
  try {
    const datos = JSON.parse(salida.trim());
    if (typeof datos?.permiso !== "number") return null;
    if (!Array.isArray(datos.eventos)) return { permiso: datos.permiso, eventos: null };
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
