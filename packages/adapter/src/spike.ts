// Prueba del Gateway (paso 3): se conecta como operador, muestra los eventos del
// agente en vivo y, si se le pasa un mensaje, se lo envía.
//
//   pnpm spike                      solo escucha
//   pnpm spike "¿qué hora es?"      envía un mensaje y escucha la ejecución
//   SPIKE_APROBACION=allow-once pnpm spike "..."   además responde las solicitudes de permiso

import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Decision, SESION, crearCliente, enviarMensaje, resolverAprobacion, suscribirseALaSesion } from "./conexion.ts";

const mensaje = process.argv.slice(2).join(" ").trim();
// Respuesta automática a las solicitudes de permiso: "allow-once" o "deny". Sin valor, solo se muestran.
const DECISION = process.env.SPIKE_APROBACION as Decision | undefined;

type Estado = "reposo" | "pensando" | "trabajando" | "pidiendo-permiso" | "listo" | "error";

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

async function responderAprobacion(approval: any): Promise<void> {
  if (!DECISION) return;
  const kind = approval?.presentation?.kind ?? "exec";
  const resultado = await resolverAprobacion(cliente, approval.id, kind, DECISION);
  console.log(`  ✓ Respondida con "${DECISION}": ${resumir(resultado)}`);
}

let estadoActual: Estado = "reposo";
let ejecucionTerminada = false;

const { cliente, url } = crearCliente({
  onHelloOk: async (hello: any) => {
    const metodos: string[] = hello?.features?.methods ?? [];
    console.log(`\nConectado a ${url} · protocolo v${hello?.protocol}`);
    console.log(`Métodos disponibles: ${metodos.length}`);
    for (const m of ["chat.send", "sessions.messages.subscribe", "approval.resolve"]) {
      console.log(`  ${metodos.includes(m) ? "sí" : "no"}  ${m}`);
    }
    console.log(`Eventos crudos en: ${archivoEventos}`);
    try {
      await suscribirseALaSesion(cliente);
      console.log(`Suscrito a ${SESION} (con aprobaciones)`);
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
      const respuesta = await enviarMensaje(cliente, mensaje);
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
