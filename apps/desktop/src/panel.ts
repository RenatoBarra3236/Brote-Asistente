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
import { pestanaSugerida, tarjetasVisibles, textoPildora, type DatosPildoras, type Pestana } from "./agente/tarjetas";
import { barrasPlan, filasTokens, precioCorto, type EstadoUso } from "./agente/uso";
import { filasEquipo, tituloEquipo, type Trabajando } from "./agente/especialistas";
import { barrasSemana, cuandoMovimiento, formatearMonto, montoCorto, textoFrecuente, textoPuedesHoy, textoVariacion, type EstadoPlata } from "./agente/plata";
import { icono, type NombreIcono } from "./iconos";

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
  /** Un botón de un toque de la pestaña Plata. */
  alAnotarFrecuente?: (monto: number, descripcion: string) => void;
}

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
  /** "El equipo trabajando": los especialistas en los que Brote delegó. */
  private readonly equipoTrabajando: HTMLDivElement;
  private especialistas: Trabajando[] = [];
  private equipoPintado = "";
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

  // Equipo
  private readonly metricas: HTMLDivElement;
  private muestrasCpu: number[] = [];

  // Comunes
  private readonly avisoDestacado: HTMLParagraphElement;
  private readonly entrada: HTMLInputElement;
  private readonly enviar: HTMLButtonElement;
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
      ["claude", "codigo", "Claude"],
      ["equipo", "equipo", "Equipo"],
    ];
    for (const [nombre, ic, titulo] of pestanas) {
      const boton = botonIcono("pestana", ic, titulo);
      boton.addEventListener("click", () => this.elegir(nombre));
      this.botonesPestana.set(nombre, boton);
      izquierda.append(boton);
    }
    const derecha = crear("div", "barra-grupo");
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
    this.equipoTrabajando = crear("div", "equipo-trabajando");
    this.equipoTrabajando.hidden = true;
    this.equipoTrabajando.setAttribute("aria-live", "polite");
    inicio.append(this.cabeceraInicio, this.tarjetas, this.pildoras, this.equipoTrabajando, this.burbuja, this.aprobacion, this.propuesta);

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

    this.vistas.set("brote", inicio).set("plata", this.plata).set("claude", codigo).set("equipo", equipo);

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
    formulario.append(this.entrada, this.enviar);

    if (opciones.flotante) this.raiz.append(this.barra);
    else contenedor.append(this.barra);
    this.raiz.append(this.avisoDestacado, inicio, this.plata, codigo, equipo, formulario);
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
   * "El equipo trabajando" en la pestaña Brote: cada especialista con su emoji, la IA que usa ("·
   * Gemini", en su color; sin logos de esas marcas), qué hace y si terminó. Los que terminaron se van
   * solos después de un minuto (main repinta cada pocos segundos).
   */
  mostrarEspecialistas(lista: Trabajando[] = this.especialistas): void {
    this.especialistas = lista;
    const filas = filasEquipo(lista, Date.now());
    const texto = JSON.stringify(filas);
    if (texto === this.equipoPintado) return;
    this.equipoPintado = texto;
    this.equipoTrabajando.hidden = filas.length === 0;
    if (filas.length === 0) {
      this.equipoTrabajando.replaceChildren();
      return;
    }
    const titulo = crear("div", "equipo-titulo");
    titulo.textContent = tituloEquipo(filas);
    this.equipoTrabajando.replaceChildren(
      titulo,
      ...filas.map((f) => {
        const fila = crear("div", `fila-equipo ${f.estado}`);
        if (f.titulo) fila.title = f.titulo;
        const nombre = crear("span", "equipo-nombre");
        nombre.textContent = f.nombre;
        const ia = crear("span", "equipo-ia");
        ia.textContent = f.ia ? `· ${f.ia}` : "";
        if (f.color) ia.style.color = f.color;
        const detalle = crear("span", "equipo-detalle");
        detalle.textContent = f.detalle;
        const estado = crear("span", "equipo-estado");
        if (f.estado === "trabajando") estado.append(icono("girando", "gira"));
        else estado.textContent = f.estado === "termino" ? "✓" : "!";
        fila.append(nombre, ia, detalle, estado);
        return fila;
      }),
    );
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
      // Tras un rato cerrada, vuelve a lo que importa ahora (o a Inicio).
      if (performance.now() - this.cerradaDesde > VOLVER_A_INICIO_MS) this.elegir(this.pestanaSugerida());
    } else {
      this.cerradaDesde = performance.now();
      // Al cerrarse la isla, el foco no debe quedar en un campo que no se ve.
      if (document.activeElement && this.raiz.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    }
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
    this.botonesPestana.get("brote")!.classList.toggle("con-punto", brotePendiente && this.pestana !== "brote");
    this.botonesPestana.get("claude")!.classList.toggle("con-punto", this.hayPermisoClaude && this.pestana !== "claude");
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
