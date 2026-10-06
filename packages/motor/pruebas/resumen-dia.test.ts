import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { armarAgenda } from "../src/agenda.ts";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { armarResumenDelDia, saludoDelMomento } from "../src/resumen-dia.ts";

// Miércoles 7 de octubre de 2026, 08:00.
const AHORA = new Date(2026, 9, 7, 8, 0).getTime();
const en = (dias: number, h = 9, m = 0) => new Date(2026, 9, 7 + dias, h, m).getTime();
const evento = (titulo: string, ini: number, fin: number, todoElDia = false) => ({ titulo, lugar: null, inicioMs: ini, finMs: fin, todoElDia });
const entrega = (titulo: string, ms: number, curso = "Física") => ({ id: 1, curso, titulo, entregaMs: ms, url: null, entregada: false });
const prueba = (titulo: string, ms: number) => ({ id: 1, ramoId: 1, titulo, inicioMs: ms, conHora: true });
const dias = (f: Parameters<typeof armarAgenda>[0]) => armarAgenda(f, AHORA, 35);
const plataSin = null;

describe("el resumen del día", () => {
  it("junta lo de hoy y solo dice lo que existe", () => {
    const r = armarResumenDelDia({
      ahoraMs: AHORA,
      dias: dias({ eventos: [evento("Cálculo", en(0, 8, 30), en(0, 10)), evento("Física", en(0, 14), en(0, 15))], entregas: [entrega("Informe 3", en(0, 23, 59)), entrega("Guía 2", en(1, 12))], pruebas: [prueba("Certamen 2 · Cálculo", en(3, 15))] }),
      tarjetasHoy: 4,
      plata: { mesGastado: 84_000, presupuesto: 250_000, puedesHoy: 6500 },
    });
    assert.match(r.texto, /^Buenos días\. Hoy tienes 2 eventos en tu calendario \(el primero es a las 08:30\)\./);
    assert.match(r.texto, /Vence hoy: Informe 3 \(Física\) a las 23:59\. Mañana vence 1 más\./);
    assert.match(r.texto, /Tu próxima prueba: Certamen 2 · Cálculo, en 3 días \(sábado\) a las 15:00\./);
    assert.match(r.texto, /Tienes 4 tarjetas para repasar\./);
    assert.match(r.texto, /Puedes gastar \$6\.500 hoy \(llevas \$84\.000 de \$250\.000 del mes\)\./);
    assert.equal(r.corto, "☀️ Hoy: 2 eventos · 1 entrega · 📝 prueba cerca · 4 tarjetas · $6.500 libres");
    assert.equal(r.hay, true);
  });

  it("sin nada dice que no ve nada, y sin ceros ni líneas vacías", () => {
    const vacio = armarResumenDelDia({ ahoraMs: AHORA, dias: [], tarjetasHoy: 0, plata: { mesGastado: 0, presupuesto: null, puedesHoy: null } });
    assert.equal(vacio.texto, "Buenos días. Hoy no veo nada agendado 🌱");
    assert.equal(vacio.hay, false);
    assert.equal(armarResumenDelDia({ ahoraMs: AHORA, dias: null, tarjetasHoy: null, plata: plataSin }).hay, false);
    const solo = armarResumenDelDia({ ahoraMs: AHORA, dias: [], tarjetasHoy: 1, plata: null });
    assert.equal(solo.texto, "Buenos días. Tienes 1 tarjeta para repasar.");
    assert.doesNotMatch(solo.texto, /0|\$/);
  });

  it("con un día lleno de cosas dice el singular y el plural", () => {
    const uno = armarResumenDelDia({ ahoraMs: AHORA, dias: dias({ eventos: [evento("Cálculo", en(0, 8, 30), en(0, 10))] }), tarjetasHoy: null, plata: null });
    assert.match(uno.texto, /Hoy tienes 1 evento en tu calendario \(es a las 08:30\)\./);
    const dos = armarResumenDelDia({ ahoraMs: AHORA, dias: dias({ entregas: [entrega("A", en(0, 12)), entrega("B", en(0, 20))] }), tarjetasHoy: null, plata: null });
    assert.match(dos.texto, /Vencen hoy 2 entregas \(la primera, A, a las 12:00\)\./);
  });

  it("no cuenta lo que ya pasó hoy ni lo hecho, y mira el todo el día aparte", () => {
    const tarde = new Date(2026, 9, 7, 16, 0).getTime();
    const agenda = armarAgenda({ eventos: [evento("Cálculo", en(0, 8, 30), en(0, 10)), evento("Feriado", en(0, 0), en(1, 0), true)], tareas: [{ id: 1, titulo: "Leer", detalle: null, venceMs: en(0, 23), hecha: true }, { id: 2, titulo: "Guía", detalle: null, venceMs: en(0, 23), hecha: false }] }, tarde, 35);
    const r = armarResumenDelDia({ ahoraMs: tarde, dias: agenda, tarjetasHoy: null, plata: null });
    assert.match(r.texto, /^Buenas tardes\./);
    assert.doesNotMatch(r.texto, /Hoy tienes/);
    assert.match(r.texto, /Todo el día: Feriado\./);
    assert.match(r.texto, /1 tarea para hoy: Guía\./);
  });

  it("bloques de estudio de hoy y solo pruebas de los próximos 7 días", () => {
    const agenda = dias({ bloques: [{ id: 1, ramoId: 1, titulo: "Estudiar Cálculo", inicioMs: en(0, 16), finMs: en(0, 16, 50), hecho: false }], pruebas: [prueba("Lejos", en(10, 9))] });
    const r = armarResumenDelDia({ ahoraMs: AHORA, dias: agenda, tarjetasHoy: null, plata: null });
    assert.match(r.texto, /Tienes 1 bloque de estudio \(es a las 16:00\)\./);
    assert.doesNotMatch(r.texto, /prueba/);
  });

  it("la plata: sin presupuesto solo lo gastado; pasado del presupuesto, lo dice", () => {
    const sin = armarResumenDelDia({ ahoraMs: AHORA, dias: [], tarjetasHoy: null, plata: { mesGastado: 30_000, presupuesto: null, puedesHoy: null } });
    assert.equal(sin.texto, "Buenos días. Este mes llevas $30.000 gastados.");
    const pasado = armarResumenDelDia({ ahoraMs: AHORA, dias: [], tarjetasHoy: null, plata: { mesGastado: 90_000, presupuesto: 80_000, puedesHoy: -4000 } });
    assert.match(pasado.texto, /Hoy ya te pasaste por \$4\.000 \(llevas \$90\.000 de \$80\.000 del mes\)\./);
    assert.doesNotMatch(pasado.corto, /libres/);
  });

  it("el saludo cambia con la hora", () => {
    assert.equal(saludoDelMomento(new Date(2026, 9, 7, 7).getTime()), "Buenos días");
    assert.equal(saludoDelMomento(new Date(2026, 9, 7, 13).getTime()), "Buenas tardes");
    assert.equal(saludoDelMomento(new Date(2026, 9, 7, 21).getTime()), "Buenas noches");
  });
});

