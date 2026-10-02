// Puente entre el personaje y el Gateway. La app de escritorio lo lanza como proceso hijo
// y conversa con él por líneas JSON: pedidos por la entrada estándar, avisos por la salida
// estándar. Los registros van a la salida de errores para no mezclarse con los avisos.
//
// Pedidos (entrada):
//   { "id": "1", "tipo": "enviar", "texto": "hola" }
//   { "id": "2", "tipo": "resolver", "aprobacion": "plugin:…", "kind": "plugin", "decision": "allow-once" }
// Avisos (salida):
//   { "tipo": "conexion", "conectado": true }   o   { "tipo": "conexion", "conectado": false, "detalle": "…" }
//   { "tipo": "evento", "marco": { "event": "agent", "payload": { … }, "seq": 12 } }
//   { "tipo": "respuesta", "id": "1", "ok": true }   o   { …, "ok": false, "error": "…" }
//   { "tipo": "respuesta", "id": "1", "ok": true, "local": { "texto": "Anotado: …", "intencion": "registrar-gasto" } }
//
// Cada mensaje pasa primero por el motor de comandos (sin IA): si calza con una plantilla,
// se responde aquí mismo con `local` y no llega al agente. Funciona aunque OpenClaw no esté.
//
// Al cerrarse la entrada (la app terminó), el puente se desconecta y sale.

import { createInterface } from "node:readline";
import { Gastos, Motor, RUTA_BASE } from "@asistente/motor";
import { type Decision, SESION, crearCliente, enviarMensaje, resolverAprobacion, suscribirseALaSesion } from "./conexion.ts";

// Eventos que el personaje no usa: se filtran aquí para no llenar el canal.
const IGNORADOS = new Set(["tick", "health", "presence", "heartbeat", "cron"]);
const DECISIONES = new Set<Decision>(["allow-once", "allow-always", "deny"]);

// Herramientas que el puente permite solo, sin preguntar en la isla: `ToolSearch` solo carga
// la definición de otra herramienta, y las de gastos son nuestras (packages/motor/src/mcp.ts)
// y no pueden borrar. Todo lo demás (comandos, leer o escribir archivos) sigue pidiendo permiso.
const PERMITIDAS_SIN_PREGUNTAR = new Set([
  "ToolSearch",
  "mcp__gastos__gastos_anotar",
  "mcp__gastos__gastos_listar",
  "mcp__gastos__gastos_resumen",
]);

const gastos = new Gastos(RUTA_BASE);
const motor = new Motor(gastos);
let conectado = false;

function avisar(aviso: unknown): void {
  process.stdout.write(`${JSON.stringify(aviso)}\n`);
}

