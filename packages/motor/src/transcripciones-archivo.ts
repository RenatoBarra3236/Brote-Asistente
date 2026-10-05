// Lectura, escritura y borrado en disco de las grabaciones y transcripciones (la lógica pura del
// formato está en transcripciones.ts). Carpetas:
//   ~/.asistente-prototipo/transcripciones/<id>.md   (cambia con ASISTENTE_TRANSCRIPCIONES, para pruebas)
//   ~/.asistente-prototipo/grabaciones/<id>.wav      (cambia con ASISTENTE_GRABACIONES)
// Todo con permisos 600 (carpetas 700). El borrado toca SOLO la carpeta que se le pasa, solo archivos
// regulares con el nombre exacto `<id>.wav` y nunca sigue enlaces simbólicos.
import { execFileSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  PATRON_ARCHIVO_AUDIO,
  PATRON_ARCHIVO_TRANSCRIPCION,
  PATRON_ID,
  escribirTranscripcion,
  fechaDeId,
  leerCabecera,
  leerTranscripcion,
  type CabeceraTranscripcion,
  type Transcripcion,
} from "./transcripciones.ts";

/** Una transcripción más grande que esto no es nuestra (3 h de habla son ~1 MB): se ignora. */
const MAX_BYTES_TRANSCRIPCION = 8 * 1024 * 1024;
const DIA_MS = 24 * 60 * 60 * 1000;

export function carpetaTranscripciones(): string {
  return process.env.ASISTENTE_TRANSCRIPCIONES ?? join(homedir(), ".asistente-prototipo", "transcripciones");
}

export function carpetaGrabaciones(): string {
  return process.env.ASISTENTE_GRABACIONES ?? join(homedir(), ".asistente-prototipo", "grabaciones");
}

/** Manda un archivo a la Papelera de macOS (o lo borra en otros sistemas: allí no hay Papelera). */
export function aLaPapelera(ruta: string): void {
  if (process.platform === "darwin") {
    execFileSync("osascript", ["-e", `tell application "Finder" to delete POSIX file ${JSON.stringify(ruta)}`], { stdio: "ignore" });
    return;
  }
  rmSync(ruta, { force: true });
}

/** Los nombres de la carpeta que son archivos regulares (no enlaces, no carpetas) y calzan con el patrón. */
function archivosExactos(carpeta: string, patron: RegExp): { nombre: string; id: string; bytes: number }[] {
  let nombres: string[];
  try {
    nombres = readdirSync(carpeta);
  } catch {
    return [];
  }
  const salida: { nombre: string; id: string; bytes: number }[] = [];
  for (const nombre of nombres) {
    const m = nombre.match(patron);
    if (!m || !PATRON_ID.test(m[1])) continue;
    try {
      const info = lstatSync(join(carpeta, nombre));
      if (info.isFile()) salida.push({ nombre, id: m[1], bytes: info.size });
    } catch {
      // desapareció entre el listado y la lectura
    }
  }
  return salida;
}

/** Las transcripciones guardadas (solo la cabecera), de la más nueva a la más vieja. Lo que no se lee se salta. */
export function listarTranscripciones(carpeta: string = carpetaTranscripciones()): CabeceraTranscripcion[] {
  const cabeceras: CabeceraTranscripcion[] = [];
  for (const { nombre, id, bytes } of archivosExactos(carpeta, PATRON_ARCHIVO_TRANSCRIPCION)) {
    if (bytes > MAX_BYTES_TRANSCRIPCION) continue;
    try {
      const cabecera = leerCabecera(id, readFileSync(join(carpeta, nombre), "utf8"));
      if (cabecera) cabeceras.push(cabecera);
    } catch {
      // ilegible: se salta
    }
  }
  return cabeceras.sort((a, b) => b.id.localeCompare(a.id));
}

/** Una transcripción por su id. `null` si el id no tiene la forma exacta, no existe o está rota. */
export function leerTranscripcionGuardada(id: string, carpeta: string = carpetaTranscripciones()): Transcripcion | null {
  if (!PATRON_ID.test(id)) return null;
  const archivo = archivosExactos(carpeta, PATRON_ARCHIVO_TRANSCRIPCION).find((a) => a.id === id);
  if (!archivo || archivo.bytes > MAX_BYTES_TRANSCRIPCION) return null;
  try {
    return leerTranscripcion(id, readFileSync(join(carpeta, archivo.nombre), "utf8"));
  } catch {
    return null;
  }
}

