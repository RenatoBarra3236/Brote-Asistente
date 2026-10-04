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

/** Aviso al olvidar todo sobre un tema (la conversación nueva ya se empezó). */
export function avisoTemaOlvidado(enMac: boolean, olvidados: number, tema: string): string {
  const cosas = `${olvidados} ${olvidados === 1 ? "cosa" : "cosas"}`;
  const destino = enMac ? " Quedaron en la Papelera hasta que la vacíes." : " Se borraron para siempre.";
  return `Olvidé ${cosas} sobre «${tema}» y empecé una conversación nueva.${destino} 🌱`;
}
