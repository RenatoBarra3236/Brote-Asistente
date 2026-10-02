// Utilidades compartidas por las pruebas: leen los eventos de packages/adapter/ejemplos/.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Estado } from "../src/personaje/estados.ts";
import { CONVERSACION_INICIAL, aplicar, type Conversacion } from "../src/agente/conversacion.ts";
import { marcosDesdeJsonl } from "../src/agente/simulado.ts";
import { traducir } from "../src/agente/traduccion.ts";
import type { Marco } from "../src/agente/transporte.ts";

const CARPETA = join(import.meta.dirname, "..", "..", "..", "packages", "adapter", "ejemplos");

export function leerEjemplo(nombre: string): Marco[] {
  return marcosDesdeJsonl(readFileSync(join(CARPETA, `${nombre}.jsonl`), "utf8"));
}

/** Pasa todos los eventos por la traducción y el modelo; guarda cada conversación intermedia. */
export function reproducir(marcos: Marco[]): Conversacion[] {
  const pasos: Conversacion[] = [];
  let c = CONVERSACION_INICIAL;
  for (const marco of marcos) {
    const suceso = traducir(marco);
    if (!suceso) continue;
    c = aplicar(c, suceso);
    pasos.push(c);
  }
  return pasos;
}

/** Los estados por los que pasa el personaje, sin repetir los consecutivos. */
export function estados(pasos: Conversacion[]): Estado[] {
  const lista: Estado[] = [];
  for (const { estado } of pasos) if (lista.at(-1) !== estado) lista.push(estado);
  return lista;
}
