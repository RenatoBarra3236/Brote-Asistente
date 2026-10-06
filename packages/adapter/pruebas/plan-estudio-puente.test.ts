// El plan de estudio (A4) de la pestaña Estudio, de punta a punta con el puente de verdad (sin OpenClaw), en una
// carpeta temporal: nunca con las tarjetas ni transcripciones reales del usuario.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Gastos, Notas, PlanesEstudio, Ramos } from "@asistente/motor";

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
  const estado = () => avisos.filter((a) => a.tipo === "plan-estudio").at(-1) as { planes: any[] } | undefined;
  const cerrar = async () => {
    puente.stdin!.end();
    await new Promise((listo) => puente.once("exit", listo));
  };
  return { pedir, estado, avisos, cerrar };
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const dentroDe = (dias: number) => new Date(Date.now() + dias * 86_400_000);
const dichoAsi = (f: Date) => `${f.getDate()} de ${MESES[f.getMonth()]}${f.getFullYear() !== new Date().getFullYear() ? ` de ${f.getFullYear()}` : ""}`;

describe("plan de estudio en el puente", { skip: process.platform === "win32" }, () => {
  it("fecha por frase, propuesta sin guardar, agendar, Agenda, estado de un bloque, pomodoro y borrar", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "plan-estudio-"));
    const p = lanzar(raiz, true);
    try {
      await esperarHasta(() => p.estado());
      assert.deepEqual(p.estado()!.planes, []);
      const ramo = (await p.pedir({ tipo: "ramo-crear", nombre: "Cálculo" })).datos;
      await p.pedir({ tipo: "enviar", texto: "evaluaciones de cálculo: certamen 1 100%" });
      const prueba = dentroDe(6);
      const fecha = await p.pedir({ tipo: "enviar", texto: `el certamen 1 de cálculo es el ${dichoAsi(prueba)} a las 15:00` });
      assert.equal(fecha.local.intencion, "estudio-fecha");
      const gastos = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
      const ev = new Notas(gastos, new Ramos(gastos)).listar(ramo.id)[0];
      assert.match(ev.fecha ?? "", /^\d{4}-\d{2}-\d{2} 15:00$/);
      gastos.baseDeDatos().close();

      // «Plan de estudio para…» solo abre la propuesta en la isla: no guarda nada.
      const pedido = await p.pedir({ tipo: "enviar", texto: "plan de estudio para el certamen 1 de cálculo" });
      assert.deepEqual(pedido.local.datos, { planEstudio: { ramoId: ramo.id, evaluacionId: ev.id } });
      const propuesta = (await p.pedir({ tipo: "plan-estudio-proponer", ramo: ramo.id, evaluacion: ev.id })).datos;
      assert.ok(propuesta.bloques.length >= 4);
      assert.equal(propuesta.bloques.at(-1).tipo, "repaso-final");
      assert.equal(propuesta.horasObjetivo, 12);
      assert.deepEqual(p.estado()!.planes, []);
      const menos = (await p.pedir({ tipo: "plan-estudio-proponer", ramo: ramo.id, evaluacion: ev.id, horas: 2 })).datos;
      assert.ok(menos.bloques.length < propuesta.bloques.length);

      // Agendar (sin calendario) y verlo en el aviso y en la Agenda.
      assert.equal((await p.pedir({ tipo: "plan-estudio-agendar", ramo: ramo.id, evaluacion: ev.id, bloques: [], calendario: false })).ok, false);
      const agendado = await p.pedir({ tipo: "plan-estudio-agendar", ramo: ramo.id, evaluacion: ev.id, horas: menos.horas, bloques: menos.bloques, calendario: false });
      assert.equal(agendado.datos.plan.bloques.length, menos.bloques.length);
      assert.deepEqual(agendado.datos.calendario, { pedido: false, creados: 0, fallidos: 0 });
      const aviso = await esperarHasta(() => (p.estado()!.planes.length === 1 ? p.estado() : undefined));
      const bloque = aviso!.planes[0].bloques[0];
      const agenda = (await p.pedir({ tipo: "agenda-estado" })).datos;
      const enAgenda = agenda.dias.flatMap((d: any) => d.items).filter((i: any) => i.tipo === "estudio");
      assert.equal(enAgenda.length, menos.bloques.length);
      assert.match(enAgenda[0].titulo, /Cálculo$/);

      // Marcar un bloque, rechazos y un pomodoro del ramo.
      assert.equal((await p.pedir({ tipo: "plan-estudio-bloque", bloque: bloque.id, estado: "hecho" })).ok, true);
      assert.equal((await p.pedir({ tipo: "plan-estudio-bloque", bloque: bloque.id, estado: "raro" })).ok, false);
      assert.equal((await p.pedir({ tipo: "plan-estudio-bloque", bloque: 9999, estado: "hecho" })).ok, false);
      const pomodoro = await p.pedir({ tipo: "pomodoro-iniciar", ramo: ramo.id });
      assert.equal(pomodoro.ok, true);
      const lista = (await p.pedir({ tipo: "temporizadores-listar" })).datos;
      assert.equal(lista.find((t: any) => t.tipo === "pomodoro")?.etiqueta, "Cálculo");

      // Rehacer conserva lo hecho.
      const otra = (await p.pedir({ tipo: "plan-estudio-proponer", ramo: ramo.id, evaluacion: ev.id })).datos;
      assert.equal(otra.planId, aviso!.planes[0].id);
      assert.ok(otra.horasHechas >= 0.8);
      assert.ok(otra.horasPedidas < propuesta.horasPedidas);

      // «Qué estudio hoy» responde sin IA.
      assert.equal((await p.pedir({ tipo: "enviar", texto: "¿qué tengo que estudiar hoy?" })).local.intencion, "estudio-hoy");

      // Borrar de verdad.
      const todo = (await p.pedir({ tipo: "plan-estudio-todo" })).datos;
      assert.equal(todo.evaluaciones[ev.id], "certamen 1");
      assert.equal((await p.pedir({ tipo: "plan-estudio-borrar", que: "raro" })).ok, false);
      assert.equal((await p.pedir({ tipo: "plan-estudio-borrar", que: "plan", plan: aviso!.planes[0].id })).datos.borrados, 1);
      await esperarHasta(() => (p.estado()!.planes.length === 0 ? true : null));
    } finally {
      await p.cerrar();
    }
  });

  it("un plan hecho por otro proceso aparece solo, y con la función apagada se ve y se borra pero no se propone", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "plan-estudio-"));
    const gastos = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
    const ramos = new Ramos(gastos);
    const notas = new Notas(gastos, ramos);
    const planes = new PlanesEstudio(gastos, notas);
    const ramo = (ramos.crear({ nombre: "Física" }, 1) as { ok: true; ramo: { id: number } }).ramo.id;
    const ev = notas.crear(ramo, { nombre: "Control 1", peso: 30, fecha: null }, 1);
    assert.ok(ev.ok);
    const ini = Date.now() + 2 * 86_400_000;
    planes.crear(ramo, ev.evaluacion.id, Date.now() + 5 * 86_400_000, 1, [{ tipo: "temas", inicioMs: ini, finMs: ini + 50 * 60_000 }], false, Date.now());
    gastos.baseDeDatos().close();
    const p = lanzar(raiz, false);
    try {
      assert.equal((await p.pedir({ tipo: "plan-estudio-estado" })).datos.planes.length, 0);
      assert.equal((await p.pedir({ tipo: "plan-estudio-proponer", ramo, evaluacion: ev.evaluacion.id })).ok, false);
      assert.equal((await p.pedir({ tipo: "plan-estudio-agendar", ramo, evaluacion: ev.evaluacion.id, bloques: [], calendario: false })).ok, false);
      assert.equal((await p.pedir({ tipo: "plan-estudio-todo" })).datos.planes.length, 1);
      assert.equal((await p.pedir({ tipo: "plan-estudio-borrar", que: "ramo", ramo })).datos.borrados, 1);
      assert.equal((await p.pedir({ tipo: "plan-estudio-todo" })).datos.planes.length, 0);
    } finally {
      await p.cerrar();
    }
  });
});
