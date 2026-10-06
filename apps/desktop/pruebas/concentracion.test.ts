import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PASAN_EN_CONCENTRACION, SeguidorDeConcentracion, hayBloqueDeEstudio, silenciaEnConcentracion, textoLlegaron } from "../src/agente/concentracion.ts";
import { Novedades, type TipoNovedad } from "../src/agente/novedades.ts";
import { CLAVE_CONCENTRACION, CLAVE_RESUMEN_MANANA, guardarInterruptor, leerInterruptor } from "../src/agente/preferencias.ts";

const TODOS: TipoNovedad[] = ["claude", "descarga", "temporizador", "calendario", "aula", "plan", "plata", "equipo", "computador", "transcripcion", "agenda", "repaso", "estudio"];

describe("modo concentración", () => {
  it("pasan el temporizador, la clase, la entrega y el bloque del plan; el resto se calla", () => {
    assert.deepEqual([...PASAN_EN_CONCENTRACION].sort(), ["aula", "calendario", "celebracion", "estudio", "temporizador"]);
    for (const tipo of TODOS) assert.equal(silenciaEnConcentracion(tipo), !PASAN_EN_CONCENTRACION.includes(tipo), tipo);
    assert.equal(silenciaEnConcentracion("claude"), true);
    assert.equal(silenciaEnConcentracion("calendario"), false);
  });

  it("solo el bloque de estudio de un pomodoro cuenta, no el descanso ni un temporizador común", () => {
    assert.equal(hayBloqueDeEstudio([{ tipo: "pomodoro", fase: "estudio" }]), true);
    assert.equal(hayBloqueDeEstudio([{ tipo: "pomodoro", fase: "descanso" }]), false);
    assert.equal(hayBloqueDeEstudio([{ tipo: "temporizador", fase: null }]), false);
    assert.equal(hayBloqueDeEstudio([]), false);
  });

  it("dice cuántos avisos llegaron y de qué, en singular y plural", () => {
    assert.equal(textoLlegaron([]), null);
    assert.equal(textoLlegaron([{ tipo: "claude" }]), "Mientras estudiabas llegó 1 aviso: 1 de Claude Code. Los dejé en Novedades.");
    assert.equal(
      textoLlegaron([{ tipo: "claude" }, { tipo: "plata" }, { tipo: "claude" }]),
      "Mientras estudiabas llegaron 3 avisos: 2 de Claude Code y 1 de plata. Los dejé en Novedades.",
    );
    assert.match(textoLlegaron([{ tipo: "claude" }, { tipo: "plata" }, { tipo: "descarga" }])!, /1 de Claude Code, 1 de plata y 1 de descargas/);
  });

  it("calla solo mientras dura el bloque, cuenta lo callado y lo dice una vez al terminar", () => {
    const s = new SeguidorDeConcentracion();
    assert.equal(s.silenciar("claude"), false, "fuera de un bloque todo suena");
    assert.deepEqual(s.actualizar(true, true), { termino: null });
    assert.equal(s.enConcentracion, true);
    assert.equal(s.silenciar("claude"), true);
    assert.equal(s.silenciar("plata"), true);
    assert.equal(s.silenciar("calendario"), false, "la clase pasa");
    assert.equal(s.silenciar("temporizador"), false);
    assert.deepEqual(s.actualizar(true, true), { termino: null }, "sin cambio no dice nada");
    const fin = s.actualizar(false, true);
    assert.match(fin.termino!, /llegaron 2 avisos: 1 de Claude Code y 1 de plata/);
    assert.deepEqual(s.actualizar(false, true), { termino: null });
    assert.equal(s.silenciar("claude"), false);
  });

  it("con el interruptor apagado nunca calla, y apagarlo a mitad de un bloque también resume", () => {
    const s = new SeguidorDeConcentracion();
    s.actualizar(true, false);
    assert.equal(s.enConcentracion, false);
    assert.equal(s.silenciar("claude"), false);
    s.actualizar(true, true);
    s.silenciar("descarga");
    assert.match(s.actualizar(true, false).termino!, /llegó 1 aviso: 1 de descargas/);
  });

  it("sin avisos callados no hay resumen", () => {
    const s = new SeguidorDeConcentracion();
    s.actualizar(true, true);
    assert.deepEqual(s.actualizar(false, true), { termino: null });
  });
});

describe("las novedades silenciadas", () => {
  it("no salen en el ala, aunque sean la última, pero quedan en la lista y con su punto", () => {
    const n = new Novedades();
    const ahora = 1_000_000;
    n.agregar("calendario", "📅 En 10 min: Cálculo", ahora);
    const callada = n.agregar("claude", "✅ Claude Code terminó", ahora + 1000, true);
    assert.equal(callada.silenciada, true);
    assert.equal(n.enAla(ahora + 2000)?.tipo, "calendario", "la callada no tapa a la anterior");
    assert.deepEqual(n.recientes(ahora + 2000).map((x) => x.tipo), ["claude", "calendario"]);
    assert.ok(n.pestanasConPunto(ahora + 2000).has("claude"));
    n.marcarVistas();
    assert.equal(n.enAla(ahora + 2000), null);
  });

  it("solo hay aviso en el ala si hay alguno que no esté callado", () => {
    const n = new Novedades();
    n.agregar("plata", "💸 Ojo", 1000, true);
    assert.equal(n.enAla(2000), null);
  });
});

describe("preferencias en localStorage", () => {
  const almacen = (datos: Record<string, string> = {}) => ({ getItem: (k: string) => datos[k] ?? null, setItem: (k: string, v: string) => void (datos[k] = v) });

  it("sin dato rige el valor de fábrica; con dato, lo guardado", () => {
    const a = almacen();
    assert.equal(leerInterruptor(a, CLAVE_CONCENTRACION, true), true);
    guardarInterruptor(a, CLAVE_CONCENTRACION, false);
    assert.equal(leerInterruptor(a, CLAVE_CONCENTRACION, true), false);
    assert.equal(leerInterruptor(almacen({ [CLAVE_RESUMEN_MANANA]: "1" }), CLAVE_RESUMEN_MANANA, false), true);
  });

  it("si el almacén lanza, no se rompe nada", () => {
    const roto = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } };
    assert.equal(leerInterruptor(roto, CLAVE_CONCENTRACION, true), true);
    assert.doesNotThrow(() => guardarInterruptor(roto, CLAVE_CONCENTRACION, false));
  });
});
