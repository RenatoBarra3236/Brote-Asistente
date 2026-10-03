import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  AvisadorCalendario,
  combinar,
  comandoEventKit,
  cuandoEs,
  describirDia,
  describirProximo,
  etiquetaProximo,
  eventosDeIcal,
  interpretarEventKit,
  normalizarUrlIcal,
  proximoEvento,
  type EventoCalendario,
} from "../src/calendario.ts";
import { Gastos } from "../src/gastos.ts";
import { aInstante, desescapar, eventosIcs, leerPropiedades } from "../src/ics.ts";
import { Motor } from "../src/motor.ts";

const ICS = readFileSync(new URL("./datos/calendario.ics", import.meta.url), "utf8");
const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("lector .ics", () => {
  it("junta líneas dobladas y lee parámetros", () => {
    const props = leerPropiedades("SUMMARY:Ayudantía de f\r\n ísica\r\nDTSTART;TZID=\"America/Santiago\":20261005T083000\r\n");
    assert.deepEqual(props[0], { nombre: "SUMMARY", parametros: {}, valor: "Ayudantía de física" });
    assert.deepEqual(props[1].parametros, { TZID: "America/Santiago" });
    assert.equal(desescapar("Sala B-12\\, piso 2\\nentrada sur"), "Sala B-12, piso 2\nentrada sur");
  });

  it("convierte horas con zona, también al cambiar de horario", () => {
    // Chile: -04 en agosto, -03 desde el primer domingo de septiembre.
    assert.equal(iso(aInstante(Date.UTC(2026, 7, 31, 8, 30), "America/Santiago")), "2026-08-31T12:30:00.000Z");
    assert.equal(iso(aInstante(Date.UTC(2026, 9, 5, 8, 30), "America/Santiago")), "2026-10-05T11:30:00.000Z");
  });

  it("expande la clase semanal, respeta EXDATE, la clase movida y los cancelados", () => {
    const eventos = eventosIcs(ICS, Date.UTC(2026, 9, 5), Date.UTC(2026, 9, 15));
    const calculo = eventos.filter((e) => e.titulo.startsWith("Cálculo"));
    assert.deepEqual(
      calculo.map((e) => [e.titulo, iso(e.inicioMs), iso(e.finMs)]),
      [
        ["Cálculo I", "2026-10-05T11:30:00.000Z", "2026-10-05T13:00:00.000Z"],
        // El miércoles 7 no hay (EXDATE); el lunes 12 se movió a las 11:00.
        ["Cálculo I (recuperativa)", "2026-10-12T14:00:00.000Z", "2026-10-12T15:30:00.000Z"],
        ["Cálculo I", "2026-10-14T11:30:00.000Z", "2026-10-14T13:00:00.000Z"],
      ],
    );
    assert.equal(calculo[0].lugar, "Sala B-12, Edificio de Ciencias");
    assert.equal(eventos.some((e) => e.titulo === "Reunión cancelada"), false);
    assert.equal(eventos.find((e) => e.titulo.startsWith("Ayudantía"))!.titulo, "Ayudantía de física con un título largo que Google dobla en varias líneas");
  });

  it("antes del cambio de hora la clase sigue a las 8:30 de Chile", () => {
    const eventos = eventosIcs(ICS, Date.UTC(2026, 7, 31), Date.UTC(2026, 8, 8));
    assert.deepEqual(
      eventos.filter((e) => e.titulo === "Cálculo I").map((e) => iso(e.inicioMs)),
      ["2026-08-31T12:30:00.000Z", "2026-09-02T12:30:00.000Z", "2026-09-07T11:30:00.000Z"],
    );
  });

  it("respeta UNTIL, COUNT, INTERVAL y DURATION", () => {
    assert.equal(eventosIcs(ICS, Date.UTC(2026, 11, 5), Date.UTC(2026, 11, 20)).length, 0);
    const taller = eventosIcs(ICS, Date.UTC(2026, 8, 1), Date.UTC(2026, 11, 31)).filter((e) => e.titulo === "Taller de teatro");
    assert.deepEqual(
      taller.map((e) => [iso(e.inicioMs), (e.finMs - e.inicioMs) / MIN]),
      [
        ["2026-10-01T21:00:00.000Z", 90],
        ["2026-10-15T21:00:00.000Z", 90],
        ["2026-10-29T21:00:00.000Z", 90],
      ],
    );
  });

  it("los de día completo empiezan a medianoche local", () => {
    const [cumple] = eventosIcs(ICS, new Date(2026, 9, 9).getTime(), new Date(2026, 9, 10).getTime()).filter((e) => e.todoElDia);
    assert.equal(cumple.titulo, "Cumpleaños de la Cami 🎂");
    assert.equal(cumple.inicioMs, new Date(2026, 9, 9).getTime());
    assert.equal(cumple.finMs, new Date(2026, 9, 10).getTime());
  });

  it("no se cae con basura", () => {
    assert.deepEqual(eventosIcs("hola", 0, Date.now()), []);
    assert.deepEqual(eventosIcs("BEGIN:VEVENT\nSUMMARY:sin fecha\nEND:VEVENT", 0, Date.now()), []);
  });
});

