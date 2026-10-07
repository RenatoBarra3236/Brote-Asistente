import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { avisoCopiadas, lineaDeVeces, textoDeFraseConfirmada, textoParaCopiar } from "../src/agente/frases-memoria.ts";
import { lineaDeGrupo, totalDeGrupo, type Conteos } from "../src/agente/memoria-vista.ts";

describe("textos de las frases locales", () => {
  test("el monto se muestra como hueco, nunca el valor", () => {
    assert.deepEqual(textoDeFraseConfirmada({ forma: "almuerzo {monto}", destino: "gaste {monto} en almuerzo", veces: 2, ms: 1 }), { entrada: "almuerzo [monto]", destino: "gaste [monto] en almuerzo" });
    assert.equal(lineaDeVeces(1), "confirmada 1 vez");
    assert.equal(lineaDeVeces(3), "confirmada 3 veces");
  });
  test("copiar: una frase por línea, sin fechas", () => {
    assert.equal(textoParaCopiar([{ id: 1, frase: "uno", ms: 5 }, { id: 2, frase: "dos tres", ms: 6 }]), "uno\ndos tres");
    assert.equal(textoParaCopiar([]), "");
    assert.match(avisoCopiadas(true, 2), /Copié 2 frases/);
    assert.match(avisoCopiadas(true, 1), /Copié 1 frase\./);
    assert.match(avisoCopiadas(false, 2), /No pude copiar/);
  });
  test("cuentan en el grupo «Brote recuerda»", () => {
    const c: Conteos = { brote: 0, frases: 1, noEntendidas: 3, conversacion: 0, importado: 0, ramos: 0, notas: 0, repaso: 0, planes: 0, estadisticas: null, documentos: 0, ahorro: 0, transcripciones: 0, audios: 0 };
    assert.equal(totalDeGrupo("brote", c), 4);
    assert.match(lineaDeGrupo("brote", c), /3 frases que no entendí/);
  });
});
