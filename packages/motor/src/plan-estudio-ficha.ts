// De la ficha de notas de un ramo (A2) y el calendario a una propuesta de plan de estudio (A4). Puro: lo
// usan el puente, el servidor MCP y las frases del motor. No guarda nada.

import type { FichaNotas } from "./notas-ficha.ts";
import { armarPlan, factorDeDificultad, horasObjetivo, leerFechaPrueba } from "./plan-estudio-tipos.ts";
import type { BloquePlan, HorarioEstudio, Ocupado } from "./plan-estudio-tipos.ts";

export interface PropuestaPlan {
  ramoId: number;
  evaluacionId: number;
  nombre: string;
  pruebaMs: number;
  conHora: boolean;
  peso: number;
  /** La nota que hace falta en esa evaluación (null si no se puede calcular). */
  necesaria: number | null;
  factor: number;
  /** Lo que propone la fórmula, y lo que realmente se repartió. */
  horasObjetivo: number;
  horasPedidas: number;
  horas: number;
  bloquesPedidos: number;
  bloques: BloquePlan[];
  avisos: string[];
}

export type ResultadoPropuesta = { ok: true; propuesta: PropuestaPlan } | { ok: false; motivo: string };

export function proponerPlan(
  ficha: FichaNotas,
  evaluacionId: number,
  opciones: { ahoraMs: number; ocupados?: readonly Ocupado[]; horas?: number; horario?: HorarioEstudio },
): ResultadoPropuesta {
  const e = ficha.evaluaciones.find((x) => x.id === evaluacionId);
  if (!e) return { ok: false, motivo: "Esa evaluación ya no existe" };
  if (e.nota !== null) return { ok: false, motivo: `${e.nombre} ya tiene nota: no hay nada que preparar.` };
  const fecha = leerFechaPrueba(e.fecha);
  if (!fecha) return { ok: false, motivo: `Falta la fecha de ${e.nombre}. Dime, por ejemplo, «el ${e.nombre.toLowerCase()} es el viernes 9 a las 15:00».` };
  const nec = ficha.necesarias[e.id];
  if (nec?.veredicto === "aprobado") return { ok: false, motivo: "Ya apruebas el ramo sin importar esta prueba, así que no te armo un plan." };
  if (nec?.veredicto === "imposible") return { ok: false, motivo: "Ni sacando 7,0 en lo que queda alcanzas a aprobar el ramo, así que no armo un plan para esta prueba." };
  const necesaria = nec ? nec.redondeada : null;
  const factor = factorDeDificultad(necesaria);
  const objetivo = horasObjetivo(e.peso, factor);
  const pedidas = opciones.horas === undefined ? objetivo : opciones.horas;
  const plan = armarPlan({ ahoraMs: opciones.ahoraMs, pruebaMs: fecha.ms, horas: pedidas, ocupados: opciones.ocupados, horario: opciones.horario });
  if (!plan.ok) return { ok: false, motivo: plan.motivo };
  return {
    ok: true,
    propuesta: {
      ramoId: ficha.ramoId,
      evaluacionId: e.id,
      nombre: e.nombre,
      pruebaMs: fecha.ms,
      conHora: fecha.conHora,
      peso: e.peso,
      necesaria,
      factor,
      horasObjetivo: objetivo,
      horasPedidas: Math.max(1, Math.min(12, pedidas)),
      horas: plan.horas,
      bloquesPedidos: plan.bloquesPedidos,
      bloques: plan.bloques,
      avisos: plan.avisos,
    },
  };
}
