import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { avisoClaveApi, fuentesDeClaveApi, plistTieneClave, tieneNombreDeClave } from "../src/clave-api.ts";

const sin = { settings: () => ({}), openclaw: () => ({}), plist: () => null };

describe("aviso de clave de API", () => {
  it("sin clave en ningún lado no avisa", () => {
    assert.deepEqual(fuentesDeClaveApi(sin), []);
    assert.equal(avisoClaveApi([]), null);
  });

  it("detecta el nombre en el env de settings.json, sin mostrar el valor", () => {
    const f = fuentesDeClaveApi({ ...sin, settings: () => ({ env: { ANTHROPIC_API_KEY: "sk-ant-falsa" } }) });
    assert.deepEqual(f, ["settings-claude"]);
    assert.ok(!avisoClaveApi(f)!.includes("sk-ant"));
  });

  it("otras variables de env no avisan", () => {
    assert.deepEqual(fuentesDeClaveApi({ ...sin, settings: () => ({ env: { OTRA: "x" } }) }), []);
  });

  it("detecta el nombre anidado en la config de OpenClaw y en el plist", () => {
    assert.equal(tieneNombreDeClave({ a: { b: [{ c: 1 }], env: { ANTHROPIC_API_KEY: "x" } } }), true);
    assert.equal(tieneNombreDeClave({ a: { b: 1 } }), false);
    assert.equal(plistTieneClave("<key>ANTHROPIC_API_KEY</key><string>x</string>"), true);
    assert.equal(plistTieneClave("<key>HOME</key>"), false);
    const f = fuentesDeClaveApi({ settings: () => ({}), openclaw: () => ({ x: { ANTHROPIC_API_KEY: "y" } }), plist: () => "<key>ANTHROPIC_API_KEY</key>" });
    assert.deepEqual(f, ["config-openclaw", "servicio-gateway"]);
  });

  it("un archivo roto no avisa ni lanza", () => {
    const roto = () => {
      throw new Error("JSON roto");
    };
    assert.deepEqual(fuentesDeClaveApi({ settings: roto, openclaw: roto, plist: roto }), []);
  });

  it("apiKeySource de Claude Code avisa aunque no se sepa dónde", () => {
    assert.match(avisoClaveApi([], "ANTHROPIC_API_KEY")!, /clave de API/);
    assert.match(avisoClaveApi(["settings-claude", "servicio-gateway"])!, /settings\.json y en el servicio/);
  });
});
