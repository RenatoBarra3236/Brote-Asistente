import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CATALOGO,
  argsAgregarConToken,
  argsAgregarOauth,
  autorizacionPermitida,
  autorizacionPropiaPermitida,
  conectorDe,
  estadoConectores,
  guardadoAlAgregar,
  guardarConectados,
  herramientasPorServidor,
  leerConectados,
  leerLineaLogin,
  nombreBonito,
  ocultarSecretos,
  permitidaSinPreguntar,
  validarNombre,
  validarToken,
  validarUrlServidor,
} from "../src/conectores.ts";

// Salida real de OpenClaw 2026.9.7 en el Mac del usuario (rutas y códigos anonimizados).
const SALIDA_ADD = 'Saved MCP server "todoist" to /Users/alguien/.openclaw/openclaw.json.\nRun openclaw mcp login todoist to authorize this MCP server.\n';
const URL_AUTORIZACION =
  "https://todoist.com/oauth/authorize?response_type=code&client_id=abc123&code_challenge=XYZ&code_challenge_method=S256&redirect_uri=http%3A%2F%2F127.0.0.1%3A8989%2Foauth%2Fcallback&state=s123&scope=data%3Aread_write&resource=https%3A%2F%2Fai.todoist.net%2Fmcp";
const SALIDA_LOGIN = [
  'Open this URL to authorize "todoist":',
  URL_AUTORIZACION,
  "Waiting for the browser to return to OpenClaw...",
  "If the callback cannot reach this terminal, run openclaw mcp login todoist --code <code>.",
  'MCP OAuth credentials saved for "todoist".',
];
const PROBE = JSON.stringify({
  generatedAt: "2026-10-02T14:00:00.000Z",
  servers: { todoist: { launch: { transport: "streamable-http" }, tools: 47 }, gastos: { launch: { command: "node" }, tools: 15 } },
  tools: ["todoist__add-comments", "todoist__find-tasks", "gastos__gastos_anotar"],
  diagnostics: [],
});
const CONFIG = {
  mcp: {
    servers: {
      gastos: { command: "node", args: ["/x/mcp.ts"] },
      todoist: { url: "https://ai.todoist.net/mcp", transport: "streamable-http", auth: "oauth" },
      "mi-wiki": { url: "https://wiki.ejemplo.cl/mcp", transport: "streamable-http", auth: "oauth" },
    },
  },
};

// Las 52 herramientas de Todoist que listó OpenClaw (probe) en el Mac del usuario.
const TODOIST = (
  "add-comments add-filters add-labels add-projects add-reminders add-sections add-tasks analyze-project-health complete-tasks " +
  "delete-object export-project-template fetch fetch-object find-activity find-comments find-completed-tasks find-filters " +
  "find-labels find-project-collaborators find-projects find-reminders find-sections find-tasks find-tasks-by-date get-overview " +
  "get-productivity-stats get-project-activity-stats get-project-health get-workspace-insights import-project-template " +
  "list-workspaces manage-assignments project-management project-move prompts_get prompts_list reorder-objects reschedule-tasks " +
  "resources_list resources_read search uncomplete-tasks update-comments update-filters update-labels update-projects " +
  "update-reminders update-sections update-tasks user-info view-attachment"
).split(" ");

