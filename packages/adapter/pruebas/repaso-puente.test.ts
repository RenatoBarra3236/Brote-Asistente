// El repaso (A3) de la pestaña Estudio, de punta a punta con el puente de verdad (sin OpenClaw), en una
// carpeta temporal: nunca con las tarjetas ni transcripciones reales del usuario.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Gastos, Ramos, Repaso, guardarTranscripcion, type Transcripcion } from "@asistente/motor";

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
  writeFileSync(funciones, JSON.stringify({ activas: { estudio, calendario: false, aula: false, grabaciones: true } }));
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
  const estado = () => avisos.filter((a) => a.tipo === "repaso").at(-1)?.repaso as any | undefined;
  const cerrar = async () => {
    puente.stdin!.end();
    await new Promise((listo) => puente.once("exit", listo));
  };
  return { pedir, estado, avisos, cerrar };
}

const G = "2026-10-04-103000";
const kit = {
  temas: [{ titulo: "Límites", puntos: ["Un límite describe a qué valor se acerca la función"] }],
  glosario: [{ termino: "Continuidad", definicion: "La función no tiene saltos en ese punto" }, { termino: "Derivada", definicion: "Tasa de cambio instantánea" }],
  preguntas: [{ pregunta: "¿Qué es un límite lateral?", respuesta: "El valor al que se acerca por un solo lado" }],
};
const transcripcion: Transcripcion = { id: G, fecha: "2026-10-04T10:30:00-03:00", duracionSeg: 60, origen: "pc", modelo: "small", idioma: "es", avisoAPresentes: "solo-mi-voz", segmentos: [{ inicioSeg: 0, finSeg: 5, texto: "clase inventada" }] };

describe("repaso en el puente", { skip: process.platform === "win32" }, () => {
  it("avisa la propuesta de otro proceso, acepta lo marcado, repasa y borra", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "repaso-"));
    const p = lanzar(raiz, true);
    try {
      await esperarHasta(() => p.estado());
      assert.equal(p.estado().propuestas.length, 0);
      const ramo = (await p.pedir({ tipo: "ramo-crear", nombre: "Cálculo" })).datos;

      // Otro proceso (el MCP) deja una propuesta: la isla se entera sola.
      const gastos = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
      const repaso = new Repaso(gastos, new Ramos(gastos));
      assert.ok(repaso.proponer(G, kit, ramo.id, Date.now()).ok);
      const e = await esperarHasta(() => p.estado()?.propuestas.length === 1 && p.estado());
      assert.equal(e.propuestas[0].kit.glosario.length, 2);
      assert.equal(e.total, 0);

      // Aceptar solo una tarjeta y el tema, corrigiendo el texto.
      const mal = await p.pedir({ tipo: "repaso-propuesta-decidir", grabacion: G, decision: "aceptar", glosario: [9] });
      assert.equal(mal.ok, false);
      const ok = await p.pedir({ tipo: "repaso-propuesta-decidir", grabacion: G, decision: "aceptar", temas: [0], glosario: [0], ramoId: ramo.id, glosarioEditado: { 0: { termino: "Continuidad", definicion: "Sin saltos ni huecos" } } });
      assert.deepEqual(ok.datos, { tarjetas: 1, repetidas: 0, temas: 1 });
      const despues = await esperarHasta(() => p.estado()?.total === 1 && p.estado());
      assert.equal(despues.propuestas.length, 0);
      assert.equal(despues.hoy, 1);
      assert.equal(despues.deHoy[0].reverso, "Sin saltos ni huecos");
      assert.equal(despues.porRamo[0].ramoId, ramo.id);

      // Repasar: «Sabía» la manda a otra caja y ya no vence hoy.
      assert.equal((await p.pedir({ tipo: "repaso-responder", tarjeta: despues.deHoy[0].id, resultado: "inventado" })).ok, false);
      const r = await p.pedir({ tipo: "repaso-responder", tarjeta: despues.deHoy[0].id, resultado: "sabia" });
      assert.equal(r.datos.caja, 2);
      await esperarHasta(() => p.estado()?.hoy === 0);

      // Sin IA: «¿tengo tarjetas para repasar?»
      const frase = await p.pedir({ tipo: "enviar", texto: "¿tengo tarjetas para repasar?" });
      assert.equal(frase.local.intencion, "repaso-hay");

      // Borrar: de una grabación, de un ramo y todo.
      const todo = (await p.pedir({ tipo: "repaso-todo" })).datos;
      assert.equal(todo.tarjetas.length, 1);
      assert.equal(todo.resumenes.length, 1);
      assert.equal((await p.pedir({ tipo: "repaso-borrar", que: "ramo", ramo: ramo.id })).datos.borradas, 2);
      assert.equal((await p.pedir({ tipo: "repaso-borrar", que: "raro" })).ok, false);
      await esperarHasta(() => p.estado()?.total === 0);
    } finally {
      await p.cerrar();
    }
  });

  it("descartar una propuesta no deja nada, y borrar la transcripción se lleva su propuesta pero no lo aceptado", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "repaso-"));
    guardarTranscripcion(transcripcion, join(raiz, "transcripciones"));
    const gastos = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
    const repaso = new Repaso(gastos, new Ramos(gastos));
    repaso.proponer(G, kit, null, Date.now());
    repaso.decidir(G, { glosario: [0] }, Date.now());
    repaso.proponer(G, kit, null, Date.now());
    gastos.baseDeDatos().close();
    const p = lanzar(raiz, true);
    try {
      await esperarHasta(() => p.estado()?.propuestas.length === 1);
      const borrada = await p.pedir({ tipo: "grabacion-borrar", que: "transcripcion", grabacion: G });
      assert.equal(borrada.datos.borradas, 1);
      const e = await esperarHasta(() => p.estado()?.propuestas.length === 0 && p.estado());
      assert.equal(e.total, 1); // la tarjeta aceptada se queda
      assert.equal((await p.pedir({ tipo: "repaso-propuesta-decidir", grabacion: G, decision: "descartar" })).ok, false);
    } finally {
      await p.cerrar();
    }
  });

  it("con la función apagada no se decide ni se repasa, pero lo guardado se ve y se borra", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "repaso-"));
    const gastos = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
    const repaso = new Repaso(gastos, new Ramos(gastos));
    repaso.proponer(G, kit, null, Date.now());
    repaso.decidir(G, { glosario: [0, 1] }, Date.now());
    const id = repaso.tarjetas()[0].id;
    gastos.baseDeDatos().close();
    const p = lanzar(raiz, false);
    try {
      assert.equal((await p.pedir({ tipo: "repaso-estado" })).datos.total, 0);
      assert.equal((await p.pedir({ tipo: "repaso-responder", tarjeta: id, resultado: "sabia" })).ok, false);
      assert.equal((await p.pedir({ tipo: "repaso-propuesta-decidir", grabacion: G, decision: "descartar" })).ok, false);
      assert.equal((await p.pedir({ tipo: "repaso-todo" })).datos.tarjetas.length, 2);
      assert.equal((await p.pedir({ tipo: "repaso-borrar", que: "tarjeta", tarjeta: id })).datos.borradas, 1);
      assert.equal((await p.pedir({ tipo: "repaso-borrar", que: "todo" })).datos.borradas, 1);
      assert.equal((await p.pedir({ tipo: "repaso-todo" })).datos.tarjetas.length, 0);
    } finally {
      await p.cerrar();
    }
  });
});
