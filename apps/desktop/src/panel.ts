// El contenido de la isla abierta: elementos HTML sobre el lienzo, en cuatro pestañas.
//
//   Inicio  tarjetas con lo que pasa ahora: temporizadores, próximo evento, música, descargas…
//   Chat    la conversación con Brote, los permisos y las frases que puede aprender
//   Código  las sesiones de Claude Code del usuario (modo programador), si hay
//   Equipo  batería, CPU, memoria y disco
//
// Las pestañas van en la fila del notch (a sus costados) y el contenido a la derecha de Brote,
// que lo dibuja la isla. Brote cambia solo a la pestaña que importa: al chat cuando trabaja o pide
// permiso, a Código cuando una sesión pide permiso, y vuelve a Inicio si la isla pasa un rato cerrada.

import type { Agente } from "./agente/agente";
import { ocupado, type Conversacion } from "./agente/conversacion";
import { agregarPaso, cuandoEmpieza, cuentaRegresiva, fechaLarga, gigas, saludo, tamanoCorto } from "./agente/formato";
import { analizarMarkdown, type Fragmento } from "./agente/markdown";
import type {
  AccionMusica,
  Descarga,
  DescargaEnCurso,
  EstadoCalendario,
  EstadoConexion,
  EstadoMusica,
  EstadoProgramador,
  LecturaEquipo,
  SesionClaude,
  TemporizadorActivo,
} from "./agente/puente";
import { icono, type NombreIcono } from "./iconos";

export { cuentaRegresiva } from "./agente/formato";

export type Pestana = "inicio" | "chat" | "codigo" | "equipo";

/** Cuánto se destaca un aviso de Brote (temporizador, batería…) (ms). */
const AVISO_DESTACADO_MS = 12_000;

/** Cuánto sigue abierta la isla después de una respuesta, para alcanzar a leerla (ms). */
const LECTURA_MIN = 4000;
const LECTURA_MAX = 15000;
const LECTURA_POR_LETRA = 45;

/** Si la isla pasa este rato cerrada, al abrirse vuelve a Inicio (ms). */
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
  flotante?: boolean;
  alCancelarTemporizador?: (id: number) => void;
  alMostrarDescarga?: (ruta: string) => void;
  alControlarMusica?: (accion: AccionMusica) => void;
  alDecidirPermisoClaude?: (id: string, decision: "allow" | "deny") => void;
}

export class Panel {
  private readonly agente: Agente;
  private readonly opciones: Opciones;
  private readonly raiz: HTMLDivElement;
  private readonly barra: HTMLDivElement;
  private readonly botonesPestana = new Map<Pestana, HTMLButtonElement>();
  private readonly vistas = new Map<Pestana, HTMLDivElement>();
  private pestana: Pestana = "inicio";

  // Inicio
  private readonly tituloInicio: HTMLDivElement;
  private readonly tarjetas: HTMLDivElement;
  private readonly tarjetasTemporizador: HTMLDivElement;
  private readonly tarjetaCalendario: HTMLDivElement;
  private readonly tarjetaMusica: HTMLDivElement;
  private readonly musicaTitulo: HTMLDivElement;
  private readonly musicaDetalle: HTMLDivElement;
  private readonly musicaPlay: HTMLButtonElement;
  private readonly tarjetaDescargas: HTMLDivElement;
  private readonly tarjetaClaude: HTMLButtonElement;
  private readonly tarjetaVacia: HTMLDivElement;
  private filasTemporizador: { fin: number; duracion: number; tiempo: HTMLElement; barra: HTMLElement }[] = [];
  private saludoPintado = "";

  // Chat
  private readonly chatVacio: HTMLDivElement;
  private readonly burbuja: HTMLDivElement;
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