describe("el resumen del día sin IA", () => {
  const con = (activa: (f: string) => boolean = () => true) => {
    const gastos = new Gastos(":memory:");
    return { gastos, motor: new Motor(gastos, { reloj: () => new Date(AHORA), agenda: () => dias({ eventos: [evento("Cálculo", en(0, 8, 30), en(0, 10))] }), activa: activa as any }) };
  };

  it("entiende las frases y arma el resumen con el presupuesto", () => {
    const { gastos, motor } = con();
    gastos.ponerPresupuesto(200_000);
    for (const frase of ["dame el resumen del día", "resumen de hoy", "mi resumen de la mañana", "¿cómo viene mi día?", "buenos días", "buenos días Brote", "buen día"]) {
      assert.equal(motor.resolver(frase)?.intencion, "resumen-dia", frase);
    }
    const r = motor.resolver("dame el resumen del día")!;
    assert.match(r.texto, /Hoy tienes 1 evento/);
    assert.match(r.texto, /Puedes gastar/);
  });

  it("no se come frases más largas ni otras", () => {
    const { motor } = con();
    for (const frase of ["buenos días, explícame qué es una derivada", "¿qué tengo hoy?", "dame el resumen de la clase de ayer", "¿cómo viene mi semana?", "resumen de gastos de hoy"]) {
      assert.notEqual(motor.entender(frase)?.accion.intencion, "resumen-dia", frase);
    }
    assert.equal(motor.resolver("buenos días, explícame qué es una derivada"), null);
  });

  it("solo dice lo que está prendido, y con todo apagado avisa", () => {
    const sinGastos = con((f) => f !== "gastos");
    sinGastos.gastos.ponerPresupuesto(200_000);
    assert.doesNotMatch(sinGastos.motor.resolver("resumen de hoy")!.texto, /gastar/);
    const nada = con(() => false);
    assert.match(nada.motor.resolver("resumen de hoy")!.texto, /apagado/);
    const soloGastos = con((f) => f === "gastos");
    assert.match(soloGastos.motor.resolver("resumen de hoy")!.texto, /Buenos días/, "con gastos prendidos sí hay algo que decir");
  });
});
