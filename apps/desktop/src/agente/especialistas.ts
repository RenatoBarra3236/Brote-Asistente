// El equipo de Brote en la isla. Sin DOM, para probarlo con Node. El catálogo es el del motor
// (packages/motor/src/especialistas.ts).
//
//   El escenario (pestaña Brote): cuando Brote delega, las mascotas de los especialistas salen de
//   detrás de Brote y quedan en fila (como mucho 4), animadas según lo que hacen, con un globito y su
//   nombre "· IA". Al terminar todos, celebran un rato y se esconden; quedan unas fichas para ver su
//   conversación hasta un minuto después.
//   "Ver a todos": columnas con Brote y hasta 3 especialistas (tarea, pasos y respuesta en vivo).

export * from "../../../../packages/motor/src/especialistas.ts";
import { etiquetaHerramienta } from "./traduccion.ts";
import type { Estado } from "../personaje/estados.ts";

/** Lo que manda el puente por cada especialista (aviso "especialistas"). */
export interface Trabajando {
  sesion: string;
  id: string;
  nombre: string;
  emoji: string;
  ia: string | null;
  color: string | null;
  tarea: string | null;
  herramienta: string | null;
  estado: "trabajando" | "termino" | "fallo";
  inicioMs: number;
  finMs: number | null;
  // Lo que agrega el puente desde el equipo vivo (puede faltar en avisos viejos).
  tareaCompleta?: string | null;
  args?: Record<string, string> | null;
  actividad?: "en-espera" | "pensando" | "trabajando" | "permiso";
  pasos?: { id: string; herramienta: string; args: Record<string, string>; estado: "en-curso" | "ok" | "error" }[];
  respuesta?: string;
}

/** Lo que se ve de una mascota: su estado de ánimo visible. */
export type Visual = "en-espera" | "pensando" | "trabajando" | "permiso" | "termino" | "fallo";

/** Cuántas mascotas caben en la fila del escenario. */
export const MAX_MASCOTAS = 4;
/** Cuántas columnas de especialistas hay en "Ver a todos" (más la de Brote). */
export const MAX_COLUMNAS = 3;
/** Cuánto celebran los especialistas después de que termina el último, antes de esconderse. */
export const CELEBRAR_MS = 4500;

export function visualDe(t: Trabajando): Visual {
  if (t.estado !== "trabajando") return t.estado;
  return t.actividad ?? (t.herramienta ? "trabajando" : "pensando");
}

/** El estado del personaje para animar la mascota. */
export function estadoDeMascota(visual: Visual): Estado {
  return ({ "en-espera": "reposo", pensando: "pensando", trabajando: "trabajando", permiso: "pidiendo-permiso", termino: "listo", fallo: "error" } as const)[visual];
}

