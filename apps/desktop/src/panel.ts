// La parte de la isla con la que se habla con el agente: el campo de texto, la burbuja
// con la respuesta y los botones para dar permiso. Son elementos HTML sobre el lienzo;
// la isla les deja el espacio y los muestra solo cuando está abierta.

import type { Agente } from "./agente/agente";
import { ocupado, type Conversacion } from "./agente/conversacion";
import { analizarMarkdown, type Fragmento } from "./agente/markdown";
import type { AccionMusica, Descarga, DescargaEnCurso, EstadoMusica, TemporizadorActivo } from "./agente/puente";
import type { EstadoConexion } from "./agente/puente";

/** Cuánto se destaca un aviso de Brote (temporizador, batería…) (ms). */
const AVISO_DESTACADO_MS = 12_000;

/** Cuánto sigue abierta la isla después de una respuesta, para alcanzar a leerla (ms). */
const LECTURA_MIN = 4000;
const LECTURA_MAX = 15000;
const LECTURA_POR_LETRA = 45;

export interface Zona {
  x: number;
  y: number;
  ancho: number;
  altoMax: number;
}

export class Panel {
  private readonly agente: Agente;
  private readonly raiz: HTMLDivElement;
  private readonly burbuja: HTMLDivElement;
  private readonly usuario: HTMLParagraphElement;
  private readonly respuesta: HTMLDivElement;
  /** El texto ya pintado en la respuesta, para no rehacerla si no cambió. */
  private respuestaPintada: string | null = null;
  private readonly herramienta: HTMLParagraphElement;
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
  private readonly temporizadores: HTMLDivElement;
  private readonly avisoDestacado: HTMLParagraphElement;
  private readonly descargas: HTMLDivElement;
  private readonly alMostrarDescarga?: (ruta: string) => void;
  private readonly musica: HTMLDivElement;
  private readonly musicaTitulo: HTMLSpanElement;
  private readonly musicaPlay: HTMLButtonElement;
  private filasTemporizador: { fin: number; tiempo: HTMLSpanElement }[] = [];
  private avisoHasta = 0;
  private readonly alCancelarTemporizador?: (id: number) => void;
  private readonly entrada: HTMLInputElement;
  private readonly enviar: HTMLButtonElement;
  private visible = false;
  private leerHasta = 0;
  private terminadaAntes = false;
  private respuestaAntes = "";
  /** Sin conexión con OpenClaw, el campo lo dice (los gastos funcionan igual). */
  private sinConexion: string | null = null;

