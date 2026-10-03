// El servidor local que recibe los eventos del hook de Claude Code (modo programador). Escucha solo
// en 127.0.0.1, en un puerto al azar, y exige un token que se renueva cada vez que Brote parte. El
// puerto y el token quedan en ~/.asistente-prototipo/hooks.json (permisos 600), de donde los lee el
// hook (hook.ts) y el servidor MCP (para `programador_sesiones`).
//
//   POST /evento    (del hook)  → 200 con {} o, para un permiso respondido en la isla, { decision }
//   GET  /sesiones  (del MCP)   → 200 con la lista de sesiones visibles
//   POST /consulta  (del MCP)   → 200 con lo que responda `consultar` (música y calendario: el MCP
//                                 corre dentro de OpenClaw, sin los permisos de macOS que tiene Brote)

import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { dirname } from "node:path";
import { RUTA_CONEXION_HOOKS } from "@asistente/motor";
const TAMANO_MAXIMO = 64 * 1024;

export interface OpcionesServidor {
  /** Un evento del hook. Lo que devuelve va en la respuesta (para los permisos, puede tardar). */
  alEvento: (datos: unknown) => Promise<object> | object;
  /** Las sesiones para el servidor MCP. */
  sesiones: () => unknown;
  /** Una consulta del servidor MCP ({ tipo, ... }). Si no la conoce, debe lanzar un error. */
  consultar?: (datos: unknown) => Promise<object> | object;
}

function tokenValido(pedido: IncomingMessage, token: string): boolean {
  const recibido = Buffer.from(String(pedido.headers.authorization ?? ""));
  const esperado = Buffer.from(`Bearer ${token}`);
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

function leerCuerpo(pedido: IncomingMessage): Promise<string | null> {
  return new Promise((listo) => {
    let texto = "";
    let largo = 0;
    pedido.setEncoding("utf8");
    pedido.on("data", (parte: string) => {
      largo += Buffer.byteLength(parte);
      if (largo > TAMANO_MAXIMO) {
        listo(null);
        pedido.destroy();
      } else texto += parte;
    });
    pedido.on("end", () => listo(texto));
    pedido.on("error", () => listo(null));
  });
}

export function iniciarServidorHooks(opciones: OpcionesServidor, token = randomBytes(32).toString("hex")): Promise<{ servidor: Server; puerto: number; token: string }> {
  const servidor = createServer(async (pedido, respuesta) => {
    const responder = (codigo: number, cuerpo: unknown) => {
      if (respuesta.writableEnded) return;
      respuesta.writeHead(codigo, { "content-type": "application/json" });
      respuesta.end(JSON.stringify(cuerpo));
    };
    // Un navegador no puede mandar el encabezado Authorization a otro origen sin permiso: igual se
    // rechaza todo lo que traiga Origin, por si acaso.
    if (pedido.headers.origin || !tokenValido(pedido, token)) return responder(401, { error: "no autorizado" });
    if (pedido.method === "GET" && pedido.url === "/sesiones") return responder(200, { sesiones: opciones.sesiones() });
    const esConsulta = pedido.url === "/consulta" && opciones.consultar;
    if (pedido.method !== "POST" || (pedido.url !== "/evento" && !esConsulta)) return responder(404, { error: "no existe" });
    const cuerpo = await leerCuerpo(pedido);
    let datos: unknown;
    try {
      datos = JSON.parse(cuerpo ?? "");
    } catch {
      return responder(400, { error: "JSON inválido" });
    }
    if (esConsulta) {
      try {
        return responder(200, await opciones.consultar!(datos));
      } catch {
        return responder(400, { error: "consulta inválida" });
      }
    }
    try {
      responder(200, await opciones.alEvento(datos));
    } catch {
      responder(200, {});
    }
  });
  return new Promise((listo, fallo) => {
    servidor.once("error", fallo);
    servidor.listen(0, "127.0.0.1", () => {
      const direccion = servidor.address();
      if (!direccion || typeof direccion === "string") return fallo(new Error("sin puerto"));
      listo({ servidor, puerto: direccion.port, token });
    });
  });
}

/** Deja el puerto y el token para el hook y el servidor MCP (solo el usuario puede leerlos). */
export function guardarConexion(puerto: number, token: string, ruta = RUTA_CONEXION_HOOKS): void {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  writeFileSync(ruta, JSON.stringify({ puerto, token }), { mode: 0o600 });
  chmodSync(ruta, 0o600);
}
