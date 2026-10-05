import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { armarEstadoRepaso, inicioDelDia } from "../../../packages/motor/src/repaso-tipos.ts";
import type { Tarjeta } from "../../../packages/motor/src/repaso-tipos.ts";
import {
  SesionRepaso,
  armarDecision,
  claveDia,
  cuantasMarcadas,
  debeAvisarTarjetas,
  estadoDeTarjeta,
  fechaDeClase,
  lineaRepasoDeRamo,
  marcasIniciales,
  propuestasRepasoNuevas,
  resumenPropuesta,
  tarjetasMarcadas,
  textoAceptado,
  textoAvisoTarjetas,
  textoBotonAceptar,
  tituloPropuesta,
} from "../src/agente/repaso.ts";

const AHORA = new Date(2026, 9, 5, 12, 0).getTime();
const kit = {
  temas: [{ titulo: "Límites", puntos: ["a"] }, { titulo: "Derivadas", puntos: ["b"] }],
  glosario: [{ termino: "Límite", definicion: "valor" }],
  preguntas: [{ pregunta: "¿Qué es?", respuesta: "esto" }, { pregunta: "¿Y esto?", respuesta: "aquello" }],
};
const tarjeta = (id: number, dias = 0, ramoId: number | null = null): Tarjeta => ({
  id, grabacion: "2026-10-04-103000", ramoId, tipo: "termino", frente: `f${id}`, reverso: `r${id}`, caja: 1, proximoMs: inicioDelDia(AHORA, dias), ultimaMs: null, aciertos: 0, fallos: 0,
});

describe("propuesta de repaso en la isla", () => {
  it("el título lleva la fecha de la clase y el resumen cuenta lo que hay", () => {
    assert.equal(tituloPropuesta({ grabacion: "2026-10-04-103000" }), "Brote preparó un repaso de tu clase del dom 4 oct · 10:30");
    assert.equal(fechaDeClase("raro"), "raro");
    assert.equal(resumenPropuesta(kit), "2 temas · 1 término · 2 preguntas");
    assert.equal(resumenPropuesta({ temas: [], glosario: [], preguntas: [] }), "");
  });

  it("todo viene marcado de partida y el botón dice cuánto se acepta", () => {
    const m = marcasIniciales(kit);
    assert.equal(cuantasMarcadas(m), 5);
    assert.equal(tarjetasMarcadas(m), 3);
    assert.equal(textoBotonAceptar(m), "Aceptar lo marcado (5)");
    m.temas = [false, false];
    m.glosario = [false];
    m.preguntas = [false, false];
    assert.equal(textoBotonAceptar(m), "Marca algo para aceptar");
  });

  it("el pedido sale con las posiciones marcadas, el ramo y solo las correcciones hechas", () => {
    const m = marcasIniciales(kit);
    m.temas[1] = false;
    m.preguntas[0] = false;
    const d = armarDecision(m, 3);
    assert.deepEqual(d, { temas: [0], glosario: [0], preguntas: [1], ramoId: 3 });
    const e = armarDecision(m, null, { preguntas: { 1: { pregunta: "¿Y eso?", respuesta: "aquello" } } });
    assert.equal(e.preguntasEditado?.[1].pregunta, "¿Y eso?");
    assert.equal(e.glosarioEditado, undefined);
  });

  it("textos de lo aceptado", () => {
    assert.equal(textoAceptado({ tarjetas: 3, repetidas: 0, temas: 1 }), "3 tarjetas guardadas · 1 tema guardado 🌱");
    assert.equal(textoAceptado({ tarjetas: 0, repetidas: 2, temas: 0 }), "2 ya estaban 🌱");
    assert.equal(textoAceptado({ tarjetas: 0, repetidas: 0, temas: 0 }), "No quedó nada nuevo que guardar.");
  });

  it("solo avisa las propuestas de grabaciones que no estaban", () => {
    assert.equal(propuestasRepasoNuevas([], [{ grabacion: "a" }]), 1);
    assert.equal(propuestasRepasoNuevas([{ grabacion: "a" }], [{ grabacion: "a" }, { grabacion: "b" }]), 1);
    assert.equal(propuestasRepasoNuevas([{ grabacion: "a" }], [{ grabacion: "a" }]), 0);
  });
});

