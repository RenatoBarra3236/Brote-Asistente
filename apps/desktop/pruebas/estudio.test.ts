import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLORES_RAMO } from "../../../packages/motor/src/ramos-tipos.ts";
import { HEX_RAMO, aliasParaEditar, colorDeRamo, cuandoClase, cuandoVence, explicarFichaVacia, leerAlias, resumenDeFicha, textoSugerencia } from "../src/agente/estudio.ts";

const AHORA = new Date(2026, 9, 5, 12).getTime();
const HORA = 3_600_000;

describe("textos de la pestaña Estudio", () => {
  it("la paleta de la ventana tiene todos los colores del motor", () => {
    assert.deepEqual(Object.keys(HEX_RAMO).sort(), [...COLORES_RAMO].sort());
    for (const hex of Object.values(HEX_RAMO)) assert.match(hex, /^#[0-9a-f]{6}$/);
  });

  it("colorDeRamo busca por id y devuelve null si no hay", () => {
    const ramos = [{ id: 4, nombre: "Física", color: "verde" as const, alias: [], archivado: false }];
    assert.equal(colorDeRamo(ramos, 4), HEX_RAMO.verde);
    assert.equal(colorDeRamo(ramos, 9), null);
    assert.equal(colorDeRamo(ramos, null), null);
  });

  it("cuándo es una clase", () => {
    assert.equal(cuandoClase(new Date(2026, 9, 5, 15, 30).getTime(), AHORA), "hoy 15:30");
    assert.equal(cuandoClase(new Date(2026, 9, 6, 8, 0).getTime(), AHORA), "mañana 08:00");
    assert.equal(cuandoClase(new Date(2026, 9, 9, 9, 0).getTime(), AHORA), "vie 9 · 09:00");
  });

  it("cuándo vence algo", () => {
    assert.equal(cuandoVence(AHORA - HORA, AHORA), "vencida");
    assert.equal(cuandoVence(AHORA + 10 * 60_000, AHORA), "en menos de 1 h");
    assert.equal(cuandoVence(AHORA + 5 * HORA, AHORA), "en 5 h");
    assert.equal(cuandoVence(AHORA + 30 * HORA, AHORA), "mañana");
    assert.equal(cuandoVence(AHORA + 72 * HORA, AHORA), "en 3 días");
  });

  it("resume la ficha en singular y plural, y vacía si no hay nada", () => {
    const base = { ramo: { id: 1, nombre: "A", color: "azul" as const, alias: [], archivado: false }, clases: [], entregas: [], tareas: [], transcripciones: 0 };
    assert.equal(resumenDeFicha(base), "");
    const f = { ...base, clases: [{ titulo: "x", inicioMs: 1, finMs: 2 }], entregas: [{ titulo: "a", entregaMs: 1 }, { titulo: "b", entregaMs: 2 }], transcripciones: 1 };
    assert.equal(resumenDeFicha(f), "1 clase · 2 entregas · 1 transcripción");
  });

  it("explica por qué un ramo está vacío", () => {
    assert.match(explicarFichaVacia({ calendario: false, aula: false }, false), /Conecta tu calendario/);
    assert.match(explicarFichaVacia({ calendario: true, aula: false }, false), /palabra clave/);
    assert.doesNotMatch(explicarFichaVacia({ calendario: true, aula: false }, true), /palabra clave/);
  });

  it("sugerencias y palabras clave", () => {
    assert.equal(textoSugerencia({ nombre: "Álgebra", origen: "aula" }), "Álgebra · de tu aula");
    assert.equal(textoSugerencia({ nombre: "Álgebra", origen: "calendario" }), "Álgebra · se repite en tu calendario");
    assert.deepEqual(leerAlias(" calc, cal 2;;  \n mate "), ["calc", "cal 2", "mate"]);
    assert.equal(aliasParaEditar(["calc", "cal 2"]), "calc, cal 2");
    assert.deepEqual(leerAlias(""), []);
  });
});
