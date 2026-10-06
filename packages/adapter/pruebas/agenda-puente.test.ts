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

  it("muestra las pruebas con fecha (hasta 35 días), y solo con Estudio prendido", async () => {
    const dia = (mas: number) => {
      const d = new Date(Date.now() + mas * 86_400_000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const { pedir, cerrar } = lanzar(mkdtempSync(join(tmpdir(), "agenda-")), ["estudio", "calendario"]);
    try {
      const ramo = (await pedir({ tipo: "ramo-crear", nombre: "Cálculo" })).datos;
      const una = await pedir({ tipo: "evaluacion-guardar", ramo: ramo.id, nombre: "Certamen 2", peso: 30, fecha: `${dia(30)} 15:00` });
      assert.equal(una.ok, true);
      await pedir({ tipo: "evaluacion-guardar", ramo: ramo.id, nombre: "Examen", peso: 40, fecha: dia(60) });
      const ya = await pedir({ tipo: "evaluacion-guardar", ramo: ramo.id, nombre: "Certamen 1", peso: 30, fecha: dia(2), nota: 5.5 });
      assert.equal(ya.ok, true);
      const items = (await pedir({ tipo: "agenda-estado" })).datos.dias.flatMap((d: any) => d.items);
      assert.deepEqual(items.map((i: any) => [i.tipo, i.titulo, i.todoElDia]), [["prueba", "Certamen 2 · Cálculo", false]], "la de 60 días queda fuera y la que ya tiene nota no es una prueba por venir");
      assert.equal(items[0].ramoId, ramo.id);
      // Archivar el ramo la saca.
      await pedir({ tipo: "ramo-archivar", ramo: ramo.id });
      assert.deepEqual((await pedir({ tipo: "agenda-estado" })).datos.dias, []);
    } finally {
      await cerrar();
    }
  });

  it("el resumen del día junta lo prendido y sale como pedido del puente", async () => {
    const { pedir, cerrar } = lanzar(mkdtempSync(join(tmpdir(), "agenda-")), ["gastos", "calendario"], ["estudio", "aula", "temporizadores"]);
    try {
      const vacio = (await pedir({ tipo: "resumen-dia" })).datos;
      assert.equal(vacio.hay, false);
      assert.match(vacio.texto, /^(Buenos días|Buenas tardes|Buenas noches)\. Hoy no veo nada agendado/);
      await pedir({ tipo: "presupuesto-poner", monto: 200_000 });
      const r = (await pedir({ tipo: "resumen-dia" })).datos;
      assert.equal(r.hay, true);
      assert.match(r.texto, /Puedes gastar \$[\d.]+ hoy \(llevas \$0 de \$200\.000 del mes\)/);
      assert.match(r.corto, /^☀️ Hoy: .*libres$/);
    } finally {
      await cerrar();
    }
  });

  it("con Estudio apagado no salen las pruebas", async () => {
    const { pedir, cerrar } = lanzar(mkdtempSync(join(tmpdir(), "agenda-")), ["calendario"], ["estudio"]);
    try {
      assert.deepEqual((await pedir({ tipo: "agenda-estado" })).datos.dias, []);
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
