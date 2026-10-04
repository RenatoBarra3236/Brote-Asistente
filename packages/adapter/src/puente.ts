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
// "Lo que sé de ti" (paso 9):
//   { "tipo": "memoria-listar" }                        → respuesta con "datos": { recuerdos, frases, sinIA }
//   { "tipo": "memoria-olvidar", "recuerdo": "brote:x.md" }
//   { "tipo": "memoria-corregir", "recuerdo": "brote:x.md", "texto": "…" }
//   { "tipo": "frase-olvidar", "plantilla": 3 }
//   { "tipo": "conversacion-nueva" }                    archiva la conversación actual en OpenClaw
//   { "tipo": "memoria-buscar", "tema": "notebook" }    → "datos": ids de lo que lo menciona
//   { "tipo": "memoria-olvidar-tema", "tema": "notebook" }  conversación nueva + olvida todo lo que lo menciona
//
// Temporizadores y pomodoro:
//   aviso { "tipo": "temporizadores", "lista": [...] }       cada vez que cambian
//   aviso { "tipo": "temporizador-aviso", "texto": "…" }    al terminar uno o cambiar de fase el pomodoro
//   pedido { "tipo": "temporizador-cancelar", "temporizador": 3 }
//
// Brote reacciona al computador:
//   aviso { "tipo": "animo", "animo": "cansado" | "acalorado" | null }   cuando cambia
//   aviso { "tipo": "equipo-aviso", "texto": "…", "celebrar": false }     batería baja, CPU alta, disco lleno…
//   pedido { "tipo": "equipo-estado" }                                      → "datos": { animo, lectura }
//
// Descargas (carpeta de descargas, con fs.watch y una revisión cada 4 s por si el aviso no llega):
//   aviso { "tipo": "descargas", "enCurso": [{ id, nombre, tamano }] }      cuando cambia
//   aviso { "tipo": "descarga-lista", "descarga": { nombre, ruta, tamano, fechaMs } }
//   pedido { "tipo": "descargas-listar" }                                   → "datos": las últimas 10
//   Mostrar o abrir un archivo lo hace Rust (`mostrar_descarga`), que valida que esté en Descargas.
//
// Música (Spotify y Música en macOS, solo si ya están abiertos; controles de medios en Windows):
//   aviso { "tipo": "musica", "estado": { app, sonando, cancion, artista } | null }   cuando cambia
//   pedido { "tipo": "musica-control", "accion": "play-pausa" | "play" | "pausa" | "siguiente" | "anterior" }
//
// Calendario (Calendario del Mac con EventKit y/o la dirección iCal de ~/.asistente-prototipo/calendario.json):
//   aviso { "tipo": "calendario", "proximo": { titulo, lugar, inicioMs, finMs } | null, "etiqueta": "Cálculo en 25 min" }
//   aviso { "tipo": "calendario-aviso", "texto": "📅 En 10 min: Cálculo…" }
//   pedido { "tipo": "calendario-estado" }   → "datos": { proximo, etiqueta }
//
// Modo programador (sesiones de Claude Code del usuario, por sus hooks; servidor-hooks.ts):
//   aviso { "tipo": "programador", "sesiones": [...], "permisos": [{ id, proyecto, titulo, detalle }] }   cuando cambian
//   aviso { "tipo": "programador-reaccion", "reaccion": "termino" | "fallo", "proyecto": "…" }
//   pedido { "tipo": "programador-decidir", "permiso": "…", "decision": "allow" | "deny" }
//   pedido { "tipo": "programador-estado" }   → "datos": { sesiones, permisos }
//
// Aula (Canvas o Moodle, solo lectura; ~/.asistente-prototipo/aula.json lo escribe Rust):
//   aviso { "tipo": "aula", "configurada": true, "proxima": { curso, titulo, entregaMs, url, entregada } | null, "pendientes": 3, "error": null }
//   aviso { "tipo": "aula-aviso", "texto": "📚 Mañana a esta hora vence…" }   24 h y 2 h antes, una vez
//   pedido { "tipo": "aula-estado" }   → "datos": lo mismo que el aviso "aula"
//
// Funciones (Configurar Brote → Funciones; ~/.asistente-prototipo/funciones.json, lo escribe Rust):
//   lo apagado no se vigila (música, descargas, calendario, aula, equipo, temporizadores, modo
//   programador), el motor responde "Eso está apagado…" y la isla oculta sus tarjetas. El archivo se
//   relee cuando cambia (se mira cada 2 s).
//   aviso { "tipo": "funciones", "activas": { … }, "tarjetas": { orden, ocultas } }   al partir y cuando cambia
//   pedido { "tipo": "funciones-estado" }   → "datos": lo mismo
//   pedido { "tipo": "permisos-estado" }    → "datos": { descargas, automatizacion, calendarios } (lo que se sabe
//     de los permisos de macOS por las lecturas que ya se hicieron; nunca pregunta nada nuevo)
//
// Uso del plan de Claude (función "uso-del-plan"):
//   el % de la sesión de 5 h y de la semana llega de tres fuentes y vale la más reciente (combinarPlan
//   en motor/plan.ts): la statusline de Claude Code (statusline.ts → POST /plan), el archivo de la app
//   de escritorio de Claude (se mira cada minuto si cambió) y, como respaldo, la consulta mínima
//   (consulta-plan.ts, ~585 tokens): al pedir "uso-estado" si el dato tiene más de 15 min, y con
//   "plan-actualizar" (el botón ↻), nunca más de una vez cada 15 min (2 min con el botón). Se guarda en
//   ~/.asistente-prototipo/plan.json (600) para que sobreviva reinicios. Los tokens se leen de las transcripciones de forma
//   incremental (uso-archivo.ts), solo cuando alguien los pide (la isla cada 60 s con la pestaña Claude
//   a la vista, el motor o el MCP) y como mucho una vez por minuto.
//   aviso { "tipo": "uso", "plan": { sesion, semana, modelo, actualizadoMs } | null, "statusline": true, "resumen": … | null, "precios": { fecha, fuente, modelos } }
//   aviso { "tipo": "plan-aviso", "texto": "Llevas 80 % de tu sesión de Claude; se reinicia a las 18:40" }   una vez por ventana
//   pedido { "tipo": "uso-estado", "refrescar"?: true }   → "datos": lo mismo que el aviso "uso" (con "consultando": true
//     mientras corre la consulta). `refrescar` solo lo manda la isla con la pestaña Claude a la vista.
//   pedido { "tipo": "plan-actualizar" }   → "datos": lo mismo, después de revisar la app y correr la consulta mínima
//
// Equipo de Brote (función "especialistas"; docs/plan-multiagente.md): Brote delega en especialistas
// (agentes de OpenClaw, cada uno con su IA). Los eventos de sus sesiones hijas y el turno del anuncio
// "[Inter-session message]" no se reenvían como si fueran de Brote (delegacion.ts): con ellos se arma
// la lista del equipo trabajando. Las respuestas NO_REPLY no se muestran.
//   aviso { "tipo": "especialistas", "lista": [{ sesion, id, nombre, emoji, ia, color, tarea, tareaCompleta, herramienta, args, estado, actividad, pasos, respuesta, inicioMs, finMs }] }
//   aviso { "tipo": "especialistas-aviso", "texto": "Tu plan semanal de Claude va alto…" }   una vez por cambio del freno
//   pedido { "tipo": "especialistas-estado" }   → "datos": { lista, frenado }
//   pedido { "tipo": "especialista-historial", "sesion": "agent:investigador:subagent:…" }   → "datos": { tarea, pasos, respuesta }
//     (chat.history de esa sesión hija; solo de un especialista que está en la lista)
// Cada especialista trae además su actividad (en-espera, pensando, trabajando, permiso), sus pasos (las
// herramientas con solo los argumentos útiles), lo que lleva de su respuesta y la tarea completa: la
// isla anima su mascota y muestra su conversación. El aviso se agrupa (cuatro por segundo como mucho).
// Freno por plan: sobre 85 % de la semana, Brote deja de delegar en los especialistas con Claude
// (salen de `allowAgents`; los de otras IA siguen) y vuelven bajo 80 % (equipo.json guarda el estado).
// Las solicitudes de permiso de un especialista siempre llegan a la isla: nunca se permiten solas.
//
// Plata (función "gastos"; la pestaña Plata de la isla): el resumen de los gastos, el presupuesto del
// mes y lo que se descubre sin IA (motor/plata.ts). La base se mira cada 2 s (gastos.marca()), así
// también aparece al tiro lo que anota el agente por MCP.
//   aviso { "tipo": "plata", "plata": EstadoPlata | null }   al partir, al cambiar los gastos o el presupuesto, y al cambiar el día
//   aviso { "tipo": "plata-aviso", "texto": "👀 Ojo: ya llevas el 80 %…" }   80 % y 100 % del presupuesto, una vez cada uno por mes
//   pedido { "tipo": "plata-estado" }   → "datos": EstadoPlata | null
//   pedido { "tipo": "plata-anotar", "monto": 1500, "descripcion": "café" }   → "mensaje"; solo uno de los botones de un toque
//   pedido { "tipo": "presupuesto-poner", "monto": 200000 | null }   → "datos": EstadoPlata (null quita el presupuesto)
//
// Conectores (Todoist, Notion…): sus herramientas de solo lectura pasan sin preguntar si el conector
// está conectado (conectores.ts); las solicitudes de permiso y las herramientas en curso llevan
// `conector: { servicio, accion, propio }` para que la isla diga "Todoist · Buscar tareas".
//
// Cada mensaje pasa primero por el motor de comandos (sin IA): si calza con una plantilla,
// se responde aquí mismo con `local` y no llega al agente. Funciona aunque OpenClaw no esté.
//
// Al cerrarse la entrada (la app terminó), el puente se desconecta y sale.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { createInterface } from "node:readline";
import {
  Gastos,
  Motor,
  PLANTILLAS_BASE,
  MedidorCpu,
  ACCIONES_MUSICA,
  SesionesClaude,
  describirHerramienta,
  esDeOpenClaw,
  leerEventoHook,
  AvisadorCalendario,
  AvisadorEntregas,
  describirErrorAula,
  leerAula,
  leerConfigAula,
  marcaConfigAula,
  pendientes,
  type Entrega,
  leerFunciones,
  marcaFunciones,
  type ConfigFunciones,
  type IdFuncion,
  combinar,
  descargarIcal,
  etiquetaProximo,
  eventosDeIcal,
  leerCalendarioMac,
  crearEventoMacAhora,
  type NuevoEvento,
  type ResultadoCreacion,
  leerUrlIcal,
  marcaConfigCalendario,
  proximoEvento,
  type EventoCalendario,
  RUTA_BASE,
  SeguidorDescargas,
  controlarMusica,
  leerMusica,
  type AccionMusica,
  type AppMusica,
  type EstadoMusica,
  Temporizadores,
  carpetaDescargas,
  listarCarpeta,
  recientes,
  vigilarCarpeta,
  UMBRALES,
  Vigilante,
  type Animo,
  type LecturaEquipo,
  deducirPlantilla,
  describirIntencion,
  mismaFrase,
  leerBateria,
  leerDisco,
  leerMemoria,
  porcentajeSinIA,
  procesoMasPesado,
  proponerPlantilla,
  FECHA_PRECIOS,
  FUENTE_PRECIOS,
  LectorUso,
  PlanDeAppClaude,
  combinarPlan,
  NombresDeProyectos,
  avisosPlan,
  guardarPlan,
  leerDatosPlan,
  leerPlanGuardado,
  limpiarAvisados,
  precioDe,
  resumirUso,
  vigente,
  type LecturaPlan,
  type ResumenUso,
  fichaEspecialista,
  frenoPlan,
  miembrosDeConfig,
  permitidosEquipo,
  textoFreno,
  DIAS_PLATA,
  avisosPresupuesto,
  leerAvisados,
  resumenPlata,
  type EstadoPlata,
} from "@asistente/motor";
import {
  type Decision,
  AGENTE,
  SESION,
  crearCliente,
  detenerTurno,
  enviarMensaje,
  nuevaConversacion,
  resolverAprobacion,
  suscribirseALaSesion,
} from "./conexion.ts";
import { buscarRecuerdos, corregirRecuerdo, listarRecuerdos, olvidarRecuerdo } from "./memoria.ts";
import { leerConectados, nombreBonito, permitidaSinPreguntar } from "./conectores.ts";
import { limpiarRegistros } from "./limpiar-registros.ts";
import { migrarFunciones } from "./migrar-funciones.ts";
import { consultarPlan } from "./consulta-plan.ts";
import { esDeMemoria } from "./permisos.ts";
import { CARPETA_OPENCLAW, CONFIG_OPENCLAW, WORKSPACE, memoriaDeClaudeCode } from "./rutas.ts";
import { leerSettings } from "./hooks-claude.ts";
import { statuslineInstalada } from "./statusline-claude.ts";
import { guardarConexion, iniciarServidorHooks } from "./servidor-hooks.ts";
import { quitarClaveDeApi } from "./sin-clave.ts";
import { TareasPorFuncion, cada } from "./tareas.ts";
import { FiltroDelegacion, leerHistorial } from "./delegacion.ts";
import { argsDelegacion, correrOpenclaw, delegacionActual, guardarFreno, leerFreno } from "./equipo.ts";

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
  "mcp__gastos__gastos_presupuesto",
  "mcp__gastos__temporizador_crear",
  "mcp__gastos__temporizador_listar",
  "mcp__gastos__temporizador_cancelar",
  "mcp__gastos__equipo_estado",
  "mcp__gastos__descargas_recientes",
  // Play, pausa y cambiar de canción son inofensivos (y nunca abren una app).
  "mcp__gastos__musica_estado",
  "mcp__gastos__musica_control",
  "mcp__gastos__calendario_proximos",
  "mcp__gastos__aula_entregas",
  "mcp__gastos__claude_uso",
]);

