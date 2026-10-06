// Las estadísticas de estudio en la isla (A5 de docs/plan-estudio-y-mejoras.md): textos y reglas puras, sin
// DOM, para probarlas con Node. Los cálculos los hace el motor (`resumirEstudio`).

import { formatearMinutos } from "../../../../packages/motor/src/estadisticas-tipos.ts";
import type { ResumenEstudio, TotalDeRamo } from "../../../../packages/motor/src/estadisticas-tipos.ts";

export type { ResumenEstudio, TotalDeRamo };
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

// ---- «Lo que sé de ti → Estadísticas de estudio» --------------------------------------------------------------

export const NOTA_ESTADISTICAS_MEMORIA =
  "El tiempo que estudias se guarda solo en tu computador, en una base de datos de Brote (cuánto, cuándo y de qué ramo; nada de tus clases). Al borrarlo desaparece de verdad (no hay Papelera).";

export function avisoEstadisticasBorradas(n: number): string {
  return n === 1 ? "Borré 1 registro de estudio." : `Borré ${n} registros de estudio.`;
}
