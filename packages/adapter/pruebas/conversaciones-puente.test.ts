// «Anteriores» por el puente de verdad (sin OpenClaw): lista y lectura del chat entero, con HOME y
// workspace en una carpeta temporal. El borrado real va a la Papelera en Mac, así que allí no se prueba aquí
// (lo cubre conversaciones.test.ts con borrado simulado).
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const PUENTE = fileURLToPath(new URL("../src/puente.ts", import.meta.url));

function esperarHasta<T>(condicion: () => T | undefined | null | false, ms = 10_000): Promise<T> {
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

const linea = (tipo: string, texto: string, t: Date) => JSON.stringify({ type: tipo, uuid: Math.random().toString(36), timestamp: t.toISOString(), message: { role: tipo, content: texto } });

describe("conversaciones anteriores (puente)", { skip: process.platform === "win32" }, () => {
  it("lista y lee el chat entero sin OpenClaw", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "conv-"));
    const workspace = join(raiz, "workspace");
    mkdirSync(join(workspace, "memory"), { recursive: true });
    const proyecto = workspace.replace(/[^A-Za-z0-9]/g, "-");
    const transcripciones = join(raiz, ".claude", "projects", proyecto);
    mkdirSync(transcripciones, { recursive: true });
    writeFileSync(join(workspace, "memory", "2026-10-02-1523.md"), '# Session: 2026-10-02 15:23:42 America/Santiago\n\n## Conversation Summary\n\nuser: "hola"\n');
    writeFileSync(
      join(transcripciones, "00000001-aaaa-bbbb-cccc-000000000001.jsonl"),
      [linea("user", "¿qué es la mitosis?", new Date(2026, 9, 2, 15, 0)), linea("assistant", "Una división celular.", new Date(2026, 9, 2, 15, 1))].join("\n") + "\n",
    );
    const funciones = join(raiz, "funciones.json");
    writeFileSync(funciones, JSON.stringify({ activas: {} }));

    const { OPENCLAW_PROFILE: _p, ...resto } = process.env;
    const puente: ChildProcess = spawn(process.execPath, [PUENTE], {
      env: {
        ...resto,
        HOME: raiz,
        OPENCLAW_STATE_DIR: join(raiz, "sin-openclaw"),
        OPENCLAW_WORKSPACE: workspace,
        ASISTENTE_FUNCIONES: funciones,
        ASISTENTE_EQUIPO: join(raiz, "equipo.json"),
        ASISTENTE_PLAN: join(raiz, "plan.json"),
        ASISTENTE_PLAN_APP: join(raiz, "no-existe.json"),
        ASISTENTE_DESCARGAS: join(raiz, "descargas"),
        ASISTENTE_CONVERSACIONES_OLVIDADAS: join(raiz, "olvidadas.json"),
      },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const avisos: any[] = [];
    createInterface({ input: puente.stdout! }).on("line", (l) => {
      try {
        avisos.push(JSON.parse(l));
      } catch {
        // no es JSON
      }
    });
    let id = 0;
    const pedir = async (pedido: object): Promise<any> => {
      const mio = String(++id);
      puente.stdin!.write(`${JSON.stringify({ id: mio, ...pedido })}\n`);
      return esperarHasta(() => avisos.find((a) => a.tipo === "respuesta" && a.id === mio));
    };
    try {
      await esperarHasta(() => avisos.find((a) => a.tipo === "funciones"));
      const lista = (await pedir({ tipo: "conversaciones-listar" })).datos;
      assert.deepEqual(lista.map((c: any) => [c.id, c.mensajes]), [["2026-10-02-1523.md", 2]]);
      const chat = (await pedir({ tipo: "conversacion-ver", conversacion: "2026-10-02-1523.md" })).datos;
      assert.deepEqual(chat.mensajes.map((m: any) => [m.rol, m.texto]), [["tu", "¿qué es la mitosis?"], ["brote", "Una división celular."]]);
      assert.match(chat.resumen, /Tú: hola/);
      // Un id que no es de una conversación se rechaza.
      const malo = await pedir({ tipo: "conversacion-ver", conversacion: "../../etc/passwd" });
      assert.ok(malo.error || malo.ok === false, "debe rechazar el id");
      assert.ok(existsSync(join(transcripciones, "00000001-aaaa-bbbb-cccc-000000000001.jsonl")), "leer no borra nada");
    } finally {
      puente.kill();
    }
  });
});