/**
 * Las herramientas de solo lectura de los conectores del catálogo que están conectados (Todoist,
 * Notion…) también pasan sin preguntar. Se lee al momento conectores.json (lo escribe Configurar
 * Brote) y la configuración de OpenClaw (la URL debe ser la del catálogo); los propios siempre preguntan.
 */
function esDeConectorSinPreguntar(herramienta: unknown): boolean {
  if (typeof herramienta !== "string" || !herramienta.startsWith("mcp__")) return false;
  let config: unknown = null;
  try {
    config = JSON.parse(readFileSync(CONFIG_OPENCLAW, "utf8"));
  } catch {
    return false;
  }
  return permitidaSinPreguntar(herramienta, leerConectados(), config);
}

/** "Todoist · Buscar tareas" para la isla, en vez de "claude-cli native tool: mcp__todoist__find-tasks". */
function anotarConector(objeto: any, herramienta: unknown): void {
  const bonito = nombreBonito(herramienta);
  if (bonito && objeto && typeof objeto === "object") objeto.conector = { servicio: bonito.servicio, accion: bonito.accion, propio: bonito.propio };
}

/** Las conversaciones guardadas que existen ahora (para notar cuándo OpenClaw escribe una nueva). */
function conversacionesGuardadas(): Set<string> {
  return new Set(listarRecuerdos().filter((r) => r.tipo === "conversacion").map((r) => r.id));
}

function esperar(ms: number): Promise<void> {
  return new Promise((listo) => setTimeout(listo, ms));
}

/**
 * Olvida un tema del todo. Primero empieza una conversación nueva: al cerrar la actual, OpenClaw
 * escribe su resumen, que también puede mencionar el tema y hay que olvidarlo. Después manda a la
 * Papelera todo lo que lo mencione y olvida las frases aprendidas que lo contengan.
 */
