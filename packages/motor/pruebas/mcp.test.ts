import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { atender } from "../src/mcp.ts";

let gastos: Gastos;
let id = 0;

beforeEach(() => {
  gastos = new Gastos(":memory:");
});

function llamar(name: string, args: object): { texto: string; error: boolean } {
  const respuesta = atender(gastos, { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) as any;
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
      ["gastos_anotar", "gastos_listar", "gastos_resumen", "temporizador_crear", "temporizador_listar", "temporizador_cancelar", "equipo_estado", "motor_proponer_plantilla"],
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
});
