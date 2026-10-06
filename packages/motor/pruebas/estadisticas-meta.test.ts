import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EstadisticasEstudio } from "../src/estadisticas.ts";
import { HITOS_RACHA, celebracionesDeEstudio, claveDeSemana, leerAvisosEstudio } from "../src/estadisticas-metas.ts";
import { META_MAX, progresoDeMeta, resumirEstudio, validarMeta, type RegistroEstudio } from "../src/estadisticas-tipos.ts";
import { MENSAJE_APAGADA } from "../src/funciones.ts";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { Ramos } from "../src/ramos.ts";

const MIN = 60_000;
// Miércoles 7 de octubre de 2026, 14:00 (la semana parte el lunes 5).
const AHORA = new Date(2026, 9, 7, 14, 0);
const en = (dias: number, h: number, m = 0) => new Date(2026, 9, 7 + dias, h, m).getTime();
let siguiente = 1;
const reg = (ini: number, minutos: number, ramoId: number | null = 1): RegistroEstudio => ({ id: siguiente++, inicioMs: ini, finMs: ini + minutos * MIN, ramoId, fuente: "manual" });
/** 30 minutos cada día de los `n` días que terminan en `hasta` (0 = hoy, -1 = ayer…). */
const diasSeguidos = (n: number, hasta = 0) => Array.from({ length: n }, (_, i) => reg(en(hasta - i, 10), 30));

describe("la meta semanal", () => {
  it("el progreso no pasa de 100 % y dice cuánto falta", () => {
    assert.deepEqual(progresoDeMeta(380, 600), { metaMin: 600, totalMin: 380, fraccion: 380 / 600, faltaMin: 220, cumplida: false });
    assert.deepEqual(progresoDeMeta(700, 600), { metaMin: 600, totalMin: 700, fraccion: 1, faltaMin: 0, cumplida: true });
    assert.equal(progresoDeMeta(100, null), null);
    assert.equal(progresoDeMeta(100, 0), null);
  });

  it("acepta de 1 a 100 horas y rechaza lo demás", () => {
    assert.deepEqual(validarMeta(600), { ok: true, minutos: 600 });
    assert.equal(validarMeta(59).ok, false);
    assert.equal(validarMeta(META_MAX + 1).ok, false);
    for (const raro of ["600", NaN, null, undefined, Infinity]) assert.equal(validarMeta(raro).ok, false, String(raro));
  });

  it("va dentro del resumen", () => {
    const r = resumirEstudio([reg(en(0, 9), 120)], AHORA.getTime(), 600);
    assert.equal(r.meta?.metaMin, 600);
    assert.equal(r.meta?.totalMin, 120);
    assert.equal(resumirEstudio([], AHORA.getTime()).meta, null);
  });
});

