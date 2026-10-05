// El contenido de la isla abierta: elementos HTML sobre el lienzo, en tres pestañas.
//
//   Brote   tarjetas con lo que pasa ahora (temporizadores, próximo evento, entregas, música,
//           descargas, Claude Code) y la conversación. Al conversar, la respuesta (y los permisos o
//           propuestas) ocupa el espacio y las tarjetas se encogen a una fila de píldoras; al terminar
//           la lectura, vuelven.
//   Plata   los gastos del mes (contra el mes pasado a la misma altura), cuánto puedes gastar hoy con tu
//           presupuesto, los últimos 7 días, las categorías, los últimos movimientos, un descubrimiento
//           sin IA y botones de un toque con los gastos más frecuentes (función "gastos")
//   Claude  el uso del plan (sesión de 5 h y semana, tokens de hoy y 7 días con su valor API, precios)
//           y las sesiones de Claude Code del usuario (modo programador) con sus pasos y permisos
//   Equipo  batería, CPU, memoria y disco
//
// Las pestañas van en la fila del notch (a sus costados) y el contenido a la derecha de Brote,
// que lo dibuja la isla. Brote cambia solo a la pestaña que importa: a Brote cuando trabaja o pide
// permiso, a Claude cuando una sesión pide permiso, y vuelve a Brote si la isla pasa un rato cerrada.
// Qué tarjetas se ven y en qué orden se elige en Configurar Brote → Funciones (funciones.json).

import { GRABACION_INACTIVA, OPCIONES_AVISO, esErrorDePermisoMicrofono, TEXTO_PREGUNTA_AVISO, tiempoGrabado, type AvisoAPresentes, type EstadoGrabacion } from "./agente/grabaciones";
import type { Agente } from "./agente/agente";
import { ocupado, type Conversacion } from "./agente/conversacion";
import { agregarPaso, cuandoEmpieza, cuentaRegresiva, fechaLarga, gigas, saludo, tamanoCorto, venceEn } from "./agente/formato";
import { analizarMarkdown, type Fragmento } from "./agente/markdown";
import type {
  AccionMusica,
  Descarga,
  DescargaEnCurso,
  EstadoCalendario,
  EstadoAula,
  EstadoConexion,
  EstadoMusica,
  EstadoProgramador,
  LecturaEquipo,
  SesionClaude,
  TemporizadorActivo,
} from "./agente/puente";
import { IDS_TARJETAS, activasDePreset, type ConfigFunciones, type IdTarjeta } from "./agente/funciones";
import { Novedades, textoCorto, type Novedad, type TipoNovedad } from "./agente/novedades";
import { pestanaSugerida, tarjetasVisibles, textoPildora, type DatosPildoras, type Pestana } from "./agente/tarjetas";
import { barrasPlan, filasTokens, precioCorto, type EstadoUso } from "./agente/uso";
import {
  columnasTodos,
  equipoTermino,
  globoDe,
  mascotasEnEscena,
  nombreConIA,
  pasosVisibles,
  terminadosALaMano,
  visualDe,
  type PasoVisible,
  type Trabajando,
  type Visual,
} from "./agente/especialistas";
import type { Lugar } from "./mascotas";
import { destinoDePropuesta, etiquetaDeTipo, fechaDePropuesta, fechaParaEditar, tituloDeTarjeta, type PropuestaAgenda } from "./agente/propuestas-agenda";
import {
  HEX_RAMO,
  TEXTO_SIN_RAMOS,
  aliasParaEditar,
  cuandoClase,
  cuandoVence,
  explicarFichaVacia,
  leerAlias,
  resumenDeFicha,
  textoSugerencia,
  type EstadoEstudio,
  type FichaRamo,
} from "./agente/estudio";
import { HEX_SEMAFORO, leerCampoNota, leerCampoPeso, posicionEnBarra, formatearNota, resumenNotas, semaforoDe, textoExamenFicha, textoMeta, textoNecesaria } from "./agente/notas";
import { estadoDelItem, explicarAgenda, horaDelItem, tituloDelDia, type EstadoAgenda } from "./agente/agenda";
import { barrasSemana, cuandoMovimiento, formatearMonto, montoCorto, textoFrecuente, textoPuedesHoy, textoVariacion, type EstadoPlata } from "./agente/plata";
import { icono, type NombreIcono } from "./iconos";
import { copiarTexto } from "./copiar";
import {
  TEXTO_ESTADO_AUDIO,
  duracionDeAudio,
  estadoDeAudio,
  textoAviso,
  textoBotonGrabar,
  textoCopiado,
  textoDuracion,
  textoFecha,
  textoTamano,
  textoVacioGrabar,
  type FaseTranscripcion,
  type Grabaciones,
} from "./agente/grabaciones-memoria";

export { cuentaRegresiva } from "./agente/formato";
export type { Pestana } from "./agente/tarjetas";

/** Cuánto se destaca un aviso de Brote (temporizador, batería…) (ms). */
const AVISO_DESTACADO_MS = 12_000;

/** Cuánto sigue abierta la isla después de una respuesta, para alcanzar a leerla (ms). */
const LECTURA_MIN = 4000;
const LECTURA_MAX = 15000;
const LECTURA_POR_LETRA = 45;

/** Si la isla pasa este rato cerrada, al abrirse vuelve a Brote (ms). */
const VOLVER_A_INICIO_MS = 20_000;

/** Cuántas lecturas de CPU guarda el gráfico de Equipo (una cada ~3 s). */
const MUESTRAS_CPU = 40;

/** Frases para probar, que el motor resuelve sin IA. */
const SUGERENCIAS = ["pomodoro de 25", "¿cuánto llevo esta semana?", "¿cómo está el computador?"];

export interface Zona {
  x: number;
  y: number;
  ancho: number;
  altoMax: number;
  /** La fila del notch, donde van las pestañas (a los costados del notch). Sin ella, van arriba del panel. */
  barra?: { x: number; y: number; ancho: number; alto: number };
}

interface Opciones {
  alAbrirMemoria?: () => void;
  alAbrirConfiguracion?: () => void;
  /** El botón ↻ del uso del plan: revisa la app de Claude y corre la consulta mínima. */
  alActualizarPlan?: () => void;
  flotante?: boolean;
  alCancelarTemporizador?: (id: number) => void;
  alMostrarDescarga?: (ruta: string) => void;
  alControlarMusica?: (accion: AccionMusica) => void;
  alDecidirPermisoClaude?: (id: string, decision: "allow" | "deny") => void;
  /** La pestaña Agenda pide sus datos al abrirse y cuando cambian las fuentes. */
  alPedirAgenda?: () => void;
  /** Los botones de la explicación de Agenda: Configurar Brote o los ajustes de Privacidad de macOS. */
  alAccionAgenda?: (accion: "configurar" | "privacidad-calendarios") => void;
  /** Decidir una tarea o fecha que Brote sacó de una grabación; con `cambios` si el usuario corrigió el título o la fecha. Devuelve lo que responde el puente. */
  alDecidirPropuestaAgenda?: (id: number, decision: "aceptar" | "descartar", cambios?: { titulo: string; fecha: string }) => Promise<string>;
  /** El check de una tarea de la Agenda. */
  alMarcarTarea?: (id: number, hecha: boolean) => void;
  /** Estamos en `tauri dev`: el permiso de Calendarios es de la Terminal, no de Brote. */
  desarrollo?: boolean;
  /** La pestaña Estudio pide sus datos al abrirse y cuando cambian los ramos o sus fuentes. */
  alPedirEstudio?: () => void;
  /** Acciones de la pestaña Estudio; devuelven lo que dice Brote (o lanzan si el puente lo rechaza). */
  alCrearRamo?: (nombre: string, alias: string[]) => Promise<string>;
  alEditarRamo?: (ramo: number, cambios: { nombre?: string; alias?: string[]; color?: string }) => Promise<void>;
  alArchivarRamo?: (ramo: number) => Promise<void>;
  /** Notas (A2): crear o editar una evaluación, borrarla y cambiar los ajustes de un ramo. */
  alGuardarEvaluacion?: (datos: { ramo?: number; evaluacion?: number; nombre?: string; peso?: number; nota?: number | null }) => Promise<void>;
  alBorrarEvaluacion?: (evaluacion: number) => Promise<void>;
  alCambiarAjustesNotas?: (ramo: number, ajustes: { aprobacion?: number; examenPeso?: number | null }) => Promise<void>;
  /** Un botón de un toque de la pestaña Plata. */
  alAnotarFrecuente?: (monto: number, descripcion: string) => void;
  /** La conversación de un especialista no trae pasos ni respuesta: se pide su historial al Gateway. */
  alPedirHistorial?: (sesion: string) => void;
  /** 🎙: el usuario quiere grabar (la isla pregunta primero si avisó a los presentes). */
  alQuererGrabar?: () => void;
  /** Respondió «¿avisaste a los presentes?»: ahora sí se empieza a grabar. */
  alElegirAviso?: (aviso: AvisoAPresentes) => void;
  alDetenerGrabacion?: () => void;
  /** Cerró la pregunta o el error sin grabar. */
  alCancelarGrabacion?: () => void;
  /** «Abrir Privacidad» en el error del micrófono (el enlace `privacidad-microfono` de Rust). */
  alAbrirPrivacidadMicrofono?: () => void;
  /** La pestaña Grabar pide sus listas al abrirse y cuando algo cambia. */
  alPedirGrabaciones?: () => void;
  /** «Transcribir» en un audio guardado. */
  alTranscribir?: (id: string) => void;
  /** El texto de una transcripción (el puente lo lee del disco). */
  alVerTexto?: (id: string) => Promise<{ texto: string; recortado: boolean }>;
  /** Borrar un audio o una transcripción (a la Papelera en Mac). */
  alBorrarGrabacion?: (que: "audio" | "transcripcion", id: string) => void;
}

/** Lo que llega del historial de una sesión hija (chat.history). */
export interface HistorialEspecialista {
  tarea: string | null;
  pasos: Trabajando["pasos"];
  respuesta: string;
}

/** Cómo se dice lo que hace una mascota en la cabecera de su conversación o su columna. */
const TEXTO_VISUAL: Record<Visual, string> = {
  "en-espera": "Preparándose",
  pensando: "Pensando",
  trabajando: "Trabajando",
  permiso: "Te pide permiso",
  termino: "Terminó",
  fallo: "No pudo terminar",
};

export class Panel {
  private readonly agente: Agente;
  private readonly opciones: Opciones;
  private readonly raiz: HTMLDivElement;
  private readonly barra: HTMLDivElement;
  private readonly botonesPestana = new Map<Pestana, HTMLButtonElement>();
  private readonly vistas = new Map<Pestana, HTMLDivElement>();
  private pestana: Pestana = "brote";

  // Brote: tarjetas (o su fila de píldoras) y la conversación
  private readonly cabeceraInicio: HTMLDivElement;
  private readonly tituloInicio: HTMLDivElement;
  private readonly verRespuesta: HTMLButtonElement;
  private readonly tarjetas: HTMLDivElement;
  private readonly pildoras: HTMLDivElement;
  /** Las funciones prendidas y el orden de las tarjetas (hasta que el puente avise, todo prendido). */
  private funciones: ConfigFunciones = { activas: activasDePreset("todo"), tarjetas: { orden: [...IDS_TARJETAS], ocultas: [] } };
  /** Qué tarjetas tienen algo que mostrar. */
  private readonly conDatos: Partial<Record<IdTarjeta, boolean>> = {};
  private readonly datosPildoras: DatosPildoras = {
    temporizadores: [],
    calendario: null,
    aula: null,
    musica: null,
    descargas: { enCurso: 0, listas: 0 },
    claude: { sesiones: 0, pideProyecto: null },
  };
  private pildorasPintadas = "";
  /** El usuario tocó una píldora: se ven las tarjetas aunque haya conversación (hasta la próxima). */
  private forzarTarjetas = false;
  private compacto = false;
  private readonly tarjetasTemporizador: HTMLDivElement;
  private readonly tarjetaCalendario: HTMLDivElement;
  private readonly tarjetaAula: HTMLDivElement;
  private readonly tarjetaMusica: HTMLDivElement;
  private readonly musicaTitulo: HTMLDivElement;
  private readonly musicaDetalle: HTMLDivElement;
  private readonly musicaPlay: HTMLButtonElement;
  private readonly tarjetaDescargas: HTMLDivElement;
  private readonly tarjetaClaude: HTMLButtonElement;
  private readonly tarjetaVacia: HTMLDivElement;
  private filasTemporizador: { fin: number; duracion: number; tiempo: HTMLElement; barra: HTMLElement }[] = [];
  private saludoPintado = "";

  // Conversación
  private readonly burbuja: HTMLDivElement;
  /** El escenario: las mascotas de los especialistas trabajando (las dibuja main.ts en sus lugares). */
  private readonly vistaBrote: HTMLDivElement;
  private readonly escenario: HTMLDivElement;
  private readonly escenarioTitulo: HTMLSpanElement;
  private readonly escenarioFila: HTMLDivElement;
  private readonly botonVerTodos: HTMLButtonElement;
  private readonly lugares = new Map<string, { boton: HTMLButtonElement; globo: HTMLSpanElement; nombre: HTMLSpanElement; ia: HTMLSpanElement; hueco: HTMLSpanElement }>();
  /** Los que terminaron y ya se escondieron: fichas para ver su conversación (un minuto). */
  private readonly fichasEquipo: HTMLDivElement;
  private fichasPintadas = "";
  private especialistas: Trabajando[] = [];
  private enEscena: Trabajando[] = [];
  /** La sesión del especialista cuya conversación se ve en la pestaña Brote. */
  private abierto: string | null = null;
  private readonly conversacionEquipo: HTMLDivElement;
  private readonly historiales = new Map<string, HistorialEspecialista>();
  private readonly historialPedido = new Set<string>();
  /** "Ver a todos": columnas con Brote y hasta 3 especialistas. */
  private verTodosActivo = false;
  private readonly vistaTodos: HTMLDivElement;
  private readonly columnas = new Map<string, { caja: HTMLDivElement; hueco: HTMLSpanElement; estado: HTMLSpanElement; cuerpo: HTMLDivElement; pintado: string }>();
  private readonly usuario: HTMLParagraphElement;
  private readonly respuesta: HTMLDivElement;
  /** El texto ya pintado en la respuesta, para no rehacerla si no cambió. */
  private respuestaPintada: string | null = null;
  private readonly herramienta: HTMLParagraphElement;
  private readonly herramientaTexto: HTMLSpanElement;
  private readonly sinIA: HTMLParagraphElement;
  private readonly aprobacion: HTMLDivElement;
  private readonly aprobacionTitulo: HTMLParagraphElement;
  private readonly aprobacionDetalle: HTMLElement;
  private readonly permitir: HTMLButtonElement;
  private readonly rechazar: HTMLButtonElement;
  private readonly propuesta: HTMLDivElement;
  private readonly propuestaDetalle: HTMLParagraphElement;
  private readonly aprender: HTMLButtonElement;
  private readonly noAprender: HTMLButtonElement;

  // Claude
  private readonly permisosClaude: HTMLDivElement;
  private readonly sesiones: HTMLDivElement;
  private readonly codigoVacio: HTMLDivElement;
  private pasos = new Map<string, string[]>();
  private hayPermisoClaude = false;
  private hayActividadClaude = false;
  private permisosVistos = new Set<string>();
  private readonly usoPlan: HTMLDivElement;
  private readonly usoActualizado: HTMLSpanElement;
  private readonly usoRefrescar: HTMLButtonElement;
  private readonly usoBarras: HTMLDivElement;
  private readonly usoSinPlan: HTMLDivElement;
  private readonly usoTokens: HTMLDivElement;
  private readonly usoPrecios: HTMLDetailsElement;
  private readonly tituloSesiones: HTMLDivElement;
  private estadoUso: EstadoUso | null = null;
  private periodoUso: "hoy" | "semana" = "hoy";

  // Plata
  private readonly plata: HTMLDivElement;
  private estadoPlata: EstadoPlata | null = null;
  // Grabar: el micrófono, los audios guardados y sus transcripciones
  private readonly grabar: HTMLDivElement;
  private datosGrabar: Grabaciones | null = null;
  private subGrabar: "audios" | "textos" = "audios";
  private grabacionAbierta: string | null = null;
  private readonly fasesTranscripcion = new Map<string, FaseTranscripcion>();
  // Estudio
  private readonly estudio: HTMLDivElement;
  private estadoEstudio: EstadoEstudio | null = null;
  /** Qué ramo tiene la ficha abierta, cuál se está editando y el mensaje de error del último intento. */
  private ramoAbierto: number | null = null;
  private ramoEditando: number | null = null;
  private errorEstudio = "";
  /** Notas (A2): qué evaluación se edita, si el formulario «+ Evaluación» está abierto y el último error. */
  private evaluacionEditando: number | null = null;
  private evaluacionNueva: number | null = null;
  private errorNotas = "";
  // Agenda
  private readonly agenda: HTMLDivElement;
  private estadoAgenda: EstadoAgenda | null = null;
  private propuestasAgenda: PropuestaAgenda[] = [];
  /** La que se está editando (su título y fecha en campos), para que un repintado no la pierda. */
  private propuestaEditando: number | null = null;
  private mensajePropuestas: string | null = null;

