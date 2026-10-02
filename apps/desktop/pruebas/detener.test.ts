import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Agente } from "../src/agente/agente.ts";
import { traducir } from "../src/agente/traduccion.ts";
import type { Marco, Transporte } from "../src/agente/transporte.ts";

/** Un transporte de prueba: acepta los envíos, anota las detenciones y deja emitir eventos a mano. */
function transportePrueba() {
  const oyentes = new Set<(m: Marco) => void>();
  const detenciones: (string | undefined)[] = [];
  const transporte: Transporte = {
    enviar: async () => {},
    resolverAprobacion: async () => {},
    escuchar: (oyente) => {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    detener: async (runId) => {
      detenciones.push(runId);
    },
  };
  const emitir = (marco: Marco) => oyentes.forEach((o) => o(marco));
  return { transporte, detenciones, emitir };
}

describe("detener y vigilar al agente", () => {
  test("detener libera la isla al tiro y pide chat.abort con el runId", async () => {
    const { transporte, detenciones, emitir } = transportePrueba();
    const agente = new Agente(transporte);
    agente.conectar();
    await agente.enviar("hola");
    emitir({ event: "agent", payload: { stream: "lifecycle", runId: "r1", data: { phase: "start" } } });
    assert.equal(agente.conversacion.estado, "pensando");

    await agente.detener();
    assert.equal(agente.conversacion.estado, "reposo");
    assert.equal(agente.conversacion.terminada, true);
    assert.deepEqual(detenciones, ["r1"]);
    // La confirmación del Gateway llega después y no cambia nada.
    const antes = agente.conversacion;
    emitir({ event: "chat", payload: { state: "aborted" } });
    assert.equal(agente.conversacion, antes);
    agente.desconectar();
  });

  test("tras demasiado silencio, corta la espera; con un permiso pendiente, espera", async () => {
    let ahora = 0;
    const { transporte, detenciones, emitir } = transportePrueba();
    const agente = new Agente(transporte, { silencioMaximoMs: 1000, reloj: () => ahora });
    agente.conectar();
    await agente.enviar("hola");

    emitir({
      event: "session.approval",
      payload: { phase: "pending", approval: { id: "a1", presentation: { kind: "plugin", toolName: "Bash", detail: "{}" } } },
    });
    ahora = 5000;
    agente.revisarSilencio();
    assert.equal(agente.conversacion.estado, "pidiendo-permiso");

    emitir({ event: "session.approval", payload: { phase: "terminal", approval: { id: "a1", status: "allowed" } } });
    ahora = 5500;
    agente.revisarSilencio();
    assert.equal(agente.conversacion.estado, "pensando");
    ahora = 7000;
    agente.revisarSilencio();
    assert.equal(agente.conversacion.estado, "error");
    assert.match(agente.conversacion.error!, /no da señales/);
    assert.equal(detenciones.length, 1);
    agente.desconectar();
  });

  test("los errores y cancelaciones del chat terminan el turno", () => {
    assert.deepEqual(traducir({ event: "chat", payload: { state: "error", errorMessage: "401 API key is invalid." } }), {
      tipo: "error",
      mensaje: "401 API key is invalid.",
    });
    assert.deepEqual(traducir({ event: "chat", payload: { state: "aborted" } }), { tipo: "detenido" });
  });
});
