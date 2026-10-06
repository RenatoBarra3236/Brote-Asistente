import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlanEstudio } from "../src/agente/plan-estudio.ts";
import {
  AVISO_CALENDARIO, ajustarHoras, bloquesSeleccionados, bloquesVisibles, cuandoPrueba, explicarHoras, fechaDesdeCampo, resumenBloques, resumenPlan, textoAgendado, textoHoras, tituloPropuestaPlan, valorParaCampo,
} from "../src/agente/plan-estudio.ts";

const AHORA = new Date(2026, 9, 5, 12, 0).getTime(); // lunes 5 de octubre de 2026
const en = (dias: number, h = 16, m = 0) => new Date(2026, 9, 5 + dias, h, m).getTime();

describe("la fecha de una prueba en la isla", () => {
  it("«hoy», «mañana», «en N días», con o sin hora, y lo que ya pasó", () => {
    assert.equal(cuandoPrueba("2026-10-05 18:00", AHORA), "hoy 18:00");
    assert.equal(cuandoPrueba("2026-10-06 15:00", AHORA), "mañana 15:00");
    assert.equal(cuandoPrueba("2026-10-10 15:00", AHORA), "en 5 días · 15:00");
    assert.equal(cuandoPrueba("2026-10-10", AHORA), "en 5 días");
    assert.equal(cuandoPrueba("2026-10-05 08:00", AHORA), "ya pasó");
    assert.equal(cuandoPrueba(null, AHORA), null);
    assert.equal(cuandoPrueba("raro", AHORA), null);
  });

  it("ida y vuelta con el campo de fecha y hora", () => {
    assert.equal(valorParaCampo("2026-10-09 15:00"), "2026-10-09T15:00");
    assert.equal(valorParaCampo("2026-10-09"), "2026-10-09T08:00");
    assert.equal(valorParaCampo(null), "");
    assert.deepEqual(fechaDesdeCampo("2026-10-09T15:00"), { ok: true, fecha: "2026-10-09 15:00" });
    assert.deepEqual(fechaDesdeCampo(""), { ok: true, fecha: null });
    assert.equal(fechaDesdeCampo("2026-02-31T10:00").ok, false);
  });
});

describe("la propuesta", () => {
  it("las horas se ajustan de a una entre 1 y 12", () => {
    assert.equal(ajustarHoras(6, 1), 7);
    assert.equal(ajustarHoras(6.5, -1), 6);
    assert.equal(ajustarHoras(12, 1), 12);
    assert.equal(ajustarHoras(1, -1), 1);
    assert.equal(textoHoras(10.5), "10,5 h");
    assert.equal(textoHoras(8), "8 h");
  });

  it("explica de dónde salen las horas", () => {
    assert.match(explicarHoras({ necesaria: 3.9, factor: 1, horasObjetivo: 8, peso: 30 }), /^Sugerencia: 8 h \(2 h más 0,2 h por cada 1 % de peso\)\.$/);
    assert.match(explicarHoras({ necesaria: 5.8, factor: 1.6, horasObjetivo: 12, peso: 30 }), /×1,6 porque necesitas un 5,8/);
    assert.match(tituloPropuestaPlan({ nombre: "Certamen 2", pruebaMs: en(4, 15), conHora: true, peso: 30 }), /^Certamen 2 · viernes 9 oct · 15:00 · vale 30 %$/);
  });

  it("el botón dice cuántos bloques se agendan y se eligen por casilla", () => {
    const bloques = [1, 2, 3].map((i) => ({ tipo: "temas" as const, inicioMs: en(i), finMs: en(i, 16, 50) }));
    assert.equal(resumenBloques(bloques, [true, true, false]), "Agendar 2 bloques");
    assert.equal(resumenBloques(bloques, [true, false, false]), "Agendar 1 bloque");
    assert.equal(resumenBloques(bloques, [false, false, false]), "Marca algún bloque para agendar");
    assert.deepEqual(bloquesSeleccionados(bloques, [true, false, true]).map((b) => b.inicioMs), [en(1), en(3)]);
  });

  it("dice lo que pasó al agendar, y avisa del calendario", () => {
    const plan = { bloques: [{ estado: "pendiente" }, { estado: "pendiente" }, { estado: "hecho" }] } as unknown as PlanEstudio;
    assert.equal(textoAgendado({ plan, calendario: { pedido: false, creados: 0, fallidos: 0 } }), "Agendé 2 bloques en tu Agenda 🌱");
    assert.match(textoAgendado({ plan, calendario: { pedido: true, creados: 2, fallidos: 0 } }), /y 2 en tu calendario/);
    assert.match(textoAgendado({ plan, calendario: { pedido: true, creados: 1, fallidos: 1 } }), /\(1 no se pudieron copiar\)/);
    assert.match(textoAgendado({ plan, calendario: { pedido: true, creados: 0, fallidos: 2 } }), /no pude copiarlos a tu calendario/);
    assert.match(AVISO_CALENDARIO, /se borran a mano/);
  });
});

describe("el plan guardado", () => {
  const plan: PlanEstudio = {
    id: 1, ramoId: 1, evaluacionId: 2, pruebaMs: en(5, 15), horas: 4, calendario: false, creadoMs: AHORA,
    bloques: [
      { id: 1, planId: 1, tipo: "temas", inicioMs: en(-1), finMs: en(-1, 16, 50), estado: "hecho" },
      { id: 2, planId: 1, tipo: "temas", inicioMs: en(1), finMs: en(1, 16, 50), estado: "pendiente" },
      { id: 3, planId: 1, tipo: "repaso-final", inicioMs: en(4), finMs: en(4, 16, 50), estado: "saltado" },
    ],
  };
  it("resume bloques, hechos y el próximo", () => {
    assert.equal(resumenPlan(plan, AHORA), "3 bloques · 1 hecho · próximo martes 6 oct · 16:00");
    assert.equal(resumenPlan({ ...plan, bloques: [plan.bloques[0]] }, AHORA), "1 bloque · 1 hecho · todo hecho");
  });
  it("los saltados no se listan", () => {
    assert.deepEqual(bloquesVisibles(plan, AHORA).map((b) => b.id), [1, 2]);
  });
});
