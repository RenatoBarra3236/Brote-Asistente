// Los tipos de tareas-agenda.ts, sin imports de Node: los usa también la ventana de la isla.

export type TipoPropuesta = "tarea" | "evento";
export type EstadoPropuesta = "pendiente" | "aceptada" | "descartada";

export interface NuevaPropuesta {
  tipo: TipoPropuesta;
  titulo: string;
  /** Curso o lugar, opcional. */
  detalle: string | null;
  /** Fecha local: AAAA-MM-DD o AAAA-MM-DD HH:MM. */
  fecha: string;
}

export interface Propuesta {
  id: number;
  grabacion: string;
  tipo: TipoPropuesta;
  titulo: string;
  detalle: string | null;
  inicioMs: number;
  /** La fecha traía hora (si no, se usa el final del día). */
  conHora: boolean;
}

export interface Tarea {
  id: number;
  titulo: string;
  detalle: string | null;
  venceMs: number;
  hecha: boolean;
  grabacion: string | null;
}