async function olvidarTema(tema: string): Promise<number> {
  if (cliente && conectado) {
    const antes = conversacionesGuardadas();
    await nuevaConversacion(cliente);
    for (let intento = 0; intento < 16; intento++) {
      if ([...conversacionesGuardadas()].some((id) => !antes.has(id))) break;
      await esperar(250);
    }
  }
  const recuerdos = buscarRecuerdos(tema);
  for (const recuerdo of recuerdos) olvidarRecuerdo(recuerdo.id);
  const buscado = tema.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  let frases = 0;
  for (const frase of gastos.plantillasAprendidas()) {
    const ejemplo = frase.ejemplo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (ejemplo.includes(buscado) && gastos.olvidarPlantilla(frase.id, new Date())) frases++;
  }
  registrar(`tema olvidado (${recuerdos.length} recuerdos, ${frases} frases)`);
  return recuerdos.length + frases;
}

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

// Lo que el usuario prendió o apagó en Configurar Brote → Funciones. Quien ya usaba el modo
// programador antes de que existieran las funciones lo conserva (migrar-funciones.ts).
if (migrarFunciones()) registrar("funciones: creé funciones.json con el modo programador (sus hooks ya estaban)");
let funciones: ConfigFunciones = leerFunciones();
let marcaDeFunciones = marcaFunciones();
const activa = (id: IdFuncion): boolean => funciones.activas[id];

const gastos = new Gastos(RUTA_BASE);
// Las plantillas aprendidas se leen en cada mensaje: una recién aceptada sirve al tiro.
const temporizadores = new Temporizadores(gastos);
const motor = new Motor(gastos, {
  plantillas: () => [...PLANTILLAS_BASE, ...gastos.plantillasActivas()],
  temporizadores,
  equipo: () => lecturaEquipo,
  descargas: () => {
    const listado = listarCarpeta(CARPETA_DESCARGAS);
    return listado ? recientes(listado, CARPETA_DESCARGAS) : null;
  },
  musica: { estado: () => musica, controlar: (accion) => void pedirMusica(accion) },
  calendario: () => (eventosMac === null && icsTexto === null ? null : eventosCalendario()),
  sesionesClaude: () => sesionesClaude.visibles(Date.now()),
  // Crear un evento es un pedido del usuario y tarda menos de un segundo: se hace al tiro y después
  // se vuelve a leer el calendario para que aparezca en la isla.
  crearEvento: (evento) => crearEvento(evento),
  aula: () => entregasAula,
  uso: () => {
    // Quien pregunta "¿cuánto he gastado en tokens?" recibe lo último calculado y deja pedido lo nuevo.
    void actualizarUso();
    return { plan: vigente(lecturaPlan, Date.now()), statusline: statuslinePuesta(), resumen: resumenUso };
  },
  activa,
});

/** Crea un evento en el Calendario del Mac (para el motor y para el MCP) y vuelve a leer el calendario. */
function crearEvento(evento: NuevoEvento): ResultadoCreacion {
  const resultado = crearEventoMacAhora(evento);
  registrar(resultado.ok ? "calendario: evento creado" : `calendario: no pude crear el evento (${resultado.motivo}${resultado.detalle ? `: ${resultado.detalle}` : ""})`);
  if (resultado.ok) {
    proximaLecturaMac = 0;
    void revisarCalendario();
  }
  return resultado;
}

// Modo programador: las sesiones de Claude Code del usuario llegan por sus hooks (hook.ts) a un
// servidor local con token. Las de OpenClaw (que corren en su carpeta) se ignoran. Un permiso se
// muestra en la isla y el hook espera la respuesta; si el usuario contesta en la terminal (llega otro
// evento de esa sesión) o nadie contesta en 45 s, se suelta sin decisión y todo sigue como siempre.
let sesionesClaude = new SesionesClaude();
const CARPETAS_OPENCLAW = [CARPETA_OPENCLAW, WORKSPACE];
const ESPERA_PERMISO_CLAUDE_MS = 45_000;
interface PermisoClaude {
  id: string;
  sesion: string;
  proyecto: string;
  titulo: string;
  detalle: string;
  soltar: (respuesta: object) => void;
}
const permisosClaude = new Map<string, PermisoClaude>();
let ultimasSesiones = "";
function estadoProgramador() {
  return {
    sesiones: sesionesClaude.visibles(Date.now()),
    permisos: [...permisosClaude.values()].map(({ id, proyecto, titulo, detalle }) => ({ id, proyecto, titulo, detalle })),
  };
}
function avisarSesiones(): void {
  const estado = estadoProgramador();
  const texto = JSON.stringify(estado);
  if (texto === ultimasSesiones) return;
  ultimasSesiones = texto;
  avisar({ tipo: "programador", ...estado });
}
function soltarPermisos(sesion: string): void {
  for (const permiso of permisosClaude.values()) if (permiso.sesion === sesion) permiso.soltar({});
}
async function alEventoClaude(datos: unknown): Promise<object> {
  // Con el modo programador apagado, los hooks (si siguen instalados) no muestran nada.
  if (!activa("programador")) return {};
  const evento = leerEventoHook(datos);
  if (!evento || esDeOpenClaw(evento.cwd, CARPETAS_OPENCLAW)) return {};
  // Otro evento de la sesión (no la notificación del mismo permiso) = el permiso ya se respondió.
  if (evento.evento !== "PermissionRequest" && evento.evento !== "Notification") soltarPermisos(evento.sesion);
  const reaccion = sesionesClaude.aplicar(evento, Date.now());
  if (reaccion) avisar({ tipo: "programador-reaccion", reaccion, proyecto: sesionesClaude.visibles(Date.now()).find((s) => s.id === evento.sesion)?.proyecto ?? "" });
  if (evento.evento !== "PermissionRequest" || !evento.interactiva) {
    avisarSesiones();
    return {};
  }
  const proyecto = sesionesClaude.visibles(Date.now()).find((s) => s.id === evento.sesion)?.proyecto ?? "Claude Code";
  return new Promise((listo) => {
    const id = randomUUID();
    const plazo = setTimeout(() => permiso.soltar({}), ESPERA_PERMISO_CLAUDE_MS);
    const permiso: PermisoClaude = {
      id,
      sesion: evento.sesion,
      proyecto,
      titulo: `${proyecto}: ${describirHerramienta(evento.herramienta, evento.entrada).replace(/…$/, "")}`,
      detalle: evento.entrada?.comando ?? evento.entrada?.archivo ?? evento.entrada?.url ?? evento.herramienta ?? "",
      soltar: (respuesta) => {
        clearTimeout(plazo);
        if (!permisosClaude.delete(id)) return;
        listo(respuesta);
        avisarSesiones();
      },
    };
    permisosClaude.set(id, permiso);
    registrar(`claude code pide permiso (${evento.herramienta ?? "?"})`);
    avisarSesiones();
  });
}
setInterval(avisarSesiones, 30_000);
void iniciarServidorHooks({
  alEvento: alEventoClaude,
  alPlan: alPlanClaude,
  sesiones: () => (activa("programador") ? sesionesClaude.visibles(Date.now()) : []),
  consultar: consultarDelMcp,
}).then(
  ({ puerto, token }) => {
    guardarConexion(puerto, token);
    registrar(`modo programador escuchando en 127.0.0.1:${puerto}`);
  },
  (error) => registrar(`no pude abrir el servidor del modo programador: ${mensajeDe(error)}`),
);

