import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Ahorro } from "../src/ahorro.ts";
import { buscarMetaAhorro, celebracionesDeAhorro, leerAvisosAhorro, mesesHastaAhorro, progresoDeMetaAhorro, resumirAhorro, textoHitoAhorro, validarMetaAhorro, validarMontoAhorro } from "../src/ahorro-tipos.ts";
import type { AporteAhorro, MetaAhorro } from "../src/ahorro-tipos.ts";
import { leerMes } from "../src/fechas.ts";
import { funcionDeHerramienta, funcionDeIntencion, MENSAJE_APAGADA } from "../src/funciones.ts";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { PLANTILLAS_BASE } from "../src/plantillas.ts";

const AHORA = new Date(2026, 9, 7, 14, 0).getTime(); // miércoles 7 de octubre de 2026
const DIA = 86_400_000;
const MARZO = new Date(2027, 2, 31, 23, 59, 59, 999).getTime();

function meta(extra: Partial<MetaAhorro> = {}): MetaAhorro {
  return { id: 1, nombre: "Viaje", monto: 150_000, limiteMs: MARZO, creadaMs: AHORA - 40 * DIA, estado: "activa", ...extra };
}
const aporte = (monto: number, haceDias: number, metaId = 1): AporteAhorro => ({ id: Math.random(), metaId, monto, ms: AHORA - haceDias * DIA });

describe("leerMes", () => {
  it("«marzo» es el último día de marzo, este año o el que viene", () => {
    assert.equal(leerMes("marzo", AHORA), MARZO);
    assert.equal(new Date(leerMes("octubre", AHORA)!).getDate(), 31); // este mes todavía no termina
    assert.equal(new Date(leerMes("septiembre", AHORA)!).getFullYear(), 2027); // ya pasó este año: el que viene
  });
  it("con año explícito; uno ya terminado o un texto raro no se adivina", () => {
    assert.equal(new Date(leerMes("marzo de 2028", AHORA)!).getFullYear(), 2028);
    assert.equal(leerMes("septiembre de 2025", AHORA), null);
    assert.equal(leerMes("marzito", AHORA), null);
  });
});