function registrar(texto: string): void {
  process.stderr.write(`[puente] ${texto}\n`);
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** El cliente del Gateway, o `null` si no hay configuración de OpenClaw (los gastos funcionan igual). */
const cliente = (() => {
  try {
    const { cliente, url } = crearCliente({
      onHelloOk: async () => {
        try {
          await suscribirseALaSesion(cliente);
          registrar(`conectado a ${url}, suscrito a ${SESION}`);
          conectado = true;
          avisar({ tipo: "conexion", conectado: true });
        } catch (error) {
          registrar(`no se pudo suscribir a la sesión: ${mensajeDe(error)}`);
          avisar({ tipo: "conexion", conectado: false, detalle: `No pude suscribirme a la sesión: ${mensajeDe(error)}` });
        }
      },
      onEvent: (marco: any) => {
        if (IGNORADOS.has(marco?.event)) return;
        const reenviar = () =>
          avisar({ tipo: "evento", marco: { event: marco.event, payload: marco.payload, seq: marco.seq } });
        const aprobacion = marco.event === "session.approval" && marco.payload?.phase === "pending" ? marco.payload.approval : null;
        const herramienta = aprobacion?.presentation?.toolName;
        if (
          PERMITIDAS_SIN_PREGUNTAR.has(herramienta) &&
          aprobacion.presentation.allowedDecisions?.includes("allow-once")
        ) {
          // La isla no ve la solicitud; si permitirla falla, se la muestra para que decida el usuario.
          registrar(`permiso automático: ${herramienta}`);
          resolverAprobacion(cliente, aprobacion.id, aprobacion.presentation.kind ?? "plugin", "allow-once").catch(
            (error) => {
              registrar(`no se pudo permitir ${herramienta}: ${mensajeDe(error)}`);
              reenviar();
            },
          );
          return;
        }
        reenviar();
      },
      onConnectError: (error: Error) => {
        conectado = false;
        registrar(`error de conexión: ${error.message}`);
        avisar({ tipo: "conexion", conectado: false, detalle: error.message });
      },
      onReconnectPaused: (info: { code: number; reason: string; detailCode: string | null }) => {
        conectado = false;
        registrar(`reconexión en pausa (${info.detailCode ?? info.code}): ${info.reason}`);
        avisar({ tipo: "conexion", conectado: false, detalle: info.reason });
      },
      onClose: (code: number, reason: string) => {
        conectado = false;
        registrar(`conexión cerrada (${code}) ${reason}`);
        avisar({ tipo: "conexion", conectado: false, detalle: reason || "Se cerró la conexión con OpenClaw" });
      },
    });
    return cliente;
  } catch (error) {
    registrar(`sin OpenClaw: ${mensajeDe(error)}`);
    avisar({ tipo: "conexion", conectado: false, detalle: "No encontré la configuración de OpenClaw" });
    return null;
  }
})();

/** Lo que se agrega a la respuesta: con `local`, el motor resolvió el pedido sin IA. */
type Extra = { local?: { texto: string; intencion: string } };

async function atender(pedido: any): Promise<Extra> {
  if (pedido?.tipo === "enviar" && typeof pedido.texto === "string" && pedido.texto.trim()) {
    const texto = pedido.texto.trim();
    const resuelto = motor.resolver(texto);
    if (resuelto) {
      gastos.registrarUso("motor", resuelto.intencion, new Date());
      registrar(`resuelto sin IA (${resuelto.plantilla})`);
      return { local: { texto: resuelto.texto, intencion: resuelto.intencion } };
    }
    if (!conectado) throw new Error("OpenClaw no está conectado; sin él solo funcionan los comandos de gastos");
    await enviarMensaje(cliente!, texto);
    gastos.registrarUso("agente", null, new Date());
    return {};
  }
  if (
    pedido?.tipo === "resolver" &&
    typeof pedido.aprobacion === "string" &&
    typeof pedido.kind === "string" &&
    DECISIONES.has(pedido.decision)
  ) {
    if (!cliente) throw new Error("OpenClaw no está conectado");
    await resolverAprobacion(cliente, pedido.aprobacion, pedido.kind, pedido.decision);
    return {};
  }
  throw new Error("Pedido no válido");
}

const entrada = createInterface({ input: process.stdin });
entrada.on("line", (linea) => {
  let pedido: any;
  try {
    pedido = JSON.parse(linea);
  } catch {
    registrar("línea que no es JSON, ignorada");
    return;
  }
  const id = typeof pedido?.id === "string" ? pedido.id : null;
  atender(pedido).then(
    (extra) => id && avisar({ tipo: "respuesta", id, ok: true, ...extra }),
    (error) => id && avisar({ tipo: "respuesta", id, ok: false, error: mensajeDe(error) }),
  );
});

async function salir(): Promise<void> {
  await cliente?.stopAndWait().catch(() => {});
  gastos.cerrar();
  process.exit(0);
}

entrada.on("close", () => void salir());
// Si la app se cerró de golpe, escribir en la salida falla (EPIPE): solo queda irse.
process.stdout.on("error", () => process.exit(0));
process.on("SIGTERM", () => void salir());
process.on("SIGINT", () => void salir());

cliente?.start();
