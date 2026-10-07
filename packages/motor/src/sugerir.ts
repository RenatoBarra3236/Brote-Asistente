// Capa D del plan sin IA: cuando no se entendió una frase, ofrecer las 2 o 3 frases de la guía más parecidas
// («¿Quisiste decir…?»). Parecido = palabras en común, perdonando errores de escritura. Puro.

import { distancia, toleranciaDe } from "./corregir.ts";
import type { IdFuncion } from "./funciones.ts";
import { AREAS_DE_AYUDA } from "./ayuda.ts";
import { hallarMontos, tokenizar } from "./piezas.ts";
import { normalizar } from "./texto.ts";

export interface Ejemplo {
  frase: string;
  funcion: IdFuncion | null;
}

/** Una frase de cada cosa que Brote sabe hacer, además de las de la ayuda. Una prueba exige que el motor las entienda tal cual. */
const EXTRAS: Ejemplo[] = [
  { frase: "borra el último gasto", funcion: "gastos" },
  { frase: "mis últimos gastos", funcion: "gastos" },
  { frase: "cuánto me queda del presupuesto", funcion: "gastos" },
  { frase: "cuánto puedo gastar hoy", funcion: "gastos" },
  { frase: "cuánto gasté en comida este mes", funcion: "gastos" },
  { frase: "qué tengo mañana", funcion: "calendario" },
  { frase: "cuál es mi próxima clase", funcion: "calendario" },
  { frase: "qué tareas tengo esta semana", funcion: "aula" },
  { frase: "mis ramos", funcion: "estudio" },
  { frase: "tengo tarjetas para repasar", funcion: "estudio" },
  { frase: "qué tengo que estudiar hoy", funcion: "estudio" },
  { frase: "estudié 2 horas de cálculo", funcion: "estudio" },
  { frase: "cuánto he estudiado esta semana", funcion: "estudio" },
  { frase: "cuánto necesito para aprobar cálculo", funcion: "estudio" },
  { frase: "mis descargas", funcion: "descargas" },
  { frase: "abre la última descarga", funcion: "descargas" },
  { frase: "cuánta batería me queda", funcion: "equipo" },
  { frase: "para el pomodoro", funcion: "temporizadores" },
  { frase: "pausa la música", funcion: "musica" },
  { frase: "cuánto llevo del plan", funcion: "uso-del-plan" },
  { frase: "qué sabes de mí", funcion: null },
];

export function todosLosEjemplos(): Ejemplo[] {
  const deAyuda = AREAS_DE_AYUDA.flatMap((a) => a.ejemplos.map((frase) => ({ frase, funcion: a.funcion })));
  const vistos = new Set<string>();
  return [...deAyuda, ...EXTRAS].filter((e) => !vistos.has(e.frase) && vistos.add(e.frase));
}

const RELLENO = new Set(["el", "la", "los", "las", "un", "una", "de", "del", "en", "por", "para", "con", "a", "al", "y", "mi", "mis", "me", "se", "lo", "que", "es"]);

function palabras(texto: string): string[] {
  return normalizar(texto).split(" ").filter((p) => p && !RELLENO.has(p));
}

/** Cuánto se parecen dos palabras: 1 iguales, 0,8 con un error de escritura, 0,6 con el mismo comienzo. */
function parecidas(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 4 || b.length < 4) return 0;
  if (distancia(a, b, toleranciaDe(Math.min(a.length, b.length))) <= toleranciaDe(Math.min(a.length, b.length))) return 0.8;
  const comun = Math.min(a.length, b.length, 5);
  return a.slice(0, comun) === b.slice(0, comun) ? 0.6 : 0;
}

export interface Sugerencia {
  /** La frase que se manda si el usuario la toca (ya con su monto, si había uno). */
  frase: string;
  puntaje: number;
}

export const PUNTAJE_MINIMO = 0.34;

/** Hasta `max` frases de la guía parecidas a lo que escribió el usuario. Si escribió un monto, lo lleva a la sugerida. */
export function sugerir(texto: string, ejemplos: Ejemplo[], activa: (f: IdFuncion) => boolean, max = 3): Sugerencia[] {
  const mias = palabras(texto);
  if (mias.length === 0) return [];
  const montos = hallarMontos(tokenizar(texto));
  const monto = montos.length === 1 ? montos[0].texto : null;
  const salida: Sugerencia[] = [];
  for (const e of ejemplos) {
    if (e.funcion !== null && !activa(e.funcion)) continue;
    const suyas = palabras(e.frase);
    if (suyas.length === 0) continue;
    let suma = 0;
    for (const p of mias) suma += Math.max(0, ...suyas.map((s) => parecidas(p, s)));
    const puntaje = suma / Math.max(mias.length, suyas.length);
    if (puntaje < PUNTAJE_MINIMO) continue;
    let frase = e.frase;
    if (monto) {
      const delEjemplo = hallarMontos(tokenizar(frase));
      if (delEjemplo.length === 1) frase = frase.replace(delEjemplo[0].texto, monto);
    }
    salida.push({ frase, puntaje });
  }
  return salida.sort((a, b) => b.puntaje - a.puntaje).slice(0, max);
}
