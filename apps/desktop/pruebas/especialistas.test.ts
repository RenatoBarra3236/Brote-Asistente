import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CELEBRAR_MS, MAX_MASCOTAS, columnasTodos, equipoTermino, estadoDeMascota, globoDe, mascotasEnEscena, nombreConIA, pasosVisibles, terminadosALaMano, visualDe, type Trabajando } from "../src/agente/especialistas.ts";

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

describe("el equipo vivo: escenario y Ver a todos", () => {
  const vivo = (extra: Partial<Trabajando>): Trabajando => ({ ...base, actividad: "pensando", pasos: [], respuesta: "", ...extra });

  test("cada actividad tiene su ánimo y su globito", () => {
    assert.equal(globoDe(vivo({ actividad: "en-espera" })), "Preparándome…");
    assert.equal(globoDe(vivo({})), "Pensando…");
    assert.equal(globoDe(vivo({ actividad: "trabajando", herramienta: "web_fetch", args: { url: "https://es.wikipedia.org/wiki/Mitosis" } })), "Leyendo es.wikipedia.org…");
    assert.equal(globoDe(vivo({ actividad: "trabajando", herramienta: "mcp__openclaw__web_search", args: { query: "mitosis" } })), "Buscando «mitosis»…");
    assert.equal(globoDe(vivo({ actividad: "trabajando", respuesta: "La mitosis es el proceso de división celular en el cual una célula…" })), "«La mitosis es el proceso de división celula…»");
    assert.equal(globoDe(vivo({ actividad: "permiso" })), "Te pido permiso ✋");
    assert.equal(globoDe(vivo({ estado: "termino", finMs: 2, respuesta: "Hecho." })), "¡Listo! Hecho.");
    assert.equal(globoDe(vivo({ estado: "fallo", finMs: 2 })), "No pude terminar 😕");
    assert.deepEqual(
      (["en-espera", "pensando", "trabajando", "permiso", "termino", "fallo"] as const).map(estadoDeMascota),
      ["reposo", "pensando", "trabajando", "pidiendo-permiso", "listo", "error"],
    );
    // Un aviso viejo (sin actividad) igual se entiende.
    assert.equal(visualDe({ ...base, herramienta: "Read" }), "trabajando");
  });

  test("como mucho 4 en escena; al terminar celebran y se esconden; quedan a mano un minuto", () => {
    const lista = ["a", "b", "c", "d", "e"].map((s, i) => vivo({ sesion: s, inicioMs: i }));
    assert.equal(mascotasEnEscena(lista, 10).length, MAX_MASCOTAS);
    const listos = lista.map((t) => ({ ...t, estado: "termino" as const, finMs: 1000 }));
    assert.equal(equipoTermino(listos), true);
    assert.equal(mascotasEnEscena(listos, 1000 + CELEBRAR_MS - 1).length, 4);
    assert.deepEqual(mascotasEnEscena(listos, 1000 + CELEBRAR_MS), []);
    assert.equal(terminadosALaMano(listos, 1000 + CELEBRAR_MS).length, 5);
    assert.deepEqual(terminadosALaMano(listos, 1000 + 60_000), []);
    assert.deepEqual(terminadosALaMano(listos, 1001), [], "mientras celebran no hay fichas");
    assert.equal(equipoTermino([]), false);
  });

  test("Ver a todos: hasta 3 columnas, los que trabajan primero", () => {
    const lista = [vivo({ sesion: "x", estado: "termino", finMs: 5, inicioMs: 0 }), vivo({ sesion: "y", inicioMs: 1 }), vivo({ sesion: "z", inicioMs: 2 }), vivo({ sesion: "w", inicioMs: 3 })];
    assert.deepEqual(columnasTodos(lista).map((t) => t.sesion), ["y", "z", "w"]);
  });

  test("los pasos se dicen como en la isla", () => {
    const pasos = pasosVisibles({
      pasos: [
        { id: "1", herramienta: "web_search", args: { query: "mitosis" }, estado: "ok" },
        { id: "2", herramienta: "web_fetch", args: { url: "https://www.biologia.cl/x" }, estado: "en-curso" },
        { id: "3", herramienta: "Read", args: { file_path: "/tmp/apuntes.md" }, estado: "error" },
      ],
    });
    assert.deepEqual(pasos, [
      { texto: "Buscando «mitosis»", estado: "ok" },
      { texto: "Leyendo biologia.cl…", estado: "en-curso" },
      { texto: "Leyendo apuntes.md", estado: "error" },
    ]);
    assert.equal(nombreConIA(base), "🔎 Investigador · Gemini");
  });
});

test("el globito no muestra marcas de markdown y la fila no cambia de orden", () => {
  const t: Trabajando = { ...base, actividad: "trabajando", respuesta: "La **fotosíntesis** es…" };
  assert.equal(globoDe(t), "«La fotosíntesis es…»");
  const a = { ...base, sesion: "a", inicioMs: 1, estado: "termino" as const, finMs: 5 };
  const b = { ...base, sesion: "b", inicioMs: 2 };
  assert.deepEqual(mascotasEnEscena([b, a], 6).map((x) => x.sesion), ["a", "b"]);
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

