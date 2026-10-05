// whisper-cli (falso, en carpeta temporal) detrás de `transcribirConWhisper`: argumentos, validaciones,
// tope, tiempo máximo y cancelación. Nunca toca las grabaciones ni los modelos reales del usuario.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, openSync, ftruncateSync, closeSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { modeloFalso, wavDeSilencio, whisperFalso } from "./ayuda-whisper.ts";
import {
  argumentosWhisper,
  duracionDeArchivoWav,
  estadoWhisper,
  esMarcaSinHabla,
  leerSalidaWhisper,
  rutaDeModelo,
  transcribirConWhisper,
  validarAudio,
} from "../src/transcribir.ts";

const montaje = () => {
  const raiz = mkdtempSync(join(tmpdir(), "whisper-"));
  const grabaciones = join(raiz, "grabaciones");
  const modelos = join(raiz, "modelos");
  mkdirSync(grabaciones);
  const audio = join(grabaciones, "2026-10-05-103000.wav");
  writeFileSync(audio, wavDeSilencio(2));
  modeloFalso(modelos, "small");
  return { raiz, grabaciones, modelos, audio, whisper: whisperFalso(raiz) };
};

describe("transcribir con whisper-cli", { skip: process.platform === "win32" }, () => {
  it("lee la salida JSON a segmentos en segundos y limpia el texto", async () => {
    const m = montaje();
    process.env.ANTHROPIC_API_KEY = "no-debe-llegar";
    try {
      const segmentos = await transcribirConWhisper(m.audio, "small", { whisper: m.whisper, carpetaGrabaciones: m.grabaciones, carpetaModelos: m.modelos });
      assert.deepEqual(segmentos, [
        { inicioSeg: 0, finSeg: 3.2, texto: "Buenos días, hoy vemos derivadas." },
        { inicioSeg: 3.2, finSeg: 7.4, texto: "Partimos con la regla de la cadena." },
      ]);
      const { a, clave } = JSON.parse(readFileSync(join(m.raiz, "args.json"), "utf8"));
      assert.equal(clave, null, "el hijo no hereda ANTHROPIC_API_KEY");
      assert.equal(a[a.indexOf("-m") + 1], join(m.modelos, "ggml-small.bin"));
      assert.equal(a[a.indexOf("-f") + 1], m.audio);
      assert.equal(a[a.indexOf("-l") + 1], "es");
      assert.ok(a.includes("-oj") && a.includes("-np"));
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("rechaza modelos fuera de la lista y modelos a medio descargar", async () => {
    const m = montaje();
    const opciones = { whisper: m.whisper, carpetaGrabaciones: m.grabaciones, carpetaModelos: m.modelos };
    await assert.rejects(transcribirConWhisper(m.audio, "../small", opciones), /lista/);
    await assert.rejects(transcribirConWhisper(m.audio, "tiny", opciones), /lista/);
    await assert.rejects(transcribirConWhisper(m.audio, "base", opciones), /falta descargar/);
    // Un archivo con el nombre del modelo pero de otro tamaño (descarga cortada) no cuenta.
    writeFileSync(join(m.modelos, "ggml-base.bin"), "corto");
    assert.equal(rutaDeModelo("base", m.modelos), null);
    assert.ok(rutaDeModelo("small", m.modelos));
  });

  it("solo acepta <id>.wav regulares de la carpeta de grabaciones", async () => {
    const m = montaje();
    const opciones = { whisper: m.whisper, carpetaGrabaciones: m.grabaciones, carpetaModelos: m.modelos };
    const afuera = join(m.raiz, "2026-10-05-103000.wav");
    writeFileSync(afuera, wavDeSilencio(1));
    await assert.rejects(transcribirConWhisper(afuera, "small", opciones), /carpeta de grabaciones/);
    await assert.rejects(transcribirConWhisper(join(m.grabaciones, "clase.wav"), "small", opciones), /<id>\.wav/);
    await assert.rejects(transcribirConWhisper(join(m.grabaciones, "..", "grabaciones", "..", "x.wav"), "small", opciones), /carpeta de grabaciones/);
    const enlace = join(m.grabaciones, "2026-10-05-110000.wav");
    symlinkSync(afuera, enlace);
    assert.throws(() => validarAudio(enlace, m.grabaciones), /no es un archivo/);
    assert.throws(() => validarAudio(join(m.grabaciones, "2026-10-05-120000.wav"), m.grabaciones));
  });

  it("respeta el tope de 3 horas (por el encabezado del WAV)", async () => {
    const m = montaje();
    const largo = join(m.grabaciones, "2026-10-05-090000.wav");
    // Encabezado que dice 3 h + 1 s de datos; el archivo real es disperso (no ocupa disco).
    const cabecera = wavDeSilencio(0);
    cabecera.writeUInt32LE(3 * 3600 * 32000 + 32000, 40);
    writeFileSync(largo, cabecera);
    const fd = openSync(largo, "r+");
    ftruncateSync(fd, 44 + 3 * 3600 * 32000 + 32000);
    closeSync(fd);
    assert.ok(duracionDeArchivoWav(largo) > 3 * 3600);
    await assert.rejects(
      transcribirConWhisper(largo, "small", { whisper: m.whisper, carpetaGrabaciones: m.grabaciones, carpetaModelos: m.modelos }),
      /3 horas/,
    );
    writeFileSync(join(m.grabaciones, "2026-10-05-100000.wav"), "no soy un wav");
    assert.throws(() => duracionDeArchivoWav(join(m.grabaciones, "2026-10-05-100000.wav")), /WAV/);
  });

  it("falla con claridad si whisper-cli falla, no está, devuelve basura o tarda demasiado", async () => {
    const m = montaje();
    const base = { carpetaGrabaciones: m.grabaciones, carpetaModelos: m.modelos };
    await assert.rejects(transcribirConWhisper(m.audio, "small", { ...base, whisper: whisperFalso(mkdtempSync(join(tmpdir(), "w-")), "error") }), /error 3.*modelo/);
    await assert.rejects(transcribirConWhisper(m.audio, "small", { ...base, whisper: whisperFalso(mkdtempSync(join(tmpdir(), "w-")), "json-roto") }));
    await assert.rejects(transcribirConWhisper(m.audio, "small", { ...base, whisper: join(m.raiz, "no-existe") }), /ENOENT/);
    await assert.rejects(
      transcribirConWhisper(m.audio, "small", { ...base, whisper: whisperFalso(mkdtempSync(join(tmpdir(), "w-")), "cuelga"), tiempoMaximoMs: 300 }),
      /demasiado/,
    );
  });

  it("se puede cancelar mientras corre (y antes de empezar)", async () => {
    const m = montaje();
    const opciones = { carpetaGrabaciones: m.grabaciones, carpetaModelos: m.modelos, whisper: whisperFalso(mkdtempSync(join(tmpdir(), "w-")), "cuelga") };
    const control = new AbortController();
    const corriendo = transcribirConWhisper(m.audio, "small", { ...opciones, senal: control.signal });
    setTimeout(() => control.abort(), 200);
    await assert.rejects(corriendo, /cancelada/);
    const yaCancelada = AbortSignal.abort();
    await assert.rejects(transcribirConWhisper(m.audio, "small", { ...opciones, senal: yaCancelada }));
  });

  it("estadoWhisper dice qué modelos están completos", () => {
    const m = montaje();
    const estado = estadoWhisper(m.modelos);
    assert.deepEqual(estado.modelos, { base: false, small: true, medium: false, "large-v3-turbo": false });
  });

  it("leerSalidaWhisper rechaza formas inesperadas y los argumentos son un arreglo", () => {
    assert.throws(() => leerSalidaWhisper('{"otra":1}'));
    assert.throws(() => leerSalidaWhisper('{"transcription":[{"text":"x"}]}'));
    const marca = (texto: string) => JSON.stringify({ transcription: [{ offsets: { from: 0, to: 1000 }, text: texto }] });
    assert.deepEqual(leerSalidaWhisper(marca(" [Música]")), []);
    assert.deepEqual(leerSalidaWhisper(marca("(aplausos)")), []);
    assert.equal(leerSalidaWhisper(marca(" [Música] y seguimos con la clase")).length, 1);
    assert.equal(esMarcaSinHabla("Hoy vemos (derivadas)"), false);
    assert.deepEqual(argumentosWhisper("m", "a", "b", "es", 4), ["-m", "m", "-f", "a", "-l", "es", "-t", "4", "-oj", "-of", "b", "-np"]);
  });
});
