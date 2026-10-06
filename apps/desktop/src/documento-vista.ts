// Documentos (D) en la isla: la tarjeta que aparece al arrastrar un archivo hacia Brote (zona de soltar, «leyendo…»
// y «¿qué hago con él?») y la lista de la pestaña Estudio. El estado de la interfaz vive aquí; los textos y las
// reglas, en `agente/documentos.ts` (con pruebas). Brote se pone lentes y lee mientras tanto: `modoLectura`
// le dice al personaje en qué paso va. Solo se muestran nombres y datos; el texto nunca llega a la ventana.

import { HEX_RAMO } from "./agente/estudio.ts";
import type { Ramo } from "./agente/estudio.ts";
import {
  ACCIONES_DOCUMENTO,
  describirDocumento,
  mensajeParaAgente,
  nombreCorto,
  prefijoOtraCosa,
  revisarArrastre,
  textoArrastre,
  textoLeyendo,
  textoPregunta,
  textoSinDocumentos,
} from "./agente/documentos.ts";
import type { AccionDocumento, DocumentoVista, FaseDocumento } from "./agente/documentos.ts";

export interface AccionesDocumento {
  /** Pide al puente leer el archivo y guardar su texto; devuelve el documento o lanza con el motivo. */
  agregar: (ruta: string) => Promise<DocumentoVista>;
  /** Escribe el mensaje al agente, como si el usuario lo hubiera mandado. */
  enviar: (texto: string) => void;
  /** Deja un texto en el campo para que el usuario lo termine. */
  escribirEnCampo: (texto: string) => void;
  asignarRamo: (documento: string, ramo: number | null) => Promise<void>;
  /** El diálogo para elegir un archivo (`null` si el usuario cancela o no hay diálogo). */
  elegirArchivo?: () => Promise<string | null>;
  /** El usuario pidió algo: la isla va a la pestaña donde se ve la respuesta. */
  verRespuesta: () => void;
}

/** Cuánto se ve a Brote leyendo como mínimo (si el texto sale al tiro, igual se disfruta la animación). */
export const LECTURA_MINIMA_MS = 2400;
/** Cuánto espera la tarjeta: sin novedades del arrastre, sin que el usuario elija, o un error a la vista. */
const ARRASTRE_SIN_NOVEDAD_MS = 6000;
const LISTO_SIN_ELEGIR_MS = 45_000;
const ERROR_A_LA_VISTA_MS = 8000;
/** Si el agente no arranca después de un pedido, Brote se saca los lentes pasado este tiempo. */
const ESPERA_AGENTE_MS = 25_000;

function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(etiqueta);
  e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}
function boton(clase: string, texto: string): HTMLButtonElement {
  const b = crear("button", clase, texto);
  b.type = "button";
  return b;
}
const dormir = (ms: number) => new Promise<void>((listo) => setTimeout(listo, ms));
const nombreDe = (ruta: string) => ruta.split(/[\\/]/).pop() ?? ruta;

export class VistaDocumento {
  /** La tarjeta flotante (arriba del panel, en cualquier pestaña). */
  readonly el: HTMLElement;
  /** Cuánto se ve leer como mínimo; las pruebas lo acortan. */
  static lecturaMinimaMs = LECTURA_MINIMA_MS;
  fase: FaseDocumento = "inactivo";
  private documentos: DocumentoVista[] = [];
  private ramos: readonly Ramo[] = [];
  private actual: DocumentoVista | null = null;
  private nombre = "";
  private mensaje = "";
  private invalido = false;
  private expandido: string | null = null;
  private error = "";
  /** Brote está leyendo un documento a pedido del usuario (hasta que el agente termina). */
  private atendiendoDesde: number | null = null;
  private agenteArranco = false;
  /** Desde cuándo está en la fase actual / la última vez que se supo del arrastre (para que nada se quede pegado). */
  private desde = 0;
  private faseAnterior: FaseDocumento = "inactivo";

  private readonly acciones: AccionesDocumento;
  private readonly redibujar: () => void;

  constructor(acciones: AccionesDocumento, redibujar: () => void) {
    this.acciones = acciones;
    this.redibujar = redibujar;
    this.el = crear("div", "tarjeta documento-flotante");
    this.el.hidden = true;
  }

  ponerRamos(ramos: readonly Ramo[]): void {
    this.ramos = ramos;
    if (this.fase === "listo") this.pintar();
  }

  ponerDocumentos(lista: DocumentoVista[]): void {
    this.documentos = lista;
    if (this.expandido && !lista.some((d) => d.id === this.expandido)) this.expandido = null;
    this.redibujar();
  }

  /** Si la tarjeta lleva demasiado tiempo sin novedades, se retira sola (un arrastre cancelado, un «listo» ignorado). */
  private vencer(ahora: number): void {
    const espera = { arrastrando: ARRASTRE_SIN_NOVEDAD_MS, listo: LISTO_SIN_ELEGIR_MS, error: ERROR_A_LA_VISTA_MS }[this.fase as "arrastrando" | "listo" | "error"];
    if (espera !== undefined && ahora - this.desde > espera) this.cerrar();
  }

