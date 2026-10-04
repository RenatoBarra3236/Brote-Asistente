import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { barrasSemana, cuandoMovimiento, montoCorto, presupuestoDelMes, textoFrecuente, textoPuedesHoy, textoVariacion } from "../src/agente/plata.ts";

const AHORA = new Date(2026, 9, 13, 18, 0).getTime();

describe("pestaña Plata (textos y barras)", () => {
  it("compara con el mes pasado", () => {
    assert.deepEqual(textoVariacion({ total: 12_000, cantidad: 3, mesPasado: 10_000, variacion: 20, nombre: "octubre" }), {
      texto: "▲ 20 % vs. el mes pasado",
      tono: "sube",
    });
    assert.equal(textoVariacion({ total: 5000, cantidad: 2, mesPasado: 10_000, variacion: -50, nombre: "octubre" }).tono, "baja");
    assert.equal(textoVariacion({ total: 0, cantidad: 0, mesPasado: 0, variacion: null, nombre: "octubre" }).texto, "Sin gastos anotados");
    assert.equal(textoVariacion({ total: 9, cantidad: 1, mesPasado: 0, variacion: null, nombre: "octubre" }).texto, "1 gasto en octubre");
  });

  it("dice cuánto puedes gastar hoy", () => {
    assert.deepEqual(textoPuedesHoy(presupuestoDelMes(190_000, 30_000, 0, AHORA)), { monto: "$8.421", detalle: "de $8.421 por día · quedan 19 días" });
    assert.equal(textoPuedesHoy(presupuestoDelMes(190_000, 45_000, 15_000, AHORA)).detalle, "te pasaste hoy · quedan 19 días");
    assert.match(textoPuedesHoy(presupuestoDelMes(190_000, 45_000, 15_000, AHORA)).monto, /^−\$/);
  });

  it("formatea montos cortos y fechas de movimientos", () => {
    assert.equal(montoCorto(900), "$900");
    assert.equal(montoCorto(84_500), "$85 mil");
    assert.equal(montoCorto(1_000_000), "$1 M");
    assert.equal(montoCorto(1_250_000), "$1,3 M");
    assert.equal(cuandoMovimiento(new Date(2026, 9, 13, 9, 5).getTime(), AHORA), "hoy 09:05");
    assert.equal(cuandoMovimiento(new Date(2026, 9, 12, 23).getTime(), AHORA), "ayer");
    assert.equal(cuandoMovimiento(new Date(2026, 8, 28).getTime(), AHORA), "28/9");
    assert.equal(textoFrecuente({ descripcion: "café", monto: 1500, emoji: "🍔" }), "🍔 café $1.500");
  });

  it("dibuja las barras proporcionales y resalta hoy", () => {
    const dias = [0, 1000, 0, 0, 0, 4000, 2000].map((total, i) => ({ letra: "LMMJVSD"[i], inicioMs: AHORA - (6 - i) * 86_400_000, total, hoy: i === 6 }));
    const barras = barrasSemana(dias, 140, 40);
    assert.equal(barras.length, 7);
    assert.equal(barras[5].alto, 40);
    assert.equal(barras[6].alto, 20);
    assert.equal(barras[0].alto, 1.5);
    assert.ok(barras[6].hoy && !barras[5].hoy);
    assert.ok(barras.every((b) => b.x >= 0 && b.x + b.ancho <= 140 && b.y + b.alto === 40));
    assert.match(barras[6].titulo, /^Hoy: \$2\.000$/);
  });
});
