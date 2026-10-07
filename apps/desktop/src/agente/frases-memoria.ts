// «Lo que sé de ti → Frases que aprendí» y «Frases que no entendí» (capa D del plan sin IA): textos puros de la ventana.
// Sin DOM, para probarlo con Node. Las frases guardadas son lo que el usuario escribió: nunca van a un registro.

export const NOTA_FRASES_CONFIRMADAS = "Frases que confirmaste con un toque («almuerzo 5 lucas» → «gasté 5 lucas en almuerzo»). Valen solo para ti, no se envían a ningún lado y se borran de a una o todas.";

export const TITULO_NO_ENTENDIDAS = "Frases que no entendí";
export const NOTA_NO_ENTENDIDAS =
  "Brote puede guardar en este computador lo que no logró entender sin IA, para que veas qué le falta. Está apagado: solo se guarda con tu permiso, nada sale solo y puedes borrar o copiar estas frases. Si quieres ayudar a mejorarlo, copia las que quieras y mándaselas a quien desarrolla Brote.";
export const TEXTO_PERMISO_NO_ENTENDIDAS = "Guardar en este computador las frases que no entiendo";
export const VACIO_NO_ENTENDIDAS = "No hay frases guardadas.";
export const VACIO_NO_ENTENDIDAS_APAGADO = "Está apagado: no guardo nada de lo que no entiendo.";
export const AVISO_PERMISO_ACTIVADO = "Listo, desde ahora guardo en este computador lo que no entienda. Puedes verlo y borrarlo aquí.";
export const AVISO_PERMISO_DESACTIVADO = "Listo, ya no guardo lo que no entiendo. Lo que ya estaba guardado sigue aquí hasta que lo borres.";

export interface FraseConfirmada {
  forma: string;
  destino: string;
  veces: number;
  ms: number;
}

export interface FraseNoEntendida {
  id: number;
  frase: string;
  ms: number;
}

/** «almuerzo [monto]» → «gaste [monto] en almuerzo»: el monto se guarda como hueco, nunca el valor. */
export function textoDeFraseConfirmada(f: FraseConfirmada): { entrada: string; destino: string } {
  const bonito = (t: string) => t.replace(/\{monto\}/g, "[monto]");
  return { entrada: bonito(f.forma), destino: bonito(f.destino) };
}

export function lineaDeVeces(veces: number): string {
  return veces <= 1 ? "confirmada 1 vez" : `confirmada ${veces} veces`;
}

/** El texto que se copia: una frase por línea (sin fechas ni nada más). */
export function textoParaCopiar(frases: readonly FraseNoEntendida[]): string {
  return frases.map((f) => f.frase).join("\n");
}

export function avisoCopiadas(ok: boolean, cuantas: number): string {
  if (!ok) return "No pude copiar. Selecciona el texto de las frases y cópialo a mano.";
  return cuantas === 1 ? "Copié 1 frase. Pégala donde quieras mandarla." : `Copié ${cuantas} frases, una por línea. Pégalas donde quieras mandarlas.`;
}

export function cuentaNoEntendidas(frases: readonly FraseNoEntendida[]): string {
  return String(frases.length);
}
