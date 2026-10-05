import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularRamo, formatearNota, leerNota, notaNecesaria, notaNecesariaExamen, validarAjustes, validarEvaluacion } from "../src/notas-tipos.ts";
import type { Evaluacion } from "../src/notas-tipos.ts";

function ev(id: number, peso: number, nota: number | null, nombre = `Certamen ${id}`): Evaluacion {
  return { id, ramoId: 1, nombre, peso, nota, fecha: null };
}

test("leerNota acepta coma y punto, y rechaza lo que no es nota", () => {
  assert.equal(leerNota("5,5"), 5.5);
  assert.equal(leerNota("4.2"), 4.2);
  assert.equal(leerNota("6"), 6);
  for (const mal of ["0,9", "7,1", "8", "10", "4200", "abc", "", "5,5,5"]) assert.equal(leerNota(mal), null, mal);
  assert.equal(formatearNota(5.5), "5,5");
  assert.equal(formatearNota(4), "4,0");
});

test("validarEvaluacion", () => {
  const ok = validarEvaluacion({ nombre: " Certamen  1 ", peso: 30, nota: 5.55, fecha: "2026-10-20" });
  assert.deepEqual(ok, { ok: true, nombre: "Certamen 1", peso: 30, nota: 5.6, fecha: "2026-10-20" });
  assert.equal(validarEvaluacion({ nombre: "X", peso: 30 }).ok, false);
  assert.equal(validarEvaluacion({ nombre: "Certamen", peso: 0 }).ok, false);
  assert.equal(validarEvaluacion({ nombre: "Certamen", peso: 101 }).ok, false);
  assert.equal(validarEvaluacion({ nombre: "Certamen", peso: 30.5 }).ok, false);
  assert.equal(validarEvaluacion({ nombre: "Certamen", peso: "30" }).ok, false);
  assert.equal(validarEvaluacion({ nombre: "Certamen", peso: 30, nota: 7.5 }).ok, false);
  assert.equal(validarEvaluacion({ nombre: "Certamen", peso: 30, fecha: "mañana" }).ok, false);
  assert.equal(validarEvaluacion({ nombre: "Certamen", peso: 30, nota: null }).ok, true);
});

test("validarAjustes: por defecto 4,0 y valida los límites", () => {
  const por = validarAjustes({});
  assert.ok(por.ok);
  assert.equal(por.ajustes.aprobacion, 4);
  assert.equal(validarAjustes({ aprobacion: 8 }).ok, false);
  assert.equal(validarAjustes({ examenPeso: 100 }).ok, false);
  assert.equal(validarAjustes({ examenPeso: 30, examenMinimo: 3.5 }).ok, true);
  assert.equal(validarAjustes({ examenMinimo: 9 }).ok, false);
});

test("calcularRamo: promedio y nota necesaria", () => {
  const r = calcularRamo([ev(1, 30, 4.2), ev(2, 30, null), ev(3, 40, null)]);
  assert.equal(r.promedio, 4.2);
  assert.equal(r.pesoPendiente, 70);
  assert.equal(r.veredicto, "alcanza");
  assert.ok(Math.abs((r.necesariaEnPendientes as number) - (400 - 126) / 70) < 1e-9);
  assert.equal(r.avisoPeso, null);
  assert.equal(r.maximoPosible, 6.2); // (126 + 7×70) ÷ 100 = 6,16
});

test("calcularRamo: ya aprobado, imposible y sin nada rendido", () => {
  assert.equal(calcularRamo([ev(1, 80, 7), ev(2, 20, null)]).veredicto, "aprobado");
  const imposible = calcularRamo([ev(1, 80, 1.5), ev(2, 20, null)]);
  assert.equal(imposible.veredicto, "imposible");
  assert.equal(imposible.maximoPosible, 2.6);
  const nada = calcularRamo([ev(1, 50, null), ev(2, 50, null)]);
  assert.equal(nada.promedio, null);
  assert.equal(nada.necesariaEnPendientes, 4);
});

test("calcularRamo: sin pendientes decide por el promedio y avisa si el peso no suma 100", () => {
  assert.equal(calcularRamo([ev(1, 50, 4), ev(2, 50, 4)]).veredicto, "aprobado");
  assert.equal(calcularRamo([ev(1, 50, 3.9), ev(2, 50, 4)]).veredicto, "sin-pendientes-reprobado");
  const r = calcularRamo([ev(1, 30, 5), ev(2, 60, null)]);
  assert.match(r.avisoPeso ?? "", /90 %/);
  assert.equal(calcularRamo([]).avisoPeso, null);
});

test("aprobación configurable por ramo", () => {
  const evals = [ev(1, 50, 5), ev(2, 50, null)];
  const a4 = notaNecesaria(evals, 2)!;
  const a55 = notaNecesaria(evals, 2, { aprobacion: 5.5, examenPeso: null, examenMinimo: null, presentacionMinima: null })!;
  assert.equal(a4.exacta, 3);
  assert.equal(a55.exacta, 6);
});

