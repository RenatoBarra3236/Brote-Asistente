import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CONVERSACION_INICIAL, aplicar, ocupado } from "../src/agente/conversacion.ts";
import { estados, leerEjemplo, reproducir } from "./ayuda.ts";

describe("conversación con los eventos grabados", () => {
  test("respuesta simple: pensando → listo, y el texto llega por partes", () => {
    const pasos = reproducir(leerEjemplo("respuesta-simple"));
    assert.deepEqual(estados(pasos), ["pensando", "listo"]);
    const textos = pasos.map((p) => p.respuesta).filter((t, i, todos) => t && t !== todos[i - 1]);
    assert.deepEqual(textos, [
      "Soy t",
      "Soy tu asistente personal d",
      "Soy tu asistente personal dentro de OpenClaw, corriendo sobre Claude Sonnet ",
      "Soy tu asistente personal dentro de OpenClaw, corriendo sobre Claude Sonnet 5.5.",
    ]);
    const final = pasos.at(-1)!;
    assert.equal(final.terminada, true);
    assert.equal(final.runId, "6c6f1502-3984-456e-bba7-d759469ee7e8");
    assert.equal(final.error, null);
  });

  test("con herramienta: pensando → trabajando → pensando → listo", () => {
    const pasos = reproducir(leerEjemplo("respuesta-con-herramienta"));
    assert.deepEqual(estados(pasos), ["pensando", "trabajando", "pensando", "listo"]);
    const trabajando = pasos.find((p) => p.estado === "trabajando")!;
    assert.deepEqual(trabajando.herramienta, {
      id: "toolu_018XJ3DHM4tYYzw7SAYuE8io",
      nombre: "Read",
      etiqueta: "Leyendo USER.md…",
    });
    assert.equal(pasos.at(-1)!.herramienta, null);
    assert.match(pasos.at(-1)!.respuesta, /^USER\.md sigue siendo la plantilla/);
  });

  test("aprobación permitida: el ciclo completo observado en el paso 3", () => {
    const pasos = reproducir(leerEjemplo("aprobacion-permitida"));
    assert.deepEqual(estados(pasos), ["pensando", "trabajando", "pidiendo-permiso", "trabajando", "pensando", "listo"]);
    const pidiendo = pasos.find((p) => p.estado === "pidiendo-permiso")!;
    assert.equal(pidiendo.mensajeUsuario, "Ejecuta en la terminal exactamente el comando date (nada más) y dime la fecha en una frase.");
    assert.deepEqual(pidiendo.aprobacion, {
      id: "plugin:da2e75fa-d4f9-42d2-9c4a-66e2b993d9eb",
      kind: "plugin",
      titulo: "¿Ejecuto este comando?",
      detalle: "date",
      decisiones: ["allow-once", "deny"],
      respondiendo: false,
    });
    assert.equal(pidiendo.herramienta?.etiqueta, "Ejecutando `date`…");
    const final = pasos.at(-1)!;
    assert.equal(final.aprobacion, null);
    assert.match(final.respuesta, /jueves 1 de octubre de 2026/);
  });

  test("aprobación rechazada (armada): mismo ciclo y el agente explica el rechazo", () => {
    const pasos = reproducir(leerEjemplo("aprobacion-rechazada"));
    assert.deepEqual(estados(pasos), ["pensando", "trabajando", "pidiendo-permiso", "trabajando", "pensando", "listo"]);
    assert.equal(pasos.find((p) => p.aprobacion)!.aprobacion!.detalle, "ls ~/Documentos");
    assert.match(pasos.at(-1)!.respuesta, /rechazaste el permiso/);
  });

  test("error (armado): pensando → error, con el mensaje", () => {
    const pasos = reproducir(leerEjemplo("error"));
    assert.deepEqual(estados(pasos), ["pensando", "error"]);
    const final = pasos.at(-1)!;
    assert.equal(final.error, "claude-cli exited with code 1");
    assert.equal(final.terminada, true);
    assert.equal(ocupado(final), false);
  });
});

