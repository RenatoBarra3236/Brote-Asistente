// Evaluaciones y notas por ramo (A2 de docs/plan-estudio-y-mejoras.md). Tablas `evaluaciones` y
// `notas_ramo` en la misma base que los gastos (permisos 600). Cálculos puros en `notas-tipos.ts`.
// Las notas son datos personales: nunca van a registros ni a especialistas de planes gratuitos.

import type { DatabaseSync } from "node:sqlite";
import type { Gastos } from "./gastos.ts";
import { normalizarRamo } from "./ramos-tipos.ts";
import type { Ramos } from "./ramos.ts";
import { AJUSTES_POR_DEFECTO, MAX_EVALUACIONES_POR_RAMO, validarAjustes, validarEvaluacion, validarNota } from "./notas-tipos.ts";
import type { AjustesNotas, Evaluacion } from "./notas-tipos.ts";

export type ResultadoEvaluacionGuardada = { ok: true; evaluacion: Evaluacion } | { ok: false; motivo: string };

interface FilaEvaluacion {
  id: number;
  ramo_id: number;
  nombre: string;
  peso: number;
  nota: number | null;
  fecha: string | null;
}

function desdeFila(f: FilaEvaluacion): Evaluacion {
  return { id: f.id, ramoId: f.ramo_id, nombre: f.nombre, peso: f.peso, nota: f.nota, fecha: f.fecha };
}

const COLUMNAS = "id, ramo_id, nombre, peso, nota, fecha";

export class Notas {
  private readonly db: DatabaseSync;

  /** Recibe `Ramos` para asegurar que su tabla existe (el trigger de borrado la necesita). */
  constructor(gastos: Gastos, _ramos: Ramos) {
    this.db = gastos.baseDeDatos();
    this.db.exec(`
      create table if not exists evaluaciones (
        id integer primary key,
        ramo_id integer not null,
        nombre text not null,
        clave text not null,
        peso integer not null,
        nota real,
        fecha text,
        creado_ms integer not null,
        unique (ramo_id, clave)
      );
      create table if not exists notas_ramo (
        ramo_id integer primary key,
        aprobacion real not null default 4,
        examen_peso integer,
        examen_minimo real,
        presentacion_minima real
      );
      -- Borrar un ramo (desde «Lo que sé de ti») borra también sus notas; archivarlo no.
      create trigger if not exists ramos_borra_notas after delete on ramos begin
        delete from evaluaciones where ramo_id = old.id;
        delete from notas_ramo where ramo_id = old.id;
      end;
    `);
  }

  /** Las evaluaciones de un ramo (o de todos), en el orden en que se crearon. */
  listar(ramoId?: number): Evaluacion[] {
    const filas = (ramoId === undefined
      ? this.db.prepare(`select ${COLUMNAS} from evaluaciones order by ramo_id, id`).all()
      : this.db.prepare(`select ${COLUMNAS} from evaluaciones where ramo_id = ? order by id`).all(ramoId)) as unknown as FilaEvaluacion[];
    return filas.map(desdeFila);
  }

  obtener(id: number): Evaluacion | null {
    const f = this.db.prepare(`select ${COLUMNAS} from evaluaciones where id = ?`).get(id) as unknown as FilaEvaluacion | undefined;
    return f ? desdeFila(f) : null;
  }

  /** Crea una evaluación en un ramo que exista. El nombre es único dentro del ramo (sin tildes ni mayúsculas). */
  crear(ramoId: number, entrada: unknown, ahoraMs: number): ResultadoEvaluacionGuardada {
    if (!this.existeRamo(ramoId)) return { ok: false, motivo: "Ese ramo no existe" };
    const v = validarEvaluacion(entrada);
    if (!v.ok) return v;
    const clave = normalizarRamo(v.nombre);
    if (this.db.prepare("select 1 from evaluaciones where ramo_id = ? and clave = ?").get(ramoId, clave)) return { ok: false, motivo: `Ya hay una evaluación «${v.nombre}» en ese ramo` };
    if (this.listar(ramoId).length >= MAX_EVALUACIONES_POR_RAMO) return { ok: false, motivo: `Como mucho ${MAX_EVALUACIONES_POR_RAMO} evaluaciones por ramo` };
    const { lastInsertRowid } = this.db
      .prepare("insert into evaluaciones (ramo_id, nombre, clave, peso, nota, fecha, creado_ms) values (?, ?, ?, ?, ?, ?, ?)")
      .run(ramoId, v.nombre, clave, v.peso, v.nota, v.fecha, ahoraMs);
    return { ok: true, evaluacion: this.obtener(Number(lastInsertRowid))! };
  }