// Calendario: el del Mac se lee cada 5 min (nunca pide permiso aquí: eso es en "Configurar
// Brote"); el iCal cada 15 min, o al tiro si cambió la configuración. Cada 30 s se revisa si toca
// avisar (10 min antes) y si cambió lo próximo. La dirección iCal es secreta: nunca se registra.
let eventosMac: EventoCalendario[] | null = null;
let icsTexto: string | null = null;
let proximaLecturaMac = 0;
let proximaLecturaIcal = 0;
let marcaIcal = -1;
let leyendoCalendario = false;
let ultimoEstadoMac = "";
let ultimoProximo = "";
const avisadorCalendario = new AvisadorCalendario();
function eventosCalendario(): EventoCalendario[] {
  return combinar(eventosMac, icsTexto ? eventosDeIcal(icsTexto, Date.now()) : null);
}
async function leerCalendarios(): Promise<void> {
  if (leyendoCalendario) return;
  leyendoCalendario = true;
  try {
    const ahora = Date.now();
    if (process.platform === "darwin" && ahora >= proximaLecturaMac) {
      proximaLecturaMac = ahora + 5 * 60_000;
      const lectura = await leerCalendarioMac(ahora);
      eventosMac = lectura?.permiso === 3 ? lectura.eventos : null;
      if (lectura && !lectura.error) permisoCalendarioMac = lectura.permiso;
      // Para depurar en el Mac: por qué no se ven los eventos (nunca se registran los eventos mismos).
      const estado = lectura === null ? "osascript falló" : lectura.error ? `error: ${lectura.error}` : `permiso ${lectura.permiso}`;
      if (estado !== ultimoEstadoMac) {
        ultimoEstadoMac = estado;
        registrar(`calendario del Mac: ${estado}${lectura?.eventos ? ` (${lectura.eventos.length} eventos)` : ""}`);
      }
    }
    const marca = marcaConfigCalendario();
    if (marca !== marcaIcal || ahora >= proximaLecturaIcal) {
      marcaIcal = marca;
      proximaLecturaIcal = ahora + 15 * 60_000;
      const url = leerUrlIcal();
      if (!url) icsTexto = null;
      else {
        const texto = await descargarIcal(url);
        if (texto) icsTexto = texto;
        else registrar("calendario: no pude descargar el iCal");
      }
    }
  } finally {
    leyendoCalendario = false;
  }
}
function estadoCalendario(): { proximo: EventoCalendario | null; etiqueta: string | null } {
  const ahora = Date.now();
  const proximo = proximoEvento(eventosCalendario(), ahora);
  return { proximo, etiqueta: proximo ? etiquetaProximo(proximo, ahora) : null };
}
async function revisarCalendario(): Promise<void> {
  await leerCalendarios();
  const eventos = eventosCalendario();
  for (const texto of avisadorCalendario.revisar(eventos, Date.now())) {
    registrar("calendario: aviso");
    avisar({ tipo: "calendario-aviso", texto });
  }
  const estado = estadoCalendario();
  const texto = JSON.stringify(estado);
  if (texto !== ultimoProximo) {
    ultimoProximo = texto;
    avisar({ tipo: "calendario", ...estado });
  }
}
let permisoCalendarioMac: number | null = null;
function detenerCalendario(): void {
  eventosMac = null;
  icsTexto = null;
  proximaLecturaMac = 0;
  proximaLecturaIcal = 0;
  marcaIcal = -1;
  ultimoProximo = JSON.stringify({ proximo: null, etiqueta: null });
  avisar({ tipo: "calendario", proximo: null, etiqueta: null });
}

// Aula (Canvas o Moodle): se lee cada 30 min, o al tiro si cambió aula.json (se mira cada minuto).
// Cada minuto se revisa si toca avisar (24 h y 2 h antes). El token es secreto: nunca se registra, y
// los errores solo dicen qué tipo de problema hubo. Si falla la red se conservan las últimas entregas.
let entregasAula: Entrega[] | null = null;
let errorAula: "token" | "red" | "respuesta" | null = null;
let proximaLecturaAula = 0;
let marcaAula = -1;
let leyendoAula: Promise<void> | null = null;
let ultimoAula = "";
const avisadorEntregas = new AvisadorEntregas();
function leerAulaSiToca(): Promise<void> {
  leyendoAula ??= (async () => {
    const ahora = Date.now();
    const marca = marcaConfigAula();
    if (marca === marcaAula && ahora < proximaLecturaAula) return;
    marcaAula = marca;
    proximaLecturaAula = ahora + 30 * 60_000;
    const config = leerConfigAula();
    if (!config) {
      entregasAula = null;
      errorAula = null;
      return;
    }
    const lectura = await leerAula(config, ahora);
    if ("entregas" in lectura) {
      entregasAula = lectura.entregas;
      errorAula = null;
      return;
    }
    registrar(`aula: no pude leer (${lectura.error})`);
    errorAula = lectura.error;
    // Sin red se conservan las últimas; con el token malo o una respuesta rara, no.
    if (lectura.error !== "red") entregasAula = null;
    // Se reintenta antes que en 30 min.
    proximaLecturaAula = ahora + 5 * 60_000;
  })().finally(() => (leyendoAula = null));
  return leyendoAula;
}
function estadoAula() {
  const lista = entregasAula ? pendientes(entregasAula, Date.now()) : [];
  return {
    configurada: entregasAula !== null || errorAula !== null,
    proxima: lista[0] ?? null,
    pendientes: lista.length,
    error: entregasAula === null && errorAula ? describirErrorAula(errorAula) : null,
  };
}
async function revisarAula(): Promise<void> {
  await leerAulaSiToca();
  for (const texto of avisadorEntregas.revisar(entregasAula ?? [], Date.now())) {
    registrar("aula: aviso");
    avisar({ tipo: "aula-aviso", texto });
  }
  const estado = estadoAula();
  const texto = JSON.stringify(estado);
  if (texto !== ultimoAula) {
    ultimoAula = texto;
    avisar({ tipo: "aula", ...estado });
  }
}
function detenerAula(): void {
  entregasAula = null;
  errorAula = null;
  marcaAula = -1;
  proximaLecturaAula = 0;
  const estado = estadoAula();
  ultimoAula = JSON.stringify(estado);
  avisar({ tipo: "aula", ...estado });
}

// Música: se revisa cada 3 s (5 en Windows, donde PowerShell tarda más en partir), una lectura a la
// vez. Si el usuario negó el permiso de Automatización para una app, no se le pregunta de nuevo
// hasta dentro de 30 min.
let musica: EstadoMusica | null = null;
let leyendoMusica = false;
const sinPermisoHasta = new Map<AppMusica, number>();
/** Lo que se sabe del permiso de Automatización de cada app (por las lecturas que ya se hicieron). */
const permisoMusica = new Map<AppMusica, boolean>();
async function revisarMusica(): Promise<void> {
  if (leyendoMusica) return;
  leyendoMusica = true;
  try {
    const ahora = Date.now();
    const ignorar = [...sinPermisoHasta].filter(([, hasta]) => hasta > ahora).map(([app]) => app);
    const lectura = await leerMusica(ignorar);
    for (const app of lectura?.sinPermiso ?? []) {
      registrar(`música: sin permiso para ${app}`);
      sinPermisoHasta.set(app, ahora + 30 * 60_000);
      permisoMusica.set(app, false);
    }
    if (lectura?.estado) permisoMusica.set(lectura.estado.app as AppMusica, true);
    const estado = lectura?.estado ?? null;
    if (JSON.stringify(estado) !== JSON.stringify(musica)) {
      musica = estado;
      avisar({ tipo: "musica", estado });
    }
  } finally {
    leyendoMusica = false;
  }
}
async function pedirMusica(accion: AccionMusica): Promise<boolean> {
  const hecho = await controlarMusica(accion, musica);
  if (!hecho) registrar(`música: no pude hacer ${accion}`);
  // La app tarda un momento en cambiar de canción.
  setTimeout(() => void revisarMusica(), 400);
  return hecho;
}
const LEE_MUSICA = process.platform === "darwin" || process.platform === "win32";
function detenerMusica(): void {
  if (musica === null) return;
  musica = null;
  avisar({ tipo: "musica", estado: null });
}

