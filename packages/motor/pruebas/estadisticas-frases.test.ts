import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EstadisticasEstudio } from "../src/estadisticas.ts";
import { MENSAJE_APAGADA } from "../src/funciones.ts";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { Ramos } from "../src/ramos.ts";

const AHORA = new Date(2026, 9, 7, 14, 0); // miércoles 7 de octubre de 2026
const MIN = 60_000;
const en = (dias: number, h: number) => new Date(2026, 9, 7 + dias, h).getTime();

function armar(estudio = true, conEstadisticas = true) {
  const gastos = new Gastos(":memory:");
  const ramos = new Ramos(gastos);
  const estadisticas = new EstadisticasEstudio(gastos, ramos);
  const motor = new Motor(gastos, { reloj: () => AHORA, ramos, ...(conEstadisticas ? { estadisticas } : {}), activa: (f) => f !== "estudio" || estudio });
  const calculo = (ramos.crear({ nombre: "Cálculo" }, 1) as { ok: true; ramo: { id: number } }).ramo.id;
  ramos.crear({ nombre: "Física" }, 2);
  return { motor, estadisticas, calculo };
}

function conDatos() {
  const t = armar();
  t.estadisticas.anotarManual(120, t.calculo, en(-1, 0), AHORA.getTime()); // ayer, 2 h de cálculo
  t.estadisticas.anotarManual(60, null, en(0, 0), AHORA.getTime()); // hoy, 1 h sin ramo
  return t;
}

describe("anotar horas a mano, por frase", () => {
  it("«estudié 2 horas de cálculo» anota hoy; con «ayer» anota ayer", () => {
    const { motor, estadisticas, calculo } = armar();
    const hoy = motor.resolver("estudié 2 horas de cálculo");
    assert.equal(hoy?.intencion, "estudio-anotar");
    assert.equal(hoy?.texto, "Listo, anoté 2 h de estudio de Cálculo (hoy).");
    const ayer = motor.resolver("estudié hora y media de cálculo ayer");
    assert.match(ayer!.texto, /1 h 30 min de estudio de Cálculo \(ayer\)/);
    const [ayerReg, hoyReg] = estadisticas.registros(); // ordenados por inicio: ayer a las 12:00 primero
    assert.deepEqual([hoyReg.ramoId, (hoyReg.finMs - hoyReg.inicioMs) / MIN], [calculo, 120]);
    assert.equal(new Date(ayerReg.inicioMs).getDate(), 6);
    assert.equal((ayerReg.finMs - ayerReg.inicioMs) / MIN, 90);
  });

  it("sin ramo anota «sin ramo»; con un ramo desconocido no guarda nada", () => {
    const { motor, estadisticas } = armar();
    assert.match(motor.resolver("estudié 45 minutos")!.texto, /45 min de estudio \(hoy\)/);
    assert.match(motor.resolver("estudié 1 hora de química")!.texto, /No encontré un ramo llamado química/);
    assert.equal(estadisticas.registros().length, 1);
  });

  it("más de 12 horas, o tiempos que no son tiempos, no se anotan", () => {
    const { motor, estadisticas } = armar();
    assert.equal(motor.resolver("estudié 20 horas de cálculo"), null);
    assert.equal(estadisticas.registros().length, 0);
  });
});

describe("preguntar cuánto se estudió", () => {
  it("esta semana, con la comparación de la semana pasada a la misma altura", () => {
    const { motor, estadisticas } = conDatos();
    estadisticas.anotarManual(90, null, en(-7, 0), AHORA.getTime()); // miércoles pasado 12:00
    for (const frase of ["¿cuánto he estudiado esta semana?", "cuánto llevo estudiando", "cuánto estudié esta semana"]) {
      const r = motor.resolver(frase);
      assert.equal(r?.intencion, "estudio-horas", frase);
      assert.match(r!.texto, /^Esta semana llevas 3 h estudiados\. La semana pasada, a esta altura, ibas en 1 h 30 min\.$/, frase);
    }
  });

  it("hoy, ayer y por ramo", () => {
    const { motor } = conDatos();
    assert.equal(motor.resolver("¿cuánto he estudiado hoy?")!.texto, "Hoy llevas 1 h estudiados.");
    assert.equal(motor.resolver("¿cuánto estudié ayer?")!.texto, "Ayer estudiaste 2 h estudiados.");
    assert.equal(motor.resolver("¿cuánto he estudiado de cálculo esta semana?")!.texto, "En Cálculo llevas 2 h esta semana.");
    assert.equal(motor.resolver("¿cuánto he estudiado de cálculo?")!.texto, "En Cálculo llevas 2 h esta semana.");
    assert.match(motor.resolver("¿cuánto he estudiado de física esta semana?")!.texto, /Todavía no has estudiado nada de Física esta semana/);
    assert.match(motor.resolver("¿cuánto he estudiado de química?")!.texto, /No encontré un ramo llamado química/);
  });

  it("sin datos invita a empezar", () => {
    const { motor } = armar();
    assert.match(motor.resolver("¿cuánto he estudiado esta semana?")!.texto, /Todavía no tengo registros de estudio/);
  });
});

describe("la racha, por frase", () => {
  it("cuenta los días seguidos y dice cuánto falta hoy", () => {
    const { motor, estadisticas } = armar();
    estadisticas.anotarManual(60, null, en(-2, 0), AHORA.getTime());
    estadisticas.anotarManual(60, null, en(-1, 0), AHORA.getTime());
    estadisticas.anotarManual(10, null, en(0, 0), AHORA.getTime());
    for (const frase of ["¿cuál es mi racha?", "cuántos días seguidos he estudiado", "mi racha de estudio"]) {
      const r = motor.resolver(frase);
      assert.equal(r?.intencion, "estudio-racha", frase);
      assert.match(r!.texto, /Llevas 2 días seguidos estudiando/, frase);
      assert.match(r!.texto, /te faltan 15 min para no cortarla/, frase);
    }
  });
});

describe("controles y función apagada", () => {
  it("frases que no son del tiempo estudiado", () => {
    const { motor } = conDatos();
    for (const frase of ["estudié para el certamen", "pagué 2 horas de estacionamiento", "gasté 5 lucas en estudio", "cuánto gasté esta semana", "estudio de caso para mañana"]) {
      const r = motor.resolver(frase);
      assert.ok(!r || !["estudio-horas", "estudio-racha", "estudio-anotar"].includes(r.intencion), frase);
    }
  });
  it("apagada dice dónde prenderla; sin estadísticas conectadas (MCP) va al agente", () => {
    assert.equal(armar(false).motor.resolver("¿cuánto he estudiado esta semana?")!.texto, MENSAJE_APAGADA);
    assert.equal(armar(true, false).motor.resolver("estudié 2 horas de cálculo"), null);
  });
});