function recortar(texto: string, max: number): string {
  const limpio = sinMarcas(texto).replace(/\s+/g, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

/** El texto sin las marcas del markdown (negritas, títulos, viñetas): el globito es texto corto. */
function sinMarcas(texto: string): string {
  return texto.replace(/[*_`]+/g, "").replace(/^\s*(#+|[-•]|\d+\.)\s+/gm, "");
}

/** Lo que dice el globito: la herramienta en curso ("Leyendo es.wikipedia.org…"), el comienzo de su respuesta… */
export function globoDe(t: Trabajando): string {
  switch (visualDe(t)) {
    case "termino":
      return t.respuesta ? `¡Listo! ${recortar(t.respuesta, 40)}` : "¡Listo! ✓";
    case "fallo":
      return "No pude terminar 😕";
    case "permiso":
      return "Te pido permiso ✋";
    case "en-espera":
      return "Preparándome…";
    default:
      if (t.herramienta) return etiquetaHerramienta(t.herramienta, t.args ?? undefined);
      if (t.respuesta) return `«${recortar(t.respuesta, 44)}»`;
      return "Pensando…";
  }
}

/** Los que trabajan primero (en el orden en que partieron); después los que terminaron. */
function ordenar(lista: readonly Trabajando[]): Trabajando[] {
  return [...lista].sort((a, b) => Number(b.estado === "trabajando") - Number(a.estado === "trabajando") || a.inicioMs - b.inicioMs);
}

/**
 * Las mascotas en el escenario: mientras alguno trabaja, todos los del turno (como mucho 4); cuando
 * terminan todos, siguen `CELEBRAR_MS` celebrando y después se esconden.
 */
export function mascotasEnEscena(lista: readonly Trabajando[], ahoraMs: number): Trabajando[] {
  if (lista.length === 0) return [];
  const trabajando = lista.some((t) => t.estado === "trabajando");
  const ultimoFin = Math.max(...lista.map((t) => t.finMs ?? 0));
  if (!trabajando && ahoraMs - ultimoFin >= CELEBRAR_MS) return [];
  // Si no caben todos, quedan los que trabajan; en la fila, siempre en el orden en que partieron (no se cambian de lugar).
  return ordenar(lista)
    .slice(0, MAX_MASCOTAS)
    .sort((a, b) => a.inicioMs - b.inicioMs || a.sesion.localeCompare(b.sesion));
}

/** Si el equipo terminó todo (para celebrar y para cerrar "Ver a todos"). */
export function equipoTermino(lista: readonly Trabajando[]): boolean {
  return lista.length > 0 && lista.every((t) => t.estado !== "trabajando");
}

/** Los que ya se escondieron pero siguen a mano un minuto (fichas para ver su conversación). */
export function terminadosALaMano(lista: readonly Trabajando[], ahoraMs: number): Trabajando[] {
  if (mascotasEnEscena(lista, ahoraMs).length > 0) return [];
  return ordenar(lista).filter((t) => t.finMs !== null && ahoraMs - t.finMs < TERMINADO_A_LA_VISTA_MS);
}

/** Las columnas de "Ver a todos": hasta 3 especialistas, los que trabajan primero. */
export function columnasTodos(lista: readonly Trabajando[]): Trabajando[] {
  return ordenar(lista).slice(0, MAX_COLUMNAS);
}

export interface PasoVisible {
  texto: string;
  estado: "en-curso" | "ok" | "error";
}

/** Los pasos de su conversación, dichos como en la isla ("Buscando «mitosis»…" → "Buscando «mitosis»"). */
export function pasosVisibles(t: Pick<Trabajando, "pasos">): PasoVisible[] {
  return (t.pasos ?? []).map((p) => {
    const texto = etiquetaHerramienta(p.herramienta, p.args);
    return { texto: p.estado === "en-curso" ? texto : texto.replace(/…$/, ""), estado: p.estado };
  });
}

/** "🔎 Investigador · Gemini" en texto, para el `title` y los lectores de pantalla. */
export function nombreConIA(t: Pick<Trabajando, "emoji" | "nombre" | "ia">): string {
  return `${t.emoji} ${t.nombre}${t.ia ? ` · ${t.ia}` : ""}`;
}

/** Cuánto sigue a la vista un especialista que ya terminó (después se va solo). */
export const TERMINADO_A_LA_VISTA_MS = 60_000;

// ---------------------------------------------------------------- Configurar Brote → Equipo

/** Una cuenta de IA como la manda `configurar equipo`. */
export interface EstadoCuenta {
  id: string;
  nombre: string;
  probado: boolean;
  conexion: "claude-code" | "clave" | "terminal";
  terminal: string | null;
  requisito: string;
  aviso: string | null;
  modelos: readonly { ref: string; nombre: string }[];
  conectada: boolean;
}

/** Un especialista como lo manda `configurar equipo`. */
export interface EstadoEspecialista {
  id: string;
  nombre: string;
  emoji: string;
  rol: string;
  sugerido: string;
  activo: boolean;
  modelo: string | null;
  instrucciones: string;
  /** Su SOUL.md (sin el título): la del catálogo o la que escribió el usuario. */
  personalidad: string;
  /** Su personalidad en una línea. */
  vibe: string;
  dentroDeBrote: boolean;
}

export interface OpcionModelo {
  ref: string;
  /** "Gemini · Gemini 3.5 Flash". */
  nombre: string;
}

/** Los modelos que se pueden elegir: solo los de cuentas conectadas (y el actual, aunque su cuenta ya no esté). */
export function modelosElegibles(cuentas: readonly EstadoCuenta[], actual: string | null = null): OpcionModelo[] {
  const opciones = cuentas
    .filter((c) => c.conectada)
    .flatMap((c) => c.modelos.map((m) => ({ ref: m.ref, nombre: `${c.nombre} · ${m.nombre}` })));
  if (actual && !opciones.some((o) => o.ref === actual)) {
    const cuenta = cuentas.find((c) => c.modelos.some((m) => m.ref === actual));
    const modelo = cuenta?.modelos.find((m) => m.ref === actual);
    opciones.unshift({ ref: actual, nombre: `${cuenta?.nombre ?? "?"} · ${modelo?.nombre ?? actual} (sin conectar)` });
  }
  return opciones;
}

/** Con qué modelo parte un especialista al prenderlo: el sugerido si su IA está conectada; si no, el primero disponible. */
export function modeloInicial(especialista: Pick<EstadoEspecialista, "sugerido" | "modelo">, cuentas: readonly EstadoCuenta[]): string | null {
  if (especialista.modelo) return especialista.modelo;
  const elegibles = modelosElegibles(cuentas);
  return elegibles.find((o) => o.ref === especialista.sugerido)?.ref ?? elegibles[0]?.ref ?? null;
}