describe("sesión de repaso", () => {
  const estado = armarEstadoRepaso([tarjeta(1, 0), tarjeta(2, -2), tarjeta(3, 3), tarjeta(4, 0, 7)], [], [], AHORA);

  it("trae lo que vence hoy, lo más atrasado primero, y se puede acotar a un ramo", () => {
    const s = new SesionRepaso(estado, AHORA);
    assert.deepEqual(s.cola.map((t) => t.id), [2, 1, 4]);
    assert.deepEqual(new SesionRepaso(estado, AHORA, 7).cola.map((t) => t.id), [4]);
    assert.equal(new SesionRepaso(estado, AHORA, 99).vacia, true);
    assert.equal(new SesionRepaso(estado, AHORA, null, 2).cola.length, 2);
  });

  it("hay que ver la respuesta antes de contestar; después pasa a la siguiente", () => {
    const s = new SesionRepaso(estado, AHORA);
    assert.equal(s.progreso, "1 de 3");
    assert.equal(s.responder("sabia"), null);
    s.mostrarRespuesta();
    assert.ok(s.mostrandoRespuesta);
    assert.equal(s.responder("sabia")?.id, 2);
    assert.equal(s.mostrandoRespuesta, false);
    assert.equal(s.progreso, "2 de 3");
    s.mostrarRespuesta();
    s.responder("no-sabia");
    s.mostrarRespuesta();
    s.responder("casi");
    assert.ok(s.terminada);
    assert.equal(s.actual, null);
    assert.equal(s.sabidas, 1);
    assert.match(s.textoFin(), /Repasaste 3 tarjetas y sabías 1\. Las que no sabías vuelven mañana/);
  });

  it("una sesión vacía lo dice", () => {
    assert.match(new SesionRepaso(armarEstadoRepaso([], [], [], AHORA), AHORA).textoFin(), /No hay tarjetas/);
  });
});

describe("avisos y resúmenes", () => {
  it("el aviso diario va una vez por día, con la isla cerrada y solo si hay algo", () => {
    assert.ok(debeAvisarTarjetas(3, null, AHORA, false));
    assert.ok(debeAvisarTarjetas(3, "2026-10-04", AHORA, false));
    assert.equal(debeAvisarTarjetas(3, claveDia(AHORA), AHORA, false), false);
    assert.equal(debeAvisarTarjetas(3, null, AHORA, true), false);
    assert.equal(debeAvisarTarjetas(0, null, AHORA, false), false);
    assert.equal(textoAvisoTarjetas(1), "Tienes 1 tarjeta para repasar");
    assert.equal(textoAvisoTarjetas(7), "Tienes 7 tarjetas para repasar");
  });

  it("la línea del ramo y el estado de una tarjeta", () => {
    assert.equal(lineaRepasoDeRamo(undefined), null);
    assert.equal(lineaRepasoDeRamo({ ramoId: 1, total: 24, hoy: 7 }), "7 para hoy · 24 en total");
    assert.equal(lineaRepasoDeRamo({ ramoId: 1, total: 4, hoy: 0 }), "nada para hoy · 4 en total");
    assert.equal(estadoDeTarjeta({ caja: 3, proximoMs: inicioDelDia(AHORA, 0) }, AHORA), "caja 3 · vence hoy");
    assert.equal(estadoDeTarjeta({ caja: 2, proximoMs: inicioDelDia(AHORA, 1) }, AHORA), "caja 2 · vence mañana");
    assert.equal(estadoDeTarjeta({ caja: 4, proximoMs: inicioDelDia(AHORA, 14) }, AHORA), "caja 4 · vence en 14 días");
  });
});
