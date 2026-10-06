// «Todo lo de un ramo» (C) en la pestaña Estudio: la línea de tiempo con filtros dentro de la ficha del ramo
// y el buscador de arriba. El estado de la interfaz vive aquí; los textos y reglas, en `agente/ramo-todo.ts`
// (con pruebas). Solo se muestran títulos y fechas: nada del texto de las clases.

import {
  TEXTO_BUSCANDO,
  TEXTO_PLACEHOLDER_BUSCADOR,
  TEXTO_SIN_RESULTADOS,
  avisoDeFuentes,
  cuandoDeItem,
  destinoDe,
  emojiDe,
  explicarTodoVacio,
  filtrarItems,
  filtrosConDatos,
  nombreDeTipo,
  textoMasResultados,
} from "./agente/ramo-todo";
import type { DatosBusquedaRamos, DatosRamoTodo, Destino, FiltroRamo, ItemDeRamo } from "./agente/ramo-todo";
import { HEX_RAMO } from "./agente/estudio";
import type { Ramo } from "./agente/estudio";

export interface AccionesRamoTodo {
  pedirRamo: (ramoId: number) => Promise<DatosRamoTodo>;
  buscar: (texto: string) => Promise<DatosBusquedaRamos>;
  ir: (destino: Destino) => void;
  /** Tocar el nombre de un ramo en los resultados: abre su ficha con su línea de tiempo. */
  abrirRamo: (ramoId: number) => void;
}

const FILAS_VISIBLES = 10;
const ESPERA_ESCRIBIR_MS = 250;
const MAX_BUSQUEDA = 80;

function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(etiqueta);
  e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

export class VistaRamoTodo {
  private abierto: number | null = null;
  private datos: DatosRamoTodo | null = null;
  private filtro: FiltroRamo = "todo";
  private verTodas = false;
  private error = "";
  private secuenciaRamo = 0;

  private readonly buscadorEl: HTMLElement;
  private readonly campo: HTMLInputElement;
  private readonly resultados: HTMLElement;
  private temporizador: ReturnType<typeof setTimeout> | undefined;
  private secuenciaBusqueda = 0;
  private ramos: readonly Ramo[] = [];

