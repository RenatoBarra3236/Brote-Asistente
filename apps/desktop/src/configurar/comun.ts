// Lo que comparten las partes de "Configurar Brote": el estado, cómo pedirle cosas a Rust (siempre
// pasos y comandos de listas cerradas) y las piezas para armar la ventana con texto, nunca con HTML.

import { invoke } from "@tauri-apps/api/core";
import { funcionesPorDefecto, type ConfigFunciones } from "../agente/funciones";
import { TRABAJANDO_EN, siguienteAutomatico, type Accion, type LecturaPermisos, type Paso } from "../agente/preparacion";

export const estado = {
  /** El resultado de la última revisión (técnicos y opcionales). */
  pasos: [] as Paso[],
  /** Se revisó al menos una vez. */
  revisado: false,
  ocupado: false,
  /** Lo que está haciendo "Preparar Brote" / "Reparar" (para la barra de progreso). */
  trabajandoEn: null as string | null,
  /** Los pasos que el usuario aceptó explícitamente (configurar OpenClaw, instalar el modo programador…). */
  consentimientos: new Set<string>(),
  funciones: funcionesPorDefecto() as ConfigFunciones,
  /** Si ya existe funciones.json (si no, es la primera vez o alguien que ya usaba Brote). */
  hayArchivoFunciones: false,
  /** Lo que el puente sabe de los permisos de macOS (`null` si no respondió). */
  permisos: null as LecturaPermisos | null,
  /** Se reparó algo: conviene reiniciar Brote para que el puente se reconecte. */
  reparado: false,
};

/** En macOS hay permisos de Privacidad; en Windows y Linux no. */
export const EN_MAC = navigator.userAgent.includes("Mac");

let repintar: () => void = () => {};

/** La ventana se vuelve a armar entera con el estado actual. */
export function pintar(): void {
  repintar();
}

export function alPintar(funcion: () => void): void {
  repintar = funcion;
}

export function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase?: string, texto?: string): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

export function boton(texto: string, clase: string, alHacer: () => void, deshabilitado = false): HTMLButtonElement {
  const b = crear("button", clase, texto);
  b.type = "button";
  b.disabled = deshabilitado;
  b.addEventListener("click", alHacer);
  return b;
}

const aviso = document.querySelector<HTMLParagraphElement>("#aviso")!;
let plazoAviso: ReturnType<typeof setTimeout> | undefined;

/** Un aviso arriba de la ventana; los que no son errores se van solos. */
export function mostrarAviso(texto: string, error = false): void {
  aviso.textContent = texto;
  aviso.classList.toggle("error", error);
  aviso.hidden = false;
  clearTimeout(plazoAviso);
  plazoAviso = setTimeout(() => (aviso.hidden = true), error ? 12_000 : 6000);
}

export function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function paso(id: string): Paso | undefined {
  return estado.pasos.find((p) => p.id === id);
}

// ---------------------------------------------------------------- revisar y arreglar

export async function revisar(): Promise<void> {
  estado.ocupado = true;
  pintar();
  try {
    estado.pasos = JSON.parse(await invoke<string>("configuracion", { orden: "revisar" }));
    estado.revisado = true;
  } catch (error) {
    mostrarAviso(`No pude revisar: ${mensajeDe(error)}`, true);
  } finally {
    estado.ocupado = false;
    pintar();
  }
}

/** Aplica un paso automático. Devuelve si salió bien. */
async function aplicar(p: Pick<Paso, "id" | "titulo">, silencioso = false): Promise<boolean> {
  const resultado = JSON.parse(await invoke<string>("configuracion", { orden: "aplicar", paso: p.id })) as { ok: boolean; detalle: string };
  if (!silencioso || !resultado.ok) mostrarAviso(resultado.detalle, !resultado.ok);
  return resultado.ok;
}

/** Cuántas vueltas da "Preparar" como máximo (cada arreglo puede destrabar otro). */
const VUELTAS = 14;

/**
 * "Preparar Brote" (primera vez) y "Reparar" (Estado): arregla solo, uno tras otro, los pasos
 * técnicos que se pueden arreglar sin el usuario. Lo que necesita al usuario queda en sus tarjetas.
 */
export async function prepararTodo(): Promise<void> {
  estado.ocupado = true;
  pintar();
  try {
    for (let vuelta = 0; vuelta < VUELTAS; vuelta++) {
      const siguiente = siguienteAutomatico(estado.pasos, estado.consentimientos);
      if (!siguiente) break;
      estado.trabajandoEn = TRABAJANDO_EN[siguiente.id] ?? `${siguiente.titulo}…`;
      pintar();
      if (!(await aplicar(siguiente, true))) break;
      estado.reparado = true;
      estado.pasos = JSON.parse(await invoke<string>("configuracion", { orden: "revisar" }));
      pintar();
    }
  } catch (error) {
    mostrarAviso(mensajeDe(error), true);
  } finally {
    estado.trabajandoEn = null;
    estado.ocupado = false;
  }
  await revisar();
}