  // Código
  private readonly permisosClaude: HTMLDivElement;
  private readonly sesiones: HTMLDivElement;
  private readonly codigoVacio: HTMLDivElement;
  private pasos = new Map<string, string[]>();
  private hayPermisoClaude = false;
  private permisosVistos = new Set<string>();

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
      ["inicio", "inicio", "Inicio"],
      ["chat", "chat", "Chat"],
      ["codigo", "codigo", "Claude Code"],
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

    // --- Inicio ---
    const inicio = crear("div", "vista vista-inicio");
    this.tituloInicio = crear("div", "titulo-vista");
    this.tarjetas = crear("div", "tarjetas");
    this.tarjetasTemporizador = crear("div", "grupo-tarjetas");
    this.tarjetaCalendario = crear("div", "tarjeta calendario");
    this.tarjetaCalendario.hidden = true;

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
    this.tarjetaClaude.addEventListener("click", () => this.elegir("codigo"));
    this.tarjetaVacia = crear("div", "tarjeta vacia ancha");
    const tranquilo = crear("p", "vacia-texto");
    tranquilo.textContent = "Todo tranquilo por aquí. Prueba:";
    this.tarjetaVacia.append(tranquilo, this.sugerencias());
    this.tarjetas.append(this.tarjetasTemporizador, this.tarjetaCalendario, this.tarjetaMusica, this.tarjetaDescargas, this.tarjetaClaude, this.tarjetaVacia);
    inicio.append(this.tituloInicio, this.tarjetas);

    // --- Chat ---
    const chat = crear("div", "vista vista-chat");
    this.chatVacio = crear("div", "chat-vacio");
    const pregunta = crear("p", "vacia-texto");
    pregunta.textContent = "¿En qué te ayudo? Anoto gastos, cronometro tu estudio y respondo lo que quieras.";
    this.chatVacio.append(pregunta, this.sugerencias());
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
    chat.append(this.chatVacio, this.burbuja, this.aprobacion, this.propuesta);

    // --- Código ---
    const codigo = crear("div", "vista vista-codigo");
    this.permisosClaude = crear("div", "grupo-tarjetas");
    this.sesiones = crear("div", "grupo-tarjetas");
    this.codigoVacio = crear("p", "vacia-texto");
    this.codigoVacio.textContent = "No hay sesiones de Claude Code abiertas. Abre una con «claude» en una terminal o en la pestaña Code.";
    codigo.append(this.permisosClaude, this.sesiones, this.codigoVacio);

    // --- Equipo ---
    const equipo = crear("div", "vista vista-equipo");
    this.metricas = crear("div", "metricas");
    const midiendo = crear("p", "vacia-texto");
    midiendo.textContent = "Midiendo…";
    this.metricas.append(midiendo);
    equipo.append(this.metricas);

    this.vistas.set("inicio", inicio).set("chat", chat).set("codigo", codigo).set("equipo", equipo);

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
    this.raiz.append(this.avisoDestacado, inicio, chat, codigo, equipo, formulario);
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

