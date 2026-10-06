import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import { avisoConversacionOlvidada, avisoDocumentoBorrado, avisoGrabacionBorrada, avisoOlvidado, avisoTemaOlvidado, confirmarBorrarTodo, confirmarBorrarTodosDocumentos, pieDocumentos, pieGrabaciones, pieOlvidar } from "../src/agente/papelera.ts";

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

describe("textos de borrar grabaciones", () => {
  test("en Mac dicen Papelera y en Windows y Linux no la prometen", () => {
    assert.match(pieGrabaciones(true), /Papelera/);
    assert.match(avisoGrabacionBorrada(true, "audio", 2), /Papelera/);
    assert.doesNotMatch(pieGrabaciones(false), /va a la Papelera/);
    assert.match(pieGrabaciones(false), /para siempre/);
    assert.match(avisoGrabacionBorrada(false, "transcripcion", 1), /para siempre/);
    assert.doesNotMatch(avisoGrabacionBorrada(false, "transcripcion", 1), /Papelera/);
  });
  test("singular, plural y nada", () => {
    assert.equal(avisoGrabacionBorrada(true, "transcripcion", 1), "Borré la transcripción. Quedó en la Papelera hasta que la vacíes.");
    assert.match(avisoGrabacionBorrada(false, "audio", 3), /3 audios/);
    assert.match(avisoGrabacionBorrada(true, "audio", 0), /No había nada/);
  });
  test("el segundo toque de «Borrar todo» dice cuántas", () => {
    assert.equal(confirmarBorrarTodo("transcripcion", 4), "¿Seguro? Se borran 4 transcripciones");
  });
});

describe("documentos en la papelera", () => {
  it("avisa distinto en Mac y fuera de Mac, y dice que el original no se toca", () => {
    assert.match(pieDocumentos(true), /Papelera.*tu archivo original no se toca/);
    assert.match(pieDocumentos(false), /para siempre.*tu archivo original no se toca/);
    assert.equal(avisoDocumentoBorrado(true, 1), "Borré el documento. Quedó en la Papelera hasta que la vacíes.");
    assert.equal(avisoDocumentoBorrado(false, 3), "Borré 3 documentos para siempre.");
    assert.equal(avisoDocumentoBorrado(true, 0), "No había nada que borrar: ya no estaba.");
    assert.equal(confirmarBorrarTodosDocumentos(4), "¿Seguro? Se borran 4 documentos");
  });
});

describe("avisos al olvidar una conversación", () => {
  it("sin chat completo dice lo de siempre; con él, cuenta los archivos y lo que no se pudo tocar", () => {
    assert.equal(avisoConversacionOlvidada(true, 0, 0), avisoOlvidado(true));
    assert.match(avisoConversacionOlvidada(true, 2, 0), /chat completo también se mandó a la Papelera \(2 archivos\)/);
    assert.match(avisoConversacionOlvidada(false, 1, 0), /también se borró \(1 archivo\)/);
    const mezclado = avisoConversacionOlvidada(true, 1, 2);
    assert.match(mezclado, /2 archivos de Claude Code mezclan esa conversación con otra/);
    assert.match(mezclado, /ya no se muestran/);
    assert.match(avisoConversacionOlvidada(true, 0, 1), /Un archivo de Claude Code mezcla/);
  });
});
