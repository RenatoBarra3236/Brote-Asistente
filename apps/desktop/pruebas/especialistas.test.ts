import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { filasEquipo, tituloEquipo, type Trabajando } from "../src/agente/especialistas.ts";

const base: Trabajando = {
  sesion: "agent:investigador:subagent:1",
  id: "investigador",
  nombre: "Investigador",
  emoji: "🔎",
  ia: "Gemini",
  color: "#5b8def",
  tarea: "Explica la fotosíntesis",
  herramienta: null,
  estado: "trabajando",
  inicioMs: 1000,
  finMs: null,
};

describe("el equipo trabajando en la isla", () => {
  test("nombre con emoji, la IA aparte y qué hace", () => {
    const [fila] = filasEquipo([{ ...base, herramienta: "web_search" }], 2000);
    assert.equal(fila.nombre, "🔎 Investigador");
    assert.equal(fila.ia, "Gemini");
    assert.equal(fila.color, "#5b8def");
    assert.equal(fila.detalle, "Buscando en la web…");
    assert.equal(fila.titulo, "Explica la fotosíntesis");
    // Sin herramienta en curso, la tarea.
    assert.equal(filasEquipo([base], 2000)[0].detalle, "Explica la fotosíntesis");
  });

  test("los que trabajan primero; los terminados se van después de un minuto", () => {
    const listo: Trabajando = { ...base, sesion: "s2", nombre: "Revisor", emoji: "✅", estado: "termino", inicioMs: 500, finMs: 3000 };
    const filas = filasEquipo([listo, base], 4000);
    assert.deepEqual(filas.map((f) => [f.nombre, f.detalle]), [
      ["🔎 Investigador", "Explica la fotosíntesis"],
      ["✅ Revisor", "Listo ✓"],
    ]);
    assert.equal(tituloEquipo(filas), "Mi equipo está trabajando");
    assert.deepEqual(filasEquipo([listo], 3000 + 60_000).length, 0);
    assert.equal(tituloEquipo(filasEquipo([listo], 4000)), "Mi equipo terminó");
    assert.equal(filasEquipo([{ ...base, estado: "fallo", finMs: 3000 }], 4000)[0].detalle, "No pudo terminar");
  });
});

describe("Configurar Brote → Equipo", async () => {
  const { modeloInicial, modelosElegibles } = await import("../src/agente/especialistas.ts");
  const cuentas = [
    { id: "claude", nombre: "Claude", probado: true, conexion: "claude-code" as const, terminal: null, requisito: "", aviso: null, modelos: [{ ref: "anthropic/claude-sonnet-5-5", nombre: "Claude Sonnet 5.5" }], conectada: true },
    { id: "gemini", nombre: "Gemini", probado: true, conexion: "clave" as const, terminal: null, requisito: "", aviso: null, modelos: [{ ref: "google/gemini-3.5-flash", nombre: "Gemini 3.5 Flash" }], conectada: false },
  ];

  test("solo modelos de cuentas conectadas (y el actual, marcado)", () => {
    assert.deepEqual(modelosElegibles(cuentas).map((o) => o.ref), ["anthropic/claude-sonnet-5-5"]);
    const conActual = modelosElegibles(cuentas, "google/gemini-3.5-flash");
    assert.deepEqual(conActual[0], { ref: "google/gemini-3.5-flash", nombre: "Gemini · Gemini 3.5 Flash (sin conectar)" });
  });

  test("parte con el sugerido si su IA está conectada; si no, con lo que haya", () => {
    assert.equal(modeloInicial({ sugerido: "google/gemini-3.5-flash", modelo: null }, cuentas), "anthropic/claude-sonnet-5-5");
    assert.equal(modeloInicial({ sugerido: "anthropic/claude-sonnet-5-5", modelo: null }, cuentas), "anthropic/claude-sonnet-5-5");
    assert.equal(modeloInicial({ sugerido: "x", modelo: "google/gemini-3.5-flash" }, cuentas), "google/gemini-3.5-flash");
    assert.equal(modeloInicial({ sugerido: "x", modelo: null }, cuentas.map((c) => ({ ...c, conectada: false }))), null);
  });
});
