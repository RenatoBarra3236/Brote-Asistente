// Los documentos de Brote en disco: `~/.asistente-prototipo/documentos/<id>.md` (cambia con ASISTENTE_DOCUMENTOS,
// para pruebas), carpeta 700 y archivos 600, escritura atómica. Solo guarda el TEXTO sacado: el archivo original
// no se copia, mueve ni borra. El borrado toca solo archivos regulares con el nombre exacto `<id>.md`, de a uno.
import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { extraerTexto } from "./documentos-extraer.ts";
import {
  MAX_DOCUMENTOS,
  MOTIVOS,
  PATRON_ARCHIVO_DOCUMENTO,
  escribirDocumento,
  idDeDocumento,
  leerCabeceraDocumento,
  leerDocumento,
  limpiarNombreDocumento,
  type CabeceraDocumento,
  type Documento,
} from "./documentos-tipos.ts";
import { aLaPapelera } from "./transcripciones-archivo.ts";

/** Un documento más grande que esto no es nuestro (el texto tope son 400.000 letras): se ignora. */
const MAX_BYTES_ARCHIVO = 4 * 1024 * 1024;

export function carpetaDocumentos(): string {
  return process.env.ASISTENTE_DOCUMENTOS ?? join(homedir(), ".asistente-prototipo", "documentos");
}

function archivosExactos(carpeta: string): { nombre: string; id: string; bytes: number }[] {
  let nombres: string[];
  try {
    nombres = readdirSync(carpeta);
  } catch {
    return [];
  }
  const salida: { nombre: string; id: string; bytes: number }[] = [];
  for (const nombre of nombres) {
    const m = nombre.match(PATRON_ARCHIVO_DOCUMENTO);
    if (!m) continue;
    try {
      const info = lstatSync(join(carpeta, nombre));
      if (info.isFile()) salida.push({ nombre, id: m[1], bytes: info.size });
    } catch {
      // desapareció entre el listado y la lectura
    }
  }
  return salida;
}

/** Los documentos guardados (solo la cabecera), del más nuevo al más viejo. Lo que no se lee se salta. */
export function listarDocumentos(carpeta: string = carpetaDocumentos()): CabeceraDocumento[] {
  const lista: CabeceraDocumento[] = [];
  for (const { nombre, id, bytes } of archivosExactos(carpeta)) {
    if (bytes > MAX_BYTES_ARCHIVO) continue;
    try {
      const cabecera = leerCabeceraDocumento(id, readFileSync(join(carpeta, nombre), "utf8"));
      if (cabecera) lista.push(cabecera);
    } catch {
      // ilegible: se salta
    }
  }
  return lista.sort((a, b) => b.id.localeCompare(a.id));
}

export function leerDocumentoGuardado(id: string, carpeta: string = carpetaDocumentos()): Documento | null {
  const archivo = archivosExactos(carpeta).find((a) => a.id === id);
  if (!archivo || archivo.bytes > MAX_BYTES_ARCHIVO) return null;
  try {
    return leerDocumento(id, readFileSync(join(carpeta, archivo.nombre), "utf8"));
  } catch {
    return null;
  }
}

function escribirAtomico(carpeta: string, id: string, contenido: string): void {
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  const ruta = join(carpeta, `${id}.md`);
  const temporal = `${ruta}.tmp`;
  writeFileSync(temporal, contenido, { mode: 0o600 });
  chmodSync(temporal, 0o600);
  renameSync(temporal, ruta);
}

export type ResultadoAgregar = { ok: true; documento: CabeceraDocumento } | { ok: false; motivo: string };

/**
 * Lee el archivo, saca su texto y lo guarda como documento nuevo. `ruta` es lo que arrastró el usuario; de
 * ella solo se conserva el nombre del archivo. Nunca lanza: los problemas vuelven con su motivo.
 */
export async function agregarDocumento(
  ruta: string,
  opciones: { ramoId?: number | null; ahora?: Date; carpeta?: string } = {},
): Promise<ResultadoAgregar> {
  const carpeta = opciones.carpeta ?? carpetaDocumentos();
  const guardados = archivosExactos(carpeta);
  if (guardados.length >= MAX_DOCUMENTOS) return { ok: false, motivo: MOTIVOS.muchos };
  const r = await extraerTexto(ruta);
  if (!r.ok) return r;
  // Dos documentos en el mismo segundo no se pisan: el segundo toma el segundo siguiente.
  const usados = new Set(guardados.map((a) => a.id));
  let momento = (opciones.ahora ?? new Date()).getTime();
  let id = idDeDocumento(new Date(momento));
  while (usados.has(id)) id = idDeDocumento(new Date((momento += 1000)));
  const documento: Documento = {
    id,
    nombre: limpiarNombreDocumento(ruta),
    tipo: r.tipo,
    paginas: r.paginas,
    caracteres: r.texto.length,
    ramoId: opciones.ramoId ?? null,
    creado: new Date(momento).toISOString(),
    texto: r.texto,
  };
  try {
    escribirAtomico(carpeta, id, escribirDocumento(documento));
  } catch {
    return { ok: false, motivo: MOTIVOS.ilegible };
  }
  const { texto: _texto, ...cabecera } = documento;
  return { ok: true, documento: cabecera };
}

/** Cambia el ramo de un documento (o lo deja sin ramo). `false` si no existe. */
export function asignarRamoDocumento(id: string, ramoId: number | null, carpeta: string = carpetaDocumentos()): boolean {
  const d = leerDocumentoGuardado(id, carpeta);
  if (!d) return false;
  try {
    escribirAtomico(carpeta, id, escribirDocumento({ ...d, ramoId }));
    return true;
  } catch {
    return false;
  }
}

export function borrarDocumento(id: string, carpeta: string = carpetaDocumentos(), eliminar: (ruta: string) => void = aLaPapelera): boolean {
  if (!archivosExactos(carpeta).some((a) => a.id === id)) return false;
  const ruta = join(carpeta, `${id}.md`);
  try {
    if (!lstatSync(ruta).isFile()) return false;
    eliminar(ruta);
    return true;
  } catch {
    return false;
  }
}

/** «Borrar todo»: cada archivo exacto, uno por uno (nunca la carpeta). Devuelve los ids borrados. */
export function borrarTodosLosDocumentos(carpeta: string = carpetaDocumentos(), eliminar: (ruta: string) => void = aLaPapelera): string[] {
  return archivosExactos(carpeta)
    .map((a) => a.id)
    .filter((id) => borrarDocumento(id, carpeta, eliminar));
}
