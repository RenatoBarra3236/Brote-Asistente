import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { armarAgenda } from "../src/agenda.ts";

const ahora = new Date(2026, 9, 5, 10).getTime(); // lunes 5-10-2026, 10:00
const en = (dias: number, h = 0, min = 0) => new Date(2026, 9, 5 + dias, h, min).getTime();

describe("armarAgenda", () => {
  it("junta eventos, entregas y recordatorios por día, en orden, sin días vacíos", () => {
    const dias = armarAgenda(
      {
        eventos: [
          { titulo: "Cálculo", lugar: "Sala 3", inicioMs: en(0, 8, 30), finMs: en(0, 10), todoElDia: false },
          { titulo: "Feriado", lugar: null, inicioMs: en(0), finMs: en(1), todoElDia: true },
          { titulo: "Física", lugar: null, inicioMs: en(3, 9), finMs: en(3, 10), todoElDia: false },
        ],
        entregas: [
          { curso: "Álgebra", titulo: "Tarea 4", entregaMs: en(0, 23, 59), url: "https://aula.cl/t4", entregada: false },
          { curso: "Álgebra", titulo: "Tarea 3", entregaMs: en(0, 12), url: null, entregada: true },
        ],
        temporizadores: [
          { tipo: "temporizador", etiqueta: "sacar la ropa", finMs: en(0, 10, 25) },
          { tipo: "pomodoro", etiqueta: null, finMs: en(0, 10, 40) },
        ],
      },
      ahora,
    );
    assert.deepEqual(dias.map((d) => d.diaMs), [en(0), en(3)]);
    assert.deepEqual(dias[0].items.map((i) => `${i.tipo}:${i.titulo}`), ["evento:Feriado", "evento:Cálculo", "recordatorio:sacar la ropa", "entrega:Tarea 4"]);
    assert.equal(dias[0].items[3].detalle, "Álgebra");
    assert.equal(dias[0].items[3].url, "https://aula.cl/t4");
  });

  it("un evento de varios días aparece en cada día; lo de después de la ventana no", () => {
    const dias = armarAgenda(
      {
        eventos: [
          { titulo: "Semana de pruebas", lugar: null, inicioMs: en(1), finMs: en(4), todoElDia: true },
          { titulo: "Lejano", lugar: null, inicioMs: en(20, 9), finMs: en(20, 10), todoElDia: false },
        ],
      },
      ahora,
    );
    assert.deepEqual(dias.map((d) => d.diaMs), [en(1), en(2), en(3)]);
  });

  it("sin nada devuelve una lista vacía", () => {
    assert.deepEqual(armarAgenda({}, ahora), []);
  });
});
