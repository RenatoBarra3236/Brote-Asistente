import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FrasesAprendidas, FrasesNoEntendidas, formaDe, rellenar } from "../src/frases-locales.ts";
import { Gastos } from "../src/gastos.ts";

describe("forma de una frase", () => {
  it("cambia el monto por {monto} y lo devuelve aparte", () => {
    assert.deepEqual(formaDe("Almuerzo 5 lucas"), { forma: "almuerzo {monto}", monto: "5 lucas" });
    assert.deepEqual(formaDe("hola brote"), { forma: "hola brote", monto: null });
    assert.equal(formaDe("5 lucas y 3 mil"), null);
    assert.equal(rellenar("gaste {monto} en almuerzo", "8 lucas"), "gaste 8 lucas en almuerzo");
    assert.equal(rellenar("gaste {monto} en almuerzo", null), null);
  });
});

describe("frases aprendidas", () => {
  it("recuerda una frase confirmada y la entiende con otro monto", () => {
    const f = new FrasesAprendidas(new Gastos(":memory:"));
    assert.equal(f.recordar("almuerzo 5 lucas", "gaste 5 lucas en almuerzo", 1), true);
    assert.equal(f.buscar("almuerzo 8 lucas"), "gaste 8 lucas en almuerzo");
    assert.equal(f.buscar("cena 8 lucas"), null);
    assert.equal(f.listar().length, 1);
    assert.equal(f.listar()[0].forma, "almuerzo {monto}");
  });
  it("no recuerda si el monto de la frase de la guía no es el mismo (nunca se corrige un monto)", () => {
    const f = new FrasesAprendidas(new Gastos(":memory:"));
    assert.equal(f.recordar("almuerzo 5 lucas", "gaste 6 lucas en almuerzo", 1), false);
    assert.equal(f.recordar("almuerzo", "gaste 5 lucas en almuerzo", 1), false);
    assert.equal(f.listar().length, 0);
  });
  it("se puede olvidar de a una o todas", () => {
    const f = new FrasesAprendidas(new Gastos(":memory:"));
    f.recordar("hola brote", "ayuda", 1);
    f.recordar("el sábado", "que tengo hoy", 2);
    assert.equal(f.olvidar("hola brote"), true);
    assert.equal(f.olvidarTodas(), 1);
    assert.deepEqual(f.listar(), []);
  });
  it("guarda como mucho 300", () => {
    const f = new FrasesAprendidas(new Gastos(":memory:"));
    for (let i = 0; i < 320; i++) f.recordar(`frase numero ${i}x`, "ayuda", i);
    assert.equal(f.listar().length, 300);
  });
});

describe("frases que no se entendieron", () => {
  it("apagado de fábrica: no guarda nada", () => {
    const n = new FrasesNoEntendidas(new Gastos(":memory:"));
    assert.equal(n.activo(), false);
    assert.equal(n.guardar("blablabla", 1), false);
    assert.deepEqual(n.listar(), []);
  });
  it("con permiso las guarda, sin repetir, y se ven y se borran aunque se apague", () => {
    const n = new FrasesNoEntendidas(new Gastos(":memory:"));
    n.ponerActivo(true);
    assert.equal(n.guardar("blablabla", 1), true);
    assert.equal(n.guardar("blablabla", 2), true);
    n.guardar("otra cosa", 3);
    assert.deepEqual(n.listar().map((x) => x.frase), ["otra cosa", "blablabla"]);
    n.ponerActivo(false);
    assert.equal(n.listar().length, 2);
    assert.equal(n.borrar(n.listar()[0].id), true);
    assert.equal(n.borrarTodas(), 1);
  });
  it("corta las frases largas y guarda como mucho 200", () => {
    const n = new FrasesNoEntendidas(new Gastos(":memory:"));
    n.ponerActivo(true);
    n.guardar("x".repeat(500), 1);
    assert.equal(n.listar()[0].frase.length, 200);
    for (let i = 0; i < 230; i++) n.guardar(`frase ${i}`, i + 10);
    assert.equal(n.listar().length, 200);
  });
});
