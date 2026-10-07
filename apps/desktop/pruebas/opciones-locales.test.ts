// Los botones de las respuestas del motor sin IA (confirmar, sugerencias, ayuda), el autocompletado y el formulario «+ Gasto».
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Agente } from "../src/agente/agente.ts";
import { autocompletar } from "../src/agente/autocompletar.ts";
import { CONVERSACION_INICIAL, aplicar } from "../src/agente/conversacion.ts";
import { validarGasto, leerMontoDelCampo } from "../src/agente/gasto-formulario.ts";
import { TEXTO_RECHAZADO, opcionesDe } from "../src/agente/opciones-locales.ts";
import type { Marco, ResultadoEnvio, Transporte } from "../src/agente/transporte.ts";

const confirmar = { confirmar: { pregunta: "¿Anoto $5.000 en almuerzo?", frase: "gaste 5 lucas en almuerzo", original: "almuerzo 5 lucas" } };

describe("opciones de la respuesta del motor", () => {
  test("confirmar: Sí (destacado) y No", () => {
    const o = opcionesDe("confirmar", confirmar);
    assert.deepEqual(o.map((x) => x.etiqueta), ["Sí", "No"]);
    assert.deepEqual(o[0].accion, { tipo: "confirmar", frase: "gaste 5 lucas en almuerzo", original: "almuerzo 5 lucas" });
    assert.equal(o[0].destacada, true);
    assert.deepEqual(o[1].accion, { tipo: "rechazar" });
  });
  test("elegir el monto: un botón por monto, que anota ese gasto", () => {
    const o = opcionesDe("elegir-monto", { elegirMonto: { original: "gasté 5 lucas y 3 mil en el almuerzo", opciones: [{ etiqueta: "$5.000 en almuerzo", frase: "gaste 5 lucas en almuerzo" }, { etiqueta: "$3.000 en almuerzo", frase: "gaste 3 mil en almuerzo" }] } });
    assert.deepEqual(o.map((x) => x.etiqueta), ["$5.000 en almuerzo", "$3.000 en almuerzo"]);
    assert.deepEqual(o[1].accion, { tipo: "confirmar", frase: "gaste 3 mil en almuerzo", original: "gasté 5 lucas y 3 mil en el almuerzo" });
    assert.deepEqual(opcionesDe("elegir-monto", { elegirMonto: { opciones: [{ etiqueta: "x", frase: "y" }] } }), []);
  });
  test("no te entendí: hasta 3 sugerencias (que recuerdan lo escrito) y «Ver ayuda»", () => {
    const o = opcionesDe("no-entendi", { noEntendi: { original: "xx", sugerencias: ["a b", "c d", "e f", "g h"] } });
    assert.deepEqual(o.map((x) => x.etiqueta), ["a b", "c d", "e f", "Ver ayuda"]);
    assert.deepEqual(o[0].accion, { tipo: "confirmar", frase: "a b", original: "xx" });
    assert.deepEqual(o[3].accion, { tipo: "enviar", texto: "ayuda" });
    assert.deepEqual(opcionesDe("no-entendi", { noEntendi: { original: "xx", sugerencias: [] } }).map((x) => x.etiqueta), ["Ver ayuda"]);
  });
  test("ayuda: las áreas o los ejemplos se mandan como mensajes", () => {
    const o = opcionesDe("ayuda", { ayuda: { area: null, areas: [{ id: "gastos", titulo: "Gastos", emoji: "💸", frase: "ayuda con gasto" }], ejemplos: [] } });
    assert.deepEqual(o.map((x) => x.etiqueta), ["💸 Gastos"]);
    assert.deepEqual(o[0].accion, { tipo: "enviar", texto: "ayuda con gasto" });
    const e = opcionesDe("ayuda", { ayuda: { area: "gastos", areas: [], ejemplos: ["gasté 5 lucas en almuerzo"] } });
    assert.deepEqual(e[0].accion, { tipo: "enviar", texto: "gasté 5 lucas en almuerzo" });
  });
  test("no se fía de datos mal formados ni de frases larguísimas", () => {
    assert.deepEqual(opcionesDe("confirmar", undefined), []);
    assert.deepEqual(opcionesDe("confirmar", { confirmar: { frase: 3 } }), []);
    assert.deepEqual(opcionesDe("confirmar", { confirmar: { frase: "x".repeat(400) } }), []);
    assert.deepEqual(opcionesDe("no-entendi", { noEntendi: { sugerencias: [5, null, "x".repeat(200)] } }).map((x) => x.etiqueta), ["Ver ayuda"]);
    assert.deepEqual(opcionesDe("registrar-gasto", confirmar), []);
  });
});

describe("la conversación guarda y usa las opciones", () => {
  test("una respuesta sin IA trae sus botones y «usadas» los quita", () => {
    const o = opcionesDe("confirmar", confirmar);
    const c = aplicar(CONVERSACION_INICIAL, { tipo: "resuelto-sin-ia", texto: "¿Anoto…?", opciones: o });
    assert.equal(c.opciones.length, 2);
    assert.equal(c.estado, "listo");
    assert.equal(aplicar(c, { tipo: "opciones-usadas" }).opciones.length, 0);
    assert.equal(aplicar(CONVERSACION_INICIAL, { tipo: "resuelto-sin-ia", texto: "listo" }).opciones.length, 0);
  });
});

