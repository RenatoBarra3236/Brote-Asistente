// La pestaña Plata de punta a punta con el puente de verdad (sin OpenClaw): el aviso "plata" al
// partir, el presupuesto por pedido y por frase, el aviso del 80 % una sola vez, los botones de un
// toque (solo los frecuentes) y lo que anota otro proceso (el servidor MCP) aparece solo.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Gastos } from "@asistente/motor";

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

describe("pestaña Plata en el puente", { skip: process.platform === "win32" }, () => {
  it("avisa, pone el presupuesto, anota con un toque y nota lo que anota el MCP", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "plata-"));
    const funciones = join(raiz, "funciones.json");
    writeFileSync(funciones, JSON.stringify({ activas: Object.fromEntries(["gastos"].map((f) => [f, true])) }));
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
    const ultimaPlata = () => avisos.filter((a) => a.tipo === "plata").at(-1)?.plata;
    try {
      await esperarHasta(() => ultimaPlata());
      assert.equal(ultimaPlata().mes.total, 0);

      // Pedidos inválidos: montos raros o un "toque" que no es de los frecuentes.
      assert.equal((await pedir({ tipo: "presupuesto-poner", monto: 50 })).ok, false);
      assert.equal((await pedir({ tipo: "presupuesto-poner", monto: "200000" })).ok, false);
      assert.equal((await pedir({ tipo: "plata-anotar", monto: 1500, descripcion: "café" })).ok, false);

      const puesto = await pedir({ tipo: "presupuesto-poner", monto: 100_000 });
      assert.equal(puesto.ok, true);
      assert.equal(puesto.datos.presupuesto.monto, 100_000);

      await pedir({ tipo: "enviar", texto: "gasté 1500 en café" });
      await pedir({ tipo: "enviar", texto: "gasté 1500 en café" });
      await esperarHasta(() => ultimaPlata()?.frecuentes?.length === 1);
      const toque = await pedir({ tipo: "plata-anotar", monto: 1500, descripcion: "café" });
      assert.match(toque.mensaje, /Anotado: \$1\.500 en café \(comida\)/);
      await esperarHasta(() => ultimaPlata()?.mes.total === 4500);

      // Otro proceso (el servidor MCP) anota en la misma base: aparece solo y pasa el 80 %.
      const otro = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
      otro.agregar({ monto: 80_000, categoria: "cuentas", descripcion: "arriendo", fecha: new Date() });
      otro.cerrar();
      await esperarHasta(() => ultimaPlata()?.mes.total === 84_500);
      const aviso = await esperarHasta(() => avisos.find((a) => a.tipo === "plata-aviso"));
      assert.match(aviso.texto, /85 % del presupuesto \(\$84\.500 de \$100\.000\)/);
      await pedir({ tipo: "enviar", texto: "gasté 1000 en micro" });
      await new Promise((listo) => setTimeout(listo, 2500));
      assert.equal(avisos.filter((a) => a.tipo === "plata-aviso").length, 1, "el 80 % se avisa una vez");

      const frase = await pedir({ tipo: "enviar", texto: "¿cuánto me queda del presupuesto?" });
      assert.match(frase.local.texto, /Te quedan \$14\.500 de \$100\.000/);
      assert.equal((await pedir({ tipo: "presupuesto-poner", monto: null })).datos.presupuesto, null);
    } finally {
      puente.stdin!.end();
      await new Promise((listo) => puente.once("exit", listo));
    }
  });
});
