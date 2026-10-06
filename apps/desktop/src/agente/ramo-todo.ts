// «Todo lo de un ramo» (C de docs/plan-estudio-y-mejoras.md): textos, filtros y destinos, sin DOM, para
// probarlos con Node. La lista la arma el puente (`ramo-todo`, `ramos-buscar`) con la lógica del motor.

import type { EstadoItemRamo, ItemDeRamo, TipoItemRamo } from "../../../../packages/motor/src/ramo-todo.ts";
import { cuandoClase } from "./estudio.ts";

export type { EstadoItemRamo, ItemDeRamo, TipoItemRamo };

/** Lo que devuelve el pedido `ramo-todo`. */
export interface DatosRamoTodo {
  ramoId: number;
  resumen: string;
  items: ItemDeRamo[];
  fuentes: { calendario: boolean; aula: boolean };
}

/** Lo que devuelve el pedido `ramos-buscar`: los ramos con algo que calza, y solo sus títulos. */
export interface DatosBusquedaRamos {
  resultados: { ramoId: number; total: number; items: ItemDeRamo[] }[];
  fuentes: { calendario: boolean; aula: boolean };
}

export type FiltroRamo = "todo" | "clases" | "tareas" | "pruebas" | "repaso" | "grabaciones" | "documentos";

export const FILTROS: { id: FiltroRamo; etiqueta: string; tipos: readonly TipoItemRamo[] }[] = [
  { id: "todo", etiqueta: "Todo", tipos: ["clase", "entrega", "prueba", "estudio", "tarea", "repaso", "grabacion", "documento"] },
  { id: "clases", etiqueta: "Clases", tipos: ["clase"] },
  { id: "tareas", etiqueta: "Tareas", tipos: ["tarea", "entrega"] },
  { id: "pruebas", etiqueta: "Pruebas", tipos: ["prueba", "estudio"] },
  { id: "repaso", etiqueta: "Repaso", tipos: ["repaso"] },
  { id: "grabaciones", etiqueta: "Grabaciones", tipos: ["grabacion"] },
  { id: "documentos", etiqueta: "Documentos", tipos: ["documento"] },
];

export function filtrarItems(items: readonly ItemDeRamo[], filtro: FiltroRamo): ItemDeRamo[] {
  const tipos = FILTROS.find((f) => f.id === filtro)?.tipos ?? FILTROS[0].tipos;
  return items.filter((i) => tipos.includes(i.tipo));
}

/** Cuántos ítems tiene cada filtro (los vacíos no se ofrecen, salvo «Todo»). */
export function filtrosConDatos(items: readonly ItemDeRamo[]): { id: FiltroRamo; etiqueta: string; cuantos: number }[] {
  return FILTROS.map((f) => ({ id: f.id, etiqueta: f.etiqueta, cuantos: filtrarItems(items, f.id).length })).filter((f) => f.id === "todo" || f.cuantos > 0);
}

const EMOJI: Record<TipoItemRamo, string> = {
  clase: "🎓",
  entrega: "📚",
  prueba: "📝",
  estudio: "⏱️",
  tarea: "✅",
  repaso: "🧠",
  grabacion: "🎙️",
  documento: "📄",
};
export function emojiDe(tipo: TipoItemRamo): string {
  return EMOJI[tipo];
}

const NOMBRE: Record<TipoItemRamo, string> = {
  clase: "Clase",
  entrega: "Entrega",
  prueba: "Prueba",
  estudio: "Estudio",
  tarea: "Tarea",
  repaso: "Repaso",
  grabacion: "Grabación",
  documento: "Documento",
};
export function nombreDeTipo(tipo: TipoItemRamo): string {
  return NOMBRE[tipo];
}

/** «hoy 10:30», «mañana 08:00», «vie 9 · 15:00»; lo que ya pasó se dice como estado. */
export function cuandoDeItem(item: ItemDeRamo, ahoraMs: number): string {
  if (item.tipo === "repaso") return "hoy";
  if (item.estado === "hecho") return "hecho";
  return cuandoClase(item.cuandoMs, ahoraMs);
}

/** A qué pestaña lleva tocar un ítem. Repaso abre la sesión del ramo, no una pestaña nueva. */
export type Destino = { pestana: "agenda" | "grabar" | "estudio" } | { repaso: number };
export function destinoDe(item: ItemDeRamo): Destino {
  if (item.tipo === "repaso") return { repaso: item.ramoId };
  if (item.tipo === "grabacion") return { pestana: "grabar" };
  if (item.tipo === "documento") return { pestana: "estudio" };
  return { pestana: "agenda" };
}

export const TEXTO_PLACEHOLDER_BUSCADOR = "Buscar en tus ramos…";
export const TEXTO_SIN_RESULTADOS = "No encontré nada con esas palabras. Busco en los títulos (no dentro de tus clases), por palabras completas.";
export const TEXTO_BUSCADOR_AYUDA = "Busca en los títulos de clases, tareas, pruebas, tarjetas y grabaciones de todos tus ramos.";
export const TEXTO_BUSCANDO = "Buscando…";

export const TEXTO_RAMO_VACIO = "Todavía no hay nada de este ramo.";
/** Por qué un ramo puede verse vacío aunque tenga cosas, para no dejar al usuario adivinando. */
export function explicarTodoVacio(fuentes: DatosRamoTodo["fuentes"], tieneAlias: boolean): string {
  if (!fuentes.calendario && !fuentes.aula) return `${TEXTO_RAMO_VACIO} Si conectas tu calendario o tu aula en Configurar Brote, aquí salen también sus clases y entregas.`;
  return tieneAlias ? TEXTO_RAMO_VACIO : `${TEXTO_RAMO_VACIO} Si en tu calendario o aula se llama distinto, agrégale una palabra clave (por ejemplo «calc»).`;
}

/** Lo que no se pudo mirar porque su función está apagada (una línea; vacía si está todo). */
export function avisoDeFuentes(fuentes: DatosRamoTodo["fuentes"]): string {
  const faltan: string[] = [];
  if (!fuentes.calendario) faltan.push("clases del calendario");
  if (!fuentes.aula) faltan.push("entregas del aula");
  return faltan.length === 0 ? "" : `Sin ${faltan.join(" ni ")} (apagado).`;
}

/** Cuántos resultados de un ramo no caben en la lista corta. */
export function textoMasResultados(total: number, mostrados: number): string {
  const faltan = total - mostrados;
  return faltan > 0 ? `+${faltan} más` : "";
}
