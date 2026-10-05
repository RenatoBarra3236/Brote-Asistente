// La parte del repaso (A3) de la pestaña Estudio: propuestas por revisar, la tarjeta «Repasar» y la sesión
// de una tarjeta a la vez. El estado de la interfaz vive aquí; los textos y reglas, en `agente/repaso.ts`
// (con pruebas). `panel.ts` solo le pide elementos y le dice cuándo redibujar.

import type { Ramo } from "./agente/estudio";
import {
  ETIQUETA_RESULTADO,
  REPASO_VACIO,
  SesionRepaso,
  armarDecision,
  cuantasMarcadas,
  lineaRepasoDeRamo,
  marcasIniciales,
  resumenPropuesta,
  tarjetasMarcadas,
  textoAceptado,
  textoBotonAceptar,
  tituloPropuesta,
} from "./agente/repaso";
import type { EstadoRepaso, Marcas, PropuestaRepaso, Resultado } from "./agente/repaso";

export interface AccionesRepaso {
  aceptar: (grabacion: string, decision: ReturnType<typeof armarDecision>) => Promise<{ tarjetas: number; repetidas: number; temas: number }>;
  descartar: (grabacion: string) => Promise<void>;
  responder: (tarjeta: number, resultado: Resultado) => Promise<void>;
}

/** Lo que el usuario va haciendo con una propuesta antes de aceptarla. */
interface BorradorPropuesta {
  abierta: boolean;
  marcas: Marcas;
  ramoId: number | null;
  /** Qué fila se está corrigiendo: «g0» (término 0) o «p1» (pregunta 1). */
  editando: string | null;
  glosario: Record<number, { termino: string; definicion: string }>;
  preguntas: Record<number, { pregunta: string; respuesta: string }>;
  error: string;
  enviando: boolean;
}

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

export class VistaRepaso {
  private estado: EstadoRepaso = REPASO_VACIO;
  private readonly borradores = new Map<string, BorradorPropuesta>();
  private sesion: SesionRepaso | null = null;
  private errorSesion = "";
  private mensaje = "";
  private readonly detallesAbiertos = new Set<number>();

  constructor(
    private readonly acciones: AccionesRepaso,
    private readonly redibujar: () => void,
  ) {}

  /** Lo último que mandó el puente. Quita lo que ya no existe; una sesión en curso no cambia. */
  poner(estado: EstadoRepaso): void {
    this.estado = estado;
    const vigentes = new Set(estado.propuestas.map((p) => p.grabacion));
    for (const g of [...this.borradores.keys()]) if (!vigentes.has(g)) this.borradores.delete(g);
  }

  get datos(): EstadoRepaso {
    return this.estado;
  }

  get enSesion(): boolean {
    return this.sesion !== null;
  }

  /** ¿Hay una sesión en curso o una propuesta abierta? La isla no se cierra sola mientras tanto. */
  get ocupada(): boolean {
    return this.sesion !== null || [...this.borradores.values()].some((b) => b.abierta);
  }

  /** Empieza una sesión con lo que vence hoy (de un ramo o de todos). Devuelve false si no hay nada. */
  iniciarSesion(ramoId: number | null = null, ahoraMs = Date.now()): boolean {
    const s = new SesionRepaso(this.estado, ahoraMs, ramoId);
    this.errorSesion = "";
    if (s.vacia) {
      this.mensaje = "No tienes tarjetas para repasar hoy 🎉";
      this.redibujar();
      return false;
    }
    this.sesion = s;
    this.mensaje = "";
    this.redibujar();
    return true;
  }

  /** Salir de la sesión (al cambiar de pestaña o con «Salir»). */
  terminarSesion(): void {
    if (!this.sesion) return;
    this.sesion = null;
    this.redibujar();
  }

  // ---- Lo que va arriba de Estudio ---------------------------------------------------------------

  /** Si hay una sesión, es lo único que se ve; si no, las propuestas por revisar y la tarjeta «Repasar». */
  arriba(ramos: readonly Ramo[]): HTMLElement[] {
    if (this.sesion) return [this.vistaSesion(this.sesion)];
    const partes: HTMLElement[] = [];
    for (const p of this.estado.propuestas) partes.push(this.tarjetaPropuesta(p, ramos));
    const repasar = this.tarjetaRepasar();
    if (repasar) partes.push(repasar);
    return partes;
  }

