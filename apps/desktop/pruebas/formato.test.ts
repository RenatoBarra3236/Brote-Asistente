import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { agregarPaso, cuandoEmpieza, cuentaRegresiva, fechaLarga, gigas, saludo, tamanoCorto } from "../src/agente/formato.ts";

describe("formatos de la isla", () => {
  test("cuenta regresiva y tamaños", () => {
    assert.equal(cuentaRegresiva(65_000), "1:05");
    assert.equal(cuentaRegresiva(3_723_000), "1:02:03");
    assert.equal(cuentaRegresiva(-5), "0:00");
    assert.equal(tamanoCorto(850 * 1024), "850 KB");
    assert.equal(tamanoCorto(1.25 * 1024 ** 3), "1,3 GB");
    assert.equal(gigas(11.4 * 1024 ** 3), "11,4 GB");
    assert.equal(gigas(250 * 1024 ** 3), "250 GB");
    assert.equal(gigas(16 * 1024 ** 3), "16 GB");
  });

  test("cuándo empieza un evento, dicho corto", () => {
    const ahora = new Date(2026, 9, 3, 10, 0).getTime();
    const evento = (h: number, m: number, dia = 3, minutos = 60) => {
      const inicio = new Date(2026, 9, dia, h, m).getTime();
      return { inicioMs: inicio, finMs: inicio + minutos * 60_000, todoElDia: false };
    };
    assert.equal(cuandoEmpieza(evento(10, 25), ahora), "en 25 min");
    assert.equal(cuandoEmpieza(evento(9, 30), ahora), "ahora");
    assert.equal(cuandoEmpieza(evento(8, 0), ahora), "terminó");
    assert.equal(cuandoEmpieza(evento(16, 30), ahora), "a las 16:30");
    assert.equal(cuandoEmpieza(evento(8, 30, 4), ahora), "mañana 8:30");
    assert.equal(cuandoEmpieza({ ...evento(0, 0), todoElDia: true }, ahora), "todo el día");
  });

  test("saludo y fecha", () => {
    assert.equal(saludo(new Date(2026, 9, 3, 9)), "Buenos días");
    assert.equal(saludo(new Date(2026, 9, 3, 15)), "Buenas tardes");
    assert.equal(saludo(new Date(2026, 9, 3, 23)), "Buenas noches");
    assert.equal(saludo(new Date(2026, 9, 3, 2)), "Buenas noches");
    assert.equal(fechaLarga(new Date(2026, 9, 3)), "sábado 3 de octubre");
  });

  test("los pasos de una sesión: sin repetir y solo los últimos", () => {
    let pasos = agregarPaso([], "Leyendo a.ts");
    pasos = agregarPaso(pasos, "Leyendo a.ts");
    pasos = agregarPaso(pasos, "Editando b.ts");
    assert.deepEqual(pasos, ["Leyendo a.ts", "Editando b.ts"]);
    for (const p of ["c", "d", "e"]) pasos = agregarPaso(pasos, p);
    assert.deepEqual(pasos, ["Editando b.ts", "c", "d", "e"]);
    assert.deepEqual(agregarPaso(pasos, ""), pasos);
  });
});