  /** ¿Hay algo a medias que la isla no debe cerrar? */
  get activa(): boolean {
    this.vencer(Date.now());
    return this.fase !== "inactivo";
  }

  /** Sigue el arrastre (over): mientras lleguen avisos, la zona de soltar se queda. */
  sigueArrastrando(): void {
    if (this.fase === "arrastrando") this.desde = Date.now();
  }

  /** En qué paso va Brote: lentes (esperando o escuchando), leyendo (con la hoja) o nada. */
  modoLectura(estadoAgente: string, ahora = Date.now()): "lentes" | "leyendo" | null {
    this.vencer(ahora);
    if (this.fase === "arrastrando") return this.invalido ? null : "lentes";
    if (this.fase === "leyendo") return "leyendo";
    if (this.fase === "listo") return "lentes";
    if (this.atendiendoDesde !== null) {
      const trabajando = estadoAgente === "pensando" || estadoAgente === "trabajando" || estadoAgente === "pidiendo-permiso";
      if (trabajando) this.agenteArranco = true;
      if (!trabajando && (this.agenteArranco || ahora - this.atendiendoDesde > ESPERA_AGENTE_MS)) {
        this.atendiendoDesde = null;
        this.agenteArranco = false;
        return null;
      }
      return "leyendo";
    }
    return null;
  }

  // ---- Arrastrar y soltar --------------------------------------------------------------------------------

  /** Algo se está arrastrando hacia Brote (enter). */
  arrastrar(rutas: readonly string[]): void {
    if (this.fase === "leyendo") return;
    const r = revisarArrastre(rutas);
    this.fase = "arrastrando";
    this.invalido = r.elegido === null;
    this.mensaje = textoArrastre(r);
    this.pintar();
  }

  /** Se soltó o se fue el cursor sin soltar (leave). */
  salirDelArrastre(): void {
    if (this.fase !== "arrastrando") return;
    this.fase = "inactivo";
    this.pintar();
  }

  /** Se soltó algo: Brote lee el primero que pueda. */
  async soltar(rutas: readonly string[]): Promise<void> {
    if (this.fase === "leyendo") return;
    const r = revisarArrastre(rutas);
    if (!r.elegido) {
      this.fase = "error";
      this.error = textoArrastre(r);
      this.pintar();
      return;
    }
    await this.leer(r.elegido, r.extras > 0 ? "Por ahora Brote lee uno a la vez: leí el primero." : "");
  }

  /** «Agregar documento»: el diálogo de archivos. */
  async elegir(): Promise<void> {
    if (!this.acciones.elegirArchivo || this.fase === "leyendo") return;
    const ruta = await this.acciones.elegirArchivo().catch(() => null);
    if (ruta) await this.leer(ruta, "");
  }

  private async leer(ruta: string, nota: string): Promise<void> {
    this.fase = "leyendo";
    this.nombre = nombreDe(ruta);
    this.mensaje = nota;
    this.actual = null;
    this.error = "";
    this.pintar();
    const inicio = Date.now();
    try {
      const doc = await this.acciones.agregar(ruta);
      await dormir(Math.max(0, VistaDocumento.lecturaMinimaMs - (Date.now() - inicio)));
      this.actual = doc;
      this.nombre = doc.nombre;
      this.fase = "listo";
    } catch (error) {
      await dormir(Math.max(0, Math.min(900, VistaDocumento.lecturaMinimaMs) - (Date.now() - inicio)));
      this.fase = "error";
      this.error = error instanceof Error ? error.message : "No pude leer ese archivo.";
    }
    this.pintar();
  }

  cerrar(): void {
    this.fase = "inactivo";
    this.actual = null;
    this.pintar();
  }

  // ---- Qué hacer con un documento ------------------------------------------------------------------------

  /** Una de las acciones sobre un documento (desde la tarjeta o desde la lista de Estudio). */
  hacer(accion: AccionDocumento, d: DocumentoVista): void {
    if (accion === "otra") this.acciones.escribirEnCampo(prefijoOtraCosa(d));
    else {
      this.acciones.enviar(mensajeParaAgente(accion, d));
      this.acciones.verRespuesta();
    }
    // Brote sigue con los lentes y lee mientras el agente trabaja.
    this.atendiendoDesde = Date.now();
    this.agenteArranco = false;
    if (this.fase === "listo") {
      this.fase = "inactivo";
      this.actual = null;
      this.pintar();
    }
  }

  private botonesDeAcciones(d: DocumentoVista): HTMLElement {
    const fila = crear("div", "documento-acciones");
    for (const a of ACCIONES_DOCUMENTO) {
      const b = boton("pildora documento-accion", `${a.emoji} ${a.etiqueta}`);
      b.title = a.ayuda;
      b.addEventListener("click", () => this.hacer(a.id, d));
      fila.append(b);
    }
    return fila;
  }

