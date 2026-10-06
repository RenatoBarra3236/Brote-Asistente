import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { analizarDocumento, celdasDeFila } from "../src/agente/documento-md.ts";

describe("lector de documentos Markdown", () => {
  it("títulos, párrafos de varias líneas, listas seguidas y tablas", () => {
    const bloques = analizarDocumento(
      ["# Título", "", "Una línea", "que sigue.", "", "- uno", "- **dos**", "", "| A | B |", "|---|---|", "| `x|y` | 2 |", "", "## Sub"].join("\n"),
    );
    assert.deepEqual(bloques.map((b) => b.tipo), ["titulo", "parrafo", "lista", "tabla", "titulo"]);
    assert.equal((bloques[1] as { texto: { texto: string }[] }).texto[0].texto, "Una línea que sigue.");
    assert.equal((bloques[2] as { items: unknown[] }).items.length, 2);
    const tabla = bloques[3] as { cabecera: unknown[]; filas: unknown[][] };
    assert.equal(tabla.cabecera.length, 2);
    // El «|» dentro de un trozo de código no parte la celda.
    assert.equal(tabla.filas[0].length, 2);
  });

  it("las celdas ignoran los bordes y respetan el código", () => {
    assert.deepEqual(celdasDeFila("| a | `b | c` | d |"), ["a", "`b | c`", "d"]);
  });

  it("lee todo docs/privacidad.md: tiene títulos, tablas y listas, y ninguna fila queda sin celdas", () => {
    const texto = readFileSync(new URL("../../../docs/privacidad.md", import.meta.url), "utf8");
    const bloques = analizarDocumento(texto);
    assert.ok(bloques.some((b) => b.tipo === "titulo" && b.nivel === 1));
    assert.ok(bloques.filter((b) => b.tipo === "titulo" && b.nivel === 2).length >= 4);
    assert.ok(bloques.some((b) => b.tipo === "lista"));
    const tablas = bloques.filter((b) => b.tipo === "tabla") as { cabecera: unknown[]; filas: unknown[][] }[];
    assert.ok(tablas.length >= 1);
    for (const t of tablas) for (const fila of t.filas) assert.equal(fila.length, t.cabecera.length);
  });

  it("un documento que trae HTML lo deja como texto (nunca se interpreta)", () => {
    const [b] = analizarDocumento("<img src=x onerror=alert(1)>");
    assert.equal(b.tipo, "parrafo");
    assert.equal((b as { texto: { texto: string }[] }).texto[0].texto, "<img src=x onerror=alert(1)>");
  });
});
