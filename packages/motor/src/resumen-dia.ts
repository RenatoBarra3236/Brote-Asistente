// El resumen del día (E2 de docs/plan-estudio-y-mejoras.md): una frase armada, sin IA, con lo que Brote ya
// sabe de hoy: calendario, entregas, pruebas, tareas, bloques de estudio, tarjetas de repaso y plata. Solo
// dice lo que existe (sin ceros ni líneas vacías). Puro: sin Node ni DOM.

import type { DiaAgenda, ItemAgenda } from "./agenda.ts";
import { formatearMonto } from "./texto.ts";

export interface PlataDelDia {
  /** Con presupuesto: lo que puedes gastar hoy y el del mes; sin presupuesto, solo lo gastado en el mes. */
  mesGastado: number;
  presupuesto: number | null;
  puedesHoy: number | null;
}

export interface EntradaResumen {
  ahoraMs: number;
  /** La agenda ya armada (eventos, entregas, pruebas, tareas, bloques); `null` = nada conectado. */
  dias: readonly DiaAgenda[] | null;
  /** Tarjetas de repaso que vencen hoy; `null` = la función está apagada. */
  tarjetasHoy: number | null;
  /** `null` = la función de gastos está apagada. */
  plata: PlataDelDia | null;
}

export interface ResumenDelDia {
  texto: string;
  /** Una línea para el ala de la isla: «☀️ Hoy: 2 eventos · 1 entrega · 4 tarjetas». */
  corto: string;
  /** Si hay algo que decir (sin agenda, sin tarjetas y sin plata, no hay resumen automático). */
  hay: boolean;
}

const DIA_MS = 86_400_000;
const NOMBRES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function inicioDelDia(ms: number, dias = 0): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias).getTime();
}

