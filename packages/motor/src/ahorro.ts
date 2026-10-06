// Las metas de ahorro y sus aportes (docs/plan-estudio-y-mejoras.md, «Diseño de metas de ahorro»). Dos tablas en
// la misma base que los gastos (permisos 600). Es una libreta: guarda lo que el usuario dice que apartó; nunca
// mueve plata ni lee cuentas. Las reglas puras están en `ahorro-tipos.ts`.

import type { DatabaseSync } from "node:sqlite";
import type { Gastos } from "./gastos.ts";
import { formatearMonto } from "./texto.ts";
import { claveMeta, validarMetaAhorro, validarMontoAhorro, MAX_METAS_ACTIVAS, juntadoAhorro } from "./ahorro-tipos.ts";
import type { AporteAhorro, EstadoMeta, MetaAhorro } from "./ahorro-tipos.ts";

interface FilaMeta {
  id: number;
  nombre: string;
  clave: string;
  monto: number;
  limite_ms: number | null;
  creada_ms: number;
  estado: EstadoMeta;
}

function desdeFila(f: FilaMeta): MetaAhorro {
  return { id: f.id, nombre: f.nombre, monto: f.monto, limiteMs: f.limite_ms, creadaMs: f.creada_ms, estado: f.estado };
}

export const CLAVE_AVISOS_AHORRO = "avisos-ahorro";

export type ResultadoMeta = { ok: true; meta: MetaAhorro } | { ok: false; motivo: string };
export type ResultadoAporte = { ok: true; aporte: AporteAhorro; meta: MetaAhorro; juntado: number } | { ok: false; motivo: string };

export class Ahorro {
  private readonly db: DatabaseSync;
  private readonly gastos: Gastos;

  constructor(gastos: Gastos) {
    this.gastos = gastos;
    this.db = gastos.baseDeDatos();
    this.db.exec(`
      create table if not exists metas_ahorro (
        id integer primary key,
        nombre text not null,
        clave text not null,
        monto integer not null check (monto > 0),
        limite_ms integer,
        creada_ms integer not null,
        estado text not null check (estado in ('activa', 'cumplida', 'archivada'))
      );
      create table if not exists aportes_ahorro (
        id integer primary key,
        meta_id integer not null references metas_ahorro (id),
        monto integer not null check (monto != 0),
        ms integer not null
      );
      create index if not exists aportes_por_meta on aportes_ahorro (meta_id);
      -- Borrar una meta borra sus aportes.
      create trigger if not exists metas_ahorro_borra_aportes after delete on metas_ahorro begin
        delete from aportes_ahorro where meta_id = old.id;
      end;
    `);
  }

  /** Las metas que no están archivadas (con `todas`, también las archivadas), de la más antigua a la más nueva. */
  metas(todas = false): MetaAhorro[] {
    const filas = this.db.prepare(`select * from metas_ahorro ${todas ? "" : "where estado != 'archivada'"} order by id`).all() as unknown as FilaMeta[];
    return filas.map(desdeFila);
  }

  meta(id: number): MetaAhorro | null {
    const f = this.db.prepare("select * from metas_ahorro where id = ?").get(id) as FilaMeta | undefined;
    return f ? desdeFila(f) : null;
  }

  aportes(): AporteAhorro[] {
    const filas = this.db.prepare("select id, meta_id, monto, ms from aportes_ahorro order by ms, id").all() as { id: number; meta_id: number; monto: number; ms: number }[];
    return filas.map((f) => ({ id: f.id, metaId: f.meta_id, monto: f.monto, ms: f.ms }));
  }

