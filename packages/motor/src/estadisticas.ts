// Registro del tiempo estudiado (A5 de docs/plan-estudio-y-mejoras.md). Tabla `estudio_registro` en la misma
// base que los gastos (permisos 600). Quien estudia escribe aquí: `Temporizadores` al terminar o cancelar un
// bloque de pomodoro, `PlanesEstudio` al marcar un bloque «hecho», y el usuario cuando anota horas a mano.
// Los cálculos puros están en `estadisticas-tipos.ts`. Solo tiempos y ramos: nunca texto de clases.

import type { DatabaseSync } from "node:sqlite";
import type { Gastos } from "./gastos.ts";
import { leerAvisosEstudio, type AvisosEstudio } from "./estadisticas-metas.ts";
import { validarMeta } from "./estadisticas-tipos.ts";
import type { Ramos } from "./ramos.ts";
import { AVISO_DIA_MIN, minutosPorDia, validarMinutosManual } from "./estadisticas-tipos.ts";
import type { FuenteRegistro, RegistroEstudio } from "./estadisticas-tipos.ts";

const CLAVE_META = "meta-estudio-min";
const CLAVE_AVISOS = "avisos-estudio";
const META_MIN_MIN = 60;

/** Crea la tabla (la usan también `Temporizadores` y `PlanesEstudio`, que pueden construirse antes). */
export function asegurarTablaEstudio(db: DatabaseSync): void {
  db.exec(`
    create table if not exists estudio_registro (
      id integer primary key,
      inicio_ms integer not null,
      fin_ms integer not null,
      ramo_id integer,
      fuente text not null check (fuente in ('pomodoro', 'bloque', 'manual')),
      ref integer,
      unique (fuente, ref, inicio_ms)
    );
  `);
}

/** Anota un rato estudiado. Con la misma fuente, referencia e inicio no se cuenta dos veces. */
export function registrarEstudio(db: DatabaseSync, fuente: FuenteRegistro, ref: number | null, inicioMs: number, finMs: number, ramoId: number | null): void {
  if (!(finMs > inicioMs)) return;
  db.prepare("insert or ignore into estudio_registro (inicio_ms, fin_ms, ramo_id, fuente, ref) values (?, ?, ?, ?, ?)").run(inicioMs, finMs, ramoId, fuente, ref);
}

/** Quita lo que un bloque «hecho» había sumado (al desmarcarlo). */
export function quitarRegistroDeBloque(db: DatabaseSync, bloqueId: number): void {
  db.prepare("delete from estudio_registro where fuente = 'bloque' and ref = ?").run(bloqueId);
}

interface Fila {
  id: number;
  inicio_ms: number;
  fin_ms: number;
  ramo_id: number | null;
  fuente: FuenteRegistro;
}

export type ResultadoAnotar = { ok: true; registro: RegistroEstudio; avisoDia: boolean } | { ok: false; motivo: string };

export class EstadisticasEstudio {
  private readonly db: DatabaseSync;
  private readonly gastos: Gastos;

  /** Recibe `Ramos` para asegurar que su tabla existe (el trigger de borrado la necesita). */
  constructor(gastos: Gastos, _ramos: Ramos) {
    this.gastos = gastos;
    this.db = gastos.baseDeDatos();
    asegurarTablaEstudio(this.db);
    this.db.exec(`
      -- Borrar un ramo deja su tiempo estudiado «sin ramo» (no se pierde); archivarlo no cambia nada.
      create trigger if not exists ramos_suelta_estudio after delete on ramos begin
        update estudio_registro set ramo_id = null where ramo_id = old.id;
      end;
    `);
  }

  /** La meta semanal de estudio en minutos, o `null` si no hay (tabla `ajustes`, como el presupuesto). */
  meta(): number | null {
    const v = Number(this.gastos.ajuste(CLAVE_META));
    return Number.isFinite(v) && v >= META_MIN_MIN ? Math.round(v) : null;
  }

  /** Pone la meta semanal (o la quita con `null`). */
  ponerMeta(minutos: unknown): { ok: true; minutos: number | null } | { ok: false; motivo: string } {
    if (minutos === null) {
      this.db.prepare("delete from ajustes where clave = ?").run(CLAVE_META);
      return { ok: true, minutos: null };
    }
    const v = validarMeta(minutos);
    if (!v.ok) return v;
    this.gastos.guardarAjuste(CLAVE_META, String(v.minutos));
    return { ok: true, minutos: v.minutos };
  }

