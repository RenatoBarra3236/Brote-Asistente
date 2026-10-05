// Textos, modelos y ajustes de "Grabar y transcribir", tal como los define el motor (sin Node: se puede
// usar en las ventanas). Ver packages/motor/src/modelos-whisper.ts y grabaciones-textos.ts.

export * from "../../../../packages/motor/src/modelos-whisper.ts";
export * from "../../../../packages/motor/src/grabaciones-textos.ts";

// ---- La grabación en la isla (sección 8, fase 3) ----
// Estado y textos, sin DOM ni Tauri (se prueba con Node). Rust (`grabacion.rs`) captura; la ventana solo
// pide iniciar y detener, y escucha el evento `grabacion`.

import { AVISOS_A_PRESENTES, idDeGrabacion, type AvisoAPresentes } from "../../../../packages/motor/src/transcripciones.ts";

export { AVISOS_A_PRESENTES, type AvisoAPresentes };

/** El evento `grabacion` de Rust. */
export interface EventoGrabacion {
  fase: "grabando" | "sin-sonido" | "terminada" | "lista" | "error";
  id: string;
  segundos: number;
  detalle: string | null;
}

/** Lo que la isla necesita saber de la grabación. */
export type EstadoGrabacion =
  | { fase: "inactiva" }
  /** La pregunta "¿avisaste a los presentes?": todavía no se grabó nada. */
  | { fase: "pregunta" }
  | { fase: "iniciando" }
  | { fase: "grabando"; id: string; segundos: number; sinSonido: string | null }
  /** Se pidió detener (o la captura se cortó sola) y Rust está cerrando el archivo. */
  | { fase: "deteniendo"; id: string }
  | { fase: "error"; mensaje: string };

export const GRABACION_INACTIVA: EstadoGrabacion = { fase: "inactiva" };

/** Un id nuevo, con la hora local (lo mismo que `idDeGrabacion` del motor). */
export function nuevoIdDeGrabacion(ahora: Date = new Date()): string {
  return idDeGrabacion(ahora);
}

/** El transcurso, "12:05" o "1:02:03". */
export function tiempoGrabado(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const dos = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  return h > 0 ? `${h}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}` : `${dos(Math.floor(s / 60))}:${dos(s % 60)}`;
}

/** Cómo cambia el estado cuando Rust avisa. Un evento de otra grabación no cambia nada. */
export function conEvento(estado: EstadoGrabacion, e: EventoGrabacion): EstadoGrabacion {
  switch (e.fase) {
    case "grabando":
      if (estado.fase === "iniciando") return { fase: "grabando", id: e.id, segundos: e.segundos, sinSonido: null };
      if (estado.fase === "grabando" && estado.id === e.id) return { ...estado, segundos: e.segundos };
      return estado;
    case "sin-sonido":
      return estado.fase === "grabando" && estado.id === e.id ? { ...estado, sinSonido: e.detalle } : estado;
    case "terminada":
      // La captura se cortó sola (tope de 3 h o el micrófono falló): el audio se conserva; falta cerrarla.
      return estado.fase === "grabando" && estado.id === e.id ? { fase: "deteniendo", id: e.id } : estado;
    case "error":
      return estado.fase === "iniciando" || estado.fase === "grabando"
        ? { fase: "error", mensaje: e.detalle ?? "No pude grabar." }
        : estado;
    case "lista":
      return estado.fase === "grabando" || estado.fase === "deteniendo" ? { fase: "deteniendo", id: e.id } : estado;
  }
}

/** Las tres respuestas de "¿avisaste a los presentes?", con su texto. */
export const OPCIONES_AVISO: readonly { valor: AvisoAPresentes; texto: string }[] = [
  { valor: "si", texto: "Sí, avisé" },
  { valor: "no", texto: "No avisé" },
  { valor: "solo-mi-voz", texto: "Solo mi voz" },
];

export const TEXTO_PREGUNTA_AVISO = "¿Avisaste a los presentes que vas a grabar?";

/** Cómo quedó la grabación, para avisar sin abrir la isla. Transcribir es un paso aparte, en la pestaña Grabar. */
export function textoGrabacionGuardada(segundos: number): string {
  return `🎙 Grabé ${tiempoGrabado(segundos)}. Está en la pestaña Grabar: tócala para transcribirla.`;
}

/**
 * Si el error de la captura es por el permiso del micrófono (Rust lo explica en `explicar`, con «permiso»
 * y «micrófono»): entonces la isla ofrece «Abrir Privacidad». Un micrófono ausente u ocupado no lo es.
 */
export function esErrorDePermisoMicrofono(mensaje: string): boolean {
  return /permiso/i.test(mensaje) && /micr[oó]fono/i.test(mensaje);
}

// ---- Las frases sin IA ("graba esta clase") ----

/** Lo que hace la isla cuando el motor pide grabar (`datos: { grabar }`). */
export type AccionDeFrase =
  | { hacer: "preguntar" }
  | { hacer: "detener" }
  | { hacer: "avisar"; texto: string };

/**
 * Qué hacer con `datos.grabar` del motor según el estado. Iniciar SIEMPRE pasa por la pregunta
 * «¿avisaste a los presentes?» (nunca graba directo); detener solo si se está grabando.
 */
export function accionDeFrase(datos: unknown, estado: EstadoGrabacion): AccionDeFrase | null {
  const grabar = (datos as { grabar?: unknown } | null | undefined)?.grabar;
  if (grabar !== "iniciar" && grabar !== "detener" && grabar !== "estado") return null;
  const grabando = estado.fase === "grabando";
  switch (grabar) {
    case "iniciar":
      if (grabando) return { hacer: "avisar", texto: `🔴 Ya estoy grabando (${tiempoGrabado(estado.segundos)}).` };
      if (estado.fase === "inactiva" || estado.fase === "error") return { hacer: "preguntar" };
      return { hacer: "avisar", texto: "Ya hay una grabación en curso o a punto de empezar." };
    case "detener":
      if (grabando) return { hacer: "detener" };
      if (estado.fase === "pregunta") return { hacer: "avisar", texto: "Todavía no empecé a grabar: no hay nada que detener." };
      return { hacer: "avisar", texto: "No estoy grabando nada." };
    case "estado":
      return {
        hacer: "avisar",
        texto: grabando ? `🔴 Sí, llevo ${tiempoGrabado(estado.segundos)} grabando.` : estado.fase === "iniciando" ? "Estoy abriendo el micrófono…" : "No, no estoy grabando.",
      };
  }
}
