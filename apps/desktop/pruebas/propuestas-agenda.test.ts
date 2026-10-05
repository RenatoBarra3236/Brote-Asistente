import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { destinoDePropuesta, fechaDePropuesta, fechaParaEditar, propuestasNuevas, textoAvisoPropuestas, tituloDeTarjeta } from "../src/agente/propuestas-agenda.ts";

const viernes = new Date(2026, 9, 9, 8, 30).getTime();

describe("propuestas de la Agenda: textos", () => {
  it("la fecha lleva la hora solo si la tiene", () => {
    assert.equal(fechaDePropuesta({ inicioMs: viernes, conHora: true }), "vie 9 oct · 08:30");
    assert.equal(fechaDePropuesta({ inicioMs: viernes, conHora: false }), "vie 9 oct");
  });
  it("la fecha de edición vuelve a leerse igual (AAAA-MM-DD [HH:MM])", () => {
    assert.equal(fechaParaEditar({ inicioMs: viernes, conHora: true }), "2026-10-09 08:30");
    assert.equal(fechaParaEditar({ inicioMs: viernes, conHora: false }), "2026-10-09");
  });
  it("singular y plural", () => {
    assert.equal(tituloDeTarjeta(1), "Encontré 1 cosa en tu grabación");
    assert.equal(tituloDeTarjeta(3), "Encontré 3 cosas en tu grabación");
    assert.match(textoAvisoPropuestas(1), /1 tarea o fecha/);
    assert.match(textoAvisoPropuestas(2), /2 tareas o fechas/);
  });
  it("dice a dónde va cada cosa, también sin calendario", () => {
    assert.equal(destinoDePropuesta("tarea", true), "Se agrega a tu Agenda y a tu calendario");
    assert.equal(destinoDePropuesta("tarea", false), "Se agrega a tu Agenda");
    assert.equal(destinoDePropuesta("evento", true), "Se agrega a tu calendario");
    assert.equal(destinoDePropuesta("evento", false), "Se agrega a tu Agenda como tarea");
  });
  it("cuenta solo las propuestas que no se habían visto", () => {
    assert.equal(propuestasNuevas([{ id: 1 }], [{ id: 1 }, { id: 2 }, { id: 3 }]), 2);
    assert.equal(propuestasNuevas([{ id: 1 }, { id: 2 }], [{ id: 2 }]), 0);
  });
});
