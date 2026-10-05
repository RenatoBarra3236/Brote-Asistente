// Propuestas de repaso, tarjetas y resúmenes aceptados (A3 de docs/plan-estudio-y-mejoras.md). Tablas
// `repaso_propuestas`, `tarjetas` y `resumenes` en la misma base que los gastos (permisos 600). Reglas
// puras en `repaso-tipos.ts`. Lo único del texto de la clase que persiste es lo que el usuario aceptó,
// ya en frases cortas del agente; la transcripción no se toca. Nada de esto va a registros ni a avisos.

import type { DatabaseSync } from "node:sqlite";
import type { Gastos } from "./gastos.ts";
import type { Ramos } from "./ramos.ts";
import { DIAS_PROPUESTA, inicioDelDia, siguienteEstado, validarDecision, validarKit } from "./repaso-tipos.ts";
import type { DecisionRepaso, Kit, PropuestaRepaso, Resultado, ResumenGuardado, Tarjeta, Tema, TipoTarjeta } from "./repaso-tipos.ts";

/** Tope de tarjetas guardadas: un repaso que nadie puede terminar no sirve. */
export const MAX_TARJETAS = 2000;
const FORMA_ID_GRABACION = /^\d{4}-\d{2}-\d{2}-\d{6}$/;

interface FilaTarjeta {
  id: number;
  grabacion: string;
  ramo_id: number | null;
  tipo: TipoTarjeta;
  frente: string;
  reverso: string;
  caja: number;
  proximo_ms: number;
  ultima_ms: number | null;
  aciertos: number;
  fallos: number;
}

const COLUMNAS = "id, grabacion, ramo_id, tipo, frente, reverso, caja, proximo_ms, ultima_ms, aciertos, fallos";

function desdeFila(f: FilaTarjeta): Tarjeta {
  return { id: f.id, grabacion: f.grabacion, ramoId: f.ramo_id, tipo: f.tipo, frente: f.frente, reverso: f.reverso, caja: f.caja, proximoMs: f.proximo_ms, ultimaMs: f.ultima_ms, aciertos: f.aciertos, fallos: f.fallos };
}

