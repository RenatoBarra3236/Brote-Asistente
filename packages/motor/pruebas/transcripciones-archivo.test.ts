// Solo con carpetas temporales: nunca toca las grabaciones ni las transcripciones reales.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import {
  audiosVencidos,
  borrarAudiosVencidos,
  borrarGrabacion,
  borrarTodasLasGrabaciones,
  guardarTranscripcion,
  leerTranscripcionGuardada,
  listarAudios,
  listarTranscripciones,
} from "../src/transcripciones-archivo.ts";
import type { Transcripcion } from "../src/transcripciones.ts";

const RAIZ = mkdtempSync(join(tmpdir(), "transcripciones-"));
after(() => rmSync(RAIZ, { recursive: true, force: true }));

let textos: string;
let audios: string;
beforeEach(() => {
  textos = mkdtempSync(join(RAIZ, "t-"));
  audios = mkdtempSync(join(RAIZ, "a-"));
});

const armar = (id: string): Transcripcion => ({
  id,
  fecha: "2026-10-04T10:30:00-03:00",
  duracionSeg: 60,
  origen: "pc",
  modelo: "small",
  idioma: "es",
  avisoAPresentes: "no",
  segmentos: [{ inicioSeg: 0, finSeg: 60, texto: `clase ${id}` }],
});

/** Los que "se borrarían": en vez de la Papelera, un registro. */
function espia() {
  const rutas: string[] = [];
  return { rutas, eliminar: (ruta: string) => rutas.push(ruta) };
}

describe("transcripciones en disco", () => {
  it("guarda con permisos 600 y lee de vuelta", () => {
    const ruta = guardarTranscripcion(armar("2026-10-04-103000"), join(textos, "sub"));
    assert.equal(statSync(ruta).mode & 0o777, 0o600);
    assert.equal(statSync(join(textos, "sub")).mode & 0o777, 0o700);
    assert.deepEqual(leerTranscripcionGuardada("2026-10-04-103000", join(textos, "sub")), armar("2026-10-04-103000"));
  });

  it("lista de la más nueva a la más vieja y salta lo que no es suyo", () => {
    guardarTranscripcion(armar("2026-10-01-080000"), textos);
    guardarTranscripcion(armar("2026-10-03-090000"), textos);
    writeFileSync(join(textos, "notas.md"), "hola");
    writeFileSync(join(textos, "2026-10-02-100000.md"), "no tiene cabecera");
    writeFileSync(join(textos, "2026-10-02-100000.md.tmp"), "---");
    mkdirSync(join(textos, "2026-10-05-100000.md"));
    assert.deepEqual(listarTranscripciones(textos).map((t) => t.id), ["2026-10-03-090000", "2026-10-01-080000"]);
  });

  it("una carpeta que no existe no es un error", () => {
    assert.deepEqual(listarTranscripciones(join(textos, "no-existe")), []);
    assert.equal(leerTranscripcionGuardada("2026-10-01-080000", join(textos, "no-existe")), null);
  });

  it("solo lee ids exactos: nada de rutas", () => {
    guardarTranscripcion(armar("2026-10-01-080000"), textos);
    writeFileSync(join(RAIZ, "secreto.md"), "---\n---");
    for (const malo of ["../secreto", "2026-10-01-080000.md", "../../etc/passwd", "", "2026-10-01"]) {
      assert.equal(leerTranscripcionGuardada(malo, textos), null, malo);
    }
  });

  it("no sigue enlaces simbólicos", () => {
    const afuera = join(RAIZ, "afuera.md");
    writeFileSync(afuera, "---\nfecha: x\n---");
    symlinkSync(afuera, join(textos, "2026-10-01-080000.md"));
    assert.deepEqual(listarTranscripciones(textos), []);
    assert.equal(leerTranscripcionGuardada("2026-10-01-080000", textos), null);
  });

  it("no guarda una transcripción inválida ni deja un temporal", () => {
    assert.throws(() => guardarTranscripcion({ ...armar("2026-10-01-080000"), origen: "x" as any }, textos));
    assert.deepEqual(listarTranscripciones(textos), []);
    assert.equal(existsSync(join(textos, "2026-10-01-080000.md.tmp")), false);
  });
});

