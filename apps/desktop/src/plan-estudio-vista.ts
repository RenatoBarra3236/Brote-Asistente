// La parte del plan de estudio (A4) de la pestaña Estudio: la fecha de cada prueba, la propuesta de
// bloques que el usuario confirma y los planes ya agendados dentro de la ficha del ramo. El estado de
// la interfaz vive aquí; los textos y reglas, en `agente/plan-estudio.ts` (con pruebas). `panel.ts` solo
// le pide elementos y le dice cuándo redibujar. Nada se agenda sin un toque en «Agendar».

import {
  AVISO_CALENDARIO,
  PLAN_VACIO,
  TEXTO_CASILLA_CALENDARIO,
  ajustarHoras,
  bloquesSeleccionados,
  bloquesVisibles,
  cuandoPrueba,
  describirPrueba,
  etiquetaTipo,
  explicarHoras,
  fechaDesdeCampo,
  hora,
  resumenBloques,
  resumenPlan,
  textoAgendado,
  textoHoras,
  tituloPropuestaPlan,
  valorParaCampo,
} from "./agente/plan-estudio";
import type { BloquePlan, PlanEstudio, PropuestaVista } from "./agente/plan-estudio";

export interface AccionesPlan {
  proponer: (ramo: number, evaluacion: number, horas?: number) => Promise<PropuestaVista>;
  agendar: (ramo: number, evaluacion: number, horas: number, bloques: BloquePlan[], calendario: boolean) => Promise<{ plan: PlanEstudio | null; calendario: { pedido: boolean; creados: number; fallidos: number } }>;
  marcar: (bloque: number, estado: "pendiente" | "hecho" | "saltado") => Promise<void>;
  empezar: (ramo: number) => Promise<void>;
  borrar: (plan: number) => Promise<void>;
  guardarFecha: (evaluacion: number, fecha: string | null) => Promise<void>;
}

interface Propuesta {
  ramoId: number;
  evaluacionId: number;
  datos: PropuestaVista | null;
  cargando: boolean;
  error: string;
  marcas: boolean[];
  horas: number;
  calendario: boolean;
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
const mensajeDe = (error: unknown, porDefecto: string): string => (error instanceof Error ? error.message.replace(/^Error: /, "") : porDefecto);

export class VistaPlanEstudio {
  private planes: PlanEstudio[] = PLAN_VACIO;
  private propuesta: Propuesta | null = null;
  /** Qué evaluación tiene abierto el campo de fecha, y el último mensaje (o error) a mostrar. */
  private editandoFecha: number | null = null;
  private borrando: number | null = null;
  private mensaje = "";
  private errorFecha = "";

  constructor(
    private readonly acciones: AccionesPlan,
    private readonly redibujar: () => void,
  ) {}

  poner(planes: PlanEstudio[]): void {
    this.planes = planes;
    if (this.borrando !== null && !planes.some((p) => p.id === this.borrando)) this.borrando = null;
  }

  get datos(): PlanEstudio[] {
    return this.planes;
  }

  /** ¿Hay una propuesta abierta? La isla no se cierra sola mientras se revisa. */
  get ocupada(): boolean {
    return this.propuesta !== null || this.editandoFecha !== null;
  }

  /** Qué ramo tiene la propuesta abierta (para abrir su ficha). */
  get ramoDePropuesta(): number | null {
    return this.propuesta?.ramoId ?? null;
  }

  // ---- Propuesta ------------------------------------------------------------------------------------

  async abrirPropuesta(ramoId: number, evaluacionId: number, horas?: number): Promise<void> {
    const anterior = this.propuesta;
    this.mensaje = "";
    this.propuesta = {
      ramoId,
      evaluacionId,
      datos: anterior && anterior.evaluacionId === evaluacionId ? anterior.datos : null,
      cargando: true,
      error: "",
      marcas: anterior && anterior.evaluacionId === evaluacionId ? anterior.marcas : [],
      horas: horas ?? anterior?.horas ?? 0,
      calendario: anterior?.calendario ?? false,
      enviando: false,
    };
    this.redibujar();
    const actual = this.propuesta;
    try {
      const datos = await this.acciones.proponer(ramoId, evaluacionId, horas);
      if (this.propuesta !== actual) return;
      actual.datos = datos;
      actual.horas = datos.horasPedidas;
      actual.marcas = datos.bloques.map(() => true);
      actual.error = "";
    } catch (error) {
      if (this.propuesta !== actual) return;
      actual.error = mensajeDe(error, "No pude armar el plan.");
    }
    actual.cargando = false;
    this.redibujar();
  }