  /** Lo ya celebrado (meta de una semana y hitos de racha), para no repetirlo. */
  avisos(): AvisosEstudio | null {
    return leerAvisosEstudio(this.gastos.ajuste(CLAVE_AVISOS));
  }

  guardarAvisos(avisos: AvisosEstudio): void {
    this.gastos.guardarAjuste(CLAVE_AVISOS, JSON.stringify(avisos));
  }

  registros(): RegistroEstudio[] {
    const filas = this.db.prepare("select id, inicio_ms, fin_ms, ramo_id, fuente from estudio_registro order by inicio_ms, id").all() as unknown as Fila[];
    return filas.map((f) => ({ id: f.id, inicioMs: f.inicio_ms, finMs: f.fin_ms, ramoId: f.ramo_id, fuente: f.fuente }));
  }

  /**
   * «Estudié 2 horas de cálculo». Si es de hoy termina ahora (o antes, si no cabe en el día); si es de otro día,
   * parte a las 12:00. Avisa (sin impedirlo) si ese día pasa de 16 horas.
   */
  anotarManual(minutos: unknown, ramoId: number | null, diaMs: number, ahoraMs: number): ResultadoAnotar {
    const v = validarMinutosManual(minutos);
    if (!v.ok) return v;
    if (ramoId !== null && !this.db.prepare("select 1 from ramos where id = ?").get(ramoId)) return { ok: false, motivo: "Ese ramo no existe" };
    if (!Number.isFinite(diaMs) || diaMs > ahoraMs) return { ok: false, motivo: "No se puede anotar estudio del futuro" };
    const f = new Date(diaMs);
    const dia = new Date(f.getFullYear(), f.getMonth(), f.getDate()).getTime();
    const hoy = new Date(new Date(ahoraMs).getFullYear(), new Date(ahoraMs).getMonth(), new Date(ahoraMs).getDate()).getTime();
    const duracion = v.minutos * 60_000;
    const inicioMs = dia === hoy ? Math.max(dia, ahoraMs - duracion) : new Date(f.getFullYear(), f.getMonth(), f.getDate(), 12).getTime();
    const r = this.db.prepare("insert into estudio_registro (inicio_ms, fin_ms, ramo_id, fuente, ref) values (?, ?, ?, 'manual', null) returning id").get(inicioMs, inicioMs + duracion, ramoId) as { id: number };
    const registro: RegistroEstudio = { id: r.id, inicioMs, finMs: inicioMs + duracion, ramoId, fuente: "manual" };
    const delDia = minutosPorDia(this.registros(), dia, 1)[0];
    return { ok: true, registro, avisoDia: delDia > AVISO_DIA_MIN };
  }

  borrarRegistro(id: number): boolean {
    return Number(this.db.prepare("delete from estudio_registro where id = ?").run(id).changes) > 0;
  }

  /** Todo el tiempo de un ramo (`null` = el que no tiene ramo). Devuelve cuántos registros. */
  borrarDeRamo(ramoId: number | null): number {
    const r = ramoId === null ? this.db.prepare("delete from estudio_registro where ramo_id is null").run() : this.db.prepare("delete from estudio_registro where ramo_id = ?").run(ramoId);
    return Number(r.changes);
  }

  borrarTodo(): number {
    return Number(this.db.prepare("delete from estudio_registro").run().changes);
  }

  /** Cambia con cualquier alta o baja: el puente la mira para avisar a la isla (también lo que hace el pomodoro o el MCP). */
  marca(): string {
    const r = this.db.prepare("select count(*) as n, coalesce(max(id), 0) as u, coalesce(sum((fin_ms - inicio_ms) / 1000), 0) as s, coalesce(sum(coalesce(ramo_id, 0)), 0) as r from estudio_registro").get() as { n: number; u: number; s: number; r: number };
    return `${r.n}:${r.u}:${r.s}:${r.r}:${this.gastos.ajuste(CLAVE_META) ?? ""}`;
  }
}