describe("borrado de audios vencidos", () => {
  const ahora = new Date(2026, 9, 10, 12, 0, 0); // 10-10-2026 12:00

  function llenar() {
    for (const id of ["2026-10-01-080000", "2026-10-03-120000", "2026-10-03-120001", "2026-10-09-230000"]) {
      writeFileSync(join(audios, `${id}.wav`), "RIFF", { mode: 0o600 });
    }
  }

  it("lista los vencidos por la fecha del nombre (más de N días, no N)", () => {
    llenar();
    // 7 días antes del 10-10 12:00 es el 3-10 12:00: el de las 12:00:00 cumple justo 7 días (no vence), el de las 12:00:01 tampoco.
    assert.deepEqual(audiosVencidos(7, ahora, audios), ["2026-10-01-080000"]);
    assert.deepEqual(audiosVencidos(1, ahora, audios), ["2026-10-03-120001", "2026-10-03-120000", "2026-10-01-080000"]);
  });

  it("borra solo los vencidos y devuelve sus ids", () => {
    llenar();
    const { rutas, eliminar } = espia();
    assert.deepEqual(borrarAudiosVencidos(5, ahora, audios, eliminar), ["2026-10-03-120001", "2026-10-03-120000", "2026-10-01-080000"]);
    assert.deepEqual(rutas.map((r) => r.slice(audios.length + 1)).sort(), ["2026-10-01-080000.wav", "2026-10-03-120000.wav", "2026-10-03-120001.wav"]);
    assert.ok(rutas.every((r) => r.startsWith(`${audios}/`)));
  });

  it("con N inválido no borra nada", () => {
    llenar();
    for (const dias of [0, -3, NaN, Infinity]) {
      const { rutas, eliminar } = espia();
      assert.deepEqual(borrarAudiosVencidos(dias, ahora, audios, eliminar), []);
      assert.equal(rutas.length, 0);
    }
  });

  it("solo toca nombres exactos: ni otras extensiones, ni carpetas, ni enlaces", () => {
    const afuera = join(RAIZ, "importante.wav");
    writeFileSync(afuera, "no me borres");
    symlinkSync(afuera, join(audios, "2026-09-01-080000.wav"));
    mkdirSync(join(audios, "2026-09-02-080000.wav"));
    for (const raro of ["2026-09-03-080000.mp3", "2026-09-03-080000.wav.bak", "notas.wav", "2026-09-31-080000.wav", " 2026-09-03-080000.wav", "2026-9-3-080000.wav"]) {
      writeFileSync(join(audios, raro), "x");
    }
    writeFileSync(join(audios, "2026-09-04-080000.wav"), "RIFF");
    const { rutas, eliminar } = espia();
    assert.deepEqual(borrarAudiosVencidos(7, ahora, audios, eliminar), ["2026-09-04-080000"]);
    assert.deepEqual(rutas, [join(audios, "2026-09-04-080000.wav")]);
    assert.ok(existsSync(afuera));
  });

  it("no toca las transcripciones aunque estén vencidas", () => {
    guardarTranscripcion(armar("2026-01-01-080000"), textos);
    const { rutas, eliminar } = espia();
    assert.deepEqual(borrarAudiosVencidos(7, ahora, textos, eliminar), []);
    assert.equal(rutas.length, 0);
    assert.equal(listarTranscripciones(textos).length, 1);
  });

  it("si borrar uno falla sigue con los demás", () => {
    llenar();
    const borrados: string[] = [];
    const resultado = borrarAudiosVencidos(5, ahora, audios, (ruta) => {
      if (ruta.includes("120000.wav")) throw new Error("sin permiso");
      borrados.push(ruta);
    });
    assert.deepEqual(resultado, ["2026-10-03-120001", "2026-10-01-080000"]);
    assert.equal(borrados.length, 2);
  });

  it("con la eliminación por defecto (Papelera en Mac, borrar en el resto) funciona en carpeta temporal", { skip: process.platform === "darwin" ? "en Mac iría a la Papelera real" : false }, () => {
    llenar();
    assert.deepEqual(borrarAudiosVencidos(7, ahora, audios), ["2026-10-01-080000"]);
    assert.deepEqual(listarAudios(audios).map((a) => a.id), ["2026-10-09-230000", "2026-10-03-120001", "2026-10-03-120000"]);
  });
});