describe("catálogo", () => {
  it("cada conector tiene lo necesario y listas sin comodines", () => {
    for (const c of CATALOGO) {
      assert.match(c.id, /^[a-z0-9-]+$/);
      assert.ok(c.url.startsWith("https://"), c.id);
      assert.equal(c.auth === "oauth", c.hostsAutorizacion.length > 0, c.id);
      assert.equal(new Set(c.soloLectura).size, c.soloLectura.length, `${c.id}: repetidas`);
      for (const h of c.soloLectura) assert.doesNotMatch(h, /[*?]/, `${c.id}: ${h}`);
    }
    assert.equal(conectorDe("todoist")?.probado, true);
    for (const id of ["notion", "github", "canva"]) assert.equal(conectorDe(id)?.probado, false, id);
  });

  it("Todoist: solo lectura son exactamente find-*, get-*, fetch, search… y ninguna de escritura", () => {
    const todoist = conectorDe("todoist")!;
    for (const h of todoist.soloLectura) assert.ok(TODOIST.includes(h), `${h} no existe en Todoist`);
    const esperadas = TODOIST.filter(
      (h) =>
        /^(find|get)-/.test(h) ||
        ["fetch", "fetch-object", "search", "list-workspaces", "user-info", "view-attachment", "resources_list", "resources_read", "prompts_list", "prompts_get"].includes(h),
    );
    assert.deepEqual([...todoist.soloLectura].sort(), esperadas.sort());
    for (const escritura of ["add-tasks", "delete-object", "complete-tasks", "update-tasks", "project-move", "import-project-template", "manage-assignments"]) {
      assert.ok(!todoist.soloLectura.includes(escritura), escritura);
    }
  });

  it("GitHub usa token (no hay registro dinámico) y nunca abre una página de autorización", () => {
    const github = conectorDe("github")!;
    assert.equal(github.auth, "token");
    assert.equal(autorizacionPermitida("https://github.com/login/oauth/authorize", github.hostsAutorizacion), false);
  });
});

describe("validación", () => {
  it("nombres de conectores propios", () => {
    assert.equal(validarNombre("mi-wiki"), null);
    assert.equal(validarNombre("a1"), null);
    for (const malo of ["", "a", "Mi", "con espacio", "-a", "a-", "a_b", "x".repeat(33), "ñandu", "../x"]) assert.notEqual(validarNombre(malo), null, malo);
    for (const reservado of ["gastos", "todoist", "notion", "github", "canva"]) assert.match(validarNombre(reservado)!, /ya lo usa Brote/);
    assert.match(validarNombre("mi-wiki", ["mi-wiki"])!, /Ya tienes/);
  });

  it("URL de servidor propio: solo https y sin trucos", () => {
    assert.equal(validarUrlServidor(" https://wiki.ejemplo.cl/mcp "), "https://wiki.ejemplo.cl/mcp");
    for (const mala of ["http://wiki.ejemplo.cl/mcp", "file:///etc/passwd", "https://", "wiki.ejemplo.cl", "https://user:clave@x.cl/mcp", "https://x.cl/a b", 'https://x.cl/"', "javascript:alert(1)"]) {
      assert.equal(validarUrlServidor(mala), null, mala);
    }
  });

  it("tokens", () => {
    assert.equal(validarToken(`github_pat_${"A".repeat(40)}`), true);
    for (const malo of ["corto", "con espacio aaaaaaaaaaaaaaaaaaaaaa", 'comilla"aaaaaaaaaaaaaaaaaaaaaa', "a".repeat(401), "salto\naaaaaaaaaaaaaaaaaaaaaaa"]) assert.equal(validarToken(malo), false);
  });

  it("la página de autorización solo se abre en los hosts de ese conector", () => {
    const todoist = conectorDe("todoist")!.hostsAutorizacion;
    assert.equal(autorizacionPermitida(URL_AUTORIZACION, todoist), true);
    assert.equal(autorizacionPermitida(URL_AUTORIZACION.replace("https:", "http:"), todoist), false);
    assert.equal(autorizacionPermitida("https://todoist.com.malo.cl/oauth", todoist), false);
    assert.equal(autorizacionPermitida("https://todoist.com@malo.cl/oauth", todoist), false);
    assert.equal(autorizacionPermitida("https://mcp.notion.com/authorize", todoist), false);
    assert.equal(autorizacionPermitida("https://mcp.notion.com/authorize", conectorDe("notion")!.hostsAutorizacion), true);
    assert.equal(autorizacionPermitida("no es url", todoist), false);
  });

  it("conector propio: autorización en su host o su dominio", () => {
    const servidor = "https://mcp.ejemplo.cl/mcp";
    assert.equal(autorizacionPropiaPermitida("https://mcp.ejemplo.cl/authorize", servidor), true);
    assert.equal(autorizacionPropiaPermitida("https://login.ejemplo.cl/oauth", servidor), true);
    assert.equal(autorizacionPropiaPermitida("https://ejemplo.cl.malo.com/oauth", servidor), false);
    assert.equal(autorizacionPropiaPermitida("http://login.ejemplo.cl/oauth", servidor), false);
  });
});

