// La consulta mínima del plan con un `claude` falso que imprime la salida real (armada) de
// `claude -p --output-format stream-json`: sin Claude Code ni cuenta de verdad.

import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ARGS_CONSULTA_PLAN, buscarClaude, consultarPlan, entornoConsulta } from "../src/consulta-plan.ts";

const SALIDA = fileURLToPath(new URL("../../motor/pruebas/datos/consulta-limites.jsonl", import.meta.url));
const carpeta = mkdtempSync(join(tmpdir(), "consulta-plan-"));
after(() => rmSync(carpeta, { recursive: true, force: true }));

/** Un `claude` falso: guarda sus argumentos y su entorno, e imprime `salida`. */
function falso(nombre: string, salida: string, codigo = 0): string {
  const ruta = join(carpeta, nombre);
  writeFileSync(
    ruta,
    `#!/usr/bin/env node
require("node:fs").writeFileSync(${JSON.stringify(ruta + ".llamada")}, JSON.stringify({ args: process.argv.slice(2), clave: process.env.ANTHROPIC_API_KEY ?? null, openclaw: process.env.OPENCLAW_STATE_DIR ?? null }));
process.stdout.write(${JSON.stringify(salida)});
process.exit(${codigo});
`,
  );
  chmodSync(ruta, 0o755);
  return ruta;
}

describe("consulta mínima del plan", { skip: process.platform === "win32" }, () => {
  it("lee los límites del evento rate_limit_event, sin la clave de API ni las variables de OpenClaw", async () => {
    const programa = falso("claude-bien", readFileSync(SALIDA, "utf8"));
    const antes = { clave: process.env.ANTHROPIC_API_KEY, estado: process.env.OPENCLAW_STATE_DIR };
    process.env.ANTHROPIC_API_KEY = "sk-no-debe-llegar";
    process.env.OPENCLAW_STATE_DIR = "/x";
    try {
      const lectura = await consultarPlan(programa);
      assert.equal(lectura?.fuente, "consulta");
      assert.equal(Math.round(lectura!.sesion!.porcentaje), 14);
      assert.equal(lectura!.semana!.reiniciaMs, 1_791_187_200_000);
      const llamada = JSON.parse(readFileSync(programa + ".llamada", "utf8"));
      assert.deepEqual(llamada.args, [...ARGS_CONSULTA_PLAN]);
      assert.equal(llamada.clave, null);
      assert.equal(llamada.openclaw, null);
    } finally {
      if (antes.clave === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = antes.clave;
      if (antes.estado === undefined) delete process.env.OPENCLAW_STATE_DIR;
      else process.env.OPENCLAW_STATE_DIR = antes.estado;
    }
  });

  it("sin evento, con error o sin claude: null", async () => {
    assert.equal(await consultarPlan(falso("claude-sin-evento", '{"type":"result","subtype":"success"}\n')), null);
    assert.equal(await consultarPlan(falso("claude-falla", "", 1)), null);
    assert.equal(await consultarPlan(null), null);
  });

  it("es barata y no deja rastro: Haiku, sin herramientas, sin configuración del usuario y sin guardar la sesión", () => {
    for (const opcion of ["--tools", "--strict-mcp-config", "--setting-sources", "--no-session-persistence", "--disable-slash-commands"]) {
      assert.ok(ARGS_CONSULTA_PLAN.includes(opcion), opcion);
    }
    assert.equal(ARGS_CONSULTA_PLAN[ARGS_CONSULTA_PLAN.indexOf("--model") + 1], "haiku");
    assert.equal(ARGS_CONSULTA_PLAN[ARGS_CONSULTA_PLAN.indexOf("--setting-sources") + 1], "");
  });

  it("busca claude en el PATH y limpia el entorno", () => {
    const bin = join(carpeta, "bin");
    rmSync(bin, { recursive: true, force: true });
    mkdirSync(bin);
    writeFileSync(join(bin, "claude"), "");
    assert.equal(buscarClaude({ PATH: bin }), join(bin, "claude"));
    const limpio = entornoConsulta({ PATH: "/usr/bin", ANTHROPIC_API_KEY: "x", OPENCLAW_PROFILE: "y", HOME: "/h" });
    assert.equal(limpio.ANTHROPIC_API_KEY, undefined);
    assert.equal(limpio.OPENCLAW_PROFILE, undefined);
    assert.equal(limpio.HOME, "/h");
    assert.ok(limpio.PATH!.split(delimiter).includes("/usr/bin"));
  });
});
