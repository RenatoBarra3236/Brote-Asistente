import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Notas } from "../src/notas.ts";
import { PlanesEstudio } from "../src/plan-estudio.ts";
import { Ramos } from "../src/ramos.ts";
import { Repaso } from "../src/repaso.ts";
import { TareasAgenda } from "../src/tareas-agenda.ts";
import { armarTodoDeRamos } from "../src/ramo-todo.ts";
import { fuentesDeBaseDeDatos } from "../src/ramo-todo-datos.ts";

// Sus propios documentos, nunca los del computador.
process.env.ASISTENTE_DOCUMENTOS = mkdtempSync(join(tmpdir(), "documentos-vacios-"));
const AHORA = new Date(2026, 9, 5, 12).getTime();
const DIA = 86_400_000;

describe("todo lo de un ramo desde la base de datos", () => {
  it("junta pruebas, tareas, bloques, tarjetas y grabaciones de cada ramo", () => {
    const gastos = new Gastos(":memory:");
    const ramos = new Ramos(gastos);
    const notas = new Notas(gastos, ramos);
    const planes = new PlanesEstudio(gastos, notas);
    const repaso = new Repaso(gastos, ramos);
    const tareas = new TareasAgenda(gastos);
    const calculo = (ramos.crear({ nombre: "Cálculo" }, 1) as { ok: true; ramo: { id: number } }).ramo.id;
    const fisica = (ramos.crear({ nombre: "Física" }, 2) as { ok: true; ramo: { id: number } }).ramo.id;

    const ev = notas.crear(calculo, { nombre: "Certamen 2", peso: 30, fecha: "2026-10-11" }, 1);
    assert.ok(ev.ok);
    notas.crear(calculo, { nombre: "Certamen 1", peso: 30, fecha: "2026-09-20", nota: 5 }, 1); // con nota: ya no es una prueba por venir
    const t = tareas.crearTarea("Resolver guía", null, AHORA + DIA, null, AHORA);
    ramos.asignar("tarea", t.id, calculo);
    tareas.crearTarea("Tarea sin ramo", null, AHORA + DIA, null, AHORA);
    ramos.asignar("grabacion", "2026-10-04-080000", fisica);
    ramos.asignar("grabacion", "no-es-un-id", fisica); // un id inválido no se muestra

    const todo = armarTodoDeRamos(ramos.listar(), { eventos: [], entregas: [], ...fuentesDeBaseDeDatos({ ramos, notas, planes, repaso, tareas }, AHORA) }, AHORA);
    assert.deepEqual(todo.get(calculo)!.map((i) => [i.tipo, i.titulo]), [["tarea", "Resolver guía"], ["prueba", "Certamen 2"]]);
    assert.deepEqual(todo.get(fisica)!.map((i) => i.tipo), ["grabacion"]);
    assert.equal(JSON.stringify([...todo.values()]).includes("Tarea sin ramo"), false);
  });
});
