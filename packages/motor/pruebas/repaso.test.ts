import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Ramos } from "../src/ramos.ts";
import { Repaso } from "../src/repaso.ts";
import { colaDelDia, finDelDia, inicioDelDia, resumirRepaso, siguienteEstado, validarDecision, validarKit, venceHoy } from "../src/repaso-tipos.ts";
import type { Tarjeta } from "../src/repaso-tipos.ts";

const G = "2026-10-05-101500";
const AHORA = new Date(2026, 9, 5, 12, 0).getTime();

const kitBueno = {
  temas: [{ titulo: "Límites", puntos: ["Un límite describe a qué valor se acerca la función", "Existen límites laterales"] }],
  glosario: [{ termino: "Continuidad", definicion: "La función no tiene saltos en ese punto" }],
  preguntas: [{ pregunta: "¿Qué es un límite lateral?", respuesta: "El valor al que se acerca viniendo solo por un lado" }],
};

function armar() {
  const gastos = new Gastos(":memory:");
  const ramos = new Ramos(gastos);
  const repaso = new Repaso(gastos, ramos);
  const calculo = (ramos.crear({ nombre: "Cálculo" }, 1) as { ok: true; ramo: { id: number } }).ramo.id;
  return { ramos, repaso, calculo };
}

describe("validar el kit del agente", () => {
  it("acepta un kit bien formado", () => {
    const v = validarKit(kitBueno);
    assert.ok(v.ok);
    assert.equal(v.kit.temas.length, 1);
    assert.deepEqual(v.rechazadas, []);
  });

  it("deja fuera lo demasiado largo (no lo recorta) y lo dice", () => {
    const v = validarKit({ ...kitBueno, preguntas: [{ pregunta: "¿" + "a".repeat(250) + "?", respuesta: "x" }, ...kitBueno.preguntas] });
    assert.ok(v.ok);
    assert.equal(v.kit.preguntas.length, 1);
    assert.equal(v.rechazadas.length, 1);
  });

  it("quita repetidos sin tildes ni mayúsculas y respeta los topes", () => {
    const glosario = Array.from({ length: 25 }, (_, i) => ({ termino: `Término ${i}`, definicion: "definición corta" }));
    glosario.push({ termino: "TERMINO 1", definicion: "otra" });
    const v = validarKit({ glosario });
    assert.ok(v.ok);
    assert.equal(v.kit.glosario.length, 20);
    assert.ok(v.rechazadas.some((r) => /más de 20/.test(r)));
  });

  it("un tema sin puntos, o un kit vacío, no pasa", () => {
    assert.equal(validarKit({ temas: [{ titulo: "Algo", puntos: [] }] }).ok, false);
    assert.equal(validarKit({}).ok, false);
    assert.equal(validarKit(null).ok, false);
  });

  it("limpia saltos de línea y caracteres de control", () => {
    const v = validarKit({ glosario: [{ termino: "Deriv\nada", definicion: "Tasa de\tcambio\u0000 instantánea" }] });
    assert.ok(v.ok);
    assert.equal(v.kit.glosario[0].termino, "Deriv ada");
    assert.equal(v.kit.glosario[0].definicion, "Tasa de cambio instantánea");
  });
});

describe("validar la decisión de la isla", () => {
  const kit = validarKit(kitBueno).kit;
  it("acepta posiciones válidas y textos corregidos", () => {
    const v = validarDecision({ temas: [0], glosario: [0], preguntas: [], ramoId: 3, glosarioEditado: { 0: { termino: "Continuidad", definicion: "Sin saltos" } } }, kit);
    assert.ok(v.ok);
    assert.equal(v.decision.glosarioEditado?.[0].definicion, "Sin saltos");
  });
  it("rechaza posiciones que no existen y correcciones fuera de largo", () => {
    assert.equal(validarDecision({ temas: [4] }, kit).ok, false);
    assert.equal(validarDecision({ glosario: [0], glosarioEditado: { 0: { termino: "x", definicion: "y" } } }, kit).ok, false);
  });
  it("ignora correcciones de lo que no se aceptó", () => {
    const v = validarDecision({ glosario: [], glosarioEditado: { 0: { termino: "Otro", definicion: "Otra cosa" } } }, kit);
    assert.ok(v.ok);
    assert.equal(v.decision.glosarioEditado, undefined);
  });
});

