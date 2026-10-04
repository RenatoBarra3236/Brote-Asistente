import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import {
  avisosPresupuesto,
  descubrir,
  gastosFrecuentes,
  leerAvisados,
  mismaAlturaMesPasado,
  presupuestoDelMes,
  resumenPlata,
  ultimosSieteDias,
  type GastoPlano,
} from "../src/plata.ts";
import type { Categoria } from "../src/categorias.ts";

// Martes 13 de octubre de 2026, 18:00 (hora local).
const AHORA = new Date(2026, 9, 13, 18, 0).getTime();
let siguiente = 1;
const g = (dia: [number, number], monto: number, descripcion: string | null, categoria: Categoria = "otros", hora = 12): GastoPlano => ({
  id: siguiente++,
  monto,
  categoria,
  descripcion,
  fechaMs: new Date(2026, dia[0] - 1, dia[1], hora).getTime(),
});

describe("la pestaña Plata", () => {
  it("compara el mes con el mes pasado a la misma altura", () => {
    const lista = [g([9, 5], 10_000, "arriendo"), g([9, 13], 2000, "micro", "transporte", 17), g([9, 13], 9000, "tarde", "otros", 19), g([10, 2], 6000, "almuerzo", "comida")];
    const r = resumenPlata(lista, null, AHORA);
    assert.equal(r.mes.total, 6000);
    assert.equal(r.mes.mesPasado, 12_000);
    assert.equal(r.mes.variacion, -50);
    assert.equal(r.mes.nombre, "octubre");
    assert.equal(r.presupuesto, null);
  });

  it("el 31 se compara con el último día de un mes más corto", () => {
    const fecha = new Date(mismaAlturaMesPasado(new Date(2026, 2, 31, 10).getTime()));
    assert.deepEqual([fecha.getMonth(), fecha.getDate(), fecha.getHours()], [1, 28, 10]);
  });

  it("calcula cuánto puedes gastar hoy y su color", () => {
    // 31 días en octubre: el 13 quedan 19 días contando hoy.
    const bien = presupuestoDelMes(190_000, 30_000, 0, AHORA);
    assert.equal(bien.diasQuedan, 19);
    assert.equal(bien.porDia, 8421);
    assert.equal(bien.puedesHoy, 8421);
    assert.equal(bien.color, "verde");
    const justo = presupuestoDelMes(190_000, 36_000, 6000, AHORA);
    assert.equal(justo.puedesHoy, 2421);
    assert.equal(justo.color, "ambar");
    const pasado = presupuestoDelMes(190_000, 45_000, 15_000, AHORA);
    assert.ok(pasado.puedesHoy < 0);
    assert.equal(pasado.color, "rojo");
    assert.equal(presupuestoDelMes(50_000, 60_000, 0, AHORA).color, "rojo");
  });

  it("arma los últimos 7 días con hoy al final", () => {
    const dias = ultimosSieteDias([g([10, 13], 1500, "café"), g([10, 7], 4000, "libro"), g([10, 6], 999, "fuera")], AHORA);
    assert.deepEqual(dias.map((d) => d.letra), ["M", "J", "V", "S", "D", "L", "M"]);
    assert.deepEqual(dias.map((d) => d.total), [4000, 0, 0, 0, 0, 0, 1500]);
    assert.equal(dias.filter((d) => d.hoy).length, 1);
    assert.ok(dias[6].hoy);
  });

  it("ordena las categorías del mes con su color y los últimos movimientos", () => {
    const lista = [g([10, 1], 3000, "micro", "transporte"), g([10, 3], 9000, "almuerzo", "comida"), g([10, 12], 1000, null, "salud")];
    const r = resumenPlata(lista, 100_000, AHORA);
    assert.deepEqual(r.categorias.map((c) => [c.categoria, c.emoji]), [["comida", "🍔"], ["transporte", "🚌"], ["salud", "💊"]]);
    assert.equal(r.categorias[0].fraccion, 9000 / 13_000);
    assert.match(r.categorias[0].color, /^#[0-9a-f]{6}$/);
    assert.deepEqual(r.ultimos.map((m) => m.descripcion), ["Salud", "almuerzo", "micro"]);
    assert.equal(r.presupuesto?.gastado, 13_000);
  });

  it("propone los gastos más repetidos como botones de un toque", () => {
    const lista = [
      g([10, 1], 1500, "Café"),
      g([10, 5], 1500, "café"),
      g([10, 9], 1500, "café", "comida"),
      g([10, 2], 800, "micro", "transporte"),
      g([10, 8], 800, "micro", "transporte"),
      g([10, 3], 5000, "almuerzo"),
      g([7, 1], 800, "micro"),
    ];
    const frecuentes = gastosFrecuentes(lista, AHORA);
    assert.deepEqual(frecuentes.map((f) => [f.descripcion, f.monto, f.veces, f.emoji]), [["café", 1500, 3, "🍔"], ["micro", 800, 2, "🚌"]]);
  });

  describe("descubrimientos sin IA", () => {
    it("una categoría que se disparó contra la semana pasada", () => {
      const lista = [g([10, 3], 4000, "uber", "transporte"), g([10, 9], 9000, "uber", "transporte"), g([10, 12], 6000, "uber", "transporte")];
      const d = descubrir(lista, AHORA);
      assert.equal(d?.tipo, "disparada");
      assert.match(d!.texto, /Transporte se disparó: \$15\.000 en 7 días, 275 % más/);
    });

    it("un gasto hormiga", () => {
      const lista = [1, 3, 5, 7, 9].map((dia) => g([10, dia], 1800, "café", "comida"));
      const d = descubrir(lista, AHORA);
      assert.equal(d?.tipo, "hormiga");
      assert.match(d!.texto, /«café» suma \$9\.000 en 30 días \(5 veces\)/);
    });

    it("un gasto que se repite cada mes", () => {
      const lista = [g([8, 12], 8000, "Netflix", "salidas"), g([9, 11], 8200, "netflix", "salidas")];
      const d = descubrir(lista, AHORA);
      assert.equal(d?.tipo, "repetido");
      assert.match(d!.texto, /«netflix» se repite cada mes \(~\$8\.200, cerca del día 11\)\. Este mes todavía no aparece\./);
    });

    it("sin nada raro, nada", () => {
      assert.equal(descubrir([g([10, 1], 5000, "almuerzo")], AHORA), null);
    });
  });

  it("avisa una vez al pasar 80 % y 100 %, y de nuevo si cambia el presupuesto o el mes", () => {
    let guardado = leerAvisados(null);
    const a = avisosPresupuesto(presupuestoDelMes(100_000, 82_000, 0, AHORA), AHORA, guardado);
    assert.equal(a.textos.length, 1);
    assert.match(a.textos[0], /80 %|82 %/);
    guardado = leerAvisados(JSON.stringify(a.avisados));
    assert.deepEqual(avisosPresupuesto(presupuestoDelMes(100_000, 85_000, 0, AHORA), AHORA, guardado).textos, []);
    const b = avisosPresupuesto(presupuestoDelMes(100_000, 101_000, 0, AHORA), AHORA, guardado);
    assert.match(b.textos[0], /Te pasaste del presupuesto/);
    // Si sube el presupuesto, los avisos vuelven a estar disponibles.
    assert.equal(avisosPresupuesto(presupuestoDelMes(120_000, 101_000, 0, AHORA), AHORA, b.avisados).textos.length, 1);
    // Pasar los dos de una vez dice solo el más alto.
    const ambos = avisosPresupuesto(presupuestoDelMes(100_000, 130_000, 0, AHORA), AHORA, null);
    assert.equal(ambos.textos.length, 1);
    assert.deepEqual(ambos.avisados?.dados, [80, 100]);
    assert.equal(leerAvisados("{malo"), null);
  });
});

describe("presupuesto sin IA", () => {
  let gastos: Gastos;
  let motor: Motor;
  const ahora = new Date(AHORA);
  beforeEach(() => {
    gastos = new Gastos(":memory:");
    motor = new Motor(gastos, { reloj: () => ahora });
  });
  const decir = (texto: string) => motor.resolver(texto);

  it("pone, consulta y quita el presupuesto", () => {
    assert.match(decir("¿cuánto puedo gastar hoy?")!.texto, /Todavía no tienes presupuesto/);
    const puesto = decir("mi presupuesto es 190 lucas al mes")!;
    assert.equal(puesto.intencion, "presupuesto-poner");
    assert.equal(gastos.presupuesto(), 190_000);
    assert.match(puesto.texto, /tu presupuesto es \$190\.000 al mes/);
    decir("gasté 30 lucas en arriendo");
    assert.match(decir("¿Cuánto me queda del presupuesto?")!.texto, /Te quedan \$160\.000 de \$190\.000/);
    assert.match(decir("cuanto puedo gastar hoy")!.texto, /Hoy ya te pasaste/);
    assert.equal(decir("pon mi presupuesto en 300 mil")?.intencion, "presupuesto-poner");
    assert.equal(gastos.presupuesto(), 300_000);
    assert.equal(decir("cómo voy con el presupuesto")?.intencion, "presupuesto-queda");
    assert.match(decir("quita mi presupuesto")!.texto, /quité tu presupuesto/);
    assert.equal(gastos.presupuesto(), null);
  });

  it("no confunde el presupuesto con un gasto ni con el plan de Claude", () => {
    assert.equal(motor.entender("¿cuánto me queda del plan?")?.accion.intencion, "plan-uso");
    assert.equal(decir("gasté 5 lucas en almuerzo")?.intencion, "registrar-gasto");
    assert.equal(decir("mi presupuesto es 500"), null, "un presupuesto de $500 se lee mal: va al agente");
  });

  it("con la función de gastos apagada, avisa", () => {
    const apagado = new Motor(gastos, { reloj: () => ahora, activa: (f) => f !== "gastos" });
    assert.match(apagado.resolver("mi presupuesto es 200 lucas")!.texto, /apagado/);
    assert.equal(gastos.presupuesto(), null);
  });

  it("los botones de un toque anotan como la frase", () => {
    assert.match(motor.anotarGasto(1500, "un café"), /Anotado: \$1\.500 en un café \(comida\)/);
    assert.equal(gastos.ultimos(1)[0].categoria, "comida");
  });

  it("la marca cambia al anotar, borrar o cambiar el presupuesto", () => {
    const antes = gastos.marca();
    decir("gasté 2 lucas en micro");
    const despues = gastos.marca();
    assert.notEqual(antes, despues);
    gastos.ponerPresupuesto(100_000);
    assert.notEqual(gastos.marca(), despues);
  });
});
