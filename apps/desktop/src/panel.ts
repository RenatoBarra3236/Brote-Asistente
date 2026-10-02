// La parte de la isla con la que se habla con el agente: el campo de texto, la burbuja
// con la respuesta y los botones para dar permiso. Son elementos HTML sobre el lienzo;
// la isla les deja el espacio y los muestra solo cuando está abierta.

import type { Agente } from "./agente/agente";
import { ocupado, type Conversacion } from "./agente/conversacion";
import type { EstadoConexion } from "./agente/puente";

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
  private readonly respuesta: HTMLParagraphElement;
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
  private readonly entrada: HTMLInputElement;
  private readonly enviar: HTMLButtonElement;
  private visible = false;
  private leerHasta = 0;
  private terminadaAntes = false;
  private respuestaAntes = "";
  /** Sin conexión con OpenClaw, el campo lo dice (los gastos funcionan igual). */
  private sinConexion: string | null = null;

  constructor(agente: Agente, contenedor: HTMLElement) {
    this.agente = agente;
    this.raiz = crear("div", "panel");

    this.burbuja = crear("div", "burbuja");
    this.usuario = crear("p", "burbuja-usuario");
    this.respuesta = crear("p", "burbuja-respuesta");
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

    this.raiz.append(this.burbuja, this.aprobacion, this.propuesta, formulario);
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
    return this.entrada.value.trim() !== "" || c.aprobacion !== null || c.propuesta !== null || ahora < this.leerHasta;
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
    this.respuesta.textContent = c.error ?? (esperando ? "…" : c.respuesta);
    this.respuesta.classList.toggle("error", c.error !== null);
    this.respuesta.hidden = this.respuesta.textContent === "";
    this.herramienta.textContent = c.herramienta?.etiqueta ?? "";
    this.herramienta.hidden = !c.herramienta;
    this.sinIA.hidden = !c.sinIA;
    // La respuesta va llegando de a poco: se mantiene a la vista el final.
    this.burbuja.scrollTop = this.burbuja.scrollHeight;

    const ap = c.aprobacion;
    this.aprobacion.hidden = !ap;
    if (ap) {
      this.aprobacionTitulo.textContent = ap.titulo;
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
