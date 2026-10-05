// Los ramos de la pestaña Estudio, de punta a punta con el puente de verdad (sin OpenClaw): se crean por
// pedido o desde otro proceso (el MCP), se asignan a tareas y grabaciones, archivar no borra y borrar deja
// lo suyo «sin ramo».

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Gastos, Ramos, TareasAgenda } from "@asistente/motor";

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

describe("ramos en el puente", { skip: process.platform === "win32" }, () => {
  it("crea, avisa lo que hace otro proceso, asigna, archiva y borra", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "ramos-"));
    const funciones = join(raiz, "funciones.json");
    writeFileSync(funciones, JSON.stringify({ activas: { estudio: true, calendario: false, aula: false, grabaciones: false } }));
    mkdirSync(join(raiz, "transcripciones"), { recursive: true, mode: 0o700 });
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
    const ultimos = () => avisos.filter((a) => a.tipo === "ramos").at(-1)?.ramos as any[] | undefined;
    try {
      await esperarHasta(() => ultimos());
      assert.deepEqual(ultimos(), []);

      // Crear por pedido; lo repetido, lo inválido y el color raro se rechazan.
      const c = await pedir({ tipo: "ramo-crear", nombre: "Cálculo", alias: ["calc"] });
      assert.equal(c.ok, true);
      assert.equal((await pedir({ tipo: "ramo-crear", nombre: "calculo" })).ok, false);
      assert.equal((await pedir({ tipo: "ramo-crear", nombre: "x" })).ok, false);
      assert.equal((await pedir({ tipo: "ramo-crear", nombre: "Física", color: "fucsia" })).ok, false);
      await esperarHasta(() => (ultimos()?.length === 1 ? ultimos() : null));

      // Otro proceso (el servidor MCP) agrega uno: la isla se entera sola.
      const otro = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
      new Ramos(otro).crear({ nombre: "Historia del Arte" }, Date.now());
      otro.cerrar();
      const dos = await esperarHasta(() => (ultimos()?.length === 2 ? ultimos() : null));
      assert.deepEqual(dos!.map((r) => r.nombre).sort(), ["Cálculo", "Historia del Arte"]);
      const calculo = dos!.find((r) => r.nombre === "Cálculo");
      assert.notEqual(calculo.color, dos!.find((r) => r.nombre === "Historia del Arte").color, "colores distintos");

      // Editar.
      assert.equal((await pedir({ tipo: "ramo-editar", ramo: calculo.id, color: "rojo", alias: ["calc", "cal 2"] })).ok, true);
      assert.equal((await pedir({ tipo: "ramo-editar", ramo: calculo.id, nombre: "historia del arte" })).ok, false);
      assert.equal((await pedir({ tipo: "ramo-editar", ramo: "3" })).ok, false);

      // Asignar una tarea y una grabación; el estado trae su ficha.
      const tareas = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
      const t = new TareasAgenda(tareas).crearTarea("Guía 3", null, Date.now() + 5 * 3_600_000, null, Date.now());
      tareas.cerrar();
      assert.equal((await pedir({ tipo: "ramo-asignar", que: "tarea", ref: t.id, ramo: calculo.id })).ok, true);
      assert.equal((await pedir({ tipo: "ramo-asignar", que: "grabacion", ref: "2026-10-05-090000", ramo: calculo.id })).ok, true);
      assert.equal((await pedir({ tipo: "ramo-asignar", que: "cosa", ref: 1, ramo: calculo.id })).ok, false);
      assert.equal((await pedir({ tipo: "ramo-asignar", que: "tarea", ref: t.id, ramo: 999 })).ok, false);
      const estado = (await pedir({ tipo: "ramos-estado" })).datos;
      const ficha = estado.fichas.find((f: any) => f.ramo.id === calculo.id);
      assert.deepEqual(ficha.tareas.map((x: any) => x.titulo), ["Guía 3"]);
      assert.equal(ficha.transcripciones, 1);
      assert.equal(estado.ramoDeTarea[String(t.id)], calculo.id);

      // Archivar no borra: sale de la lista, pero lo suyo sigue enlazado.
      assert.equal((await pedir({ tipo: "ramo-archivar", ramo: calculo.id })).ok, true);
      await esperarHasta(() => (ultimos()?.length === 1 ? ultimos() : null));
      assert.equal((await pedir({ tipo: "ramo-archivar", ramo: calculo.id, archivado: false })).ok, true);
      await esperarHasta(() => (ultimos()?.length === 2 ? ultimos() : null));

      // Borrar es definitivo y deja lo suyo sin ramo.
      assert.equal((await pedir({ tipo: "ramo-borrar", ramo: calculo.id })).ok, true);
      assert.equal((await pedir({ tipo: "ramo-borrar", ramo: calculo.id })).ok, false);
      await esperarHasta(() => (ultimos()?.length === 1 ? ultimos() : null));
      const despues = (await pedir({ tipo: "ramos-estado" })).datos;
      assert.deepEqual(despues.ramoDeTarea, {});
    } finally {
      puente.stdin!.end();
      await new Promise((listo) => puente.once("exit", listo));
    }
  });

  it("con la función apagada no hay ramos ni se pueden crear", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "ramos-"));
    const funciones = join(raiz, "funciones.json");
    writeFileSync(funciones, JSON.stringify({ activas: { estudio: false } }));
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
    try {
      puente.stdin!.write(`${JSON.stringify({ id: "a", tipo: "ramo-crear", nombre: "Cálculo" })}\n`);
      const r = await esperarHasta(() => avisos.find((a) => a.tipo === "respuesta" && a.id === "a"));
      assert.equal(r.ok, false);
      puente.stdin!.write(`${JSON.stringify({ id: "b", tipo: "ramos-estado" })}\n`);
      const e = await esperarHasta(() => avisos.find((a) => a.tipo === "respuesta" && a.id === "b"));
      assert.deepEqual(e.datos.ramos, []);
      assert.equal(avisos.some((a) => a.tipo === "ramos" && a.ramos.length > 0), false);
    } finally {
      puente.stdin!.end();
      await new Promise((listo) => puente.once("exit", listo));
    }
  });
});
