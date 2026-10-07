// El flujo aproximado del motor (capas C, D y E del plan sin IA): consultas directas, acciones con confirmación,
// lo aprendido, «No te entendí» con sugerencias y saludos.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FrasesAprendidas, FrasesNoEntendidas } from "../src/frases-locales.ts";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { Ramos } from "../src/ramos.ts";
import { sugerir, todosLosEjemplos } from "../src/sugerir.ts";

function armar(opciones: { apagadas?: string[] } = {}) {
  const gastos = new Gastos(":memory:");
  const ramos = new Ramos(gastos);
  ramos.crear({ nombre: "Cálculo" }, Date.now());
  const aprendidas = new FrasesAprendidas(gastos);
  const noEntendidas = new FrasesNoEntendidas(gastos);
  const motor = new Motor(gastos, { reloj: () => new Date(2026, 9, 6, 13, 0), ramos, frasesAprendidas: aprendidas, frasesNoEntendidas: noEntendidas, activa: (f) => !(opciones.apagadas ?? []).includes(f) });
  return { motor, gastos, aprendidas, noEntendidas };
}
const aprox = { aproximar: true, conIA: false } as const;

describe("acciones aproximadas: siempre piden confirmación y no hacen nada solas", () => {
  it("«almuerzo 5 lucas» pregunta y no anota", () => {
    const { motor, gastos } = armar();
    const r = motor.resolver("almuerzo 5 lucas", aprox)!;
    assert.equal(r.intencion, "confirmar");
    assert.equal(r.texto, "¿Anoto $5.000 en almuerzo?");
    assert.deepEqual((r.datos as any).confirmar, { pregunta: "¿Anoto $5.000 en almuerzo?", frase: "gaste 5 lucas en almuerzo", original: "almuerzo 5 lucas" });
    assert.equal(gastos.ultimos(5).length, 0);
  });
  it("con un error de escritura también pregunta (el monto sale de lo que escribió)", () => {
    const { motor, gastos } = armar();
    const r = motor.resolver("gaste 5 lukas en almuerso", aprox)!;
    assert.equal(r.intencion, "confirmar");
    assert.equal(r.texto, "¿Anoto $5.000 en almuerzo?");
    assert.equal(gastos.ultimos(5).length, 0);
  });
  it("borrar dice qué se borraría", () => {
    const { motor, gastos } = armar();
    gastos.agregar({ monto: 3500, categoria: "comida", descripcion: "café", fecha: new Date(2026, 9, 6) });
    const r = motor.resolver("me equivoqué, borra eso", aprox)!;
    assert.equal(r.texto, "¿Borro tu último gasto ($3.500 en café)?");
    assert.equal(gastos.ultimos(5).length, 1);
  });
  it("cambiar el presupuesto y agendar también preguntan", () => {
    const { motor, gastos } = armar();
    assert.equal(motor.resolver("tengo 180 lucas de presupuesto al mes", aprox)!.texto, "¿Pongo tu presupuesto del mes en $180.000?");
    assert.equal(gastos.presupuesto(), null);
  });
  it("con IA conectada una acción dudosa va al agente", () => {
    const { motor } = armar();
    assert.equal(motor.resolver("almuerzo 5 lucas", { aproximar: true, conIA: true }), null);
  });
  it("una función apagada se dice, no se pregunta", () => {
    const { motor } = armar({ apagadas: ["gastos"] });
    assert.match(motor.resolver("almuerzo 5 lucas", aprox)!.texto, /apagado/);
  });
});

