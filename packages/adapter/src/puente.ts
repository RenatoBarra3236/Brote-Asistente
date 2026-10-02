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
//   { "tipo": "propuesta", "propuesta": { "id": 3, "ejemplo": "paque luca…", "accion": "anotar un gasto" } }
//
// Pedido para responder una propuesta del motor que aprende:
//   { "id": "3", "tipo": "decidir-plantilla", "plantilla": 3, "aceptar": true }   → respuesta con "mensaje"
//   { "id": "4", "tipo": "detener", "runId": "…" }   corta el turno del agente (runId opcional)
//
// Cada mensaje pasa primero por el motor de comandos (sin IA): si calza con una plantilla,
// se responde aquí mismo con `local` y no llega al agente. Funciona aunque OpenClaw no esté.
//
// Al cerrarse la entrada (la app terminó), el puente se desconecta y sale.

import { createInterface } from "node:readline";
import {
  Gastos,
  Motor,
  PLANTILLAS_BASE,
  RUTA_BASE,
  deducirPlantilla,
  describirIntencion,
  mismaFrase,
  porcentajeSinIA,
  proponerPlantilla,
} from "@asistente/motor";
import {
  type Decision,
  SESION,
  crearCliente,
  detenerTurno,
  enviarMensaje,
  resolverAprobacion,
  suscribirseALaSesion,
} from "./conexion.ts";
import { esDeMemoria } from "./permisos.ts";

// Eventos que el personaje no usa: se filtran aquí para no llenar el canal.
const IGNORADOS = new Set(["tick", "health", "presence", "heartbeat", "cron"]);
const DECISIONES = new Set<Decision>(["allow-once", "allow-always", "deny"]);

// Herramientas que el puente permite solo, sin preguntar en la isla: `ToolSearch` solo carga
// la definición de otra herramienta, y las de gastos son nuestras (packages/motor/src/mcp.ts)
// y no pueden borrar. Todo lo demás (comandos, leer o escribir archivos) sigue pidiendo permiso.
const PERMITIDAS_SIN_PREGUNTAR = new Set([
  "ToolSearch",
  "mcp__gastos__motor_proponer_plantilla",
  "mcp__gastos__gastos_anotar",
  "mcp__gastos__gastos_listar",
  "mcp__gastos__gastos_resumen",
]);

let renovacion: ReturnType<typeof setTimeout> | undefined;

/** Vuelve a suscribirse a la sesión (agrupa los avisos seguidos en una sola renovación). */
function renovarSuscripcion(cliente: Parameters<typeof suscribirseALaSesion>[0]): void {
  clearTimeout(renovacion);
  renovacion = setTimeout(() => {
    suscribirseALaSesion(cliente).then(
      () => registrar("suscripción renovada"),
      (error) => registrar(`no se pudo renovar la suscripción: ${mensajeDe(error)}`),
    );
  }, 500);
}

const gastos = new Gastos(RUTA_BASE);
// Las plantillas aprendidas se leen en cada mensaje: una recién aceptada sirve al tiro.
const motor = new Motor(gastos, { plantillas: () => [...PLANTILLAS_BASE, ...gastos.plantillasActivas()] });
let conectado = false;
/** El último mensaje que este puente envió al agente: las propuestas deben venir de él. */
let ultimoMensajeAlAgente: string | null = null;
const propuestasAvisadas = new Set<number>();
/** Las llamadas a `gastos_anotar` del turno en curso (sin repetir), para aprender de ellas. */
const anotacionesDelTurno = new Map<string, { monto: number; descripcion?: string }>();

function recordarAnotacion(args: any): void {
  if (!Number.isInteger(args?.monto)) return;
  const descripcion = typeof args.descripcion === "string" ? args.descripcion : undefined;
  anotacionesDelTurno.set(JSON.stringify([args.monto, descripcion]), { monto: args.monto, descripcion });
}

/**
 * El motor aprende de cómo resolvió el agente: si el turno anotó exactamente un gasto, se busca
 * en el mensaje dónde estaban el monto y la descripción y se propone esa plantilla. No depende de
 * que el agente decida proponerla (la herramienta `motor_proponer_plantilla` queda para lo demás).
 */
