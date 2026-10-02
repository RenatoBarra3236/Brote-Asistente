import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLANTILLAS_BASE, coincidir, compilar, type Plantilla } from "../src/plantillas.ts";

function plantilla(patron: string): Plantilla {
  return { id: "prueba", intencion: "registrar-gasto", patron, origen: "aprendida" };
}

describe("plantillas", () => {
  it("captura las ranuras normalizadas y tal como se escribieron", () => {
    const resultado = coincidir(plantilla("[me] (gaste|pague) {monto} en {cosa}"), "Gasté 2 lucas en un Café");
    assert.deepEqual(resultado, {
      ranuras: { monto: "2 lucas", cosa: "un cafe" },
      originales: { monto: "2 lucas", cosa: "un Café" },
    });
  });

  it("los opcionales funcionan al comienzo, al medio y al final", () => {
    const p = plantilla("[mis] gastos [de|del] [{periodo}]");
    assert.ok(coincidir(p, "gastos"));
    assert.ok(coincidir(p, "mis gastos"));
    assert.ok(coincidir(p, "gastos de hoy"));
    assert.equal(coincidir(p, "mis gastos de la semana pasada")?.ranuras.periodo, "la semana pasada");
    assert.equal(coincidir(p, "mis  gastos  hoy")?.ranuras.periodo, "hoy");
  });

  it("no calza con palabras a medias", () => {
    assert.equal(coincidir(plantilla("gaste {monto}"), "gastemos 500"), null);
  });

  it("rechaza patrones mal escritos", () => {
    assert.throws(() => compilar("gaste {plata}"), /ranura desconocida/);
    assert.throws(() => compilar("(gaste|pague {monto}"), /falta/);
    assert.throws(() => compilar("gaste {monto} en {monto}"), /dos veces/);
    assert.throws(() => compilar("gaste | pague"), /fuera de un grupo/);
    assert.throws(() => compilar("gaste @"), /inesperado/);
  });

  it("todas las plantillas base compilan y tienen id único", () => {
    for (const p of PLANTILLAS_BASE) compilar(p.patron);
    assert.equal(new Set(PLANTILLAS_BASE.map((p) => p.id)).size, PLANTILLAS_BASE.length);
  });
});
