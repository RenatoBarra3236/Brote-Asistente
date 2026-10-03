import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { esDeOpenClaw, esInteractiva, resumir, salidaPermiso } from "../src/hook.ts";
import { MARCA, agregarHooks, comandoHook, escribirSettings, hooksInstalados, leerSettings, quitarHooks } from "../src/hooks-claude.ts";
import { guardarConexion, iniciarServidorHooks } from "../src/servidor-hooks.ts";
import { pedirAlPuente } from "@asistente/motor";

const HOOK = fileURLToPath(new URL("../src/hook.ts", import.meta.url));
const temporales: string[] = [];
after(() => temporales.forEach((d) => rmSync(d, { recursive: true, force: true })));
function carpeta(): string {
  const d = mkdtempSync(join(tmpdir(), "brote-hooks-"));
  temporales.push(d);
  return d;
}

/** Corre el hook como lo haría Claude Code: el evento por la entrada estándar. */
function correrHook(home: string, evento: object, entorno: Record<string, string> = {}): Promise<{ codigo: number | null; salida: string; ms: number }> {
  return new Promise((listo) => {
    const inicio = Date.now();
    const { OPENCLAW_PROFILE: _p, ...limpio } = process.env;
    const hijo = spawn(process.execPath, [HOOK, MARCA], { env: { ...limpio, HOME: home, USERPROFILE: home, ...entorno } });
    let salida = "";
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.on("close", (codigo) => listo({ codigo, salida, ms: Date.now() - inicio }));
    hijo.stdin.end(JSON.stringify(evento));
  });
}

const PRE_TOOL = {
  session_id: "abc",
  transcript_path: "/Users/ana/.claude/projects/x/abc.jsonl",
  cwd: "/Users/ana/proyectos/tarea",
  hook_event_name: "PreToolUse",
  tool_name: "Edit",
  tool_input: { file_path: "/Users/ana/proyectos/tarea/src/lib.rs", old_string: "secreto", new_string: "otro" },
  tool_use_id: "toolu_1",
};

