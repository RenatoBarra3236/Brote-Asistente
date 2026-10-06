import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { claveDelDia, debeMostrarResumen } from "../src/agente/resumen-manana.ts";

const a = (h: number, m = 0, dia = 7) => new Date(2026, 9, dia, h, m).getTime();

describe("el aviso automático del resumen de la mañana", () => {
  it("la clave del día es AAAA-MM-DD en hora local", () => {
    assert.equal(claveDelDia(a(8)), "2026-10-07");
    assert.equal(claveDelDia(new Date(2026, 0, 3, 23, 59).getTime()), "2026-01-03");
  });

  it("solo entre las 6:00 y las 11:59, una vez al día", () => {
    assert.equal(debeMostrarResumen(a(5, 59), null, true), false);
    assert.equal(debeMostrarResumen(a(6, 0), null, true), true);
    assert.equal(debeMostrarResumen(a(11, 59), null, true), true);
    assert.equal(debeMostrarResumen(a(12, 0), null, true), false);
    assert.equal(debeMostrarResumen(a(9), "2026-10-07", true), false, "ya se mostró hoy");
    assert.equal(debeMostrarResumen(a(9, 0, 8), "2026-10-07", true), true, "al día siguiente vuelve");
  });

  it("con el interruptor apagado nunca", () => {
    assert.equal(debeMostrarResumen(a(9), null, false), false);
  });
});
