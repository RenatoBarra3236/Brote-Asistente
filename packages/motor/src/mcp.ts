// Servidor MCP de gastos: le da al agente (OpenClaw → Claude Code) herramientas para anotar,
// listar y resumir los gastos, sobre la misma base que usa el motor de comandos. Habla MCP
// por la entrada y salida estándar (JSON-RPC 2.0, un mensaje por línea), sin dependencias.
//
// Registro en OpenClaw (una vez):
//   openclaw mcp add gastos --command node --arg <ruta del repo>/packages/motor/src/mcp.ts
//
// Cuándo usar estas herramientas y cuándo proponer plantillas lo explica la skill
// (packages/motor/skill/gastos/SKILL.md), no los resultados de las herramientas: una
// instrucción dentro de un resultado se parece a una inyección y el agente hace bien en ignorarla.
//
// No incluye borrar: el agente puede anotar y leer, pero borrar queda en manos del usuario
// ("borra el último gasto" lo resuelve el motor, sin IA).

import { createInterface } from "node:readline";
import { proponerPlantilla } from "./aprendizaje.ts";
import { CATEGORIAS, categoriaDe, type Categoria } from "./categorias.ts";
import { Gastos, RUTA_BASE } from "./gastos.ts";
import { Motor } from "./motor.ts";
import { PLANTILLAS_BASE } from "./plantillas.ts";
import { POMODORO, Temporizadores } from "./temporizadores.ts";
import { describirDuracion, reloj } from "./tiempo.ts";
import { MedidorCpu, describirEquipo, formatearBytes, leerBateria, leerDisco, leerMemoria, procesoMasPesado, procesosPesados } from "./sistema.ts";
import { rangoDe, type Rango } from "./periodos.ts";
import { combinar, crearEventoMacAhora, describirCreacion, descargarIcal, eventosDeIcal, leerCalendarioMac, leerUrlIcal, proximos, type EventoCalendario, type NuevoEvento, type ResultadoCreacion } from "./calendario.ts";
import { aulaSoloEnLlavero, describirErrorAula, leerAula, leerConfigAula, type Entrega } from "./aula.ts";
import { describirSesiones, pedirAlPuente, pedirSesiones, type SesionClaude } from "./programador.ts";
import { ACCIONES_MUSICA, controlarMusica, describirMusica, leerMusica, type AccionMusica, type EstadoMusica } from "./musica.ts";
import { carpetaDescargas, formatearTamano, listarCarpeta, recientes } from "./descargas.ts";
import { formatearMonto, normalizar } from "./texto.ts";
import { MENSAJE_APAGADA_MCP, funcionDeHerramienta } from "./funciones.ts";
import { FuncionesVigiladas } from "./funciones-archivo.ts";
import { vigente, type LecturaPlan, type VentanaPlan } from "./plan.ts";
import { tokensDe, type ResumenPeriodo, type ResumenUso, type TotalUso } from "./uso.ts";
import { leerPlanGuardado } from "./uso-archivo.ts";

/** Lo que el usuario prendió o apagó en Configurar Brote → Funciones (se relee cuando cambia). */
const funciones = new FuncionesVigiladas();

const VERSION_PROTOCOLO = "2025-06-18";
const MONTO_MAXIMO = 100_000_000;
const FECHA = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };

const HERRAMIENTAS = [
  {
    name: "gastos_anotar",
    description:
      "Anota un gasto del usuario en pesos chilenos (CLP, sin decimales). En Chile 1 luca = 1.000 pesos y " +
      "1 palo = 1.000.000. Si no se indica la categoría, se deduce de la descripción. La fecha por defecto es hoy. " +
      "Antes de usar las herramientas de gastos, invoca la skill «gastos» (tiene las instrucciones del usuario " +
      "para este servidor, incluido cómo enseñar al motor del personaje).",
    inputSchema: {
      type: "object",
      properties: {
        monto: { type: "integer", minimum: 1, maximum: MONTO_MAXIMO, description: "Monto en pesos chilenos" },
        descripcion: { type: "string", maxLength: 200, description: "En qué se gastó, por ejemplo «almuerzo»" },
        categoria: { type: "string", enum: CATEGORIAS },
        fecha: { ...FECHA, description: "Fecha del gasto (AAAA-MM-DD)" },
      },
      required: ["monto"],
      additionalProperties: false,
    },
    annotations: { title: "Anotar gasto", readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "gastos_listar",
    description: "Lista los gastos del usuario, del más reciente al más antiguo. Sin fechas, los últimos de todos.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { ...FECHA, description: "Primer día, incluido (AAAA-MM-DD)" },
        hasta: { ...FECHA, description: "Último día, incluido (AAAA-MM-DD)" },
        limite: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
    annotations: { title: "Listar gastos", readOnlyHint: true },
  },
  {
    name: "gastos_resumen",
    description:
      "Total de gastos y desglose por categoría en un rango de fechas. Sin fechas, el mes en curso. " +
      `Categorías: ${CATEGORIAS.join(", ")}.`,
    inputSchema: {
      type: "object",
      properties: {
        desde: { ...FECHA, description: "Primer día, incluido (AAAA-MM-DD)" },
        hasta: { ...FECHA, description: "Último día, incluido (AAAA-MM-DD)" },
      },
      additionalProperties: false,
    },
    annotations: { title: "Resumen de gastos", readOnlyHint: true },
  },
  {
    name: "gastos_presupuesto",
    description:
      "El presupuesto mensual del usuario (si puso uno) y cómo va: lo gastado este mes, cuánto le queda, los días que " +
      "faltan y cuánto puede gastar hoy. Solo lectura: el presupuesto lo pone el usuario en Brote (Configurar Brote o " +
      "diciendo «mi presupuesto es 200 lucas»).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Presupuesto del mes", readOnlyHint: true },
  },
  {
    name: "temporizador_crear",
    description:
      "Crea un temporizador, un recordatorio (con etiqueta: «sacar la ropa») o un pomodoro de estudio. Brote lo " +
      "muestra en la isla con cuenta regresiva y avisa al terminar. Un pomodoro alterna estudio y descanso solo " +
      `(${POMODORO.descansoMs / 60_000} min, y ${POMODORO.descansoLargoMs / 60_000} cada ${POMODORO.bloquesHastaElLargo} bloques); solo hay uno a la vez.`,
    inputSchema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["temporizador", "pomodoro"] },
        minutos: { type: "number", minimum: 0.1, maximum: 720, description: "Duración (en un pomodoro, de cada bloque de estudio; por defecto 25)" },
        etiqueta: { type: "string", maxLength: 120, description: "Qué recordar, o qué se estudia en el pomodoro" },
      },
      required: ["tipo"],
      additionalProperties: false,
    },
    annotations: { title: "Crear temporizador", readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "temporizador_listar",
    description: "Los temporizadores, recordatorios y el pomodoro que están corriendo, con cuánto les queda.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Listar temporizadores", readOnlyHint: true },
  },
  {
    name: "temporizador_cancelar",
    description: "Cancela un temporizador por su id, o todos los de un tipo, o todos si no se indica nada.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        tipo: { type: "string", enum: ["temporizador", "pomodoro"] },
      },
      additionalProperties: false,
    },
    annotations: { title: "Cancelar temporizador", readOnlyHint: false, destructiveHint: true },
  },
  {
    name: "equipo_estado",
    description:
      "El estado del computador del usuario: batería (y si está enchufado), uso de CPU, memoria RAM en uso, los " +
      "programas que más memoria y CPU usan, y el espacio libre en disco. Úsala (en vez de comandos de terminal) si " +
      "pregunta por su computador, si anda lento o antes de algo pesado.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Estado del computador", readOnlyHint: true },
  },
  {
    name: "descargas_recientes",
    description:
      "Las últimas descargas terminadas del usuario (su carpeta de Descargas): nombre, tamaño y fecha, de la más " +
      "nueva a la más vieja. Úsala si pregunta qué descargó o por un archivo que acaba de bajar. No abre ni lee los archivos.",
    inputSchema: {
      type: "object",
      properties: { limite: { type: "integer", minimum: 1, maximum: 30, default: 10 } },
      additionalProperties: false,
    },
    annotations: { title: "Descargas recientes", readOnlyHint: true },
  },
  {
    name: "musica_estado",
    description:
      "Qué música está sonando en el computador del usuario (canción, artista, app y si está en pausa). En macOS mira " +
      "Spotify y Música solo si ya están abiertos; en Windows, el reproductor que use los controles de medios.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Música: qué suena", readOnlyHint: true },
  },
  {
    name: "musica_control",
    description:
      "Controla la música que ya está abierta: play, pausa, play-pausa, siguiente o anterior. Nunca abre una app de " +
      "música; si no hay ninguna abierta, no hace nada. Úsala, por ejemplo, para pausar la música al empezar un pomodoro si el usuario lo pide.",
    inputSchema: {
      type: "object",
      properties: { accion: { type: "string", enum: ACCIONES_MUSICA } },
      required: ["accion"],
      additionalProperties: false,
    },
    annotations: { title: "Música: controlar", readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "calendario_proximos",
    description:
      "Los eventos del calendario del usuario en las próximas horas (por defecto 24, máximo 72): título, lugar, inicio y " +
      "fin en su hora local, y si es de día completo. Lee el Calendario del Mac y/o la dirección iCal que configuró en Brote. " +
      "Úsala para planificar su estudio alrededor de sus clases o si pregunta qué tiene.",
    inputSchema: {
      type: "object",
      properties: { horas: { type: "integer", minimum: 1, maximum: 72, default: 24 } },
      additionalProperties: false,
    },
    annotations: { title: "Calendario: próximos eventos", readOnlyHint: true },
  },
  {
    name: "calendario_crear",
    description:
      "Crea un evento en el Calendario del Mac del usuario (en su calendario por defecto, que puede estar sincronizado " +
      "con iCloud o Google). Úsala SIEMPRE en vez de osascript u otros comandos de terminal. La hora es la local del " +
      "usuario. En Windows o sin permiso de Calendario no se puede: ofrécele un recordatorio con temporizador_crear.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", minLength: 1, maxLength: 200 },
        inicio: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$", description: "Inicio en hora local: AAAA-MM-DD HH:MM" },
        minutos: { type: "integer", minimum: 1, maximum: 1440, default: 60, description: "Duración" },
        lugar: { type: "string", maxLength: 200 },
      },
      required: ["titulo", "inicio"],
      additionalProperties: false,
    },
    annotations: { title: "Calendario: crear evento", readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "programador_sesiones",
    description:
      "Las sesiones de Claude Code que el usuario tiene abiertas en su computador (no la tuya): proyecto y qué está " +
      "haciendo cada una (\"Editando lib.rs…\", \"Esperando tu respuesta\"). Solo funciona si instaló el modo programador de Brote.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Sesiones de Claude Code", readOnlyHint: true },
  },
  {
    name: "aula_entregas",
    description:
      "Las entregas del usuario en su aula virtual (Canvas o Moodle, solo lectura): curso, título, fecha límite en su hora " +
      "local y si ya la entregó. Por defecto solo las pendientes de los próximos 14 días. Úsala para planificar su estudio " +
      "o si pregunta qué tiene que entregar. No puede entregar nada ni ver notas.",
    inputSchema: {
      type: "object",
      properties: {
        dias: { type: "integer", minimum: 1, maximum: 60, default: 14 },
        incluirEntregadas: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
    annotations: { title: "Aula: entregas", readOnlyHint: true },
  },
  {
    name: "claude_uso",
    description:
      "El uso del plan de Claude del usuario (Pro o Max): el % de su sesión de 5 h y de la semana, con la hora en que se " +
      "reinicia cada una (llega por la statusline de Claude Code, así que puede tener unos minutos), y los tokens de hoy y " +
      "de los últimos 7 días con su valor API en USD (lo que costaría pagando por token; el usuario no paga eso, paga su " +
      "plan), separados entre Brote y las sesiones de Claude Code del usuario. Solo lectura.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { title: "Uso del plan de Claude", readOnlyHint: true },
  },
  {
    name: "motor_proponer_plantilla",
    description:
      "Propone una plantilla para que el motor de comandos entienda, SIN IA, frases como la del usuario. " +
      "Úsala UNA vez, justo después de resolver con gastos_anotar, gastos_resumen o gastos_listar un mensaje " +
      "del usuario que era un comando simple (no una conversación). El usuario decide en la isla si la acepta.\n" +
      "Formato (en minúsculas y sin tildes): palabra = debe aparecer tal cual; [a b] = opcional; " +
      "[a|b] = opcional, una de varias; (a|b c) = una de varias; ranuras {monto}, {cosa}, {periodo}, {categoria}. " +
      "Periodos válidos: hoy, ayer, esta semana, la semana pasada, este mes, el mes pasado, este ano. " +
      `Categorías: ${CATEGORIAS.join(", ")}.\n` +
      "Ejemplo: para «paque luca y media de micro» → patron «(pague|paque|pago) {monto} (de|en) {cosa}», " +
      "intencion «registrar-gasto». Incluye la variante con error de tipeo si la hubo. Si la herramienta " +
      "rechaza la propuesta, puedes corregirla una vez según el motivo; si no, déjalo.",
    inputSchema: {
      type: "object",
      properties: {
        ejemplo: { type: "string", maxLength: 300, description: "El mensaje del usuario, textual" },
        patron: { type: "string", maxLength: 300 },
        intencion: {
          type: "string",
          enum: ["registrar-gasto", "consultar-gastos", "ultimos-gastos", "borrar-ultimo-gasto"],
        },
      },
      required: ["ejemplo", "patron", "intencion"],
      additionalProperties: false,
    },
    annotations: { title: "Proponer plantilla", readOnlyHint: false, destructiveHint: false },
  },
];

class ErrorDeUso extends Error {}


function leerFecha(texto: unknown, nombre: string): Date | undefined {
  if (texto === undefined) return undefined;
  const partes = typeof texto === "string" ? texto.match(/^(\d{4})-(\d{2})-(\d{2})$/) : null;
  const fecha = partes ? new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])) : null;
  if (!fecha || fecha.getMonth() !== Number(partes![2]) - 1) throw new ErrorDeUso(`«${nombre}» debe ser una fecha AAAA-MM-DD`);
  return fecha;
}

