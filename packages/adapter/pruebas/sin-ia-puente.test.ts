// Las metas de ahorro de punta a punta con el puente de verdad (sin OpenClaw): crear por frase y por pedido,
// aportar, los hitos festejados una sola vez, lo que anota otro proceso (el MCP), archivar y borrar.

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
  const donde = new Error("se acabó el tiempo");
  return new Promise((listo, fallo) => {
    const limite = Date.now() + ms;
    const revisar = () => {
      const valor = condicion();
      if (valor) return listo(valor);
      if (Date.now() > limite) return fallo(donde);
      setTimeout(revisar, 50);
    };
    revisar();
  });
}

function lanzar(raiz: string, activas: Record<string, boolean>) {
  const funciones = join(raiz, "funciones.json");
  writeFileSync(funciones, JSON.stringify({ activas }));
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
  const cerrar = async () => {
    puente.stdin!.end();
    await new Promise((listo) => puente.once("exit", listo));
  };
  return { avisos, pedir, cerrar };
}

describe("sin IA en el puente", { skip: process.platform === "win32" }, () => {
  it("pregunta antes de anotar, aprende lo confirmado, saluda y sugiere, sin errores técnicos", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "sin-ia-"));
    const { avisos, pedir, cerrar } = lanzar(raiz, { gastos: true });
    try {
      await esperarHasta(() => avisos.some((a) => a.tipo === "conexion"));

      // Una acción aproximada no se hace sola: pregunta.
      const duda = await pedir({ tipo: "enviar", texto: "almuerzo 5 lucas" });
      assert.equal(duda.ok, true);
      assert.equal(duda.local.intencion, "confirmar");
      assert.equal(duda.local.texto, "¿Anoto $5.000 en almuerzo?");
      assert.deepEqual(duda.local.datos.confirmar, { pregunta: "¿Anoto $5.000 en almuerzo?", frase: "gaste 5 lucas en almuerzo", original: "almuerzo 5 lucas" });
      assert.match((await pedir({ tipo: "enviar", texto: "mis últimos gastos" })).local.texto, /Todavía no tienes gastos/);

      // Al tocar Sí se anota y se recuerda.
      const si = await pedir({ tipo: "confirmar-frase", frase: "gaste 5 lucas en almuerzo", original: "almuerzo 5 lucas" });
      assert.match(si.local.texto, /^Anotado: \$5\.000 en almuerzo/);
      // La frase aprendida se entiende sola, pero una acción igual pregunta (con el monto nuevo) antes de anotar.
      const aprendida = await pedir({ tipo: "enviar", texto: "almuerzo 9 lucas" });
      assert.equal(aprendida.local.texto, "¿Anoto $9.000 en almuerzo?");
      await pedir({ tipo: "confirmar-frase", frase: aprendida.local.datos.confirmar.frase, original: "almuerzo 9 lucas" });
      // Dos montos: se pregunta cuál, sin anotar.
      const dos = await pedir({ tipo: "enviar", texto: "gasté 5 lucas y 3 mil en el almuerzo" });
      assert.equal(dos.local.intencion, "elegir-monto");
      assert.equal(dos.local.datos.elegirMonto.opciones.length, 2);
      const lista = (await pedir({ tipo: "frases-aprendidas" })).datos;
      assert.equal(lista.length, 1);
      assert.equal(lista[0].forma, "almuerzo {monto}");
      assert.equal((await pedir({ tipo: "confirmar-frase", frase: "esto no calza con nada" })).ok, false);

      // Una consulta aproximada se responde directo.
      const consulta = await pedir({ tipo: "enviar", texto: "cuánta plata llevo gastada esta semana" });
      assert.match(consulta.local.texto, /^Entendí «cuanto he gastado esta semana»\. Esta semana llevas \$14\.000/);

      // El formulario «+ Gasto»: monto en pesos (entero), qué fue y categoría.
      const form = await pedir({ tipo: "gasto-anotar", monto: 3500, descripcion: "café", categoria: "comida" });
      assert.match(form.local.texto, /^Anotado: \$3\.500 en café \(comida\)/);
      assert.match((await pedir({ tipo: "gasto-anotar", monto: 1200, descripcion: "", categoria: "auto" })).local.texto, /^Anotado: \$1\.200 \(otros\)/);
      assert.equal((await pedir({ tipo: "gasto-anotar", monto: "3500", descripcion: "x", categoria: "auto" })).ok, false);
      assert.equal((await pedir({ tipo: "gasto-anotar", monto: 0, categoria: "auto" })).ok, false);
      assert.equal((await pedir({ tipo: "gasto-anotar", monto: 1000, categoria: "inventada" })).ok, false);

      // Lo básico de conversar y la ayuda, sin error aunque no haya IA.
      assert.match((await pedir({ tipo: "enviar", texto: "hola" })).local.texto, /🌱/);
      const ayuda = await pedir({ tipo: "enviar", texto: "ayuda" });
      assert.ok(ayuda.local.datos.ayuda.areas.some((a: any) => a.id === "gastos"));

      // No entendió: sugiere y no guarda nada sin permiso.
      const no = await pedir({ tipo: "enviar", texto: "zzzz qqqq" });
      assert.equal(no.ok, true);
      assert.equal(no.local.intencion, "no-entendi");
      assert.match(no.local.texto, /^No te entendí/);
      assert.deepEqual((await pedir({ tipo: "no-entendidas-estado" })).datos, { activo: false, frases: [] });
      assert.equal((await pedir({ tipo: "no-entendidas-permiso", activo: "si" })).ok, false);

      // Con permiso las guarda; se ven y se borran.
      assert.equal((await pedir({ tipo: "no-entendidas-permiso", activo: true })).datos.activo, true);
      await pedir({ tipo: "enviar", texto: "zzzz qqqq" });
      const guardadas = (await pedir({ tipo: "no-entendidas-estado" })).datos.frases;
      assert.deepEqual(guardadas.map((f: any) => f.frase), ["zzzz qqqq"]);
      assert.equal((await pedir({ tipo: "no-entendida-borrar", frase: guardadas[0].id })).datos.borradas, 1);
      await pedir({ tipo: "enviar", texto: "otra rara xx" });
      assert.equal((await pedir({ tipo: "no-entendidas-borrar-todas" })).datos.borradas, 1);

      // Olvidar lo aprendido.
      assert.equal((await pedir({ tipo: "frase-aprendida-olvidar", forma: "almuerzo {monto}" })).datos.borradas, 1);
      assert.equal((await pedir({ tipo: "frases-aprendidas" })).datos.length, 0);
      const otra = await pedir({ tipo: "enviar", texto: "almuerzo 5 lucas" });
      assert.equal(otra.local.intencion, "confirmar");
    } finally {
      await cerrar();
    }
  });
});
