// Prueba del Gateway (paso 3): se conecta como operador, muestra los eventos del
// agente en vivo y, si se le pasa un mensaje, se lo envía.
//
//   pnpm spike                      solo escucha
//   pnpm spike "¿qué hora es?"      envía un mensaje y escucha la ejecución
//   SPIKE_APROBACION=allow-once pnpm spike "..."   además responde las solicitudes de permiso

import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { GatewayClient } from "@openclaw/gateway-client";
import { GATEWAY_CLIENT_CAPS } from "@openclaw/gateway-protocol/client-info";
import { dependenciasDeDispositivo } from "./identidad.ts";

const AGENTE = process.env.OPENCLAW_AGENT ?? "asistente-multiplataforma";
const SESION = process.env.OPENCLAW_SESSION ?? `agent:${AGENTE}:main`;
const mensaje = process.argv.slice(2).join(" ").trim();
// Respuesta automática a las solicitudes de permiso: "allow-once" o "deny". Sin valor, solo se muestran.
const DECISION = process.env.SPIKE_APROBACION;

type Estado = "reposo" | "pensando" | "trabajando" | "pidiendo-permiso" | "listo" | "error";

// El token se lee al ejecutar, desde la configuración de OpenClaw; nunca se guarda en el repo.
function leerConexion(): { url: string; token: string } {
  const config = JSON.parse(readFileSync(join(homedir(), ".openclaw", "openclaw.json"), "utf8"));
  const token = process.env.OPENCLAW_GATEWAY_TOKEN ?? config?.gateway?.auth?.token;
  if (!token) throw new Error("No encontré el token del Gateway en ~/.openclaw/openclaw.json");
  const puerto = config?.gateway?.port ?? 18789;
  return { url: `ws://127.0.0.1:${puerto}`, token };
}

// Cómo se traducen los eventos a estados del personaje, según lo observado en la prueba.
function estadoDesde(evento: string, payload: any): Estado | null {
  if (evento === "session.approval") return payload?.phase === "pending" ? "pidiendo-permiso" : "trabajando";
  if (evento !== "agent") return null;
  const fase = String(payload?.data?.phase ?? "");
  switch (payload?.stream) {
    case "lifecycle":
      if (fase === "start") return "pensando";
      if (fase === "end") return "listo";
      if (/error|fail|abort/i.test(fase)) return "error";
      return null;
    case "thinking":
    case "assistant":
      return "pensando";
    case "tool":
      return "trabajando";
    case "error":
      return "error";
    default:
      return null;
  }
}

function resumir(valor: unknown, max = 160): string {
  const texto = typeof valor === "string" ? valor : JSON.stringify(valor);
  if (!texto) return "";
  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
}

const archivoEventos = join(tmpdir(), `openclaw-eventos-${Date.now()}.jsonl`);

// Las solicitudes de permiso solo llegan a quien se suscribe a la sesión con includeApprovals.
async function suscribirseALaSesion(): Promise<void> {
  await cliente.request("sessions.messages.subscribe", {
    key: SESION,
    agentId: AGENTE,
    subscriptionId: "personaje",
    includeApprovals: true,
  });
  console.log(`Suscrito a ${SESION} (con aprobaciones)`);
}

async function responderAprobacion(approval: any): Promise<void> {
  if (!DECISION) return;
  const kind = approval?.presentation?.kind ?? "exec";
  const resultado = await cliente.request("approval.resolve", { id: approval.id, kind, decision: DECISION });
  console.log(`  ✓ Respondida con "${DECISION}": ${resumir(resultado)}`);
}

let estadoActual: Estado = "reposo";
let ejecucionTerminada = false;

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

  onHelloOk: async (hello: any) => {
    const metodos: string[] = hello?.features?.methods ?? [];
    console.log(`\nConectado a ${url} · protocolo v${hello?.protocol}`);
    console.log(`Métodos disponibles: ${metodos.length}`);
    for (const m of ["chat.send", "sessions.messages.subscribe", "approval.resolve"]) {
      console.log(`  ${metodos.includes(m) ? "sí" : "no"}  ${m}`);
    }
    console.log(`Eventos crudos en: ${archivoEventos}`);
    try {
      await suscribirseALaSesion();
    } catch (error) {
      console.error(`✗ No se pudo suscribir a la sesión: ${(error as Error).message}`);
    }
    console.log("");

    if (!mensaje) {
      console.log("Escuchando… (Ctrl+C para salir)");
      return;
    }
    try {
      console.log(`→ Enviando a ${SESION}: "${mensaje}"`);
      const respuesta = await cliente.request("chat.send", {
        sessionKey: SESION,
        message: mensaje,
        idempotencyKey: randomUUID(),
      });
      console.log(`← chat.send respondió: ${resumir(respuesta)}`);
    } catch (error) {
      console.error(`✗ chat.send falló: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  },

  onEvent: (frame: any) => {
    appendFileSync(archivoEventos, `${JSON.stringify(frame)}\n`);
    const { event, payload } = frame;
    if (event === "tick" || event === "health" || event === "presence") return;

    const nuevo = estadoDesde(event, payload);
    if (nuevo && nuevo !== estadoActual) {
      estadoActual = nuevo;
      console.log(`  ▶ ESTADO: ${nuevo}`);
    }

    const detalle =
      event === "agent"
        ? `[${payload?.stream} #${payload?.seq}] ${resumir(payload?.data)}`
        : resumir(payload);
    console.log(`${event} ${detalle}`);

    if (event === "session.approval" && payload?.phase === "pending") {
      console.log(`  ⚠ Pide permiso para: ${resumir(payload?.approval?.presentation, 300)}`);
      responderAprobacion(payload.approval).catch((error: Error) =>
        console.error(`  ✗ No se pudo responder: ${error.message}`),
      );
    }

    if (mensaje && nuevo === "listo") ejecucionTerminada = true;
  },

  onConnectError: (error: Error) => {
    const detalles = (error as any)?.details ?? (error as any)?.data;
    console.error(`✗ Error de conexión: ${error.message}`);
    if (detalles) console.error(`  detalles: ${resumir(detalles, 400)}`);
  },

  onReconnectPaused: (info: { code: number; reason: string; detailCode: string | null }) => {
    console.error(`✗ Reconexión en pausa (${info.detailCode ?? info.code}): ${info.reason}`);
  },

  onClose: (code: number, reason: string) => {
    console.log(`Conexión cerrada (${code}) ${reason}`);
  },
});

cliente.start();

// Con un mensaje: cierra solo poco después de que la ejecución termine.
if (mensaje) {
  const espera = setInterval(() => {
    if (!ejecucionTerminada) return;
    clearInterval(espera);
    setTimeout(() => void cliente.stopAndWait().then(() => process.exit()), 1500);
  }, 250);
}

process.on("SIGINT", () => {
  void cliente.stopAndWait().then(() => process.exit());
});