// Uso del plan de Claude: el % llega por la statusline (nunca se leen credenciales) y los tokens se
// leen de las transcripciones solo cuando alguien los pide, como mucho una vez por minuto.
let planGuardado = leerPlanGuardado();
let lecturaPlan: LecturaPlan | null = planGuardado.lectura;
const avisadosPlan = new Set(planGuardado.avisados);
const lectorUso = new LectorUso();
const nombresProyectos = new NombresDeProyectos();
/** La carpeta de ~/.claude/projects donde quedan las corridas de Brote (el workspace de OpenClaw). */
const CARPETA_BROTE = basename(dirname(memoriaDeClaudeCode(WORKSPACE)));
let resumenUso: ResumenUso | null = null;
let usoCalculadoMs = 0;
let calculandoUso: Promise<void> | null = null;
let ultimoUso = "";
let statusline: { puesta: boolean; hastaMs: number } = { puesta: false, hastaMs: 0 };

/** Si la statusline de Brote está en la configuración de Claude Code (se mira cada 10 s como mucho). */
function statuslinePuesta(): boolean {
  if (Date.now() >= statusline.hastaMs) {
    let puesta = false;
    try {
      puesta = statuslineInstalada(leerSettings());
    } catch {
      // settings.json roto: Configurar Brote lo explica.
    }
    statusline = { puesta, hastaMs: Date.now() + 10_000 };
  }
  return statusline.puesta;
}

function estadoUso() {
  const modelos = resumenUso?.modelos ?? (lecturaPlan?.modelo ? [lecturaPlan.modelo] : []);
  return {
    // Sin filtrar: la isla muestra "0 % · se reinició a las…" en vez de quitar la barra (paraMostrar).
    plan: lecturaPlan,
    consultando: consultandoPlan !== null,
    statusline: statuslinePuesta(),
    resumen: resumenUso,
    // Los precios de los modelos que aparecen en el uso (`precio: null`: no está en la tabla).
    precios: { fecha: FECHA_PRECIOS, fuente: FUENTE_PRECIOS, modelos: modelos.map((id) => ({ id, precio: precioDe(id) })) },
  };
}

function avisarUso(): void {
  const estado = estadoUso();
  const texto = JSON.stringify({ ...estado, resumen: estado.resumen && { ...estado.resumen, calculadoMs: 0 } });
  if (texto === ultimoUso) return;
  ultimoUso = texto;
  avisar({ tipo: "uso", ...estado });
}

/** Lo que manda la statusline de Claude Code: el % de la sesión de 5 h y de la semana. */
function alPlanClaude(datos: unknown): void {
  if (!activa("uso-del-plan")) return;
  const lectura = leerDatosPlan(datos, Date.now());
  if (lectura) aplicarLecturaPlan(lectura);
}

/** Junta una lectura nueva (de cualquier fuente) con la que había, avisa si toca y la guarda. */
function aplicarLecturaPlan(nueva: LecturaPlan): void {
  const ahora = Date.now();
  const lectura = combinarPlan(lecturaPlan, nueva);
  if (!lectura || JSON.stringify(lectura) === JSON.stringify(lecturaPlan)) return;
  lecturaPlan = lectura;
  for (const texto of avisosPlan(lectura, ahora, avisadosPlan)) {
    registrar("plan: aviso");
    avisar({ tipo: "plan-aviso", texto });
  }
  revisarFreno();
  planGuardado = { lectura, avisados: limpiarAvisados(avisadosPlan, ahora) };
  try {
    guardarPlan(planGuardado);
  } catch (error) {
    registrar(`plan: no pude guardar plan.json (${mensajeDe(error)})`);
  }
  avisarUso();
}

// Equipo de Brote: quién está trabajando (lo arma el filtro con los eventos de las sesiones hijas) y
// el freno por plan, que saca de `allowAgents` a los especialistas con Claude sobre el 85 % semanal.
let frenado = leerFreno();
let saliendo = false;
const filtroDelegacion = new FiltroDelegacion(SESION, (agente) => fichaEspecialista(agente, leerConfigOpenclaw()));
let sincronizando: Promise<void> = Promise.resolve();

function leerConfigOpenclaw(): unknown {
  try {
    return JSON.parse(readFileSync(CONFIG_OPENCLAW, "utf8"));
  } catch {
    return null;
  }
}

// Mientras un especialista escribe llega un evento por cada trozo: el aviso se agrupa (como mucho
// cuatro por segundo) para no llenar el canal con la lista completa una y otra vez.
let avisoEquipo: ReturnType<typeof setTimeout> | undefined;
function avisarEquipo(alTiro = false): void {
  clearTimeout(avisoEquipo);
  const mandar = () => avisar({ tipo: "especialistas", lista: filtroDelegacion.equipo() });
  if (alTiro) mandar();
  else avisoEquipo = setTimeout(mandar, 250);
}

/**
 * Deja `allowAgents` de Brote como corresponde: los especialistas que existen (menos los de Claude con
 * el freno puesto), o nadie si el equipo está apagado. Uno a la vez; solo llama a OpenClaw si cambia.
 */
function sincronizarDelegacion(): Promise<void> {
  sincronizando = sincronizando.then(async () => {
    const config = leerConfigOpenclaw();
    if (!config) return;
    const permitidos = activa("especialistas") ? permitidosEquipo(miembrosDeConfig(config), frenado) : [];
    if (JSON.stringify(permitidos) === JSON.stringify(delegacionActual(config, AGENTE))) return;
    const { codigo, salida } = await correrOpenclaw(argsDelegacion(AGENTE, permitidos));
    registrar(codigo === 0 ? `equipo: Brote delega en [${permitidos.join(", ")}]` : `equipo: no pude actualizar allowAgents (${salida.trim().split("\n").pop()})`);
  });
  return sincronizando;
}

/** Revisa el freno por plan con la semana de Claude; si cambia, lo guarda, avisa una vez y actualiza la delegación. */
function revisarFreno(): void {
  if (!activa("especialistas")) return;
  const semana = vigente(lecturaPlan, Date.now())?.semana?.porcentaje ?? null;
  const nuevo = frenoPlan(semana, frenado);
  if (nuevo === frenado) return;
  frenado = nuevo;
  try {
    guardarFreno(frenado);
  } catch (error) {
    registrar(`equipo: no pude guardar equipo.json (${mensajeDe(error)})`);
  }
  registrar(`equipo: freno por plan ${frenado ? "puesto" : "quitado"}`);
  avisar({ tipo: "especialistas-aviso", texto: textoFreno(frenado, semana) });
  void sincronizarDelegacion();
}

// Las otras dos fuentes del % del plan: el archivo de la app de Claude y la consulta mínima.
const planDeApp = new PlanDeAppClaude();
const CONSULTA_CADA_MS = 15 * 60_000;
const CONSULTA_FORZADA_CADA_MS = 2 * 60_000;
let consultandoPlan: Promise<void> | null = null;
let ultimaConsultaPlanMs = 0;

/** Si la app de Claude anotó algo más nuevo que lo que se sabe, lo toma (solo mira la fecha del archivo). */
function revisarPlanDeApp(): void {
  if (!activa("uso-del-plan")) return;
  const lectura = planDeApp.leer(Date.now());
  if (lectura && (!lecturaPlan || lectura.actualizadoMs > lecturaPlan.actualizadoMs)) aplicarLecturaPlan(lectura);
}

/**
 * Revisa la app de Claude y, si el dato sigue viejo (más de 15 min) o `forzar` (el botón ↻), corre la
 * consulta mínima: como mucho una vez cada 15 min, o cada 2 min con el botón. Nunca en segundo plano:
 * solo cuando la isla pide el uso (pestaña Claude a la vista) o el usuario lo pide.
 */
