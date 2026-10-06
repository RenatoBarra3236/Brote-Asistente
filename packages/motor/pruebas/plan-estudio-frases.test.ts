import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { MENSAJE_APAGADA } from "../src/funciones.ts";
import { Motor } from "../src/motor.ts";
import { Notas } from "../src/notas.ts";
import { PlanesEstudio } from "../src/plan-estudio.ts";
import { Ramos } from "../src/ramos.ts";

const AHORA = new Date(2026, 9, 5, 13, 0); // lunes 5 de octubre de 2026

function armar(estudio = true, conPlanes = true) {
  const gastos = new Gastos(":memory:");
  const ramos = new Ramos(gastos);
  const notas = new Notas(gastos, ramos);
  const planes = new PlanesEstudio(gastos, notas);
  const motor = new Motor(gastos, { reloj: () => AHORA, ramos, notas, ...(conPlanes ? { planes } : {}), activa: (f) => f !== "estudio" || estudio });
  const calculo = (ramos.crear({ nombre: "Cálculo" }, 1) as { ok: true; ramo: { id: number } }).ramo.id;
  ramos.crear({ nombre: "Física" }, 2);
  motor.resolver("evaluaciones de cálculo: certamen 1 30%, certamen 2 70%");
  return { motor, notas, planes, calculo };
}

describe("la fecha de una prueba, por frase", () => {
  it("«el certamen 2 de cálculo es el viernes 9 a las 15:00» guarda día y hora", () => {
    const { motor, notas, calculo } = armar();
    const r = motor.resolver("el certamen 2 de cálculo es el viernes 9 a las 15:00");
    assert.equal(r?.intencion, "estudio-fecha");
    assert.match(r!.texto, /Certamen 2 de Cálculo es el viernes 9 oct · 15:00/i);
    assert.equal(notas.listar(calculo).find((e) => e.nombre === "certamen 2")?.fecha, "2026-10-09 15:00");
  });

  it("sin hora guarda solo el día y avisa que asume las 8:00", () => {
    const { motor, notas, calculo } = armar();
    const r = motor.resolver("el certamen 1 de cálculo es mañana");
    assert.equal(notas.listar(calculo)[0].fecha, "2026-10-06");
    assert.match(r!.texto, /asumo que es temprano \(8:00\)/);
  });

  it("variantes: «será», «cae», «14 de octubre», «el 14»", () => {
    const { motor, notas, calculo } = armar();
    assert.ok(motor.resolver("el certamen 1 de cálculo será el 14 de octubre a las 9:30")?.texto);
    assert.equal(notas.listar(calculo)[0].fecha, "2026-10-14 09:30");
    assert.ok(motor.resolver("el certamen 2 de cálculo cae el 20")?.texto);
    assert.equal(notas.listar(calculo)[1].fecha, "2026-10-20");
  });

  it("una evaluación que no existe, una fecha imposible o una hora pasada se dicen y no guardan nada", () => {
    const { motor, notas, calculo } = armar();
    assert.match(motor.resolver("el certamen 9 de cálculo es el viernes 9")!.texto, /No tengo «certamen 9»/);
    assert.match(motor.resolver("el certamen 1 de cálculo es el 31 de febrero")!.texto, /No pude entender esa fecha/);
    assert.match(motor.resolver("el certamen 1 de cálculo es hoy a las 8:00")!.texto, /ya pasó/);
    assert.deepEqual(notas.listar(calculo).map((e) => e.fecha), [null, null]);
  });

  it("nunca adivina: sin ramo conocido o sin evaluación la frase va al agente", () => {
    const { motor } = armar();
    for (const frase of ["mi cumpleaños es el viernes 9", "el certamen es mañana", "el control de química es mañana", "el arriendo es el 5 de cada mes", "el cálculo es mañana"]) {
      assert.equal(motor.resolver(frase), null, frase);
    }
  });
});

