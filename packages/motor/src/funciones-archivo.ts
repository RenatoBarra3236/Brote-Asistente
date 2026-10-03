// Lectura de ~/.asistente-prototipo/funciones.json (lo escribe Rust con `guardar_funciones`, permisos
// 600). La lógica pura está en funciones.ts. `ASISTENTE_FUNCIONES` cambia la ruta en las pruebas.

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { funcionesPorDefecto, normalizarFunciones, type ConfigFunciones, type IdFuncion } from "./funciones.ts";

export function rutaFunciones(): string {
  return process.env.ASISTENTE_FUNCIONES ?? join(homedir(), ".asistente-prototipo", "funciones.json");
}

/** La configuración de funciones; sin archivo (o roto), la por defecto (preset Estudiante). */
export function leerFunciones(ruta = rutaFunciones()): ConfigFunciones {
  try {
    return normalizarFunciones(JSON.parse(readFileSync(ruta, "utf8")));
  } catch {
    return funcionesPorDefecto();
  }
}

/** La fecha de modificación del archivo (0 si no existe), para notar cuándo cambia. */
export function marcaFunciones(ruta = rutaFunciones()): number {
  try {
    return statSync(ruta).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Las funciones activas, releídas solo cuando el archivo cambia (para el servidor MCP, que pregunta
 * en cada llamada).
 */
export class FuncionesVigiladas {
  private marca = -1;
  private rutaLeida = "";
  private config: ConfigFunciones = funcionesPorDefecto();
  private readonly ruta: () => string;

  constructor(ruta: () => string = rutaFunciones) {
    this.ruta = ruta;
  }

  actual(): ConfigFunciones {
    const ruta = this.ruta();
    const marca = marcaFunciones(ruta);
    if (marca !== this.marca || ruta !== this.rutaLeida) {
      this.marca = marca;
      this.rutaLeida = ruta;
      this.config = leerFunciones(ruta);
    }
    return this.config;
  }

  activa(id: IdFuncion): boolean {
    return this.actual().activas[id];
  }
}