function refrescarPlan(forzar: boolean): Promise<void> {
  if (!activa("uso-del-plan")) return Promise.resolve();
  revisarPlanDeApp();
  if (consultandoPlan) return consultandoPlan;
  const ahora = Date.now();
  const edad = lecturaPlan ? ahora - lecturaPlan.actualizadoMs : Infinity;
  if (!forzar && edad < CONSULTA_CADA_MS) return Promise.resolve();
  if (ahora - ultimaConsultaPlanMs < (forzar ? CONSULTA_FORZADA_CADA_MS : CONSULTA_CADA_MS)) return Promise.resolve();
  ultimaConsultaPlanMs = ahora;
  consultandoPlan = (async () => {
    avisarUso();
    const lectura = await consultarPlan();
    registrar(lectura ? "plan: consulta mínima lista" : "plan: la consulta mínima no trajo los límites");
    if (lectura) aplicarLecturaPlan(lectura);
  })().finally(() => {
    consultandoPlan = null;
    avisarUso();
  });
  return consultandoPlan;
}
setInterval(revisarPlanDeApp, 60_000);
revisarPlanDeApp();

/** Recalcula el uso por tokens si pasó más de un minuto (o `forzar`). Si queda por leer, sigue de a poco. */
function actualizarUso(forzar = false): Promise<void> {
  if (!activa("uso-del-plan")) return Promise.resolve();
  if (!forzar && resumenUso && Date.now() - usoCalculadoMs < 60_000) return Promise.resolve();
  calculandoUso ??= (async () => {
    try {
      const falta = await lectorUso.actualizar();
      const ahora = Date.now();
      resumenUso = resumirUso(lectorUso.registros(), ahora, CARPETA_BROTE, (carpeta) => nombresProyectos.nombre(carpeta));
      usoCalculadoMs = ahora;
      avisarUso();
      // La primera vez puede haber mucho que leer: se sigue en la próxima vuelta del bucle de eventos.
      if (falta) setTimeout(() => void actualizarUso(true), 200);
    } catch (error) {
      registrar(`uso: no pude leer las transcripciones (${mensajeDe(error)})`);
    }
  })().finally(() => (calculandoUso = null));
  return calculandoUso;
}

/** Espera el cálculo como mucho `ms` (la isla no debe quedarse esperando la primera lectura grande). */
function esperarUso(ms: number): Promise<void> {
  return Promise.race([actualizarUso(), esperar(ms)]);
}

function detenerUso(): void {
  resumenUso = null;
  usoCalculadoMs = 0;
  ultimoUso = "";
  avisar({ tipo: "uso", plan: null, statusline: statuslinePuesta(), resumen: null, precios: { fecha: FECHA_PRECIOS, fuente: FUENTE_PRECIOS, modelos: [] } });
}

const FUNCION_DE_CONSULTA: Record<string, IdFuncion> = {
  "musica-estado": "musica",
  "musica-control": "musica",
  calendario: "calendario",
  "calendario-crear": "calendario",
  aula: "aula",
  uso: "uso-del-plan",
};

// Consultas del servidor MCP (por el servidor local con token): la música y el calendario se leen
// aquí, dentro de Brote, que tiene los permisos de macOS; el MCP corre dentro de OpenClaw, sin ellos.
async function consultarDelMcp(datos: unknown): Promise<object> {
  const consulta = (datos ?? {}) as { tipo?: unknown; accion?: unknown };
  // El servidor MCP ya revisa las funciones apagadas; esto es por si acaso (no se lee nada apagado).
  const funcion = FUNCION_DE_CONSULTA[String(consulta.tipo)];
  if (funcion && !activa(funcion)) throw new Error("función apagada");
  switch (consulta.tipo) {
    case "musica-estado":
      return { musica };
    case "musica-control": {
      if (!ACCIONES_MUSICA.includes(consulta.accion as AccionMusica)) throw new Error("acción inválida");
      if (!musica) return { hecho: false, musica: null };
      const estado = musica;
      return { hecho: await pedirMusica(consulta.accion as AccionMusica), musica: estado };
    }
    case "calendario-crear": {
      const e = (datos as { evento?: Record<string, unknown> }).evento ?? {};
      const lugar = e.lugar === null || e.lugar === undefined ? null : e.lugar;
      if (typeof e.titulo !== "string" || typeof e.inicioMs !== "number" || typeof e.finMs !== "number" || (lugar !== null && typeof lugar !== "string")) {
        throw new Error("evento inválido");
      }
      return { resultado: crearEvento({ titulo: e.titulo, lugar, inicioMs: e.inicioMs, finMs: e.finMs }) };
    }
    case "aula":
      await leerAulaSiToca();
      return { entregas: entregasAula, error: entregasAula === null ? errorAula : null };
    case "calendario":
      await leerCalendarios();
      return { eventos: eventosMac === null && icsTexto === null ? null : eventosCalendario() };
    case "uso":
      await esperarUso(8000);
      return { plan: vigente(lecturaPlan, Date.now()), resumen: resumenUso };
    default:
      throw new Error("consulta desconocida");
  }
}

// Descargas: fs.watch avisa al tiro (agrupando los avisos seguidos) y cada 4 s se revisa igual,
// porque fs.watch no siempre avisa (carpetas en la nube, algunos sistemas de archivos).
const CARPETA_DESCARGAS = carpetaDescargas();
let seguidorDescargas = new SeguidorDescargas();
/** Si se pudo leer la carpeta de descargas la última vez (`null`: no se ha intentado). */
let accesoDescargas: boolean | null = null;
let ultimasEnCurso = "";
let revisionDescargas: ReturnType<typeof setTimeout> | undefined;
function revisarDescargas(): void {
  const listado = listarCarpeta(CARPETA_DESCARGAS);
  accesoDescargas = listado !== null;
  if (!listado) return;
  const { enCurso, listas } = seguidorDescargas.revisar(listado, CARPETA_DESCARGAS);
  const texto = JSON.stringify(enCurso);
  if (texto !== ultimasEnCurso) {
    ultimasEnCurso = texto;
    avisar({ tipo: "descargas", enCurso });
  }
  for (const descarga of listas) {
    registrar("descarga lista");
    avisar({ tipo: "descarga-lista", descarga });
  }
}
function vigilarDescargas(): () => void {
  const dejarDeVigilar = vigilarCarpeta(CARPETA_DESCARGAS, () => {
    clearTimeout(revisionDescargas);
    revisionDescargas = setTimeout(revisarDescargas, 300);
  });
  const detener = cada(4000, revisarDescargas);
  return () => {
    dejarDeVigilar();
    detener();
    clearTimeout(revisionDescargas);
    // Al volver a prenderla, lo que ya estaba en la carpeta no se anuncia como nuevo.
    seguidorDescargas = new SeguidorDescargas();
    ultimasEnCurso = "[]";
    avisar({ tipo: "descargas", enCurso: [] });
  };
}

// Brote reacciona al computador. La CPU se mide cada 5 s; la batería cada 15 s y el disco cada
// 10 min (cuestan más y cambian lento). El programa culpable solo se busca con la CPU alta.
const medidorCpu = new MedidorCpu();
let vigilante = new Vigilante();
let lecturaEquipo: LecturaEquipo | null = null;
let animo: Animo = null;
let bateria: LecturaEquipo["bateria"] = null;
let memoria: LecturaEquipo["memoria"] = null;
let disco: LecturaEquipo["disco"] = null;
let proximaBateria = 0;
let proximoDisco = 0;

