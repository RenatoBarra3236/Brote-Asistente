// Solo con carpetas temporales: nunca toca las grabaciones ni las transcripciones del usuario.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { guardarTranscripcion, type Transcripcion } from "@asistente/motor";
import { borrarDeGrabaciones, listarGrabaciones, verTranscripcion, type Carpetas } from "../src/memoria-grabaciones.ts";

const RAIZ = mkdtempSync(join(tmpdir(), "memoria-grabaciones-"));
after(() => rmSync(RAIZ, { recursive: true, force: true }));

let carpetas: Carpetas;
beforeEach(() => {
  carpetas = { transcripciones: mkdtempSync(join(RAIZ, "t-")), grabaciones: mkdtempSync(join(RAIZ, "a-")) };
});

const armar = (id: string, texto = "clase de cálculo"): Transcripcion => ({
  id,
  fecha: "2026-10-04T10:30:00-03:00",
  duracionSeg: 1800,
  origen: "pc",
  modelo: "small",
  idioma: "es",
  avisoAPresentes: "solo-mi-voz",
  segmentos: [{ inicioSeg: 0, finSeg: 5, texto }],
});

const AHORA = new Date(2026, 9, 10, 12, 0);

/** Los que "se borrarían": en vez de la Papelera, un registro. */
const espia = () => {
  const rutas: string[] = [];
  return { rutas, eliminar: (r: string) => void rutas.push(r) };
};

describe("la lista de grabaciones", () => {
  it("junta transcripciones y audios, del más nuevo al más viejo, con aviso y duración", () => {
    guardarTranscripcion(armar("2026-10-01-080000"), carpetas.transcripciones);
    guardarTranscripcion(armar("2026-10-03-080000"), carpetas.transcripciones);
    writeFileSync(join(carpetas.grabaciones, "2026-10-03-080000.wav"), "x".repeat(10));
    writeFileSync(join(carpetas.grabaciones, "2026-10-09-080000.wav"), "x");
    const lista = listarGrabaciones(7, AHORA, carpetas);
    assert.deepEqual(lista.transcripciones.map((t) => t.id), ["2026-10-03-080000", "2026-10-01-080000"]);
    assert.equal(lista.transcripciones[0].avisoAPresentes, "solo-mi-voz");
    assert.equal(lista.transcripciones[0].duracionSeg, 1800);
    assert.deepEqual(lista.audios.map((a) => [a.id, a.transcrito, a.vencido]), [
      ["2026-10-09-080000", false, false],
      ["2026-10-03-080000", true, true],
    ]);
  });

  it("marca el audio vencido y dice cuándo se borra", () => {
    writeFileSync(join(carpetas.grabaciones, "2026-10-01-080000.wav"), "x");
    const [audio] = listarGrabaciones(7, AHORA, carpetas).audios;
    assert.equal(audio.vencido, true);
    assert.equal(new Date(audio.venceEn!).getTime(), new Date(2026, 9, 8, 8, 0).getTime());
  });

  it("no mete en la lista lo que no es suyo", () => {
    writeFileSync(join(carpetas.grabaciones, "notas.wav"), "x");
    writeFileSync(join(carpetas.transcripciones, "notas.md"), "x");
    const lista = listarGrabaciones(7, AHORA, carpetas);
    assert.deepEqual([lista.transcripciones, lista.audios], [[], []]);
  });

  it("no incluye el texto de las transcripciones", () => {
    guardarTranscripcion(armar("2026-10-01-080000", "dato muy personal"), carpetas.transcripciones);
    assert.doesNotMatch(JSON.stringify(listarGrabaciones(7, AHORA, carpetas)), /dato muy personal/);
  });
});

describe("ver una transcripción", () => {
  it("devuelve el texto con marcas de tiempo", () => {
    guardarTranscripcion(armar("2026-10-01-080000", "hola"), carpetas.transcripciones);
    assert.deepEqual(verTranscripcion("2026-10-01-080000", carpetas), { texto: "[00:00:00] hola", recortado: false });
  });
  it("un id raro o inexistente da null", () => {
    assert.equal(verTranscripcion("../x", carpetas), null);
    assert.equal(verTranscripcion("2026-10-01-080000", carpetas), null);
  });
  it("recorta lo larguísimo", () => {
    guardarTranscripcion(armar("2026-10-01-080000", "a ".repeat(200_000)), carpetas.transcripciones);
    const v = verTranscripcion("2026-10-01-080000", carpetas)!;
    assert.equal(v.recortado, true);
    assert.equal(v.texto.length, 300_000);
  });
});

