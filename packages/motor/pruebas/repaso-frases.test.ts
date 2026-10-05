import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { MENSAJE_APAGADA } from "../src/funciones.ts";
import { Motor } from "../src/motor.ts";
import { Ramos } from "../src/ramos.ts";
import { Repaso } from "../src/repaso.ts";

const AHORA = new Date(2026, 9, 5, 13, 0);
const G = "2026-10-05-101500";
const kit = {
  glosario: [
    { termino: "Límite", definicion: "Valor al que se acerca la función" },
    { termino: "Derivada", definicion: "Tasa de cambio instantánea" },
  ],
};

function armar(estudio = true) {
  const gastos = new Gastos(":memory:");
  const ramos = new Ramos(gastos);
  const repaso = new Repaso(gastos, ramos);
  const motor = new Motor(gastos, { reloj: () => AHORA, ramos, repaso, activa: (f) => f !== "estudio" || estudio });
  const calculo = (ramos.crear({ nombre: "Cálculo" }, 1) as { ok: true; ramo: { id: number } }).ramo.id;
  ramos.crear({ nombre: "Física" }, 2);
  return { motor, repaso, calculo };
}

function conTarjetas() {
  const t = armar();
  t.repaso.proponer(G, kit, null, AHORA.getTime());
  t.repaso.decidir(G, { glosario: [0, 1], ramoId: t.calculo }, AHORA.getTime());
  return t;
}

describe("frases de repaso sin IA", () => {
  it("«¿tengo tarjetas para repasar?» cuenta las de hoy y las totales", () => {
    const { motor } = conTarjetas();
    for (const frase of ["¿tengo tarjetas para repasar?", "tengo tarjetas de repaso hoy", "¿cuántas tarjetas de repaso tengo?", "¿hay algo para repasar?", "¿qué me toca repasar?"]) {
      const r = motor.resolver(frase);
      assert.equal(r?.intencion, "repaso-hay", frase);
      assert.match(r!.texto, /Tienes 2 tarjetas para repasar hoy/, frase);
    }
  });

  it("sin tarjetas lo explica y dice cómo conseguir un repaso", () => {
    const { motor } = armar();
    assert.match(motor.resolver("¿tengo tarjetas para repasar?")!.texto, /Todavía no tienes tarjetas/);
  });

  it("si nada vence hoy, lo dice", () => {
    const { motor, repaso } = conTarjetas();
    for (const t of repaso.tarjetas()) repaso.responder(t.id, "sabia", AHORA.getTime());
    assert.match(motor.resolver("¿tengo tarjetas para repasar?")!.texto, /Hoy no te toca repasar nada/);
  });

  it("«repasemos» pide a la isla abrir la sesión, con o sin ramo", () => {
    const { motor, calculo } = conTarjetas();
    const todo = motor.resolver("repasemos");
    assert.equal(todo?.intencion, "repaso-empezar");
    assert.deepEqual(todo?.datos, { repaso: { ramoId: null } });
    const uno = motor.resolver("repasemos cálculo");
    assert.deepEqual(uno?.datos, { repaso: { ramoId: calculo } });
    assert.match(uno!.texto, /de Cálculo/);
    assert.ok(motor.resolver("quiero repasar cálculo")?.datos);
    assert.ok(motor.resolver("hagamos un repaso")?.datos);
  });

  it("un ramo sin tarjetas hoy no abre la sesión", () => {
    const { motor } = conTarjetas();
    const r = motor.resolver("repasemos física");
    assert.equal(r?.datos, undefined);
    assert.match(r!.texto, /No tienes tarjetas de Física/);
  });

  it("un ramo que no existe, o una cosa que no es ramo, va al agente (nunca se adivina)", () => {
    const { motor } = conTarjetas();
    assert.equal(motor.resolver("repasemos la materia de la clase"), null);
    assert.equal(motor.resolver("quiero repasar química"), null);
  });

  it("frases de control que NO son del repaso", () => {
    const { motor } = conTarjetas();
    for (const frase of [
      "tengo tarjetas de crédito",
      "¿cuántas tarjetas tengo?",
      "paqué 3000 de repaso de cálculo",
      "pagué 5000 por tarjetas de repaso",
      "hazme un resumen de la clase de ayer",
      "repasa mis gastos del mes",
      "qué tengo que hacer hoy",
    ]) {
      const r = motor.resolver(frase);
      assert.ok(!r || !r.intencion.startsWith("repaso-"), frase);
    }
  });

  it("con la función apagada dice dónde prenderla", () => {
    const { motor } = armar(false);
    assert.equal(motor.resolver("repasemos")!.texto, MENSAJE_APAGADA);
    assert.equal(motor.resolver("¿tengo tarjetas para repasar?")!.texto, MENSAJE_APAGADA);
  });

  it("sin repaso conectado (como en el MCP) esas frases van al agente", () => {
    const gastos = new Gastos(":memory:");
    const motor = new Motor(gastos, { reloj: () => AHORA, ramos: new Ramos(gastos) });
    assert.equal(motor.resolver("repasemos"), null);
  });
});
