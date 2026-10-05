// Lo que el motor responde a las frases de grabar y transcribir (sección 8, fase 4). Puro: sin disco.
// El motor NO graba: la captura es de Rust y de la ventana. Para iniciar y detener devuelve en `datos`
// una acción `{ grabar: "iniciar" | "detener" | "estado" }` y la isla hace lo mismo que el botón 🎙
// (incluida la pregunta "¿avisaste a los presentes?", que nunca se salta).

import { fechaCorta } from "./periodos.ts";
import { fechaDeId, type CabeceraTranscripcion } from "./transcripciones.ts";

export type AccionGrabar = "iniciar" | "detener" | "estado";

/** Cuántas transcripciones lista "mis transcripciones". */
export const MAX_LISTADAS = 5;

const AVISO_CORTO = { si: "avisé", no: "sin aviso", "solo-mi-voz": "solo mi voz" } as const;

/** "12 min", "1 h 05 min". */
export function duracionCorta(segundos: number): string {
  const minutos = Math.max(1, Math.round(segundos / 60));
  const horas = Math.floor(minutos / 60);
  return horas > 0 ? `${horas} h ${String(minutos % 60).padStart(2, "0")} min` : `${minutos} min`;
}

function linea(c: CabeceraTranscripcion, ahora: Date): string {
  const fecha = fechaDeId(c.id);
  const cuando = fecha ? `${fechaCorta(fecha, ahora)} ${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}` : c.id;
  return `• ${cuando} · ${duracionCorta(c.duracionSeg)} · ${AVISO_CORTO[c.avisoAPresentes]}`;
}

/** "Mis transcripciones": las últimas, de la más nueva a la más vieja (el texto no se muestra aquí). */
export function describirTranscripciones(lista: readonly CabeceraTranscripcion[], ahora: Date): string {
  if (lista.length === 0) return "🎙 Todavía no tienes transcripciones. Cuando grabes algo, aparece aquí.";
  const ultimas = lista.slice(0, MAX_LISTADAS).map((c) => linea(c, ahora));
  const mas = lista.length > MAX_LISTADAS ? `\nY ${lista.length - MAX_LISTADAS} más en 🧠 Lo que sé de ti → Grabaciones.` : "";
  return `🎙 Tus últimas transcripciones:\n${ultimas.join("\n")}${mas}`;
}

/** "¿Qué grabé hoy?" */
export function describirGrabadoHoy(lista: readonly CabeceraTranscripcion[], ahora: Date): string {
  const hoy = lista.filter((c) => {
    const fecha = fechaDeId(c.id);
    return fecha !== null && fechaCorta(fecha, ahora) === "hoy";
  });
  if (hoy.length === 0) return "🎙 Hoy no has grabado nada que yo sepa.";
  const total = hoy.reduce((suma, c) => suma + c.duracionSeg, 0);
  const cuantas = hoy.length === 1 ? "1 grabación" : `${hoy.length} grabaciones`;
  return `🎙 Hoy tienes ${cuantas} (${duracionCorta(total)} en total):\n${hoy.map((c) => linea(c, ahora)).join("\n")}`;
}

/** Lo que dice el motor al pedirle grabar; el resto lo hace la isla. */
export const TEXTO_GRABAR: Record<AccionGrabar, string> = {
  iniciar: "🎙 Vamos. Primero te pregunto algo…",
  detener: "🎙 Detengo la grabación.",
  estado: "🎙 Reviso…",
};