function aprenderDelTurno(): void {
  const anotaciones = [...anotacionesDelTurno.values()];
  anotacionesDelTurno.clear();
  if (!ultimoMensajeAlAgente || anotaciones.length !== 1) return;
  const patron = deducirPlantilla(ultimoMensajeAlAgente, anotaciones[0]);
  if (!patron) return registrar("no pude deducir una plantilla del turno");
  const revision = proponerPlantilla(
    gastos,
    motor,
    { patron, intencion: "registrar-gasto", ejemplo: ultimoMensajeAlAgente },
    new Date(),
  );
  registrar(revision.ok ? `plantilla deducida: ${patron}` : `plantilla deducida descartada (${revision.motivo})`);
}

/**
 * Al terminar un turno del agente, avisa a la isla de las plantillas que propuso. Una propuesta
 * que no corresponde al último mensaje del usuario (por ejemplo, inducida por el contenido de un
 * archivo) se descarta.
 */
function avisarPropuestas(): void {
  for (const propuesta of gastos.plantillasPropuestas()) {
    if (propuestasAvisadas.has(propuesta.id)) continue;
    propuestasAvisadas.add(propuesta.id);
    if (!ultimoMensajeAlAgente || !mismaFrase(propuesta.ejemplo, ultimoMensajeAlAgente)) {
      registrar(`propuesta ${propuesta.id} descartada: no viene del último mensaje`);
      gastos.decidirPlantilla(propuesta.id, false, new Date());
      continue;
    }
    registrar(`propuesta ${propuesta.id}: ${propuesta.patron}`);
    avisar({
      tipo: "propuesta",
      propuesta: { id: propuesta.id, ejemplo: propuesta.ejemplo, accion: describirIntencion(propuesta.intencion) },
    });
  }
}

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
        // Tras un "/reset" la sesión cambia de id y las solicitudes de permiso dejan de llegar a
        // una suscripción vieja (sin nadie que responda, OpenClaw las deniega): hay que renovarla.
        if (marco.event === "sessions.changed") renovarSuscripcion(cliente);
        const reenviar = () =>
          avisar({ tipo: "evento", marco: { event: marco.event, payload: marco.payload, seq: marco.seq } });
        const aprobacion = marco.event === "session.approval" && marco.payload?.phase === "pending" ? marco.payload.approval : null;
        const herramienta = aprobacion?.presentation?.toolName;
        // Lo que anotó el agente llega en la solicitud de permiso y en el evento de la herramienta.
        if (herramienta === "mcp__gastos__gastos_anotar") {
          try {
            recordarAnotacion(JSON.parse(aprobacion.presentation.detail));
          } catch {
            // Detalle sin JSON: queda el evento de la herramienta.
          }
        }
        const datos = marco.payload?.data;
        if (marco.event === "agent" && marco.payload?.stream === "tool" && datos?.phase === "start") {
          if (String(datos.name ?? "").endsWith("gastos_anotar")) recordarAnotacion(datos.args);
        }
        if (
          (PERMITIDAS_SIN_PREGUNTAR.has(herramienta) || esDeMemoria(herramienta, aprobacion?.presentation?.detail)) &&
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
        if (marco.event === "agent" && marco.payload?.stream === "lifecycle" && marco.payload?.data?.phase === "end") {
          aprenderDelTurno();
          avisarPropuestas();
        }
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
type Extra = { local?: { texto: string; intencion: string }; mensaje?: string };

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
    ultimoMensajeAlAgente = texto;
    anotacionesDelTurno.clear();
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
  if (pedido?.tipo === "detener") {
    if (!cliente || !conectado) throw new Error("OpenClaw no está conectado");
    await detenerTurno(cliente, typeof pedido.runId === "string" ? pedido.runId : undefined);
    return {};
  }
  if (pedido?.tipo === "decidir-plantilla" && Number.isInteger(pedido.plantilla) && typeof pedido.aceptar === "boolean") {
    const decidida = gastos.decidirPlantilla(pedido.plantilla, pedido.aceptar, new Date());
    if (!decidida) throw new Error("Esa propuesta ya no está pendiente");
    if (decidida.estado !== "activa") return { mensaje: "Ok, no la aprendo." };
    return {
      mensaje:
        `Listo, aprendí a entender «${decidida.ejemplo}». La próxima vez lo resuelvo sin IA ⚡ ` +
        `(vas en ${porcentajeSinIA(gastos)}% sin IA).`,
    };
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
