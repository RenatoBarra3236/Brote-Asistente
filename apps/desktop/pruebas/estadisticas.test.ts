import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { alturasBarras, barrasPorRamo, etiquetaDia, lineaDeRamo, textoDesde, textoDiferencia, textoRachaCorto } from "../src/agente/estadisticas.ts";

describe("las estadísticas de estudio en la isla", () => {
  it("la diferencia con la semana pasada, a la misma altura", () => {
    assert.equal(textoDiferencia(380, 310), "+1 h 10 min que la semana pasada");
    assert.equal(textoDiferencia(200, 220), "−20 min que la semana pasada");
    assert.equal(textoDiferencia(120, 120), "igual que la semana pasada");
    assert.equal(textoDiferencia(120, 0), null);
  });

  it("la racha solo se muestra si existe", () => {
    assert.equal(textoRachaCorto(0), null);
    assert.equal(textoRachaCorto(1), "🔥 1 día");
    assert.equal(textoRachaCorto(4), "🔥 4 días");
  });

  it("las barras: la mayor llena la caja y lo poco no desaparece", () => {
    assert.deepEqual(alturasBarras([60, 0, 120, 0, 0, 0, 0]), [50, 0, 100, 0, 0, 0, 0]);
    assert.deepEqual(alturasBarras([1, 1000, 0, 0, 0, 0, 0]), [6, 100, 0, 0, 0, 0, 0]);
    assert.deepEqual(alturasBarras([0, 0, 0, 0, 0, 0, 0]), [0, 0, 0, 0, 0, 0, 0]);
    assert.equal(etiquetaDia(2, 90), "miércoles: 1 h 30 min");
    assert.equal(etiquetaDia(0, 0), "lunes: nada");
  });

  it("las barras por ramo agrupan lo que pasa del tope en «Otros»", () => {
    const porRamo = [1, 2, 3, 4, 5, 6, 7].map((id, i) => ({ ramoId: id as number | null, min: 70 - i * 10, fraccion: (70 - i * 10) / 280 }));
    const barras = barrasPorRamo(porRamo, (id) => `R${id}`);
    assert.equal(barras.length, 6);
    assert.equal(barras.at(-1)!.etiqueta, "Otros");
    assert.equal(barras.at(-1)!.min, 20 + 10); // 7.º y 6.º: 20 y 10... con mínimos 70-50=20 y 70-60=10
    assert.equal(barrasPorRamo(porRamo.slice(0, 3), (id) => `R${id}`).length, 3);
  });

  it("la línea de la ficha del ramo y desde cuándo hay datos", () => {
    assert.equal(lineaDeRamo(undefined), null);
    assert.equal(lineaDeRamo({ ramoId: 1, semanaMin: 0, totalMin: 0 }), null);
    assert.equal(lineaDeRamo({ ramoId: 1, semanaMin: 130, totalMin: 840 }), "Esta semana: 2 h 10 min · en total: 14 h");
    assert.equal(lineaDeRamo({ ramoId: 1, semanaMin: 0, totalMin: 60 }), "Esta semana: nada · en total: 1 h");
    assert.equal(textoDesde(new Date(2026, 9, 5).getTime()), "Contando desde el 5 oct");
    assert.equal(textoDesde(null), null);
  });
});