function revisarEquipo(): void {
  const ahora = Date.now();
  if (ahora >= proximaBateria) {
    bateria = leerBateria();
    memoria = leerMemoria();
    proximaBateria = ahora + 15_000;
  }
  if (ahora >= proximoDisco) {
    disco = leerDisco();
    proximoDisco = ahora + 10 * 60_000;
  }
  const cpu = medidorCpu.medir();
  const procesoPesado = cpu !== null && cpu >= UMBRALES.cpuAlta ? procesoMasPesado() : null;
  lecturaEquipo = { bateria, cpu, disco, procesoPesado, memoria };
  const resultado = vigilante.evaluar(lecturaEquipo, ahora);
  for (const aviso of resultado.avisos) {
    registrar(`equipo: ${aviso.texto}`);
    avisar({ tipo: "equipo-aviso", texto: aviso.texto, celebrar: aviso.celebrar });
  }
  if (resultado.animo !== animo) {
    animo = resultado.animo;
    avisar({ tipo: "animo", animo });
  }
}
function detenerEquipo(): void {
  vigilante = new Vigilante();
  lecturaEquipo = null;
  proximaBateria = 0;
  proximoDisco = 0;
  if (animo !== null) {
    animo = null;
    avisar({ tipo: "animo", animo });
  }
}

/**
 * Cada segundo: avisa lo que terminó y manda la lista si cambió. Revisa la base y no solo lo que
 * pasó por aquí, así también aparecen los temporizadores que crea el agente por MCP.
 */
let ultimaLista = "";
function revisarTemporizadores(): void {
  for (const aviso of temporizadores.revisar(new Date())) {
    registrar(`temporizador: ${aviso.texto}`);
    avisar({ tipo: "temporizador-aviso", texto: aviso.texto });
  }
  const lista = JSON.stringify(temporizadores.activos());
  if (lista !== ultimaLista) {
    ultimaLista = lista;
    avisar({ tipo: "temporizadores", lista: JSON.parse(lista) });
  }
}
function detenerTemporizadores(): void {
  ultimaLista = "[]";
  avisar({ tipo: "temporizadores", lista: [] });
}

// Plata: el resumen se recalcula solo cuando cambia la base (o el día) y los avisos del presupuesto se
// dan una vez cada uno por mes (lo dado queda en la tabla `ajustes`, junto al presupuesto).
const AVISOS_PRESUPUESTO = "avisos-presupuesto";
let marcaPlata = "";
let ultimaPlata: EstadoPlata | null = null;
function estadoPlata(): EstadoPlata {
  const ahora = new Date();
  const desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - DIAS_PLATA);
  const hasta = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
  const lista = gastos.entre({ desde, hasta }).map((g) => ({ id: g.id, monto: g.monto, categoria: g.categoria, descripcion: g.descripcion, fechaMs: g.fecha.getTime() }));
  return resumenPlata(lista, gastos.presupuesto(), ahora.getTime());
}
function revisarPlata(forzar = false): void {
  const hoy = new Date().toDateString();
  const marca = `${gastos.marca()}|${hoy}`;
  if (!forzar && marca === marcaPlata) return;
  marcaPlata = marca;
  ultimaPlata = estadoPlata();
  const { textos, avisados } = avisosPresupuesto(ultimaPlata.presupuesto, Date.now(), leerAvisados(gastos.ajuste(AVISOS_PRESUPUESTO)));
  if (avisados) gastos.guardarAjuste(AVISOS_PRESUPUESTO, JSON.stringify(avisados));
  for (const texto of textos) {
    registrar("plata: aviso del presupuesto");
    avisar({ tipo: "plata-aviso", texto });
  }
  avisar({ tipo: "plata", plata: ultimaPlata });
}
function detenerPlata(): void {
  marcaPlata = "";
  ultimaPlata = null;
  avisar({ tipo: "plata", plata: null });
}

/** Las tareas de fondo de cada función: solo corren las prendidas. */
const tareas = new TareasPorFuncion({
  gastos: () => {
    const detener = cada(2000, () => revisarPlata());
    return () => {
      detener();
      detenerPlata();
    };
  },
  temporizadores: () => {
    const detener = cada(1000, revisarTemporizadores);
    return () => {
      detener();
      detenerTemporizadores();
    };
  },
  calendario: () => {
    const detener = cada(30_000, () => void revisarCalendario());
    return () => {
      detener();
      detenerCalendario();
    };
  },
  aula: () => {
    const detener = cada(60_000, () => void revisarAula());
    return () => {
      detener();
      detenerAula();
    };
  },
  ...(LEE_MUSICA
    ? {
        musica: () => {
          const detener = cada(process.platform === "win32" ? 5000 : 3000, () => void revisarMusica());
          return () => {
            detener();
            detenerMusica();
          };
        },
      }
    : {}),
  descargas: vigilarDescargas,
  equipo: () => {
    const detener = cada(5000, revisarEquipo);
    return () => {
      detener();
      detenerEquipo();
    };
  },
  "uso-del-plan": () => {
    // Al prenderla: lo guardado del plan y un primer cálculo de los tokens (después, solo a pedido).
    lecturaPlan = leerPlanGuardado().lectura;
    avisarUso();
    void actualizarUso(true);
    return detenerUso;
  },
  // Al prender el equipo: el freno con lo último del plan y la lista de Brote. Al apagarlo, Brote deja
  // de delegar (no al cerrar la app: eso no es apagar la función).
  especialistas: () => {
    revisarFreno();
    void sincronizarDelegacion();
    avisarEquipo(true);
    return () => {
      if (saliendo) return;
      void sincronizarDelegacion();
      avisar({ tipo: "especialistas", lista: [] });
    };
  },
  programador: () => () => {
    for (const permiso of permisosClaude.values()) permiso.soltar({});
    sesionesClaude = new SesionesClaude();
    avisarSesiones();
  },
});

/** Relee funciones.json si cambió: arranca o detiene lo que corresponda y avisa a la isla. */
function revisarFunciones(forzar = false): void {
  const marca = marcaFunciones();
  if (!forzar && marca === marcaDeFunciones) return;
  marcaDeFunciones = marca;
  funciones = leerFunciones();
  const { arrancadas, detenidas } = tareas.aplicar(funciones.activas);
  if (arrancadas.length + detenidas.length > 0) {
    registrar(`funciones: ${[...arrancadas.map((f) => `+${f}`), ...detenidas.map((f) => `-${f}`)].join(" ")}`);
  }
  avisar({ tipo: "funciones", ...funciones });
}
revisarFunciones(true);
setInterval(revisarFunciones, 2000);

