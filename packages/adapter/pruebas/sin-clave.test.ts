import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quitarClaveDeApi } from "../src/sin-clave.ts";

describe("sin la clave de API", () => {
  it("la quita del entorno y deja lo demás", () => {
    const entorno: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: "sk-ant-falsa", PATH: "/usr/bin", HOME: "/h" };
    quitarClaveDeApi(entorno);
    assert.equal("ANTHROPIC_API_KEY" in entorno, false);
    assert.equal(entorno.PATH, "/usr/bin");
    assert.equal(entorno.HOME, "/h");
  });

  it("no falla si no estaba", () => {
    const entorno: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
    quitarClaveDeApi(entorno);
    assert.deepEqual(entorno, { PATH: "/usr/bin" });
  });
});
