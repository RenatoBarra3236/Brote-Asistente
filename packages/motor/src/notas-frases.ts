// Textos de las frases sin IA sobre notas (A2). Puro: recibe números y devuelve texto.

import { formatearNota } from "./notas-tipos.ts";
import type { Evaluacion, ResultadoExamen, ResultadoNecesaria, ResultadoRamoNotas } from "./notas-tipos.ts";

export function textoNotaAnotada(ramo: string, ev: Evaluacion): string {
  return `Anotado: ${ev.nombre} de ${ramo}, ${formatearNota(ev.nota as number)} (${ev.peso} %) 🌱`;
}

export function textoEvaluacionCreada(ramo: string, ev: Evaluacion): string {
  return `Listo, agregué ${ev.nombre} (${ev.peso} %) a ${ramo}.`;
}

export function textoSinEvaluaciones(ramo: string): string {
  return `Todavía no tengo evaluaciones de ${ramo}. Dime por ejemplo «evaluaciones de ${ramo}: certamen 1 30%, certamen 2 30%, examen 40%».`;
}

export function textoComoVoy(ramo: string, r: ResultadoRamoNotas): string {
  const lineas: string[] = [];
  if (r.promedio === null) lineas.push(`En ${ramo} todavía no tienes notas puestas.`);
  else lineas.push(`En ${ramo} llevas ${formatearNota(r.promedio)} de promedio (${r.pesoRendido} % rendido).`);
  if (r.veredicto === "aprobado") lineas.push("Ya tienes el ramo aprobado 🎉");
  else if (r.veredicto === "sin-pendientes-reprobado") lineas.push("Con todo rendido, el promedio no alcanza para aprobar.");
  else if (r.veredicto === "imposible") lineas.push(`Con lo que queda, ni sacando 7,0 en todo llegas a aprobar (máximo ${formatearNota(r.maximoPosible as number)}).`);
  else if (r.necesariaEnPendientes !== null) lineas.push(`Para aprobar necesitas ${formatearNota(Math.ceil(r.necesariaEnPendientes * 10 - 1e-9) / 10)} de promedio en el ${r.pesoPendiente} % que falta.`);
  if (r.avisoPeso) lineas.push(r.avisoPeso);
  return lineas.join(" ");
}

export function textoNecesaria(ramo: string, nombre: string, n: ResultadoNecesaria): string {
  if (n.veredicto === "aprobado") return `En ${ramo} ya apruebas sin importar la nota de ${nombre} 🎉`;
  if (n.veredicto === "imposible") return `En ${ramo}, ni con un 7,0 en ${nombre} alcanzas a aprobar con lo que llevas.`;
  const resto = n.supuesto ? " (suponiendo la misma nota en las otras evaluaciones que faltan)" : "";
  return `Necesitas un ${formatearNota(n.redondeada)} en ${nombre} de ${ramo} para aprobar${resto}.`;
}

export function textoExamen(ramo: string, e: ResultadoExamen): string {
  if (e.veredicto === "falta-presentacion") return `Para calcular el examen de ${ramo} necesito todas las notas del período.`;
  if (e.veredicto === "sin-presentacion-minima") return `En ${ramo} tu presentación (${formatearNota(e.presentacion as number)}) no llega a la mínima para dar el examen.`;
  if (e.veredicto === "aprobado") return `En ${ramo} ya apruebas sin importar el examen 🎉`;
  if (e.veredicto === "imposible") return `En ${ramo}, ni con un 7,0 en el examen alcanzas a aprobar.`;
  const minimo = e.manda === "minimo" ? " (es la nota mínima del examen)" : "";
  return `Con presentación ${formatearNota(e.presentacion as number)}, necesitas un ${formatearNota(e.redondeada as number)} en el examen de ${ramo}${minimo}.`;
}
