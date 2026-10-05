// Los ramos del usuario (A1 de docs/plan-estudio-y-mejoras.md). Tabla `ramos` en la misma base que
// los gastos. Archivar no borra: lo enlazado a un ramo (tareas, pomodoros…) sigue existiendo.
// Reglas puras (validación, emparejar un título con un ramo) en `ramos-tipos.ts`.

import type { DatabaseSync } from "node:sqlite";
import type { Gastos } from "./gastos.ts";
import { MAX_RAMOS, colorSiguiente, normalizarRamo, validarRamo } from "./ramos-tipos.ts";
import type { ColorRamo, Ramo } from "./ramos-tipos.ts";

export type { Ramo, ColorRamo };

interface FilaRamo {
  id: number;
  nombre: string;
  clave: string;
  color: ColorRamo;
  alias: string;
  archivado: number;
}

function desdeFila(f: FilaRamo): Ramo {
  let alias: string[] = [];
  try {
    const leido: unknown = JSON.parse(f.alias);
    if (Array.isArray(leido)) alias = leido.filter((a): a is string => typeof a === "string");
  } catch {
    // alias dañados: el ramo sigue valiendo por su nombre
  }
  return { id: f.id, nombre: f.nombre, color: f.color, alias, archivado: f.archivado === 1 };
}

/** Lo que se puede enlazar a un ramo (la referencia es el id de la tarea, propuesta, pomodoro o grabación). */
export type TipoEnlace = "tarea" | "propuesta" | "pomodoro" | "grabacion";
const TIPOS_ENLACE: readonly TipoEnlace[] = ["tarea", "propuesta", "pomodoro", "grabacion"];

export type ResultadoCrear = { ok: true; ramo: Ramo } | { ok: false; motivo: string };

export class Ramos {
  private readonly db: DatabaseSync;

  constructor(gastos: Gastos) {
    this.db = gastos.baseDeDatos();
    this.db.exec(`
      create table if not exists ramos (
        id integer primary key,
        nombre text not null,
        clave text not null unique,
        color text not null,
        alias text not null default '[]',
        archivado integer not null default 0,
        creado_ms integer not null
      );
      -- A qué ramo pertenece cada tarea, propuesta, pomodoro o grabación. Aparte de sus tablas para no
      -- tocarlas: sin fila = «sin ramo». Borrar un ramo borra sus filas; archivarlo no.
      create table if not exists ramo_de (
        tipo text not null check (tipo in ('tarea', 'propuesta', 'pomodoro', 'grabacion')),
        ref text not null,
        ramo_id integer not null,
        primary key (tipo, ref)
      );
    `);
  }

  /** Todos los ramos (los archivados al final si se piden). */
  listar(incluirArchivados = false): Ramo[] {
    const filas = this.db
      .prepare(`select id, nombre, clave, color, alias, archivado from ramos ${incluirArchivados ? "" : "where archivado = 0"} order by archivado, nombre collate nocase`)
      .all() as unknown as FilaRamo[];
    return filas.map(desdeFila);
  }

  obtener(id: number): Ramo | null {
    const f = this.db.prepare("select id, nombre, clave, color, alias, archivado from ramos where id = ?").get(id) as unknown as FilaRamo | undefined;
    return f ? desdeFila(f) : null;
  }

  /** Crea un ramo. Si había uno archivado con ese nombre, lo reactiva (y actualiza sus datos). */
  crear(entrada: unknown, ahoraMs: number): ResultadoCrear {
    const v = validarRamo(entrada);
    if (!v.ok) return v;
    const clave = normalizarRamo(v.nombre);
    const existente = this.db.prepare("select id, nombre, clave, color, alias, archivado from ramos where clave = ?").get(clave) as unknown as FilaRamo | undefined;
    if (existente && existente.archivado === 0) return { ok: false, motivo: `Ya tienes un ramo «${existente.nombre}»` };
    if (!existente && this.listar().length >= MAX_RAMOS) return { ok: false, motivo: `Tienes ${MAX_RAMOS} ramos: archiva alguno antes de agregar otro` };
    const color = v.color ?? (existente ? existente.color : colorSiguiente(this.listar()));
    if (existente) {
      this.db.prepare("update ramos set nombre = ?, color = ?, alias = ?, archivado = 0 where id = ?").run(v.nombre, color, JSON.stringify(v.alias), existente.id);
      return { ok: true, ramo: this.obtener(existente.id)! };
    }
    const { lastInsertRowid } = this.db
      .prepare("insert into ramos (nombre, clave, color, alias, creado_ms) values (?, ?, ?, ?, ?)")
      .run(v.nombre, clave, color, JSON.stringify(v.alias), ahoraMs);
    return { ok: true, ramo: this.obtener(Number(lastInsertRowid))! };
  }

