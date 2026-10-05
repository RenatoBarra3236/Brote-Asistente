// La pestaña Agenda: junta en una lista por día lo que el usuario tiene que hacer o a lo que tiene que
// ir: eventos del calendario, entregas del aula y temporizadores/recordatorios. Puro (sin Node ni DOM)
// para probarlo y para usarlo desde la ventana. Las tareas vienen de lo que el usuario aceptó de una
// grabación (`tareas-agenda.ts`); Todoist sigue sin ser fuente.

export type TipoItemAgenda = "evento" | "entrega" | "recordatorio" | "tarea";

export interface ItemAgenda {
  tipo: TipoItemAgenda;
  titulo: string;
  /** Lugar (eventos) o curso (entregas). */
  detalle: string | null;
  inicioMs: number;
  /** Igual a `inicioMs` si no dura (entregas, recordatorios). */
  finMs: number;
  todoElDia: boolean;
  /** Para abrirla (solo https: entregas del aula). */
  url: string | null;
  /** Solo las tareas (las de las grabaciones): su id y si ya está hecha, para el check de la isla. */
  tareaId?: number;
  hecha?: boolean;
}

export interface DiaAgenda {
  /** Comienzo del día, en hora local. */
  diaMs: number;
  items: ItemAgenda[];
}

interface EventoEntrada {
  titulo: string;
  lugar: string | null;
  inicioMs: number;
  finMs: number;
  todoElDia: boolean;
}
interface EntregaEntrada {
  curso: string;
  titulo: string;
  entregaMs: number;
  url: string | null;
  entregada: boolean;
}
interface TareaEntrada {
  id: number;
  titulo: string;
  detalle: string | null;
  venceMs: number;
  hecha: boolean;
}
interface TemporizadorEntrada {
  tipo: "temporizador" | "pomodoro";
  etiqueta: string | null;
  finMs: number;
}

function inicioDelDia(ms: number, dias = 0): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias).getTime();
}

/**
 * Los próximos `dias` días con algo (los vacíos no se incluyen; la isla dice "sin nada"). Los de
 * día completo van primero; lo que ya terminó hoy sigue a la vista, atenuado por la isla. Un evento
 * de varios días aparece en cada día que toca.
 */
export function armarAgenda(
  fuentes: { eventos?: EventoEntrada[]; entregas?: EntregaEntrada[]; temporizadores?: TemporizadorEntrada[]; tareas?: TareaEntrada[] },
  ahoraMs: number,
  dias = 14,
): DiaAgenda[] {
  const desde = inicioDelDia(ahoraMs);
  const items: ItemAgenda[] = [];
  // Una tarea aceptada también se crea en el calendario (termina justo a su hora límite): ahí no se repite.
  const espejoDeTarea = (e: EventoEntrada) => (fuentes.tareas ?? []).some((t) => t.titulo === e.titulo && t.venceMs === e.finMs && !e.todoElDia);
  for (const e of fuentes.eventos ?? []) {
    if (espejoDeTarea(e)) continue;
    items.push({ tipo: "evento", titulo: e.titulo, detalle: e.lugar, inicioMs: e.inicioMs, finMs: e.finMs, todoElDia: e.todoElDia, url: null });
  }
  for (const e of fuentes.entregas ?? []) {
    if (e.entregada) continue;
    items.push({ tipo: "entrega", titulo: e.titulo, detalle: e.curso || null, inicioMs: e.entregaMs, finMs: e.entregaMs, todoElDia: false, url: e.url });
  }
  for (const t of fuentes.temporizadores ?? []) {
    // El pomodoro ya tiene su tarjeta con cuenta regresiva: aquí solo lo que es "a una hora".
    if (t.tipo !== "temporizador") continue;
    items.push({ tipo: "recordatorio", titulo: t.etiqueta ?? "Temporizador", detalle: null, inicioMs: t.finMs, finMs: t.finMs, todoElDia: false, url: null });
  }

  for (const t of fuentes.tareas ?? []) {
    items.push({ tipo: "tarea", titulo: t.titulo, detalle: t.detalle, inicioMs: t.venceMs, finMs: t.venceMs, todoElDia: false, url: null, tareaId: t.id, hecha: t.hecha });
  }

  const resultado: DiaAgenda[] = [];
  for (let i = 0; i < dias; i++) {
    const inicio = inicioDelDia(desde, i);
    const fin = inicioDelDia(desde, i + 1);
    const delDia = items
      .filter((x) => (x.finMs > x.inicioMs ? x.inicioMs < fin && x.finMs > inicio : x.inicioMs >= inicio && x.inicioMs < fin))
      .sort((a, b) => Number(b.todoElDia) - Number(a.todoElDia) || a.inicioMs - b.inicioMs || a.titulo.localeCompare(b.titulo));
    if (delDia.length > 0) resultado.push({ diaMs: inicio, items: delDia });
  }
  return resultado;
}