describe("las celebraciones de estudio", () => {
  const ahora = AHORA.getTime();

  it("la meta se celebra una sola vez por semana, al llegar", () => {
    const rs = [reg(en(-2, 9), 300), reg(en(-1, 9), 100)];
    const antes = celebracionesDeEstudio(rs, 600, ahora, null);
    assert.deepEqual(antes.celebraciones.filter((c) => c.tipo === "meta"), []);
    const llega = [...rs, reg(en(0, 9), 200)];
    const r = celebracionesDeEstudio(llega, 600, ahora, antes.avisos);
    assert.deepEqual(r.celebraciones.map((c) => c.tipo), ["meta", "racha"], "tres días seguidos también es un hito");
    assert.match(r.celebraciones[0].texto, /Meta semanal cumplida! 10 h/);
    assert.ok(r.celebraciones.every((c) => c.texto.length <= 38), "caben en el ala de la isla");
    assert.equal(r.avisos.semana, "2026-10-05");
    assert.deepEqual(celebracionesDeEstudio(llega, 600, ahora, r.avisos).celebraciones, [], "ya se celebró");
    // La semana siguiente vuelve a poder celebrarse.
    const lunes = new Date(2026, 9, 12, 10).getTime();
    const otra = [...llega, reg(en(5, 9), 700)];
    assert.deepEqual(celebracionesDeEstudio(otra, 600, lunes + 3_600_000, r.avisos).celebraciones.map((c) => c.tipo).filter((t) => t === "meta"), ["meta"]);
  });

  it("sin meta no celebra la meta, y nunca avisa cuando no llegas", () => {
    const rs = [reg(en(0, 9), 100)];
    assert.deepEqual(celebracionesDeEstudio(rs, null, ahora, null).celebraciones, []);
    assert.deepEqual(celebracionesDeEstudio(rs, 600, ahora, null).celebraciones, []);
    assert.equal(celebracionesDeEstudio([reg(en(0, 9), 700)], 600, ahora, null).celebraciones[0].tipo, "meta");
  });

  it("la racha se celebra a los 3, 7, 14 y 30 días, una vez por hito", () => {
    assert.deepEqual([...HITOS_RACHA], [3, 7, 14, 30]);
    let avisos = celebracionesDeEstudio(diasSeguidos(2), null, ahora, null).avisos;
    assert.deepEqual(celebracionesDeEstudio(diasSeguidos(2), null, ahora, null).celebraciones, []);
    const tres = celebracionesDeEstudio(diasSeguidos(3), null, ahora, avisos);
    assert.deepEqual(tres.celebraciones.map((c) => c.texto), ["🔥 ¡3 días seguidos estudiando!"]);
    avisos = tres.avisos;
    assert.deepEqual(celebracionesDeEstudio(diasSeguidos(3), null, ahora, avisos).celebraciones, []);
    assert.deepEqual(celebracionesDeEstudio(diasSeguidos(6), null, ahora, avisos).celebraciones, [], "6 no es un hito");
    const siete = celebracionesDeEstudio(diasSeguidos(7), null, ahora, avisos);
    assert.match(siete.celebraciones[0].texto, /¡7 días/);
    assert.match(celebracionesDeEstudio(diasSeguidos(30), null, ahora, siete.avisos).celebraciones[0].texto, /¡30 días/);
    assert.deepEqual(celebracionesDeEstudio(diasSeguidos(40), null, ahora, { semana: null, racha: 40, hito: 30 }).celebraciones, [], "después de 30 no hay más");
  });

  it("si llegas de golpe a un hito alto, celebra solo el más alto", () => {
    const r = celebracionesDeEstudio(diasSeguidos(8), null, ahora, null);
    assert.deepEqual(r.celebraciones.map((c) => c.texto.match(/¡(\d+) días/)?.[1]), ["7"]);
    assert.equal(r.avisos.hito, 7);
  });

  it("una racha cortada y vuelta a empezar vuelve a celebrar sus hitos, y perderla no avisa nada", () => {
    const celebrada = celebracionesDeEstudio(diasSeguidos(3), null, ahora, null).avisos;
    const cortada = celebracionesDeEstudio([reg(en(-5, 10), 30)], null, ahora, celebrada);
    assert.deepEqual(cortada.celebraciones, []);
    assert.deepEqual(cortada.avisos, { semana: null, racha: 0, hito: 0 });
    assert.equal(celebracionesDeEstudio(diasSeguidos(3), null, ahora, cortada.avisos).celebraciones.length, 1);
  });

  it("si hoy aún no estudias, la racha de ayer sigue viva y no celebra de nuevo", () => {
    const celebrada = celebracionesDeEstudio(diasSeguidos(3, -1), null, ahora, null);
    assert.equal(celebrada.celebraciones.length, 1);
    assert.deepEqual(celebracionesDeEstudio(diasSeguidos(3, -1), null, ahora, celebrada.avisos).celebraciones, []);
  });

  it("la meta y la racha pueden llegar juntas", () => {
    const rs = [...diasSeguidos(3), reg(en(-1, 20), 600)];
    assert.deepEqual(celebracionesDeEstudio(rs, 600, ahora, null).celebraciones.map((c) => c.tipo), ["meta", "racha"]);
  });

  it("lee lo guardado sin fiarse: lo raro es «nada celebrado»", () => {
    assert.deepEqual(leerAvisosEstudio('{"semana":"2026-10-05","racha":3,"hito":3}'), { semana: "2026-10-05", racha: 3, hito: 3 });
    assert.deepEqual(leerAvisosEstudio('{"semana":"<b>","racha":-4,"hito":"x"}'), { semana: null, racha: 0, hito: 0 });
    assert.equal(leerAvisosEstudio("no es json"), null);
    assert.equal(leerAvisosEstudio(null), null);
    assert.equal(claveDeSemana(new Date(2026, 9, 11, 23, 59).getTime()), "2026-10-05");
    assert.equal(claveDeSemana(new Date(2026, 9, 12, 0, 1).getTime()), "2026-10-12");
  });
});

