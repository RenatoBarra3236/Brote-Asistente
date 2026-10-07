import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";

// Jueves 1 de octubre de 2026, 13:00 (hora local).
const AHORA = new Date(2026, 9, 1, 13, 0);

let gastos: Gastos;
let motor: Motor;
let ahora: Date;

beforeEach(() => {
  gastos = new Gastos(":memory:");
  ahora = AHORA;
  motor = new Motor(gastos, { reloj: () => ahora });
});

function decir(texto: string): string | undefined {
  return motor.resolver(texto)?.texto;
}

describe("registrar gastos", () => {
  const casos: [string, number, string, string | null][] = [
    ["Gasté 5 lucas en almuerzo", 5000, "comida", "almuerzo"],
    ["gaste $3.500 en el metro", 3500, "transporte", "metro"],
    ["pagué 12 mil de luz", 12000, "cuentas", "luz"],
    ["me gasté luca y media en fotocopias", 1500, "estudio", "fotocopias"],
    ["anota 2000 en café", 2000, "comida", "café"],
    ["anótame un gasto de 4 lucas en carrete", 4000, "salidas", "carrete"],
    ["compré un libro en 15 lucas", 15000, "estudio", "libro"],
    ["el completo me costó 2500", 2500, "comida", "completo"],
    ["gasté 3k", 3000, "otros", null],
    ["Gasté 2 lucas en un regalo para la Sofi", 2000, "salidas", "regalo para la Sofi"],
  ];
  for (const [texto, monto, categoria, descripcion] of casos) {
    it(texto, () => {
      const resultado = motor.resolver(texto);
      assert.equal(resultado?.intencion, "registrar-gasto");
      const [gasto] = gastos.ultimos(1);
      assert.deepEqual(
        { monto: gasto.monto, categoria: gasto.categoria, descripcion: gasto.descripcion },
        { monto, categoria, descripcion },
      );
    });
  }

  it("responde con lo anotado y el total del mes", () => {
    decir("gasté 3 lucas en micro");
    assert.equal(decir("gasté 2 lucas en almuerzo"), "Anotado: $2.000 en almuerzo (comida). Este mes llevas $5.000.");
  });
});

describe("consultar gastos", () => {
  beforeEach(() => {
    ahora = new Date(2026, 8, 25, 10); // viernes 25 de septiembre: mes pasado
    decir("gasté 10 lucas en arriendo");
    ahora = new Date(2026, 8, 30, 10); // miércoles 30: esta semana, mes pasado
    decir("gasté 2 lucas en micro");
    ahora = AHORA;
    decir("gasté 3 lucas en almuerzo");
    decir("gasté 1500 en café");
  });

  it("por periodo", () => {
    assert.equal(decir("¿cuánto gasté hoy?"), "Hoy llevas $4.500 (2 gastos).");
    assert.equal(decir("cuanto llevo esta semana"), "Esta semana llevas $6.500 (3 gastos).");
    assert.equal(decir("cuánto gasté el mes pasado"), "El mes pasado gastaste $12.000 (2 gastos).");
    assert.equal(decir("cuánto llevo gastado"), "Este mes llevas $4.500 (2 gastos).");
    assert.equal(decir("mis gastos de ayer"), "Ayer gastaste $2.000 (1 gasto).");
  });

  it("por categoría", () => {
    assert.equal(decir("cuánto llevo en comida"), "Este mes llevas $4.500 en comida (2 gastos).");
    assert.equal(decir("cuánto gasté en transporte esta semana"), "Esta semana llevas $2.000 en transporte (1 gasto).");
    assert.equal(decir("cuánto gasté la semana pasada en cuentas"), "La semana pasada gastaste $10.000 en cuentas (1 gasto).");
    assert.equal(decir("cuánto gasté la semana pasada en comida"), "La semana pasada no tienes gastos anotados en comida.");
  });

  it("últimos y borrar", () => {
    assert.equal(
      decir("mis últimos gastos"),
      "Tus últimos gastos:\n• $1.500 · café (hoy)\n• $3.000 · almuerzo (hoy)\n• $2.000 · micro (ayer)\n• $10.000 · arriendo (25/9)",
    );
    assert.equal(decir("borra el último gasto"), "Listo, borré el último gasto: $1.500 en café.");
    assert.equal(decir("¿cuánto gasté hoy?"), "Hoy llevas $3.000 (1 gasto).");
  });
});

describe("lo que no es del motor", () => {
  for (const texto of [
    "hola, ¿me explicas qué es una derivada?",
    "lee el archivo USER.md y resúmelo",
    "ejecuta el comando date",
    "gasté la tarde estudiando",
    "cuánto cuesta un pasaje a Valparaíso",
    "gastos",
  ]) {
    it(texto, () => {
      assert.equal(motor.resolver(texto), null);
      assert.equal(gastos.ultimos(1).length, 0);
    });
  }
});

describe("uso", () => {
  it("cuenta quién resolvió cada pedido", () => {
    gastos.registrarUso("motor", "registrar-gasto", AHORA);
    gastos.registrarUso("motor", "consultar-gastos", AHORA);
    gastos.registrarUso("agente", null, AHORA);
    assert.deepEqual(gastos.resumenUso(), { motor: 2, agente: 1 });
  });
});