  /** Cambia nombre, peso, nota o fecha. Lo que no viene se queda; `nota: null` la deja pendiente. */
  editar(id: number, cambios: { nombre?: unknown; peso?: unknown; nota?: unknown; fecha?: unknown }): ResultadoEvaluacionGuardada {
    const actual = this.obtener(id);
    if (!actual) return { ok: false, motivo: "Esa evaluación no existe" };
    const v = validarEvaluacion({
      nombre: cambios.nombre ?? actual.nombre,
      peso: cambios.peso ?? actual.peso,
      nota: cambios.nota === undefined ? actual.nota : cambios.nota,
      fecha: cambios.fecha === undefined ? actual.fecha : cambios.fecha,
    });
    if (!v.ok) return v;
    const clave = normalizarRamo(v.nombre);
    if (this.db.prepare("select 1 from evaluaciones where ramo_id = ? and clave = ? and id <> ?").get(actual.ramoId, clave, id)) return { ok: false, motivo: `Ya hay una evaluación «${v.nombre}» en ese ramo` };
    this.db.prepare("update evaluaciones set nombre = ?, clave = ?, peso = ?, nota = ?, fecha = ? where id = ?").run(v.nombre, clave, v.peso, v.nota, v.fecha, id);
    return { ok: true, evaluacion: this.obtener(id)! };
  }

  /** Pone la nota (o la deja pendiente con `null`). */
  ponerNota(id: number, nota: number | null): ResultadoEvaluacionGuardada {
    if (nota !== null && validarNota(nota) === null) return { ok: false, motivo: "La nota debe estar entre 1,0 y 7,0" };
    return this.editar(id, { nota });
  }

  borrar(id: number): boolean {
    return Number(this.db.prepare("delete from evaluaciones where id = ?").run(id).changes) > 0;
  }

  /** Borra las evaluaciones y los ajustes de un ramo (el ramo queda). */
  borrarDeRamo(ramoId: number): number {
    this.db.prepare("delete from notas_ramo where ramo_id = ?").run(ramoId);
    return Number(this.db.prepare("delete from evaluaciones where ramo_id = ?").run(ramoId).changes);
  }

  /** «Borrar todas» de «Lo que sé de ti». */
  borrarTodas(): number {
    this.db.exec("delete from notas_ramo");
    return Number(this.db.prepare("delete from evaluaciones").run().changes);
  }

  ajustes(ramoId: number): AjustesNotas {
    const f = this.db.prepare("select aprobacion, examen_peso, examen_minimo, presentacion_minima from notas_ramo where ramo_id = ?").get(ramoId) as
      | { aprobacion: number; examen_peso: number | null; examen_minimo: number | null; presentacion_minima: number | null }
      | undefined;
    if (!f) return { ...AJUSTES_POR_DEFECTO };
    return { aprobacion: f.aprobacion, examenPeso: f.examen_peso, examenMinimo: f.examen_minimo, presentacionMinima: f.presentacion_minima };
  }

  ponerAjustes(ramoId: number, entrada: unknown): { ok: true; ajustes: AjustesNotas } | { ok: false; motivo: string } {
    if (!this.existeRamo(ramoId)) return { ok: false, motivo: "Ese ramo no existe" };
    const v = validarAjustes(entrada);
    if (!v.ok) return v;
    const a = v.ajustes;
    this.db
      .prepare("insert or replace into notas_ramo (ramo_id, aprobacion, examen_peso, examen_minimo, presentacion_minima) values (?, ?, ?, ?, ?)")
      .run(ramoId, a.aprobacion, a.examenPeso, a.examenMinimo, a.presentacionMinima);
    return { ok: true, ajustes: a };
  }

  /** Cambia con cualquier alta, baja o cambio: el puente la mira para avisar a la isla (también lo que anota el MCP). */
  marca(): string {
    const e = this.db.prepare("select count(*) as n, coalesce(max(id), 0) as u, coalesce(sum(peso), 0) as p, coalesce(sum(nota), 0) as s, count(nota) as c, coalesce(sum(length(nombre) + coalesce(length(fecha), 0)), 0) as t from evaluaciones").get() as {
      n: number; u: number; p: number; s: number; c: number; t: number;
    };
    const a = this.db.prepare("select count(*) as n, coalesce(sum(aprobacion), 0) as a, coalesce(sum(coalesce(examen_peso, 0)), 0) as p, coalesce(sum(coalesce(examen_minimo, 0)), 0) as m, coalesce(sum(coalesce(presentacion_minima, 0)), 0) as q from notas_ramo").get() as {
      n: number; a: number; p: number; m: number; q: number;
    };
    return `${e.n}:${e.u}:${e.p}:${e.s}:${e.c}:${e.t}|${a.n}:${a.a}:${a.p}:${a.m}:${a.q}`;
  }

  private existeRamo(id: number): boolean {
    return this.db.prepare("select 1 from ramos where id = ?").get(id) !== undefined;
  }
}
