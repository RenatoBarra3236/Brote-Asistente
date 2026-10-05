import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { textoCopiado, TEXTO_ESTADO_AUDIO, duracionDeAudio, estadoDeAudio, textoBotonGrabar, textoVacioGrabar, textoAviso, textoDuracion, textoTamano, textoVencimiento, totalGrabaciones, type ItemAudio } from "../src/agente/grabaciones-memoria.ts";

const audio = (extra: Partial<ItemAudio> = {}): ItemAudio => ({ id: "x", fecha: null, bytes: 1, venceEn: null, vencido: false, transcrito: false, ...extra });

describe("textos de la sección Grabaciones", () => {
  it("el aviso a los presentes", () => {
    assert.equal(textoAviso("si"), "Avisé a los presentes");
    assert.equal(textoAviso("no"), "No avisé a los presentes");
    assert.equal(textoAviso("solo-mi-voz"), "Solo mi voz");
  });
  it("duración y tamaño", () => {
    assert.equal(textoDuracion(30), "1 min");
    assert.equal(textoDuracion(3900), "1 h 05 min");
    assert.equal(textoTamano(500), "1 KB");
    assert.equal(textoTamano(480_000), "480 KB");
    assert.equal(textoTamano(34_500_000), "35 MB");
    assert.equal(textoTamano(1_200_000_000), "1,2 GB");
  });
  it("cuándo se borra el audio", () => {
    const ahora = new Date(2026, 9, 10, 12).getTime();
    assert.match(textoVencimiento(audio({ vencido: true }), ahora), /ya venció/);
    assert.equal(textoVencimiento(audio({ venceEn: new Date(2026, 9, 13, 8).toISOString() }), ahora), "se borra en 3 días");
    assert.equal(textoVencimiento(audio({ venceEn: new Date(2026, 9, 10, 20).toISOString() }), ahora), "se borra en menos de un día");
    assert.equal(textoVencimiento(audio(), ahora), "");
  });
  it("el total", () => {
    assert.equal(totalGrabaciones(null), 0);
    assert.equal(totalGrabaciones({ transcripciones: [], audios: [audio(), audio()], diasAudio: 7 }), 2);
  });
});

describe("la pestaña Grabar", () => {
  it("la duración sale del tamaño del WAV (mono, 16 kHz, 16 bits)", () => {
    assert.equal(duracionDeAudio(44 + 32_000 * 60), 60);
    assert.equal(duracionDeAudio(10), 0);
    assert.equal(duracionDeAudio(159_360_000), 4980);
  });
  it("el estado de un audio", () => {
    assert.equal(estadoDeAudio(audio(), undefined), "sin-transcribir");
    assert.equal(estadoDeAudio(audio({ transcrito: true }), undefined), "transcrita");
    assert.equal(estadoDeAudio(audio(), "en-cola"), "en-cola");
    assert.equal(estadoDeAudio(audio(), "transcribiendo"), "transcribiendo");
    assert.equal(estadoDeAudio(audio(), "error"), "error");
    // Si ya tiene su texto, un error viejo no manda.
    assert.equal(estadoDeAudio(audio({ transcrito: true }), "error"), "transcrita");
    assert.equal(estadoDeAudio(audio(), "cancelada"), "sin-transcribir");
    assert.equal(TEXTO_ESTADO_AUDIO.transcrita, "Transcrita");
  });
  it("los textos del botón y de lo vacío", () => {
    assert.equal(textoBotonGrabar("inactiva"), "Nueva grabación");
    assert.match(textoBotonGrabar("pregunta"), /pregunta/);
    assert.match(textoVacioGrabar("audios", true), /micrófono/);
    assert.match(textoVacioGrabar("textos", true), /Transcribir/);
    assert.match(textoVacioGrabar("textos", false), /apagado/);
  });
});

describe("copiar una transcripción", () => {
  it("dice cómo salió", () => {
    assert.equal(textoCopiado(true, false), "Copiado ✓");
    assert.match(textoCopiado(true, true), /recortado/);
    assert.equal(textoCopiado(false, false), "No pude copiar");
  });
});
