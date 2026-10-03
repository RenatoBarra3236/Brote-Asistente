import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { leerFunciones } from "@asistente/motor";
import { agregarHooks, comandoHook } from "../src/hooks-claude.ts";
import { migrarFunciones } from "../src/migrar-funciones.ts";

const carpeta = mkdtempSync(join(tmpdir(), "migrar-funciones-"));
after(() => rmSync(carpeta, { recursive: true, force: true }));
const conHooks = agregarHooks({}, comandoHook("/usr/local/bin/node", "/x/hook.mjs", "darwin"));

describe("funciones.json para quien ya usaba Brote", () => {
  it("con los hooks instalados lo crea con el modo programador prendido (600)", () => {
    const ruta = join(carpeta, "a", "funciones.json");
    const openclaw = { memory: { search: { provider: "local" } }, models: { providers: { "llama-cpp": { localService: {} } } } };
    assert.equal(migrarFunciones(ruta, conHooks, openclaw), true);
    const config = leerFunciones(ruta);
    assert.equal(config.activas["memoria-local"], true);
    assert.equal(config.activas.programador, true);
    assert.equal(config.activas.gastos, true);
    if (process.platform !== "win32") assert.equal(statSync(ruta).mode & 0o777, 0o600);
    // Una sola vez: después manda lo que el usuario elija.
    assert.equal(migrarFunciones(ruta, conHooks), false);
  });

  it("sin hooks (usuario nuevo) no crea nada, así ve el asistente de primera vez", () => {
    const ruta = join(carpeta, "b", "funciones.json");
    assert.equal(migrarFunciones(ruta, {}, null), false);
    assert.throws(() => statSync(ruta));
  });

  it("nunca pisa un archivo que ya existe", () => {
    const ruta = join(carpeta, "c.json");
    writeFileSync(ruta, JSON.stringify({ version: 1, activas: { programador: false } }));
    assert.equal(migrarFunciones(ruta, conHooks, null), false);
    assert.equal(JSON.parse(readFileSync(ruta, "utf8")).activas.programador, false);
  });
});
