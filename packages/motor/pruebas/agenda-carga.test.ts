import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { armarAgenda } from "../src/agenda.ts";
import { cargaDeLaSemana, describirSemana, lunesDe } from "../src/agenda-carga.ts";

// Martes 13 de octubre de 2026, 10:00: la semana va del lunes 12 al domingo 18.
const AHORA = new Date(2026, 9, 13, 10, 0).getTime();
const LUNES = new Date(2026, 9, 12).getTime();
const en = (dia: number, hora = 9, min = 0) => new Date(2026, 9, dia, hora, min).getTime();

const certamen = { id: 1, ramoId: 1, titulo: "Certamen 2 · Cálculo", inicioMs: en(14, 15), conHora: true };
const informe = { id: 1, curso: "Física", titulo: "Informe 3", entregaMs: en(15, 23, 59), url: null, entregada: false };
const clase = { titulo: "Cálculo I", lugar: null, inicioMs: en(15, 8, 30), finMs: en(15, 10), todoElDia: false };

describe("lunesDe", () => {
  it("devuelve el lunes de la semana, incluso desde un domingo", () => {
    assert.equal(lunesDe(AHORA), LUNES);
    assert.equal(lunesDe(en(18, 23)), LUNES, "el domingo es el último día de su semana");
    assert.equal(lunesDe(en(12, 0)), LUNES);
    assert.equal(lunesDe(en(19, 8)), en(19, 0), "el lunes siguiente abre otra semana");
  });
});

describe("la carga de la semana", () => {
  const agenda = armarAgenda({ pruebas: [certamen], entregas: [informe], eventos: [clase] }, AHORA, 35);

  it("arma siete días lunes a domingo con su nivel y marca hoy y los pasados", () => {
    const s = cargaDeLaSemana(agenda, LUNES, AHORA);
    assert.equal(s.dias.length, 7);
    assert.deepEqual(s.dias.map((d) => d.hoy), [false, true, false, false, false, false, false]);
    assert.deepEqual(s.dias.map((d) => d.pasado), [true, false, false, false, false, false, false]);
    // Lunes y viernes vacíos; miércoles = una prueba (3 puntos de carga → nivel 2); jueves = entrega (1,5) + clase (1,5) → nivel 2.
    assert.deepEqual(s.dias.map((d) => d.nivel), [0, 0, 2, 2, 0, 0, 0]);
    assert.equal(s.cantidad, 3);
  });

  it("una prueba y una entrega dejan la semana pesada, con la prueba como día más fuerte", () => {
    const s = cargaDeLaSemana(agenda, LUNES, AHORA);
    assert.equal(s.puntaje, 3);
    assert.equal(s.pesada, true);
    assert.equal(s.diaPesado?.diaMs, en(14, 0));
    assert.equal(s.dias[2].pesado, false, "un día con solo la prueba (2 puntos) no es pesado");
  });

  it("dos entregas solas no pesan; tres sí; dos pruebas sí", () => {
    const entrega = (n: number, dia: number) => ({ ...informe, id: n, entregaMs: en(dia, 20) });
    const dos = armarAgenda({ entregas: [entrega(1, 14), entrega(2, 16)] }, AHORA, 35);
    assert.equal(cargaDeLaSemana(dos, LUNES, AHORA).pesada, false);
    const tres = armarAgenda({ entregas: [entrega(1, 14), entrega(2, 16), entrega(3, 17)] }, AHORA, 35);
    assert.equal(cargaDeLaSemana(tres, LUNES, AHORA).pesada, true);
    const pruebas = armarAgenda({ pruebas: [certamen, { ...certamen, id: 2, titulo: "Examen · Física", inicioMs: en(17, 9) }] }, AHORA, 35);
    assert.equal(cargaDeLaSemana(pruebas, LUNES, AHORA).pesada, true);
  });

  it("una prueba y una entrega el mismo día hacen un día pesado", () => {
    const mismo = armarAgenda({ pruebas: [certamen], entregas: [{ ...informe, entregaMs: en(14, 23, 59) }] }, AHORA, 35);
    const s = cargaDeLaSemana(mismo, LUNES, AHORA);
    assert.equal(s.dias[2].pesado, true);
    assert.equal(s.dias[2].puntaje, 3);
  });

  it("lo que ya está hecho no pesa, y un evento que cruza la medianoche se reparte", () => {
    const hecha = armarAgenda({ tareas: [{ id: 1, titulo: "Leer", detalle: null, venceMs: en(14, 20), hecha: true }] }, AHORA, 35);
    assert.equal(cargaDeLaSemana(hecha, LUNES, AHORA).dias[2].nivel, 0);
    assert.equal(cargaDeLaSemana(hecha, LUNES, AHORA).cantidad, 0);
    const noche = armarAgenda({ eventos: [{ titulo: "Estudio nocturno", lugar: null, inicioMs: en(14, 22), finMs: en(15, 8), todoElDia: false }] }, AHORA, 35);
    const s = cargaDeLaSemana(noche, LUNES, AHORA);
    assert.equal(s.dias[2].nivel, 1, "2 h el miércoles");
    assert.equal(s.dias[3].nivel, 3, "8 h el jueves");
  });

  it("una semana de otro mes y de otro año también arma sus siete días", () => {
    const diciembre = new Date(2026, 11, 28).getTime();
    const s = cargaDeLaSemana([], diciembre, AHORA);
    assert.deepEqual(s.dias.map((d) => new Date(d.diaMs).getDate()), [28, 29, 30, 31, 1, 2, 3]);
    assert.equal(s.dias.every((d) => d.nivel === 0 && !d.pasado), true);
  });
});

