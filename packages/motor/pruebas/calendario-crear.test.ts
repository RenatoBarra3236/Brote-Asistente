import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { comandoCrearEventoMac, describirCreacion, interpretarCreacion, validarEvento, type NuevoEvento, type ResultadoCreacion } from "../src/calendario.ts";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { Temporizadores } from "../src/temporizadores.ts";
import { leerHora } from "../src/tiempo.ts";

const MIN = 60_000;
const ahora = new Date(2026, 9, 3, 14, 30);

describe("crear eventos: horas", () => {
  const casos: [string, { horas: number; minutos: number } | null][] = [
    ["15", { horas: 15, minutos: 0 }],
    ["15:30", { horas: 15, minutos: 30 }],
    ["9.15 hrs", { horas: 9, minutos: 15 }],
    ["3 pm", { horas: 15, minutos: 0 }],
    ["3 de la tarde", { horas: 15, minutos: 0 }],
    ["12 am", { horas: 0, minutos: 0 }],
    ["mediodia", { horas: 12, minutos: 0 }],
    ["25", null],
    ["10:75", null],
  ];
  for (const [texto, esperado] of casos) it(`«${texto}»`, () => assert.deepEqual(leerHora(texto), esperado));
});

describe("crear eventos: EventKit", () => {
  const evento: NuevoEvento = { titulo: 'Prueba "rara"`); hack(); ${x}', lugar: null, inicioMs: ahora.getTime(), finMs: ahora.getTime() + 60 * MIN };

  it("los datos van como literal JSON, nunca como código", () => {
    const script = comandoCrearEventoMac(evento).args[3];
    assert.ok(script.includes(`const DATOS = ${JSON.stringify({ titulo: evento.titulo, lugar: null, inicio: evento.inicioMs / 1000, fin: evento.finMs / 1000 })};`));
    // Es JavaScript válido y el título no se ejecuta: queda dentro del string.
    new Function("ObjC", "$", "Ref", script);
  });

  it("interpreta la respuesta", () => {
    assert.deepEqual(interpretarCreacion('{"ok":true,"permiso":3,"calendario":"Personal"}'), { ok: true, calendario: "Personal" });
    assert.deepEqual(interpretarCreacion('{"ok":false,"permiso":2}'), { ok: false, motivo: "sin-permiso" });
    assert.deepEqual(interpretarCreacion('{"ok":false,"permiso":0}'), { ok: false, motivo: "sin-permiso" });
    assert.deepEqual(interpretarCreacion('{"ok":false,"permiso":3,"error":"No hay un calendario por defecto"}'), { ok: false, motivo: "fallo", detalle: "No hay un calendario por defecto" });
    assert.equal(interpretarCreacion(null).ok, false);
  });

  it("valida antes de crear", () => {
    assert.equal(validarEvento(evento, ahora.getTime()), null);
    assert.match(validarEvento({ ...evento, titulo: " " }, ahora.getTime())!, /título/);
    assert.match(validarEvento({ ...evento, finMs: evento.inicioMs }, ahora.getTime())!, /durar/);
    assert.match(validarEvento({ ...evento, inicioMs: ahora.getTime() + 400 * 24 * 60 * MIN }, ahora.getTime())!, /año/);
  });

  it("lo que dice Brote", () => {
    const e = { titulo: "Estudiar", lugar: null, inicioMs: ahora.getTime() + 12 * MIN, finMs: ahora.getTime() + 72 * MIN };
    assert.equal(describirCreacion(e, { ok: true, calendario: "Universidad" }, ahora.getTime()), "📅 Listo: «Estudiar» hoy a las 14:42 en tu calendario «Universidad». Te aviso 10 min antes 🌱");
    assert.match(describirCreacion(e, { ok: false, motivo: "sin-permiso" }, ahora.getTime()), /Configurar Brote → Calendario del Mac/);
  });
});

describe("crear eventos: frases sin IA", () => {
  function preparar(resultado: ResultadoCreacion) {
    const creados: NuevoEvento[] = [];
    const gastos = new Gastos(":memory:");
    const temporizadores = new Temporizadores(gastos);
    const motor = new Motor(gastos, { temporizadores, reloj: () => ahora, crearEvento: (e) => (creados.push(e), resultado) });
    return { motor, creados, temporizadores };
  }

  it("«pon un evento en 12 minutos» (la frase de la captura)", () => {
    const { motor, creados, temporizadores } = preparar({ ok: true, calendario: "Personal" });
    const r = motor.resolver("pon un evento en 12 minutos")!;
    assert.equal(r.intencion, "calendario-crear");
    assert.deepEqual(creados, [{ titulo: "Evento", lugar: null, inicioMs: ahora.getTime() + 12 * MIN, finMs: ahora.getTime() + 72 * MIN }]);
    assert.match(r.texto, /Listo: «Evento» hoy a las 14:42/);
    assert.deepEqual(temporizadores.activos(), []);
  });

  it("con título, a una hora, y mañana", () => {
    const { motor, creados } = preparar({ ok: true, calendario: null });
    motor.resolver("pon un evento de estudiar cálculo en media hora");
    motor.resolver("agenda reunión con la Cami a las 16:30");
    motor.resolver("agéndame la prueba de física mañana a las 9");
    motor.resolver("crea una reunión llamada Taller a las 3 de la tarde");
    // "A las 9" cuando ya son las 14:30: es mañana.
    motor.resolver("pon una clase de inglés a las 9");
    assert.deepEqual(
      creados.map((e) => [e.titulo, new Date(e.inicioMs).toString().slice(4, 21)]),
      [
        ["Estudiar cálculo", "Oct 03 2026 15:00"],
        ["Reunión con la Cami", "Oct 03 2026 16:30"],
        ["Prueba de física", "Oct 04 2026 09:00"],
        ["Taller", "Oct 03 2026 15:00"],
        ["Inglés", "Oct 04 2026 09:00"],
      ],
    );
  });

  it("sin permiso, deja un recordatorio para esa hora", () => {
    const { motor, temporizadores } = preparar({ ok: false, motivo: "sin-permiso" });
    const r = motor.resolver("pon un evento de estudiar en 12 minutos")!;
    assert.match(r.texto, /Configurar Brote.*Mientras, te dejé un recordatorio/s);
    assert.deepEqual(temporizadores.activos().map((t) => [t.etiqueta, t.finMs]), [["Estudiar", ahora.getTime() + 12 * MIN]]);
  });

  it("no confunde otras frases", () => {
    const { motor, creados } = preparar({ ok: true, calendario: null });
    assert.equal(motor.resolver("mi agenda de hoy")?.intencion, undefined);
    assert.equal(motor.resolver("pon una alarma en 10 minutos")?.intencion, "temporizador");
    assert.equal(motor.resolver("anota 5 lucas en almuerzo")?.intencion, "registrar-gasto");
    assert.equal(creados.length, 0);
    // Sin quien cree eventos (servidor MCP), va al agente.
    assert.equal(new Motor(new Gastos(":memory:")).resolver("pon un evento en 12 minutos"), null);
  });
});
