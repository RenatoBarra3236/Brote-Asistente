// Las conversaciones anteriores en la isla: el chat completo sale de las transcripciones de Claude Code,
// cortado por los resúmenes de OpenClaw. Todo con archivos armados en carpeta temporal (nunca los reales).

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import {
  ID_ACTUAL,
  MAX_MENSAJES,
  leerConversacion,
  leerOlvidadas,
  listarConversaciones,
  mensajesDeTranscripcion,
  olvidarConversacion,
  type LugaresConversaciones,
} from "../src/conversaciones.ts";
import { olvidarRecuerdo, type Lugares } from "../src/memoria.ts";

let raiz: string;
let lugares: Lugares;

/** Una fecha local como la escribe OpenClaw en el nombre de un resumen. */
const local = (m: number, d: number, h: number, mi: number, s = 0) => new Date(2026, m - 1, d, h, mi, s).toISOString();

const linea = (tipo: "user" | "assistant", texto: string | unknown[], iso: string, extra: object = {}) =>
  JSON.stringify({ type: tipo, uuid: Math.random().toString(36), timestamp: iso, message: { role: tipo, content: texto }, ...extra });

const sesion = (n: number) => `${String(n).padStart(8, "0")}-aaaa-bbbb-cccc-${String(n).padStart(12, "0")}.jsonl`;

function resumen(nombre: string, sesionExacta: string, texto = 'user: "hola"\nassistant: "hola 🌱"') {
  writeFileSync(join(lugares.conversaciones, nombre), `# Session: ${sesionExacta} America/Santiago\n\n## Conversation Summary\n\n${texto}\n`);
}

function transcripcion(n: number, lineas: string[]) {
  writeFileSync(join(lugares.transcripciones!, sesion(n)), lineas.join("\n") + "\n");
}

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), "conversaciones-"));
  lugares = {
    brote: join(raiz, "brote"),
    conversaciones: join(raiz, "memory"),
    importados: join(raiz, "memory", "imports"),
    transcripciones: join(raiz, "transcripciones"),
    olvidadas: join(raiz, "datos", "olvidadas.json"),
  };
  for (const c of [lugares.brote, lugares.conversaciones, lugares.transcripciones!]) mkdirSync(c, { recursive: true });
  // Dos conversaciones cerradas (el 2 y el 4 de octubre) y una abierta.
  resumen("2026-10-02-1523.md", "2026-10-02 15:23:42");
  resumen("2026-10-04-1850.md", "2026-10-04 18:50:10", 'user: "segunda"\nassistant: "ok"');
  transcripcion(1, [
    linea("user", "¿qué es la mitosis?", local(10, 1, 15, 0)),
    linea("assistant", [{ type: "text", text: "Es una división celular." }, { type: "tool_use", name: "x" }], local(10, 1, 15, 1)),
    linea("user", [{ type: "tool_result", content: "interno" }], local(10, 1, 15, 2)),
    linea("assistant", "NO_REPLY", local(10, 1, 15, 3)),
    linea("user", "[Inter-session message] tarea del equipo", local(10, 1, 15, 4)),
  ]);
  // Este archivo cruza el reset de las 15:23 (mezcla la primera y la segunda conversación).
  transcripcion(2, [linea("user", "una más", local(10, 2, 15, 20)), linea("assistant", "respuesta tardía", local(10, 2, 15, 30))]);
  transcripcion(3, [linea("user", "¿y la meiosis?", local(10, 3, 10, 0)), linea("assistant", "Otra división.", local(10, 3, 10, 1))]);
  transcripcion(4, [linea("user", "seguimos", local(10, 5, 9, 0)), linea("assistant", "aquí estoy", local(10, 5, 9, 1))]);
});

