// Quien ya usaba Brote antes de que existieran las funciones no tiene funciones.json, y sin archivo
// rige el preset Estudiante, que apaga el modo programador. Si sus hooks ya están instalados, lo
// usaba: el puente crea el archivo una sola vez con el preset Estudiante más el modo programador (y la
// búsqueda por significado, si ya la tenía configurada en OpenClaw).
// A un usuario nuevo (sin hooks) no se le crea nada, así sigue viendo el asistente de primera vez.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { funcionesPorDefecto, rutaFunciones, serializarFunciones } from "@asistente/motor";
import { hooksInstalados, leerSettings } from "./hooks-claude.ts";
import { CONFIG_OPENCLAW } from "./rutas.ts";

/** Si OpenClaw ya busca por significado con el modelo local (igual que el paso "memoria-local" de configurar.ts). */
function tieneMemoriaLocal(config: any): boolean {
  return config?.memory?.search?.provider === "local" && Boolean(config?.models?.providers?.["llama-cpp"]?.localService);
}

function leerConfigOpenclaw(): unknown {
  try {
    return JSON.parse(readFileSync(CONFIG_OPENCLAW, "utf8"));
  } catch {
    return null;
  }
}

/** Crea funciones.json si hace falta (ver arriba). Devuelve si lo creó. */
export function migrarFunciones(ruta = rutaFunciones(), settings?: unknown, openclaw: unknown = leerConfigOpenclaw()): boolean {
  if (existsSync(ruta)) return false;
  let config: unknown = settings;
  if (config === undefined) {
    try {
      config = leerSettings();
    } catch {
      return false;
    }
  }
  if (!hooksInstalados(config)) return false;
  const funciones = funcionesPorDefecto();
  funciones.activas.programador = true;
  funciones.activas["memoria-local"] = tieneMemoriaLocal(openclaw);
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  try {
    // "wx": si otro proceso (Configurar Brote) lo creó entretanto, no se pisa.
    writeFileSync(ruta, serializarFunciones(funciones), { mode: 0o600, flag: "wx" });
  } catch {
    return false;
  }
  return true;
}
