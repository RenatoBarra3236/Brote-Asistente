import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { lineaBrote, resumirPlan } from "../src/statusline.ts";
import { esStatuslineDeBrote, instalarStatusline, quitarStatusline, statuslineInstalada } from "../src/statusline-claude.ts";
import { MARCA, agregarHooks, escribirSettings, leerSettings } from "../src/hooks-claude.ts";
import { guardarConexion, iniciarServidorHooks } from "../src/servidor-hooks.ts";

const STATUSLINE = fileURLToPath(new URL("../src/statusline.ts", import.meta.url));
const CONFIGURAR = fileURLToPath(new URL("../src/configurar.ts", import.meta.url));
const EJEMPLO = JSON.parse(readFileSync(fileURLToPath(new URL("../../motor/pruebas/datos/statusline.json", import.meta.url)), "utf8"));
const COMANDO = `"/usr/local/bin/node" "/Users/ana/.asistente-prototipo/app/statusline.mjs" ${MARCA}`;

const temporales: string[] = [];
after(() => temporales.forEach((d) => rmSync(d, { recursive: true, force: true })));
function carpeta(): string {
  const d = mkdtempSync(join(tmpdir(), "brote-statusline-"));
  temporales.push(d);
  return d;
}

/** Corre la statusline como Claude Code: el JSON por la entrada estándar. */
function correr(home: string, entrada: string): Promise<{ codigo: number | null; salida: string; ms: number }> {
  return new Promise((listo) => {
    const inicio = Date.now();
    const { OPENCLAW_PROFILE: _p, ...limpio } = process.env;
    const hijo = spawn(process.execPath, [STATUSLINE, MARCA], { env: { ...limpio, HOME: home, USERPROFILE: home } });
    let salida = "";
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.on("close", (codigo) => listo({ codigo, salida, ms: Date.now() - inicio }));
    hijo.stdin.end(entrada);
  });
}

describe("statusline de Brote", () => {
  it("al puente solo le manda rate_limits y el id del modelo", () => {
    const plan = resumirPlan(EJEMPLO)!;
    assert.deepEqual(plan, {
      rate_limits: { five_hour: { used_percentage: 23.2, resets_at: 1_790_000_000 }, seven_day: { used_percentage: 41, resets_at: 1_790_400_000 } },
      modelo: "claude-sonnet-5",
    });
    assert.equal(JSON.stringify(plan).includes("/Users/ana"), false, "nada de la carpeta ni la transcripción");
    assert.equal(JSON.stringify(plan).includes("0.42"), false, "ni el costo");
    // Antes de la primera respuesta (o en planes sin límites) no hay nada que mandar; cada ventana puede faltar.
    assert.equal(resumirPlan({ ...EJEMPLO, rate_limits: undefined }), null);
    assert.deepEqual(Object.keys(resumirPlan({ rate_limits: { seven_day: EJEMPLO.rate_limits.seven_day } })!.rate_limits), ["seven_day"]);
    assert.equal(resumirPlan({ rate_limits: { five_hour: { used_percentage: "23", resets_at: 1 } } }), null);
  });

  it("arma una línea corta y útil con lo que haya", () => {
    assert.equal(lineaBrote(EJEMPLO), "🌱 5 h 23 % · semana 41 % · contexto 12 %");
    assert.equal(lineaBrote({ ...EJEMPLO, rate_limits: undefined }), "🌱 Sonnet 5 · contexto 12 %");
    assert.equal(lineaBrote(null), "🌱 Brote");
  });

  it("con Brote cerrado igual imprime su línea, rápido y con código 0", async () => {
    const r = await correr(carpeta(), JSON.stringify(EJEMPLO));
    assert.deepEqual([r.codigo, r.salida], [0, "🌱 5 h 23 % · semana 41 % · contexto 12 %\n"]);
    assert.ok(r.ms < 1500, `tardó ${r.ms} ms`);
    const basura = await correr(carpeta(), "esto no es JSON");
    assert.deepEqual([basura.codigo, basura.salida], [0, "🌱 Brote\n"]);
  });

  it("le entrega el plan al puente (POST /plan con el token), que no espera nada más", async () => {
    const home = carpeta();
    const recibidos: unknown[] = [];
    const { servidor, puerto, token } = await iniciarServidorHooks({ alEvento: () => ({}), sesiones: () => [], alPlan: (d) => recibidos.push(d) });
    try {
      guardarConexion(puerto, token, join(home, ".asistente-prototipo", "hooks.json"));
      const r = await correr(home, JSON.stringify(EJEMPLO));
      assert.equal(r.codigo, 0);
      assert.deepEqual(recibidos, [resumirPlan(EJEMPLO)]);
      // Sin token, nada.
      const sinToken = await fetch(`http://127.0.0.1:${puerto}/plan`, { method: "POST", body: "{}" });
      assert.equal(sinToken.status, 401);
      assert.equal(recibidos.length, 1);
    } finally {
      servidor.close();
    }
  });

  it("envuelve la statusline que ya tenía el usuario: la corre con la misma entrada y muestra su salida", async () => {
    const home = carpeta();
    const copia = join(home, "entrada-recibida.json");
    const original = { type: "command", command: `cat > "${copia}"; echo "mi línea propia"`, padding: 2 };
    mkdirSync(join(home, ".asistente-prototipo"), { recursive: true });
    writeFileSync(join(home, ".asistente-prototipo", "statusline-original.json"), JSON.stringify({ statusLine: original }));
    const entrada = JSON.stringify(EJEMPLO);
    const r = await correr(home, entrada);
    assert.deepEqual([r.codigo, r.salida], [0, "mi línea propia\n"]);
    assert.equal(readFileSync(copia, "utf8"), entrada);
    // Si la original falla o no imprime nada, queda la de Brote.
    writeFileSync(join(home, ".asistente-prototipo", "statusline-original.json"), JSON.stringify({ statusLine: { type: "command", command: "exit 3" } }));
    assert.equal((await correr(home, entrada)).salida, "🌱 5 h 23 % · semana 41 % · contexto 12 %\n");
    // Nunca se envuelve a sí misma.
    writeFileSync(join(home, ".asistente-prototipo", "statusline-original.json"), JSON.stringify({ statusLine: { type: "command", command: `node "${STATUSLINE}" ${MARCA}` } }));
    assert.equal((await correr(home, entrada)).salida, "🌱 5 h 23 % · semana 41 % · contexto 12 %\n");
  });
});