describe("hook de Claude Code", () => {
  it("resume solo lo necesario (nada del contenido de los archivos ni de los mensajes)", () => {
    const r = resumir(PRE_TOOL)!;
    assert.equal(r.evento, "PreToolUse");
    assert.deepEqual(r.entrada, { archivo: "/Users/ana/proyectos/tarea/src/lib.rs", comando: undefined, patron: undefined, descripcion: undefined, url: undefined });
    assert.equal(JSON.stringify(r).includes("secreto"), false);
    const prompt = resumir({ ...PRE_TOOL, hook_event_name: "UserPromptSubmit", tool_name: undefined, prompt: "mi clave es 1234" })!;
    assert.equal(JSON.stringify(prompt).includes("1234"), false);
    assert.equal(resumir({ nada: 1 }), null);
  });

  it("reconoce las sesiones de OpenClaw y arma la salida del permiso", () => {
    assert.equal(esDeOpenClaw({ OPENCLAW_GATEWAY_TOKEN: "x" }), true);
    assert.equal(esDeOpenClaw({ HOME: "/x" }), false);
    assert.equal(esInteractiva({ CLAUDE_CODE_ENTRYPOINT: "cli" }), true);
    assert.equal(esInteractiva({}), true);
    assert.equal(esInteractiva({ CLAUDE_CODE_ENTRYPOINT: "sdk-cli" }), false);
    assert.deepEqual(JSON.parse(salidaPermiso('{"decision":"allow"}')!), {
      hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } },
    });
    assert.equal(salidaPermiso("{}"), null);
    assert.equal(salidaPermiso('{"decision":"rm -rf"}'), null);
  });

  it("sin Brote abierto sale al tiro, con código 0 y sin imprimir nada", async () => {
    const r = await correrHook(carpeta(), PRE_TOOL);
    assert.deepEqual([r.codigo, r.salida], [0, ""]);
    assert.ok(r.ms < 1000, `tardó ${r.ms} ms`);
  });

  it("entrega el evento al puente con el token y nunca rompe con basura", async () => {
    const home = carpeta();
    const recibidos: any[] = [];
    const { servidor, puerto, token } = await iniciarServidorHooks({ alEvento: (d) => (recibidos.push(d), {}), sesiones: () => [] });
    try {
      guardarConexion(puerto, token, join(home, ".asistente-prototipo", "hooks.json"));
      // En Windows los permisos no son bits de modo: allí protege la carpeta del usuario.
      if (process.platform !== "win32") assert.equal(statSync(join(home, ".asistente-prototipo", "hooks.json")).mode & 0o777, 0o600);
      const r = await correrHook(home, PRE_TOOL);
      assert.deepEqual([r.codigo, r.salida], [0, ""]);
      assert.ok(r.ms < 1000, `tardó ${r.ms} ms`);
      assert.equal(recibidos[0].herramienta, "Edit");
      // Las de OpenClaw ni siquiera se envían.
      await correrHook(home, PRE_TOOL, { OPENCLAW_STATE_DIR: "/x" });
      assert.equal(recibidos.length, 1);
      // Basura por la entrada: sale igual con 0.
      assert.equal((await correrHook(home, { hola: "mundo" })).codigo, 0);
      // Sin token o con otro, el servidor no acepta nada.
      const sinToken = await fetch(`http://127.0.0.1:${puerto}/evento`, { method: "POST", body: "{}" });
      assert.equal(sinToken.status, 401);
      const otro = await fetch(`http://127.0.0.1:${puerto}/sesiones`, { headers: { authorization: "Bearer otro" } });
      assert.equal(otro.status, 401);
      const bien = await fetch(`http://127.0.0.1:${puerto}/sesiones`, { headers: { authorization: `Bearer ${token}` } });
      assert.deepEqual(await bien.json(), { sesiones: [] });
    } finally {
      servidor.close();
    }
  });

  it("responde las consultas del servidor MCP (música y calendario) solo con el token", async () => {
    const home = carpeta();
    const conexion = join(home, ".asistente-prototipo", "hooks.json");
    const { servidor, puerto, token } = await iniciarServidorHooks({
      alEvento: () => ({}),
      sesiones: () => [],
      consultar: (d: any) => {
        if (d?.tipo !== "musica-estado") throw new Error("consulta desconocida");
        return { musica: { app: "Spotify", sonando: true, cancion: "Canción", artista: "Artista" } };
      },
    });
    try {
      guardarConexion(puerto, token, conexion);
      assert.equal((await pedirAlPuente("/consulta", { tipo: "musica-estado" }, { conexion })).musica.cancion, "Canción");
      assert.equal(await pedirAlPuente("/consulta", { tipo: "borrar-todo" }, { conexion }), null);
      const sinToken = await fetch(`http://127.0.0.1:${puerto}/consulta`, { method: "POST", body: JSON.stringify({ tipo: "musica-estado" }) });
      assert.equal(sinToken.status, 401);
      // Sin Brote abierto (no hay archivo de conexión), `null` al tiro.
      assert.equal(await pedirAlPuente("/consulta", { tipo: "musica-estado" }, { conexion: join(home, "no-existe.json") }), null);
    } finally {
      servidor.close();
    }
  });

  it("un permiso respondido en la isla vuelve a Claude Code; sin respuesta, nada", async () => {
    const home = carpeta();
    let decision: object = { decision: "deny" };
    const { servidor, puerto, token } = await iniciarServidorHooks({
      alEvento: async (d: any) => (d.evento === "PermissionRequest" ? (await new Promise((r) => setTimeout(r, 1200)), decision) : {}),
      sesiones: () => [],
    });
    try {
      guardarConexion(puerto, token, join(home, ".asistente-prototipo", "hooks.json"));
      const permiso = { ...PRE_TOOL, hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "cargo test" } };
      const r = await correrHook(home, permiso);
      assert.equal(r.codigo, 0);
      assert.deepEqual(JSON.parse(r.salida).hookSpecificOutput.decision, { behavior: "deny" });
      decision = {};
      assert.deepEqual((await correrHook(home, permiso)).salida, "");
      // En `claude -p` no se espera a la isla: sale al tiro sin decidir.
      decision = { decision: "allow" };
      const noInteractiva = await correrHook(home, permiso, { CLAUDE_CODE_ENTRYPOINT: "sdk-cli" });
      assert.deepEqual([noInteractiva.codigo, noInteractiva.salida], [0, ""]);
      assert.ok(noInteractiva.ms < 1000, `tardó ${noInteractiva.ms} ms`);
    } finally {
      servidor.close();
    }
  });
});

