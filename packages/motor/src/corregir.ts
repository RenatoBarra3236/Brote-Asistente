// Capa A del plan sin IA (docs/plan-sin-ia.md): corrector de escritura. Si una frase no calza con ninguna
// plantilla, se corrigen las palabras sueltas contra el vocabulario del propio motor (las palabras de las
// plantillas, las categorías, los periodos y los nombres de tus ramos y metas) y se prueba otra vez.
// Nunca toca números, montos ni palabras que ya conoce. Puro: sin Node ni base de datos.

import { normalizar } from "./texto.ts";

/** Jerga y abreviaturas que se reemplazan siempre (antes de mirar errores de tipeo). */
export const JERGA: Record<string, string> = {
  luka: "luca",
  lukas: "lucas",
  lukita: "luca",
  lukitas: "lucas",
  lucs: "lucas",
  q: "que",
  ke: "que",
  xq: "porque",
  pq: "porque",
  oy: "hoy",
  pa: "para",
  tb: "tambien",
  x: "por",
  ola: "hola",
  hla: "hola",
};

export interface Vocabulario {
  /** Palabra → cuántas veces aparece en las plantillas (las más usadas ganan los empates). */
  palabras: Map<string, number>;
}

const PALABRA = /^[a-zñ]+$/;

/** Las palabras de un patrón de plantilla (sin ranuras ni signos). */
export function palabrasDePatron(patron: string): string[] {
  return patron
    .replace(/\{[a-z]+\}/g, " ")
    .split(/[\s[\]()|]+/)
    .filter((p) => PALABRA.test(p));
}

export function armarVocabulario(fuentes: Iterable<string>, extras: Iterable<string> = []): Vocabulario {
  const palabras = new Map<string, number>();
  const sumar = (texto: string) => {
    for (const p of normalizar(texto).split(" ")) if (PALABRA.test(p)) palabras.set(p, (palabras.get(p) ?? 0) + 1);
  };
  for (const f of fuentes) sumar(f);
  for (const e of extras) sumar(e);
  return { palabras };
}

/** Distancia de Damerau-Levenshtein (una letra cambiada, comida, sobrante o dos juntas al revés = 1). */
export function distancia(a: string, b: string, tope = 3): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Cuántas letras de diferencia se perdonan según el largo de la palabra (en las de 3 letras, solo una y con la misma inicial). */
export function toleranciaDe(largo: number): number {
  if (largo < 3) return 0;
  if (largo < 4) return 1;
  return largo >= 11 ? 2 : 1;
}

function conocida(palabra: string, v: Vocabulario): boolean {
  if (v.palabras.has(palabra)) return true;
  // Plural simple: «completos», «lucas», «ramos»: si el singular se conoce, la palabra también.
  if (palabra.endsWith("es") && v.palabras.has(palabra.slice(0, -2))) return true;
  return palabra.endsWith("s") && v.palabras.has(palabra.slice(0, -1));
}

/** La inicial, con la b y la v confundidas (se escriben casi igual al hablar). */
function inicial(palabra: string): string {
  return palabra[0] === "v" ? "b" : palabra[0];
}

/** Hasta tres palabras del vocabulario parecidas a la palabra, las más cercanas y usadas primero. */
export function candidatasDe(palabra: string, v: Vocabulario): string[] {
  if (!PALABRA.test(palabra) || conocida(palabra, v)) return [];
  const tolerancia = toleranciaDe(palabra.length);
  if (tolerancia === 0) return [];
  const halladas: { palabra: string; dist: number; usos: number }[] = [];
  for (const [candidata, usos] of v.palabras) {
    if (candidata.length < 3) continue;
    // Con 3 letras solo se perdona si empieza igual: «mez» → «mes», no «mez» → «luz».
    if (palabra.length === 3 && inicial(candidata) !== inicial(palabra)) continue;
    const dist = distancia(palabra, candidata, tolerancia);
    if (dist <= tolerancia) halladas.push({ palabra: candidata, dist, usos });
  }
  halladas.sort((x, y) => x.dist - y.dist || Number(y.palabra[0] === palabra[0]) - Number(x.palabra[0] === palabra[0]) || y.usos - x.usos);
  return halladas.slice(0, 3).map((h) => h.palabra);
}

