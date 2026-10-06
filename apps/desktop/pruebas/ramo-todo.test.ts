import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FILTROS, avisoDeFuentes, cuandoDeItem, destinoDe, emojiDe, explicarTodoVacio, filtrarItems, filtrosConDatos, textoMasResultados, TEXTO_RAMO_VACIO } from "../src/agente/ramo-todo.ts";
import type { ItemDeRamo } from "../src/agente/ramo-todo.ts";

const AHORA = new Date(2026, 9, 5, 12).getTime();
const item = (tipo: ItemDeRamo["tipo"], extra: Partial<ItemDeRamo> = {}): ItemDeRamo => ({ ramoId: 1, tipo, titulo: tipo, cuandoMs: AHORA + 3_600_000, estado: "pendiente", ref: null, ...extra });
const items = [item("clase"), item("entrega"), item("tarea"), item("prueba"), item("estudio"), item("repaso"), item("grabacion", { estado: "pasado" }), item("documento", { estado: "pasado" })];

describe("todo lo de un ramo en la isla", () => {
  it("filtra por tipo y no ofrece filtros vacíos", () => {
    assert.equal(filtrarItems(items, "todo").length, 8);
    assert.deepEqual(filtrarItems(items, "documentos").map((i) => i.tipo), ["documento"]);
    assert.deepEqual(filtrarItems(items, "tareas").map((i) => i.tipo), ["entrega", "tarea"]);
    assert.deepEqual(filtrarItems(items, "pruebas").map((i) => i.tipo), ["prueba", "estudio"]);
    assert.deepEqual(filtrosConDatos([item("clase")]).map((f) => f.id), ["todo", "clases"]);
    assert.deepEqual(filtrosConDatos([]).map((f) => f.id), ["todo"]);
    assert.equal(FILTROS.length, 7);
  });
  it("cada tipo tiene su emoji y su destino", () => {
    for (const i of items) assert.ok(emojiDe(i.tipo).length > 0);
    assert.deepEqual(destinoDe(item("clase")), { pestana: "agenda" });
    assert.deepEqual(destinoDe(item("tarea")), { pestana: "agenda" });
    assert.deepEqual(destinoDe(item("grabacion")), { pestana: "grabar" });
    assert.deepEqual(destinoDe(item("documento")), { pestana: "estudio" });
    assert.deepEqual(destinoDe(item("repaso", { ramoId: 4 })), { repaso: 4 });
  });
  it("dice cuándo: hoy con hora, hecho o «hoy» para el repaso", () => {
    assert.equal(cuandoDeItem(item("clase"), AHORA), "hoy 13:00");
    assert.equal(cuandoDeItem(item("tarea", { estado: "hecho" }), AHORA), "hecho");
    assert.equal(cuandoDeItem(item("repaso"), AHORA), "hoy");
  });
  it("explica un ramo vacío según lo que esté prendido", () => {
    assert.match(explicarTodoVacio({ calendario: false, aula: false }, true), /Configurar Brote/);
    assert.equal(explicarTodoVacio({ calendario: true, aula: false }, true), TEXTO_RAMO_VACIO);
    assert.match(explicarTodoVacio({ calendario: true, aula: true }, false), /palabra clave/);
  });
  it("avisa lo que no se pudo mirar", () => {
    assert.equal(avisoDeFuentes({ calendario: true, aula: true }), "");
    assert.equal(avisoDeFuentes({ calendario: false, aula: true }), "Sin clases del calendario (apagado).");
    assert.equal(avisoDeFuentes({ calendario: false, aula: false }), "Sin clases del calendario ni entregas del aula (apagado).");
    assert.equal(textoMasResultados(15, 12), "+3 más");
    assert.equal(textoMasResultados(3, 3), "");
  });
});