describe("la meta por frase y por base de datos", () => {
  function armar(estudio = true) {
    const gastos = new Gastos(":memory:");
    const ramos = new Ramos(gastos);
    const estadisticas = new EstadisticasEstudio(gastos, ramos);
    return { motor: new Motor(gastos, { reloj: () => AHORA, ramos, estadisticas, activa: (f) => f !== "estudio" || estudio }), estadisticas };
  }

  it("pone, consulta y quita la meta, también sin registros", () => {
    const { motor, estadisticas } = armar();
    assert.match(motor.resolver("¿cómo voy con mi meta de estudio?")!.texto, /No tienes una meta de estudio/);
    const puesta = motor.resolver("mi meta es estudiar 10 horas a la semana")!;
    assert.equal(puesta.intencion, "estudio-meta-poner");
    assert.equal(puesta.texto, "Listo, tu meta es estudiar 10 h a la semana.".concat(" Esta semana llevas 0 min (0 %)."));
    assert.equal(estadisticas.meta(), 600);
    estadisticas.anotarManual(150, null, AHORA.getTime(), AHORA.getTime());
    assert.match(motor.resolver("¿cómo voy con mi meta de estudio?")!.texto, /Esta semana llevas 2 h 30 min de tu meta de 10 h \(25 %\): te faltan 7 h 30 min/);
    assert.match(motor.resolver("quita mi meta de estudio")!.texto, /quité tu meta/);
    assert.equal(estadisticas.meta(), null);
    assert.match(motor.resolver("quita mi meta de estudio")!.texto, /No tenías una meta/);
  });

  it("varias formas de decirla, y no se come otras frases", () => {
    const { motor, estadisticas } = armar();
    for (const [frase, min] of [["mi meta de estudio es 8 horas a la semana", 480], ["quiero estudiar 12 horas por semana", 720], ["mi meta semanal es 6 horas", 360], ["pon mi meta de estudio en 5 horas", 300], ["define mi meta semanal en 4 horas a la semana", 240]] as const) {
      assert.equal(motor.resolver(frase)?.intencion, "estudio-meta-poner", frase);
      assert.equal(estadisticas.meta(), min, frase);
    }
    for (const frase of ["mi meta es 10 horas", "quiero estudiar 2 horas hoy", "quiero juntar 150 lucas para marzo", "mi meta es ahorrar 50 mil al mes", "quita mi meta"]) {
      assert.ok(!motor.entender(frase)?.accion.intencion.startsWith("estudio-meta"), frase);
    }
  });

  it("rechaza metas fuera de 1 a 100 horas y no guarda nada", () => {
    const { motor, estadisticas } = armar();
    assert.match(motor.resolver("mi meta es estudiar 30 minutos a la semana")!.texto, /al menos 1 hora/);
    assert.match(motor.resolver("mi meta es estudiar 200 horas a la semana")!.texto, /100 horas/);
    assert.equal(estadisticas.meta(), null);
    // Más de 12 horas por semana sí se acepta (el tope de un temporizador no aplica a una meta).
    assert.equal(motor.resolver("mi meta es estudiar 25 horas a la semana")?.intencion, "estudio-meta-poner");
    assert.equal(estadisticas.meta(), 1500);
  });

  it("con Estudio apagado avisa", () => {
    assert.match(armar(false).motor.resolver("mi meta es estudiar 10 horas a la semana")!.texto, new RegExp(MENSAJE_APAGADA.slice(0, 20)));
  });

  it("la marca cambia al poner la meta y lo celebrado se guarda y se lee", () => {
    const { estadisticas } = armar();
    const antes = estadisticas.marca();
    estadisticas.ponerMeta(600);
    assert.notEqual(estadisticas.marca(), antes);
    assert.deepEqual(estadisticas.ponerMeta(10), { ok: false, motivo: "La meta semanal debe ser de al menos 1 hora" });
    assert.equal(estadisticas.avisos(), null);
    estadisticas.guardarAvisos({ semana: "2026-10-05", racha: 3, hito: 3 });
    assert.deepEqual(estadisticas.avisos(), { semana: "2026-10-05", racha: 3, hito: 3 });
  });
});
