// Lo común para hablar con el Gateway como operador: dónde está, cómo se crea el cliente
// y las tres llamadas que usa el personaje. Lo usan el spike y el puente.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { GatewayClient, type GatewayClientOptions } from "@openclaw/gateway-client";
import { GATEWAY_CLIENT_CAPS } from "@openclaw/gateway-protocol/client-info";
import { dependenciasDeDispositivo } from "./identidad.ts";

import { AGENTE, CONFIG_OPENCLAW } from "./rutas.ts";

export { AGENTE };
export const SESION = process.env.OPENCLAW_SESSION ?? `agent:${AGENTE}:main`;

export type Decision = "allow-once" | "allow-always" | "deny";

/** Los avisos del cliente que le interesan a quien lo usa. */
export type Avisos = Pick<GatewayClientOptions, "onHelloOk" | "onEvent" | "onConnectError" | "onReconnectPaused" | "onClose">;

// El token se lee al ejecutar, desde la configuración de OpenClaw; nunca se guarda en el repo.
export function leerConexion(): { url: string; token: string } {
  const config = JSON.parse(readFileSync(CONFIG_OPENCLAW, "utf8"));
  const token = process.env.OPENCLAW_GATEWAY_TOKEN ?? config?.gateway?.auth?.token;
  if (!token) throw new Error(`No encontré el token del Gateway en ${CONFIG_OPENCLAW}`);
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
    // `operator.admin` hace falta para que OpenClaw entregue las solicitudes de permiso de las
    // herramientas nativas de Claude Code (Read, Bash…): solo las ven clientes administradores.
    // Sin él, con el TUI cerrado, OpenClaw las niega al instante ("no-approval-route").
    scopes: ["operator.read", "operator.write", "operator.approvals", "operator.admin"],
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

/** Empieza una conversación nueva: OpenClaw archiva la actual (y guarda su resumen en la memoria). */
export function nuevaConversacion(cliente: GatewayClient): Promise<unknown> {
  return cliente.request("sessions.reset", { key: SESION, agentId: AGENTE, reason: "new" });
}

/** Corta el turno en curso del agente (o uno en particular, con `runId`). */
export function detenerTurno(cliente: GatewayClient, runId?: string): Promise<unknown> {
  return cliente.request("chat.abort", { sessionKey: SESION, agentId: AGENTE, ...(runId ? { runId } : {}) });
}

export function resolverAprobacion(cliente: GatewayClient, id: string, kind: string, decision: Decision): Promise<unknown> {
  return cliente.request("approval.resolve", { id, kind, decision });
}
