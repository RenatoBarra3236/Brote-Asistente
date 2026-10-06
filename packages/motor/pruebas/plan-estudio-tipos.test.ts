import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANTES_DE_LA_PRUEBA_H, HORARIO_POR_DEFECTO, bloquesPorAvisar, MAX_BLOQUES, armarPlan, factorDeDificultad, formatearFechaPrueba, horasObjetivo, leerFechaPrueba, pruebaMsDe, validarBloques,
} from "../src/plan-estudio-tipos.ts";

const HORA = 3_600_000;
const AHORA = new Date(2026, 9, 5, 10, 0).getTime(); // lunes 5 de octubre de 2026, 10:00
const prueba = (dias: number, h = 15, m = 0) => new Date(2026, 9, 5 + dias, h, m).getTime();

describe("la fecha de una prueba", () => {
  it("lee día con o sin hora y rechaza lo que no existe", () => {
    assert.deepEqual(leerFechaPrueba("2026-10-09 15:30"), { ms: new Date(2026, 9, 9, 15, 30).getTime(), conHora: true });
    assert.equal(leerFechaPrueba("2026-10-09")?.conHora, false);
    assert.equal(new Date(leerFechaPrueba("2026-10-09")!.ms).getHours(), 8); // sin hora: 8:00
    for (const malo of ["2026-02-31", "2026-10-09 25:00", "9/10", "", null, 5]) assert.equal(leerFechaPrueba(malo), null, String(malo));
    assert.equal(pruebaMsDe(null), null);
    assert.equal(formatearFechaPrueba(new Date(2026, 9, 9, 15, 30).getTime(), true), "2026-10-09 15:30");
    assert.equal(formatearFechaPrueba(new Date(2026, 9, 9, 15, 30).getTime(), false), "2026-10-09");
  });
});

describe("cuánto estudiar", () => {
  it("más peso y más dificultad piden más horas, con piso y techo", () => {
    assert.equal(horasObjetivo(30, 1), 8);
    assert.equal(horasObjetivo(10, 1), 4);
    assert.equal(horasObjetivo(30, 1.3), 10.5);
    assert.equal(horasObjetivo(100, 1.6), 12);
    assert.equal(horasObjetivo(0, 1), 2);
  });
  it("la dificultad sale de la nota que hace falta", () => {
    assert.equal(factorDeDificultad(4), 1);
    assert.equal(factorDeDificultad(4.5), 1);
    assert.equal(factorDeDificultad(5), 1.3);
    assert.equal(factorDeDificultad(6.2), 1.6);
    assert.equal(factorDeDificultad(null), 1);
  });
});

