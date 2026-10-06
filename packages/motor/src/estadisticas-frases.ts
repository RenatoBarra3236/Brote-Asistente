// Textos de las frases sin IA sobre el tiempo estudiado (A5). Puro.

import { MIN_RACHA, formatearMinutos } from "./estadisticas-tipos.ts";
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
