// La pestaña Plata: cómo se dice y se dibuja lo que calcula el motor (packages/motor/src/plata.ts).
// Sin DOM, para probarlo con Node.

export * from "../../../../packages/motor/src/plata.ts";
import { formatearMonto } from "../../../../packages/motor/src/texto.ts";
import type { DiaPlata, EstadoPlata, PresupuestoMes } from "../../../../packages/motor/src/plata.ts";

export { formatearMonto };

/** "$1,2 M", "$84 mil", "$900": montos cortos para las barras. */
export function montoCorto(monto: number): string {
  if (monto >= 1_000_000) return `$${(monto / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} M`;
  if (monto >= 10_000) return `$${Math.round(monto / 1000)} mil`;
  return formatearMonto(monto);
}

/** "▲ 12 % vs. el mes pasado a esta altura" (subir es malo: ámbar), o una línea sin comparación. */
export function textoVariacion(mes: EstadoPlata["mes"]): { texto: string; tono: "sube" | "baja" | "igual" | "nada" } {
  if (mes.variacion === null) return { texto: mes.cantidad === 0 ? "Sin gastos anotados" : `${mes.cantidad === 1 ? "1 gasto" : `${mes.cantidad} gastos`} en ${mes.nombre}`, tono: "nada" };
  if (mes.variacion === 0) return { texto: "Igual que el mes pasado", tono: "igual" };
  const sube = mes.variacion > 0;
  return { texto: `${sube ? "▲" : "▼"} ${Math.abs(mes.variacion)} % vs. el mes pasado`, tono: sube ? "sube" : "baja" };
}

/** Lo que dice la tarjeta "Puedes gastar hoy". */
export function textoPuedesHoy(p: PresupuestoMes): { monto: string; detalle: string } {
  const dias = p.diasQuedan === 1 ? "último día" : `quedan ${p.diasQuedan} días`;
  if (p.puedesHoy < 0) return { monto: `−${formatearMonto(-p.puedesHoy)}`, detalle: `te pasaste hoy · ${dias}` };
  return { monto: formatearMonto(p.puedesHoy), detalle: `de ${formatearMonto(p.porDia)} por día · ${dias}` };
}

/** "hoy 13:05", "ayer", "28/9". */
export function cuandoMovimiento(fechaMs: number, ahoraMs: number): string {
  const fecha = new Date(fechaMs);
  const ahora = new Date(ahoraMs);
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((dia(ahora) - dia(fecha)) / 86_400_000);
  if (dias === 0) return `hoy ${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}`;
  if (dias === 1) return "ayer";
  return `${fecha.getDate()}/${fecha.getMonth() + 1}`;
}

export interface BarraDia {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  letra: string;
  hoy: boolean;
  titulo: string;
}

/**
 * Las barras de los últimos 7 días en una caja de `ancho` × `alto` (sin contar la fila de letras):
 * proporcionales al día más alto; un día sin gastos queda como una rayita.
 */
export function barrasSemana(dias: readonly DiaPlata[], ancho: number, alto: number): BarraDia[] {
  const maximo = Math.max(1, ...dias.map((d) => d.total));
  const paso = ancho / Math.max(1, dias.length);
  const grosor = Math.min(18, paso * 0.62);
  return dias.map((d, i) => {
    const h = d.total > 0 ? Math.max(3, (d.total / maximo) * alto) : 1.5;
    return {
      x: i * paso + (paso - grosor) / 2,
      y: alto - h,
      ancho: grosor,
      alto: h,
      letra: d.letra,
      hoy: d.hoy,
      titulo: `${d.hoy ? "Hoy" : new Date(d.inicioMs).toLocaleDateString("es-CL", { weekday: "long", day: "numeric" })}: ${formatearMonto(d.total)}`,
    };
  });
}

/** El texto de un botón de un toque: "+ $1.500 café". */
export function textoFrecuente(f: { descripcion: string; monto: number; emoji: string }): string {
  return `${f.emoji} ${f.descripcion} ${formatearMonto(f.monto)}`;
}