class TransporteDePrueba implements Transporte {
  enviados: string[] = [];
  confirmados: [string, string | null][] = [];
  async enviar(texto: string): Promise<ResultadoEnvio> {
    this.enviados.push(texto);
    return { local: { texto: "¿Anoto $5.000 en almuerzo?", intencion: "confirmar", datos: confirmar } };
  }
  async confirmarFrase(frase: string, original: string | null): Promise<ResultadoEnvio> {
    this.confirmados.push([frase, original]);
    return { local: { texto: "Anotado: $5.000 en almuerzo.", intencion: "registrar-gasto" } };
  }
  async resolverAprobacion(): Promise<void> {}
  escuchar(_: (m: Marco) => void): () => void {
    return () => {};
  }
}

describe("Agente.elegir", () => {
  test("Sí confirma la frase, recuerda lo escrito y muestra el resultado sin botones", async () => {
    const t = new TransporteDePrueba();
    const a = new Agente(t);
    await a.enviar("almuerzo 5 lucas");
    assert.equal(a.conversacion.opciones.length, 2);
    await a.elegir(a.conversacion.opciones[0]);
    assert.deepEqual(t.confirmados, [["gaste 5 lucas en almuerzo", "almuerzo 5 lucas"]]);
    assert.equal(a.conversacion.respuesta, "Anotado: $5.000 en almuerzo.");
    assert.equal(a.conversacion.opciones.length, 0);
  });
  test("No no hace nada y lo dice", async () => {
    const t = new TransporteDePrueba();
    const a = new Agente(t);
    await a.enviar("almuerzo 5 lucas");
    await a.elegir(a.conversacion.opciones[1]);
    assert.deepEqual(t.confirmados, []);
    assert.equal(a.conversacion.respuesta, TEXTO_RECHAZADO);
    assert.equal(a.conversacion.opciones.length, 0);
  });
  test("una opción de enviar manda ese mensaje", async () => {
    const t = new TransporteDePrueba();
    const a = new Agente(t);
    await a.elegir({ etiqueta: "Ver ayuda", accion: { tipo: "enviar", texto: "ayuda" } });
    assert.deepEqual(t.enviados, ["ayuda"]);
  });
  test("si el transporte falla, lo dice sin error técnico crudo", async () => {
    const t = new TransporteDePrueba();
    t.confirmarFrase = async () => {
      throw new Error("Esa frase ya no se puede hacer");
    };
    const a = new Agente(t);
    await a.enviar("almuerzo 5 lucas");
    assert.equal(await a.elegir(a.conversacion.opciones[0]), false);
    assert.match(a.conversacion.error ?? "", /No pude hacerlo: Esa frase ya no se puede hacer/);
  });
});

describe("autocompletar", () => {
  const todas = () => true;
  test("sugiere hasta 3 frases de la guía que empiezan con lo escrito", () => {
    const s = autocompletar("cuánto he g", todas);
    assert.ok(s.length >= 1 && s.length <= 3);
    assert.ok(s.every((f) => /gast/.test(f)));
  });
  test("completa el nombre de tu ramo", () => {
    assert.deepEqual(autocompletar("cómo voy en cal", todas, ["Cálculo", "Física"])[0], "cómo voy en Cálculo");
    assert.ok(autocompletar("cal", todas, ["Cálculo"]).includes("todo lo de Cálculo"));
  });
  test("no ofrece frases de funciones apagadas ni con menos de 2 letras ni lo mismo que ya escribió", () => {
    assert.deepEqual(autocompletar("g", todas), []);
    assert.ok(!autocompletar("pausa la mús", (f) => f !== "musica").some((f) => /música/.test(f)));
    assert.ok(!autocompletar("qué tengo hoy", todas).includes("qué tengo hoy"));
  });
});

describe("formulario «+ Gasto»", () => {
  test("lee el monto como cifra, lucas o con signo", () => {
    assert.equal(leerMontoDelCampo("3500"), 3500);
    assert.equal(leerMontoDelCampo("$5.000"), 5000);
    assert.equal(leerMontoDelCampo("5 lucas"), 5000);
    assert.equal(leerMontoDelCampo("2,5 lucas"), 2500);
    assert.equal(leerMontoDelCampo("abc"), null);
    assert.equal(leerMontoDelCampo(""), null);
    assert.equal(leerMontoDelCampo("0"), null);
  });
  test("valida monto, largo y categoría", () => {
    assert.deepEqual(validarGasto({ monto: "3500", descripcion: " café ", categoria: "comida" }), { ok: true, monto: 3500, descripcion: "café", categoria: "comida" });
    assert.deepEqual(validarGasto({ monto: "3500", descripcion: "", categoria: "auto" }), { ok: true, monto: 3500, descripcion: null, categoria: "auto" });
    assert.equal(validarGasto({ monto: "", descripcion: "x", categoria: "auto" }).ok, false);
    assert.equal(validarGasto({ monto: "999999999999", descripcion: "x", categoria: "auto" }).ok, false);
    assert.equal(validarGasto({ monto: "100", descripcion: "x".repeat(201), categoria: "auto" }).ok, false);
    assert.deepEqual(validarGasto({ monto: "100", descripcion: "", categoria: "rara" as any }), { ok: true, monto: 100, descripcion: null, categoria: "auto" });
  });
});
