import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEMANAS_GRAFICO, minutosPorDiaYRamo, resumirEstudio, serieDeRamo, semanasDeEstudio, type RegistroEstudio } from "../src/estadisticas-tipos.ts";

const MIN = 60_000;
// Miércoles 7 de octubre de 2026, 14:00: la semana actual parte el lunes 5.
const AHORA = new Date(2026, 9, 7, 14, 0).getTime();
const en = (dias: number, h: number, m = 0) => new Date(2026, 9, 7 + dias, h, m).getTime();
let siguiente = 1;
const reg = (ini: number, minutos: number, ramoId: number | null = null, fuente: RegistroEstudio["fuente"] = "manual"): RegistroEstudio => ({ id: siguiente++, inicioMs: ini, finMs: ini + minutos * MIN, ramoId, fuente });

describe("las 8 semanas de estudio", () => {
  it("son ocho, de la más vieja a la actual, cada una desde su lunes a las 00:00", () => {
    const s = semanasDeEstudio([], AHORA);
    assert.equal(s.length, SEMANAS_GRAFICO);
    assert.equal(s.at(-1)!.actual, true);
    assert.equal(s.filter((x) => x.actual).length, 1);
    assert.equal(s.at(-1)!.desdeMs, new Date(2026, 9, 5).getTime());
    assert.equal(s[0].desdeMs, new Date(2026, 7, 17).getTime());
    for (const x of s) {
      const d = new Date(x.desdeMs);
      assert.deepEqual([d.getDay(), d.getHours(), d.getMinutes()], [1, 0, 0], "lunes 00:00 aun con el cambio de hora de septiembre");
      assert.equal(x.totalMin, 0);
      assert.deepEqual(x.porRamo, []);
    }
  });

  it("junta lo estudiado por ramo, de más a menos, con «sin ramo» aparte", () => {
    const rs = [reg(en(0, 9), 60, 1), reg(en(-1, 20), 45, 2), reg(en(-2, 10), 30, 1), reg(en(0, 16), 20, null), reg(en(-8, 9), 90, 2), reg(en(-15, 9), 25, 1)];
    const s = semanasDeEstudio(rs, AHORA);
    assert.deepEqual(s.at(-1)!.porRamo, [{ ramoId: 1, min: 90 }, { ramoId: 2, min: 45 }, { ramoId: null, min: 20 }]);
    assert.equal(s.at(-1)!.totalMin, 155);
    assert.deepEqual(s.at(-2)!.porRamo, [{ ramoId: 2, min: 90 }]);
    assert.deepEqual(s.at(-3)!.porRamo, [{ ramoId: 1, min: 25 }]);
    assert.equal(s.at(-4)!.totalMin, 0, "una semana sin estudio queda en cero");
  });

  it("un registro que cruza la medianoche del domingo se reparte entre dos semanas", () => {
    const domingo = en(-3, 23, 30); // domingo 4 de octubre, 23:30
    const s = semanasDeEstudio([reg(domingo, 60, 1)], AHORA);
    assert.equal(s.at(-2)!.totalMin, 30);
    assert.equal(s.at(-1)!.totalMin, 30);
  });

  it("un bloque hecho no se suma si hubo un pomodoro encima, y lo viejo queda fuera", () => {
    const rs = [reg(en(0, 9), 50, 1, "pomodoro"), reg(en(0, 9, 10), 50, 1, "bloque"), reg(new Date(2026, 5, 1, 9).getTime(), 120, 1)];
    const s = semanasDeEstudio(rs, AHORA);
    assert.equal(s.at(-1)!.totalMin, 50);
    assert.equal(s.reduce((t, x) => t + x.totalMin, 0), 50, "junio queda fuera de las 8 semanas");
  });

  it("la serie de un ramo y la de «sin ramo»", () => {
    const rs = [reg(en(0, 9), 60, 1), reg(en(-8, 9), 90, 1), reg(en(-8, 12), 30, null)];
    const s = semanasDeEstudio(rs, AHORA);
    assert.deepEqual(serieDeRamo(s, 1), [0, 0, 0, 0, 0, 0, 90, 60]);
    assert.deepEqual(serieDeRamo(s, null), [0, 0, 0, 0, 0, 0, 30, 0]);
    assert.deepEqual(serieDeRamo(s, 99), [0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("también cruza el cambio de año", () => {
    const enero = new Date(2027, 0, 6, 12).getTime();
    const s = semanasDeEstudio([reg(new Date(2026, 11, 29, 10).getTime(), 40, 1)], enero);
    assert.equal(s.at(-2)!.totalMin, 40);
    assert.equal(s.length, 8);
  });

  it("va dentro del resumen que manda el puente", () => {
    const r = resumirEstudio([reg(en(0, 9), 60, 1)], AHORA);
    assert.equal(r.semanas?.length, 8);
    assert.equal(r.semanas!.at(-1)!.totalMin, r.totalMin);
    assert.equal(resumirEstudio([], AHORA).semanas?.length, 8);
  });
});

describe("cada día de la semana por ramo", () => {
  const lunes = new Date(2026, 9, 5).getTime();

  it("reparte cada día entre sus ramos, de más a menos, y deja vacíos los días sin estudio", () => {
    const rs = [reg(en(-2, 9), 60, 1), reg(en(-2, 11), 120, 2), reg(en(-2, 15), 30, null), reg(en(0, 9), 45, 1)];
    const d = minutosPorDiaYRamo(rs, lunes, 7);
    assert.equal(d.length, 7);
    assert.deepEqual(d[0], [{ ramoId: 2, min: 120 }, { ramoId: 1, min: 60 }, { ramoId: null, min: 30 }]);
    assert.deepEqual(d[1], []);
    assert.deepEqual(d[2], [{ ramoId: 1, min: 45 }]);
    assert.deepEqual(d[6], []);
  });

  it("un registro que cruza la medianoche se reparte y un bloque duplicado no se cuenta", () => {
    const rs = [reg(en(-2, 23, 30), 60, 1), reg(en(0, 9), 50, 1, "pomodoro"), reg(en(0, 9, 10), 50, 1, "bloque")];
    const d = minutosPorDiaYRamo(rs, lunes, 7);
    assert.deepEqual(d[0], [{ ramoId: 1, min: 30 }]);
    assert.deepEqual(d[1], [{ ramoId: 1, min: 30 }]);
    assert.deepEqual(d[2], [{ ramoId: 1, min: 50 }]);
  });

  it("va dentro del resumen y cuadra con los minutos por día", () => {
    const r = resumirEstudio([reg(en(-2, 9), 60, 1), reg(en(-2, 11), 90, 2)], AHORA);
    assert.equal(r.porDiaRamo?.length, 7);
    assert.equal(r.porDiaRamo![0].reduce((t, x) => t + x.min, 0), r.porDia[0]);
  });
});
