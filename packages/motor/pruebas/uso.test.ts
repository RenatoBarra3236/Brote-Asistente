import assert from "node:assert/strict";
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PRECIOS, claveModelo, nombreModelo, precioDe } from "../src/precios.ts";
import { describirUso, formatearTokens, formatearUsd, leerLineaUso, nombreDeCarpeta, reconstruirRuta, resumirUso, valorApi, valorDe } from "../src/uso.ts";
import { LectorUso } from "../src/uso-archivo.ts";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";

const DATOS = fileURLToPath(new URL("./datos/", import.meta.url));
const TUYA = "-Users-ana-proyectos-tarea-rust";
const BROTE = "-Users-ana--openclaw-workspace";
const AHORA = Date.parse("2026-10-03T12:00:00.000Z");

const temporales: string[] = [];
after(() => temporales.forEach((d) => rmSync(d, { recursive: true, force: true })));
function carpeta(): string {
  const d = mkdtempSync(join(tmpdir(), "brote-uso-"));
  temporales.push(d);
  return d;
}

/** Una carpeta como ~/.claude/projects con las dos transcripciones de ejemplo (quietas hace rato). */
function proyectos(): string {
  const raiz = carpeta();
  for (const [sub, archivo] of [
    [TUYA, "transcripcion-tuya.jsonl"],
    [BROTE, "transcripcion-brote.jsonl"],
  ]) {
    mkdirSync(join(raiz, sub));
    copyFileSync(join(DATOS, archivo), join(raiz, sub, "sesion.jsonl"));
    const hace = new Date(AHORA - 10 * 60_000);
    utimesSync(join(raiz, sub, "sesion.jsonl"), hace, hace);
  }
  return raiz;
}

const cerca = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

describe("precios", () => {
  it("reconoce los ids de modelo (con fecha, prefijo o [1m]) y no adivina los desconocidos", () => {
    assert.equal(claveModelo("claude-sonnet-5"), "sonnet-5");
    assert.equal(claveModelo("claude-opus-4-5-20251101"), "opus-4-5");
    assert.equal(claveModelo("anthropic/claude-sonnet-5-5"), "sonnet-5-5");
    assert.equal(claveModelo("claude-haiku-4-5-20251001"), "haiku-4-5");
    assert.equal(claveModelo("claude-sonnet-5-5[1m]"), "sonnet-5-5");
    assert.equal(claveModelo("gpt-5"), null);
    assert.equal(precioDe("claude-nueva-9"), null);
    assert.equal(precioDe("claude-opus-4"), null, "Opus 4 (sin versión menor) no está en la tabla");
    assert.equal(nombreModelo("claude-fable-5-1"), "Fable 5.1");
    assert.equal(nombreModelo("claude-nueva-9"), "claude-nueva-9");
  });

  it("la tabla tiene los precios oficiales del 3 de octubre de 2026", () => {
    assert.deepEqual(PRECIOS["opus-5-5"], { nombre: "Opus 5.5", entrada: 4, escritura5m: 5, escritura1h: 8, lectura: 0.2, salida: 20 });
    assert.deepEqual(PRECIOS["sonnet-4-6"], { nombre: "Sonnet 4.6", entrada: 3, escritura5m: 3.75, escritura1h: 6, lectura: 0.3, salida: 15 });
    assert.equal(PRECIOS["fable-5"].lectura, 1);
    assert.equal(PRECIOS["fable-5-1"].lectura, 0.25);
  });
});

