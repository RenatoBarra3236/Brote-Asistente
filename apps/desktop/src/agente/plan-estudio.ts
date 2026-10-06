// El plan de estudio en la isla (A4 de docs/plan-estudio-y-mejoras.md): textos y reglas puras, sin DOM,
// para probarlas con Node. Los cálculos los hace el motor; el puente manda la propuesta ya armada.

import { HORAS_MAX, HORAS_MIN, leerFechaPrueba } from "../../../../packages/motor/src/plan-estudio-tipos.ts";
import type { BloqueGuardado, BloquePlan, PlanEstudio, TipoBloque } from "../../../../packages/motor/src/plan-estudio-tipos.ts";
import type { PropuestaPlan } from "../../../../packages/motor/src/plan-estudio-ficha.ts";
import { describirPrueba, hora } from "../../../../packages/motor/src/plan-estudio-frases.ts";
import { formatearNota } from "../../../../packages/motor/src/notas-tipos.ts";

export type { BloqueGuardado, BloquePlan, PlanEstudio, PropuestaPlan, TipoBloque };
export { describirPrueba, hora };

/** Lo que manda `plan-estudio-proponer`: la propuesta más lo que la isla necesita mostrar. */
export interface PropuestaVista extends PropuestaPlan {
  ramoNombre: string;
  horasHechas: number;
  tarjetas: number;
  planId: number | null;
  calendario: boolean;
  miraHasta: number;
}

export const PLAN_VACIO: PlanEstudio[] = [];

export const TEXTO_CASILLA_CALENDARIO = "Agregar también a mi calendario";
export const AVISO_CALENDARIO =
  "Los eventos que se creen en tu calendario no los puede borrar Brote: se borran a mano desde ahí. Si tu calendario se sincroniza con la nube, también quedarán allá.";

const NOMBRES_TIPO: Record<TipoBloque, string> = { temas: "Temas", ejercicios: "Ejercicios", "repaso-final": "Repaso final" };
export function etiquetaTipo(tipo: TipoBloque): string {
  return NOMBRES_TIPO[tipo];
}

/** "hoy 15:00", "mañana 15:00", "en 5 días · 15:00", "ya pasó" (sin hora si la evaluación no la tiene). */
export function cuandoPrueba(fecha: string | null, ahoraMs: number): string | null {
  const f = leerFechaPrueba(fecha);
  if (!f) return null;
  if (f.ms <= ahoraMs) return "ya pasó";
  const dia = (ms: number) => new Date(new Date(ms).getFullYear(), new Date(ms).getMonth(), new Date(ms).getDate()).getTime();
  const dias = Math.round((dia(f.ms) - dia(ahoraMs)) / 86_400_000);
  const h = f.conHora ? hora(f.ms) : null;
  if (dias === 0) return h ? `hoy ${h}` : "hoy";
  if (dias === 1) return h ? `mañana ${h}` : "mañana";
  return h ? `en ${dias} días · ${h}` : `en ${dias} días`;
}

/** Lo que va en un `<input type="datetime-local">` para una fecha guardada («2026-10-09 15:00» → «2026-10-09T15:00»). */
export function valorParaCampo(fecha: string | null): string {
  const f = leerFechaPrueba(fecha);
  if (!f || !fecha) return "";
  return f.conHora ? fecha.trim().replace(" ", "T").slice(0, 16) : `${fecha.trim()}T08:00`;
}

/** Lo que escribió el usuario en el campo → lo que se guarda («2026-10-09T15:00» → «2026-10-09 15:00»); vacío = sin fecha. */
export function fechaDesdeCampo(valor: string): { ok: true; fecha: string | null } | { ok: false; motivo: string } {
  const v = valor.trim();
  if (v === "") return { ok: true, fecha: null };
  const normal = v.replace("T", " ").slice(0, 16);
  if (!leerFechaPrueba(normal)) return { ok: false, motivo: "Esa fecha no existe" };
  return { ok: true, fecha: normal };
}

/** Las horas que se pueden pedir: de a una, entre 1 y 12. */
export function ajustarHoras(actual: number, delta: number): number {
  return Math.max(HORAS_MIN, Math.min(HORAS_MAX, Math.round(actual + delta)));
}

