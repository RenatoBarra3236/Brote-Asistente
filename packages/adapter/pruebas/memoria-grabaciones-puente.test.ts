// Ver y borrar grabaciones por el puente de verdad (sin OpenClaw), con la función apagada: lo ya guardado
// es del usuario y se puede ver y borrar aunque la apague. Todo en carpetas temporales. El borrado real
// va a la Papelera en Mac, así que allí solo se prueba lo que no borra (ver la lista de pendientes).
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { guardarTranscripcion } from "@asistente/motor";

const PUENTE = fileURLToPath(new URL("../src/puente.ts", import.meta.url));

function esperarHasta<T>(condicion: () => T | undefined | null | false, ms = 10_000): Promise<T> {
  return new Promise((listo, fallo) => {
    const limite = Date.now() + ms;
    const revisar = () => {
      const valor = condicion();
      if (valor) return listo(valor);
      if (Date.now() > limite) return fallo(new Error("se acabó el tiempo"));
      setTimeout(revisar, 50);
    };
    revisar();
  });
}

describe("grabaciones en «Lo que sé de ti» (puente)", { skip: process.platform === "win32" }, () => {
  it("lista, muestra el texto y borra, con la función apagada", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "memgrab-"));
    const grabaciones = join(raiz, "grabaciones");
    const transcripciones = join(raiz, "transcripciones");
    mkdirSync(grabaciones);
    const funciones = join(raiz, "funciones.json");
    writeFileSync(funciones, JSON.stringify({ activas: { grabaciones: false } }));
    const ajustes = join(raiz, "ajustes.json");
    writeFileSync(ajustes, JSON.stringify({ modelo: "small", diasAudio: 7 }));
    for (const id of ["2026-10-01-080000", "2026-10-02-080000"]) {
      guardarTranscripcion(
        { id, fecha: "2026-10-01T08:00:00-03:00", duracionSeg: 600, origen: "pc", modelo: "small", idioma: "es", avisoAPresentes: "si", segmentos: [{ inicioSeg: 0, finSeg: 4, texto: `texto de ${id}` }] },
        transcripciones,
      );
    }
    writeFileSync(join(grabaciones, "2026-10-02-080000.wav"), "x");

    const { OPENCLAW_PROFILE: _p, ...resto } = process.env;
    const puente: ChildProcess = spawn(process.execPath, [PUENTE], {
      env: {
        ...resto,
        HOME: raiz,
        OPENCLAW_STATE_DIR: join(raiz, "sin-openclaw"),
        ASISTENTE_FUNCIONES: funciones,
        ASISTENTE_EQUIPO: join(raiz, "equipo.json"),
        ASISTENTE_PLAN: join(raiz, "plan.json"),
        ASISTENTE_PLAN_APP: join(raiz, "no-existe.json"),
        ASISTENTE_DESCARGAS: join(raiz, "descargas"),
        ASISTENTE_GRABACIONES: grabaciones,
        ASISTENTE_TRANSCRIPCIONES: transcripciones,
        ASISTENTE_GRABACIONES_AJUSTES: ajustes,
      },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const avisos: any[] = [];
    createInterface({ input: puente.stdout! }).on("line", (linea) => {
      try {
        avisos.push(JSON.parse(linea));
      } catch {
        // no es JSON
      }
    });
    let id = 0;
    const pedir = async (pedido: object): Promise<any> => {
      const mio = String(++id);
      puente.stdin!.write(`${JSON.stringify({ id: mio, ...pedido })}\n`);
      return esperarHasta(() => avisos.find((a) => a.tipo === "respuesta" && a.id === mio));
    };
    try {
      await esperarHasta(() => avisos.find((a) => a.tipo === "funciones"));

      const lista = (await pedir({ tipo: "grabaciones-listar" })).datos;
      assert.deepEqual(lista.transcripciones.map((t: any) => t.id), ["2026-10-02-080000", "2026-10-01-080000"]);
      assert.deepEqual(lista.audios.map((a: any) => [a.id, a.transcrito]), [["2026-10-02-080000", true]]);
      assert.equal(lista.diasAudio, 7);
      assert.ok(!JSON.stringify(lista).includes("texto de"), "la lista no lleva el texto");

      const vista = (await pedir({ tipo: "grabacion-ver", grabacion: "2026-10-01-080000" })).datos;
      assert.equal(vista.texto, "[00:00:00] texto de 2026-10-01-080000");
      assert.equal((await pedir({ tipo: "grabacion-ver", grabacion: "../x" })).ok, false);

      // Pedidos inválidos: no borran nada.
      for (const mal of [{ que: "carpeta", grabacion: null }, { que: "audio", grabacion: 5 }, { que: "transcripcion" }, { que: "transcripcion", grabacion: "../../x" }]) {
        const r = await pedir({ tipo: "grabacion-borrar", ...mal });
        assert.ok(r.ok === false || r.datos?.borradas === 0, JSON.stringify(mal));
      }
      assert.ok(existsSync(join(transcripciones, "2026-10-01-080000.md")));

      if (process.platform !== "darwin") {
        const una = await pedir({ tipo: "grabacion-borrar", que: "transcripcion", grabacion: "2026-10-01-080000" });
        assert.deepEqual(una.datos, { borradas: 1 });
        assert.ok(!existsSync(join(transcripciones, "2026-10-01-080000.md")));
        assert.ok(existsSync(join(transcripciones, "2026-10-02-080000.md")), "las otras se quedan");
        assert.ok(existsSync(join(grabaciones, "2026-10-02-080000.wav")), "el audio se queda");
        const todas = await pedir({ tipo: "grabacion-borrar", que: "transcripcion", grabacion: null });
        assert.deepEqual(todas.datos, { borradas: 1 });
        const audios = await pedir({ tipo: "grabacion-borrar", que: "audio", grabacion: null });
        assert.deepEqual(audios.datos, { borradas: 1 });
        assert.ok(!existsSync(join(grabaciones, "2026-10-02-080000.wav")));
      }
    } finally {
      puente.kill();
    }
  });
});