/** Una palabra de la frase: su texto tal cual la escribió el usuario y su forma normalizada. */
interface Trozo {
  original: string;
  norma: string;
  esPalabra: boolean;
}

function partir(frase: string): Trozo[] {
  const trozos: Trozo[] = [];
  for (const t of frase.split(/([\p{L}\p{N}$]+(?:[.,:][\p{N}]+)*)/u)) {
    if (t === "") continue;
    const esPalabra = /^[\p{L}\p{N}$]/u.test(t);
    trozos.push({ original: t, norma: esPalabra ? normalizar(t) : t, esPalabra });
  }
  return trozos;
}

/** Solo la jerga («lukas» → «lucas», «oy» → «hoy»): un cambio seguro, sin adivinar palabras. */
export function aplicarJerga(frase: string): string {
  return partir(frase)
    .map((t) => (t.esPalabra && JERGA[t.norma] ? JERGA[t.norma] : t.original))
    .join("");
}

export interface Correccion {
  /** La frase con las palabras cambiadas (el resto, tal cual la escribió el usuario). */
  frase: string;
  /** Qué palabra se cambió por cuál, en el orden de la frase. */
  cambios: { de: string; a: string }[];
}

/**
 * Las frases posibles tras corregir la escritura, de la que cambia más palabras a la que cambia menos (si una
 * palabra corregida resulta ser un nombre propio o una cosa que el vocabulario no conoce, la que calza es la de
 * menos cambios). Cada palabra dudosa prueba hasta tres candidatas. Nunca cambia números.
 */
export function corregirFrase(frase: string, vocabulario: Vocabulario, maximo = 48): Correccion[] {
  const trozos = partir(frase);
  // La jerga («lukas», «oy») y «e gastado» se cambian siempre; las palabras parecidas, solo si ayudan (varias combinaciones).
  const forzadas: { indice: number; de: string; a: string }[] = [];
  const dudosas: { indice: number; de: string; opciones: string[] }[] = [];
  for (let i = 0; i < trozos.length; i++) {
    const t = trozos[i];
    if (!t.esPalabra || /\d/.test(t.norma)) continue;
    const sigue = normalizar(trozos[i + 2]?.original ?? "");
    const fija = JERGA[t.norma] ?? (t.norma === "e" && /(ado|ido)$/.test(sigue) ? "he" : null);
    if (fija && fija !== t.norma) {
      forzadas.push({ indice: i, de: t.original, a: fija });
      continue;
    }
    const utiles = candidatasDe(t.norma, vocabulario).filter((o) => o !== t.norma);
    if (utiles.length > 0) dudosas.push({ indice: i, de: t.original, opciones: utiles });
  }
  if (dudosas.length === 0 && forzadas.length === 0) return [];
  const usar = dudosas.slice(0, 5);
  // Cada palabra dudosa: «no cambiar» (-1) o una candidata. Se recorren todas las combinaciones (con tope).
  const combos: { eleccion: number[]; cambios: number; rango: number }[] = [];
  const recorrer = (k: number, eleccion: number[]) => {
    if (k === usar.length) {
      const cambios = eleccion.filter((e) => e >= 0).length;
      if (cambios > 0 || forzadas.length > 0) combos.push({ eleccion, cambios, rango: eleccion.reduce((a, e) => a + Math.max(e, 0), 0) });
      return;
    }
    for (let e = -1; e < usar[k].opciones.length; e++) recorrer(k + 1, [...eleccion, e]);
  };
  recorrer(0, []);
  combos.sort((x, y) => y.cambios - x.cambios || x.rango - y.rango);
  return combos.slice(0, maximo).map(({ eleccion }) => {
    const copia = trozos.map((t) => t.original);
    const cambios: { de: string; a: string }[] = [];
    for (const f of forzadas) {
      copia[f.indice] = f.a;
      cambios.push({ de: f.de, a: f.a });
    }
    eleccion.forEach((e, k) => {
      if (e < 0) return;
      copia[usar[k].indice] = usar[k].opciones[e];
      cambios.push({ de: usar[k].de, a: usar[k].opciones[e] });
    });
    return { frase: copia.join(""), cambios };
  });
}
