import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { esDeMemoria } from "../src/permisos.ts";

const raiz = mkdtempSync(join(tmpdir(), "permisos-"));
const memoria = join(raiz, "workspace", "memory");
const secreto = join(raiz, "secreto");
mkdirSync(memoria, { recursive: true });
mkdirSync(secreto);
writeFileSync(join(raiz, "workspace", "MEMORY.md"), "");
writeFileSync(join(secreto, "claves.txt"), "");
// Un enlace dentro de la memoria que apunta afuera.
// En Windows, un enlace a carpeta sin permisos de administrador es un "junction".
symlinkSync(secreto, join(memoria, "atajo"), process.platform === "win32" ? "junction" : "dir");
const config = { carpetas: [memoria], archivos: [join(raiz, "workspace", "MEMORY.md")] };

const caso = (herramienta: string, ruta: unknown) => esDeMemoria(herramienta, JSON.stringify({ file_path: ruta }), config);

describe("permisos de memoria", () => {
  it("permite leer y escribir dentro de la memoria, incluso archivos nuevos", () => {
    assert.equal(caso("Read", join(memoria, "2026-10-02.md")), true);
    assert.equal(caso("Write", join(memoria, "nuevo", "nota.md")), true);
    assert.equal(caso("Edit", join(raiz, "workspace", "MEMORY.md")), true);
  });

  it("no permite salir de la memoria", () => {
    assert.equal(caso("Read", join(memoria, "..", "..", "secreto", "claves.txt")), false);
    assert.equal(caso("Read", join(memoria, "atajo", "claves.txt")), false);
    assert.equal(caso("Write", join(raiz, "workspace", "SOUL.md")), false);
    assert.equal(caso("Read", memoria), false);
    assert.equal(caso("Read", "memory/nota.md"), false);
  });

  it("solo para herramientas de archivo y con detalle válido", () => {
    assert.equal(caso("Bash", join(memoria, "nota.md")), false);
    assert.equal(esDeMemoria("Read", "no es json", config), false);
    assert.equal(esDeMemoria("Read", JSON.stringify({ path: join(memoria, "x.md") }), config), false);
    assert.equal(esDeMemoria("Read", undefined, config), false);
  });
});