describe("mensajes de una transcripción", () => {
  it("deja solo lo que dijiste y lo que respondió Brote (sin herramientas, sin lo interno del equipo, sin NO_REPLY)", () => {
    const texto = readFileSync(join(lugares.transcripciones!, sesion(1)), "utf8");
    const ms = mensajesDeTranscripcion(texto);
    assert.deepEqual(ms.map((m) => [m.rol, m.texto]), [["tu", "¿qué es la mitosis?"], ["brote", "Es una división celular."]]);
  });

  it("quita el aviso que OpenClaw agrega al reanudar la sesión, sin perder lo que escribió el usuario", () => {
    const aviso = "OpenClaw resumed this CLI session after prompt content changed. Follow the current turn's instructions; changed=prompt-tools.";
    const texto = [linea("user", aviso, local(10, 1, 1, 0)), linea("user", `${aviso} lo que sí escribí`, local(10, 1, 1, 5)), linea("user", `${aviso}\nen otra línea`, local(10, 1, 1, 7)), linea("user", "hola", local(10, 1, 1, 9))].join("\n");
    assert.deepEqual(mensajesDeTranscripcion(texto).map((m) => m.texto), ["lo que sí escribí", "en otra línea", "hola"]);
  });

  it("ignora líneas rotas, sesiones laterales y fechas inválidas", () => {
    const texto = ["{roto", linea("user", "x", local(10, 1, 1, 0), { isSidechain: true }), linea("user", "y", "no es fecha"), linea("user", "ok", local(10, 1, 2, 0))].join("\n");
    assert.deepEqual(mensajesDeTranscripcion(texto).map((m) => m.texto), ["ok"]);
  });
});

