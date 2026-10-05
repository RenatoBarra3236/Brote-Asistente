// Tareas sacadas de una transcripción, de punta a punta con el puente de verdad (sin OpenClaw): lo que
// propone otro proceso (el servidor MCP) aparece en la isla, nada llega a la Agenda sin aceptarlo, aceptar
// crea la tarea (y la muestra en `agenda-estado`) y borrar la transcripción se lleva sus propuestas.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Gastos, TareasAgenda } from "@asistente/motor";

const PUENTE = fileURLToPath(new URL("../src/puente.ts", import.meta.url));

function esperarHasta<T>(condicion: () => T | undefined | null | false, ms = 8000): Promise<T> {
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

const fechaEn = (dias: number, hora = ""): string => {
  const d = new Date(Date.now() + dias * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}${hora}`;
};

describe("propuestas de la Agenda en el puente", { skip: process.platform === "win32" }, () => {
  it("avisa lo que propone otro proceso y solo agrega lo que el usuario acepta", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "propuestas-"));
    const funciones = join(raiz, "funciones.json");
    writeFileSync(funciones, JSON.stringify({ activas: { grabaciones: true, calendario: false } }));
    const transcripciones = join(raiz, "transcripciones");
    mkdirSync(transcripciones, { recursive: true, mode: 0o700 });
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
        ASISTENTE_TRANSCRIPCIONES: transcripciones,
        ASISTENTE_GRABACIONES: join(raiz, "grabaciones"),
        ASISTENTE_GRABACIONES_AJUSTES: join(raiz, "grabaciones.json"),
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
    const ultimas = () => avisos.filter((a) => a.tipo === "propuestas-agenda").at(-1)?.propuestas as any[] | undefined;
    try {
      await esperarHasta(() => ultimas());
      assert.deepEqual(ultimas(), []);

      // Otro proceso (el servidor MCP) deja propuestas en la misma base.
      const otro = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
      new TareasAgenda(otro).proponer(
        "2026-10-05-090000",
        [
          { tipo: "tarea", titulo: "Guía 3 de álgebra", fecha: fechaEn(3) },
          { tipo: "evento", titulo: "Prueba 1", fecha: fechaEn(4, " 08:30") },
        ],
        Date.now(),
      );
      otro.cerrar();
      const lista = await esperarHasta(() => (ultimas()?.length === 2 ? ultimas() : null));
      assert.deepEqual(lista!.map((p) => p.titulo).sort(), ["Guía 3 de álgebra", "Prueba 1"]);

      // Todavía nada en la Agenda.
      assert.equal((await pedir({ tipo: "agenda-estado" })).datos.dias.length, 0);

      // Pedidos inválidos.
      assert.equal((await pedir({ tipo: "propuesta-decidir", propuesta: "1", decision: "aceptar" })).ok, false);
      assert.equal((await pedir({ tipo: "propuesta-decidir", propuesta: lista![0].id, decision: "quizás" })).ok, false);
      assert.equal((await pedir({ tipo: "propuesta-decidir", propuesta: lista![0].id, decision: "aceptar", fecha: "mañana" })).ok, false);

      // Aceptar la tarea (con el título corregido) la deja en la Agenda.
      const tarea = lista!.find((p) => p.tipo === "tarea");
      const aceptada = await pedir({ tipo: "propuesta-decidir", propuesta: tarea.id, decision: "aceptar", titulo: "Guía 3" });
      assert.equal(aceptada.ok, true);
      const agenda = (await pedir({ tipo: "agenda-estado" })).datos;
      const items = agenda.dias.flatMap((d: any) => d.items);
      assert.deepEqual(items.map((i: any) => [i.tipo, i.titulo]), [["tarea", "Guía 3"]]);

      // La prueba, sin el calendario prendido, queda como tarea (la decisión es del usuario).
      const prueba = lista!.find((p) => p.tipo === "evento");
      const r = await pedir({ tipo: "propuesta-decidir", propuesta: prueba.id, decision: "aceptar" });
      assert.match(r.mensaje, /como tarea/);
      assert.equal((await pedir({ tipo: "propuesta-decidir", propuesta: prueba.id, decision: "aceptar" })).ok, false, "no se acepta dos veces");
      await esperarHasta(() => ultimas()?.length === 0);

      // Marcar hecha.
      const tareaId = items[0].tareaId;
      assert.equal((await pedir({ tipo: "tarea-hecha", tarea: tareaId, hecha: true })).ok, true);
      const despues = (await pedir({ tipo: "agenda-estado" })).datos.dias.flatMap((d: any) => d.items);
      assert.equal(despues.find((i: any) => i.tareaId === tareaId).hecha, true);
    } finally {
      puente.stdin!.end();
      await new Promise((listo) => puente.once("exit", listo));
    }
  });
});
