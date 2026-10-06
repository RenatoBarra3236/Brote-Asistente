// Las conversaciones anteriores de Brote en la isla («Anteriores»): el chat completo, no solo el resumen.
//
// Fuentes (todo en este computador, nada sale de él):
//   - Los resúmenes que OpenClaw escribe en cada /new o /reset (`<workspace>/memory/AAAA-MM-DD-HHMM.md`):
//     dicen cuándo terminó cada conversación.
//   - Las transcripciones que Claude Code guarda del espacio de Brote
//     (`~/.claude/projects/<workspace>/*.jsonl`): un archivo por proceso de `claude`, así que una
//     conversación queda repartida en varios archivos. Se leen SOLO los mensajes de texto de Tú y de
//     Brote (no las herramientas ni lo interno del equipo) y nunca las sesiones de Claude Code del
//     usuario: la carpeta es la del workspace de Brote. Claude Code las borra solo a los 30 días.
//
// Una conversación = los mensajes entre un reset y el siguiente. Olvidar una conversación manda a la
// Papelera sus archivos de transcripción que contienen solo mensajes de ella (nunca se reescribe un
// archivo de Claude Code).

import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const CONVERSACION = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.md$/;
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const TRANSCRIPCION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/;

/** Lo que estas funciones necesitan saber de dónde mirar. */
export interface LugaresConversaciones {
  /** Donde OpenClaw escribe los resúmenes de las conversaciones cerradas. */
  conversaciones: string;
  /** Donde Claude Code guarda las transcripciones del espacio de Brote (sin esto, solo hay resúmenes). */
  transcripciones?: string;
  /**
   * El archivo donde Brote anota qué ventanas de tiempo ya se olvidaron (`~/.asistente-prototipo/
   * conversaciones-olvidadas.json`). Sirve cuando un archivo de Claude Code mezcla dos conversaciones: no
   * se puede reescribir, así que lo olvidado deja de mostrarse y la otra conversación se lee entera.
   */
  olvidadas?: string;
}

export interface MensajeChat {
  rol: "tu" | "brote";
  texto: string;
  /** Cuándo se dijo (ms desde 1970). */
  t: number;
}

/** El id de la conversación que sigue abierta (la que empezó con el último reset). */
export const ID_ACTUAL = "actual";

/** Cuántos mensajes y caracteres como mucho se entregan al leer una conversación. */
export const MAX_MENSAJES = 400;
export const MAX_CARACTERES_MENSAJE = 12_000;
export const MAX_CARACTERES_CONVERSACION = 150_000;
/** Un archivo de transcripción más grande que esto no se lee. */
const MAX_BYTES_ARCHIVO = 64 * 1024 * 1024;

export function recortar(texto: string, max: number): string {
  return texto.length <= max ? texto : `${texto.slice(0, max).trimEnd()}…`;
}

/** El texto de una conversación guardada, con «Tú:» y «Brote:» en vez de user/assistant. */
export function resumenDeConversacion(contenido: string): string {
  return (contenido.split("## Conversation Summary")[1] ?? contenido)
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((linea) =>
      linea
        .replace(/^user:\s*/, "Tú: ")
        .replace(/^assistant:\s*/, "Brote: ")
        .replace(/"(.*)"$/, "$1")
        .replace(/\\n/g, " "),
    )
    .join("\n");
}

// ---------------------------------------------------------------- transcripciones de Claude Code

/**
 * Los mensajes de texto de una transcripción (JSONL de Claude Code): lo que dijiste y lo que respondió
 * Brote. Se dejan fuera las herramientas, las sesiones laterales, lo interno del equipo
 * («[Inter-session message]») y los `NO_REPLY`.
 */
export function mensajesDeTranscripcion(texto: string): MensajeChat[] {
  const mensajes: MensajeChat[] = [];
  for (const linea of texto.split("\n")) {
    if (!linea.trim()) continue;
    let d: any;
    try {
      d = JSON.parse(linea);
    } catch {
      continue;
    }
    if ((d?.type !== "user" && d?.type !== "assistant") || d.isSidechain === true) continue;
    const contenido = d.message?.content;
    const bruto =
      typeof contenido === "string"
        ? contenido
        : Array.isArray(contenido)
          ? contenido.filter((b: any) => b?.type === "text" && typeof b.text === "string").map((b: any) => b.text).join("\n")
          : "";
    const limpio = bruto.trim();
    if (!limpio || limpio.startsWith("NO_REPLY") || limpio.includes("[Inter-session message]")) continue;
    // Avisos que OpenClaw le mete a la sesión cuando la reanuda: no los escribió el usuario. El mensaje real
    // va pegado después (en la misma línea o en la siguiente).
    const sinAviso = limpio.replace(/^OpenClaw resumed this CLI session after prompt content changed\.[^\n]*?changed=[\w,-]+\.\s*/, "").trim();
    if (!sinAviso) continue;
    const t = Date.parse(d.timestamp ?? "");
    if (!Number.isFinite(t)) continue;
    mensajes.push({ rol: d.type === "user" ? "tu" : "brote", texto: recortar(sinAviso, MAX_CARACTERES_MENSAJE), t });
  }
  return mensajes.sort((a, b) => a.t - b.t);
}

