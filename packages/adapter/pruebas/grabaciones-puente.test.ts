// "Grabar y transcribir" de punta a punta con el puente de verdad (sin OpenClaw) y un whisper-cli falso:
// con la función apagada no hace nada; prendida transcribe en segundo plano, guarda el texto, avisa,
// rechaza lo raro y borra solo los audios vencidos. Todo en carpetas temporales.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { modeloFalso, wavDeSilencio, whisperFalso } from "./ayuda-whisper.ts";

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

describe("grabaciones en el puente", { skip: process.platform === "win32" }, () => {
  it("transcribe en segundo plano, guarda, avisa, y respeta la función apagada", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "grab-"));
    const grabaciones = join(raiz, "grabaciones");
    const transcripciones = join(raiz, "transcripciones");
    const modelos = join(raiz, "modelos");
    mkdirSync(grabaciones);
    modeloFalso(modelos, "small");
    const funciones = join(raiz, "funciones.json");
    writeFileSync(funciones, JSON.stringify({ activas: { grabaciones: false } }));
    const reciente = new Date();
    const dos = (n: number) => String(n).padStart(2, "0");
    const idReciente = `${reciente.getFullYear()}-${dos(reciente.getMonth() + 1)}-${dos(reciente.getDate())}-${dos(reciente.getHours())}${dos(reciente.getMinutes())}${dos(reciente.getSeconds())}`;
    writeFileSync(join(grabaciones, `${idReciente}.wav`), wavDeSilencio(2));
    // En Mac el borrado va a la Papelera real con osascript: no se prueba aquí (ver la lista de pendientes).
    const idViejo = "2026-01-01-080000";
    if (process.platform !== "darwin") writeFileSync(join(grabaciones, `${idViejo}.wav`), wavDeSilencio(1));
    const ajustes = join(raiz, "ajustes.json");
    writeFileSync(ajustes, JSON.stringify({ modelo: "small", diasAudio: 7 })); // sin consentimiento todavía

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
        ASISTENTE_MODELOS: modelos,
        ASISTENTE_WHISPER: whisperFalso(raiz),
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

      // Apagada: no transcribe, no limpia, y el estado no dice nada.
      const apagada = await pedir({ tipo: "transcribir", grabacion: idReciente });
      assert.equal(apagada.ok, false);
      assert.match(apagada.error, /apagado/);
      assert.equal((await pedir({ tipo: "grabaciones-estado" })).datos, null);
      assert.ok(!existsSync(transcripciones));
      if (process.platform !== "darwin") assert.ok(existsSync(join(grabaciones, `${idViejo}.wav`)), "apagada no borra");

      
      // Se prende (el puente relee funciones.json solo).
      writeFileSync(funciones, JSON.stringify({ activas: { grabaciones: true } }));
      const listo = await (async () => {
        const limite = Date.now() + 10_000;
        while (Date.now() < limite) {
          const e = await pedir({ tipo: "grabaciones-estado" });
          if (e.datos) return e.datos;
          await new Promise((r) => setTimeout(r, 100));
        }
        throw new Error("la función no se prendió");
      })();
      assert.equal(listo.whisper, true);
      assert.deepEqual(listo.modelos, { base: false, small: true, medium: false, "large-v3-turbo": false });
      assert.equal(listo.ajustes.diasAudio, 7);
      // Al partir (al prender) borra solo el audio vencido.
      if (process.platform !== "darwin") {
        await esperarHasta(() => !existsSync(join(grabaciones, `${idViejo}.wav`)));
        assert.ok(existsSync(join(grabaciones, `${idReciente}.wav`)), "el audio reciente se queda");
      }

      
      // Sin el consentimiento aceptado no transcribe, aunque todo lo demás esté bien.
      const sinConsentir = await pedir({ tipo: "transcribir", grabacion: idReciente });
      assert.equal(sinConsentir.ok, false);
      assert.match(sinConsentir.error, /aviso de privacidad/);
      assert.ok(!existsSync(transcripciones));
      writeFileSync(ajustes, JSON.stringify({ modelo: "small", diasAudio: 7, consentimiento: 1 }));

      // Pedidos inválidos.
      for (const mal of [{ grabacion: "../../etc/passwd" }, { grabacion: "2026-13-45-000000" }, { grabacion: 5 }, { grabacion: "2026-10-05-000001" }, { grabacion: idReciente, avisoAPresentes: "quizás" }]) {
        const r = await pedir({ tipo: "transcribir", ...mal });
        assert.equal(r.ok, false, JSON.stringify(mal));
      }
      assert.ok(!existsSync(transcripciones), "nada se guardó con pedidos inválidos");

      
      // Transcribe de verdad (con el whisper falso), en segundo plano.
      const r = await pedir({ tipo: "transcribir", grabacion: idReciente, avisoAPresentes: "solo-mi-voz" });
      assert.equal(r.ok, true);
      assert.deepEqual(r.datos.pendientes, [idReciente]);
      await esperarHasta(() => avisos.find((a) => a.tipo === "transcripcion" && a.id === idReciente && a.fase === "lista"));
      const fases = avisos.filter((a) => a.tipo === "transcripcion").map((a) => a.fase);
      assert.deepEqual(fases, ["en-cola", "transcribiendo", "lista"]);
      const texto = readFileSync(join(transcripciones, `${idReciente}.md`), "utf8");
      assert.match(texto, /avisoAPresentes: solo-mi-voz/);
      assert.match(texto, /modelo: small/);
      assert.match(texto, /origen: pc/);
      assert.match(texto, /\[00:00:03\] Partimos con la regla de la cadena\./);
      // El aviso a la isla no lleva el texto de la grabación.
      assert.ok(!JSON.stringify(avisos.filter((a) => a.tipo === "transcripcion")).includes("derivadas"));

      // Ya tiene transcripción: no se repite.
      const repetida = await pedir({ tipo: "transcribir", grabacion: idReciente });
      assert.equal(repetida.ok, false);
      assert.match(repetida.error, /ya tiene/);
    } finally {
      puente.kill();
    }
  });
});
