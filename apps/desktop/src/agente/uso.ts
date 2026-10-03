// El uso del plan de Claude en la isla (pestaña Claude): qué barras mostrar, con qué color y qué
// texto, y las filas de tokens. Sin DOM, para probarlo con Node. Los cálculos y formatos vienen del
// motor (packages/motor/src/{plan,uso,precios}.ts), los mismos que usa el puente.

import { colorPlan, faltaPara, haceCuanto, horaCorta, paraMostrar, type LecturaPlan } from "../../../../packages/motor/src/plan.ts";
import { formatearTokens, valorDe, type ResumenPeriodo, type ResumenUso, type TotalUso } from "../../../../packages/motor/src/uso.ts";
import type { Precio } from "../../../../packages/motor/src/precios.ts";

export { FECHA_PRECIOS } from "../../../../packages/motor/src/precios.ts";
export { formatearTokens, valorDe } from "../../../../packages/motor/src/uso.ts";
export type { LecturaPlan, ResumenPeriodo, ResumenUso, TotalUso, Precio };

/** Lo que manda el puente (aviso "uso" y pedido "uso-estado"). */
export interface EstadoUso {
  plan: LecturaPlan | null;
  /** Corre la consulta mínima (el botón ↻ gira). */
  consultando?: boolean;
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

const FUENTES: Record<string, string> = { statusline: "Claude Code", consulta: "consulta", app: "app de Claude" };

/**
 * Las barras de la sesión de 5 h y de la semana y "actualizado hace 3 min · app de Claude". Una ventana
 * que ya se reinició se muestra en 0 % ("se reinició a las 18:40") hasta la próxima lectura; una hora
 * de reinicio estimada (de la app de Claude) lleva "≈".
 */
export function barrasPlan(plan: LecturaPlan | null, ahoraMs: number): { barras: BarraPlan[]; actualizado: string | null } {
  const vista = paraMostrar(plan, ahoraMs);
  if (!plan || !vista) return { barras: [], actualizado: null };
  const barras: BarraPlan[] = [];
  for (const [nombre, v] of [
    ["Sesión de 5 h", vista.sesion],
    ["Semana", vista.semana],
  ] as const) {
    if (!v) continue;
    const casi = v.estimado ? "≈ " : "";
    const reinicia = v.reiniciada
      ? v.reiniciaMs !== null
        ? `se reinició ${v.estimado ? "cerca de las" : "a las"} ${horaCorta(v.reiniciaMs)}`
        : "ya se reinició"
      : v.reiniciaMs !== null
        ? `se reinicia en ${casi}${faltaPara(v.reiniciaMs, ahoraMs)}`
        : v.porcentaje === 0
          ? "sin usar desde el último reinicio"
          : "";
    barras.push({ nombre, porcentaje: Math.round(v.porcentaje), fraccion: v.porcentaje / 100, color: colorPlan(v.porcentaje), reinicia });
  }
  const fuente = FUENTES[plan.fuente ?? "statusline"];
  return { barras, actualizado: `actualizado ${haceCuanto(plan.actualizadoMs, ahoraMs)}${fuente ? ` · ${fuente}` : ""}` };
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