  cerrarPropuesta(): void {
    this.propuesta = null;
    this.redibujar();
  }

  /** La tarjeta de la propuesta, dentro de la ficha del ramo al que pertenece (o null). */
  propuestaDe(ramoId: number): HTMLElement | null {
    const p = this.propuesta;
    if (!p || p.ramoId !== ramoId) return null;
    const caja = crear("div", "tarjeta plan-propuesta");
    const d = p.datos;
    if (!d) {
      caja.append(crear("div", "tarjeta-titulo", "Plan de estudio"));
      caja.append(crear("p", p.error ? "estudio-error" : "vacia-texto", p.error || "Armando tu plan…"));
      if (p.error) caja.append(this.botonCerrar());
      return caja;
    }
    caja.append(crear("div", "tarjeta-titulo", tituloPropuestaPlan(d)));
    caja.append(crear("div", "repaso-linea", explicarHoras(d)));

    // Horas: − / + (de a una); cada cambio recalcula los bloques.
    const horas = crear("div", "plan-horas");
    const menos = boton("pildora", "−");
    menos.title = "Estudiar una hora menos";
    menos.disabled = p.cargando || p.horas <= 1;
    menos.addEventListener("click", () => void this.abrirPropuesta(p.ramoId, p.evaluacionId, ajustarHoras(p.horas, -1)));
    const mas = boton("pildora", "+");
    mas.title = "Estudiar una hora más";
    mas.disabled = p.cargando || p.horas >= 12;
    mas.addEventListener("click", () => void this.abrirPropuesta(p.ramoId, p.evaluacionId, ajustarHoras(p.horas, 1)));
    const total = crear("span", "plan-horas-texto", `${textoHoras(p.horas)} → ${d.bloques.length} bloque${d.bloques.length === 1 ? "" : "s"} de 50 min (${textoHoras(d.horas)})`);
    horas.append(menos, total, mas);
    caja.append(horas);

    for (const aviso of d.avisos) caja.append(crear("p", "plan-aviso", aviso));
    if (d.horasHechas > 0) caja.append(crear("p", "vacia-texto", `Ya llevas ${textoHoras(d.horasHechas)} estudiadas: se conservan y esto reparte lo que falta.`));
    if (d.tarjetas > 0) caja.append(crear("p", "vacia-texto", `Tienes ${d.tarjetas} tarjetas de repaso de este ramo: sirven para el repaso final.`));
    if (d.pruebaMs > d.miraHasta) caja.append(crear("p", "vacia-texto", `Tu calendario se mira hasta el ${describirPrueba(d.miraHasta, false)}; después se asume libre.`));

    const lista = crear("div", "plan-bloques");
    d.bloques.forEach((b, i) => {
      const fila = crear("label", "repaso-fila");
      const casilla = document.createElement("input");
      casilla.type = "checkbox";
      casilla.checked = p.marcas[i] === true;
      casilla.addEventListener("change", () => {
        p.marcas[i] = casilla.checked;
        this.actualizarBoton(caja, p);
      });
      const texto = crear("span", "repaso-fila-texto");
      texto.append(crear("strong", "", `${describirPrueba(b.inicioMs, false)} · ${hora(b.inicioMs)}–${hora(b.finMs)}`), crear("span", "repaso-detalle", etiquetaTipo(b.tipo)));
      fila.append(casilla, texto);
      lista.append(fila);
    });
    caja.append(lista);

    if (d.calendario) {
      const etiqueta = crear("label", "plan-calendario");
      const casilla = document.createElement("input");
      casilla.type = "checkbox";
      casilla.checked = p.calendario;
      casilla.addEventListener("change", () => (p.calendario = casilla.checked));
      etiqueta.append(casilla, crear("span", "", TEXTO_CASILLA_CALENDARIO));
      caja.append(etiqueta, crear("p", "repaso-detalle", AVISO_CALENDARIO));
    }
    if (p.error) caja.append(crear("p", "estudio-error", p.error));

    const acciones = crear("div", "estudio-acciones");
    const agendar = boton("pildora plan-agendar", resumenBloques(d.bloques, p.marcas));
    agendar.disabled = p.enviando || p.cargando || bloquesSeleccionados(d.bloques, p.marcas).length === 0;
    agendar.addEventListener("click", () => void this.agendar(p));
    const cancelar = boton("pildora", "Cancelar");
    cancelar.addEventListener("click", () => this.cerrarPropuesta());
    acciones.append(agendar, cancelar);
    caja.append(acciones);
    return caja;
  }

