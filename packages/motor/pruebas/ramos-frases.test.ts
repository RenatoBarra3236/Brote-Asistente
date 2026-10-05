import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { Ramos } from "../src/ramos.ts";
import { Temporizadores } from "../src/temporizadores.ts";
import { MENSAJE_APAGADA } from "../src/funciones.ts";

const AHORA = new Date(2026, 9, 5, 13, 0);

function armar(estudio = true) {
  const gastos = new Gastos(":memory:");
  const ramos = new Ramos(gastos);
  const temporizadores = new Temporizadores(gastos);
  const motor = new Motor(gastos, { reloj: () => AHORA, ramos, temporizadores, activa: (f) => f !== "estudio" || estudio });
  return { motor, ramos, temporizadores, gastos };
}

describe("ramos sin IA", () => {
  for (const frase of ["agrega el ramo Cálculo", "Agrégame un ramo de cálculo", "añade el ramo cálculo", "crea el ramo de cálculo", "tengo el ramo de cálculo"]) {
    it(`«${frase}» crea el ramo`, () => {
      const { motor, ramos } = armar();
      const r = motor.resolver(frase);
      assert.equal(r?.intencion, "ramos-agregar");
      assert.deepEqual(ramos.listar().map((x) => x.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")), ["calculo"]);
      assert.equal(ramos.listar().length, 1);
      assert.match(r!.texto, /agregué el ramo/);
    });
  }

  it("un ramo repetido se avisa y no se duplica", () => {
    const { motor, ramos } = armar();
    motor.resolver("agrega el ramo Física");
    const r = motor.resolver("agrega el ramo física");
    assert.match(r!.texto, /Ya tienes/);
    assert.equal(ramos.listar().length, 1);
  });

  it("«mis ramos» lista y, sin ramos, explica cómo agregar", () => {
    const { motor } = armar();
    assert.match(motor.resolver("mis ramos")!.texto, /Todavía no tienes ramos/);
    motor.resolver("agrega el ramo Historia");
    const r = motor.resolver("¿qué ramos tengo?");
    assert.equal(r?.intencion, "ramos-ver");
    assert.match(r!.texto, /Historia/);
  });

  it("«quita el ramo X» lo archiva y no borra nada", () => {
    const { motor, ramos } = armar();
    motor.resolver("agrega el ramo Química");
    const r = motor.resolver("quita el ramo de química");
    assert.equal(r?.intencion, "ramos-archivar");
    assert.equal(ramos.listar().length, 0);
    assert.equal(ramos.listar(true).length, 1);
    assert.match(motor.resolver("archiva el ramo Inexistente")!.texto, /No encontré/);
  });

  it("con la función apagada responde «apagado» y no crea nada", () => {
    const { motor, ramos } = armar(false);
    const r = motor.resolver("agrega el ramo Cálculo");
    assert.equal(r?.texto, MENSAJE_APAGADA);
    assert.equal(ramos.listar(true).length, 0);
  });

  it("sin ramos conectados (el MCP), esas frases van al agente", () => {
    const motor = new Motor(new Gastos(":memory:"), { reloj: () => AHORA });
    assert.equal(motor.resolver("mis ramos"), null);
    assert.equal(motor.resolver("agrega el ramo Cálculo"), null);
  });

  it("frases de control: no se confunden con otras cosas", () => {
    const { motor, ramos } = armar();
    for (const frase of ["agrega un gasto de 3 lucas en el almuerzo", "gasté 2 mil en un ramo de flores", "ayúdame con mi ramo de cálculo", "hola", "quiero estudiar el ramo de cálculo mañana", "cuántos ramos me faltan para egresar"]) {
      const r = motor.resolver(frase);
      assert.ok(!r || !r.intencion.startsWith("ramos-"), frase);
    }
    assert.equal(ramos.listar(true).length, 0);
  });

  it("un pomodoro cuyo tema calza con un ramo queda de ese ramo", () => {
    const { motor, ramos, temporizadores } = armar();
    motor.resolver("agrega el ramo Cálculo");
    const r = motor.resolver("pomodoro de 30 para cálculo");
    assert.equal(r?.intencion, "pomodoro");
    const id = temporizadores.activos()[0].id;
    assert.equal(ramos.ramoDe("pomodoro", id), ramos.listar()[0].id);
    motor.resolver("pomodoro de 30 para jugar");
    assert.equal(ramos.ramoDe("pomodoro", temporizadores.activos()[0].id), null);
  });

  it("con Estudio apagado el pomodoro no se asigna a ningún ramo", () => {
    const { motor, ramos, temporizadores } = armar(false);
    ramos.crear({ nombre: "Cálculo" }, AHORA.getTime());
    motor.resolver("pomodoro de 30 para cálculo");
    assert.equal(ramos.ramoDe("pomodoro", temporizadores.activos()[0].id), null);
  });
});
