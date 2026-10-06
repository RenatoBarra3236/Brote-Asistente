// Metas y celebraciones del estudio (E3 de docs/plan-estudio-y-mejoras.md): cuándo celebrar que cumpliste tu
// meta de la semana y los hitos de la racha (3, 7, 14 y 30 días), una sola vez cada uno. Puro: lo que se
// recuerda entre una revisión y otra (`AvisosEstudio`) lo guarda quien llama. Nunca avisa cuando pierdes una
// racha o no llegas a la meta.

import { formatearMinutos, inicioDeSemana, minutosEnRango, racha } from "./estadisticas-tipos.ts";
import type { RegistroEstudio } from "./estadisticas-tipos.ts";

export const HITOS_RACHA = [3, 7, 14, 30] as const;

/** Lo ya celebrado: la semana de la última meta cumplida, la racha vista y el hito más alto celebrado en ella. */
export interface AvisosEstudio {
  /** Lunes de la semana en que se celebró la meta, «AAAA-MM-DD». */
  semana: string | null;
  racha: number;
  hito: number;
}

export interface CelebracionEstudio {
  tipo: "meta" | "racha";
  texto: string;
}

/** «2026-10-05»: el lunes de la semana de `ms`, en hora local. */
export function claveDeSemana(ms: number): string {
  const d = new Date(inicioDeSemana(ms));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function textoMetaCumplida(metaMin: number): string {
  return `🎯 ¡Meta semanal cumplida! ${formatearMinutos(metaMin)} 🌱`;
}

export function textoHitoRacha(dias: number): string {
  return `🔥 ¡${dias} días seguidos estudiando!`;
}

/** Lee lo guardado (texto JSON) sin fiarse de él: cualquier cosa rara es «no hay nada celebrado». */
export function leerAvisosEstudio(texto: string | null): AvisosEstudio | null {
  if (!texto) return null;
  try {
    const v = JSON.parse(texto) as Partial<AvisosEstudio>;
    const semana = typeof v.semana === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.semana) ? v.semana : null;
    const racha = Number.isInteger(v.racha) && (v.racha as number) >= 0 ? (v.racha as number) : 0;
    const hito = Number.isInteger(v.hito) && (v.hito as number) >= 0 ? (v.hito as number) : 0;
    return { semana, racha, hito };
  } catch {
    return null;
  }
}

/**
 * Qué celebrar ahora y lo que hay que recordar para no repetirlo. La meta se celebra una vez por semana al
 * llegar; un hito de racha, una vez por racha (si la racha se corta y vuelves a partir, vuelven a contar).
 */
export function celebracionesDeEstudio(registros: readonly RegistroEstudio[], metaMin: number | null, ahoraMs: number, previos: AvisosEstudio | null): { celebraciones: CelebracionEstudio[]; avisos: AvisosEstudio } {
  const celebraciones: CelebracionEstudio[] = [];
  const semanaClave = claveDeSemana(ahoraMs);
  let semana = previos?.semana ?? null;
  if (metaMin !== null) {
    const lunes = inicioDeSemana(ahoraMs);
    const total = minutosEnRango(registros, lunes, new Date(new Date(lunes).getFullYear(), new Date(lunes).getMonth(), new Date(lunes).getDate() + 7).getTime());
    if (total >= metaMin && semana !== semanaClave) {
      celebraciones.push({ tipo: "meta", texto: textoMetaCumplida(metaMin) });
      semana = semanaClave;
    }
  }
  const dias = racha(registros, ahoraMs);
  // Si la racha bajó, es una nueva: empieza sin hitos celebrados.
  let hito = previos && dias >= previos.racha ? previos.hito : 0;
  const nuevo = Math.max(0, ...HITOS_RACHA.filter((h) => h <= dias && h > hito));
  if (nuevo > 0) {
    celebraciones.push({ tipo: "racha", texto: textoHitoRacha(nuevo) });
    hito = nuevo;
  }
  return { celebraciones, avisos: { semana, racha: dias, hito } };
}
