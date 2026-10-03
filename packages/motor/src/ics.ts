// Lector mínimo de calendarios iCalendar (.ics), hecho a la medida de lo que exporta Google
// Calendar en su "dirección secreta en formato iCal": VEVENT con SUMMARY, LOCATION, DTSTART y DTEND
// (con zona horaria, en UTC o de día completo), RRULE semanal o diaria básica (INTERVAL, BYDAY,
// UNTIL, COUNT), EXDATE, RECURRENCE-ID (una clase que se movió) y STATUS:CANCELLED. Lo demás se
// ignora. Es puro: recibe el texto y devuelve los eventos de una ventana de tiempo.

export interface EventoCalendario {
  titulo: string;
  lugar: string | null;
  inicioMs: number;
  finMs: number;
  todoElDia: boolean;
}

interface Propiedad {
  nombre: string;
  parametros: Record<string, string>;
  valor: string;
}

/** Junta las líneas dobladas (las que siguen empiezan con espacio o tab) y separa cada propiedad. */
export function leerPropiedades(texto: string): Propiedad[] {
  const lineas = texto.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const propiedades: Propiedad[] = [];
  for (const linea of lineas) {
    // El nombre y los parámetros van antes del primer ":" que no esté entre comillas.
    let i = 0;
    let comillas = false;
    for (; i < linea.length; i++) {
      if (linea[i] === '"') comillas = !comillas;
      else if (linea[i] === ":" && !comillas) break;
    }
    if (i >= linea.length) continue;
    const [nombre, ...partes] = linea.slice(0, i).split(";");
    const parametros: Record<string, string> = {};
    for (const parte of partes) {
      const igual = parte.indexOf("=");
      if (igual > 0) parametros[parte.slice(0, igual).toUpperCase()] = parte.slice(igual + 1).replace(/^"|"$/g, "");
    }
    propiedades.push({ nombre: nombre.toUpperCase(), parametros, valor: linea.slice(i + 1) });
  }
  return propiedades;
}

/** "Sala B-12\, piso 2" → "Sala B-12, piso 2". */
export function desescapar(valor: string): string {
  return valor.replace(/\\([\\;,nN])/g, (_, letra: string) => (letra === "n" || letra === "N" ? "\n" : letra));
}

/** Cuántos ms está adelantada una zona horaria respecto de UTC en un instante (negativo en Chile). */
function desfase(instanteMs: number, zona: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instanteMs));
  const v = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second")) - Math.floor(instanteMs / 1000) * 1000;
}

/**
 * Una hora "de pared" (los componentes como si fueran UTC) en una zona → el instante real. Sin zona
 * (o con una que Intl no conoce, como las de Windows), se toma la hora local del computador.
 */
export function aInstante(pared: number, zona: string | null): number {
  if (zona) {
    try {
      const primero = pared - desfase(pared, zona);
      // Cerca de un cambio de horario el desfase puede ser otro: se corrige una vez.
      return pared - desfase(primero, zona);
    } catch {
      // Zona desconocida: se usa la local.
    }
  }
  const d = new Date(pared);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime();
}

/** La hora de pared de un instante en una zona (o en la local). */
function aPared(instante: number, zona: string | null): number {
  if (zona) {
    try {
      return instante + desfase(instante, zona);
    } catch {
      // Zona desconocida.
    }
  }
  const d = new Date(instante);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
}

interface Fecha {
  /** La hora de pared, con los componentes guardados como si fueran UTC. */
  pared: number;
  zona: string | null;
  utc: boolean;
  soloFecha: boolean;
}

/** DTSTART;TZID=America/Santiago:20261005T083000 · DTSTART:20261005T113000Z · DTSTART;VALUE=DATE:20261005 */
export function leerFecha(valor: string, parametros: Record<string, string> = {}): Fecha | null {
  const m = valor.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const pared = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
  const soloFecha = m[4] === undefined;
  return { pared, zona: m[7] || soloFecha ? null : (parametros.TZID ?? null), utc: m[7] === "Z", soloFecha };
}

function instante(fecha: Fecha): number {
  return fecha.utc ? fecha.pared : aInstante(fecha.pared, fecha.zona);
}

interface Regla {
  frecuencia: "DAILY" | "WEEKLY";
  intervalo: number;
  dias: number[] | null;
  hastaMs: number | null;
  cuantas: number | null;
}

