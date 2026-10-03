// Temporizadores, recordatorios y pomodoro. Viven en la misma base que los gastos, así que los
// crea igual la isla, el motor sin IA o el agente (por MCP), y sobreviven a un reinicio de Brote.
// El puente llama a `revisar` cada segundo: los que terminan se avisan, y el pomodoro pasa de
// estudio a descanso (y vuelta) solo.

import type { DatabaseSync } from "node:sqlite";
import type { Gastos } from "./gastos.ts";
import { UNIDADES, describirDuracion } from "./tiempo.ts";

export type TipoTemporizador = "temporizador" | "pomodoro";
export type Fase = "estudio" | "descanso";

export interface Temporizador {
  id: number;
  tipo: TipoTemporizador;
  /** Lo que se recuerda ("sacar la ropa") o lo que se estudia en un pomodoro. */
  etiqueta: string | null;
  fase: Fase | null;
  /** Cuántos bloques de estudio completos lleva el pomodoro. */
  ciclos: number;
  finMs: number;
  duracionMs: number;
}

/** Lo que pasó al revisar: la isla lo muestra y Brote celebra. */
export interface AvisoTemporizador {
  temporizador: Temporizador;
  texto: string;
}

/** El pomodoro clásico: 25 de estudio, 5 de descanso y uno largo de 15 cada 4 bloques. */
export const POMODORO = {
  estudioMs: 25 * UNIDADES.MINUTO,
  descansoMs: 5 * UNIDADES.MINUTO,
  descansoLargoMs: 15 * UNIDADES.MINUTO,
  bloquesHastaElLargo: 4,
};

interface Fila {
  id: number;
  tipo: TipoTemporizador;
  etiqueta: string | null;
  fase: Fase | null;
  ciclos: number;
  fin_ms: number;
  duracion_ms: number;
  estudio_ms: number | null;
}

function desdeFila(fila: Fila): Temporizador {
  return {
    id: fila.id,
    tipo: fila.tipo,
    etiqueta: fila.etiqueta,
    fase: fila.fase,
    ciclos: fila.ciclos,
    finMs: fila.fin_ms,
    duracionMs: fila.duracion_ms,
  };
}

export class Temporizadores {
  private readonly db: DatabaseSync;

  constructor(gastos: Gastos) {
    this.db = gastos.baseDeDatos();
    this.db.exec(`
      create table if not exists temporizadores (
        id integer primary key,
        tipo text not null check (tipo in ('temporizador', 'pomodoro')),
        etiqueta text,
        fase text check (fase in ('estudio', 'descanso')),
        ciclos integer not null default 0,
        fin_ms integer not null,
        duracion_ms integer not null,
        -- Pomodoro: cuánto dura cada bloque de estudio (el que se pidió, por ejemplo 30 min).
        estudio_ms integer,
        estado text not null default 'activo' check (estado in ('activo', 'terminado', 'cancelado'))
      );
    `);
  }

  /** Un temporizador (o recordatorio, si tiene etiqueta). */
  crear(duracionMs: number, etiqueta: string | null, ahora: Date): Temporizador {
    const fila = this.db
      .prepare(
        `insert into temporizadores (tipo, etiqueta, fin_ms, duracion_ms) values ('temporizador', ?, ?, ?)
         returning *`,
      )
      .get(etiqueta, ahora.getTime() + duracionMs, duracionMs) as unknown as Fila;
    return desdeFila(fila);
  }

  /** Empieza un pomodoro (solo hay uno a la vez: el anterior se cancela). */
  iniciarPomodoro(estudioMs: number, etiqueta: string | null, ahora: Date): Temporizador {
    this.db.prepare("update temporizadores set estado = 'cancelado' where tipo = 'pomodoro' and estado = 'activo'").run();
    const fila = this.db
      .prepare(
        `insert into temporizadores (tipo, etiqueta, fase, fin_ms, duracion_ms, estudio_ms)
         values ('pomodoro', ?, 'estudio', ?, ?, ?) returning *`,
      )
      .get(etiqueta, ahora.getTime() + estudioMs, estudioMs, estudioMs) as unknown as Fila;
    return desdeFila(fila);
  }

  /** Los que están corriendo, del que termina antes al que termina después. */
  activos(): Temporizador[] {
    const filas = this.db
      .prepare("select * from temporizadores where estado = 'activo' order by fin_ms")
      .all() as unknown as Fila[];
    return filas.map(desdeFila);
  }

  /** Cancela uno (por id), o todos los de un tipo, o todos. Devuelve cuántos. */
  cancelar(cual?: { id?: number; tipo?: TipoTemporizador }): number {
    const resultado = this.db
      .prepare(
        `update temporizadores set estado = 'cancelado'
         where estado = 'activo' and (? is null or id = ?) and (? is null or tipo = ?)`,
      )
      .run(cual?.id ?? null, cual?.id ?? null, cual?.tipo ?? null, cual?.tipo ?? null);
    return Number(resultado.changes);
  }

  /** Lo que terminó hasta `ahora`: temporizadores que avisan y pomodoros que cambian de fase. */
  revisar(ahora: Date): AvisoTemporizador[] {
    const vencidas = this.db
      .prepare("select * from temporizadores where estado = 'activo' and fin_ms <= ? order by fin_ms")
      .all(ahora.getTime()) as unknown as Fila[];
    const avisos: AvisoTemporizador[] = [];
    for (const fila of vencidas) {
      if (fila.tipo === "temporizador") {
        this.db.prepare("update temporizadores set estado = 'terminado' where id = ?").run(fila.id);
        const texto = fila.etiqueta
          ? `⏰ ¡Hora de ${fila.etiqueta}!`
          : `⏰ ¡Terminó tu temporizador de ${describirDuracion(fila.duracion_ms)}!`;
        avisos.push({ temporizador: desdeFila(fila), texto });
        continue;
      }
      // Pomodoro: estudio → descanso (largo cada 4) → estudio…
      const ciclos = fila.fase === "estudio" ? fila.ciclos + 1 : fila.ciclos;
      const aDescansar = fila.fase === "estudio";
      const largo = aDescansar && ciclos % POMODORO.bloquesHastaElLargo === 0;
      const duracion = aDescansar
        ? largo
          ? POMODORO.descansoLargoMs
          : POMODORO.descansoMs
        : (fila.estudio_ms ?? POMODORO.estudioMs);
      const actualizada = this.db
        .prepare("update temporizadores set fase = ?, ciclos = ?, fin_ms = ?, duracion_ms = ? where id = ? returning *")
        .get(aDescansar ? "descanso" : "estudio", ciclos, ahora.getTime() + duracion, duracion, fila.id) as unknown as Fila;
      const texto = aDescansar
        ? `🍅 ¡Bien! Llevas ${ciclos} ${ciclos === 1 ? "bloque" : "bloques"}. ${largo ? "Descanso largo" : "Descansa"} ${describirDuracion(duracion)} ☕`
        : `🍅 ¡A estudiar de nuevo! ${describirDuracion(duracion)}${fila.etiqueta ? ` de ${fila.etiqueta}` : ""} 🌱`;
      avisos.push({ temporizador: desdeFila(actualizada), texto });
    }
    return avisos;
  }
}
