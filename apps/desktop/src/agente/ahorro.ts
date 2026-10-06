// Metas de ahorro en la pestaña Plata: cómo se dicen y se dibujan (la lógica está en
// packages/motor/src/ahorro-tipos.ts). Sin DOM, para probarlo con Node. Brote solo anota lo que el usuario
// dice que apartó: nunca ve cuentas ni saldos, y la ventana nunca reprocha un atraso.

export * from "../../../../packages/motor/src/ahorro-tipos.ts";
import { textoLimite } from "../../../../packages/motor/src/ahorro-tipos.ts";
import { formatearMonto } from "../../../../packages/motor/src/texto.ts";
import { juntadoAhorro } from "../../../../packages/motor/src/ahorro-tipos.ts";
import type { AporteAhorro, MetaAhorro, ProgresoMetaAhorro } from "../../../../packages/motor/src/ahorro-tipos.ts";

/** Lo que se escribe en el campo al tocar «Poner una meta». */
export const FRASE_NUEVA_META = "quiero juntar ";

export const TITULO_AHORRO = "Metas de ahorro";
/** Lo que dice el tooltip de la tarjeta (se dice una vez, sin asustar). */
export const NOTA_LIBRETA = "Brote anota lo que tú dices que apartaste: no ve tus cuentas ni mueve plata.";
export const TEXTO_SIN_METAS_ISLA = "¿Quieres juntar plata para algo? Dime «quiero juntar 150 lucas para marzo» y te llevo la cuenta.";

export interface FilaMeta {
  nombre: string;
  porcentaje: number;
  /** Ancho de la barra (0 a 1; mínimo visible si hay algo juntado). */
  fraccion: number;
  color: "verde" | "ambar" | "rojo" | "sin";
  /** «$45.000 de $150.000» */
  montos: string;
  /** «$21.000 al mes · 6 meses (hasta marzo)», «¡Meta cumplida! 🎉»… */
  detalle: string;
  /** Solo con ritmo lento: «A tu ritmo llegarías en mayo». Nunca un reproche. */
  ritmo: string | null;
  cumplida: boolean;
}

/** Lo que muestra la isla de una meta. */
export function filaDeMeta(p: ProgresoMetaAhorro, ahoraMs: number): FilaMeta {
  const montos = `${formatearMonto(p.juntado)} de ${formatearMonto(p.meta.monto)}`;
  let detalle: string;
  if (p.cumplida) detalle = "¡Meta cumplida! 🎉";
  else if (p.vencida && p.meta.limiteMs !== null) detalle = `La fecha (${textoLimite(p.meta.limiteMs, ahoraMs)}) ya pasó · te faltan ${formatearMonto(p.falta)}`;
  else if (p.cuotaMensual !== null && p.mesesQuedan !== null && p.meta.limiteMs !== null) {
    detalle = `${formatearMonto(p.cuotaMensual)} al mes · ${p.mesesQuedan} ${p.mesesQuedan === 1 ? "mes" : "meses"} (hasta ${textoLimite(p.meta.limiteMs, ahoraMs)})`;
  } else detalle = `te faltan ${formatearMonto(p.falta)} · sin fecha límite`;
  const lento = p.color === "ambar" || p.color === "rojo";
  return {
    nombre: p.meta.nombre,
    porcentaje: p.porcentaje,
    fraccion: p.juntado > 0 ? Math.max(0.03, p.fraccion) : 0,
    color: p.color ?? "sin",
    montos,
    detalle,
    ritmo: lento && p.llegariaMs !== null ? `A tu ritmo llegarías en ${textoLimite(p.llegariaMs, ahoraMs)}` : null,
    cumplida: p.cumplida,
  };
}

/** Lo que se escribe al tocar «+ Aporte»: «aparté  para el viaje», con el cursor después de «aparté ». */
export function frasePorAporte(nombre: string): { texto: string; cursor: number } {
  const inicio = "aparté ";
  return { texto: `${inicio} para ${nombre.toLowerCase()}`, cursor: inicio.length };
}

/** «Lo que sé de ti → Metas de ahorro». */
export const NOTA_AHORRO_MEMORIA =
  "Tus metas de ahorro y lo que dijiste que apartaste se guardan solo en tu computador, en una base de datos de Brote. Brote no ve tus cuentas: solo anota lo que tú le dices. Al borrarlas desaparecen de verdad (no hay Papelera).";

export function avisoAhorroBorrado(n: number): string {
  return n === 1 ? "Borré 1 meta de ahorro con sus aportes." : `Borré ${n} metas de ahorro con sus aportes.`;
}

/** «$45.000 de $150.000 · 3 aportes · archivada» (para la lista de lo guardado). */
export function lineaDeMetaGuardada(meta: MetaAhorro, aportes: readonly AporteAhorro[]): string {
  const suyos = aportes.filter((a) => a.metaId === meta.id);
  const total = juntadoAhorro(suyos, meta.id);
  const partes = [`${formatearMonto(total)} de ${formatearMonto(meta.monto)}`, suyos.length === 1 ? "1 anotación" : `${suyos.length} anotaciones`];
  if (meta.estado === "archivada") partes.push("archivada");
  else if (meta.estado === "cumplida") partes.push("cumplida");
  return partes.join(" · ");
}
