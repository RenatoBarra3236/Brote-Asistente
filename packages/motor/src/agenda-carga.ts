// La vista semanal de la pestaña Agenda: cuánta carga tiene cada día y si la semana está «pesada» (la
// semana de certámenes). Puro (sin Node ni DOM): lo usan el motor (sin IA) y la ventana. Los números
// son una regla simple y explicable, no una predicción.

import type { DiaAgenda, ItemAgenda, TipoItemAgenda } from "./agenda.ts";

/** Lo que pesa una prueba y una entrega para decidir si un día o una semana está pesado (las pruebas, el doble). */
export const PESO_PRUEBA = 2;
export const PESO_ENTREGA = 1;
/** Un día o una semana con este puntaje o más es «pesado»: una prueba y una entrega, dos pruebas o tres entregas. */
export const UMBRAL_PESADO = 3;
/** Cuántas semanas hacia adelante se pueden ver (la ventana que se lee es de 35 días). */
export const SEMANAS_ADELANTE = 3;

export type NivelCarga = 0 | 1 | 2 | 3;

export interface PuntoDia {
  tipo: TipoItemAgenda;
  ramoId?: number;
  /** Prueba o entrega (lo que pesa en «semana pesada»). */
  fuerte: boolean;
}

export interface DiaCarga {
  diaMs: number;
  hoy: boolean;
  pasado: boolean;
  nivel: NivelCarga;
  puntos: PuntoDia[];
  /** Pruebas y entregas del día, con su título. */
  fuertes: { tipo: "prueba" | "entrega"; titulo: string }[];
  /** 2 × pruebas + entregas. */
  puntaje: number;
  pesado: boolean;
}

export interface SemanaCarga {
  desdeMs: number;
  dias: DiaCarga[];
  puntaje: number;
  pesada: boolean;
  /** El día de más puntaje (el primero si empatan); solo si la semana es pesada. */
  diaPesado: DiaCarga | null;
  /** Cuántas cosas hay en total (sin las ya hechas). */
  cantidad: number;
}

function inicioDelDia(ms: number, dias = 0): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias).getTime();
}

/** El lunes de la semana de `ms`, a las 00:00 locales. */
export function lunesDe(ms: number): number {
  const d = new Date(ms);
  const atras = (d.getDay() + 6) % 7;
  return inicioDelDia(ms, -atras);
}

/** La carga de un solo elemento, en «puntos de carga»: horas ocupadas, y más por una entrega o una prueba. */
function cargaDe(item: ItemAgenda, diaMs: number): number {
  if (item.hecha === true) return 0;
  switch (item.tipo) {
    case "prueba":
      return 3;
    case "entrega":
      return 1.5;
    case "tarea":
      return 0.5;
    case "evento":
    case "estudio": {
      if (item.todoElDia || item.finMs <= item.inicioMs) return 0;
      // Lo que cruza la medianoche solo cuenta la parte de este día.
      const desde = Math.max(item.inicioMs, diaMs);
      const hasta = Math.min(item.finMs, inicioDelDia(diaMs, 1));
      return Math.max(0, (hasta - desde) / 3_600_000);
    }
    default:
      return 0;
  }
}

function nivelDe(carga: number, hayAlgo: boolean): NivelCarga {
  if (!hayAlgo) return 0;
  return carga < 3 ? 1 : carga < 6 ? 2 : 3;
}

/**
 * Los 7 días que empiezan en `desdeMs` (un lunes para la grilla; hoy para «¿cómo viene mi semana?»).
 * `agenda` es lo que arma `armarAgenda`; los días sin nada simplemente no vienen. Lo que ya está hecho
 * no pesa. Un día pasado no tiene datos (la ventana que se lee parte de hoy): sale vacío y `pasado`.
 */
