// Planes de estudio y sus bloques (A4 de docs/plan-estudio-y-mejoras.md). Tablas `planes_estudio` y
// `bloques_estudio` en la misma base que los gastos (permisos 600). Cálculos puros en `plan-estudio-tipos.ts`.
// Solo ramos, fechas y horas: nunca texto de clases. Un plan por evaluación; rehacerlo conserva lo hecho.

import type { DatabaseSync } from "node:sqlite";
import type { Gastos } from "./gastos.ts";
import type { Notas } from "./notas.ts";
import { MAX_PLANES, validarBloques } from "./plan-estudio-tipos.ts";
import { asegurarTablaEstudio, quitarRegistroDeBloque, registrarEstudio } from "./estadisticas.ts";
import type { BloqueDeAgenda, BloqueGuardado, BloquePlan, EstadoBloque, PlanEstudio, TipoBloque } from "./plan-estudio-tipos.ts";

/** Un plan cuya prueba ya pasó se va solo a los 7 días. */
const DIAS_DESPUES_DE_LA_PRUEBA = 7;

interface FilaPlan {
  id: number;
  ramo_id: number;
  evaluacion_id: number;
  prueba_ms: number;
  horas: number;
  calendario: number;
  creado_ms: number;
}
interface FilaBloque {
  id: number;
  plan_id: number;
  tipo: TipoBloque;
  inicio_ms: number;
  fin_ms: number;
  estado: EstadoBloque;
}

function bloqueDe(f: FilaBloque): BloqueGuardado {
  return { id: f.id, planId: f.plan_id, tipo: f.tipo, inicioMs: f.inicio_ms, finMs: f.fin_ms, estado: f.estado };
}

export type ResultadoCrearPlan = { ok: true; plan: PlanEstudio } | { ok: false; motivo: string };

export class PlanesEstudio {
  private readonly db: DatabaseSync;

  /** Recibe `Notas` para asegurar que existen las tablas `ramos` y `evaluaciones` (los triggers las necesitan). */
  constructor(gastos: Gastos, _notas: Notas) {
    this.db = gastos.baseDeDatos();
    asegurarTablaEstudio(this.db);
    this.db.exec(`
      create table if not exists planes_estudio (
        id integer primary key,
        ramo_id integer not null,
        evaluacion_id integer not null unique,
        prueba_ms integer not null,
        horas real not null,
        calendario integer not null default 0,
        creado_ms integer not null
      );
      create table if not exists bloques_estudio (
        id integer primary key,
        plan_id integer not null,
        tipo text not null check (tipo in ('temas', 'ejercicios', 'repaso-final')),
        inicio_ms integer not null,
        fin_ms integer not null,
        estado text not null default 'pendiente' check (estado in ('pendiente', 'hecho', 'saltado'))
      );
      -- Borrar un ramo o una evaluación borra su plan y sus bloques; archivar el ramo no cambia nada.
      create trigger if not exists ramos_borra_planes after delete on ramos begin
        delete from bloques_estudio where plan_id in (select id from planes_estudio where ramo_id = old.id);
        delete from planes_estudio where ramo_id = old.id;
      end;
      create trigger if not exists evaluaciones_borra_planes after delete on evaluaciones begin
        delete from bloques_estudio where plan_id in (select id from planes_estudio where evaluacion_id = old.id);
        delete from planes_estudio where evaluacion_id = old.id;
      end;
    `);
  }

