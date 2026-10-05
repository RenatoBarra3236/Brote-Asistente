// Tipos y reglas puras de los ramos (A1 de docs/plan-estudio-y-mejoras.md). Sin Node: también los
// usa la ventana. Un ramo es solo un nombre, un color y unas palabras clave; nunca guarda texto de clases.

/** Paleta cerrada: combina con los temas de la isla. */
export const COLORES_RAMO = ["azul", "verde", "ambar", "rojo", "violeta", "turquesa", "rosa", "gris"] as const;
export type ColorRamo = (typeof COLORES_RAMO)[number];

export const MAX_NOMBRE_RAMO = 60;
export const MAX_ALIAS = 5;
export const MAX_LARGO_ALIAS = 30;
export const MAX_RAMOS = 40;

export interface Ramo {
  id: number;
  nombre: string;
  color: ColorRamo;
  /** Palabras clave que unen el ramo con los títulos del calendario y del aula. */
  alias: string[];
  archivado: boolean;
}

/** Minúsculas, sin tildes y sin signos: así «Cálculo II» y «calculo ii» son lo mismo. */
export function normalizarRamo(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Texto de una línea, sin caracteres de control. */
export function limpiarTexto(texto: unknown, largo: number): string {
  return typeof texto === "string" ? texto.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, largo) : "";
}

/** ¿`texto` contiene `clave` como palabra(s) completa(s)? Así «cal» no calza con «calculo». */
export function contienePalabras(texto: string, clave: string): boolean {
  const t = ` ${normalizarRamo(texto)} `;
  const c = normalizarRamo(clave);
  return c.length > 0 && t.includes(` ${c} `);
}

/**
 * El ramo al que pertenece un título (de un evento o de un curso del aula): el que tenga la palabra
 * clave más larga. Los archivados no cuentan. Empate o sin coincidencia → null.
 */
export function emparejarRamo(titulo: string, ramos: readonly Ramo[]): Ramo | null {
  let mejor: { ramo: Ramo; largo: number } | null = null;
  let empate = false;
  for (const ramo of ramos) {
    if (ramo.archivado) continue;
    for (const clave of [ramo.nombre, ...ramo.alias]) {
      if (!contienePalabras(titulo, clave)) continue;
      const largo = normalizarRamo(clave).length;
      if (!mejor || largo > mejor.largo) {
        mejor = { ramo, largo };
        empate = false;
      } else if (largo === mejor.largo && mejor.ramo.id !== ramo.id) empate = true;
    }
  }
  return mejor && !empate ? mejor.ramo : null;
}

/** El siguiente color de la paleta que menos se usa, para que cada ramo nuevo se distinga. */
export function colorSiguiente(ramos: readonly Ramo[]): ColorRamo {
  const usos = new Map<ColorRamo, number>(COLORES_RAMO.map((c) => [c, 0]));
  for (const r of ramos) if (!r.archivado) usos.set(r.color, (usos.get(r.color) ?? 0) + 1);
  return COLORES_RAMO.reduce((a, b) => ((usos.get(b) ?? 0) < (usos.get(a) ?? 0) ? b : a));
}

export type ResultadoRamo = { ok: true; nombre: string; alias: string[]; color: ColorRamo | null } | { ok: false; motivo: string };

/** Valida lo que llega para crear o editar un ramo (de la isla, del motor o del agente). */
export function validarRamo(entrada: unknown): ResultadoRamo {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const nombre = limpiarTexto(e.nombre, MAX_NOMBRE_RAMO);
  if (normalizarRamo(nombre).length < 2) return { ok: false, motivo: "Falta el «nombre» del ramo (al menos 2 letras)" };
  let color: ColorRamo | null = null;
  if (e.color !== undefined && e.color !== null) {
    if (!(COLORES_RAMO as readonly unknown[]).includes(e.color)) return { ok: false, motivo: `«color» debe ser uno de: ${COLORES_RAMO.join(", ")}` };
    color = e.color as ColorRamo;
  }
  const vistos = new Set<string>([normalizarRamo(nombre)]);
  const alias: string[] = [];
  if (e.alias !== undefined && e.alias !== null) {
    if (!Array.isArray(e.alias)) return { ok: false, motivo: "«alias» debe ser una lista de palabras" };
    for (const a of e.alias) {
      const limpio = limpiarTexto(a, MAX_LARGO_ALIAS);
      const clave = normalizarRamo(limpio);
      if (clave.length < 2 || vistos.has(clave)) continue;
      vistos.add(clave);
      alias.push(limpio);
    }
    if (alias.length > MAX_ALIAS) return { ok: false, motivo: `Como mucho ${MAX_ALIAS} palabras clave` };
  }
  return { ok: true, nombre, alias, color };
}
