// Las estadísticas de estudio en la isla (A5 de docs/plan-estudio-y-mejoras.md): textos y reglas puras, sin
// DOM, para probarlas con Node. Los cálculos los hace el motor (`resumirEstudio`).

import { formatearMinutos } from "../../../../packages/motor/src/estadisticas-tipos.ts";
import { serieDeRamo } from "../../../../packages/motor/src/estadisticas-tipos.ts";
import type { ResumenEstudio, SemanaEstudio, TotalDeRamo } from "../../../../packages/motor/src/estadisticas-tipos.ts";

export type { ResumenEstudio, SemanaEstudio, TotalDeRamo };
export { serieDeRamo };
export { formatearMinutos };

export const LETRAS_DIAS = ["L", "M", "M", "J", "V", "S", "D"] as const;
const NOMBRES_DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const RESUMEN_VACIO: ResumenEstudio = {
  desdeSemanaMs: 0,
  totalMin: 0,
  pasadaMin: 0,
  porDia: [0, 0, 0, 0, 0, 0, 0],
  hoy: 0,
  hoyMin: 0,
  porRamo: [],
  totales: [],
  racha: 0,
  totalHistoricoMin: 0,
  desdeMs: null,
  hay: false,
};

export const TEXTO_SIN_DATOS =
  "Aún no hay tiempo de estudio registrado. Empieza un pomodoro, marca un bloque de tu plan o escribe «estudié 1 hora de cálculo». Las estadísticas parten el día en que se instaló esta versión.";

/** «+1 h 10 min que la semana pasada», «−20 min que la semana pasada», «igual que la semana pasada» (a la misma altura). */
export function textoDiferencia(totalMin: number, pasadaMin: number): string | null {
  if (pasadaMin <= 0) return null;
  const d = totalMin - pasadaMin;
  if (d === 0) return "igual que la semana pasada";
  return `${d > 0 ? "+" : "−"}${formatearMinutos(Math.abs(d))} que la semana pasada`;
}

export function textoRachaCorto(dias: number): string | null {
  return dias <= 0 ? null : `🔥 ${dias === 1 ? "1 día" : `${dias} días`}`;
}

/** La altura (0 a 100) de cada barra: la mayor llena la caja; lo que tiene algo nunca queda invisible. */
export function alturasBarras(porDia: readonly number[]): number[] {
  const max = Math.max(...porDia, 0);
  if (max === 0) return porDia.map(() => 0);
  return porDia.map((m) => (m <= 0 ? 0 : Math.max(6, Math.round((m / max) * 100))));
}

export function etiquetaDia(i: number, min: number): string {
  return `${NOMBRES_DIAS[i]}: ${min === 0 ? "nada" : formatearMinutos(min)}`;
}

export interface BarraRamo {
  ramoId: number | null | "otros";
  etiqueta: string;
  min: number;
  fraccion: number;
}

/** Las barras por ramo de esta semana: los `tope` que más y el resto agrupado en «Otros». */
export function barrasPorRamo(porRamo: ResumenEstudio["porRamo"], nombre: (ramoId: number | null) => string, tope = 5): BarraRamo[] {
  const primeros = porRamo.slice(0, tope).map((r) => ({ ramoId: r.ramoId, etiqueta: nombre(r.ramoId), min: r.min, fraccion: r.fraccion }));
  const resto = porRamo.slice(tope);
  if (resto.length === 0) return primeros;
  return [...primeros, { ramoId: "otros", etiqueta: "Otros", min: resto.reduce((a, r) => a + r.min, 0), fraccion: resto.reduce((a, r) => a + r.fraccion, 0) }];
}

/** «Esta semana: 2 h 10 min · en total: 14 h», o null si el ramo no tiene nada. */
export function lineaDeRamo(total: TotalDeRamo | undefined): string | null {
  if (!total || total.totalMin <= 0) return null;
  return `Esta semana: ${total.semanaMin > 0 ? formatearMinutos(total.semanaMin) : "nada"} · en total: ${formatearMinutos(total.totalMin)}`;
}

export function textoDesde(desdeMs: number | null): string | null {
  if (desdeMs === null) return null;
  const f = new Date(desdeMs);
  return `Contando desde el ${f.getDate()} ${MESES[f.getMonth()]}`;
}

// ---- La meta semanal (E3 de docs/plan-estudio-y-mejoras.md) ---------------------------------------------------

