import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { atender } from "../src/mcp.ts";

let gastos: Gastos;
let id = 0;

// Que las pruebas nunca hablen con el Brote real del computador (podrían pausar la música).
const CARPETA = mkdtempSync(join(tmpdir(), "mcp-puente-"));
process.env.ASISTENTE_CONEXION_HOOKS = join(CARPETA, "hooks.json");
after(() => rmSync(CARPETA, { recursive: true, force: true }));

beforeEach(() => {
  gastos = new Gastos(":memory:");
});

function llamar(name: string, args: object): { texto: string; error: boolean } {
  const respuesta = atender(gastos, { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) as any;
  return { texto: respuesta.result.content[0].text, error: respuesta.result.isError === true };
}

async function llamarEsperando(name: string, args: object): Promise<{ texto: string; error: boolean }> {
  const respuesta = (await atender(gastos, { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } })) as any;
  return { texto: respuesta.result.content[0].text, error: respuesta.result.isError === true };
}

describe("servidor MCP de gastos", () => {
  it("se presenta y lista sus herramientas", () => {
    const inicio = atender(gastos, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }) as any;
    assert.equal(inicio.result.protocolVersion, "2025-03-26");
    assert.deepEqual(inicio.result.capabilities, { tools: {} });
    const lista = atender(gastos, { jsonrpc: "2.0", id: 2, method: "tools/list" }) as any;
    assert.deepEqual(
      lista.result.tools.map((t: any) => t.name),
      ["gastos_anotar", "gastos_listar", "gastos_resumen", "temporizador_crear", "temporizador_listar", "temporizador_cancelar", "equipo_estado", "descargas_recientes", "musica_estado", "musica_control", "calendario_proximos", "calendario_crear", "programador_sesiones", "motor_proponer_plantilla"],
    );
  });

  it("no responde a notificaciones y rechaza métodos desconocidos", () => {
    assert.equal(atender(gastos, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
    assert.equal((atender(gastos, { jsonrpc: "2.0", id: 3, method: "resources/list" }) as any).error.code, -32601);
  });

  it("anota, deduce la categoría y resume", () => {
    assert.match(llamar("gastos_anotar", { monto: 1500, descripcion: "pasaje de micro", fecha: "2026-10-01" }).texto, /\$1\.500 en pasaje de micro \(transporte\) el 2026-10-01/);
    llamar("gastos_anotar", { monto: 5000, descripcion: "almuerzo", fecha: "2026-10-01" });
    llamar("gastos_anotar", { monto: 3000, descripcion: "algo raro", categoria: "salud", fecha: "2026-10-02" });
    llamar("gastos_anotar", { monto: 9000, descripcion: "zapatillas", fecha: "2026-09-15" });

    const resumen = JSON.parse(llamar("gastos_resumen", { desde: "2026-10-01", hasta: "2026-10-02" }).texto);
    assert.equal(resumen.total, 9500);
    assert.equal(resumen.cantidad, 3);
    assert.deepEqual(resumen.porCategoria[0], { categoria: "comida", total: 5000, cantidad: 1 });

    const lista = JSON.parse(llamar("gastos_listar", { hasta: "2026-09-30" }).texto);
    assert.deepEqual(lista.gastos.map((g: any) => g.descripcion), ["zapatillas"]);
    assert.equal(lista.gastos[0].categoria, "otros");
  });

  it("valida lo que recibe", () => {
    assert.equal(llamar("gastos_anotar", { monto: 2.5 }).error, true);
    assert.equal(llamar("gastos_anotar", { monto: -100 }).error, true);
    assert.equal(llamar("gastos_anotar", { monto: 100, categoria: "lujos" }).error, true);
    assert.equal(llamar("gastos_anotar", { monto: 100, fecha: "2026-02-31" }).error, true);
    assert.equal(llamar("gastos_borrar", { id: 1 }).error, true);
    assert.equal(gastos.ultimos(10).length, 0);
  });

  it("crea, lista y cancela temporizadores para el agente", () => {
    assert.match(llamar("temporizador_crear", { tipo: "pomodoro", etiqueta: "cálculo" }).texto, /pomodoro de 25 minutos — cálculo/);
    assert.match(llamar("temporizador_crear", { tipo: "temporizador", minutos: 10, etiqueta: "sacar la ropa" }).texto, /temporizador de 10 minutos/);
    assert.equal(llamar("temporizador_crear", { tipo: "temporizador" }).error, true);
    const lista = JSON.parse(llamar("temporizador_listar", {}).texto).temporizadores;
    assert.deepEqual(lista.map((t: any) => t.tipo).sort(), ["pomodoro", "temporizador"]);
    assert.equal(llamar("temporizador_cancelar", { tipo: "pomodoro" }).texto, "Cancelados: 1.");
    assert.equal(llamar("temporizador_cancelar", {}).texto, "Cancelados: 1.");
  });

  it("la música valida la acción y, sin reproductor, no hace nada", async () => {
    assert.equal((await llamarEsperando("musica_control", { accion: "subir-volumen" })).error, true);
    // En Linux (las pruebas) no hay música que leer: responde sin error.
    if (process.platform === "linux") {
      assert.match((await llamarEsperando("musica_estado", {})).texto, /No pude saber/);
      assert.match((await llamarEsperando("musica_control", { accion: "pausa" })).texto, /No hay música abierta/);
    }
  });

  it("con Brote abierto, la música y el calendario se los pide al puente (que tiene los permisos)", async () => {
    const pedidos: any[] = [];
    const inicio = Date.now() + 30 * 60_000;
    const servidor = createServer((pedido, respuesta) => {
      let texto = "";
      pedido.on("data", (parte) => (texto += parte));
      pedido.on("end", () => {
        if (pedido.headers.authorization !== "Bearer secreto") return respuesta.writeHead(401).end();
        const consulta = JSON.parse(texto);
        pedidos.push(consulta);
        const musica = { app: "Spotify", sonando: false, cancion: "Canción", artista: "Artista" };
        const cuerpo =
          consulta.tipo === "musica-estado" ? { musica }
          : consulta.tipo === "musica-control" ? { hecho: true, musica }
          : consulta.tipo === "calendario-crear" ? { resultado: { ok: true, calendario: "Universidad" } }
          : { eventos: [{ titulo: "Cálculo", lugar: "B-12", inicioMs: inicio, finMs: inicio + 3_600_000, todoElDia: false }] };
        respuesta.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(cuerpo));
      });
    });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    const { port } = servidor.address() as { port: number };
    writeFileSync(process.env.ASISTENTE_CONEXION_HOOKS!, JSON.stringify({ puerto: port, token: "secreto" }));
    try {
      assert.match((await llamarEsperando("musica_estado", {})).texto, /Canción/);
      assert.equal((await llamarEsperando("musica_control", { accion: "play" })).texto, "Hecho: play en Spotify.");
      const { eventos } = JSON.parse((await llamarEsperando("calendario_proximos", {})).texto);
      assert.deepEqual(eventos.map((e: any) => [e.titulo, e.lugar]), [["Cálculo", "B-12"]]);
      // Crear un evento también lo hace Brote (el MCP no tiene el permiso de Calendario).
      assert.match((await llamarEsperando("calendario_crear", { titulo: "Prueba de física", inicio: "2026-12-05 10:00", minutos: 90 })).texto, /Listo: «Prueba de física» .* «Universidad»/);
      assert.deepEqual(pedidos.map((p) => p.tipo), ["musica-estado", "musica-control", "calendario", "calendario-crear"]);
      assert.equal(pedidos[3].evento.finMs - pedidos[3].evento.inicioMs, 90 * 60_000);
      assert.equal(pedidos[1].accion, "play");
    } finally {
      rmSync(process.env.ASISTENTE_CONEXION_HOOKS!, { force: true });
      servidor.close();
    }
  });

  it("el calendario responde aunque no haya ninguno conectado", async () => {
    const respuesta = (await atender(gastos, { jsonrpc: "2.0", id: 99, method: "tools/call", params: { name: "calendario_proximos", arguments: {} } })) as any;
    assert.equal(respuesta.id, 99);
    if (process.platform === "linux") assert.match(respuesta.result.content[0].text, /No hay calendario conectado|No pude leer/);
  });

  it("crear eventos valida la fecha y, fuera del Mac, lo dice", async () => {
    assert.equal((await llamarEsperando("calendario_crear", { titulo: "Cálculo", inicio: "2026-02-31 10:00" })).error, true);
    assert.equal((await llamarEsperando("calendario_crear", { titulo: "Cálculo", inicio: "mañana" })).error, true);
    assert.equal((await llamarEsperando("calendario_crear", { titulo: " ", inicio: "2026-10-05 10:00" })).error, true);
    if (process.platform !== "darwin") {
      const r = await llamarEsperando("calendario_crear", { titulo: "Cálculo", inicio: "2026-12-05 10:00" });
      assert.deepEqual([r.error, /Calendario del Mac/.test(r.texto)], [true, true]);
    }
  });

  it("lista las descargas recientes sin abrirlas", () => {
    const carpeta = mkdtempSync(join(tmpdir(), "descargas-mcp-"));
    const antes = process.env.ASISTENTE_DESCARGAS;
    process.env.ASISTENTE_DESCARGAS = carpeta;
    try {
      writeFileSync(join(carpeta, "apunte.pdf"), "x".repeat(2048));
      writeFileSync(join(carpeta, "a medias.zip.crdownload"), "x");
      const { descargas } = JSON.parse(llamar("descargas_recientes", {}).texto);
      assert.deepEqual(descargas.map((d: any) => [d.nombre, d.tamano]), [["apunte.pdf", "2 KB"]]);
    } finally {
      if (antes === undefined) delete process.env.ASISTENTE_DESCARGAS;
      else process.env.ASISTENTE_DESCARGAS = antes;
      rmSync(carpeta, { recursive: true, force: true });
    }
  });
});
