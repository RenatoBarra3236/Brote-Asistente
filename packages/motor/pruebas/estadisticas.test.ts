import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EstadisticasEstudio } from "../src/estadisticas.ts";
import { MAX_MANUAL_MIN, formatearMinutos, inicioDeSemana, minutosEnRango, minutosPorDia, racha, resumirEstudio, sinDuplicados, validarMinutosManual } from "../src/estadisticas-tipos.ts";
import type { RegistroEstudio } from "../src/estadisticas-tipos.ts";
import { Gastos } from "../src/gastos.ts";
import { Notas } from "../src/notas.ts";
import { PlanesEstudio } from "../src/plan-estudio.ts";
import { Ramos } from "../src/ramos.ts";
import { Temporizadores } from "../src/temporizadores.ts";

const MIN = 60_000;
const AHORA = new Date(2026, 9, 7, 14, 0).getTime(); // miércoles 7 de octubre de 2026, 14:00 (la semana parte el lunes 5)
const en = (dias: number, h: number, m = 0) => new Date(2026, 9, 7 + dias, h, m).getTime();
let siguiente = 1;
const reg = (ini: number, minutos: number, ramoId: number | null = null, fuente: RegistroEstudio["fuente"] = "manual"): RegistroEstudio => ({ id: siguiente++, inicioMs: ini, finMs: ini + minutos * MIN, ramoId, fuente });

describe("minutos y días", () => {
  it("la semana parte el lunes a las 00:00", () => {
    assert.equal(inicioDeSemana(AHORA), new Date(2026, 9, 5).getTime());
    assert.equal(inicioDeSemana(new Date(2026, 9, 11, 23, 59).getTime()), new Date(2026, 9, 5).getTime()); // domingo
    assert.equal(inicioDeSemana(new Date(2026, 9, 12, 0, 1).getTime()), new Date(2026, 9, 12).getTime()); // lunes
  });

  it("suma minutos en un rango y por ramo", () => {
    const rs = [reg(en(0, 9), 60, 1), reg(en(0, 11), 30, 2), reg(en(-1, 20), 45, 1)];
    assert.equal(minutosEnRango(rs, en(0, 0), en(1, 0)), 90);
    assert.equal(minutosEnRango(rs, en(-2, 0), en(1, 0), 1), 105);
    assert.equal(minutosEnRango(rs, en(-2, 0), en(1, 0), null), 0);
  });

  it("un registro que cruza la medianoche se reparte entre los dos días", () => {
    const rs = [reg(en(0, 23, 30), 90)];
    assert.deepEqual(minutosPorDia(rs, en(0, 0), 2), [30, 60]);
  });

  it("un bloque del plan no se suma si hubo un pomodoro que se solapa, pero lo manual sí", () => {
    const pomodoro = reg(en(0, 16), 25, 1, "pomodoro");
    const bloque = reg(en(0, 16), 50, 1, "bloque");
    const otroBloque = reg(en(0, 18), 50, 1, "bloque");
    const manual = reg(en(0, 16), 60, 1, "manual");
    assert.equal(sinDuplicados([pomodoro, bloque, otroBloque, manual]).length, 3);
    assert.equal(minutosEnRango([pomodoro, bloque, otroBloque, manual], en(0, 0), en(1, 0)), 25 + 50 + 60);
  });
});

describe("la racha", () => {
  const dia = (d: number, min = 30) => reg(en(d, 10), min);
  it("cuenta días seguidos con al menos 25 minutos", () => {
    assert.equal(racha([dia(0), dia(-1), dia(-2)], AHORA), 3);
    assert.equal(racha([dia(0), dia(-1, 20), dia(-2)], AHORA), 1); // ayer no llegó al mínimo
  });
  it("si hoy aún no estudias, la racha de ayer sigue viva", () => {
    assert.equal(racha([dia(-1), dia(-2), dia(-3)], AHORA), 3);
    assert.equal(racha([dia(-1, 10), dia(-2), dia(-3)], AHORA), 0);
    assert.equal(racha([dia(0, 10), dia(-1), dia(-2)], AHORA), 2); // hoy lleva poco: no suma, pero no corta
  });
  it("un día vacío corta la racha, y sin datos es 0", () => {
    assert.equal(racha([dia(0), dia(-2), dia(-3)], AHORA), 1);
    assert.equal(racha([], AHORA), 0);
  });
});