  /** Cambia nombre, color o palabras clave de un ramo. */
  editar(id: number, cambios: { nombre?: unknown; color?: unknown; alias?: unknown }): ResultadoCrear {
    const actual = this.obtener(id);
    if (!actual) return { ok: false, motivo: "Ese ramo no existe" };
    const v = validarRamo({
      nombre: cambios.nombre ?? actual.nombre,
      color: cambios.color ?? actual.color,
      alias: cambios.alias ?? actual.alias,
    });
    if (!v.ok) return v;
    const clave = normalizarRamo(v.nombre);
    const otro = this.db.prepare("select id from ramos where clave = ? and id <> ?").get(clave, id);
    if (otro) return { ok: false, motivo: "Ya hay otro ramo con ese nombre" };
    this.db.prepare("update ramos set nombre = ?, clave = ?, color = ?, alias = ? where id = ?").run(v.nombre, clave, v.color ?? actual.color, JSON.stringify(v.alias), id);
    return { ok: true, ramo: this.obtener(id)! };
  }

  /** Archivar o desarchivar. No borra nada. */
  archivar(id: number, archivado = true): boolean {
    return Number(this.db.prepare("update ramos set archivado = ? where id = ?").run(archivado ? 1 : 0, id).changes) > 0;
  }

  /** Borrado definitivo (desde «Lo que sé de ti»). Lo enlazado a él queda «sin ramo». */
  borrar(id: number): boolean {
    this.db.prepare("delete from ramo_de where ramo_id = ?").run(id);
    return Number(this.db.prepare("delete from ramos where id = ?").run(id).changes) > 0;
  }

  /** Pone (o quita, con `null`) el ramo de una tarea, propuesta, pomodoro o grabación. */
  asignar(tipo: TipoEnlace, ref: number | string, ramoId: number | null): boolean {
    if (!TIPOS_ENLACE.includes(tipo)) return false;
    const clave = String(ref);
    if (ramoId === null) {
      this.db.prepare("delete from ramo_de where tipo = ? and ref = ?").run(tipo, clave);
      return true;
    }
    if (!this.obtener(ramoId)) return false;
    this.db.prepare("insert or replace into ramo_de (tipo, ref, ramo_id) values (?, ?, ?)").run(tipo, clave, ramoId);
    return true;
  }

  /** El ramo (id) de algo, o null si no tiene. */
  ramoDe(tipo: TipoEnlace, ref: number | string): number | null {
    const f = this.db.prepare("select ramo_id from ramo_de where tipo = ? and ref = ?").get(tipo, String(ref)) as { ramo_id: number } | undefined;
    return f ? f.ramo_id : null;
  }

  /** Todo lo enlazado de un tipo: referencia → id del ramo. */
  enlaces(tipo: TipoEnlace): Map<string, number> {
    const filas = this.db.prepare("select ref, ramo_id from ramo_de where tipo = ?").all(tipo) as unknown as { ref: string; ramo_id: number }[];
    return new Map(filas.map((f) => [f.ref, f.ramo_id]));
  }

  /** Quita el enlace de lo que ya no existe (por ejemplo una grabación borrada). */
  olvidarEnlace(tipo: TipoEnlace, ref: number | string): void {
    this.db.prepare("delete from ramo_de where tipo = ? and ref = ?").run(tipo, String(ref));
  }

  /** Cambia cuando se crea, edita, archiva o borra un ramo o un enlace: el puente la mira para avisar a la isla. */
  marca(): string {
    const r = this.db.prepare("select count(*) as n, coalesce(max(id), 0) as u, coalesce(sum(archivado), 0) as a, coalesce(sum(length(nombre) + length(alias) + length(color)), 0) as t from ramos").get() as { n: number; u: number; a: number; t: number };
    const e = this.db.prepare("select count(*) as n, coalesce(sum(ramo_id), 0) as s from ramo_de").get() as { n: number; s: number };
    return `${r.n}:${r.u}:${r.a}:${r.t}|${e.n}:${e.s}`;
  }
}