describe("validar y progreso", () => {
  it("montos, nombre por defecto y fechas", () => {
    assert.equal(validarMontoAhorro(500).ok, false);
    assert.equal(validarMontoAhorro(1.5 * 1000 + 0.5).ok, false);
    const v = validarMetaAhorro({ nombre: "  ", monto: 150_000, limiteMs: MARZO }, AHORA);
    assert.deepEqual(v.ok && v.valor.nombre, "Ahorro");
    assert.equal(validarMetaAhorro({ monto: 150_000, limiteMs: AHORA - 1 }, AHORA).ok, false);
    assert.equal(validarMetaAhorro({ monto: 150_000, limiteMs: AHORA + 11 * 365 * DIA }, AHORA).ok, false);
    assert.equal(validarMetaAhorro({ monto: 150_000, limiteMs: null }, AHORA).ok, true);
  });

  it("meses por días de pared y cuota mensual", () => {
    assert.equal(mesesHastaAhorro(AHORA, MARZO), 6);
    assert.equal(mesesHastaAhorro(AHORA, AHORA + DIA), 1); // mínimo un mes
    const p = progresoDeMetaAhorro(meta(), [aporte(30_000, 10)], AHORA);
    assert.equal(p.juntado, 30_000);
    assert.equal(p.falta, 120_000);
    assert.equal(p.porcentaje, 20);
    assert.equal(p.cuotaMensual, 20_000); // 120.000 ÷ 6 meses
  });

  it("el semáforo: verde si el ritmo alcanza, ámbar al 70 %, rojo si no", () => {
    // ventana de 60 días: neto ÷ 60 × 30,4375
    const verde = progresoDeMetaAhorro(meta(), [aporte(60_000, 20)], AHORA); // ritmo 45.656, cuota 15.000
    assert.equal(verde.color, "verde");
    // La meta existe hace 40 días: la ventana es de 40 días (neto ÷ 40 × 30,4375).
    const ambar = progresoDeMetaAhorro(meta(), [aporte(20_000, 20)], AHORA); // ritmo 15.219 contra una cuota de 21.667 (130.000 ÷ 6): 70 %
    assert.equal(ambar.color, "ambar");
    const rojo = progresoDeMetaAhorro(meta(), [aporte(10_000, 20)], AHORA); // ritmo 7.609 contra 23.333: 33 %
    assert.equal(rojo.color, "rojo");
  });

  it("una meta nueva sin aportes no se pone en rojo; sin fecha no hay semáforo", () => {
    assert.equal(progresoDeMetaAhorro(meta({ creadaMs: AHORA - 3 * DIA }), [], AHORA).color, null);
    assert.equal(progresoDeMetaAhorro(meta({ limiteMs: null }), [aporte(10_000, 5)], AHORA).color, null);
    // Con un aporte reciente en una meta joven sí se juzga (ventana mínima de 14 días): 21.741 contra 23.333 = 93 %.
    assert.equal(progresoDeMetaAhorro(meta({ creadaMs: AHORA - 3 * DIA }), [aporte(10_000, 1)], AHORA).color, "ambar");
  });

  it("los retiros restan, nunca baja de cero y cumplida es verde", () => {
    const p = progresoDeMetaAhorro(meta(), [aporte(20_000, 10), aporte(-50_000, 5)], AHORA);
    assert.equal(p.juntado, 0);
    const lista = progresoDeMetaAhorro(meta(), [aporte(150_000, 2)], AHORA);
    assert.equal(lista.cumplida, true);
    assert.equal(lista.color, "verde");
    assert.equal(lista.cuotaMensual, null);
    assert.equal(lista.porcentaje, 100);
  });

  it("fecha vencida: sin cuota; y «llegarías en…» a ritmo actual", () => {
    const v = progresoDeMetaAhorro(meta({ limiteMs: AHORA - DIA }), [aporte(10_000, 5)], AHORA);
    assert.equal(v.vencida, true);
    assert.equal(v.cuotaMensual, null);
    const l = progresoDeMetaAhorro(meta(), [aporte(30_000, 30)], AHORA);
    assert.ok(l.llegariaMs !== null && l.llegariaMs > AHORA);
  });
});

describe("buscar una meta", () => {
  const metas = [meta({ id: 1, nombre: "Viaje a la playa" }), meta({ id: 2, nombre: "Notebook" })];
  it("por el nombre, sin artículos ni tildes; si hay duda, nada", () => {
    assert.equal(buscarMetaAhorro("el viaje", metas)?.id, 1);
    assert.equal(buscarMetaAhorro("Viaje a la playa", metas)?.id, 1);
    assert.equal(buscarMetaAhorro("note", metas)?.id, 2);
    assert.equal(buscarMetaAhorro("auto", metas), null);
    assert.equal(buscarMetaAhorro("a", metas), null);
    assert.equal(buscarMetaAhorro("viaje", [...metas, meta({ id: 3, nombre: "Viaje de estudio" })]), null); // ambigua
    assert.equal(buscarMetaAhorro("viaje", [meta({ id: 1, nombre: "Viaje", estado: "archivada" })]), null);
  });
});