  private botonCerrar(): HTMLButtonElement {
    const b = boton("pildora", "Cerrar");
    b.addEventListener("click", () => this.cerrarPropuesta());
    return b;
  }

  private actualizarBoton(caja: HTMLElement, p: Propuesta): void {
    const b = caja.querySelector<HTMLButtonElement>(".plan-agendar");
    if (!b || !p.datos) return;
    b.textContent = resumenBloques(p.datos.bloques, p.marcas);
    b.disabled = p.enviando || p.cargando || bloquesSeleccionados(p.datos.bloques, p.marcas).length === 0;
  }

  private async agendar(p: Propuesta): Promise<void> {
    if (!p.datos) return;
    p.enviando = true;
    p.error = "";
    this.redibujar();
    try {
      const r = await this.acciones.agendar(p.ramoId, p.evaluacionId, p.horas, bloquesSeleccionados(p.datos.bloques, p.marcas), p.calendario && p.datos.calendario);
      this.mensaje = textoAgendado(r);
      this.propuesta = null;
    } catch (error) {
      p.enviando = false;
      p.error = mensajeDe(error, "No pude agendar el plan.");
    }
    this.redibujar();
  }

  // ---- La fecha de cada prueba ----------------------------------------------------------------------

  /** Bajo la fila de una evaluación pendiente: cuándo es, «Fecha» y «Planear estudio» / «Rehacer plan». */
  lineaPrueba(ev: { id: number; nombre: string; nota: number | null; fecha: string | null }, ramoId: number, ahoraMs = Date.now()): HTMLElement | null {
    if (ev.nota !== null) return null;
    const cuando = cuandoPrueba(ev.fecha, ahoraMs);
    const fila = crear("div", "plan-prueba");
    fila.append(crear("span", "plan-prueba-texto", cuando ? `Prueba: ${cuando}` : "Sin fecha de prueba"));

    if (this.editandoFecha === ev.id) {
      const form = crear("form", "plan-fecha-form");
      const campo = document.createElement("input");
      campo.type = "datetime-local";
      campo.className = "estudio-campo";
      campo.value = valorParaCampo(ev.fecha);
      campo.setAttribute("aria-label", `Fecha y hora de ${ev.nombre}`);
      const guardar = crear("button", "pildora", "Guardar");
      guardar.type = "submit";
      const quitar = boton("pildora", "Quitar fecha");
      quitar.disabled = ev.fecha === null;
      quitar.addEventListener("click", () => void this.guardarFecha(ev.id, ""));
      const cancelar = boton("pildora", "Cancelar");
      cancelar.addEventListener("click", () => {
        this.editandoFecha = null;
        this.errorFecha = "";
        this.redibujar();
      });
      form.append(campo, guardar, quitar, cancelar);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        void this.guardarFecha(ev.id, campo.value);
      });
      fila.append(form);
      if (this.errorFecha) fila.append(crear("p", "estudio-error", this.errorFecha));
      return fila;
    }

