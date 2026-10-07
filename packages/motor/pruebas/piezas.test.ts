import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hallarCategoria, hallarHora, hallarMes, hallarMontos, hallarNombre, hallarPeriodo, hallarTiempo, tokenizar } from "../src/piezas.ts";
import { proponer } from "../src/piezas-reglas.ts";

const montos = (frase: string) => hallarMontos(tokenizar(frase)).map((m) => [m.texto, m.valor]);
const ctx = { ramos: ["Cálculo", "Física"], metas: ["viaje"] };

describe("montos", () => {
  it("lee lucas, mil, pesos con signo y cifras sueltas", () => {
    assert.deepEqual(montos("gasté 5 lucas en almuerzo"), [["5 lucas", 5000]]);
    assert.deepEqual(montos("compré un cuaderno por 2 mil"), [["2 mil", 2000]]);
    assert.deepEqual(montos("café $3.500"), [["$3.500", 3500]]);
    assert.deepEqual(montos("pasaje 700"), [["700", 700]]);
    assert.deepEqual(montos("una luca y media"), [["una luca y media", 1500]]);
  });
  it("no confunde horas, duraciones, notas ni números chicos con montos", () => {
    assert.deepEqual(montos("a las 16:30"), []);
    assert.deepEqual(montos("a las 9"), []);
    assert.deepEqual(montos("estudié 2 horas"), []);
    assert.deepEqual(montos("pomodoro de 30 minutos"), []);
    assert.deepEqual(montos("me saqué 5,5"), []);
    assert.deepEqual(montos("tengo 5 hermanos"), []);
  });
  it("devuelve todos los montos para que quien llama no adivine entre dos", () => {
    assert.equal(montos("gasté 5 lucas y 3 mil").length, 2);
  });
});

describe("otras piezas", () => {
  it("periodo, categoría, duración, hora, mes y nombres", () => {
    assert.equal(hallarPeriodo("cuanto gaste el mes pasado"), "el mes pasado");
    assert.equal(hallarPeriodo("esta semana"), "esta semana");
    assert.equal(hallarPeriodo("hola"), null);
    assert.equal(hallarCategoria("cuanto en transporte"), "transporte");
    assert.equal(hallarTiempo("quiero estudiar 30 minutos"), "30 minutos");
    assert.equal(hallarTiempo("en media hora"), "media hora");
    assert.equal(hallarHora("agenda dentista a las 16:30"), "16:30");
    assert.equal(hallarMes("para marzo"), "marzo");
    assert.equal(hallarNombre("como voy en fisica", ["Física"]), "fisica");
    assert.equal(hallarNombre("como voy en calculo", ["Física"]), null);
  });
});

describe("reglas: frases en la forma de la guía", () => {
  it("gastos: el monto sale tal cual lo escribió el usuario", () => {
    assert.deepEqual(proponer("almuerzo 5 lucas", ctx), ["gaste 5 lucas en almuerzo"]);
    assert.ok(proponer("se me fueron 8 lucas en una pizza", ctx).includes("gaste 8 lucas en pizza"));
  });
  it("con dos montos no adivina", () => {
    assert.deepEqual(proponer("gasté 5 lucas y 3 mil en el almuerzo", ctx).filter((f) => f.startsWith("gaste")), []);
  });
  it("controles: no propone nada", () => {
    for (const f of ["cuánto cuesta un iPhone", "me costó entender la clase", "tengo 5 hermanos", "qué es un presupuesto"]) assert.deepEqual(proponer(f, ctx), [], f);
  });
  it("estudio con ramos conocidos", () => {
    assert.ok(proponer("en física me saqué un 4,8", ctx).includes("me saque 4,8 en fisica"));
    assert.ok(proponer("ya no tengo cálculo", ctx).includes("quita el ramo calculo"));
  });
  it("calendario: crea con hora o duración", () => {
    assert.ok(proponer("reunión con el profe a las 17:00", ctx).includes("anota en el calendario reunión con el profe a las 17:00"));
    assert.ok(proponer("tengo prueba de física el viernes a las 9", ctx).includes("agenda prueba de física el viernes a las 9"));
    assert.ok(proponer("agéndame una cita en 2 horas", ctx).includes("anota en el calendario cita en 2 horas"));
  });
});