/** El botón de un paso: abre una terminal o una página (listas cerradas en Rust) o lo arregla. */
export async function actuar(p: Paso, accion: Accion | null | undefined = p.accion): Promise<void> {
  if (!accion) return;
  try {
    if (accion.tipo === "terminal") {
      await invoke("abrir_terminal", { cual: accion.terminal });
      mostrarAviso("Abrí una terminal. Cuando termines ahí, vuelve a esta ventana: reviso solo.");
      return;
    }
    if (accion.tipo === "enlace") {
      await invoke("abrir_enlace", { cual: accion.enlace });
      mostrarAviso("Abrí la página. Cuando termines, vuelve a esta ventana: reviso solo.");
      return;
    }
    if (accion.tipo !== "automatica") return;
    estado.ocupado = true;
    estado.trabajandoEn = TRABAJANDO_EN[p.id] ?? `${p.titulo}…`;
    pintar();
    if (await aplicar(p)) estado.reparado = true;
  } catch (error) {
    mostrarAviso(`${p.titulo}: ${mensajeDe(error)}`, true);
  } finally {
    estado.trabajandoEn = null;
    estado.ocupado = false;
  }
  await revisar();
}

/** El segundo botón de un paso (por ejemplo, desinstalar el modo programador). */
export async function deshacer(titulo: string, id: string): Promise<void> {
  estado.ocupado = true;
  pintar();
  try {
    await aplicar({ id, titulo });
  } catch (error) {
    mostrarAviso(`${titulo}: ${mensajeDe(error)}`, true);
  } finally {
    estado.ocupado = false;
  }
  await revisar();
}

/** Guarda funciones.json (Rust lo valida contra sus listas cerradas). El puente lo nota solo. */
export async function guardarFunciones(): Promise<boolean> {
  try {
    const { activas, tarjetas } = estado.funciones;
    await invoke("guardar_funciones", { activas, orden: tarjetas.orden, ocultas: tarjetas.ocultas });
    estado.hayArchivoFunciones = true;
    return true;
  } catch (error) {
    mostrarAviso(`No pude guardar: ${mensajeDe(error)}`, true);
    return false;
  }
}

// ---------------------------------------------------------------- piezas

const TEXTO_CONSENTIMIENTO =
  " Entiendo que OpenClaw podrá usar este computador para ayudarme, y que Brote me pedirá permiso antes de ejecutar comandos.";

const ICONOS = { ok: "✅", falta: "⚠️", opcional: "○" } as const;

/** La casilla de consentimiento de un paso (configurar OpenClaw, instalar el modo programador…). */
export function casillaConsentimiento(p: Paso, texto?: string): HTMLLabelElement {
  const etiqueta = crear("label", "consentimiento");
  const casilla = crear("input");
  casilla.type = "checkbox";
  casilla.checked = estado.consentimientos.has(p.id);
  casilla.addEventListener("change", () => {
    if (casilla.checked) estado.consentimientos.add(p.id);
    else estado.consentimientos.delete(p.id);
    pintar();
  });
  etiqueta.append(casilla, document.createTextNode(texto ?? TEXTO_CONSENTIMIENTO));
  return etiqueta;
}

/** Los botones de un paso: su acción, la alternativa y "deshacer"; con su casilla si pide consentimiento. */
export function botonesDePaso(p: Paso, opciones: { conAccion?: boolean } = {}): HTMLElement[] {
  const partes: HTMLElement[] = [];
  const accion = p.accion;
  if (accion?.tipo === "automatica" && accion.requiereConsentimiento && p.estado !== "ok") {
    partes.push(casillaConsentimiento(p, accion.textoConsentimiento));
  }
  const botones = crear("div", "botones");
  if (p.quitar) {
    const quitar = p.quitar;
    botones.append(boton(quitar.etiqueta, "boton", () => void deshacer(p.titulo, quitar.paso), estado.ocupado));
  }
  if (p.alternativa) {
    const alternativa = p.alternativa;
    botones.append(boton(alternativa.etiqueta, "boton", () => void actuar(p, alternativa), estado.ocupado));
  }
  if (accion && opciones.conAccion !== false && (accion.tipo === "automatica" || accion.tipo === "terminal" || accion.tipo === "enlace")) {
    const sinConsentimiento = accion.tipo === "automatica" && accion.requiereConsentimiento === true && !estado.consentimientos.has(p.id);
    botones.append(boton(accion.etiqueta, "boton boton-primario", () => void actuar(p), estado.ocupado || sinConsentimiento));
  }
  if (botones.childElementCount > 0) partes.push(botones);
  return partes;
}

/** Una tarjeta con un paso: ícono, título, detalle y sus botones. */
export function tarjetaPaso(p: Paso, extra: HTMLElement[] = []): HTMLElement {
  const tarjeta = crear("article", `tarjeta paso ${p.estado}`);
  tarjeta.append(crear("h3", undefined, `${ICONOS[p.estado]}  ${p.titulo}`), crear("p", "tarjeta-texto", p.detalle), ...extra, ...botonesDePaso(p));
  return tarjeta;
}

/** Una fila compacta de un paso técnico (dentro de "Detalles"). */
export function filaPaso(p: Paso): HTMLElement {
  const fila = crear("div", `fila-paso ${p.estado}`);
  const texto = crear("div", "fila-paso-texto");
  texto.append(crear("strong", undefined, `${ICONOS[p.estado]} ${p.titulo}`), crear("span", undefined, p.detalle));
  fila.append(texto, ...botonesDePaso(p));
  return fila;
}

/** Un título de sección con su bajada. */
export function cabecera(titulo: string, bajada?: string): HTMLElement {
  const caja = crear("header", "seccion-cabecera");
  caja.append(crear("h2", undefined, titulo));
  if (bajada) caja.append(crear("p", "bajada", bajada));
  return caja;
}
