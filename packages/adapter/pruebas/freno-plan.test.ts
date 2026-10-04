// El freno por plan, de punta a punta: el puente de verdad recibe el % semanal por POST /plan (como
// desde la statusline) y saca de `allowAgents` a los especialistas con Claude sobre el 85 %, con un
// `openclaw` falso que guarda la configuración. Vuelven bajo el 80 %. La isla recibe un aviso por cambio.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const PUENTE = fileURLToPath(new URL("../src/puente.ts", import.meta.url));

const FALSO = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const dir = process.env.OPENCLAW_STATE_DIR;
const config = path.join(dir, "openclaw.json");
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "llamadas.log"), JSON.stringify(args) + "\\n");
const c = JSON.parse(fs.readFileSync(config, "utf8"));
const m = (args[2] || "").match(/^agents\\.entries\\.([\\w-]+)\\.subagents$/);
if (args[0] !== "config" || !m) process.exit(1);
if (args[1] === "unset") delete c.agents.entries[m[1]].subagents;
else c.agents.entries[m[1]].subagents = JSON.parse(args[3]);
fs.writeFileSync(config, JSON.stringify(c));
console.log("Change will apply without restarting the gateway.");
`;

function esperarHasta<T>(condicion: () => T | undefined | null | false, ms = 8000): Promise<T> {
  return new Promise((listo, fallo) => {
    const limite = Date.now() + ms;
    const revisar = () => {
      const valor = condicion();
      if (valor) return listo(valor);
      if (Date.now() > limite) return fallo(new Error("se acabó el tiempo"));
      setTimeout(revisar, 50);
    };
    revisar();
  });
}

function postPlan(conexion: string, semana: number): Promise<void> {
  const { puerto, token } = JSON.parse(readFileSync(conexion, "utf8"));
  const cuerpo = JSON.stringify({
    rate_limits: { seven_day: { used_percentage: semana, resets_at: Math.floor(Date.now() / 1000) + 3 * 86_400 } },
    modelo: "claude-sonnet-5-5",
  });
  return new Promise((listo, fallo) => {
    const pedido = request(
      { host: "127.0.0.1", port: puerto, path: "/plan", method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` } },
      (respuesta) => {
        respuesta.resume();
        respuesta.on("end", () => listo());
      },
    );
    pedido.on("error", fallo);
    pedido.end(cuerpo);
  });
}

describe("freno por plan", { skip: process.platform === "win32" }, () => {
  it("sobre 85 % semanal saca a los de Claude; bajo 80 % los devuelve; avisa una vez por cambio", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "freno-"));
    const bin = join(raiz, "bin");
    const estado = join(raiz, "openclaw");
    mkdirSync(bin);
    mkdirSync(estado);
    writeFileSync(join(bin, "openclaw"), FALSO);
    chmodSync(join(bin, "openclaw"), 0o755);
    const config = join(estado, "openclaw.json");
    writeFileSync(
      config,
      JSON.stringify({
        agents: {
          entries: {
            "asistente-multiplataforma": { workspace: join(estado, "workspace"), subagents: { allowAgents: ["tutor", "investigador"], delegationMode: "suggest" } },
            tutor: { model: "anthropic/claude-sonnet-5-5" },
            investigador: { model: "google/gemini-3.5-flash" },
          },
        },
      }),
    );
    const funciones = join(raiz, "funciones.json");
    writeFileSync(funciones, JSON.stringify({ activas: Object.fromEntries(["gastos", "especialistas", "uso-del-plan"].map((f) => [f, true])) }));
    const conexion = join(raiz, ".asistente-prototipo", "hooks.json");
    const { OPENCLAW_PROFILE: _p, ...resto } = process.env;
    const puente: ChildProcess = spawn(process.execPath, [PUENTE], {
      env: {
        ...resto,
        HOME: raiz,
        OPENCLAW_STATE_DIR: estado,
        PATH: `${bin}:${process.env.PATH}`,
        ASISTENTE_FUNCIONES: funciones,
        ASISTENTE_EQUIPO: join(raiz, "equipo.json"),
        ASISTENTE_PLAN: join(raiz, "plan.json"),
        ASISTENTE_PLAN_APP: join(raiz, "no-existe.json"),
        ASISTENTE_DESCARGAS: join(raiz, "descargas"),
      },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const avisos: any[] = [];
    createInterface({ input: puente.stdout! }).on("line", (linea) => {
      try {
        avisos.push(JSON.parse(linea));
      } catch {
        // no es JSON
      }
    });
    const permitidos = () => JSON.parse(readFileSync(config, "utf8")).agents.entries["asistente-multiplataforma"].subagents?.allowAgents;
    const avisosFreno = () => avisos.filter((a) => a.tipo === "especialistas-aviso");
    try {
      await esperarHasta(() => existsSync(conexion));

      await postPlan(conexion, 90);
      await esperarHasta(() => JSON.stringify(permitidos()) === JSON.stringify(["investigador"]));
      assert.equal(avisosFreno().length, 1);
      assert.match(avisosFreno()[0].texto, /plan semanal de Claude va alto \(90 %\)/);
      assert.deepEqual(JSON.parse(readFileSync(join(raiz, "equipo.json"), "utf8")), { version: 1, frenado: true });

      // Entre 80 y 85: no cambia nada (histéresis) ni se vuelve a avisar.
      await postPlan(conexion, 82);
      await new Promise((listo) => setTimeout(listo, 400));
      assert.deepEqual(permitidos(), ["investigador"]);
      assert.equal(avisosFreno().length, 1);

      await postPlan(conexion, 79);
      await esperarHasta(() => JSON.stringify(permitidos()) === JSON.stringify(["tutor", "investigador"]));
      assert.equal(avisosFreno().length, 2);
      assert.match(avisosFreno()[1].texto, /vuelven al equipo/);
    } finally {
      puente.stdin!.end();
      await new Promise((listo) => puente.once("exit", listo));
    }
    // Cerrar la app no es apagar el equipo: Brote sigue pudiendo delegar.
    assert.deepEqual(permitidos(), ["tutor", "investigador"]);
  });
});
