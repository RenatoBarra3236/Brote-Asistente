import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { leerDia, PATRON_DIA } from "../src/fechas.ts";

const AHORA = new Date(2026, 9, 5, 12, 0).getTime(); // lunes 5 de octubre de 2026
const dia = (t: string) => {
  const r = leerDia(t, AHORA);
  return r === null ? null : new Date(r).toDateString();
};

describe("leerDia", () => {
  it("hoy, mañana y pasado mañana", () => {
    assert.equal(dia("hoy"), "Mon Oct 05 2026");
    assert.equal(dia("manana"), "Tue Oct 06 2026");
    assert.equal(dia("pasado manana"), "Wed Oct 07 2026");
  });

  it("un día de la semana es el próximo; si es hoy, el de la semana que viene", () => {
    assert.equal(dia("el viernes"), "Fri Oct 09 2026");
    assert.equal(dia("el lunes"), "Mon Oct 12 2026");
  });

  it("«viernes 9» exige que el 9 caiga viernes, y si no existe en dos meses no adivina", () => {
    assert.equal(dia("el viernes 9"), "Fri Oct 09 2026");
    assert.equal(dia("viernes 9 de octubre"), "Fri Oct 09 2026");
    assert.equal(dia("viernes 10"), null);
  });

  it("«14 de octubre», con año, sin año (el próximo) y «el 14»", () => {
    assert.equal(dia("el 14 de octubre"), "Wed Oct 14 2026");
    assert.equal(dia("14 de octubre de 2026"), "Wed Oct 14 2026");
    assert.equal(dia("3 de enero"), "Sun Jan 03 2027");
    assert.equal(dia("el 14"), "Wed Oct 14 2026");
    assert.equal(dia("el 2"), "Mon Nov 02 2026");
  });

  it("fechas imposibles o pasadas dan null", () => {
    assert.equal(dia("31 de febrero"), null);
    assert.equal(dia("14 de octubre de 2025"), null);
    assert.equal(dia("el sabado 31 de septiembre"), null);
    assert.equal(dia("cuando pueda"), null);
    assert.equal(dia("14"), null);
  });

  it("el patrón de la ranura acepta lo mismo", () => {
    const re = new RegExp(`^(?:${PATRON_DIA})$`);
    for (const t of ["hoy", "manana", "el viernes 9", "viernes", "el 14 de octubre", "14 de octubre de 2026", "el 14"]) assert.match(t, re, t);
    for (const t of ["cuando pueda", "viernes pasado", "14"]) assert.doesNotMatch(t, re, t);
  });
});