  // Equipo
  private readonly metricas: HTMLDivElement;
  private muestrasCpu: number[] = [];

  // Comunes
  private readonly avisoDestacado: HTMLParagraphElement;
  /** Avisos que no abren la isla (`notificar`): lo que llegó mientras estaba cerrada, al abrirla. */
  private readonly novedades = new Novedades();
  private readonly listaNovedades: HTMLDivElement;
  /** Los avisos que el usuario no había visto al abrir la isla (o que llegaron con ella abierta). */
  private novedadesNuevas = new Set<number>();
  private readonly entrada: HTMLInputElement;
  private readonly enviar: HTMLButtonElement;
  private readonly microfono: HTMLButtonElement;
  private readonly franjaGrabacion: HTMLDivElement;
  private estadoGrabacion: EstadoGrabacion = GRABACION_INACTIVA;
  private visible = false;
  private cerradaDesde = -Infinity;
  private leerHasta = 0;
  private avisoHasta = 0;
  private terminadaAntes = false;
  private respuestaAntes = "";
  private ocupadoAntes = false;
  private aprobacionAntes: string | null = null;
  private propuestaAntes = false;
  /** Hay una respuesta que no se vio en el chat (punto en la pestaña). */
  private respuestaSinVer = false;
  /** Sin conexión con OpenClaw, el campo lo dice (los gastos funcionan igual). */
  private sinConexion: string | null = null;

