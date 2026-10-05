// Lo que la isla muestra de cada ramo y las sugerencias para crearlos (A1 de docs/plan-estudio-y-mejoras.md).
// Puro (sin Node ni DOM): une lo que ya existe —eventos del calendario, entregas del aula, tareas— con
// los ramos, emparejando por palabra clave. No guarda nada.

import { emparejarRamo, limpiarTexto, normalizarRamo, MAX_NOMBRE_RAMO } from "./ramos-tipos.ts";
import type { Ramo } from "./ramos-tipos.ts";

interface EventoEntrada {
  titulo: string;
  inicioMs: number;
  finMs: number;
}
interface EntregaEntrada {
  curso: string;
  titulo: string;
  entregaMs: number;
  entregada: boolean;
}
interface TareaEntrada {
  id: number;
  titulo: string;
  venceMs: number;
  hecha: boolean;
}

export interface FichaRamo {
  ramo: Ramo;
  /** Próximas clases (eventos cuyo título calza con el ramo), las 3 más cercanas. */
  clases: { titulo: string; inicioMs: number; finMs: number }[];
  /** Entregas pendientes del aula cuyo curso calza con el ramo. */
  entregas: { titulo: string; entregaMs: number }[];
  /** Tareas (las de las grabaciones) asignadas al ramo y sin hacer. */
  tareas: { id: number; titulo: string; venceMs: number }[];
  /** Cuántas transcripciones tiene asignadas. */
  transcripciones: number;
}

export interface FuentesFicha {
  eventos: EventoEntrada[];
  entregas: EntregaEntrada[];
  tareas: TareaEntrada[];
  /** Ramo de cada tarea (id de la tarea → id del ramo). */
  ramoDeTarea: ReadonlyMap<string, number>;
  /** Ramo de cada transcripción (id de la grabación → id del ramo). */
  ramoDeGrabacion: ReadonlyMap<string, number>;
}

const MAX_CLASES = 3;

/** Una ficha por ramo activo, en el orden dado. Lo que ya pasó no cuenta. */
export function armarFichas(ramos: readonly Ramo[], fuentes: FuentesFicha, ahoraMs: number): FichaRamo[] {
  const activos = ramos.filter((r) => !r.archivado);
  const fichas = new Map<number, FichaRamo>(activos.map((ramo) => [ramo.id, { ramo, clases: [], entregas: [], tareas: [], transcripciones: 0 }]));
  for (const e of [...fuentes.eventos].sort((a, b) => a.inicioMs - b.inicioMs)) {
    if (e.finMs < ahoraMs) continue;
    const ficha = fichas.get(emparejarRamo(e.titulo, activos)?.id ?? -1);
    if (ficha && ficha.clases.length < MAX_CLASES) ficha.clases.push({ titulo: e.titulo, inicioMs: e.inicioMs, finMs: e.finMs });
  }
  for (const e of [...fuentes.entregas].sort((a, b) => a.entregaMs - b.entregaMs)) {
    if (e.entregada || e.entregaMs < ahoraMs) continue;
    const ficha = fichas.get(emparejarRamo(e.curso, activos)?.id ?? -1);
    ficha?.entregas.push({ titulo: e.titulo, entregaMs: e.entregaMs });
  }
  for (const t of [...fuentes.tareas].sort((a, b) => a.venceMs - b.venceMs)) {
    if (t.hecha) continue;
    fichas.get(fuentes.ramoDeTarea.get(String(t.id)) ?? -1)?.tareas.push({ id: t.id, titulo: t.titulo, venceMs: t.venceMs });
  }
  for (const ramoId of fuentes.ramoDeGrabacion.values()) {
    const ficha = fichas.get(ramoId);
    if (ficha) ficha.transcripciones++;
  }
  return [...fichas.values()];
}

export interface SugerenciaRamo {
  nombre: string;
  /** De dónde sale: un curso del aula o un evento que se repite en el calendario. */
  origen: "aula" | "calendario";
}

export const MAX_SUGERENCIAS = 6;
/** Un evento se sugiere como ramo si aparece al menos tantas veces en la ventana leída. */
export const REPETICIONES_PARA_SUGERIR = 3;

/**
 * Los cursos del aula y los eventos repetidos del calendario que todavía no son un ramo. Nada se crea
 * solo: la isla ofrece «Agregar» y el usuario toca.
 */
export function sugerirRamos(cursosAula: readonly string[], titulosEventos: readonly string[], ramos: readonly Ramo[]): SugerenciaRamo[] {
  const resultado: SugerenciaRamo[] = [];
  const vistos = new Set<string>(ramos.map((r) => normalizarRamo(r.nombre)));
  const yaEs = (texto: string) => emparejarRamo(texto, ramos) !== null;
  const agregar = (texto: string, origen: SugerenciaRamo["origen"]) => {
    const nombre = limpiarTexto(texto, MAX_NOMBRE_RAMO);
    const clave = normalizarRamo(nombre);
    if (clave.length < 2 || vistos.has(clave) || yaEs(nombre)) return;
    vistos.add(clave);
    resultado.push({ nombre, origen });
  };
  for (const curso of cursosAula) agregar(curso, "aula");
  const cuenta = new Map<string, { titulo: string; veces: number }>();
  for (const titulo of titulosEventos) {
    const clave = normalizarRamo(titulo);
    if (clave.length < 2) continue;
    const previo = cuenta.get(clave);
    if (previo) previo.veces++;
    else cuenta.set(clave, { titulo, veces: 1 });
  }
  for (const { titulo, veces } of [...cuenta.values()].sort((a, b) => b.veces - a.veces)) {
    if (veces >= REPETICIONES_PARA_SUGERIR) agregar(titulo, "calendario");
  }
  return resultado.slice(0, MAX_SUGERENCIAS);
}
