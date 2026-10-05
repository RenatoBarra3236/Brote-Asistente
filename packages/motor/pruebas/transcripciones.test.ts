import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  escribirTranscripcion,
  fechaDeId,
  formatearMarca,
  idDeGrabacion,
  leerCabecera,
  leerTranscripcion,
  partirEnTrozos,
  textoConMarcas,
  type Transcripcion,
} from "../src/transcripciones.ts";

const ARMADA: Transcripcion = {
  id: "2026-10-04-103000",
  fecha: "2026-10-04T10:30:00-03:00",
  duracionSeg: 3725,
  origen: "pc",
  modelo: "small",
  idioma: "es",
  avisoAPresentes: "si",
  segmentos: [
    { inicioSeg: 0, finSeg: 7, texto: "Buenos días, hoy vemos derivadas." },
    { inicioSeg: 7, finSeg: 3700, texto: "Partimos con la regla de la cadena." },
    { inicioSeg: 3700, finSeg: 3725, texto: "Eso es todo por hoy." },
  ],
};

describe("ids y marcas", () => {
  it("el id sale de la hora local y vuelve igual", () => {
    const fecha = new Date(2026, 9, 4, 10, 30, 5);
    assert.equal(idDeGrabacion(fecha), "2026-10-04-103005");
    assert.deepEqual(fechaDeId("2026-10-04-103005"), fecha);
  });

  it("rechaza ids que no tienen la forma exacta o son fechas imposibles", () => {
    for (const malo of ["", "2026-10-04", "../2026-10-04-103005", "2026-10-04-103005.md", "2026-02-31-103005", "2026-10-04-256100"]) {
      assert.equal(fechaDeId(malo), null, malo);
    }
  });

  it("formatea marcas de tiempo", () => {
    assert.equal(formatearMarca(0), "[00:00:00]");
    assert.equal(formatearMarca(3725.9), "[01:02:05]");
    assert.equal(formatearMarca(-4), "[00:00:00]");
  });
});

describe("formato del archivo", () => {
  it("escribe la cabecera y el texto con marcas", () => {
    const texto = escribirTranscripcion(ARMADA);
    assert.match(texto, /^---\nfecha: 2026-10-04T10:30:00-03:00\nduracionSeg: 3725\norigen: pc\nmodelo: small\nidioma: es\navisoAPresentes: si\n---\n\n\[00:00:00\] Buenos días/);
    assert.match(texto, /\[01:01:40\] Eso es todo por hoy\.\n$/);
  });

  it("lo escrito se lee igual (ida y vuelta)", () => {
    assert.deepEqual(leerTranscripcion(ARMADA.id, escribirTranscripcion(ARMADA)), ARMADA);
  });

  it("une en una línea los saltos del texto y descarta segmentos vacíos", () => {
    const texto = escribirTranscripcion({ ...ARMADA, segmentos: [{ inicioSeg: 1, finSeg: 2, texto: "hola\n---\n  mundo " }, { inicioSeg: 3, finSeg: 4, texto: "  " }] });
    const leida = leerTranscripcion(ARMADA.id, texto)!;
    assert.equal(leida.segmentos.length, 1);
    assert.equal(leida.segmentos[0].texto, "hola --- mundo");
  });

  it("lee líneas sin marca como continuación y tolera CRLF", () => {
    const texto = escribirTranscripcion(ARMADA).replace("derivadas.", "derivadas.\ny más").replace(/\n/g, "\r\n");
    assert.equal(leerTranscripcion(ARMADA.id, texto)!.segmentos[0].texto, "Buenos días, hoy vemos derivadas. y más");
  });

  it("solo la cabecera se puede leer sin el texto", () => {
    const { segmentos, ...cabecera } = ARMADA;
    assert.ok(segmentos.length);
    assert.deepEqual(leerCabecera(ARMADA.id, escribirTranscripcion(ARMADA)), cabecera);
  });

  it("no escribe valores inválidos", () => {
    assert.throws(() => escribirTranscripcion({ ...ARMADA, origen: "nube" as any }));
    assert.throws(() => escribirTranscripcion({ ...ARMADA, avisoAPresentes: "quizás" as any }));
    assert.throws(() => escribirTranscripcion({ ...ARMADA, modelo: "small\norigen: casa" }));
    assert.throws(() => escribirTranscripcion({ ...ARMADA, duracionSeg: NaN }));
    assert.throws(() => escribirTranscripcion({ ...ARMADA, id: "../x" }));
  });

  it("no lee archivos rotos o ajenos", () => {
    const bueno = escribirTranscripcion(ARMADA);
    assert.equal(leerTranscripcion(ARMADA.id, "solo texto"), null);
    assert.equal(leerTranscripcion(ARMADA.id, bueno.replace("origen: pc\n", "")), null);
    assert.equal(leerTranscripcion(ARMADA.id, bueno.replace("origen: pc", "origen: nube")), null);
    assert.equal(leerTranscripcion(ARMADA.id, bueno.replace("avisoAPresentes: si", "avisoAPresentes: tal vez")), null);
    assert.equal(leerTranscripcion(ARMADA.id, bueno.replace("---\n\n", "")), null);
    assert.equal(leerTranscripcion("otra-cosa", bueno), null);
  });

  it("acepta los tres orígenes y las tres respuestas del aviso", () => {
    for (const origen of ["pc", "celular", "casa"] as const) {
      for (const aviso of ["si", "no", "solo-mi-voz"] as const) {
        const t = { ...ARMADA, origen, avisoAPresentes: aviso };
        assert.deepEqual(leerTranscripcion(t.id, escribirTranscripcion(t)), t);
      }
    }
  });
});

