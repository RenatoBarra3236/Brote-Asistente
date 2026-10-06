// «Empezar sin IA» (F de docs/plan-estudio-y-mejoras.md): con `sinIA` en funciones.json, la revisión
// rápida del inicio da "listo" y Configurar Brote no se abre sola en cada arranque. Carpeta temporal.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { pasoNode } from "../src/configurar.ts";

const SCRIPT = fileURLToPath(new URL("../src/configurar.ts", import.meta.url));
const CARPETA = mkdtempSync(join(tmpdir(), "sin-ia-"));
after(() => rmSync(CARPETA, { recursive: true, force: true }));

function rapido(funciones: string | null): { listo: boolean } {
  const archivo = join(CARPETA, "funciones.json");
  if (funciones !== null) writeFileSync(archivo, funciones);
  const salida = spawnSync(process.execPath, [SCRIPT, "rapido"], {
    encoding: "utf8",
    env: { ...process.env, ASISTENTE_FUNCIONES: archivo, OPENCLAW_STATE_DIR: join(CARPETA, "openclaw"), OPENCLAW_CONFIG_PATH: join(CARPETA, "openclaw", "no.json") },
  });
  return JSON.parse(salida.stdout.trim().split("\n").pop()!);
}

describe("«Empezar sin IA»", () => {
  it("con sinIA verdadero la revisión rápida da listo, aunque no haya OpenClaw", () => {
    assert.equal(rapido(JSON.stringify({ version: 1, activas: { gastos: true }, sinIA: true })).listo, true);
  });

  it("sin el campo (o con otro valor) sigue pidiendo OpenClaw", () => {
    assert.equal(rapido(JSON.stringify({ version: 1, activas: { gastos: true } })).listo, false);
    assert.equal(rapido(JSON.stringify({ version: 1, sinIA: "sí" })).listo, false);
  });
});

describe("el paso «Node» con el Node que trae la app", () => {
  it("con un Node del sistema 24 o más está bien; con uno menor, falta", () => {
    assert.equal(pasoNode("24.21.0", false, false).estado, "ok");
    assert.equal(pasoNode("22.10.0", false, false).estado, "falta");
  });

  it("corriendo con el Node de la app, el paso falta (la IA necesita el del sistema) y lo explica", () => {
    const paso = pasoNode("24.21.0", true, true);
    assert.equal(paso.estado, "falta");
    assert.match(paso.detalle, /trae su propio Node/);
    assert.deepEqual(paso.accion, { tipo: "terminal", etiqueta: "Instalar con Homebrew", terminal: "brew-node" });
    assert.equal(pasoNode("24.21.0", true, false).accion?.tipo, "enlace");
  });
});