describe("calendario: lo que dice Brote", () => {
  const ahora = new Date(2026, 9, 5, 8, 5).getTime();
  const evento = (titulo: string, h: number, m: number, duracion = 90, dias = 0, extra: Partial<EventoCalendario> = {}): EventoCalendario => {
    const inicioMs = new Date(2026, 9, 5 + dias, h, m).getTime();
    return { titulo, lugar: null, inicioMs, finMs: inicioMs + duracion * MIN, todoElDia: false, ...extra };
  };
  const eventos = [
    { titulo: "Feriado", lugar: null, inicioMs: new Date(2026, 9, 5).getTime(), finMs: new Date(2026, 9, 6).getTime(), todoElDia: true },
    evento("Cálculo", 8, 30, 90, 0, { lugar: "B-12" }),
    evento("Física", 14, 0),
    evento("Inglés", 9, 0, 60, 1),
  ];

  it("hoy, mañana y lo próximo", () => {
    assert.equal(describirDia(eventos, ahora, 0), "📅 Hoy tienes:\n• Todo el día: Feriado\n• 08:30–10:00 Cálculo (B-12)\n• 14:00–15:30 Física");
    assert.equal(describirDia(eventos, ahora, 1), "📅 Mañana tienes:\n• 09:00–10:00 Inglés");
    assert.equal(describirDia([], ahora, 1), "📅 No tienes nada en el calendario mañana. ¡Día libre! 🌱");
    assert.equal(describirProximo(eventos, ahora), "📅 Lo próximo: Cálculo en 25 min (08:30), en B-12.");
    assert.equal(etiquetaProximo(proximoEvento(eventos, ahora)!, ahora), "Cálculo en 25 min");
    const durante = new Date(2026, 9, 5, 9, 0).getTime();
    assert.equal(describirProximo(eventos, durante), "📅 Ahora mismo: Cálculo, en B-12 (hasta las 10:00).");
    const tarde = new Date(2026, 9, 5, 20, 0).getTime();
    assert.equal(describirProximo(eventos, tarde), "📅 Lo próximo: Inglés mañana a las 09:00.");
    assert.equal(cuandoEs(evento("x", 10, 10), ahora), "en 2 h 5 min");
    assert.equal(cuandoEs(evento("x", 13, 0), ahora), "a las 13:00");
  });

  it("avisa una vez, 10 minutos antes", () => {
    const avisador = new AvisadorCalendario();
    assert.deepEqual(avisador.revisar(eventos, new Date(2026, 9, 5, 8, 15).getTime()), []);
    assert.deepEqual(avisador.revisar(eventos, new Date(2026, 9, 5, 8, 20).getTime()), ["📅 En 10 min: Cálculo en B-12. ¡Vamos! 🌱"]);
    assert.deepEqual(avisador.revisar(eventos, new Date(2026, 9, 5, 8, 25).getTime()), []);
    // Si Brote se abre cuando falta poco, avisa igual; si ya empezó hace rato, no.
    assert.deepEqual(new AvisadorCalendario().revisar(eventos, new Date(2026, 9, 5, 8, 30).getTime()), ["📅 ¡Empieza Cálculo en B-12!"]);
    assert.deepEqual(new AvisadorCalendario().revisar(eventos, new Date(2026, 9, 5, 8, 40).getTime()), []);
  });

  it("junta el Mac y el iCal sin repetir", () => {
    const juntos = combinar([eventos[1]], [{ ...eventos[1], titulo: "cálculo " }, eventos[2]], null);
    assert.equal(juntos.length, 2);
  });

  it("frases sin IA", () => {
    let fuente: EventoCalendario[] | null = eventos;
    const motor = new Motor(new Gastos(":memory:"), { calendario: () => fuente, reloj: () => new Date(ahora) });
    assert.match(motor.resolver("¿qué tengo hoy?")!.texto, /Hoy tienes/);
    assert.match(motor.resolver("mi horario de hoy")!.texto, /Cálculo/);
    assert.match(motor.resolver("qué tengo mañana")!.texto, /Inglés/);
    assert.match(motor.resolver("tengo clases mañana")!.texto, /Inglés/);
    assert.match(motor.resolver("¿cuál es mi próxima clase?")!.texto, /Cálculo en 25 min/);
    assert.match(motor.resolver("a qué hora es mi próxima prueba")!.texto, /Lo próximo/);
    fuente = null;
    assert.match(motor.resolver("qué tengo hoy")!.texto, /Configurar Brote/);
    assert.equal(new Motor(new Gastos(":memory:")).resolver("qué tengo hoy"), null);
  });
});