describe("partir en trozos", () => {
  const frase = (i: number) => ({ inicioSeg: i * 10, finSeg: i * 10 + 10, texto: `Frase número ${i} de la clase sobre límites y continuidad.` });

  it("una transcripción corta es un solo trozo", () => {
    const trozos = partirEnTrozos(ARMADA.segmentos);
    assert.equal(trozos.length, 1);
    assert.deepEqual([trozos[0].numero, trozos[0].total, trozos[0].desdeSeg, trozos[0].hastaSeg], [1, 1, 0, 3725]);
    assert.equal(trozos[0].texto, textoConMarcas(ARMADA.segmentos));
  });

  it("una larga se parte entre segmentos, sin pasarse ni perder nada", () => {
    const segmentos = Array.from({ length: 200 }, (_, i) => frase(i));
    const trozos = partirEnTrozos(segmentos, 1000);
    assert.ok(trozos.length > 5);
    for (const t of trozos) assert.ok(t.texto.length <= 1000, `trozo ${t.numero}: ${t.texto.length}`);
    assert.deepEqual(trozos.map((t) => t.numero), trozos.map((_, i) => i + 1));
    assert.ok(trozos.every((t) => t.total === trozos.length));
    assert.equal(trozos.map((t) => t.texto).join("\n"), textoConMarcas(segmentos));
    assert.equal(trozos[0].desdeSeg, 0);
    assert.equal(trozos.at(-1)!.hastaSeg, 2000);
    for (let i = 1; i < trozos.length; i++) assert.ok(trozos[i].desdeSeg >= trozos[i - 1].desdeSeg);
  });

  it("corta entre palabras un segmento más largo que el máximo", () => {
    const largo = "palabra ".repeat(100).trim();
    const trozos = partirEnTrozos([{ inicioSeg: 5, finSeg: 60, texto: largo }], 200);
    assert.ok(trozos.length >= 4);
    for (const t of trozos) {
      assert.ok(t.texto.length <= 200);
      assert.match(t.texto, /^\[00:00:05\] (palabra ?)+$/);
    }
    const recuperado = trozos.map((t) => t.texto.replace("[00:00:05] ", "")).join(" ");
    assert.equal(recuperado, largo);
  });

  it("sin texto no hay trozos, y el máximo no puede ser ridículo", () => {
    assert.deepEqual(partirEnTrozos([]), []);
    assert.deepEqual(partirEnTrozos([{ inicioSeg: 0, finSeg: 1, texto: "  " }]), []);
    assert.throws(() => partirEnTrozos(ARMADA.segmentos, 10));
  });
});
