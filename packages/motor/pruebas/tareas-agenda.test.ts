import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { TareasAgenda, leerFecha, validarPropuesta } from "../src/tareas-agenda.ts";

const ahora = new Date(2026, 9, 5, 10).getTime();
const ID = "2026-10-05-090000";
const nueva = () => new TareasAgenda(new Gastos(":memory:"));

describe("leerFecha", () => {
  it("acepta fecha y fecha con hora locales, y rechaza las que no existen", () => {
    assert.equal(leerFecha("2026-10-09")?.ms, new Date(2026, 9, 9, 23, 59).getTime());
    assert.deepEqual(leerFecha("2026-10-09 08:30"), { ms: new Date(2026, 9, 9, 8, 30).getTime(), conHora: true });
    for (const mala of ["2026-02-30", "2026-10-09 25:00", "mañana", "2026-10-9", "", null, 5]) assert.equal(leerFecha(mala), null, String(mala));
  });
});

describe("validarPropuesta", () => {
  it("una tarea con fecha sirve; un evento sin hora no", () => {
    assert.equal(validarPropuesta({ tipo: "tarea", titulo: "Guía 3", fecha: "2026-10-09" }, ahora).ok, true);
    assert.equal(validarPropuesta({ tipo: "evento", titulo: "Prueba 1", fecha: "2026-10-09" }, ahora).ok, false);
    assert.equal(validarPropuesta({ tipo: "evento", titulo: "Prueba 1", fecha: "2026-10-09 08:30" }, ahora).ok, true);
  });
  it("rechaza tipo raro, título corto, fecha pasada o a más de un año", () => {
    for (const mala of [
      { tipo: "nota", titulo: "Guía 3", fecha: "2026-10-09" },
      { tipo: "tarea", titulo: "x", fecha: "2026-10-09" },
      { tipo: "tarea", titulo: "Guía 3", fecha: "2026-09-01" },
      { tipo: "tarea", titulo: "Guía 3", fecha: "2028-01-01" },
      null,
    ]) assert.equal(validarPropuesta(mala, ahora).ok, false, JSON.stringify(mala));
  });
  it("limpia saltos de línea y recorta el título", () => {
    const v = validarPropuesta({ tipo: "tarea", titulo: `Guía\n3 ${"a".repeat(300)}`, fecha: "2026-10-09" }, ahora);
    assert.ok(v.ok && !v.propuesta.titulo.includes("\n") && v.propuesta.titulo.length <= 120);
  });
});

describe("TareasAgenda", () => {
  it("propone, ignora repetidas (también descartadas) y rechaza las malas", () => {
    const t = nueva();
    const r = t.proponer(ID, [{ tipo: "tarea", titulo: "Guía 3", fecha: "2026-10-09" }, { tipo: "tarea", titulo: "guía 3!", fecha: "2026-10-09" }, { tipo: "evento", titulo: "Prueba", fecha: "2026-10-09" }], ahora);
    assert.deepEqual([r.nuevas, r.repetidas, r.rechazadas.length], [1, 1, 1]);
    t.descartar(t.pendientes()[0].id);
    assert.equal(t.proponer(ID, [{ tipo: "tarea", titulo: "Guía 3", fecha: "2026-10-09" }], ahora).nuevas, 0);
  });
  it("exige un id de grabación con la forma exacta", () => {
    assert.throws(() => nueva().proponer("../../etc/passwd", [], ahora));
  });
  it("editar, aceptar y crear la tarea; marcarla hecha", () => {
    const t = nueva();
    t.proponer(ID, [{ tipo: "tarea", titulo: "Guía 3", fecha: "2026-10-09" }], ahora);
    const [p] = t.pendientes();
    assert.equal(t.editar(p.id, { titulo: "Guía 3 de álgebra", fecha: "2026-10-10" }, ahora), true);
    assert.equal(t.editar(p.id, { fecha: "no" }, ahora), false);
    const aceptada = t.aceptar(p.id)!;
    assert.equal(aceptada.titulo, "Guía 3 de álgebra");
    assert.equal(t.pendientes().length, 0);
    const tarea = t.crearTarea(aceptada.titulo, null, aceptada.inicioMs, ID, ahora);
    assert.equal(t.tareas(ahora, ahora + 30 * 86_400_000).length, 1);
    assert.equal(t.marcarHecha(tarea.id, true), true);
    assert.equal(t.tareas(ahora, ahora + 30 * 86_400_000)[0].hecha, true);
  });
  it("al borrar la transcripción se van sus propuestas pendientes, no lo aceptado", () => {
    const t = nueva();
    t.proponer(ID, [{ tipo: "tarea", titulo: "Guía 3", fecha: "2026-10-09" }, { tipo: "tarea", titulo: "Guía 4", fecha: "2026-10-10" }], ahora);
    t.aceptar(t.pendientes()[0].id);
    assert.equal(t.olvidarDeGrabacion(ID), 1);
  });
  it("la marca cambia con cada propuesta y cada cambio", () => {
    const t = nueva();
    const a = t.marca();
    t.proponer(ID, [{ tipo: "tarea", titulo: "Guía 3", fecha: "2026-10-09" }], ahora);
    assert.notEqual(t.marca(), a);
  });
});