  constructor(agente: Agente, contenedor: HTMLElement, opciones: Opciones = {}) {
    this.agente = agente;
    this.opciones = opciones;
    this.raiz = crear("div", opciones.flotante ? "panel flotante" : "panel");

    // Pestañas: a la izquierda del notch las vistas, a la derecha "Lo que sé de ti" y Configurar.
    this.barra = crear("div", "barra");
    const izquierda = crear("div", "barra-grupo");
    const pestanas: [Pestana, NombreIcono, string][] = [
      ["brote", "brote", "Brote"],
      ["plata", "plata", "Plata"],
      ["agenda", "calendario", "Agenda"],
      ["estudio", "estudio", "Estudio"],
      ["grabar", "microfono", "Grabar"],
    ];
    for (const [nombre, ic, titulo] of pestanas) {
      const boton = botonIcono("pestana", ic, titulo);
      boton.addEventListener("click", () => this.elegir(nombre));
      this.botonesPestana.set(nombre, boton);
      izquierda.append(boton);
    }
    const derecha = crear("div", "barra-grupo");
    // Claude (el consumo del plan y tus sesiones) y Equipo (la supervisión del computador) viven a la
    // derecha, con «Lo que sé de ti» y Configurar: así la izquierda no se llena de pestañas.
    const claudeBoton = botonIcono("pestana", "codigo", "Claude");
    claudeBoton.addEventListener("click", () => this.elegir("claude"));
    this.botonesPestana.set("claude", claudeBoton);
    derecha.append(claudeBoton);
    const equipoBoton = botonIcono("pestana", "equipo", "Equipo");
    equipoBoton.addEventListener("click", () => this.elegir("equipo"));
    this.botonesPestana.set("equipo", equipoBoton);
    derecha.append(equipoBoton);
    if (opciones.alAbrirMemoria) {
      const memoria = botonIcono("pestana", "memoria", "Lo que sé de ti");
      memoria.addEventListener("click", opciones.alAbrirMemoria);
      derecha.append(memoria);
    }
    if (opciones.alAbrirConfiguracion) {
      const ajustes = botonIcono("pestana", "ajustes", "Configurar Brote");
      ajustes.addEventListener("click", opciones.alAbrirConfiguracion);
      derecha.append(ajustes);
    }
    this.barra.append(izquierda, derecha);

    this.avisoDestacado = crear("p", "aviso-destacado");
    this.avisoDestacado.hidden = true;
    this.listaNovedades = crear("div", "novedades");
    this.listaNovedades.hidden = true;

    // --- Brote: tarjetas y conversación ---
    const inicio = crear("div", "vista vista-brote");
    this.cabeceraInicio = crear("div", "cabecera-vista");
    this.tituloInicio = crear("div", "titulo-vista");
    this.verRespuesta = boton("enlace-vista", "Ver la respuesta");
    this.verRespuesta.addEventListener("click", () => {
      this.forzarTarjetas = false;
      this.leerHasta = performance.now() + LECTURA_MIN * 2;
      this.aplicarModo();
    });
    this.cabeceraInicio.append(this.tituloInicio, this.verRespuesta);
    this.tarjetas = crear("div", "tarjetas");
    this.pildoras = crear("div", "pildoras");
    this.pildoras.hidden = true;
    this.tarjetasTemporizador = crear("div", "grupo-tarjetas");
    this.tarjetaCalendario = crear("div", "tarjeta calendario");
    this.tarjetaCalendario.hidden = true;
    this.tarjetaCalendario.addEventListener("click", () => {
      if (!this.botonesPestana.get("agenda")!.hidden) this.elegir("agenda");
    });
    this.tarjetaAula = crear("div", "tarjeta aula");
    this.tarjetaAula.hidden = true;

    this.tarjetaMusica = crear("div", "tarjeta musica ancha");
    this.tarjetaMusica.hidden = true;
    const portada = crear("div", "musica-portada");
    portada.append(icono("musica"), crear("span", "ondas"));
    portada.lastElementChild!.append(crear("i", ""), crear("i", ""), crear("i", ""));
    const textoMusica = crear("div", "musica-texto");
    this.musicaTitulo = crear("div", "musica-titulo");
    this.musicaDetalle = crear("div", "musica-detalle");
    textoMusica.append(this.musicaTitulo, this.musicaDetalle);
    this.tarjetaMusica.append(portada, textoMusica);
    const botonMusica = (ic: NombreIcono, titulo: string, accion: AccionMusica) => {
      const b = botonIcono("boton-musica", ic, titulo);
      b.addEventListener("click", () => opciones.alControlarMusica?.(accion));
      return b;
    };
    this.musicaPlay = botonMusica("play", "Play / pausa", "play-pausa");
    if (opciones.alControlarMusica) {
      this.tarjetaMusica.append(botonMusica("anterior", "Canción anterior", "anterior"), this.musicaPlay, botonMusica("siguiente", "Siguiente canción", "siguiente"));
    }

    this.tarjetaDescargas = crear("div", "tarjeta descargas ancha");
    this.tarjetaDescargas.hidden = true;
    this.tarjetaClaude = crear("button", "tarjeta claude ancha");
    this.tarjetaClaude.type = "button";
    this.tarjetaClaude.hidden = true;
    this.tarjetaClaude.addEventListener("click", () => this.elegir("claude"));
    this.tarjetaVacia = crear("div", "tarjeta vacia ancha");
    const tranquilo = crear("p", "vacia-texto");
    tranquilo.textContent = "Todo tranquilo por aquí. Prueba:";
    this.tarjetaVacia.append(tranquilo, this.sugerencias());
    this.tarjetas.append(this.tarjetasTemporizador, this.tarjetaCalendario, this.tarjetaAula, this.tarjetaMusica, this.tarjetaDescargas, this.tarjetaClaude, this.tarjetaVacia);

    this.burbuja = crear("div", "burbuja");
    this.usuario = crear("p", "burbuja-usuario");
    this.respuesta = crear("div", "burbuja-respuesta");
    this.herramienta = crear("p", "burbuja-herramienta");
    this.herramientaTexto = crear("span", "");
    this.herramienta.append(icono("girando", "gira"), this.herramientaTexto);
    this.sinIA = crear("p", "burbuja-sin-ia");
    this.sinIA.textContent = "⚡ sin IA";
    this.sinIA.title = "Lo resolvió el motor de comandos, sin usar el agente";
    this.burbuja.append(this.usuario, this.respuesta, this.herramienta, this.sinIA);

    this.aprobacion = crear("div", "aprobacion");
    this.aprobacionTitulo = crear("p", "aprobacion-titulo");
    this.aprobacionDetalle = crear("code", "aprobacion-detalle");
    const botones = crear("div", "aprobacion-botones");
    this.rechazar = boton("boton", "Rechazar");
    this.permitir = boton("boton boton-primario", "Permitir");
    botones.append(this.rechazar, this.permitir);
    this.aprobacion.append(this.aprobacionTitulo, this.aprobacionDetalle, botones);

    this.propuesta = crear("div", "aprobacion propuesta");
    const propuestaTitulo = crear("p", "aprobacion-titulo");
    propuestaTitulo.textContent = "¿Aprendo a entender esto sin IA?";
    this.propuestaDetalle = crear("p", "propuesta-detalle");
    const botonesPropuesta = crear("div", "aprobacion-botones");
    this.noAprender = boton("boton", "No");
    this.aprender = boton("boton boton-primario", "Sí, aprende");
    botonesPropuesta.append(this.noAprender, this.aprender);
    this.propuesta.append(propuestaTitulo, this.propuestaDetalle, botonesPropuesta);
    // El escenario del equipo: un lugar por mascota (globito arriba, hueco para el dibujo, nombre abajo).
    this.escenario = crear("div", "escenario");
    this.escenario.hidden = true;
    this.escenario.setAttribute("aria-live", "polite");
    const cabeceraEscenario = crear("div", "escenario-cabecera");
    this.escenarioTitulo = crear("span", "escenario-titulo");
    this.botonVerTodos = boton("enlace-vista ver-todos", "");
    this.botonVerTodos.append(icono("ampliar"), document.createTextNode(" Ver a todos"));
    this.botonVerTodos.title = "Ver las conversaciones de todo el equipo, lado a lado";
    this.botonVerTodos.addEventListener("click", () => this.verTodos(true));
    cabeceraEscenario.append(this.escenarioTitulo, this.botonVerTodos);
    this.escenarioFila = crear("div", "escenario-fila");
    this.escenario.append(cabeceraEscenario, this.escenarioFila);
    this.fichasEquipo = crear("div", "fichas-equipo");
    this.fichasEquipo.hidden = true;
    this.conversacionEquipo = crear("div", "conversacion-equipo");
    this.conversacionEquipo.hidden = true;
    this.vistaBrote = inicio;
    inicio.append(this.cabeceraInicio, this.escenario, this.fichasEquipo, this.conversacionEquipo, this.tarjetas, this.pildoras, this.burbuja, this.aprobacion, this.propuesta);

    // --- Claude ---
    const codigo = crear("div", "vista vista-claude");
    // Uso del plan: el % de la sesión de 5 h y de la semana (llega por la statusline de Claude Code),
    // los tokens de hoy y de 7 días con su valor API, y los precios plegados.
    this.usoPlan = crear("div", "uso-plan");
    const cabeceraUso = crear("div", "uso-cabecera");
    const usoTitulo = crear("div", "seccion-titulo");
    usoTitulo.textContent = "Uso del plan";
    this.usoActualizado = crear("span", "uso-actualizado");
    this.usoRefrescar = botonIcono("uso-refrescar", "refrescar", "Revisar el plan ahora (gasta unos 600 tokens si no hay un dato reciente)");
    this.usoRefrescar.addEventListener("click", () => {
      this.usoRefrescar.classList.add("girando");
      this.opciones.alActualizarPlan?.();
    });
    this.usoRefrescar.hidden = !opciones.alActualizarPlan;
    cabeceraUso.append(usoTitulo, this.usoActualizado, this.usoRefrescar);
    this.usoBarras = crear("div", "uso-barras");
    this.usoSinPlan = crear("div", "uso-sin-plan");
    this.usoTokens = crear("div", "uso-tokens");
    this.usoPrecios = crear("details", "uso-precios");
    this.usoPlan.append(cabeceraUso, this.usoBarras, this.usoSinPlan, this.usoTokens, this.usoPrecios);
    this.usoPlan.hidden = true;
    const tituloSesiones = crear("div", "seccion-titulo");
    tituloSesiones.textContent = "Sesiones";
    this.tituloSesiones = tituloSesiones;
    this.permisosClaude = crear("div", "grupo-tarjetas");
    this.sesiones = crear("div", "grupo-tarjetas");
    this.codigoVacio = crear("p", "vacia-texto");
    this.codigoVacio.textContent = "No hay sesiones de Claude Code abiertas. Abre una con «claude» en una terminal o en la pestaña Code.";
    codigo.append(this.usoPlan, tituloSesiones, this.permisosClaude, this.sesiones, this.codigoVacio);

    // --- Equipo ---
    const equipo = crear("div", "vista vista-equipo");
    this.metricas = crear("div", "metricas");
    const midiendo = crear("p", "vacia-texto");
    midiendo.textContent = "Midiendo…";
    this.metricas.append(midiendo);
    equipo.append(this.metricas);

    // --- Plata ---
    this.plata = crear("div", "vista vista-plata");
    const sinPlata = crear("p", "vacia-texto");
    sinPlata.textContent = "Sumando tus gastos…";
    this.plata.append(sinPlata);

    // --- Estudio ---
    this.estudio = crear("div", "vista vista-estudio");
    const sinEstudio = crear("p", "vacia-texto");
    sinEstudio.textContent = "Buscando tus ramos…";
    this.estudio.append(sinEstudio);
    // --- Agenda ---
    this.agenda = crear("div", "vista vista-agenda");
    const sinAgenda = crear("p", "vacia-texto");
    sinAgenda.textContent = "Armando tu agenda…";
    this.agenda.append(sinAgenda);

    // --- Grabar ---
    this.grabar = crear("div", "vista vista-grabar");
    const sinGrabar = crear("p", "vacia-texto");
    sinGrabar.textContent = "Buscando tus grabaciones…";
    this.grabar.append(sinGrabar);

    this.vistas.set("brote", inicio).set("plata", this.plata).set("agenda", this.agenda).set("estudio", this.estudio).set("grabar", this.grabar).set("claude", codigo).set("equipo", equipo);

    // --- Campo de texto (en todas las pestañas) ---
    const formulario = crear("form", "formulario");
    this.entrada = crear("input", "entrada");
    this.entrada.type = "text";
    this.entrada.placeholder = "Escríbeme algo…";
    this.entrada.autocomplete = "off";
    this.entrada.spellcheck = false;
    this.entrada.maxLength = 1000;
    this.enviar = crear("button", "boton-enviar");
    this.enviar.type = "submit";
    // 🎙 (solo con la función "grabaciones" prendida) y la franja de la grabación sobre el campo.
    this.microfono = botonIcono("boton-microfono", "microfono", "Grabar");
    this.microfono.type = "button";
    this.microfono.hidden = true;
    this.microfono.addEventListener("click", () => this.opciones.alQuererGrabar?.());
    this.franjaGrabacion = crear("div", "franja-grabacion");
    this.franjaGrabacion.hidden = true;
    formulario.append(this.entrada, this.microfono, this.enviar);

    if (opciones.flotante) this.raiz.append(this.barra);
    else contenedor.append(this.barra);
    // "Ver a todos": reemplaza las vistas mientras está abierta (el campo de texto sigue abajo).
    this.vistaTodos = crear("div", "vista-todos");
    const cabeceraTodos = crear("div", "todos-cabecera");
    const tituloTodos = crear("span", "escenario-titulo");
    tituloTodos.textContent = "Tu equipo, en vivo";
    const volverTodos = boton("enlace-vista", "");
    volverTodos.append(icono("reducir"), document.createTextNode(" Volver"));
    volverTodos.addEventListener("click", () => this.verTodos(false));
    cabeceraTodos.append(tituloTodos, volverTodos);
    const filaColumnas = crear("div", "todos-columnas");
    this.vistaTodos.append(cabeceraTodos, filaColumnas);
    this.raiz.append(this.avisoDestacado, this.listaNovedades, inicio, this.plata, this.agenda, this.estudio, this.grabar, codigo, equipo, this.vistaTodos, this.franjaGrabacion, formulario);
    contenedor.append(this.raiz);

    formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      // Mientras el agente trabaja, el mismo botón lo detiene.
      if (ocupado(this.agente.conversacion)) {
        void this.agente.detener();
        return;
      }
      this.enviarTexto(this.entrada.value);
    });
    this.entrada.addEventListener("input", () => this.actualizarBotonEnviar());
    this.entrada.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape") {
        this.entrada.value = "";
        this.entrada.blur();
        this.actualizarBotonEnviar();
      }
    });
    this.permitir.addEventListener("click", () => void this.agente.responder("allow-once"));
    this.rechazar.addEventListener("click", () => void this.agente.responder("deny"));
    this.aprender.addEventListener("click", () => void this.agente.decidirPropuesta(true));
    this.noAprender.addEventListener("click", () => void this.agente.decidirPropuesta(false));

    this.elegir("brote");
    this.actualizarInicio();
    agente.alCambiar((c) => this.mostrar(c));
    this.mostrar(agente.conversacion);
  }

  /** La pestaña a la vista (main pide los datos del equipo solo si es "equipo"). */
  get pestanaActual(): Pestana {
    return this.pestana;
  }

  /** Cambia de pestaña. */
  elegir(pestana: Pestana): void {
    this.pestana = pestana;
    for (const [nombre, vista] of this.vistas) vista.hidden = nombre !== pestana;
    for (const [nombre, b] of this.botonesPestana) {
      b.classList.toggle("activa", nombre === pestana);
      b.setAttribute("aria-pressed", String(nombre === pestana));
    }
    if (pestana === "brote") this.respuestaSinVer = false;
    if (pestana === "agenda") this.opciones.alPedirAgenda?.();
    if (pestana === "estudio") this.opciones.alPedirEstudio?.();
    if (pestana === "grabar") {
      this.mostrarGrabaciones();
      this.opciones.alPedirGrabaciones?.();
    }
    if (this.visible) this.novedades.marcarVistasDe(pestana);
    this.actualizarPuntos();
  }

  /** La isla no debe cerrarse: hay texto escrito, un permiso pendiente o una respuesta por leer. */
  retieneIsla(ahora: number): boolean {
    const c = this.agente.conversacion;
    return (
      this.entrada.value.trim() !== "" ||
      c.aprobacion !== null ||
      this.hayPermisoClaude ||
      c.propuesta !== null ||
      // La pregunta a los presentes y los errores del micrófono son decisiones: la isla no se cierra sola.
      (["pregunta", "iniciando", "error"] as const).some((f) => f === this.estadoGrabacion.fase) ||
      this.verTodosActivo ||
      ahora < this.leerHasta ||
      Date.now() < this.avisoHasta
    );
  }

  /** Una tarjeta por temporizador corriendo, con su cuenta regresiva, una barra de avance y ■ para cancelarlo. */
  mostrarTemporizadores(lista: TemporizadorActivo[]): void {
    this.filasTemporizador = [];
    this.tarjetasTemporizador.replaceChildren(
      ...lista.map((t) => {
        const tarjeta = crear("div", `tarjeta temporizador ${t.tipo} ${t.fase ?? ""}`);
        const etiqueta = crear("div", "tarjeta-etiqueta");
        etiqueta.textContent =
          t.tipo === "pomodoro"
            ? `${t.fase === "descanso" ? "Descanso" : "Pomodoro"}${t.etiqueta && t.fase !== "descanso" ? ` · ${t.etiqueta}` : ""}`
            : (t.etiqueta ?? "Temporizador");
        etiqueta.title = etiqueta.textContent;
        const tiempo = crear("div", "temporizador-tiempo");
        const avance = crear("div", "avance");
        const relleno = crear("i", "");
        avance.append(relleno);
        tarjeta.append(etiqueta, tiempo, avance);
        if (this.opciones.alCancelarTemporizador) {
          const cancelar = botonIcono("tarjeta-cerrar", "detener", t.tipo === "pomodoro" ? "Detener el pomodoro" : "Cancelar");
          cancelar.addEventListener("click", () => this.opciones.alCancelarTemporizador?.(t.id));
          tarjeta.append(cancelar);
        }
        this.filasTemporizador.push({ fin: t.finMs, duracion: t.duracionMs, tiempo, barra: relleno });
        return tarjeta;
      }),
    );
    this.datosPildoras.temporizadores = lista;
    this.conDatos.temporizadores = lista.length > 0;
    this.actualizarRelojes();
    this.actualizarInicio();
  }

  /**
   * Las descargas en curso (con una barra que avanza) y las que terminaron hace poco ("Lista ✓", con
   * un botón para mostrarla en el Finder o el Explorador).
   */
  mostrarDescargas(enCurso: DescargaEnCurso[], listas: Descarga[]): void {
    const filas = [
      ...enCurso.map((d) => {
        const fila = crear("div", "fila descarga en-curso");
        const nombre = crear("span", "fila-nombre");
        nombre.textContent = d.nombre ?? "Descargando un archivo…";
        const tamano = crear("span", "fila-dato");
        tamano.textContent = tamanoCorto(d.tamano);
        const avance = crear("div", "avance indeterminado");
        avance.append(crear("i", ""));
        fila.append(icono("descarga"), nombre, tamano, avance);
        return fila;
      }),
      ...listas.map((d) => {
        const fila = crear("div", "fila descarga lista");
        const nombre = crear("span", "fila-nombre");
        nombre.textContent = d.nombre;
        nombre.title = d.nombre;
        const lista = crear("span", "fila-dato");
        lista.textContent = "Lista ✓";
        fila.append(icono("descarga"), nombre, lista);
        if (this.opciones.alMostrarDescarga) {
          const mostrar = boton("boton boton-fila", "Mostrar");
          mostrar.title = navigator.userAgent.includes("Windows") ? "Mostrar en el Explorador" : "Mostrar en el Finder";
          mostrar.addEventListener("click", () => this.opciones.alMostrarDescarga?.(d.ruta));
          fila.append(mostrar);
        }
        return fila;
      }),
    ];
    const etiqueta = crear("div", "tarjeta-etiqueta");
    etiqueta.textContent = enCurso.length > 0 ? "Descargando" : "Descargas";
    this.tarjetaDescargas.replaceChildren(etiqueta, ...filas);
    this.datosPildoras.descargas = { enCurso: enCurso.length, listas: listas.length };
    this.conDatos.descargas = filas.length > 0;
    this.actualizarInicio();
  }

  /** El próximo evento del calendario (solo si es dentro de las próximas 12 h). */
  mostrarCalendario(estado: EstadoCalendario): void {
    const proximo = estado.proximo;
    const visible = proximo !== null && proximo.inicioMs - Date.now() < 12 * 3_600_000;
    this.conDatos.calendario = visible;
    this.datosPildoras.calendario = visible ? proximo : null;
    if (visible) {
      const etiqueta = crear("div", "tarjeta-etiqueta");
      etiqueta.append(icono("calendario"), " Próximo");
      const titulo = crear("div", "tarjeta-titulo");
      titulo.textContent = proximo.titulo;
      const cuando = crear("div", "tarjeta-detalle");
      cuando.textContent = [cuandoEmpieza(proximo, Date.now()), proximo.lugar].filter(Boolean).join(" · ");
      this.tarjetaCalendario.replaceChildren(etiqueta, titulo, cuando);
      this.tarjetaCalendario.title = proximo.lugar ? `${proximo.titulo} · ${proximo.lugar}` : proximo.titulo;
      this.tarjetaCalendario.classList.toggle("pronto", proximo.inicioMs - Date.now() <= 15 * 60_000);
    }
    this.actualizarInicio();
  }

  /** Las listas de la pestaña Grabar (las pide main al puente). */
  ponerGrabaciones(datos: Grabaciones | null): void {
    this.datosGrabar = datos;
    if (this.pestana === "grabar") this.mostrarGrabaciones();
  }

  /** Lo que avisa el puente mientras transcribe: la fila cambia de estado al tiro. */
  avisarTranscripcion(id: string, fase: FaseTranscripcion): void {
    this.fasesTranscripcion.set(id, fase);
    if (fase === "lista") {
      this.fasesTranscripcion.delete(id);
      this.opciones.alPedirGrabaciones?.();
    }
    if (this.pestana === "grabar") this.mostrarGrabaciones();
  }

  /** ¿Se está viendo la pestaña Grabar? */
  get grabarAbierta(): boolean {
    return this.visible && this.pestana === "grabar";
  }

  /**
   * La pestaña Grabar: el botón del micrófono arriba y, debajo, dos listas: las grabaciones guardadas
   * (al tocar una sale «Transcribir») y sus transcripciones. Lo guardado se ve aunque la función esté apagada.
   */
  mostrarGrabaciones(): void {
    const prendida = this.funciones.activas.grabaciones;
    const partes: HTMLElement[] = [];
    const fase = this.estadoGrabacion.fase;
    const nueva = crear("button", `grabar-nueva${fase === "inactiva" ? "" : " ocupada"}`);
    nueva.type = "button";
    nueva.disabled = fase !== "inactiva" || !prendida;
    const punto = crear("span", "grabar-nueva-punto");
    const etiqueta = crear("span", "grabar-nueva-texto");
    etiqueta.textContent = textoBotonGrabar(fase);
    nueva.append(icono("microfono"), etiqueta, punto);
    nueva.addEventListener("click", () => this.opciones.alQuererGrabar?.());
    partes.push(nueva);

    const datos = this.datosGrabar;
    const subs = crear("div", "grabar-subs");
    for (const [clave, nombre, cuantas] of [
      ["audios", "Grabaciones", datos?.audios.length ?? 0],
      ["textos", "Transcripciones", datos?.transcripciones.length ?? 0],
    ] as const) {
      const b = boton(`grabar-sub${this.subGrabar === clave ? " activa" : ""}`, `${nombre} · ${cuantas}`);
      b.addEventListener("click", () => {
        this.subGrabar = clave;
        this.grabacionAbierta = null;
        this.mostrarGrabaciones();
      });
      subs.append(b);
    }
    partes.push(subs);

    const lista = crear("div", "grabar-lista");
    const filas = this.subGrabar === "audios" ? (datos?.audios.length ?? 0) : (datos?.transcripciones.length ?? 0);
    if (!datos) {
      const p = crear("p", "vacia-texto");
      p.textContent = "Buscando tus grabaciones…";
      lista.append(p);
    } else if (filas === 0) {
      const p = crear("p", "vacia-texto");
      p.textContent = textoVacioGrabar(this.subGrabar, prendida);
      lista.append(p);
    } else if (this.subGrabar === "audios") {
      for (const a of datos.audios) lista.append(this.filaAudio(a));
    } else {
      for (const t of datos.transcripciones) lista.append(this.filaTranscripcion(t));
    }
    partes.push(lista);
    this.grabar.replaceChildren(...partes);
  }

  private filaAudio(a: Grabaciones["audios"][number]): HTMLElement {
    const estado = estadoDeAudio(a, this.fasesTranscripcion.get(a.id));
    const abierta = this.grabacionAbierta === `audio:${a.id}`;
    const fila = crear("div", `grabar-fila${abierta ? " abierta" : ""}`);
    const cabeza = crear("button", "grabar-cabeza");
    cabeza.type = "button";
    const titulo = crear("span", "grabar-titulo");
    titulo.textContent = textoFecha(a.fecha, a.id);
    const meta = crear("span", "grabar-meta");
    meta.textContent = `${textoDuracion(duracionDeAudio(a.bytes))} · ${textoTamano(a.bytes)}`;
    const chip = crear("span", `grabar-chip ${estado}`);
    chip.textContent = TEXTO_ESTADO_AUDIO[estado];
    cabeza.append(titulo, meta, chip);
    cabeza.addEventListener("click", () => {
      this.grabacionAbierta = abierta ? null : `audio:${a.id}`;
      this.mostrarGrabaciones();
    });
    fila.append(cabeza);
    if (abierta) {
      const acciones = crear("div", "grabar-acciones");
      if (estado === "sin-transcribir" || estado === "error") {
        const t = boton("boton boton-fila", estado === "error" ? "Reintentar" : "Transcribir");
        t.addEventListener("click", () => {
          this.fasesTranscripcion.set(a.id, "en-cola");
          this.opciones.alTranscribir?.(a.id);
          this.mostrarGrabaciones();
        });
        acciones.append(t);
      } else if (estado === "transcrita") {
        const ver = boton("boton boton-fila", "Ver la transcripción");
        ver.addEventListener("click", () => {
          this.subGrabar = "textos";
          this.grabacionAbierta = `texto:${a.id}`;
          this.mostrarGrabaciones();
          void this.cargarTexto(a.id);
        });
        acciones.append(ver);
      } else {
        const p = crear("span", "grabar-meta");
        p.textContent = "Esto puede tardar un rato: puedes cerrar la isla, te aviso.";
        acciones.append(p);
      }
      if (estado !== "en-cola" && estado !== "transcribiendo") acciones.append(this.botonBorrar("audio", a.id));
      fila.append(acciones);
    }
    return fila;
  }

  private filaTranscripcion(t: Grabaciones["transcripciones"][number]): HTMLElement {
    const abierta = this.grabacionAbierta === `texto:${t.id}`;
    const fila = crear("div", `grabar-fila${abierta ? " abierta" : ""}`);
    const cabeza = crear("button", "grabar-cabeza");
    cabeza.type = "button";
    const titulo = crear("span", "grabar-titulo");
    titulo.textContent = textoFecha(t.fecha, t.id);
    const meta = crear("span", "grabar-meta");
    meta.textContent = `${textoDuracion(t.duracionSeg)} · ${textoAviso(t.avisoAPresentes)}`;
    cabeza.append(titulo, meta);
    cabeza.addEventListener("click", () => {
      this.grabacionAbierta = abierta ? null : `texto:${t.id}`;
      this.mostrarGrabaciones();
      if (!abierta) void this.cargarTexto(t.id);
    });
    fila.append(cabeza);
    if (abierta) {
      const cuerpo = crear("pre", "grabar-texto");
      cuerpo.dataset.id = t.id;
      cuerpo.textContent = "Leyendo…";
      const acciones = crear("div", "grabar-acciones");
      acciones.append(this.botonCopiar(t.id), this.botonBorrar("transcripcion", t.id));
      fila.append(cuerpo, acciones);
    }
    return fila;
  }

  /** Pide el texto al puente y lo pone en la fila abierta (siempre como texto, nunca como HTML). */
  private async cargarTexto(id: string): Promise<void> {
    const cuerpo = this.grabar.querySelector<HTMLPreElement>(`.grabar-texto[data-id="${id}"]`);
    if (!cuerpo || !this.opciones.alVerTexto) return;
    try {
      const { texto, recortado } = await this.opciones.alVerTexto(id);
      if (cuerpo.isConnected) cuerpo.textContent = recortado ? `${texto}\n\n[…se cortó aquí: el texto es larguísimo]` : texto;
    } catch (error) {
      if (cuerpo.isConnected) cuerpo.textContent = `No pude leerla: ${String(error).replace(/^Error: /, "")}`;
    }
  }

  /** «Copiar»: pide el texto completo (con sus marcas de tiempo) y lo pone en el portapapeles. */
  private botonCopiar(id: string): HTMLButtonElement {
    const b = boton("boton boton-fila", "Copiar");
    let plazo: ReturnType<typeof setTimeout> | undefined;
    b.addEventListener("click", async () => {
      if (!this.opciones.alVerTexto) return;
      b.disabled = true;
      let mensaje: string;
      try {
        const { texto, recortado } = await this.opciones.alVerTexto(id);
        mensaje = textoCopiado(await copiarTexto(texto), recortado);
      } catch {
        mensaje = textoCopiado(false, false);
      }
      b.textContent = mensaje;
      b.disabled = false;
      clearTimeout(plazo);
      plazo = setTimeout(() => (b.textContent = "Copiar"), 2000);
    });
    return b;
  }

  /** «Borrar» con segundo toque (a la Papelera en Mac; en Windows y Linux se borra de verdad). */
  private botonBorrar(que: "audio" | "transcripcion", id: string): HTMLButtonElement {
    const b = boton("boton boton-fila peligro", "Borrar");
    let plazo: ReturnType<typeof setTimeout> | undefined;
    b.addEventListener("click", () => {
      if (!b.classList.contains("confirmando")) {
        b.classList.add("confirmando");
        b.textContent = "¿Seguro?";
        plazo = setTimeout(() => {
          b.classList.remove("confirmando");
          b.textContent = "Borrar";
        }, 3000);
        return;
      }
      clearTimeout(plazo);
      b.disabled = true;
      this.grabacionAbierta = null;
      this.opciones.alBorrarGrabacion?.(que, id);
    });
    return b;
  }

  /** ¿Se está viendo la agenda? (main la refresca cuando cambia el calendario, el aula o los temporizadores). */
  get agendaAbierta(): boolean {
    return this.visible && this.pestana === "agenda";
  }

  /**
   * La pestaña Agenda: los próximos 14 días por día, con una barra de color por tipo (evento, entrega,
   * recordatorio); lo que ya pasó se atenúa y lo que pasa ahora se resalta. Sin nada, explica por qué
   * (sin calendario, sin permiso, modo desarrollo). Se repinta cada minuto.
   */
  mostrarAgenda(estado: EstadoAgenda | null = this.estadoAgenda): void {
    this.estadoAgenda = estado;
    if (!estado) return;
    const ahora = Date.now();
    const partes: HTMLElement[] = [];
    const cabecera = crear("div", "agenda-cabecera");
    const titulo = crear("span", "agenda-titulo");
    titulo.textContent = "Próximos 14 días";
    cabecera.append(titulo);
    if (estado.fuentes.calendario) {
      const nuevo = boton("pildora", "+ Evento");
      nuevo.title = "Escribe «agenda …» en el campo";
      nuevo.addEventListener("click", () => {
        this.entrada.value = "agenda ";
        this.actualizarBotonEnviar();
        this.entrada.focus();
      });
      cabecera.append(nuevo);
    }
    partes.push(cabecera);
    const tarjetaPropuestas = this.tarjetaPropuestasAgenda();
    if (tarjetaPropuestas) partes.push(tarjetaPropuestas);

    for (const dia of estado.dias) {
      const bloque = crear("div", "agenda-dia");
      const nombre = crear("div", "agenda-dia-titulo");
      nombre.textContent = tituloDelDia(dia.diaMs, ahora);
      bloque.append(nombre);
      for (const item of dia.items) {
        const fila = crear("div", `agenda-fila ${item.tipo} ${estadoDelItem(item, ahora)}`);
        const horaEl = crear("span", "agenda-hora");
        horaEl.textContent = horaDelItem(item);
        const barra = crear("span", "agenda-barra");
        const texto = crear("span", "agenda-texto");
        const tituloItem = crear("span", "agenda-item-titulo");
        tituloItem.textContent = item.titulo;
        texto.append(tituloItem);
        if (item.detalle) {
          const detalle = crear("span", "agenda-detalle");
          detalle.textContent = item.detalle;
          texto.append(detalle);
        }
        fila.title = [horaDelItem(item), item.titulo, item.detalle].filter(Boolean).join(" · ");
        if (item.tipo === "tarea" && item.tareaId !== undefined) {
          const id = item.tareaId;
          const casilla = crear("input", "agenda-check") as HTMLInputElement;
          casilla.type = "checkbox";
          casilla.checked = item.hecha === true;
          casilla.title = "Marcar como hecha";
          if (casilla.checked) fila.classList.add("hecha");
          casilla.addEventListener("change", () => {
            fila.classList.toggle("hecha", casilla.checked);
            this.opciones.alMarcarTarea?.(id, casilla.checked);
          });
          texto.prepend(casilla);
        }
        fila.append(horaEl, barra, texto);
        bloque.append(fila);
      }
      partes.push(bloque);
    }

    if (estado.dias.length === 0 && !tarjetaPropuestas) {
      const e = explicarAgenda(estado, { desarrollo: this.opciones.desarrollo === true });
      const caja = crear("div", "tarjeta agenda-explicacion");
      const t = crear("div", "tarjeta-titulo");
      t.textContent = e.titulo;
      const d = crear("p", "vacia-texto");
      d.textContent = e.texto;
      caja.append(t, d);
      if (e.boton) {
        const accion = e.boton.accion;
        const b = boton("boton boton-fila", e.boton.texto);
        b.addEventListener("click", () => this.opciones.alAccionAgenda?.(accion));
        caja.append(b);
      }
      partes.push(caja);
    }
    this.agenda.replaceChildren(...partes);
  }

  /** ¿Se está viendo Estudio? (main la refresca cuando cambian los ramos, el calendario o el aula). */
  get estudioAbierto(): boolean {
    return this.visible && this.pestana === "estudio";
  }

  /**
   * La pestaña Estudio: tus ramos con su color. Tocar uno abre su ficha (próximas clases, entregas, tareas
   * y transcripciones); lo que se sugiere agregar sale del aula y del calendario y nada se crea solo.
   */
  mostrarEstudio(estado: EstadoEstudio | null = this.estadoEstudio): void {
    this.estadoEstudio = estado;
    if (!estado) return;
    const ahora = Date.now();
    const partes: HTMLElement[] = [];
    const cabecera = crear("div", "agenda-cabecera");
    const titulo = crear("span", "agenda-titulo");
    titulo.textContent = "Tus ramos";
    cabecera.append(titulo);
    partes.push(cabecera);

    if (this.errorEstudio) {
      const error = crear("p", "estudio-error");
      error.textContent = this.errorEstudio;
      partes.push(error);
    }

    if (estado.fichas.length === 0) {
      const vacia = crear("p", "vacia-texto");
      vacia.textContent = TEXTO_SIN_RAMOS;
      partes.push(vacia);
    }
    for (const ficha of estado.fichas) partes.push(this.tarjetaRamo(ficha, estado, ahora));

    if (estado.sugerencias.length > 0) {
      const caja = crear("div", "tarjeta estudio-sugerencias");
      const t = crear("div", "tarjeta-titulo");
      t.textContent = "¿Son tus ramos?";
      caja.append(t);
      for (const s of estado.sugerencias) {
        const fila = crear("div", "estudio-sugerencia");
        const texto = crear("span", "estudio-sugerencia-texto");
        texto.textContent = textoSugerencia(s);
        const agregar = boton("pildora", "Agregar");
        agregar.addEventListener("click", () => void this.crearRamoDesde(s.nombre, []));
        fila.append(texto, agregar);
        caja.append(fila);
      }
      partes.push(caja);
    }

    const formulario = crear("form", "estudio-nuevo");
    const campo = crear("input", "estudio-campo") as HTMLInputElement;
    campo.placeholder = "Agregar un ramo (por ejemplo, Cálculo II)";
    campo.maxLength = 60;
    campo.setAttribute("aria-label", "Nombre del ramo");
    const aliasCampo = crear("input", "estudio-campo") as HTMLInputElement;
    aliasCampo.placeholder = "Palabras clave, separadas por coma (opcional)";
    aliasCampo.title = "Con estas palabras Brote reconoce el ramo en tu calendario y en tu aula";
    aliasCampo.setAttribute("aria-label", "Palabras clave del ramo");
    const enviar = boton("pildora", "Agregar");
    enviar.type = "submit";
    formulario.append(campo, aliasCampo, enviar);
    formulario.addEventListener("submit", (e) => {
      e.preventDefault();
      if (campo.value.trim()) void this.crearRamoDesde(campo.value, leerAlias(aliasCampo.value));
    });
    partes.push(formulario);
    this.estudio.replaceChildren(...partes);
  }

  private async crearRamoDesde(nombre: string, alias: string[]): Promise<void> {
    try {
      await this.opciones.alCrearRamo?.(nombre, alias);
      this.errorEstudio = "";
    } catch (error) {
      this.errorEstudio = error instanceof Error ? error.message : "No pude agregar el ramo.";
    }
    this.mostrarEstudio();
    this.opciones.alPedirEstudio?.();
  }

  private tarjetaRamo(ficha: FichaRamo, estado: EstadoEstudio, ahora: number): HTMLElement {
    const { ramo } = ficha;
    const abierto = this.ramoAbierto === ramo.id;
    const caja = crear("div", `tarjeta estudio-ramo${abierto ? " abierto" : ""}`);
    caja.style.setProperty("--ramo", HEX_RAMO[ramo.color]);
    const fila = crear("button", "estudio-ramo-cabecera");
    fila.type = "button";
    fila.setAttribute("aria-expanded", String(abierto));
    const punto = crear("span", "estudio-punto");
    const nombre = crear("span", "estudio-nombre");
    nombre.textContent = ramo.nombre;
    const resumen = crear("span", "estudio-resumen");
    const notasDe = estado.notas?.find((f) => f.ramoId === ramo.id);
    const partesResumen = [resumenDeFicha(ficha), notasDe ? resumenNotas(notasDe) : ""].filter(Boolean);
    resumen.textContent = partesResumen.join(" · ");
    fila.append(punto, nombre, resumen);
    fila.addEventListener("click", () => {
      this.ramoAbierto = abierto ? null : ramo.id;
      this.ramoEditando = null;
      this.mostrarEstudio();
    });
    caja.append(fila);
    if (!abierto) return caja;

    const cuerpo = crear("div", "estudio-ramo-cuerpo");
    const lista = (titulo: string, items: { texto: string; cuando: string }[]) => {
      if (items.length === 0) return;
      const t = crear("div", "estudio-seccion");
      t.textContent = titulo;
      cuerpo.append(t);
      for (const item of items) {
        const f = crear("div", "estudio-item");
        const a = crear("span", "estudio-item-texto");
        a.textContent = item.texto;
        const b = crear("span", "estudio-item-cuando");
        b.textContent = item.cuando;
        f.append(a, b);
        cuerpo.append(f);
      }
    };
    lista("Próximas clases", ficha.clases.map((c) => ({ texto: c.titulo, cuando: cuandoClase(c.inicioMs, ahora) })));
    lista("Entregas", ficha.entregas.map((e) => ({ texto: e.titulo, cuando: cuandoVence(e.entregaMs, ahora) })));
    lista("Tareas", ficha.tareas.map((t) => ({ texto: t.titulo, cuando: cuandoVence(t.venceMs, ahora) })));
    if (resumenDeFicha(ficha) === "") {
      const vacio = crear("p", "vacia-texto");
      vacio.textContent = explicarFichaVacia(estado.fuentes, ramo.alias.length > 0);
      cuerpo.append(vacio);
    }

    cuerpo.append(this.bloqueNotas(ramo.id, estado));

    if (this.ramoEditando === ramo.id) {
      const formulario = crear("form", "estudio-editar");
      const nombreCampo = crear("input", "estudio-campo") as HTMLInputElement;
      nombreCampo.value = ramo.nombre;
      nombreCampo.maxLength = 60;
      nombreCampo.setAttribute("aria-label", "Nombre del ramo");
      const aliasCampo = crear("input", "estudio-campo") as HTMLInputElement;
      aliasCampo.value = aliasParaEditar(ramo.alias);
      aliasCampo.placeholder = "Palabras clave, separadas por coma";
      aliasCampo.setAttribute("aria-label", "Palabras clave del ramo");
      const colores = crear("div", "estudio-colores");
      let elegido = ramo.color;
      for (const [color, hex] of Object.entries(HEX_RAMO)) {
        const c = crear("button", `estudio-color${color === elegido ? " activa" : ""}`);
        c.type = "button";
        c.title = color;
        c.setAttribute("aria-label", `Color ${color}`);
        c.style.background = hex;
        c.addEventListener("click", () => {
          elegido = color as typeof elegido;
          for (const otro of colores.children) otro.classList.remove("activa");
          c.classList.add("activa");
        });
        colores.append(c);
      }
      const guardar = boton("pildora", "Guardar");
      guardar.type = "submit";
      const cancelar = boton("pildora", "Cancelar");
      cancelar.addEventListener("click", () => {
        this.ramoEditando = null;
        this.mostrarEstudio();
      });
      formulario.append(nombreCampo, aliasCampo, colores, guardar, cancelar);
      formulario.addEventListener("submit", (e) => {
        e.preventDefault();
        void (this.opciones.alEditarRamo?.(ramo.id, { nombre: nombreCampo.value, alias: leerAlias(aliasCampo.value), color: elegido }) ?? Promise.resolve()).then(
          () => {
            this.errorEstudio = "";
            this.ramoEditando = null;
            this.opciones.alPedirEstudio?.();
          },
          (error) => {
            this.errorEstudio = error instanceof Error ? error.message : "No pude guardar los cambios.";
            this.mostrarEstudio();
          },
        );
      });
      cuerpo.append(formulario);
    } else {
      const acciones = crear("div", "estudio-acciones");
      const editar = boton("pildora", "Editar");
      editar.addEventListener("click", () => {
        this.ramoEditando = ramo.id;
        this.mostrarEstudio();
      });
      const archivar = boton("pildora", "Archivar");
      archivar.title = "Sale de la lista; sus tareas y grabaciones no se borran";
      archivar.addEventListener("click", () => {
        void (this.opciones.alArchivarRamo?.(ramo.id) ?? Promise.resolve()).then(() => {
          this.ramoAbierto = null;
          this.opciones.alPedirEstudio?.();
        });
      });
      acciones.append(editar, archivar);
      cuerpo.append(acciones);
    }
    caja.append(cuerpo);
    return caja;
  }


  /** Notas (A2): evaluaciones con su nota editable, la barra de promedio y lo que hay que sacar para aprobar. */
  private bloqueNotas(ramoId: number, estado: EstadoEstudio): HTMLElement {
    const ficha = estado.notas?.find((f) => f.ramoId === ramoId);
    const caja = crear("div", "notas");
    const titulo = crear("div", "estudio-seccion");
    titulo.textContent = "Notas";
    caja.append(titulo);
    const fallo = (error: unknown) => {
      this.errorNotas = error instanceof Error ? error.message : "No pude guardar.";
      this.mostrarEstudio();
    };
    const hecho = () => {
      this.errorNotas = "";
      this.evaluacionEditando = null;
      this.evaluacionNueva = null;
      this.opciones.alPedirEstudio?.();
    };
    if (this.errorNotas) {
      const error = crear("p", "estudio-error");
      error.textContent = this.errorNotas;
      caja.append(error);
    }
    if (ficha && ficha.evaluaciones.length > 0) {
      const color = HEX_SEMAFORO[semaforoDe(ficha)];
      const meta = crear("p", "notas-meta");
      meta.textContent = textoMeta(ficha);
      meta.style.color = color;
      caja.append(meta);
      if (ficha.calculo.avisoPeso) {
        const aviso = crear("p", "vacia-texto");
        aviso.textContent = ficha.calculo.avisoPeso;
        caja.append(aviso);
      }
      // Barra de 1,0 a 7,0: el promedio y la línea de aprobación.
      const barra = crear("div", "notas-barra");
      barra.setAttribute("role", "img");
      barra.setAttribute("aria-label", ficha.calculo.promedio === null ? "Sin promedio" : `Promedio ${formatearNota(ficha.calculo.promedio)}, se aprueba con ${formatearNota(ficha.ajustes.aprobacion)}`);
      if (ficha.calculo.promedio !== null) {
        const relleno = crear("div", "notas-barra-relleno");
        relleno.style.width = `${posicionEnBarra(ficha.calculo.promedio)}%`;
        relleno.style.background = color;
        barra.append(relleno);
      }
      const linea = crear("div", "notas-barra-linea");
      linea.style.left = `${posicionEnBarra(ficha.ajustes.aprobacion)}%`;
      linea.title = `Se aprueba con ${formatearNota(ficha.ajustes.aprobacion)}`;
      barra.append(linea);
      caja.append(barra);
      for (const e of ficha.evaluaciones) caja.append(this.filaEvaluacion(e, textoNecesaria(ficha.necesarias[e.id]), fallo, hecho));
      const examen = textoExamenFicha(ficha);
      if (examen) {
        const f = crear("div", "estudio-item");
        const t = crear("span", "estudio-item-texto");
        t.textContent = examen;
        f.append(t);
        caja.append(f);
      }
    } else {
      const vacia = crear("p", "vacia-texto");
      vacia.textContent = "Agrega tus evaluaciones (certamen 1, 30 %…) y Brote te dice cuánto necesitas para aprobar.";
      caja.append(vacia);
    }
    if (this.evaluacionNueva === ramoId) {
      const formulario = crear("form", "estudio-editar");
      const nombreCampo = crear("input", "estudio-campo") as HTMLInputElement;
      nombreCampo.placeholder = "Evaluación (por ejemplo, Certamen 1)";
      nombreCampo.maxLength = 60;
      nombreCampo.setAttribute("aria-label", "Nombre de la evaluación");
      const pesoCampo = crear("input", "estudio-campo") as HTMLInputElement;
      pesoCampo.placeholder = "Peso en %";
      pesoCampo.inputMode = "numeric";
      pesoCampo.setAttribute("aria-label", "Peso de la evaluación en porcentaje");
      const guardar = boton("pildora", "Agregar");
      guardar.type = "submit";
      const cancelar = boton("pildora", "Cancelar");
      cancelar.addEventListener("click", () => {
        this.evaluacionNueva = null;
        this.mostrarEstudio();
      });
      formulario.append(nombreCampo, pesoCampo, guardar, cancelar);
      formulario.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const peso = leerCampoPeso(pesoCampo.value);
        if (!peso.ok) return fallo(new Error(peso.motivo));
        void (this.opciones.alGuardarEvaluacion?.({ ramo: ramoId, nombre: nombreCampo.value, peso: peso.peso }) ?? Promise.resolve()).then(hecho, fallo);
      });
      caja.append(formulario);
    } else {
      const acciones = crear("div", "estudio-acciones");
      const nueva = boton("pildora", "+ Evaluación");
      nueva.addEventListener("click", () => {
        this.evaluacionNueva = ramoId;
        this.mostrarEstudio();
      });
      acciones.append(nueva);
      caja.append(acciones);
    }
    return caja;
  }

  private filaEvaluacion(e: { id: number; nombre: string; peso: number; nota: number | null }, necesita: string, fallo: (e: unknown) => void, hecho: () => void): HTMLElement {
    const fila = crear("div", "estudio-item notas-fila");
    const nombre = crear("span", "estudio-item-texto");
    nombre.textContent = `${e.nombre} · ${e.peso} %`;
    fila.append(nombre);
    if (this.evaluacionEditando === e.id) {
      const campo = crear("input", "estudio-campo notas-campo") as HTMLInputElement;
      campo.value = e.nota === null ? "" : formatearNota(e.nota);
      campo.placeholder = "5,5";
      campo.inputMode = "decimal";
      campo.setAttribute("aria-label", `Nota de ${e.nombre}`);
      const guardar = boton("pildora", "Guardar");
      const quitar = boton("pildora", "Borrar");
      quitar.title = "Borra la evaluación (no se puede deshacer)";
      const enviar = () => {
        const n = leerCampoNota(campo.value);
        if (!n.ok) return fallo(new Error(n.motivo));
        void (this.opciones.alGuardarEvaluacion?.({ evaluacion: e.id, nota: n.nota }) ?? Promise.resolve()).then(hecho, fallo);
      };
      guardar.addEventListener("click", enviar);
      campo.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") enviar();
      });
      quitar.addEventListener("click", () => void (this.opciones.alBorrarEvaluacion?.(e.id) ?? Promise.resolve()).then(hecho, fallo));
      fila.append(campo, guardar, quitar);
      queueMicrotask(() => campo.focus());
      return fila;
    }
    const cuando = crear("button", "estudio-item-cuando notas-nota") as HTMLButtonElement;
    cuando.type = "button";
    cuando.textContent = e.nota === null ? (necesita || "pendiente") : formatearNota(e.nota);
    cuando.title = "Tocar para poner o cambiar la nota";
    cuando.addEventListener("click", () => {
      this.evaluacionEditando = e.id;
      this.mostrarEstudio();
    });
    fila.append(cuando);
    return fila;
  }

  /** Las propuestas de tareas y fechas de una grabación (las deja Brote por MCP); la lista cambia por aviso del puente. */
  ponerPropuestasAgenda(lista: PropuestaAgenda[]): void {
    this.propuestasAgenda = lista;
    if (!lista.some((p) => p.id === this.propuestaEditando)) this.propuestaEditando = null;
    if (this.estadoAgenda) this.mostrarAgenda();
  }

  /** La tarjeta «Encontré N cosas en tu grabación», con Agregar / Descartar por fila y editar antes de agregar. */
  private tarjetaPropuestasAgenda(): HTMLElement | null {
    const lista = this.propuestasAgenda;
    if (lista.length === 0) {
      if (!this.mensajePropuestas) return null;
      const aviso = crear("p", "vacia-texto");
      aviso.textContent = this.mensajePropuestas;
      return aviso;
    }
    const calendario = this.estadoAgenda?.fuentes.calendario === true;
    const caja = crear("div", "tarjeta propuestas-agenda");
    const titulo = crear("div", "tarjeta-titulo");
    titulo.textContent = tituloDeTarjeta(lista.length);
    caja.append(titulo);
    const decidir = (id: number, decision: "aceptar" | "descartar", cambios?: { titulo: string; fecha: string }) => {
      void (this.opciones.alDecidirPropuestaAgenda?.(id, decision, cambios) ?? Promise.resolve("")).then(
        (mensaje) => {
          this.mensajePropuestas = mensaje || null;
          this.propuestaEditando = null;
          this.mostrarAgenda();
        },
        (error) => {
          this.mensajePropuestas = String(error).replace(/^Error: /, "");
          this.mostrarAgenda();
        },
      );
    };
    for (const p of lista) {
      const fila = crear("div", "propuesta-agenda");
      const editando = this.propuestaEditando === p.id;
      const cabecera = crear("div", "propuesta-agenda-cabecera");
      const tipo = crear("span", `propuesta-agenda-tipo ${p.tipo}`);
      tipo.textContent = etiquetaDeTipo(p.tipo);
      cabecera.append(tipo);
      fila.append(cabecera);
      if (editando) {
        const titulo = crear("input", "propuesta-agenda-campo") as HTMLInputElement;
        titulo.value = p.titulo;
        titulo.maxLength = 120;
        titulo.setAttribute("aria-label", "Título");
        const fecha = crear("input", "propuesta-agenda-campo") as HTMLInputElement;
        fecha.value = fechaParaEditar(p);
        fecha.placeholder = p.conHora ? "AAAA-MM-DD HH:MM" : "AAAA-MM-DD";
        fecha.setAttribute("aria-label", "Fecha");
        const botones = crear("div", "aprobacion-botones");
        const guardar = boton("boton", "Agregar");
        guardar.addEventListener("click", () => decidir(p.id, "aceptar", { titulo: titulo.value, fecha: fecha.value }));
        const cancelar = boton("boton boton-fila", "Cancelar");
        cancelar.addEventListener("click", () => {
          this.propuestaEditando = null;
          this.mostrarAgenda();
        });
        botones.append(cancelar, guardar);
        fila.append(titulo, fecha, botones);
      } else {
        const t = crear("div", "propuesta-agenda-titulo");
        t.textContent = p.titulo;
        const f = crear("div", "propuesta-agenda-fecha");
        f.textContent = [fechaDePropuesta(p), p.detalle].filter(Boolean).join(" · ");
        const d = crear("div", "propuesta-agenda-destino");
        d.textContent = destinoDePropuesta(p.tipo, calendario);
        const botones = crear("div", "aprobacion-botones");
        const descartar = boton("boton boton-fila", "Descartar");
        descartar.addEventListener("click", () => decidir(p.id, "descartar"));
        const editar = boton("boton boton-fila", "Editar");
        editar.addEventListener("click", () => {
          this.propuestaEditando = p.id;
          this.mostrarAgenda();
        });
        const agregar = boton("boton", "Agregar");
        agregar.addEventListener("click", () => decidir(p.id, "aceptar"));
        botones.append(descartar, editar, agregar);
        fila.append(t, f, d, botones);
      }
      caja.append(fila);
    }
    if (lista.length > 1) {
      const todo = boton("boton boton-fila", "Agregar todo");
      todo.title = "Agrega cada una como está (tareas a la Agenda, pruebas con hora al calendario)";
      todo.addEventListener("click", () => {
        for (const p of lista) decidir(p.id, "aceptar");
      });
      caja.append(todo);
    }
    return caja;
  }

  /** La próxima entrega del aula (Canvas o Moodle) y cuánto falta; o por qué no se pudo leer. */
  mostrarAula(estado: EstadoAula): void {
    const proxima = estado.proxima;
    const visible = estado.configurada && (proxima !== null || estado.error !== null);
    this.conDatos.aula = visible;
    this.datosPildoras.aula = proxima;
    if (visible) {
      const etiqueta = crear("div", "tarjeta-etiqueta");
      etiqueta.append(icono("entrega"), estado.pendientes > 1 ? ` Entregas · ${estado.pendientes}` : " Entregas");
      const titulo = crear("div", "tarjeta-titulo");
      const detalle = crear("div", "tarjeta-detalle");
      if (proxima) {
        titulo.textContent = proxima.titulo;
        detalle.textContent = `${venceEn(proxima.entregaMs, Date.now())} · ${proxima.curso}`;
        this.tarjetaAula.title = `${proxima.titulo} (${proxima.curso})`;
      } else {
        titulo.textContent = "No pude leer tu aula";
        detalle.textContent = estado.error ?? "";
        this.tarjetaAula.title = estado.error ?? "";
      }
      this.tarjetaAula.replaceChildren(etiqueta, titulo, detalle);
      this.tarjetaAula.classList.toggle("pronto", proxima !== null && proxima.entregaMs - Date.now() <= 24 * 3_600_000);
      this.tarjetaAula.classList.toggle("con-error", proxima === null);
    }
    this.actualizarInicio();
  }

  /**
   * Modo programador: una tarjeta por sesión de Claude Code (como mucho tres) con sus últimos pasos,
   * y arriba los permisos que piden, con Permitir y Rechazar.
   */
  mostrarProgramador(estado: EstadoProgramador): void {
    const sesiones = estado.sesiones.slice(0, 3);
    const pasos = new Map<string, string[]>();
    for (const s of sesiones) pasos.set(s.id, agregarPaso(this.pasos.get(s.id) ?? [], s.actividad));
    this.pasos = pasos;
    this.sesiones.replaceChildren(...sesiones.map((s) => this.tarjetaSesion(s, pasos.get(s.id) ?? [])));
    this.sesiones.hidden = sesiones.length === 0;

    const puedeDecidir = !!this.opciones.alDecidirPermisoClaude;
    this.hayPermisoClaude = estado.permisos.length > 0;
    this.permisosClaude.replaceChildren(
      ...estado.permisos.map((p) => {
        const caja = crear("div", "aprobacion permiso-claude");
        const titulo = crear("p", "aprobacion-titulo");
        titulo.textContent = `${p.proyecto} · ${p.titulo}`;
        const detalle = crear("code", "aprobacion-detalle");
        detalle.textContent = p.detalle;
        detalle.hidden = !p.detalle;
        const botones = crear("div", "aprobacion-botones");
        const rechazar = boton("boton", "Rechazar");
        const permitir = boton("boton boton-primario", "Permitir");
        for (const [b, decision] of [[rechazar, "deny"], [permitir, "allow"]] as const) {
          b.addEventListener("click", () => {
            rechazar.disabled = permitir.disabled = true;
            this.opciones.alDecidirPermisoClaude?.(p.id, decision);
          });
        }
        botones.append(rechazar, permitir);
        caja.append(titulo, detalle, botones);
        return caja;
      }),
    );
    this.permisosClaude.hidden = estado.permisos.length === 0 || !puedeDecidir;
    this.codigoVacio.hidden = sesiones.length > 0 || estado.permisos.length > 0;

    // Un permiso nuevo lleva a la pestaña Claude (salvo que Brote mismo esté pidiendo algo).
    const nuevos = estado.permisos.filter((p) => !this.permisosVistos.has(p.id));
    this.permisosVistos = new Set(estado.permisos.map((p) => p.id));
    if (nuevos.length > 0 && puedeDecidir && !(this.pestana === "brote" && this.conversacionPendiente())) this.elegir("claude");

    // El resumen en Inicio: cuántas sesiones y qué hace la más reciente.
    const reciente = [...sesiones].sort((a, b) => b.ultimaActividadMs - a.ultimaActividadMs)[0];
    this.conDatos.claude = reciente !== undefined;
    this.datosPildoras.claude = { sesiones: sesiones.length, pideProyecto: estado.permisos[0]?.proyecto ?? null };
    if (reciente) {
      const etiqueta = crear("div", "tarjeta-etiqueta");
      etiqueta.append(icono("codigo"), ` Claude Code · ${sesiones.length === 1 ? "1 sesión" : `${sesiones.length} sesiones`}`);
      const detalle = crear("div", "tarjeta-detalle");
      detalle.textContent = estado.permisos.length > 0 ? `${estado.permisos[0].proyecto} pide permiso` : `${reciente.proyecto} · ${reciente.actividad}`;
      this.tarjetaClaude.replaceChildren(etiqueta, detalle);
      this.tarjetaClaude.classList.toggle("pide", estado.permisos.length > 0);
    }
    this.hayActividadClaude = sesiones.length > 0 || estado.permisos.length > 0;
    this.actualizarPestanas();
    this.actualizarPuntos();
    this.actualizarInicio();
  }

  /**
   * El uso del plan de Claude: dos barras (sesión de 5 h y semana) con su % y cuándo se reinician; sin
   * datos, cómo conseguirlos. Debajo, los tokens de hoy o de 7 días (Brote y tus sesiones) con su valor
   * API, lo que más gasta y los precios de los modelos usados, plegados. Se repinta solo cada tanto
   * (main.ts) para que "hace 3 min" no quede viejo.
   */
  /**
   * El equipo de Brote en la pestaña Brote: el escenario con las mascotas (sus lugares con el globito
   * y "🔎 Investigador · Gemini"; el dibujo lo pone main.ts), las fichas de los que ya terminaron, la
   * conversación de uno abierta y "Ver a todos". Main lo repinta cada segundo (los que terminaron
   * celebran un rato y se esconden).
   */
  mostrarEspecialistas(lista: Trabajando[] = this.especialistas): void {
    this.especialistas = lista;
    const ahora = Date.now();
    this.enEscena = mascotasEnEscena(lista, ahora);
    this.pintarEscenario();
    this.pintarFichas(terminadosALaMano(lista, ahora));
    if (this.abierto && !lista.some((t) => t.sesion === this.abierto)) this.cerrarEspecialista();
    else if (this.abierto) this.pintarConversacionEquipo();
    if (this.verTodosActivo) this.pintarTodos();
  }

  private pintarEscenario(): void {
    const enEscena = this.enEscena;
    this.escenario.hidden = enEscena.length === 0;
    const trabajando = enEscena.some((t) => t.estado === "trabajando");
    this.escenarioTitulo.textContent = trabajando ? (enEscena.length === 1 ? "Le pasé la tarea a mi equipo" : "Mi equipo está trabajando") : "¡Mi equipo terminó! 🎉";
    this.botonVerTodos.hidden = !trabajando;
    const vivas = new Set(enEscena.map((t) => t.sesion));
    for (const [clave, lugar] of this.lugares) {
      if (!vivas.has(clave)) {
        lugar.boton.remove();
        this.lugares.delete(clave);
      }
    }
    for (const t of enEscena) {
      let lugar = this.lugares.get(t.sesion);
      if (!lugar) {
        const b = crear("button", "lugar-mascota");
        b.type = "button";
        const globo = crear("span", "globo");
        const hueco = crear("span", "hueco-mascota");
        const nombre = crear("span", "mascota-nombre");
        const ia = crear("span", "mascota-ia");
        b.append(globo, hueco, nombre, ia);
        const sesion = t.sesion;
        b.addEventListener("click", () => this.abrirEspecialista(sesion));
        lugar = { boton: b, globo, nombre, ia, hueco };
        this.lugares.set(t.sesion, lugar);
      }
      const visual = visualDe(t);
      lugar.boton.className = `lugar-mascota ${visual}`;
      lugar.boton.title = `${nombreConIA(t)} · ${TEXTO_VISUAL[visual]}${t.tarea ? `\n${t.tarea}` : ""}\nToca para ver su conversación`;
      lugar.globo.textContent = globoDe(t);
      lugar.nombre.textContent = t.nombre;
      lugar.ia.textContent = t.ia ? `· ${t.ia}` : "";
      lugar.ia.style.color = t.color ?? "";
      // En el orden de la lista (los que trabajan primero).
      this.escenarioFila.append(lugar.boton);
    }
  }

  private pintarFichas(terminados: Trabajando[]): void {
    const texto = JSON.stringify(terminados.map((t) => [t.sesion, t.estado]));
    if (texto === this.fichasPintadas) return;
    this.fichasPintadas = texto;
    this.fichasEquipo.hidden = terminados.length === 0;
    const titulo = crear("span", "fichas-titulo");
    titulo.textContent = "Lo que hizo tu equipo:";
    this.fichasEquipo.replaceChildren(
      titulo,
      ...terminados.map((t) => {
        const b = boton("pildora", `${t.emoji} ${t.nombre} ${t.estado === "termino" ? "✓" : "!"}`);
        b.title = `Ver la conversación de ${nombreConIA(t)}`;
        b.addEventListener("click", () => this.abrirEspecialista(t.sesion));
        return b;
      }),
    );
  }

  /** Abre la conversación de un especialista (tarea, pasos y respuesta) en la pestaña Brote. */
  abrirEspecialista(sesion: string): void {
    this.abierto = sesion;
    this.elegir("brote");
    this.vistaBrote.classList.add("con-equipo");
    this.conversacionEquipo.hidden = false;
    this.pintarConversacionEquipo();
    this.vistaBrote.scrollTop = 0;
  }

  cerrarEspecialista(): void {
    this.abierto = null;
    this.vistaBrote.classList.remove("con-equipo");
    this.conversacionEquipo.hidden = true;
    this.conversacionEquipo.replaceChildren();
  }

  /** El historial que llegó del Gateway completa lo que no trajeron los eventos. */
  mostrarHistorial(sesion: string, historial: HistorialEspecialista): void {
    this.historiales.set(sesion, historial);
    if (this.abierto === sesion) this.pintarConversacionEquipo();
    if (this.verTodosActivo) this.pintarTodos();
  }

  /** Los datos de un especialista con lo que haya llegado del historial (si los eventos no alcanzaron). */
  private completo(t: Trabajando): { tarea: string | null; pasos: PasoVisible[]; respuesta: string } {
    const h = this.historiales.get(t.sesion);
    const pasos = t.pasos && t.pasos.length > 0 ? t.pasos : (h?.pasos ?? []);
    return {
      tarea: t.tareaCompleta ?? t.tarea ?? h?.tarea ?? null,
      pasos: pasosVisibles({ pasos }),
      respuesta: t.respuesta || h?.respuesta || "",
    };
  }

  private pintarConversacionEquipo(): void {
    const t = this.especialistas.find((e) => e.sesion === this.abierto);
    if (!t) return;
    const datos = this.completo(t);
    // Terminó y no hay qué mostrar (por ejemplo, el puente partió a mitad): se pide su historial, una vez.
    if (t.estado !== "trabajando" && datos.pasos.length === 0 && !datos.respuesta && !this.historialPedido.has(t.sesion)) {
      this.historialPedido.add(t.sesion);
      this.opciones.alPedirHistorial?.(t.sesion);
    }
    const cabecera = crear("div", "conversacion-cabecera");
    const volver = boton("enlace-vista volver", "");
    volver.append(icono("volver"), document.createTextNode(" volver"));
    volver.addEventListener("click", () => this.cerrarEspecialista());
    const titulo = crear("span", "conversacion-titulo");
    titulo.textContent = `${t.emoji} ${t.nombre}`;
    const ia = crear("span", "mascota-ia");
    ia.textContent = t.ia ? `· ${t.ia}` : "";
    ia.style.color = t.color ?? "";
    const visual = visualDe(t);
    const estado = crear("span", `chip ${visual === "termino" ? "lista" : visual === "fallo" ? "error" : visual === "permiso" ? "permiso" : "pensando"}`);
    estado.textContent = TEXTO_VISUAL[visual];
    cabecera.append(volver, titulo, ia, estado);
    this.conversacionEquipo.replaceChildren(cabecera, ...cuerpoConversacion(datos, t.estado === "trabajando"));
  }

  /** Si "Ver a todos" está abierto. */
  get verTodosAbierto(): boolean {
    return this.verTodosActivo;
  }

  /** Abre o cierra "Ver a todos" (main agranda la isla y la cierra sola cuando el equipo termina). */
  verTodos(si: boolean): void {
    if (si === this.verTodosActivo) return;
    this.verTodosActivo = si;
    this.raiz.classList.toggle("todos", si);
    if (si) this.pintarTodos();
    else {
      this.columnas.clear();
      this.vistaTodos.querySelector(".todos-columnas")!.replaceChildren();
    }
  }

  /** Las columnas: Brote y hasta 3 especialistas, con sus pasos y su respuesta en vivo. */
  private pintarTodos(): void {
    const fila = this.vistaTodos.querySelector<HTMLDivElement>(".todos-columnas")!;
    const lista = columnasTodos(this.especialistas);
    const claves = ["brote", ...lista.map((t) => t.sesion)];
    for (const [clave, columna] of this.columnas) {
      if (!claves.includes(clave)) {
        columna.caja.remove();
        this.columnas.delete(clave);
      }
    }
    for (const clave of claves) {
      let columna = this.columnas.get(clave);
      if (!columna) {
        const caja = crear("div", clave === "brote" ? "columna-todos brote" : "columna-todos");
        const cabeza = crear("div", "columna-cabeza");
        const hueco = crear("span", "hueco-mascota chico");
        const textos = crear("div", "columna-textos");
        const nombre = crear("span", "conversacion-titulo");
        const estado = crear("span", "columna-estado");
        textos.append(nombre, estado);
        cabeza.append(hueco, textos);
        const cuerpo = crear("div", "columna-cuerpo");
        caja.append(cabeza, cuerpo);
        columna = { caja, hueco, estado, cuerpo, pintado: "" };
        this.columnas.set(clave, columna);
      }
      fila.append(columna.caja);
      const nombre = columna.caja.querySelector<HTMLSpanElement>(".conversacion-titulo")!;
      if (clave === "brote") {
        const c = this.agente.conversacion;
        nombre.textContent = "Brote";
        columna.estado.textContent = c.herramienta?.etiqueta ?? (ocupado(c) ? "Coordinando al equipo…" : c.terminada ? "Listo ✓" : "En reposo");
        const datos = { tarea: c.mensajeUsuario, pasos: [] as PasoVisible[], respuesta: c.error ?? c.respuesta };
        this.pintarColumna(columna, datos, ocupado(c), "Tu pregunta");
        continue;
      }
      const t = lista.find((e) => e.sesion === clave)!;
      // Sin emoji: la mascota ya está al lado.
      nombre.replaceChildren(document.createTextNode(`${t.nombre} `));
      const ia = crear("span", "mascota-ia");
      ia.textContent = t.ia ? `· ${t.ia}` : "";
      ia.style.color = t.color ?? "";
      nombre.append(ia);
      columna.caja.className = `columna-todos ${visualDe(t)}`;
      columna.estado.textContent = globoDe(t);
      this.pintarColumna(columna, this.completo(t), t.estado === "trabajando");
    }
  }

  private pintarColumna(
    columna: { cuerpo: HTMLDivElement; pintado: string },
    datos: { tarea: string | null; pasos: PasoVisible[]; respuesta: string },
    escribiendo: boolean,
    tituloTarea = "Tarea",
  ): void {
    const texto = JSON.stringify([datos, escribiendo]);
    if (texto === columna.pintado) return;
    columna.pintado = texto;
    // Si el usuario estaba leyendo más arriba, no se le mueve; si estaba al final, sigue al final.
    const alFinal = columna.cuerpo.scrollTop + columna.cuerpo.clientHeight >= columna.cuerpo.scrollHeight - 8;
    columna.cuerpo.replaceChildren(...cuerpoConversacion(datos, escribiendo, tituloTarea));
    if (alFinal) columna.cuerpo.scrollTop = columna.cuerpo.scrollHeight;
  }

  /**
   * Dónde van las mascotas ahora (en píxeles de la ventana): en el escenario o, con "Ver a todos", en
   * la cabecera de su columna. Vacío si el panel no se ve.
   */
  lugaresMascotas(): Lugar[] {
    if (!this.visible) return [];
    const lugar = (t: Trabajando, hueco: HTMLElement, radio: number): Lugar | null => {
      const r = hueco.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { clave: t.sesion, id: t.id, x: r.left + r.width / 2, suelo: r.bottom - 1, radio, visual: visualDe(t) };
    };
    if (this.verTodosActivo) {
      return columnasTodos(this.especialistas)
        .map((t) => {
          const columna = this.columnas.get(t.sesion);
          return columna ? lugar(t, columna.hueco, 10) : null;
        })
        .filter((l): l is Lugar => l !== null);
    }
    if (this.pestana !== "brote") return [];
    return this.enEscena.map((t) => lugar(t, this.lugares.get(t.sesion)!.hueco, 15)).filter((l): l is Lugar => l !== null);
  }

  /** Con "Ver a todos", dónde va Brote (la cabecera de su columna). */
  lugarBrote(): { x: number; suelo: number; radio: number } | null {
    const columna = this.verTodosActivo && this.visible ? this.columnas.get("brote") : undefined;
    if (!columna) return null;
    const r = columna.hueco.getBoundingClientRect();
    if (r.width === 0) return null;
    return { x: r.left + r.width / 2, suelo: r.bottom - 1, radio: 11 };
  }

  /** Si el equipo terminó todo (main cierra "Ver a todos" un rato después). */
  get equipoTerminado(): boolean {
    return equipoTermino(this.especialistas);
  }

  /** Si algún especialista está trabajando (el ala de la isla cerrada lo muestra). */
  get equipoTrabajando(): boolean {
    return this.especialistas.some((t) => t.estado === "trabajando");
  }

  /** Si hay especialistas en el turno (trabajando o recién terminados). */
  get hayEquipo(): boolean {
    return this.especialistas.length > 0;
  }

  /**
   * La pestaña Plata: este mes y cuánto puedes gastar hoy arriba, los últimos 7 días y las categorías
   * al medio (SVG y barras propias, armados solo con números), el descubrimiento, los últimos
   * movimientos y los botones de un toque. Se repinta con cada aviso "plata" (al anotar).
   */
  mostrarPlata(estado: EstadoPlata | null = this.estadoPlata): void {
    this.estadoPlata = estado;
    if (!estado) {
      this.plata.replaceChildren();
      return;
    }
    const ahora = Date.now();
    const partes: HTMLElement[] = [];

    // Este mes y "puedes gastar hoy".
    const cabecera = crear("div", "plata-cabecera");
    const mes = crear("div", "tarjeta plata-mes");
    const variacion = textoVariacion(estado.mes);
    const total = crear("div", "plata-cifra");
    total.textContent = formatearMonto(estado.mes.total);
    const nota = crear("div", `plata-variacion ${variacion.tono}`);
    nota.textContent = variacion.texto;
    nota.title = "Comparado con lo que llevabas el mes pasado a esta misma altura del mes";
    mes.append(etiquetaTarjeta(`Este mes · ${estado.mes.nombre}`), total, nota);
    const p = estado.presupuesto;
    if (p) {
      const avance = crear("div", `avance plata-avance ${p.color}`);
      const relleno = crear("i", "");
      relleno.style.width = `${Math.min(100, Math.max(2, p.porcentaje))}%`;
      avance.append(relleno);
      const de = crear("div", "tarjeta-detalle");
      de.textContent = `${p.porcentaje} % de ${formatearMonto(p.monto)}`;
      mes.append(avance, de);
    }
    const hoy = crear("div", `tarjeta plata-hoy ${p?.color ?? "sin"}`);
    if (p) {
      const { monto, detalle } = textoPuedesHoy(p);
      const cifra = crear("div", "plata-cifra");
      cifra.textContent = monto;
      const d = crear("div", "tarjeta-detalle");
      d.textContent = detalle;
      d.title = detalle;
      hoy.append(etiquetaTarjeta("Puedes gastar hoy"), cifra, d);
    } else {
      const invita = crear("p", "plata-invita");
      invita.textContent = "Ponle un presupuesto al mes y te digo cuánto puedes gastar cada día.";
      const poner = boton("boton boton-fila", "Poner presupuesto");
      poner.addEventListener("click", () => {
        this.entrada.value = "mi presupuesto es ";
        this.actualizarBotonEnviar();
        this.entrada.focus();
      });
      hoy.append(etiquetaTarjeta("Puedes gastar hoy"), invita, poner);
    }
    cabecera.append(mes, hoy);
    partes.push(cabecera);

    if (estado.mes.cantidad === 0 && estado.ultimos.length === 0) {
      const vacio = crear("p", "vacia-texto");
      vacio.textContent = "Todavía no anotas gastos. Prueba: «gasté 2 lucas en almuerzo».";
      partes.push(vacio);
      this.plata.replaceChildren(...partes);
      return;
    }

    // Últimos 7 días y por categoría.
    const graficos = crear("div", "plata-graficos");
    const semana = crear("div", "tarjeta plata-semana");
    semana.append(etiquetaTarjeta("Últimos 7 días"), graficoSemana(estado));
    const categorias = crear("div", "tarjeta plata-categorias");
    categorias.append(etiquetaTarjeta("Por categoría"));
    for (const c of estado.categorias.slice(0, 5)) {
      const fila = crear("div", "plata-categoria");
      fila.title = `${c.categoria}: ${formatearMonto(c.total)} (${Math.round(c.fraccion * 100)} %)`;
      const nombre = crear("span", "plata-categoria-nombre");
      nombre.textContent = `${c.emoji} ${c.categoria}`;
      const valor = crear("span", "plata-categoria-valor");
      valor.textContent = montoCorto(c.total);
      const barra = crear("div", "avance");
      const relleno = crear("i", "");
      relleno.style.width = `${Math.max(3, c.fraccion * 100).toFixed(1)}%`;
      // El color sale de una lista cerrada del motor (COLOR_CATEGORIA), nunca de texto de afuera.
      relleno.style.background = c.color;
      barra.append(relleno);
      fila.append(nombre, valor, barra);
      categorias.append(fila);
    }
    if (estado.categorias.length === 0) {
      const nada = crear("p", "vacia-texto");
      nada.textContent = "Este mes, nada todavía.";
      categorias.append(nada);
    }
    graficos.append(semana, categorias);
    partes.push(graficos);

    if (estado.descubrimiento) {
      const descubrimiento = crear("div", `tarjeta plata-descubrimiento ${estado.descubrimiento.tipo}`);
      const texto = crear("span", "");
      texto.textContent = estado.descubrimiento.texto;
      descubrimiento.append(etiquetaTarjeta("Descubrí algo"), texto);
      partes.push(descubrimiento);
    }

    const movimientos = crear("div", "tarjeta plata-movimientos");
    movimientos.append(etiquetaTarjeta("Últimos movimientos"));
    for (const m of estado.ultimos) {
      const fila = crear("div", "plata-movimiento");
      const emoji = crear("span", "plata-emoji");
      emoji.textContent = m.emoji;
      const que = crear("span", "fila-nombre");
      que.textContent = m.descripcion;
      que.title = `${m.descripcion} (${m.categoria})`;
      const cuando = crear("span", "fila-dato");
      cuando.textContent = cuandoMovimiento(m.fechaMs, ahora);
      const monto = crear("span", "plata-monto");
      monto.textContent = formatearMonto(m.monto);
      fila.append(emoji, que, cuando, monto);
      movimientos.append(fila);
    }
    partes.push(movimientos);

    if (estado.frecuentes.length > 0 && this.opciones.alAnotarFrecuente) {
      const frecuentes = crear("div", "plata-frecuentes");
      const titulo = crear("span", "plata-frecuentes-titulo");
      titulo.textContent = "Anotar de un toque";
      frecuentes.append(titulo);
      for (const f of estado.frecuentes) {
        const b = boton("pildora plata-toque", "");
        b.append(icono("mas"), document.createTextNode(` ${textoFrecuente(f)}`));
        b.title = `Anotar ${formatearMonto(f.monto)} en ${f.descripcion} (lo anotaste ${f.veces} veces)`;
        b.addEventListener("click", () => {
          b.disabled = true;
          this.opciones.alAnotarFrecuente?.(f.monto, f.descripcion);
        });
        frecuentes.append(b);
      }
      partes.push(frecuentes);
    }
    this.plata.replaceChildren(...partes);
  }

  mostrarUso(estado: EstadoUso | null): void {
    this.estadoUso = estado;
    const ahora = Date.now();
    const { barras, actualizado } = barrasPlan(estado?.plan ?? null, ahora);
    this.usoActualizado.textContent = actualizado ?? "";
    this.usoRefrescar.classList.toggle("girando", estado?.consultando === true);
    this.usoBarras.replaceChildren(
      ...barras.map((b) => {
        const fila = metrica(b.nombre, `${b.porcentaje} %`, b.fraccion, b.color);
        const nota = crear("span", "uso-reinicia");
        nota.textContent = b.reinicia;
        fila.insertBefore(nota, fila.querySelector(".avance"));
        return fila;
      }),
    );
    this.usoBarras.hidden = barras.length === 0;
    // Sin datos del plan: cómo conseguirlos (y, sin la statusline, el camino a Configurar Brote).
    const sinPlan: HTMLElement[] = [];
    if (barras.length === 0) {
      const texto = crear("p", "uso-plan-texto");
      texto.textContent = estado?.consultando
        ? "Revisando tu plan…"
        : "Pulsa ↻ para revisar tu plan. Se mantiene al día solo si usas Claude Code o tienes abierta la app de Claude con su ícono en la barra de menú.";
      sinPlan.push(texto);
    }
    this.usoSinPlan.replaceChildren(...sinPlan);
    this.usoSinPlan.hidden = sinPlan.length === 0;
    this.pintarTokens();
    this.pintarPrecios();
  }

  private pintarTokens(): void {
    const resumen = this.estadoUso?.resumen;
    this.usoTokens.hidden = !resumen;
    if (!resumen) return;
    const selector = crear("div", "uso-selector");
    for (const [id, texto] of [
      ["hoy", "Hoy"],
      ["semana", "7 días"],
    ] as const) {
      const b = boton(`uso-periodo${this.periodoUso === id ? " elegido" : ""}`, texto);
      b.setAttribute("aria-pressed", String(this.periodoUso === id));
      b.addEventListener("click", () => {
        this.periodoUso = id;
        this.pintarTokens();
      });
      selector.append(b);
    }
    const periodo = resumen[this.periodoUso];
    const tabla = crear("div", "uso-tabla");
    for (const celda of ["", "Brote", "Tus sesiones"]) {
      const c = crear("span", "uso-col");
      c.textContent = celda;
      tabla.append(c);
    }
    for (const fila of filasTokens(periodo)) {
      fila.forEach((dato, i) => {
        const c = crear("span", i === 0 ? "uso-fila" : "uso-dato");
        c.textContent = dato;
        tabla.append(c);
      });
    }
    const partes: HTMLElement[] = [selector, tabla];
    if (periodo.proyectos.length > 0) {
      const mas = crear("p", "uso-nota");
      mas.textContent = `Lo que más gasta: ${periodo.proyectos.map((p) => p.nombre).join(" · ")}`;
      partes.push(mas);
    }
    this.usoTokens.replaceChildren(...partes);
  }

  private pintarPrecios(): void {
    const precios = this.estadoUso?.precios;
    const modelos = precios?.modelos ?? [];
    this.usoPrecios.hidden = modelos.length === 0;
    if (modelos.length === 0) return;
    const abierto = this.usoPrecios.open;
    const resumen = crear("summary", "uso-precios-titulo");
    resumen.textContent = "Precios por millón de tokens";
    const tabla = crear("div", "uso-tabla precios");
    for (const celda of ["Modelo", "Entrada", "Salida", "Caché (escr. / lect.)"]) {
      const c = crear("span", "uso-col");
      c.textContent = celda;
      tabla.append(c);
    }
    for (const { id, precio } of modelos) {
      const datos = precio
        ? [precio.nombre, precioCorto(precio.entrada), precioCorto(precio.salida), `${precioCorto(precio.escritura5m)} / ${precioCorto(precio.lectura)}`]
        : [id, "—", "—", "sin precio"];
      datos.forEach((dato, i) => {
        const c = crear("span", i === 0 ? "uso-fila" : "uso-dato");
        c.textContent = dato;
        tabla.append(c);
      });
    }
    const nota = crear("p", "uso-nota");
    const [a, m, d] = (precios?.fecha ?? "").split("-");
    nota.textContent = `USD, precios oficiales de Anthropic al ${Number(d)}/${Number(m)}/${a}. El valor API es lo que costaría pagando por token: tu plan no te cobra eso.`;
    this.usoPrecios.replaceChildren(resumen, tabla, nota);
    this.usoPrecios.open = abierto;
  }

  /** Si la pestaña Claude está a la vista (main pide el uso solo entonces). */
  get usoALaVista(): boolean {
    return this.visible && this.pestana === "claude" && !this.usoPlan.hidden;
  }

  /** La tarjeta de la música, o nada si no hay un reproductor abierto. */
  mostrarMusica(estado: EstadoMusica | null): void {
    this.conDatos.musica = estado !== null;
    this.datosPildoras.musica = estado;
    if (estado) {
      this.musicaTitulo.textContent = estado.cancion ?? estado.app;
      this.musicaDetalle.textContent = [estado.artista, estado.app].filter(Boolean).join(" · ");
      this.tarjetaMusica.title = `${estado.cancion ?? ""} ${estado.artista ? `— ${estado.artista}` : ""} (${estado.app})`.trim();
      this.tarjetaMusica.classList.toggle("sonando", estado.sonando);
      this.musicaPlay.replaceChildren(icono(estado.sonando ? "pausa" : "play"));
      this.musicaPlay.title = estado.sonando ? "Pausa" : "Play";
    }
    this.actualizarInicio();
  }

  /**
   * Las funciones prendidas y las tarjetas de Inicio (Configurar Brote → Funciones): oculta lo
   * apagado, ordena las tarjetas y muestra u oculta las pestañas Claude y Equipo.
   */
  mostrarFunciones(config: ConfigFunciones): void {
    this.funciones = config;
    this.actualizarMicrofono();
    this.actualizarPestanas();
    this.actualizarInicio();
  }

  /** Batería, CPU (con su historia reciente), memoria y disco. */
  mostrarEquipo(lectura: LecturaEquipo | null): void {
    if (!lectura) return;
    if (lectura.cpu !== null) this.muestrasCpu = [...this.muestrasCpu, lectura.cpu].slice(-MUESTRAS_CPU);
    const filas: HTMLElement[] = [];
    const b = lectura.bateria;
    if (b) {
      const color = b.conectado ? "verde" : b.porcentaje <= 20 ? "rojo" : b.porcentaje <= 40 ? "ambar" : "verde";
      filas.push(metrica("Batería", `${Math.round(b.porcentaje)} %${b.conectado ? " · cargando" : ""}`, b.porcentaje / 100, color));
    }
    if (lectura.cpu !== null) {
      const cpu = metrica("CPU", `${Math.round(lectura.cpu * 100)} %`, lectura.cpu, lectura.cpu >= 0.85 ? "rojo" : "azul");
      cpu.append(grafico(this.muestrasCpu));
      filas.push(cpu);
    }
    const m = lectura.memoria;
    if (m) {
      const usada = m.total - m.libre;
      filas.push(metrica("Memoria", `${gigas(usada)} de ${gigas(m.total)}`, usada / m.total, usada / m.total >= 0.9 ? "rojo" : "violeta"));
    }
    const d = lectura.disco;
    if (d) filas.push(metrica("Disco", `${gigas(d.libre)} libres`, 1 - d.libre / d.total, d.libre / d.total < 0.1 ? "rojo" : "gris"));
    if (lectura.procesoPesado) {
      const pesado = crear("p", "metrica-nota");
      pesado.textContent = `Lo que más consume ahora: ${lectura.procesoPesado}`;
      filas.push(pesado);
    }
    if (filas.length === 0) {
      const nada = crear("p", "vacia-texto");
      nada.textContent = "No pude leer el estado del computador.";
      filas.push(nada);
    }
    this.metricas.replaceChildren(...filas);
  }

  /** Mantiene la isla abierta un rato (por ejemplo, al terminar una descarga). */
  retener(ms = AVISO_DESTACADO_MS): void {
    this.avisoHasta = Math.max(this.avisoHasta, Date.now() + ms);
  }

  /** Avanza las cuentas regresivas y el saludo (se llama en cada cuadro). */
  actualizarRelojes(): void {
    const ahora = Date.now();
    for (const { fin, duracion, tiempo, barra } of this.filasTemporizador) {
      tiempo.textContent = cuentaRegresiva(fin - ahora);
      barra.style.width = `${Math.min(100, Math.max(0, (1 - (fin - ahora) / duracion) * 100)).toFixed(1)}%`;
    }
    if (!this.avisoDestacado.hidden && ahora > this.avisoHasta) this.avisoDestacado.hidden = true;
    // La fila de píldoras (con su cuenta regresiva) y, al terminar la lectura, de vuelta a las tarjetas.
    this.pintarPildoras();
    this.aplicarModo();
    this.actualizarPuntos();
    const hoy = new Date(ahora);
    const texto = `${saludo(hoy)}|${fechaLarga(hoy)}`;
    if (texto !== this.saludoPintado) {
      this.saludoPintado = texto;
      const fuerte = crear("strong", "");
      fuerte.textContent = saludo(hoy);
      const fecha = crear("span", "");
      fecha.textContent = fechaLarga(hoy);
      this.tituloInicio.replaceChildren(fuerte, fecha);
    }
  }

  /** Algo que Brote quiere contar (un temporizador terminó, la batería está baja…): se destaca un rato. */
  mostrarAviso(texto: string): void {
    this.avisoDestacado.textContent = texto;
    this.avisoDestacado.hidden = false;
    this.avisoHasta = Date.now() + AVISO_DESTACADO_MS;
  }

  /**
   * Un aviso que no hace falta decidir (una descarga lista, el calendario, que Claude terminó…): no abre
   * la isla. Va unos segundos en el ala izquierda (`avisoEnAla`), deja un punto en su pestaña y, al abrir
   * la isla, queda en la lista de novedades.
   */
  notificar(tipo: TipoNovedad, texto: string): void {
    const novedad = this.novedades.agregar(tipo, texto, Date.now());
    if (this.visible) this.novedadesNuevas.add(novedad.id);
    this.pintarNovedades();
    this.actualizarPuntos();
  }

  /** Si la isla está abierta (el usuario ya ve los avisos). */
  get abierta(): boolean {
    return this.visible;
  }

  /** El aviso para el ala izquierda: solo con la isla cerrada. */
  get avisoEnAla(): Novedad | null {
    return this.visible ? null : this.novedades.enAla(Date.now());
  }

  /** La lista corta de lo que llegó mientras la isla estaba cerrada (hasta 3 líneas). */
  private pintarNovedades(): void {
    const nuevas = this.novedades.recientes(Date.now()).filter((n) => this.novedadesNuevas.has(n.id)).slice(0, 3);
    this.listaNovedades.hidden = nuevas.length === 0;
    this.listaNovedades.replaceChildren(
      ...nuevas.map((n) => {
        const linea = crear("p", "novedad");
        linea.textContent = textoCorto(n.texto, 70);
        linea.title = n.texto;
        return linea;
      }),
    );
  }

  /**
   * La grabación (sección 8): la pregunta a los presentes, la cuenta con el punto rojo y los errores.
   * Va sobre el campo de texto, en todas las pestañas.
   */
  mostrarGrabacion(estado: EstadoGrabacion): void {
    this.estadoGrabacion = estado;
    const f = this.franjaGrabacion;
    f.hidden = estado.fase === "inactiva";
    f.className = `franja-grabacion ${estado.fase}`;
    f.replaceChildren();
    const texto = (t: string, clase = "franja-texto") => {
      const p = crear("p", clase);
      p.textContent = t;
      return p;
    };
    const accion = (t: string, alHacer: () => void, clase = "franja-boton") => {
      const b = boton(clase, t);
      b.type = "button";
      b.addEventListener("click", alHacer);
      return b;
    };
    switch (estado.fase) {
      case "pregunta": {
        const fila = crear("div", "franja-botones");
        for (const o of OPCIONES_AVISO) fila.append(accion(o.texto, () => this.opciones.alElegirAviso?.(o.valor)));
        fila.append(accion("Cancelar", () => this.opciones.alCancelarGrabacion?.(), "franja-boton suave"));
        f.append(texto(`🎙 ${TEXTO_PREGUNTA_AVISO}`), fila);
        break;
      }
      case "iniciando":
        f.append(texto("🎙 Abriendo el micrófono… (si macOS pregunta, di que sí)"));
        break;
      case "grabando": {
        const fila = crear("div", "franja-fila");
        const punto = crear("span", "punto-rojo");
        punto.setAttribute("aria-hidden", "true");
        const cuenta = crear("span", "franja-cuenta");
        cuenta.textContent = `Grabando ${tiempoGrabado(estado.segundos)}`;
        fila.append(punto, cuenta, accion("■ Detener", () => this.opciones.alDetenerGrabacion?.(), "franja-boton detener"));
        f.append(fila);
        if (estado.sinSonido) f.append(texto(`⚠️ ${estado.sinSonido}`, "franja-texto alerta"));
        break;
      }
      case "deteniendo":
        f.append(texto("🎙 Guardando la grabación…"));
        break;
      case "error": {
        const fila = crear("div", "franja-botones");
        if (esErrorDePermisoMicrofono(estado.mensaje)) fila.append(accion("Abrir Privacidad", () => this.opciones.alAbrirPrivacidadMicrofono?.()));
        fila.append(accion("Entendido", () => this.opciones.alCancelarGrabacion?.(), "franja-boton suave"));
        f.append(texto(`⚠️ ${estado.mensaje}`, "franja-texto alerta"), fila);
        break;
      }
    }
    this.actualizarMicrofono();
    if (this.pestana === "grabar") this.mostrarGrabaciones();
  }

  /** El 🎙 se ve con la función prendida y se apaga mientras hay una grabación o una pregunta en curso. */
  private actualizarMicrofono(): void {
    this.microfono.hidden = !this.funciones.activas.grabaciones;
    this.microfono.disabled = this.estadoGrabacion.fase !== "inactiva";
  }

  /** Alto que necesita el contenido, para que la isla crezca lo justo. */
  alto(): number {
    return this.raiz.offsetHeight;
  }

  /** Ubica el panel (y las pestañas) dentro de la isla abierta y los muestra u oculta. */
  ubicar(zona: Zona, visible: boolean): void {
    const estilo = this.raiz.style;
    estilo.left = `${zona.x}px`;
    estilo.top = `${zona.y}px`;
    estilo.width = `${zona.ancho}px`;
    estilo.maxHeight = `${zona.altoMax}px`;
    // "Ver a todos" usa todo el alto (las columnas se desplazan por dentro).
    estilo.height = this.verTodosActivo ? `${zona.altoMax}px` : "";
    if (zona.barra) {
      const b = this.barra.style;
      b.left = `${zona.barra.x}px`;
      b.top = `${zona.barra.y}px`;
      b.width = `${zona.barra.ancho}px`;
      b.height = `${zona.barra.alto}px`;
    }
    if (visible === this.visible) return;
    this.visible = visible;
    this.raiz.classList.toggle("visible", visible);
    this.barra.classList.toggle("visible", visible);
    if (visible) {
      this.novedadesNuevas = new Set(this.novedades.sinVer(Date.now()).map((n) => n.id));
      this.pintarNovedades();
      // Tras un rato cerrada, vuelve a lo que importa ahora (o a Inicio).
      if (performance.now() - this.cerradaDesde > VOLVER_A_INICIO_MS) this.elegir(this.pestanaSugerida());
      this.novedades.marcarVistasDe(this.pestana);
    } else {
      this.cerradaDesde = performance.now();
      // Lo que se vio con la isla abierta ya no cuenta como pendiente.
      this.novedades.marcarVistas();
      this.novedadesNuevas.clear();
      this.pintarNovedades();
      this.actualizarPuntos();
      // Al cerrarse la isla, el foco no debe quedar en un campo que no se ve.
      if (document.activeElement && this.raiz.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    }
  }

  /** Dónde está el panel en la ventana (modo flotante: el lienzo dibuja su caja). */
  rect(): DOMRect | null {
    return this.raiz.getBoundingClientRect();
  }

  /** Si un punto de la ventana cae sobre una zona clicable del panel o de las pestañas. */
  contiene(x: number, y: number): boolean {
    if (!this.visible) return false;
    return [this.raiz, this.barra].some((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  }

  /** Muestra en el campo si se perdió la conexión con OpenClaw. */
  mostrarConexion(estado: EstadoConexion): void {
    this.sinConexion = estado.conectado ? null : (estado.detalle ?? "Sin conexión con OpenClaw");
    // El campo es corto: el motivo completo queda en el título, al pasar el cursor.
    this.entrada.title = this.sinConexion ?? "";
    this.actualizarEntrada();
  }

  private pestanaSugerida(): Pestana {
    return pestanaSugerida({
      conversacionPendiente: this.conversacionPendiente() || this.respuestaSinVer || performance.now() < this.leerHasta,
      permisoClaude: this.hayPermisoClaude && !!this.opciones.alDecidirPermisoClaude,
    });
  }

  /** Brote trabaja, pide permiso o propone aprender algo. */
  private conversacionPendiente(): boolean {
    const c = this.agente.conversacion;
    return c.aprobacion !== null || c.propuesta !== null || ocupado(c);
  }

  /** Si hay algo de la conversación que mostrar (lo que escribiste, la respuesta, un error…). */
  private hayConversacion(): boolean {
    const c = this.agente.conversacion;
    return c.mensajeUsuario !== null || c.respuesta !== "" || c.error !== null || c.herramienta !== null;
  }

  /**
   * Tarjetas o conversación: mientras Brote trabaja, pide algo o se está leyendo la respuesta, la
   * conversación ocupa el espacio y las tarjetas se encogen a una fila de píldoras.
   */
  private aplicarModo(): void {
    const c = this.agente.conversacion;
    const conversando = this.conversacionPendiente() || (this.hayConversacion() && performance.now() < this.leerHasta);
    const compacto = conversando && !this.forzarTarjetas;
    this.burbuja.hidden = !compacto || !this.hayConversacion() || (c.aprobacion !== null && c.respuesta === "");
    this.verRespuesta.hidden = compacto || !this.hayConversacion() || ocupado(c);
    if (compacto === this.compacto) return;
    this.compacto = compacto;
    this.cabeceraInicio.hidden = compacto;
    this.tarjetas.hidden = compacto;
    this.pildoras.hidden = !compacto || this.pildoras.childElementCount === 0;
  }

  /** Una píldora por tarjeta a la vista (en su orden); al tocarla vuelven las tarjetas. */
  private pintarPildoras(): void {
    const ahora = Date.now();
    const lista = tarjetasVisibles(this.funciones, this.conDatos)
      .map((id) => textoPildora(id, this.datosPildoras, ahora))
      .filter((p): p is { texto: string; titulo: string } => p !== null);
    const texto = JSON.stringify(lista);
    if (texto === this.pildorasPintadas) return;
    this.pildorasPintadas = texto;
    this.pildoras.replaceChildren(
      ...lista.map((p) => {
        const b = boton("pildora", p.texto);
        b.title = `${p.titulo} · toca para ver las tarjetas`;
        b.addEventListener("click", () => {
          this.forzarTarjetas = true;
          this.aplicarModo();
        });
        return b;
      }),
    );
    this.pildoras.hidden = !this.compacto || lista.length === 0;
  }

  /** Claude se ve con el modo programador o el uso del plan prendidos (o si hay sesiones); Equipo, con las reacciones al computador. */
  private actualizarPestanas(): void {
    const { programador, "uso-del-plan": uso } = this.funciones.activas;
    this.botonesPestana.get("claude")!.hidden = !programador && !uso && !this.hayActividadClaude;
    this.usoPlan.hidden = !uso;
    // Con solo el uso del plan prendido, las sesiones no se muestran (salvo que haya alguna).
    const sinSesiones = !programador && !this.hayActividadClaude;
    this.tituloSesiones.hidden = sinSesiones;
    this.codigoVacio.hidden = sinSesiones || this.hayActividadClaude;
    this.botonesPestana.get("equipo")!.hidden = !this.funciones.activas.equipo;
    this.botonesPestana.get("plata")!.hidden = !this.funciones.activas.gastos;
    const { calendario, aula, temporizadores, grabaciones } = this.funciones.activas;
    // Con Grabar prendida también hay Agenda: ahí esperan las tareas y fechas que Brote saca de una grabación.
    this.botonesPestana.get("agenda")!.hidden = !calendario && !aula && !temporizadores && !grabaciones;
    this.botonesPestana.get("estudio")!.hidden = !this.funciones.activas.estudio;
    this.botonesPestana.get("grabar")!.hidden = !this.funciones.activas.grabaciones;
    if (this.botonesPestana.get(this.pestana)!.hidden) this.elegir("brote");
  }

  private enviarTexto(texto: string): void {
    if (!texto.trim()) return;
    this.forzarTarjetas = false;
    this.elegir("brote");
    void this.agente.enviar(texto).then((enviado) => {
      if (enviado && this.entrada.value === texto) this.entrada.value = "";
      this.actualizarBotonEnviar();
    });
  }

  /** Botones con frases para probar: al tocarlos se envían (las resuelve el motor, sin IA). */
  private sugerencias(): HTMLDivElement {
    const caja = crear("div", "sugerencias");
    for (const frase of SUGERENCIAS) {
      const b = boton("sugerencia", frase);
      b.addEventListener("click", () => {
        if (!ocupado(this.agente.conversacion)) this.enviarTexto(frase);
      });
      caja.append(b);
    }
    return caja;
  }

  private tarjetaSesion(s: SesionClaude, pasos: string[]): HTMLDivElement {
    const tarjeta = crear("div", `tarjeta sesion ${s.estado}`);
    const cabecera = crear("div", "sesion-cabecera");
    const nombre = crear("span", "sesion-nombre");
    nombre.textContent = s.proyecto;
    nombre.title = s.proyecto;
    const estado = crear("span", `chip ${s.estado}`);
    estado.textContent = {
      pensando: "Pensando",
      trabajando: "Trabajando",
      permiso: "Pide permiso",
      esperando: "Esperándote",
      lista: "Terminó",
      error: "Error",
    }[s.estado];
    cabecera.append(nombre, estado);
    const lista = crear("ul", "pasos");
    const activa = s.estado === "trabajando" || s.estado === "pensando";
    pasos.forEach((paso, i) => {
      const ultimo = i === pasos.length - 1;
      const li = crear("li", ultimo ? "actual" : "");
      const ic = ultimo && activa ? icono("girando", "gira") : ultimo && s.estado === "error" ? icono("alerta") : icono("listo");
      const texto = crear("span", "");
      texto.textContent = paso;
      li.append(ic, texto);
      lista.append(li);
    });
    tarjeta.append(cabecera, lista);
    return tarjeta;
  }

  /**
   * Las tarjetas de Inicio: se ve la que tiene algo que mostrar, es de una función prendida y no se
   * ocultó; en el orden elegido. "Todo tranquilo" solo cuando no hay ninguna.
   */
  private actualizarInicio(): void {
    const elementos: Record<IdTarjeta, HTMLElement> = {
      temporizadores: this.tarjetasTemporizador,
      calendario: this.tarjetaCalendario,
      aula: this.tarjetaAula,
      musica: this.tarjetaMusica,
      descargas: this.tarjetaDescargas,
      claude: this.tarjetaClaude,
    };
    const visibles = tarjetasVisibles(this.funciones, this.conDatos);
    for (const id of IDS_TARJETAS) {
      const elemento = elementos[id];
      elemento.hidden = !visibles.includes(id);
      const orden = String(this.funciones.tarjetas.orden.indexOf(id));
      // Los temporizadores son tarjetas sueltas dentro de la grilla (su grupo no tiene caja propia).
      for (const el of id === "temporizadores" ? [...elemento.children] : [elemento]) (el as HTMLElement).style.order = orden;
    }
    this.tarjetaVacia.hidden = visibles.length > 0;
    this.pintarPildoras();
  }

  /** Un punto en la pestaña que tiene algo pendiente y no está a la vista. */
  private actualizarPuntos(): void {
    const c = this.agente.conversacion;
    const brotePendiente = c.aprobacion !== null || c.propuesta !== null || this.respuestaSinVer;
    const nuevos = this.novedades.pestanasConPunto(Date.now());
    const pendiente: Record<Pestana, boolean> = {
      brote: brotePendiente || nuevos.has("brote"),
      plata: nuevos.has("plata"),
      agenda: nuevos.has("agenda"),
      estudio: false,
      grabar: nuevos.has("grabar"),
      claude: this.hayPermisoClaude || nuevos.has("claude"),
      equipo: nuevos.has("equipo"),
    };
    for (const [nombre, boton] of this.botonesPestana) boton.classList.toggle("con-punto", pendiente[nombre] && this.pestana !== nombre);
  }

  private mostrar(c: Conversacion): void {
    // Brote empieza a trabajar, pide permiso o propone aprender algo: a su pestaña, con la conversación a la vista.
    const estaOcupado = ocupado(c);
    const aprobacion = c.aprobacion ? `${c.aprobacion.titulo}|${c.aprobacion.detalle}` : null;
    if ((estaOcupado && !this.ocupadoAntes) || (aprobacion && aprobacion !== this.aprobacionAntes) || (c.propuesta && !this.propuestaAntes)) {
      this.forzarTarjetas = false;
      this.elegir("brote");
    }
    this.ocupadoAntes = estaOcupado;
    this.aprobacionAntes = aprobacion;
    this.propuestaAntes = c.propuesta !== null;

    this.usuario.textContent = c.mensajeUsuario ?? "";
    this.usuario.hidden = !c.mensajeUsuario;

    const esperando = estaOcupado && !c.respuesta && !c.herramienta && !c.aprobacion;
    const texto = c.error ?? c.respuesta;
    if (texto !== this.respuestaPintada) {
      // Los errores van tal cual; las respuestas, con su formato (negrita, listas…).
      if (c.error !== null) this.respuesta.textContent = texto;
      else pintarMarkdown(this.respuesta, texto);
      this.respuestaPintada = texto;
    }
    this.respuesta.classList.toggle("error", c.error !== null);
    this.respuesta.hidden = texto === "" && !esperando;
    this.respuesta.classList.toggle("escribiendo", esperando);
    this.herramientaTexto.textContent = c.herramienta?.etiqueta ?? "";
    this.herramienta.hidden = !c.herramienta;
    this.sinIA.hidden = !c.sinIA;
    // La respuesta va llegando de a poco: se mantiene a la vista el final.
    this.burbuja.scrollTop = this.burbuja.scrollHeight;

    const ap = c.aprobacion;
    this.aprobacion.hidden = !ap;
    if (ap) {
      const enEspera = c.aprobacionesEnEspera.length;
      this.aprobacionTitulo.textContent = enEspera > 0 ? `${ap.titulo} · 1 de ${enEspera + 1}` : ap.titulo;
      this.aprobacionDetalle.textContent = ap.detalle;
      this.aprobacionDetalle.hidden = !ap.detalle;
      this.permitir.disabled = ap.respondiendo || !ap.decisiones.includes("allow-once");
      this.rechazar.disabled = ap.respondiendo || !ap.decisiones.includes("deny");
    }

    const pr = c.propuesta;
    this.propuesta.hidden = !pr;
    if (pr) {
      this.propuestaDetalle.textContent = `«${pr.ejemplo}» → ${pr.accion}`;
      this.aprender.disabled = pr.decidiendo;
      this.noAprender.disabled = pr.decidiendo;
    }

    // Una respuesta nueva (o el mensaje tras decidir una propuesta) da tiempo para leerla.
    if (c.terminada && (!this.terminadaAntes || c.respuesta !== this.respuestaAntes)) {
      const largo = (c.error ?? c.respuesta).length;
      const ms = Math.min(LECTURA_MAX, Math.max(LECTURA_MIN, 2500 + largo * LECTURA_POR_LETRA));
      this.leerHasta = performance.now() + ms;
      this.forzarTarjetas = false;
      if (this.pestana !== "brote") this.respuestaSinVer = true;
    }
    this.terminadaAntes = c.terminada;
    this.respuestaAntes = c.respuesta;

    this.aplicarModo();
    this.actualizarPuntos();
    this.actualizarEntrada();
    if (this.verTodosActivo) this.pintarTodos();
  }

  private actualizarEntrada(): void {
    const c = this.agente.conversacion;
    if (ocupado(c)) this.entrada.placeholder = "Espera a que termine…";
    else this.entrada.placeholder = this.sinConexion ? "Sin OpenClaw: solo gastos…" : "Escríbeme algo…";
    this.actualizarBotonEnviar();
  }

  private actualizarBotonEnviar(): void {
    const trabajando = ocupado(this.agente.conversacion);
    this.enviar.replaceChildren(icono(trabajando ? "detener" : "enviar"));
    this.enviar.setAttribute("aria-label", trabajando ? "Detener" : "Enviar");
    this.enviar.title = trabajando ? "Detener a Brote" : "";
    this.enviar.classList.toggle("detener", trabajando);
    this.enviar.disabled = !trabajando && this.entrada.value.trim() === "";
  }
}

function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase: string): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(etiqueta);
  elemento.className = clase;
  return elemento;
}