    const fecha = boton("pildora", ev.fecha ? "Cambiar fecha" : "Poner fecha");
    fecha.title = "Cuándo es la prueba (día y hora)";
    fecha.addEventListener("click", () => {
      this.editandoFecha = ev.id;
      this.errorFecha = "";
      this.redibujar();
    });
    fila.append(fecha);
    if (ev.fecha && cuando !== "ya pasó") {
      const planear = boton("pildora plan-planear", this.planes.some((p) => p.evaluacionId === ev.id) ? "Rehacer plan" : "Planear estudio");
      planear.addEventListener("click", () => void this.abrirPropuesta(ramoId, ev.id));
      fila.append(planear);
    }
    return fila;
  }

  /** Un error de una acción de un toque (empezar, marcar, borrar) se dice en la ficha en vez de perderse. */
  private fallo(error: unknown): void {
    this.mensaje = mensajeDe(error, "No pude hacerlo.");
    this.redibujar();
  }

  private async guardarFecha(evaluacion: number, valor: string): Promise<void> {
    const f = fechaDesdeCampo(valor);
    if (!f.ok) {
      this.errorFecha = f.motivo;
      this.redibujar();
      return;
    }
    try {
      await this.acciones.guardarFecha(evaluacion, f.fecha);
      this.editandoFecha = null;
      this.errorFecha = "";
    } catch (error) {
      this.errorFecha = mensajeDe(error, "No pude guardar la fecha.");
    }
    this.redibujar();
  }

  // ---- Planes ya agendados, dentro de la ficha ---------------------------------------------------------

  /** Los planes del ramo con sus bloques (check, Empezar, Saltar) y «Borrar plan». */
  planesDeRamo(ramoId: number, nombreDeEvaluacion: (id: number) => string, ahoraMs = Date.now()): HTMLElement | null {
    const lista = this.planes.filter((p) => p.ramoId === ramoId);
    if (lista.length === 0 && !this.mensaje) return null;
    const caja = crear("div", "plan-ramo");
    caja.append(crear("div", "estudio-seccion", "Plan de estudio"));
    if (this.mensaje) caja.append(crear("p", "vacia-texto", this.mensaje));
    for (const plan of lista) {
      caja.append(crear("div", "plan-titulo", `${nombreDeEvaluacion(plan.evaluacionId)} · ${describirPrueba(plan.pruebaMs, true)}`));
      caja.append(crear("div", "repaso-linea", resumenPlan(plan, ahoraMs)));
      for (const b of bloquesVisibles(plan, ahoraMs)) {
        const fila = crear("div", `estudio-item plan-bloque${b.estado === "hecho" ? " hecha" : ""}`);
        const casilla = document.createElement("input");
        casilla.type = "checkbox";
        casilla.className = "agenda-check";
        casilla.checked = b.estado === "hecho";
        casilla.title = "Marcar como hecho";
        casilla.addEventListener("change", () => void this.acciones.marcar(b.id, casilla.checked ? "hecho" : "pendiente").catch((e) => this.fallo(e)));
        const texto = crear("span", "estudio-item-texto", `${describirPrueba(b.inicioMs, false)} · ${hora(b.inicioMs)} · ${etiquetaTipo(b.tipo)}`);
        fila.append(casilla, texto);
        if (b.estado === "pendiente") {
          const empezar = boton("pildora", "Empezar");
          empezar.title = "Empieza un pomodoro de este ramo";
          empezar.addEventListener("click", () => void this.acciones.empezar(plan.ramoId).catch((e) => this.fallo(e)));
          const saltar = boton("pildora", "Saltar");
          saltar.title = "Sacar este bloque del plan";
          saltar.addEventListener("click", () => void this.acciones.marcar(b.id, "saltado").catch((e) => this.fallo(e)));
          fila.append(empezar, saltar);
        }
        caja.append(fila);
      }
      if (plan.calendario) caja.append(crear("p", "repaso-detalle", "Copiado a tu calendario: ahí se borra a mano."));
      const borrar = boton("pildora", this.borrando === plan.id ? "¿Seguro? Se borra el plan" : "Borrar plan");
      borrar.addEventListener("click", () => {
        if (this.borrando !== plan.id) {
          this.borrando = plan.id;
          this.redibujar();
          return;
        }
        this.borrando = null;
        void this.acciones.borrar(plan.id).catch((e) => this.fallo(e));
      });
      caja.append(borrar);
    }
    return caja;
  }
}