describe("comandos y salida de la CLI", () => {
  it("arma los comandos de OpenClaw", () => {
    assert.deepEqual(argsAgregarOauth("todoist", "https://ai.todoist.net/mcp"), [
      "mcp", "add", "todoist", "--url", "https://ai.todoist.net/mcp", "--auth", "oauth", "--transport", "streamable-http",
    ]);
    const token = `github_pat_${"B".repeat(40)}`;
    const args = argsAgregarConToken("github", "https://api.githubcopilot.com/mcp/", token);
    assert.deepEqual(args.slice(-2), ["--header", `Authorization=Bearer ${token}`]);
    assert.throws(() => argsAgregarConToken("github", "https://api.githubcopilot.com/mcp/", "mal token"));
  });

  it("lee la salida de add y de login", () => {
    assert.equal(guardadoAlAgregar(SALIDA_ADD, "todoist"), true);
    assert.equal(guardadoAlAgregar(SALIDA_ADD, "notion"), false);
    const lineas = SALIDA_LOGIN.map(leerLineaLogin);
    assert.deepEqual(lineas[1], { tipo: "autorizar", url: URL_AUTORIZACION });
    assert.equal(lineas[2].tipo, "esperando");
    assert.equal(lineas[3].tipo, "otra");
    assert.equal(lineas[4].tipo, "listo");
    assert.equal(leerLineaLogin("ver https://malo.cl").tipo, "otra");
  });

  it("lee probe --json", () => {
    const cuenta = herramientasPorServidor(PROBE)!;
    assert.equal(cuenta.get("todoist"), 47);
    assert.equal(cuenta.get("gastos"), 15);
    assert.equal(herramientasPorServidor("Error: no config"), null);
    assert.equal(herramientasPorServidor(`aviso\n${JSON.stringify({ servers: { x: {} }, tools: ["x__a", "x__b"] })}`)!.get("x"), 2);
  });

  it("estado de cada conector", () => {
    const { catalogo, propios } = estadoConectores(CONFIG, herramientasPorServidor(PROBE));
    const de = (id: string) => catalogo.find((c) => c.id === id)!;
    assert.equal(de("todoist").estado, "conectado");
    assert.equal(de("todoist").herramientas, 47);
    assert.equal(de("notion").estado, "desconectado");
    assert.deepEqual(propios, [{ id: "mi-wiki", url: "https://wiki.ejemplo.cl/mcp", estado: "sin-autorizar", herramientas: 0 }]);
    // Sin probe (o sin sesión): guardado pero sin herramientas.
    assert.equal(estadoConectores(CONFIG, null).catalogo.find((c) => c.id === "todoist")!.estado, "sin-autorizar");
    // Un "todoist" que apunta a otra parte no es el conector.
    const falso = { mcp: { servers: { todoist: { url: "https://malo.cl/mcp" } } } };
    assert.equal(estadoConectores(falso, herramientasPorServidor(PROBE)).catalogo.find((c) => c.id === "todoist")!.estado, "desconectado");
  });
});