describe("dos montos: se pregunta cuál", () => {
  it("«gasté 5 lucas y 3 mil en el almuerzo» ofrece un botón por monto y no anota nada", () => {
    const { motor, gastos } = armar();
    const r = motor.resolver("gasté 5 lucas y 3 mil en el almuerzo", aprox)!;
    assert.equal(r.intencion, "elegir-monto");
    assert.equal(r.texto, "¿Cuál es el monto?");
    assert.deepEqual((r.datos as any).elegirMonto.opciones, [
      { etiqueta: "$5.000 en almuerzo", frase: "gaste 5 lucas en almuerzo" },
      { etiqueta: "$3.000 en almuerzo", frase: "gaste 3 mil en almuerzo" },
    ]);
    assert.equal(gastos.ultimos(5).length, 0);
  });
  it("con jerga y typos también (la jerga se arregla siempre)", () => {
    const { motor } = armar();
    const r = motor.resolver("gaste 5 lukas y 3 mil en almuerso", aprox)!;
    assert.equal(r.intencion, "elegir-monto");
    assert.equal((r.datos as any).elegirMonto.opciones[0].frase, "gaste 5 lucas en almuerzo");
  });
  it("con IA conectada lo ve el agente; con montos iguales o sin verbo de gasto no pregunta", () => {
    const { motor } = armar();
    assert.equal(motor.resolver("gasté 5 lucas y 3 mil en el almuerzo", { aproximar: true, conIA: true }), null);
    assert.notEqual(motor.resolver("gasté 5 lucas y 5 lucas en el almuerzo", aprox)!.intencion, "elegir-monto");
    assert.notEqual(motor.resolver("5 lucas y 3 mil", aprox)!.intencion, "elegir-monto");
    assert.notEqual(motor.resolver("necesito 5 lucas y 3 mil para el viaje", aprox)!.intencion, "elegir-monto");
  });
  it("tocar uno anota solo ese gasto", () => {
    const { motor, gastos } = armar();
    motor.confirmarFrase("gaste 3 mil en almuerzo", "gasté 5 lucas y 3 mil en el almuerzo");
    assert.deepEqual(gastos.ultimos(5).map((g) => g.monto), [3000]);
  });
});

describe("agendar con un día de la semana o una fecha", () => {
  function conCalendario() {
    const gastos = new Gastos(":memory:");
    const creados: any[] = [];
    // «Hoy» es martes 6 de octubre de 2026, 13:00.
    const motor = new Motor(gastos, { reloj: () => new Date(2026, 9, 6, 13, 0), crearEvento: (e) => (creados.push(e), { ok: true }) as any });
    return { motor, creados };
  }
  it("«tengo prueba de física el viernes a las 9» pregunta con la fecha ya resuelta y, al confirmar, agenda el viernes 9", () => {
    const { motor, creados } = conCalendario();
    const r = motor.resolver("tengo prueba de física el viernes a las 9", aprox)!;
    assert.equal(r.intencion, "confirmar");
    assert.match(r.texto, /^¿Agendo «Prueba de física» viernes, 9 de octubre a las 9:00\?$/);
    assert.equal(creados.length, 0);
    motor.confirmarFrase((r.datos as any).confirmar.frase, "tengo prueba de física el viernes a las 9");
    assert.equal(creados.length, 1);
    assert.equal(creados[0].titulo, "Prueba de física");
    assert.equal(new Date(creados[0].inicioMs).getTime(), new Date(2026, 9, 9, 9, 0).getTime());
    assert.equal(creados[0].finMs - creados[0].inicioMs, 3_600_000);
  });
  it("también con la forma de la guía y con una fecha: «agenda estudiar el 14 de octubre a las 15:30»", () => {
    const { motor, creados } = conCalendario();
    const r = motor.resolver("agenda estudiar el 14 de octubre a las 15:30", aprox)!;
    assert.match(r.texto, /Estudiar/);
    assert.equal(new Date(creados[0].inicioMs).getTime(), new Date(2026, 9, 14, 15, 30).getTime());
  });
  it("«el lunes» es el próximo lunes (si hoy es martes, el del 12)", () => {
    const { motor, creados } = conCalendario();
    motor.resolver("agenda reunión de grupo el lunes a las 18:00", aprox);
    assert.equal(new Date(creados[0].inicioMs).getTime(), new Date(2026, 9, 12, 18, 0).getTime());
    assert.equal(creados[0].titulo, "Reunión de grupo");
  });
  it("con IA conectada una frase dudosa va al agente; sin calendario no inventa nada", () => {
    const { motor } = conCalendario();
    assert.equal(motor.resolver("tengo prueba de física el viernes a las 9", { aproximar: true, conIA: true }), null);
    assert.equal(new Motor(new Gastos(":memory:")).resolver("agenda estudiar el viernes a las 9"), null);
  });
  it("un día que no entiende no agenda", () => {
    const { motor, creados } = conCalendario();
    assert.equal(motor.resolver("agenda estudiar el 31 de febrero a las 9", aprox) === null || creados.length === 0, true);
  });
});

