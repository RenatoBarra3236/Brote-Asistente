import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { armarFichaNotas } from "../../../packages/motor/src/notas-ficha.ts";
import type { Evaluacion } from "../../../packages/motor/src/notas-tipos.ts";
import { barrasDeNotas, leerCampoNota, leerCampoPeso, pctDeNota, posicionEnBarra, resumenNotas, semaforoDe, textoExamenFicha, textoMeta, textoNecesaria } from "../src/agente/notas.ts";

const ev = (id: number, peso: number, nota: number | null, nombre = `Certamen ${id}`): Evaluacion => ({ id, ramoId: 1, nombre, peso, nota, fecha: null });
const AJ = { aprobacion: 4, examenPeso: null, examenMinimo: null, presentacionMinima: null };

describe("notas en la isla", () => {
  it("sin evaluaciones: neutro y una invitación a agregarlas", () => {
    const f = armarFichaNotas(1, [], AJ);
    assert.equal(semaforoDe(f), "neutro");
    assert.equal(resumenNotas(f), "Sin notas");
    assert.match(textoMeta(f), /Agrega tus evaluaciones/);
    assert.equal(resumenNotas(undefined), "Sin notas");
  });

  it("una sola evaluación pendiente: «Necesitas un X en Certamen 2»", () => {
    const f = armarFichaNotas(1, [ev(1, 60, 4.2), ev(2, 40, null)], AJ);
    assert.match(textoMeta(f), /Necesitas un 3,7 en Certamen 2 para aprobar/);
    assert.equal(textoNecesaria(f.necesarias[2]), "necesitas 3,7");
    assert.equal(semaforoDe(f), "verde");
    assert.match(resumenNotas(f), /promedio 4,2 · necesitas 3,7/);
  });

  it("exige mucho: ámbar; no alcanza: rojo; ya aprobó: verde", () => {
    assert.equal(semaforoDe(armarFichaNotas(1, [ev(1, 60, 2.5), ev(2, 40, null)], AJ)), "ambar"); // falta un 6,3
    const imposible = armarFichaNotas(1, [ev(1, 90, 1.5), ev(2, 10, null)], AJ);
    assert.equal(semaforoDe(imposible), "rojo");
    assert.match(textoMeta(imposible), /Ni sacando 7,0/);
    assert.equal(textoNecesaria(imposible.necesarias[2]), "ya no alcanza");
    const aprobado = armarFichaNotas(1, [ev(1, 90, 7), ev(2, 10, null)], AJ);
    assert.equal(semaforoDe(aprobado), "verde");
    assert.match(textoMeta(aprobado), /aprobado/);
    assert.equal(textoNecesaria(aprobado.necesarias[2]), "sin presión");
  });

  it("varias pendientes: promedio de lo que falta; con examen lo dice", () => {
    const f = armarFichaNotas(1, [ev(1, 30, 4.2), ev(2, 30, null)], { ...AJ, examenPeso: 40 });
    assert.match(textoMeta(f), /% que falta \(incluye el examen\)/);
    assert.match(textoExamenFicha(f) ?? "", /falta alguna nota del período/);
    const completo = armarFichaNotas(1, [ev(1, 50, 4.4), ev(2, 50, 3.8)], { ...AJ, examenPeso: 30 });
    assert.match(textoExamenFicha(completo) ?? "", /presentación 4,1 necesitas 3,8/);
    assert.equal(textoExamenFicha(armarFichaNotas(1, [ev(1, 100, 5)], AJ)), null);
  });

  it("campos: coma o punto, vacío = pendiente, fuera de escala = error", () => {
    assert.deepEqual(leerCampoNota("5,5"), { ok: true, nota: 5.5 });
    assert.deepEqual(leerCampoNota("5.5"), { ok: true, nota: 5.5 });
    assert.deepEqual(leerCampoNota(" "), { ok: true, nota: null });
    for (const mal of ["8", "0,5", "abc", "5,5,5"]) assert.equal(leerCampoNota(mal).ok, false, mal);
    assert.deepEqual(leerCampoPeso("30 %"), { ok: true, peso: 30 });
    assert.deepEqual(leerCampoPeso("30"), { ok: true, peso: 30 });
    for (const mal of ["0", "101", "3,5", "mucho", ""]) assert.equal(leerCampoPeso(mal).ok, false, mal);
  });

  it("la barra de 1,0 a 7,0", () => {
    assert.equal(posicionEnBarra(1), 0);
    assert.equal(posicionEnBarra(7), 100);
    assert.equal(posicionEnBarra(4), 50);
    assert.equal(posicionEnBarra(9), 100);
  });
});

describe("la comparación de ramos", () => {
  const ficha = (ramoId: number, evals: Evaluacion[], aprobacion = 4) => armarFichaNotas(ramoId, evals.map((e) => ({ ...e, ramoId })), { ...AJ, aprobacion });

  it("pone la escala 1,0–7,0 de 0 a 100 %", () => {
    assert.equal(pctDeNota(1), 0);
    assert.equal(pctDeNota(4), 50);
    assert.equal(pctDeNota(7), 100);
    assert.equal(pctDeNota(0), 0);
    assert.equal(pctDeNota(9), 100);
  });

  it("ordena con el ramo más en riesgo primero y trae su semáforo", () => {
    const seguro = ficha(1, [ev(1, 60, 6.5), ev(2, 40, null)]); // 6,5: aprobado de sobra
    const riesgo = ficha(2, [ev(1, 60, 2.5), ev(2, 40, null)]); // 2,5: falta un 6,3 → ámbar
    const imposible = ficha(3, [ev(1, 90, 1.5), ev(2, 10, null)]);
    const barras = barrasDeNotas([seguro, riesgo, imposible], new Set([1, 2, 3]));
    assert.deepEqual(barras.map((b) => b.ramoId), [3, 2, 1]);
    assert.deepEqual(barras.map((b) => b.semaforo), ["rojo", "ambar", "verde"]);
    assert.equal(barras[1].aprobacionPct, 50);
    assert.ok(Math.abs(barras[1].pct - pctDeNota(2.5)) < 1e-9);
    assert.match(barras[1].texto, /promedio 2,5 · necesitas/);
  });

  it("usa la aprobación propia de cada ramo y deja fuera lo que no se compara", () => {
    const exigente = ficha(1, [ev(1, 50, 5.4), ev(2, 50, null)], 5.5);
    const sinNotas = ficha(2, [ev(1, 50, null), ev(2, 50, null)]);
    const vacio = ficha(3, []);
    const archivado = ficha(4, [ev(1, 100, 6)]);
    const barras = barrasDeNotas([exigente, sinNotas, vacio, archivado], new Set([1, 2, 3]));
    assert.deepEqual(barras.map((b) => b.ramoId), [1]);
    assert.equal(barras[0].aprobacionPct, pctDeNota(5.5));
    assert.deepEqual(barrasDeNotas([], new Set()), []);
  });
});
