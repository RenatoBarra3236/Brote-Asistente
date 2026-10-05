// Textos y ajustes de "Grabar y transcribir" (sin imports de Node: los usa también la ventana de
// Configurar Brote). El de consentimiento resume docs/privacidad.md; si cambia, sube la versión y se
// vuelve a pedir (Rust y una prueba del motor comparan la versión).

import { MODELO_WHISPER_POR_DEFECTO, esModeloWhisper, type ModeloWhisper } from "./modelos-whisper.ts";
import { DIAS_AUDIO_POR_DEFECTO } from "./transcripciones.ts";

export const VERSION_CONSENTIMIENTO_GRABACIONES = 1;

export const TEXTO_CONSENTIMIENTO_GRABACIONES =
  " Entiendo que Brote graba solo cuando yo lo inicio y transcribe en este computador (el audio no sale de él). " +
  "El audio se borra solo pasados los días que elija y el texto se queda hasta que yo lo borre; todo queda en claro, " +
  "con permisos de mi usuario. Las clases y reuniones tienen la voz de otras personas: Brote me preguntará en cada " +
  "grabación si avisé a los presentes, pero avisar o pedir permiso es cosa mía, no de Brote.";

export const MIN_DIAS_AUDIO = 1;
export const MAX_DIAS_AUDIO = 365;

export interface AjustesGrabaciones {
  modelo: ModeloWhisper;
  diasAudio: number;
  /** El usuario aceptó la versión actual del texto de consentimiento. */
  consentimiento: boolean;
}

export function normalizarAjustesGrabaciones(crudo: unknown): AjustesGrabaciones {
  const o = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
  const dias = o.diasAudio;
  return {
    modelo: esModeloWhisper(o.modelo) ? o.modelo : MODELO_WHISPER_POR_DEFECTO,
    diasAudio:
      typeof dias === "number" && Number.isInteger(dias) && dias >= MIN_DIAS_AUDIO && dias <= MAX_DIAS_AUDIO ? dias : DIAS_AUDIO_POR_DEFECTO,
    consentimiento: o.consentimiento === VERSION_CONSENTIMIENTO_GRABACIONES,
  };
}

