// Capa F del plan sin IA: el formulario «+ Gasto» de la pestaña Plata (monto, qué fue, categoría). Un toque no se
// equivoca: el monto se lee como cifra, nunca se adivina. Sin DOM, para probarlo con Node.

import { CATEGORIAS, type Categoria } from "../../../../packages/motor/src/categorias.ts";
import { leerMonto } from "../../../../packages/motor/src/montos.ts";
import { normalizar } from "../../../../packages/motor/src/texto.ts";

export const MAX_DESCRIPCION_GASTO = 200;
export const MONTO_MAXIMO_GASTO = 100_000_000;

export interface BorradorGasto {
  monto: string;
  descripcion: string;
  /** `auto` = la categoría sale de la descripción, como cuando se escribe la frase. */
  categoria: Categoria | "auto";
}

export type GastoValidado = { ok: true; monto: number; descripcion: string | null; categoria: Categoria | "auto" } | { ok: false; error: string };

/** Lee lo que escribió el usuario en el campo de monto: «5000», «$5.000», «5 lucas», «2,5 lucas». */
export function leerMontoDelCampo(texto: string): number | null {
  const limpio = normalizar(texto).replace(/\s+/g, " ").trim();
  if (!limpio) return null;
  return leerMonto(limpio);
}

export function validarGasto(b: BorradorGasto): GastoValidado {
  const monto = leerMontoDelCampo(b.monto);
  if (monto === null || monto <= 0) return { ok: false, error: "Escribe cuánto fue (por ejemplo 3500 o 5 lucas)." };
  if (monto > MONTO_MAXIMO_GASTO) return { ok: false, error: "Ese monto es demasiado grande." };
  const descripcion = b.descripcion.trim();
  if (descripcion.length > MAX_DESCRIPCION_GASTO) return { ok: false, error: "La descripción es muy larga." };
  const categoria = b.categoria === "auto" || (CATEGORIAS as readonly string[]).includes(b.categoria) ? b.categoria : "auto";
  return { ok: true, monto, descripcion: descripcion || null, categoria };
}

export const ETIQUETAS_CATEGORIA: Record<Categoria | "auto", string> = {
  auto: "Elegir sola",
  comida: "🍔 Comida",
  transporte: "🚌 Transporte",
  estudio: "📚 Estudio",
  salidas: "🎉 Salidas",
  salud: "💊 Salud",
  cuentas: "💡 Cuentas",
  otros: "🧾 Otros",
};
