// La delegación en un especialista: qué le llega a la isla y cómo se arma "el equipo trabajando".
// Con ejemplos/delegacion.jsonl y ejemplos/delegacion-continuacion.jsonl, y de punta a punta con la
// traducción y el modelo de la conversación de la isla (apps/desktop/src/agente).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { FiltroDelegacion, leerHistorial, type Ficha } from "../src/delegacion.ts";
import { CONVERSACION_INICIAL, aplicar, type Conversacion } from "../../../apps/desktop/src/agente/conversacion.ts";
import { traducir } from "../../../apps/desktop/src/agente/traduccion.ts";

const PRINCIPAL = "agent:asistente-multiplataforma:main";
const HIJA = "agent:investigador:subagent:7f3c2a91-5d4e-4b8a-9c61-2e0f8d3b6a15";

function leer(nombre: string): any[] {
  return readFileSync(fileURLToPath(new URL(`../ejemplos/${nombre}.jsonl`, import.meta.url)), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((linea) => JSON.parse(linea));
}

const ficha = (agente: string): Ficha =>
  agente === "investigador" ? { nombre: "Investigador", emoji: "🔎", ia: "Gemini", color: "#5b8def" } : { nombre: agente, emoji: "🤖", ia: null, color: null };

/** Pasa los eventos por el filtro: lo que sale para la isla y las listas del equipo que se avisan. */
function filtrar(marcos: any[], filtro = new FiltroDelegacion(PRINCIPAL, ficha)) {
  const salen: any[] = [];
  const avisos: ReturnType<FiltroDelegacion["equipo"]>[] = [];
  marcos.forEach((marco, i) => {
    const { reenviar, equipo } = filtro.procesar(marco, 1000 + i);
    salen.push(...reenviar);
    if (equipo) avisos.push(filtro.equipo());
  });
  return { salen, avisos, filtro };
}

function conversacion(marcos: any[], inicial: Conversacion = CONVERSACION_INICIAL): Conversacion[] {
  const pasos: Conversacion[] = [];
  let c = inicial;
  for (const marco of marcos) {
    const suceso = traducir(marco);
    if (!suceso) continue;
    c = aplicar(c, suceso);
    pasos.push(c);
  }
  return pasos;
}

describe("delegación en un especialista", () => {
  it("los eventos de la sesión hija no llegan a la isla", () => {
    const marcos = leer("delegacion");
    assert.ok(marcos.some((m) => m.payload?.sessionKey === HIJA), "el ejemplo trae eventos de la hija");
    const { salen } = filtrar(marcos);
    assert.ok(salen.every((m) => m.payload?.sessionKey === PRINCIPAL));
  });

  it("el fin de la sesión hija no termina el turno de Brote", () => {
    const marcos = leer("delegacion");
    // Sin el filtro (como antes): la isla daba por terminado el turno con la respuesta del especialista.
    const sinFiltro = conversacion(marcos);
    const primeraTerminada = sinFiltro.find((c) => c.terminada)!;
    assert.match(primeraTerminada.respuesta, /^La fotosíntesis es el proceso/);
    // Con el filtro: termina solo con la respuesta de Brote.
    const pasos = conversacion(filtrar(marcos).salen);
    const terminadas = pasos.filter((c) => c.terminada);
    assert.ok(terminadas.length > 0);
    assert.match(terminadas[0].respuesta, /^¡Listo! El Investigador dice/);
    assert.equal(pasos.at(-1)!.estado, "listo");
  });

  it("el turno del «[Inter-session message]» y su NO_REPLY no se muestran", () => {
    const { salen } = filtrar(leer("delegacion"));
    const textos = salen.map((m) => JSON.stringify(m));
    assert.ok(!textos.some((t) => t.includes("[Inter-session message]")));
    assert.ok(!textos.some((t) => t.includes("NO_REPLY")));
    const pasos = conversacion(salen);
    const final = pasos.at(-1)!;
    assert.equal(final.mensajeUsuario, "Pídele al investigador que me explique la fotosíntesis en dos frases");
    assert.match(final.respuesta, /^¡Listo! El Investigador dice/);
    assert.equal(final.terminada, true);
  });

  it("si el anuncio trae una respuesta de verdad, la isla recibe solo esa respuesta", () => {
    const filtro = new FiltroDelegacion(PRINCIPAL, ficha);
    const primero = filtrar(leer("delegacion"), filtro);
    const despues = conversacion(primero.salen);
    const { salen } = filtrar(leer("delegacion-continuacion"), filtro);
    assert.equal(salen.length, 1);
    assert.equal(salen[0].event, "chat");
    assert.equal(salen[0].payload.state, "final");
    const pasos = conversacion(salen, despues.at(-1)!);
    const final = pasos.at(-1)!;
    assert.match(final.respuesta, /^Volvió el Investigador 🔎/);
    assert.equal(final.estado, "listo");
    // La pregunta del usuario sigue siendo la misma (el anuncio no es un mensaje del usuario).
    assert.equal(final.mensajeUsuario, "Pídele al investigador que me explique la fotosíntesis en dos frases");
  });

  it("arma el equipo trabajando: quién, con qué IA, qué hace y cuándo terminó", () => {
    const { avisos, filtro } = filtrar(leer("delegacion"));
    const primero = avisos[0][0];
    assert.equal(primero.id, "investigador");
    assert.equal(primero.nombre, "Investigador");
    assert.equal(primero.emoji, "🔎");
    assert.equal(primero.ia, "Gemini");
    assert.equal(primero.estado, "trabajando");
    assert.equal(primero.tarea, "Explica en dos frases qué es la fotosíntesis, para un estudiante de primer año, con una fuente.");
    assert.ok(avisos.some((lista) => lista[0]?.herramienta === "web_search"), "muestra la herramienta en curso");
    const ultimo = filtro.equipo();
    assert.equal(ultimo.length, 1);
    assert.equal(ultimo[0].estado, "termino");
    assert.equal(ultimo[0].herramienta, null);
    assert.equal(filtro.hayTrabajando(), false);
  });

  it("un turno nuevo de Brote limpia a los que ya terminaron", () => {
    const { filtro } = filtrar(leer("delegacion"));
    const inicio = { event: "agent", payload: { runId: "otro", sessionKey: PRINCIPAL, stream: "lifecycle", data: { phase: "start" } } };
    const { equipo } = filtro.procesar(inicio, 5000);
    assert.equal(equipo, true);
    assert.deepEqual(filtro.equipo(), []);
  });

  it("un especialista que falla queda marcado", () => {
    const filtro = new FiltroDelegacion(PRINCIPAL, ficha);
    filtro.procesar({ event: "agent", payload: { runId: "h", sessionKey: HIJA, agentId: "investigador", stream: "lifecycle", data: { phase: "start" } } }, 1);
    filtro.procesar({ event: "agent", payload: { runId: "h", sessionKey: HIJA, stream: "lifecycle", data: { phase: "error", error: "429" } } }, 2);
    assert.equal(filtro.equipo()[0].estado, "fallo");
    assert.equal(filtro.equipo()[0].finMs, 2);
  });

  it("los permisos de un especialista llegan a la isla con quién pide", () => {
    const filtro = new FiltroDelegacion(PRINCIPAL, ficha);
    const aprobacion = {
      event: "session.approval",
      payload: {
        sessionKey: PRINCIPAL,
        sourceSessionKey: HIJA,
        phase: "pending",
        approval: { id: "plugin:1", presentation: { kind: "plugin", title: "claude-cli native tool: Bash", toolName: "Bash", detail: "{\"command\":\"ls\"}" } },
      },
    };
    const { reenviar } = filtro.procesar(aprobacion, 1);
    assert.equal(reenviar.length, 1);
    assert.deepEqual((reenviar[0] as any).payload.approval.presentation.especialista, { nombre: "Investigador", emoji: "🔎" });
    const suceso = traducir(reenviar[0] as any);
    assert.equal(suceso?.tipo, "aprobacion");
    assert.equal((suceso as any).aprobacion.titulo, "🔎 Investigador: ¿Ejecuto este comando?");
  });

  it("los eventos de otra sesión (el TUI) tampoco llegan a la isla", () => {
    const filtro = new FiltroDelegacion(PRINCIPAL, ficha);
    const { reenviar, equipo } = filtro.procesar({ event: "agent", payload: { runId: "t", sessionKey: "agent:asistente-multiplataforma:tui-1", stream: "lifecycle", data: { phase: "end" } } }, 1);
    assert.deepEqual(reenviar, []);
    assert.equal(equipo, false);
  });

  it("los eventos sin sesión (sessions.changed) pasan tal cual", () => {
    const filtro = new FiltroDelegacion(PRINCIPAL, ficha);
    const marco = { event: "sessions.changed", payload: {} };
    assert.deepEqual(filtro.procesar(marco, 1).reenviar, [marco]);
  });

  it("un turno normal que responde NO_REPLY termina sin mostrar texto", () => {
    const filtro = new FiltroDelegacion(PRINCIPAL, ficha);
    const base = { runId: "r", sessionKey: PRINCIPAL };
    const marcos = [
      { event: "agent", payload: { ...base, stream: "lifecycle", data: { phase: "start" } } },
      { event: "agent", payload: { ...base, stream: "assistant", data: { delta: "NO", text: "NO" } } },
      { event: "agent", payload: { ...base, stream: "assistant", data: { delta: "_REPLY" } } },
      { event: "agent", payload: { ...base, stream: "lifecycle", data: { phase: "end", terminalReply: { text: "NO_REPLY" } } } },
      { event: "chat", payload: { ...base, state: "final", message: { role: "assistant", content: [{ type: "text", text: "NO_REPLY" }] } } },
    ];
    const salen = marcos.flatMap((m, i) => filtro.procesar(m, i).reenviar);
    assert.ok(!JSON.stringify(salen).includes("NO_REPLY"));
    const final = conversacion(salen).at(-1)!;
    assert.equal(final.terminada, true);
    assert.equal(final.respuesta, "");
  });

  it("un texto que empieza como «NO» pero sigue se muestra entero", () => {
    const filtro = new FiltroDelegacion(PRINCIPAL, ficha);
    const base = { runId: "r", sessionKey: PRINCIPAL };
    const marcos = [
      { event: "agent", payload: { ...base, stream: "lifecycle", data: { phase: "start" } } },
      { event: "agent", payload: { ...base, stream: "assistant", data: { delta: "NO", text: "NO" } } },
      { event: "agent", payload: { ...base, stream: "assistant", data: { delta: " te preocupes" } } },
      { event: "agent", payload: { ...base, stream: "lifecycle", data: { phase: "end", terminalReply: { text: "NO te preocupes" } } } },
    ];
    const salen = marcos.flatMap((m, i) => filtro.procesar(m, i).reenviar);
    assert.equal(salen.length, 4);
    assert.equal(conversacion(salen).at(-1)!.respuesta, "NO te preocupes");
  });
});

// La grabación real de la fase 0 (3-10-2026, OpenClaw 2026.9.7, anonimizada): termina cuando el
// especialista termina, antes de que Brote responda. Es justo el momento en que la isla daba el turno
// por terminado.
describe("delegación: la grabación real", () => {
  const HIJA_REAL = "agent:investigador:subagent:d7f925e7-0029-4cac-aaa6-7da6ad632bc1";

  it("sin el filtro la isla daba el turno por terminado; con el filtro sigue esperando a Brote", () => {
    const marcos = leer("delegacion-grabada");
    assert.ok(marcos.some((m) => m.payload?.sessionKey === HIJA_REAL), "la grabación trae eventos de la hija");
    // Antes: el fin del especialista terminaba el turno.
    assert.ok(conversacion(marcos).some((c) => c.terminada));
    // Ahora: a la isla solo le llega lo de la sesión principal (o lo que no es de ninguna sesión).
    const { salen, avisos } = filtrar(marcos);
    assert.ok(salen.every((m) => !m.payload?.sessionKey || m.payload.sessionKey === PRINCIPAL));
    const pasos = conversacion(salen);
    assert.ok(!pasos.some((c) => c.terminada), "Brote todavía no responde: el turno no terminó");
    assert.notEqual(pasos.at(-1)?.estado, "listo");
    // El equipo: el investigador trabajó y terminó.
    const ultimo = avisos.at(-1) ?? [];
    const investigador = ultimo.find((t) => t.id === "investigador");
    assert.ok(investigador, "el investigador aparece en el equipo");
    assert.equal(investigador!.estado, "termino");
  });
});

describe("el equipo vivo: lo que hace cada especialista", () => {
  it("con la grabación real: en espera al delegar, pensando, escribiendo y la respuesta", () => {
    const filtro = new FiltroDelegacion(PRINCIPAL, ficha);
    const actividades: string[] = [];
    for (const [i, marco] of leer("delegacion-grabada").entries()) {
      const { equipo } = filtro.procesar(marco, 1000 + i);
      const t = filtro.equipo()[0];
      if (equipo && t && actividades.at(-1) !== `${t.estado}/${t.actividad}`) actividades.push(`${t.estado}/${t.actividad}`);
    }
    assert.deepEqual(actividades.slice(0, 3), ["trabajando/en-espera", "trabajando/pensando", "trabajando/trabajando"]);
    const t = filtro.equipo()[0];
    assert.equal(t.estado, "termino");
    assert.match(t.respuesta, /^La mitosis es el proceso de división celular en el cual una célula progenitora se divide/);
    assert.match(t.tareaCompleta!, /^Investiga y responde en UNA sola frase qué es la mitosis/);
  });

  it("guarda los pasos con solo los argumentos útiles", () => {
    const { filtro } = filtrar(leer("delegacion"));
    const t = filtro.equipo()[0];
    assert.ok(t.pasos.length >= 1);
    assert.equal(t.pasos[0].herramienta, "web_search");
    assert.equal(t.pasos[0].estado, "ok");
    assert.ok(Object.keys(t.pasos[0].args).every((k) => ["url", "query", "file_path", "path", "pattern", "command", "action", "agentId"].includes(k)));
    assert.match(t.respuesta, /fotosíntesis/i);
  });

  it("un permiso pendiente lo deja «en espera de ti» y al resolverse sigue", () => {
    const filtro = new FiltroDelegacion(PRINCIPAL, ficha);
    filtro.procesar({ event: "agent", payload: { runId: "h", sessionKey: HIJA, agentId: "investigador", stream: "lifecycle", data: { phase: "start" } } }, 1);
    filtro.procesar({ event: "agent", payload: { runId: "h", sessionKey: HIJA, stream: "tool", data: { phase: "start", name: "Bash", toolCallId: "b1", args: { command: "ls ~/apuntes", description: "secreto" } } } }, 2);
    assert.deepEqual(filtro.equipo()[0].args, { command: "ls ~/apuntes" });
    const pendiente = { event: "session.approval", payload: { sessionKey: PRINCIPAL, sourceSessionKey: HIJA, phase: "pending", approval: { id: "a", presentation: { kind: "plugin", toolName: "Bash" } } } };
    assert.equal(filtro.procesar(pendiente, 3).equipo, true);
    assert.equal(filtro.equipo()[0].actividad, "permiso");
    const resuelto = { ...pendiente, payload: { ...pendiente.payload, phase: "terminal" } };
    filtro.procesar(resuelto, 4);
    assert.equal(filtro.equipo()[0].actividad, "trabajando");
    filtro.procesar({ event: "agent", payload: { runId: "h", sessionKey: HIJA, stream: "tool", data: { phase: "result", name: "Bash", toolCallId: "b1", isError: true } } }, 5);
    assert.equal(filtro.equipo()[0].pasos[0].estado, "error");
    assert.equal(filtro.equipo()[0].actividad, "pensando");
  });

  it("lee el historial de una sesión hija (chat.history)", () => {
    const h = leerHistorial({
      messages: [
        { role: "user", content: "Busca qué es la mitosis" },
        { role: "assistant", content: [{ type: "text", text: "Voy a buscar." }, { type: "tool_use", id: "t1", name: "web_search", input: { query: "mitosis", secreto: "x" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: false, content: "…" }] },
        { role: "assistant", content: [{ type: "text", text: "La mitosis es…" }] },
        { role: "user", content: "[Inter-session message] algo" },
      ],
    });
    assert.equal(h.tarea, "Busca qué es la mitosis");
    assert.deepEqual(h.pasos, [{ id: "t1", herramienta: "web_search", args: { query: "mitosis" }, estado: "ok" }]);
    assert.equal(h.respuesta, "La mitosis es…");
    assert.deepEqual(leerHistorial(null), { tarea: null, pasos: [], respuesta: "" });
  });
});

describe("historial de un especialista (forma real de chat.history, 4-10-2026)", () => {
  it("la tarea se muestra sin el envoltorio de OpenClaw", async () => {
    const { leerHistorial, tareaSinEnvoltorio } = await import("../src/delegacion.ts");
    const tarea =
      "[Subagent Context] You are running as a subagent (depth 1/5). Complete the current [Subagent Task]; inherited conversation is background context, not your assignment.\n\n[Subagent Task]\n\nExplica la fotosíntesis en exactamente dos frases, en español.\n\nBegin. Execute the assigned task to completion.";
    const real = {
      sessionKey: "agent:investigador:subagent:b34eee7e-cf70-45a2-858d-5253355e2cda",
      sessionId: "x",
      messages: [
        { role: "user", content: tarea, timestamp: 1 },
        { role: "assistant", content: "La fotosíntesis es el proceso químico… Durante este proceso se libera oxígeno.", timestamp: 2 },
      ],
      hasMore: false,
      totalMessages: 2,
    };
    const h = leerHistorial(real);
    assert.equal(h.tarea, "Explica la fotosíntesis en exactamente dos frases, en español.");
    assert.match(h.respuesta, /^La fotosíntesis es el proceso químico/);
    assert.equal(tareaSinEnvoltorio("Investiga X"), "Investiga X");
  });
});
