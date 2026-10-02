import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { describirAprobacion, etiquetaHerramienta, traducir } from "../src/agente/traduccion.ts";
import { leerEjemplo } from "./ayuda.ts";

describe("traducir", () => {
  test("los eventos `chat` y los ajenos al agente no cambian nada", () => {
    for (const nombre of ["respuesta-simple", "respuesta-con-herramienta", "aprobacion-permitida"]) {
      for (const marco of leerEjemplo(nombre).filter((m) => m.event === "chat")) {
        assert.equal(traducir(marco), null);
      }
    }
    assert.equal(traducir({ event: "tick", payload: {} }), null);
    assert.equal(traducir({ event: "sessions.changed", payload: {} }), null);
  });

  test("lifecycle: start, model y end con el texto final", () => {
    const marcos = leerEjemplo("respuesta-simple").filter((m) => m.payload?.stream === "lifecycle");
    const [inicio, modelo, fin] = marcos.map(traducir);
    assert.deepEqual(inicio, { tipo: "inicio", runId: "6c6f1502-3984-456e-bba7-d759469ee7e8" });
    assert.equal(modelo, null);
    assert.deepEqual(fin, {
      tipo: "fin",
      texto: "Soy tu asistente personal dentro de OpenClaw, corriendo sobre Claude Sonnet 5.5.",
    });
  });

  test("assistant: fragmentos (delta) y texto acumulado", () => {
    const sucesos = leerEjemplo("respuesta-simple")
      .filter((m) => m.payload?.stream === "assistant")
      .map(traducir);
    assert.deepEqual(sucesos[0], { tipo: "texto", delta: "Soy t", texto: "Soy t" });
    assert.deepEqual(sucesos[1], { tipo: "texto", delta: "u asistente personal d" });
    assert.deepEqual(sucesos.at(-1), {
      tipo: "texto",
      texto: "Soy tu asistente personal dentro de OpenClaw, corriendo sobre Claude Sonnet 5.5.",
    });
  });

  test("thinking y run_status son pensar", () => {
    const marcos = leerEjemplo("aprobacion-permitida").filter((m) =>
      ["thinking", "run_status"].includes(m.payload?.stream),
    );
    assert.equal(marcos.length, 2);
    for (const marco of marcos) assert.deepEqual(traducir(marco), { tipo: "pensando" });
  });

  test("tool e item: inicio con nombre legible y fin", () => {
    const sucesos = leerEjemplo("respuesta-con-herramienta")
      .filter((m) => ["tool", "item"].includes(m.payload?.stream))
      .map(traducir);
    const id = "toolu_018XJ3DHM4tYYzw7SAYuE8io";
    assert.deepEqual(sucesos, [
      { tipo: "herramienta-inicio", id, nombre: "Read", etiqueta: "Leyendo USER.md…" },
      { tipo: "herramienta-inicio", id, nombre: "Read", etiqueta: "Leyendo USER.md…" },
      { tipo: "herramienta-fin", id, error: false },
      { tipo: "herramienta-fin", id, error: false },
    ]);
  });

  test("session.approval pending trae id, kind, título y detalle; terminal la cierra", () => {
    const [pendiente, terminal] = leerEjemplo("aprobacion-permitida")
      .filter((m) => m.event === "session.approval")
      .map(traducir);
    assert.deepEqual(pendiente, {
      tipo: "aprobacion",
      aprobacion: {
        id: "plugin:da2e75fa-d4f9-42d2-9c4a-66e2b993d9eb",
        kind: "plugin",
        titulo: "¿Ejecuto este comando?",
        detalle: "date",
        decisiones: ["allow-once", "deny"],
      },
    });
    assert.deepEqual(terminal, {
      tipo: "aprobacion-fin",
      id: "plugin:da2e75fa-d4f9-42d2-9c4a-66e2b993d9eb",
      resultado: "allowed",
    });
  });

  test("session.message del usuario es su mensaje; el del asistente se ignora", () => {
    const sucesos = leerEjemplo("aprobacion-permitida")
      .filter((m) => m.event === "session.message")
      .map(traducir);
    assert.deepEqual(sucesos, [
      {
        tipo: "mensaje-usuario",
        texto: "Ejecuta en la terminal exactamente el comando date (nada más) y dime la fecha en una frase.",
      },
      null,
    ]);
  });

  test("errores: flujo error y lifecycle con fase de error", () => {
    const sucesos = leerEjemplo("error").map(traducir).filter((s) => s?.tipo === "error");
    assert.deepEqual(sucesos, [
      { tipo: "error", mensaje: "claude-cli exited with code 1" },
      { tipo: "error", mensaje: "claude-cli exited with code 1" },
    ]);
    const sinMensaje = traducir({ event: "agent", payload: { stream: "lifecycle", data: { phase: "aborted" } } });
    assert.deepEqual(sinMensaje, { tipo: "error", mensaje: "Algo falló al responder." });
  });
});

describe("etiquetaHerramienta", () => {
  test("con argumentos", () => {
    assert.equal(etiquetaHerramienta("Read", { file_path: "/Users/x/.openclaw/workspace/USER.md" }), "Leyendo USER.md…");
    assert.equal(etiquetaHerramienta("Bash", { command: "date" }), "Ejecutando `date`…");
    assert.equal(etiquetaHerramienta("Edit", { file_path: "C:\\notas\\gastos.md" }), "Editando gastos.md…");
    assert.equal(etiquetaHerramienta("Grep", { pattern: "TODO" }), "Buscando «TODO»…");
    assert.equal(etiquetaHerramienta("WebFetch", { url: "https://www.ejemplo.cl/x" }), "Abriendo ejemplo.cl…");
    assert.equal(etiquetaHerramienta("Inventada", {}), "Usando Inventada…");
  });

  test("sin argumentos, desde el meta del evento item", () => {
    assert.equal(etiquetaHerramienta("Read", undefined, "from ~/.openclaw/workspace/USER.md"), "Leyendo USER.md…");
    assert.equal(etiquetaHerramienta("Bash", undefined, "date"), "Ejecutando `date`…");
    assert.equal(etiquetaHerramienta("Read"), "Leyendo un archivo…");
  });

  test("recorta los comandos largos", () => {
    const etiqueta = etiquetaHerramienta("Bash", { command: "x".repeat(100) });
    assert.equal(etiqueta, `Ejecutando \`${"x".repeat(39)}…\`…`);
  });
});

describe("describirAprobacion", () => {
  test("detalle que no es JSON se muestra tal cual", () => {
    assert.deepEqual(describirAprobacion({ title: "exec", toolName: "Rara", detail: "hacer algo" }), {
      titulo: "¿Uso Rara?",
      detalle: "hacer algo",
    });
  });

  test("archivos", () => {
    const detalle = JSON.stringify({ file_path: "/tmp/a.md", content: "hola" });
    assert.deepEqual(describirAprobacion({ title: "claude-cli native tool: Write", detail: detalle }), {
      titulo: "¿Modifico este archivo?",
      detalle: "/tmp/a.md",
    });
  });
});
