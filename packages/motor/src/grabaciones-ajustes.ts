// Ajustes de "Grabar y transcribir": ~/.asistente-prototipo/grabaciones.json {"modelo":"small","diasAudio":7}
// (600; lo escribe Rust, `guardar_grabaciones`, con las mismas listas cerradas). Cambia con
// ASISTENTE_GRABACIONES_AJUSTES en las pruebas. Lo que no se entiende vuelve al valor por defecto
// (la parte pura está en grabaciones-textos.ts, que también usa la ventana).
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { MAX_DIAS_AUDIO, MIN_DIAS_AUDIO, normalizarAjustesGrabaciones, type AjustesGrabaciones } from "./grabaciones-textos.ts";

export { normalizarAjustesGrabaciones, MAX_DIAS_AUDIO, MIN_DIAS_AUDIO, type AjustesGrabaciones };

export function rutaAjustesGrabaciones(): string {
  return process.env.ASISTENTE_GRABACIONES_AJUSTES ?? join(homedir(), ".asistente-prototipo", "grabaciones.json");
}

export function leerAjustesGrabaciones(ruta: string = rutaAjustesGrabaciones()): AjustesGrabaciones {
  try {
    return normalizarAjustesGrabaciones(JSON.parse(readFileSync(ruta, "utf8")));
  } catch {
    return normalizarAjustesGrabaciones(null);
  }
}

/** Cambia cuando cambia el archivo (para releerlo sin abrirlo cada vez). */
export function marcaAjustesGrabaciones(ruta: string = rutaAjustesGrabaciones()): string {
  try {
    return String(statSync(ruta).mtimeMs);
  } catch {
    return "";
  }
}
