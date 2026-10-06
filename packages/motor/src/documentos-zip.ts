// Lector mínimo de zip (lo que usan .docx, .pptx y .odt), sin dependencias. Solo LEE entradas a la memoria con
// un tope de tamaño (defensa contra zip bombs); nunca escribe archivos ni usa los nombres como rutas.
import { inflateRawSync } from "node:zlib";

export interface EntradaZip {
  nombre: string;
  metodo: number;
  comprimido: number;
  tamano: number;
  /** Dónde empieza el encabezado local de la entrada. */
  desplazamiento: number;
}

const FIRMA_FIN = 0x06054b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;
/** Lo más que se descomprime de una sola entrada. */
export const MAX_BYTES_ENTRADA = 64 * 1024 * 1024;
const MAX_ENTRADAS = 20_000;

export class ErrorZip extends Error {}

/** La lista de entradas de un zip (con el directorio central). */
export function listarZip(zip: Buffer): EntradaZip[] {
  // El registro final está en los últimos 22 bytes + comentario (hasta 64 KB).
  let fin = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === FIRMA_FIN) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ErrorZip("no es un zip");
  const total = zip.readUInt16LE(fin + 10);
  const tamanoCentral = zip.readUInt32LE(fin + 12);
  const inicioCentral = zip.readUInt32LE(fin + 16);
  if (total === 0xffff || tamanoCentral === 0xffffffff || inicioCentral === 0xffffffff) throw new ErrorZip("zip64 no soportado");
  if (total > MAX_ENTRADAS || inicioCentral + tamanoCentral > zip.length) throw new ErrorZip("zip dañado");
  const entradas: EntradaZip[] = [];
  let p = inicioCentral;
  for (let i = 0; i < total; i++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== FIRMA_CENTRAL) throw new ErrorZip("zip dañado");
    const banderas = zip.readUInt16LE(p + 8);
    const metodo = zip.readUInt16LE(p + 10);
    const comprimido = zip.readUInt32LE(p + 20);
    const tamano = zip.readUInt32LE(p + 24);
    const largoNombre = zip.readUInt16LE(p + 28);
    const largoExtra = zip.readUInt16LE(p + 30);
    const largoComentario = zip.readUInt16LE(p + 32);
    const desplazamiento = zip.readUInt32LE(p + 42);
    if (p + 46 + largoNombre > zip.length) throw new ErrorZip("zip dañado");
    const nombre = zip.toString("utf8", p + 46, p + 46 + largoNombre);
    if (banderas & 1) throw new ErrorZip("protegido");
    entradas.push({ nombre, metodo, comprimido, tamano, desplazamiento });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

/** El contenido de una entrada, descomprimido y con tope. */
export function leerEntrada(zip: Buffer, e: EntradaZip): Buffer {
  if (e.tamano > MAX_BYTES_ENTRADA) throw new ErrorZip("entrada demasiado grande");
  const p = e.desplazamiento;
  if (p + 30 > zip.length || zip.readUInt32LE(p) !== FIRMA_LOCAL) throw new ErrorZip("zip dañado");
  const inicio = p + 30 + zip.readUInt16LE(p + 26) + zip.readUInt16LE(p + 28);
  if (inicio + e.comprimido > zip.length) throw new ErrorZip("zip dañado");
  const datos = zip.subarray(inicio, inicio + e.comprimido);
  if (e.metodo === 0) return Buffer.from(datos);
  if (e.metodo === 8) {
    try {
      return inflateRawSync(datos, { maxOutputLength: MAX_BYTES_ENTRADA });
    } catch {
      throw new ErrorZip("zip dañado");
    }
  }
  throw new ErrorZip("método de compresión no soportado");
}
