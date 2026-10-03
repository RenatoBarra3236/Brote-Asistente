// El uso del plan de Claude en la isla (pestaña Claude): qué barras mostrar, con qué color y qué
// texto, y las filas de tokens. Sin DOM, para probarlo con Node. Los cálculos y formatos vienen del
// motor (packages/motor/src/{plan,uso,precios}.ts), los mismos que usa el puente.

import { colorPlan, faltaPara, haceCuanto, vigente, type LecturaPlan } from "../../../../packages/motor/src/plan.ts";
import { formatearTokens, valorDe, type ResumenPeriodo, type ResumenUso, type TotalUso } from "../../../../packages/motor/src/uso.ts";
import type { Precio } from "../../../../packages/motor/src/precios.ts";

export { FECHA_PRECIOS } from "../../../../packages/motor/src/precios.ts";
export { formatearTokens, valorDe } from "../../../../packages/motor/src/uso.ts";
export type { LecturaPlan, ResumenPeriodo, ResumenUso, TotalUso, Precio };

/** Lo que manda el puente (aviso "uso" y pedido "uso-estado"). */
export interface EstadoUso {
  plan: LecturaPlan | null;
  /** Si la statusline de Brote está instalada en Claude Code. */
  statusline: boolean;
  resumen: ResumenUso | null;
  precios: { fecha: string; fuente: string; modelos: { id: string; precio: Precio | null }[] };
}

export interface BarraPlan {
  nombre: string;
  /** Redondeado, para mostrar. */
  porcentaje: number;
  /** Entre 0 y 1, para el ancho de la barra. */
  fraccion: number;
  color: "verde" | "ambar" | "rojo";
  reinicia: string;
}

/** Las barras de la sesión de 5 h y de la semana (solo las vigentes) y "actualizado hace 3 min". */
export function barrasPlan(plan: LecturaPlan | null, ahoraMs: number): { barras: BarraPlan[]; actualizado: string | null } {
  const l = vigente(plan, ahoraMs);
  if (!l) return { barras: [], actualizado: null };
  const barras: BarraPlan[] = [];
  for (const [nombre, v] of [
    ["Sesión de 5 h", l.sesion],
    ["Semana", l.semana],
  ] as const) {
    if (!v) continue;
    barras.push({
      nombre,
      porcentaje: Math.round(v.porcentaje),
      fraccion: v.porcentaje / 100,
      color: colorPlan(v.porcentaje),
      reinicia: `se reinicia en ${faltaPara(v.reiniciaMs, ahoraMs)}`,
    });
  }
  return { barras, actualizado: `actualizado ${haceCuanto(l.actualizadoMs, ahoraMs)}` };
}

/** Las filas de la tabla de tokens: [nombre, Brote, tus sesiones]. */
export function filasTokens(p: ResumenPeriodo): [string, string, string][] {
  const fila = (nombre: string, dato: (t: TotalUso) => string): [string, string, string] => [nombre, dato(p.brote), dato(p.tuyas)];
  return [
    fila("Entrada", (t) => formatearTokens(t.entrada)),
    fila("Salida", (t) => formatearTokens(t.salida)),
    fila("Caché", (t) => formatearTokens(t.cache)),
    fila("Valor API", valorDe),
  ];
}

/** "1,2" para la tabla de precios (sin ceros de más). */
export function precioCorto(usd: number): string {
  return String(Math.round(usd * 100) / 100).replace(".", ",");
}
