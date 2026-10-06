// Documentos (D de docs/plan-estudio-y-mejoras.md): lo que la isla dice y decide al arrastrar un archivo hacia
// Brote. Puro (sin DOM ni Tauri) para probarlo con Node. El texto lo saca el puente; aquí solo hay nombres,
// reglas de qué se acepta y los mensajes que se le mandan al agente.

import { EXTENSIONES_DOCUMENTO, MAX_BYTES_DOCUMENTO, MAX_DOCUMENTOS, tipoDeArchivo } from "../../../../packages/motor/src/documentos-tipos.ts";
import type { CabeceraDocumento } from "../../../../packages/motor/src/documentos-tipos.ts";

export { EXTENSIONES_DOCUMENTO, MAX_BYTES_DOCUMENTO, MAX_DOCUMENTOS };

/** Lo que el puente cuenta de cada documento (nunca su texto ni la ruta del archivo). */
export type DocumentoVista = Pick<CabeceraDocumento, "id" | "nombre" | "tipo" | "paginas" | "caracteres" | "ramoId" | "creado">;

export type FaseDocumento = "inactivo" | "arrastrando" | "leyendo" | "listo" | "error";

export interface ArrastreRevisado {
  /** Rutas con una extensión que Brote sabe leer, en el orden en que llegaron. */
  validos: string[];
  /** Cuántos archivos no se pueden leer (otra extensión). */
  invalidos: number;
  /** El que se va a leer: el primero válido. */
  elegido: string | null;
  /** Cuántos válidos se dejan para después (por ahora se lee uno a la vez). */
  extras: number;
}

/** Mira lo que se está arrastrando (solo por la extensión; el puente revisa el resto al recibirlo). */
export function revisarArrastre(rutas: readonly string[]): ArrastreRevisado {
  const validos = rutas.filter((r) => typeof r === "string" && tipoDeArchivo(r) !== null);
  return { validos, invalidos: rutas.length - validos.length, elegido: validos[0] ?? null, extras: Math.max(0, validos.length - 1) };
}

export const TEXTO_FORMATOS = "Brote lee PDF, Word, PowerPoint y texto.";

/** El mensaje sobre la zona de soltar mientras se arrastra. */
export function textoArrastre(r: ArrastreRevisado): string {
  if (!r.elegido) return `Eso no lo puedo leer. ${TEXTO_FORMATOS}`;
  return r.extras > 0 ? "Suéltalo aquí y Brote lee el primero (de a uno por ahora)" : "Suéltalo aquí y Brote lo lee";
}

/** Un nombre largo se corta en el medio, para que se vea la extensión: «Apuntes de cál…ral.pdf». */
export function nombreCorto(nombre: string, max = 34): string {
  if (nombre.length <= max) return nombre;
  const punto = nombre.lastIndexOf(".");
  const ext = punto > 0 && nombre.length - punto <= 6 ? nombre.slice(punto) : "";
  const cuerpo = nombre.slice(0, nombre.length - ext.length);
  return `${cuerpo.slice(0, Math.max(4, max - ext.length - 1))}…${ext}`;
}

export const textoLeyendo = (nombre: string): string => `Leyendo «${nombreCorto(nombre)}»…`;
export const textoPregunta = (nombre: string): string => `¿Qué hago con «${nombreCorto(nombre)}»?`;

const ETIQUETA_TIPO: Record<string, string> = { pdf: "PDF", docx: "Word", doc: "Word", pptx: "PowerPoint", odt: "Texto", rtf: "Texto", txt: "Texto", md: "Texto" };

/** «PDF · 12 páginas · unas 3.400 palabras». Las palabras se estiman (seis letras cada una). */
export function describirDocumento(d: Pick<DocumentoVista, "tipo" | "paginas" | "caracteres">): string {
  const partes = [ETIQUETA_TIPO[d.tipo] ?? d.tipo];
  if (d.paginas !== null) partes.push(d.tipo === "pptx" ? (d.paginas === 1 ? "1 diapositiva" : `${d.paginas} diapositivas`) : d.paginas === 1 ? "1 página" : `${d.paginas} páginas`);
  const estimadas = d.caracteres / 6;
  if (estimadas >= 150) partes.push(`unas ${(Math.round(estimadas / 100) * 100).toLocaleString("es-CL")} palabras`);
  return partes.join(" · ");
}

export type AccionDocumento = "resumen" | "tarjetas" | "preguntas" | "otra";

export const ACCIONES_DOCUMENTO: { id: AccionDocumento; etiqueta: string; emoji: string; ayuda: string }[] = [
  { id: "resumen", etiqueta: "Resumen", emoji: "📝", ayuda: "Brote lo lee y te cuenta lo importante" },
  { id: "tarjetas", etiqueta: "Tarjetas de repaso", emoji: "🧠", ayuda: "Brote arma tarjetas y tú eliges cuáles quedarte" },
  { id: "preguntas", etiqueta: "Preguntas de práctica", emoji: "❓", ayuda: "Brote prepara preguntas con sus respuestas" },
  { id: "otra", etiqueta: "Otra cosa", emoji: "💬", ayuda: "Escribe lo que quieras pedirle" },
];

/** Lo que se le escribe al agente. Lleva el id para que no tenga que adivinar de qué documento se trata. */
export function mensajeParaAgente(accion: Exclude<AccionDocumento, "otra">, d: Pick<DocumentoVista, "id" | "nombre">): string {
  const de = `del documento «${d.nombre}» (id ${d.id})`;
  const leer = "Léelo entero con documentos_leer";
  switch (accion) {
    case "resumen":
      return `Hazme un resumen ${de}. ${leer}.`;
    case "tarjetas":
      return `Hazme tarjetas de repaso ${de}. ${leer} y déjalas como propuesta con repaso_proponer.`;
    case "preguntas":
      return `Hazme preguntas de práctica con sus respuestas ${de}. ${leer} y déjalas como propuesta con repaso_proponer.`;
  }
}

/** «Otra cosa»: lo que queda escrito en el campo para que el usuario lo termine. */
export function prefijoOtraCosa(d: Pick<DocumentoVista, "id" | "nombre">): string {
  return `Sobre el documento «${d.nombre}» (id ${d.id}): `;
}

/** El título de la propuesta de repaso: de una clase o de un documento. */
export function origenDePropuesta(p: { grabacion: string; documento?: string | null }): { tipo: "documento" | "clase"; nombre: string | null } {
  return p.grabacion.startsWith("doc-") ? { tipo: "documento", nombre: p.documento ?? null } : { tipo: "clase", nombre: null };
}

/** El aviso cuando un documento se agrega bien. */
export const textoDocumentoListo = (nombre: string): string => `📄 «${nombreCorto(nombre, 26)}» listo`;

export function textoSinDocumentos(): string {
  return "Arrastra un PDF, un Word o un PowerPoint hacia Brote (o toca «Agregar documento») y él lo lee: te hace un resumen, tarjetas de repaso o lo que le pidas.";
}

export const NOTA_DOCUMENTOS =
  "Los documentos que le diste a Brote: guarda solo el texto que sacó (nunca el archivo original, que sigue donde estaba). Borrarlos los manda a la Papelera del Mac; el texto sigue ahí hasta que la vacíes.";

export const TEXTO_DEMASIADOS = `Ya tienes ${MAX_DOCUMENTOS} documentos guardados: borra alguno en «Lo que sé de ti» para agregar otro.`;
