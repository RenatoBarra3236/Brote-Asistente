import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import {
  FUNCIONES,
  IDS_FUNCIONES,
  IDS_TARJETAS,
  MENSAJE_APAGADA,
  MENSAJE_APAGADA_MCP,
  activasDePreset,
  funcionDeHerramienta,
  funcionDeIntencion,
  funcionesQueUsan,
  normalizarFunciones,
  presetDe,
  serializarFunciones,
} from "../src/funciones.ts";
import { FuncionesVigiladas, leerFunciones } from "../src/funciones-archivo.ts";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { PLANTILLAS_BASE } from "../src/plantillas.ts";
import { Temporizadores } from "../src/temporizadores.ts";

const CARPETA = mkdtempSync(join(tmpdir(), "funciones-"));
after(() => rmSync(CARPETA, { recursive: true, force: true }));

describe("funciones.json", () => {
  it("sin archivo o roto: el preset Estudiante y las tarjetas en su orden", () => {
    const porDefecto = leerFunciones(join(CARPETA, "no-existe.json"));
    assert.equal(presetDe(porDefecto.activas), "estudiante");
    assert.equal(porDefecto.activas.programador, false);
    assert.equal(porDefecto.activas.musica, true);
    assert.deepEqual(porDefecto.tarjetas, { orden: [...IDS_TARJETAS], ocultas: [] });
    const roto = join(CARPETA, "roto.json");
    writeFileSync(roto, "{ esto no es json");
    assert.deepEqual(leerFunciones(roto), porDefecto);
  });

  it("grabaciones está apagada de fábrica y fuera de los presets que no son «Todo»", () => {
    assert.ok(IDS_FUNCIONES.includes("grabaciones"));
    assert.equal(leerFunciones(join(CARPETA, "no-existe.json")).activas.grabaciones, false);
    for (const preset of ["estudiante", "programador", "minimo"] as const) assert.equal(activasDePreset(preset).grabaciones, false, preset);
    assert.equal(funcionDeHerramienta("transcripciones_listar"), "grabaciones");
    assert.equal(funcionDeHerramienta("transcripciones_leer"), "grabaciones");
  });

  it("ignora lo inválido y completa lo que falta", () => {
    const config = normalizarFunciones({
      activas: { musica: false, programador: true, inventada: true, gastos: "sí" },
      tarjetas: { orden: ["musica", "musica", "otra", "aula"], ocultas: ["descargas", 3] },
    });
    assert.equal(config.activas.musica, false);
    assert.equal(config.activas.programador, true);
    assert.equal(config.activas.gastos, true);
    assert.equal("inventada" in config.activas, false);
    assert.deepEqual(config.tarjetas.orden, ["musica", "aula", "temporizadores", "calendario", "descargas", "claude"]);
    assert.deepEqual(config.tarjetas.ocultas, ["descargas"]);
    // Ida y vuelta por el archivo.
    assert.deepEqual(normalizarFunciones(JSON.parse(serializarFunciones(config))), config);
  });

  it("presets", () => {
    assert.ok(IDS_FUNCIONES.every((id) => activasDePreset("todo")[id]));
    assert.deepEqual(IDS_FUNCIONES.filter((id) => activasDePreset("minimo")[id]), ["gastos"]);
    assert.equal(presetDe(activasDePreset("programador")), "programador");
    assert.equal(presetDe({ ...activasDePreset("estudiante"), musica: false }), null);
  });

  it("cada función del catálogo está una vez, y cada tarjeta tiene su función", () => {
    assert.deepEqual(FUNCIONES.map((f) => f.id), [...IDS_FUNCIONES]);
    for (const tarjeta of IDS_TARJETAS) assert.equal(FUNCIONES.filter((f) => f.tarjeta === tarjeta).length, 1, tarjeta);
    const activas = activasDePreset("todo");
    assert.deepEqual(funcionesQueUsan("automatizacion", activas).map((f) => f.id), ["musica"]);
    assert.deepEqual(funcionesQueUsan("automatizacion", { ...activas, musica: false }), []);
  });

  it("todas las intenciones del motor (salvo ver la memoria) dependen de una función", () => {
    const intenciones = new Set(PLANTILLAS_BASE.map((p) => p.intencion));
    for (const intencion of intenciones) {
      if (intencion === "ver-memoria") assert.equal(funcionDeIntencion(intencion), null);
      else assert.ok(funcionDeIntencion(intencion), intencion);
    }
    assert.equal(funcionDeIntencion("musica-pausa"), "musica");
    assert.equal(funcionDeIntencion("calendario-crear-manana"), "calendario");
  });

  it("todas las herramientas MCP (salvo proponer plantillas) dependen de una función", async () => {
    const { atender } = await import("../src/mcp.ts");
    const lista = (atender(new Gastos(":memory:"), { jsonrpc: "2.0", id: 1, method: "tools/list" }) as any).result.tools;
    for (const { name } of lista) {
      if (name === "motor_proponer_plantilla") assert.equal(funcionDeHerramienta(name), null);
      else assert.ok(funcionDeHerramienta(name), name);
    }
  });

  it("la lista cerrada de Rust (funciones.rs) coincide", () => {
    const rust = readFileSync(fileURLToPath(new URL("../../../apps/desktop/src-tauri/src/funciones.rs", import.meta.url)), "utf8");
    const lista = (nombre: string) => {
      const inicio = rust.indexOf(`const ${nombre}`);
      return [...rust.slice(inicio, rust.indexOf("];", inicio)).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    };
    assert.deepEqual(lista("FUNCIONES"), [...IDS_FUNCIONES]);
    assert.deepEqual(lista("TARJETAS"), [...IDS_TARJETAS]);
  });

  it("se relee cuando el archivo cambia", async () => {
    const ruta = join(CARPETA, "vigilado.json");
    const vigiladas = new FuncionesVigiladas(() => ruta);
    assert.equal(vigiladas.activa("musica"), true);
    writeFileSync(ruta, JSON.stringify({ activas: { musica: false } }));
    assert.equal(vigiladas.activa("musica"), false);
    await new Promise((listo) => setTimeout(listo, 15));
    writeFileSync(ruta, JSON.stringify({ activas: { musica: true } }));
    assert.equal(vigiladas.activa("musica"), true);
  });
});

describe("el motor con funciones apagadas", () => {
  const AHORA = new Date(2026, 9, 1, 13, 0);

  it("responde que está apagado y no hace nada", () => {
    const gastos = new Gastos(":memory:");
    const temporizadores = new Temporizadores(gastos);
    const apagadas = new Set(["gastos", "temporizadores", "musica", "calendario"]);
    const motor = new Motor(gastos, {
      reloj: () => AHORA,
      temporizadores,
      musica: { estado: () => null, controlar: () => assert.fail("no debe tocar la música") },
      calendario: () => [],
      activa: (f) => !apagadas.has(f),
    });
    for (const frase of ["gasté 5 lucas en almuerzo", "pomodoro de 25", "pausa la música", "¿qué tengo hoy?"]) {
      assert.equal(motor.resolver(frase)?.texto, MENSAJE_APAGADA, frase);
    }
    assert.equal(gastos.ultimos(5).length, 0);
    assert.equal(temporizadores.activos().length, 0);
    // "¿Qué sabes de mí?" no depende de ninguna función.
    assert.notEqual(motor.resolver("¿qué sabes de mí?")?.texto, MENSAJE_APAGADA);
    // Lo que no calza con una plantilla sigue hacia el agente.
    assert.equal(motor.resolver("cuéntame un chiste"), null);
  });

  it("sin pomodoro y recordatorios, crear un evento sin permiso no deja recordatorio", () => {
    const gastos = new Gastos(":memory:");
    const temporizadores = new Temporizadores(gastos);
    const motor = new Motor(gastos, {
      reloj: () => AHORA,
      temporizadores,
      crearEvento: () => ({ ok: false, motivo: "sin-permiso" }),
      activa: (f) => f !== "temporizadores",
    });
    assert.doesNotMatch(motor.resolver("pon un evento en 12 minutos")!.texto, /recordatorio/);
    assert.equal(temporizadores.activos().length, 0);
  });
});

describe("el servidor MCP con funciones apagadas", () => {
  it("responde que está apagado sin leer nada", async () => {
    const anterior = process.env.ASISTENTE_FUNCIONES;
    const ruta = join(CARPETA, "mcp.json");
    writeFileSync(ruta, JSON.stringify({ activas: { gastos: false, musica: false } }));
    process.env.ASISTENTE_FUNCIONES = ruta;
    try {
      const { atender } = await import("../src/mcp.ts");
      const gastos = new Gastos(":memory:");
      const llamar = async (name: string, args: object) =>
        ((await atender(gastos, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } })) as any).result;
      assert.equal((await llamar("gastos_anotar", { monto: 1000 })).content[0].text, MENSAJE_APAGADA_MCP);
      assert.equal((await llamar("musica_control", { accion: "pausa" })).content[0].text, MENSAJE_APAGADA_MCP);
      assert.equal(gastos.ultimos(5).length, 0);
      // Lo prendido sigue funcionando.
      assert.match((await llamar("temporizador_listar", {})).content[0].text, /temporizadores/);
    } finally {
      if (anterior === undefined) delete process.env.ASISTENTE_FUNCIONES;
      else process.env.ASISTENTE_FUNCIONES = anterior;
    }
  });
});
