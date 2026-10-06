// Las metas de ahorro de punta a punta con el puente de verdad (sin OpenClaw): crear por frase y por pedido,
// aportar, los hitos festejados una sola vez, lo que anota otro proceso (el MCP), archivar y borrar.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Ahorro, Gastos } from "@asistente/motor";

const PUENTE = fileURLToPath(new URL("../src/puente.ts", import.meta.url));

function esperarHasta<T>(condicion: () => T | undefined | null | false, ms = 8000): Promise<T> {
  const donde = new Error("se acabó el tiempo");
  return new Promise((listo, fallo) => {
    const limite = Date.now() + ms;
    const revisar = () => {
      const valor = condicion();
      if (valor) return listo(valor);
      if (Date.now() > limite) return fallo(donde);
      setTimeout(revisar, 50);
    };
    revisar();
  });
}

function lanzar(raiz: string, activas: Record<string, boolean>) {
  const funciones = join(raiz, "funciones.json");
  writeFileSync(funciones, JSON.stringify({ activas }));
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
  return { avisos, pedir, cerrar };
}

describe("metas de ahorro en el puente", { skip: process.platform === "win32" }, () => {
  it("crea, aporta, festeja cada hito una vez, nota lo que anota otro proceso, archiva y borra", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "ahorro-"));
    const { avisos, pedir, cerrar } = lanzar(raiz, { gastos: true });
    const ultimo = () => avisos.filter((a) => a.tipo === "ahorro").at(-1)?.ahorro;
    const celebraciones = () => avisos.filter((a) => a.tipo === "celebracion" && a.motivo === "ahorro");
    try {
      await esperarHasta(() => avisos.some((a) => a.tipo === "ahorro"));
      assert.equal(ultimo().metas.length, 0);
      assert.equal((await pedir({ tipo: "ahorro-estado" })).datos.metas.length, 0);

      // Pedidos inválidos.
      assert.equal((await pedir({ tipo: "ahorro-crear", nombre: "X", monto: 10 })).ok, false);
      assert.equal((await pedir({ tipo: "ahorro-crear", nombre: "X", monto: "150000" })).ok, false);
      assert.equal((await pedir({ tipo: "ahorro-crear", nombre: "X", monto: 150_000, limiteMs: 5 })).ok, false);
      assert.equal((await pedir({ tipo: "ahorro-aportar", meta: "uno", monto: 5000 })).ok, false);
      assert.equal((await pedir({ tipo: "ahorro-aportar", meta: 99, monto: 5000 })).ok, false);
      assert.equal((await pedir({ tipo: "ahorro-borrar", meta: "todas" })).ok, false);

      // Por frase (sin IA) y por pedido.
      const frase = await pedir({ tipo: "enviar", texto: "quiero juntar 150 lucas para el viaje" });
      assert.match(frase.local.texto, /meta «Viaje»: \$150\.000/);
      await esperarHasta(() => ultimo()?.metas.length === 1);
      const creada = await pedir({ tipo: "ahorro-crear", nombre: "Notebook", monto: 500_000, limiteMs: Date.now() + 120 * 86_400_000 });
      assert.equal(creada.ok, true);
      assert.equal(creada.datos.metas.length, 2);
      assert.ok(creada.datos.metas[1].cuotaMensual > 0);
      assert.equal((await pedir({ tipo: "ahorro-crear", nombre: "notebook", monto: 100_000 })).ok, false, "nombre repetido");

      // Aportes: 40 mil de 150 mil = 26 % → festeja el cuarto, una sola vez.
      const aporte = await pedir({ tipo: "enviar", texto: "aparté 40 lucas para el viaje" });
      assert.match(aporte.local.texto, /Anotado: \$40\.000 para «Viaje»/);
      const primera = await esperarHasta(() => celebraciones()[0]);
      assert.match(primera.texto, /Un cuarto de «Viaje»/);
      await new Promise((listo) => setTimeout(listo, 2500));
      assert.equal(celebraciones().length, 1);

      // Un aporte grande cruza dos hitos: festeja solo el más alto.
      const viaje = ultimo().metas.find((p: any) => p.meta.nombre === "Viaje").meta.id;
      await pedir({ tipo: "ahorro-aportar", meta: viaje, monto: 70_000 }); // 110.000 = 73 %
      await esperarHasta(() => celebraciones().length === 2);
      assert.match(celebraciones()[1].texto, /Mitad de «Viaje»/);
      const cumplir = await pedir({ tipo: "ahorro-aportar", meta: viaje, monto: 50_000 });
      assert.equal(cumplir.datos.metas.find((p: any) => p.meta.id === viaje).cumplida, true);
      await esperarHasta(() => celebraciones().some((c) => /Meta «Viaje» cumplida/.test(c.texto)));
      assert.equal((await pedir({ tipo: "ahorro-aportar", meta: viaje, monto: -500_000 })).ok, false, "no se saca más de lo juntado");

      // Lo que anota otro proceso (el MCP, la libreta compartida) aparece solo.
      const otro = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
      const libreta = new Ahorro(otro);
      const notebook = libreta.metas().find((m) => m.nombre === "Notebook")!;
      libreta.aportar(notebook.id, 20_000, Date.now());
      otro.cerrar();
      await esperarHasta(() => ultimo()?.metas.find((p: any) => p.meta.id === notebook.id)?.juntado === 20_000);

      // «Lo que sé de ti»: todo, con las archivadas; archivar no borra; borrar es definitivo.
      assert.equal((await pedir({ tipo: "ahorro-archivar", meta: notebook.id })).ok, true);
      assert.equal(ultimo().metas.some((p: any) => p.meta.id === notebook.id), false);
      const todo = (await pedir({ tipo: "ahorro-todo" })).datos;
      assert.equal(todo.metas.length, 2);
      assert.equal(todo.aportes.length, 4); // 40.000 + 70.000 + 50.000 + los 20.000 del otro proceso (el retiro de más se rechazó)
      assert.equal((await pedir({ tipo: "ahorro-borrar", meta: notebook.id })).datos.borrados, 1);
      assert.equal((await pedir({ tipo: "ahorro-borrar", meta: null })).datos.borrados, 1);
      assert.deepEqual((await pedir({ tipo: "ahorro-todo" })).datos, { metas: [], aportes: [] });
    } finally {
      await cerrar();
    }
  });

  it("con los gastos apagados no se crea ni se aporta, pero lo guardado se puede ver y borrar", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "ahorro-"));
    // Una meta que ya existía (de cuando la función estaba prendida).
    const g = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
    new Ahorro(g).crear({ nombre: "Viaje", monto: 100_000 }, Date.now());
    g.cerrar();
    const { pedir, cerrar } = lanzar(raiz, { gastos: false, temporizadores: true });
    try {
      assert.equal((await pedir({ tipo: "ahorro-estado" })).datos, null);
      assert.equal((await pedir({ tipo: "ahorro-crear", nombre: "Otra", monto: 50_000 })).ok, false);
      assert.equal((await pedir({ tipo: "ahorro-aportar", meta: 1, monto: 5000 })).ok, false);
      const frase = await pedir({ tipo: "enviar", texto: "quiero juntar 150 lucas para marzo" });
      assert.match(frase.local.texto, /apagado/);
      assert.equal((await pedir({ tipo: "ahorro-todo" })).datos.metas.length, 1);
      assert.equal((await pedir({ tipo: "ahorro-borrar", meta: null })).datos.borrados, 1);
    } finally {
      await cerrar();
    }
  });
});
