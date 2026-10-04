// La pestaña Agenda con el puente de verdad (sin OpenClaw ni calendarios): un recordatorio creado por
// frase aparece en su día, `fuentes` dice qué está conectado y lo apagado no entra.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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

function lanzar(raiz: string, activas: string[], apagadas: string[] = []) {
  const funciones = join(raiz, "funciones.json");
  writeFileSync(funciones, JSON.stringify({ activas: { ...Object.fromEntries(apagadas.map((f) => [f, false])), ...Object.fromEntries(activas.map((f) => [f, true])) } }));
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
  const cerrar = async () => {
    puente.stdin!.end();
    await new Promise((listo) => puente.once("exit", listo));
  };
  return { pedir, cerrar };
}

describe("pestaña Agenda en el puente", { skip: process.platform === "win32" }, () => {
  it("muestra el recordatorio de hoy y dice qué fuentes hay", async () => {
    const { pedir, cerrar } = lanzar(mkdtempSync(join(tmpdir(), "agenda-")), ["temporizadores", "calendario"]);
    try {
      const vacia = (await pedir({ tipo: "agenda-estado" })).datos;
      assert.deepEqual(vacia.dias, []);
      assert.equal(vacia.fuentes.temporizadores, true);
      assert.equal(vacia.fuentes.calendario, true);
      assert.equal(vacia.fuentes.aula, false);
      assert.equal(vacia.fuentes.ical, false);

      await pedir({ tipo: "enviar", texto: "recuérdame en 10 minutos sacar la ropa" });
      const { dias } = (await pedir({ tipo: "agenda-estado" })).datos;
      const items = dias.flatMap((d: any) => d.items);
      assert.equal(items.length, 1);
      assert.equal(items[0].tipo, "recordatorio");
      assert.match(items[0].titulo, /sacar la ropa/);
    } finally {
      await cerrar();
    }
  });

  it("con las funciones apagadas no entra nada y lo dice", async () => {
    const { pedir, cerrar } = lanzar(mkdtempSync(join(tmpdir(), "agenda-")), ["gastos"], ["calendario", "aula", "temporizadores"]);
    try {
      const { dias, fuentes } = (await pedir({ tipo: "agenda-estado" })).datos;
      assert.deepEqual(dias, []);
      assert.deepEqual([fuentes.calendario, fuentes.aula, fuentes.temporizadores], [false, false, false]);
    } finally {
      await cerrar();
    }
  });
});
