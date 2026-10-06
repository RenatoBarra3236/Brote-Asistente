// «Todo lo de un ramo» (C de docs/plan-estudio-y-mejoras.md). Puro (sin Node ni DOM; también lo usa la
// ventana): junta en una lista por fecha lo que ya existe de cada ramo —clases, entregas, pruebas, bloques
// de estudio, tareas, tarjetas por repasar y grabaciones— y la busca por títulos. No guarda nada y nunca
// recibe el texto de las clases ni de las tarjetas: solo títulos, fechas y estados.

import { emparejarRamo, normalizarRamo } from "./ramos-tipos.ts";
import type { Ramo } from "./ramos-tipos.ts";
import { inicioDelDia } from "./repaso-tipos.ts";

export const TIPOS_ITEM_RAMO = ["clase", "entrega", "prueba", "estudio", "tarea", "repaso", "grabacion", "documento"] as const;
export type TipoItemRamo = (typeof TIPOS_ITEM_RAMO)[number];
export type EstadoItemRamo = "pendiente" | "hecho" | "pasado";

export interface ItemDeRamo {
  ramoId: number;
  tipo: TipoItemRamo;
  titulo: string;
  cuandoMs: number;
  estado: EstadoItemRamo;
  /** Id de lo que es (tarea, bloque, grabación…) para que la isla lleve a su pestaña; sin él, null. */
  ref: string | null;
  /** Solo en «repaso»: cuántas tarjetas vencen. */
  cantidad?: number;
}

export interface FuentesRamo {
  eventos: { titulo: string; inicioMs: number; finMs: number }[];
  entregas: { curso: string; titulo: string; entregaMs: number; entregada: boolean }[];
  /** Evaluaciones con fecha y sin nota. */
  pruebas: { id: number; ramoId: number; titulo: string; inicioMs: number }[];
  bloques: { id: number; ramoId: number; titulo: string; inicioMs: number; hecho: boolean }[];
  tareas: { id: number; titulo: string; venceMs: number; hecha: boolean }[];
  /** Ramo de cada tarea (id de la tarea → id del ramo). */
  ramoDeTarea: ReadonlyMap<string, number>;
  /** Tarjetas de repaso que vencen hoy o antes, por ramo (solo cuántas, nunca su texto). */
  repasoHoy: ReadonlyMap<number, number>;
  /** Grabaciones asignadas a un ramo, con la hora de la grabación. */
  grabaciones: { id: string; ramoId: number; ms: number }[];
  /** Documentos (PDF, Word…) que el usuario le dio a Brote y asignó a un ramo: solo su nombre de archivo y cuándo se agregó. */
  documentos?: { id: string; ramoId: number; nombre: string; ms: number }[];
}

export const MAX_ITEMS_POR_RAMO = 200;
export const MAX_RESULTADOS_POR_RAMO = 12;

/** Lo próximo primero (más cercano arriba) y después lo que ya pasó o se hizo (lo más reciente arriba). */
function ordenar(items: ItemDeRamo[]): ItemDeRamo[] {
  const proximos = items.filter((i) => i.estado === "pendiente").sort((a, b) => a.cuandoMs - b.cuandoMs);
  const resto = items.filter((i) => i.estado !== "pendiente").sort((a, b) => b.cuandoMs - a.cuandoMs);
  return [...proximos, ...resto];
}