/** Lo que se sabe de los permisos de macOS, solo por las lecturas que ya se hicieron (nunca pregunta). */
function estadoPermisos() {
  return {
    descargas: !activa("descargas") || accesoDescargas === null ? "sin-usar" : accesoDescargas ? "concedido" : "negado",
    automatizacion: Object.fromEntries(permisoMusica),
    calendarios:
      permisoCalendarioMac === null ? "sin-usar" : permisoCalendarioMac === 3 ? "concedido" : permisoCalendarioMac === 0 ? "sin-preguntar" : "negado",
  };
}

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
      onEvent: (crudo: any) => {
        if (IGNORADOS.has(crudo?.event)) return;
        // Tras un "/reset" la sesión cambia de id y las solicitudes de permiso dejan de llegar a
        // una suscripción vieja (sin nadie que responda, OpenClaw las deniega): hay que renovarla.
        if (crudo.event === "sessions.changed") renovarSuscripcion(cliente);
        // Las sesiones hijas del equipo y el turno del anuncio no son de Brote (delegacion.ts).
        const { reenviar: marcos, equipo } = filtroDelegacion.procesar(crudo, Date.now());
        if (equipo && activa("especialistas")) avisarEquipo();
        for (const marco of marcos) alEventoDeBrote(marco);
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

/** Un evento de Brote (ya filtrado): permisos automáticos, aprender del turno y reenviarlo a la isla. */
function alEventoDeBrote(marco: any): void {
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
  if (aprobacion) anotarConector(aprobacion.presentation, herramienta);
  if ((marco.event === "agent" && (marco.payload?.stream === "tool" || marco.payload?.stream === "item")) && datos?.phase === "start") {
    anotarConector(datos, datos.name);
  }
  // Lo que pide un especialista siempre pasa por la isla: lee páginas y archivos de afuera, y no debe
  // escribir solo en la memoria de Brote ni en sus gastos.
  const deEspecialista = Boolean(aprobacion?.presentation?.especialista);
  if (
    cliente &&
    !deEspecialista &&
    (PERMITIDAS_SIN_PREGUNTAR.has(herramienta) ||
      esDeMemoria(herramienta, aprobacion?.presentation?.detail) ||
      esDeConectorSinPreguntar(herramienta)) &&
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
}

/** Lo que se agrega a la respuesta: con `local`, el motor resolvió el pedido sin IA. */
type Extra = { local?: { texto: string; intencion: string; datos?: unknown }; mensaje?: string; datos?: unknown };

async function atender(pedido: any): Promise<Extra> {
  if (pedido?.tipo === "enviar" && typeof pedido.texto === "string" && pedido.texto.trim()) {
    const texto = pedido.texto.trim();
    const resuelto = motor.resolver(texto);
    if (resuelto) {
      gastos.registrarUso("motor", resuelto.intencion, new Date());
      registrar(`resuelto sin IA (${resuelto.plantilla})`);
      // Lo anotado (o el presupuesto nuevo) aparece al tiro en la pestaña Plata.
      if (activa("gastos")) revisarPlata();
      return { local: { texto: resuelto.texto, intencion: resuelto.intencion, datos: resuelto.datos } };
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
  switch (pedido?.tipo) {
    case "memoria-listar":
      return {
        datos: {
          recuerdos: listarRecuerdos(),
          frases: gastos.plantillasAprendidas().map((p) => ({
            id: p.id,
            ejemplo: p.ejemplo,
            accion: describirIntencion(p.intencion),
          })),
          sinIA: porcentajeSinIA(gastos),
        },
      };
    case "memoria-olvidar":
      if (typeof pedido.recuerdo !== "string") break;
      olvidarRecuerdo(pedido.recuerdo);
      registrar(`recuerdo olvidado: ${pedido.recuerdo}`);
      return {};
    case "memoria-corregir":
      if (typeof pedido.recuerdo !== "string" || typeof pedido.texto !== "string") break;
      corregirRecuerdo(pedido.recuerdo, pedido.texto);
      registrar(`recuerdo corregido: ${pedido.recuerdo}`);
      return {};
    case "frase-olvidar":
      if (!Number.isInteger(pedido.plantilla)) break;
      if (!gastos.olvidarPlantilla(pedido.plantilla, new Date())) throw new Error("Esa frase ya no estaba aprendida");
      return {};
    case "memoria-buscar":
      if (typeof pedido.tema !== "string") break;
      return { datos: buscarRecuerdos(pedido.tema).map((r) => r.id) };
    case "memoria-olvidar-tema":
      if (typeof pedido.tema !== "string") break;
      return { datos: { olvidados: await olvidarTema(pedido.tema) } };
    case "temporizador-cancelar":
      if (!Number.isInteger(pedido.temporizador)) break;
      temporizadores.cancelar({ id: pedido.temporizador });
      revisarTemporizadores();
      return {};
    case "equipo-estado":
      return { datos: { animo, lectura: lecturaEquipo } };
    case "musica-control":
      if (!ACCIONES_MUSICA.includes(pedido.accion)) break;
      if (!musica) throw new Error("No hay música abierta");
      await pedirMusica(pedido.accion);
      return {};
    case "musica-estado":
      return { datos: musica };
    case "calendario-estado":
      return { datos: estadoCalendario() };
    case "aula-estado":
      return { datos: estadoAula() };
    case "programador-estado":
      return { datos: estadoProgramador() };
    case "uso-estado":
      if (!activa("uso-del-plan")) return { datos: { plan: null, consultando: false, statusline: statuslinePuesta(), resumen: null, precios: { fecha: FECHA_PRECIOS, fuente: FUENTE_PRECIOS, modelos: [] } } };
      // Con la pestaña Claude a la vista (`refrescar`): si el % está viejo, se refresca sin esperar.
      if (pedido.refrescar === true) void refrescarPlan(false);
      await esperarUso(3000);
      return { datos: estadoUso() };
    case "plan-actualizar":
      if (!activa("uso-del-plan")) throw new Error("El uso del plan está apagado: actívalo en Configurar Brote ⚙️");
      await refrescarPlan(true);
      return { datos: estadoUso() };
    case "programador-decidir": {
      const permiso = typeof pedido.permiso === "string" ? permisosClaude.get(pedido.permiso) : undefined;
      if (pedido.decision !== "allow" && pedido.decision !== "deny") break;
      if (!permiso) throw new Error("Ese permiso ya se respondió en la terminal");
      registrar(`permiso de claude code: ${pedido.decision}`);
      permiso.soltar({ decision: pedido.decision });
      return {};
    }
    case "descargas-listar": {
      const listado = listarCarpeta(CARPETA_DESCARGAS);
      return { datos: listado ? recientes(listado, CARPETA_DESCARGAS) : [] };
    }
    case "temporizadores-listar":
      return { datos: activa("temporizadores") ? temporizadores.activos() : [] };
    case "funciones-estado":
      return { datos: funciones };
    case "plata-estado":
      return { datos: activa("gastos") ? (ultimaPlata ?? estadoPlata()) : null };
    case "plata-anotar": {
      if (!activa("gastos")) throw new Error("Los gastos están apagados: actívalos en Configurar Brote ⚙️");
      // Solo los botones de un toque: el monto y la descripción deben ser de uno de los gastos frecuentes.
      const frecuente = estadoPlata().frecuentes.find((f) => f.monto === pedido.monto && f.descripcion === pedido.descripcion);
      if (!frecuente) break;
      const mensaje = motor.anotarGasto(frecuente.monto, frecuente.descripcion);
      gastos.registrarUso("motor", "registrar-gasto", new Date());
      revisarPlata();
      return { mensaje };
    }
    case "presupuesto-poner": {
      if (!activa("gastos")) throw new Error("Los gastos están apagados: actívalos en Configurar Brote ⚙️");
      const monto = pedido.monto;
      if (monto !== null && !(Number.isInteger(monto) && monto >= 1000 && monto <= 100_000_000)) break;
      gastos.ponerPresupuesto(monto);
      registrar(monto === null ? "plata: presupuesto quitado" : "plata: presupuesto puesto");
      revisarPlata();
      return { datos: ultimaPlata };
    }
    case "especialistas-estado":
      return { datos: { lista: activa("especialistas") ? filtroDelegacion.equipo() : [], frenado } };
    case "especialista-historial": {
      // Solo la sesión de un especialista que está en la lista del equipo (nunca otra sesión cualquiera).
      if (!activa("especialistas") || typeof pedido.sesion !== "string") break;
      if (!filtroDelegacion.equipo().some((t) => t.sesion === pedido.sesion)) break;
      if (!cliente || !conectado) throw new Error("OpenClaw no está conectado");
      const resultado = await cliente.request("chat.history", { sessionKey: pedido.sesion, limit: 60, maxChars: 40_000 });
      return { datos: leerHistorial(resultado) };
    }
    case "permisos-estado":
      return { datos: estadoPermisos() };
    case "conversacion-nueva":
      if (!cliente || !conectado) throw new Error("OpenClaw no está conectado");
      await nuevaConversacion(cliente);
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

quitarClaveDeApi();

// El registro del Gateway acumula respuestas de los agentes; se limpia al partir y cada hora (ver limpiar-registros.ts).
function limpiarRegistrosDelGateway(): void {
  const quitadas = limpiarRegistros();
  if (quitadas > 0) registrar(`registros: quité ${quitadas} líneas de texto suelto del registro del Gateway`);
}
limpiarRegistrosDelGateway();
setInterval(limpiarRegistrosDelGateway, 3_600_000).unref();

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
  saliendo = true;
  tareas.detenerTodo();
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