  /**
   * `alAbrirMemoria`: si está, aparece el botón 🧠 que abre "Lo que sé de ti".
   * `flotante`: el panel va sobre el escritorio (sin la isla negra detrás) y lleva fondo propio.
   */
  constructor(
    agente: Agente,
    contenedor: HTMLElement,
    opciones: {
      alAbrirMemoria?: () => void;
      flotante?: boolean;
      alCancelarTemporizador?: (id: number) => void;
      alMostrarDescarga?: (ruta: string) => void;
      alControlarMusica?: (accion: AccionMusica) => void;
    } = {},
  ) {
    this.agente = agente;
    this.raiz = crear("div", opciones.flotante ? "panel flotante" : "panel");

    this.burbuja = crear("div", "burbuja");
    this.usuario = crear("p", "burbuja-usuario");
    this.respuesta = crear("div", "burbuja-respuesta");
    this.herramienta = crear("p", "burbuja-herramienta");
    this.sinIA = crear("p", "burbuja-sin-ia");
    this.sinIA.textContent = "⚡ sin IA";
    this.sinIA.title = "Lo resolvió el motor de comandos, sin usar el agente";
    this.burbuja.append(this.usuario, this.respuesta, this.herramienta, this.sinIA);

    this.aprobacion = crear("div", "aprobacion");
    this.aprobacionTitulo = crear("p", "aprobacion-titulo");
    this.aprobacionDetalle = crear("code", "aprobacion-detalle");
    const botones = crear("div", "aprobacion-botones");
    this.rechazar = crear("button", "boton");
    this.rechazar.type = "button";
    this.rechazar.textContent = "Rechazar";
    this.permitir = crear("button", "boton boton-primario");
    this.permitir.type = "button";
    this.permitir.textContent = "Permitir";
    botones.append(this.rechazar, this.permitir);
    this.aprobacion.append(this.aprobacionTitulo, this.aprobacionDetalle, botones);

    const formulario = crear("form", "formulario");
    this.entrada = crear("input", "entrada");
    this.entrada.type = "text";
    this.entrada.placeholder = "Escríbeme algo…";
    this.entrada.autocomplete = "off";
    this.entrada.spellcheck = false;
    this.entrada.maxLength = 1000;
    this.enviar = crear("button", "boton-enviar");
    this.enviar.type = "submit";
    this.enviar.textContent = "↑";
    this.enviar.setAttribute("aria-label", "Enviar");
    formulario.append(this.entrada, this.enviar);
    if (opciones.alAbrirMemoria) {
      const memoria = crear("button", "boton-memoria");
      memoria.type = "button";
      memoria.textContent = "🧠";
      memoria.title = "Lo que sé de ti";
      memoria.setAttribute("aria-label", "Lo que sé de ti");
      memoria.addEventListener("click", opciones.alAbrirMemoria);
      formulario.prepend(memoria);
    }

    this.propuesta = crear("div", "aprobacion propuesta");
    const propuestaTitulo = crear("p", "aprobacion-titulo");
    propuestaTitulo.textContent = "¿Aprendo a entender esto sin IA?";
    this.propuestaDetalle = crear("p", "propuesta-detalle");
    const botonesPropuesta = crear("div", "aprobacion-botones");
    this.noAprender = crear("button", "boton");
    this.noAprender.type = "button";
    this.noAprender.textContent = "No";
    this.aprender = crear("button", "boton boton-primario");
    this.aprender.type = "button";
    this.aprender.textContent = "Sí, aprende";
    botonesPropuesta.append(this.noAprender, this.aprender);
    this.propuesta.append(propuestaTitulo, this.propuestaDetalle, botonesPropuesta);

    this.alCancelarTemporizador = opciones.alCancelarTemporizador;
    this.temporizadores = crear("div", "temporizadores");
    this.temporizadores.hidden = true;
    this.avisoDestacado = crear("p", "aviso-destacado");
    this.avisoDestacado.hidden = true;
    this.alMostrarDescarga = opciones.alMostrarDescarga;
    this.descargas = crear("div", "filas descargas");
    this.descargas.hidden = true;

    // La píldora de la música: "♪ canción — artista" con ⏮ ⏯ ⏭.
    this.musica = crear("div", "fila musica");
    this.musica.hidden = true;
    this.musicaTitulo = crear("span", "fila-nombre");
    const boton = (texto: string, titulo: string, accion: AccionMusica) => {
      const b = crear("button", "boton-musica");
      b.type = "button";
      b.textContent = texto;
      b.title = titulo;
      b.setAttribute("aria-label", titulo);
      b.addEventListener("click", () => opciones.alControlarMusica?.(accion));
      return b;
    };
    this.musicaPlay = boton("⏯", "Play / pausa", "play-pausa");
    this.musica.append(this.musicaTitulo);
    if (opciones.alControlarMusica) {
      this.musica.append(boton("⏮", "Canción anterior", "anterior"), this.musicaPlay, boton("⏭", "Siguiente canción", "siguiente"));
    }

    this.raiz.append(this.avisoDestacado, this.temporizadores, this.musica, this.descargas, this.burbuja, this.aprobacion, this.propuesta, formulario);
    contenedor.append(this.raiz);

    formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      // Mientras el agente trabaja, el mismo botón lo detiene.
      if (ocupado(this.agente.conversacion)) {
        void this.agente.detener();
        return;
      }
      const texto = this.entrada.value;
      void this.agente.enviar(texto).then((enviado) => {
        if (enviado && this.entrada.value === texto) this.entrada.value = "";
        this.actualizarBotonEnviar();
      });
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

    agente.alCambiar((c) => this.mostrar(c));
    this.mostrar(agente.conversacion);
  }

