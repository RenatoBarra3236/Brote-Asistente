// Qué dice "Lo que sé de ti" al olvidar, según lo que de verdad pasa en cada sistema
// (`aLaPapelera` en packages/adapter/src/memoria.ts): en macOS el archivo va a la Papelera y
// sigue ahí hasta vaciarla; en Windows y Linux se borra para siempre, sin Papelera.

/** Texto fijo al pie de la ventana. */
export function pieOlvidar(enMac: boolean): string {
  return enMac
    ? "Lo que olvidas va a la Papelera: Brote deja de usarlo desde la próxima conversación, pero el archivo sigue en tu Mac hasta que vacíes la Papelera."
    : "Lo que olvidas se borra para siempre (no pasa por la Papelera). Brote deja de usarlo desde la próxima conversación.";
}

/** Aviso al olvidar un recuerdo o una frase. */
export function avisoOlvidado(enMac: boolean): string {
  return enMac
    ? "Listo, lo olvidé. Quedó en la Papelera hasta que la vacíes. Para que Brote deje de usarlo ya, empieza una conversación nueva."
    : "Listo, lo olvidé y se borró. Para que Brote deje de usarlo ya, empieza una conversación nueva.";
}

/**
 * Aviso al olvidar una conversación: además del resumen, su chat completo (las transcripciones de Claude Code
 * del espacio de Brote). `quedan` = archivos que mezclan otra conversación: no se reescriben, pero lo olvidado
 * ya no se muestra, y Claude Code los borra solo a los 30 días.
 */
export function avisoConversacionOlvidada(enMac: boolean, archivos: number, quedan: number): string {
  const base = avisoOlvidado(enMac);
  if (archivos === 0 && quedan === 0) return base;
  const chat = archivos > 0 ? ` Su chat completo también se ${enMac ? "mandó a la Papelera" : "borró"} (${archivos} ${archivos === 1 ? "archivo" : "archivos"}).` : "";
  const resto =
    quedan > 0
      ? ` ${quedan === 1 ? "Un archivo de Claude Code mezcla" : `${quedan} archivos de Claude Code mezclan`} esa conversación con otra: no se pueden tocar, así que ya no se muestran en la isla y Claude Code los borra solos a los 30 días.`
      : "";
  return `${base}${chat}${resto}`;
}

/** Aviso al olvidar todo sobre un tema (la conversación nueva ya se empezó). */
export function avisoTemaOlvidado(enMac: boolean, olvidados: number, tema: string): string {
  const cosas = `${olvidados} ${olvidados === 1 ? "cosa" : "cosas"}`;
  const destino = enMac ? " Quedaron en la Papelera hasta que la vacíes." : " Se borraron para siempre.";
  return `Olvidé ${cosas} sobre «${tema}» y empecé una conversación nueva.${destino} 🌱`;
}

// ---- Grabaciones y transcripciones (sección 8, fase 4) ----

/** Qué es lo que se borra: una transcripción o un audio. */
export type QueGrabacion = "transcripcion" | "audio";

/** Texto fijo al pie de la sección «Grabaciones». */
export function pieGrabaciones(enMac: boolean): string {
  return enMac
    ? "Lo que borras aquí va a la Papelera: sigue en tu Mac hasta que la vacíes. El audio se borra solo a los días que elijas en Configurar Brote; las transcripciones, no."
    : "Lo que borras aquí se borra para siempre (no pasa por la Papelera). El audio se borra solo a los días que elijas en Configurar Brote; las transcripciones, no.";
}

/** Aviso al borrar una o varias grabaciones. */
export function avisoGrabacionBorrada(enMac: boolean, que: QueGrabacion, cuantas: number): string {
  if (cuantas === 0) return "No había nada que borrar: ya no estaba.";
  const cosa = que === "audio" ? (cuantas === 1 ? "el audio" : `${cuantas} audios`) : cuantas === 1 ? "la transcripción" : `${cuantas} transcripciones`;
  return enMac ? `Borré ${cosa}. Quedó en la Papelera hasta que la vacíes.` : `Borré ${cosa} para siempre.`;
}

/** Lo que dice el botón «Borrar todo» al pedir el segundo toque. */
export function confirmarBorrarTodo(que: QueGrabacion, cuantas: number): string {
  const cosa = que === "audio" ? "audios" : "transcripciones";
  return `¿Seguro? Se borran ${cuantas} ${cosa}`;
}

// ---- Documentos (D): el texto que Brote sacó de los archivos que le diste (el original nunca se toca) ----

export function pieDocumentos(enMac: boolean): string {
  return enMac
    ? "Lo que borras aquí va a la Papelera: sigue en tu Mac hasta que la vacíes. Solo es el texto que Brote sacó: tu archivo original no se toca. Las tarjetas que ya aceptaste de un documento se quedan (se borran en «Repaso»)."
    : "Lo que borras aquí se borra para siempre (no pasa por la Papelera). Solo es el texto que Brote sacó: tu archivo original no se toca. Las tarjetas que ya aceptaste de un documento se quedan (se borran en «Repaso»).";
}

export function avisoDocumentoBorrado(enMac: boolean, cuantos: number): string {
  if (cuantos === 0) return "No había nada que borrar: ya no estaba.";
  const cosa = cuantos === 1 ? "el documento" : `${cuantos} documentos`;
  return enMac ? `Borré ${cosa}. Quedó en la Papelera hasta que la vacíes.` : `Borré ${cosa} para siempre.`;
}

export function confirmarBorrarTodosDocumentos(cuantos: number): string {
  return `¿Seguro? Se borran ${cuantos} documentos`;
}

// ---- Etiqueta y explicación por tipo de almacenamiento (rediseño de «Lo que sé de ti») ----

/**
 * Dónde vive lo que guarda una sección: en archivos (en macOS va a la Papelera) o en la base de datos
 * de Brote (se borra de verdad). En Windows y Linux todo se borra para siempre.
 */
export type Almacenamiento = "papelera" | "definitivo";

/** La etiqueta corta que va junto al título de cada sección. */
export function etiquetaAlmacenamiento(a: Almacenamiento): string {
  return a === "papelera" ? "🗑 Papelera" : "⚠ Definitivo";
}

/** Una sola explicación por tipo, al pie de cada grupo (en vez de repetirla en cada sección). */
export function explicacionAlmacenamiento(a: Almacenamiento): string {
  return a === "papelera"
    ? "🗑 Papelera: lo que borras va a la Papelera y sigue en tu Mac hasta que la vacíes. Brote deja de usarlo desde la próxima conversación."
    : "⚠ Definitivo: se borra para siempre (no pasa por la Papelera). Brote deja de usarlo desde la próxima conversación.";
}