test("notaNecesaria: «con 4,2 en el certamen 1, ¿cuánto en el 2?»", () => {
  // 30/30/40; el 1 en 4,2 (escenario); las demás pendientes se suponen con la misma nota
  const evals = [ev(1, 30, null), ev(2, 30, null), ev(3, 40, null)];
  const r = notaNecesaria(evals, 2, undefined, new Map([[1, 4.2]]))!;
  assert.ok(Math.abs(r.exacta - (400 - 126) / 70) < 1e-9);
  assert.equal(r.redondeada, 4); // 3,914 sube a 4,0
  assert.equal(r.veredicto, "alcanza");
  assert.equal(r.supuesto, true);
});

test("notaNecesaria: redondea hacia arriba y no se queda corta", () => {
  const r = notaNecesaria([ev(1, 40, 3.8), ev(2, 60, null)], 2)!;
  // (400 - 152) / 60 = 4,1333 → 4,2
  assert.equal(r.redondeada, 4.2);
  assert.ok(r.redondeada >= r.exacta);
});

test("notaNecesaria: imposible, aprobado, id inexistente y evaluación ya rendida", () => {
  assert.equal(notaNecesaria([ev(1, 90, 1.2), ev(2, 10, null)], 2)!.veredicto, "imposible");
  assert.equal(notaNecesaria([ev(1, 90, 7), ev(2, 10, null)], 2)!.veredicto, "aprobado");
  assert.equal(notaNecesaria([ev(1, 50, 5), ev(2, 50, null)], 99), null);
  assert.equal(notaNecesaria([ev(1, 50, 5), ev(2, 50, null)], 1), null);
});

test("notaNecesaria: el escenario no modifica las evaluaciones", () => {
  const evals = [ev(1, 50, null), ev(2, 50, null)];
  notaNecesaria(evals, 2, undefined, new Map([[1, 5]]));
  assert.equal(evals[0].nota, null);
});

const CON_EXAMEN = { aprobacion: 4, examenPeso: 30, examenMinimo: null, presentacionMinima: null };

test("examen: nota necesaria según presentación", () => {
  const r = notaNecesariaExamen([ev(1, 50, 4.4), ev(2, 50, 3.8)], CON_EXAMEN)!;
  // presentación 4,1 → (4 − 4,1×0,7)/0,3 = 3,77
  assert.equal(r.presentacion, 4.1);
  assert.equal(r.redondeada, 3.8); // 3,77 sube a 3,8
  assert.equal(r.veredicto, "alcanza");
  const bajo = notaNecesariaExamen([ev(1, 100, 3.0)], CON_EXAMEN)!;
  assert.equal(bajo.redondeada, 6.4);
});

test("examen: nota mínima manda cuando es más alta, y presentación mínima", () => {
  const conMin = { ...CON_EXAMEN, examenMinimo: 4 };
  const r = notaNecesariaExamen([ev(1, 100, 6.5)], conMin)!;
  assert.equal(r.redondeada, 4);
  assert.equal(r.manda, "minimo");
  const sinPres = notaNecesariaExamen([ev(1, 100, 3.4)], { ...CON_EXAMEN, presentacionMinima: 3.5 })!;
  assert.equal(sinPres.veredicto, "sin-presentacion-minima");
});

test("examen: sin examen configurado es null; con notas pendientes falta la presentación", () => {
  assert.equal(notaNecesariaExamen([ev(1, 100, 5)], { aprobacion: 4, examenPeso: null, examenMinimo: null, presentacionMinima: null }), null);
  assert.equal(notaNecesariaExamen([ev(1, 50, 5), ev(2, 50, null)], CON_EXAMEN)!.veredicto, "falta-presentacion");
  assert.equal(notaNecesariaExamen([], CON_EXAMEN)!.veredicto, "falta-presentacion");
});

test("examen: imposible de aprobar", () => {
  const r = notaNecesariaExamen([ev(1, 100, 1.5)], CON_EXAMEN)!;
  assert.equal(r.veredicto, "imposible");
});

test("calcularRamo: el examen cuenta como pendiente y los pesos suman 100 con él", () => {
  const r = calcularRamo([ev(1, 30, 5), ev(2, 30, 5)], CON_EXAMEN_40);
  assert.equal(r.pesoPendiente, 40);
  assert.equal(r.pesoTotal, 100);
  assert.equal(r.avisoPeso, null);
  assert.equal(r.veredicto, "alcanza");
  assert.ok(Math.abs((r.necesariaEnPendientes as number) - (400 - 300) / 40) < 1e-9);
});
const CON_EXAMEN_40 = { aprobacion: 4, examenPeso: 40, examenMinimo: null, presentacionMinima: null };
