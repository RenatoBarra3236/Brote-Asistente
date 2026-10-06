// La pestaña Plata: cómo se dice y se dibuja lo que calcula el motor (packages/motor/src/plata.ts).
// Sin DOM, para probarlo con Node.

export * from "../../../../packages/motor/src/plata.ts";
import { formatearMonto } from "../../../../packages/motor/src/texto.ts";
import type { DiaPlata, EstadoPlata, MesPlata, PresupuestoMes, ProyeccionMes } from "../../../../packages/motor/src/plata.ts";

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

export interface BarraMes {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  clave: string;
  corto: string;
  parcial: boolean;
  /** Lo que sale al tocarla: "septiembre: $260 mil · más en 🍔 comida ($90 mil)". */
  titulo: string;
}

export interface GraficoMeses {
  barras: BarraMes[];
  /** El tramo punteado de la barra del mes en curso (lo que falta para el mes proyectado), si hay proyección. */
  proyectado: { x: number; y: number; ancho: number; alto: number } | null;
  /** La altura (y) de la línea del presupuesto, o `null` si no hay o queda lejos de la escala. */
  linea: number | null;
}

/** "septiembre: $260 mil · más en 🍔 comida ($90 mil)" (el mes en curso dice "va en"). */
export function textoMes(m: MesPlata): string {
  if (m.total === 0) return `${m.nombre}: sin gastos`;
  const mayor = m.mayor ? ` · más en ${m.mayor.emoji} ${m.mayor.categoria} (${montoCorto(m.mayor.total)})` : "";
  return `${m.nombre}${m.parcial ? " (va en)" : ""}: ${montoCorto(m.total)}${mayor}`;
}

/**
 * Las barras de los últimos meses en una caja de `ancho` × `alto` (sin la fila de letras), proporcionales
 * al mes más alto. La proyección se dibuja encima de la barra del mes en curso. La línea del presupuesto
 * solo entra a la escala si no es más del doble de lo mayor que se gastó: así un presupuesto enorme no
 * aplasta las barras (queda sin línea y su valor se dice en el texto).
 */
export function barrasMeses(meses: readonly MesPlata[], proyeccion: ProyeccionMes | null, presupuesto: number | null, ancho: number, alto: number): GraficoMeses {
  const proyectado = proyeccion && proyeccion.estado === "ok" ? proyeccion.proyectado : 0;
  const datos = Math.max(0, ...meses.map((m) => m.total), proyectado);
  const dentro = presupuesto !== null && presupuesto > 0 && presupuesto <= Math.max(1, datos) * 2;
  const maximo = Math.max(1, datos, dentro ? (presupuesto as number) : 0);
  const paso = ancho / Math.max(1, meses.length);
  const grosor = Math.min(26, paso * 0.62);
  const altura = (valor: number) => (valor > 0 ? Math.max(3, (valor / maximo) * alto) : 1.5);
  const barras = meses.map((m, i) => {
    const h = altura(m.total);
    return { x: i * paso + (paso - grosor) / 2, y: alto - h, ancho: grosor, alto: h, clave: m.clave, corto: m.corto, parcial: m.parcial, titulo: textoMes(m) };
  });
  const ultima = barras[barras.length - 1];
  const sobra = ultima && proyectado > (meses[meses.length - 1]?.total ?? 0) ? altura(proyectado) - ultima.alto : 0;
  return {
    barras,
    proyectado: ultima && sobra > 0.5 ? { x: ultima.x, y: ultima.y - sobra, ancho: ultima.ancho, alto: sobra } : null,
    linea: dentro ? alto - (presupuesto as number) / maximo * alto : null,
  };
}

/** La línea corta de la tarjeta: "A este ritmo cierras en $372 mil" y, aparte, lo que pasa con el presupuesto. */
export function textoProyeccion(p: ProyeccionMes, presupuesto: number | null): { titulo: string; detalle: string; tono: "verde" | "ambar" | "rojo" | "sin" } {
  if (p.estado === "pronto") return { titulo: "Aún es pronto para proyectar", detalle: "Se calcula desde el día 5 del mes.", tono: "sin" };
  const titulo = `A este ritmo cierras el mes en ${montoCorto(p.proyectado)}`;
  const aparte = p.excluido ? `sin contar ${formatearMonto(p.excluido.monto)} en ${p.excluido.descripcion}` : null;
  let presu: string | null = null;
  if (presupuesto && p.diferencia !== null) presu = p.diferencia > 0 ? `te pasarías por ${montoCorto(p.diferencia)}` : `te sobrarían ${montoCorto(-p.diferencia)}`;
  return { titulo, detalle: [presu, aparte].filter(Boolean).join(" · ") || `unos ${formatearMonto(p.ritmoDia)} al día`, tono: p.color ?? "sin" };
}

/** Lo que lee un lector de pantalla del gráfico de meses. */
export function resumenTendencia(meses: readonly MesPlata[], proyeccion: ProyeccionMes, presupuesto: number | null): string {
  const lista = meses.map((m) => `${m.nombre} ${m.total === 0 ? "sin gastos" : montoCorto(m.total)}${m.parcial ? " (parcial)" : ""}`).join(", ");
  const p = textoProyeccion(proyeccion, presupuesto);
  return `Gastos de los últimos ${meses.length} meses: ${lista}. ${p.titulo}${p.detalle ? `, ${p.detalle}` : ""}.`;
}