describe("hitos y celebraciones", () => {
  it("cada hito una sola vez; uno grande celebra solo el más alto", () => {
    const m = meta();
    const medio = progresoDeMetaAhorro(m, [aporte(40_000, 1)], AHORA); // 26 %
    const a = celebracionesDeAhorro([medio], {});
    assert.deepEqual(a.celebrar.map((c) => c.hito), [25]);
    assert.deepEqual(celebracionesDeAhorro([medio], a.guardar).celebrar, []);
    const grande = progresoDeMetaAhorro(m, [aporte(120_000, 1)], AHORA); // 80 %: cruza 25, 50 y 75
    const b = celebracionesDeAhorro([grande], a.guardar);
    assert.deepEqual(b.celebrar.map((c) => c.hito), [75]);
    assert.deepEqual(b.guardar["1"], [25, 50, 75]);
    // sacar plata y volver a juntarla no repite
    const vuelta = celebracionesDeAhorro([grande], b.guardar);
    assert.deepEqual(vuelta.celebrar, []);
  });

  it("100 % solo cuando está cumplida; nada con las archivadas; los textos son cortos", () => {
    const casi = progresoDeMetaAhorro(meta(), [aporte(149_999, 1)], AHORA);
    assert.equal(casi.porcentaje, 99);
    assert.ok(!celebracionesDeAhorro([casi], {}).guardar["1"].includes(100));
    const cumplida = progresoDeMetaAhorro(meta(), [aporte(150_000, 1)], AHORA);
    assert.deepEqual(celebracionesDeAhorro([cumplida], {}).celebrar.map((c) => c.hito), [100]);
    assert.deepEqual(celebracionesDeAhorro([progresoDeMetaAhorro(meta({ estado: "archivada" }), [aporte(150_000, 1)], AHORA)], {}).celebrar, []);
    assert.equal(textoHitoAhorro(100, "Viaje"), "🎉 ¡Meta «Viaje» cumplida! 💰");
    for (const h of [25, 50, 75, 100]) assert.ok(textoHitoAhorro(h, "Un nombre larguísimo de meta").length <= 42, textoHitoAhorro(h, "Un nombre larguísimo de meta"));
  });

  it("leerAvisosAhorro no se fía de lo guardado", () => {
    assert.deepEqual(leerAvisosAhorro("no es json"), {});
    assert.deepEqual(leerAvisosAhorro('{"1":[25,"x",99],"a":[25]}'), { "1": [25] });
    assert.deepEqual(leerAvisosAhorro(null), {});
  });
});

describe("resumen con holgura y sugerencia", () => {
  it("la holgura cabe o no cabe; la sugerencia es la mitad del gasto hormiga", () => {
    const m = meta();
    const aportes = [aporte(30_000, 10)];
    const cabe = resumirAhorro([m], aportes, AHORA, { holgura: 50_000, hormiga: { nombre: "café", suma: 24_000 } });
    assert.equal(cabe.cuotaTotal, 20_000);
    assert.match(cabe.lineaHolgura!, /Cabe en tu presupuesto/);
    assert.match(cabe.sugerencia!, /«café» a la mitad.*\$12\.000/);
    const noCabe = resumirAhorro([m], aportes, AHORA, { holgura: 5_000, hormiga: null });
    assert.match(noCabe.lineaHolgura!, /no deja holgura/);
    assert.equal(noCabe.sugerencia, null);
    assert.equal(resumirAhorro([m], aportes, AHORA, { holgura: null, hormiga: null }).lineaHolgura, null);
    // sin la meta pendiente no hay sugerencia
    assert.equal(resumirAhorro([m], [aporte(150_000, 1)], AHORA, { holgura: 1, hormiga: { nombre: "café", suma: 24_000 } }).sugerencia, null);
  });
});

describe("la libreta (base de datos)", () => {
  it("crea, aporta, cumple y archiva; máximo 3 activas y sin nombres repetidos", () => {
    const a = new Ahorro(new Gastos(":memory:"));
    const v = a.crear({ nombre: "Viaje", monto: 150_000, limiteMs: MARZO }, AHORA);
    assert.ok(v.ok);
    assert.equal(a.crear({ nombre: "el viaje", monto: 10_000 }, AHORA).ok, false); // repetida
    assert.ok(a.crear({ nombre: "Notebook", monto: 500_000 }, AHORA).ok);
    assert.ok(a.crear({ nombre: "Celular", monto: 200_000 }, AHORA).ok);
    const cuarta = a.crear({ nombre: "Moto", monto: 900_000 }, AHORA);
    assert.equal(cuarta.ok, false);
    const id = v.ok ? v.meta.id : 0;
    const r = a.aportar(id, 150_000, AHORA);
    assert.ok(r.ok && r.meta.estado === "cumplida");
    assert.ok(a.crear({ nombre: "Moto", monto: 900_000 }, AHORA).ok, "una cumplida libera un lugar");
    assert.equal(a.aportar(id, -200_000, AHORA).ok, false, "no se puede sacar más de lo juntado");
    const sacar = a.aportar(id, -50_000, AHORA);
    assert.ok(sacar.ok && sacar.meta.estado === "activa");
    assert.equal(a.archivar(id), true);
    assert.equal(a.metas().length, 3);
    assert.equal(a.metas(true).length, 4);
  });

  it("borrar una meta borra sus aportes; la marca cambia con cada cosa", () => {
    const a = new Ahorro(new Gastos(":memory:"));
    const m0 = a.marca();
    const v = a.crear({ nombre: "Viaje", monto: 150_000 }, AHORA);
    const id = v.ok ? v.meta.id : 0;
    const m1 = a.marca();
    a.aportar(id, 20_000, AHORA);
    const m2 = a.marca();
    assert.deepEqual(new Set([m0, m1, m2]).size, 3);
    assert.equal(a.borrar(id), true);
    assert.equal(a.aportes().length, 0);
    assert.equal(a.borrar(id), false);
  });

  it("rechaza montos fuera de rango", () => {
    const a = new Ahorro(new Gastos(":memory:"));
    assert.equal(a.crear({ nombre: "X", monto: 5 }, AHORA).ok, false);
    const v = a.crear({ nombre: "X", monto: 100_000 }, AHORA);
    assert.equal(a.aportar(v.ok ? v.meta.id : 0, 10, AHORA).ok, false);
    assert.equal(a.aportar(999, 5_000, AHORA).ok, false);
  });
});