function clave(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function leerJson<T>(texto: string, porDefecto: T): T {
  try {
    return JSON.parse(texto) as T;
  } catch {
    return porDefecto;
  }
}

export type ResultadoProponer = { ok: true; temas: number; terminos: number; preguntas: number; rechazadas: string[]; ramoId: number | null } | { ok: false; motivo: string; rechazadas: string[] };
export type ResultadoDecidir = { ok: true; tarjetas: number; repetidas: number; temas: number } | { ok: false; motivo: string };

export class Repaso {
  private readonly db: DatabaseSync;

  /** Recibe `Ramos` para asegurar que su tabla existe (el trigger de borrado la necesita). */
  constructor(gastos: Gastos, _ramos: Ramos) {
    this.db = gastos.baseDeDatos();
    this.db.exec(`
      create table if not exists repaso_propuestas (
        grabacion text primary key,
        ramo_id integer,
        kit text not null,
        creada_ms integer not null
      );
      create table if not exists tarjetas (
        id integer primary key,
        grabacion text not null,
        ramo_id integer,
        tipo text not null check (tipo in ('termino', 'pregunta')),
        frente text not null,
        clave text not null,
        reverso text not null,
        caja integer not null default 1,
        proximo_ms integer not null,
        ultima_ms integer,
        aciertos integer not null default 0,
        fallos integer not null default 0,
        creada_ms integer not null,
        unique (grabacion, tipo, clave)
      );
      create table if not exists resumenes (
        id integer primary key,
        grabacion text not null unique,
        ramo_id integer,
        temas text not null,
        creado_ms integer not null
      );
      -- Borrar un ramo (desde «Lo que sé de ti») deja sus tarjetas y resúmenes «sin ramo»; archivarlo no cambia nada.
      create trigger if not exists ramos_suelta_repaso after delete on ramos begin
        update tarjetas set ramo_id = null where ramo_id = old.id;
        update resumenes set ramo_id = null where ramo_id = old.id;
        update repaso_propuestas set ramo_id = null where ramo_id = old.id;
      end;
    `);
  }

  // ---- Propuestas ---------------------------------------------------------------------------------

  /** Guarda lo que propuso el agente para una grabación (reemplaza una propuesta pendiente anterior). */
  proponer(grabacion: string, entrada: unknown, ramoId: number | null, ahoraMs: number): ResultadoProponer {
    if (!FORMA_ID_GRABACION.test(grabacion)) return { ok: false, motivo: "«grabacion» no es un id de grabación", rechazadas: [] };
    const v = validarKit(entrada);
    if (!v.ok) return { ok: false, motivo: v.motivo ?? "Nada que proponer", rechazadas: v.rechazadas };
    if (ramoId !== null && !this.existeRamo(ramoId)) ramoId = null;
    this.db
      .prepare("insert or replace into repaso_propuestas (grabacion, ramo_id, kit, creada_ms) values (?, ?, ?, ?)")
      .run(grabacion, ramoId, JSON.stringify(v.kit), ahoraMs);
    return { ok: true, temas: v.kit.temas.length, terminos: v.kit.glosario.length, preguntas: v.kit.preguntas.length, rechazadas: v.rechazadas, ramoId };
  }

  /** Las propuestas que esperan decisión (las de hace más de 14 días se descartan antes). */
  propuestas(ahoraMs: number): PropuestaRepaso[] {
    this.db.prepare("delete from repaso_propuestas where creada_ms < ?").run(inicioDelDia(ahoraMs, -DIAS_PROPUESTA));
    const filas = this.db.prepare("select grabacion, ramo_id, kit, creada_ms from repaso_propuestas order by creada_ms desc").all() as unknown as {
      grabacion: string; ramo_id: number | null; kit: string; creada_ms: number;
    }[];
    return filas.map((f) => ({ grabacion: f.grabacion, ramoId: f.ramo_id, kit: leerJson<Kit>(f.kit, { temas: [], glosario: [], preguntas: [] }), creadaMs: f.creada_ms }));
  }

  /** Acepta lo marcado: crea las tarjetas (con cualquier corrección del usuario) y guarda los temas. */
  decidir(grabacion: string, entrada: unknown, ahoraMs: number): ResultadoDecidir {
    const p = this.propuestas(ahoraMs).find((x) => x.grabacion === grabacion);
    if (!p) return { ok: false, motivo: "Esa propuesta ya no existe" };
    const v = validarDecision(entrada, p.kit);
    if (!v.ok) return v;
    const d: DecisionRepaso = v.decision;
    const ramoId = d.ramoId !== null && this.existeRamo(d.ramoId) ? d.ramoId : null;

    const nuevas: { tipo: TipoTarjeta; frente: string; reverso: string }[] = [];
    for (const i of d.glosario) {
      const t = d.glosarioEditado?.[i] ?? p.kit.glosario[i];
      nuevas.push({ tipo: "termino", frente: t.termino, reverso: t.definicion });
    }
    for (const i of d.preguntas) {
      const q = d.preguntasEditado?.[i] ?? p.kit.preguntas[i];
      nuevas.push({ tipo: "pregunta", frente: q.pregunta, reverso: q.respuesta });
    }
    const guardadas = (this.db.prepare("select count(*) as n from tarjetas").get() as { n: number }).n;
    if (guardadas + nuevas.length > MAX_TARJETAS) return { ok: false, motivo: `Tendrías más de ${MAX_TARJETAS} tarjetas: borra algunas primero` };

    let creadas = 0;
    let repetidas = 0;
    const insertar = this.db.prepare(
      "insert or ignore into tarjetas (grabacion, ramo_id, tipo, frente, clave, reverso, caja, proximo_ms, creada_ms) values (?, ?, ?, ?, ?, ?, 1, ?, ?)",
    );
    for (const n of nuevas) {
      const r = insertar.run(grabacion, ramoId, n.tipo, n.frente, clave(n.frente), n.reverso, inicioDelDia(ahoraMs), ahoraMs);
      if (Number(r.changes) > 0) creadas++;
      else repetidas++;
    }
    const temas = d.temas.map((i) => p.kit.temas[i]);
    if (temas.length > 0) this.guardarTemas(grabacion, ramoId, temas, ahoraMs);
    this.db.prepare("delete from repaso_propuestas where grabacion = ?").run(grabacion);
    return { ok: true, tarjetas: creadas, repetidas, temas: temas.length };
  }

  /** Descarta una propuesta sin aceptar nada. */
  descartar(grabacion: string): boolean {
    return Number(this.db.prepare("delete from repaso_propuestas where grabacion = ?").run(grabacion).changes) > 0;
  }

  /** Cambiar el ramo de una propuesta pendiente (el selector de la isla). */
  ponerRamoDePropuesta(grabacion: string, ramoId: number | null): boolean {
    if (ramoId !== null && !this.existeRamo(ramoId)) return false;
    return Number(this.db.prepare("update repaso_propuestas set ramo_id = ? where grabacion = ?").run(ramoId, grabacion).changes) > 0;
  }

  private guardarTemas(grabacion: string, ramoId: number | null, nuevos: Tema[], ahoraMs: number): void {
    const f = this.db.prepare("select temas from resumenes where grabacion = ?").get(grabacion) as { temas: string } | undefined;
    const actuales = f ? leerJson<Tema[]>(f.temas, []) : [];
    const vistos = new Set(actuales.map((t) => clave(t.titulo)));
    for (const t of nuevos) if (!vistos.has(clave(t.titulo))) actuales.push(t);
    this.db
      .prepare("insert into resumenes (grabacion, ramo_id, temas, creado_ms) values (?, ?, ?, ?) on conflict(grabacion) do update set temas = excluded.temas, ramo_id = excluded.ramo_id")
      .run(grabacion, ramoId, JSON.stringify(actuales), ahoraMs);
  }

  // ---- Lectura y repaso ---------------------------------------------------------------------------

  tarjetas(ramoId?: number | null): Tarjeta[] {
    const filas = (ramoId === undefined
      ? this.db.prepare(`select ${COLUMNAS} from tarjetas order by id`).all()
      : ramoId === null
        ? this.db.prepare(`select ${COLUMNAS} from tarjetas where ramo_id is null order by id`).all()
        : this.db.prepare(`select ${COLUMNAS} from tarjetas where ramo_id = ? order by id`).all(ramoId)) as unknown as FilaTarjeta[];
    return filas.map(desdeFila);
  }

  tarjeta(id: number): Tarjeta | null {
    const f = this.db.prepare(`select ${COLUMNAS} from tarjetas where id = ?`).get(id) as unknown as FilaTarjeta | undefined;
    return f ? desdeFila(f) : null;
  }

  resumenes(): ResumenGuardado[] {
    const filas = this.db.prepare("select id, grabacion, ramo_id, temas, creado_ms from resumenes order by creado_ms desc").all() as unknown as {
      id: number; grabacion: string; ramo_id: number | null; temas: string; creado_ms: number;
    }[];
    return filas.map((f) => ({ id: f.id, grabacion: f.grabacion, ramoId: f.ramo_id, temas: leerJson<Tema[]>(f.temas, []), creadoMs: f.creado_ms }));
  }

  /** Registra cómo le fue al usuario con una tarjeta y la manda a su próxima caja. */
  responder(id: number, resultado: Resultado, ahoraMs: number): Tarjeta | null {
    const t = this.tarjeta(id);
    if (!t) return null;
    const { caja, proximoMs } = siguienteEstado(t.caja, resultado, ahoraMs);
    this.db
      .prepare("update tarjetas set caja = ?, proximo_ms = ?, ultima_ms = ?, aciertos = aciertos + ?, fallos = fallos + ? where id = ?")
      .run(caja, proximoMs, ahoraMs, resultado === "sabia" ? 1 : 0, resultado === "no-sabia" ? 1 : 0, id);
    return this.tarjeta(id);
  }

  // ---- Borrar (de verdad: es una base de datos, no hay Papelera) ------------------------------------

  borrarTarjeta(id: number): boolean {
    return Number(this.db.prepare("delete from tarjetas where id = ?").run(id).changes) > 0;
  }

  /** Tarjetas, resumen y propuesta pendiente de una grabación. Devuelve cuántas filas se fueron. */
  borrarDeGrabacion(grabacion: string): number {
    return this.cuantas(
      this.db.prepare("delete from tarjetas where grabacion = ?").run(grabacion),
      this.db.prepare("delete from resumenes where grabacion = ?").run(grabacion),
      this.db.prepare("delete from repaso_propuestas where grabacion = ?").run(grabacion),
    );
  }

  /** Solo la propuesta pendiente (al borrar una transcripción las tarjetas aceptadas se quedan: son del usuario). */
  borrarPropuestaDe(grabacion: string): boolean {
    return Number(this.db.prepare("delete from repaso_propuestas where grabacion = ?").run(grabacion).changes) > 0;
  }

  /** Todas las propuestas pendientes (al borrar todas las transcripciones). */
  borrarPropuestas(): number {
    return Number(this.db.prepare("delete from repaso_propuestas").run().changes);
  }

  /** Todo lo de un ramo (`null` = lo que no tiene ramo). */
  borrarDeRamo(ramoId: number | null): number {
    const [t, r, p] = ramoId === null
      ? [this.db.prepare("delete from tarjetas where ramo_id is null").run(), this.db.prepare("delete from resumenes where ramo_id is null").run(), this.db.prepare("delete from repaso_propuestas where ramo_id is null").run()]
      : [this.db.prepare("delete from tarjetas where ramo_id = ?").run(ramoId), this.db.prepare("delete from resumenes where ramo_id = ?").run(ramoId), this.db.prepare("delete from repaso_propuestas where ramo_id = ?").run(ramoId)];
    return this.cuantas(t, r, p);
  }

  borrarTodo(): number {
    return this.cuantas(this.db.prepare("delete from tarjetas").run(), this.db.prepare("delete from resumenes").run(), this.db.prepare("delete from repaso_propuestas").run());
  }

  private cuantas(...r: { changes: number | bigint }[]): number {
    return r.reduce((a, x) => a + Number(x.changes), 0);
  }

  /** Cambia con cualquier alta, baja o repaso: el puente la mira para avisar a la isla (también lo que propone el MCP). */
  marca(): string {
    const t = this.db.prepare("select count(*) as n, coalesce(max(id), 0) as u, coalesce(sum(caja), 0) as c, coalesce(sum(proximo_ms / 1000), 0) as p, coalesce(sum(coalesce(ramo_id, 0)), 0) as r from tarjetas").get() as {
      n: number; u: number; c: number; p: number; r: number;
    };
    const q = this.db.prepare("select count(*) as n, coalesce(sum(creada_ms / 1000), 0) as s, coalesce(sum(coalesce(ramo_id, 0)), 0) as r from repaso_propuestas").get() as { n: number; s: number; r: number };
    const m = this.db.prepare("select count(*) as n, coalesce(sum(length(temas)), 0) as s from resumenes").get() as { n: number; s: number };
    return `${t.n}:${t.u}:${t.c}:${t.p}:${t.r}|${q.n}:${q.s}:${q.r}|${m.n}:${m.s}`;
  }

  private existeRamo(id: number): boolean {
    return this.db.prepare("select 1 from ramos where id = ?").get(id) !== undefined;
  }
}