describe("cajas de repaso", () => {
  it("«Sabía» sube una caja; «Casi» se queda; «No sabía» vuelve a la caja 1 (mañana)", () => {
    assert.equal(siguienteEstado(1, "sabia", AHORA).caja, 2);
    assert.equal(siguienteEstado(2, "casi", AHORA).caja, 2);
    assert.equal(siguienteEstado(4, "no-sabia", AHORA).caja, 1);
    assert.equal(siguienteEstado(5, "sabia", AHORA).caja, 5);
    assert.equal(siguienteEstado(4, "no-sabia", AHORA).proximoMs, inicioDelDia(AHORA, 1));
  });

  it("los intervalos son 1, 3, 7, 14 y 30 días (de la caja a la que llega)", () => {
    const dias = (caja: number) => Math.round((siguienteEstado(caja - 1 || 1, "sabia", AHORA).proximoMs - inicioDelDia(AHORA)) / 86_400_000);
    assert.equal(dias(2), 3);
    assert.equal(dias(3), 7);
    assert.equal(dias(4), 14);
    assert.equal(dias(5), 30);
  });

  it("vence hoy hasta las 23:59 locales, aunque sea tarde", () => {
    const t = { proximoMs: inicioDelDia(AHORA) };
    assert.ok(venceHoy(t, AHORA));
    assert.ok(venceHoy(t, finDelDia(AHORA)));
    assert.equal(venceHoy({ proximoMs: inicioDelDia(AHORA, 1) }, AHORA), false);
  });

  it("los días se cuentan en hora de pared aunque cambie la hora del reloj", () => {
    // Un día de cambio de hora puede medir 23 o 25 horas: el inicio siempre es 00:00 local.
    for (const mes of [2, 3, 9, 10]) {
      for (let d = 1; d <= 31; d++) {
        const f = new Date(2026, mes, d, 12);
        if (f.getMonth() !== mes) continue;
        const ini = new Date(inicioDelDia(f.getTime(), 1));
        assert.equal(ini.getHours(), 0);
        assert.equal(ini.getMinutes(), 0);
      }
    }
  });

  it("la cola trae lo más atrasado primero, con tope y por ramo", () => {
    const t = (id: number, dias: number, ramoId: number | null = null): Tarjeta => ({
      id, grabacion: G, ramoId, tipo: "termino", frente: "f", reverso: "r", caja: 1, proximoMs: inicioDelDia(AHORA, dias), ultimaMs: null, aciertos: 0, fallos: 0,
    });
    const todas = [t(1, 0), t(2, -3), t(3, 2), t(4, -1, 9)];
    assert.deepEqual(colaDelDia(todas, AHORA).map((x) => x.id), [2, 4, 1]);
    assert.deepEqual(colaDelDia(todas, AHORA, 2).map((x) => x.id), [2, 4]);
    assert.deepEqual(colaDelDia(todas, AHORA, 15, 9).map((x) => x.id), [4]);
    assert.deepEqual(resumirRepaso(todas, AHORA), { total: 4, hoy: 3 });
  });
});

