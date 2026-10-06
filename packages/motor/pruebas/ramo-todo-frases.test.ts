import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Motor } from "../src/motor.ts";
import { Gastos } from "../src/gastos.ts";
import { Ramos } from "../src/ramos.ts";
import { armarTodoDeRamos } from "../src/ramo-todo.ts";
import type { FuentesRamo } from "../src/ramo-todo.ts";

const AHORA = new Date(2026, 9, 5, 12);
const HORA = 3_600_000;

function montar(opciones: { activa?: (f: string) => boolean; sinProveedor?: boolean } = {}) {
  const gastos = new Gastos(":memory:");
  const ramos = new Ramos(gastos);
  ramos.crear({ nombre: "Cálculo", alias: ["calc"] }, 1);
  ramos.crear({ nombre: "Física", alias: [] }, 2);
  const fuentes: FuentesRamo = {
    eventos: [{ titulo: "Cálculo II - clase", inicioMs: AHORA.getTime() + 2 * HORA, finMs: AHORA.getTime() + 3 * HORA }],
    entregas: [], pruebas: [{ id: 1, ramoId: 1, titulo: "Certamen 2", inicioMs: AHORA.getTime() + 6 * 86_400_000 }], bloques: [], tareas: [], ramoDeTarea: new Map(), repasoHoy: new Map([[1, 4]]), grabaciones: [],
  };
  const motor = new Motor(gastos, {
    reloj: () => AHORA,
    ramos,
    ...(opciones.sinProveedor ? {} : { todoDeRamo: (id: number) => armarTodoDeRamos(ramos.listar(), fuentes, AHORA.getTime()).get(id) ?? null }),
    ...(opciones.activa ? { activa: opciones.activa as never } : {}),
  });
  return motor;
}

describe("«todo lo de un ramo» sin IA", () => {
  test("resume en el chat y pide abrir la vista", () => {
    const m = montar();
    for (const frase of ["todo lo de cálculo", "dame todo lo del calc", "qué tengo de cálculo", "muéstrame lo de cálculo", "Todo lo de Cálculo"]) {
      const r = m.resolver(frase);
      assert.equal(r?.intencion, "ramo-todo", frase);
      assert.equal(r?.texto, "Cálculo: 1 clase esta semana, Certamen 2 en 6 días, 4 tarjetas para repasar.", frase);
      assert.deepEqual(r?.datos, { ramoTodo: { ramoId: 1 } });
    }
  });
  test("nunca adivina: ramo que no existe, hoy, la semana o «la clase» van al agente", () => {
    const m = montar();
    for (const frase of ["todo lo de química", "todo lo de hoy", "todo lo de la semana", "todo lo de la clase", "qué tengo de tarea", "dame todo lo de mañana"]) {
      assert.equal(m.resolver(frase), null, frase);
    }
  });
  test("«qué tengo hoy» sigue siendo del calendario", () => {
    assert.notEqual(montar().resolver("qué tengo hoy")?.intencion, "ramo-todo");
  });
  test("sin proveedor la frase va al agente", () => {
    assert.equal(montar({ sinProveedor: true }).resolver("todo lo de cálculo"), null);
  });
  test("con Estudio apagado dice dónde prenderlo", () => {
    const r = montar({ activa: (f) => f !== "estudio" }).resolver("todo lo de cálculo");
    assert.equal(r?.intencion, "ramo-todo");
    assert.match(r?.texto ?? "", /apagado/);
  });
});