function fechaIso(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/** [desde, hasta] con días completos e incluidos; sin fechas, `porDefecto`. */
function leerRango(args: any, porDefecto: Rango | undefined): Rango | undefined {
  const desde = leerFecha(args.desde, "desde");
  const hasta = leerFecha(args.hasta, "hasta");
  if (!desde && !hasta) return porDefecto;
  return {
    desde: desde ?? new Date(0),
    hasta: hasta ? new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate() + 1) : new Date(8.64e15),
  };
}

/** "2026-10-05 08:30" en la hora local del usuario. */
function fechaHora(ms: number): string {
  const d = new Date(ms);
  return `${fechaIso(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Las herramientas que necesitan esperar algo (el puente de Brote, el iCal, osascript). */
async function usarEsperando(nombre: string, args: any): Promise<string> {
  switch (nombre) {
    case "calendario_proximos": {
      const horas = Number.isInteger(args.horas) ? Math.min(Math.max(args.horas, 1), 72) : 24;
      const ahora = Date.now();
      const deBrote = await pedirAlPuente("/consulta", { tipo: "calendario" });
      let todos: EventoCalendario[];
      if (deBrote) {
        if (!Array.isArray(deBrote.eventos)) return SIN_CALENDARIO;
        todos = deBrote.eventos;
      } else {
        // Brote no está abierto: se lee aquí (el Calendario del Mac solo si este proceso tiene permiso).
        const mac = await leerCalendarioMac(ahora);
        const url = leerUrlIcal();
        const ics = url ? await descargarIcal(url) : null;
        if (!mac?.eventos && !url) return SIN_CALENDARIO;
        if (!mac?.eventos && ics === null) return "No pude leer el calendario del usuario (¿sin internet?).";
        todos = combinar(mac?.eventos ?? null, ics ? eventosDeIcal(ics, ahora) : null);
      }
      const eventos = proximos(todos, ahora, horas);
      return JSON.stringify({
        ahora: fechaHora(ahora),
        eventos: eventos.map((e) => ({
          titulo: e.titulo,
          lugar: e.lugar,
          inicio: e.todoElDia ? fechaIso(new Date(e.inicioMs)) : fechaHora(e.inicioMs),
          fin: e.todoElDia ? null : fechaHora(e.finMs),
          todoElDia: e.todoElDia,
        })),
      });
    }
    case "calendario_crear": {
      const evento = leerNuevoEvento(args);
      // Lo crea Brote, que tiene el permiso de Calendario; si no está abierto, se intenta aquí.
      const deBrote = await pedirAlPuente("/consulta", { tipo: "calendario-crear", evento }, { limiteMs: 20_000 });
      const resultado: ResultadoCreacion = deBrote?.resultado ?? crearEventoMacAhora(evento);
      const texto = describirCreacion(evento, resultado, Date.now());
      if (!resultado.ok) throw new ErrorDeUso(texto);
      return texto;
    }
    case "musica_estado": {
      const estado = await musicaActual();
      return estado === undefined ? "No pude saber qué suena (en este sistema no se puede, o falta el permiso)." : describirMusica(estado);
    }
    case "musica_control": {
      if (!ACCIONES_MUSICA.includes(args.accion)) throw new ErrorDeUso(`«accion» debe ser una de: ${ACCIONES_MUSICA.join(", ")}`);
      const accion = args.accion as AccionMusica;
      const deBrote = await pedirAlPuente("/consulta", { tipo: "musica-control", accion });
      let estado: EstadoMusica | null | undefined;
      let hecho: boolean;
      if (deBrote) {
        estado = deBrote.musica ?? null;
        hecho = deBrote.hecho === true;
      } else {
        estado = (await leerMusica())?.estado ?? null;
        hecho = estado ? await controlarMusica(accion, estado) : false;
      }
      if (!estado) return "No hay música abierta (no abro apps de música).";
      return hecho ? `Hecho: ${accion} en ${estado.app}.` : "No pude controlar la música.";
    }
    case "aula_entregas": {
      const dias = Number.isInteger(args.dias) ? Math.min(Math.max(args.dias, 1), 60) : 14;
      const ahora = Date.now();
      // Lo lee Brote (que ya lo tiene, sin volver a pedirlo al campus); si no está abierto, se lee aquí.
      const deBrote = await pedirAlPuente("/consulta", { tipo: "aula" }, { limiteMs: 25_000 });
      let entregas: Entrega[];
      if (deBrote) {
        if (deBrote.error) return describirErrorAula(deBrote.error);
        if (!Array.isArray(deBrote.entregas)) return SIN_AULA;
        entregas = deBrote.entregas;
      } else {
        const config = leerConfigAula();
        if (!config) return aulaSoloEnLlavero() ? AULA_EN_LLAVERO : SIN_AULA;
        const lectura = await leerAula(config, ahora);
        if ("error" in lectura) return describirErrorAula(lectura.error);
        entregas = lectura.entregas;
      }
      const lista = entregas.filter(
        (e) => e.entregaMs <= ahora + dias * 86_400_000 && (args.incluirEntregadas === true ? e.entregaMs > ahora - 7 * 86_400_000 : !e.entregada && e.entregaMs > ahora),
      );
      return JSON.stringify({
        ahora: fechaHora(ahora),
        entregas: lista.map((e) => ({ curso: e.curso, titulo: e.titulo, vence: fechaHora(e.entregaMs), entregada: e.entregada, url: e.url })),
      });
    }
    case "claude_uso": {
      const ahora = Date.now();
      // Los tokens los calcula Brote (lee las transcripciones de forma incremental); sin Brote, solo el plan guardado.
      const deBrote = await pedirAlPuente("/consulta", { tipo: "uso" }, { limiteMs: 10_000 });
      const plan: LecturaPlan | null = vigente(deBrote ? (deBrote.plan ?? null) : leerPlanGuardado(undefined, ahora).lectura, ahora);
      const resumen: ResumenUso | null = deBrote?.resumen ?? null;
      const ventana = (v: VentanaPlan | null) => (v ? { porcentajeUsado: Math.round(v.porcentaje), seReinicia: fechaHora(v.reiniciaMs) } : null);
      return JSON.stringify({
        ahora: fechaHora(ahora),
        plan: plan ? { sesion5h: ventana(plan.sesion), semana: ventana(plan.semana), actualizado: fechaHora(plan.actualizadoMs) } : null,
        ...(plan ? {} : { planNoDisponible: "Brote todavía no recibe el % del plan (llega por la statusline de Claude Code)." }),
        tokens: resumen ? { hoy: periodoUso(resumen.hoy), ultimos7Dias: periodoUso(resumen.semana) } : null,
        ...(resumen ? {} : { tokensNoDisponibles: "Brote no está abierto o todavía no calcula los tokens." }),
      });
    }
    case "programador_sesiones": {
      const sesiones = await pedirSesiones();
      if (!sesiones) return "No veo las sesiones: Brote no está abierto o el modo programador no está instalado (🌱 → Configurar Brote).";
      return describirSesiones(sesiones as SesionClaude[]);
    }
    default:
      throw new ErrorDeUso(`Herramienta desconocida: ${nombre}`);
  }
}

/** Un total de uso para el agente: tokens por tipo y valor API redondeado a centavos. */
function totalUso(t: TotalUso) {
  return {
    tokens: tokensDe(t),
    entrada: t.entrada,
    salida: t.salida,
    cache: t.cache,
    valorApiUsd: Math.round(t.usd * 100) / 100,
    ...(t.sinPrecio > 0 ? { tokensSinPrecio: t.sinPrecio } : {}),
  };
}

function periodoUso(p: ResumenPeriodo) {
  return {
    total: totalUso(p.total),
    brote: totalUso(p.brote),
    sesionesDelUsuario: totalUso(p.tuyas),
    porModelo: p.porModelo.map((m) => ({ modelo: m.nombre, ...totalUso(m.total) })),
    proyectosQueMasGastan: p.proyectos.map((x) => ({ proyecto: x.nombre, ...totalUso(x.total) })),
  };
}

const ESPERAN = new Set(["claude_uso", "aula_entregas", "calendario_proximos", "calendario_crear", "programador_sesiones", "musica_estado", "musica_control"]);

/** Los argumentos de `calendario_crear` → el evento, o un error de uso. */
function leerNuevoEvento(args: any): NuevoEvento {
  const partes = typeof args.inicio === "string" ? args.inicio.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/) : null;
  const inicio = partes ? new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]), Number(partes[4]), Number(partes[5])) : null;
  if (!inicio || inicio.getMonth() !== Number(partes![2]) - 1 || inicio.getHours() !== Number(partes![4])) {
    throw new ErrorDeUso("«inicio» debe ser una fecha y hora válidas: AAAA-MM-DD HH:MM");
  }
  if (typeof args.titulo !== "string" || !args.titulo.trim()) throw new ErrorDeUso("Falta «titulo»");
  const minutos = Number.isInteger(args.minutos) ? args.minutos : 60;
  if (minutos < 1 || minutos > 1440) throw new ErrorDeUso("«minutos» debe estar entre 1 y 1440");
  return {
    titulo: args.titulo.trim().slice(0, 200),
    lugar: typeof args.lugar === "string" && args.lugar.trim() ? args.lugar.trim().slice(0, 200) : null,
    inicioMs: inicio.getTime(),
    finMs: inicio.getTime() + minutos * 60_000,
  };
}

const AULA_EN_LLAVERO = "El aula está conectada, pero su token está guardado en el Llavero y solo la app Brote puede leerlo. Brote no está abierto: el usuario debe abrirlo para ver las entregas.";
const SIN_AULA = "No hay aula conectada. El usuario puede conectar Canvas o Moodle en Brote: 🌱 → Configurar Brote.";

const SIN_CALENDARIO =
  "No hay calendario conectado. El usuario puede conectarlo en Brote: 🌱 → Configurar Brote (Calendario del Mac o la dirección iCal de Google Calendar).";

/** Lo que suena según Brote (que tiene el permiso de Automatización) o, si no está abierto, leído aquí. `undefined` si no se pudo saber. */
async function musicaActual(): Promise<EstadoMusica | null | undefined> {
  const deBrote = await pedirAlPuente("/consulta", { tipo: "musica-estado" });
  if (deBrote) return deBrote.musica ?? null;
  const lectura = await leerMusica();
  return lectura ? lectura.estado : undefined;
}

function usar(gastos: Gastos, nombre: string, args: any): string {
  switch (nombre) {
    case "gastos_anotar": {
      const monto = args.monto;
      if (!Number.isInteger(monto) || monto < 1 || monto > MONTO_MAXIMO) {
        throw new ErrorDeUso(`«monto» debe ser un entero entre 1 y ${MONTO_MAXIMO}`);
      }
      const descripcion = typeof args.descripcion === "string" && args.descripcion.trim() ? args.descripcion.trim().slice(0, 200) : null;
      if (args.categoria !== undefined && !CATEGORIAS.includes(args.categoria)) {
        throw new ErrorDeUso(`«categoria» debe ser una de: ${CATEGORIAS.join(", ")}`);
      }
      const categoria: Categoria = args.categoria ?? (descripcion ? categoriaDe(normalizar(descripcion)) : "otros");
      const ahora = new Date();
      const fecha = leerFecha(args.fecha, "fecha") ?? ahora;
      const gasto = gastos.agregar({ monto, categoria, descripcion, fecha });
      const mes = gastos.total(rangoDe("este mes", ahora));
      const que = descripcion ? ` en ${descripcion}` : "";
      return (
        `Anotado (id ${gasto.id}): ${formatearMonto(monto)}${que} (${categoria}) el ${fechaIso(fecha)}. ` +
        `Este mes van ${formatearMonto(mes.total)}.`
      );
    }
    case "gastos_listar": {
      const limite = Number.isInteger(args.limite) ? Math.min(Math.max(args.limite, 1), 100) : 20;
      const lista = gastos.ultimos(limite, leerRango(args, undefined)).map((g) => ({
        id: g.id,
        fecha: fechaIso(g.fecha),
        monto: g.monto,
        categoria: g.categoria,
        descripcion: g.descripcion,
      }));
      return JSON.stringify({ moneda: "CLP", gastos: lista });
    }
    case "gastos_resumen": {
      const rango = leerRango(args, rangoDe("este mes", new Date()))!;
      const { total, cantidad } = gastos.total(rango);
      const hasta = new Date(rango.hasta.getTime() - 1);
      return JSON.stringify({
        moneda: "CLP",
        desde: rango.desde.getTime() > 0 ? fechaIso(rango.desde) : null,
        hasta: rango.hasta.getTime() < 8.64e15 ? fechaIso(hasta) : null,
        total,
        cantidad,
        porCategoria: gastos.porCategoria(rango),
      });
    }
    case "gastos_presupuesto": {
      const p = new Motor(gastos).estadoPresupuesto();
      if (!p) return JSON.stringify({ moneda: "CLP", presupuesto: null, nota: "El usuario no tiene presupuesto mensual puesto." });
      return JSON.stringify({
        moneda: "CLP",
        presupuestoMensual: p.monto,
        gastadoEsteMes: p.gastado,
        porcentajeUsado: p.porcentaje,
        queda: p.queda,
        diasQueFaltan: p.diasQuedan,
        porDia: p.porDia,
        puedeGastarHoy: p.puedesHoy,
      });
    }
    case "temporizador_crear": {
      const temporizadores = new Temporizadores(gastos);
      const etiqueta = typeof args.etiqueta === "string" && args.etiqueta.trim() ? args.etiqueta.trim().slice(0, 120) : null;
      if (args.tipo !== "temporizador" && args.tipo !== "pomodoro") throw new ErrorDeUso("«tipo» debe ser temporizador o pomodoro");
      const minutos = args.minutos ?? (args.tipo === "pomodoro" ? POMODORO.estudioMs / 60_000 : undefined);
      if (typeof minutos !== "number" || !(minutos >= 0.1 && minutos <= 720)) {
        throw new ErrorDeUso("«minutos» debe ser un número entre 0.1 y 720");
      }
      const duracion = Math.round(minutos * 60_000);
      const creado =
        args.tipo === "pomodoro"
          ? temporizadores.iniciarPomodoro(duracion, etiqueta, new Date())
          : temporizadores.crear(duracion, etiqueta, new Date());
      return `Listo (id ${creado.id}): ${args.tipo} de ${describirDuracion(duracion)}${etiqueta ? ` — ${etiqueta}` : ""}. Brote lo muestra en la isla.`;
    }
    case "temporizador_listar": {
      const ahora = Date.now();
      return JSON.stringify({
        temporizadores: new Temporizadores(gastos).activos().map((t) => ({
          id: t.id,
          tipo: t.tipo,
          etiqueta: t.etiqueta,
          fase: t.fase,
          bloquesDeEstudio: t.tipo === "pomodoro" ? t.ciclos : undefined,
          queda: reloj(t.finMs - ahora),
        })),
      });
    }
    case "temporizador_cancelar": {
      const cuantos = new Temporizadores(gastos).cancelar({
        id: Number.isInteger(args.id) ? args.id : undefined,
        tipo: args.tipo === "temporizador" || args.tipo === "pomodoro" ? args.tipo : undefined,
      });
      return cuantos === 0 ? "No había nada que cancelar." : `Cancelados: ${cuantos}.`;
    }
    case "equipo_estado": {
      // La CPU se mide comparando dos muestras: se espera medio segundo entre ambas.
      const medidor = new MedidorCpu();
      medidor.medir();
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
      const lectura = { bateria: leerBateria(), cpu: medidor.medir(), disco: leerDisco(), procesoPesado: procesoMasPesado(), memoria: leerMemoria() };
      const pesados = procesosPesados(6)
        .map((p) => `${p.nombre}: ${formatearBytes(p.memoria)}${p.cpu !== null ? `, CPU ${Math.round(p.cpu)}%` : ""}`)
        .join("; ");
      return [
        describirEquipo(lectura),
        lectura.procesoPesado ? `El que más CPU usa: ${lectura.procesoPesado}` : "",
        pesados ? `Los que más memoria usan: ${pesados}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "descargas_recientes": {
      const limite = Number.isInteger(args.limite) ? Math.min(Math.max(args.limite, 1), 30) : 10;
      const listado = listarCarpeta(carpetaDescargas());
      if (!listado) return "No pude leer la carpeta de Descargas.";
      return JSON.stringify({
        descargas: recientes(listado, carpetaDescargas(), limite).map((d) => ({
          nombre: d.nombre,
          tamano: formatearTamano(d.tamano),
          bytes: d.tamano,
          fecha: new Date(d.fechaMs).toISOString(),
        })),
      });
    }
    case "motor_proponer_plantilla": {
      if (typeof args.patron !== "string" || typeof args.ejemplo !== "string" || typeof args.intencion !== "string") {
        throw new ErrorDeUso("Faltan «patron», «ejemplo» o «intencion»");
      }
      const motor = new Motor(gastos, { plantillas: () => [...PLANTILLAS_BASE, ...gastos.plantillasActivas()] });
      const revision = proponerPlantilla(gastos, motor, args, new Date());
      if (!revision.ok) throw new ErrorDeUso(`Propuesta rechazada: ${revision.motivo}`);
      return "Propuesta guardada. Al terminar tu respuesta, el usuario decidirá en la isla si la aprendo.";
    }
    default:
      throw new ErrorDeUso(`Herramienta desconocida: ${nombre}`);
  }
}