describe("las pruebas en la agenda", () => {
  it("una prueba con hora sale a esa hora; sin hora sale todo el día", () => {
    const dias = armarAgenda({ pruebas: [certamen, { id: 2, ramoId: 2, titulo: "Quiz · Física", inicioMs: en(16, 8), conHora: false }] }, AHORA, 35);
    const items = dias.flatMap((d) => d.items);
    assert.deepEqual(items.map((i) => [i.tipo, i.titulo, i.todoElDia, i.ramoId]), [["prueba", "Certamen 2 · Cálculo", false, 1], ["prueba", "Quiz · Física", true, 2]]);
  });
});

describe("«¿cómo viene mi semana?»", () => {
  const agenda = armarAgenda({ pruebas: [certamen], entregas: [informe], eventos: [clase] }, AHORA, 35);

  it("dice si viene pesada y cuál es el día más fuerte", () => {
    const texto = describirSemana(agenda, AHORA);
    assert.match(texto, /^Semana pesada 🔥 \(3 cosas agendadas\)\. Lo más fuerte cae mañana: Certamen 2 · Cálculo\./);
    const mismo = armarAgenda({ pruebas: [certamen], entregas: [{ ...informe, entregaMs: en(14, 23, 59) }] }, AHORA, 35);
    assert.match(describirSemana(mismo, AHORA), /Mañana es el día pesado: Certamen 2 · Cálculo y Informe 3/);
  });

  it("nombra el día cuando no es hoy ni mañana", () => {
    const jueves = armarAgenda({ pruebas: [{ ...certamen, inicioMs: en(15, 9) }], entregas: [{ ...informe, entregaMs: en(15, 22) }] }, AHORA, 35);
    assert.match(describirSemana(jueves, AHORA), /El jueves es el día pesado/);
    const hoy = armarAgenda({ pruebas: [{ ...certamen, inicioMs: en(13, 15) }], entregas: [{ ...informe, entregaMs: en(13, 22) }] }, AHORA, 35);
    assert.match(describirSemana(hoy, AHORA), /Hoy es el día pesado/);
  });

  it("tranquila, con lo más fuerte; y libre", () => {
    const solo = armarAgenda({ entregas: [informe], eventos: [clase] }, AHORA, 35);
    assert.match(describirSemana(solo, AHORA), /tranquila.*2 cosas agendadas.*Lo más fuerte: Informe 3 \(el jueves\)\./);
    assert.match(describirSemana(armarAgenda({ eventos: [clase] }, AHORA, 35), AHORA), /ninguna prueba ni entrega/);
    assert.match(describirSemana([], AHORA), /viene libre/);
  });

  it("mira los próximos 7 días desde hoy (no la semana de lunes a domingo)", () => {
    const lejos = armarAgenda({ pruebas: [{ ...certamen, inicioMs: en(21, 9) }] }, AHORA, 35);
    assert.match(describirSemana(lejos, AHORA), /viene libre/, "el martes 20 ya es otra semana");
    const ma = armarAgenda({ pruebas: [{ ...certamen, inicioMs: en(14, 9) }], entregas: [{ ...informe, entregaMs: en(14, 22) }] }, AHORA, 35);
    assert.match(describirSemana(ma, AHORA), /Mañana es el día pesado/);
  });
});

describe("la semana sin IA", () => {
  const con = (agenda: ReturnType<typeof armarAgenda> | null, activa: (f: string) => boolean = () => true) =>
    new Motor(new Gastos(":memory:"), { reloj: () => new Date(AHORA), agenda: () => agenda, activa: activa as any });

  it("entiende las frases", () => {
    const agenda = armarAgenda({ pruebas: [certamen], entregas: [informe] }, AHORA, 35);
    for (const frase of ["¿cómo viene mi semana?", "como se ve la semana", "¿viene pesada la semana?", "mi semana viene pesada", "esta semana viene complicada"]) {
      assert.equal(con(agenda).resolver(frase)?.intencion, "agenda-semana", frase);
    }
    assert.match(con(agenda).resolver("¿cómo viene mi semana?")!.texto, /Semana pesada/);
  });

  it("sin nada conectado lo dice, y con todas las fuentes apagadas avisa que está apagado", () => {
    assert.match(con(null).resolver("¿cómo viene mi semana?")!.texto, /Todavía no tengo nada conectado/);
    const soloGastos = con([], (f) => f === "gastos");
    assert.match(soloGastos.resolver("¿cómo viene mi semana?")!.texto, /apagado/);
    const soloAula = con([], (f) => f === "aula");
    assert.match(soloAula.resolver("¿cómo viene mi semana?")!.texto, /viene libre/);
  });

  it("no se come otras frases", () => {
    const m = con([]);
    assert.notEqual(m.entender("¿qué entregas tengo esta semana?")?.accion.intencion, "agenda-semana");
    assert.notEqual(m.entender("¿cómo voy este mes?")?.accion.intencion, "agenda-semana");
    assert.notEqual(m.entender("gasté 5 lucas esta semana")?.accion.intencion, "agenda-semana");
    assert.notEqual(m.entender("¿cuánto he estudiado esta semana?")?.accion.intencion, "agenda-semana");
  });
});
