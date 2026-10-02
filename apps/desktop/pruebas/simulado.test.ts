import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Agente } from "../src/agente/agente.ts";
import type { Conversacion } from "../src/agente/conversacion.ts";
import { TransporteSimulado, type Escena } from "../src/agente/simulado.ts";
import type { Marco } from "../src/agente/transporte.ts";
import { leerEjemplo } from "./ayuda.ts";

const ESCENAS: Escena[] = [
  { nombre: "error", patron: /\berror\b/i, marcos: leerEjemplo("error") },
  {
    nombre: "aprobación",
    patron: /\bcomando\b/i,
    marcos: leerEjemplo("aprobacion-permitida"),
    siRechaza: leerEjemplo("aprobacion-rechazada"),
  },
  { nombre: "herramienta", patron: /\blee\b/i, marcos: leerEjemplo("respuesta-con-herramienta") },
  { nombre: "simple", marcos: leerEjemplo("respuesta-simple") },
];

/** Un simulador sin pausas reales y un agente conectado, que anota los estados por los que pasa. */
function armar() {
  const pausas: number[] = [];
  const transporte = new TransporteSimulado({
    escenas: ESCENAS,
    esperar: async (ms) => {
      pausas.push(ms);
      await new Promise((listo) => setImmediate(listo));
    },
  });
  const agente = new Agente(transporte);
  const recorrido: string[] = [];
  agente.alCambiar((c) => {
    if (recorrido.at(-1) !== c.estado) recorrido.push(c.estado);
  });
  agente.conectar();
  return { agente, transporte, recorrido, pausas };
}

function esperarHasta(agente: Agente, condicion: (c: Conversacion) => boolean): Promise<Conversacion> {
  if (condicion(agente.conversacion)) return Promise.resolve(agente.conversacion);
  return new Promise((listo, fallo) => {
    const limite = setTimeout(() => fallo(new Error(`No se llegó a la condición; estado ${agente.conversacion.estado}`)), 2000);
    const dejar = agente.alCambiar((c) => {
      if (!condicion(c)) return;
      clearTimeout(limite);
      dejar();
      listo(c);
    });
  });
}

describe("TransporteSimulado + Agente", () => {
  test("respuesta simple, con pausas recortadas al rango del simulador", async () => {
    const { agente, recorrido, pausas } = armar();
    assert.equal(await agente.enviar("  ¿quién eres?  "), true);
    const final = await esperarHasta(agente, (c) => c.terminada);
    assert.deepEqual(recorrido, ["pensando", "listo"]);
    assert.equal(final.mensajeUsuario, "¿quién eres?");
    assert.equal(final.respuesta, "Soy tu asistente personal dentro de OpenClaw, corriendo sobre Claude Sonnet 5.5.");
    assert.ok(pausas.length > 0);
    assert.ok(pausas.every((ms) => ms >= 40 && ms <= 900));
  });

  test("elige la escena según el mensaje y no acepta otro mientras está ocupado", async () => {
    const { agente, recorrido } = armar();
    assert.equal(await agente.enviar("lee mi USER.md"), true);
    assert.equal(await agente.enviar("otra cosa"), false);
    assert.equal(await agente.enviar("   "), false);
    await esperarHasta(agente, (c) => c.terminada);
    assert.deepEqual(recorrido, ["pensando", "trabajando", "pensando", "listo"]);
  });

  test("aprobación permitida: se detiene hasta que se responde", async () => {
    const { agente, recorrido } = armar();
    await agente.enviar("ejecuta el comando date");
    const pidiendo = await esperarHasta(agente, (c) => c.aprobacion !== null);
    assert.equal(pidiendo.estado, "pidiendo-permiso");
    assert.equal(pidiendo.mensajeUsuario, "ejecuta el comando date");
    // Sin respuesta, no avanza.
    await new Promise((listo) => setTimeout(listo, 30));
    assert.equal(agente.conversacion.estado, "pidiendo-permiso");

    assert.equal(await agente.responder("allow-once"), true);
    const final = await esperarHasta(agente, (c) => c.terminada);
    assert.deepEqual(recorrido, ["pensando", "trabajando", "pidiendo-permiso", "trabajando", "pensando", "listo"]);
    assert.match(final.respuesta, /se ejecutó/);
  });

  test("aprobación rechazada: sigue con la grabación del rechazo", async () => {
    const { agente, recorrido } = armar();
    await agente.enviar("ejecuta el comando ls");
    await esperarHasta(agente, (c) => c.aprobacion !== null);
    assert.equal(await agente.responder("deny"), true);
    // Ya respondida: un segundo clic no hace nada.
    assert.equal(await agente.responder("deny"), false);
    const final = await esperarHasta(agente, (c) => c.terminada);
    assert.equal(final.aprobacion, null);
    assert.match(final.respuesta, /rechazaste el permiso/);
    assert.deepEqual(recorrido, ["pensando", "trabajando", "pidiendo-permiso", "trabajando", "pensando", "listo"]);
  });

  test("error", async () => {
    const { agente, recorrido } = armar();
    await agente.enviar("provoca un error");
    const final = await esperarHasta(agente, (c) => c.terminada);
    assert.deepEqual(recorrido, ["pensando", "error"]);
    assert.equal(final.error, "claude-cli exited with code 1");
    // Después de un error se puede volver a escribir.
    assert.equal(await agente.enviar("hola"), true);
  });

  test("cada envío usa ids nuevos y el texto real del usuario", async () => {
    const { agente, transporte } = armar();
    const marcos: Marco[] = [];
    transporte.escuchar((m) => marcos.push(m));
    await agente.enviar("ejecuta el comando pwd");
    const pidiendo = await esperarHasta(agente, (c) => c.aprobacion !== null);
    assert.notEqual(pidiendo.aprobacion!.id, "plugin:da2e75fa-d4f9-42d2-9c4a-66e2b993d9eb");
    await assert.rejects(transporte.resolverAprobacion("otro-id", "plugin", "allow-once"));
    await agente.responder("allow-once");
    await esperarHasta(agente, (c) => c.terminada);

    const runIds = new Set(marcos.map((m) => m.payload?.runId).filter(Boolean));
    assert.equal(runIds.size, 1);
    assert.ok(!runIds.has("0a016a7b-7d7b-49ac-8488-a946733275e7"));
    const usuario = marcos.find((m) => m.event === "session.message" && m.payload.message.role === "user")!;
    assert.equal(usuario.payload.message.content, "ejecuta el comando pwd");
    const terminal = marcos.find((m) => m.event === "session.approval" && m.payload.phase === "terminal")!;
    assert.equal(terminal.payload.approval.id, pidiendo.aprobacion!.id);
  });

  test("si el transporte falla al enviar, la conversación queda en error", async () => {
    const agente = new Agente({
      enviar: async () => {
        throw new Error("sin conexión");
      },
      resolverAprobacion: async () => {},
      escuchar: () => () => {},
    });
    assert.equal(await agente.enviar("hola"), false);
    assert.equal(agente.conversacion.estado, "error");
    assert.equal(agente.conversacion.error, "No pude enviar el mensaje: sin conexión");
  });
});
