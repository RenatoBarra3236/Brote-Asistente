// Textos de las frases sin IA sobre el tiempo estudiado (A5). Puro.

import { MIN_RACHA, formatearMinutos } from "./estadisticas-tipos.ts";
import type { ProgresoMeta } from "./estadisticas-tipos.ts";
import type { Periodo } from "./periodos.ts";

export const TEXTO_SIN_DATOS = "Todavía no tengo registros de estudio. Empieza un pomodoro, marca un bloque de tu plan o dime «estudié 1 hora de cálculo» 🌱";

const PASADOS = new Set<Periodo>(["ayer", "la semana pasada", "el mes pasado"]);

function cuando(periodo: Periodo): string {
  return periodo === "hoy" ? "hoy" : periodo === "este año" ? "este año" : periodo;
}

/** «Esta semana llevas 6 h 20 min estudiados.» / «En Cálculo estudiaste 1 h ayer.» */
export function textoHorasEstudiadas(periodo: Periodo, minutos: number, ramo: string | null, comparacion: { pasadaMin: number } | null): string {
  const pasado = PASADOS.has(periodo);
  const verbo = pasado ? "estudiaste" : "llevas";
  if (minutos === 0) {
    const donde = ramo ? ` de ${ramo}` : "";
    return pasado ? `${periodo === "ayer" ? "Ayer" : `En ${periodo}`} no estudiaste nada${donde}.` : `Todavía no has estudiado nada${donde} ${cuando(periodo)}.`;
  }
  const base = ramo ? `En ${ramo} ${verbo} ${formatearMinutos(minutos)} ${cuando(periodo)}.` : `${cuando(periodo)[0].toUpperCase()}${cuando(periodo).slice(1)} ${verbo} ${formatearMinutos(minutos)} estudiados.`;
  if (comparacion && comparacion.pasadaMin > 0) return `${base} La semana pasada, a esta altura, ibas en ${formatearMinutos(comparacion.pasadaMin)}.`;
  return base;
}

export function textoRacha(dias: number, hoyMin: number): string {
  if (dias === 0) return `No tienes una racha todavía. Estudia al menos ${MIN_RACHA} minutos hoy para partir una 🌱`;
  const base = `🔥 Llevas ${dias === 1 ? "1 día" : `${dias} días`} seguidos estudiando (al menos ${MIN_RACHA} minutos cada día).`;
  return hoyMin >= MIN_RACHA ? base : `${base} Hoy llevas ${formatearMinutos(hoyMin)}: te faltan ${formatearMinutos(MIN_RACHA - hoyMin)} para no cortarla.`;
}

export function textoEstudioAnotado(minutos: number, ramo: string | null, ayer: boolean, avisoDia: boolean): string {
  const base = `Listo, anoté ${formatearMinutos(minutos)} de estudio${ramo ? ` de ${ramo}` : ""} (${ayer ? "ayer" : "hoy"}).`;
  return avisoDia ? `${base} Ojo: ese día ya suma más de 16 horas; si fue un error, bórralo en «Lo que sé de ti».` : base;
}

export const TEXTO_SIN_META = "No tienes una meta de estudio. Dime «mi meta es estudiar 10 horas a la semana» y la sigo contigo 🌱";

/** «Esta semana llevas 6 h 20 min de tu meta de 10 h (63 %).» / «¡Ya cumpliste tu meta de 10 h!» */
export function textoProgresoMeta(p: ProgresoMeta): string {
  const pct = Math.round(p.fraccion * 100);
  if (p.cumplida) return `¡Ya cumpliste tu meta de ${formatearMinutos(p.metaMin)}! 🎉 Llevas ${formatearMinutos(p.totalMin)} esta semana.`;
  return `Esta semana llevas ${formatearMinutos(p.totalMin)} de tu meta de ${formatearMinutos(p.metaMin)} (${pct} %): te faltan ${formatearMinutos(p.faltaMin)}.`;
}

export function textoMetaPuesta(metaMin: number, p: ProgresoMeta | null): string {
  const base = `Listo, tu meta es estudiar ${formatearMinutos(metaMin)} a la semana.`;
  return p ? `${base} ${p.cumplida ? "¡Esta semana ya la cumpliste!" : `Esta semana llevas ${formatearMinutos(p.totalMin)} (${Math.round(p.fraccion * 100)} %).`}` : base;
}

export const TEXTO_META_QUITADA = "Listo, quité tu meta de estudio. Sigo contando tu tiempo igual 🌱";
export const TEXTO_NO_HABIA_META = "No tenías una meta de estudio puesta.";
