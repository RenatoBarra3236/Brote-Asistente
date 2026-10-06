import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { barrasMeses, barrasSemana, cuandoMovimiento, montoCorto, presupuestoDelMes, proyectarMes, resumenTendencia, tendenciaMeses, textoFrecuente, textoMes, textoProyeccion, textoPuedesHoy, textoVariacion } from "../src/agente/plata.ts";

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

describe("el gráfico de los últimos meses", () => {
  const AHORA = new Date(2026, 9, 13, 18).getTime();
  const gasto = (mes: number, dia: number, monto: number, categoria: "comida" | "otros" = "comida", descripcion = "x") => ({ id: mes * 100 + dia, monto, categoria, descripcion, fechaMs: new Date(2026, mes - 1, dia, 12).getTime() });
  const lista = [gasto(9, 3, 260_000), gasto(8, 3, 130_000, "otros"), gasto(10, 2, 60_000), gasto(10, 12, 60_000)];
  const meses = tendenciaMeses(lista, AHORA);
  const proy = proyectarMes(lista, null, AHORA);

  it("las barras son proporcionales y el mes más alto llena la caja", () => {
    const { barras } = barrasMeses(meses, null, null, 180, 50);
    assert.equal(barras.length, 6);
    assert.ok(Math.abs(barras[4].alto - 50) < 0.01, "septiembre es el más alto");
    assert.ok(Math.abs(barras[3].alto - 25) < 0.01);
    assert.equal(barras[1].alto, 1.5, "un mes sin gastos queda como una rayita");
    assert.ok(barras.every((b) => b.x >= 0 && b.x + b.ancho <= 180));
    assert.equal(barras[5].parcial, true);
  });

  it("la proyección se dibuja sobre la barra del mes en curso y puede cambiar la escala", () => {
    const g = barrasMeses(meses, proy, null, 180, 50);
    // 120.000 en 13 días → 120.000 + 9.230 × 18 ≈ 286.000: pasa a septiembre, así que manda la escala.
    assert.ok(proy.proyectado > 260_000);
    assert.ok(g.proyectado);
    assert.ok(Math.abs(g.proyectado!.y + g.proyectado!.alto - g.barras[5].y) < 0.01, "el tramo punteado termina donde empieza la barra");
    assert.ok(g.proyectado!.y >= -0.01, "no se sale de la caja");
    assert.equal(barrasMeses(meses, null, null, 180, 50).proyectado, null);
    assert.equal(barrasMeses(meses, proyectarMes(lista, null, new Date(2026, 9, 3).getTime()), null, 180, 50).proyectado, null, "antes del día 5 no hay tramo");
  });

  it("la línea del presupuesto entra a la escala solo si no queda muy lejos", () => {
    const cerca = barrasMeses(meses, null, 300_000, 180, 50);
    assert.ok(cerca.linea !== null && Math.abs(cerca.linea) < 0.01, "300 mil es el tope de la escala");
    assert.ok(cerca.barras[4].alto < 50);
    const lejos = barrasMeses(meses, null, 5_000_000, 180, 50);
    assert.equal(lejos.linea, null);
    assert.ok(Math.abs(lejos.barras[4].alto - 50) < 0.01);
    assert.equal(barrasMeses(meses, null, null, 180, 50).linea, null);
  });

  it("sin ningún gasto no revienta", () => {
    const vacios = tendenciaMeses([], AHORA);
    const g = barrasMeses(vacios, proyectarMes([], null, AHORA), 100_000, 180, 50);
    assert.ok(g.barras.every((b) => Number.isFinite(b.y) && b.alto === 1.5));
    assert.equal(g.proyectado, null);
  });

  it("dice cada mes y la proyección con palabras", () => {
    assert.equal(textoMes(meses[4]), "septiembre: $260 mil · más en 🍔 comida ($260 mil)");
    assert.equal(textoMes(meses[1]), "mayo: sin gastos".replace("mayo", "junio"));
    assert.match(textoMes(meses[5]), /^octubre \(va en\): \$120 mil/);
    const conPresupuesto = proyectarMes(lista, 250_000, AHORA);
    const t = textoProyeccion(conPresupuesto, 250_000);
    assert.match(t.titulo, /^A este ritmo cierras el mes en \$/);
    assert.match(t.detalle, /te pasarías por/);
    assert.equal(t.tono, "rojo");
    assert.equal(textoProyeccion(proyectarMes(lista, null, new Date(2026, 9, 3).getTime()), null).tono, "sin");
    assert.match(resumenTendencia(meses, conPresupuesto, 250_000), /Gastos de los últimos 6 meses: mayo.*octubre \$120 mil \(parcial\)\. A este ritmo/);
  });
});
