import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { armarTodoDeRamos, buscarEnItems, buscarEnRamos, cuandoEs, resumirRamo, textoResumenRamo, tituloDeGrabacion } from "../src/ramo-todo.ts";
import type { FuentesRamo } from "../src/ramo-todo.ts";
import type { Ramo } from "../src/ramos-tipos.ts";

const HORA = 3_600_000;
const DIA = 24 * HORA;
const AHORA = new Date(2026, 9, 5, 12).getTime();
const calculo: Ramo = { id: 1, nombre: "Cálculo", color: "azul", alias: ["calc"], archivado: false };
const fisica: Ramo = { id: 2, nombre: "Física", color: "verde", alias: [], archivado: false };
const vieja: Ramo = { id: 3, nombre: "Historia", color: "gris", alias: [], archivado: true };

const fuentes: FuentesRamo = {
  eventos: [
    { titulo: "Cálculo II - clase", inicioMs: AHORA + 2 * HORA, finMs: AHORA + 3 * HORA },
    { titulo: "calc ayudantía", inicioMs: AHORA + DIA, finMs: AHORA + DIA + HORA },
    { titulo: "Cálculo (esta mañana)", inicioMs: AHORA - 4 * HORA, finMs: AHORA - 3 * HORA },
    { titulo: "Dentista", inicioMs: AHORA + HORA, finMs: AHORA + 2 * HORA },
    { titulo: "Historia del arte", inicioMs: AHORA + HORA, finMs: AHORA + 2 * HORA },
  ],
  entregas: [
    { curso: "Física General", titulo: "Informe 2", entregaMs: AHORA + 30 * HORA, entregada: false },
    { curso: "Física General", titulo: "Informe 1", entregaMs: AHORA + 10 * HORA, entregada: true },
  ],
  pruebas: [{ id: 7, ramoId: 1, titulo: "Certamen 2", inicioMs: AHORA + 6 * DIA }],
  bloques: [
    { id: 4, ramoId: 1, titulo: "Estudiar Cálculo", inicioMs: AHORA + 2 * DIA, hecho: false },
    { id: 5, ramoId: 1, titulo: "Estudiar Cálculo", inicioMs: AHORA - 2 * DIA, hecho: true },
  ],
  tareas: [
    { id: 1, titulo: "Resolver guía de derivadas", venceMs: AHORA + 5 * HORA, hecha: false },
    { id: 2, titulo: "Leer capítulo", venceMs: AHORA - DIA, hecha: true },
    { id: 3, titulo: "Sin ramo", venceMs: AHORA + 7 * HORA, hecha: false },
  ],
  ramoDeTarea: new Map([["1", 1], ["2", 1]]),
  repasoHoy: new Map([[1, 4], [2, 0]]),
  grabaciones: [{ id: "2026-10-04-080000", ramoId: 1, ms: new Date(2026, 9, 4, 8).getTime() }],
};

