import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { limpiarRegistros, limpiarTexto } from "../src/limpiar-registros.ts";

const TECNICAS = [
  "2026-10-04T18:00:00.000-03:00 [health] host ok",
  "[state/db] Shared-state WAL checkpoint",
  "(node:26330) Warning: algo",
  "(Use `node --trace-warnings ...` to show where)",
];
const CONVERSACION = ["El investigador respondió:", "", "1) **Resumen** de la fotosíntesis", "", "Aquí va el resto"];

function armar(): string {
  return [TECNICAS[0], ...CONVERSACION, TECNICAS[1], "", TECNICAS[2], TECNICAS[3], TECNICAS[0]].join("\n") + "\n";
}

describe("limpiar registros del Gateway", () => {
  it("quita el texto suelto y sus vacías, y deja lo técnico", () => {
    const { texto, quitadas } = limpiarTexto(armar());
    assert.equal(quitadas, 5);
    assert.equal(texto, [TECNICAS[0], TECNICAS[1], "", TECNICAS[2], TECNICAS[3], TECNICAS[0]].join("\n") + "\n");
    assert.ok(!texto.includes("fotosíntesis"));
  });

  it("es idempotente y no toca un registro limpio", () => {
    const una = limpiarTexto(armar()).texto;
    const dos = limpiarTexto(una);
    assert.equal(dos.quitadas, 0);
    assert.equal(dos.texto, una);
  });

  it("limpia gateway.log y sus rotados, en el mismo inodo y con permisos 600", () => {
    const dir = mkdtempSync(join(tmpdir(), "brote-log-"));
    try {
      const principal = join(dir, "gateway.log");
      writeFileSync(principal, armar());
      chmodSync(principal, 0o600);
      const inodo = statSync(principal).ino;
      writeFileSync(join(dir, "gateway.log.1"), armar());
      assert.equal(limpiarRegistros(dir), 10);
      assert.ok(!readFileSync(principal, "utf8").includes("fotosíntesis"));
      assert.ok(!readFileSync(join(dir, "gateway.log.1"), "utf8").includes("fotosíntesis"));
      assert.equal(statSync(principal).ino, inodo);
      assert.equal(statSync(principal).mode & 0o777, 0o600);
      assert.equal(limpiarRegistros(dir), 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no toca otros nombres, enlaces ni carpetas", () => {
    const dir = mkdtempSync(join(tmpdir(), "brote-log-"));
    try {
      for (const nombre of ["gateway.log.bak", "mi-gateway.log", "gateway.err.log", "otro.txt"]) {
        writeFileSync(join(dir, nombre), armar());
      }
      writeFileSync(join(dir, "real.txt"), armar());
      symlinkSync(join(dir, "real.txt"), join(dir, "gateway.log.2"));
      mkdirSync(join(dir, "gateway.log.3"));
      assert.equal(limpiarRegistros(dir), 0);
      for (const nombre of ["gateway.log.bak", "mi-gateway.log", "gateway.err.log", "otro.txt", "real.txt"]) {
        assert.equal(readFileSync(join(dir, nombre), "utf8"), armar());
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no falla si la carpeta no existe o no hay carpeta", () => {
    assert.equal(limpiarRegistros(join(tmpdir(), "brote-no-existe-xyz")), 0);
    assert.equal(limpiarRegistros(null), 0);
  });
});