describe("el resumen de la semana", () => {
  it("total, semana pasada a la misma altura, días, ramos y totales", () => {
    const rs = [
      reg(en(-2, 10), 60, 1), // lunes (esta semana)
      reg(en(0, 9), 120, 2), // hoy
      reg(en(-7, 10), 90, 1), // miércoles pasado 10:00: antes de la misma altura (14:00)
      reg(en(-5, 16), 30, 1), // viernes pasado: después de la misma altura
    ];
    const r = resumirEstudio(rs, AHORA);
    assert.equal(r.totalMin, 180);
    assert.equal(r.pasadaMin, 90);
    assert.equal(r.hoy, 2);
    assert.deepEqual(r.porDia, [60, 0, 120, 0, 0, 0, 0]);
    assert.equal(r.hoyMin, 120);
    assert.deepEqual(r.porRamo.map((x) => [x.ramoId, x.min]), [[2, 120], [1, 60]]);
    assert.ok(Math.abs(r.porRamo[0].fraccion - 2 / 3) < 1e-9);
    assert.equal(r.totales.find((t) => t.ramoId === 1)?.totalMin, 180);
    assert.equal(r.hay, true);
    assert.equal(r.desdeMs, en(-7, 10));
  });
  it("sin registros no hay nada que mostrar", () => {
    const r = resumirEstudio([], AHORA);
    assert.equal(r.hay, false);
    assert.equal(r.desdeMs, null);
    assert.equal(r.totalMin, 0);
  });
  it("a través del cambio de hora los días siguen siendo de 24 h de pared", () => {
    for (const [mes, d] of [[2, 29], [3, 5], [8, 5], [9, 1], [9, 25], [10, 1]] as const) {
      const lunes = inicioDeSemana(new Date(2026, mes, d, 12).getTime());
      const dias = minutosPorDia([{ id: 1, inicioMs: new Date(2026, mes, d, 9).getTime(), finMs: new Date(2026, mes, d, 10).getTime(), ramoId: null, fuente: "manual" }], lunes, 7);
      assert.equal(dias.reduce((a, b) => a + b, 0), 60);
    }
  });
});

describe("formato y validación", () => {
  it("formatea minutos", () => {
    assert.deepEqual([0, 45, 60, 380, 125].map(formatearMinutos), ["0 min", "45 min", "1 h", "6 h 20 min", "2 h 5 min"]);
  });
  it("una anotación a mano va de 1 minuto a 12 horas", () => {
    assert.equal(validarMinutosManual(90).ok, true);
    for (const malo of [0, -5, MAX_MANUAL_MIN + 1, "x", null, NaN]) assert.equal(validarMinutosManual(malo).ok, false, String(malo));
  });
});

function armar() {
  const gastos = new Gastos(":memory:");
  const ramos = new Ramos(gastos);
  const estadisticas = new EstadisticasEstudio(gastos, ramos);
  const temporizadores = new Temporizadores(gastos);
  const calculo = (ramos.crear({ nombre: "Cálculo" }, 1) as { ok: true; ramo: { id: number } }).ramo.id;
  return { gastos, ramos, estadisticas, temporizadores, calculo };
}

describe("estadísticas guardadas", () => {
  it("anotar a mano: hoy termina ahora, ayer parte a las 12:00, el futuro y lo exagerado no", () => {
    const { estadisticas, calculo } = armar();
    const hoy = estadisticas.anotarManual(120, calculo, en(0, 0), AHORA);
    assert.ok(hoy.ok);
    assert.equal(hoy.registro.finMs, AHORA);
    assert.equal(hoy.registro.inicioMs, AHORA - 120 * MIN);
    const ayer = estadisticas.anotarManual(90, null, en(-1, 0), AHORA);
    assert.ok(ayer.ok);
    assert.equal(ayer.registro.inicioMs, en(-1, 12));
    assert.equal(estadisticas.anotarManual(60, calculo, en(1, 0), AHORA).ok, false);
    assert.equal(estadisticas.anotarManual(MAX_MANUAL_MIN + 1, calculo, en(0, 0), AHORA).ok, false);
    assert.equal(estadisticas.anotarManual(60, 999, en(0, 0), AHORA).ok, false);
  });

  it("avisa si el día pasa de 16 horas, pero lo guarda", () => {
    const { estadisticas } = armar();
    const ayer = en(-1, 0);
    estadisticas.anotarManual(600, null, ayer, AHORA);
    const r = estadisticas.anotarManual(420, null, ayer, AHORA);
    assert.ok(r.ok && r.avisoDia);
    assert.equal(estadisticas.registros().length, 2);
  });

  it("borrar un ramo deja su tiempo «sin ramo»; los borrados quitan de verdad", () => {
    const { estadisticas, ramos, calculo } = armar();
    estadisticas.anotarManual(60, calculo, en(-1, 0), AHORA);
    estadisticas.anotarManual(30, calculo, en(-2, 0), AHORA);
    ramos.borrar(calculo);
    assert.deepEqual(estadisticas.registros().map((r) => r.ramoId), [null, null]);
    assert.equal(estadisticas.borrarDeRamo(null), 2);
    estadisticas.anotarManual(10, null, en(-1, 0), AHORA);
    assert.ok(estadisticas.borrarRegistro(estadisticas.registros()[0].id));
    estadisticas.anotarManual(10, null, en(-1, 0), AHORA);
    assert.equal(estadisticas.borrarTodo(), 1);
  });

  it("la marca cambia con cada alta y baja", () => {
    const { estadisticas } = armar();
    const m0 = estadisticas.marca();
    estadisticas.anotarManual(30, null, en(-1, 0), AHORA);
    const m1 = estadisticas.marca();
    estadisticas.borrarTodo();
    assert.notEqual(m0, m1);
    assert.equal(estadisticas.marca(), m0);
  });
});

