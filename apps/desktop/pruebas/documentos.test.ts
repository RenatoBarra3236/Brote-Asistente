import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCIONES_DOCUMENTO, describirDocumento, mensajeParaAgente, nombreCorto, origenDePropuesta, prefijoOtraCosa, revisarArrastre, textoArrastre, textoLeyendo, textoPregunta } from "../src/agente/documentos.ts";

describe("documentos en la isla", () => {
  it("al arrastrar, elige el primer archivo que Brote sabe leer y cuenta el resto", () => {
    const r = revisarArrastre(["/a/foto.png", "/a/Apuntes.PDF", "/a/clase.docx", "/a/video.mp4"]);
    assert.equal(r.elegido, "/a/Apuntes.PDF");
    assert.equal(r.extras, 1);
    assert.equal(r.invalidos, 2);
    assert.match(textoArrastre(r), /el primero/);
    assert.equal(textoArrastre(revisarArrastre(["/a/uno.pdf"])), "Suéltalo aquí y Brote lo lee");
    const nada = revisarArrastre(["/a/foto.png", "/a/archivo.exe"]);
    assert.equal(nada.elegido, null);
    assert.match(textoArrastre(nada), /Eso no lo puedo leer/);
    assert.equal(revisarArrastre([]).elegido, null);
  });
  it("acorta los nombres largos sin perder la extensión", () => {
    assert.equal(nombreCorto("Apuntes.pdf"), "Apuntes.pdf");
    const largo = nombreCorto("Apuntes de cálculo diferencial e integral capítulo 4 y 5.pdf", 30);
    assert.ok(largo.length <= 30 && largo.endsWith(".pdf") && largo.includes("…"), largo);
    assert.equal(textoLeyendo("a.pdf"), "Leyendo «a.pdf»…");
    assert.equal(textoPregunta("a.pdf"), "¿Qué hago con «a.pdf»?");
  });
  it("describe cada tipo en palabras de persona", () => {
    assert.equal(describirDocumento({ tipo: "pdf", paginas: 12, caracteres: 21_000 }), "PDF · 12 páginas · unas 3.500 palabras");
    assert.equal(describirDocumento({ tipo: "pptx", paginas: 1, caracteres: 300 }), "PowerPoint · 1 diapositiva");
    assert.equal(describirDocumento({ tipo: "docx", paginas: null, caracteres: 60 }), "Word");
    assert.equal(describirDocumento({ tipo: "md", paginas: null, caracteres: 6000 }), "Texto · unas 1.000 palabras");
  });
  it("los mensajes al agente llevan el id y piden leer entero con la herramienta; las tarjetas piden dejar una propuesta", () => {
    const d = { id: "doc-2026-10-06-140509", nombre: "Apuntes.pdf" };
    for (const a of ["resumen", "tarjetas", "preguntas"] as const) {
      const m = mensajeParaAgente(a, d);
      assert.ok(m.includes("doc-2026-10-06-140509") && m.includes("«Apuntes.pdf»") && m.includes("documentos_leer"), m);
    }
    assert.match(mensajeParaAgente("tarjetas", d), /repaso_proponer/);
    assert.match(mensajeParaAgente("preguntas", d), /repaso_proponer/);
    assert.doesNotMatch(mensajeParaAgente("resumen", d), /repaso_proponer/);
    assert.equal(prefijoOtraCosa(d), "Sobre el documento «Apuntes.pdf» (id doc-2026-10-06-140509): ");
    assert.deepEqual(ACCIONES_DOCUMENTO.map((a) => a.id), ["resumen", "tarjetas", "preguntas", "otra"]);
  });
  it("una propuesta de repaso dice si viene de un documento o de una clase", () => {
    assert.deepEqual(origenDePropuesta({ grabacion: "doc-2026-10-06-140509", documento: "Apuntes.pdf" }), { tipo: "documento", nombre: "Apuntes.pdf" });
    assert.deepEqual(origenDePropuesta({ grabacion: "doc-2026-10-06-140509" }), { tipo: "documento", nombre: null });
    assert.deepEqual(origenDePropuesta({ grabacion: "2026-10-04-103000" }), { tipo: "clase", nombre: null });
  });
});