describe("armar todo de un ramo", () => {
  const todo = armarTodoDeRamos([calculo, fisica, vieja], fuentes, AHORA);
  const delCalculo = todo.get(1)!;

  test("junta cada fuente en su ramo", () => {
    assert.deepEqual([...new Set(delCalculo.map((i) => i.tipo))].sort(), ["clase", "estudio", "grabacion", "prueba", "repaso", "tarea"]);
    assert.equal(delCalculo.filter((i) => i.tipo === "clase").length, 3);
    assert.deepEqual(todo.get(2)!.map((i) => i.titulo), ["Informe 2"]);
  });

  test("lo próximo va primero por fecha y lo pasado o hecho después, lo más reciente arriba", () => {
    const estados = delCalculo.map((i) => i.estado);
    const primerNoPendiente = estados.findIndex((e) => e !== "pendiente");
    assert.ok(estados.slice(primerNoPendiente).every((e) => e !== "pendiente"));
    const pendientes = delCalculo.slice(0, primerNoPendiente);
    assert.deepEqual(pendientes.map((i) => i.cuandoMs), [...pendientes.map((i) => i.cuandoMs)].sort((a, b) => a - b));
    const resto = delCalculo.slice(primerNoPendiente);
    assert.deepEqual(resto.map((i) => i.cuandoMs), [...resto.map((i) => i.cuandoMs)].sort((a, b) => b - a));
  });

  test("estados: lo hecho, lo vencido y lo que sigue", () => {
    assert.equal(delCalculo.find((i) => i.tipo === "tarea" && i.ref === "2")!.estado, "hecho");
    assert.equal(delCalculo.find((i) => i.titulo === "Cálculo (esta mañana)")!.estado, "pasado");
    assert.equal(delCalculo.find((i) => i.tipo === "estudio" && i.ref === "5")!.estado, "hecho");
    assert.equal(delCalculo.find((i) => i.tipo === "repaso")!.titulo, "4 tarjetas para repasar");
  });

  test("lo que no calza con un ramo, lo entregado y los ramos archivados no aparecen", () => {
    const titulos = [...todo.values()].flat().map((i) => i.titulo);
    assert.ok(!titulos.includes("Dentista"));
    assert.ok(!titulos.includes("Sin ramo"));
    assert.ok(!titulos.includes("Informe 1"));
    assert.ok(!titulos.includes("Historia del arte"));
    assert.equal(todo.has(3), false);
  });

  test("una grabación se titula con su fecha, nunca con lo que se dijo", () => {
    assert.equal(tituloDeGrabacion(new Date(2026, 9, 4, 8, 5).getTime()), "Clase grabada · 4 oct, 08:05");
    assert.equal(delCalculo.find((i) => i.tipo === "grabacion")!.ref, "2026-10-04-080000");
  });

  test("sin fuentes (funciones apagadas) cada ramo queda con lista vacía", () => {
    const vacio: FuentesRamo = { eventos: [], entregas: [], pruebas: [], bloques: [], tareas: [], ramoDeTarea: new Map(), repasoHoy: new Map(), grabaciones: [] };
    assert.deepEqual([...armarTodoDeRamos([calculo], vacio, AHORA).get(1)!], []);
  });

  test("ramos con nombres parecidos: un empate no se adivina", () => {
    const a: Ramo = { id: 10, nombre: "Física I", color: "azul", alias: ["fisica"], archivado: false };
    const b: Ramo = { id: 11, nombre: "Física II", color: "rojo", alias: ["fisica"], archivado: false };
    const t = armarTodoDeRamos([a, b], { ...fuentes, eventos: [{ titulo: "Física", inicioMs: AHORA + HORA, finMs: AHORA + 2 * HORA }], entregas: [], pruebas: [], bloques: [], tareas: [], grabaciones: [], repasoHoy: new Map() }, AHORA);
    assert.equal(t.get(10)!.length + t.get(11)!.length, 0);
  });
});

describe("buscar", () => {
  const todo = armarTodoDeRamos([calculo, fisica], fuentes, AHORA);
  test("palabras completas, sin tildes ni mayúsculas, todas las palabras", () => {
    assert.deepEqual(buscarEnItems("DERIVADAS guia", todo.get(1)!).map((i) => i.titulo), ["Resolver guía de derivadas"]);
    assert.equal(buscarEnItems("deriv", todo.get(1)!).length, 0);
    assert.equal(buscarEnItems("derivadas integrales", todo.get(1)!).length, 0);
    assert.equal(buscarEnItems("   ", todo.get(1)!).length, 0);
  });
  test("global: agrupa por ramo y deja afuera los que no tienen nada", () => {
    const r = buscarEnRamos("informe", todo);
    assert.deepEqual(r.map((x) => x.ramoId), [2]);
    assert.equal(r[0].total, 1);
    assert.deepEqual(buscarEnRamos("certamen", todo).map((x) => x.ramoId), [1]);
    assert.deepEqual(buscarEnRamos("nada de esto", todo), []);
  });
});

describe("resumen corto", () => {
  const items = armarTodoDeRamos([calculo], fuentes, AHORA).get(1)!;
  test("cuenta lo que importa", () => {
    const r = resumirRamo(items, AHORA);
    assert.equal(r.clasesSemana, 2);
    assert.equal(r.tareasPendientes, 1);
    assert.equal(r.proximaPrueba?.titulo, "Certamen 2");
    assert.equal(r.tarjetasHoy, 4);
    assert.equal(textoResumenRamo("Cálculo", r, AHORA), "Cálculo: 2 clases esta semana, 1 tarea pendiente, Certamen 2 en 6 días, 4 tarjetas para repasar.");
  });
  test("sin nada pendiente lo dice", () => {
    assert.equal(textoResumenRamo("Física", resumirRamo([], AHORA), AHORA), "Física: no tienes nada pendiente por ahora.");
  });
  test("cuándo es", () => {
    assert.equal(cuandoEs(AHORA + HORA, AHORA), "hoy");
    assert.equal(cuandoEs(AHORA + DIA, AHORA), "mañana");
    assert.equal(cuandoEs(AHORA + 3 * DIA, AHORA), "en 3 días");
  });
});
