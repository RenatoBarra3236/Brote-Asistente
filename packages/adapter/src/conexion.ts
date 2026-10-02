// Lo común para hablar con el Gateway como operador: dónde está, cómo se crea el cliente
// y las tres llamadas que usa el personaje. Lo usan el spike y el puente.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { GatewayClient, type GatewayClientOptions } from "@openclaw/gateway-client";
import { GATEWAY_CLIENT_CAPS } from "@openclaw/gateway-protocol/client-info";
import { dependenciasDeDispositivo } from "./identidad.ts";

export const AGENTE = process.env.OPENCLAW_AGENT ?? "asistente-multiplataforma";
export const SESION = process.env.OPENCLAW_SESSION ?? `agent:${AGENTE}:main`;

export type Decision = "allow-once" | "allow-always" | "deny";

/** Los avisos del cliente que le interesan a quien lo usa. */
export type Avisos = Pick<GatewayClientOptions, "onHelloOk" | "onEvent" | "onConnectError" | "onReconnectPaused" | "onClose">;

// El token se lee al ejecutar, desde la configuración de OpenClaw; nunca se guarda en el repo.
export function leerConexion(): { url: string; token: string } {
  const config = JSON.parse(readFileSync(join(homedir(), ".openclaw", "openclaw.json"), "utf8"));
  const token = process.env.OPENCLAW_GATEWAY_TOKEN ?? config?.gateway?.auth?.token;
  if (!token) throw new Error("No encontré el token del Gateway en ~/.openclaw/openclaw.json");
  const puerto = config?.gateway?.port ?? 18789;
  return { url: `ws://127.0.0.1:${puerto}`, token };
}

/** Cliente operador con identidad de dispositivo (sin ella el Gateway solo da `operator.read`). */
export function crearCliente(avisos: Avisos): { cliente: GatewayClient; url: string } {
  const { url, token } = leerConexion();
  const cliente = new GatewayClient({
    url,
    token,
    clientName: "gateway-client",
    clientDisplayName: "Personaje (prototipo)",
    clientVersion: "0.0.0",
    platform: process.platform,
    mode: "ui",
    role: "operator",
    scopes: ["operator.read", "operator.write", "operator.approvals"],
    caps: [
      GATEWAY_CLIENT_CAPS.TOOL_EVENTS,
      GATEWAY_CLIENT_CAPS.APPROVALS,
      GATEWAY_CLIENT_CAPS.EXEC_APPROVALS,
      GATEWAY_CLIENT_CAPS.PLUGIN_APPROVALS,
    ],
    minProtocol: 4,
    maxProtocol: 4,
    hostDeps: dependenciasDeDispositivo(),
    ...avisos,
  });
  return { cliente, url };
}

// Las solicitudes de permiso solo llegan a quien se suscribe a la sesión con includeApprovals.
export async function suscribirseALaSesion(cliente: GatewayClient): Promise<void> {
  await cliente.request("sessions.messages.subscribe", {
    key: SESION,
    agentId: AGENTE,
    subscriptionId: "personaje",
    includeApprovals: true,
  });
}

export function enviarMensaje(cliente: GatewayClient, texto: string): Promise<unknown> {
  return cliente.request("chat.send", { sessionKey: SESION, message: texto, idempotencyKey: randomUUID() });
}

export function resolverAprobacion(cliente: GatewayClient, id: string, kind: string, decision: Decision): Promise<unknown> {
  return cliente.request("approval.resolve", { id, kind, decision });
}
