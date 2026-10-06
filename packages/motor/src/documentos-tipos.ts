// Documentos que el usuario le da a Brote (D de docs/plan-estudio-y-mejoras.md): PDF, Word, PowerPoint o texto.
// Puro (sin Node): también lo usa la ventana. El texto se saca en el computador, queda guardado como Markdown
// en `documentos/<id>.md` y el archivo original nunca se copia, mueve ni borra.

/** Lo más que pesa el archivo que se arrastra. */
export const MAX_BYTES_DOCUMENTO = 25 * 1024 * 1024;
/** Lo más largo que puede ser el texto sacado (un libro entero no cabe: se pide por capítulos). */
export const MAX_CARACTERES_DOCUMENTO = 400_000;
export const MAX_DOCUMENTOS = 20;
export const MAX_NOMBRE_DOCUMENTO = 120;
/** Lo que se entrega al agente por vez (como las transcripciones). */
export const MAX_CARACTERES_PARTE = 12_000;

export const EXTENSIONES_DOCUMENTO = ["pdf", "docx", "pptx", "txt", "md", "rtf", "doc", "odt"] as const;
export type TipoDocumento = (typeof EXTENSIONES_DOCUMENTO)[number];

export const PATRON_ID_DOCUMENTO = /^doc-\d{4}-\d{2}-\d{2}-\d{6}$/;
export const PATRON_ARCHIVO_DOCUMENTO = /^(doc-\d{4}-\d{2}-\d{2}-\d{6})\.md$/;

function dos(n: number): string {
  return String(n).padStart(2, "0");
}

/** `doc-AAAA-MM-DD-HHMMSS` (hora local). */
export function idDeDocumento(fecha: Date): string {
  return `doc-${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}-${dos(fecha.getHours())}${dos(fecha.getMinutes())}${dos(fecha.getSeconds())}`;
}

/** La hora de un id de documento, o `null` si no tiene la forma exacta. */
export function fechaDeIdDocumento(id: string): Date | null {
  if (!PATRON_ID_DOCUMENTO.test(id)) return null;
  const [a, m, d] = [+id.slice(4, 8), +id.slice(9, 11), +id.slice(12, 14)];
  const h = id.slice(15);
  const fecha = new Date(a, m - 1, d, +h.slice(0, 2), +h.slice(2, 4), +h.slice(4, 6));
  return idDeDocumento(fecha) === id ? fecha : null;
}

/** Extensión permitida del nombre de un archivo (minúsculas), o `null`. */
export function tipoDeArchivo(nombre: string): TipoDocumento | null {
  const punto = nombre.lastIndexOf(".");
  if (punto < 0) return null;
  const ext = nombre.slice(punto + 1).toLowerCase();
  return (EXTENSIONES_DOCUMENTO as readonly string[]).includes(ext) ? (ext as TipoDocumento) : null;
}

/** Solo el nombre del archivo (sin carpetas), de una línea y de largo acotado. Nunca la ruta del usuario. */
export function limpiarNombreDocumento(ruta: string): string {
  const base = ruta.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NOMBRE_DOCUMENTO);
}

