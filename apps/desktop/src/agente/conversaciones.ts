// «Anteriores»: las conversaciones pasadas de Brote en la isla (lista, chat entero y «Retomar»).
// Lógica pura, sin DOM, para probarla con Node. Los datos vienen del puente (packages/adapter/src/conversaciones.ts).

export interface ConversacionGuardada {
  id: string;
  titulo: string;
  /** Fecha ISO de cuando terminó (o del último mensaje, si sigue abierta). */
  fecha: string;
  extracto: string;
  /** Mensajes del chat completo (0: solo queda el resumen). */
  mensajes: number;
}

export interface MensajeChat {
  rol: "tu" | "brote";
  texto: string;
  t: number;
}

export interface ConversacionLeida {
  id: string;
  titulo: string;
  resumen: string;
  mensajes: MensajeChat[];
  recortada: boolean;
}

/** El id de la conversación que sigue abierta. */
export const ID_ACTUAL = "actual";

/** Cuánto del final de una conversación se le pasa a Brote al retomarla. */
export const RETOMAR_MAX_MENSAJES = 10;
export const RETOMAR_MAX_POR_MENSAJE = 3000;
export const RETOMAR_MAX_TOTAL = 9000;
/** Lo que se pone donde un mensaje se cortó por largo (y que Brote entienda que no es el final real). */
export const MARCA_RECORTADO = " […recortado]";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** «hoy 18:41», «ayer 09:05» o «5 oct» (la hora solo la llevan hoy y ayer). */
export function etiquetaDeFecha(iso: string, ahora: Date): string {
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "";
  const inicioDe = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicioDe(ahora) - inicioDe(f)) / 86_400_000);
  const hora = `${dosDigitos(f.getHours())}:${dosDigitos(f.getMinutes())}`;
  if (dias === 0) return `hoy ${hora}`;
  if (dias === 1) return `ayer ${hora}`;
  return `${f.getDate()} ${MESES_CORTOS[f.getMonth()]}`;
}

/** «12 mensajes», «1 mensaje» o «solo el resumen». */
export function cuentaDeMensajes(n: number): string {
  if (n <= 0) return "solo el resumen";
  return n === 1 ? "1 mensaje" : `${n} mensajes`;
}

/** La línea de debajo del título en la lista: «12 mensajes · ayer 18:41». */
export function lineaDeConversacion(c: ConversacionGuardada, ahora: Date): string {
  return `${cuentaDeMensajes(c.mensajes)} · ${etiquetaDeFecha(c.fecha, ahora)}`;
}

function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+\n/g, "\n").trim();
  return limpio.length <= max ? limpio : `${limpio.slice(0, max).trimEnd()}${MARCA_RECORTADO}`;
}

/**
 * El mensaje con el que «Retomar» le pasa la conversación a Brote: lo último que se habló (o, si ya no
 * está el chat, el resumen) y una invitación a seguir. Va con el tope de tamaño de las constantes; si algo se
 * cortó, el mensaje lo dice para que Brote no crea que así terminó.
 */
export function mensajeParaRetomar(c: ConversacionLeida): string {
  const cabecera = c.id === ID_ACTUAL ? "Retomemos nuestra conversación de antes." : `Retomemos una conversación anterior (${c.titulo.replace(/^Conversación del /, "la del ")}).`;
  let cuerpo: string;
  let cortado = c.recortada;
  if (c.mensajes.length > 0) {
    const ultimos = c.mensajes.slice(-RETOMAR_MAX_MENSAJES);
    if (ultimos.length < c.mensajes.length) cortado = true;
    const lineas = ultimos.map((m) => `${m.rol === "tu" ? "Tú" : "Brote"}: ${recortar(m.texto, RETOMAR_MAX_POR_MENSAJE)}`);
    // Si se pasa del total, se quitan los más viejos (lo último es lo que importa para seguir).
    while (lineas.length > 1 && lineas.join("\n\n").length > RETOMAR_MAX_TOTAL) {
      lineas.shift();
      cortado = true;
    }
    if (lineas.some((l) => l.endsWith(MARCA_RECORTADO))) cortado = true;
    cuerpo = lineas.join("\n\n");
  } else {
    cuerpo = recortar(c.resumen, RETOMAR_MAX_TOTAL / 2);
    cortado = true;
  }
  const aviso = cortado
    ? "\n\n(Es el final de la conversación: lo anterior y lo que dice «[…recortado]» no se incluyó; si necesitas algo de eso, pídemelo.)"
    : "";
  return `${cabecera} Esto fue lo último que hablamos:\n\n${cuerpo}${aviso}\n\nSigamos desde ahí.`;
}

/** Lo que dice la lista cuando no hay nada. */
export const TEXTO_SIN_CONVERSACIONES =
  "Todavía no hay conversaciones anteriores. Se guardan solas cuando empiezas una conversación nueva (con «Empezar conversación nueva» en «Lo que sé de ti» o /new en la terminal).";

/** Lo que se explica arriba de un resumen cuando el chat completo ya no está. */
export const TEXTO_SOLO_RESUMEN =
  "El chat completo ya no está (Claude Code borra sus transcripciones a los 30 días). Esto es lo que quedó guardado:";

export const TEXTO_RECORTADA = "Es una conversación larga: se muestran los últimos mensajes.";