interface ArchivoLeido {
  nombre: string;
  mensajes: MensajeChat[];
}

const cache = new Map<string, { firma: string; mensajes: MensajeChat[] }>();

/** Las transcripciones de la carpeta (solo archivos regulares con nombre de sesión), con sus mensajes. */
export function leerTranscripciones(carpeta: string | undefined): ArchivoLeido[] {
  if (!carpeta || !existsSync(carpeta)) return [];
  const resultado: ArchivoLeido[] = [];
  for (const nombre of readdirSync(carpeta)) {
    if (!TRANSCRIPCION.test(nombre)) continue;
    const ruta = join(carpeta, nombre);
    let estado;
    try {
      estado = lstatSync(ruta);
    } catch {
      continue;
    }
    if (!estado.isFile() || estado.size > MAX_BYTES_ARCHIVO) continue;
    const firma = `${estado.mtimeMs}:${estado.size}`;
    const guardado = cache.get(ruta);
    if (guardado?.firma === firma) {
      resultado.push({ nombre, mensajes: guardado.mensajes });
      continue;
    }
    let mensajes: MensajeChat[];
    try {
      mensajes = mensajesDeTranscripcion(readFileSync(ruta, "utf8"));
    } catch {
      continue;
    }
    cache.set(ruta, { firma, mensajes });
    resultado.push({ nombre, mensajes });
  }
  return resultado;
}

// ---------------------------------------------------------------- cortes entre conversaciones

export interface CorteDeConversacion {
  /** El nombre del archivo de resumen (`AAAA-MM-DD-HHMM.md`), que es el id. */
  id: string;
  /** Cuándo terminó (ms): después de esto, los mensajes son de la conversación siguiente. */
  fin: number;
  titulo: string;
  fecha: string;
  /** El resumen ya se olvidó: el corte solo se recuerda para saber dónde empieza la conversación siguiente. */
  olvidada?: boolean;
}

export interface VentanaOlvidada {
  desde: number;
  hasta: number;
}

const MAX_OLVIDADAS = 500;

/** Las ventanas ya olvidadas (un archivo ilegible cuenta como ninguna). */
export function leerOlvidadas(ruta: string | undefined): VentanaOlvidada[] {
  if (!ruta) return [];
  try {
    const datos = JSON.parse(readFileSync(ruta, "utf8"));
    const lista: unknown = datos?.ventanas;
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((v): v is VentanaOlvidada => typeof v?.desde === "number" && typeof v?.hasta === "number" && v.hasta > v.desde)
      .slice(-MAX_OLVIDADAS);
  } catch {
    return [];
  }
}

/** Anota una ventana olvidada (permisos de solo el usuario). */
function anotarOlvidada(ruta: string | undefined, ventana: VentanaOlvidada): void {
  if (!ruta) return;
  const lista = leerOlvidadas(ruta);
  if (lista.some((v) => v.hasta === ventana.hasta)) return;
  lista.push(ventana);
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  writeFileSync(ruta, JSON.stringify({ ventanas: lista.slice(-MAX_OLVIDADAS) }), { mode: 0o600 });
  chmodSync(ruta, 0o600);
}

/** Los mensajes que no caen en una ventana olvidada. */
function sinOlvidados(mensajes: MensajeChat[], lugares: LugaresConversaciones): MensajeChat[] {
  const olvidadas = leerOlvidadas(lugares.olvidadas);
  if (olvidadas.length === 0) return mensajes;
  return mensajes.filter((m) => !olvidadas.some((v) => m.t > v.desde && m.t <= v.hasta));
}

