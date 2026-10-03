import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { MENSAJE_APAGADA, activasDePreset } from "@asistente/motor";
import { TareasPorFuncion } from "../src/tareas.ts";

describe("tareas por función", () => {
  it("arranca solo lo prendido y detiene lo que se apaga", () => {
    const registro: string[] = [];
    const tarea = (id: string) => () => {
      registro.push(`+${id}`);
      return () => registro.push(`-${id}`);
    };
    const tareas = new TareasPorFuncion({ musica: tarea("musica"), descargas: tarea("descargas"), aula: tarea("aula") });
    const activas = { ...activasDePreset("todo"), aula: false };
    assert.deepEqual(tareas.aplicar(activas), { arrancadas: ["musica", "descargas"], detenidas: [] });
    // Aplicar lo mismo otra vez no arranca nada dos veces.
    assert.deepEqual(tareas.aplicar(activas), { arrancadas: [], detenidas: [] });
    assert.deepEqual(tareas.aplicar({ ...activas, musica: false, aula: true }), { arrancadas: ["aula"], detenidas: ["musica"] });
    assert.equal(tareas.corriendo("musica"), false);
    tareas.detenerTodo();
    assert.deepEqual(registro, ["+musica", "+descargas", "-musica", "+aula", "-descargas", "-aula"]);
  });
});

/**
 * El puente de verdad, en una carpeta personal de prueba (sin OpenClaw: el motor funciona igual),
 * con su propia carpeta de descargas y su funciones.json.
 */
describe("el puente con funciones.json", () => {
  const casa = mkdtempSync(join(tmpdir(), "puente-funciones-"));
  const descargas = join(casa, "Descargas");
  const archivo = join(casa, ".asistente-prototipo", "funciones.json");
  mkdirSync(descargas);
  mkdirSync(join(casa, ".asistente-prototipo"));
  let puente: ChildProcessWithoutNullStreams | null = null;
  after(() => {
    puente?.stdin.end();
    puente?.kill();
    rmSync(casa, { recursive: true, force: true });
  });

  const avisos: any[] = [];
  const esperas: { condicion: (a: any) => boolean; listo: (a: any) => void }[] = [];
  function esperar(condicion: (a: any) => boolean, ms = 8000): Promise<any> {
    const ya = avisos.find(condicion);
    if (ya) return Promise.resolve(ya);
    return new Promise((listo, fallo) => {
      const plazo = setTimeout(() => fallo(new Error("no llegó el aviso esperado")), ms);
      esperas.push({ condicion, listo: (a) => (clearTimeout(plazo), listo(a)) });
    });
  }
  let id = 0;
  function pedir(pedido: object): Promise<any> {
    const propio = `p${++id}`;
    puente!.stdin.write(`${JSON.stringify({ id: propio, ...pedido })}\n`);
    return esperar((a) => a.tipo === "respuesta" && a.id === propio);
  }

  it("no vigila lo apagado, responde que está apagado y nota cuando cambia", async () => {
    writeFileSync(archivo, JSON.stringify({ activas: { ...activasDePreset("todo"), descargas: false, musica: false } }));
    puente = spawn(process.execPath, [fileURLToPath(new URL("../src/puente.ts", import.meta.url))], {
      env: { ...process.env, HOME: casa, USERPROFILE: casa, ASISTENTE_DESCARGAS: descargas, ASISTENTE_FUNCIONES: archivo },
    });
    createInterface({ input: puente.stdout }).on("line", (linea) => {
      const aviso = JSON.parse(linea);
      avisos.push(aviso);
      for (const espera of [...esperas]) {
        if (espera.condicion(aviso)) {
          esperas.splice(esperas.indexOf(espera), 1);
          espera.listo(aviso);
        }
      }
    });
    puente.stderr.resume();

    const inicial = await esperar((a) => a.tipo === "funciones");
    assert.equal(inicial.activas.descargas, false);
    assert.equal((await pedir({ tipo: "funciones-estado" })).datos.activas.musica, false);
    assert.equal((await pedir({ tipo: "enviar", texto: "mis descargas" })).local.texto, MENSAJE_APAGADA);
    assert.equal((await pedir({ tipo: "permisos-estado" })).datos.descargas, "sin-usar");

    // Con descargas apagada, un archivo nuevo no se anuncia.
    writeFileSync(join(descargas, "antes.pdf"), "x");
    await new Promise((listo) => setTimeout(listo, 600));
    assert.equal(avisos.some((a) => a.tipo === "descargas"), false);

    // Se prende en Configurar Brote: el puente lo nota solo (mira la fecha del archivo).
    writeFileSync(archivo, JSON.stringify({ activas: { ...activasDePreset("todo"), musica: false } }));
    await esperar((a) => a.tipo === "funciones" && a.activas.descargas === true);
    assert.equal((await pedir({ tipo: "permisos-estado" })).datos.descargas, "concedido");
    assert.notEqual((await pedir({ tipo: "enviar", texto: "mis descargas" })).local.texto, MENSAJE_APAGADA);

    // Pomodoro prendido: corre y se ve en la lista. Al apagarlo, la isla recibe la lista vacía.
    assert.match((await pedir({ tipo: "enviar", texto: "pomodoro de 25" })).local.texto, /Pomodoro/);
    await esperar((a) => a.tipo === "temporizadores" && a.lista.length === 1);
    writeFileSync(archivo, JSON.stringify({ activas: { ...activasDePreset("todo"), musica: false, temporizadores: false } }));
    await esperar((a) => a.tipo === "funciones" && a.activas.temporizadores === false);
    assert.deepEqual(avisos.filter((a) => a.tipo === "temporizadores").at(-1).lista, []);
    assert.deepEqual((await pedir({ tipo: "temporizadores-listar" })).datos, []);
    assert.equal((await pedir({ tipo: "enviar", texto: "¿cuánto falta?" })).local.texto, MENSAJE_APAGADA);
  });
});