    this.elegir("inicio");
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
    if (pestana === "chat") this.respuestaSinVer = false;
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
    this.tarjetasTemporizador.hidden = lista.length === 0;
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
    this.tarjetaDescargas.hidden = filas.length === 0;
    this.actualizarInicio();
  }

  /** El próximo evento del calendario (solo si es dentro de las próximas 12 h). */
  mostrarCalendario(estado: EstadoCalendario): void {
    const proximo = estado.proximo;
    const visible = proximo !== null && proximo.inicioMs - Date.now() < 12 * 3_600_000;
    this.tarjetaCalendario.hidden = !visible;
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

    // Un permiso nuevo lleva a la pestaña Código.
    const nuevos = estado.permisos.filter((p) => !this.permisosVistos.has(p.id));
    this.permisosVistos = new Set(estado.permisos.map((p) => p.id));
    if (nuevos.length > 0 && puedeDecidir && this.pestana !== "chat") this.elegir("codigo");

    // El resumen en Inicio: cuántas sesiones y qué hace la más reciente.
    const reciente = [...sesiones].sort((a, b) => b.ultimaActividadMs - a.ultimaActividadMs)[0];
    this.tarjetaClaude.hidden = !reciente;
    if (reciente) {
      const etiqueta = crear("div", "tarjeta-etiqueta");
      etiqueta.append(icono("codigo"), ` Claude Code · ${sesiones.length === 1 ? "1 sesión" : `${sesiones.length} sesiones`}`);
      const detalle = crear("div", "tarjeta-detalle");
      detalle.textContent = estado.permisos.length > 0 ? `${estado.permisos[0].proyecto} pide permiso` : `${reciente.proyecto} · ${reciente.actividad}`;
      this.tarjetaClaude.replaceChildren(etiqueta, detalle);
      this.tarjetaClaude.classList.toggle("pide", estado.permisos.length > 0);
    }
    this.botonesPestana.get("codigo")!.hidden = sesiones.length === 0 && estado.permisos.length === 0;
    if (this.pestana === "codigo" && this.botonesPestana.get("codigo")!.hidden) this.elegir("inicio");
    this.actualizarPuntos();
    this.actualizarInicio();
  }

  /** La tarjeta de la música, o nada si no hay un reproductor abierto. */
  mostrarMusica(estado: EstadoMusica | null): void {
    this.tarjetaMusica.hidden = !estado;
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
    const c = this.agente.conversacion;
    if (c.aprobacion || c.propuesta || ocupado(c) || this.respuestaSinVer || performance.now() < this.leerHasta) return "chat";
    if (this.hayPermisoClaude && this.opciones.alDecidirPermisoClaude) return "codigo";
    return "inicio";
  }

  private enviarTexto(texto: string): void {
    if (!texto.trim()) return;
    this.elegir("chat");
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

  /** En Inicio: la tarjeta "todo tranquilo" solo cuando no hay ninguna otra. */
  private actualizarInicio(): void {
    const hayAlgo = [this.tarjetasTemporizador, this.tarjetaCalendario, this.tarjetaMusica, this.tarjetaDescargas, this.tarjetaClaude].some(
      (t) => !t.hidden,
    );
    this.tarjetaVacia.hidden = hayAlgo;
  }

  /** Un punto en la pestaña que tiene algo pendiente y no está a la vista. */
  private actualizarPuntos(): void {
    const c = this.agente.conversacion;
    const chatPendiente = c.aprobacion !== null || c.propuesta !== null || this.respuestaSinVer;
    this.botonesPestana.get("chat")!.classList.toggle("con-punto", chatPendiente && this.pestana !== "chat");
    this.botonesPestana.get("codigo")!.classList.toggle("con-punto", this.hayPermisoClaude && this.pestana !== "codigo");
  }

  private mostrar(c: Conversacion): void {
    // Brote empieza a trabajar, pide permiso o propone aprender algo: al chat.
    const estaOcupado = ocupado(c);
    const aprobacion = c.aprobacion ? `${c.aprobacion.titulo}|${c.aprobacion.detalle}` : null;
    if ((estaOcupado && !this.ocupadoAntes) || (aprobacion && aprobacion !== this.aprobacionAntes) || (c.propuesta && !this.propuestaAntes)) {
      this.elegir("chat");
    }
    this.ocupadoAntes = estaOcupado;
    this.aprobacionAntes = aprobacion;
    this.propuestaAntes = c.propuesta !== null;

    // Con un permiso pendiente, el recuadro de la aprobación lo explica todo y necesita el espacio.
    const hayAlgo = c.mensajeUsuario !== null || c.respuesta !== "" || c.error !== null || c.herramienta !== null;
    this.chatVacio.hidden = hayAlgo || c.aprobacion !== null || c.propuesta !== null;
    this.burbuja.hidden = !hayAlgo || (c.aprobacion !== null && c.respuesta === "");
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
      if (this.pestana !== "chat") this.respuestaSinVer = true;
    }
    this.terminadaAntes = c.terminada;
    this.respuestaAntes = c.respuesta;

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
