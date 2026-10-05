import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Notas } from "../src/notas.ts";
import { Ramos } from "../src/ramos.ts";

function armar() {
  const gastos = new Gastos(":memory:");
  const ramos = new Ramos(gastos);
  const notas = new Notas(gastos, ramos);
  const calculo = (ramos.crear({ nombre: "Cálculo" }, 1) as { ok: true; ramo: { id: number } }).ramo.id;
  const fisica = (ramos.crear({ nombre: "Física" }, 2) as { ok: true; ramo: { id: number } }).ramo.id;
  return { ramos, notas, calculo, fisica };
}

describe("notas guardadas", () => {
  it("crea evaluaciones por ramo y las lista en orden", () => {
    const { notas, calculo, fisica } = armar();
    notas.crear(calculo, { nombre: "Certamen 1", peso: 30, nota: 4.2 }, 1);
    notas.crear(calculo, { nombre: "Certamen 2", peso: 30 }, 2);
    notas.crear(fisica, { nombre: "Control 1", peso: 20 }, 3);
    assert.deepEqual(notas.listar(calculo).map((e) => [e.nombre, e.peso, e.nota]), [["Certamen 1", 30, 4.2], ["Certamen 2", 30, null]]);
    assert.equal(notas.listar().length, 3);
    assert.equal(notas.listar(fisica).length, 1);
  });

  it("el nombre es único por ramo sin tildes ni mayúsculas, pero se puede repetir en otro ramo", () => {
    const { notas, calculo, fisica } = armar();
    assert.ok(notas.crear(calculo, { nombre: "Certamen 1", peso: 30 }, 1).ok);
    const repetida = notas.crear(calculo, { nombre: "CERTAMEN 1", peso: 40 }, 2);
    assert.equal(repetida.ok, false);
    assert.ok(notas.crear(fisica, { nombre: "Certamen 1", peso: 40 }, 3).ok);
  });

  it("rechaza ramo inexistente y datos inválidos sin guardar nada", () => {
    const { notas, calculo } = armar();
    assert.equal(notas.crear(999, { nombre: "Certamen", peso: 30 }, 1).ok, false);
    assert.equal(notas.crear(calculo, { nombre: "Certamen", peso: 0 }, 1).ok, false);
    assert.equal(notas.crear(calculo, { nombre: "Certamen", peso: 30, nota: 9 }, 1).ok, false);
    assert.equal(notas.listar().length, 0);
  });

  it("ponerNota, dejar pendiente y rechazar notas fuera de la escala", () => {
    const { notas, calculo } = armar();
    const e = (notas.crear(calculo, { nombre: "Certamen 1", peso: 30 }, 1) as { ok: true; evaluacion: { id: number } }).evaluacion;
    assert.equal(notas.ponerNota(e.id, 5.5).ok, true);
    assert.equal(notas.obtener(e.id)?.nota, 5.5);
    assert.equal(notas.ponerNota(e.id, 7.5).ok, false);
    assert.equal(notas.obtener(e.id)?.nota, 5.5);
    notas.ponerNota(e.id, null);
    assert.equal(notas.obtener(e.id)?.nota, null);
  });

  it("editar cambia el peso sin perder la nota y no deja chocar nombres", () => {
    const { notas, calculo } = armar();
    const a = (notas.crear(calculo, { nombre: "Certamen 1", peso: 30, nota: 5 }, 1) as { ok: true; evaluacion: { id: number } }).evaluacion;
    notas.crear(calculo, { nombre: "Certamen 2", peso: 30 }, 2);
    notas.editar(a.id, { peso: 40 });
    assert.deepEqual([notas.obtener(a.id)?.peso, notas.obtener(a.id)?.nota], [40, 5]);
    assert.equal(notas.editar(a.id, { nombre: "certamen 2" }).ok, false);
  });

  it("ajustes por ramo: por defecto 4,0; se guardan y se validan", () => {
    const { notas, calculo, fisica } = armar();
    assert.equal(notas.ajustes(calculo).aprobacion, 4);
    assert.ok(notas.ponerAjustes(calculo, { aprobacion: 5, examenPeso: 30, examenMinimo: 4 }).ok);
    assert.deepEqual(notas.ajustes(calculo), { aprobacion: 5, examenPeso: 30, examenMinimo: 4, presentacionMinima: null });
    assert.equal(notas.ajustes(fisica).aprobacion, 4);
    assert.equal(notas.ponerAjustes(calculo, { aprobacion: 9 }).ok, false);
    assert.equal(notas.ponerAjustes(999, {}).ok, false);
  });

  it("archivar un ramo conserva sus notas; borrarlo las borra", () => {
    const { notas, ramos, calculo, fisica } = armar();
    notas.crear(calculo, { nombre: "Certamen 1", peso: 30, nota: 5 }, 1);
    notas.crear(fisica, { nombre: "Control 1", peso: 20 }, 2);
    notas.ponerAjustes(calculo, { aprobacion: 5 });
    ramos.archivar(calculo);
    assert.equal(notas.listar(calculo).length, 1);
    ramos.borrar(calculo);
    assert.equal(notas.listar(calculo).length, 0);
    assert.equal(notas.ajustes(calculo).aprobacion, 4);
    assert.equal(notas.listar(fisica).length, 1);
  });

  it("borrar una, las de un ramo y todas", () => {
    const { notas, calculo, fisica } = armar();
    const a = (notas.crear(calculo, { nombre: "Certamen 1", peso: 30 }, 1) as { ok: true; evaluacion: { id: number } }).evaluacion;
    notas.crear(calculo, { nombre: "Certamen 2", peso: 30 }, 2);
    notas.crear(fisica, { nombre: "Control 1", peso: 20 }, 3);
    assert.equal(notas.borrar(a.id), true);
    assert.equal(notas.borrar(a.id), false);
    assert.equal(notas.borrarDeRamo(calculo), 1);
    assert.equal(notas.listar().length, 1);
    assert.equal(notas.borrarTodas(), 1);
    assert.equal(notas.listar().length, 0);
  });

  it("la marca cambia con cada alta, nota, ajuste y borrado", () => {
    const { notas, calculo } = armar();
    const marcas = new Set<string>([notas.marca()]);
    const e = (notas.crear(calculo, { nombre: "Certamen 1", peso: 30 }, 1) as { ok: true; evaluacion: { id: number } }).evaluacion;
    marcas.add(notas.marca());
    notas.ponerNota(e.id, 5);
    marcas.add(notas.marca());
    notas.editar(e.id, { nombre: "Certamen uno" });
    marcas.add(notas.marca());
    notas.ponerAjustes(calculo, { aprobacion: 5 });
    marcas.add(notas.marca());
    notas.borrar(e.id);
    marcas.add(notas.marca());
    assert.equal(marcas.size, 6);
  });

  it("tope de evaluaciones por ramo", () => {
    const { notas, calculo } = armar();
    for (let i = 1; i <= 30; i++) assert.ok(notas.crear(calculo, { nombre: `Prueba ${i}`, peso: 1 }, i).ok);
    assert.equal(notas.crear(calculo, { nombre: "Prueba 31", peso: 1 }, 31).ok, false);
  });
});