describe("armar el plan", () => {
  it("reparte bloques de 50 min antes de la prueba, el último bloque es el repaso final", () => {
    const r = armarPlan({ ahoraMs: AHORA, pruebaMs: prueba(4), horas: 6 });
    assert.ok(r.ok);
    assert.equal(r.bloquesPedidos, 8);
    assert.ok(r.bloques.length >= 7);
    assert.equal(r.bloques.at(-1)!.tipo, "repaso-final");
    assert.equal(r.bloques.filter((b) => b.tipo === "repaso-final").length, 1);
    for (const b of r.bloques) {
      assert.equal(b.finMs - b.inicioMs, 50 * 60_000);
      assert.ok(b.inicioMs >= AHORA && b.finMs <= prueba(4) - ANTES_DE_LA_PRUEBA_H * HORA);
      assert.ok(new Date(b.finMs).getHours() * 60 + new Date(b.finMs).getMinutes() <= 22 * 60);
    }
    // Máximo 2 por día.
    const porDia = new Map<string, number>();
    for (const b of r.bloques) porDia.set(new Date(b.inicioMs).toDateString(), (porDia.get(new Date(b.inicioMs).toDateString()) ?? 0) + 1);
    assert.ok([...porDia.values()].every((n) => n <= 2));
  });

  it("el último bloque cae el día anterior a la prueba y el estudio pesa más cerca de ella", () => {
    const r = armarPlan({ ahoraMs: AHORA, pruebaMs: prueba(7, 9), horas: 10 });
    assert.ok(r.ok);
    const ultimo = new Date(r.bloques.at(-1)!.inicioMs);
    assert.equal(ultimo.getDate(), 11); // la prueba es el 12 a las 9:00: el último día con espacio es el 11
    const primeros = r.bloques.filter((b) => new Date(b.inicioMs).getDate() <= 7).length;
    const ultimos = r.bloques.filter((b) => new Date(b.inicioMs).getDate() >= 9).length;
    assert.ok(ultimos > primeros, `${ultimos} vs ${primeros}`);
    // Ningún día queda vacío mientras otro tiene dos (se reparte antes de apilar).
    const porDia = new Map<number, number>();
    for (const b of r.bloques) porDia.set(new Date(b.inicioMs).getDate(), (porDia.get(new Date(b.inicioMs).getDate()) ?? 0) + 1);
    assert.equal(porDia.size, 7);
  });

  it("respeta el horario: entre semana desde las 16:00, fin de semana desde las 10:00", () => {
    const r = armarPlan({ ahoraMs: AHORA, pruebaMs: prueba(9), horas: 8 });
    assert.ok(r.ok);
    for (const b of r.bloques) {
      const f = new Date(b.inicioMs);
      const min = f.getHours() * 60 + f.getMinutes();
      const finde = f.getDay() === 0 || f.getDay() === 6;
      const v = finde ? HORARIO_POR_DEFECTO.finDeSemana : HORARIO_POR_DEFECTO.semana;
      assert.ok(min >= v.desdeMin && min + 50 <= v.hastaMin, `${f.toString()}`);
    }
  });

  it("esquiva el calendario y deja una hora libre antes de cada evento", () => {
    const evento = { inicioMs: new Date(2026, 9, 6, 17, 30).getTime(), finMs: new Date(2026, 9, 6, 19, 0).getTime() };
    const r = armarPlan({ ahoraMs: AHORA, pruebaMs: prueba(3), horas: 6, ocupados: [evento] });
    assert.ok(r.ok);
    for (const b of r.bloques) assert.ok(!(b.inicioMs < evento.finMs && b.finMs > evento.inicioMs - HORA), "un bloque pisa el evento o su hora previa");
  });

  it("si no cabe todo, avisa cuántos bloques encontró", () => {
    const r = armarPlan({ ahoraMs: AHORA, pruebaMs: prueba(1, 20), horas: 12 });
    assert.ok(r.ok);
    assert.ok(r.bloques.length < r.bloquesPedidos);
    assert.ok(r.avisos.some((a) => /Solo encontré espacio/.test(a)));
  });

  it("con menos de un día avisa que queda poco tiempo", () => {
    const r = armarPlan({ ahoraMs: new Date(2026, 9, 5, 18, 0).getTime(), pruebaMs: new Date(2026, 9, 6, 14, 0).getTime(), horas: 4 });
    assert.ok(r.ok);
    assert.ok(r.avisos.some((a) => /poco tiempo/.test(a)));
    assert.equal(r.bloques.at(-1)!.tipo, "repaso-final");
  });

  it("una prueba pasada, muy lejana o sin espacio no da plan", () => {
    assert.equal(armarPlan({ ahoraMs: AHORA, pruebaMs: AHORA - 1, horas: 4 }).ok, false);
    assert.equal(armarPlan({ ahoraMs: AHORA, pruebaMs: prueba(40), horas: 4 }).ok, false);
    const sin = armarPlan({ ahoraMs: AHORA, pruebaMs: AHORA + 2 * HORA, horas: 4 });
    assert.equal(sin.ok, false);
  });

  it("nunca pasa de 20 bloques y es determinista", () => {
    const e = { ahoraMs: AHORA, pruebaMs: prueba(25), horas: 12, horario: { ...HORARIO_POR_DEFECTO, bloqueMin: 30 } };
    const a = armarPlan(e);
    assert.ok(a.ok && a.bloques.length <= MAX_BLOQUES);
    assert.deepEqual(armarPlan(e), a);
  });

  it("los bloques tienen un tipo coherente: temas primero, ejercicios después, repaso final al cierre", () => {
    const r = armarPlan({ ahoraMs: AHORA, pruebaMs: prueba(6), horas: 6 });
    assert.ok(r.ok);
    const orden = ["temas", "ejercicios", "repaso-final"];
    const idx = r.bloques.map((b) => orden.indexOf(b.tipo));
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
  });

  it("los días se cuentan en hora de pared aunque cambie la hora del reloj", () => {
    // Del 25 de octubre al 1 de noviembre cambia la hora en muchos países; en otros no pasa nada: el plan igual cae en la ventana local.
    const ahora = new Date(2026, 9, 24, 10, 0).getTime();
    const r = armarPlan({ ahoraMs: ahora, pruebaMs: new Date(2026, 10, 2, 15, 0).getTime(), horas: 8 });
    assert.ok(r.ok);
    for (const b of r.bloques) {
      const f = new Date(b.inicioMs);
      assert.ok(f.getHours() >= 10 && f.getHours() < 22);
    }
  });
});

describe("validar los bloques que manda la isla", () => {
  const ok = { tipo: "temas", inicioMs: prueba(2, 16), finMs: prueba(2, 16, 50) };
  it("acepta bloques razonables y los ordena", () => {
    const v = validarBloques([{ ...ok, inicioMs: prueba(3, 16), finMs: prueba(3, 16, 50) }, ok], AHORA, prueba(4));
    assert.ok(v.ok);
    assert.ok(v.bloques[0].inicioMs < v.bloques[1].inicioMs);
  });
  it("rechaza vacío, tipos raros, duraciones raras y bloques fuera del plan", () => {
    assert.equal(validarBloques([], AHORA, prueba(4)).ok, false);
    assert.equal(validarBloques([{ ...ok, tipo: "fiesta" }], AHORA, prueba(4)).ok, false);
    assert.equal(validarBloques([{ ...ok, finMs: ok.inicioMs + 60_000 }], AHORA, prueba(4)).ok, false);
    assert.equal(validarBloques([{ ...ok, finMs: ok.inicioMs + 5 * HORA }], AHORA, prueba(4)).ok, false);
    assert.equal(validarBloques([{ ...ok, inicioMs: prueba(6, 16), finMs: prueba(6, 17) }], AHORA, prueba(4)).ok, false);
    assert.equal(validarBloques([{ ...ok, inicioMs: "x" }], AHORA, prueba(4)).ok, false);
    assert.equal(validarBloques(Array.from({ length: 21 }, () => ok), AHORA, prueba(4)).ok, false);
  });
});

describe("avisar antes de un bloque", () => {
  const b = (id: number, min: number, estado: "pendiente" | "hecho" | "saltado" = "pendiente") => ({ id, estado, inicioMs: AHORA + min * 60_000 });
  it("solo los pendientes que empiezan en los próximos 10 minutos y no se avisaron", () => {
    const lista = [b(1, 5), b(2, 10), b(3, 11), b(4, -1), b(5, 3, "hecho"), b(6, 3, "saltado"), b(7, 0)];
    assert.deepEqual(bloquesPorAvisar(lista, new Set(), AHORA), [1, 2, 7]);
    assert.deepEqual(bloquesPorAvisar(lista, new Set([1, 7]), AHORA), [2]);
  });
});