/** Texto sin caracteres de control, con las líneas en blanco y los espacios sobrantes recogidos. */
export function normalizarTextoDocumento(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface CabeceraDocumento {
  id: string;
  nombre: string;
  tipo: TipoDocumento;
  /** Páginas (PDF) o diapositivas (PowerPoint), si se sabe. */
  paginas: number | null;
  caracteres: number;
  /** Ramo al que se asignó, o null. Un ramo borrado después se trata como «sin ramo». */
  ramoId: number | null;
  /** ISO de cuando se agregó. */
  creado: string;
}

export interface Documento extends CabeceraDocumento {
  texto: string;
}

const MARCA = "---";

/** El archivo Markdown de un documento: cabecera simple y después el texto. */
export function escribirDocumento(d: Documento): string {
  const linea = (clave: string, valor: string | number | null) => (valor === null ? [] : [`${clave}: ${valor}`]);
  return [
    MARCA,
    ...linea("nombre", d.nombre.replace(/\n/g, " ")),
    ...linea("tipo", d.tipo),
    ...linea("paginas", d.paginas),
    ...linea("caracteres", d.caracteres),
    ...linea("ramo", d.ramoId),
    ...linea("creado", d.creado),
    MARCA,
    "",
    d.texto,
    "",
  ].join("\n");
}

/** Solo la cabecera (para listar sin cargar textos enteros). `null` si no es un documento nuestro. */
export function leerCabeceraDocumento(id: string, contenido: string): CabeceraDocumento | null {
  if (!PATRON_ID_DOCUMENTO.test(id) || !contenido.startsWith(`${MARCA}\n`)) return null;
  const fin = contenido.indexOf(`\n${MARCA}\n`, MARCA.length);
  if (fin < 0) return null;
  const datos = new Map<string, string>();
  for (const l of contenido.slice(MARCA.length + 1, fin).split("\n")) {
    const dos = l.indexOf(": ");
    if (dos > 0) datos.set(l.slice(0, dos), l.slice(dos + 2));
  }
  const tipo = datos.get("tipo");
  const nombre = datos.get("nombre");
  if (!nombre || !tipo || !(EXTENSIONES_DOCUMENTO as readonly string[]).includes(tipo)) return null;
  const entero = (v: string | undefined) => (v !== undefined && /^\d{1,9}$/.test(v) ? Number(v) : null);
  return {
    id,
    nombre: limpiarNombreDocumento(nombre),
    tipo: tipo as TipoDocumento,
    paginas: entero(datos.get("paginas")),
    caracteres: entero(datos.get("caracteres")) ?? 0,
    ramoId: entero(datos.get("ramo")),
    creado: datos.get("creado") ?? "",
  };
}

export function leerDocumento(id: string, contenido: string): Documento | null {
  const cabecera = leerCabeceraDocumento(id, contenido);
  if (!cabecera) return null;
  const inicio = contenido.indexOf(`\n${MARCA}\n`, MARCA.length) + MARCA.length + 2;
  return { ...cabecera, texto: contenido.slice(inicio).replace(/^\n/, "").replace(/\n$/, "") };
}

export interface ParteDocumento {
  /** 1 a N. */
  parte: number;
  total: number;
  texto: string;
}

/** Parte el texto en trozos de como mucho `max` letras, cortando en saltos de línea o espacios. */
export function partirDocumento(texto: string, max = MAX_CARACTERES_PARTE): ParteDocumento[] {
  const trozos: string[] = [];
  let resto = texto;
  while (resto.length > max) {
    let corte = resto.lastIndexOf("\n\n", max);
    if (corte < max / 2) corte = resto.lastIndexOf("\n", max);
    if (corte < max / 2) corte = resto.lastIndexOf(" ", max);
    if (corte < max / 2) corte = max;
    trozos.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto.length > 0 || trozos.length === 0) trozos.push(resto);
  return trozos.map((t, i) => ({ parte: i + 1, total: trozos.length, texto: t }));
}

/** Por qué no se pudo agregar, para decírselo al usuario sin tecnicismos. */
export const MOTIVOS = {
  extension: "Brote lee PDF, Word (.docx, .doc), PowerPoint (.pptx), OpenDocument (.odt), RTF y texto (.txt, .md).",
  grande: `Ese archivo pesa más de ${MAX_BYTES_DOCUMENTO / 1024 / 1024} MB.`,
  noExiste: "No encontré ese archivo.",
  enlace: "Ese archivo es un enlace o un acceso directo; arrastra el archivo de verdad.",
  noEsArchivo: "Eso no es un archivo (¿una carpeta?).",
  vacio: "No encontré texto en ese documento. Si es un PDF escaneado (fotos de páginas), no puedo leerlo todavía.",
  muchos: `Ya tienes ${MAX_DOCUMENTOS} documentos guardados: borra alguno en «Lo que sé de ti» para agregar otro.`,
  largo: `Ese documento es demasiado largo (más de ${MAX_CARACTERES_DOCUMENTO.toLocaleString("es-CL")} caracteres): pásalo por capítulos.`,
  protegido: "Ese archivo está protegido con contraseña.",
  ilegible: "No pude leer ese archivo: parece dañado o de un formato distinto al que dice su nombre.",
  sistema: "Ese tipo de archivo todavía no se puede leer en este sistema.",
} as const;