describe("borrar desde «Lo que sé de ti»", () => {
  it("borra una transcripción por su id exacto y deja las demás", () => {
    guardarTranscripcion(armar("2026-10-01-080000"), textos);
    guardarTranscripcion(armar("2026-10-02-080000"), textos);
    const { rutas, eliminar } = espia();
    assert.equal(borrarGrabacion("transcripcion", "2026-10-01-080000", textos, eliminar), true);
    assert.deepEqual(rutas, [join(textos, "2026-10-01-080000.md")]);
  });

  it("borra un audio y no una transcripción con el mismo id", () => {
    writeFileSync(join(audios, "2026-10-01-080000.wav"), "x");
    writeFileSync(join(audios, "2026-10-01-080000.md"), "x");
    const { rutas, eliminar } = espia();
    assert.equal(borrarGrabacion("audio", "2026-10-01-080000", audios, eliminar), true);
    assert.deepEqual(rutas, [join(audios, "2026-10-01-080000.wav")]);
  });

  it("rechaza ids que no son exactos (rutas, comodines, extensiones)", () => {
    writeFileSync(join(textos, "2026-10-01-080000.md"), "x");
    const { rutas, eliminar } = espia();
    for (const id of ["../2026-10-01-080000", "2026-10-01-080000.md", "*", "", "2026-10-01-08000", "2026-10-01-080000/", "/etc/passwd", "2026-10-01-080000\0"]) {
      assert.equal(borrarGrabacion("transcripcion", id, textos, eliminar), false, id);
    }
    assert.deepEqual(rutas, []);
  });

  it("no borra enlaces simbólicos ni carpetas con ese nombre", () => {
    writeFileSync(join(RAIZ, "secreto.md"), "no me toques");
    symlinkSync(join(RAIZ, "secreto.md"), join(textos, "2026-10-01-080000.md"));
    mkdirSync(join(textos, "2026-10-02-080000.md"));
    const { rutas, eliminar } = espia();
    assert.equal(borrarGrabacion("transcripcion", "2026-10-01-080000", textos, eliminar), false);
    assert.equal(borrarGrabacion("transcripcion", "2026-10-02-080000", textos, eliminar), false);
    assert.deepEqual(rutas, []);
    assert.equal(existsSync(join(RAIZ, "secreto.md")), true);
  });

  it("un archivo que no existe devuelve false sin lanzar", () => {
    assert.equal(borrarGrabacion("audio", "2026-10-01-080000", audios, espia().eliminar), false);
  });

  it("si eliminar falla, devuelve false y no lanza", () => {
    guardarTranscripcion(armar("2026-10-01-080000"), textos);
    assert.equal(borrarGrabacion("transcripcion", "2026-10-01-080000", textos, () => { throw new Error("no se pudo"); }), false);
  });

  it("«borrar todo» borra solo los archivos exactos de ese tipo, uno por uno", () => {
    guardarTranscripcion(armar("2026-10-01-080000"), textos);
    guardarTranscripcion(armar("2026-10-02-080000"), textos);
    writeFileSync(join(textos, "notas.md"), "mías");
    writeFileSync(join(textos, "2026-10-03-080000.wav"), "x");
    const { rutas, eliminar } = espia();
    assert.deepEqual(borrarTodasLasGrabaciones("transcripcion", textos, eliminar).sort(), ["2026-10-01-080000", "2026-10-02-080000"]);
    assert.deepEqual(rutas.sort(), [join(textos, "2026-10-01-080000.md"), join(textos, "2026-10-02-080000.md")]);
  });

  it("«borrar todo» de una carpeta que no existe no hace nada", () => {
    assert.deepEqual(borrarTodasLasGrabaciones("audio", join(RAIZ, "no-existe"), espia().eliminar), []);
  });

  it("borrado real en carpeta temporal (no Mac): el archivo desaparece", { skip: process.platform === "darwin" }, () => {
    guardarTranscripcion(armar("2026-10-01-080000"), textos);
    assert.equal(borrarGrabacion("transcripcion", "2026-10-01-080000", textos), true);
    assert.equal(existsSync(join(textos, "2026-10-01-080000.md")), false);
  });
});
