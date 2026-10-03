// La ventana "Configurar Brote" (paso 10): muestra qué falta para que Brote funcione y lo arregla.
// La revisión y los arreglos los hace Rust con el script `configurar` (ver configuracion.rs); esta
// ventana solo pide pasos conocidos y abre terminales o páginas de una lista cerrada.

import { invoke } from "@tauri-apps/api/core";

type Estado = "ok" | "falta" | "opcional";

type Accion =
  | { tipo: "automatica"; etiqueta: string; requiereConsentimiento?: boolean; textoConsentimiento?: string }
  | { tipo: "terminal"; etiqueta: string; terminal: string }
  | { tipo: "enlace"; etiqueta: string; enlace: string }
  | { tipo: "ical"; etiqueta: string; configurada: boolean };

interface Paso {
  id: string;
  titulo: string;
  estado: Estado;
  detalle: string;
  accion?: Accion;
  quitar?: { paso: string; etiqueta: string };
}

const ICONOS: Record<Estado, string> = { ok: "✅", falta: "⚠️", opcional: "○" };
/** Cuántas vueltas da "Arreglar todo" como máximo (cada arreglo puede destrabar otro). */
const VUELTAS = 14;

const contenedor = document.querySelector<HTMLElement>("#pasos")!;
const aviso = document.querySelector<HTMLParagraphElement>("#aviso")!;
const listo = document.querySelector<HTMLDivElement>("#listo")!;
const revisarBoton = document.querySelector<HTMLButtonElement>("#revisar")!;
const todoBoton = document.querySelector<HTMLButtonElement>("#todo")!;
const empezar = document.querySelector<HTMLButtonElement>("#empezar")!;

let pasos: Paso[] = [];
let ocupado = false;
/** Los pasos que el usuario aceptó explícitamente (configurar OpenClaw, instalar el modo programador…). */
const consentimientos = new Set<string>();
const TEXTO_CONSENTIMIENTO =
  " Entiendo que OpenClaw podrá usar este computador para ayudarme, y que Brote me pedirá permiso antes de ejecutar comandos.";
/** Lo escrito en el campo de la dirección iCal (sobrevive a que la ventana se vuelva a pintar). */
let borradorIcal = "";

function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase?: string, texto?: string): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function mostrarAviso(texto: string, error = false): void {
  aviso.textContent = texto;
  aviso.classList.toggle("error", error);
  aviso.hidden = false;
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function puedeAutomatico(paso: Paso): boolean {
  return paso.estado === "falta" && paso.accion?.tipo === "automatica" && (!paso.accion.requiereConsentimiento || consentimientos.has(paso.id));
}

function pintar(): void {
  const faltan = pasos.filter((p) => p.estado === "falta");
  listo.hidden = faltan.length > 0 || pasos.length === 0;
  todoBoton.disabled = ocupado || !pasos.some((p) => p.estado === "falta" && p.accion?.tipo === "automatica");
  revisarBoton.disabled = ocupado;

  contenedor.replaceChildren(
    ...pasos.map((paso) => {
      const tarjeta = crear("article", `tarjeta paso ${paso.estado}`);
      const cabeza = crear("div", "tarjeta-cabeza");
      cabeza.append(crear("h3", undefined, `${ICONOS[paso.estado]}  ${paso.titulo}`));
      tarjeta.append(cabeza, crear("p", "tarjeta-texto", paso.detalle));

      if (paso.quitar) {
        const quitar = paso.quitar;
        const botones = crear("div", "botones");
        const boton = crear("button", "boton", quitar.etiqueta);
        boton.type = "button";
        boton.disabled = ocupado;
        boton.addEventListener("click", () => void deshacer(paso.titulo, quitar.paso));
        botones.append(boton);
        tarjeta.append(botones);
      }
      const accion = paso.accion;
      if (!accion) return tarjeta;
      if (accion.tipo === "ical") {
        tarjeta.append(formularioIcal(accion.configurada));
        return tarjeta;
      }
      const botones = crear("div", "botones");
      if (accion.tipo === "automatica" && accion.requiereConsentimiento) {
        const etiqueta = crear("label", "consentimiento");
        const casilla = crear("input");
        casilla.type = "checkbox";
        casilla.checked = consentimientos.has(paso.id);
        casilla.addEventListener("change", () => {
          if (casilla.checked) consentimientos.add(paso.id);
          else consentimientos.delete(paso.id);
          aviso.hidden = true;
          pintar();
        });
        etiqueta.append(casilla, document.createTextNode(accion.textoConsentimiento ?? TEXTO_CONSENTIMIENTO));
        tarjeta.append(etiqueta);
      }
      const boton = crear("button", "boton boton-primario", accion.etiqueta);
      boton.type = "button";
      boton.disabled = ocupado || (accion.tipo === "automatica" && accion.requiereConsentimiento === true && !consentimientos.has(paso.id));
      boton.addEventListener("click", () => void actuar(paso));
      botones.append(boton);
      tarjeta.append(botones);
      return tarjeta;
    }),
  );
}

/**
 * La dirección iCal secreta: un campo (oculto, como una contraseña) y los botones para guardarla o
 * quitarla. La guarda Rust (`guardar_calendario`), que la valida y la deja con permisos 600.
 */
function formularioIcal(configurada: boolean): HTMLElement {
  const formulario = crear("form", "formulario-ical");
  const campo = crear("input", "campo");
  campo.type = "password";
  campo.autocomplete = "off";
  campo.spellcheck = false;
  campo.placeholder = configurada ? "Dirección guardada (oculta). Pega otra para cambiarla" : "https://calendar.google.com/calendar/ical/…/basic.ics";
  campo.value = borradorIcal;
  campo.setAttribute("aria-label", "Dirección secreta en formato iCal");
  const guardar = crear("button", "boton boton-primario", "Guardar");
  guardar.type = "submit";
  guardar.disabled = ocupado || borradorIcal.trim() === "";
  campo.addEventListener("input", () => {
    borradorIcal = campo.value;
    guardar.disabled = ocupado || borradorIcal.trim() === "";
  });
  const botones = crear("div", "botones");
  if (configurada) {
    const quitar = crear("button", "boton", "Quitar");
    quitar.type = "button";
    quitar.disabled = ocupado;
    quitar.addEventListener("click", () => void guardarIcal(null));
    botones.append(quitar);
  }
  botones.append(guardar);
  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    void guardarIcal(borradorIcal);
  });
  formulario.append(campo, botones);
  return formulario;
}