describe("conversaciones anteriores", () => {
  it("las lista con su cuenta de mensajes: la conversación de ahora primero y después de la más nueva a la más vieja", () => {
    const lista = listarConversaciones(lugares);
    assert.deepEqual(lista.map((c) => c.id), [ID_ACTUAL, "2026-10-04-1850.md", "2026-10-02-1523.md"]);
    const porId = Object.fromEntries(lista.map((c) => [c.id, c]));
    assert.equal(porId["2026-10-02-1523.md"].mensajes, 3, "dos del archivo 1 y uno del 2 que cae antes del reset");
    assert.equal(porId["2026-10-04-1850.md"].mensajes, 3, "uno del archivo 2 (después del reset) y dos del archivo 3");
    assert.equal(porId[ID_ACTUAL].mensajes, 2);
    assert.equal(porId[ID_ACTUAL].extracto, "seguimos");
  });

  it("lee el chat entero de una conversación, en orden, y su resumen", () => {
    const c = leerConversacion("2026-10-04-1850.md", lugares);
    assert.deepEqual(c.mensajes.map((m) => m.texto), ["respuesta tardía", "¿y la meiosis?", "Otra división."]);
    assert.match(c.resumen, /Tú: segunda/);
    assert.equal(c.titulo, "Conversación del 4 de octubre, 18:50");
    assert.equal(c.recortada, false);
  });

  it("sin transcripciones (ya caducaron o no hay), queda el resumen y cero mensajes", () => {
    rmSync(lugares.transcripciones!, { recursive: true });
    const lista = listarConversaciones(lugares);
    assert.deepEqual(lista.map((c) => [c.id, c.mensajes]), [["2026-10-04-1850.md", 0], ["2026-10-02-1523.md", 0]]);
    const c = leerConversacion("2026-10-02-1523.md", lugares);
    assert.deepEqual(c.mensajes, []);
    assert.match(c.resumen, /Tú: hola/);
    assert.throws(() => leerConversacion(ID_ACTUAL, lugares));
  });

  it("solo acepta ids exactos y no se sale de la carpeta", () => {
    for (const malo of ["../x.md", "notas.md", "/etc/passwd", "2026-10-02-1523.md/..", "2026-10-09-0000.md"]) {
      assert.throws(() => leerConversacion(malo, lugares), malo);
    }
  });

  it("no lee archivos que no son transcripciones de sesión ni enlaces simbólicos", () => {
    writeFileSync(join(raiz, "secreto.jsonl"), linea("user", "SECRETO", local(10, 5, 9, 30)));
    symlinkSync(join(raiz, "secreto.jsonl"), join(lugares.transcripciones!, sesion(9)));
    writeFileSync(join(lugares.transcripciones!, "otro.jsonl"), linea("user", "OTRO", local(10, 5, 9, 31)));
    const texto = JSON.stringify(leerConversacion(ID_ACTUAL, lugares));
    assert.ok(!texto.includes("SECRETO") && !texto.includes("OTRO"));
  });

  it("una conversación larguísima se entrega recortada a los últimos mensajes", () => {
    const muchos = Array.from({ length: MAX_MENSAJES + 50 }, (_, i) => linea("user", `m${i}`, local(10, 6, 8, 0, i % 60) .replace(/:\d\d\./, `:${String(i % 60).padStart(2, "0")}.`)));
    transcripcion(5, muchos.map((l, i) => l.replace(/"timestamp":"[^"]+"/, `"timestamp":"${new Date(2026, 9, 6, 8, 0, 0, i).toISOString()}"`)));
    const c = leerConversacion(ID_ACTUAL, lugares);
    assert.equal(c.recortada, true);
    assert.ok(c.mensajes.length <= MAX_MENSAJES);
    assert.equal(c.mensajes[c.mensajes.length - 1].texto, `m${MAX_MENSAJES + 49}`);
  });
});

describe("olvidar el chat completo", () => {
  const registrar = () => {
    const borradas: string[] = [];
    return { borradas, eliminar: (ruta: string) => { borradas.push(ruta); rmSync(ruta, { force: true }); } };
  };

  it("borra solo los archivos con mensajes de esa conversación y anota la ventana de lo que queda mezclado", () => {
    const { borradas, eliminar } = registrar();
    const r = olvidarConversacion("2026-10-02-1523.md", lugares, eliminar);
    assert.deepEqual(r, { borradas: 1, quedan: 1 });
    assert.deepEqual(borradas, [join(lugares.transcripciones!, sesion(1))]);
    assert.ok(existsSync(join(lugares.transcripciones!, sesion(2))), "el archivo que mezcla dos conversaciones no se toca");
    assert.equal(leerOlvidadas(lugares.olvidadas).length, 1);
    assert.equal(statSync(lugares.olvidadas!).mode & 0o777, 0o600);
    // Lo olvidado ya no se ve aunque el archivo siga ahí, y la conversación siguiente conserva su parte.
    const siguiente = leerConversacion("2026-10-04-1850.md", lugares);
    assert.deepEqual(siguiente.mensajes.map((m) => m.texto), ["respuesta tardía", "¿y la meiosis?", "Otra división."]);
    assert.ok(!JSON.stringify(listarConversaciones(lugares)).includes("mitosis"));
  });

  it("al olvidar el resumen, su fin se recuerda: la conversación de al lado no se estira sobre lo olvidado", () => {
    olvidarRecuerdo("conversacion:2026-10-02-1523.md", lugares, (ruta) => rmSync(ruta, { recursive: true, force: true }));
    assert.ok(!existsSync(join(lugares.conversaciones, "2026-10-02-1523.md")));
    const lista = listarConversaciones(lugares);
    assert.deepEqual(lista.map((c) => c.id), [ID_ACTUAL, "2026-10-04-1850.md"]);
    assert.deepEqual(leerConversacion("2026-10-04-1850.md", lugares).mensajes.map((m) => m.texto), ["respuesta tardía", "¿y la meiosis?", "Otra división."]);
    assert.throws(() => leerConversacion("2026-10-02-1523.md", lugares));
  });

  it("olvidar un recuerdo que no es una conversación no toca las transcripciones", () => {
    writeFileSync(join(lugares.brote, "x.md"), "---\ndescription: x\n---\n\nx\n");
    const antes = JSON.stringify(listarConversaciones(lugares));
    olvidarRecuerdo("brote:x.md", lugares, (ruta) => rmSync(ruta, { recursive: true, force: true }));
    assert.equal(JSON.stringify(listarConversaciones(lugares)), antes);
  });

  it("la conversación de ahora no se olvida por esta vía", () => {
    const { borradas, eliminar } = registrar();
    assert.deepEqual(olvidarConversacion(ID_ACTUAL, lugares, eliminar), { borradas: 0, quedan: 0 });
    assert.deepEqual(borradas, []);
  });

  it("un archivo de ventanas olvidadas roto no rompe nada", () => {
    mkdirSync(join(raiz, "datos"), { recursive: true });
    writeFileSync(lugares.olvidadas!, "{roto");
    assert.equal(listarConversaciones(lugares).length, 3);
  });
});

describe("tipos", () => {
  it("LugaresConversaciones acepta los mismos Lugares de la memoria", () => {
    const l: LugaresConversaciones = lugares;
    assert.ok(l.conversaciones);
  });
});