describe("consultas aproximadas: se responden directo", () => {
  it("«cuánta plata llevo gastada esta semana» responde y dice cómo la entendió", () => {
    const { motor, gastos } = armar();
    gastos.agregar({ monto: 2000, categoria: "comida", descripcion: null, fecha: new Date(2026, 9, 5) });
    const r = motor.resolver("cuánta plata llevo gastada esta semana", aprox)!;
    assert.equal(r.intencion, "consultar-gastos");
    assert.match(r.texto, /^Entendí «cuanto he gastado esta semana»\. Esta semana llevas \$2\.000/);
  });
  it("con IA también se responde directo", () => {
    const { motor } = armar();
    assert.ok(motor.resolver("cuanto gaste esta semna", { aproximar: true, conIA: true }));
  });
});

describe("confirmar y aprender", () => {
  it("al tocar Sí se anota y se recuerda: la próxima vez se entiende sola, pero igual pregunta (con otro monto)", () => {
    const { motor, gastos, aprendidas } = armar();
    const r = motor.confirmarFrase("gaste 5 lucas en almuerzo", "almuerzo 5 lucas")!;
    assert.match(r.texto, /^Anotado: \$5\.000 en almuerzo/);
    assert.equal(gastos.ultimos(5).length, 1);
    assert.equal(aprendidas.listar().length, 1);
    const otra = motor.resolver("almuerzo 8 lucas", aprox)!;
    assert.equal(otra.intencion, "confirmar");
    assert.equal(otra.texto, "¿Anoto $8.000 en almuerzo?");
    assert.equal(gastos.ultimos(5).length, 1, "preguntar no anota");
    // Con IA conectada también pregunta: el usuario le enseñó esa frase a Brote, no hace falta el agente.
    assert.equal(motor.resolver("almuerzo 8 lucas", { aproximar: true, conIA: true })!.intencion, "confirmar");
  });
  it("lo aprendido que es una consulta se responde directo", () => {
    const { motor, aprendidas } = armar();
    aprendidas.recordar("la plata de la semana", "cuanto he gastado esta semana", 1);
    assert.equal(motor.resolver("la plata de la semana", aprox)!.intencion, "consultar-gastos");
  });
  it("lo destructivo aprendido también pregunta", () => {
    const { motor, aprendidas } = armar();
    aprendidas.recordar("deshazlo ya", "borra el ultimo gasto", 1);
    assert.equal(motor.resolver("deshazlo ya", aprox)!.intencion, "confirmar");
  });
  it("solo ejecuta frases que calzan tal cual con una plantilla", () => {
    const { motor, aprendidas } = armar();
    assert.equal(motor.confirmarFrase("haz algo raro", "x"), null);
    assert.equal(aprendidas.listar().length, 0);
  });
});