  private tarjetaRepasar(): HTMLElement | null {
    const { total, hoy } = this.estado;
    if (this.mensaje && total === 0) return null;
    if (total === 0) return null;
    const caja = crear("div", "tarjeta repaso-resumen");
    const titulo = crear("div", "tarjeta-titulo", "Repaso");
    const detalle = crear("div", "repaso-linea", hoy > 0 ? `${hoy === 1 ? "1 tarjeta" : `${hoy} tarjetas`} para hoy · ${total} en total` : `Nada para hoy 🎉 · ${total} en total`);
    caja.append(titulo, detalle);
    if (hoy > 0) {
      const ir = boton("pildora repaso-ir", "Repasar");
      ir.addEventListener("click", () => this.iniciarSesion(null));
      caja.append(ir);
    }
    if (this.mensaje) caja.append(crear("p", "vacia-texto", this.mensaje));
    return caja;
  }

  // ---- Propuesta por revisar -----------------------------------------------------------------------

  private borrador(p: PropuestaRepaso): BorradorPropuesta {
    let b = this.borradores.get(p.grabacion);
    if (!b) {
      b = { abierta: false, marcas: marcasIniciales(p.kit), ramoId: p.ramoId, editando: null, glosario: {}, preguntas: {}, error: "", enviando: false };
      this.borradores.set(p.grabacion, b);
    }
    return b;
  }

  private tarjetaPropuesta(p: PropuestaRepaso, ramos: readonly Ramo[]): HTMLElement {
    const b = this.borrador(p);
    const caja = crear("div", `tarjeta repaso-propuesta${b.abierta ? " abierta" : ""}`);
    caja.append(crear("div", "tarjeta-titulo", tituloPropuesta(p)), crear("div", "repaso-linea", resumenPropuesta(p.kit)));

    if (!b.abierta) {
      const acciones = crear("div", "estudio-acciones");
      const revisar = boton("pildora", "Revisar");
      revisar.addEventListener("click", () => {
        b.abierta = true;
        this.redibujar();
      });
      const descartar = boton("pildora", "Descartar");
      descartar.addEventListener("click", () => void this.descartar(p, b));
      acciones.append(revisar, descartar);
      caja.append(acciones);
      return caja;
    }

    // Ramo: el agente lo sugiere (si lo sabía) y el usuario lo confirma o lo cambia.
    const fila = crear("label", "repaso-ramo");
    fila.append(crear("span", "estudio-seccion", "Ramo"));
    const select = crear("select", "estudio-campo");
    select.setAttribute("aria-label", "Ramo de este repaso");
    const sin = document.createElement("option");
    sin.value = "";
    sin.textContent = "Sin ramo";
    select.append(sin);
    for (const r of ramos.filter((x) => !x.archivado)) {
      const o = document.createElement("option");
      o.value = String(r.id);
      o.textContent = r.nombre;
      select.append(o);
    }
    select.value = b.ramoId === null ? "" : String(b.ramoId);
    select.addEventListener("change", () => {
      b.ramoId = select.value === "" ? null : Number(select.value);
    });
    fila.append(select);
    caja.append(fila);

    if (p.kit.temas.length > 0) {
      caja.append(crear("div", "estudio-seccion", "Temas"));
      p.kit.temas.forEach((t, i) => {
        const f = this.filaMarcable(b.marcas.temas, i, t.titulo, t.puntos.join(" · "), caja, b);
        caja.append(f);
      });
    }
    if (p.kit.glosario.length > 0) {
      caja.append(crear("div", "estudio-seccion", "Términos"));
      p.kit.glosario.forEach((g, i) => {
        const v = b.glosario[i] ?? g;
        caja.append(this.filaEditable(b, "g", i, b.marcas.glosario, v.termino, v.definicion, caja, () => ({ a: v.termino, b: v.definicion }), (a, c) => (b.glosario[i] = { termino: a, definicion: c }), "Término", "Definición", 60, 200));
      });
    }
    if (p.kit.preguntas.length > 0) {
      caja.append(crear("div", "estudio-seccion", "Preguntas de práctica"));
      p.kit.preguntas.forEach((q, i) => {
        const v = b.preguntas[i] ?? q;
        caja.append(this.filaEditable(b, "p", i, b.marcas.preguntas, v.pregunta, v.respuesta, caja, () => ({ a: v.pregunta, b: v.respuesta }), (a, c) => (b.preguntas[i] = { pregunta: a, respuesta: c }), "Pregunta", "Respuesta", 200, 300));
      });
    }

    if (b.error) caja.append(crear("p", "estudio-error", b.error));
    const acciones = crear("div", "estudio-acciones");
    const aceptar = boton("pildora repaso-aceptar", textoBotonAceptar(b.marcas));
    aceptar.disabled = b.enviando || cuantasMarcadas(b.marcas) === 0;
    aceptar.title = `${tarjetasMarcadas(b.marcas)} tarjetas de repaso saldrían de lo marcado`;
    aceptar.addEventListener("click", () => void this.aceptar(p, b));
    const cerrar = boton("pildora", "Cerrar");
    cerrar.addEventListener("click", () => {
      b.abierta = false;
      this.redibujar();
    });
    const descartar = boton("pildora", "Descartar");
    descartar.disabled = b.enviando;
    descartar.addEventListener("click", () => void this.descartar(p, b));
    acciones.append(aceptar, cerrar, descartar);
    caja.append(acciones);
    return caja;
  }

