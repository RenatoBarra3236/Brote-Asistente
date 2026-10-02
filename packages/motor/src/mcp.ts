// Servidor MCP de gastos: le da al agente (OpenClaw → Claude Code) herramientas para anotar,
// listar y resumir los gastos, sobre la misma base que usa el motor de comandos. Habla MCP
// por la entrada y salida estándar (JSON-RPC 2.0, un mensaje por línea), sin dependencias.
//
// Registro en OpenClaw (una vez):
//   openclaw mcp add gastos --command node --arg <ruta del repo>/packages/motor/src/mcp.ts
//
// Cuándo usar estas herramientas y cuándo proponer plantillas lo explica la skill
// (packages/motor/skill/gastos/SKILL.md), no los resultados de las herramientas: una
// instrucción dentro de un resultado se parece a una inyección y el agente hace bien en ignorarla.
//
// No incluye borrar: el agente puede anotar y leer, pero borrar queda en manos del usuario
// ("borra el último gasto" lo resuelve el motor, sin IA).

import { createInterface } from "node:readline";
import { proponerPlantilla } from "./aprendizaje.ts";
import { CATEGORIAS, categoriaDe, type Categoria } from "./categorias.ts";
import { Gastos, RUTA_BASE } from "./gastos.ts";
import { Motor } from "./motor.ts";
import { PLANTILLAS_BASE } from "./plantillas.ts";
import { rangoDe, type Rango } from "./periodos.ts";
import { formatearMonto, normalizar } from "./texto.ts";

const VERSION_PROTOCOLO = "2025-06-18";
const MONTO_MAXIMO = 100_000_000;
const FECHA = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };

const HERRAMIENTAS = [
  {
    name: "gastos_anotar",
    description:
      "Anota un gasto del usuario en pesos chilenos (CLP, sin decimales). En Chile 1 luca = 1.000 pesos y " +
      "1 palo = 1.000.000. Si no se indica la categoría, se deduce de la descripción. La fecha por defecto es hoy. " +
      "Antes de usar las herramientas de gastos, invoca la skill «gastos» (tiene las instrucciones del usuario " +
      "para este servidor, incluido cómo enseñar al motor del personaje).",
    inputSchema: {
      type: "object",
      properties: {
        monto: { type: "integer", minimum: 1, maximum: MONTO_MAXIMO, description: "Monto en pesos chilenos" },
        descripcion: { type: "string", maxLength: 200, description: "En qué se gastó, por ejemplo «almuerzo»" },
        categoria: { type: "string", enum: CATEGORIAS },
        fecha: { ...FECHA, description: "Fecha del gasto (AAAA-MM-DD)" },
      },
      required: ["monto"],
      additionalProperties: false,
    },
    annotations: { title: "Anotar gasto", readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "gastos_listar",
    description: "Lista los gastos del usuario, del más reciente al más antiguo. Sin fechas, los últimos de todos.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { ...FECHA, description: "Primer día, incluido (AAAA-MM-DD)" },
        hasta: { ...FECHA, description: "Último día, incluido (AAAA-MM-DD)" },
        limite: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
    annotations: { title: "Listar gastos", readOnlyHint: true },
  },
  {
    name: "gastos_resumen",
    description:
      "Total de gastos y desglose por categoría en un rango de fechas. Sin fechas, el mes en curso. " +
      `Categorías: ${CATEGORIAS.join(", ")}.`,
    inputSchema: {
      type: "object",
      properties: {
        desde: { ...FECHA, description: "Primer día, incluido (AAAA-MM-DD)" },
        hasta: { ...FECHA, description: "Último día, incluido (AAAA-MM-DD)" },
      },
      additionalProperties: false,
    },
    annotations: { title: "Resumen de gastos", readOnlyHint: true },
  },
  {
    name: "motor_proponer_plantilla",
    description:
      "Propone una plantilla para que el motor de comandos entienda, SIN IA, frases como la del usuario. " +
      "Úsala UNA vez, justo después de resolver con gastos_anotar, gastos_resumen o gastos_listar un mensaje " +
      "del usuario que era un comando simple (no una conversación). El usuario decide en la isla si la acepta.\n" +
      "Formato (en minúsculas y sin tildes): palabra = debe aparecer tal cual; [a b] = opcional; " +
      "[a|b] = opcional, una de varias; (a|b c) = una de varias; ranuras {monto}, {cosa}, {periodo}, {categoria}. " +
      "Periodos válidos: hoy, ayer, esta semana, la semana pasada, este mes, el mes pasado, este ano. " +
      `Categorías: ${CATEGORIAS.join(", ")}.\n` +
      "Ejemplo: para «paque luca y media de micro» → patron «(pague|paque|pago) {monto} (de|en) {cosa}», " +
      "intencion «registrar-gasto». Incluye la variante con error de tipeo si la hubo. Si la herramienta " +
      "rechaza la propuesta, puedes corregirla una vez según el motivo; si no, déjalo.",
    inputSchema: {
      type: "object",
      properties: {
        ejemplo: { type: "string", maxLength: 300, description: "El mensaje del usuario, textual" },
        patron: { type: "string", maxLength: 300 },
        intencion: {
          type: "string",
          enum: ["registrar-gasto", "consultar-gastos", "ultimos-gastos", "borrar-ultimo-gasto"],
        },
      },
      required: ["ejemplo", "patron", "intencion"],
      additionalProperties: false,
    },
    annotations: { title: "Proponer plantilla", readOnlyHint: false, destructiveHint: false },
  },
];

class ErrorDeUso extends Error {}


function leerFecha(texto: unknown, nombre: string): Date | undefined {
  if (texto === undefined) return undefined;
  const partes = typeof texto === "string" ? texto.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const fecha = partes ? new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])) : null;
  if (!fecha || fecha.getMonth() !== Number(partes![2]) - 1) throw new ErrorDeUso(`«${nombre}» debe ser una fecha AAAA-MM-DD`);
  return fecha;
}

