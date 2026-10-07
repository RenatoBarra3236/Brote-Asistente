// El formulario «+ Gasto» de la pestaña Plata (capa F del plan sin IA): monto, qué fue y categoría. Enter anota.
// La lógica (leer el monto, validar) está en agente/gasto-formulario.ts; aquí solo el DOM.

import { ETIQUETAS_CATEGORIA, validarGasto, type BorradorGasto } from "./agente/gasto-formulario";
import { CATEGORIAS } from "../../../packages/motor/src/categorias";

type Anotar = (monto: number, descripcion: string | null, categoria: string) => Promise<string>;

function elemento<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(etiqueta);
  el.className = clase;
  return el;
}

export class FormularioGasto {
  readonly el: HTMLDivElement;
  private readonly boton: HTMLButtonElement;
  private readonly cuerpo: HTMLFormElement;
  private readonly monto: HTMLInputElement;
  private readonly descripcion: HTMLInputElement;
  private readonly categoria: HTMLSelectElement;
  private readonly mensaje: HTMLParagraphElement;
  private enviando = false;
  private temporizador: number | null = null;

  constructor(private readonly anotar: Anotar, private readonly alAnotar: (texto: string) => void = () => {}) {
    this.el = elemento("div", "gasto-form");
    this.boton = elemento("button", "boton boton-fila gasto-form-abrir");
    this.boton.type = "button";
    this.boton.textContent = "＋ Gasto";
    this.boton.title = "Anota un gasto sin escribir la frase";
    this.cuerpo = elemento("form", "gasto-form-cuerpo");
    this.cuerpo.hidden = true;
    this.monto = elemento("input", "estudio-campo gasto-monto");
    this.monto.type = "text";
    this.monto.inputMode = "numeric";
    this.monto.placeholder = "Monto (3500 o 5 lucas)";
    this.monto.maxLength = 20;
    this.monto.autocomplete = "off";
    this.monto.setAttribute("aria-label", "Monto del gasto");
    this.descripcion = elemento("input", "estudio-campo gasto-descripcion");
    this.descripcion.type = "text";
    this.descripcion.placeholder = "¿Qué fue? (opcional)";
    this.descripcion.maxLength = 200;
    this.descripcion.autocomplete = "off";
    this.descripcion.setAttribute("aria-label", "Qué fue");
    this.categoria = elemento("select", "estudio-campo gasto-categoria");
    this.categoria.setAttribute("aria-label", "Categoría");
    for (const valor of ["auto", ...CATEGORIAS] as const) {
      const o = document.createElement("option");
      o.value = valor;
      o.textContent = ETIQUETAS_CATEGORIA[valor];
      this.categoria.append(o);
    }
    const anotarBoton = elemento("button", "boton boton-fila gasto-anotar");
    anotarBoton.type = "submit";
    anotarBoton.textContent = "Anotar";
    const cerrar = elemento("button", "enlace-vista gasto-cerrar");
    cerrar.type = "button";
    cerrar.textContent = "Cerrar";
    const fila = elemento("div", "gasto-form-fila");
    fila.append(this.monto, this.descripcion);
    const fila2 = elemento("div", "gasto-form-fila");
    fila2.append(this.categoria, anotarBoton, cerrar);
    this.mensaje = elemento("p", "gasto-form-mensaje");
    this.mensaje.hidden = true;
    this.mensaje.setAttribute("role", "status");
    this.cuerpo.append(fila, fila2);
    this.el.append(this.boton, this.cuerpo, this.mensaje);

    this.boton.addEventListener("click", () => this.abrir(this.cuerpo.hidden === true));
    cerrar.addEventListener("click", () => this.abrir(false));
    this.cuerpo.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.enviar();
    });
  }

  private abrir(si: boolean): void {
    this.cuerpo.hidden = !si;
    this.boton.setAttribute("aria-expanded", String(si));
    if (si) this.monto.focus();
  }

  /** ¿Está abierto con algo escrito? (la isla no debe cerrarse a mitad de un gasto). */
  get ocupado(): boolean {
    return !this.cuerpo.hidden && (this.monto.value !== "" || this.descripcion.value !== "");
  }

  private decir(texto: string, error: boolean): void {
    this.mensaje.textContent = texto;
    this.mensaje.classList.toggle("error", error);
    this.mensaje.hidden = texto === "";
    if (this.temporizador !== null) window.clearTimeout(this.temporizador);
    if (!error && texto) this.temporizador = window.setTimeout(() => (this.mensaje.hidden = true), 6000);
  }

  private async enviar(): Promise<void> {
    if (this.enviando) return;
    const borrador: BorradorGasto = { monto: this.monto.value, descripcion: this.descripcion.value, categoria: this.categoria.value as BorradorGasto["categoria"] };
    const v = validarGasto(borrador);
    if (!v.ok) {
      this.decir(v.error, true);
      this.monto.focus();
      return;
    }
    this.enviando = true;
    try {
      const texto = await this.anotar(v.monto, v.descripcion, v.categoria);
      this.monto.value = "";
      this.descripcion.value = "";
      this.categoria.value = "auto";
      this.decir(texto, false);
      this.alAnotar(texto);
      this.monto.focus();
    } catch (error) {
      this.decir(String(error).replace(/^Error: /, ""), true);
    } finally {
      this.enviando = false;
    }
  }
}