/** Todo lo de cada ramo activo, por id de ramo. Los eventos y entregas se emparejan por palabra clave. */
export function armarTodoDeRamos(ramos: readonly Ramo[], fuentes: FuentesRamo, ahoraMs: number): Map<number, ItemDeRamo[]> {
  const activos = ramos.filter((r) => !r.archivado);
  const porRamo = new Map<number, ItemDeRamo[]>(activos.map((r) => [r.id, []]));
  const poner = (item: ItemDeRamo) => porRamo.get(item.ramoId)?.push(item);
  const segunFecha = (cuandoMs: number): EstadoItemRamo => (cuandoMs >= ahoraMs ? "pendiente" : "pasado");

  for (const e of fuentes.eventos) {
    const ramo = emparejarRamo(e.titulo, activos);
    if (ramo) poner({ ramoId: ramo.id, tipo: "clase", titulo: e.titulo, cuandoMs: e.inicioMs, estado: e.finMs >= ahoraMs ? "pendiente" : "pasado", ref: null });
  }
  for (const e of fuentes.entregas) {
    if (e.entregada) continue;
    const ramo = emparejarRamo(e.curso, activos);
    if (ramo) poner({ ramoId: ramo.id, tipo: "entrega", titulo: e.titulo, cuandoMs: e.entregaMs, estado: segunFecha(e.entregaMs), ref: null });
  }
  for (const p of fuentes.pruebas) poner({ ramoId: p.ramoId, tipo: "prueba", titulo: p.titulo, cuandoMs: p.inicioMs, estado: segunFecha(p.inicioMs), ref: String(p.id) });
  for (const b of fuentes.bloques) poner({ ramoId: b.ramoId, tipo: "estudio", titulo: b.titulo, cuandoMs: b.inicioMs, estado: b.hecho ? "hecho" : segunFecha(b.inicioMs), ref: String(b.id) });
  for (const t of fuentes.tareas) {
    const ramoId = fuentes.ramoDeTarea.get(String(t.id));
    if (ramoId !== undefined) poner({ ramoId, tipo: "tarea", titulo: t.titulo, cuandoMs: t.venceMs, estado: t.hecha ? "hecho" : segunFecha(t.venceMs), ref: String(t.id) });
  }
  for (const [ramoId, n] of fuentes.repasoHoy) {
    if (n > 0) poner({ ramoId, tipo: "repaso", titulo: n === 1 ? "1 tarjeta para repasar" : `${n} tarjetas para repasar`, cuandoMs: inicioDelDia(ahoraMs), estado: "pendiente", ref: null, cantidad: n });
  }
  for (const g of fuentes.grabaciones) poner({ ramoId: g.ramoId, tipo: "grabacion", titulo: tituloDeGrabacion(g.ms), cuandoMs: g.ms, estado: "pasado", ref: g.id });

  for (const d of fuentes.documentos ?? []) poner({ ramoId: d.ramoId, tipo: "documento", titulo: d.nombre, cuandoMs: d.ms, estado: "pasado", ref: d.id });

  for (const [id, items] of porRamo) porRamo.set(id, ordenar(items).slice(0, MAX_ITEMS_POR_RAMO));
  return porRamo;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «Clase grabada · 5 oct, 10:30»: la fecha de la grabación, nunca nada de lo que se dijo. */
export function tituloDeGrabacion(ms: number): string {
  const f = new Date(ms);
  const hora = `${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;
  return `Clase grabada · ${f.getDate()} ${MESES_CORTOS[f.getMonth()]}, ${hora}`;
}

// ---- Búsqueda -------------------------------------------------------------------------------------------

/** Palabras (sin tildes ni mayúsculas) de lo que se escribió; vacío si no hay nada que buscar. */
export function palabrasDeBusqueda(texto: string): string[] {
  return normalizarRamo(texto).split(" ").filter((p) => p.length > 0).slice(0, 6);
}

/** Los ítems cuyo título tiene TODAS las palabras buscadas, completas y sin importar tildes. */
export function buscarEnItems(texto: string, items: readonly ItemDeRamo[]): ItemDeRamo[] {
  const palabras = palabrasDeBusqueda(texto);
  if (palabras.length === 0) return [];
  return items.filter((i) => {
    const titulo = ` ${normalizarRamo(i.titulo)} `;
    return palabras.every((p) => titulo.includes(` ${p} `));
  });
}

export interface ResultadoRamo {
  ramoId: number;
  total: number;
  items: ItemDeRamo[];
}

/** Resultados de todos los ramos, agrupados por ramo (los que no tienen nada no salen). */
export function buscarEnRamos(texto: string, porRamo: ReadonlyMap<number, ItemDeRamo[]>): ResultadoRamo[] {
  const resultado: ResultadoRamo[] = [];
  for (const [ramoId, items] of porRamo) {
    const calzan = buscarEnItems(texto, items);
    if (calzan.length > 0) resultado.push({ ramoId, total: calzan.length, items: calzan.slice(0, MAX_RESULTADOS_POR_RAMO) });
  }
  return resultado;
}

// ---- Resumen corto --------------------------------------------------------------------------------------

export interface ResumenDeRamo {
  clasesSemana: number;
  tareasPendientes: number;
  entregasPendientes: number;
  proximaPrueba: { titulo: string; cuandoMs: number } | null;
  tarjetasHoy: number;
}

const SEMANA_MS = 7 * 24 * 3_600_000;

export function resumirRamo(items: readonly ItemDeRamo[], ahoraMs: number): ResumenDeRamo {
  const pendientes = items.filter((i) => i.estado === "pendiente");
  const pruebas = pendientes.filter((i) => i.tipo === "prueba").sort((a, b) => a.cuandoMs - b.cuandoMs);
  return {
    clasesSemana: pendientes.filter((i) => i.tipo === "clase" && i.cuandoMs < ahoraMs + SEMANA_MS).length,
    tareasPendientes: items.filter((i) => i.tipo === "tarea" && i.estado !== "hecho").length,
    entregasPendientes: pendientes.filter((i) => i.tipo === "entrega").length,
    proximaPrueba: pruebas[0] ? { titulo: pruebas[0].titulo, cuandoMs: pruebas[0].cuandoMs } : null,
    tarjetasHoy: items.find((i) => i.tipo === "repaso")?.cantidad ?? 0,
  };
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** «hoy», «mañana» o «en 6 días» según los días de calendario que faltan. */
export function cuandoEs(cuandoMs: number, ahoraMs: number): string {
  const dias = Math.round((inicioDelDia(cuandoMs) - inicioDelDia(ahoraMs)) / 86_400_000);
  return dias <= 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`;
}

/** «Cálculo: 2 clases esta semana, 1 tarea pendiente, Certamen 2 en 6 días, 4 tarjetas para repasar». */
export function textoResumenRamo(nombre: string, r: ResumenDeRamo, ahoraMs: number): string {
  const partes: string[] = [];
  if (r.clasesSemana > 0) partes.push(`${plural(r.clasesSemana, "clase", "clases")} esta semana`);
  if (r.tareasPendientes > 0) partes.push(`${plural(r.tareasPendientes, "tarea pendiente", "tareas pendientes")}`);
  if (r.entregasPendientes > 0) partes.push(`${plural(r.entregasPendientes, "entrega pendiente", "entregas pendientes")}`);
  if (r.proximaPrueba) partes.push(`${r.proximaPrueba.titulo} ${cuandoEs(r.proximaPrueba.cuandoMs, ahoraMs)}`);
  if (r.tarjetasHoy > 0) partes.push(`${plural(r.tarjetasHoy, "tarjeta", "tarjetas")} para repasar`);
  return partes.length > 0 ? `${nombre}: ${partes.join(", ")}.` : `${nombre}: no tienes nada pendiente por ahora.`;
}