function fechaIso(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/** [desde, hasta] con días completos e incluidos; sin fechas, `porDefecto`. */
function leerRango(args: any, porDefecto: Rango | undefined): Rango | undefined {
  const desde = leerFecha(args.desde, "desde");
  const hasta = leerFecha(args.hasta, "hasta");
  if (!desde && !hasta) return porDefecto;
  return {
    desde: desde ?? new Date(0),
    hasta: hasta ? new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate() + 1) : new Date(8.64e15),
  };
}

function usar(gastos: Gastos, nombre: string, args: any): string {
  switch (nombre) {
    case "gastos_anotar": {
      const monto = args.monto;
      if (!Number.isInteger(monto) || monto < 1 || monto > MONTO_MAXIMO) {
        throw new ErrorDeUso(`«monto» debe ser un entero entre 1 y ${MONTO_MAXIMO}`);
      }
      const descripcion = typeof args.descripcion === "string" && args.descripcion.trim() ? args.descripcion.trim().slice(0, 200) : null;
      if (args.categoria !== undefined && !CATEGORIAS.includes(args.categoria)) {
        throw new ErrorDeUso(`«categoria» debe ser una de: ${CATEGORIAS.join(", ")}`);
      }
      const categoria: Categoria = args.categoria ?? (descripcion ? categoriaDe(normalizar(descripcion)) : "otros");
      const ahora = new Date();
      const fecha = leerFecha(args.fecha, "fecha") ?? ahora;
      const gasto = gastos.agregar({ monto, categoria, descripcion, fecha });
      const mes = gastos.total(rangoDe("este mes", ahora));
      const que = descripcion ? ` en ${descripcion}` : "";
      return (
        `Anotado (id ${gasto.id}): ${formatearMonto(monto)}${que} (${categoria}) el ${fechaIso(fecha)}. ` +
        `Este mes van ${formatearMonto(mes.total)}.`
      );
    }
    case "gastos_listar": {
      const limite = Number.isInteger(args.limite) ? Math.min(Math.max(args.limite, 1), 100) : 20;
      const lista = gastos.ultimos(limite, leerRango(args, undefined)).map((g) => ({
        id: g.id,
        fecha: fechaIso(g.fecha),
        monto: g.monto,
        categoria: g.categoria,
        descripcion: g.descripcion,
      }));
      return JSON.stringify({ moneda: "CLP", gastos: lista });
    }
    case "gastos_resumen": {
      const rango = leerRango(args, rangoDe("este mes", new Date()))!;
      const { total, cantidad } = gastos.total(rango);
      const hasta = new Date(rango.hasta.getTime() - 1);
      return JSON.stringify({
        moneda: "CLP",
        desde: rango.desde.getTime() > 0 ? fechaIso(rango.desde) : null,
        hasta: rango.hasta.getTime() < 8.64e15 ? fechaIso(hasta) : null,
        total,
        cantidad,
        porCategoria: gastos.porCategoria(rango),
      });
    }
    case "motor_proponer_plantilla": {
      if (typeof args.patron !== "string" || typeof args.ejemplo !== "string" || typeof args.intencion !== "string") {
        throw new ErrorDeUso("Faltan «patron», «ejemplo» o «intencion»");
      }
      const motor = new Motor(gastos, { plantillas: () => [...PLANTILLAS_BASE, ...gastos.plantillasActivas()] });
      const revision = proponerPlantilla(gastos, motor, args, new Date());
      if (!revision.ok) throw new ErrorDeUso(`Propuesta rechazada: ${revision.motivo}`);
      return "Propuesta guardada. Al terminar tu respuesta, el usuario decidirá en la isla si la aprendo.";
    }
    default:
      throw new ErrorDeUso(`Herramienta desconocida: ${nombre}`);
  }
}

