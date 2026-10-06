// Las celebraciones de Brote (E3 y E4: meta de estudio, racha, ramo aprobado), de punta a punta con el puente de verdad
// (sin OpenClaw), en una carpeta temporal: nunca con los datos reales del usuario.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";


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

function lanzar(raiz: string, estudio: boolean) {
  const funciones = join(raiz, "funciones.json");
  writeFileSync(funciones, JSON.stringify({ activas: { estudio, calendario: false, aula: false, grabaciones: false, temporizadores: true } }));
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
      ASISTENTE_TRANSCRIPCIONES: join(raiz, "transcripciones"),
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
  const celebraciones = () => avisos.filter((a) => a.tipo === "celebracion") as { motivo: string; texto: string }[];
  const estado = () => avisos.filter((a) => a.tipo === "estadisticas-estudio").at(-1) as { resumen: any } | undefined;
  const cerrar = async () => {
    puente.stdin!.end();
    await new Promise((listo) => puente.once("exit", listo));
  };
  return { pedir, estado, celebraciones, avisos, cerrar };
}

describe("celebraciones en el puente", { skip: process.platform === "win32" }, () => {
  it("celebra la meta de la semana una sola vez, la racha de 3 días no (solo hay hoy) y la meta aparece en el resumen", async () => {
    const p = lanzar(mkdtempSync(join(tmpdir(), "celebra-")), true);
    try {
      await esperarHasta(() => p.estado());
      assert.equal(p.estado()!.resumen.meta, null);
      const puesta = await pedir(p, "mi meta es estudiar 2 horas a la semana");
      assert.match(puesta.local?.texto ?? puesta.mensaje ?? JSON.stringify(puesta), /tu meta es estudiar 2 h a la semana/);
      await esperarHasta(() => p.estado()!.resumen.meta?.metaMin === 120);
      assert.deepEqual(p.celebraciones(), [], "con 0 min no hay nada que celebrar");
      await pedir(p, "estudié 1 hora");
      await new Promise((r) => setTimeout(r, 2500));
      assert.deepEqual(p.celebraciones(), [], "con 1 h de 2 h todavía no");
      await pedir(p, "estudié 90 minutos");
      const c = await esperarHasta(() => (p.celebraciones().length >= 1 ? p.celebraciones() : null));
      assert.deepEqual(c.map((x) => x.motivo), ["meta"]);
      assert.match(c[0].texto, /Meta semanal cumplida! 2 h/);
      await pedir(p, "estudié 30 minutos");
      await new Promise((r) => setTimeout(r, 2500));
      assert.equal(p.celebraciones().length, 1, "la misma semana no se celebra dos veces");
    } finally {
      await p.cerrar();
    }
  });

  it("celebra un ramo que pasa a aprobado, pero no al partir con uno que ya lo estaba", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "celebra-"));
    let p = lanzar(raiz, true);
    try {
      await esperarHasta(() => p.estado());
      const ramo = (await p.pedir({ tipo: "ramo-crear", nombre: "Cálculo" })).datos;
      const eval1 = await p.pedir({ tipo: "evaluacion-guardar", ramo: ramo.id, nombre: "Certamen 1", peso: 100 });
      assert.equal(eval1.ok, true);
      await new Promise((r) => setTimeout(r, 2500));
      assert.deepEqual(p.celebraciones(), [], "sin nota no hay aprobado");
      await p.pedir({ tipo: "evaluacion-guardar", ramo: ramo.id, evaluacion: eval1.datos.id, nota: 6 });
      const c = await esperarHasta(() => (p.celebraciones().length >= 1 ? p.celebraciones() : null));
      assert.deepEqual(c.map((x) => x.motivo), ["aprobado"]);
      assert.match(c[0].texto, /Aprobaste Cálculo/);
    } finally {
      await p.cerrar();
    }
    // Al volver a abrir Brote, lo que ya estaba aprobado no se festeja de nuevo.
    p = lanzar(raiz, true);
    try {
      await esperarHasta(() => p.estado());
      await new Promise((r) => setTimeout(r, 3000));
      assert.deepEqual(p.celebraciones(), []);
    } finally {
      await p.cerrar();
    }
  });

  it("con Estudio apagado no celebra nada", async () => {
    const p = lanzar(mkdtempSync(join(tmpdir(), "celebra-")), false);
    try {
      await new Promise((r) => setTimeout(r, 2500));
      assert.deepEqual(p.celebraciones(), []);
    } finally {
      await p.cerrar();
    }
  });
});

/** Manda una frase al puente como la escribiría el usuario y espera su respuesta. */
async function pedir(p: ReturnType<typeof lanzar>, texto: string): Promise<any> {
  return p.pedir({ tipo: "enviar", texto });
}