describe("frases sin IA", () => {
  function armar(activa = true) {
    const gastos = new Gastos(":memory:");
    const ahorro = new Ahorro(gastos);
    const motor = new Motor(gastos, { reloj: () => new Date(AHORA), ahorro, activa: (f) => f !== "gastos" || activa });
    return { motor, ahorro, gastos };
  }

  it("«quiero juntar 150 lucas para marzo» crea la meta con su cuota", () => {
    const { motor, ahorro } = armar();
    const r = motor.resolver("quiero juntar 150 lucas para marzo");
    assert.equal(r?.intencion, "ahorro-crear");
    assert.match(r!.texto, /meta «Ahorro».*\$150\.000.*marzo.*\$25\.000 al mes/);
    assert.equal(ahorro.metas()[0].limiteMs, MARZO);
  });

  it("con nombre, con fecha y con las dos formas del orden", () => {
    const { motor, ahorro } = armar();
    assert.match(motor.resolver("quiero juntar 300 mil para el viaje")!.texto, /meta «Viaje»/);
    assert.match(motor.resolver("voy a ahorrar 500 lucas para diciembre para un notebook")!.texto, /meta «Notebook».*diciembre/);
    assert.match(motor.resolver("mi meta de ahorro es 200 mil para junio")!.texto, /junio/);
    assert.equal(ahorro.metas().length, 3);
  });

  it("aportar: con el nombre, o sin él si hay una sola meta; con varias, pregunta", () => {
    const { motor, ahorro } = armar();
    motor.resolver("quiero juntar 150 lucas para el viaje");
    const a = motor.resolver("aparté 20 lucas");
    assert.equal(a?.intencion, "ahorro-aportar");
    assert.match(a!.texto, /\$20\.000 para «Viaje».*\$20\.000 de \$150\.000 \(13 %\).*faltan \$130\.000/);
    motor.resolver("quiero juntar 500 mil para un notebook");
    const dos = motor.resolver("ahorré 10 lucas");
    assert.match(dos!.texto, /¿Para cuál meta\?.*«Viaje».*«Notebook»/);
    assert.match(motor.resolver("ahorré 10 lucas para el notebook")!.texto, /«Notebook»/);
    assert.equal(ahorro.aportes().length, 2);
    assert.match(motor.resolver("guardé 5 lucas para el asado")!.texto, /No encontré una meta llamada «asado»/);
  });

  it("sacar plata de una meta, ver cómo van y archivar", () => {
    const { motor, ahorro } = armar();
    motor.resolver("quiero juntar 150 lucas para el viaje");
    motor.resolver("aparté 50 lucas para el viaje");
    const s = motor.resolver("saqué 10 lucas de la meta del viaje");
    assert.match(s!.texto, /sacaste \$10\.000 de «Viaje».*\$40\.000 de \$150\.000/);
    assert.match(motor.resolver("saqué 80 lucas de la meta del viaje")!.texto, /solo hay \$40\.000 juntados/);
    assert.match(motor.resolver("¿cómo van mis metas de ahorro?")!.texto, /«Viaje».*\$40\.000/);
    assert.match(motor.resolver("cómo voy con la meta del viaje")!.texto, /«Viaje»/);
    assert.match(motor.resolver("borra la meta del viaje")!.texto, /archivé la meta «Viaje»/);
    assert.equal(ahorro.metas().length, 0);
    assert.match(motor.resolver("mis metas de ahorro")!.texto, /Todavía no tienes metas de ahorro/);
  });

  it("sin metas, «aparté 20 lucas» explica cómo crear una", () => {
    const { motor } = armar();
    assert.match(motor.resolver("aparté 20 lucas")!.texto, /Todavía no tienes una meta de ahorro/);
  });

  it("frases de control: no son ahorro y van al agente", () => {
    const { motor, ahorro } = armar();
    motor.resolver("quiero juntar 150 lucas para el viaje");
    for (const frase of [
      "quiero ahorrar",
      "quiero ahorrar tiempo",
      "ahorré tiempo",
      "aparté la mesa",
      "junté a mis amigos",
      "guardé 5 lucas en mi billetera",
      "quiero juntar a mis amigos para el asado",
      "quiero ahorrar energía para el examen",
      "cuánto me falta para la meta de estudio",
      "borra la meta de estudio",
      "mi meta de estudio es 10 horas a la semana",
    ]) {
      const r = motor.resolver(frase);
      assert.ok(r === null || !r.intencion.startsWith("ahorro-") || /No encontré/.test(r.texto), `«${frase}» → ${r?.intencion}`);
    }
    assert.equal(ahorro.aportes().length, 0);
    assert.equal(ahorro.metas().length, 1);
  });

  it("no choca con el presupuesto ni con los gastos", () => {
    const { motor } = armar();
    assert.equal(motor.resolver("mi presupuesto es 200 lucas")?.intencion, "presupuesto-poner");
    assert.equal(motor.resolver("gasté 5 lucas en almuerzo")?.intencion, "registrar-gasto");
    assert.equal(motor.entender("cómo voy con mi meta de estudio")?.accion.intencion, "estudio-meta-como"); // (sin ramos ni estadísticas conectados, resolver iría al agente)
  });

  it("apagada la función de gastos, responde que está apagado; sin libreta, va al agente", () => {
    assert.equal(armar(false).motor.resolver("quiero juntar 150 lucas para marzo")?.texto, MENSAJE_APAGADA);
    const gastos = new Gastos(":memory:");
    assert.equal(new Motor(gastos, { reloj: () => new Date(AHORA) }).resolver("quiero juntar 150 lucas para marzo"), null);
  });

  it("un mes ya terminado no crea nada", () => {
    const { motor, ahorro } = armar();
    assert.match(motor.resolver("quiero juntar 150 lucas para septiembre de 2025")!.texto, /Ese mes ya pasó/);
    assert.equal(ahorro.metas().length, 0);
  });

  it("resumenAhorro trae la holgura con el presupuesto y la sugerencia del gasto hormiga", () => {
    const { motor, gastos, ahorro } = armar();
    gastos.ponerPresupuesto(300_000);
    for (let i = 0; i < 5; i++) gastos.agregar({ monto: 2_000, categoria: "comida", descripcion: "café", fecha: new Date(AHORA - (i + 1) * DIA) });
    motor.resolver("quiero juntar 150 lucas para marzo");
    const r = motor.resumenAhorro();
    assert.equal(r.metas.length, 1);
    assert.match(r.lineaHolgura ?? "", /Cabe en tu presupuesto/);
    assert.match(r.sugerencia ?? "", /café/);
    assert.equal(ahorro.metas().length, 1);
  });
});

describe("las intenciones dependen de una función", () => {
  it("todas las plantillas de ahorro y las herramientas dependen de «gastos»", () => {
    for (const p of PLANTILLAS_BASE.filter((x) => x.intencion.startsWith("ahorro-"))) assert.equal(funcionDeIntencion(p.intencion), "gastos", p.id);
    assert.equal(funcionDeHerramienta("ahorro_resumen"), "gastos");
  });
});