export function cargaDeLaSemana(agenda: readonly DiaAgenda[], desdeMs: number, ahoraMs: number): SemanaCarga {
  const hoy = inicioDelDia(ahoraMs);
  const dias: DiaCarga[] = [];
  let cantidad = 0;
  for (let i = 0; i < 7; i++) {
    const diaMs = inicioDelDia(desdeMs, i);
    const items = (agenda.find((d) => d.diaMs === diaMs)?.items ?? []).filter((x) => x.hecha !== true);
    const fuertes = items
      .filter((x): x is ItemAgenda & { tipo: "prueba" | "entrega" } => x.tipo === "prueba" || x.tipo === "entrega")
      .map((x) => ({ tipo: x.tipo, titulo: x.titulo }));
    const puntaje = fuertes.reduce((t, f) => t + (f.tipo === "prueba" ? PESO_PRUEBA : PESO_ENTREGA), 0);
    const carga = items.reduce((t, x) => t + cargaDe(x, diaMs), 0);
    cantidad += items.length;
    dias.push({
      diaMs,
      hoy: diaMs === hoy,
      pasado: diaMs < hoy,
      nivel: nivelDe(carga, items.length > 0),
      puntos: items.map((x) => ({ tipo: x.tipo, ...(x.ramoId !== undefined ? { ramoId: x.ramoId } : {}), fuerte: x.tipo === "prueba" || x.tipo === "entrega" })),
      fuertes,
      puntaje,
      pesado: puntaje >= UMBRAL_PESADO,
    });
  }
  const puntaje = dias.reduce((t, d) => t + d.puntaje, 0);
  const pesada = puntaje >= UMBRAL_PESADO;
  const diaPesado = pesada ? dias.reduce<DiaCarga | null>((m, d) => (d.puntaje > (m?.puntaje ?? 0) ? d : m), null) : null;
  return { desdeMs: inicioDelDia(desdeMs), dias, puntaje, pesada, diaPesado, cantidad };
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function nombreDelDia(diaMs: number, ahoraMs: number): string {
  const dias = Math.round((diaMs - inicioDelDia(ahoraMs)) / 86_400_000);
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  return `el ${DIAS[new Date(diaMs).getDay()]}`;
}

function lista(titulos: string[]): string {
  if (titulos.length <= 1) return titulos[0] ?? "";
  return `${titulos.slice(0, -1).join(", ")} y ${titulos[titulos.length - 1]}`;
}

/** «¿Cómo viene mi semana?»: los próximos 7 días, en una o dos frases. */
export function describirSemana(agenda: readonly DiaAgenda[], ahoraMs: number): string {
  const semana = cargaDeLaSemana(agenda, inicioDelDia(ahoraMs), ahoraMs);
  if (semana.cantidad === 0) return "Tu semana viene libre: no veo nada agendado en los próximos 7 días 🌱";
  const cosas = semana.cantidad === 1 ? "1 cosa agendada" : `${semana.cantidad} cosas agendadas`;
  if (semana.pesada && semana.diaPesado) {
    const d = semana.diaPesado;
    const nombre = nombreDelDia(d.diaMs, ahoraMs);
    const detalle = lista(d.fuertes.map((f) => f.titulo));
    const pesada = d.pesado ? `${nombre} es el día pesado: ${detalle}` : `lo más fuerte cae ${nombre}: ${detalle}`;
    return `Semana pesada 🔥 (${cosas}). ${pesada.charAt(0).toUpperCase()}${pesada.slice(1)}. Ojo con repartir el estudio antes.`;
  }
  const fuertes = semana.dias.filter((d) => d.fuertes.length > 0);
  if (fuertes.length === 0) return `Tu semana viene tranquila 🌱: ${cosas} en los próximos 7 días y ninguna prueba ni entrega.`;
  const f = fuertes.map((d) => `${d.fuertes.map((x) => x.titulo).join(" y ")} (${nombreDelDia(d.diaMs, ahoraMs)})`);
  return `Tu semana viene tranquila 🌱: ${cosas} en los próximos 7 días. Lo más fuerte: ${lista(f)}.`;
}