  /**
   * Guarda el plan de una evaluación. Si ya había uno, lo reemplaza conservando los bloques ya hechos
   * (rehacer el plan no borra lo estudiado). Máximo 4 planes con la prueba por delante.
   */
  crear(ramoId: number, evaluacionId: number, pruebaMs: number, horas: number, bloques: unknown, calendario: boolean, ahoraMs: number): ResultadoCrearPlan {
    const v = validarBloques(bloques, ahoraMs, pruebaMs);
    if (!v.ok) return v;
    if (!this.db.prepare("select 1 from evaluaciones where id = ? and ramo_id = ?").get(evaluacionId, ramoId)) return { ok: false, motivo: "Esa evaluación no existe en ese ramo" };
    const existente = this.db.prepare("select id from planes_estudio where evaluacion_id = ?").get(evaluacionId) as { id: number } | undefined;
    if (!existente) {
      const activos = (this.db.prepare("select count(*) as n from planes_estudio where prueba_ms >= ?").get(ahoraMs) as { n: number }).n;
      if (activos >= MAX_PLANES) return { ok: false, motivo: `Ya tienes ${MAX_PLANES} planes activos: borra alguno primero` };
    }
    let planId: number;
    if (existente) {
      planId = existente.id;
      this.db.prepare("delete from bloques_estudio where plan_id = ? and estado <> 'hecho'").run(planId);
      this.db.prepare("update planes_estudio set prueba_ms = ?, horas = ?, calendario = ? where id = ?").run(pruebaMs, horas, calendario ? 1 : 0, planId);
    } else {
      const r = this.db
        .prepare("insert into planes_estudio (ramo_id, evaluacion_id, prueba_ms, horas, calendario, creado_ms) values (?, ?, ?, ?, ?, ?)")
        .run(ramoId, evaluacionId, pruebaMs, horas, calendario ? 1 : 0, ahoraMs);
      planId = Number(r.lastInsertRowid);
    }
    const insertar = this.db.prepare("insert into bloques_estudio (plan_id, tipo, inicio_ms, fin_ms) values (?, ?, ?, ?)");
    for (const b of v.bloques) insertar.run(planId, b.tipo, b.inicioMs, b.finMs);
    return { ok: true, plan: this.plan(planId) as PlanEstudio };
  }

  plan(id: number): PlanEstudio | null {
    const f = this.db.prepare("select id, ramo_id, evaluacion_id, prueba_ms, horas, calendario, creado_ms from planes_estudio where id = ?").get(id) as unknown as FilaPlan | undefined;
    return f ? this.conBloques(f) : null;
  }

  /** El plan de una evaluación, si lo hay. */
  planDe(evaluacionId: number): PlanEstudio | null {
    const f = this.db.prepare("select id, ramo_id, evaluacion_id, prueba_ms, horas, calendario, creado_ms from planes_estudio where evaluacion_id = ?").get(evaluacionId) as unknown as FilaPlan | undefined;
    return f ? this.conBloques(f) : null;
  }

  /** Los planes, el de la prueba más cercana primero. Los de hace más de 7 días se descartan antes. */
  planes(ahoraMs: number): PlanEstudio[] {
    this.podar(ahoraMs);
    const filas = this.db.prepare("select id, ramo_id, evaluacion_id, prueba_ms, horas, calendario, creado_ms from planes_estudio order by prueba_ms, id").all() as unknown as FilaPlan[];
    return filas.map((f) => this.conBloques(f));
  }

  private conBloques(f: FilaPlan): PlanEstudio {
    const bloques = this.db.prepare("select id, plan_id, tipo, inicio_ms, fin_ms, estado from bloques_estudio where plan_id = ? order by inicio_ms").all(f.id) as unknown as FilaBloque[];
    return { id: f.id, ramoId: f.ramo_id, evaluacionId: f.evaluacion_id, pruebaMs: f.prueba_ms, horas: f.horas, calendario: f.calendario === 1, creadoMs: f.creado_ms, bloques: bloques.map(bloqueDe) };
  }

  private podar(ahoraMs: number): void {
    const viejos = this.db.prepare("select id from planes_estudio where prueba_ms < ?").all(ahoraMs - DIAS_DESPUES_DE_LA_PRUEBA * 86_400_000) as { id: number }[];
    for (const { id } of viejos) this.borrarPlan(id);
  }

  /** Los bloques (no saltados) entre dos instantes, con su ramo, para la Agenda y los avisos. */
  bloquesEntre(desdeMs: number, hastaMs: number): BloqueDeAgenda[] {
    const filas = this.db
      .prepare(
        `select b.id, b.plan_id, b.tipo, b.inicio_ms, b.fin_ms, b.estado, p.ramo_id, e.nombre as evaluacion
         from bloques_estudio b join planes_estudio p on p.id = b.plan_id join evaluaciones e on e.id = p.evaluacion_id
         where b.fin_ms > ? and b.inicio_ms < ? and b.estado <> 'saltado' order by b.inicio_ms, b.id`,
      )
      .all(desdeMs, hastaMs) as unknown as (FilaBloque & { ramo_id: number; evaluacion: string })[];
    return filas.map((f) => ({ ...bloqueDe(f), ramoId: f.ramo_id, evaluacion: f.evaluacion }));
  }