describe("instalar la statusline en Claude Code", () => {
  it("sin statusline previa: la agrega y al quitarla queda todo como estaba", () => {
    const config = { model: "sonnet", hooks: { Stop: [{ hooks: [{ type: "command", command: "say listo" }] }] } };
    const { config: nueva, original } = instalarStatusline(config, COMANDO);
    assert.equal(original, null);
    assert.deepEqual(nueva.statusLine, { padding: 0, type: "command", command: COMANDO });
    assert.equal(statuslineInstalada(nueva), true);
    assert.equal(JSON.stringify(quitarStatusline(nueva, original)), JSON.stringify(config));
  });

  it("con una statusline ajena: no la pisa, la guarda y al desinstalar vuelve exactamente igual", () => {
    const ajena = { type: "command", command: "~/.claude/mi-linea.sh", padding: 1, refreshInterval: 5 };
    const config = { model: "sonnet", statusLine: ajena, permissions: { allow: ["Bash(ls)"] } };
    const { config: nueva, original } = instalarStatusline(config, COMANDO);
    assert.deepEqual(original, ajena);
    // Hereda padding y refreshInterval, y queda en el mismo lugar del archivo.
    assert.deepEqual(nueva.statusLine, { ...ajena, command: COMANDO });
    assert.deepEqual(Object.keys(nueva), ["model", "statusLine", "permissions"]);
    // Instalar de nuevo no se envuelve a sí misma: conserva la original guardada.
    const otra = instalarStatusline(nueva, COMANDO, original);
    assert.deepEqual(otra.original, ajena);
    assert.equal(JSON.stringify(quitarStatusline(otra.config, otra.original)), JSON.stringify(config));
    // Si el usuario cambió la statusline después, desinstalar no la toca.
    const cambiada = { ...nueva, statusLine: { type: "command", command: "otra.sh" } };
    assert.deepEqual(quitarStatusline(cambiada, original), cambiada);
    assert.equal(esStatuslineDeBrote({ command: "otra.sh --brote" }), false);
  });

  it("de punta a punta con Configurar Brote: respaldo, 600, convive con los hooks y se desinstala", () => {
    const home = carpeta();
    const claude = join(home, "config-claude");
    const ajena = { type: "command", command: "~/.claude/mi-linea.sh", padding: 1 };
    const antes = agregarHooks({ model: "sonnet", statusLine: ajena }, `"/x/node" "/x/hook.mjs" ${MARCA}`);
    escribirSettings(antes, join(claude, "settings.json"));
    const texto = readFileSync(join(claude, "settings.json"), "utf8");
    const { OPENCLAW_PROFILE: _p, ...limpio } = process.env;
    const env = { ...limpio, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: claude };
    const aplicar = (paso: string) => JSON.parse(spawnSync(process.execPath, [CONFIGURAR, "aplicar", paso], { env, encoding: "utf8" }).stdout);

    const instalada = aplicar("statusline");
    assert.equal(instalada.ok, true, instalada.detalle);
    assert.match(instalada.detalle, /Tu statusline anterior se sigue mostrando igual/);
    const despues = leerSettings(join(claude, "settings.json"));
    assert.equal(statuslineInstalada(despues), true);
    assert.match(despues.statusLine.command, /statusline\.ts" --brote$/);
    assert.deepEqual(despues.hooks, antes.hooks, "los hooks quedan igual");
    const guardada = join(home, ".asistente-prototipo", "statusline-original.json");
    assert.deepEqual(JSON.parse(readFileSync(guardada, "utf8")).statusLine, ajena);
    assert.equal((statSync(guardada).mode & 0o777).toString(8), "600");

    const quitada = aplicar("statusline-quitar");
    assert.equal(quitada.ok, true, quitada.detalle);
    assert.equal(readFileSync(join(claude, "settings.json"), "utf8"), texto, "exactamente como estaba");
    assert.throws(() => statSync(guardada));
    assert.match(aplicar("statusline-quitar").detalle, /no estaba instalada/);

    // Un settings.json roto no se toca.
    writeFileSync(join(claude, "settings.json"), "{ roto");
    assert.equal(aplicar("statusline").ok, false);
    assert.equal(readFileSync(join(claude, "settings.json"), "utf8"), "{ roto");
  });
});
