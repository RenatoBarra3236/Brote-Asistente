import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { describirProyeccion, proyectarMes, resumenPlata, tendenciaMeses, type GastoPlano } from "../src/plata.ts";
import type { Categoria } from "../src/categorias.ts";

// Martes 13 de octubre de 2026, 18:00 (hora local): 13 días del mes y 18 por delante.
const AHORA = new Date(2026, 9, 13, 18, 0).getTime();
let siguiente = 1;
const g = (mes: number, dia: number, monto: number, descripcion: string | null = null, categoria: Categoria = "otros"): GastoPlano => ({
  id: siguiente++,
  monto,
  categoria,
  descripcion,
  fechaMs: new Date(2026, mes - 1, dia, 12).getTime(),
});

describe("la tendencia de 6 meses", () => {
  it("devuelve seis meses seguidos, el último parcial, con los vacíos en cero", () => {
    const lista = [g(10, 2, 20_000, "x", "comida"), g(10, 5, 5000, "y", "transporte"), g(9, 10, 100_000, "arriendo", "otros"), g(5, 20, 7000, "z", "comida")];
    const meses = tendenciaMeses(lista, AHORA);
    assert.deepEqual(meses.map((m) => m.clave), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    assert.deepEqual(meses.map((m) => m.corto), ["may", "jun", "jul", "ago", "sep", "oct"]);
    assert.deepEqual(meses.map((m) => m.total), [7000, 0, 0, 0, 100_000, 25_000]);
    assert.deepEqual(meses.map((m) => m.parcial), [false, false, false, false, false, true]);
    assert.equal(meses[1].mayor, null);
    assert.equal(meses[5].mayor?.categoria, "comida");
    assert.equal(meses[5].mayor?.total, 20_000);
  });

  it("cruza el cambio de año y no cuenta gastos de meses más viejos", () => {
    const enero = new Date(2027, 0, 15, 10).getTime();
    const lista: GastoPlano[] = [{ id: 1, monto: 9000, categoria: "otros", descripcion: null, fechaMs: new Date(2026, 7, 31, 23).getTime() }];
    const meses = tendenciaMeses(lista, enero);
    assert.deepEqual(meses.map((m) => m.clave), ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
    assert.equal(meses[0].total, 9000);
    assert.equal(tendenciaMeses(lista, new Date(2027, 1, 15).getTime()).every((m) => m.total === 0), true);
  });

  it("va dentro del resumen de la pestaña", () => {
    const r = resumenPlata([g(10, 2, 20_000, "x", "comida")], 100_000, AHORA);
    assert.equal(r.meses.length, 6);
    assert.equal(r.proyeccion.estado, "ok");
  });
});

describe("la proyección del mes", () => {
  const normal = [g(10, 1, 40_000, "a"), g(10, 7, 50_000, "b"), g(10, 12, 40_000, "c")];

  it("gastado ÷ días que van × días del mes", () => {
    const p = proyectarMes(normal, null, AHORA);
    assert.equal(p.estado, "ok");
    assert.equal(p.ritmoDia, 10_000);
    assert.equal(p.proyectado, 310_000);
    assert.equal(p.excluido, null);
    assert.equal(p.diferencia, null);
    assert.equal(p.color, null);
  });

  it("el semáforo contra el presupuesto: verde, ámbar y rojo", () => {
    const con = (monto: number) => proyectarMes(normal, monto, AHORA);
    assert.deepEqual([con(400_000).color, con(400_000).diferencia], ["verde", -90_000]);
    assert.deepEqual([con(330_000).color, con(330_000).diferencia], ["ambar", -20_000]);
    assert.deepEqual([con(300_000).color, con(300_000).diferencia], ["rojo", 10_000]);
  });

  it("antes del día 5 no proyecta", () => {
    const tres = new Date(2026, 9, 3, 18).getTime();
    const p = proyectarMes([g(10, 1, 90_000, "a")], 100_000, tres);
    assert.equal(p.estado, "pronto");
    assert.match(describirProyeccion(p, 100_000), /pronto/);
    assert.equal(proyectarMes([g(10, 1, 90_000, "a")], null, new Date(2026, 9, 5, 9).getTime()).estado, "ok");
  });

  it("deja fuera un gasto único que pesa más de la mitad y lo suma una sola vez", () => {
    const p = proyectarMes([g(10, 2, 200_000, "matrícula"), g(10, 10, 20_000, "almuerzo")], 400_000, AHORA);
    assert.deepEqual(p.excluido, { monto: 200_000, descripcion: "matrícula" });
    assert.equal(p.ritmoDia, 1538);
    assert.equal(p.proyectado, 247_692);
    assert.match(describirProyeccion(p, 400_000), /Sin contar tu gasto de \$200\.000 en matrícula/);
    // Justo la mitad no se descuenta.
    assert.equal(proyectarMes([g(10, 2, 50_000, "a"), g(10, 3, 50_000, "b")], null, AHORA).excluido, null);
  });

  it("sin gastos proyecta cero y no cuenta lo de otros meses ni lo futuro", () => {
    assert.equal(proyectarMes([], null, AHORA).proyectado, 0);
    const p = proyectarMes([g(9, 20, 90_000, "viejo"), g(10, 20, 90_000, "futuro")], null, AHORA);
    assert.equal(p.proyectado, 0);
  });

  it("en febrero bisiesto usa 29 días", () => {
    const dia10 = new Date(2028, 1, 10, 12).getTime();
    const p = proyectarMes([{ id: 1, monto: 100_000, categoria: "otros", descripcion: "a", fechaMs: new Date(2028, 1, 3, 12).getTime() }, { id: 2, monto: 100_000, categoria: "otros", descripcion: "b", fechaMs: new Date(2028, 1, 4, 12).getTime() }], null, dia10);
    assert.equal(p.proyectado, Math.round(200_000 + 20_000 * 19));
  });

  it("cuenta el cambio de hora sin errores (el mes de octubre en Chile tiene el cambio)", () => {
    const p = proyectarMes(normal, null, new Date(2026, 9, 13, 0, 5).getTime());
    assert.equal(p.proyectado, 310_000);
  });

  it("la frase dice si te pasas o te sobra", () => {
    assert.match(describirProyeccion(proyectarMes(normal, 300_000, AHORA), 300_000), /terminas el mes en \$310\.000.*te pasarías por \$10\.000/);
    assert.match(describirProyeccion(proyectarMes(normal, 400_000, AHORA), 400_000), /te sobrarían \$90\.000/);
    assert.doesNotMatch(describirProyeccion(proyectarMes(normal, null, AHORA), null), /presupuesto/);
  });
});

describe("la proyección sin IA", () => {
  let gastos: Gastos;
  let motor: Motor;
  beforeEach(() => {
    gastos = new Gastos(":memory:");
    motor = new Motor(gastos, { reloj: () => new Date(AHORA) });
  });

  it("entiende las frases, con o sin presupuesto", () => {
    for (const frase of ["¿cómo voy este mes?", "como voy con la plata", "¿cuánto voy a gastar este mes?", "cuánto gastaré este mes", "¿a qué ritmo gasto?"]) {
      assert.equal(motor.resolver(frase)?.intencion, "plata-proyeccion", frase);
    }
    assert.match(motor.resolver("¿cómo voy este mes?")!.texto, /terminas el mes en \$0/);
    gastos.ponerPresupuesto(100_000);
    assert.match(motor.resolver("a que ritmo gasto")!.texto, /te sobrarían \$100\.000/);
  });

  it("no se come otras frases", () => {
    assert.notEqual(motor.entender("¿cómo voy en cálculo?")?.accion.intencion, "plata-proyeccion");
    assert.equal(motor.entender("cómo voy con el presupuesto")?.accion.intencion, "presupuesto-queda");
    assert.notEqual(motor.entender("¿cuánto voy a gastar en el almuerzo de mañana?")?.accion.intencion, "plata-proyeccion");
    assert.notEqual(motor.entender("cuánto gasté este mes")?.accion.intencion, "plata-proyeccion");
  });

  it("con la función de gastos apagada, avisa", () => {
    const apagado = new Motor(gastos, { reloj: () => new Date(AHORA), activa: (f) => f !== "gastos" });
    assert.match(apagado.resolver("¿cómo voy este mes?")!.texto, /apagado/);
  });
});