const DIAS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** RRULE semanal o diaria. Otras frecuencias (mensual, anual) → `null`: solo cuenta la primera vez. */
export function leerRegla(valor: string): Regla | null {
  const partes = Object.fromEntries(valor.split(";").map((p) => p.split("=") as [string, string]));
  if (partes.FREQ !== "WEEKLY" && partes.FREQ !== "DAILY") return null;
  const hasta = partes.UNTIL ? leerFecha(partes.UNTIL) : null;
  const dias = partes.BYDAY
    ?.split(",")
    .map((d) => DIAS[d.replace(/^[+-]?\d+/, "")])
    .filter((d) => d !== undefined);
  return {
    frecuencia: partes.FREQ,
    intervalo: Math.max(1, Number(partes.INTERVAL) || 1),
    dias: dias && dias.length > 0 ? dias : null,
    hastaMs: hasta ? (hasta.utc ? hasta.pared : aInstante(hasta.pared + (hasta.soloFecha ? 86_400_000 - 1 : 0), null)) : null,
    cuantas: partes.COUNT ? Number(partes.COUNT) : null,
  };
}

const DIA = 86_400_000;
/** Para no recorrer reglas infinitas desde hace años: como mucho estas repeticiones. */
const MAXIMO_REPETICIONES = 5000;

/** Las horas de pared de cada repetición (en orden), hasta pasar `hastaPared`. */
function repeticiones(inicio: number, regla: Regla, hastaPared: number, enRango: (pared: number) => boolean): number[] {
  const resultado: number[] = [];
  let contadas = 0;
  const dentro = (pared: number) => {
    contadas++;
    if (enRango(pared)) resultado.push(pared);
  };
  const horaDelDia = ((inicio % DIA) + DIA) % DIA;
  const diaInicio = inicio - horaDelDia;
  if (regla.frecuencia === "DAILY") {
    for (let k = 0; k < MAXIMO_REPETICIONES; k++) {
      const pared = inicio + k * regla.intervalo * DIA;
      if (pared > hastaPared || (regla.cuantas !== null && contadas >= regla.cuantas)) break;
      dentro(pared);
    }
    return resultado;
  }
  // Semanal: semanas desde la del inicio (partiendo el lunes, como WKST=MO), cada `intervalo`.
  const dias = regla.dias ?? [new Date(inicio).getUTCDay()];
  const lunes = diaInicio - ((new Date(diaInicio).getUTCDay() + 6) % 7) * DIA;
  const ordenados = [...dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  for (let semana = 0; semana < MAXIMO_REPETICIONES; semana++) {
    const base = lunes + semana * regla.intervalo * 7 * DIA;
    if (base > hastaPared) break;
    for (const dia of ordenados) {
      const pared = base + ((dia + 6) % 7) * DIA + horaDelDia;
      if (pared < inicio) continue;
      if (pared > hastaPared || (regla.cuantas !== null && contadas >= regla.cuantas)) return resultado;
      dentro(pared);
    }
  }
  return resultado;
}

interface VEvento {
  uid: string | null;
  titulo: string;
  lugar: string | null;
  inicio: Fecha;
  duracionMs: number;
  regla: Regla | null;
  excepciones: Set<number>;
  recurrenciaDe: number | null;
}

function leerDuracionIso(valor: string): number | null {
  const m = valor.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, signo, s, d, h, mi, se] = m;
  const ms = ((Number(s ?? 0) * 7 + Number(d ?? 0)) * 24 * 3600 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(se ?? 0)) * 1000;
  return signo === "-" ? -ms : ms;
}

function leerEventos(texto: string): VEvento[] {
  const eventos: VEvento[] = [];
  let actual: Propiedad[] | null = null;
  let anidado = 0;
  for (const p of leerPropiedades(texto)) {
    if (p.nombre === "BEGIN" && p.valor.toUpperCase() === "VEVENT") {
      actual = [];
      anidado = 0;
    } else if (actual && p.nombre === "BEGIN") {
      anidado++; // VALARM dentro del evento: se salta.
    } else if (actual && p.nombre === "END" && p.valor.toUpperCase() !== "VEVENT") {
      anidado--;
    } else if (actual && p.nombre === "END") {
      const evento = armar(actual);
      if (evento) eventos.push(evento);
      actual = null;
    } else if (actual && anidado === 0) {
      actual.push(p);
    }
  }
  return eventos;
}