function boton(clase: string, texto: string): HTMLButtonElement {
  const b = crear("button", clase);
  b.type = "button";
  b.textContent = texto;
  return b;
}

function botonIcono(clase: string, ic: NombreIcono, titulo: string): HTMLButtonElement {
  const b = crear("button", clase);
  b.type = "button";
  b.title = titulo;
  b.setAttribute("aria-label", titulo);
  b.append(icono(ic));
  return b;
}

function etiquetaTarjeta(texto: string): HTMLDivElement {
  const etiqueta = crear("div", "tarjeta-etiqueta");
  etiqueta.textContent = texto;
  return etiqueta;
}

/** Las barras de los últimos 7 días (SVG armado con números; hoy resaltado) y sus letras debajo. */
function graficoSemana(estado: EstadoPlata): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const ANCHO = 140;
  const ALTO = 44;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "plata-grafico");
  svg.setAttribute("viewBox", `0 0 ${ANCHO} ${ALTO + 12}`);
  for (const b of barrasSemana(estado.semana, ANCHO, ALTO)) {
    const rect = document.createElementNS(NS, "rect");
    rect.setAttribute("x", b.x.toFixed(1));
    rect.setAttribute("y", b.y.toFixed(1));
    rect.setAttribute("width", b.ancho.toFixed(1));
    rect.setAttribute("height", b.alto.toFixed(1));
    rect.setAttribute("rx", "2.5");
    rect.setAttribute("class", b.hoy ? "barra-hoy" : "barra-dia");
    const titulo = document.createElementNS(NS, "title");
    titulo.textContent = b.titulo;
    rect.append(titulo);
    const letra = document.createElementNS(NS, "text");
    letra.setAttribute("x", (b.x + b.ancho / 2).toFixed(1));
    letra.setAttribute("y", String(ALTO + 10));
    letra.setAttribute("class", b.hoy ? "letra-hoy" : "letra-dia");
    letra.textContent = b.letra;
    svg.append(rect, letra);
  }
  return svg;
}