  /** La isla no debe cerrarse: hay texto escrito, un permiso pendiente o una respuesta por leer. */
  retieneIsla(ahora: number): boolean {
    const c = this.agente.conversacion;
    return (
      this.entrada.value.trim() !== "" ||
      c.aprobacion !== null ||
      c.propuesta !== null ||
      ahora < this.leerHasta ||
      Date.now() < this.avisoHasta
    );
  }

  /** Una fila por temporizador corriendo, con su cuenta regresiva y un botón para cancelarlo. */
  mostrarTemporizadores(lista: TemporizadorActivo[]): void {
    this.filasTemporizador = [];
    this.temporizadores.replaceChildren(
      ...lista.map((t) => {
        const fila = crear("div", `temporizador ${t.tipo} ${t.fase ?? ""}`);
        const nombre =
          t.tipo === "pomodoro"
            ? `🍅 ${t.fase === "descanso" ? "Descanso" : "Estudio"}${t.etiqueta ? ` · ${t.etiqueta}` : ""}`
            : `⏰ ${t.etiqueta ?? "Temporizador"}`;
        const tiempo = crear("span", "temporizador-tiempo");
        fila.append(crear("span", "temporizador-nombre"), tiempo);
        fila.firstElementChild!.textContent = nombre;
        if (this.alCancelarTemporizador) {
          const cancelar = crear("button", "temporizador-cancelar");
          cancelar.type = "button";
          cancelar.textContent = "■";
          cancelar.title = t.tipo === "pomodoro" ? "Detener el pomodoro" : "Cancelar";
          cancelar.addEventListener("click", () => this.alCancelarTemporizador?.(t.id));
          fila.append(cancelar);
        }
        this.filasTemporizador.push({ fin: t.finMs, tiempo });
        return fila;
      }),
    );
    this.temporizadores.hidden = lista.length === 0;
    this.actualizarRelojes();
  }

  /**
   * Las descargas en curso ("📥 Descargando apunte.pdf…") y las que terminaron hace poco ("Lista ✓",
   * con un botón para mostrarla en el Finder o el Explorador).
   */
  mostrarDescargas(enCurso: DescargaEnCurso[], listas: Descarga[]): void {
    const filas = [
      ...enCurso.map((d) => {
        const fila = crear("div", "fila descarga en-curso");
        const nombre = crear("span", "fila-nombre");
        nombre.textContent = `📥 Descargando ${d.nombre ?? "un archivo"}…`;
        const tamano = crear("span", "fila-dato");
        tamano.textContent = tamanoCorto(d.tamano);
        fila.append(nombre, tamano);
        return fila;
      }),
      ...listas.map((d) => {
        const fila = crear("div", "fila descarga lista");
        const nombre = crear("span", "fila-nombre");
        nombre.textContent = `📥 ${d.nombre}`;
        nombre.title = d.nombre;
        const lista = crear("span", "fila-dato");
        lista.textContent = "Lista ✓";
        fila.append(nombre, lista);
        if (this.alMostrarDescarga) {
          const mostrar = crear("button", "boton boton-fila");
          mostrar.type = "button";
          mostrar.textContent = "Mostrar";
          mostrar.title = navigator.userAgent.includes("Windows") ? "Mostrar en el Explorador" : "Mostrar en el Finder";
          mostrar.addEventListener("click", () => this.alMostrarDescarga?.(d.ruta));
          fila.append(mostrar);
        }
        return fila;
      }),
    ];
    this.descargas.replaceChildren(...filas);
    this.descargas.hidden = filas.length === 0;
  }

