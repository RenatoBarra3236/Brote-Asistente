// Saca el texto de un documento en el computador: sin red, sin cuentas y sin leer nada más que el archivo que el
// usuario eligió. Word, PowerPoint y OpenDocument se leen como zip con XML (mismo código en Mac y Windows);
// el texto plano se lee directo; RTF/DOC con `textutil` y PDF con PDFKit (`osascript`), ambos de macOS.
// Los comandos se arman solo con constantes y la ruta va como argumento aparte (nunca dentro de un script).
import { execFile } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { ErrorZip, leerEntrada, listarZip } from "./documentos-zip.ts";
import {
  MAX_BYTES_DOCUMENTO,
  MAX_CARACTERES_DOCUMENTO,
  MOTIVOS,
  normalizarTextoDocumento,
  tipoDeArchivo,
  type TipoDocumento,
} from "./documentos-tipos.ts";

export type ResultadoExtraccion = { ok: true; tipo: TipoDocumento; texto: string; paginas: number | null } | { ok: false; motivo: string };

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodificar(xml: string): string {
  return xml.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (todo, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTIDADES[e] ?? todo;
  });
}

/** El texto de un `document.xml` de Word: runs `<w:t>`, tabulaciones, saltos y fin de párrafo. */
export function textoDeWord(xml: string): string {
  const partes: string[] = [];
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<\/w:p>/g)) {
    if (m[1] !== undefined) partes.push(decodificar(m[1]));
    else if (m[0] === "<w:tab/>") partes.push("\t");
    else partes.push("\n");
  }
  return partes.join("");
}

/** El texto de una diapositiva (`<a:t>`), un párrafo por línea. */
export function textoDeDiapositiva(xml: string): string {
  const partes: string[] = [];
  for (const m of xml.matchAll(/<a:t>([^<]*)<\/a:t>|<a:br\/>|<\/a:p>/g)) partes.push(m[1] !== undefined ? decodificar(m[1]) : "\n");
  return partes.join("");
}

/** El `content.xml` de OpenDocument: párrafos y títulos. */
export function textoDeOdt(xml: string): string {
  return decodificar(xml.replace(/<text:tab\/>/g, "\t").replace(/<text:line-break\/>/g, "\n").replace(/<\/text:(?:p|h)>/g, "\n").replace(/<[^>]+>/g, ""));
}

function numeroDe(nombre: string, prefijo: string): number {
  return Number(nombre.slice(prefijo.length).replace(/\D+/g, "")) || 0;
}

function desdeZip(tipo: "docx" | "pptx" | "odt", contenido: Buffer): ResultadoExtraccion {
  // Un Word o PowerPoint con contraseña no es un zip: es un contenedor OLE cifrado.
  if (contenido.length >= 4 && contenido.readUInt32BE(0) === 0xd0cf11e0) return { ok: false, motivo: MOTIVOS.protegido };
  const entradas = listarZip(contenido);
  const leer = (nombre: string): string | null => {
    const e = entradas.find((x) => x.nombre === nombre);
    return e ? leerEntrada(contenido, e).toString("utf8") : null;
  };
  if (tipo === "docx") {
    const xml = leer("word/document.xml");
    if (xml === null) return { ok: false, motivo: MOTIVOS.ilegible };
    return { ok: true, tipo, texto: textoDeWord(xml), paginas: null };
  }
  if (tipo === "odt") {
    const xml = leer("content.xml");
    if (xml === null) return { ok: false, motivo: MOTIVOS.ilegible };
    return { ok: true, tipo, texto: textoDeOdt(xml), paginas: null };
  }
  const diapositivas = entradas.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.nombre)).sort((a, b) => numeroDe(a.nombre, "ppt/slides/slide") - numeroDe(b.nombre, "ppt/slides/slide"));
  if (diapositivas.length === 0) return { ok: false, motivo: MOTIVOS.ilegible };
  const bloques: string[] = [];
  diapositivas.forEach((d, i) => {
    const n = numeroDe(d.nombre, "ppt/slides/slide");
    const texto = textoDeDiapositiva(leerEntrada(contenido, d).toString("utf8")).trim();
    const notas = leer(`ppt/notesSlides/notesSlide${n}.xml`);
    const textoNotas = notas ? textoDeDiapositiva(notas).trim() : "";
    bloques.push(`Diapositiva ${i + 1}\n${texto}${textoNotas ? `\nNotas: ${textoNotas}` : ""}`);
  });
  return { ok: true, tipo, texto: bloques.join("\n\n"), paginas: diapositivas.length };
}