describe("reglas del modelo", () => {
  test("el eco del mensaje propio no borra la respuesta en curso", () => {
    let c = aplicar(CONVERSACION_INICIAL, { tipo: "mensaje-usuario", texto: "hola" });
    c = aplicar(c, { tipo: "texto", delta: "Ho" });
    assert.equal(aplicar(c, { tipo: "mensaje-usuario", texto: "hola" }), c);
    // Uno distinto (por ejemplo, desde el celular) empieza otra conversación.
    const otra = aplicar(c, { tipo: "mensaje-usuario", texto: "otra cosa" });
    assert.equal(otra.respuesta, "");
    assert.equal(otra.mensajeUsuario, "otra cosa");
  });

  test("un end después de un error no lo tapa", () => {
    let c = aplicar(CONVERSACION_INICIAL, { tipo: "inicio", runId: "r" });
    c = aplicar(c, { tipo: "error", mensaje: "falló" });
    c = aplicar(c, { tipo: "fin" });
    assert.equal(c.estado, "error");
    assert.equal(c.error, "falló");
  });

  test("una nueva ejecución limpia el error anterior", () => {
    let c = aplicar(CONVERSACION_INICIAL, { tipo: "error", mensaje: "falló" });
    c = aplicar(c, { tipo: "inicio", runId: "r2" });
    assert.equal(c.estado, "pensando");
    assert.equal(c.error, null);
  });

  test("mientras espera permiso, pensar o escribir no cambia la cara", () => {
    let c = aplicar(CONVERSACION_INICIAL, { tipo: "inicio", runId: "r" });
    c = aplicar(c, {
      tipo: "aprobacion",
      aprobacion: { id: "a", kind: "plugin", titulo: "t", detalle: "d", decisiones: ["allow-once", "deny"] },
    });
    c = aplicar(c, { tipo: "pensando" });
    c = aplicar(c, { tipo: "texto", delta: "x" });
    assert.equal(c.estado, "pidiendo-permiso");
    // Un cierre de otra aprobación no la quita.
    assert.equal(aplicar(c, { tipo: "aprobacion-fin", id: "otra", resultado: "allowed" }), c);
  });

  test("respondiendo marca la aprobación y respuesta-fallida la libera", () => {
    let c = aplicar(CONVERSACION_INICIAL, {
      tipo: "aprobacion",
      aprobacion: { id: "a", kind: "plugin", titulo: "t", detalle: "d", decisiones: ["allow-once", "deny"] },
    });
    c = aplicar(c, { tipo: "respondiendo", id: "a" });
    assert.equal(c.aprobacion?.respondiendo, true);
    c = aplicar(c, { tipo: "respuesta-fallida", id: "a" });
    assert.equal(c.aprobacion?.respondiendo, false);
  });
});

describe("motor de comandos", () => {
  test("una respuesta sin IA termina al tiro en listo y queda marcada", () => {
    let c = aplicar(CONVERSACION_INICIAL, { tipo: "mensaje-usuario", texto: "gasté 2 lucas en café" });
    assert.equal(c.estado, "pensando");
    c = aplicar(c, { tipo: "resuelto-sin-ia", texto: "Anotado: $2.000 en café (comida)." });
    assert.equal(c.estado, "listo");
    assert.equal(c.sinIA, true);
    assert.equal(c.terminada, true);
    assert.equal(c.mensajeUsuario, "gasté 2 lucas en café");
    assert.equal(ocupado(c), false);
    // El siguiente mensaje, que sí va al agente, ya no lleva la marca.
    c = aplicar(c, { tipo: "mensaje-usuario", texto: "hola" });
    assert.equal(c.sinIA, false);
  });
});

describe("motor que aprende", () => {
  const propuesta = { id: 7, ejemplo: "paque luca y media de micro", accion: "anotar un gasto" };

  test("la propuesta llega tras la respuesta y aceptarla celebra", () => {
    let c = aplicar(CONVERSACION_INICIAL, { tipo: "mensaje-usuario", texto: propuesta.ejemplo });
    c = aplicar(c, { tipo: "fin", texto: "Anotado: $1.500 en micro." });
    c = aplicar(c, { tipo: "propuesta", propuesta });
    assert.deepEqual(c.propuesta, { ...propuesta, decidiendo: false });
    assert.equal(c.respuesta, "Anotado: $1.500 en micro.");

    c = aplicar(c, { tipo: "decidiendo", id: 7 });
    assert.equal(c.propuesta?.decidiendo, true);
    c = aplicar(c, { tipo: "propuesta-decidida", id: 7, aceptada: true, mensaje: "Listo, aprendí." });
    assert.equal(c.propuesta, null);
    assert.equal(c.respuesta, "Listo, aprendí.");
    assert.equal(c.estado, "listo");
  });

  test("si la decisión falla, la propuesta sigue pendiente; un mensaje nuevo la descarta", () => {
    let c = aplicar(CONVERSACION_INICIAL, { tipo: "propuesta", propuesta });
    c = aplicar(c, { tipo: "decidiendo", id: 7 });
    c = aplicar(c, { tipo: "decision-fallida", id: 7 });
    assert.equal(c.propuesta?.decidiendo, false);
    assert.equal(aplicar(c, { tipo: "propuesta-decidida", id: 99, aceptada: true, mensaje: "x" }), c);
    c = aplicar(c, { tipo: "mensaje-usuario", texto: "otra cosa" });
    assert.equal(c.propuesta, null);
  });
});
