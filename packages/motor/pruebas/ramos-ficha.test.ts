import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { armarFichas, sugerirRamos, MAX_SUGERENCIAS } from "../src/ramos-ficha.ts";
import type { Ramo } from "../src/ramos-tipos.ts";

const HORA = 3_600_000;
const AHORA = new Date(2026, 9, 5, 12).getTime();
const calculo: Ramo = { id: 1, nombre: "Cálculo", color: "azul", alias: ["calc"], archivado: false };
const fisica: Ramo = { id: 2, nombre: "Física", color: "verde", alias: [], archivado: false };

describe("ficha de un ramo", () => {
  const fuentes = {
    eventos: [
      { titulo: "Cálculo II - clase", inicioMs: AHORA + 2 * HORA, finMs: AHORA + 3 * HORA },
      { titulo: "calc ayudantía", inicioMs: AHORA + 26 * HORA, finMs: AHORA + 27 * HORA },
      { titulo: "Cálculo (ya pasó)", inicioMs: AHORA - 5 * HORA, finMs: AHORA - 4 * HORA },
      { titulo: "Dentista", inicioMs: AHORA + HORA, finMs: AHORA + 2 * HORA },
    ],
    entregas: [
      { curso: "Física General", titulo: "Informe 2", entregaMs: AHORA + 30 * HORA, entregada: false },
      { curso: "Física General", titulo: "Informe 1", entregaMs: AHORA + 10 * HORA, entregada: true },
      { curso: "Cálculo", titulo: "Guía 3", entregaMs: AHORA - HORA, entregada: false },
    ],
    tareas: [
      { id: 1, titulo: "Resolver guía", venceMs: AHORA + 5 * HORA, hecha: false },
      { id: 2, titulo: "Leer capítulo", venceMs: AHORA + 6 * HORA, hecha: true },
      { id: 3, titulo: "Sin ramo", venceMs: AHORA + 7 * HORA, hecha: false },
    ],
    ramoDeTarea: new Map([["1", 1], ["2", 1]]),
    ramoDeGrabacion: new Map([["2026-10-05-080000", 1], ["2026-10-04-080000", 1], ["2026-10-03-080000", 2]]),
  };

  test("junta clases, entregas, tareas y transcripciones de cada ramo", () => {
    const [c, f] = armarFichas([calculo, fisica], fuentes, AHORA);
    assert.deepEqual(c.clases.map((x) => x.titulo), ["Cálculo II - clase", "calc ayudantía"]);
    assert.deepEqual(c.entregas, [], "la de Cálculo ya venció");
    assert.deepEqual(c.tareas.map((t) => t.id), [1], "la hecha no sale");
    assert.equal(c.transcripciones, 2);
    assert.deepEqual(f.entregas.map((e) => e.titulo), ["Informe 2"], "la entregada no sale");
    assert.equal(f.clases.length, 0);
    assert.equal(f.transcripciones, 1);
  });

  test("los ramos archivados no tienen ficha y como mucho 3 clases", () => {
    const muchos = { ...fuentes, eventos: Array.from({ length: 6 }, (_, i) => ({ titulo: "Cálculo", inicioMs: AHORA + (i + 1) * HORA, finMs: AHORA + (i + 2) * HORA })) };
    const fichas = armarFichas([calculo, { ...fisica, archivado: true }], muchos, AHORA);
    assert.equal(fichas.length, 1);
    assert.equal(fichas[0].clases.length, 3);
  });
});

describe("sugerir ramos", () => {
  test("ofrece los cursos del aula y los eventos que se repiten, sin los que ya son ramos", () => {
    const eventos = ["Álgebra lineal", "álgebra Lineal", "ALGEBRA LINEAL", "Cálculo clase", "Cálculo clase", "Cálculo clase", "Dentista", "Dentista"];
    const s = sugerirRamos(["Historia del Arte", "Física"], eventos, [fisica, calculo]);
    assert.deepEqual(s, [
      { nombre: "Historia del Arte", origen: "aula" },
      { nombre: "Álgebra lineal", origen: "calendario" },
    ]);
  });

  test("sin repetidos, vacíos ni más de lo permitido", () => {
    const cursos = Array.from({ length: 10 }, (_, i) => `Curso número ${i}`);
    assert.equal(sugerirRamos([...cursos, "Curso número 1", "x"], [], []).length, MAX_SUGERENCIAS);
    assert.deepEqual(sugerirRamos([], ["Almuerzo", "Almuerzo"], []), []);
  });
});
