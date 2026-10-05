// Tareas y pruebas sacadas de una transcripción (sección 8, fase 5). El agente de Brote las PROPONE
// con la herramienta `agenda_proponer`; nada llega a la Agenda ni al calendario sin que el usuario
// lo acepte en la isla. Aquí solo hay validación pura y las dos tablas (misma base que los gastos):
//   propuestas_agenda: lo que espera una decisión (título corto y fecha, nunca el texto de la clase).
//   tareas: lo aceptado que no es un evento de calendario; aparece en la pestaña Agenda como `tarea`.

import type { DatabaseSync } from "node:sqlite";
import type { Gastos } from "./gastos.ts";
import type { NuevaPropuesta, Propuesta, Tarea, TipoPropuesta, EstadoPropuesta } from "./tareas-agenda-tipos.ts";

export type { NuevaPropuesta, Propuesta, Tarea, TipoPropuesta, EstadoPropuesta };

export const MAX_PROPUESTAS_POR_LLAMADA = 12;
export const MAX_TITULO = 120;
export const MAX_DETALLE = 120;
/** Hasta cuánto en el futuro tiene sentido una fecha propuesta. */
const MAX_DIAS_ADELANTE = 366;
/** Una tarea o prueba hace poco pasada aún puede ser real (la clase fue ayer). */
const MAX_DIAS_ATRAS = 1;
const FORMA_ID_GRABACION = /^\d{4}-\d{2}-\d{2}-\d{6}$/;

const FORMA_FECHA = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/;

/** "AAAA-MM-DD[ HH:MM]" en hora local → milisegundos, o null si no es una fecha real. Sin hora: 23:59. */
export function leerFecha(texto: unknown): { ms: number; conHora: boolean } | null {
  if (typeof texto !== "string") return null;
  const m = FORMA_FECHA.exec(texto.trim());
  if (!m) return null;
  const [, a, mes, d, h, min] = m;
  const conHora = h !== undefined;
  const fecha = new Date(Number(a), Number(mes) - 1, Number(d), conHora ? Number(h) : 23, conHora ? Number(min) : 59);
  const igual =
    fecha.getFullYear() === Number(a) &&
    fecha.getMonth() === Number(mes) - 1 &&
    fecha.getDate() === Number(d) &&
    fecha.getHours() === (conHora ? Number(h) : 23) &&
    fecha.getMinutes() === (conHora ? Number(min) : 59);
  return igual ? { ms: fecha.getTime(), conHora } : null;
}

function limpiar(texto: unknown, largo: number): string {
  // Sin saltos de línea ni caracteres de control: es un título de una fila.
  return typeof texto === "string" ? texto.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, largo) : "";
}

export function idDeGrabacionValido(id: unknown): id is string {
  return typeof id === "string" && FORMA_ID_GRABACION.test(id);
}

export type ResultadoValidacion = { ok: true; propuesta: NuevaPropuesta & { inicioMs: number; conHora: boolean } } | { ok: false; motivo: string };

