// Lo puro de equipo.ts (comandos de OpenClaw para el equipo) y que la memoria de un especialista no
// se mezcle con la de Brote en «Lo que sé de ti».

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { especialistaDe } from "@asistente/motor";
import { argsAgregar, argsClave, argsDelegacion, argsModelo, carpetaEspecialista, claveValida, cuentasConectadas, delegacionActual, guardarFreno, leerFreno, leerPerfiles, sinClave } from "../src/equipo.ts";
import { listarRecuerdos } from "../src/memoria.ts";

describe("comandos del equipo", () => {
  it("agregar un especialista en su carpeta, con su plantilla de rol si tiene", () => {
    assert.deepEqual(argsAgregar(especialistaDe("revisor")!, "/x/equipo/revisor"), [
      "agents", "add", "revisor", "--role", "reviewer", "--workspace", "/x/equipo/revisor", "--non-interactive", "--json",
    ]);
    assert.ok(!argsAgregar(especialistaDe("planificador")!, "/x").includes("--role"));
    assert.equal(carpetaEspecialista("tutor", "/h/.openclaw"), join("/h/.openclaw", "equipo", "tutor"));
  });

  it("solo modelos de la lista", () => {
    assert.deepEqual(argsModelo("tutor", "google/gemini-3.5-flash"), ["config", "set", "agents.entries.tutor.model", "google/gemini-3.5-flash"]);
    assert.throws(() => argsModelo("tutor", "google/gemini-3.8-flash"));
  });

  it("la delegación de Brote: la lista con suggest, o sin subagents si no hay nadie", () => {
    assert.deepEqual(argsDelegacion("brote", ["investigador"]), [
      "config", "set", "agents.entries.brote.subagents", '{"allowAgents":["investigador"],"delegationMode":"suggest"}', "--strict-json",
    ]);
    assert.deepEqual(argsDelegacion("brote", []), ["config", "unset", "agents.entries.brote.subagents"]);
    assert.deepEqual(delegacionActual({ agents: { entries: { brote: { subagents: { allowAgents: ["a", 3] } } } } }, "brote"), ["a"]);
    assert.deepEqual(delegacionActual(null, "brote"), []);
  });

  it("lee los perfiles de `models auth list` (la salida real del Mac) sin claves", () => {
    const perfiles = leerPerfiles("Profiles:\n- google:manual [google/api_key]\n- openai:work [openai/oauth]\nalgo más\n");
    assert.deepEqual(perfiles, [
      { id: "google:manual", proveedor: "google", tipo: "api_key" },
      { id: "openai:work", proveedor: "openai", tipo: "oauth" },
    ]);
    assert.deepEqual([...cuentasConectadas(perfiles)].sort(), ["chatgpt", "gemini"]);
    assert.deepEqual(leerPerfiles("Profiles:"), []);
  });

  it("la clave va por la entrada y se oculta en los errores", () => {
    assert.deepEqual(argsClave("google", "investigador"), ["models", "auth", "paste-api-key", "--provider", "google", "--agent", "investigador"]);
    const clave = `AIza${"x".repeat(35)}`;
    assert.ok(claveValida(clave));
    assert.ok(!claveValida("a b"));
    assert.equal(sinClave(`Invalid API key ${clave}`, clave), "Invalid API key •••");
  });

  it("el freno guardado sobrevive reinicios (archivo 600)", () => {
    const ruta = join(mkdtempSync(join(tmpdir(), "freno-")), "equipo.json");
    assert.equal(leerFreno(ruta), false);
    guardarFreno(true, ruta);
    assert.equal(leerFreno(ruta), true);
  });
});

describe("«Lo que sé de ti» no mezcla la memoria del equipo", () => {
  it("las carpetas de los especialistas (aparte o dentro del workspace de Brote) no aparecen", () => {
    const raiz = mkdtempSync(join(tmpdir(), "memoria-equipo-"));
    const workspace = join(raiz, "workspace");
    const lugares = { brote: join(raiz, "brote"), conversaciones: join(workspace, "memory"), importados: join(workspace, "memory", "imports", "claude-code") };
    mkdirSync(lugares.brote, { recursive: true });
    mkdirSync(lugares.conversaciones, { recursive: true });
    writeFileSync(join(lugares.conversaciones, "2026-10-03-1200.md"), "# Conversación de Brote\n");
    // El de la fase 0 quedó dentro del workspace de Brote; los nuevos, en ~/.openclaw/equipo/<id>.
    for (const carpeta of [join(workspace, "investigador", "memory"), join(raiz, "equipo", "tutor", "memory")]) {
      mkdirSync(carpeta, { recursive: true });
      writeFileSync(join(carpeta, "2026-10-03-1300.md"), "# Conversación del especialista\n");
    }
    const recuerdos = listarRecuerdos(lugares);
    assert.deepEqual(recuerdos.map((r) => r.id), ["conversacion:2026-10-03-1200.md"]);
  });
});
