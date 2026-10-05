import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { MENSAJE_APAGADA } from "../src/funciones.ts";
import { Motor } from "../src/motor.ts";
import { Notas } from "../src/notas.ts";
import { Ramos } from "../src/ramos.ts";

const AHORA = new Date(2026, 9, 5, 13, 0);

function armar(estudio = true) {
  const gastos = new Gastos(":memory:");
  const ramos = new Ramos(gastos);
  const notas = new Notas(gastos, ramos);
  const motor = new Motor(gastos, { reloj: () => AHORA, ramos, notas, activa: (f) => f !== "estudio" || estudio });
  const calculo = (ramos.crear({ nombre: "Cálculo" }, 1) as { ok: true; ramo: { id: number } }).ramo.id;
  ramos.crear({ nombre: "Física" }, 2);
  return { motor, ramos, notas, calculo, gastos };
}

function conEvaluaciones() {
  const t = armar();
  t.motor.resolver("evaluaciones de cálculo: certamen 1 30%, certamen 2 30%, certamen 3 40%");
  return t;
}

describe("definir evaluaciones", () => {
  it("«evaluaciones de cálculo: …» crea varias de una vez", () => {
    const { motor, notas, calculo } = armar();
    const r = motor.resolver("evaluaciones de cálculo: certamen 1 30%, certamen 2 30%, certamen 3 40%");
    assert.equal(r?.intencion, "notas-evaluaciones");
    assert.deepEqual(notas.listar(calculo).map((e) => [e.nombre, e.peso]), [["certamen 1", 30], ["certamen 2", 30], ["certamen 3", 40]]);
    assert.doesNotMatch(r!.texto, /Ojo/);
  });

  it("el examen entra como ajuste y los pesos suman 100 con él", () => {
    const { motor, notas, calculo } = armar();
    const r = motor.resolver("evaluaciones de cálculo: certamen 1 30%, certamen 2 30%, examen 40%");
    assert.equal(notas.listar(calculo).length, 2);
    assert.equal(notas.ajustes(calculo).examenPeso, 40);
    assert.doesNotMatch(r!.texto, /Ojo/);
  });

  it("avisa si los pesos no suman 100", () => {
    const { motor } = armar();
    assert.match(motor.resolver("evaluaciones de cálculo: certamen 1 30%, certamen 2 30%")!.texto, /suman 60 %/);
  });

  it("un ramo que no existe no crea nada", () => {
    const { motor, notas } = armar();
    assert.match(motor.resolver("evaluaciones de química: certamen 1 50%")!.texto, /No encontré un ramo/);
    assert.equal(notas.listar().length, 0);
  });

  it("agregar una evaluación suelta", () => {
    const { motor, notas, calculo } = armar();
    const r = motor.resolver("agrega la evaluación control 1 de 20% en cálculo");
    assert.equal(r?.intencion, "notas-agregar-eval");
    assert.deepEqual(notas.listar(calculo).map((e) => [e.nombre, e.peso]), [["control 1", 20]]);
  });
});

describe("anotar notas", () => {
  it("«me saqué 5,5 en el certamen 1 de cálculo»", () => {
    const { motor, notas, calculo } = conEvaluaciones();
    const r = motor.resolver("me saqué 5,5 en el certamen 1 de cálculo");
    assert.equal(r?.intencion, "notas-anotar");
    assert.equal(notas.listar(calculo)[0].nota, 5.5);
    assert.match(r!.texto, /5,5/);
  });

  it("«agrega una nota 5.5 en certamen 2 de cálculo» (punto decimal)", () => {
    const { motor, notas, calculo } = conEvaluaciones();
    motor.resolver("agrega una nota 5.5 en certamen 2 de cálculo");
    assert.equal(notas.listar(calculo)[1].nota, 5.5);
  });

  it("sin pesos definidos pregunta el peso y no guarda nada (decisión 3)", () => {
    const { motor, notas } = armar();
    const r = motor.resolver("me saqué 5,5 en el certamen 1 de cálculo");
    assert.match(r!.texto, /cuánto pesa/);
    assert.equal(notas.listar().length, 0);
  });

  it("una nota fuera de la escala no se anota", () => {
    const { motor, notas } = conEvaluaciones();
    assert.equal(motor.resolver("me saqué 8 en el certamen 1 de cálculo"), null);
    assert.equal(notas.listar().every((e) => e.nota === null), true);
  });

  it("«borra la nota del certamen 1 de cálculo» la deja pendiente", () => {
    const { motor, notas, calculo } = conEvaluaciones();
    motor.resolver("me saqué 5,5 en el certamen 1 de cálculo");
    motor.resolver("borra la nota del certamen 1 de cálculo");
    assert.equal(notas.listar(calculo)[0].nota, null);
  });
});

