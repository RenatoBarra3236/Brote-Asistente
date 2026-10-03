import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { POMODORO, Temporizadores } from "../src/temporizadores.ts";
import { describirDuracion, leerDuracion, reloj } from "../src/tiempo.ts";
import { normalizar } from "../src/texto.ts";

const MIN = 60_000;
let ahora: Date;
let gastos: Gastos;
let temporizadores: Temporizadores;
let motor: Motor;

beforeEach(() => {
  ahora = new Date(2026, 9, 2, 15, 0);
  gastos = new Gastos(":memory:");
  temporizadores = new Temporizadores(gastos);
  motor = new Motor(gastos, { temporizadores, reloj: () => ahora });
});

const decir = (texto: string) => motor.resolver(texto);
const avanzar = (ms: number) => {
  ahora = new Date(ahora.getTime() + ms);
};

describe("duraciones", () => {
  const casos: [string, number | null][] = [
    ["25 minutos", 25 * MIN],
    ["25", 25 * MIN],
    ["media hora", 30 * MIN],
    ["un cuarto de hora", 15 * MIN],
    ["hora y media", 90 * MIN],
    ["2 horas y media", 150 * MIN],
    ["1 hora y 15 minutos", 75 * MIN],
    ["una hora", 60 * MIN],
    ["diez minutos", 10 * MIN],
    ["90 min", 90 * MIN],
    ["30 segundos", 30_000],
    ["3 h", 180 * MIN],
    ["calculo", null],
    ["0 minutos", null],
    ["20 horas", null],
  ];
  for (const [texto, esperado] of casos) {
    it(`«${texto}» → ${esperado}`, () => assert.equal(leerDuracion(normalizar(texto)), esperado));
  }

  it("las describe y las muestra como reloj", () => {
    assert.equal(describirDuracion(25 * MIN), "25 minutos");
    assert.equal(describirDuracion(90 * MIN), "1 hora y 30 minutos");
    assert.equal(describirDuracion(60 * MIN), "1 hora");
    assert.equal(describirDuracion(45_000), "45 segundos");
    assert.equal(reloj(12 * MIN + 34_000), "12:34");
    assert.equal(reloj(62 * MIN + 3_000), "1:02:03");
    assert.equal(reloj(-5), "0:00");
  });
});

describe("frases sin IA", () => {
  it("pomodoro con y sin duración o tema", () => {
    assert.match(decir("pomodoro")!.texto, /25 minutos de estudio/);
    assert.match(decir("Empieza un pomodoro de 30 para cálculo")!.texto, /Pomodoro de cálculo: 30 minutos/);
    assert.match(decir("pomodoro de historia")!.texto, /Pomodoro de historia: 25 minutos/);
    // Solo hay un pomodoro a la vez.
    assert.equal(temporizadores.activos().filter((t) => t.tipo === "pomodoro").length, 1);
  });

  it("temporizadores y recordatorios", () => {
    assert.equal(decir("pon un temporizador de media hora")!.texto, "⏱ Temporizador de 30 minutos, corriendo.");
    assert.equal(decir("recuérdame en 10 minutos sacar la ropa")!.texto, "⏰ Listo, en 10 minutos te recuerdo: sacar la ropa.");
    assert.equal(decir("en una hora avísame que llame a mi mamá")!.texto, "⏰ Listo, en 1 hora te recuerdo: llame a mi mamá.");
    assert.equal(temporizadores.activos().length, 3);
  });

  it("consultar y cancelar", () => {
    decir("pomodoro de 25 para física");
    decir("recuérdame en 10 minutos sacar la ropa");
    avanzar(2 * MIN);
    assert.equal(decir("¿cuánto falta?")!.texto, "• ⏰ sacar la ropa: quedan 8:00\n• 🍅 Estudio (física): quedan 23:00");
    assert.equal(decir("para el pomodoro")!.texto, "Listo, detuve el pomodoro. ¡Buen trabajo! 🌱");
    assert.equal(decir("cancela los recordatorios")!.texto, "Listo, cancelé el temporizador.");
    assert.equal(decir("cuánto queda")!.texto, "No tienes temporizadores corriendo.");
  });

  it("lo que no es una duración va al agente", () => {
    assert.equal(decir("recuérdame en la tarde llamar a mi mamá"), null);
    assert.equal(decir("pon un temporizador de cálculo"), null);
  });

  it("sin temporizadores conectados (servidor MCP), esas frases no se resuelven", () => {
    assert.equal(new Motor(gastos).resolver("pomodoro"), null);
  });
});

describe("revisar", () => {
  it("un temporizador avisa una sola vez", () => {
    decir("recuérdame en 10 minutos sacar la ropa");
    avanzar(9 * MIN);
    assert.deepEqual(temporizadores.revisar(ahora), []);
    avanzar(1 * MIN);
    assert.deepEqual(temporizadores.revisar(ahora).map((a) => a.texto), ["⏰ ¡Hora de sacar la ropa!"]);
    assert.deepEqual(temporizadores.revisar(ahora), []);
    assert.equal(temporizadores.activos().length, 0);
  });

  it("el pomodoro alterna estudio y descanso, con uno largo cada 4 bloques", () => {
    decir("pomodoro de 30 para química");
    const fases: string[] = [];
    for (let i = 0; i < 8; i++) {
      const [actual] = temporizadores.activos();
      avanzar(actual.finMs - ahora.getTime());
      const [aviso] = temporizadores.revisar(ahora);
      fases.push(`${aviso.temporizador.fase}:${aviso.temporizador.duracionMs / MIN}`);
    }
    assert.deepEqual(fases, [
      "descanso:5", "estudio:30", "descanso:5", "estudio:30",
      "descanso:5", "estudio:30", "descanso:15", "estudio:30",
    ]);
    assert.equal(temporizadores.activos()[0].ciclos, 4);
    assert.equal(POMODORO.bloquesHastaElLargo, 4);
  });
});
