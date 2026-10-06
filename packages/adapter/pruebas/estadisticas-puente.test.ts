// Las estadísticas de estudio (A5) de la pestaña Estudio, de punta a punta con el puente de verdad (sin OpenClaw), en una
// carpeta temporal: nunca con las tarjetas ni transcripciones reales del usuario.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { EstadisticasEstudio, Gastos, Ramos } from "@asistente/motor";

const PUENTE = fileURLToPath(new URL("../src/puente.ts", import.meta.url));

function esperarHasta<T>(condicion: () => T | undefined | null | false, ms = 8000): Promise<T> {
  return new Promise((listo, fallo) => {
    const limite = Date.now() + ms;
    const revisar = () => {
      const valor = condicion();
      if (valor) return listo(valor);
      if (Date.now() > limite) return fallo(new Error("se acabó el tiempo"));
      setTimeout(revisar, 50);
    };
    revisar();
  });
}

function lanzar(raiz: string, estudio: boolean) {
  const funciones = join(raiz, "funciones.json");
  writeFileSync(funciones, JSON.stringify({ activas: { estudio, calendario: false, aula: false, grabaciones: false, temporizadores: true } }));
  const { OPENCLAW_PROFILE: _p, ...resto } = process.env;
  const puente: ChildProcess = spawn(process.execPath, [PUENTE], {
    env: {
      ...resto,
      HOME: raiz,
      OPENCLAW_STATE_DIR: join(raiz, "sin-openclaw"),
      ASISTENTE_FUNCIONES: funciones,
      ASISTENTE_EQUIPO: join(raiz, "equipo.json"),
      ASISTENTE_PLAN: join(raiz, "plan.json"),
      ASISTENTE_PLAN_APP: join(raiz, "no-existe.json"),
      ASISTENTE_DESCARGAS: join(raiz, "descargas"),
      ASISTENTE_TRANSCRIPCIONES: join(raiz, "transcripciones"),
      ASISTENTE_GRABACIONES: join(raiz, "grabaciones"),
      ASISTENTE_GRABACIONES_AJUSTES: join(raiz, "grabaciones.json"),
    },
    stdio: ["pipe", "pipe", "ignore"],
  });
  const avisos: any[] = [];
  createInterface({ input: puente.stdout! }).on("line", (linea) => {
    try {
      avisos.push(JSON.parse(linea));
    } catch {
      // no es JSON
    }
  });
  let id = 0;
  const pedir = async (pedido: object): Promise<any> => {
    const mio = String(++id);
    puente.stdin!.write(`${JSON.stringify({ id: mio, ...pedido })}\n`);
    return esperarHasta(() => avisos.find((a) => a.tipo === "respuesta" && a.id === mio));
  };
  const estado = () => avisos.filter((a) => a.tipo === "estadisticas-estudio").at(-1) as { resumen: any } | undefined;
  const cerrar = async () => {
    puente.stdin!.end();
    await new Promise((listo) => puente.once("exit", listo));
  };
  return { pedir, estado, avisos, cerrar };
}

describe("estadísticas de estudio en el puente", { skip: process.platform === "win32" }, () => {
  it("anota por frase, responde sin IA, avisa lo de otro proceso y borra", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "estadisticas-"));
    const p = lanzar(raiz, true);
    try {
      await esperarHasta(() => p.estado());
      assert.equal(p.estado()!.resumen.hay, false);
      const ramo = (await p.pedir({ tipo: "ramo-crear", nombre: "Cálculo" })).datos;

      // Anotar por frase (sin IA) y verlo en el aviso.
      const anota = await p.pedir({ tipo: "enviar", texto: "estudié 2 horas de cálculo" });
      assert.equal(anota.local.intencion, "estudio-anotar");
      const aviso = await esperarHasta(() => (p.estado()!.resumen.totalMin === 120 ? p.estado() : undefined));
      assert.equal(aviso!.resumen.hoyMin, 120);
      // Las 8 semanas viajan en el mismo aviso: la última es la actual y trae lo mismo que el total de la semana.
      assert.equal(aviso!.resumen.semanas.length, 8);
      assert.equal(aviso!.resumen.semanas.at(-1).totalMin, 120);
      assert.deepEqual(aviso!.resumen.semanas.at(-1).porRamo, [{ ramoId: ramo.id, min: 120 }]);
      assert.deepEqual(aviso!.resumen.porRamo.map((r: any) => [r.ramoId, r.min]), [[ramo.id, 120]]);
      assert.match((await p.pedir({ tipo: "enviar", texto: "¿cuánto he estudiado hoy?" })).local.texto, /Hoy llevas 2 h estudiados/);
      assert.match((await p.pedir({ tipo: "enviar", texto: "¿cuál es mi racha?" })).local.texto, /Llevas 1 día seguido/);

      // Otro proceso (el pomodoro por MCP, un bloque hecho…) suma tiempo: la isla se entera sola.
      const gastos = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
      new EstadisticasEstudio(gastos, new Ramos(gastos)).anotarManual(30, null, Date.now(), Date.now());
      gastos.baseDeDatos().close();
      await esperarHasta(() => (p.estado()!.resumen.totalMin === 150 ? true : null));

      // «Lo que sé de ti» y los borrados.
      const todo = (await p.pedir({ tipo: "estadisticas-todo" })).datos;
      assert.equal(todo.resumen.totalHistoricoMin, 150);
      assert.equal((await p.pedir({ tipo: "estadisticas-borrar", que: "raro" })).ok, false);
      assert.equal((await p.pedir({ tipo: "estadisticas-borrar", que: "ramo", ramo: ramo.id })).datos.borrados, 1);
      await esperarHasta(() => (p.estado()!.resumen.totalMin === 30 ? true : null));
      assert.equal((await p.pedir({ tipo: "estadisticas-borrar", que: "todo" })).datos.borrados, 1);
      await esperarHasta(() => (p.estado()!.resumen.hay === false ? true : null));
    } finally {
      await p.cerrar();
    }
  });

  it("con la función apagada no hay estado ni frases, pero lo guardado se ve y se borra", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "estadisticas-"));
    const gastos = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
    const e = new EstadisticasEstudio(gastos, new Ramos(gastos));
    e.anotarManual(45, null, Date.now(), Date.now());
    gastos.baseDeDatos().close();
    const p = lanzar(raiz, false);
    try {
      assert.equal((await p.pedir({ tipo: "estadisticas-estado" })).datos.resumen.hay, false);
      assert.match((await p.pedir({ tipo: "enviar", texto: "¿cuánto he estudiado hoy?" })).local.texto, /Eso está apagado/);
      assert.equal((await p.pedir({ tipo: "estadisticas-todo" })).datos.resumen.totalHistoricoMin, 45);
      assert.equal((await p.pedir({ tipo: "estadisticas-borrar", que: "todo" })).datos.borrados, 1);
      assert.equal((await p.pedir({ tipo: "estadisticas-todo" })).datos.resumen.hay, false);
    } finally {
      await p.cerrar();
    }
  });
});