describe("instalar los hooks en la configuración de Claude Code", () => {
  const comando = comandoHook("/usr/local/bin/node", "/Users/ana/.asistente-prototipo/app/hook.mjs", "darwin");
  const DEL_USUARIO = {
    model: "sonnet",
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "~/bin/revisar.sh" }] }],
      Stop: [{ hooks: [{ type: "command", command: "say listo" }] }],
    },
  };

  it("agrega los de Brote sin tocar los del usuario, y es idempotente", () => {
    const instalado = agregarHooks(DEL_USUARIO, comando);
    assert.equal(hooksInstalados(DEL_USUARIO), false);
    assert.equal(hooksInstalados(instalado), true);
    assert.deepEqual(instalado.hooks.PreToolUse[0], DEL_USUARIO.hooks.PreToolUse[0]);
    assert.equal(instalado.hooks.PreToolUse.length, 2);
    assert.equal(instalado.model, "sonnet");
    assert.deepEqual(instalado.hooks.Stop[1].hooks[0], { type: "command", command: comando, timeout: 5, async: true });
    assert.deepEqual(instalado.hooks.PermissionRequest[0].hooks[0], { type: "command", command: comando, timeout: 60 });
    assert.deepEqual(agregarHooks(instalado, comando), instalado);
  });

  it("desinstalar deja exactamente lo que había", () => {
    assert.deepEqual(quitarHooks(agregarHooks(DEL_USUARIO, comando)), DEL_USUARIO);
    assert.deepEqual(quitarHooks(agregarHooks({}, comando)), {});
  });

  it("no acepta rutas que una shell podría interpretar", () => {
    assert.equal(comando, `"/usr/local/bin/node" "/Users/ana/.asistente-prototipo/app/hook.mjs" --brote`);
    assert.throws(() => comandoHook("/a/$(rm -rf ~)/node", "/x/hook.mjs", "darwin"));
    assert.throws(() => comandoHook("/a/node", '/x/"hook.mjs', "darwin"));
    assert.doesNotThrow(() => comandoHook("C:\\Program Files\\nodejs\\node.exe", "C:\\Users\\ana\\.asistente-prototipo\\app\\hook.mjs", "win32"));
    assert.throws(() => comandoHook("C:\\%PATH%\\node.exe", "C:\\x\\hook.mjs", "win32"));
  });

  it("respalda antes de escribir, conserva los permisos y no toca un archivo roto", () => {
    const dir = carpeta();
    const ruta = join(dir, "settings.json");
    writeFileSync(ruta, JSON.stringify(DEL_USUARIO), { mode: 0o644 });
    const respaldo = escribirSettings(agregarHooks(leerSettings(ruta), comando), ruta, new Date(2026, 9, 3));
    assert.deepEqual(JSON.parse(readFileSync(respaldo!, "utf8")), DEL_USUARIO);
    if (process.platform !== "win32") assert.equal(statSync(ruta).mode & 0o777, 0o644);
    assert.equal(hooksInstalados(leerSettings(ruta)), true);
    writeFileSync(ruta, "{ esto no es json");
    assert.throws(() => leerSettings(ruta), /no es JSON válido/);
    assert.deepEqual(leerSettings(join(dir, "no-existe.json")), {});
  });
});