function armar(propiedades: Propiedad[]): VEvento | null {
  const una = (nombre: string) => propiedades.find((p) => p.nombre === nombre);
  if (una("STATUS")?.valor.toUpperCase() === "CANCELLED") return null;
  const dtstart = una("DTSTART");
  const inicio = dtstart ? leerFecha(dtstart.valor, dtstart.parametros) : null;
  if (!inicio) return null;
  const dtend = una("DTEND");
  const fin = dtend ? leerFecha(dtend.valor, dtend.parametros) : null;
  const duracion = una("DURATION");
  let duracionMs = inicio.soloFecha ? DIA : 0;
  if (fin) duracionMs = inicio.soloFecha ? fin.pared - inicio.pared : instante(fin) - instante(inicio);
  else if (duracion) duracionMs = leerDuracionIso(duracion.valor) ?? duracionMs;
  const excepciones = new Set<number>();
  for (const p of propiedades.filter((p) => p.nombre === "EXDATE")) {
    for (const valor of p.valor.split(",")) {
      const fecha = leerFecha(valor, p.parametros);
      if (fecha) excepciones.add(fecha.soloFecha ? fecha.pared : instante(fecha));
    }
  }
  const rid = una("RECURRENCE-ID");
  const recurrencia = rid ? leerFecha(rid.valor, rid.parametros) : null;
  const rrule = una("RRULE");
  return {
    uid: una("UID")?.valor ?? null,
    titulo: desescapar(una("SUMMARY")?.valor ?? "").trim() || "(sin título)",
    lugar: desescapar(una("LOCATION")?.valor ?? "").trim() || null,
    inicio,
    duracionMs: Math.max(0, duracionMs),
    regla: rrule ? leerRegla(rrule.valor) : null,
    excepciones,
    recurrenciaDe: recurrencia ? (recurrencia.soloFecha ? recurrencia.pared : instante(recurrencia)) : null,
  };
}

/**
 * Los eventos (con sus repeticiones) que se cruzan con [desdeMs, hastaMs), ordenados por inicio.
 * Los de día completo empiezan a medianoche local.
 */
export function eventosIcs(texto: string, desdeMs: number, hastaMs: number): EventoCalendario[] {
  const vevents = leerEventos(texto);
  // Las repeticiones movidas o editadas (RECURRENCE-ID) reemplazan a la original de ese día.
  const movidas = new Map<string, Set<number>>();
  for (const e of vevents) {
    if (e.uid && e.recurrenciaDe !== null) {
      if (!movidas.has(e.uid)) movidas.set(e.uid, new Set());
      movidas.get(e.uid)!.add(e.recurrenciaDe);
    }
  }
  const resultado: EventoCalendario[] = [];
  for (const e of vevents) {
    const zona = e.inicio.soloFecha ? null : e.inicio.utc ? "UTC" : e.inicio.zona;
    const aCuando = (pared: number) => (e.inicio.soloFecha ? aInstante(pared, null) : e.inicio.utc ? pared : aInstante(pared, zona));
    const agregar = (inicioMs: number, clave: number) => {
      const finMs = e.inicio.soloFecha ? aInstante(clave + e.duracionMs, null) : inicioMs + e.duracionMs;
      if (finMs <= desdeMs || inicioMs >= hastaMs) return;
      resultado.push({ titulo: e.titulo, lugar: e.lugar, inicioMs, finMs: Math.max(finMs, inicioMs), todoElDia: e.inicio.soloFecha });
    };
    if (!e.regla || e.recurrenciaDe !== null) {
      agregar(aCuando(e.inicio.pared), e.inicio.pared);
      continue;
    }
    const excluidas = new Set([...e.excepciones, ...(e.uid ? (movidas.get(e.uid) ?? []) : [])]);
    // Se recorre en hora de pared (una clase a las 8:30 sigue a las 8:30 después del cambio de hora).
    const hastaPared = Math.min(aPared(hastaMs, zona) + DIA, e.regla.hastaMs !== null ? aPared(e.regla.hastaMs, zona) : Infinity);
    const desdePared = aPared(desdeMs, zona) - e.duracionMs - DIA;
    for (const pared of repeticiones(e.inicio.pared, e.regla, hastaPared, (p) => p >= desdePared)) {
      const inicioMs = aCuando(pared);
      if (excluidas.has(e.inicio.soloFecha ? pared : inicioMs)) continue;
      if (e.regla.hastaMs !== null && inicioMs > e.regla.hastaMs) break;
      agregar(inicioMs, pared);
    }
  }
  return resultado.sort((a, b) => a.inicioMs - b.inicioMs || a.titulo.localeCompare(b.titulo));
}