describe("borrar", () => {
  it("una transcripción deja el audio y las otras", () => {
    guardarTranscripcion(armar("2026-10-01-080000"), carpetas.transcripciones);
    guardarTranscripcion(armar("2026-10-02-080000"), carpetas.transcripciones);
    writeFileSync(join(carpetas.grabaciones, "2026-10-01-080000.wav"), "x");
    const { rutas, eliminar } = espia();
    assert.equal(borrarDeGrabaciones("transcripcion", "2026-10-01-080000", carpetas, eliminar), 1);
    assert.deepEqual(rutas, [join(carpetas.transcripciones, "2026-10-01-080000.md")]);
  });
  it("«borrar todo» de audios no toca las transcripciones", () => {
    guardarTranscripcion(armar("2026-10-01-080000"), carpetas.transcripciones);
    writeFileSync(join(carpetas.grabaciones, "2026-10-01-080000.wav"), "x");
    writeFileSync(join(carpetas.grabaciones, "2026-10-02-080000.wav"), "x");
    const { rutas, eliminar } = espia();
    assert.equal(borrarDeGrabaciones("audio", null, carpetas, eliminar), 2);
    assert.ok(rutas.every((r) => r.startsWith(carpetas.grabaciones) && r.endsWith(".wav")));
    assert.equal(existsSync(join(carpetas.transcripciones, "2026-10-01-080000.md")), true);
  });
  it("ids con rutas o comodines no borran nada", () => {
    const { rutas, eliminar } = espia();
    for (const id of ["../../x", "*", "2026-10-01-080000.md", ""]) {
      assert.equal(borrarDeGrabaciones("transcripcion", id, carpetas, eliminar), 0, id);
    }
    assert.deepEqual(rutas, []);
  });
});

describe("la respuesta a «¿avisaste a los presentes?»", () => {
  const ruta = () => join(mkdtempSync(join(RAIZ, "av-")), "avisos.json");
  it("se guarda con permisos 600 y se lee de vuelta; sin dato, «no»", async () => {
    const { guardarAviso, avisoDe } = await import("../src/memoria-grabaciones.ts");
    const r = ruta();
    assert.equal(avisoDe("2026-10-01-080000", r), "no");
    guardarAviso("2026-10-01-080000", "solo-mi-voz", r);
    guardarAviso("2026-10-02-080000", "si", r);
    assert.equal(avisoDe("2026-10-01-080000", r), "solo-mi-voz");
    assert.equal(avisoDe("2026-10-02-080000", r), "si");
    assert.equal(statSync(r).mode & 0o777, 0o600);
  });
  it("rechaza ids y respuestas inválidos", async () => {
    const { guardarAviso } = await import("../src/memoria-grabaciones.ts");
    const r = ruta();
    assert.throws(() => guardarAviso("../x", "si", r));
    assert.throws(() => guardarAviso("2026-10-01-080000", "quizás", r));
    assert.equal(existsSync(r), false);
  });
  it("un archivo roto o con basura se lee como vacío y solo deja lo válido", async () => {
    const { leerAvisos } = await import("../src/memoria-grabaciones.ts");
    const r = ruta();
    writeFileSync(r, "{no es json");
    assert.deepEqual(leerAvisos(r), {});
    writeFileSync(r, JSON.stringify({ "2026-10-01-080000": "si", "../x": "si", "2026-10-02-080000": "tal vez" }));
    assert.deepEqual(leerAvisos(r), { "2026-10-01-080000": "si" });
  });
  it("poda lo que ya no tiene audio", async () => {
    const { guardarAviso, leerAvisos, podarAvisos } = await import("../src/memoria-grabaciones.ts");
    const r = ruta();
    guardarAviso("2026-10-01-080000", "si", r);
    guardarAviso("2026-10-02-080000", "no", r);
    podarAvisos(["2026-10-02-080000"], r);
    assert.deepEqual(leerAvisos(r), { "2026-10-02-080000": "no" });
  });
});