/**
 * Atiende un mensaje JSON-RPC. Devuelve la respuesta, o `null` si era una notificación. Las
 * herramientas que esperan algo (el calendario, la música, el puente) devuelven una promesa de la respuesta.
 */
export function atender(gastos: Gastos, mensaje: any): object | null | Promise<object> {
  const { id, method, params } = mensaje ?? {};
  if (id === undefined || id === null) return null;
  const responder = (result: object) => ({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      return responder({
        protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : VERSION_PROTOCOLO,
        capabilities: { tools: {} },
        serverInfo: { name: "gastos", version: "0.0.0" },
        instructions:
          "Gastos personales del usuario (estudiante en Chile), en pesos chilenos. Úsalas cuando hable de " +
          "plata, gastos o presupuesto. Son datos privados: no los compartas fuera de la conversación.",
      });
    case "ping":
      return responder({});
    case "tools/list":
      return responder({ tools: HERRAMIENTAS });
    case "tools/call": {
      // Una función apagada no hace nada (ni lee la música, ni el calendario, ni el disco).
      const funcion = funcionDeHerramienta(String(params?.name));
      if (funcion && !funciones.activa(funcion)) return responder({ content: [{ type: "text", text: MENSAJE_APAGADA_MCP }] });
      if (ESPERAN.has(String(params?.name))) {
        return usarEsperando(String(params?.name), params?.arguments ?? {}).then(
          (texto) => responder({ content: [{ type: "text", text: texto }] }),
          (error) => {
            const motivo = error instanceof ErrorDeUso ? error.message : "No pude completar la consulta";
            if (!(error instanceof ErrorDeUso)) process.stderr.write(`[gastos] ${String(error)}\n`);
            return responder({ content: [{ type: "text", text: motivo }], isError: true });
          },
        );
      }
      try {
        const texto = usar(gastos, String(params?.name), params?.arguments ?? {});
        return responder({ content: [{ type: "text", text: texto }] });
      } catch (error) {
        const motivo = error instanceof ErrorDeUso ? error.message : "No pude acceder a los gastos";
        if (!(error instanceof ErrorDeUso)) process.stderr.write(`[gastos] ${String(error)}\n`);
        return responder({ content: [{ type: "text", text: motivo }], isError: true });
      }
    }
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Método no soportado: ${method}` } };
  }
}

// Solo al ejecutarlo directamente (las pruebas importan `atender`).
if (import.meta.main) {
  const gastos = new Gastos(process.env.ASISTENTE_GASTOS_DB ?? RUTA_BASE);
  const entrada = createInterface({ input: process.stdin });
  entrada.on("line", (linea) => {
    let mensaje: unknown;
    try {
      mensaje = JSON.parse(linea);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } })}\n`);
      return;
    }
    void Promise.resolve(atender(gastos, mensaje)).then((respuesta) => {
      if (respuesta) process.stdout.write(`${JSON.stringify(respuesta)}\n`);
    });
  });
  entrada.on("close", () => {
    gastos.cerrar();
    process.exit(0);
  });
}