  constructor(
    private readonly acciones: AccionesRamoTodo,
    private readonly redibujar: () => void,
  ) {
    this.buscadorEl = crear("div", "estudio-buscador");
    this.campo = crear("input", "estudio-campo estudio-buscador-campo");
    this.campo.type = "search";
    this.campo.maxLength = MAX_BUSQUEDA;
    this.campo.placeholder = TEXTO_PLACEHOLDER_BUSCADOR;
    this.campo.setAttribute("aria-label", "Buscar en tus ramos");
    this.resultados = crear("div", "estudio-buscador-resultados");
    this.resultados.hidden = true;
    this.buscadorEl.append(this.campo, this.resultados);
    this.campo.addEventListener("input", () => {
      clearTimeout(this.temporizador);
      this.temporizador = setTimeout(() => void this.buscar(), ESPERA_ESCRIBIR_MS);
    });
    this.campo.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.limpiarBusqueda();
    });
  }

  estaAbierto(ramoId: number): boolean {
    return this.abierto === ramoId;
  }

  /** ¿Hay una búsqueda escrita? La isla no se cierra sola. */
  get activa(): boolean {
    return this.campo.value.trim() !== "";
  }

  alternar(ramoId: number): void {
    if (this.abierto === ramoId) {
      this.abierto = null;
      this.datos = null;
      this.redibujar();
      return;
    }
    this.abrir(ramoId);
  }

  /** Abre la línea de tiempo de un ramo (desde su botón, desde la búsqueda o desde «todo lo de cálculo»). */
  abrir(ramoId: number): void {
    this.abierto = ramoId;
    this.datos = null;
    this.filtro = "todo";
    this.verTodas = false;
    this.error = "";
    void this.cargar();
    this.redibujar();
  }

  /** Cierra la línea de tiempo sin redibujar (lo hace quien llama: se cerró la ficha). */
  cerrar(): void {
    this.abierto = null;
    this.datos = null;
  }

  /** Cuando cambian los ramos, el calendario o el aula: se vuelve a pedir lo abierto, sin parpadear. */
  refrescar(): void {
    if (this.abierto !== null) void this.cargar();
    if (this.campo.value.trim() !== "") void this.buscar();
  }

  private async cargar(): Promise<void> {
    const ramoId = this.abierto;
    if (ramoId === null) return;
    const mia = ++this.secuenciaRamo;
    try {
      const datos = await this.acciones.pedirRamo(ramoId);
      if (mia !== this.secuenciaRamo || this.abierto !== ramoId) return;
      this.datos = datos;
      this.error = "";
    } catch (error) {
      if (mia !== this.secuenciaRamo) return;
      this.error = error instanceof Error ? error.message : "No pude leer lo de este ramo.";
    }
    this.redibujar();
  }

  /** El botón «Ver todo» de la ficha. */
  boton(ramoId: number): HTMLButtonElement {
    const abierto = this.abierto === ramoId;
    const b = crear("button", "pildora", abierto ? "Ocultar todo" : "Ver todo");
    b.type = "button";
    b.title = "Clases, entregas, pruebas, tareas, repaso y grabaciones de este ramo, por fecha";
    b.addEventListener("click", () => this.alternar(ramoId));
    return b;
  }

  /** La línea de tiempo del ramo abierto (o `null` si no es este). */
  lineaDeTiempo(ramo: Ramo): HTMLElement | null {
    if (this.abierto !== ramo.id) return null;
    const caja = crear("div", "ramo-todo");
    const titulo = crear("div", "estudio-seccion", `Todo lo de ${ramo.nombre}`);
    caja.append(titulo);
    if (this.error) {
      caja.append(crear("p", "estudio-error", this.error));
      return caja;
    }
    if (!this.datos) {
      caja.append(crear("p", "vacia-texto", TEXTO_BUSCANDO));
      return caja;
    }
    const { datos } = this;
    if (datos.items.length > 0) caja.append(crear("p", "ramo-todo-resumen", datos.resumen));
    if (datos.items.length === 0) {
      caja.append(crear("p", "vacia-texto", explicarTodoVacio(datos.fuentes, ramo.alias.length > 0)));
      return caja;
    }

    const filtros = filtrosConDatos(datos.items);
    if (!filtros.some((f) => f.id === this.filtro)) this.filtro = "todo";
    if (filtros.length > 2) {
      const fila = crear("div", "ramo-todo-filtros");
      for (const f of filtros) {
        const b = crear("button", `pildora ramo-todo-filtro${f.id === this.filtro ? " activa" : ""}`, f.id === "todo" ? f.etiqueta : `${f.etiqueta} ${f.cuantos}`);
        b.type = "button";
        b.addEventListener("click", () => {
          this.filtro = f.id;
          this.verTodas = false;
          this.redibujar();
        });
        fila.append(b);
      }
      caja.append(fila);
    }

    const visibles = filtrarItems(datos.items, this.filtro);
    const ahora = Date.now();
    const lista = this.verTodas ? visibles : visibles.slice(0, FILAS_VISIBLES);
    let grupo: "proximo" | "pasado" | null = null;
    for (const item of lista) {
      const este = item.estado === "pendiente" ? "proximo" : "pasado";
      if (este !== grupo) {
        grupo = este;
        // El encabezado «Ya pasó» solo tiene sentido si antes hubo «Lo que viene».
        if (este === "pasado" && lista.some((i) => i.estado === "pendiente")) caja.append(crear("div", "ramo-todo-grupo", "Ya pasó o hecho"));
        else if (este === "proximo" && lista.some((i) => i.estado !== "pendiente")) caja.append(crear("div", "ramo-todo-grupo", "Lo que viene"));
      }
      caja.append(this.fila(item, ahora));
    }
    if (visibles.length > lista.length) {
      const mas = crear("button", "pildora", `Ver ${visibles.length - lista.length} más`);
      mas.type = "button";
      mas.addEventListener("click", () => {
        this.verTodas = true;
        this.redibujar();
      });
      caja.append(mas);
    }
    const aviso = avisoDeFuentes(datos.fuentes);
    if (aviso) caja.append(crear("p", "ramo-todo-aviso", aviso));
    return caja;
  }

  private fila(item: ItemDeRamo, ahora: number): HTMLElement {
    const f = crear("button", `ramo-todo-fila ${item.estado}`);
    f.type = "button";
    f.title = `${nombreDeTipo(item.tipo)}: tocar para verlo`;
    const emoji = crear("span", "ramo-todo-emoji", emojiDe(item.tipo));
    emoji.setAttribute("aria-hidden", "true");
    f.append(emoji, crear("span", "ramo-todo-titulo", item.titulo), crear("span", "estudio-item-cuando", cuandoDeItem(item, ahora)));
    f.addEventListener("click", () => this.acciones.ir(destinoDe(item)));
    return f;
  }

  // ---- Buscador de arriba -----------------------------------------------------------------------------

  /** El buscador (el mismo elemento en cada redibujo, para no perder lo escrito). */
  buscador(ramos: readonly Ramo[]): HTMLElement {
    this.ramos = ramos;
    return this.buscadorEl;
  }

  /** Después de redibujar la pestaña: si se estaba escribiendo, el cursor vuelve al campo. */
  devolverFoco(tenia: boolean): void {
    if (tenia) this.campo.focus();
  }
  get conFoco(): boolean {
    return document.activeElement === this.campo;
  }

  private limpiarBusqueda(): void {
    clearTimeout(this.temporizador);
    this.secuenciaBusqueda++;
    this.campo.value = "";
    this.resultados.hidden = true;
    this.resultados.replaceChildren();
  }

  private async buscar(): Promise<void> {
    const texto = this.campo.value.trim();
    const mia = ++this.secuenciaBusqueda;
    if (texto === "") {
      this.resultados.hidden = true;
      this.resultados.replaceChildren();
      return;
    }
    this.resultados.hidden = false;
    this.resultados.replaceChildren(crear("p", "vacia-texto", TEXTO_BUSCANDO));
    let datos: DatosBusquedaRamos;
    try {
      datos = await this.acciones.buscar(texto);
    } catch (error) {
      if (mia !== this.secuenciaBusqueda) return;
      this.resultados.replaceChildren(crear("p", "estudio-error", error instanceof Error ? error.message : "No pude buscar."));
      return;
    }
    if (mia !== this.secuenciaBusqueda) return;
    this.pintarResultados(datos);
  }

  private pintarResultados(datos: DatosBusquedaRamos): void {
    if (datos.resultados.length === 0) {
      this.resultados.replaceChildren(crear("p", "vacia-texto", TEXTO_SIN_RESULTADOS));
      return;
    }
    const ahora = Date.now();
    const partes: HTMLElement[] = [];
    for (const r of datos.resultados) {
      const ramo = this.ramos.find((x) => x.id === r.ramoId);
      if (!ramo) continue;
      const grupo = crear("div", "estudio-resultado-ramo");
      grupo.style.setProperty("--ramo", HEX_RAMO[ramo.color]);
      const cabecera = crear("button", "estudio-resultado-cabecera");
      cabecera.type = "button";
      cabecera.append(crear("span", "estudio-punto"), crear("span", "estudio-nombre", ramo.nombre), crear("span", "estudio-item-cuando", textoMasResultados(r.total, r.items.length)));
      cabecera.addEventListener("click", () => this.acciones.abrirRamo(ramo.id));
      grupo.append(cabecera);
      for (const item of r.items) grupo.append(this.fila(item, ahora));
      partes.push(grupo);
    }
    this.resultados.replaceChildren(...partes);
  }

  /** Para vistas previas y pruebas: pone una búsqueda ya hecha sin pasar por el puente. */
  ponerBusqueda(texto: string): void {
    this.campo.value = texto;
    void this.buscar();
  }
}
