// Precios oficiales de la API de Claude, para calcular el "valor API" del uso: lo que costaría
// pagando por token. NO es un cobro: el usuario paga su plan (Pro o Max) y estos números solo
// sirven para dimensionar cuánto uso es. Sin imports de Node: también lo usan las ventanas.
//
// Fuente: https://platform.claude.com/docs/en/about-claude/pricing (revisada el 3 de octubre de 2026).
// Un modelo que no está aquí muestra sus tokens sin valor en USD: nunca se adivina un precio.

export const FECHA_PRECIOS = "2026-10-03";
export const FUENTE_PRECIOS = "https://platform.claude.com/docs/en/about-claude/pricing";

/** USD por millón de tokens. */
export interface Precio {
  /** Cómo se muestra: "Sonnet 5.5". */
  nombre: string;
  entrada: number;
  /** Escritura de caché de 5 minutos. */
  escritura5m: number;
  /** Escritura de caché de 1 hora. */
  escritura1h: number;
  /** Lectura de caché. */
  lectura: number;
  salida: number;
}

function precio(nombre: string, entrada: number, escritura5m: number, escritura1h: number, lectura: number, salida: number): Precio {
  return { nombre, entrada, escritura5m, escritura1h, lectura, salida };
}

/** La tabla, por la clave del modelo ("sonnet-5-5"; ver `claveModelo`). */
export const PRECIOS: Readonly<Record<string, Precio>> = {
  "fable-5-1": precio("Fable 5.1", 10, 12.5, 20, 0.25, 50),
  "mythos-5-1": precio("Mythos 5.1", 10, 12.5, 20, 0.25, 50),
  "fable-5": precio("Fable 5", 10, 12.5, 20, 1, 50),
  "mythos-5": precio("Mythos 5", 10, 12.5, 20, 1, 50),
  "opus-5-5": precio("Opus 5.5", 4, 5, 8, 0.2, 20),
  "opus-5": precio("Opus 5", 5, 6.25, 10, 0.5, 25),
  "opus-4-8": precio("Opus 4.8", 5, 6.25, 10, 0.5, 25),
  "opus-4-7": precio("Opus 4.7", 5, 6.25, 10, 0.5, 25),
  "opus-4-6": precio("Opus 4.6", 5, 6.25, 10, 0.5, 25),
  "opus-4-5": precio("Opus 4.5", 5, 6.25, 10, 0.5, 25),
  "sonnet-5-5": precio("Sonnet 5.5", 2, 2.5, 4, 0.2, 10),
  "sonnet-5": precio("Sonnet 5", 2, 2.5, 4, 0.2, 10),
  "sonnet-4-6": precio("Sonnet 4.6", 3, 3.75, 6, 0.3, 15),
  "sonnet-4-5": precio("Sonnet 4.5", 3, 3.75, 6, 0.3, 15),
  "haiku-4-5": precio("Haiku 4.5", 1, 1.25, 2, 0.1, 5),
};

/**
 * Modo rápido (`speed: "fast"`): precio de entrada y de salida. Los de caché se escalan igual que la
 * entrada ("los multiplicadores de caché se aplican encima"). Un modelo que no está aquí y llega en
 * modo rápido queda sin valor en USD.
 */
export const PRECIOS_RAPIDO: Readonly<Record<string, { entrada: number; salida: number }>> = {
  "opus-5-5": { entrada: 8, salida: 40 },
  "opus-5": { entrada: 10, salida: 50 },
  "opus-4-8": { entrada: 10, salida: 50 },
};

/** Inferencia solo en EE. UU. (`inference_geo: "us"`): 1,1 veces todo. */
export const RECARGO_EEUU = 1.1;
/** Búsqueda web: 10 USD por 1.000 búsquedas. */
export const USD_POR_BUSQUEDA = 10 / 1000;

/**
 * La clave de la tabla para un id de modelo: "claude-sonnet-5" → "sonnet-5",
 * "anthropic/claude-opus-4-5-20251101" → "opus-4-5", "claude-haiku-4-5-20251001" → "haiku-4-5",
 * "claude-sonnet-5-5[1m]" → "sonnet-5-5". `null` si no parece un modelo de Claude.
 */
export function claveModelo(modelo: string): string | null {
  const m = modelo
    .toLowerCase()
    .trim()
    .replace(/\[[^\]]*\]$/, "")
    .match(/(?:^|[/.:])claude-([a-z]+(?:-\d+){1,2})(?:-\d{8})?(?:-v\d+(?::\d+)?)?$/);
  return m ? m[1] : null;
}

/** El precio de un modelo, o `null` si no está en la tabla. */
export function precioDe(modelo: string): Precio | null {
  const clave = claveModelo(modelo);
  return clave ? (PRECIOS[clave] ?? null) : null;
}

/** Cómo se muestra un modelo: "Sonnet 5.5" si está en la tabla; si no, su id tal cual. */
export function nombreModelo(modelo: string): string {
  return precioDe(modelo)?.nombre ?? modelo;
}
