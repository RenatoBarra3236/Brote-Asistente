// «Todo lo de un ramo» (C), de punta a punta con el puente de verdad (sin OpenClaw) y una base temporal:
// la lista por fecha, la búsqueda por títulos, la frase sin IA y que el texto buscado nunca llegue a los registros.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Gastos, Notas, Ramos, TareasAgenda } from "@asistente/motor";

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

describe("todo lo de un ramo en el puente", { skip: process.platform === "win32" }, () => {
  it("lista por fecha, busca por títulos, responde la frase y no registra lo buscado", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "ramo-todo-"));
    const funciones = join(raiz, "funciones.json");
    writeFileSync(funciones, JSON.stringify({ activas: { estudio: true, calendario: false, aula: false, grabaciones: false } }));
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
      stdio: ["pipe", "pipe", "pipe"],
    });
    const avisos: any[] = [];
    let errores = "";
    puente.stderr!.on("data", (d) => (errores += String(d)));
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
    try {
      await esperarHasta(() => avisos.find((a) => a.tipo === "ramos"));
      const calculo = (await pedir({ tipo: "ramo-crear", nombre: "Cálculo", alias: ["calc"] })).datos;
      const fisica = (await pedir({ tipo: "ramo-crear", nombre: "Física" })).datos;

      // Lo que dejan otros procesos o la isla: una tarea y una prueba de Cálculo, una grabación de Física.
      const otro = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
      const ramos = new Ramos(otro);
      const t = new TareasAgenda(otro).crearTarea("Resolver guía de derivadas", null, Date.now() + 5 * 3_600_000, null, Date.now());
      ramos.asignar("tarea", t.id, calculo.id);
      const futuro = new Date(Date.now() + 6 * 86_400_000);
      const fecha = `${futuro.getFullYear()}-${String(futuro.getMonth() + 1).padStart(2, "0")}-${String(futuro.getDate()).padStart(2, "0")}`;
      assert.ok(new Notas(otro, ramos).crear(calculo.id, { nombre: "Certamen 2", peso: 30, fecha }, Date.now()).ok);
      ramos.asignar("grabacion", "2026-10-03-080000", fisica.id);
      otro.cerrar();

      const todo = (await pedir({ tipo: "ramo-todo", ramo: calculo.id })).datos;
      assert.deepEqual(todo.items.map((i: any) => [i.tipo, i.titulo, i.estado]), [["tarea", "Resolver guía de derivadas", "pendiente"], ["prueba", "Certamen 2", "pendiente"]]);
      assert.match(todo.resumen, /^Cálculo: 1 tarea pendiente, Certamen 2 en 6 días\.$/);
      assert.deepEqual(todo.fuentes, { calendario: false, aula: false });
      assert.deepEqual((await pedir({ tipo: "ramo-todo", ramo: fisica.id })).datos.items.map((i: any) => i.tipo), ["grabacion"]);
      assert.equal((await pedir({ tipo: "ramo-todo", ramo: 9999 })).ok, false);
      assert.equal((await pedir({ tipo: "ramo-todo", ramo: "1" })).ok, false);

      const b = (await pedir({ tipo: "ramos-buscar", texto: "DERIVADAS" })).datos;
      assert.deepEqual(b.resultados.map((r: any) => [r.ramoId, r.total]), [[calculo.id, 1]]);
      assert.deepEqual((await pedir({ tipo: "ramos-buscar", texto: "deriv" })).datos.resultados, []);
      assert.equal((await pedir({ tipo: "ramos-buscar", texto: 5 })).ok, false);

      // La frase sin IA: resumen en el chat y la señal para abrir la vista.
      const frase = await pedir({ tipo: "enviar", texto: "todo lo de calc" });
      assert.equal(frase.local.intencion, "ramo-todo");
      assert.deepEqual(frase.local.datos, { ramoTodo: { ramoId: calculo.id } });
      assert.match(frase.local.texto, /^Cálculo: /);

      // Lo buscado ni los títulos llegan nunca a los registros del puente.
      const registros = errores + JSON.stringify(avisos.filter((a) => a.tipo === "registro"));
      assert.equal(registros.includes("DERIVADAS"), false);
      assert.equal(registros.includes("derivadas"), false);
    } finally {
      puente.stdin!.end();
      await new Promise((listo) => puente.once("exit", listo));
    }
  });
});
