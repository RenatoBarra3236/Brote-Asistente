import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { MENSAJE_APAGADA } from "../src/funciones.ts";
import { describirGrabadoHoy, describirTranscripciones, duracionCorta } from "../src/grabaciones-frases.ts";
import type { CabeceraTranscripcion } from "../src/transcripciones.ts";

// Jueves 1 de octubre de 2026, 13:00 (hora local).
const AHORA = new Date(2026, 9, 1, 13, 0);

const cab = (id: string, duracionSeg: number, avisoAPresentes: "si" | "no" | "solo-mi-voz" = "si"): CabeceraTranscripcion => ({
  id,
  fecha: "x",
  duracionSeg,
  origen: "pc",
  modelo: "small",
  idioma: "es",
  avisoAPresentes,
});

function motor(activa = true, lista: CabeceraTranscripcion[] = []): Motor {
  return new Motor(new Gastos(":memory:"), { reloj: () => AHORA, activa: (f) => f !== "grabaciones" || activa, transcripciones: () => lista });
}

describe("grabar sin IA", () => {
  const iniciar = ["graba esta clase", "Graba esta clase", "empieza a grabar", "inicia la grabación", "quiero grabar la reunión", "grábame esta charla"];
  for (const frase of iniciar) {
    it(`«${frase}» pide iniciar, sin iniciar nada`, () => {
      const r = motor().resolver(frase);
      assert.equal(r?.intencion, "grabar-iniciar");
      assert.deepEqual(r?.datos, { grabar: "iniciar" });
    });
  }
  for (const frase of ["para la grabación", "detén la grabación", "deja de grabar", "termina la grabación"]) {
    it(`«${frase}» pide detener`, () => {
      const r = motor().resolver(frase);
      assert.equal(r?.intencion, "grabar-detener");
      assert.deepEqual(r?.datos, { grabar: "detener" });
    });
  }
  it("«¿estoy grabando?» pide el estado", () => {
    assert.deepEqual(motor().resolver("¿estoy grabando?")?.datos, { grabar: "estado" });
  });
  it("con la función apagada responde que está apagada y no pide nada", () => {
    for (const frase of ["graba esta clase", "para la grabación", "¿estoy grabando?", "mis transcripciones", "¿qué grabé hoy?"]) {
      const r = motor(false).resolver(frase);
      assert.equal(r?.texto, MENSAJE_APAGADA, frase);
      assert.equal(r?.datos, undefined, frase);
    }
  });
});

describe("transcripciones sin IA", () => {
  it("«mis transcripciones» lista las últimas", () => {
    const lista = [cab("2026-10-01-100000", 3600), cab("2026-09-30-090000", 600, "solo-mi-voz")];
    const texto = motor(true, lista).resolver("mis transcripciones")?.texto ?? "";
    assert.match(texto, /hoy 10:00 · 1 h 00 min · avisé/);
    assert.match(texto, /ayer 09:00 · 10 min · solo mi voz/);
  });
  it("sin transcripciones lo dice", () => {
    assert.match(motor().resolver("mis grabaciones")?.texto ?? "", /Todavía no tienes/);
  });
  it("«¿qué grabé hoy?» cuenta solo las de hoy", () => {
    const lista = [cab("2026-10-01-100000", 1800), cab("2026-10-01-110000", 1800), cab("2026-09-30-090000", 600)];
    const texto = motor(true, lista).resolver("¿qué grabé hoy?")?.texto ?? "";
    assert.match(texto, /2 grabaciones \(1 h 00 min en total\)/);
    assert.doesNotMatch(texto, /ayer/);
  });
  it("sin nada hoy", () => {
    assert.match(describirGrabadoHoy([cab("2026-09-30-090000", 600)], AHORA), /Hoy no has grabado/);
  });
  it("más de cinco: avisa dónde ver el resto", () => {
    const lista = Array.from({ length: 7 }, (_, i) => cab(`2026-09-2${i}-100000`, 60));
    assert.match(describirTranscripciones(lista, AHORA), /Y 2 más en/);
  });
  it("sin la lista conectada (servidor MCP) va al agente", () => {
    const sinLista = new Motor(new Gastos(":memory:"), { reloj: () => AHORA });
    assert.equal(sinLista.resolver("mis transcripciones"), null);
  });
  it("duración corta", () => {
    assert.equal(duracionCorta(20), "1 min");
    assert.equal(duracionCorta(3900), "1 h 05 min");
  });
});

describe("frases de control que no deben calzar", () => {
  for (const frase of [
    "grabé la clase de ayer, ¿me la resumes?",
    "resume mi última grabación",
    "grábate esto en la memoria",
    "gasté 3 lucas en grabaciones",
    "esta clase me aburre",
    "estoy grabando un video para youtube",
    "no quiero grabar nada",
    "pon la grabación en la música",
    "empieza a estudiar",
    "para el pomodoro",
    "mis transcripciones de inglés tienen errores, corrígelas",
    "qué grabaciones hay de calculo",
    "hola",
  ]) {
    it(`«${frase}» sigue su camino`, () => {
      const r = motor().resolver(frase);
      assert.ok(r === null || !/^(grabar|transcripciones)-/.test(r.intencion), `${frase} calzó como ${r?.intencion}`);
    });
  }
});