describe("no te entendí", () => {
  it("sin IA sugiere frases parecidas y nunca un error", () => {
    const { motor } = armar();
    const r = motor.resolver("quiero ver como voy con el gasto de la semana de ayer pasada", aprox)!;
    assert.equal(r.intencion, "no-entendi");
    assert.match(r.texto, /^No te entendí/);
    assert.ok(Array.isArray((r.datos as any).noEntendi.sugerencias));
  });
  it("sin nada que sugerir da ejemplos", () => {
    const { motor } = armar();
    const r = motor.resolver("zzzz qqqq", aprox)!;
    assert.match(r.texto, /No te entendí\. Prueba con: «gasté 5 lucas en almuerzo»/);
    assert.deepEqual((r.datos as any).noEntendi.sugerencias, []);
  });
  it("con la IA conectada esa frase va al agente", () => {
    const { motor } = armar();
    assert.equal(motor.resolver("zzzz qqqq", { aproximar: true, conIA: true }), null);
  });
  it("explica por qué no hay IA", () => {
    const { motor } = armar();
    assert.match(motor.respuestaSinIA("zzzz", { motivoSinIA: "sin-ia" }).texto, /activa la IA/);
    assert.match(motor.respuestaSinIA("zzzz", { motivoSinIA: "desconectada" }).texto, /no está conectada/);
  });
  it("solo guarda la frase si el usuario dio permiso", () => {
    const { motor, noEntendidas } = armar();
    motor.resolver("zzzz qqqq", aprox);
    assert.equal(noEntendidas.listar().length, 0);
    noEntendidas.ponerActivo(true);
    motor.resolver("zzzz qqqq", aprox);
    assert.deepEqual(noEntendidas.listar().map((f) => f.frase), ["zzzz qqqq"]);
  });
  it("con IA conectada no se guarda (la frase se la queda el agente)", () => {
    const { motor, noEntendidas } = armar();
    noEntendidas.ponerActivo(true);
    motor.resolver("zzzz qqqq", { aproximar: true, conIA: true });
    assert.equal(noEntendidas.listar().length, 0);
  });
});

describe("sugerencias", () => {
  const activa = () => true;
  it("encuentran la frase parecida y le ponen el monto del usuario", () => {
    const s = sugerir("gasto de 7 lucas en mi almuerzo diario", todosLosEjemplos(), activa);
    assert.ok(s.some((x) => x.frase === "gasté 7 lucas en almuerzo"), JSON.stringify(s));
  });
  it("no ofrecen frases de funciones apagadas", () => {
    const s = sugerir("pausa la música", todosLosEjemplos(), (f) => f !== "musica");
    assert.ok(!s.some((x) => /música/.test(x.frase)));
  });
});

describe("saludos y ayuda", () => {
  it("sin IA el motor saluda, agradece y se despide", () => {
    const { motor } = armar();
    for (const f of ["hola", "gracias", "chao"]) assert.match(motor.resolver(f, aprox)!.texto, /🌱/, f);
  });
  it("con IA, saludos y gracias van al agente (Brote responde con su personalidad)", () => {
    const { motor } = armar();
    for (const f of ["hola", "gracias", "chao"]) assert.equal(motor.resolver(f, { aproximar: true, conIA: true }), null, f);
  });
  it("«ayuda» lista las áreas de las funciones prendidas, con botones", () => {
    const { motor } = armar({ apagadas: ["musica"] });
    const r = motor.resolver("ayuda", aprox)!;
    const ayuda = (r.datos as any).ayuda;
    assert.ok(ayuda.areas.some((a: any) => a.id === "gastos"));
    assert.ok(!ayuda.areas.some((a: any) => a.id === "musica"));
  });
  it("«ayuda con los gastos» da tres ejemplos que se pueden tocar", () => {
    const { motor } = armar();
    const r = motor.resolver("ayuda con los gastos", aprox)!;
    assert.equal((r.datos as any).ayuda.ejemplos.length, 3);
    assert.equal((r.datos as any).ayuda.area, "gastos");
  });
  it("cada botón de área de la ayuda lleva a esa área", () => {
    const { motor } = armar();
    const areas = (motor.resolver("ayuda", aprox)!.datos as any).ayuda.areas as { id: string; frase: string }[];
    assert.ok(areas.length >= 6);
    for (const a of areas) {
      const r = motor.resolver(a.frase, aprox)!;
      assert.equal((r.datos as any).ayuda.area, a.id, a.frase);
      assert.equal((r.datos as any).ayuda.ejemplos.length, 3);
    }
  });
  it("«ayuda con mi tarea de cálculo integral» no es del motor", () => {
    const { motor } = armar();
    assert.equal(motor.resolver("ayuda con mi tarea de cálculo integral", { aproximar: true, conIA: true }), null);
  });
});