describe("¿cuánto necesito?", () => {
  it("«con 4,2 en el certamen 1, ¿cuánto necesito en el 2 para aprobar?» calcula sin guardar (decisión 4)", () => {
    const { motor, notas, calculo } = conEvaluaciones();
    const r = motor.resolver("con 4,2 en el certamen 1, ¿cuánto necesito en el certamen 2 de cálculo para aprobar?");
    assert.equal(r?.intencion, "notas-necesaria");
    // (400 − 126) ÷ 70 = 3,914 → 4,0
    assert.match(r!.texto, /Necesitas un 4,0 en certamen 2/);
    assert.equal(notas.listar(calculo)[0].nota, null);
  });

  it("«el 2» se entiende como el mismo tipo de evaluación", () => {
    const { motor } = conEvaluaciones();
    const r = motor.resolver("con 4,2 en el certamen 1 cuánto necesito en el 2 de cálculo");
    assert.match(r!.texto, /certamen 2/);
  });

  it("sin nombrar el ramo, lo toma de la evaluación si es única", () => {
    const { motor } = conEvaluaciones();
    const r = motor.resolver("con 4,2 en el certamen 1 cuánto necesito en el certamen 2");
    assert.match(r!.texto, /Necesitas un 4,0/);
  });

  it("con examen: cuánto necesito en el examen", () => {
    const { motor } = armar();
    motor.resolver("evaluaciones de cálculo: certamen 1 50%, certamen 2 50%");
    motor.resolver("el examen de cálculo vale 30%");
    motor.resolver("me saqué 4,4 en el certamen 1 de cálculo");
    motor.resolver("me saqué 3,8 en el certamen 2 de cálculo");
    const r = motor.resolver("¿cuánto necesito en el examen de cálculo?");
    assert.match(r!.texto, /presentación 4,1/);
    assert.match(r!.texto, /3,8 en el examen/);
  });

  it("imposible y ya aprobado", () => {
    const { motor } = conEvaluaciones();
    motor.resolver("me saqué 1,2 en el certamen 1 de cálculo");
    motor.resolver("me saqué 1,2 en el certamen 2 de cálculo");
    assert.match(motor.resolver("cuánto necesito en el certamen 3 de cálculo")!.texto, /ni con un 7,0/);
  });

  it("un ramo desconocido o una evaluación que no existe se dice, no se adivina", () => {
    const { motor } = conEvaluaciones();
    assert.match(motor.resolver("cuánto necesito en el certamen 2 de química")!.texto, /No encontré un ramo/);
    assert.match(motor.resolver("cuánto necesito en el parcial 9 de cálculo")!.texto, /No tengo «parcial 9»/);
  });
});

describe("¿cómo voy?", () => {
  it("«¿cómo voy en Cálculo?» con y sin notas", () => {
    const { motor } = armar();
    assert.match(motor.resolver("¿cómo voy en Cálculo?")!.texto, /Todavía no tengo evaluaciones/);
    motor.resolver("evaluaciones de cálculo: certamen 1 50%, certamen 2 50%");
    motor.resolver("me saqué 5,5 en el certamen 1 de cálculo");
    const r = motor.resolver("¿cómo voy en Cálculo?");
    assert.equal(r?.intencion, "notas-como-voy");
    assert.match(r!.texto, /5,5 de promedio/);
    assert.match(r!.texto, /2,5/); // (400 − 275) ÷ 50
  });

  it("«¿cómo voy en mis ramos?» da una línea por ramo con notas", () => {
    const { motor } = armar();
    motor.resolver("evaluaciones de cálculo: certamen 1 50%, certamen 2 50%");
    motor.resolver("me saqué 5,5 en el certamen 1 de cálculo");
    const r = motor.resolver("¿cómo voy en mis ramos?");
    assert.match(r!.texto, /• Cálculo: 5,5/);
    assert.doesNotMatch(r!.texto, /Física/);
  });

  it("sin ninguna nota explica cómo empezar", () => {
    const { motor } = armar();
    assert.match(motor.resolver("mis notas")!.texto, /Todavía no tengo notas/);
  });
});

describe("aprobación configurable", () => {
  it("«la nota de aprobación de cálculo es 5»", () => {
    const { motor, notas, calculo } = armar();
    motor.resolver("la nota de aprobación de cálculo es 5");
    assert.equal(notas.ajustes(calculo).aprobacion, 5);
  });
});

describe("función apagada y frases de control", () => {
  it("con la función `estudio` apagada responde «Eso está apagado»", () => {
    const { motor } = armar(false);
    assert.equal(motor.resolver("¿cómo voy en Cálculo?")!.texto, MENSAJE_APAGADA);
    assert.equal(motor.resolver("me saqué 5,5 en el certamen 1 de cálculo")!.texto, MENSAJE_APAGADA);
  });

  it("sin la tabla de notas conectada, las frases van al agente", () => {
    const gastos = new Gastos(":memory:");
    const motor = new Motor(gastos, { reloj: () => AHORA, ramos: new Ramos(gastos) });
    assert.equal(motor.resolver("¿cómo voy en Cálculo?"), null);
  });

  const CONTROLES = [
    "pagué 4200 en el certamen",
    "gasté 4,2 lucas en fotocopias de cálculo",
    "con 4,2 de cambio me alcanza para el bus",
    "me saqué una foto con 5 amigos",
    "me saqué un 6 en la foto",
    "tengo 5 amigos en cálculo",
    "cuánto gasté en cálculo",
    "cuánto necesito para el almuerzo",
    "cuánto necesito en el almuerzo de hoy",
    "cómo voy con la tarea",
    "mi promedio de gastos",
    "anota 5000 en cálculo",
    "borra la nota de voz",
    "agrega una nota de 5 lucas en café",
    "hola cómo estás",
  ];
  for (const frase of CONTROLES) {
    it(`control «${frase}» no cambia ninguna nota`, () => {
      const { motor, notas, gastos } = conEvaluaciones();
      const antes = JSON.stringify(notas.listar());
      const r = motor.resolver(frase);
      assert.equal(JSON.stringify(notas.listar()), antes);
      if (r) assert.ok(!r.intencion.startsWith("notas-") || r.texto.length > 0);
      void gastos;
    });
  }

  it("las frases de control que no son de notas no responden como notas", () => {
    const { motor } = conEvaluaciones();
    for (const frase of ["pagué 4200 en el certamen", "con 4,2 de cambio me alcanza para el bus", "me saqué una foto con 5 amigos", "hola cómo estás", "cuánto necesito para el almuerzo"]) {
      const r = motor.resolver(frase);
      assert.ok(!r || !r.intencion.startsWith("notas-"), `${frase} → ${r?.intencion}`);
    }
  });
});
