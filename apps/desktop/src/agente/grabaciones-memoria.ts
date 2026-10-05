// La sección «Grabaciones» de «Lo que sé de ti», sin DOM ni Tauri (se prueba con Node). Los datos los arma
// el puente (`packages/adapter/src/memoria-grabaciones.ts`); aquí solo los textos para mostrarlos.

import type { AvisoAPresentes } from "../../../../packages/motor/src/transcripciones.ts";

export interface ItemTranscripcion {
  id: string;
  fecha: string | null;
  duracionSeg: number;
  avisoAPresentes: AvisoAPresentes;
  modelo: string;
}

export interface ItemAudio {
  id: string;
  fecha: string | null;
  bytes: number;
  venceEn: string | null;
  vencido: boolean;
  transcrito: boolean;
}

export interface Grabaciones {
  transcripciones: ItemTranscripcion[];
  audios: ItemAudio[];
  diasAudio: number;
}

const AVISOS: Record<AvisoAPresentes, string> = {
  si: "Avisé a los presentes",
  no: "No avisé a los presentes",
  "solo-mi-voz": "Solo mi voz",
};

export function textoAviso(aviso: AvisoAPresentes): string {
  return AVISOS[aviso] ?? "Sin dato";
}

/** "12 min", "1 h 05 min". */
export function textoDuracion(segundos: number): string {
  const minutos = Math.max(1, Math.round(segundos / 60));
  const horas = Math.floor(minutos / 60);
  return horas > 0 ? `${horas} h ${String(minutos % 60).padStart(2, "0")} min` : `${minutos} min`;
}

/** "480 KB", "34 MB", "1,2 GB" (decimal, como el Finder). */
export function textoTamano(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  if (bytes < 1_000_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(1).replace(".", ",")} GB`;
}

/** Cuándo se borra solo el audio: "se borra en 3 días", "se borra en la próxima hora"… */
export function textoVencimiento(audio: ItemAudio, ahoraMs: number): string {
  if (audio.vencido) return "ya venció: se borra en la próxima hora, si Grabar y transcribir está prendido";
  if (!audio.venceEn) return "";
  const dias = Math.ceil((new Date(audio.venceEn).getTime() - ahoraMs) / 86_400_000);
  return dias <= 1 ? "se borra en menos de un día" : `se borra en ${dias} días`;
}

/** El título de una grabación: "5 oct, 10:30". */
export function textoFecha(iso: string | null, id: string): string {
  if (!iso) return id;
  const fecha = new Date(iso);
  const dia = fecha.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  const hora = fecha.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${dia}, ${hora}`;
}

/** Cuántas cosas hay para el contador de la sección. */
export function totalGrabaciones(g: Grabaciones | null): number {
  return g ? g.transcripciones.length + g.audios.length : 0;
}

// ---- La pestaña «Grabar» de la isla (grabaciones guardadas y sus transcripciones) ----

/** Lo que el puente avisa mientras transcribe (`transcripcion`). */
export type FaseTranscripcion = "en-cola" | "transcribiendo" | "lista" | "error" | "cancelada";

/** Bytes por segundo del WAV que graba Rust: mono, 16 kHz, 16 bits. */
const BYTES_POR_SEGUNDO = 32_000;
const ENCABEZADO_WAV = 44;

/** Cuánto dura un audio, según su tamaño (el WAV es de formato fijo). */
export function duracionDeAudio(bytes: number): number {
  return Math.max(0, Math.round((bytes - ENCABEZADO_WAV) / BYTES_POR_SEGUNDO));
}

export type EstadoDeAudio = "sin-transcribir" | "en-cola" | "transcribiendo" | "transcrita" | "error";

/** En qué anda un audio: lo que se sabe de la transcripción guardada y lo último que avisó el puente. */
export function estadoDeAudio(audio: ItemAudio, fase: FaseTranscripcion | undefined): EstadoDeAudio {
  if (fase === "en-cola" || fase === "transcribiendo") return fase;
  if (audio.transcrito) return "transcrita";
  return fase === "error" ? "error" : "sin-transcribir";
}

export const TEXTO_ESTADO_AUDIO: Record<EstadoDeAudio, string> = {
  "sin-transcribir": "Sin transcribir",
  "en-cola": "En cola…",
  transcribiendo: "Transcribiendo…",
  transcrita: "Transcrita",
  error: "No se pudo transcribir",
};

/** Lo que dice el encabezado de la pestaña según el estado de la grabación. */
export function textoBotonGrabar(fase: string): string {
  switch (fase) {
    case "inactiva":
      return "Nueva grabación";
    case "pregunta":
      return "Responde la pregunta de abajo";
    case "iniciando":
      return "Abriendo el micrófono…";
    case "grabando":
      return "Grabando… (detén desde abajo)";
    default:
      return "Guardando…";
  }
}

/** Lo que dice el botón «Copiar» al terminar. */
export function textoCopiado(ok: boolean, recortado: boolean): string {
  if (!ok) return "No pude copiar";
  return recortado ? "Copiado (recortado: es larguísima)" : "Copiado ✓";
}

/** Lo que se ve cuando no hay nada en una subpestaña. */
export function textoVacioGrabar(sub: "audios" | "textos", funcionPrendida: boolean): string {
  if (!funcionPrendida) return "Grabar y transcribir está apagado: actívalo en Configurar Brote ⚙️. Lo ya guardado se ve igual.";
  return sub === "audios"
    ? "Todavía no hay grabaciones. Toca el micrófono para grabar una clase o una reunión."
    : "Todavía no hay transcripciones. Toca una grabación y elige «Transcribir».";
}