async function guardarIcal(url: string | null): Promise<void> {
  try {
    await invoke("guardar_calendario", { url });
    borradorIcal = "";
    mostrarAviso(url ? "Guardé la dirección. Reviso que funcione…" : "Quité la dirección del calendario.");
  } catch (error) {
    mostrarAviso(`Calendario: ${mensajeDe(error)}`, true);
    return;
  }
  await revisar();
}

async function revisar(): Promise<void> {
  ocupado = true;
  pintar();
  try {
    pasos = JSON.parse(await invoke<string>("configuracion", { orden: "revisar" }));
  } catch (error) {
    mostrarAviso(`No pude revisar: ${mensajeDe(error)}`, true);
  } finally {
    ocupado = false;
    pintar();
  }
}

/** Aplica un paso automático. Devuelve si salió bien. */
async function aplicar(paso: Paso): Promise<boolean> {
  mostrarAviso(`${paso.titulo}: trabajando… (puede tardar un poco)`);
  const resultado = JSON.parse(await invoke<string>("configuracion", { orden: "aplicar", paso: paso.id })) as {
    ok: boolean;
    detalle: string;
  };
  mostrarAviso(resultado.detalle, !resultado.ok);
  return resultado.ok;
}

/** El segundo botón de un paso (por ejemplo, desinstalar el modo programador). */
async function deshacer(titulo: string, id: string): Promise<void> {
  ocupado = true;
  pintar();
  try {
    await aplicar({ id, titulo, estado: "ok", detalle: "" });
  } catch (error) {
    mostrarAviso(`${titulo}: ${mensajeDe(error)}`, true);
  } finally {
    ocupado = false;
  }
  await revisar();
}

async function actuar(paso: Paso): Promise<void> {
  const accion = paso.accion;
  if (!accion) return;
  try {
    if (accion.tipo === "terminal") {
      await invoke("abrir_terminal", { cual: accion.terminal });
      mostrarAviso("Abrí una terminal. Cuando termines ahí, vuelve y pulsa «Revisar de nuevo».");
      return;
    }
    if (accion.tipo === "enlace") {
      await invoke("abrir_enlace", { cual: accion.enlace });
      mostrarAviso("Abrí la página en tu navegador. Después de instalarlo, pulsa «Revisar de nuevo».");
      return;
    }
    ocupado = true;
    pintar();
    await aplicar(paso);
  } catch (error) {
    mostrarAviso(`${paso.titulo}: ${mensajeDe(error)}`, true);
  } finally {
    ocupado = false;
  }
  await revisar();
}

todoBoton.addEventListener("click", async () => {
  // Configurar OpenClaw necesita el consentimiento explícito: se avisa en vez de no hacer nada.
  const sinConsentimiento = pasos.find(
    (p) => p.estado === "falta" && p.accion?.tipo === "automatica" && p.accion.requiereConsentimiento && !consentimientos.has(p.id),
  );
  if (sinConsentimiento && !pasos.some(puedeAutomatico)) {
    mostrarAviso("Primero marca la casilla de «Agente de OpenClaw» para aceptar que se configure.", true);
    const casilla = document.querySelector<HTMLElement>(".consentimiento");
    casilla?.scrollIntoView({ behavior: "smooth", block: "center" });
    casilla?.classList.add("resaltada");
    return;
  }
  ocupado = true;
  pintar();
  try {
    for (let vuelta = 0; vuelta < VUELTAS; vuelta++) {
      const siguiente = pasos.find(puedeAutomatico);
      if (!siguiente) break;
      if (!(await aplicar(siguiente))) break;
      pasos = JSON.parse(await invoke<string>("configuracion", { orden: "revisar" }));
      pintar();
    }
  } catch (error) {
    mostrarAviso(mensajeDe(error), true);
  } finally {
    ocupado = false;
  }
  await revisar();
  const pendientes = pasos.filter((p) => p.estado === "falta");
  if (pendientes.length > 0) mostrarAviso(`Falta: ${pendientes.map((p) => p.titulo).join(", ")}. Revisa los botones de cada uno.`);
});

revisarBoton.addEventListener("click", () => void revisar());
empezar.addEventListener("click", () => void invoke("reiniciar"));
// Al volver a la ventana (por ejemplo, desde la terminal) se revisa de nuevo.
window.addEventListener("focus", () => {
  if (!ocupado) void revisar();
});

void revisar();