function ejecutar(programa: string, args: string[], tiempoMs: number): Promise<string> {
  return new Promise((listo, fallo) => {
    execFile(programa, args, { encoding: "utf8", timeout: tiempoMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (error, salida) => (error ? fallo(error) : listo(salida)));
  });
}

/** JXA: abre el PDF con PDFKit y devuelve `{ paginas, texto }` en JSON. La ruta llega como argumento. */
const SCRIPT_PDF = `
ObjC.import("PDFKit");
function run(argv) {
  var doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0]));
  if (!doc || doc.isNil()) return JSON.stringify({ error: "ilegible" });
  if (doc.isLocked) return JSON.stringify({ error: "protegido" });
  var texto = doc.string;
  return JSON.stringify({ paginas: Number(doc.pageCount), texto: texto && !texto.isNil() ? ObjC.unwrap(texto) : "" });
}`;

async function desdePdf(ruta: string): Promise<ResultadoExtraccion> {
  if (process.platform !== "darwin") return { ok: false, motivo: MOTIVOS.sistema };
  try {
    const salida = await ejecutar("osascript", ["-l", "JavaScript", "-e", SCRIPT_PDF, ruta], 90_000);
    const datos = JSON.parse(salida.trim()) as { error?: string; paginas?: number; texto?: string };
    if (datos.error === "protegido") return { ok: false, motivo: MOTIVOS.protegido };
    if (datos.error || typeof datos.texto !== "string") return { ok: false, motivo: MOTIVOS.ilegible };
    return { ok: true, tipo: "pdf", texto: datos.texto, paginas: typeof datos.paginas === "number" ? datos.paginas : null };
  } catch {
    return { ok: false, motivo: MOTIVOS.ilegible };
  }
}

async function desdeTextutil(tipo: "rtf" | "doc", ruta: string): Promise<ResultadoExtraccion> {
  if (process.platform !== "darwin") return { ok: false, motivo: MOTIVOS.sistema };
  try {
    return { ok: true, tipo, texto: await ejecutar("/usr/bin/textutil", ["-convert", "txt", "-stdout", ruta], 60_000), paginas: null };
  } catch {
    return { ok: false, motivo: MOTIVOS.ilegible };
  }
}

/**
 * Valida el archivo (existe, es regular y no un enlace, extensión permitida, tamaño) y saca su texto, ya
 * normalizado. Nunca lanza: todo problema vuelve como `{ ok: false, motivo }` en lenguaje de persona.
 */
export async function extraerTexto(ruta: string): Promise<ResultadoExtraccion> {
  const tipo = tipoDeArchivo(ruta);
  if (!tipo) return { ok: false, motivo: MOTIVOS.extension };
  let info;
  try {
    info = lstatSync(ruta);
  } catch {
    return { ok: false, motivo: MOTIVOS.noExiste };
  }
  if (info.isSymbolicLink()) return { ok: false, motivo: MOTIVOS.enlace };
  if (!info.isFile()) return { ok: false, motivo: MOTIVOS.noEsArchivo };
  if (info.size > MAX_BYTES_DOCUMENTO) return { ok: false, motivo: MOTIVOS.grande };
  let r: ResultadoExtraccion;
  try {
    if (tipo === "txt" || tipo === "md") r = { ok: true, tipo, texto: readFileSync(ruta, "utf8"), paginas: null };
    else if (tipo === "docx" || tipo === "pptx" || tipo === "odt") r = desdeZip(tipo, readFileSync(ruta));
    else if (tipo === "pdf") r = await desdePdf(ruta);
    else r = await desdeTextutil(tipo, ruta);
  } catch (error) {
    return { ok: false, motivo: error instanceof ErrorZip && error.message === "protegido" ? MOTIVOS.protegido : MOTIVOS.ilegible };
  }
  if (!r.ok) return r;
  const texto = normalizarTextoDocumento(r.texto);
  if (texto.length === 0) return { ok: false, motivo: MOTIVOS.vacio };
  if (texto.length > MAX_CARACTERES_DOCUMENTO) return { ok: false, motivo: MOTIVOS.largo };
  return { ...r, texto };
}
