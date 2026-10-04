import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { avisoOlvidado, avisoTemaOlvidado, pieOlvidar } from "../src/agente/papelera.ts";

describe("textos de olvidar", () => {
  test("en Mac avisa que sigue en la Papelera hasta vaciarla", () => {
    for (const texto of [pieOlvidar(true), avisoOlvidado(true), avisoTemaOlvidado(true, 2, "notebook")]) {
      assert.match(texto, /Papelera/);
      assert.match(texto, /vac/);
      assert.doesNotMatch(texto, /para siempre/);
    }
  });

  test("en Windows y Linux no promete una Papelera que no existe", () => {
    for (const texto of [pieOlvidar(false), avisoOlvidado(false), avisoTemaOlvidado(false, 2, "notebook")]) {
      assert.doesNotMatch(texto, /va a la Papelera|Quedó en la Papelera|Quedaron en la Papelera/);
    }
    assert.match(pieOlvidar(false), /para siempre/);
    assert.match(avisoTemaOlvidado(false, 1, "x"), /Olvidé 1 cosa sobre «x»/);
  });
});
