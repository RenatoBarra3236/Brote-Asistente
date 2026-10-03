import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { analizarLinea, analizarMarkdown } from "../src/agente/markdown.ts";

describe("markdown de la burbuja", () => {
  test("negrita, cursiva y código dentro de una línea", () => {
    assert.deepEqual(analizarLinea("Lo que más gastas es **comida**: `$5.000`, *un* _77%_."), [
      { tipo: "texto", texto: "Lo que más gastas es " },
      { tipo: "negrita", texto: "comida" },
      { tipo: "texto", texto: ": " },
      { tipo: "codigo", texto: "$5.000" },
      { tipo: "texto", texto: ", " },
      { tipo: "cursiva", texto: "un" },
      { tipo: "texto", texto: " " },
      { tipo: "cursiva", texto: "77%" },
      { tipo: "texto", texto: "." },
    ]);
  });

  test("un marcador sin cerrar (la respuesta va llegando) queda como texto", () => {
    assert.deepEqual(analizarLinea("Lo que más gastas es **com"), [{ tipo: "texto", texto: "Lo que más gastas es **com" }]);
    assert.deepEqual(analizarLinea("2 * 3 = 6"), [{ tipo: "texto", texto: "2 * 3 = 6" }]);
  });

  test("los guiones bajos dentro de una palabra (nombres de archivo) no son cursiva", () => {
    const linea = "Descargaste session10_intro_ml.pdf y mi__archivo__final.txt";
    assert.deepEqual(analizarLinea(linea), [{ tipo: "texto", texto: linea }]);
    assert.deepEqual(analizarLinea("Abre `apunte_v2.pdf`, _ahora_."), [
      { tipo: "texto", texto: "Abre " },
      { tipo: "codigo", texto: "apunte_v2.pdf" },
      { tipo: "texto", texto: ", " },
      { tipo: "cursiva", texto: "ahora" },
      { tipo: "texto", texto: "." },
    ]);
  });

  test("párrafos, listas con viñeta y numeradas, y títulos", () => {
    const bloques = analizarMarkdown("# Tus gastos\nHoy:\n\n- **comida** $3.000\n- micro\n1. primero\n2. segundo\n\nListo 🌱");
    assert.deepEqual(
      bloques.map((b) => b.tipo),
      ["parrafo", "lista", "lista", "parrafo"],
    );
    assert.deepEqual((bloques[0] as { lineas: unknown }).lineas, [
      [{ tipo: "negrita", texto: "Tus gastos" }],
      [{ tipo: "texto", texto: "Hoy:" }],
    ]);
    assert.equal((bloques[1] as { ordenada: boolean }).ordenada, false);
    assert.equal((bloques[1] as { items: unknown[] }).items.length, 2);
    assert.equal((bloques[2] as { ordenada: boolean }).ordenada, true);
  });

  test("el texto plano queda igual", () => {
    assert.deepEqual(analizarMarkdown("hola"), [{ tipo: "parrafo", lineas: [[{ tipo: "texto", texto: "hola" }]] }]);
    assert.deepEqual(analizarMarkdown(""), []);
  });
});
