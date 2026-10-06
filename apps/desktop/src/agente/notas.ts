// Las notas en la pestaña Estudio y en «Lo que sé de ti» (A2 de docs/plan-estudio-y-mejoras.md): textos y
// reglas puras, sin DOM, para probarlas con Node. Los cálculos los hace el motor (`armarFichaNotas`).

import type { FichaNotas } from "../../../../packages/motor/src/notas-ficha.ts";
import { formatearNota, leerNota } from "../../../../packages/motor/src/notas-tipos.ts";
import type { Evaluacion, ResultadoNecesaria } from "../../../../packages/motor/src/notas-tipos.ts";

export type { FichaNotas, Evaluacion };
export { formatearNota, leerNota };

export type Semaforo = "verde" | "ambar" | "rojo" | "neutro";

export const HEX_SEMAFORO: Record<Semaforo, string> = {
  verde: "#5bc08a",
  ambar: "#e8b04a",
  rojo: "#e8675f",
  neutro: "#9aa3ad",
};

/** Verde si ya aprobó o la nota que falta es razonable, ámbar si exige mucho, rojo si no alcanza. */
export function semaforoDe(ficha: FichaNotas): Semaforo {
  const c = ficha.calculo;
  if (ficha.evaluaciones.length === 0) return "neutro";
  if (c.veredicto === "aprobado") return "verde";
  if (c.veredicto === "imposible" || c.veredicto === "sin-pendientes-reprobado") return "rojo";
  if (c.necesariaEnPendientes === null) return "neutro";
  return c.necesariaEnPendientes > 5.5 ? "ambar" : "verde";
}

/** «Promedio 5,2 · necesitas 3,9» en la cabecera de la ficha del ramo. */
export function resumenNotas(ficha: FichaNotas | undefined): string {
  if (!ficha || ficha.evaluaciones.length === 0) return "Sin notas";
  const c = ficha.calculo;
  const promedio = c.promedio === null ? "sin notas aún" : `promedio ${formatearNota(c.promedio)}`;
  if (c.veredicto === "aprobado") return `${promedio} · aprobado`;
  if (c.veredicto === "imposible") return `${promedio} · no alcanza`;
  if (c.veredicto === "sin-pendientes-reprobado") return `${promedio} · reprobado`;
  return c.necesariaEnPendientes === null ? promedio : `${promedio} · necesitas ${formatearNota(Math.min(7, Math.ceil(c.necesariaEnPendientes * 10 - 1e-9) / 10))}`;
}

/** La línea grande de la ficha: «Necesitas un 5,4 en Certamen 2 para aprobar». */
export function textoMeta(ficha: FichaNotas): string {
  const c = ficha.calculo;
  if (ficha.evaluaciones.length === 0) return "Agrega tus evaluaciones y sus pesos para saber cuánto necesitas.";
  if (c.veredicto === "aprobado") return "Ya tienes el ramo aprobado 🎉";
  if (c.veredicto === "sin-pendientes-reprobado") return "Con todo rendido, el promedio no alcanza para aprobar.";
  if (c.veredicto === "imposible") return `Ni sacando 7,0 en todo lo que falta llegas a aprobar (máximo ${formatearNota(c.maximoPosible as number)}).`;
  const pendientes = ficha.evaluaciones.filter((e) => e.nota === null);
  const unica = pendientes.length === 1 && ficha.ajustes.examenPeso === null ? ficha.necesarias[pendientes[0].id] : null;
  if (unica) return `Necesitas un ${formatearNota(unica.redondeada)} en ${pendientes[0].nombre} para aprobar.`;
  if (c.necesariaEnPendientes === null) return "";
  const nota = formatearNota(Math.min(7, Math.ceil(c.necesariaEnPendientes * 10 - 1e-9) / 10));
  const examen = ficha.ajustes.examenPeso !== null ? " (incluye el examen)" : "";
  return `Necesitas un ${nota} de promedio en el ${c.pesoPendiente} % que falta${examen}.`;
}

/** Lo que se escribe junto a una evaluación pendiente: «necesitas 4,0» (o «ya no alcanza»). */
export function textoNecesaria(r: ResultadoNecesaria | undefined): string {
  if (!r) return "";
  if (r.veredicto === "aprobado") return "sin presión";
  if (r.veredicto === "imposible") return "ya no alcanza";
  return `necesitas ${formatearNota(r.redondeada)}`;
}

