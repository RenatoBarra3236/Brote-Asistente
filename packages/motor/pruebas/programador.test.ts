import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { SesionesClaude, describirHerramienta, describirSesiones, esDeOpenClaw, leerEventoHook, type EventoHook } from "../src/programador.ts";

const base = { sesion: "s1", cwd: "/Users/ana/proyectos/tarea-rust" };
const evento = (evento: string, extra: Partial<EventoHook> = {}): EventoHook => ({ evento, ...base, ...extra });

describe("modo programador: eventos", () => {
  it("valida lo que llega", () => {
    assert.equal(leerEventoHook(null), null);
    assert.equal(leerEventoHook({ evento: "Stop" }), null);
    const e = leerEventoHook({ evento: "PreToolUse", sesion: "s1", cwd: "/x", herramienta: "Edit", entrada: { archivo: "/x/lib.rs", otra: "cosa" }, sobra: 1 })!;
    assert.equal(e.interactiva, true);
    assert.equal(leerEventoHook({ evento: "PermissionRequest", sesion: "s", cwd: "/x", interactiva: false })!.interactiva, false);
    assert.deepEqual(e.entrada, { archivo: "/x/lib.rs", comando: undefined, patron: undefined, descripcion: undefined, url: undefined });
    assert.equal("sobra" in e, false);
    assert.equal(leerEventoHook({ evento: "Stop", sesion: "s1", cwd: "/x", entrada: "texto" })!.entrada, undefined);
  });

  it("ignora las sesiones de OpenClaw", () => {
    const carpetas = ["/Users/ana/.openclaw", "/Users/ana/.openclaw/workspace"];
    assert.equal(esDeOpenClaw("/Users/ana/.openclaw/workspace", carpetas), true);
    assert.equal(esDeOpenClaw("/Users/ana/.openclaw/workspace/memory", carpetas), true);
    assert.equal(esDeOpenClaw("/Users/ana/.openclaw-prueba", carpetas), false);
    assert.equal(esDeOpenClaw("/Users/ana/proyectos/tarea", carpetas), false);
  });

  it("describe cada herramienta", () => {
    assert.equal(describirHerramienta("Edit", { archivo: "/a/src/lib.rs" }), "Editando lib.rs…");
    assert.equal(describirHerramienta("Write", { archivo: "/a/README.md" }), "Escribiendo README.md…");
    assert.equal(describirHerramienta("Read", { archivo: "C:\\proyecto\\main.py".replace(/\\/g, "/") }), "Leyendo main.py…");
    assert.equal(describirHerramienta("Bash", { comando: "npm test -- --watch=false   && echo listo y algo más largo" }), "Ejecutando npm test -- --watch=false && echo listo…");
    assert.equal(describirHerramienta("Grep", { patron: "useState" }), "Buscando «useState»…");
    // Claude Code suele anteponer un cd: se muestra lo que de verdad corre.
    assert.equal(describirHerramienta("Bash", { comando: "cd /Users/renato/Asistente-multiplataforma && pnpm test" }), "Ejecutando pnpm test…");
    assert.equal(describirHerramienta("Bash", { comando: 'cd "/Users/r/mi proyecto"; cd src && cargo build' }), "Ejecutando cargo build…");
    assert.equal(describirHerramienta("Bash", { comando: "cd /tmp" }), "Ejecutando cd /tmp…");
    assert.equal(describirHerramienta("Bash", { comando: "cd /x && " }), "Ejecutando cd…");
    assert.equal(describirHerramienta("mcp__github__create_pull_request", undefined), "Usando create_pull_request…");
    assert.equal(describirHerramienta("Rara", undefined), "Usando Rara…");
  });
});

describe("modo programador: sesiones", () => {
  it("sigue una sesión de principio a fin", () => {
    const s = new SesionesClaude();
    s.aplicar(evento("SessionStart"), 0);
    assert.deepEqual(s.visibles(0).map((x) => [x.proyecto, x.estado, x.actividad]), [["tarea-rust", "esperando", "Lista para empezar"]]);
    s.aplicar(evento("UserPromptSubmit"), 1);
    assert.equal(s.trabajando(1), true);
    s.aplicar(evento("PreToolUse", { herramienta: "Edit", entrada: { archivo: "/x/src/lib.rs" } }), 2);
    assert.equal(s.visibles(2)[0].actividad, "Editando lib.rs…");
    s.aplicar(evento("PermissionRequest", { herramienta: "Bash", entrada: { comando: "cargo test" } }), 3);
    assert.deepEqual([s.visibles(3)[0].estado, s.visibles(3)[0].actividad], ["permiso", "Pide permiso: Ejecutando cargo test"]);
    // La notificación del mismo permiso no lo pisa.
    s.aplicar(evento("Notification", { tipoNotificacion: "permission_prompt" }), 4);
    assert.equal(s.visibles(4)[0].actividad, "Pide permiso: Ejecutando cargo test");
    s.aplicar(evento("PostToolUse", { herramienta: "Bash" }), 5);
    assert.equal(s.aplicar(evento("Stop"), 6), "termino");
    assert.equal(s.trabajando(6), false);
    assert.equal(s.visibles(6)[0].actividad, "Terminó ✓");
    s.aplicar(evento("Notification", { tipoNotificacion: "idle_prompt" }), 7);
    assert.equal(s.visibles(7)[0].actividad, "Esperando tu respuesta");
    assert.equal(s.aplicar(evento("SessionEnd"), 8), null);
    assert.deepEqual(s.visibles(8), []);
  });

  it("ordena las que trabajan primero y esconde las quietas viejas", () => {
    const s = new SesionesClaude();
    s.aplicar(evento("Stop", { sesion: "a", cwd: "/p/web" }), 0);
    s.aplicar(evento("UserPromptSubmit", { sesion: "b", cwd: "/p/api" }), 1000);
    s.aplicar(evento("Stop", { sesion: "c", cwd: "/p/app" }), 2000);
    assert.deepEqual(s.visibles(3000).map((x) => x.proyecto), ["api", "app", "web"]);
    assert.deepEqual(s.visibles(11 * 60_000).map((x) => x.proyecto), ["api"]);
    assert.equal(s.aplicar(evento("StopFailure", { sesion: "b", cwd: "/p/api" }), 11 * 60_000), "fallo");
  });

  it("«¿qué está haciendo Claude?» sin IA", () => {
    const s = new SesionesClaude();
    s.aplicar(evento("PreToolUse", { herramienta: "Edit", entrada: { archivo: "/x/lib.rs" } }), Date.now());
    const motor = new Motor(new Gastos(":memory:"), { sesionesClaude: () => s.visibles(Date.now()) });
    for (const frase of ["¿qué está haciendo Claude?", "cómo va claude code", "mis sesiones de claude"]) {
      assert.equal(motor.resolver(frase)?.texto, "⌨️ Claude Code:\n• tarea-rust: Editando lib.rs…", frase);
    }
    assert.match(describirSesiones([]), /No veo sesiones/);
    assert.equal(new Motor(new Gastos(":memory:")).resolver("qué está haciendo claude"), null);
  });
});
