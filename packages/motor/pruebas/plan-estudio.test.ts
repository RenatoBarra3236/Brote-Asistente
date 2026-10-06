import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Notas } from "../src/notas.ts";
import { PlanesEstudio } from "../src/plan-estudio.ts";
import { Ramos } from "../src/ramos.ts";
import { MAX_PLANES } from "../src/plan-estudio-tipos.ts";

const AHORA = new Date(2026, 9, 5, 10, 0).getTime();
const en = (dias: number, h = 16, m = 0) => new Date(2026, 9, 5 + dias, h, m).getTime();
const bloque = (dias: number, tipo = "temas") => ({ tipo, inicioMs: en(dias), finMs: en(dias, 16, 50) });

function armar() {
  const gastos = new Gastos(":memory:");
  const ramos = new Ramos(gastos);
  const notas = new Notas(gastos, ramos);
  const planes = new PlanesEstudio(gastos, notas);
  const calculo = (ramos.crear({ nombre: "Cálculo" }, 1) as { ok: true; ramo: { id: number } }).ramo.id;
  const cert = (nombre: string) => {
    const r = notas.crear(calculo, { nombre, peso: 20 }, 1);
    assert.ok(r.ok);
    return r.evaluacion.id;
  };
  return { gastos, ramos, notas, planes, calculo, cert };
}

describe("planes de estudio guardados", () => {
  it("guarda un plan con sus bloques ordenados y los lista", () => {
    const { planes, calculo, cert } = armar();
    const e = cert("Certamen 1");
    const r = planes.crear(calculo, e, en(5, 15), 4, [bloque(2), bloque(1), bloque(3, "repaso-final")], false, AHORA);
    assert.ok(r.ok);
    assert.deepEqual(r.plan.bloques.map((b) => b.tipo), ["temas", "temas", "repaso-final"]);
    assert.ok(r.plan.bloques[0].inicioMs < r.plan.bloques[1].inicioMs);
    assert.equal(planes.planes(AHORA).length, 1);
    assert.equal(planes.planDe(e)?.id, r.plan.id);
  });

  it("rechaza bloques inválidos, evaluaciones de otro ramo y más de 4 planes activos", () => {
    const { planes, calculo, cert, ramos } = armar();
    const e = cert("Certamen 1");
    assert.equal(planes.crear(calculo, e, en(5), 4, [], false, AHORA).ok, false);
    assert.equal(planes.crear(calculo, 999, en(5), 4, [bloque(1)], false, AHORA).ok, false);
    const otro = (ramos.crear({ nombre: "Física" }, 2) as { ok: true; ramo: { id: number } }).ramo.id;
    assert.equal(planes.crear(otro, e, en(5), 4, [bloque(1)], false, AHORA).ok, false);
    for (let i = 0; i < MAX_PLANES; i++) assert.ok(planes.crear(calculo, cert(`Control ${i}`), en(5), 2, [bloque(1)], false, AHORA).ok);
    const sobra = planes.crear(calculo, cert("Control extra"), en(5), 2, [bloque(1)], false, AHORA);
    assert.equal(sobra.ok, false);
  });

  it("rehacer el plan de una evaluación conserva lo hecho y reemplaza lo demás", () => {
    const { planes, calculo, cert } = armar();
    const e = cert("Certamen 1");
    const a = planes.crear(calculo, e, en(5, 15), 4, [bloque(1), bloque(2), bloque(3)], false, AHORA);
    assert.ok(a.ok);
    planes.marcar(a.plan.bloques[0].id, "hecho");
    const b = planes.crear(calculo, e, en(5, 15), 3, [bloque(3), bloque(4, "repaso-final")], true, AHORA);
    assert.ok(b.ok);
    assert.equal(b.plan.id, a.plan.id);
    assert.equal(b.plan.bloques.length, 3);
    assert.equal(b.plan.bloques.filter((x) => x.estado === "hecho").length, 1);
    assert.equal(b.plan.calendario, true);
    assert.equal(planes.planes(AHORA).length, 1);
    assert.ok(planes.horasHechas(b.plan.id) > 0.8);
  });

  it("los bloques de la Agenda traen su ramo y su evaluación, y los saltados no aparecen", () => {
    const { planes, calculo, cert } = armar();
    const e = cert("Certamen 1");
    const r = planes.crear(calculo, e, en(5, 15), 4, [bloque(1), bloque(2)], false, AHORA);
    assert.ok(r.ok);
    planes.marcar(r.plan.bloques[1].id, "saltado");
    const lista = planes.bloquesEntre(AHORA, en(10));
    assert.equal(lista.length, 1);
    assert.equal(lista[0].ramoId, calculo);
    assert.equal(lista[0].evaluacion, "Certamen 1");
    assert.equal(planes.marcar(9999, "hecho"), false);
    assert.equal(planes.marcar(lista[0].id, "raro" as never), false);
  });

  it("borrar el ramo o la evaluación se lleva el plan; archivar no", () => {
    const { planes, calculo, cert, ramos, notas } = armar();
    const e1 = cert("Certamen 1");
    const e2 = cert("Certamen 2");
    planes.crear(calculo, e1, en(5), 4, [bloque(1)], false, AHORA);
    planes.crear(calculo, e2, en(6), 4, [bloque(2)], false, AHORA);
    ramos.archivar(calculo, true);
    assert.equal(planes.planes(AHORA).length, 2);
    notas.borrar(e1);
    assert.equal(planes.planes(AHORA).length, 1);
    ramos.borrar(calculo);
    assert.equal(planes.planes(AHORA).length, 0);
    assert.equal(planes.bloquesEntre(0, en(30)).length, 0);
  });

  it("un plan cuya prueba pasó hace más de 7 días se va solo", () => {
    const { planes, calculo, cert } = armar();
    planes.crear(calculo, cert("Certamen 1"), en(2), 2, [bloque(1)], false, AHORA);
    assert.equal(planes.planes(en(8)).length, 1);
    assert.equal(planes.planes(en(10)).length, 0);
  });

  it("los borrados quitan de verdad", () => {
    const { planes, calculo, cert } = armar();
    const a = planes.crear(calculo, cert("Certamen 1"), en(5), 2, [bloque(1)], false, AHORA);
    planes.crear(calculo, cert("Certamen 2"), en(6), 2, [bloque(2)], false, AHORA);
    assert.ok(a.ok && planes.borrarPlan(a.plan.id));
    assert.equal(planes.borrarDeRamo(calculo), 1);
    planes.crear(calculo, cert("Certamen 3"), en(7), 2, [bloque(2)], false, AHORA);
    assert.equal(planes.borrarTodo(), 1);
    assert.equal(planes.planes(AHORA).length, 0);
  });

  it("la marca cambia con cada alta, estado y borrado", () => {
    const { planes, calculo, cert } = armar();
    const m0 = planes.marca();
    const r = planes.crear(calculo, cert("Certamen 1"), en(5), 2, [bloque(1)], false, AHORA);
    assert.ok(r.ok);
    const m1 = planes.marca();
    planes.marcar(r.plan.bloques[0].id, "hecho");
    const m2 = planes.marca();
    planes.marcarCalendario(r.plan.id);
    const m3 = planes.marca();
    planes.borrarTodo();
    assert.equal(new Set([m0, m1, m2, m3]).size, 4);
    assert.equal(planes.marca(), m0);
  });
});