describe("repaso guardado", () => {
  it("una propuesta queda pendiente y nada se acepta sola", () => {
    const { repaso } = armar();
    const r = repaso.proponer(G, kitBueno, null, AHORA);
    assert.ok(r.ok && r.terminos === 1 && r.preguntas === 1);
    assert.equal(repaso.tarjetas().length, 0);
    assert.equal(repaso.propuestas(AHORA).length, 1);
  });

  it("rechaza ids de grabación con otra forma y kits vacíos", () => {
    const { repaso } = armar();
    assert.equal(repaso.proponer("../x", kitBueno, null, AHORA).ok, false);
    assert.equal(repaso.proponer(G, {}, null, AHORA).ok, false);
  });

  it("una propuesta nueva reemplaza la pendiente de la misma grabación", () => {
    const { repaso } = armar();
    repaso.proponer(G, kitBueno, null, AHORA);
    repaso.proponer(G, { glosario: [{ termino: "Derivada", definicion: "Tasa de cambio" }] }, null, AHORA);
    const p = repaso.propuestas(AHORA);
    assert.equal(p.length, 1);
    assert.equal(p[0].kit.glosario[0].termino, "Derivada");
  });

  it("aceptar crea tarjetas que vencen hoy, guarda los temas y borra la propuesta", () => {
    const { repaso, calculo } = armar();
    repaso.proponer(G, kitBueno, null, AHORA);
    const d = repaso.decidir(G, { temas: [0], glosario: [0], preguntas: [0], ramoId: calculo }, AHORA);
    assert.ok(d.ok && d.tarjetas === 2 && d.temas === 1);
    assert.equal(repaso.propuestas(AHORA).length, 0);
    const ts = repaso.tarjetas(calculo);
    assert.equal(ts.length, 2);
    assert.ok(ts.every((t) => venceHoy(t, AHORA) && t.caja === 1));
    assert.equal(repaso.resumenes()[0].temas[0].titulo, "Límites");
    assert.equal(repaso.resumenes()[0].ramoId, calculo);
  });

  it("acepta solo lo marcado y usa el texto corregido", () => {
    const { repaso } = armar();
    repaso.proponer(G, kitBueno, null, AHORA);
    const d = repaso.decidir(G, { glosario: [0], glosarioEditado: { 0: { termino: "Continuidad", definicion: "Sin saltos ni huecos" } } }, AHORA);
    assert.ok(d.ok && d.tarjetas === 1 && d.temas === 0);
    assert.equal(repaso.tarjetas()[0].reverso, "Sin saltos ni huecos");
    assert.equal(repaso.resumenes().length, 0);
  });

  it("aceptar dos veces la misma tarjeta no la duplica", () => {
    const { repaso } = armar();
    repaso.proponer(G, kitBueno, null, AHORA);
    repaso.decidir(G, { glosario: [0] }, AHORA);
    repaso.proponer(G, kitBueno, null, AHORA);
    const d = repaso.decidir(G, { glosario: [0], temas: [0] }, AHORA);
    assert.ok(d.ok && d.tarjetas === 0 && d.repetidas === 1);
    assert.equal(repaso.tarjetas().length, 1);
    repaso.proponer(G, kitBueno, null, AHORA);
    repaso.decidir(G, { temas: [0] }, AHORA);
    assert.equal(repaso.resumenes()[0].temas.length, 1);
  });

  it("decidir sin propuesta, o con una posición inválida, falla sin tocar nada", () => {
    const { repaso } = armar();
    assert.equal(repaso.decidir(G, {}, AHORA).ok, false);
    repaso.proponer(G, kitBueno, null, AHORA);
    assert.equal(repaso.decidir(G, { glosario: [7] }, AHORA).ok, false);
    assert.equal(repaso.propuestas(AHORA).length, 1);
  });

  it("una propuesta sin decidir se descarta a los 14 días", () => {
    const { repaso } = armar();
    repaso.proponer(G, kitBueno, null, AHORA);
    assert.equal(repaso.propuestas(AHORA + 13 * 86_400_000).length, 1);
    assert.equal(repaso.propuestas(AHORA + 15 * 86_400_000).length, 0);
  });

  it("responder mueve la tarjeta de caja y cuenta aciertos y fallos", () => {
    const { repaso } = armar();
    repaso.proponer(G, kitBueno, null, AHORA);
    repaso.decidir(G, { glosario: [0] }, AHORA);
    const id = repaso.tarjetas()[0].id;
    const t = repaso.responder(id, "sabia", AHORA);
    assert.ok(t && t.caja === 2 && t.aciertos === 1 && t.proximoMs === inicioDelDia(AHORA, 3));
    const u = repaso.responder(id, "no-sabia", AHORA);
    assert.ok(u && u.caja === 1 && u.fallos === 1);
    assert.equal(repaso.responder(9999, "sabia", AHORA), null);
  });

  it("borrar un ramo deja sus tarjetas «sin ramo» y no las pierde", () => {
    const { repaso, ramos, calculo } = armar();
    repaso.proponer(G, kitBueno, null, AHORA);
    repaso.decidir(G, { glosario: [0], temas: [0], ramoId: calculo }, AHORA);
    ramos.borrar(calculo);
    assert.equal(repaso.tarjetas().length, 1);
    assert.equal(repaso.tarjetas()[0].ramoId, null);
    assert.equal(repaso.resumenes()[0].ramoId, null);
  });

  it("los borrados quitan de verdad: una tarjeta, una grabación, un ramo, todo", () => {
    const { repaso, calculo } = armar();
    const G2 = "2026-10-06-090000";
    repaso.proponer(G, kitBueno, null, AHORA);
    repaso.decidir(G, { glosario: [0], preguntas: [0], temas: [0], ramoId: calculo }, AHORA);
    repaso.proponer(G2, kitBueno, null, AHORA);
    repaso.decidir(G2, { glosario: [0] }, AHORA);
    repaso.proponer(G2, kitBueno, null, AHORA);
    assert.ok(repaso.borrarTarjeta(repaso.tarjetas()[0].id));
    assert.equal(repaso.borrarPropuestaDe(G2), true);
    assert.equal(repaso.borrarDeGrabacion(G2), 1);
    assert.equal(repaso.borrarDeRamo(calculo), 2); // una tarjeta y el resumen
    assert.equal(repaso.tarjetas().length, 0);
    repaso.proponer(G, kitBueno, null, AHORA);
    assert.equal(repaso.borrarTodo(), 1);
  });

  it("borrar la propuesta de una transcripción no toca lo ya aceptado", () => {
    const { repaso } = armar();
    repaso.proponer(G, kitBueno, null, AHORA);
    repaso.decidir(G, { glosario: [0] }, AHORA);
    repaso.proponer(G, kitBueno, null, AHORA);
    repaso.borrarPropuestaDe(G);
    assert.equal(repaso.tarjetas().length, 1);
    assert.equal(repaso.propuestas(AHORA).length, 0);
  });

  it("la marca cambia con cada alta, repaso y borrado", () => {
    const { repaso } = armar();
    const m0 = repaso.marca();
    repaso.proponer(G, kitBueno, null, AHORA);
    const m1 = repaso.marca();
    repaso.decidir(G, { glosario: [0] }, AHORA);
    const m2 = repaso.marca();
    repaso.responder(repaso.tarjetas()[0].id, "sabia", AHORA);
    const m3 = repaso.marca();
    repaso.borrarTodo();
    const m4 = repaso.marca();
    assert.equal(new Set([m0, m1, m2, m3]).size, 4);
    assert.equal(m4, m0);
  });

  it("un ramo inexistente en la propuesta queda como «sin ramo»", () => {
    const { repaso } = armar();
    const r = repaso.proponer(G, kitBueno, 999, AHORA);
    assert.ok(r.ok && r.ramoId === null);
  });
});