  /** Casilla + título + detalle. Cambiar la casilla solo actualiza el botón de abajo (sin redibujar toda la isla). */
  private filaMarcable(marcas: boolean[], i: number, titulo: string, detalle: string, caja: HTMLElement, b: BorradorPropuesta): HTMLElement {
    const fila = crear("label", "repaso-fila");
    const casilla = document.createElement("input");
    casilla.type = "checkbox";
    casilla.checked = marcas[i];
    casilla.addEventListener("change", () => {
      marcas[i] = casilla.checked;
      this.actualizarBoton(caja, b);
    });
    const texto = crear("span", "repaso-fila-texto");
    texto.append(crear("strong", "", titulo));
    if (detalle) texto.append(crear("span", "repaso-detalle", detalle));
    fila.append(casilla, texto);
    return fila;
  }

  private filaEditable(
    b: BorradorPropuesta,
    tipo: "g" | "p",
    i: number,
    marcas: boolean[],
    principal: string,
    secundario: string,
    caja: HTMLElement,
    valores: () => { a: string; b: string },
    guardar: (a: string, c: string) => void,
    etiquetaA: string,
    etiquetaB: string,
    maxA: number,
    maxB: number,
  ): HTMLElement {
    const clave = `${tipo}${i}`;
    if (b.editando !== clave) {
      const fila = this.filaMarcable(marcas, i, principal, secundario, caja, b);
      const editar = boton("repaso-editar", "Editar");
      editar.addEventListener("click", (e) => {
        e.preventDefault();
        b.editando = clave;
        this.redibujar();
      });
      fila.append(editar);
      return fila;
    }
    const v = valores();
    const form = crear("form", "estudio-editar repaso-edicion");
    const a = crear("input", "estudio-campo");
    a.value = v.a;
    a.maxLength = maxA;
    a.setAttribute("aria-label", etiquetaA);
    const c = crear("input", "estudio-campo");
    c.value = v.b;
    c.maxLength = maxB;
    c.setAttribute("aria-label", etiquetaB);
    const ok = crear("button", "pildora", "Listo");
    ok.type = "submit";
    form.append(a, c, ok);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (a.value.trim() && c.value.trim()) guardar(a.value.trim(), c.value.trim());
      b.editando = null;
      this.redibujar();
    });
    return form;
  }

  private actualizarBoton(caja: HTMLElement, b: BorradorPropuesta): void {
    const aceptar = caja.querySelector<HTMLButtonElement>(".repaso-aceptar");
    if (!aceptar) return;
    aceptar.textContent = textoBotonAceptar(b.marcas);
    aceptar.disabled = b.enviando || cuantasMarcadas(b.marcas) === 0;
    aceptar.title = `${tarjetasMarcadas(b.marcas)} tarjetas de repaso saldrían de lo marcado`;
  }

  private async aceptar(p: PropuestaRepaso, b: BorradorPropuesta): Promise<void> {
    b.enviando = true;
    b.error = "";
    this.redibujar();
    try {
      const r = await this.acciones.aceptar(p.grabacion, armarDecision(b.marcas, b.ramoId, { glosario: b.glosario, preguntas: b.preguntas }));
      this.borradores.delete(p.grabacion);
      this.mensaje = textoAceptado(r);
    } catch (error) {
      b.enviando = false;
      b.error = error instanceof Error ? error.message.replace(/^Error: /, "") : "No pude guardar el repaso.";
    }
    this.redibujar();
  }

  private async descartar(p: PropuestaRepaso, b: BorradorPropuesta): Promise<void> {
    b.enviando = true;
    try {
      await this.acciones.descartar(p.grabacion);
      this.borradores.delete(p.grabacion);
    } catch (error) {
      b.enviando = false;
      b.error = error instanceof Error ? error.message.replace(/^Error: /, "") : "No pude descartarla.";
    }
    this.redibujar();
  }

  // ---- Sesión ---------------------------------------------------------------------------------------

  private vistaSesion(s: SesionRepaso): HTMLElement {
    const caja = crear("div", "tarjeta repaso-sesion");
    const cabecera = crear("div", "repaso-sesion-cabecera");
    cabecera.append(crear("span", "estudio-seccion", s.terminada ? "Repaso terminado" : `Repasando · ${s.progreso}`));
    const salir = boton("pildora", s.terminada ? "Volver" : "Salir");
    salir.addEventListener("click", () => this.terminarSesion());
    cabecera.append(salir);
    caja.append(cabecera);

    const t = s.actual;
    if (!t) {
      caja.append(crear("p", "repaso-fin", s.textoFin()));
      return caja;
    }
    caja.append(crear("div", "repaso-tipo", t.tipo === "termino" ? "Término" : "Pregunta"));
    caja.append(crear("div", "repaso-frente", t.frente));
    if (!s.mostrandoRespuesta) {
      const ver = boton("pildora repaso-ver", "Mostrar respuesta");
      ver.addEventListener("click", () => {
        s.mostrarRespuesta();
        this.redibujar();
      });
      caja.append(ver);
    } else {
      caja.append(crear("div", "repaso-reverso", t.reverso));
      const fila = crear("div", "repaso-resultados");
      for (const r of ["no-sabia", "casi", "sabia"] as const) {
        const b = boton(`pildora repaso-${r}`, ETIQUETA_RESULTADO[r]);
        b.addEventListener("click", () => void this.responder(s, r));
        fila.append(b);
      }
      caja.append(fila);
    }
    if (this.errorSesion) caja.append(crear("p", "estudio-error", this.errorSesion));
    return caja;
  }

  private async responder(s: SesionRepaso, resultado: Resultado): Promise<void> {
    const t = s.actual;
    if (!t) return;
    try {
      await this.acciones.responder(t.id, resultado);
      s.responder(resultado);
      this.errorSesion = "";
    } catch (error) {
      this.errorSesion = error instanceof Error ? error.message.replace(/^Error: /, "") : "No pude guardar tu respuesta.";
    }
    this.redibujar();
  }

  // ---- En la ficha del ramo --------------------------------------------------------------------------

  /** «Repaso: 7 para hoy · 24 en total», el botón y los temas guardados de ese ramo; null si no hay nada. */
  deRamo(ramoId: number): HTMLElement | null {
    const resumen = this.estado.porRamo.find((r) => r.ramoId === ramoId);
    const linea = lineaRepasoDeRamo(resumen);
    const temas = this.estado.resumenes.filter((r) => r.ramoId === ramoId);
    if (!linea && temas.length === 0) return null;
    const caja = crear("div", "repaso-ramo-bloque");
    caja.append(crear("div", "estudio-seccion", "Repaso"));
    if (linea) {
      const fila = crear("div", "estudio-item");
      fila.append(crear("span", "estudio-item-texto", linea));
      if (resumen && resumen.hoy > 0 && !this.sesion) {
        const ir = boton("pildora", "Repasar");
        ir.addEventListener("click", () => this.iniciarSesion(ramoId));
        fila.append(ir);
      }
      caja.append(fila);
    }
    if (temas.length > 0) {
      const detalles = document.createElement("details");
      detalles.className = "repaso-temas";
      detalles.open = this.detallesAbiertos.has(ramoId);
      detalles.addEventListener("toggle", () => {
        if (detalles.open) this.detallesAbiertos.add(ramoId);
        else this.detallesAbiertos.delete(ramoId);
      });
      const n = temas.reduce((a, r) => a + r.temas.length, 0);
      detalles.append(crear("summary", "", `Temas de tus clases (${n})`));
      for (const r of temas) {
        for (const t of r.temas) {
          const item = crear("div", "repaso-tema");
          item.append(crear("strong", "", t.titulo));
          const lista = crear("ul", "repaso-puntos");
          for (const punto of t.puntos) lista.append(crear("li", "", punto));
          item.append(lista);
          detalles.append(item);
        }
      }
      caja.append(detalles);
    }
    return caja;
  }
}