/** Revisa una propuesta del agente: título, tipo, fecha real y razonable; un evento exige hora. */
export function validarPropuesta(entrada: unknown, ahoraMs: number): ResultadoValidacion {
  const e = (entrada ?? {}) as Record<string, unknown>;
  if (e.tipo !== "tarea" && e.tipo !== "evento") return { ok: false, motivo: "«tipo» debe ser tarea o evento" };
  const titulo = limpiar(e.titulo, MAX_TITULO);
  if (titulo.length < 3) return { ok: false, motivo: "Falta el «titulo» (al menos 3 letras)" };
  const fecha = leerFecha(e.fecha);
  if (!fecha) return { ok: false, motivo: "«fecha» debe ser AAAA-MM-DD o AAAA-MM-DD HH:MM (hora local) y existir" };
  if (e.tipo === "evento" && !fecha.conHora) return { ok: false, motivo: "Un evento necesita hora: AAAA-MM-DD HH:MM" };
  if (fecha.ms < ahoraMs - MAX_DIAS_ATRAS * 86_400_000) return { ok: false, motivo: "Esa fecha ya pasó" };
  if (fecha.ms > ahoraMs + MAX_DIAS_ADELANTE * 86_400_000) return { ok: false, motivo: "Esa fecha está a más de un año" };
  const detalle = limpiar(e.detalle, MAX_DETALLE) || null;
  return { ok: true, propuesta: { tipo: e.tipo, titulo, detalle, fecha: String(e.fecha).trim(), inicioMs: fecha.ms, conHora: fecha.conHora } };
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface FilaPropuesta {
  id: number;
  grabacion: string;
  tipo: TipoPropuesta;
  titulo: string;
  detalle: string | null;
  inicio_ms: number;
  con_hora: number;
}
interface FilaTarea {
  id: number;
  titulo: string;
  detalle: string | null;
  vence_ms: number;
  hecha: number;
  grabacion: string | null;
}

export class TareasAgenda {
  private readonly db: DatabaseSync;

  constructor(gastos: Gastos) {
    this.db = gastos.baseDeDatos();
    this.db.exec(`
      create table if not exists propuestas_agenda (
        id integer primary key,
        grabacion text not null,
        tipo text not null check (tipo in ('tarea', 'evento')),
        titulo text not null,
        clave text not null,
        detalle text,
        inicio_ms integer not null,
        con_hora integer not null default 0,
        estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'descartada')),
        creada_ms integer not null,
        unique (grabacion, clave, inicio_ms)
      );
      create table if not exists tareas (
        id integer primary key,
        titulo text not null,
        detalle text,
        vence_ms integer not null,
        hecha integer not null default 0,
        grabacion text,
        creada_ms integer not null
      );
    `);
  }

  /**
   * Guarda lo que propuso el agente para una grabación. Las repetidas (también las ya descartadas o
   * aceptadas) se ignoran. Devuelve cuántas quedaron pendientes y los motivos de las rechazadas.
   */
  proponer(grabacion: string, lista: unknown[], ahoraMs: number): { nuevas: number; repetidas: number; rechazadas: string[] } {
    if (!idDeGrabacionValido(grabacion)) throw new Error("«grabacion» no es un id de grabación");
    const resultado = { nuevas: 0, repetidas: 0, rechazadas: [] as string[] };
    const insertar = this.db.prepare(
      "insert or ignore into propuestas_agenda (grabacion, tipo, titulo, clave, detalle, inicio_ms, con_hora, creada_ms) values (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const entrada of lista.slice(0, MAX_PROPUESTAS_POR_LLAMADA)) {
      const v = validarPropuesta(entrada, ahoraMs);
      if (!v.ok) {
        resultado.rechazadas.push(v.motivo);
        continue;
      }
      const p = v.propuesta;
      const { changes } = insertar.run(grabacion, p.tipo, p.titulo, normalizar(p.titulo), p.detalle, p.inicioMs, p.conHora ? 1 : 0, ahoraMs);
      if (Number(changes) > 0) resultado.nuevas++;
      else resultado.repetidas++;
    }
    return resultado;
  }

  pendientes(): Propuesta[] {
    const filas = this.db
      .prepare("select id, grabacion, tipo, titulo, detalle, inicio_ms, con_hora from propuestas_agenda where estado = 'pendiente' order by inicio_ms, id")
      .all() as unknown as FilaPropuesta[];
    return filas.map((f) => ({ id: f.id, grabacion: f.grabacion, tipo: f.tipo, titulo: f.titulo, detalle: f.detalle, inicioMs: f.inicio_ms, conHora: f.con_hora === 1 }));
  }

  propuesta(id: number): Propuesta | null {
    return this.pendientes().find((p) => p.id === id) ?? null;
  }

  /** Cambia el título o la fecha de una propuesta pendiente antes de aceptarla. */
  editar(id: number, cambios: { titulo?: unknown; fecha?: unknown }, ahoraMs: number): boolean {
    const actual = this.propuesta(id);
    if (!actual) return false;
    const titulo = cambios.titulo === undefined ? actual.titulo : limpiar(cambios.titulo, MAX_TITULO);
    const fecha = cambios.fecha === undefined ? { ms: actual.inicioMs, conHora: actual.conHora } : leerFecha(cambios.fecha);
    if (titulo.length < 3 || !fecha) return false;
    if (actual.tipo === "evento" && !fecha.conHora) return false;
    if (fecha.ms < ahoraMs - MAX_DIAS_ATRAS * 86_400_000 || fecha.ms > ahoraMs + MAX_DIAS_ADELANTE * 86_400_000) return false;
    this.db.prepare("update propuestas_agenda set titulo = ?, clave = ?, inicio_ms = ?, con_hora = ? where id = ? and estado = 'pendiente'").run(titulo, normalizar(titulo), fecha.ms, fecha.conHora ? 1 : 0, id);
    return true;
  }

  descartar(id: number): boolean {
    return Number(this.db.prepare("update propuestas_agenda set estado = 'descartada' where id = ? and estado = 'pendiente'").run(id).changes) > 0;
  }

  /** Marca la propuesta como aceptada (el puente crea el evento o la tarea). */
  aceptar(id: number): Propuesta | null {
    const p = this.propuesta(id);
    if (!p) return null;
    this.db.prepare("update propuestas_agenda set estado = 'aceptada' where id = ?").run(id);
    return p;
  }

  /** Borra las propuestas pendientes de una grabación (al borrar su transcripción). */
  olvidarDeGrabacion(grabacion: string): number {
    return Number(this.db.prepare("delete from propuestas_agenda where grabacion = ? and estado = 'pendiente'").run(grabacion).changes);
  }

  /** Borra todas las propuestas pendientes (al borrar todas las transcripciones). */
  olvidarPendientes(): number {
    return Number(this.db.prepare("delete from propuestas_agenda where estado = 'pendiente'").run().changes);
  }

  crearTarea(titulo: string, detalle: string | null, venceMs: number, grabacion: string | null, ahoraMs: number): Tarea {
    const { lastInsertRowid } = this.db
      .prepare("insert into tareas (titulo, detalle, vence_ms, grabacion, creada_ms) values (?, ?, ?, ?, ?)")
      .run(limpiar(titulo, MAX_TITULO), detalle, venceMs, grabacion, ahoraMs);
    return { id: Number(lastInsertRowid), titulo: limpiar(titulo, MAX_TITULO), detalle, venceMs, hecha: false, grabacion };
  }

  /** Las tareas de la ventana de la Agenda (las hechas hace poco siguen a la vista, tachadas). */
  tareas(desdeMs: number, hastaMs: number): Tarea[] {
    const filas = this.db
      .prepare("select id, titulo, detalle, vence_ms, hecha, grabacion from tareas where vence_ms >= ? and vence_ms < ? order by vence_ms, id")
      .all(desdeMs, hastaMs) as unknown as FilaTarea[];
    return filas.map((f) => ({ id: f.id, titulo: f.titulo, detalle: f.detalle, venceMs: f.vence_ms, hecha: f.hecha === 1, grabacion: f.grabacion }));
  }

  marcarHecha(id: number, hecha: boolean): boolean {
    return Number(this.db.prepare("update tareas set hecha = ? where id = ?").run(hecha ? 1 : 0, id).changes) > 0;
  }

  /** Cambia cada vez que llega una propuesta o cambia una tarea: el puente la mira para avisar a la isla. */
  marca(): string {
    const p = this.db.prepare("select count(*) as n, coalesce(max(id), 0) as u, coalesce(sum(case estado when 'pendiente' then 1 else 0 end), 0) as p from propuestas_agenda").get() as { n: number; u: number; p: number };
    const t = this.db.prepare("select count(*) as n, coalesce(max(id), 0) as u, coalesce(sum(hecha), 0) as h from tareas").get() as { n: number; u: number; h: number };
    return `${p.n}:${p.u}:${p.p}|${t.n}:${t.u}:${t.h}`;
  }
}