/** Cuándo se cerró una conversación: la hora exacta del encabezado del resumen o, si no está, el minuto del nombre. */
function finDeConversacion(nombre: string, contenido: string): number | null {
  const partes = nombre.match(CONVERSACION);
  if (!partes) return null;
  const [, anio, mes, dia, hora, minuto] = partes.map(Number) as unknown as number[];
  const minutoCompleto = new Date(anio, mes - 1, dia, hora, minuto, 59, 999).getTime();
  const exacta = contenido.match(/^# Session: (\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\b/m);
  if (exacta) {
    const [a, m, d, h, mi, s] = exacta.slice(1).map(Number);
    const local = new Date(a, m - 1, d, h, mi, s, 999).getTime();
    // La hora del encabezado tiene que ser la del nombre (mismo minuto): si no, se confía en el nombre.
    if (Math.abs(local - minutoCompleto) < 60_000) return local;
  }
  return minutoCompleto;
}

/** Los cortes de conversaciones, del más viejo al más nuevo. */
export function cortesDeConversaciones(lugares: LugaresConversaciones): CorteDeConversacion[] {
  const cortes: CorteDeConversacion[] = [];
  for (const nombre of existsSync(lugares.conversaciones) ? readdirSync(lugares.conversaciones) : []) {
    const partes = nombre.match(CONVERSACION);
    if (!partes) continue;
    const ruta = join(lugares.conversaciones, nombre);
    if (!statSync(ruta).isFile()) continue;
    const fin = finDeConversacion(nombre, readFileSync(ruta, "utf8"));
    if (fin === null) continue;
    const [, anio, mes, dia, hora, minuto] = partes;
    cortes.push({
      id: nombre,
      fin,
      titulo: `Conversación del ${Number(dia)} de ${MESES[Number(mes) - 1]}, ${hora}:${minuto}`,
      fecha: new Date(Number(anio), Number(mes) - 1, Number(dia), Number(hora), Number(minuto)).toISOString(),
    });
  }
  // Lo olvidado deja de tener resumen, pero su final sigue separando a la conversación anterior de la siguiente.
  for (const v of leerOlvidadas(lugares.olvidadas)) {
    if (cortes.some((c) => Math.abs(c.fin - v.hasta) < 1000)) continue;
    cortes.push({ id: `olvidada:${v.hasta}`, fin: v.hasta, titulo: "", fecha: new Date(v.hasta).toISOString(), olvidada: true });
  }
  return cortes.sort((a, b) => a.fin - b.fin);
}

/** La ventana de tiempo de una conversación: de el corte anterior (sin incluir) al suyo; `actual` no tiene final. */
export function ventanaDe(id: string, cortes: readonly CorteDeConversacion[]): { desde: number; hasta: number } | null {
  if (id === ID_ACTUAL) return { desde: cortes.length > 0 ? cortes[cortes.length - 1].fin : -Infinity, hasta: Infinity };
  const i = cortes.findIndex((c) => c.id === id);
  if (i === -1) return null;
  return { desde: i > 0 ? cortes[i - 1].fin : -Infinity, hasta: cortes[i].fin };
}

function enVentana(mensaje: MensajeChat, ventana: { desde: number; hasta: number }): boolean {
  return mensaje.t > ventana.desde && mensaje.t <= ventana.hasta;
}

// ---------------------------------------------------------------- lo que ve la isla

/** Una conversación para la lista de «Anteriores». */
export interface ConversacionGuardada {
  id: string;
  titulo: string;
  fecha: string;
  /** Las primeras líneas, para reconocerla. */
  extracto: string;
  /** Cuántos mensajes tiene su chat completo (0: solo queda el resumen, las transcripciones ya no están). */
  mensajes: number;
}

/** Lo que se lee de una conversación: el chat completo si existe y, si no, su resumen. */
export interface ConversacionLeida {
  id: string;
  titulo: string;
  resumen: string;
  mensajes: MensajeChat[];
  /** Se cortó por tamaño (se muestran los últimos mensajes). */
  recortada: boolean;
}

/** Las conversaciones guardadas, de la más nueva a la más vieja; primero la que sigue abierta, si tiene mensajes. */
export function listarConversaciones(lugares: LugaresConversaciones): ConversacionGuardada[] {
  const cortes = cortesDeConversaciones(lugares);
  const todos = sinOlvidados(leerTranscripciones(lugares.transcripciones).flatMap((a) => a.mensajes), lugares);
  const lista: ConversacionGuardada[] = [];
  for (const corte of cortes) {
    if (corte.olvidada) continue;
    const ventana = ventanaDe(corte.id, cortes)!;
    const resumen = resumenDeConversacion(readFileSync(join(lugares.conversaciones, corte.id), "utf8"));
    lista.push({
      id: corte.id,
      titulo: corte.titulo,
      fecha: corte.fecha,
      extracto: recortar(resumen, 160),
      mensajes: todos.filter((m) => enVentana(m, ventana)).length,
    });
  }
  lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
  const ventanaActual = ventanaDe(ID_ACTUAL, cortes)!;
  const actuales = todos.filter((m) => enVentana(m, ventanaActual)).sort((a, b) => a.t - b.t);
  if (actuales.length > 0) {
    const primero = actuales.find((m) => m.rol === "tu") ?? actuales[0];
    lista.unshift({
      id: ID_ACTUAL,
      titulo: "La conversación de ahora",
      fecha: new Date(actuales[actuales.length - 1].t).toISOString(),
      extracto: recortar(primero.texto.replace(/\s+/g, " "), 160),
      mensajes: actuales.length,
    });
  }
  return lista;
}

/** Lee una conversación entera. El id es el nombre exacto de su resumen (`AAAA-MM-DD-HHMM.md`) o `actual`. */
export function leerConversacion(id: string, lugares: LugaresConversaciones): ConversacionLeida {
  if (id !== ID_ACTUAL && !CONVERSACION.test(id)) throw new Error("conversación no válida");
  const cortes = cortesDeConversaciones(lugares);
  const ventana = ventanaDe(id, cortes);
  if (!ventana || cortes.find((c) => c.id === id)?.olvidada) throw new Error("esa conversación ya no está");
  let mensajes = sinOlvidados(leerTranscripciones(lugares.transcripciones).flatMap((a) => a.mensajes), lugares)
    .filter((m) => enVentana(m, ventana))
    .sort((a, b) => a.t - b.t);
  if (id === ID_ACTUAL && mensajes.length === 0) throw new Error("esa conversación ya no está");
  let recortada = false;
  if (mensajes.length > MAX_MENSAJES) {
    mensajes = mensajes.slice(-MAX_MENSAJES);
    recortada = true;
  }
  let total = 0;
  const dentro: MensajeChat[] = [];
  for (const m of [...mensajes].reverse()) {
    total += m.texto.length;
    if (total > MAX_CARACTERES_CONVERSACION) {
      recortada = true;
      break;
    }
    dentro.unshift(m);
  }
  const corte = cortes.find((c) => c.id === id);
  const resumen =
    corte && existsSync(join(lugares.conversaciones, id)) ? recortar(resumenDeConversacion(readFileSync(join(lugares.conversaciones, id), "utf8")), 8000) : "";
  return { id, titulo: corte?.titulo ?? "La conversación de ahora", resumen, mensajes: dentro, recortada };
}

// ---------------------------------------------------------------- olvidar

/**
 * Olvida el chat completo de una conversación: manda a la Papelera las transcripciones cuyos mensajes son
 * TODOS de ella y anota su ventana de tiempo para que lo que quede en archivos que mezclan otra conversación
 * (no se reescriben archivos de Claude Code) deje de mostrarse. Llamar ANTES de borrar su resumen: el resumen
 * es lo que dice dónde empieza y termina. Devuelve cuántos archivos se borraron y cuántos quedaron (mezclados).
 */
export function olvidarConversacion(id: string, lugares: LugaresConversaciones, eliminar: (ruta: string) => void): { borradas: number; quedan: number } {
  const carpeta = lugares.transcripciones;
  const cortes = cortesDeConversaciones(lugares);
  const ventana = ventanaDe(id, cortes);
  if (!ventana || id === ID_ACTUAL) return { borradas: 0, quedan: 0 };
  let borradas = 0;
  let quedan = 0;
  const rutas: string[] = [];
  for (const archivo of leerTranscripciones(carpeta)) {
    if (archivo.mensajes.length === 0) continue;
    const dentro = archivo.mensajes.filter((m) => enVentana(m, ventana)).length;
    if (dentro === archivo.mensajes.length) rutas.push(join(carpeta!, archivo.nombre));
    else if (dentro > 0) quedan++;
  }
  // Primero se anota (así, aunque falle un borrado, lo olvidado ya no se muestra) y después se borra.
  if (Number.isFinite(ventana.hasta)) anotarOlvidada(lugares.olvidadas, { desde: Number.isFinite(ventana.desde) ? ventana.desde : 0, hasta: ventana.hasta });
  for (const ruta of rutas) {
    eliminar(ruta);
    borradas++;
  }
  return { borradas, quedan };
}
