// La cola de transcripciones (grabaciones.ts) sin proceso hijo: de a una, en orden, cancelable, con
// errores avisados sin tumbar la cola. Carpetas temporales; `transcribir` es un doble.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { Transcriptor, fechaIsoLocal, limpiarAudiosVencidos, type AvisoTranscripcion } from "../src/grabaciones.ts";
import { wavDeSilencio } from "./ayuda-whisper.ts";

const IDS = ["2026-10-05-100000", "2026-10-05-110000", "2026-10-05-120000"];

function montaje() {
  const raiz = mkdtempSync(join(tmpdir(), "cola-"));
  const grabaciones = join(raiz, "g");
  const transcripciones = join(raiz, "t");
  mkdirSync(grabaciones);
  for (const id of IDS) writeFileSync(join(grabaciones, `${id}.wav`), wavDeSilencio(1));
  const avisos: AvisoTranscripcion[] = [];
  return { raiz, grabaciones, transcripciones, avisos };
}

const esperar = async (condicion: () => boolean) => {
  const limite = Date.now() + 3000;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error("se acabó el tiempo");
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe("Transcriptor", () => {
  it("corre de a una, en orden, y guarda cada resultado", async () => {
    const m = montaje();
    const orden: string[] = [];
    let simultaneas = 0;
    let maxima = 0;
    const t = new Transcriptor({
      carpetaGrabaciones: m.grabaciones,
      carpetaTranscripciones: m.transcripciones,
      modelo: () => "small",
      avisar: (a) => m.avisos.push(a),
      transcribir: async (audio) => {
        simultaneas++;
        maxima = Math.max(maxima, simultaneas);
        orden.push(audio.slice(-21, -4));
        await new Promise((r) => setTimeout(r, 30));
        simultaneas--;
        return [{ inicioSeg: 0, finSeg: 1, texto: "hola" }];
      },
    });
    for (const id of IDS) t.pedir(id, "si");
    assert.deepEqual(t.pendientes(), IDS);
    await esperar(() => m.avisos.filter((a) => a.fase === "lista").length === 3);
    assert.deepEqual(orden, IDS);
    assert.equal(maxima, 1);
    assert.deepEqual(t.pendientes(), []);
    assert.match(readFileSync(join(m.transcripciones, `${IDS[0]}.md`), "utf8"), /avisoAPresentes: si/);
  });

  it("un error se avisa y la cola sigue; cancelar quita de la cola o corta la que corre", async () => {
    const m = montaje();
    let llamadas = 0;
    const t = new Transcriptor({
      carpetaGrabaciones: m.grabaciones,
      carpetaTranscripciones: m.transcripciones,
      modelo: () => "small",
      avisar: (a) => m.avisos.push(a),
      transcribir: (_audio, _modelo, senal) => {
        llamadas++;
        if (llamadas === 1) return Promise.reject(new Error("falta el modelo"));
        return new Promise((_ok, fallo) => senal.addEventListener("abort", () => fallo(new Error("abortada"))));
      },
    });
    for (const id of IDS) t.pedir(id);
    assert.equal(t.cancelar(IDS[2]), true, "la de la cola se quita");
    await esperar(() => m.avisos.some((a) => a.id === IDS[0] && a.fase === "error"));
    assert.match(m.avisos.find((a) => a.fase === "error")!.texto, /falta el modelo/);
    await esperar(() => llamadas === 2);
    assert.equal(t.cancelar(IDS[1]), true, "la que corre se corta");
    await esperar(() => m.avisos.some((a) => a.id === IDS[1] && a.fase === "cancelada"));
    assert.equal(t.cancelar("2026-01-01-000000"), false);
    assert.equal(llamadas, 2, "la cancelada de la cola nunca corrió");
    await esperar(() => t.pendientes().length === 0);
  });

  it("rechaza ids raros, audios que no están, repetidas y las que ya tienen transcripción", async () => {
    const m = montaje();
    const t = new Transcriptor({
      carpetaGrabaciones: m.grabaciones,
      carpetaTranscripciones: m.transcripciones,
      modelo: () => "small",
      avisar: (a) => m.avisos.push(a),
      transcribir: () => new Promise(() => {}),
    });
    for (const mal of ["x", "../x", "2026-02-31-100000", "", null, 7]) assert.throws(() => t.pedir(mal), /no válido/, String(mal));
    assert.throws(() => t.pedir("2026-10-05-235959"));
    assert.throws(() => t.pedir(IDS[0], "tal vez"), /avisoAPresentes/);
    t.pedir(IDS[0]);
    assert.throws(() => t.pedir(IDS[0]), /ya está en la cola/);
    t.detener();
  });

  it("la fecha de la cabecera lleva la hora local con su desfase", () => {
    assert.match(fechaIsoLocal(new Date(2026, 9, 5, 10, 30, 0)), /^2026-10-05T10:30:00[+-]\d{2}:\d{2}$/);
  });

  // En Mac el borrado va a la Papelera real (osascript): no se prueba aquí, como en las pruebas del motor.
  it("limpiarAudiosVencidos usa los días indicados y solo toca la carpeta dada", { skip: process.platform === "darwin" }, () => {
    const m = montaje();
    writeFileSync(join(m.grabaciones, "2026-09-01-080000.wav"), wavDeSilencio(1));
    writeFileSync(join(m.grabaciones, "notas.txt"), "no soy un audio");
    assert.deepEqual(limpiarAudiosVencidos(new Date(2026, 9, 5, 13, 0, 0), m.grabaciones, 7), ["2026-09-01-080000"]);
    assert.ok(readFileSync(join(m.grabaciones, "notas.txt"), "utf8"));
  });
});