/** La frase que se escribe en el campo para poner o cambiar la meta (el usuario solo ajusta el número). */
export const FRASE_PONER_META = "mi meta es estudiar 10 horas a la semana";

/**
 * Lo que dice la línea de la meta bajo el total: «6 h 20 min de 10 h», o «🎯 ¡Meta cumplida! 12 h de 10 h».
 * Sin reproches: si no llegas, la barra solo está a medias.
 */
export function textoDeMeta(meta: NonNullable<ResumenEstudio["meta"]>): { texto: string; cumplida: boolean; pct: number } {
  const pct = Math.round(meta.fraccion * 100);
  return meta.cumplida
    ? { texto: `🎯 ¡Meta cumplida! ${formatearMinutos(meta.totalMin)} de ${formatearMinutos(meta.metaMin)}`, cumplida: true, pct: 100 }
    : { texto: `${formatearMinutos(meta.totalMin)} de ${formatearMinutos(meta.metaMin)} · meta semanal`, cumplida: false, pct };
}

// ---- Las 8 semanas (B3 de docs/plan-estudio-y-mejoras.md) ----------------------------------------------------

export interface SegmentoSemana {
  ramoId: number | null;
  /** Del alto de la columna, entre 0 y 100. */
  pct: number;
}
export interface ColumnaSemana {
  /** Del alto de la caja del gráfico, entre 0 y 100: la semana más estudiada llena la caja. */
  altoPct: number;
  segmentos: SegmentoSemana[];
  actual: boolean;
  /** La fecha del lunes, «5/10»: lo que va bajo la columna. */
  etiqueta: string;
  titulo: string;
}

/** «5/10» (día/mes del lunes de esa semana). */
export function etiquetaSemana(desdeMs: number): string {
  const f = new Date(desdeMs);
  return `${f.getDate()}/${f.getMonth() + 1}`;
}

