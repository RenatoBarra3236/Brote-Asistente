// Qué solicitudes de permiso puede responder el puente solo, sin preguntar en la isla.
// Es un control de seguridad: todo lo que no esté aquí sigue pidiendo permiso al usuario.

import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { WORKSPACE, memoriaDeClaudeCode } from "./rutas.ts";

/** Dónde vive la memoria de Brote: la de OpenClaw y la propia de Claude Code para este workspace. */
export const MEMORIA_DE_BROTE = {
  carpetas: [join(WORKSPACE, "memory"), memoriaDeClaudeCode(WORKSPACE)],
  archivos: [join(WORKSPACE, "MEMORY.md"), join(WORKSPACE, "USER.md")],
};

const HERRAMIENTAS_DE_ARCHIVO = new Set(["Read", "Write", "Edit", "MultiEdit"]);

/** La ruta real (sin `..` ni enlaces simbólicos), aunque el archivo todavía no exista. */
function rutaReal(ruta: string): string {
  let actual = resolve(ruta);
  const resto: string[] = [];
  while (!existsSync(actual) && dirname(actual) !== actual) {
    resto.unshift(actual.slice(dirname(actual).length + 1));
    actual = dirname(actual);
  }
  return join(realpathSync(actual), ...resto);
}

/**
 * Si una solicitud es solo para leer o escribir un archivo de la memoria de Brote. `detalle` es
 * el JSON de argumentos que trae la solicitud (`{"file_path": "…"}`).
 */
export function esDeMemoria(herramienta: string, detalle: unknown, memoria = MEMORIA_DE_BROTE): boolean {
  if (!HERRAMIENTAS_DE_ARCHIVO.has(herramienta) || typeof detalle !== "string") return false;
  try {
    const ruta = JSON.parse(detalle)?.file_path;
    if (typeof ruta !== "string" || !isAbsolute(ruta)) return false;
    const real = rutaReal(ruta);
    return (
      memoria.archivos.some((archivo) => existsSync(archivo) && real === realpathSync(archivo)) ||
      memoria.carpetas.some((carpeta) => existsSync(carpeta) && real.startsWith(realpathSync(carpeta) + sep))
    );
  } catch {
    return false;
  }
}