/** Texto del examen en la ficha, o null si el ramo no tiene examen. */
export function textoExamenFicha(ficha: FichaNotas): string | null {
  const e = ficha.examen;
  if (!e || ficha.ajustes.examenPeso === null) return null;
  const base = `Examen ${ficha.ajustes.examenPeso} %`;
  if (e.veredicto === "falta-presentacion") return `${base} · falta alguna nota del período`;
  if (e.veredicto === "sin-presentacion-minima") return `${base} · presentación ${formatearNota(e.presentacion as number)}: no llega a la mínima`;
  if (e.veredicto === "aprobado") return `${base} · ya apruebas`;
  if (e.veredicto === "imposible") return `${base} · ya no alcanza`;
  return `${base} · con presentación ${formatearNota(e.presentacion as number)} necesitas ${formatearNota(e.redondeada as number)}`;
}

/** Posición (0–100) de una nota en la barra de 1,0 a 7,0. */
export function posicionEnBarra(nota: number): number {
  return Math.max(0, Math.min(100, ((nota - 1) / 6) * 100));
}

/** El campo de nota de la isla: vacío = pendiente; coma o punto; fuera de 1,0–7,0 = error. */
export function leerCampoNota(texto: string): { ok: true; nota: number | null } | { ok: false; motivo: string } {
  const t = texto.trim();
  if (t === "") return { ok: true, nota: null };
  const n = leerNota(t);
  return n === null ? { ok: false, motivo: "La nota va de 1,0 a 7,0 (por ejemplo 5,5)" } : { ok: true, nota: Math.round(n * 10) / 10 };
}

/** El campo de peso: «30» o «30 %». */
export function leerCampoPeso(texto: string): { ok: true; peso: number } | { ok: false; motivo: string } {
  const m = /^\s*(\d{1,3})\s*(?:%|por ciento)?\s*$/i.exec(texto);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 100 ? { ok: true, peso: n } : { ok: false, motivo: "El peso es un porcentaje entero entre 1 y 100" };
}

export const TEXTO_SIN_NOTAS_MEMORIA = "Todavía no hay notas guardadas. Las evaluaciones y notas de tus ramos aparecerán aquí.";

/** Las notas están en una base de datos, no en archivos: no hay Papelera, se borran de verdad. */
export const NOTA_NOTAS_MEMORIA = "Las notas se guardan solo en tu computador, en una base de datos de Brote. Al borrarlas desaparecen de verdad (no hay Papelera).";

export function avisoNotasBorradas(ramo: string | null, n: number): string {
  const que = n === 1 ? "1 evaluación" : `${n} evaluaciones`;
  return ramo === null ? `Borré todas tus notas (${que}).` : `Borré las notas de ${ramo} (${que}).`;
}

// ---- La comparación de ramos (B3 de docs/plan-estudio-y-mejoras.md) ----------------------------------------------

export interface BarraNota {
  ramoId: number;
  /** Del ancho de la caja, entre 0 y 100: la escala 1,0–7,0 completa. */
  pct: number;
  /** Dónde está la nota de aprobación de ese ramo en la misma escala. */
  aprobacionPct: number;
  promedio: number;
  semaforo: Semaforo;
  texto: string;
}

/** La nota en la escala 1,0–7,0 como porcentaje del ancho. */
export function pctDeNota(nota: number): number {
  return Math.min(100, Math.max(0, ((nota - 1) / 6) * 100));
}

/**
 * Los ramos con promedio, el más en riesgo primero (menor holgura contra su aprobación). Solo entran los que
 * ya tienen alguna nota rendida; un ramo sin notas no se compara.
 */
export function barrasDeNotas(fichas: readonly FichaNotas[], activos: ReadonlySet<number>): BarraNota[] {
  return fichas
    .filter((f) => activos.has(f.ramoId) && f.calculo.promedio !== null)
    .map((f) => {
      const promedio = f.calculo.promedio as number;
      return { ramoId: f.ramoId, pct: pctDeNota(promedio), aprobacionPct: pctDeNota(f.ajustes.aprobacion), promedio, semaforo: semaforoDe(f), texto: resumenNotas(f), holgura: promedio - f.ajustes.aprobacion };
    })
    .sort((a, b) => a.holgura - b.holgura || a.ramoId - b.ramoId)
    .map(({ holgura: _h, ...barra }) => barra);
}