  private selectorDeRamo(d: DocumentoVista): HTMLElement | null {
    if (this.ramos.length === 0) return null;
    const caja = crear("label", "documento-ramo");
    caja.append(crear("span", "documento-ramo-texto", "Ramo"));
    const select = crear("select", "estudio-campo");
    select.setAttribute("aria-label", "Ramo del documento");
    const sin = document.createElement("option");
    sin.value = "";
    sin.textContent = "Sin ramo";
    select.append(sin);
    for (const r of this.ramos) {
      const o = document.createElement("option");
      o.value = String(r.id);
      o.textContent = r.nombre;
      select.append(o);
    }
    select.value = d.ramoId === null ? "" : String(d.ramoId);
    select.addEventListener("change", () => {
      const ramo = select.value === "" ? null : Number(select.value);
      d.ramoId = ramo;
      void this.acciones.asignarRamo(d.id, ramo).catch(() => {});
    });
    caja.append(select);
    return caja;
  }

  // ---- Dibujo --------------------------------------------------------------------------------------------

  /** Pinta la tarjeta flotante según la fase. */
  private pintar(): void {
    if (this.fase !== this.faseAnterior) {
      this.faseAnterior = this.fase;
      this.desde = Date.now();
    }
    const el = this.el;
    el.hidden = this.fase === "inactivo";
    el.className = `tarjeta documento-flotante ${this.fase}`;
    if (this.fase === "inactivo") {
      el.replaceChildren();
      this.redibujar();
      return;
    }
    if (this.fase === "arrastrando") {
      const zona = crear("div", `documento-zona${this.invalido ? " invalida" : ""}`);
      zona.append(crear("span", "documento-zona-icono", this.invalido ? "🚫" : "📄"), crear("span", "documento-zona-texto", this.mensaje));
      el.replaceChildren(zona);
    } else if (this.fase === "leyendo") {
      const fila = crear("div", "documento-leyendo");
      fila.append(crear("span", "documento-zona-icono", "📄"), crear("span", "documento-zona-texto", textoLeyendo(this.nombre)));
      el.replaceChildren(fila, ...(this.mensaje ? [crear("p", "documento-nota", this.mensaje)] : []));
    } else if (this.fase === "error") {
      const cerrar = boton("documento-cerrar", "✕");
      cerrar.title = "Cerrar";
      cerrar.addEventListener("click", () => this.cerrar());
      el.replaceChildren(crear("p", "estudio-error", this.error), cerrar);
    } else if (this.actual) {
      const d = this.actual;
      const cabeza = crear("div", "documento-cabeza");
      cabeza.append(crear("div", "tarjeta-titulo", textoPregunta(d.nombre)));
      const cerrar = boton("documento-cerrar", "✕");
      cerrar.title = "Ahora no (el documento queda guardado)";
      cerrar.addEventListener("click", () => this.cerrar());
      cabeza.append(cerrar);
      const partes: HTMLElement[] = [cabeza, crear("p", "documento-detalle", describirDocumento(d))];
      if (this.mensaje) partes.push(crear("p", "documento-nota", this.mensaje));
      const ramo = this.selectorDeRamo(d);
      if (ramo) partes.push(ramo);
      partes.push(this.botonesDeAcciones(d));
      el.replaceChildren(...partes);
    }
    this.redibujar();
  }

  /** La tarjeta «Documentos» de la pestaña Estudio: los guardados, cada uno con sus acciones. */
  tarjetaEstudio(): HTMLElement {
    const caja = crear("div", "tarjeta documentos-lista");
    const cabeza = crear("div", "documentos-cabeza");
    cabeza.append(crear("div", "tarjeta-titulo", "Documentos"));
    if (this.acciones.elegirArchivo) {
      const agregar = boton("pildora", "+ Agregar documento");
      agregar.title = "También puedes arrastrar un archivo hacia Brote";
      agregar.addEventListener("click", () => void this.elegir());
      cabeza.append(agregar);
    }
    caja.append(cabeza);
    if (this.documentos.length === 0) {
      caja.append(crear("p", "vacia-texto", textoSinDocumentos()));
      return caja;
    }
    for (const d of this.documentos) {
      const abierto = this.expandido === d.id;
      const fila = boton(`documento-fila${abierto ? " abierta" : ""}`, "");
      fila.setAttribute("aria-expanded", String(abierto));
      const ramo = this.ramos.find((r) => r.id === d.ramoId);
      const punto = crear("span", "estudio-punto");
      if (ramo) punto.style.setProperty("--ramo", HEX_RAMO[ramo.color]);
      else punto.style.visibility = "hidden";
      const texto = crear("span", "documento-fila-texto");
      texto.append(crear("span", "documento-fila-nombre", nombreCorto(d.nombre, 40)), crear("span", "documento-fila-detalle", describirDocumento(d)));
      fila.append(crear("span", "documento-fila-icono", "📄"), texto, punto);
      fila.addEventListener("click", () => {
        this.expandido = abierto ? null : d.id;
        this.redibujar();
      });
      caja.append(fila);
      if (abierto) {
        const cuerpo = crear("div", "documento-cuerpo");
        const ramoSel = this.selectorDeRamo(d);
        if (ramoSel) cuerpo.append(ramoSel);
        cuerpo.append(this.botonesDeAcciones(d));
        caja.append(cuerpo);
      }
    }
    return caja;
  }
}