export function textoHoras(horas: number): string {
  const redondeado = Math.round(horas * 10) / 10;
  return `${String(redondeado).replace(".", ",")} h`;
}

/** La primera línea de la propuesta: «Certamen 2 · vie 9 oct · 15:00 · vale 30 %». */
export function tituloPropuestaPlan(p: Pick<PropuestaVista, "nombre" | "pruebaMs" | "conHora" | "peso">): string {
  return `${p.nombre} · ${describirPrueba(p.pruebaMs, p.conHora)} · vale ${p.peso} %`;
}

/** Por qué se sugieren esas horas: «Necesitas un 5,4: dedícale más» o la fórmula base. */
export function explicarHoras(p: Pick<PropuestaVista, "necesaria" | "factor" | "horasObjetivo" | "peso">): string {
  const base = `Sugerencia: ${textoHoras(p.horasObjetivo)} (2 h más 0,2 h por cada 1 % de peso`;
  if (p.necesaria !== null && p.factor > 1) return `${base}, ×${String(p.factor).replace(".", ",")} porque necesitas un ${formatearNota(p.necesaria)}).`;
  return `${base}).`;
}

export function resumenBloques(_bloques: readonly BloquePlan[], marcas: readonly boolean[]): string {
  const n = marcas.filter(Boolean).length;
  return n === 0 ? "Marca algún bloque para agendar" : `Agendar ${n === 1 ? "1 bloque" : `${n} bloques`}`;
}

export function bloquesSeleccionados(bloques: readonly BloquePlan[], marcas: readonly boolean[]): BloquePlan[] {
  return bloques.filter((_, i) => marcas[i]);
}

export function textoAgendado(r: { plan: PlanEstudio | null; calendario: { pedido: boolean; creados: number; fallidos: number } }): string {
  const n = r.plan ? r.plan.bloques.filter((b) => b.estado === "pendiente").length : 0;
  const base = n === 1 ? "Agendé 1 bloque" : `Agendé ${n} bloques`;
  if (!r.calendario.pedido) return `${base} en tu Agenda 🌱`;
  if (r.calendario.creados === 0) return `${base} en tu Agenda, pero no pude copiarlos a tu calendario.`;
  const fallos = r.calendario.fallidos > 0 ? ` (${r.calendario.fallidos} no se pudieron copiar)` : "";
  return `${base} en tu Agenda y ${r.calendario.creados} en tu calendario${fallos} 🌱`;
}

/** La línea de un plan en la ficha del ramo: «6 bloques · 2 hechos · próximo vie 9 oct · 16:00». */
export function resumenPlan(plan: PlanEstudio, ahoraMs: number): string {
  const pendientes = plan.bloques.filter((b) => b.estado === "pendiente");
  const hechos = plan.bloques.filter((b) => b.estado === "hecho").length;
  const partes = [`${plan.bloques.length} bloque${plan.bloques.length === 1 ? "" : "s"}`];
  if (hechos > 0) partes.push(`${hechos} hecho${hechos === 1 ? "" : "s"}`);
  const proximo = pendientes.find((b) => b.finMs > ahoraMs);
  if (proximo) partes.push(`próximo ${describirPrueba(proximo.inicioMs, true)}`);
  else if (pendientes.length === 0) partes.push("todo hecho");
  return partes.join(" · ");
}

/** Los bloques que faltan (para mostrarlos en la ficha), los de después de ahora primero. */
export function bloquesVisibles(plan: PlanEstudio, ahoraMs: number): BloqueGuardado[] {
  return plan.bloques.filter((b) => b.estado !== "saltado" && (b.estado === "pendiente" ? b.finMs > ahoraMs - 3_600_000 : true));
}

// ---- «Lo que sé de ti → Plan de estudio» ------------------------------------------------------------------

export const TEXTO_SIN_PLAN_MEMORIA = "Todavía no hay planes de estudio. Cuando agendes uno para una prueba aparecerá aquí.";
export const NOTA_PLAN_MEMORIA =
  "Tus planes (ramos, fechas y horas; nada de tus clases), solo en tu computador. Los eventos que hayas copiado a tu calendario se borran a mano desde ahí.";

export function avisoPlanBorrado(n: number): string {
  return n === 1 ? "Borré 1 plan de estudio." : `Borré ${n} planes de estudio.`;
}
