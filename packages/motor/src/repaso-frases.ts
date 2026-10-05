// Textos de las frases sin IA sobre el repaso (A3). Puro.

import { colaDelDia, resumirRepaso } from "./repaso-tipos.ts";
import type { Tarjeta } from "./repaso-tipos.ts";

export interface NombreDeRamo {
  id: number;
  nombre: string;
}

function tarjetas(n: number): string {
  return n === 1 ? "1 tarjeta" : `${n} tarjetas`;
}

/** «¿Tengo tarjetas para repasar?» */
export function textoHayRepaso(lista: readonly Tarjeta[], ramos: readonly NombreDeRamo[], ahoraMs: number): string {
  const { total, hoy } = resumirRepaso(lista, ahoraMs);
  if (total === 0) return "Todavía no tienes tarjetas de repaso. Cuando grabes una clase, pídeme «hazme un repaso de la clase» y te dejo una propuesta 🌱";
  if (hoy === 0) return `Hoy no te toca repasar nada 🎉 (tienes ${tarjetas(total)} guardadas).`;
  const nombres = new Map(ramos.map((r) => [r.id, r.nombre]));
  const porRamo = new Map<string, number>();
  for (const t of colaDelDia(lista, ahoraMs, Number.MAX_SAFE_INTEGER)) {
    const nombre = t.ramoId === null ? "Sin ramo" : (nombres.get(t.ramoId) ?? "Sin ramo");
    porRamo.set(nombre, (porRamo.get(nombre) ?? 0) + 1);
  }
  const partes = porRamo.size > 1 ? ` (${[...porRamo].map(([n, c]) => `${n} ${c}`).join(", ")})` : "";
  return `Tienes ${tarjetas(hoy)} para repasar hoy${partes}. Dime «repasemos» y empezamos.`;
}

/** «Repasemos [cálculo]»: la sesión la arma la isla; aquí solo se avisa o se explica por qué no hay. */
export function textoEmpezarRepaso(lista: readonly Tarjeta[], nombreRamo: string | null, ramoId: number | null, ahoraMs: number): { texto: string; hay: boolean } {
  const cola = colaDelDia(lista, ahoraMs, 1, ramoId ?? undefined);
  const de = nombreRamo ? ` de ${nombreRamo}` : "";
  if (cola.length === 0) return { texto: `No tienes tarjetas${de} para repasar hoy 🎉`, hay: false };
  return { texto: `Vamos a repasar${de} 🌱 Te lo muestro en la pestaña Estudio.`, hay: true };
}