/** Una fila de Equipo: nombre, valor y una barra (`fraccion` entre 0 y 1). */
function metrica(nombre: string, valor: string, fraccion: number, color: string): HTMLDivElement {
  const fila = crear("div", `metrica ${color}`);
  const n = crear("span", "metrica-nombre");
  n.textContent = nombre;
  const v = crear("span", "metrica-valor");
  v.textContent = valor;
  const avance = crear("div", "avance");
  const relleno = crear("i", "");
  relleno.style.width = `${Math.min(100, Math.max(2, fraccion * 100)).toFixed(1)}%`;
  avance.append(relleno);
  fila.append(n, v, avance);
  return fila;
}

/** La historia reciente de la CPU como una línea (SVG armado con números, nunca con texto de afuera). */
function grafico(muestras: number[]): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "grafico");
  svg.setAttribute("viewBox", `0 0 ${MUESTRAS_CPU - 1} 20`);
  svg.setAttribute("preserveAspectRatio", "none");
  const desde = MUESTRAS_CPU - muestras.length;
  const puntos = muestras.map((m, i) => `${desde + i},${(19 - Math.min(1, Math.max(0, m)) * 18).toFixed(1)}`).join(" ");
  const linea = document.createElementNS(NS, "polyline");
  linea.setAttribute("points", puntos);
  svg.append(linea);
  return svg;
}

