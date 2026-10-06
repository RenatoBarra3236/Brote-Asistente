import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { elegirTexto, leerAprobados, ramosPorCelebrar, textoBloqueHecho, textoRamoAprobado, textoTareaHecha } from "../src/celebraciones.ts";

describe("las celebraciones de lo escolar", () => {
  it("rota las frases y nunca se sale de la lista", () => {
    assert.notEqual(textoTareaHecha(0), textoTareaHecha(1));
    assert.equal(textoTareaHecha(0), textoTareaHecha(3), "da la vuelta");
    assert.equal(elegirTexto(["a", "b"], -1), "b");
    assert.match(textoBloqueHecho(0), /^📚/);
    for (let n = 0; n < 3; n++) assert.ok(textoTareaHecha(n).length <= 38 && textoBloqueHecho(n).length <= 38, "caben en el ala");
    assert.match(textoTareaHecha(2), /^✅/);
  });

  it("dice el ramo aprobado", () => {
    assert.equal(textoRamoAprobado("Cálculo"), "🎉 ¡Aprobaste Cálculo! 🌱");
  });

  it("la primera vez da por celebrado lo que ya estaba aprobado, sin festejarlo", () => {
    assert.deepEqual(ramosPorCelebrar([1, 2], null), { celebrar: [], guardar: [1, 2] });
    assert.deepEqual(ramosPorCelebrar([], null), { celebrar: [], guardar: [] });
  });

  it("después celebra solo los ramos que pasan a aprobados, una vez cada uno", () => {
    assert.deepEqual(ramosPorCelebrar([1, 2, 3], [1]), { celebrar: [2, 3], guardar: [1, 2, 3] });
    assert.deepEqual(ramosPorCelebrar([1, 2, 3], [1, 2, 3]), { celebrar: [], guardar: [1, 2, 3] });
    assert.deepEqual(ramosPorCelebrar([2], [1, 2]), { celebrar: [], guardar: [1, 2] }, "uno que dejó de estar aprobado no se borra: si vuelve, no se repite");
  });

  it("lee lo guardado sin fiarse", () => {
    assert.deepEqual(leerAprobados("[1,2]"), [1, 2]);
    assert.deepEqual(leerAprobados('[1,"x",-3,2.5,4]'), [1, 4]);
    assert.equal(leerAprobados("no es json"), null);
    assert.equal(leerAprobados('{"a":1}'), null);
    assert.equal(leerAprobados(null), null);
  });
});
