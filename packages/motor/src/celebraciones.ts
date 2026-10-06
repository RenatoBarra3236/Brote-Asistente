// Las celebraciones de Brote (E4 de docs/plan-estudio-y-mejoras.md): una línea corta, en su estilo (chileno,
// motivador, breve), cuando el usuario logra algo que él mismo marcó: una tarea o un bloque de estudio hecho
// y un ramo aprobado. La meta de la semana y los hitos de la racha están en `estadisticas-metas.ts`.
// Nunca se celebra algo que Brote dedujo (por ejemplo, una entrega que desaparece del aula). Puro.

// Cortas a propósito: el aviso se lee en el ala de la isla (unas 38 letras).
const TAREA = ["✅ ¡Tarea lista! Una menos 🌱", "✅ ¡Eso! Tarea hecha 💪", "✅ ¡Bien ahí! Una menos 🌱"];
const BLOQUE = ["📚 ¡Bloque hecho! Bien ahí 🌱", "📚 ¡Un bloque menos! 💪", "📚 ¡Listo el bloque! Constancia 🌱"];

/** Rota entre las frases para que no suene siempre igual (determinista: `n` es cuántas se han celebrado). */
export function elegirTexto(lista: readonly string[], n: number): string {
  return lista[((n % lista.length) + lista.length) % lista.length];
}

export function textoTareaHecha(n: number): string {
  return elegirTexto(TAREA, n);
}

export function textoBloqueHecho(n: number): string {
  return elegirTexto(BLOQUE, n);
}

export function textoRamoAprobado(nombre: string): string {
  return `🎉 ¡Aprobaste ${nombre}! 🌱`;
}

/** Lo ya celebrado como aprobado (lista de ids de ramo), sin fiarse de lo guardado. */
export function leerAprobados(texto: string | null): number[] | null {
  if (!texto) return null;
  try {
    const v = JSON.parse(texto) as unknown;
    return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x > 0) : null;
  } catch {
    return null;
  }
}

/**
 * Qué ramos celebrar como aprobados. `previos === null` es la primera vez: lo que ya estaba aprobado se da por
 * celebrado en silencio (no tiene sentido festejarlo al instalar). Después, solo los que pasan a aprobados.
 */
export function ramosPorCelebrar(aprobadosAhora: readonly number[], previos: readonly number[] | null): { celebrar: number[]; guardar: number[] } {
  if (previos === null) return { celebrar: [], guardar: [...aprobadosAhora] };
  const nuevos = aprobadosAhora.filter((id) => !previos.includes(id));
  return { celebrar: nuevos, guardar: [...previos, ...nuevos] };
}