  /** Crea una meta. Hasta 3 activas y sin repetir nombre entre las que no están archivadas. */
  crear(datos: { nombre?: unknown; monto?: unknown; limiteMs?: unknown }, ahoraMs: number): ResultadoMeta {
    const v = validarMetaAhorro(datos, ahoraMs);
    if (!v.ok) return { ok: false, motivo: v.motivo };
    const { nombre, monto, limiteMs } = v.valor;
    const abiertas = this.metas();
    if (abiertas.filter((m) => m.estado === "activa").length >= MAX_METAS_ACTIVAS) {
      return { ok: false, motivo: `Ya tienes ${MAX_METAS_ACTIVAS} metas de ahorro activas; archiva una para crear otra` };
    }
    const clave = claveMeta(nombre) || nombre.toLowerCase();
    if (abiertas.some((m) => (claveMeta(m.nombre) || m.nombre.toLowerCase()) === clave)) {
      return { ok: false, motivo: `Ya tienes una meta llamada «${nombre}»` };
    }
    const r = this.db.prepare("insert into metas_ahorro (nombre, clave, monto, limite_ms, creada_ms, estado) values (?, ?, ?, ?, ?, 'activa')").run(nombre, clave, monto, limiteMs, ahoraMs);
    return { ok: true, meta: { id: Number(r.lastInsertRowid), nombre, monto, limiteMs, creadaMs: ahoraMs, estado: "activa" } };
  }

  /** Anota un aporte (positivo) o un retiro (negativo, sin pasarse de lo juntado). */
  aportar(metaId: number, monto: number, ms: number): ResultadoAporte {
    const meta = this.meta(metaId);
    if (!meta || meta.estado === "archivada") return { ok: false, motivo: "Esa meta no existe" };
    const v = validarMontoAhorro(Math.abs(monto));
    if (!v.ok || !Number.isInteger(monto)) return { ok: false, motivo: v.ok ? "El monto tiene que ser un número entero" : v.motivo };
    const actual = juntadoAhorro(this.aportes().filter((a) => a.metaId === metaId), metaId);
    if (monto < 0 && -monto > actual) return { ok: false, motivo: `En «${meta.nombre}» solo hay ${formatearMonto(actual)} juntados; no puedo sacar más` };
    const r = this.db.prepare("insert into aportes_ahorro (meta_id, monto, ms) values (?, ?, ?)").run(metaId, monto, ms);
    const total = actual + monto;
    const estado: EstadoMeta = total >= meta.monto ? "cumplida" : "activa";
    if (estado !== meta.estado) this.db.prepare("update metas_ahorro set estado = ? where id = ?").run(estado, metaId);
    return { ok: true, aporte: { id: Number(r.lastInsertRowid), metaId, monto, ms }, meta: { ...meta, estado }, juntado: total };
  }

  /** Archiva (no borra): deja de mostrarse, y lo juntado sigue en «Lo que sé de ti». */
  archivar(id: number): boolean {
    return Number(this.db.prepare("update metas_ahorro set estado = 'archivada' where id = ? and estado != 'archivada'").run(id).changes) > 0;
  }

  /** Borra una meta y sus aportes de verdad. */
  borrar(id: number): boolean {
    return Number(this.db.prepare("delete from metas_ahorro where id = ?").run(id).changes) > 0;
  }

  borrarTodo(): number {
    this.db.prepare("delete from aportes_ahorro").run();
    return Number(this.db.prepare("delete from metas_ahorro").run().changes);
  }

  /** Cambia con cualquier alta, baja o aporte: el puente la mira para avisar a la isla (también lo que hace otro proceso). */
  marca(): string {
    const m = this.db.prepare("select count(*) as n, coalesce(max(id), 0) as u, coalesce(sum(case estado when 'activa' then 1 when 'cumplida' then 2 else 4 end), 0) as e from metas_ahorro").get() as { n: number; u: number; e: number };
    const a = this.db.prepare("select count(*) as n, coalesce(max(id), 0) as u, coalesce(sum(monto), 0) as s from aportes_ahorro").get() as { n: number; u: number; s: number };
    return `${m.n}:${m.u}:${m.e}:${a.n}:${a.u}:${a.s}`;
  }

  /** Lo ya celebrado (hitos por meta). */
  avisos(): string | null {
    return this.gastos.ajuste(CLAVE_AVISOS_AHORRO);
  }

  guardarAvisos(texto: string): void {
    this.gastos.guardarAjuste(CLAVE_AVISOS_AHORRO, texto);
  }
}
