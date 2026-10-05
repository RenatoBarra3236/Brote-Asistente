// Las notas de la pestaña Estudio, de punta a punta con el puente de verdad (sin OpenClaw), en una
// carpeta temporal: nunca con las notas reales del usuario.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Gastos, Notas, Ramos } from "@asistente/motor";

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
  writeFileSync(funciones, JSON.stringify({ activas: { estudio, calendario: false, aula: false, grabaciones: false } }));
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
  const fichas = () => avisos.filter((a) => a.tipo === "notas").at(-1)?.fichas as any[] | undefined;
  const cerrar = async () => {
    puente.stdin!.end();
    await new Promise((listo) => puente.once("exit", listo));
  };
  return { pedir, fichas, avisos, cerrar };
}

describe("notas en el puente", { skip: process.platform === "win32" }, () => {
  it("define, anota por frase sin IA, avisa lo de otro proceso, ajusta y borra", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "notas-"));
    const p = lanzar(raiz, true);
    try {
      await esperarHasta(() => p.fichas());
      assert.deepEqual(p.fichas(), []);
      const ramo = (await p.pedir({ tipo: "ramo-crear", nombre: "Cálculo" })).datos;

      // Por frase, sin IA: define las evaluaciones y anota una nota.
      const def = await p.pedir({ tipo: "enviar", texto: "evaluaciones de cálculo: certamen 1 30%, certamen 2 70%" });
      assert.equal(def.local.intencion, "notas-evaluaciones");
      const anota = await p.pedir({ tipo: "enviar", texto: "me saqué 4,2 en el certamen 1 de cálculo" });
      assert.match(anota.local.texto, /4,2/);
      const ficha = await esperarHasta(() => p.fichas()?.find((f) => f.calculo.promedio === 4.2));
      assert.equal(ficha.evaluaciones.length, 2);
      assert.equal(ficha.calculo.veredicto, "alcanza");

      // «con 4,2 …» solo calcula y no guarda.
      const calc = await p.pedir({ tipo: "enviar", texto: "con 5 en el certamen 2 cuánto necesito en el certamen 2 de cálculo" });
      assert.equal(calc.local.intencion, "notas-necesaria");

      // Otro proceso (el MCP) anota una nota: la isla se entera sola.
      const gastos = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
      const notas = new Notas(gastos, new Ramos(gastos));
      const certamen2 = notas.listar(ramo.id).find((e) => e.nombre === "certamen 2")!;
      notas.ponerNota(certamen2.id, 5);
      await esperarHasta(() => p.fichas()?.find((f) => f.calculo.pesoPendiente === 0));

      // Pedidos de la isla: ajustes, editar y rechazos.
      assert.equal((await p.pedir({ tipo: "notas-ajustes", ramo: ramo.id, aprobacion: 5, examenPeso: 30 })).ok, true);
      assert.equal((await p.pedir({ tipo: "notas-ajustes", ramo: ramo.id, aprobacion: 9 })).ok, false);
      assert.equal((await p.pedir({ tipo: "evaluacion-guardar", evaluacion: certamen2.id, nota: 8 })).ok, false);
      assert.equal((await p.pedir({ tipo: "evaluacion-guardar", ramo: ramo.id, nombre: "Control 1", peso: 10 })).ok, true);

      // Borrar una y las de un ramo.
      const todas = (await p.pedir({ tipo: "notas-todas" })).datos;
      assert.equal(todas.fichas[0].evaluaciones.length, 3);
      assert.equal((await p.pedir({ tipo: "evaluacion-borrar", evaluacion: certamen2.id })).ok, true);
      assert.equal((await p.pedir({ tipo: "notas-borrar", ramo: ramo.id })).datos.borradas, 2);
      await esperarHasta(() => (p.fichas()?.length === 0 ? true : null));
    } finally {
      await p.cerrar();
    }
  });

  it("con la función apagada no se escribe pero lo guardado se ve y se borra", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "notas-"));
    // Se guardan notas con la función prendida y se reinicia el puente con ella apagada.
    const gastos = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
    const ramos = new Ramos(gastos);
    const notas = new Notas(gastos, ramos);
    const ramo = (ramos.crear({ nombre: "Física" }, 1) as { ok: true; ramo: { id: number } }).ramo.id;
    notas.crear(ramo, { nombre: "Control 1", peso: 100, nota: 5 }, 1);
    gastos.baseDeDatos().close();
    const p = lanzar(raiz, false);
    try {
      assert.deepEqual((await p.pedir({ tipo: "notas-estado" })).datos, []);
      assert.equal((await p.pedir({ tipo: "evaluacion-guardar", ramo, nombre: "Control 2", peso: 10 })).ok, false);
      assert.equal((await p.pedir({ tipo: "notas-ajustes", ramo, aprobacion: 5 })).ok, false);
      const todas = (await p.pedir({ tipo: "notas-todas" })).datos;
      assert.equal(todas.fichas[0].evaluaciones[0].nombre, "Control 1");
      assert.equal((await p.pedir({ tipo: "notas-borrar", ramo: null })).datos.borradas, 1);
      assert.deepEqual((await p.pedir({ tipo: "notas-todas" })).datos.fichas, []);
    } finally {
      await p.cerrar();
    }
  });
});