describe("calendario: fuentes", () => {
  it("solo acepta direcciones https (webcal es https)", () => {
    assert.equal(normalizarUrlIcal("webcal://calendar.google.com/calendar/ical/x/private-y/basic.ics"), "https://calendar.google.com/calendar/ical/x/private-y/basic.ics");
    assert.equal(normalizarUrlIcal("  https://ejemplo.cl/a.ics "), "https://ejemplo.cl/a.ics");
    for (const mala of ["http://ejemplo.cl/a.ics", "file:///etc/passwd", "ftp://x/y", "no es url", "https://a b.cl"]) assert.equal(normalizarUrlIcal(mala), null, mala);
  });

  it("lee la ventana de hoy a pasado mañana del iCal", () => {
    const eventos = eventosDeIcal(ICS, new Date(2026, 9, 5, 8).getTime());
    assert.ok(eventos.some((e) => e.titulo === "Cálculo I"));
    assert.ok(eventos.every((e) => e.finMs > new Date(2026, 9, 5).getTime() && e.inicioMs < new Date(2026, 9, 8).getTime()));
  });

  it("interpreta la salida de EventKit y arma el JXA sin datos del usuario", () => {
    assert.deepEqual(interpretarEventKit('{"permiso":2}'), { permiso: 2, eventos: null });
    const leido = interpretarEventKit(
      JSON.stringify({ permiso: 3, eventos: [{ titulo: "Cálculo", lugar: "", inicio: 2000.4, fin: 3000, todoElDia: false }, { titulo: null, inicio: 1000, fin: 1500, todoElDia: true }] }),
    )!;
    assert.deepEqual(leido.eventos!.map((e) => [e.titulo, e.lugar, e.inicioMs, e.todoElDia]), [["(sin título)", null, 1000, true], ["Cálculo", null, 2000, false]]);
    assert.equal(interpretarEventKit("execution error: -1743"), null);
    const comando = comandoEventKit(0, 86_400_000);
    assert.deepEqual(comando.args.slice(0, 3), ["-l", "JavaScript", "-e"]);
    assert.match(comando.args[3], /permiso === 0 && false/);
    assert.match(comandoEventKit(0, 1, true).args[3], /permiso === 0 && true/);
    new Function("ObjC", "$", comando.args[3]); // al menos es JavaScript válido
  });
});
