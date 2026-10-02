import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { type Lugares, buscarRecuerdos, corregirRecuerdo, listarRecuerdos, nombreDeProyecto, olvidarRecuerdo } from "../src/memoria.ts";

let lugares: Lugares;
let eliminados: string[];
const eliminar = (ruta: string) => {
  eliminados.push(ruta);
  rmSync(ruta, { recursive: true, force: true });
};

const RECUERDO = `---
name: user-estudio
description: "Le gusta estudiar de noche"
metadata:
  type: user
  modified: 2026-10-02T17:47:31.100Z
---

Le gusta estudiar de noche.
`;

beforeEach(() => {
  const raiz = mkdtempSync(join(tmpdir(), "memoria-"));
  lugares = {
    brote: join(raiz, "brote"),
    conversaciones: join(raiz, "workspace-memory"),
    importados: join(raiz, "workspace-memory", "imports", "claude-code"),
  };
  eliminados = [];
  mkdirSync(lugares.brote, { recursive: true });
  mkdirSync(join(lugares.importados, "Users-ana-Desktop-Repositorios-tesis-0123456789"), { recursive: true });
  writeFileSync(join(lugares.brote, "user_estudio.md"), RECUERDO);
  writeFileSync(join(lugares.brote, "otro.md"), "---\ndescription: Otro\n---\n\nOtro recuerdo.\n");
  writeFileSync(
    join(lugares.brote, "MEMORY.md"),
    "- [Estudio](user_estudio.md) — le gusta estudiar de noche\n- [Otro](otro.md) — otro\n",
  );
  writeFileSync(
    join(lugares.conversaciones, "2026-10-02-1455.md"),
    '# Session\n\n## Conversation Summary\n\nuser: "hola"\nassistant: "hola 🌱"\n',
  );
  writeFileSync(join(lugares.conversaciones, "notas-sueltas.md"), "no es una conversación");
  writeFileSync(
    join(lugares.importados, "Users-ana-Desktop-Repositorios-tesis-0123456789", "proyecto.md"),
    '---\ndescription: "Tesis sobre suelos"\n---\n',
  );
});

describe("lo que sé de ti", () => {
  it("lista los recuerdos de Brote, las conversaciones y lo importado", () => {
    const recuerdos = listarRecuerdos(lugares);
    const porId = Object.fromEntries(recuerdos.map((r) => [r.id, r]));
    assert.deepEqual(Object.keys(porId).sort(), [
      "brote:otro.md",
      "brote:user_estudio.md",
      "conversacion:2026-10-02-1455.md",
      "importado:Users-ana-Desktop-Repositorios-tesis-0123456789",
    ]);
    assert.equal(porId["brote:user_estudio.md"].titulo, "Le gusta estudiar de noche");
    assert.equal(porId["brote:user_estudio.md"].editable, true);
    assert.equal(porId["conversacion:2026-10-02-1455.md"].titulo, "Conversación del 2 de octubre, 14:55");
    assert.equal(porId["conversacion:2026-10-02-1455.md"].texto, "Tú: hola\nBrote: hola 🌱");
    assert.equal(porId["importado:Users-ana-Desktop-Repositorios-tesis-0123456789"].titulo, "Proyecto «tesis» (importado de Claude Code)");
    assert.equal(porId["importado:Users-ana-Desktop-Repositorios-tesis-0123456789"].texto, "• Tesis sobre suelos");
  });

  it("olvidar un recuerdo de Brote lo saca también del índice", () => {
    olvidarRecuerdo("brote:user_estudio.md", lugares, eliminar);
    assert.equal(existsSync(join(lugares.brote, "user_estudio.md")), false);
    assert.equal(readFileSync(join(lugares.brote, "MEMORY.md"), "utf8"), "- [Otro](otro.md) — otro\n");
  });

  it("olvida conversaciones y proyectos importados completos", () => {
    olvidarRecuerdo("conversacion:2026-10-02-1455.md", lugares, eliminar);
    olvidarRecuerdo("importado:Users-ana-Desktop-Repositorios-tesis-0123456789", lugares, eliminar);
    assert.deepEqual(listarRecuerdos(lugares).map((r) => r.tipo), ["brote", "brote"]);
  });

  it("corregir reemplaza el texto, el resumen y la línea del índice", () => {
    corregirRecuerdo("brote:user_estudio.md", "Le gusta estudiar en la mañana.\nSobre todo los fines de semana.", lugares);
    const archivo = readFileSync(join(lugares.brote, "user_estudio.md"), "utf8");
    assert.match(archivo, /^description: "Le gusta estudiar en la mañana\."$/m);
    assert.match(archivo, /name: user-estudio/);
    assert.match(archivo, /\n\nLe gusta estudiar en la mañana\.\nSobre todo los fines de semana\.\n$/);
    assert.match(readFileSync(join(lugares.brote, "MEMORY.md"), "utf8"), /\(user_estudio\.md\) — Le gusta estudiar en la mañana\./);
    assert.throws(() => corregirRecuerdo("brote:user_estudio.md", "   ", lugares), /vacío/);
    assert.throws(() => corregirRecuerdo("conversacion:2026-10-02-1455.md", "x", lugares), /Solo se pueden corregir/);
  });

  it("no acepta ids que salgan de la memoria", () => {
    for (const id of [
      "brote:../../secreto.md",
      "brote:MEMORY.md",
      "brote:",
      "importado:..",
      "conversacion:notas-sueltas.md",
      "otro:user_estudio.md",
      "brote:user_estudio.md:extra",
      "brote:no-existe.md",
    ]) {
      assert.throws(() => olvidarRecuerdo(id, lugares, eliminar), /no válido|ya no existe/, id);
    }
    assert.deepEqual(eliminados, []);
  });

  it("nombra los proyectos importados", () => {
    assert.equal(nombreDeProyecto("Users-renatobarra-Desktop-Repositorios-alumco-proyecto-1ba1220cbd"), "alumco-proyecto");
    assert.equal(nombreDeProyecto("Users-renatobarra-Library-Application-Support-Claude-scratch-workspaces--4516c5a6b0"), "conversaciones con Claude");
  });

  it("busca un tema en el contenido completo, sin importar tildes ni mayúsculas", () => {
    writeFileSync(
      join(lugares.conversaciones, "2026-10-02-1500.md"),
      '# Session\n\n## Conversation Summary\n\nuser: "estoy ahorrando para un Notebook"\n',
    );
    assert.deepEqual(buscarRecuerdos("notebook", lugares).map((r) => r.id), ["conversacion:2026-10-02-1500.md"]);
    assert.deepEqual(buscarRecuerdos("SUELOS", lugares).map((r) => r.id), ["importado:Users-ana-Desktop-Repositorios-tesis-0123456789"]);
    assert.deepEqual(buscarRecuerdos("estudiar de noche", lugares).map((r) => r.id), ["brote:user_estudio.md"]);
    assert.throws(() => buscarRecuerdos("no", lugares), /3 letras/);
  });
});
