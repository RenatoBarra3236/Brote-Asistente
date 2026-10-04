// "Configurar Brote" → Cuentas de IA y Equipo, de punta a punta con un `openclaw` falso que imita lo
// que hizo OpenClaw 2026.9.7 en el Mac del usuario (agents add/delete, config set con validación de
// modelos, models auth list/paste-api-key). Sin OpenClaw ni cuentas reales.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../src/configurar.ts", import.meta.url));

const FALSO = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const dir = process.env.OPENCLAW_STATE_DIR;
const config = path.join(dir, "openclaw.json");
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "llamadas.log"), JSON.stringify(args) + "\\n");
const leer = () => { try { return JSON.parse(fs.readFileSync(config, "utf8")); } catch { return {}; } };
const guardar = (c) => fs.writeFileSync(config, JSON.stringify(c));
const opcion = (n) => { const i = args.indexOf(n); return i === -1 ? undefined : args[i + 1]; };
// Solo los modelos del catálogo que trae OpenClaw (como el real).
const CATALOGO = ["google/gemini-3.5-flash", "google/gemini-3-flash-preview", "anthropic/claude-sonnet-5-5", "anthropic/claude-haiku-4-5", "openai/gpt-6-astra", "openai/gpt-5.4-mini", "xai/grok-4.7"];
const [grupo, orden] = args;
if (grupo === "agents" && orden === "add") {
  const id = args[2];
  const c = leer();
  const ws = opcion("--workspace") || path.join(dir, "workspace", id);
  c.agents.entries[id] = { workspace: ws };
  guardar(c);
  fs.mkdirSync(ws, { recursive: true });
  const rol = opcion("--role");
  if (rol) fs.writeFileSync(path.join(ws, "AGENTS.md"), "# Role: " + rol + "\\nPlantilla de OpenClaw.\\n");
  console.log(JSON.stringify({ agentId: id, workspace: ws, agentDir: path.join(dir, "agents", id, "agent") }));
} else if (grupo === "agents" && orden === "set-identity") {
  console.log("Identity updated.");
} else if (grupo === "agents" && orden === "delete") {
  if (!args.includes("--force")) { console.error("Confirmation required"); process.exit(1); }
  const c = leer();
  delete c.agents.entries[args[2]];
  guardar(c);
  console.log(JSON.stringify({ deleted: args[2] }));
} else if (grupo === "config" && (orden === "set" || orden === "unset")) {
  const ruta = args[2];
  const c = leer();
  let m;
  if ((m = ruta.match(/^agents\\.entries\\.([\\w-]+)\\.model$/))) {
    if (!CATALOGO.includes(args[3])) { console.error("Unable to resolve authored model reference: " + args[3]); process.exit(1); }
    c.agents.entries[m[1]].model = args[3];
  } else if ((m = ruta.match(/^agents\\.entries\\.([\\w-]+)\\.subagents$/))) {
    if (orden === "unset") delete c.agents.entries[m[1]].subagents;
    else { if (!args.includes("--strict-json")) process.exit(1); c.agents.entries[m[1]].subagents = JSON.parse(args[3]); }
  } else if ((m = ruta.match(/^agents\\.defaults\\.models\\["(.+)"\\]\\.agentRuntime\\.id$/))) {
    c.agents.defaults = c.agents.defaults || {};
    c.agents.defaults.models = c.agents.defaults.models || {};
    c.agents.defaults.models[m[1]] = { agentRuntime: { id: args[3] } };
  } else process.exit(1);
  guardar(c);
  console.log("Change will apply without restarting the gateway.");
} else if (grupo === "models" && orden === "auth" && args[2] === "list") {
  const agente = opcion("--agent") || "compartido";
  const archivo = path.join(dir, "clave-" + agente);
  console.log("Profiles:" + (fs.existsSync(archivo) ? "\\n- google:manual [google/api_key]" : ""));
} else if (grupo === "models" && orden === "auth" && args[2] === "paste-api-key") {
  const clave = fs.readFileSync(0, "utf8").trim();
  if (!clave.startsWith("AIza")) { console.error("Invalid API key " + clave); process.exit(1); }
  fs.writeFileSync(path.join(dir, "clave-" + (opcion("--agent") || "compartido")), "guardada");
  console.log("Saved google:manual.");
} else process.exit(1);
`;

function preparar(conEquipo = true) {
  const raiz = mkdtempSync(join(tmpdir(), "equipo-cfg-"));
  const bin = join(raiz, "bin");
  const estado = join(raiz, "openclaw");
  mkdirSync(bin);
  mkdirSync(estado);
  writeFileSync(join(bin, "openclaw"), FALSO);
  chmodSync(join(bin, "openclaw"), 0o755);
  const brote = join(estado, "workspace");
  mkdirSync(brote);
  writeFileSync(
    join(estado, "openclaw.json"),
    JSON.stringify({ gateway: { auth: { token: "x" } }, agents: { entries: { "asistente-multiplataforma": { workspace: brote } } } }),
  );
  const funciones = join(raiz, "funciones.json");
  writeFileSync(funciones, JSON.stringify({ activas: { especialistas: conEquipo } }));
  const { OPENCLAW_PROFILE: _p, ...resto } = process.env;
  return {
    raiz,
    estado,
    // Sin `claude` en el PATH: Claude queda "sin conectar", que es lo que se espera aquí.
    entorno: {
      ...resto,
      HOME: raiz,
      OPENCLAW_STATE_DIR: estado,
      PATH: `${bin}:${process.env.PATH}`,
      ASISTENTE_FUNCIONES: funciones,
      ASISTENTE_EQUIPO: join(raiz, "equipo.json"),
    },
  };
}

function correr(args: string[], entorno: NodeJS.ProcessEnv, entrada = ""): Promise<any> {
  return new Promise((listo, fallo) => {
    const hijo = spawn(process.execPath, [SCRIPT, ...args], { env: entorno, stdio: ["pipe", "pipe", "inherit"] });
    let salida = "";
    hijo.stdout.on("data", (trozo) => (salida += trozo));
    hijo.stdin.end(entrada);
    const plazo = setTimeout(() => {
      hijo.kill();
      fallo(new Error(`no terminó: ${salida}`));
    }, 20_000);
    hijo.on("close", () => {
      clearTimeout(plazo);
      listo(JSON.parse(salida.trim().split("\n").at(-1)!));
    });
  });
}

const config = (estado: string) => JSON.parse(readFileSync(join(estado, "openclaw.json"), "utf8"));
const llamadas = (estado: string) =>
  existsSync(join(estado, "llamadas.log")) ? readFileSync(join(estado, "llamadas.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
const CLAVE = `AIza${"B".repeat(35)}`;

describe("Configurar Brote → Cuentas de IA y Equipo", { skip: process.platform === "win32" || Number(process.versions.node.split(".")[0]) < 24 }, () => {
  it("sin cuentas: el estado muestra el catálogo y nadie en el equipo", async () => {
    const { entorno } = preparar();
    const estado = await correr(["equipo"], entorno);
    assert.deepEqual(estado.cuentas.map((c: any) => [c.id, c.conectada, c.probado]), [
      ["claude", false, true],
      ["gemini", false, true],
      ["chatgpt", false, false],
      ["grok", false, false],
    ]);
    assert.deepEqual(estado.especialistas.map((e: any) => e.id), ["tutor", "investigador", "redactor", "revisor", "planificador"]);
    assert.ok(estado.especialistas.every((e: any) => !e.activo));
    assert.deepEqual(estado.delegacion, []);
  });

  it("no deja crear un especialista con Gemini sin su clave", async () => {
    const { estado, entorno } = preparar();
    const respuesta = await correr(["especialista", "investigador", "google/gemini-3.5-flash"], entorno, "Cita siempre.");
    assert.equal(respuesta.ok, false);
    assert.match(respuesta.detalle, /Primero conecta Gemini en Cuentas de IA/);
    assert.equal(config(estado).agents.entries.investigador, undefined);
  });

  it("la clave de Gemini va por la entrada, nunca se muestra, y queda para todos", async () => {
    const { estado, entorno } = preparar();
    const mala = await correr(["cuenta-clave", "gemini"], entorno, "con espacio\n");
    assert.equal(mala.ok, false);
    assert.equal(llamadas(estado).length, 0, "una clave con mala forma ni llega a OpenClaw");
    const respuesta = await correr(["cuenta-clave", "gemini"], entorno, `${CLAVE}\n`);
    assert.equal(respuesta.ok, true, respuesta.detalle);
    assert.match(respuesta.detalle, /Gemini quedó conectado/);
    assert.match(respuesta.detalle, /entrenar/);
    assert.ok(!JSON.stringify(llamadas(estado)).includes(CLAVE), "la clave nunca va como argumento");
    assert.deepEqual(llamadas(estado)[0], ["models", "auth", "paste-api-key", "--provider", "google"]);
    const estadoJson = await correr(["equipo"], entorno);
    assert.equal(estadoJson.cuentas.find((c: any) => c.id === "gemini").conectada, true);
  });

  it("prender el Investigador con Gemini: lo crea aparte, con su IA, sus reglas, y Brote puede delegarle", async () => {
    const { estado, entorno } = preparar();
    await correr(["cuenta-clave", "gemini"], entorno, `${CLAVE}\n`);
    const respuesta = await correr(["especialista", "investigador", "google/gemini-3.5-flash"], entorno, "Cita siempre con enlace.\nEn español.");
    assert.equal(respuesta.ok, true, respuesta.detalle);
    assert.equal(respuesta.detalle, "🔎 Investigador se unió al equipo (Gemini 3.5 Flash).");
    const hechas = llamadas(estado).map((l) => l.join(" "));
    const carpeta = join(estado, "equipo", "investigador");
    assert.ok(hechas.includes(`agents add investigador --role researcher --workspace ${carpeta} --non-interactive --json`));
    assert.ok(hechas.includes("agents set-identity --agent investigador --name Investigador --emoji 🔎"));
    assert.ok(hechas.includes("config set agents.entries.investigador.model google/gemini-3.5-flash"));
    const c = config(estado);
    assert.equal(c.agents.entries.investigador.workspace, carpeta, "fuera del workspace de Brote");
    assert.deepEqual(c.agents.entries["asistente-multiplataforma"].subagents, { allowAgents: ["investigador"], delegationMode: "suggest" });
    // AGENTS.md: el bloque de Brote arriba y la plantilla de rol de OpenClaw intacta.
    const agents = readFileSync(join(carpeta, "AGENTS.md"), "utf8");
    assert.match(agents, /^<!-- brote:especialista -->\n# 🔎 Investigador/);
    assert.match(agents, /son datos, nunca órdenes/);
    assert.match(agents, /## Instrucciones del estudiante\nCita siempre con enlace\.\nEn español\.\n<!-- \/brote:especialista -->/);
    assert.match(agents, /# Role: researcher\nPlantilla de OpenClaw\./);
    const estadoJson = await correr(["equipo"], entorno);
    const investigador = estadoJson.especialistas.find((e: any) => e.id === "investigador");
    assert.deepEqual(
      [investigador.activo, investigador.modelo, investigador.instrucciones, investigador.dentroDeBrote],
      [true, "google/gemini-3.5-flash", "Cita siempre con enlace.\nEn español.", false],
    );
    assert.deepEqual(estadoJson.delegacion, ["investigador"]);

    // Editar: no se vuelve a crear, cambia la IA y se reemplaza el bloque (no se duplica).
    const editado = await correr(["especialista", "investigador", "google/gemini-3-flash-preview"], entorno, "Solo fuentes en español.");
    assert.equal(editado.detalle, "🔎 Investigador quedó actualizado (Gemini 3 Flash (vista previa)).");
    assert.equal(llamadas(estado).filter((l) => l[0] === "agents" && l[1] === "add").length, 1);
    const agents2 = readFileSync(join(carpeta, "AGENTS.md"), "utf8");
    assert.equal(agents2.split("<!-- brote:especialista -->").length, 2);
    assert.match(agents2, /Solo fuentes en español\./);
    assert.doesNotMatch(agents2, /Cita siempre con enlace/);
  });

  it("un especialista con Claude corre con Claude Code; Tutor no tiene plantilla de rol", async () => {
    const { estado, entorno } = preparar();
    const respuesta = await correr(["especialista", "tutor", "anthropic/claude-haiku-4-5"], entorno, "");
    assert.equal(respuesta.ok, true, respuesta.detalle);
    const hechas = llamadas(estado).map((l) => l.join(" "));
    assert.ok(hechas.some((h) => h.startsWith("agents add tutor --workspace ")), "sin --role");
    assert.ok(hechas.includes('config set agents.defaults.models["anthropic/claude-haiku-4-5"].agentRuntime.id claude-cli'));
    // Sin instrucciones escritas, van las por defecto.
    assert.match(readFileSync(join(estado, "equipo", "tutor", "AGENTS.md"), "utf8"), /No hagas la tarea por el estudiante/);
  });

  it("con el freno por plan puesto, los especialistas con Claude no quedan en allowAgents", async () => {
    const { raiz, estado, entorno } = preparar();
    writeFileSync(join(raiz, "equipo.json"), JSON.stringify({ frenado: true }));
    await correr(["cuenta-clave", "gemini"], entorno, `${CLAVE}\n`);
    await correr(["especialista", "tutor", "anthropic/claude-sonnet-5-5"], entorno, "");
    assert.equal(config(estado).agents.entries["asistente-multiplataforma"].subagents, undefined);
    await correr(["especialista", "revisor", "google/gemini-3.5-flash"], entorno, "");
    assert.deepEqual(config(estado).agents.entries["asistente-multiplataforma"].subagents.allowAgents, ["revisor"]);
  });

  it("con el equipo apagado en Funciones, crear un especialista no toca la delegación de Brote", async () => {
    const { estado, entorno } = preparar(false);
    const respuesta = await correr(["especialista", "redactor", "anthropic/claude-sonnet-5-5"], entorno, "");
    assert.equal(respuesta.ok, true, respuesta.detalle);
    assert.equal(config(estado).agents.entries["asistente-multiplataforma"].subagents, undefined);
  });

  it("apagar un especialista: sale de allowAgents antes de borrarlo", async () => {
    const { estado, entorno } = preparar();
    await correr(["especialista", "tutor", "anthropic/claude-sonnet-5-5"], entorno, "");
    await correr(["especialista", "redactor", "anthropic/claude-sonnet-5-5"], entorno, "");
    assert.deepEqual(config(estado).agents.entries["asistente-multiplataforma"].subagents.allowAgents, ["tutor", "redactor"]);
    const respuesta = await correr(["especialista-quitar", "tutor"], entorno);
    assert.equal(respuesta.ok, true, respuesta.detalle);
    const hechas = llamadas(estado).map((l) => l.join(" "));
    const quitarDeBrote = hechas.lastIndexOf(`config set agents.entries.asistente-multiplataforma.subagents {"allowAgents":["redactor"],"delegationMode":"suggest"} --strict-json`);
    const borrar = hechas.indexOf("agents delete tutor --force --json");
    assert.ok(quitarDeBrote !== -1 && borrar > quitarDeBrote);
    await correr(["especialista-quitar", "redactor"], entorno);
    assert.equal(config(estado).agents.entries["asistente-multiplataforma"].subagents, undefined, "sin nadie, se quita subagents");
    assert.ok(llamadas(estado).some((l) => l.join(" ") === "config unset agents.entries.asistente-multiplataforma.subagents"));
  });

  it("rechaza ids, modelos e instrucciones fuera de las listas", async () => {
    const { estado, entorno } = preparar();
    for (const [args, entrada, motivo] of [
      [["especialista", "jefe", "anthropic/claude-sonnet-5-5"], "", /desconocido/],
      [["especialista", "tutor", "google/gemini-3.8-flash"], "", /no está en la lista/],
      [["especialista", "tutor", "anthropic/claude-sonnet-5-5"], "hola <!-- brote:especialista -->", /texto simple/],
      [["especialista", "tutor", "anthropic/claude-sonnet-5-5"], "x".repeat(2001), /2000/],
      [["cuenta-clave", "chatgpt"], CLAVE, /no se conecta con una clave/],
    ] as const) {
      const respuesta = await correr([...args], entorno, entrada);
      assert.equal(respuesta.ok, false);
      assert.match(respuesta.detalle, motivo);
    }
    assert.equal(llamadas(estado).length, 0);
  });

  it("Brote sigue siendo Brote aunque un especialista quede primero en agents.entries", async () => {
    const { estado, entorno } = preparar();
    const c = config(estado);
    c.agents.entries = { investigador: { workspace: join(estado, "workspace", "investigador"), model: "google/gemini-3.5-flash" }, ...c.agents.entries };
    writeFileSync(join(estado, "openclaw.json"), JSON.stringify(c));
    const estadoJson = await correr(["equipo"], entorno);
    const investigador = estadoJson.especialistas.find((e: any) => e.id === "investigador");
    assert.equal(investigador.activo, true);
    // El de la fase 0 quedó dentro del workspace de Brote: la ventana lo avisa.
    assert.equal(investigador.dentroDeBrote, true);
  });

  it("cada especialista nace con su personalidad (SOUL.md e IDENTITY.md) y se puede editar", async () => {
    const { estado, entorno } = preparar();
    const respuesta = await correr(["especialista", "tutor", "anthropic/claude-sonnet-5-5"], entorno, "");
    assert.equal(respuesta.ok, true, respuesta.detalle);
    const carpeta = join(estado, "equipo", "tutor");
    assert.match(readFileSync(join(carpeta, "SOUL.md"), "utf8"), /^# 📚 Tutor\n\nEres el Tutor del equipo de Brote 🌱\. Paciente y socrático/);
    assert.match(readFileSync(join(carpeta, "IDENTITY.md"), "utf8"), /- \*\*Vibe:\*\* Paciente y socrático/);
    const editado = await correr(
      ["especialista", "tutor", "anthropic/claude-sonnet-5-5"],
      entorno,
      JSON.stringify({ instrucciones: "Usa ejemplos de fútbol.", personalidad: "Eres un tutor muy chistoso." }),
    );
    assert.equal(editado.ok, true, editado.detalle);
    assert.equal(readFileSync(join(carpeta, "SOUL.md"), "utf8"), "# 📚 Tutor\n\nEres un tutor muy chistoso.\n");
    assert.match(readFileSync(join(carpeta, "AGENTS.md"), "utf8"), /Usa ejemplos de fútbol\./);
    const estadoJson = await correr(["equipo"], entorno);
    assert.equal(estadoJson.especialistas.find((e: any) => e.id === "tutor").personalidad, "Eres un tutor muy chistoso.");
    const malo = await correr(["especialista", "tutor", "anthropic/claude-sonnet-5-5"], entorno, JSON.stringify({ instrucciones: "", personalidad: "con \u0007 campana" }));
    assert.equal(malo.ok, false);
    assert.match(malo.detalle, /personalidad/);
  });

  it("al investigador de la fase 0 (creado a mano) solo se le agrega la personalidad que falta", async () => {
    const { estado, entorno } = preparar();
    const carpeta = join(estado, "workspace", "investigador");
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(join(carpeta, "IDENTITY.md"), "mía, no tocar");
    const c = config(estado);
    c.agents.entries.investigador = { workspace: carpeta, model: "google/gemini-3.5-flash" };
    writeFileSync(join(estado, "openclaw.json"), JSON.stringify(c));
    await correr(["equipo"], entorno);
    assert.match(readFileSync(join(carpeta, "SOUL.md"), "utf8"), /Curioso hasta el detalle/);
    assert.equal(readFileSync(join(carpeta, "IDENTITY.md"), "utf8"), "mía, no tocar");
    // Ni se recrea ni se borra: no hubo ningún `agents add` ni `agents delete`.
    assert.ok(!llamadas(estado).some((l) => l[0] === "agents" && (l[1] === "add" || l[1] === "delete")));
    writeFileSync(join(carpeta, "SOUL.md"), "# 🔎 Investigador\n\nLa mía.\n");
    await correr(["equipo"], entorno);
    assert.equal(readFileSync(join(carpeta, "SOUL.md"), "utf8"), "# 🔎 Investigador\n\nLa mía.\n");
  });
});
