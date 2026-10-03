// "Configurar Brote" → Conectores, de punta a punta con un `openclaw` falso que imprime lo mismo que
// OpenClaw 2026.9.7 en el Mac del usuario (sin OpenClaw ni cuentas reales).

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../src/configurar.ts", import.meta.url));

// El falso guarda cada llamada en `llamadas.log` y la configuración en openclaw.json, como el real.
const FALSO = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const dir = process.env.OPENCLAW_STATE_DIR;
const config = path.join(dir, "openclaw.json");
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "llamadas.log"), JSON.stringify(args) + "\\n");
const leer = () => { try { return JSON.parse(fs.readFileSync(config, "utf8")); } catch { return {}; } };
const guardar = (c) => fs.writeFileSync(config, JSON.stringify(c));
const [grupo, orden, nombre] = args;
if (grupo !== "mcp") process.exit(1);
if (orden === "add") {
  const c = leer();
  c.mcp = c.mcp || { servers: {} };
  const i = args.indexOf("--url");
  c.mcp.servers[nombre] = { url: args[i + 1], transport: "streamable-http", auth: args.includes("--auth") ? "oauth" : undefined };
  if (args.includes("--header")) c.mcp.servers[nombre].headers = { Authorization: args[args.indexOf("--header") + 1].split("=")[1] };
  guardar(c);
  console.log('Saved MCP server "' + nombre + '" to ' + config + ".");
  if (args.includes("--auth")) console.log("Run openclaw mcp login " + nombre + " to authorize this MCP server.");
} else if (orden === "login") {
  console.log('Open this URL to authorize "' + nombre + '":');
  console.log("https://todoist.com/oauth/authorize?response_type=code&client_id=abc&code_challenge=x&code_challenge_method=S256&redirect_uri=http%3A%2F%2F127.0.0.1%3A8989%2Foauth%2Fcallback&state=s&scope=data%3Aread_write&resource=https%3A%2F%2Fai.todoist.net%2Fmcp");
  console.log("Waiting for the browser to return to OpenClaw...");
  console.log("If the callback cannot reach this terminal, run openclaw mcp login " + nombre + " --code <code>.");
  if (process.env.FALSO_LENTO) setInterval(() => {}, 1000);
  else setTimeout(() => { fs.writeFileSync(path.join(dir, "sesion-" + nombre), "1"); console.log('MCP OAuth credentials saved for "' + nombre + '".'); }, 200);
} else if (orden === "probe") {
  const servidores = leer().mcp?.servers ?? {};
  const servers = {};
  for (const [n, s] of Object.entries(servidores)) {
    const listo = fs.existsSync(path.join(dir, "sesion-" + n)) || (s.headers && s.headers.Authorization.includes("bueno"));
    servers[n] = { launch: { transport: "streamable-http" }, tools: listo ? 47 : 0 };
  }
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), servers, tools: [], diagnostics: [] }));
} else if (orden === "unset") {
  const c = leer();
  delete c.mcp.servers[nombre];
  guardar(c);
} else if (orden === "logout") {
  fs.rmSync(path.join(dir, "sesion-" + nombre), { force: true });
} else if (orden !== "reload") process.exit(1);
`;

function preparar(): { raiz: string; estado: string; entorno: NodeJS.ProcessEnv } {
  const raiz = mkdtempSync(join(tmpdir(), "conectores-cfg-"));
  const bin = join(raiz, "bin");
  const estado = join(raiz, "openclaw");
  mkdirSync(bin);
  mkdirSync(estado);
  writeFileSync(join(bin, "openclaw"), FALSO);
  chmodSync(join(bin, "openclaw"), 0o755);
  const { OPENCLAW_PROFILE: _p, ...resto } = process.env;
  return {
    raiz,
    estado,
    entorno: { ...resto, HOME: raiz, OPENCLAW_STATE_DIR: estado, PATH: `${bin}:${process.env.PATH}`, ASISTENTE_CONECTORES: join(raiz, "conectores.json") },
  };
}

/** Corre el script y junta cada línea JSON; `alLeer` puede escribir en su entrada. */
function correr(args: string[], entorno: NodeJS.ProcessEnv, alLeer?: (fase: any, entrada: NodeJS.WritableStream) => void, entradaInicial?: string): Promise<any[]> {
  return new Promise((listo, fallo) => {
    const hijo = spawn(process.execPath, [SCRIPT, ...args], { env: entorno, stdio: ["pipe", "pipe", "inherit"] });
    if (entradaInicial) hijo.stdin.write(entradaInicial);
    const lineas: any[] = [];
    let resto = "";
    hijo.stdout.on("data", (trozo) => {
      resto += trozo;
      const partes = resto.split("\n");
      resto = partes.pop()!;
      for (const parte of partes.filter(Boolean)) {
        const fase = JSON.parse(parte);
        lineas.push(fase);
        alLeer?.(fase, hijo.stdin);
      }
    });
    const plazo = setTimeout(() => {
      hijo.kill();
      fallo(new Error(`no terminó: ${JSON.stringify(lineas)}`));
    }, 20_000);
    hijo.on("close", () => {
      clearTimeout(plazo);
      listo(lineas);
    });
  });
}

const llamadas = (estado: string) => readFileSync(join(estado, "llamadas.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

// Con Node 24 (import.meta.main), como pide Brote; en Windows el falso no es ejecutable.
describe("Configurar Brote → Conectores", { skip: process.platform === "win32" || Number(process.versions.node.split(".")[0]) < 24 }, () => {
  it("conectar Todoist: add, login con la URL de autorización, reload y conectores.json", async () => {
    const { raiz, estado, entorno } = preparar();
    const fases = await correr(["conectar", "todoist"], entorno);
    assert.deepEqual(fases.map((f) => f.fase), ["agregando", "autorizar", "esperando", "listo"]);
    assert.match(fases[1].url, /^https:\/\/todoist\.com\/oauth\/authorize\?/);
    assert.match(fases[3].detalle, /Todoist quedó conectado \(47 herramientas\)\. El agente lo usará desde su próximo mensaje\./);
    const hechas = llamadas(estado);
    assert.deepEqual(hechas[0], ["mcp", "add", "todoist", "--url", "https://ai.todoist.net/mcp", "--auth", "oauth", "--transport", "streamable-http"]);
    assert.deepEqual(hechas[1], ["mcp", "login", "todoist"]);
    assert.ok(hechas.some((l) => l.join(" ") === "mcp reload"));
    assert.deepEqual(JSON.parse(readFileSync(join(raiz, "conectores.json"), "utf8")), { conectados: ["todoist"] });
    assert.equal(statSync(join(raiz, "conectores.json")).mode & 0o777, 0o600);

    // El estado y desconectar.
    const [estadoJson] = await correr(["conectores"], entorno);
    assert.equal(estadoJson.catalogo.find((c: any) => c.id === "todoist").estado, "conectado");
    const [desconectado] = await correr(["desconectar", "todoist"], entorno);
    assert.deepEqual(desconectado, { ok: true, detalle: "Todoist quedó desconectado." });
    assert.ok(llamadas(estado).some((l) => l.join(" ") === "mcp logout todoist"));
    assert.ok(llamadas(estado).some((l) => l.join(" ") === "mcp unset todoist"));
    assert.deepEqual(JSON.parse(readFileSync(join(raiz, "conectores.json"), "utf8")), { conectados: [] });
  });

  it("cancelar mata el inicio de sesión que espera al navegador", async () => {
    const { estado, entorno } = preparar();
    const fases = await correr(["conectar", "notion"], { ...entorno, FALSO_LENTO: "1" }, (fase, entrada) => {
      if (fase.fase === "esperando") entrada.write("cancelar\n");
    });
    assert.deepEqual(fases.map((f) => f.fase), ["agregando", "autorizar", "esperando", "cancelado"]);
    assert.ok(llamadas(estado).every((l) => l[1] !== "reload"));
  });

  it("GitHub con token: va por la entrada y no aparece en ninguna fase", async () => {
    const { estado, entorno } = preparar();
    const token = `github_pat_bueno${"Z".repeat(30)}`;
    const fases = await correr(["conectar-token", "github"], entorno, undefined, `${token}\n`);
    assert.deepEqual(fases.map((f) => f.fase), ["agregando", "listo"]);
    assert.ok(!JSON.stringify(fases).includes(token));
    const add = llamadas(estado)[0];
    assert.deepEqual(add.slice(-2), ["--header", `Authorization=Bearer ${token}`]);

    const malo = `github_pat_vencido${"Z".repeat(30)}`;
    const fallidas = await correr(["conectar-token", "github"], entorno, undefined, `${malo}\n`);
    assert.equal(fallidas.at(-1).fase, "error");
    assert.ok(!JSON.stringify(fallidas).includes(malo));
  });

  it("conector propio: valida nombre y URL antes de tocar OpenClaw", async () => {
    const { estado, entorno } = preparar();
    for (const [nombre, url, motivo] of [
      ["gastos", "https://x.cl/mcp", /ya lo usa Brote/],
      ["todoist", "https://x.cl/mcp", /ya lo usa Brote/],
      ["Mal Nombre", "https://x.cl/mcp", /minúsculas/],
      ["mi-wiki", "http://x.cl/mcp", /https/],
    ] as const) {
      const fases = await correr(["conectar-propio", nombre, url], entorno);
      assert.equal(fases.at(-1).fase, "error");
      assert.match(fases.at(-1).detalle, motivo);
    }
    assert.equal(existsSync(join(estado, "llamadas.log")), false);
    const fases = await correr(["conectar-propio", "mi-wiki", "https://wiki.ejemplo.cl/mcp"], entorno);
    assert.equal(fases.at(-1).fase, "listo");
    // Nunca queda en conectores.json: siempre pregunta.
    const [estadoJson] = await correr(["conectores"], entorno);
    assert.deepEqual(estadoJson.propios.map((p: any) => p.id), ["mi-wiki"]);
  });
});