describe("uso por tokens", () => {
  const lineas = readFileSync(join(DATOS, "transcripcion-tuya.jsonl"), "utf8").split("\n");

  it("de cada línea saca solo los campos de uso", () => {
    const r = leerLineaUso(lineas[0], TUYA)!;
    assert.deepEqual(r, {
      clave: "msg_01:req_01",
      ms: Date.parse("2026-10-03T10:00:00.000Z"),
      modelo: "claude-sonnet-5",
      tokens: { entrada: 1000, salida: 2000, escritura5m: 6000, escritura1h: 4000, lectura: 50000 },
      rapido: false,
      eeuu: false,
      busquedas: 0,
      carpeta: TUYA,
    });
    assert.equal(leerLineaUso(lineas[6], TUYA), null, "<synthetic>");
    assert.equal(leerLineaUso(lineas[7], TUYA), null, "línea a medio escribir");
    assert.equal(leerLineaUso('{"type":"user","message":{"role":"user","content":"hola"}}', TUYA), null);
  });

  it("calcula el valor API: caché de 5 min y 1 h, modo rápido, inferencia en EE. UU. y búsquedas", () => {
    cerca(valorApi(leerLineaUso(lineas[0], TUYA)!)!, 0.063);
    // Opus 5.5 rápido: entrada 8, salida 40; 2 búsquedas (0,02); todo × 1,1.
    cerca(valorApi(leerLineaUso(lineas[2], TUYA)!)!, (0.0408 + 0.02) * 1.1);
    assert.equal(valorApi(leerLineaUso(lineas[3], TUYA)!), null);
    // Sin desglose de la caché, todo es de 5 min.
    const brote = leerLineaUso(readFileSync(join(DATOS, "transcripcion-brote.jsonl"), "utf8").split("\n")[0], BROTE)!;
    cerca(valorApi(brote)!, 0.00825);
    // Un modelo sin precio de modo rápido no se adivina.
    const rapidoSonnet = { ...leerLineaUso(lineas[0], TUYA)!, rapido: true };
    assert.equal(valorApi(rapidoSonnet), null);
  });

  it("resume hoy y 7 días, separa Brote de tus sesiones y ordena los proyectos", async () => {
    const lector = new LectorUso({ carpeta: proyectos(), cache: null });
    await lector.actualizar(AHORA);
    const resumen = resumirUso(lector.registros(), AHORA, BROTE, () => "tarea-rust");
    const { hoy, semana } = resumen;
    assert.deepEqual([hoy.total.entrada, hoy.total.salida, hoy.total.cache, hoy.total.sinPrecio], [3600, 4500, 61000, 1000]);
    cerca(hoy.total.usd, 0.063 + 0.06688 + 0.00825);
    cerca(hoy.brote.usd, 0.00825);
    cerca(hoy.tuyas.usd, 0.063 + 0.06688);
    cerca(semana.total.usd, 0.063 + 0.06688 + 0.00825 + 0.02);
    assert.deepEqual(
      hoy.proyectos.map((p) => [p.nombre, p.brote]),
      [
        ["tarea-rust", false],
        ["Brote", true],
      ],
    );
    assert.deepEqual(hoy.porModelo.map((m) => m.nombre), ["Opus 5.5", "Sonnet 5", "Haiku 4.5", "claude-nueva-9"]);
    assert.deepEqual(new Set(resumen.modelos), new Set(["claude-sonnet-5", "claude-opus-5-5", "claude-nueva-9", "claude-haiku-4-5-20251001"]));
    assert.equal(valorDe(hoy.tuyas), "US$ 0,13 + 1 k sin precio");
    const texto = describirUso(resumen);
    assert.match(texto, /Hoy: 69 k tokens · US\$ 0,14 \+ 1 k sin precio/);
    assert.match(texto, /Brote: US\$ <0,01/);
    assert.equal(describirUso(null).includes("Todavía"), true);
  });

  it("lee de forma incremental: solo lo nuevo, la línea a medio escribir después y los archivos rotados", async () => {
    const raiz = proyectos();
    const cache = join(carpeta(), "uso-cache.json");
    const archivo = join(raiz, TUYA, "sesion.jsonl");
    let lector = new LectorUso({ carpeta: raiz, cache });
    await lector.actualizar(AHORA);
    assert.equal(lector.registros().length, 5);
    assert.equal((statSync(cache).mode & 0o777).toString(8), "600");
    const guardada = JSON.parse(readFileSync(cache, "utf8"));
    const largo = statSync(archivo).size;
    // La línea a medio escribir no se consumió.
    assert.ok(guardada.archivos[`${TUYA}/sesion.jsonl`].byte < largo);
    assert.equal(JSON.stringify(guardada).includes("hola"), false);

    // Se completa la línea: un lector nuevo (Brote reiniciado) parte desde la caché y suma solo esa.
    appendFileSync(archivo, '000,"output_tokens":0}}}\n');
    lector = new LectorUso({ carpeta: raiz, cache });
    await lector.actualizar(AHORA);
    assert.equal(lector.registros().length, 6);
    assert.ok(lector.registros().some((r) => r.clave === "msg_06:req_06" && r.tokens.entrada === 1000));

    // Rotado: el archivo se reemplaza por uno más corto con una respuesta ya contada y una nueva.
    writeFileSync(
      archivo,
      `${readFileSync(join(DATOS, "transcripcion-tuya.jsonl"), "utf8").split("\n")[0]}\n` +
        '{"timestamp":"2026-10-03T11:00:00.000Z","requestId":"req_07","message":{"id":"msg_07","model":"claude-sonnet-5","usage":{"input_tokens":5,"output_tokens":5}}}\n',
    );
    await lector.actualizar(AHORA);
    assert.equal(lector.registros().length, 7, "la repetida no se cuenta dos veces");
  });

  it("no abre archivos viejos ni guarda registros de hace más de 8 días; respeta el presupuesto", async () => {
    const raiz = proyectos();
    const vieja = join(raiz, TUYA, "vieja.jsonl");
    writeFileSync(vieja, readFileSync(join(DATOS, "transcripcion-tuya.jsonl")));
    const antes = new Date(AHORA - 30 * 86_400_000);
    utimesSync(vieja, antes, antes);
    const lector = new LectorUso({ carpeta: raiz, cache: null, presupuesto: 600 });
    let falta = await lector.actualizar(AHORA);
    assert.equal(falta, true, "con 600 bytes no alcanza para todo");
    for (let i = 0; i < 20 && falta; i++) falta = await lector.actualizar(AHORA);
    assert.equal(falta, false);
    assert.equal(lector.registros().length, 5);
    assert.equal(lector.registros().some((r) => r.clave === "msg_05:req_05"), false);
  });

  it("nombra los proyectos: reconstruye la ruta real o, si no puede, quita la carpeta del usuario", () => {
    const arbol: Record<string, string[]> = { "/": ["Users"], "/Users": ["ana"], "/Users/ana": ["proyectos", ".openclaw"], "/Users/ana/proyectos": ["tarea", "tarea rust"] };
    const listar = (ruta: string) => arbol[ruta] ?? null;
    assert.equal(reconstruirRuta(TUYA, listar), "/Users/ana/proyectos/tarea rust");
    assert.equal(reconstruirRuta("-Users-ana--openclaw", listar), "/Users/ana/.openclaw");
    assert.equal(reconstruirRuta("-Users-ana-otra", listar), null);
    assert.equal(nombreDeCarpeta(TUYA, "-Users-ana"), "proyectos-tarea-rust");
  });

  it("formatea tokens y dólares", () => {
    assert.deepEqual([formatearTokens(830), formatearTokens(12_400), formatearTokens(1_234_567), formatearTokens(2_000_000)], ["830", "12 k", "1,2 M", "2 M"]);
    assert.deepEqual([formatearUsd(3.4), formatearUsd(0.004), formatearUsd(0), formatearUsd(1234.5)], ["US$ 3,40", "US$ <0,01", "US$ 0,00", "US$ 1.235"]);
  });

  it("el motor responde sin IA «¿cuánto he gastado en tokens?»", async () => {
    const lector = new LectorUso({ carpeta: proyectos(), cache: null });
    await lector.actualizar(AHORA);
    const resumen = resumirUso(lector.registros(), AHORA, BROTE);
    const gastos = new Gastos(":memory:");
    const motor = new Motor(gastos, { reloj: () => new Date(AHORA), uso: () => ({ plan: null, statusline: true, resumen }) });
    const r = motor.resolver("¿Cuánto he gastado en tokens?")!;
    assert.equal(r.intencion, "plan-tokens");
    assert.match(r.texto, /^🪙 Hoy/);
    assert.equal(motor.resolver("¿cuántos tokens llevo hoy?")!.intencion, "plan-tokens");
    // Una consulta de gastos sigue siendo de gastos.
    assert.equal(motor.resolver("¿cuánto he gastado esta semana?")!.intencion, "consultar-gastos");
    gastos.cerrar();
  });
});