/** Guarda una transcripción (carpeta 700, archivo 600, escritura atómica). Devuelve la ruta. */
export function guardarTranscripcion(t: Transcripcion, carpeta: string = carpetaTranscripciones()): string {
  const contenido = escribirTranscripcion(t); // lanza si algo no es válido, antes de tocar el disco
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  const ruta = join(carpeta, `${t.id}.md`);
  const temporal = `${ruta}.tmp`;
  writeFileSync(temporal, contenido, { mode: 0o600 });
  chmodSync(temporal, 0o600);
  renameSync(temporal, ruta);
  return ruta;
}

/** Los audios (`<id>.wav`) de la carpeta, del más nuevo al más viejo. */
export function listarAudios(carpeta: string = carpetaGrabaciones()): { id: string; bytes: number }[] {
  return archivosExactos(carpeta, PATRON_ARCHIVO_AUDIO)
    .map(({ id, bytes }) => ({ id, bytes }))
    .sort((a, b) => b.id.localeCompare(a.id));
}

/** Los ids de los audios con más de `dias` días (por la fecha de su nombre, hora local). */
export function audiosVencidos(dias: number, ahora: Date, carpeta: string = carpetaGrabaciones()): string[] {
  if (!Number.isFinite(dias) || dias < 1) return [];
  return listarAudios(carpeta)
    .filter(({ id }) => {
      const fecha = fechaDeId(id);
      return fecha !== null && ahora.getTime() - fecha.getTime() > dias * DIA_MS;
    })
    .map(({ id }) => id);
}

/**
 * Borra (a la Papelera en Mac) los audios con más de `dias` días. Solo toca la carpeta de grabaciones,
 * nombres exactos `<id>.wav`, archivos regulares. Con `dias` menor que 1 no borra nada. Devuelve los
 * ids que borró. `eliminar` se inyecta en las pruebas.
 */
export function borrarAudiosVencidos(
  dias: number,
  ahora: Date = new Date(),
  carpeta: string = carpetaGrabaciones(),
  eliminar: (ruta: string) => void = aLaPapelera,
): string[] {
  const borrados: string[] = [];
  for (const id of audiosVencidos(dias, ahora, carpeta)) {
    const ruta = join(carpeta, `${id}.wav`);
    try {
      // Se vuelve a mirar justo antes: tiene que seguir siendo un archivo regular, no un enlace.
      if (!lstatSync(ruta).isFile()) continue;
      eliminar(ruta);
      borrados.push(id);
    } catch {
      // un fallo no detiene los demás; se reintenta en la próxima pasada
    }
  }
  return borrados;
}

// ---- Ver y borrar desde "Lo que sé de ti" (sección 8, fase 4) ----

/**
 * Borra UNA transcripción (`<id>.md`) o UN audio (`<id>.wav`) por su id exacto: la carpeta es la de su tipo,
 * el nombre se arma aquí (nunca viene de afuera) y tiene que ser un archivo regular, no un enlace. Va a la
 * Papelera en Mac. Devuelve si lo borró (`false`: no existía o no era un archivo regular).
 */
export function borrarGrabacion(
  tipo: "transcripcion" | "audio",
  id: string,
  carpeta: string = tipo === "audio" ? carpetaGrabaciones() : carpetaTranscripciones(),
  eliminar: (ruta: string) => void = aLaPapelera,
): boolean {
  if (!PATRON_ID.test(id)) return false;
  const ruta = join(carpeta, `${id}${tipo === "audio" ? ".wav" : ".md"}`);
  try {
    if (!lstatSync(ruta).isFile()) return false;
    eliminar(ruta);
    return true;
  } catch {
    return false;
  }
}

/** «Borrar todo»: cada archivo exacto de ese tipo, uno por uno (nada de borrar la carpeta). Devuelve los ids borrados. */
export function borrarTodasLasGrabaciones(
  tipo: "transcripcion" | "audio",
  carpeta: string = tipo === "audio" ? carpetaGrabaciones() : carpetaTranscripciones(),
  eliminar: (ruta: string) => void = aLaPapelera,
): string[] {
  const ids = archivosExactos(carpeta, tipo === "audio" ? PATRON_ARCHIVO_AUDIO : PATRON_ARCHIVO_TRANSCRIPCION).map((a) => a.id);
  return ids.filter((id) => borrarGrabacion(tipo, id, carpeta, eliminar));
}
