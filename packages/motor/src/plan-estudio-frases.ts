// Textos de las frases sin IA y de los avisos del plan de estudio (A4). Puro.

import { tituloDeBloque } from "./plan-estudio-tipos.ts";
import type { BloqueDeAgenda } from "./plan-estudio-tipos.ts";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function dos(n: number): string {
  return String(n).padStart(2, "0");
}

/** "viernes 9 oct · 15:00" (la hora solo si se conoce). */
export function describirPrueba(ms: number, conHora: boolean): string {
  const f = new Date(ms);
  const dia = `${DIAS[f.getDay()]} ${f.getDate()} ${MESES[f.getMonth()]}`;
  return conHora ? `${dia} · ${dos(f.getHours())}:${dos(f.getMinutes())}` : dia;
}

export function hora(ms: number): string {
  const f = new Date(ms);
  return `${dos(f.getHours())}:${dos(f.getMinutes())}`;
}

export function textoFechaPuesta(evaluacion: string, ramo: string, ms: number, conHora: boolean): string {
  const base = `Listo: ${evaluacion} de ${ramo} es el ${describirPrueba(ms, conHora)}.`;
  const sinHora = conHora ? "" : " No me dijiste la hora: asumo que es temprano (8:00). Si sabes la hora, dime «… a las 15:00».";
  return `${base}${sinHora} Dime «plan de estudio para ${evaluacion.toLowerCase()} de ${ramo.toLowerCase()}» y te armo una propuesta 🌱`;
}

export function textoPlanPedido(evaluacion: string, ramo: string, ms: number, conHora: boolean): string {
  return `Te armo una propuesta para ${evaluacion} de ${ramo} (${describirPrueba(ms, conHora)}). La ves en la pestaña Estudio y tú decides si la agendas 🌱`;
}

/** «Hoy tienes 2 bloques de estudio: …» */
export function textoBloquesDeHoy(bloques: readonly BloqueDeAgenda[], nombreDeRamo: (id: number) => string): string {
  const pendientes = bloques.filter((b) => b.estado === "pendiente");
  if (bloques.length === 0) return "No tienes bloques de estudio para hoy.";
  if (pendientes.length === 0) return "Ya hiciste todos los bloques de estudio de hoy 🎉";
  const lineas = pendientes.map((b) => `• ${hora(b.inicioMs)} ${tituloDeBloque(b.tipo, nombreDeRamo(b.ramoId))}`);
  return `Hoy tienes ${pendientes.length === 1 ? "1 bloque" : `${pendientes.length} bloques`} de estudio:\n${lineas.join("\n")}`;
}

/** El aviso de Novedades antes de un bloque. */
export function textoAvisoBloque(b: Pick<BloqueDeAgenda, "tipo" | "inicioMs">, ramo: string): string {
  return `A las ${hora(b.inicioMs)}: ${tituloDeBloque(b.tipo, ramo)}`;
}
