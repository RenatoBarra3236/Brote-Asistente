import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { armarVocabulario, candidatasDe, corregirFrase, distancia, palabrasDePatron, toleranciaDe } from "../src/corregir.ts";

const vocab = armarVocabulario(["gaste gasto lucas almuerzo cuanto he gastado esta semana este mes hoy ayer presupuesto pomodoro minutos"], ["cafe", "calculo"]);

describe("distancia", () => {
  it("cuenta una letra cambiada, comida, sobrante o dos juntas al revés como 1", () => {
    assert.equal(distancia("gasto", "gasta"), 1);
    assert.equal(distancia("gste", "gaste"), 1);
    assert.equal(distancia("gaaste", "gaste"), 1);
    assert.equal(distancia("semna", "semana"), 1);
    assert.equal(distancia("cuanot", "cuanto"), 1);
    assert.equal(distancia("hola", "chao"), 4);
  });
  it("la tolerancia depende del largo", () => {
    assert.equal(toleranciaDe(2), 0);
    assert.equal(toleranciaDe(3), 1);
    assert.equal(toleranciaDe(6), 1);
    assert.equal(toleranciaDe(12), 2);
  });
});

describe("corregir", () => {
  it("saca las palabras de un patrón sin ranuras ni signos", () => {
    assert.deepEqual(palabrasDePatron("[me] (gaste|pague) {monto} en {cosa}"), ["me", "gaste", "pague", "en"]);
  });
  it("encuentra la palabra parecida y no toca las conocidas", () => {
    assert.deepEqual(candidatasDe("almuerso", vocab), ["almuerzo"]);
    assert.deepEqual(candidatasDe("almuerzo", vocab), []);
    assert.deepEqual(candidatasDe("lucas", vocab), []);
    assert.deepEqual(candidatasDe("completos", armarVocabulario(["completo"])), []);
  });
  it("nunca cambia números, montos ni palabras con cifras", () => {
    const todas = corregirFrase("gste 5 lucs en 3500", vocab);
    for (const c of todas) assert.ok(c.frase.includes("5") && c.frase.includes("3500"));
  });
  it("cambia la jerga y prueba de la que más cambia a la que menos", () => {
    const [primera] = corregirFrase("gaste 5 lukas en almuerso", vocab);
    assert.equal(primera.frase, "gaste 5 lucas en almuerzo");
    assert.equal(primera.cambios.length, 2);
  });
  it("respeta lo que el usuario escribió en lo que no cambia (tildes y mayúsculas)", () => {
    const [c] = corregirFrase("Gasté 3 lukas en Café", vocab);
    assert.equal(c.frase, "Gasté 3 lucas en Café");
  });
  it("«e gastado» es «he gastado» y «oy» es «hoy»", () => {
    assert.ok(corregirFrase("cuanto e gastado oy", vocab).some((c) => c.frase === "cuanto he gastado hoy"));
  });
  it("sin nada que corregir, no devuelve nada", () => {
    assert.deepEqual(corregirFrase("gaste 5 lucas en almuerzo", vocab), []);
  });
  it("una palabra corta de 3 letras solo se perdona si empieza igual (b y v cuentan igual)", () => {
    assert.deepEqual(candidatasDe("mez", armarVocabulario(["mes luz"])), ["mes"]);
    assert.deepEqual(candidatasDe("boy", armarVocabulario(["voy"])), ["voy"]);
    assert.deepEqual(candidatasDe("luz", armarVocabulario(["mes"])), []);
  });
});