/** Atiende un mensaje JSON-RPC. Devuelve la respuesta, o `null` si era una notificación. */
export function atender(gastos: Gastos, mensaje: any): object | null {
  const { id, method, params } = mensaje ?? {};
  if (id === undefined || id === null) return null;
  const responder = (result: object) => ({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      return responder({
        protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : VERSION_PROTOCOLO,
        capabilities: { tools: {} },
        serverInfo: { name: "gastos", version: "0.0.0" },
        instructions:
          "Gastos personales del usuario (estudiante en Chile), en pesos chilenos. Úsalas cuando hable de " +
          "plata, gastos o presupuesto. Son datos privados: no los compartas fuera de la conversación.",
      });
    case "ping":
      return responder({});
    case "tools/list":
      return responder({ tools: HERRAMIENTAS });
    case "tools/call":
      try {
        const texto = usar(gastos, String(params?.name), params?.arguments ?? {});
        return responder({ content: [{ type: "text", text: texto }] });
      } catch (error) {
        const motivo = error instanceof ErrorDeUso ? error.message : "No pude acceder a los gastos";
        if (!(error instanceof ErrorDeUso)) process.stderr.write(`[gastos] ${String(error)}\n`);
        return responder({ content: [{ type: "text", text: motivo }], isError: true });
      }
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Método no soportado: ${method}` } };
  }
}

// Solo al ejecutarlo directamente (las pruebas importan `atender`).
if (import.meta.main) {
  const gastos = new Gastos(process.env.ASISTENTE_GASTOS_DB ?? RUTA_BASE);
  const entrada = createInterface({ input: process.stdin });
  entrada.on("line", (linea) => {
    let mensaje: unknown;
    try {
      mensaje = JSON.parse(linea);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } })}\n`);
      return;
    }
    const respuesta = atender(gastos, mensaje);
    if (respuesta) process.stdout.write(`${JSON.stringify(respuesta)}\n`);
  });
  entrada.on("close", () => {
    gastos.cerrar();
    process.exit(0);
  });
}