  /** Cambia el estado de un bloque (hecho, saltado o de vuelta a pendiente). */
  marcar(bloqueId: number, estado: EstadoBloque): boolean {
    if (estado !== "pendiente" && estado !== "hecho" && estado !== "saltado") return false;
    const cambio = Number(this.db.prepare("update bloques_estudio set estado = ? where id = ?").run(estado, bloqueId).changes) > 0;
    if (!cambio) return false;
    // Un bloque «hecho» suma tiempo estudiado (con su horario); al desmarcarlo o saltarlo se quita (A5).
    if (estado === "hecho") {
      const b = this.db.prepare("select b.inicio_ms, b.fin_ms, p.ramo_id from bloques_estudio b join planes_estudio p on p.id = b.plan_id where b.id = ?").get(bloqueId) as { inicio_ms: number; fin_ms: number; ramo_id: number } | undefined;
      if (b) registrarEstudio(this.db, "bloque", bloqueId, b.inicio_ms, b.fin_ms, b.ramo_id);
    } else {
      quitarRegistroDeBloque(this.db, bloqueId);
    }
    return true;
  }

  /** Horas ya estudiadas de un plan (bloques hechos). */
  horasHechas(planId: number): number {
    const r = this.db.prepare("select coalesce(sum(fin_ms - inicio_ms), 0) as ms from bloques_estudio where plan_id = ? and estado = 'hecho'").get(planId) as { ms: number };
    return r.ms / 3_600_000;
  }

  /** Anota que los bloques del plan también se copiaron al Calendario del Mac. */
  marcarCalendario(planId: number): void {
    this.db.prepare("update planes_estudio set calendario = 1 where id = ?").run(planId);
  }

  /** Si al final no se pudo copiar ningún bloque al calendario, el plan deja de decir que está ahí. */
  desmarcarCalendario(planId: number): void {
    this.db.prepare("update planes_estudio set calendario = 0 where id = ?").run(planId);
  }

  // ---- Borrar (de verdad: es una base de datos; los eventos que ya estén en el calendario se borran a mano) ----

  borrarPlan(id: number): boolean {
    this.db.prepare("delete from bloques_estudio where plan_id = ?").run(id);
    return Number(this.db.prepare("delete from planes_estudio where id = ?").run(id).changes) > 0;
  }

  /** Todo lo de un ramo. Devuelve cuántos planes se fueron. */
  borrarDeRamo(ramoId: number): number {
    const ids = this.db.prepare("select id from planes_estudio where ramo_id = ?").all(ramoId) as { id: number }[];
    for (const { id } of ids) this.borrarPlan(id);
    return ids.length;
  }

  borrarTodo(): number {
    this.db.prepare("delete from bloques_estudio").run();
    return Number(this.db.prepare("delete from planes_estudio").run().changes);
  }

  /** Cambia con cualquier alta, baja o cambio de estado: el puente la mira para avisar a la isla (también lo que hace el MCP). */
  marca(): string {
    const p = this.db.prepare("select count(*) as n, coalesce(max(id), 0) as u, coalesce(sum(prueba_ms / 1000), 0) as s, coalesce(sum(calendario), 0) as c from planes_estudio").get() as { n: number; u: number; s: number; c: number };
    const b = this.db
      .prepare("select count(*) as n, coalesce(max(id), 0) as u, coalesce(sum(inicio_ms / 1000), 0) as s, coalesce(sum(case estado when 'hecho' then 2 when 'saltado' then 3 else 1 end), 0) as e from bloques_estudio")
      .get() as { n: number; u: number; s: number; e: number };
    return `${p.n}:${p.u}:${p.s}:${p.c}|${b.n}:${b.u}:${b.s}:${b.e}`;
  }
}

export type { BloquePlan };
