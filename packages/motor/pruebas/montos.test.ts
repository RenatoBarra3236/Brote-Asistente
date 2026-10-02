import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leerMonto } from "../src/montos.ts";
import { formatearMonto, normalizar } from "../src/texto.ts";

describe("leerMonto", () => {
  const casos: [string, number | null][] = [
    ["5000", 5000],
    ["$3.500", 3500],
    ["$ 12.000", 12000],
    ["5 lucas", 5000],
    ["una luca", 1000],
    ["luca", 1000],
    ["media luca", 500],
    ["luca y media", 1500],
    ["2 lucas y media", 2500],
    ["2,5 lucas", 2500],
    ["cinco lucas", 5000],
    ["veinte lucas", 20000],
    ["12 mil", 12000],
    ["3k", 3000],
    ["mil", 1000],
    ["un palo", 1_000_000],
    ["1500 pesos", 1500],
    ["almuerzo", null],
    ["0", null],
    ["un cafe", null],
    ["999 palos", null],
  ];
  for (const [texto, esperado] of casos) {
    it(`"${texto}" → ${esperado}`, () => assert.equal(leerMonto(normalizar(texto)), esperado));
  }
});

describe("texto", () => {
  it("normaliza tildes, signos y puntuación final", () => {
    assert.equal(normalizar("¿Cuánto   GASTÉ hoy?"), "cuanto gaste hoy");
    assert.equal(normalizar("Gasté $3.500 en café."), "gaste $3.500 en cafe");
  });
  it("formatea pesos chilenos", () => {
    assert.equal(formatearMonto(23500), "$23.500");
    assert.equal(formatearMonto(1000000), "$1.000.000");
    assert.equal(formatearMonto(500), "$500");
  });
});
