import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AVISO_EN_ALA_MS, NOVEDADES_VIGENTES_MS, Novedades, textoCorto } from "../src/agente/novedades.ts";

const AHORA = new Date(2026, 9, 4, 15, 0).getTime();

describe("novedades (avisos sin abrir la isla)", () => {
  it("el aviso va en el ala unos segundos y después se va", () => {
    const n = new Novedades();
    assert.equal(n.enAla(AHORA), null);
    n.agregar("descarga", "📥 apunte.pdf listo", AHORA);
    assert.equal(n.enAla(AHORA + 1000)?.texto, "📥 apunte.pdf listo");
    assert.equal(n.enAla(AHORA + AVISO_EN_ALA_MS), null);
  });

  it("el más reciente tapa al anterior en el ala, pero los dos quedan en la lista", () => {
    const n = new Novedades();
    n.agregar("descarga", "📥 apunte.pdf listo", AHORA);
    n.agregar("calendario", "📅 Cálculo en 10 min", AHORA + 2000);
    assert.equal(n.enAla(AHORA + 3000)?.texto, "📅 Cálculo en 10 min");
    assert.deepEqual(
      n.recientes(AHORA + 3000).map((x) => x.texto),
      ["📅 Cálculo en 10 min", "📥 apunte.pdf listo"],
    );
  });

  it("la lista solo guarda los últimos 10 minutos y como mucho 8", () => {
    const n = new Novedades();
    n.agregar("plan", "📊 vieja", AHORA);
    assert.equal(n.recientes(AHORA + NOVEDADES_VIGENTES_MS - 1).length, 1);
    assert.equal(n.recientes(AHORA + NOVEDADES_VIGENTES_MS).length, 0);
    for (let i = 0; i < 12; i++) n.agregar("claude", `✅ ${i}`, AHORA + i);
    const lista = n.recientes(AHORA + 20);
    assert.equal(lista.length, 8);
    assert.equal(lista[0]?.texto, "✅ 11");
  });

  it("el punto aparece en la pestaña del tema y se quita al verla", () => {
    const n = new Novedades();
    n.agregar("claude", "✅ Claude terminó · tarea-rust", AHORA);
    n.agregar("plata", "💸 80 % del presupuesto", AHORA + 1);
    n.agregar("descarga", "📥 listo", AHORA + 2);
    assert.deepEqual([...n.pestanasConPunto(AHORA + 3)].sort(), ["brote", "claude", "plata"]);
    n.marcarVistasDe("claude");
    assert.deepEqual([...n.pestanasConPunto(AHORA + 3)].sort(), ["brote", "plata"]);
  });

  it("al abrir la isla todo queda visto: sin punto ni ala, pero sigue en la lista", () => {
    const n = new Novedades();
    n.agregar("calendario", "📅 Cálculo en 10 min", AHORA);
    n.marcarVistas();
    assert.equal(n.pestanasConPunto(AHORA + 1).size, 0);
    assert.equal(n.enAla(AHORA + 1), null);
    assert.equal(n.recientes(AHORA + 1).length, 1);
  });

  it("un aviso nuevo después de abrir la isla vuelve a poner el punto", () => {
    const n = new Novedades();
    n.agregar("descarga", "📥 uno", AHORA);
    n.marcarVistas();
    n.agregar("descarga", "📥 dos", AHORA + 5000);
    assert.equal(n.enAla(AHORA + 5001)?.texto, "📥 dos");
    assert.deepEqual([...n.pestanasConPunto(AHORA + 5001)], ["brote"]);
  });

  it("sin ver: solo los vigentes que aún no se vieron", () => {
    const n = new Novedades();
    n.agregar("descarga", "📥 uno", AHORA);
    n.marcarVistas();
    n.agregar("descarga", "📥 dos", AHORA + 1);
    assert.deepEqual(n.sinVer(AHORA + 2).map((x) => x.texto), ["📥 dos"]);
    assert.equal(n.sinVer(AHORA + NOVEDADES_VIGENTES_MS + 1).length, 0);
  });

  it("un aviso vencido ya no deja punto aunque no se haya visto", () => {
    const n = new Novedades();
    n.agregar("computador", "🔋 batería baja", AHORA);
    assert.equal(n.pestanasConPunto(AHORA + NOVEDADES_VIGENTES_MS).size, 0);
  });

  it("texto corto: sin saltos de línea y con puntos suspensivos", () => {
    assert.equal(textoCorto("✅ Claude terminó\n  en tarea-rust"), "✅ Claude terminó en tarea-rust");
    const largo = textoCorto("a".repeat(80), 20);
    assert.equal(largo.length, 20);
    assert.ok(largo.endsWith("…"));
  });
});
