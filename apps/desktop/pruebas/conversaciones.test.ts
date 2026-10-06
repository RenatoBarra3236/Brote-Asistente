import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ID_ACTUAL,
  RETOMAR_MAX_MENSAJES,
  RETOMAR_MAX_POR_MENSAJE,
  RETOMAR_MAX_TOTAL,
  cuentaDeMensajes,
  etiquetaDeFecha,
  lineaDeConversacion,
  mensajeParaRetomar,
  type ConversacionLeida,
  type MensajeChat,
} from "../src/agente/conversaciones.ts";

const AHORA = new Date(2026, 9, 6, 18, 0);

const mensajes = (n: number, largo = 20): MensajeChat[] =>
  Array.from({ length: n }, (_, i) => ({ rol: i % 2 === 0 ? ("tu" as const) : ("brote" as const), texto: `${i}`.padEnd(largo, "x"), t: i }));

const leida = (ms: MensajeChat[], extra: Partial<ConversacionLeida> = {}): ConversacionLeida => ({
  id: "2026-10-05-1841.md",
  titulo: "Conversación del 5 de octubre, 18:41",
  resumen: "Tú: hola\nBrote: hola",
  mensajes: ms,
  recortada: false,
  ...extra,
});

describe("Anteriores", () => {
  it("las fechas dicen hoy y ayer con hora, y después el día", () => {
    assert.equal(etiquetaDeFecha(new Date(2026, 9, 6, 9, 5).toISOString(), AHORA), "hoy 09:05");
    assert.equal(etiquetaDeFecha(new Date(2026, 9, 5, 18, 41).toISOString(), AHORA), "ayer 18:41");
    assert.equal(etiquetaDeFecha(new Date(2026, 9, 2, 15, 23).toISOString(), AHORA), "2 oct");
    assert.equal(etiquetaDeFecha("no es fecha", AHORA), "");
  });

  it("la cuenta de mensajes y la línea de la lista", () => {
    assert.equal(cuentaDeMensajes(0), "solo el resumen");
    assert.equal(cuentaDeMensajes(1), "1 mensaje");
    assert.equal(cuentaDeMensajes(12), "12 mensajes");
    const c = { id: "x", titulo: "t", fecha: new Date(2026, 9, 5, 18, 41).toISOString(), extracto: "", mensajes: 12 };
    assert.equal(lineaDeConversacion(c, AHORA), "12 mensajes · ayer 18:41");
  });

  it("«Retomar» pasa lo último que se habló, con tope de mensajes, de largo y de total", () => {
    const texto = mensajeParaRetomar(leida(mensajes(30)));
    const lineasDeChat = texto.split("\n").filter((l) => /^(Tú|Brote): /.test(l));
    assert.equal(lineasDeChat.length, RETOMAR_MAX_MENSAJES);
    assert.ok(lineasDeChat[lineasDeChat.length - 1].startsWith("Brote: 29"), "lo último es lo que queda");
    assert.ok(texto.startsWith("Retomemos una conversación anterior (la del 5 de octubre, 18:41)."));
    assert.ok(texto.endsWith("Sigamos desde ahí."));
    const largo = mensajeParaRetomar(leida(mensajes(3, 5000)));
    assert.ok(largo.split("\n").every((l) => l.length <= RETOMAR_MAX_POR_MENSAJE + 40));
    assert.match(largo, /\[…recortado\]/);
    assert.match(largo, /no se incluyó/);
    // Un mensaje largo pero dentro del tope (como el hallazgo con fuentes de una respuesta real) llega entero.
    const entero = mensajeParaRetomar(leida([{ rol: "brote", texto: "hallazgo ".repeat(150) + "https://phys.org/fuente", t: 1 }]));
    assert.match(entero, /https:\/\/phys\.org\/fuente/);
    assert.doesNotMatch(entero, /recortado/);
    assert.ok(largo.length <= RETOMAR_MAX_TOTAL + 600);
  });

  it("sin chat completo retoma con el resumen; la conversación de ahora tiene su propio saludo", () => {
    const texto = mensajeParaRetomar(leida([]));
    assert.match(texto, /Tú: hola\nBrote: hola/);
    assert.match(mensajeParaRetomar(leida(mensajes(2), { id: ID_ACTUAL, titulo: "La conversación de ahora" })), /^Retomemos nuestra conversación de antes\./);
  });
});
