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
//   pedido { "tipo": "resumen-dia" }          → "datos": { texto, corto, hay } (el resumen de la mañana: la frase «dame el resumen del día»)
//   pedido { "tipo": "agenda-estado" }       → "datos": { dias, fuentes } (la pestaña Agenda: 14 días de eventos,
//                                               entregas del aula y recordatorios; `fuentes` dice qué hay conectado)
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
// Grabar y transcribir (función "grabaciones", apagada de fábrica; sección 8 de docs/plan-rediseno.md, fase 2):
// transcribe una grabación (`<id>.wav` de ~/.asistente-prototipo/grabaciones) con `whisper-cli` en este
// computador, de a una en segundo plano, y guarda el texto en transcripciones/<id>.md. Sin la función
// prendida no corre nada (ni la limpieza). Al partir y cada hora borra los audios con más de N días
// (grabaciones.json, 7 por defecto; a la Papelera en Mac). Nada de lo grabado sale del computador.
//   pedido { "tipo": "transcribir", "grabacion": "2026-10-05-103000", "avisoAPresentes"?: "si"|"no"|"solo-mi-voz" }   → "datos": { pendientes }
//   pedido { "tipo": "transcripcion-cancelar", "grabacion": "…" }   → "datos": { cancelada }
//   pedido { "tipo": "grabaciones-estado" }   → "datos": { whisper: boolean, modelos: { base, small, … }, pendientes, ajustes }
//   pedido { "tipo": "grabaciones-listar" }   → "datos": { transcripciones, audios, diasAudio } (sin el texto; "Lo que sé de ti")
//   pedido { "tipo": "grabacion-aviso", "grabacion": "…", "aviso": "si"|"no"|"solo-mi-voz" }   guarda la respuesta al grabar; "transcribir" sin avisoAPresentes usa esa
//   pedido { "tipo": "grabacion-ver", "grabacion": "…" }   → "datos": { texto, recortado }
//   pedido { "tipo": "grabacion-borrar", "que": "transcripcion"|"audio", "grabacion": "…" | null }   → "datos": { borradas } (null = todas; Papelera en Mac)
//   aviso { "tipo": "transcripcion", "id": "…", "fase": "en-cola"|"transcribiendo"|"lista"|"error"|"cancelada", "texto": "…" }
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
// Estudio (función "estudio"; pestaña Estudio, A1 de docs/plan-estudio-y-mejoras.md): los ramos del usuario
// (nombre, color, palabras clave) y lo que viene de cada uno: clases del calendario y entregas del aula (se
// emparejan por palabra clave), tareas y transcripciones que el usuario les asignó. Nada se crea solo.
//   aviso { "tipo": "ramos", "ramos": Ramo[] }   al partir y al cambiar la lista (también si lo cambia el MCP)
//   pedido { "tipo": "ramos-estado" }   → "datos": { ramos, fichas, sugerencias, fuentes: { calendario, aula } }
//   pedido { "tipo": "ramos-todos" }   → "datos": Ramo[] (con los archivados; no depende de la función: «Lo que sé de ti»)
//   pedido { "tipo": "ramo-crear", "nombre": "…", "alias"?: [...], "color"?: "…" }   → "mensaje", "datos": Ramo
//   pedido { "tipo": "ramo-editar", "ramo": 3, "nombre"?, "alias"?, "color"? }   → "datos": Ramo
//   pedido { "tipo": "ramo-archivar", "ramo": 3, "archivado"?: true }   no borra nada
//   pedido { "tipo": "ramo-borrar", "ramo": 3 }   definitivo; lo suyo queda «sin ramo» («Lo que sé de ti»)
//   aviso { "tipo": "notas", "fichas": FichaNotas[] }   notas por ramo (A2); también si lo cambia el MCP
//   pedido { "tipo": "notas-estado" }   → "datos": FichaNotas[] (de los ramos activos; con la función apagada, [])
//   pedido { "tipo": "notas-todas" }   → "datos": { ramos: Ramo[], fichas: FichaNotas[] } (no depende de la función: «Lo que sé de ti»)
//   pedido { "tipo": "evaluacion-guardar", "ramo": 3, "evaluacion"?: 7, "nombre"?, "peso"?, "nota"?: number | null, "fecha"? }   crea (sin "evaluacion") o edita
//   pedido { "tipo": "evaluacion-borrar", "evaluacion": 7 }   (definitivo: es una base de datos, no hay Papelera)
//   pedido { "tipo": "notas-ajustes", "ramo": 3, "aprobacion"?, "examenPeso"?, "examenMinimo"?, "presentacionMinima"? }
//   pedido { "tipo": "notas-borrar", "ramo": 3 | null }   null = todas
//   aviso { "tipo": "repaso", "repaso": EstadoRepaso }   propuestas pendientes, tarjetas que vencen hoy, conteo por ramo y resúmenes (A3); también si lo propone el MCP
//   pedido { "tipo": "repaso-estado" }   → "datos": EstadoRepaso (con la función apagada, vacío)
//   pedido { "tipo": "repaso-todo" }   → "datos": EstadoRepaso + { ramos, tarjetas } (no depende de la función: «Lo que sé de ti»)
//   pedido { "tipo": "repaso-propuesta-decidir", "grabacion": "AAAA-MM-DD-HHMMSS", "decision": "aceptar"|"descartar", "temas"?: [0], "glosario"?: [0], "preguntas"?: [0], "ramoId"?: 3 | null, "glosarioEditado"?, "preguntasEditado"? }
//   pedido { "tipo": "repaso-responder", "tarjeta": 7, "resultado": "no-sabia"|"casi"|"sabia" }
//   pedido { "tipo": "repaso-borrar", "que": "tarjeta"|"grabacion"|"ramo"|"todo", "tarjeta"?: 7, "grabacion"?: "…", "ramo"?: 3 | null }   (definitivo: no hay Papelera)
//   aviso { "tipo": "plan-estudio", "planes": PlanEstudio[] }   planes de estudio con sus bloques (A4); también si los cambia el MCP
//   aviso { "tipo": "plan-estudio-aviso", "texto": "…", "bloque": 3, "ramo": 1 }   10 min antes de un bloque
//   pedido { "tipo": "plan-estudio-estado" }   → "datos": { planes } (con la función apagada, vacío)
//   pedido { "tipo": "plan-estudio-todo" }   → "datos": { ramos, planes, evaluaciones } (no depende de la función: «Lo que sé de ti»)
//   pedido { "tipo": "plan-estudio-proponer", "ramo": 3, "evaluacion": 7, "horas"?: 6 }   → "datos": propuesta (no guarda nada)
//   pedido { "tipo": "plan-estudio-agendar", "ramo": 3, "evaluacion": 7, "horas": 6, "bloques": [{ tipo, inicioMs, finMs }], "calendario": false }
//   pedido { "tipo": "plan-estudio-bloque", "bloque": 4, "estado": "pendiente"|"hecho"|"saltado" }
//   pedido { "tipo": "plan-estudio-borrar", "que": "plan"|"ramo"|"todo", "plan"?: 2, "ramo"?: 3 }   (los eventos ya creados en el calendario se borran a mano)
//   pedido { "tipo": "pomodoro-iniciar", "ramo"?: 3, "etiqueta"?: "…" }   → un pomodoro enlazado al ramo
//   aviso { "tipo": "estadisticas-estudio", "resumen": ResumenEstudio }   tiempo estudiado de la semana, racha y totales por ramo (A5); también si lo cambia el pomodoro, un bloque hecho o el MCP
//   aviso { "tipo": "celebracion", "motivo": "meta"|"racha"|"tarea"|"bloque"|"aprobado", "texto": "…" }   Brote festeja algo que lograste y marcaste tú (una sola vez cada cosa)
//   pedido { "tipo": "estadisticas-estado" }   → "datos": { resumen } (con la función apagada, vacío)
//   pedido { "tipo": "estadisticas-todo" }   → "datos": { ramos, resumen } (no depende de la función: «Lo que sé de ti»)
//   pedido { "tipo": "estadisticas-borrar", "que": "registro"|"ramo"|"todo", "registro"?: 4, "ramo"?: 3 | null }   (definitivo: no hay Papelera)
//   pedido { "tipo": "ramo-asignar", "que": "tarea"|"propuesta"|"pomodoro"|"grabacion", "ref": 7 | "AAAA-MM-DD-HHMMSS", "ramo": 3 | null }
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
  listarTranscripciones,
  PLANTILLAS_BASE,
  MedidorCpu,
  ACCIONES_MUSICA,
  SesionesClaude,
  describirHerramienta,
  esDeOpenClaw,
  leerEventoHook,
  AvisadorCalendario,
  AvisadorEntregas,
  DIAS_VENTANA,
  armarAgenda,
  type PruebaEntrada,
  TareasAgenda,
  describirErrorAula,
  leerAula,
  aplicarPedidoSecretos,
  leerConfigAula,
  marcaConfigAula,
  pendientes,
  type Entrega,
  leerAjustesGrabaciones,
  leerFunciones,
  marcaFunciones,
  type ConfigFunciones,
  type IdFuncion,
  FUNCIONES_DE_AGENDA,
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
  Ramos,
  Notas,
  Repaso,
  PlanesEstudio,
  EstadisticasEstudio,
  resumirEstudio,
  celebracionesDeEstudio,
  leerAprobados,
  ramosPorCelebrar,
  textoBloqueHecho,
  textoRamoAprobado,
  textoTareaHecha,
  POMODORO,
  HORARIO_POR_DEFECTO,
  bloquesPorAvisar,
  leerFechaPrueba,
  proponerPlan,
  textoAvisoBloque,
  tituloDeBloque,
  RESULTADOS,
  armarEstadoRepaso,
  armarFichaNotas,
  armarFichas,
  sugerirRamos,
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
import { Transcriptor, limpiarAudiosVencidos } from "./grabaciones.ts";
import { avisoDe, borrarDeGrabaciones, guardarAviso, listarGrabaciones, podarAvisos, verTranscripcion } from "./memoria-grabaciones.ts";
import { estadoWhisper, transcribirConWhisper } from "./transcribir.ts";
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
  // Solo lectura. `ramos_crear` sí pregunta: escribe en la pestaña Estudio del usuario.
  "mcp__gastos__ramos_listar",
  // Notas: lectura y cálculo. `notas_anotar` sí pregunta: escribe una nota del usuario.
  "mcp__gastos__notas_resumen",
  "mcp__gastos__notas_necesaria",
  // Repaso: solo deja una propuesta pendiente; el usuario decide en la isla.
  "mcp__gastos__repaso_proponer",
  // Plan de estudio: solo calcula y lee; agendar lo decide el usuario en la isla.
  "mcp__gastos__estudio_plan",
  "mcp__gastos__estudio_hoy",
  // Estadísticas de estudio: solo lectura.
  "mcp__gastos__estudio_estadisticas",
  "mcp__gastos__transcripciones_listar",
  "mcp__gastos__transcripciones_leer",
  // Solo deja propuestas pendientes: nada llega a la Agenda sin que el usuario lo acepte en la isla.
  "mcp__gastos__agenda_proponer",
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
/** Tareas y propuestas sacadas de las transcripciones (el agente propone con `agenda_proponer`; decide el usuario). */
const tareasAgenda = new TareasAgenda(gastos);
/** Los ramos del usuario (pestaña Estudio). */
const ramos = new Ramos(gastos);
/** Las evaluaciones y notas por ramo (A2). */
const notas = new Notas(gastos, ramos);
/** Las propuestas y tarjetas de repaso (A3): las propone el agente por MCP; decide el usuario en la isla. */
const repaso = new Repaso(gastos, ramos);
/** Los planes de estudio antes de una prueba (A4): los calcula el motor; el usuario confirma en la isla. */
const planesEstudio = new PlanesEstudio(gastos, notas);
/** El tiempo estudiado (A5): lo escriben el pomodoro, los bloques hechos y lo que el usuario anota a mano. */
const estadisticas = new EstadisticasEstudio(gastos, ramos);
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
  // «¿Cómo viene mi semana?»: lo ya leído; sin ninguna fuente prendida no hay nada que decir.
  agenda: () => (FUNCIONES_DE_AGENDA.some((f) => activa(f)) ? agendaDeAhora(Date.now()) : null),
  uso: () => {
    // Quien pregunta "¿cuánto he gastado en tokens?" recibe lo último calculado y deja pedido lo nuevo.
    void actualizarUso();
    return { plan: vigente(lecturaPlan, Date.now()), statusline: statuslinePuesta(), resumen: resumenUso };
  },
  transcripciones: () => listarTranscripciones(),
  ramos,
  notas,
  repaso,
  planes: planesEstudio,
  estadisticas,
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
/** La pestaña Agenda: lo de las funciones prendidas, 14 días, y qué fuentes hay (para explicar lo que falta). */
function inicioDeHoy(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
/** Los bloques de estudio entre dos instantes, con su título genérico («Estudiar Cálculo»). */
function bloquesParaAgenda(desdeMs: number, hastaMs: number) {
  const nombres = new Map(ramos.listar(true).map((r) => [r.id, r.nombre]));
  return planesEstudio.bloquesEntre(desdeMs, hastaMs).map((b) => ({
    id: b.id,
    ramoId: b.ramoId,
    titulo: tituloDeBloque(b.tipo, nombres.get(b.ramoId) ?? "tu ramo"),
    inicioMs: b.inicioMs,
    finMs: b.finMs,
    hecho: b.estado === "hecho",
  }));
}
/** Las pruebas (evaluaciones con fecha y sin nota) de ramos activos entre dos instantes, con «Certamen 2 · Cálculo» de título. */
function pruebasParaAgenda(desdeMs: number, hastaMs: number): PruebaEntrada[] {
  const nombres = new Map(ramos.listar(false).map((r) => [r.id, r.nombre]));
  const lista: PruebaEntrada[] = [];
  for (const e of notas.listar()) {
    const fecha = e.nota === null ? leerFechaPrueba(e.fecha) : null;
    const ramo = nombres.get(e.ramoId);
    if (!fecha || !ramo || fecha.ms < desdeMs || fecha.ms >= hastaMs) continue;
    lista.push({ id: e.id, ramoId: e.ramoId, titulo: `${e.nombre} · ${ramo}`, inicioMs: fecha.ms, conHora: fecha.conHora });
  }
  return lista;
}
/** La agenda con lo que ya se leyó (sin volver a leer el calendario ni el aula): la pestaña y «¿cómo viene mi semana?». */
function agendaDeAhora(ahora: number) {
  return armarAgenda(
    {
      eventos: activa("calendario") ? eventosCalendario() : [],
      entregas: activa("aula") && entregasAula ? pendientes(entregasAula, ahora) : [],
      temporizadores: activa("temporizadores") ? temporizadores.activos() : [],
      // Lo ya aceptado es del usuario: se ve aunque la función de grabar se apague.
      tareas: tareasAgenda.tareas(inicioDeHoy(ahora), inicioDeHoy(ahora) + DIAS_VENTANA * 86_400_000),
      // Los bloques de un plan de estudio ya agendado también son del usuario.
      bloques: bloquesParaAgenda(inicioDeHoy(ahora), inicioDeHoy(ahora) + DIAS_VENTANA * 86_400_000),
      // Las fechas de las pruebas (A2/A4) solo salen con Estudio prendido.
      pruebas: activa("estudio") ? pruebasParaAgenda(inicioDeHoy(ahora), inicioDeHoy(ahora) + DIAS_VENTANA * 86_400_000) : [],
    },
    ahora,
    DIAS_VENTANA,
  );
}
async function estadoAgenda() {
  if (activa("calendario")) await leerCalendarios();
  if (activa("aula")) await leerAulaSiToca();
  const ahora = Date.now();
  const dias = agendaDeAhora(ahora);
  return {
    dias,
    fuentes: {
      calendario: activa("calendario"),
      aula: activa("aula") && (entregasAula !== null || errorAula !== null),
      temporizadores: activa("temporizadores"),
      // Calendario del Mac: null = no se ha leído (o no es Mac); 3 = acceso completo; 0 = sin decidir.
      permisoMac: process.platform === "darwin" ? permisoCalendarioMac : null,
      mac: process.platform === "darwin",
      ical: icsTexto !== null,
    },
  };
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
  // Cada pomodoro lleva el ramo al que se asignó (si alguno): la isla le pone su punto de color.
  const deRamo = ramos.enlaces("pomodoro");
  const lista = JSON.stringify(temporizadores.activos().map((t) => ({ ...t, ramoId: deRamo.get(String(t.id)) ?? null })));
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

// Propuestas de tareas y fechas sacadas de una transcripción: las deja el agente por MCP (otro proceso),
// así que se mira la marca cada 2 s. La isla las muestra con Agregar / Descartar; nada se agrega solo.
let marcaPropuestas = "";
function revisarPropuestas(forzar = false): void {
  const marca = tareasAgenda.marca();
  if (!forzar && marca === marcaPropuestas) return;
  const habia = marcaPropuestas !== "";
  marcaPropuestas = marca;
  const propuestas = tareasAgenda.pendientes();
  if (habia && propuestas.length > 0) registrar("agenda: hay propuestas de una grabación");
  avisar({ tipo: "propuestas-agenda", propuestas });
}
function detenerPropuestas(): void {
  marcaPropuestas = "";
  avisar({ tipo: "propuestas-agenda", propuestas: [] });
}

// Ramos: se mira la marca cada 2 s (así aparece lo que crea el agente por MCP, otro proceso).
let marcaRamos = "";
function revisarRamos(forzar = false): void {
  const marca = ramos.marca();
  if (!forzar && marca === marcaRamos) return;
  marcaRamos = marca;
  avisar({ tipo: "ramos", ramos: ramos.listar() });
}
function detenerRamos(): void {
  marcaRamos = "";
  avisar({ tipo: "ramos", ramos: [] });
}

// Notas: igual que los ramos, se mira la marca cada 2 s (lo que anota el agente por MCP es otro proceso).
let marcaNotas = "";
/** Las fichas de los ramos activos que tienen evaluaciones o ajustes. Nunca se registran: son notas del usuario. */
function fichasNotas(incluirArchivados = false) {
  return ramos
    .listar(incluirArchivados)
    .map((r) => armarFichaNotas(r.id, notas.listar(r.id), notas.ajustes(r.id)))
    .filter((f) => f.evaluaciones.length > 0 || f.ajustes.examenPeso !== null);
}
function revisarNotas(forzar = false): void {
  const marca = `${notas.marca()}|${ramos.marca()}`;
  if (!forzar && marca === marcaNotas) return;
  marcaNotas = marca;
  avisar({ tipo: "notas", fichas: fichasNotas() });
  revisarRamosAprobados();
}
function detenerNotas(): void {
  marcaNotas = "";
  avisar({ tipo: "notas", fichas: [] });
}
// Repaso (A3): se mira la marca cada 2 s (la propuesta la deja el MCP, otro proceso) y al cambiar el día
// (las tarjetas que vencen son otras). Nada de esto se registra: son frases de las clases del usuario.
let marcaRepaso = "";
function estadoRepaso() {
  const ahora = Date.now();
  return armarEstadoRepaso(repaso.tarjetas(), repaso.propuestas(ahora), repaso.resumenes(), ahora);
}
function revisarRepaso(forzar = false): void {
  const marca = `${repaso.marca()}|${ramos.marca()}|${inicioDeHoy(Date.now())}`;
  if (!forzar && marca === marcaRepaso) return;
  const habia = marcaRepaso !== "";
  marcaRepaso = marca;
  const estado = estadoRepaso();
  if (habia && estado.propuestas.length > 0) registrar("estudio: hay una propuesta de repaso");
  avisar({ tipo: "repaso", repaso: estado });
}
function detenerRepaso(): void {
  marcaRepaso = "";
  avisar({ tipo: "repaso", repaso: armarEstadoRepaso([], [], [], Date.now()) });
}
// Plan de estudio (A4): se mira la marca cada 2 s (el MCP puede cambiar bloques) y se avisa 10 min antes de cada bloque
// sin abrir la isla. Nada del contenido se registra: son ramos, fechas y horas del usuario.
let marcaPlanEstudio = "";
const bloquesAvisados = new Set<number>();
function estadoPlanEstudio() {
  return { planes: planesEstudio.planes(Date.now()) };
}
function revisarPlanEstudio(forzar = false): void {
  const marca = `${planesEstudio.marca()}|${ramos.marca()}`;
  if (forzar || marca !== marcaPlanEstudio) {
    marcaPlanEstudio = marca;
    avisar({ tipo: "plan-estudio", ...estadoPlanEstudio() });
  }
  const ahora = Date.now();
  const proximos = planesEstudio.bloquesEntre(ahora, ahora + 15 * 60_000);
  const nombres = new Map(ramos.listar(true).map((r) => [r.id, r.nombre]));
  for (const id of bloquesPorAvisar(proximos, bloquesAvisados, ahora)) {
    bloquesAvisados.add(id);
    const b = proximos.find((x) => x.id === id)!;
    registrar("estudio: aviso de un bloque");
    avisar({ tipo: "plan-estudio-aviso", texto: textoAvisoBloque(b, nombres.get(b.ramoId) ?? "tu ramo"), bloque: id, ramo: b.ramoId });
  }
}
// Estadísticas de estudio (A5): se mira la marca cada 2 s (el pomodoro que termina, un bloque hecho, lo anotado por
// frase o por el agente) y al cambiar el día. Solo números: nunca se registra su contenido.
let marcaEstadisticas = "";
function estadoEstadisticas() {
  return { resumen: resumirEstudio(estadisticas.registros(), Date.now(), estadisticas.meta()) };
}
function revisarEstadisticas(forzar = false): void {
  const marca = `${estadisticas.marca()}|${ramos.marca()}|${inicioDeHoy(Date.now())}`;
  if (!forzar && marca === marcaEstadisticas) return;
  marcaEstadisticas = marca;
  avisar({ tipo: "estadisticas-estudio", ...estadoEstadisticas() });
  revisarCelebracionesDeEstudio();
}

// Celebraciones (E3 y E4): Brote festeja lo que el usuario logra y marcó él mismo (la meta de la semana, los hitos
// de la racha, una tarea o un bloque hechos, un ramo aprobado). Una sola vez cada cosa; nada de lo que pasó se
// pierde ni se reprocha. En los registros solo queda el motivo, nunca el texto (que puede traer un ramo).
function celebrar(motivo: string, texto: string): void {
  registrar(`celebración: ${motivo}`);
  avisar({ tipo: "celebracion", motivo, texto });
}
function revisarCelebracionesDeEstudio(): void {
  const previos = estadisticas.avisos();
  const { celebraciones, avisos } = celebracionesDeEstudio(estadisticas.registros(), estadisticas.meta(), Date.now(), previos);
  if (JSON.stringify(avisos) !== JSON.stringify(previos)) estadisticas.guardarAvisos(avisos);
  for (const c of celebraciones) celebrar(c.tipo, c.texto);
}
const CLAVE_APROBADOS = "ramos-aprobados";
function revisarRamosAprobados(): void {
  const aprobadosAhora = fichasNotas(true).filter((f) => f.calculo.veredicto === "aprobado").map((f) => f.ramoId);
  const { celebrar: nuevos, guardar } = ramosPorCelebrar(aprobadosAhora, leerAprobados(gastos.ajuste(CLAVE_APROBADOS)));
  if (nuevos.length > 0 || gastos.ajuste(CLAVE_APROBADOS) === null) gastos.guardarAjuste(CLAVE_APROBADOS, JSON.stringify(guardar));
  const nombres = new Map(ramos.listar(true).map((r) => [r.id, r.nombre]));
  for (const id of nuevos) celebrar("aprobado", textoRamoAprobado(nombres.get(id) ?? "tu ramo"));
}
const tareasCelebradas = new Set<number>();
const bloquesCelebrados = new Set<number>();
function detenerEstadisticas(): void {
  marcaEstadisticas = "";
  avisar({ tipo: "estadisticas-estudio", resumen: resumirEstudio([], Date.now()) });
}
function detenerPlanEstudio(): void {
  marcaPlanEstudio = "";
  avisar({ tipo: "plan-estudio", planes: [] });
}
/** La propuesta de plan para una evaluación: cuánto estudiar y dónde caen los bloques (esquivando calendario y otros planes). */
async function propuestaPlanEstudio(ramoId: number, evaluacionId: number, horas?: number) {
  const ev = notas.obtener(evaluacionId);
  if (!ev || ev.ramoId !== ramoId) throw new Error("Esa evaluación no existe");
  if (activa("calendario")) await leerCalendarios();
  const ahora = Date.now();
  const existente = planesEstudio.planDe(evaluacionId);
  const propios = new Set((existente?.bloques ?? []).map((b) => `${b.inicioMs}-${b.finMs}`));
  const ocupados = [
    // Los eventos que son copia de los bloques de este mismo plan no cuentan como ocupados.
    ...(activa("calendario") ? eventosCalendario().filter((e) => !e.todoElDia && !propios.has(`${e.inicioMs}-${e.finMs}`)) : []).map((e) => ({ inicioMs: e.inicioMs, finMs: e.finMs })),
    ...planesEstudio
      .bloquesEntre(ahora, ahora + 31 * 86_400_000)
      .filter((b) => !(existente && b.planId === existente.id && b.estado !== "hecho"))
      .map((b) => ({ inicioMs: b.inicioMs, finMs: b.finMs })),
  ];
  const ficha = armarFichaNotas(ramoId, notas.listar(ramoId), notas.ajustes(ramoId));
  const hechas = existente ? planesEstudio.horasHechas(existente.id) : 0;
  let r = proponerPlan(ficha, evaluacionId, { ahoraMs: ahora, ocupados, horas, horario: HORARIO_POR_DEFECTO });
  // Rehacer un plan que ya avanzó: se reparte solo lo que falta.
  if (r.ok && horas === undefined && hechas > 0) r = proponerPlan(ficha, evaluacionId, { ahoraMs: ahora, ocupados, horas: Math.max(1, r.propuesta.horasObjetivo - hechas), horario: HORARIO_POR_DEFECTO });
  if (!r.ok) throw new Error(r.motivo);
  return {
    ...r.propuesta,
    ramoNombre: ramos.obtener(ramoId)?.nombre ?? "",
    horasHechas: Math.round(hechas * 10) / 10,
    tarjetas: repaso.tarjetas(ramoId).length,
    planId: existente?.id ?? null,
    calendario: activa("calendario"),
    // Lo que el calendario conoce llega hasta DIAS_VENTANA días: más allá se asume libre.
    miraHasta: ahora + DIAS_VENTANA * 86_400_000,
  };
}
/** La pestaña Estudio: ramos con su ficha y lo que se sugiere agregar. Lee las fuentes solo si su función está prendida. */
async function estadoEstudio() {
  if (activa("calendario")) await leerCalendarios();
  if (activa("aula")) await leerAulaSiToca();
  const ahora = Date.now();
  const lista = ramos.listar();
  const eventos = activa("calendario") ? eventosCalendario() : [];
  const entregas = activa("aula") && entregasAula ? pendientes(entregasAula, ahora) : [];
  const tareasLista = tareasAgenda.tareas(inicioDeHoy(ahora), inicioDeHoy(ahora) + 60 * 86_400_000);
  const fichas = armarFichas(
    lista,
    { eventos, entregas, tareas: tareasLista, ramoDeTarea: ramos.enlaces("tarea"), ramoDeGrabacion: ramos.enlaces("grabacion") },
    ahora,
  );
  const sugerencias = sugerirRamos(
    entregas.map((e) => e.curso).filter(Boolean),
    eventos.filter((e) => !e.todoElDia).map((e) => e.titulo),
    lista,
  );
  return {
    ramos: lista,
    fichas,
    sugerencias,
    fuentes: { calendario: activa("calendario"), aula: activa("aula") },
    // Cuál ramo tiene cada tarea de la Agenda y cada pomodoro, para pintar su punto de color.
    ramoDeTarea: Object.fromEntries(ramos.enlaces("tarea")),
    // Notas por ramo (A2): la ficha de cada ramo trae sus evaluaciones y lo que falta para aprobar.
    notas: fichasNotas(),
  };
}

/** La cola de transcripciones (solo existe con la función `grabaciones` prendida). */
let transcriptor: Transcriptor | null = null;

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
  estudio: () => {
    const detener = cada(2000, () => {
      revisarRamos();
      revisarNotas();
      revisarRepaso();
      revisarPlanEstudio();
      revisarEstadisticas();
    });
    return () => {
      detener();
      detenerRamos();
      detenerNotas();
      detenerRepaso();
      detenerPlanEstudio();
      detenerEstadisticas();
    };
  },
  grabaciones: () => {
    // Al prender: limpia los audios vencidos y repite cada hora, con los días vigentes de los ajustes.
    const limpiar = () => {
      try {
        const borrados = limpiarAudiosVencidos();
        if (borrados.length > 0) registrar(`grabaciones: borré ${borrados.length} audio(s) vencido(s)`);
      } catch (error) {
        registrar(`grabaciones: no pude limpiar los audios: ${mensajeDe(error)}`);
      }
    };
    const detenerLimpieza = cada(60 * 60 * 1000, limpiar);
    const detenerPropuestas2 = cada(2000, () => revisarPropuestas());
    transcriptor = new Transcriptor({
      transcribir: (audio, modelo, senal) => transcribirConWhisper(audio, modelo, { senal }),
      avisar: (aviso) => avisar({ tipo: "transcripcion", ...aviso }),
    });
    return () => {
      detenerLimpieza();
      detenerPropuestas2();
      detenerPropuestas();
      transcriptor?.detener();
      transcriptor = null;
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
      if (activa("estudio")) revisarNotas();
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
    case "agenda-estado":
      return { datos: await estadoAgenda() };
    case "resumen-dia": {
      // El automático de la mañana y el botón de la isla: el mismo texto que la frase «dame el resumen del día».
      if (activa("calendario")) await leerCalendarios();
      if (activa("aula")) await leerAulaSiToca();
      return { datos: motor.resumenDelDia() };
    }
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
    case "transcribir": {
      if (!activa("grabaciones") || !transcriptor) throw new Error("Grabar y transcribir está apagado: actívalo en Configurar Brote ⚙️");
      // Sin haber aceptado el consentimiento (Configurar Brote → Grabar y transcribir) no se transcribe nada.
      if (!leerAjustesGrabaciones().consentimiento) throw new Error("Falta aceptar el aviso de privacidad de Grabar y transcribir en Configurar Brote ⚙️");
      // Sin respuesta en el pedido, vale la que se dio al grabar (la pestaña Grabar transcribe después).
      transcriptor.pedir(pedido.grabacion, pedido.avisoAPresentes ?? avisoDe(pedido.grabacion));
      return { datos: { pendientes: transcriptor.pendientes() } };
    }
    case "transcripcion-cancelar": {
      if (!activa("grabaciones") || !transcriptor || typeof pedido.grabacion !== "string") break;
      return { datos: { cancelada: transcriptor.cancelar(pedido.grabacion) } };
    }
    case "grabaciones-estado": {
      if (!activa("grabaciones")) return { datos: null };
      const { whisper, modelos } = estadoWhisper();
      return { datos: { whisper: whisper !== null, modelos, pendientes: transcriptor?.pendientes() ?? [], ajustes: leerAjustesGrabaciones() } };
    }
    case "grabaciones-listar": {
      // Sin depender de la función: lo ya guardado es del usuario y debe poder verlo y borrarlo aunque la apague.
      const lista = listarGrabaciones(leerAjustesGrabaciones().diasAudio);
      podarAvisos(lista.audios.map((a) => a.id));
      return { datos: lista };
    }
    case "grabacion-aviso": {
      // La respuesta a «¿avisaste a los presentes?», para cuando se transcriba. Solo guarda; no transcribe.
      if (typeof pedido.grabacion !== "string") break;
      guardarAviso(pedido.grabacion, pedido.aviso);
      return {};
    }
    case "grabacion-ver": {
      if (typeof pedido.grabacion !== "string") break;
      const vista = verTranscripcion(pedido.grabacion);
      if (!vista) throw new Error("Esa transcripción ya no está");
      return { datos: vista };
    }
    case "ramos-estado":
      return { datos: activa("estudio") ? await estadoEstudio() : { ramos: [], fichas: [], sugerencias: [], fuentes: { calendario: false, aula: false }, ramoDeTarea: {}, notas: [] } };
    // «Lo que sé de ti»: lo guardado es del usuario y debe poder verlo y borrarlo aunque apague la función.
    case "ramos-todos":
      return { datos: ramos.listar(true) };
    case "ramo-crear": {
      if (!activa("estudio")) throw new Error("Estudio está apagado: actívalo en Configurar Brote ⚙️");
      const r = ramos.crear({ nombre: pedido.nombre, alias: pedido.alias, color: pedido.color }, Date.now());
      if (!r.ok) throw new Error(r.motivo);
      revisarRamos();
      return { mensaje: `Listo, agregué ${r.ramo.nombre}.`, datos: r.ramo };
    }
    case "ramo-editar": {
      if (!Number.isInteger(pedido.ramo)) break;
      const r = ramos.editar(pedido.ramo, { nombre: pedido.nombre, alias: pedido.alias, color: pedido.color });
      if (!r.ok) throw new Error(r.motivo);
      revisarRamos();
      return { datos: r.ramo };
    }
    case "ramo-archivar":
      if (!Number.isInteger(pedido.ramo)) break;
      if (!ramos.archivar(pedido.ramo, pedido.archivado !== false)) throw new Error("Ese ramo ya no existe");
      revisarRamos();
      return {};
    case "ramo-borrar":
      if (!Number.isInteger(pedido.ramo)) break;
      if (!ramos.borrar(pedido.ramo)) throw new Error("Ese ramo ya no existe");
      registrar("estudio: ramo borrado");
      revisarRamos();
      return {};
    // Notas (A2). Los datos son del usuario: se ven y se borran aunque la función esté apagada; escribir exige la función.
    case "notas-estado":
      return { datos: activa("estudio") ? fichasNotas() : [] };
    case "notas-todas":
      return { datos: { ramos: ramos.listar(true), fichas: fichasNotas(true) } };
    case "evaluacion-guardar": {
      if (!activa("estudio")) throw new Error("Estudio está apagado: actívalo en Configurar Brote ⚙️");
      if (!Number.isInteger(pedido.ramo) && !Number.isInteger(pedido.evaluacion)) break;
      const cambios = { nombre: pedido.nombre, peso: pedido.peso, nota: pedido.nota, fecha: pedido.fecha };
      const r = Number.isInteger(pedido.evaluacion)
        ? notas.editar(pedido.evaluacion, cambios)
        : notas.crear(pedido.ramo, { nombre: pedido.nombre, peso: pedido.peso, nota: pedido.nota ?? null, fecha: pedido.fecha ?? null }, Date.now());
      if (!r.ok) throw new Error(r.motivo);
      revisarNotas();
      return { datos: r.evaluacion };
    }
    case "evaluacion-borrar":
      if (!Number.isInteger(pedido.evaluacion)) break;
      if (!notas.borrar(pedido.evaluacion)) throw new Error("Esa evaluación ya no existe");
      registrar("estudio: evaluación borrada");
      revisarNotas();
      return {};
    case "notas-ajustes": {
      if (!activa("estudio")) throw new Error("Estudio está apagado: actívalo en Configurar Brote ⚙️");
      if (!Number.isInteger(pedido.ramo)) break;
      const actual = notas.ajustes(pedido.ramo);
      const campo = (k: string) => (pedido[k] === undefined ? (actual as any)[k] : pedido[k]);
      const r = notas.ponerAjustes(pedido.ramo, { aprobacion: campo("aprobacion"), examenPeso: campo("examenPeso"), examenMinimo: campo("examenMinimo"), presentacionMinima: campo("presentacionMinima") });
      if (!r.ok) throw new Error(r.motivo);
      revisarNotas();
      return { datos: r.ajustes };
    }
    case "notas-borrar": {
      if (pedido.ramo !== null && !Number.isInteger(pedido.ramo)) break;
      const n = pedido.ramo === null ? notas.borrarTodas() : notas.borrarDeRamo(pedido.ramo);
      registrar(`estudio: notas borradas (${n})`);
      revisarNotas();
      return { datos: { borradas: n } };
    }
    // Repaso (A3). Lo guardado es del usuario: se ve y se borra aunque la función esté apagada; decidir y repasar exigen la función.
    case "repaso-estado":
      return { datos: activa("estudio") ? estadoRepaso() : armarEstadoRepaso([], [], [], Date.now()) };
    case "repaso-todo":
      return { datos: { ramos: ramos.listar(true), ...estadoRepaso(), tarjetas: repaso.tarjetas() } };
    case "repaso-propuesta-decidir": {
      if (!activa("estudio")) throw new Error("Estudio está apagado: actívalo en Configurar Brote ⚙️");
      if (typeof pedido.grabacion !== "string" || (pedido.decision !== "aceptar" && pedido.decision !== "descartar")) break;
      if (pedido.decision === "descartar") {
        if (!repaso.descartar(pedido.grabacion)) throw new Error("Esa propuesta ya no está pendiente");
        revisarRepaso();
        return { mensaje: "Descartada." };
      }
      const r = repaso.decidir(pedido.grabacion, pedido, Date.now());
      if (!r.ok) throw new Error(r.motivo);
      registrar(`estudio: repaso aceptado (${r.tarjetas} tarjetas)`);
      revisarRepaso();
      return { datos: { tarjetas: r.tarjetas, repetidas: r.repetidas, temas: r.temas } };
    }
    case "repaso-responder": {
      if (!activa("estudio")) throw new Error("Estudio está apagado: actívalo en Configurar Brote ⚙️");
      if (!Number.isInteger(pedido.tarjeta) || !RESULTADOS.includes(pedido.resultado)) break;
      const t = repaso.responder(pedido.tarjeta, pedido.resultado, Date.now());
      if (!t) throw new Error("Esa tarjeta ya no existe");
      revisarRepaso();
      return { datos: { caja: t.caja, proximoMs: t.proximoMs } };
    }
    case "repaso-borrar": {
      // «tarjeta» (id), «grabacion» (id exacto), «ramo» (id, o null = lo que no tiene ramo) o «todo». Definitivo: es una base de datos.
      let n = 0;
      if (pedido.que === "tarjeta" && Number.isInteger(pedido.tarjeta)) n = repaso.borrarTarjeta(pedido.tarjeta) ? 1 : 0;
      else if (pedido.que === "grabacion" && typeof pedido.grabacion === "string") n = repaso.borrarDeGrabacion(pedido.grabacion);
      else if (pedido.que === "ramo" && (pedido.ramo === null || Number.isInteger(pedido.ramo))) n = repaso.borrarDeRamo(pedido.ramo);
      else if (pedido.que === "todo") n = repaso.borrarTodo();
      else break;
      registrar(`estudio: repaso borrado (${n})`);
      revisarRepaso();
      return { datos: { borradas: n } };
    }
    // Plan de estudio (A4). Lo guardado es del usuario: se ve y se borra aunque la función esté apagada; proponer y agendar exigen la función.
    case "plan-estudio-estado":
      return { datos: activa("estudio") ? estadoPlanEstudio() : { planes: [] } };
    case "plan-estudio-todo": {
      const nombres: Record<number, string> = {};
      for (const e of ramos.listar(true).flatMap((r) => notas.listar(r.id))) nombres[e.id] = e.nombre;
      return { datos: { ramos: ramos.listar(true), ...estadoPlanEstudio(), evaluaciones: nombres } };
    }
    case "plan-estudio-proponer": {
      if (!activa("estudio")) throw new Error("Estudio está apagado: actívalo en Configurar Brote ⚙️");
      if (!Number.isInteger(pedido.ramo) || !Number.isInteger(pedido.evaluacion)) break;
      if (pedido.horas !== undefined && (typeof pedido.horas !== "number" || !Number.isFinite(pedido.horas))) break;
      return { datos: await propuestaPlanEstudio(pedido.ramo, pedido.evaluacion, pedido.horas) };
    }
    case "plan-estudio-agendar": {
      if (!activa("estudio")) throw new Error("Estudio está apagado: actívalo en Configurar Brote ⚙️");
      if (!Number.isInteger(pedido.ramo) || !Number.isInteger(pedido.evaluacion) || !Array.isArray(pedido.bloques)) break;
      const ev = notas.obtener(pedido.evaluacion);
      if (!ev || ev.ramoId !== pedido.ramo) throw new Error("Esa evaluación no existe");
      const fecha = leerFechaPrueba(ev.fecha);
      if (!fecha) throw new Error("Falta la fecha de la prueba");
      const horas = typeof pedido.horas === "number" && Number.isFinite(pedido.horas) ? pedido.horas : (pedido.bloques.length * 50) / 60;
      const aCalendario = pedido.calendario === true && activa("calendario");
      const r = planesEstudio.crear(pedido.ramo, pedido.evaluacion, fecha.ms, horas, pedido.bloques, aCalendario, Date.now());
      if (!r.ok) throw new Error(r.motivo);
      // Copia al Calendario del Mac solo si el usuario marcó la casilla. Los eventos creados no se pueden borrar desde Brote.
      let creados = 0;
      let fallidos = 0;
      if (aCalendario) {
        const nombre = ramos.obtener(pedido.ramo)?.nombre ?? "tu ramo";
        for (const b of r.plan.bloques.filter((x) => x.estado === "pendiente")) {
          const res = crearEvento({ titulo: tituloDeBloque(b.tipo, nombre), lugar: null, inicioMs: b.inicioMs, finMs: b.finMs });
          if (res.ok) creados++;
          else fallidos++;
        }
        if (creados === 0) planesEstudio.desmarcarCalendario(r.plan.id);
      }
      registrar(`estudio: plan agendado (${r.plan.bloques.length} bloques${aCalendario ? `, ${creados} al calendario` : ""})`);
      revisarPlanEstudio(true);
      return { datos: { plan: planesEstudio.plan(r.plan.id), calendario: { pedido: aCalendario, creados, fallidos } } };
    }
    case "plan-estudio-bloque": {
      if (!Number.isInteger(pedido.bloque) || !["pendiente", "hecho", "saltado"].includes(pedido.estado)) break;
      if (!planesEstudio.marcar(pedido.bloque, pedido.estado)) throw new Error("Ese bloque ya no existe");
      revisarPlanEstudio();
      if (pedido.estado === "hecho" && activa("estudio") && !bloquesCelebrados.has(pedido.bloque)) {
        bloquesCelebrados.add(pedido.bloque);
        celebrar("bloque", textoBloqueHecho(bloquesCelebrados.size - 1));
      }
      return {};
    }
    case "plan-estudio-borrar": {
      let n = 0;
      if (pedido.que === "plan" && Number.isInteger(pedido.plan)) n = planesEstudio.borrarPlan(pedido.plan) ? 1 : 0;
      else if (pedido.que === "ramo" && Number.isInteger(pedido.ramo)) n = planesEstudio.borrarDeRamo(pedido.ramo);
      else if (pedido.que === "todo") n = planesEstudio.borrarTodo();
      else break;
      registrar(`estudio: planes de estudio borrados (${n})`);
      revisarPlanEstudio(true);
      return { datos: { borrados: n } };
    }
    case "pomodoro-iniciar": {
      // «Empezar» en un bloque de estudio: un pomodoro con el nombre del ramo (queda enlazado a él).
      if (!activa("temporizadores")) throw new Error("Temporizadores está apagado: actívalo en Configurar Brote ⚙️");
      const ramo = Number.isInteger(pedido.ramo) ? ramos.obtener(pedido.ramo) : null;
      const etiqueta = ramo ? ramo.nombre : typeof pedido.etiqueta === "string" && pedido.etiqueta.trim() ? pedido.etiqueta.trim().slice(0, 60) : null;
      const t = temporizadores.iniciarPomodoro(POMODORO.estudioMs, etiqueta, new Date());
      if (ramo) ramos.asignar("pomodoro", t.id, ramo.id);
      revisarTemporizadores();
      return { datos: { id: t.id } };
    }
    // Estadísticas de estudio (A5). Lo guardado es del usuario: se ve y se borra aunque la función esté apagada.
    case "estadisticas-estado":
      return { datos: activa("estudio") ? estadoEstadisticas() : { resumen: resumirEstudio([], Date.now()) } };
    case "estadisticas-todo":
      return { datos: { ramos: ramos.listar(true), ...estadoEstadisticas() } };
    case "estadisticas-borrar": {
      let n = 0;
      if (pedido.que === "registro" && Number.isInteger(pedido.registro)) n = estadisticas.borrarRegistro(pedido.registro) ? 1 : 0;
      else if (pedido.que === "ramo" && (pedido.ramo === null || Number.isInteger(pedido.ramo))) n = estadisticas.borrarDeRamo(pedido.ramo);
      else if (pedido.que === "todo") n = estadisticas.borrarTodo();
      else break;
      registrar(`estudio: estadísticas borradas (${n})`);
      revisarEstadisticas(true);
      return { datos: { borrados: n } };
    }
    case "ramo-asignar": {
      if (!["tarea", "propuesta", "pomodoro", "grabacion"].includes(pedido.que)) break;
      if (typeof pedido.ref !== "string" && !Number.isInteger(pedido.ref)) break;
      if (pedido.ramo !== null && !Number.isInteger(pedido.ramo)) break;
      if (!ramos.asignar(pedido.que, pedido.ref, pedido.ramo)) throw new Error("Ese ramo ya no existe");
      revisarRamos();
      return {};
    }
    case "propuestas-listar":
      return { datos: activa("grabaciones") ? tareasAgenda.pendientes() : [] };
    case "propuesta-decidir": {
      if (!Number.isInteger(pedido.propuesta) || (pedido.decision !== "aceptar" && pedido.decision !== "descartar")) break;
      if (pedido.decision === "descartar") {
        if (!tareasAgenda.descartar(pedido.propuesta)) throw new Error("Esa propuesta ya no está pendiente");
        revisarPropuestas();
        return { mensaje: "Descartada." };
      }
      // Lo que el usuario corrigió en la isla (título o fecha) se aplica antes de agregarla.
      if ((pedido.titulo !== undefined || pedido.fecha !== undefined) && !tareasAgenda.editar(pedido.propuesta, { titulo: pedido.titulo, fecha: pedido.fecha }, Date.now())) {
        throw new Error("El título o la fecha no sirven");
      }
      const propuesta = tareasAgenda.aceptar(pedido.propuesta);
      if (!propuesta) throw new Error("Esa propuesta ya no está pendiente");
      // Todo queda en la Agenda de la isla y, con el calendario prendido, también en el calendario (el toque
      // en la isla es la confirmación). Una tarea dura hasta su hora límite; una prueba, 1 h desde su hora.
      const esTarea = propuesta.tipo === "tarea";
      if (esTarea || !activa("calendario")) tareasAgenda.crearTarea(propuesta.titulo, propuesta.detalle, propuesta.inicioMs, propuesta.grabacion, Date.now());
      let mensaje = esTarea ? "Agregada a tu Agenda." : "Agregada a tu calendario.";
      if (activa("calendario")) {
        const inicioMs = esTarea ? propuesta.inicioMs - 30 * 60_000 : propuesta.inicioMs;
        const finMs = esTarea ? propuesta.inicioMs : propuesta.inicioMs + 3_600_000;
        const hecho = crearEvento({ titulo: propuesta.titulo, lugar: propuesta.detalle, inicioMs, finMs });
        if (hecho.ok) mensaje = esTarea ? "Agregada a tu Agenda y a tu calendario." : "Agregada a tu calendario.";
        else if (esTarea) mensaje = "Agregada a tu Agenda (no pude usar tu calendario).";
        else {
          tareasAgenda.crearTarea(propuesta.titulo, propuesta.detalle, propuesta.inicioMs, propuesta.grabacion, Date.now());
          mensaje = "No pude usar tu calendario: la dejé como tarea en la Agenda.";
        }
      } else if (!esTarea) mensaje = "Agregada a tu Agenda como tarea (el calendario está apagado).";
      revisarPropuestas();
      return { mensaje };
    }
    case "tarea-hecha":
      if (!Number.isInteger(pedido.tarea) || typeof pedido.hecha !== "boolean") break;
      if (!tareasAgenda.marcarHecha(pedido.tarea, pedido.hecha)) throw new Error("Esa tarea ya no existe");
      // Brote celebra lo que marcas tú (una vez por tarea).
      if (pedido.hecha && (activa("estudio") || activa("grabaciones")) && !tareasCelebradas.has(pedido.tarea)) {
        tareasCelebradas.add(pedido.tarea);
        celebrar("tarea", textoTareaHecha(tareasCelebradas.size - 1));
      }
      return {};
    case "grabacion-borrar": {
      if ((pedido.que !== "transcripcion" && pedido.que !== "audio") || (pedido.grabacion !== null && typeof pedido.grabacion !== "string")) break;
      const borradas = borrarDeGrabaciones(pedido.que, pedido.grabacion);
      // Una transcripción borrada no deja su enlace a un ramo.
      if (pedido.que === "transcripcion" && borradas > 0) {
        if (pedido.grabacion === null) for (const ref of ramos.enlaces("grabacion").keys()) ramos.olvidarEnlace("grabacion", ref);
        else ramos.olvidarEnlace("grabacion", pedido.grabacion);
        revisarRamos();
      }
      // Sin su transcripción, lo que se propuso de ella y nadie decidió se va también.
      if (pedido.que === "transcripcion" && borradas > 0) {
        if (pedido.grabacion === null) tareasAgenda.olvidarPendientes();
        else tareasAgenda.olvidarDeGrabacion(pedido.grabacion);
        revisarPropuestas();
        // También la propuesta de repaso pendiente; las tarjetas ya aceptadas son del usuario y se quedan.
        if (pedido.grabacion === null) repaso.borrarPropuestas();
        else repaso.borrarPropuestaDe(pedido.grabacion);
        revisarRepaso();
      }
      registrar(`grabaciones: ${borradas} ${pedido.que === "audio" ? "audio(s)" : "transcripción(es)"} borrado(s)`);
      return { datos: { borradas } };
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
  // Los secretos que la app saca del Llavero: solo en memoria, sin respuesta y sin registrar nada.
  if (aplicarPedidoSecretos(pedido)) return;
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