function hora(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function cuantos(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** «Buenos días» hasta el mediodía, «Buenas tardes» hasta las 20 y «Buenas noches» después. */
export function saludoDelMomento(ahoraMs: number): string {
  const h = new Date(ahoraMs).getHours();
  return h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

/** «hoy a las 15:00», «mañana a las 09:00», «en 3 días (viernes)». */
function cuando(item: ItemAgenda, ahoraMs: number): string {
  const dias = Math.round((inicioDelDia(item.inicioMs) - inicioDelDia(ahoraMs)) / DIA_MS);
  const a = item.todoElDia ? "" : ` a las ${hora(item.inicioMs)}`;
  if (dias === 0) return `hoy${a}`;
  if (dias === 1) return `mañana${a}`;
  return `en ${dias} días (${NOMBRES[new Date(item.inicioMs).getDay()]})${a}`;
}

/** Lo que todavía queda de hoy (lo que ya terminó no se cuenta). */
function deHoy(dias: readonly DiaAgenda[], ahoraMs: number): ItemAgenda[] {
  const hoy = inicioDelDia(ahoraMs);
  const dia = dias.find((d) => d.diaMs === hoy);
  return (dia?.items ?? []).filter((x) => x.hecha !== true && (x.todoElDia || Math.max(x.inicioMs, x.finMs) >= ahoraMs));
}

export function armarResumenDelDia(e: EntradaResumen): ResumenDelDia {
  const frases: string[] = [];
  const cortos: string[] = [];
  const dias = e.dias ?? [];
  const hoy = deHoy(dias, e.ahoraMs);

  const conHora = hoy.filter((x) => x.tipo === "evento" && !x.todoElDia);
  const todoElDia = hoy.filter((x) => x.tipo === "evento" && x.todoElDia);
  if (conHora.length > 0) {
    frases.push(`Hoy tienes ${cuantos(conHora.length, "evento", "eventos")} en tu calendario (${conHora.length === 1 ? "es" : "el primero es"} a las ${hora(conHora[0].inicioMs)}).`);
    cortos.push(cuantos(conHora.length, "evento", "eventos"));
  }
  if (todoElDia.length > 0) frases.push(`Todo el día: ${todoElDia.slice(0, 2).map((x) => x.titulo).join(" y ")}.`);

  const entregasHoy = hoy.filter((x) => x.tipo === "entrega");
  const entregasManana = (dias.find((d) => d.diaMs === inicioDelDia(e.ahoraMs, 1))?.items ?? []).filter((x) => x.tipo === "entrega");
  if (entregasHoy.length > 0) {
    const primera = entregasHoy[0];
    const sola = entregasHoy.length === 1 ? `Vence hoy: ${primera.titulo}${primera.detalle ? ` (${primera.detalle})` : ""} a las ${hora(primera.inicioMs)}.` : `Vencen hoy ${entregasHoy.length} entregas (la primera, ${primera.titulo}, a las ${hora(primera.inicioMs)}).`;
    const manana = entregasManana.length > 0 ? ` Mañana ${entregasManana.length === 1 ? "vence 1 más" : `vencen ${entregasManana.length} más`}.` : "";
    frases.push(sola + manana);
    cortos.push(cuantos(entregasHoy.length, "entrega", "entregas"));
  } else if (entregasManana.length > 0) {
    frases.push(`Mañana vence${entregasManana.length === 1 ? "" : "n"} ${cuantos(entregasManana.length, "entrega", "entregas")}: ${entregasManana[0].titulo}${entregasManana.length > 1 ? " y más" : ""}.`);
  }

  // La próxima prueba de los próximos 7 días.
  const hasta = inicioDelDia(e.ahoraMs, 8);
  const pruebas = dias
    .flatMap((d) => d.items)
    .filter((x) => x.tipo === "prueba" && x.hecha !== true && x.inicioMs >= inicioDelDia(e.ahoraMs) && x.inicioMs < hasta)
    .sort((a, b) => a.inicioMs - b.inicioMs);
  if (pruebas.length > 0) {
    frases.push(`Tu próxima prueba: ${pruebas[0].titulo}, ${cuando(pruebas[0], e.ahoraMs)}.`);
    cortos.push("📝 prueba cerca");
  }

  const tareas = hoy.filter((x) => x.tipo === "tarea");
  if (tareas.length > 0) frases.push(`${cuantos(tareas.length, "tarea", "tareas")} para hoy: ${tareas[0].titulo}${tareas.length > 1 ? " y más" : ""}.`);
  const bloques = hoy.filter((x) => x.tipo === "estudio");
  if (bloques.length > 0) frases.push(`Tienes ${cuantos(bloques.length, "bloque", "bloques")} de estudio (${bloques.length === 1 ? "es" : "el primero es"} a las ${hora(bloques[0].inicioMs)}).`);

  if (e.tarjetasHoy !== null && e.tarjetasHoy > 0) {
    frases.push(`Tienes ${cuantos(e.tarjetasHoy, "tarjeta", "tarjetas")} para repasar.`);
    cortos.push(cuantos(e.tarjetasHoy, "tarjeta", "tarjetas"));
  }

  if (e.plata) {
    if (e.plata.presupuesto !== null && e.plata.puedesHoy !== null) {
      const resto = e.plata.puedesHoy >= 0 ? `Puedes gastar ${formatearMonto(e.plata.puedesHoy)} hoy` : `Hoy ya te pasaste por ${formatearMonto(-e.plata.puedesHoy)}`;
      frases.push(`${resto} (llevas ${formatearMonto(e.plata.mesGastado)} de ${formatearMonto(e.plata.presupuesto)} del mes).`);
      if (e.plata.puedesHoy >= 0) cortos.push(`${formatearMonto(e.plata.puedesHoy)} libres`);
    } else if (e.plata.mesGastado > 0) {
      frases.push(`Este mes llevas ${formatearMonto(e.plata.mesGastado)} gastados.`);
    }
  }

  const saludo = saludoDelMomento(e.ahoraMs);
  if (frases.length === 0) return { texto: `${saludo}. Hoy no veo nada agendado 🌱`, corto: "☀️ Hoy: nada agendado", hay: false };
  return { texto: `${saludo}. ${frases.join(" ")}`, corto: `☀️ Hoy: ${cortos.length > 0 ? cortos.join(" · ") : "mira tu día"}`, hay: true };
}
