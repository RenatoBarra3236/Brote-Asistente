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
} from "@asistente/motor";
import {
  type Decision,
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
import { esDeMemoria } from "./permisos.ts";
import { CARPETA_OPENCLAW, CONFIG_OPENCLAW, WORKSPACE } from "./rutas.ts";
import { guardarConexion, iniciarServidorHooks } from "./servidor-hooks.ts";

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
const sesionesClaude = new SesionesClaude();
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
  sesiones: () => sesionesClaude.visibles(Date.now()),
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
setInterval(() => void revisarCalendario(), 30_000);
void revisarCalendario();

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
setInterval(() => void revisarAula(), 60_000);
void revisarAula();

// Música: se revisa cada 3 s (5 en Windows, donde PowerShell tarda más en partir), una lectura a la
// vez. Si el usuario negó el permiso de Automatización para una app, no se le pregunta de nuevo
// hasta dentro de 30 min.
let musica: EstadoMusica | null = null;
let leyendoMusica = false;
const sinPermisoHasta = new Map<AppMusica, number>();
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
    }
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
if (process.platform === "darwin" || process.platform === "win32") {
  setInterval(() => void revisarMusica(), process.platform === "win32" ? 5000 : 3000);
  void revisarMusica();
}

// Consultas del servidor MCP (por el servidor local con token): la música y el calendario se leen
// aquí, dentro de Brote, que tiene los permisos de macOS; el MCP corre dentro de OpenClaw, sin ellos.
async function consultarDelMcp(datos: unknown): Promise<object> {
  const consulta = (datos ?? {}) as { tipo?: unknown; accion?: unknown };
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
    default:
      throw new Error("consulta desconocida");
  }
}

// Descargas: fs.watch avisa al tiro (agrupando los avisos seguidos) y cada 4 s se revisa igual,
// porque fs.watch no siempre avisa (carpetas en la nube, algunos sistemas de archivos).
const CARPETA_DESCARGAS = carpetaDescargas();
const seguidorDescargas = new SeguidorDescargas();
let ultimasEnCurso = "";
let revisionDescargas: ReturnType<typeof setTimeout> | undefined;
function revisarDescargas(): void {
  const listado = listarCarpeta(CARPETA_DESCARGAS);
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
vigilarCarpeta(CARPETA_DESCARGAS, () => {
  clearTimeout(revisionDescargas);
  revisionDescargas = setTimeout(revisarDescargas, 300);
});
setInterval(revisarDescargas, 4000);
revisarDescargas();

// Brote reacciona al computador. La CPU se mide cada 5 s; la batería cada 15 s y el disco cada
// 10 min (cuestan más y cambian lento). El programa culpable solo se busca con la CPU alta.
const medidorCpu = new MedidorCpu();
const vigilante = new Vigilante();
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
setInterval(revisarEquipo, 5000);
revisarEquipo();

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
setInterval(revisarTemporizadores, 1000);
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
        if (aprobacion) anotarConector(aprobacion.presentation, herramienta);
        if ((marco.event === "agent" && (marco.payload?.stream === "tool" || marco.payload?.stream === "item")) && datos?.phase === "start") {
          anotarConector(datos, datos.name);
        }
        if (
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
type Extra = { local?: { texto: string; intencion: string; datos?: unknown }; mensaje?: string; datos?: unknown };

async function atender(pedido: any): Promise<Extra> {
  if (pedido?.tipo === "enviar" && typeof pedido.texto === "string" && pedido.texto.trim()) {
    const texto = pedido.texto.trim();
    const resuelto = motor.resolver(texto);
    if (resuelto) {
      gastos.registrarUso("motor", resuelto.intencion, new Date());
      registrar(`resuelto sin IA (${resuelto.plantilla})`);
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
      return { datos: temporizadores.activos() };
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