/** Tarea, pasos y respuesta (con el markdown de la burbuja) de una conversación del equipo. */
function cuerpoConversacion(datos: { tarea: string | null; pasos: PasoVisible[]; respuesta: string }, escribiendo: boolean, tituloTarea = "Tarea"): HTMLElement[] {
  const partes: HTMLElement[] = [];
  if (datos.tarea) {
    partes.push(seccion(tituloTarea));
    const tarea = crear("p", "conversacion-tarea");
    tarea.textContent = datos.tarea;
    partes.push(tarea);
  }
  if (datos.pasos.length > 0) {
    partes.push(seccion("Pasos"));
    const lista = crear("ul", "pasos");
    datos.pasos.forEach((p) => {
      const li = crear("li", p.estado === "en-curso" ? "actual" : "");
      const texto = crear("span", "");
      texto.textContent = p.texto;
      li.append(p.estado === "en-curso" ? icono("girando", "gira") : p.estado === "error" ? icono("alerta") : icono("listo"), texto);
      lista.append(li);
    });
    partes.push(lista);
  }
  partes.push(seccion("Respuesta"));
  const respuesta = crear("div", "burbuja-respuesta conversacion-respuesta");
  if (datos.respuesta) pintarMarkdown(respuesta, datos.respuesta);
  else respuesta.textContent = escribiendo ? "" : "Sin respuesta.";
  respuesta.classList.toggle("escribiendo", escribiendo && !datos.respuesta);
  partes.push(respuesta);
  return partes;
}