/** «5–11 oct (esta semana): 6 h 20 min · Cálculo 4 h, Física 2 h» (con los 3 ramos que más pesaron). */
export function tituloDeSemanaEstudio(s: SemanaEstudio, nombre: (ramoId: number | null) => string): string {
  const a = new Date(s.desdeMs);
  const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6);
  const rango = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MESES[b.getMonth()]}` : `${a.getDate()} ${MESES[a.getMonth()]} – ${b.getDate()} ${MESES[b.getMonth()]}`;
  const cabeza = `${rango}${s.actual ? " (esta semana, va a medias)" : ""}`;
  if (s.totalMin <= 0) return `${cabeza}: nada`;
  const ramos = s.porRamo.slice(0, 3).map((r) => `${nombre(r.ramoId)} ${formatearMinutos(r.min)}`);
  return `${cabeza}: ${formatearMinutos(s.totalMin)} · ${ramos.join(", ")}${s.porRamo.length > 3 ? " y más" : ""}`;
}

/**
 * Cómo se reparte una columna entre los ramos: cada uno ocupa su parte del total, pero nunca menos de un 4 %
 * (un ramo con un rato corto igual se ve). Los porcentajes suman 100 y siguen el orden de `porRamo`.
 */
export function segmentosApilados(porRamo: readonly { ramoId: number | null; min: number }[], totalMin: number): SegmentoSemana[] {
  const brutos = porRamo.map((r) => Math.max(4, (r.min / Math.max(1, totalMin)) * 100));
  const suma = brutos.reduce((t, x) => t + x, 0) || 1;
  return porRamo.map((r, i) => ({ ramoId: r.ramoId, pct: (brutos[i] / suma) * 100 }));
}

export interface ColumnaDia {
  altoPct: number;
  segmentos: SegmentoSemana[];
  titulo: string;
}

/** «martes: 2 h · Programación 1 h, Redes 1 h» (los 3 ramos que más pesaron). */
export function tituloDelDiaConRamos(i: number, min: number, porRamo: readonly { ramoId: number | null; min: number }[], nombre: (ramoId: number | null) => string): string {
  const base = etiquetaDia(i, min);
  if (min <= 0 || porRamo.length === 0) return base;
  return `${base} · ${porRamo.slice(0, 3).map((r) => `${nombre(r.ramoId)} ${formatearMinutos(r.min)}`).join(", ")}${porRamo.length > 3 ? " y más" : ""}`;
}

/**
 * Las siete barras de la semana, cada una apilada por ramo. La altura sigue siendo la del día más estudiado
 * (`alturasBarras`); si el puente no manda el desglose por ramo, quedan sin segmentos (una barra lisa).
 */
export function columnasDias(resumen: ResumenEstudio, nombre: (ramoId: number | null) => string): ColumnaDia[] {
  const alturas = alturasBarras(resumen.porDia);
  return resumen.porDia.map((min, i) => {
    const porRamo = resumen.porDiaRamo?.[i] ?? [];
    return { altoPct: alturas[i], segmentos: segmentosApilados(porRamo, porRamo.reduce((t, r) => t + r.min, 0) || min), titulo: tituloDelDiaConRamos(i, min, porRamo, nombre) };
  });
}

/**
 * Las columnas apiladas de las semanas, de la más vieja a la actual. La mayor llena la caja; una semana con algo
 * nunca queda invisible (mínimo 6 %) y cada ramo, si tiene algo, ocupa al menos un 4 % de su columna.
 */
export function columnasSemanas(semanas: readonly SemanaEstudio[], nombre: (ramoId: number | null) => string): ColumnaSemana[] {
  const max = Math.max(0, ...semanas.map((x) => x.totalMin));
  return semanas.map((s) => {
    const altoPct = max <= 0 || s.totalMin <= 0 ? 0 : Math.max(6, Math.round((s.totalMin / max) * 100));
    return {
      altoPct,
      segmentos: segmentosApilados(s.porRamo, s.totalMin),
      actual: s.actual,
      etiqueta: etiquetaSemana(s.desdeMs),
      titulo: tituloDeSemanaEstudio(s, nombre),
    };
  });
}

/**
 * Lo que estudias por semana en promedio: solo las semanas completas desde que hay datos (la actual está a
 * medias y las anteriores a la instalación no existen). `null` si todavía no hay ninguna semana completa.
 */
export function promedioSemanal(semanas: readonly SemanaEstudio[], desdeMs: number | null): { minutos: number; semanas: number } | null {
  if (desdeMs === null) return null;
  const completas = semanas.filter((s) => !s.actual && s.desdeMs + 7 * 86_400_000 > desdeMs);
  if (completas.length === 0) return null;
  return { minutos: Math.round(completas.reduce((t, s) => t + s.totalMin, 0) / completas.length), semanas: completas.length };
}

export function textoPromedio(p: { minutos: number; semanas: number } | null): string | null {
  if (!p) return null;
  return `Promedio: ${formatearMinutos(p.minutos)} por semana (${p.semanas === 1 ? "1 semana completa" : `${p.semanas} semanas completas`})`;
}

export interface LineaMini {
  /** Los puntos de la línea, «x,y x,y …», en una caja de `ancho` × `alto`. */
  puntos: string;
  ultimo: { x: number; y: number };
  max: number;
}

/** La mini-línea de un ramo: sus minutos por semana, la más alta arriba. `null` si no hay nada que dibujar. */
export function lineaMini(serie: readonly number[], ancho: number, alto: number, margen = 2): LineaMini | null {
  const max = Math.max(0, ...serie);
  if (serie.length < 2 || max <= 0) return null;
  const paso = (ancho - margen * 2) / (serie.length - 1);
  const punto = (v: number, i: number) => ({ x: margen + i * paso, y: margen + (alto - margen * 2) * (1 - v / max) });
  const pts = serie.map(punto);
  return { puntos: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "), ultimo: pts[pts.length - 1], max };
}

/** «Últimas 8 semanas de este ramo: 1 h, 0 min, …» para el lector de pantalla. */
export function textoSerie(serie: readonly number[]): string {
  return `Minutos por semana, de la más vieja a esta: ${serie.map((m) => formatearMinutos(m)).join(", ")}`;
}

// ---- «Lo que sé de ti → Estadísticas de estudio» --------------------------------------------------------------

export const NOTA_ESTADISTICAS_MEMORIA =
  "El tiempo que estudias se guarda solo en tu computador, en una base de datos de Brote (cuánto, cuándo y de qué ramo; nada de tus clases). Al borrarlo desaparece de verdad (no hay Papelera).";

export function avisoEstadisticasBorradas(n: number): string {
  return n === 1 ? "Borré 1 registro de estudio." : `Borré ${n} registros de estudio.`;
}