  /** La píldora de la música, o nada si no hay un reproductor abierto. */
  mostrarMusica(estado: EstadoMusica | null): void {
    this.musica.hidden = !estado;
    if (!estado) return;
    const titulo = estado.cancion ? (estado.artista ? `${estado.cancion} — ${estado.artista}` : estado.cancion) : estado.app;
    this.musicaTitulo.textContent = `${estado.sonando ? "♪" : "⏸"} ${titulo}`;
    this.musicaTitulo.title = `${titulo} (${estado.app})`;
    this.musica.classList.toggle("sonando", estado.sonando);
    this.musicaPlay.textContent = estado.sonando ? "⏸" : "▶";
    this.musicaPlay.title = estado.sonando ? "Pausa" : "Play";
  }

  /** Mantiene la isla abierta un rato (por ejemplo, al terminar una descarga). */
  retener(ms = AVISO_DESTACADO_MS): void {
    this.avisoHasta = Math.max(this.avisoHasta, Date.now() + ms);
  }

  /** Avanza las cuentas regresivas (se llama en cada cuadro). */
  actualizarRelojes(): void {
    const ahora = Date.now();
    for (const { fin, tiempo } of this.filasTemporizador) tiempo.textContent = cuentaRegresiva(fin - ahora);
    if (!this.avisoDestacado.hidden && ahora > this.avisoHasta) this.avisoDestacado.hidden = true;
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

  /** Ubica el panel dentro de la isla abierta y lo muestra u oculta. */
  ubicar(zona: Zona, visible: boolean): void {
    const estilo = this.raiz.style;
    estilo.left = `${zona.x}px`;
    estilo.top = `${zona.y}px`;
    estilo.width = `${zona.ancho}px`;
    estilo.maxHeight = `${zona.altoMax}px`;
    if (visible === this.visible) return;
    this.visible = visible;
    this.raiz.classList.toggle("visible", visible);
    // Al cerrarse la isla, el foco no debe quedar en un campo que no se ve.
    if (!visible && document.activeElement && this.raiz.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }

  /** Si un punto de la ventana cae sobre una zona clicable del panel. */
  contiene(x: number, y: number): boolean {
    if (!this.visible) return false;
    const r = this.raiz.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  private mostrar(c: Conversacion): void {
    // Con un permiso pendiente, el recuadro de la aprobación lo explica todo y necesita el espacio.
    const hayAlgo = c.mensajeUsuario !== null || c.respuesta !== "" || c.error !== null || c.herramienta !== null;
    this.burbuja.hidden = !hayAlgo || (c.aprobacion !== null && c.respuesta === "");
    this.usuario.textContent = c.mensajeUsuario ?? "";
    this.usuario.hidden = !c.mensajeUsuario;

    const esperando = ocupado(c) && !c.respuesta && !c.herramienta && !c.aprobacion;
    const texto = c.error ?? (esperando ? "…" : c.respuesta);
    if (texto !== this.respuestaPintada) {
      // Los errores van tal cual; las respuestas, con su formato (negrita, listas…).
      if (c.error !== null) this.respuesta.textContent = texto;
      else pintarMarkdown(this.respuesta, texto);
      this.respuestaPintada = texto;
    }
    this.respuesta.classList.toggle("error", c.error !== null);
    this.respuesta.hidden = texto === "";
    this.herramienta.textContent = c.herramienta?.etiqueta ?? "";
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
    }
    this.terminadaAntes = c.terminada;
    this.respuestaAntes = c.respuesta;

    this.actualizarEntrada();
  }

  /** Muestra en el campo si se perdió la conexión con OpenClaw. */
  mostrarConexion(estado: EstadoConexion): void {
    this.sinConexion = estado.conectado ? null : (estado.detalle ?? "Sin conexión con OpenClaw");
    // El campo es corto: el motivo completo queda en el título, al pasar el cursor.
    this.entrada.title = this.sinConexion ?? "";
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
    this.enviar.textContent = trabajando ? "■" : "↑";
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

/** "830 KB", "12 MB", "1,2 GB": el tamaño de una descarga en curso. */
function tamanoCorto(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
}

/** "12:34" o "1:02:03". */
export function cuentaRegresiva(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  const dos = (n: number) => String(n).padStart(2, "0");
  return horas > 0 ? `${horas}:${dos(minutos)}:${dos(segundos)}` : `${minutos}:${dos(segundos)}`;
}