describe("permisos sin preguntar", () => {
  const conectados = ["todoist"];

  it("permite solo la lista exacta de solo lectura de un conector conectado", () => {
    assert.equal(permitidaSinPreguntar("mcp__todoist__find-tasks-by-date", conectados, CONFIG), true);
    assert.equal(permitidaSinPreguntar("mcp__todoist__get-overview", conectados, CONFIG), true);
  });

  it("una herramienta de escritura NUNCA pasa sin preguntar", () => {
    for (const h of TODOIST.filter((h) => !conectorDe("todoist")!.soloLectura.includes(h))) {
      assert.equal(permitidaSinPreguntar(`mcp__todoist__${h}`, conectados, CONFIG), false, h);
    }
    for (const nombre of ["mcp__todoist__add-tasks", "mcp__todoist__delete-object", "mcp__todoist__find-tasks ", "mcp__todoist__FIND-TASKS", "mcp__todoist__find-tasks-x", "mcp__todoist__find-*"]) {
      assert.equal(permitidaSinPreguntar(nombre, conectados, CONFIG), false, nombre);
    }
  });

  it("nada pasa si el conector no está conectado, apunta a otra URL o es propio", () => {
    assert.equal(permitidaSinPreguntar("mcp__todoist__find-tasks", [], CONFIG), false);
    assert.equal(permitidaSinPreguntar("mcp__todoist__find-tasks", conectados, {}), false);
    assert.equal(permitidaSinPreguntar("mcp__todoist__find-tasks", conectados, { mcp: { servers: { todoist: { url: "https://malo.cl/mcp" } } } }), false);
    assert.equal(permitidaSinPreguntar("mcp__mi-wiki__search", ["mi-wiki"], CONFIG), false);
    assert.equal(permitidaSinPreguntar("mcp__notion__notion-search", conectados, CONFIG), false);
    assert.equal(permitidaSinPreguntar("Bash", conectados, CONFIG), false);
    assert.equal(permitidaSinPreguntar(undefined, conectados, CONFIG), false);
  });

  it("conectores.json con permisos 600 y solo ids del catálogo", () => {
    const ruta = join(mkdtempSync(join(tmpdir(), "conectores-")), "conectores.json");
    guardarConectados(["todoist", "mi-wiki", "github"], ruta);
    assert.deepEqual(leerConectados(ruta), ["todoist", "github"]);
    if (process.platform !== "win32") assert.equal(statSync(ruta).mode & 0o777, 0o600);
    writeFileSync(ruta, JSON.stringify({ conectados: ["todoist", "otro", 3] }));
    assert.deepEqual(leerConectados(ruta), ["todoist"]);
    assert.deepEqual(leerConectados(join(ruta, "no-existe")), []);
  });
});

describe("nombres bonitos y secretos", () => {
  it("muestra el servicio y la acción en castellano", () => {
    assert.deepEqual(nombreBonito("mcp__todoist__find-tasks"), { servicio: "Todoist", accion: "Buscar tareas", propio: false });
    assert.equal(nombreBonito("mcp__todoist__find-tasks-by-date")!.accion, "Ver tareas por fecha");
    assert.equal(nombreBonito("mcp__todoist__update-sections")!.accion, "Actualizar secciones");
    assert.equal(nombreBonito("mcp__canva__search-designs")!.accion, "Buscar diseños");
    assert.deepEqual(nombreBonito("mcp__mi-wiki__raro"), { servicio: "mi-wiki", accion: "raro", propio: true });
    assert.equal(nombreBonito("mcp__gastos__gastos_anotar"), null);
    assert.equal(nombreBonito("Bash"), null);
  });

  it("tapa tokens y códigos en textos que se muestran o registran", () => {
    const token = `github_pat_${"C".repeat(40)}`;
    const texto = ocultarSecretos(`falló: Authorization=Bearer ${token} y ghp_abcdef123456 en ${URL_AUTORIZACION}`, [token]);
    assert.ok(!texto.includes(token));
    assert.ok(!texto.includes("ghp_abcdef123456"));
    assert.ok(!texto.includes("s123"));
    assert.ok(!texto.includes("code_challenge=XYZ"));
  });
});

describe("Rust repite la lista cerrada de conectores", () => {
  it("ids y hosts de autorización coinciden con conectores.rs", () => {
    const rust = readFileSync(fileURLToPath(new URL("../../../apps/desktop/src-tauri/src/conectores.rs", import.meta.url)), "utf8");
    const bloque = rust.slice(rust.indexOf("const CONECTORES"), rust.indexOf("];", rust.indexOf("const CONECTORES")));
    for (const c of CATALOGO) {
      const fila = new RegExp(`\\("${c.id}",\\s*&\\[([^\\]]*)\\]\\)`).exec(bloque);
      assert.ok(fila, `falta ${c.id} en CONECTORES de conectores.rs`);
      const hosts = [...fila[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(hosts, c.hostsAutorizacion, c.id);
    }
    assert.equal((bloque.match(/\("/g) ?? []).length, CATALOGO.length);
  });
});
