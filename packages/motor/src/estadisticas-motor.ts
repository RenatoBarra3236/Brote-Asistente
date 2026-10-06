// Lo que el motor hace con las frases del tiempo estudiado (A5): «¿cuánto he estudiado esta semana?»,
// «¿cuál es mi racha?» y «estudié 2 horas de cálculo». Devuelve el texto; `null` = «no es para mí» y la
// frase sigue al agente. Nunca adivina el ramo.

import type { EstadisticasEstudio } from "./estadisticas.ts";
import { minutosEnRango, racha, resumirEstudio } from "./estadisticas-tipos.ts";
import { TEXTO_SIN_DATOS, textoEstudioAnotado, textoHorasEstudiadas, textoRacha } from "./estadisticas-frases.ts";
import { buscarRamo } from "./notas-motor.ts";
import { FORMAS_DE_PERIODO, rangoDe } from "./periodos.ts";
import type { Periodo } from "./periodos.ts";
import type { Ramos } from "./ramos.ts";
import { leerDuracion } from "./tiempo.ts";

export type AccionEstadisticas =
  | { intencion: "estudio-horas"; periodo: Periodo | null; ramo: string | null }
  | { intencion: "estudio-racha" }
  | { intencion: "estudio-anotar"; minutos: number; ramo: string | null; ayer: boolean };

export interface ContextoEstadisticas {
  ramos: Ramos;
  estadisticas: EstadisticasEstudio;
  ahoraMs: number;
}

export function interpretarEstadisticas(intencion: string, ranuras: Partial<Record<string, string>>, originales: Partial<Record<string, string>>): AccionEstadisticas | null {
  const orig = (k: string): string => (originales[k] ?? "").trim();
  switch (intencion) {
    case "estudio-horas": {
      const periodo = ranuras.periodo === undefined ? null : (FORMAS_DE_PERIODO[ranuras.periodo] ?? null);
      if (ranuras.periodo !== undefined && periodo === null) return null;
      return { intencion, periodo, ramo: orig("cosa") || null };
    }
    case "estudio-racha":
      return { intencion };
    case "estudio-anotar": {
      const ms = ranuras.tiempo === undefined ? null : leerDuracion(ranuras.tiempo);
      if (ms === null) return null;
      return { intencion, minutos: Math.round(ms / 60_000), ramo: orig("cosa") || null, ayer: ranuras.dia === "ayer" };
    }
    default:
      return null;
  }
}

function noEncontreRamo(nombre: string): string {
  return `No encontré un ramo llamado ${nombre}. Dime «mis ramos» para ver los que tienes.`;
}

export function responderEstadisticas(accion: AccionEstadisticas, ctx: ContextoEstadisticas): string | null {
  const registros = ctx.estadisticas.registros();
  const ramos = ctx.ramos.listar();

  if (accion.intencion === "estudio-anotar") {
    let ramoId: number | null = null;
    let nombre: string | null = null;
    if (accion.ramo) {
      const r = buscarRamo(accion.ramo, ramos);
      if (!r) return noEncontreRamo(accion.ramo);
      ramoId = r.id;
      nombre = r.nombre;
    }
    const f = new Date(ctx.ahoraMs);
    const dia = accion.ayer ? new Date(f.getFullYear(), f.getMonth(), f.getDate() - 1).getTime() : ctx.ahoraMs;
    const r = ctx.estadisticas.anotarManual(accion.minutos, ramoId, dia, ctx.ahoraMs);
    return r.ok ? textoEstudioAnotado(accion.minutos, nombre, accion.ayer, r.avisoDia) : `${r.motivo}.`;
  }

  if (registros.length === 0) return TEXTO_SIN_DATOS;

  if (accion.intencion === "estudio-racha") {
    const resumen = resumirEstudio(registros, ctx.ahoraMs);
    return textoRacha(racha(registros, ctx.ahoraMs), resumen.hoyMin);
  }

  const periodo = accion.periodo ?? "esta semana";
  let ramoId: number | null | undefined;
  let nombre: string | null = null;
  if (accion.ramo) {
    const r = buscarRamo(accion.ramo, ramos);
    if (!r) return noEncontreRamo(accion.ramo);
    ramoId = r.id;
    nombre = r.nombre;
  }
  const rango = rangoDe(periodo, new Date(ctx.ahoraMs));
  const minutos = minutosEnRango(registros, rango.desde.getTime(), rango.hasta.getTime(), ramoId);
  const resumen = resumirEstudio(registros, ctx.ahoraMs);
  return textoHorasEstudiadas(periodo, minutos, nombre, periodo === "esta semana" && ramoId === undefined ? { pasadaMin: resumen.pasadaMin } : null);
}
