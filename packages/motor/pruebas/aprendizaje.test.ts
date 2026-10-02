import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { deducirPlantilla, porcentajeSinIA, proponerPlantilla } from "../src/aprendizaje.ts";
import { Gastos } from "../src/gastos.ts";
import { atender } from "../src/mcp.ts";
import { Motor } from "../src/motor.ts";
import { PLANTILLAS_BASE } from "../src/plantillas.ts";

const AHORA = new Date(2026, 9, 2, 12);
let gastos: Gastos;
let motor: Motor;

beforeEach(() => {
  gastos = new Gastos(":memory:");
  motor = new Motor(gastos, { plantillas: () => [...PLANTILLAS_BASE, ...gastos.plantillasActivas()], reloj: () => AHORA });
});

function proponer(patron: string, ejemplo: string, intencion = "registrar-gasto") {
  return proponerPlantilla(gastos, motor, { patron, ejemplo, intencion }, AHORA);
}

describe("motor que aprende", () => {
  it("una propuesta aceptada hace que la frase se resuelva sin IA", () => {
    const frase = "paque luca y media de micro";
    assert.equal(motor.resolver(frase), null);

    const revision = proponer("(pague|paque|pago) {monto} (de|en) {cosa}", frase);
    assert.ok(revision.ok);
    // Mientras no se acepta, no se usa.
    assert.equal(motor.resolver(frase), null);
    assert.deepEqual(gastos.plantillasPropuestas().map((p) => p.ejemplo), [frase]);

    gastos.decidirPlantilla(revision.propuesta.id, true, AHORA);
    const resultado = motor.resolver(frase);
    assert.equal(resultado?.plantilla, `aprendida-${revision.propuesta.id}`);
    assert.match(resultado!.texto, /^Anotado: \$1\.500 en micro \(transporte\)/);
    // Y sirve para frases parecidas.
    assert.match(motor.resolver("paque 3 lucas de almuerzo")!.texto, /\$3\.000 en almuerzo \(comida\)/);
  });

  it("una propuesta rechazada no se usa ni se puede volver a proponer", () => {
    const revision = proponer("paque {monto} de {cosa}", "paque 500 de pan");
    assert.ok(revision.ok);
    gastos.decidirPlantilla(revision.propuesta.id, false, AHORA);
    assert.equal(motor.resolver("paque 500 de pan"), null);
    const otra = proponer("paque {monto} de {cosa}", "paque 500 de pan");
    assert.equal(otra.ok, false);
    assert.match((otra as { motivo: string }).motivo, /rechazó/);
  });

  const rechazos: [string, string, string, RegExp][] = [
    ["{cosa} {monto}", "micro 1500", "registrar-gasto", /palabra fija/],
    ["(gaste|gasto) {monto}", "gaste 1500", "registrar-gasto", /ya la entiendo/],
    ["paque {monto} de {cosa}", "pague 500 de pan", "registrar-gasto", /no calza/],
    ["paque {monto} de {cosa}", "paque harto de pan", "registrar-gasto", /no calza/],
    ["(hola|paque) [{cosa}]", "paque", "ultimos-gastos", /demasiado general/],
    ["paque {plata}", "paque 500", "registrar-gasto", /ranura desconocida/],
    ["paque {monto}", "paque 500", "pagar-arriendo", /intencion/],
  ];
  for (const [patron, ejemplo, intencion, motivo] of rechazos) {
    it(`rechaza «${patron}» con «${ejemplo}»`, () => {
      const revision = proponer(patron, ejemplo, intencion);
      assert.equal(revision.ok, false);
      assert.match((revision as { motivo: string }).motivo, motivo);
    });
  }

  it("el agente propone por MCP y recibe el motivo si falla", () => {
    const llamar = (args: object) =>
      (atender(gastos, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "motor_proponer_plantilla", arguments: args } }) as any)
        .result;
    const mal = llamar({ ejemplo: "micro 1500", patron: "{cosa} {monto}", intencion: "registrar-gasto" });
    assert.equal(mal.isError, true);
    assert.match(mal.content[0].text, /palabra fija/);
    const bien = llamar({ ejemplo: "anoté 1500 pal micro", patron: "anote {monto} pal {cosa}", intencion: "registrar-gasto" });
    assert.equal(bien.isError, undefined);
    assert.equal(gastos.plantillasPropuestas().length, 1);
  });

  it("calcula el porcentaje resuelto sin IA", () => {
    assert.equal(porcentajeSinIA(gastos), 0);
    gastos.registrarUso("motor", "registrar-gasto", AHORA);
    gastos.registrarUso("motor", "registrar-gasto", AHORA);
    gastos.registrarUso("agente", null, AHORA);
    assert.equal(porcentajeSinIA(gastos), 67);
  });
});

describe("deducir la plantilla de cómo resolvió el agente", () => {
  const casos: [string, { monto: number; descripcion?: string }, string | null][] = [
    ["paque 2 lucas de jugo", { monto: 2000, descripcion: "jugo" }, "paque {monto} de {cosa}"],
    ["paque luca y media de micro", { monto: 1500, descripcion: "micro" }, "paque {monto} de {cosa}"],
    ["Compré un libro en 15 lucas", { monto: 15000, descripcion: "libro" }, "compre {cosa} en {monto}"],
    ["anotame 3 lucas pa la micro", { monto: 3000, descripcion: "micro" }, "anotame {monto} pa {cosa}"],
    ["paque 2 lucas", { monto: 2000 }, "paque {monto}"],
    ["paque 2 lucas de jugo", { monto: 2500, descripcion: "jugo" }, null],
    ["paque 2 lucas de jugo", { monto: 2000, descripcion: "bebida" }, null],
    ["pague 2 lucas de jugo :)", { monto: 2000, descripcion: "jugo" }, null],
  ];
  for (const [frase, anotacion, esperado] of casos) {
    it(`«${frase}» → ${esperado}`, () => assert.equal(deducirPlantilla(frase, anotacion), esperado));
  }

  it("la plantilla deducida pasa la revisión y aprende la frase", () => {
    const frase = "paque 2 lucas de jugo";
    const patron = deducirPlantilla(frase, { monto: 2000, descripcion: "jugo" })!;
    const revision = proponer(patron, frase);
    assert.ok(revision.ok);
    gastos.decidirPlantilla(revision.propuesta.id, true, AHORA);
    assert.match(motor.resolver("paque 800 de chicle")!.texto, /\$800 en chicle/);
  });
});
