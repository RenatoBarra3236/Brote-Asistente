// Los gastos del usuario y el uso del motor, en una base SQLite local (node:sqlite, sin
// dependencias). Son datos financieros personales (Ley 21.719): quedan solo en este
// computador, en una carpeta que únicamente puede leer el usuario.

import { chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Categoria } from "./categorias.ts";
import type { Rango } from "./periodos.ts";
import type { Intencion, Plantilla } from "./plantillas.ts";

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

/** Una plantilla que propuso el agente (paso 7: el motor que aprende). */
export interface PlantillaGuardada {
  id: number;
  patron: string;
  intencion: Intencion;
  /** La frase del usuario que la originó. */
  ejemplo: string;
  estado: "propuesta" | "activa" | "rechazada";
}

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
      -- Plantillas que propuso el agente; solo se usan cuando el usuario las acepta.
      create table if not exists plantillas (
        id integer primary key,
        patron text not null unique,
        intencion text not null,
        ejemplo text not null,
        estado text not null check (estado in ('propuesta', 'activa', 'rechazada')),
        creada_ms integer not null,
        decidida_ms integer
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

  /** Guarda una propuesta (o la reemplaza si había una pendiente con el mismo patrón). */
  proponerPlantilla(propuesta: { patron: string; intencion: Intencion; ejemplo: string }, fecha: Date): PlantillaGuardada {
    const resultado = this.db
      .prepare(
        `insert into plantillas (patron, intencion, ejemplo, estado, creada_ms) values (?, ?, ?, 'propuesta', ?)
         on conflict (patron) do update set intencion = excluded.intencion, ejemplo = excluded.ejemplo,
           creada_ms = excluded.creada_ms where estado = 'propuesta'
         returning id`,
      )
      .get(propuesta.patron, propuesta.intencion, propuesta.ejemplo, fecha.getTime()) as { id: number } | undefined;
    // Sin fila: el patrón ya estaba aceptado o rechazado (aprendizaje.ts lo revisa antes).
    if (!resultado) throw new Error(`La plantilla ya fue decidida: ${propuesta.patron}`);
    return { id: resultado.id, ...propuesta, estado: "propuesta" };
  }

  /** El estado de un patrón, si ya fue propuesto alguna vez. */
  estadoDePlantilla(patron: string): PlantillaGuardada["estado"] | null {
    const fila = this.db.prepare("select estado from plantillas where patron = ?").get(patron) as
      | { estado: PlantillaGuardada["estado"] }
      | undefined;
    return fila?.estado ?? null;
  }

  plantillasPropuestas(): PlantillaGuardada[] {
    return this.db
      .prepare("select id, patron, intencion, ejemplo, estado from plantillas where estado = 'propuesta' order by id")
      .all() as unknown as PlantillaGuardada[];
  }

  /** El usuario acepta o rechaza una propuesta. Devuelve `null` si ya no estaba pendiente. */
  decidirPlantilla(id: number, aceptar: boolean, fecha: Date): PlantillaGuardada | null {
    const fila = this.db
      .prepare(
        `update plantillas set estado = ?, decidida_ms = ? where id = ? and estado = 'propuesta'
         returning id, patron, intencion, ejemplo, estado`,
      )
      .get(aceptar ? "activa" : "rechazada", fecha.getTime(), id) as PlantillaGuardada | undefined;
    return fila ?? null;
  }

  /** Las plantillas aprendidas activas, con la frase que las originó (para "Lo que sé de ti"). */
  plantillasAprendidas(): PlantillaGuardada[] {
    return this.db
      .prepare("select id, patron, intencion, ejemplo, estado from plantillas where estado = 'activa' order by decidida_ms desc, id desc")
      .all() as unknown as PlantillaGuardada[];
  }

  /** Olvida una plantilla aprendida: el motor deja de usarla y no se vuelve a proponer. */
  olvidarPlantilla(id: number, fecha: Date): boolean {
    const resultado = this.db
      .prepare("update plantillas set estado = 'rechazada', decidida_ms = ? where id = ? and estado = 'activa'")
      .run(fecha.getTime(), id);
    return Number(resultado.changes) > 0;
  }

  /** Las plantillas aprendidas que el motor usa, en el orden en que se aceptaron. */
  plantillasActivas(): Plantilla[] {
    const filas = this.db
      .prepare("select id, patron, intencion from plantillas where estado = 'activa' order by decidida_ms, id")
      .all() as { id: number; patron: string; intencion: Intencion }[];
    return filas.map((f) => ({ id: `aprendida-${f.id}`, patron: f.patron, intencion: f.intencion, origen: "aprendida" }));
  }

  /** La conexión, para otros módulos que guardan en la misma base (temporizadores). */
  baseDeDatos(): DatabaseSync {
    return this.db;
  }

  cerrar(): void {
    this.db.close();
  }
}