function seccion(texto: string): HTMLDivElement {
  const titulo = crear("div", "seccion-titulo");
  titulo.textContent = texto;
  return titulo;
}

/** Convierte el markdown de una respuesta en elementos con texto (nunca HTML). */
function pintarMarkdown(contenedor: HTMLElement, texto: string): void {
  const fragmentos = (lista: Fragmento[]) =>
    lista.map((f) => {
      if (f.tipo === "texto") return document.createTextNode(f.texto);
      const elemento = document.createElement(f.tipo === "negrita" ? "strong" : f.tipo === "cursiva" ? "em" : "code");
      elemento.textContent = f.texto;
      return elemento;
    });
  contenedor.replaceChildren(
    ...analizarMarkdown(texto).map((bloque) => {
      if (bloque.tipo === "lista") {
        const lista = document.createElement(bloque.ordenada ? "ol" : "ul");
        for (const item of bloque.items) {
          const li = document.createElement("li");
          li.append(...fragmentos(item));
          lista.append(li);
        }
        return lista;
      }
      const parrafo = document.createElement("p");
      bloque.lineas.forEach((linea, i) => {
        if (i > 0) parrafo.append(document.createElement("br"));
        parrafo.append(...fragmentos(linea));
      });
      return parrafo;
    }),
  );
}