describe("el pomodoro y los bloques dejan su registro", () => {
  it("un bloque de estudio completo queda registrado con su horario y su ramo", () => {
    const { estadisticas, temporizadores, ramos, calculo } = armar();
    const t = temporizadores.iniciarPomodoro(25 * MIN, "Cálculo", new Date(AHORA));
    ramos.asignar("pomodoro", t.id, calculo);
    temporizadores.revisar(new Date(AHORA + 26 * MIN));
    const [r] = estadisticas.registros();
    assert.deepEqual([r.fuente, r.ramoId, r.inicioMs, r.finMs], ["pomodoro", calculo, AHORA, AHORA + 25 * MIN]);
    // El descanso no cuenta, y el siguiente bloque se suma aparte.
    temporizadores.revisar(new Date(AHORA + 32 * MIN));
    temporizadores.revisar(new Date(AHORA + 58 * MIN));
    assert.equal(estadisticas.registros().length, 2);
  });

  it("revisar dos veces lo mismo no cuenta dos veces", () => {
    const { estadisticas, temporizadores } = armar();
    temporizadores.iniciarPomodoro(25 * MIN, null, new Date(AHORA));
    temporizadores.revisar(new Date(AHORA + 26 * MIN));
    temporizadores.revisar(new Date(AHORA + 26 * MIN));
    assert.equal(estadisticas.registros().length, 1);
  });

  it("cancelar a mitad cuenta lo transcurrido solo si pasó de 10 minutos", () => {
    const { estadisticas, temporizadores } = armar();
    const a = temporizadores.iniciarPomodoro(25 * MIN, null, new Date(AHORA));
    temporizadores.cancelar({ id: a.id }, new Date(AHORA + 8 * MIN));
    assert.equal(estadisticas.registros().length, 0);
    const b = temporizadores.iniciarPomodoro(25 * MIN, null, new Date(AHORA + 10 * MIN));
    temporizadores.cancelar({ id: b.id }, new Date(AHORA + 10 * MIN + 18 * MIN));
    const [r] = estadisticas.registros();
    assert.equal((r.finMs - r.inicioMs) / MIN, 18);
  });

  it("empezar otro pomodoro cancela el anterior y cuenta lo que llevaba; un temporizador común no cuenta", () => {
    const { estadisticas, temporizadores } = armar();
    temporizadores.iniciarPomodoro(25 * MIN, null, new Date(AHORA));
    temporizadores.iniciarPomodoro(25 * MIN, null, new Date(AHORA + 15 * MIN));
    assert.equal(estadisticas.registros().length, 1);
    const t = temporizadores.crear(20 * MIN, "sacar la ropa", new Date(AHORA));
    temporizadores.cancelar({ id: t.id }, new Date(AHORA + 15 * MIN));
    temporizadores.revisar(new Date(AHORA + 60 * MIN));
    assert.equal(estadisticas.registros().filter((r) => r.fuente === "pomodoro").length, 2);
  });

  it("un bloque del plan marcado «hecho» suma su horario, y desmarcarlo lo quita", () => {
    const gastos = new Gastos(":memory:");
    const ramos = new Ramos(gastos);
    const notas = new Notas(gastos, ramos);
    const estadisticas = new EstadisticasEstudio(gastos, ramos);
    const planes = new PlanesEstudio(gastos, notas);
    const calculo = (ramos.crear({ nombre: "Cálculo" }, 1) as { ok: true; ramo: { id: number } }).ramo.id;
    const ev = notas.crear(calculo, { nombre: "Certamen 1", peso: 30 }, 1);
    assert.ok(ev.ok);
    const plan = planes.crear(calculo, ev.evaluacion.id, en(5, 15), 2, [{ tipo: "temas", inicioMs: en(1, 16), finMs: en(1, 16, 50) }], false, AHORA);
    assert.ok(plan.ok);
    const bloque = plan.plan.bloques[0].id;
    planes.marcar(bloque, "hecho");
    assert.deepEqual(estadisticas.registros().map((r) => [r.fuente, r.ramoId, (r.finMs - r.inicioMs) / MIN]), [["bloque", calculo, 50]]);
    planes.marcar(bloque, "hecho");
    assert.equal(estadisticas.registros().length, 1);
    planes.marcar(bloque, "pendiente");
    assert.equal(estadisticas.registros().length, 0);
  });
});
