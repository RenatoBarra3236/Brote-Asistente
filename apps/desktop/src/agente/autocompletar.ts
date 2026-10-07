// Capa F del plan sin IA: autocompletado mientras se escribe. Sugiere hasta 3 frases de la guía (o la misma frase con
// el nombre de tu ramo completo). Tocar una sugerencia la deja en el campo; no se envía sola. Sin DOM.

import { todosLosEjemplos, type Ejemplo } from "../../../../packages/motor/src/sugerir.ts";
import { normalizar } from "../../../../packages/motor/src/texto.ts";
import type { IdFuncion } from "../../../../packages/motor/src/funciones.ts";

export const MAX_SUGERENCIAS_ESCRIBIENDO = 3;
export const MIN_LETRAS = 2;

/** Frases con ramo que se arman completando el nombre: «como voy en cal» → «como voy en Cálculo». */
const CON_RAMO = ["cómo voy en {ramo}", "todo lo de {ramo}", "pomodoro de 30 para {ramo}", "repasemos {ramo}", "cuánto necesito para aprobar {ramo}"];

function palabras(t: string): string[] {
  return normalizar(t).split(" ").filter(Boolean);
}

/** Qué tanto calza lo escrito con el comienzo de una frase (0 = no calza). Todas las palabras escritas tienen que ser el comienzo de alguna. */
function calce(escrito: string[], frase: string): number {
  const suyas = palabras(frase);
  if (escrito.length === 0) return 0;
  let puntos = 0;
  for (let i = 0; i < escrito.length; i++) {
    const e = escrito[i];
    const ultima = i === escrito.length - 1;
    const j = suyas.findIndex((s) => (ultima ? s.startsWith(e) : s === e || s.startsWith(e)));
    if (j < 0) return 0;
    puntos += j === i ? 2 : 1;
  }
  return puntos / (escrito.length * 2) + (normalizar(frase).startsWith(escrito.join(" ")) ? 1 : 0);
}

export function autocompletar(escrito: string, activa: (f: IdFuncion) => boolean, ramos: readonly string[] = [], ejemplos: Ejemplo[] = todosLosEjemplos()): string[] {
  const lo = palabras(escrito);
  if (normalizar(escrito).length < MIN_LETRAS) return [];
  const candidatas: { frase: string; puntos: number }[] = [];
  // El nombre de un ramo a medio escribir se completa.
  const ultima = lo[lo.length - 1];
  if (activa("estudio") && ultima && ultima.length >= 2) {
    const ramo = ramos.find((r) => palabras(r).some((p) => p.startsWith(ultima) && p !== ultima) || (palabras(r).join(" ").startsWith(ultima) && normalizar(r) !== ultima));
    if (ramo) {
      const hasta = escrito.trimEnd().length - ultima.length;
      const antes = escrito.slice(0, Math.max(0, hasta));
      if (antes.trim().length >= 2) candidatas.push({ frase: `${antes}${ramo}`, puntos: 3 });
      else for (const plantilla of CON_RAMO) candidatas.push({ frase: plantilla.replace("{ramo}", ramo), puntos: 0.5 });
    }
  }
  for (const e of ejemplos) {
    if (e.funcion !== null && !activa(e.funcion)) continue;
    const puntos = calce(lo, e.frase);
    if (puntos > 0) candidatas.push({ frase: e.frase, puntos });
  }
  const vistas = new Set<string>();
  return candidatas
    .sort((a, b) => b.puntos - a.puntos || a.frase.length - b.frase.length)
    .filter((c) => normalizar(c.frase) !== normalizar(escrito) && !vistas.has(c.frase) && vistas.add(c.frase))
    .slice(0, MAX_SUGERENCIAS_ESCRIBIENDO)
    .map((c) => c.frase);
}