describe("pedir el plan, por frase", () => {
  it("abre la propuesta en la isla pero no agenda nada", () => {
    const { motor, notas, planes, calculo } = armar();
    motor.resolver("el certamen 2 de cálculo es el viernes 9 a las 15:00");
    const e = notas.listar(calculo)[1];
    for (const frase of ["plan de estudio para el certamen 2 de cálculo", "hazme un plan de estudio para el certamen 2 de cálculo", "organízame el estudio para el certamen 2 de cálculo"]) {
      const r = motor.resolver(frase);
      assert.equal(r?.intencion, "estudio-plan", frase);
      assert.deepEqual(r?.datos, { planEstudio: { ramoId: calculo, evaluacionId: e.id } }, frase);
    }
    assert.equal(planes.planes(AHORA.getTime()).length, 0);
  });

  it("sin fecha pide la fecha; con nota ya puesta o aprobado no ofrece plan", () => {
    const { motor, notas, calculo } = armar();
    assert.match(motor.resolver("plan de estudio para el certamen 1 de cálculo")!.texto, /Falta la fecha/);
    motor.resolver("el certamen 1 de cálculo es el viernes 9");
    notas.ponerNota(notas.listar(calculo)[0].id, 6.5);
    assert.match(motor.resolver("plan de estudio para el certamen 1 de cálculo")!.texto, /ya tiene nota/);
    notas.ponerNota(notas.listar(calculo)[0].id, null);
    // Con el certamen 2 de 70 % y nada rendido todavía hay que estudiar: el plan se ofrece.
    motor.resolver("el certamen 2 de cálculo es el viernes 9");
    assert.ok(motor.resolver("plan de estudio para el certamen 2 de cálculo")?.datos);
  });

  it("si ya apruebas el ramo, o ni con 7,0 alcanzas, lo dice y no arma plan", () => {
    const { motor, notas, calculo } = armar();
    void calculo;
    motor.resolver("evaluaciones de física: control 1 90%, control 2 10%");
    const fisica = notas.listar(notas.listar(calculo)[0].ramoId + 1);
    const [c1, c2] = fisica;
    notas.ponerNota(c1.id, 7);
    motor.resolver("el control 2 de física es el viernes 9");
    assert.match(motor.resolver("plan de estudio para el control 2 de física")!.texto, /Ya apruebas el ramo/);
    notas.ponerNota(c1.id, 1);
    assert.match(motor.resolver("plan de estudio para el control 2 de física")!.texto, /Ni sacando 7,0/);
    assert.equal(c2.nota, null);
  });
});

describe("«¿qué estudio hoy?»", () => {
  it("lista los bloques de hoy o dice que no hay", () => {
    const { motor, notas, planes, calculo } = armar();
    assert.equal(motor.resolver("¿qué tengo que estudiar hoy?")?.texto, "No tienes bloques de estudio para hoy.");
    const e = notas.listar(calculo)[1];
    const hoy = (h: number) => new Date(2026, 9, 5, h).getTime();
    planes.crear(calculo, e.id, new Date(2026, 9, 9, 15).getTime(), 2, [{ tipo: "temas", inicioMs: hoy(16), finMs: hoy(16) + 50 * 60_000 }], false, AHORA.getTime());
    const r = motor.resolver("qué estudio hoy");
    assert.equal(r?.intencion, "estudio-hoy");
    assert.match(r!.texto, /Hoy tienes 1 bloque de estudio:\n• 16:00 Estudiar Cálculo/);
    planes.marcar(planes.planes(AHORA.getTime())[0].bloques[0].id, "hecho");
    assert.match(motor.resolver("qué tengo que estudiar hoy")!.texto, /Ya hiciste todos/);
  });
});

describe("controles y función apagada", () => {
  it("frases que no son del plan de estudio", () => {
    const { motor } = armar();
    for (const frase of ["estudio para el certamen", "el viernes 9 pago el arriendo", "gasté 5 lucas en el plan", "mi plan de datos cuesta 8 lucas", "estudié cálculo hoy"]) {
      const r = motor.resolver(frase);
      assert.ok(!r || !r.intencion.startsWith("estudio-"), frase);
    }
  });
  it("apagada dice dónde prenderla", () => {
    const { motor } = armar(false);
    assert.equal(motor.resolver("plan de estudio para el certamen 2 de cálculo")!.texto, MENSAJE_APAGADA);
    assert.equal(motor.resolver("qué estudio hoy")!.texto, MENSAJE_APAGADA);
    assert.equal(motor.resolver("el certamen 2 de cálculo es el viernes 9")!.texto, MENSAJE_APAGADA);
  });
  it("sin planes conectados (como el MCP) «qué estudio hoy» va al agente", () => {
    const { motor } = armar(true, false);
    assert.equal(motor.resolver("qué estudio hoy"), null);
  });
});
