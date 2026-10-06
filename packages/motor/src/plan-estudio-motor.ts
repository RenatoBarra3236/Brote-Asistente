// Lo que el motor hace con las frases del plan de estudio (A4). Devuelve el texto de la respuesta (y, si
// la isla tiene que abrir algo, `datos`); `null` = "no es para mí" y la frase sigue al agente. Nunca
// adivina entre dos ramos o evaluaciones, y NUNCA agenda nada: armar el plan es una propuesta en la isla.

import type { Notas } from "./notas.ts";
import { armarFichaNotas } from "./notas-ficha.ts";
import { buscarEvaluacion, separarEvaluacionYRamo } from "./notas-motor.ts";
import { leerDia } from "./fechas.ts";
import { proponerPlan } from "./plan-estudio-ficha.ts";
import { textoBloquesDeHoy, textoFechaPuesta, textoPlanPedido } from "./plan-estudio-frases.ts";
import type { PlanesEstudio } from "./plan-estudio.ts";
import { formatearFechaPrueba, leerFechaPrueba } from "./plan-estudio-tipos.ts";
import type { Ramos } from "./ramos.ts";
import { leerHora } from "./tiempo.ts";

export type AccionPlanEstudio =
  | { intencion: "estudio-fecha"; cosa: string; dia: string; hora: { horas: number; minutos: number } | null }
  | { intencion: "estudio-plan"; cosa: string }
  | { intencion: "estudio-hoy" };

export interface ContextoPlanEstudio {
  ramos: Ramos;
  notas: Notas;
  planes: PlanesEstudio | null;
  ahoraMs: number;
}

export interface RespuestaPlanEstudio {
  texto: string;
  datos?: unknown;
}

export function interpretarPlanEstudio(intencion: string, ranuras: Partial<Record<string, string>>, originales: Partial<Record<string, string>>): AccionPlanEstudio | null {
  const orig = (k: string): string => (originales[k] ?? "").trim();
  switch (intencion) {
    case "estudio-fecha": {
      if (orig("cosa").length < 3 || ranuras.fecha === undefined) return null;
      const hora = ranuras.hora === undefined ? null : leerHora(ranuras.hora);
      if (ranuras.hora !== undefined && hora === null) return null;
      return { intencion, cosa: orig("cosa"), dia: ranuras.fecha, hora };
    }
    case "estudio-plan":
      return orig("cosa").length >= 3 ? { intencion, cosa: orig("cosa") } : null;
    case "estudio-hoy":
      return { intencion };
    default:
      return null;
  }
}

function inicioDelDia(ms: number, dias = 0): number {
  const f = new Date(ms);
  return new Date(f.getFullYear(), f.getMonth(), f.getDate() + dias).getTime();
}

export function responderPlanEstudio(accion: AccionPlanEstudio, ctx: ContextoPlanEstudio): RespuestaPlanEstudio | null {
  if (accion.intencion === "estudio-hoy") {
    if (!ctx.planes) return null;
    const nombres = new Map(ctx.ramos.listar(true).map((r) => [r.id, r.nombre]));
    const bloques = ctx.planes.bloquesEntre(inicioDelDia(ctx.ahoraMs), inicioDelDia(ctx.ahoraMs, 1));
    return { texto: textoBloquesDeHoy(bloques, (id) => nombres.get(id) ?? "tu ramo") };
  }

  const sep = separarEvaluacionYRamo(accion.cosa, ctx.ramos.listar());
  // Sin un ramo conocido y una evaluación concreta, «mi cumpleaños es el 9» no es del motor.
  if (!sep || !sep.evaluacion) return null;
  const evaluacion = buscarEvaluacion(sep.evaluacion, ctx.notas.listar(sep.ramo.id));
  if (!evaluacion) {
    return { texto: `No tengo «${sep.evaluacion}» en ${sep.ramo.nombre}. Defínela primero, por ejemplo «evaluaciones de ${sep.ramo.nombre.toLowerCase()}: certamen 1 30%, certamen 2 70%».` };
  }

  if (accion.intencion === "estudio-fecha") {
    const dia = leerDia(accion.dia, ctx.ahoraMs);
    if (dia === null) return { texto: "No pude entender esa fecha, o ya pasó. Prueba con «el viernes 9» o «el 14 de octubre»." };
    const f = new Date(dia);
    const ms = accion.hora ? new Date(f.getFullYear(), f.getMonth(), f.getDate(), accion.hora.horas, accion.hora.minutos).getTime() : dia;
    if (accion.hora && ms <= ctx.ahoraMs) return { texto: "Esa hora ya pasó. Dime una fecha y hora que estén por venir." };
    const texto = formatearFechaPrueba(ms, accion.hora !== null);
    const r = ctx.notas.editar(evaluacion.id, { fecha: texto });
    if (!r.ok) return { texto: `${r.motivo}.` };
    return { texto: textoFechaPuesta(evaluacion.nombre, sep.ramo.nombre, ms, accion.hora !== null) };
  }

  // estudio-plan: solo comprueba que se pueda y deja que la isla arme la propuesta (ahí está el calendario).
  const fecha = leerFechaPrueba(evaluacion.fecha);
  const ficha = armarFichaNotas(sep.ramo.id, ctx.notas.listar(sep.ramo.id), ctx.notas.ajustes(sep.ramo.id));
  const r = proponerPlan(ficha, evaluacion.id, { ahoraMs: ctx.ahoraMs });
  if (!r.ok) return { texto: r.motivo };
  return {
    texto: textoPlanPedido(evaluacion.nombre, sep.ramo.nombre, fecha!.ms, fecha!.conHora),
    datos: { planEstudio: { ramoId: sep.ramo.id, evaluacionId: evaluacion.id } },
  };
}
