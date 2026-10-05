import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { COMMIT_MODELOS_WHISPER, FICHAS_MODELOS_WHISPER, HOST_MODELOS_WHISPER, MODELOS_WHISPER, duracionDeWav, tamanoDeModelo, urlModeloWhisper } from "../src/modelos-whisper.ts";
import { VERSION_CONSENTIMIENTO_GRABACIONES } from "../src/grabaciones-textos.ts";
import { leerAjustesGrabaciones, normalizarAjustesGrabaciones } from "../src/grabaciones-ajustes.ts";

describe("modelos de whisper", () => {
  it("cada modelo tiene archivo, tamaño y SHA-256 válidos, y su URL es del host oficial fijada a un commit", () => {
    for (const id of MODELOS_WHISPER) {
      const ficha = FICHAS_MODELOS_WHISPER[id];
      assert.match(ficha.sha256, /^[0-9a-f]{64}$/);
      assert.ok(ficha.bytes > 100_000_000);
      assert.equal(ficha.archivo, `ggml-${id}.bin`);
      assert.match(urlModeloWhisper(id), /^https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\/[0-9a-f]{40}\/ggml-[a-z0-9.-]+\.bin$/);
    }
  });

  it("muestra los tamaños redondeados", () => {
    assert.equal(tamanoDeModelo("base"), "148 MB");
    assert.equal(tamanoDeModelo("small"), "488 MB");
    assert.equal(tamanoDeModelo("medium"), "1,5 GB");
    assert.equal(tamanoDeModelo("large-v3-turbo"), "1,6 GB");
  });

  it("lee la duración de un WAV y no se deja engañar por cabeceras raras", () => {
    const cab = Buffer.alloc(44);
    cab.write("RIFF", 0);
    cab.write("WAVEfmt ", 8);
    cab.writeUInt32LE(16, 16);
    cab.writeUInt32LE(32000, 28);
    cab.write("data", 36);
    cab.writeUInt32LE(64000, 40);
    assert.equal(duracionDeWav(cab, 44 + 64000), 2);
    // Largo en 0 (grabación en curso) o mayor que el archivo: manda el tamaño real.
    cab.writeUInt32LE(0, 40);
    assert.equal(duracionDeWav(cab, 44 + 32000), 1);
    cab.writeUInt32LE(4_000_000_000, 40);
    assert.equal(duracionDeWav(cab, 44 + 96000), 3);
    assert.equal(duracionDeWav(Buffer.from("no es un wav, para nada"), 23), null);
    assert.equal(duracionDeWav(Buffer.alloc(0), 0), null);
  });
});

describe("ajustes de grabaciones", () => {
  it("las listas cerradas de Rust (modelos.rs y configuracion.rs) coinciden", () => {
    const leer = (nombre: string) => readFileSync(fileURLToPath(new URL(`../../../apps/desktop/src-tauri/src/${nombre}`, import.meta.url)), "utf8");
    const modelos = leer("modelos.rs");
    assert.ok(modelos.includes(`const COMMIT: &str = "${COMMIT_MODELOS_WHISPER}";`));
    assert.ok(modelos.includes(`const HOST: &str = "${HOST_MODELOS_WHISPER}";`));
    for (const id of MODELOS_WHISPER) {
      const f = FICHAS_MODELOS_WHISPER[id];
      const bytes = String(f.bytes).replace(/\B(?=(\d{3})+(?!\d))/g, "_");
      assert.ok(modelos.includes(`("${id}", "${f.archivo}", ${bytes}, "${f.sha256}")`), `modelos.rs no coincide para ${id}`);
    }
    const config = leer("configuracion.rs");
    assert.ok(config.includes(`const MODELOS_GRABACION: &[&str] = &[${MODELOS_WHISPER.map((m) => `"${m}"`).join(", ")}];`));
    assert.ok(config.includes(`const VERSION_CONSENTIMIENTO_GRABACIONES: u64 = ${VERSION_CONSENTIMIENTO_GRABACIONES};`));
  });

  it("vuelve a los valores por defecto con lo que no entiende", () => {
    assert.deepEqual(normalizarAjustesGrabaciones(null), { modelo: "small", diasAudio: 7, consentimiento: false });
    assert.deepEqual(normalizarAjustesGrabaciones({ modelo: "../x", diasAudio: 0 }), { modelo: "small", diasAudio: 7, consentimiento: false });
    assert.deepEqual(normalizarAjustesGrabaciones({ modelo: "medium", diasAudio: 30, consentimiento: 1 }), { modelo: "medium", diasAudio: 30, consentimiento: true });
    assert.equal(normalizarAjustesGrabaciones({ diasAudio: 1.5 }).diasAudio, 7);
    assert.equal(normalizarAjustesGrabaciones({ diasAudio: 366 }).diasAudio, 7);
  });

  it("lee el archivo, o los valores por defecto si falta o está roto", () => {
    const carpeta = mkdtempSync(join(tmpdir(), "ajustes-"));
    assert.equal(leerAjustesGrabaciones(join(carpeta, "no.json")).modelo, "small");
    writeFileSync(join(carpeta, "roto.json"), "{ no");
    assert.equal(leerAjustesGrabaciones(join(carpeta, "roto.json")).diasAudio, 7);
    writeFileSync(join(carpeta, "ok.json"), JSON.stringify({ modelo: "base", diasAudio: 3, consentimiento: 0 }));
    assert.deepEqual(leerAjustesGrabaciones(join(carpeta, "ok.json")), { modelo: "base", diasAudio: 3, consentimiento: false });
  });
});
