// Los gastos del usuario y el uso del motor, en una base SQLite local (node:sqlite, sin
// dependencias). Son datos financieros personales (Ley 21.719): quedan solo en este
// computador, en una carpeta que únicamente puede leer el usuario.

import { chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Categoria } from "./categorias.ts";
import type { Rango } from "./periodos.ts";

export interface Gasto {
  id: number;
  monto: number;
  categoria: Categoria;
  descripcion: string | null;
  fecha: Date;
}

export interface NuevoGasto {
  monto: number;
  categoria: Categoria;
  descripcion: string | null;
  fecha: Date;
}

/** Donde viven los gastos: la comparten el puente (motor de comandos) y el servidor MCP (agente). */
export const RUTA_BASE = join(homedir(), ".asistente-prototipo", "asistente.db");

/** Quién resolvió un pedido: el motor de plantillas (sin IA) o el agente. */
export type Via = "motor" | "agente";

interface FilaGasto {
  id: number;
  monto: number;
  categoria: string;
  descripcion: string | null;
  fecha_ms: number;
}

function desdeFila(fila: FilaGasto): Gasto {
  return {
    id: fila.id,
    monto: fila.monto,
    categoria: fila.categoria as Categoria,
    descripcion: fila.descripcion,
    fecha: new Date(fila.fecha_ms),
  };
}

export class Gastos {
  private readonly db: DatabaseSync;

  /** `ruta` es el archivo de la base, o ":memory:" para las pruebas. */
  constructor(ruta: string) {
    if (ruta !== ":memory:") mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(ruta);
    if (ruta !== ":memory:") chmodSync(ruta, 0o600);
    this.db.exec(`
      -- El puente y el servidor MCP abren la misma base: si uno escribe, el otro espera.
      pragma busy_timeout = 3000;
      create table if not exists gastos (
        id integer primary key,
        monto integer not null check (monto > 0),
        categoria text not null,
        descripcion text,
        fecha_ms integer not null
      );
      create index if not exists gastos_por_fecha on gastos (fecha_ms);
      -- Solo cuenta quién resolvió cada pedido; nunca guarda lo que escribió el usuario.
      create table if not exists uso (
        id integer primary key,
        fecha_ms integer not null,
        via text not null check (via in ('motor', 'agente')),
        intencion text
      );
    `);
  }

  agregar(gasto: NuevoGasto): Gasto {
    const resultado = this.db
      .prepare("insert into gastos (monto, categoria, descripcion, fecha_ms) values (?, ?, ?, ?)")
      .run(gasto.monto, gasto.categoria, gasto.descripcion, gasto.fecha.getTime());
    return { id: Number(resultado.lastInsertRowid), ...gasto };
  }

  /** Total y cantidad de gastos en un rango, opcionalmente de una categoría. */
  total(rango: Rango, categoria?: Categoria): { total: number; cantidad: number } {
    const fila = this.db
      .prepare(
        `select coalesce(sum(monto), 0) as total, count(*) as cantidad from gastos
         where fecha_ms >= ? and fecha_ms < ? and (? is null or categoria = ?)`,
      )
      .get(rango.desde.getTime(), rango.hasta.getTime(), categoria ?? null, categoria ?? null) as {
      total: number;
      cantidad: number;
    };
    return { total: fila.total, cantidad: fila.cantidad };
  }

  /** Total por categoría en un rango, de la que más gasta a la que menos. */
  porCategoria(rango: Rango): { categoria: Categoria; total: number; cantidad: number }[] {
    return this.db
      .prepare(
        `select categoria, sum(monto) as total, count(*) as cantidad from gastos
         where fecha_ms >= ? and fecha_ms < ? group by categoria order by total desc`,
      )
      .all(rango.desde.getTime(), rango.hasta.getTime()) as { categoria: Categoria; total: number; cantidad: number }[];
  }

  /** Los últimos gastos, del más reciente al más antiguo; con `rango`, solo los de ese rango. */
  ultimos(cantidad: number, rango?: Rango): Gasto[] {
    const filas = this.db
      .prepare(
        `select * from gastos where (? is null or (fecha_ms >= ? and fecha_ms < ?))
         order by fecha_ms desc, id desc limit ?`,
      )
      .all(
        rango ? 1 : null,
        rango?.desde.getTime() ?? 0,
        rango?.hasta.getTime() ?? 0,
        cantidad,
      ) as unknown as FilaGasto[];
    return filas.map(desdeFila);
  }

  /** Borra el último gasto anotado (para corregir un error). */
  borrarUltimo(): Gasto | null {
    const fila = this.db.prepare("select * from gastos order by id desc limit 1").get() as FilaGasto | undefined;
    if (!fila) return null;
    this.db.prepare("delete from gastos where id = ?").run(fila.id);
    return desdeFila(fila);
  }

  registrarUso(via: Via, intencion: string | null, fecha: Date): void {
    this.db.prepare("insert into uso (fecha_ms, via, intencion) values (?, ?, ?)").run(fecha.getTime(), via, intencion);
  }

  /** Cuántos pedidos resolvió cada vía: la métrica del motor que aprende (paso 7). */
  resumenUso(): Record<Via, number> {
    const filas = this.db.prepare("select via, count(*) as cantidad from uso group by via").all() as {
      via: Via;
      cantidad: number;
    }[];
    const resumen: Record<Via, number> = { motor: 0, agente: 0 };
    for (const fila of filas) resumen[fila.via] = fila.cantidad;
    return resumen;
  }

  cerrar(): void {
    this.db.close();
  }
}
