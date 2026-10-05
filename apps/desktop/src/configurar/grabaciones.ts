// "Grabar y transcribir" dentro de su tarjeta en Configurar Brote → Funciones: el consentimiento, el
// modelo (small de partida), los días que se conserva el audio, el estado de whisper-cli y la descarga
// del modelo. La descarga la hace y la valida Rust (`modelo_descargar`: solo la lista cerrada, desde el
// host oficial, con tamaño y SHA-256); aquí solo se pide y se muestra el avance. Los ajustes los guarda
// Rust (`guardar_grabaciones`) y el puente los relee. La captura con micrófono llega en la fase 3.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  FICHAS_MODELOS_WHISPER,
  MAX_DIAS_AUDIO,
  MIN_DIAS_AUDIO,
  MODELOS_WHISPER,
  TEXTO_CONSENTIMIENTO_GRABACIONES,
  VERSION_CONSENTIMIENTO_GRABACIONES,
  normalizarAjustesGrabaciones,
  tamanoDeModelo,
  type AjustesGrabaciones,
  type ModeloWhisper,
} from "../agente/grabaciones";
import { actuar, boton, crear, estado, mensajeDe, mostrarAviso, paso, pintar } from "./comun";

const grabaciones = {
  ajustes: normalizarAjustesGrabaciones(null) as AjustesGrabaciones,
  /** Qué modelos ya están descargados (`null`: no se ha leído). */
  descargados: null as Record<string, boolean> | null,
  /** La descarga en curso (una a la vez). */
  descarga: null as { modelo: ModeloWhisper; fase: string; bytes: number; total: number } | null,
  /** Se pidió descargar y falta la confirmación explícita. */
  confirmando: null as ModeloWhisper | null,
};

/** Lee los ajustes y qué modelos hay (al abrir la ventana y al cambiar algo). */
export async function leerGrabaciones(): Promise<void> {
  try {
    const texto = await invoke<string | null>("leer_grabaciones");
    grabaciones.ajustes = normalizarAjustesGrabaciones(texto ? JSON.parse(texto) : null);
  } catch {
    grabaciones.ajustes = normalizarAjustesGrabaciones(null);
  }
  try {
    grabaciones.descargados = (await invoke("modelos_estado")) as Record<string, boolean>;
  } catch {
    grabaciones.descargados = null;
  }
  pintar();
}

async function guardar(cambios: Partial<{ modelo: ModeloWhisper; diasAudio: number; consentimiento: boolean }>): Promise<void> {
  const nuevo = { ...grabaciones.ajustes, ...cambios };
  try {
    await invoke("guardar_grabaciones", {
      modelo: nuevo.modelo,
      diasAudio: nuevo.diasAudio,
      consentimiento: nuevo.consentimiento ? VERSION_CONSENTIMIENTO_GRABACIONES : null,
    });
    grabaciones.ajustes = nuevo;
  } catch (error) {
    mostrarAviso(`No pude guardar: ${mensajeDe(error)}`, true);
  }
  pintar();
}

void listen<{ modelo: ModeloWhisper; fase: string; bytes: number; total: number; detalle: string | null }>("modelo", ({ payload }) => {
  switch (payload.fase) {
    case "descargando":
    case "verificando":
      grabaciones.descarga = { modelo: payload.modelo, fase: payload.fase, bytes: payload.bytes, total: payload.total };
      break;
    case "listo":
      grabaciones.descarga = null;
      mostrarAviso(`Listo: el modelo ${payload.modelo} quedó descargado y verificado.`);
      void leerGrabaciones();
      return;
    case "cancelado":
      grabaciones.descarga = null;
      mostrarAviso("Cancelé la descarga.");
      break;
    case "error":
      grabaciones.descarga = null;
      mostrarAviso(payload.detalle ?? "No pude descargar el modelo.", true);
      break;
  }
  pintar();
});

async function descargar(modelo: ModeloWhisper): Promise<void> {
  grabaciones.confirmando = null;
  grabaciones.descarga = { modelo, fase: "descargando", bytes: 0, total: FICHAS_MODELOS_WHISPER[modelo].bytes };
  pintar();
  try {
    await invoke("modelo_descargar", { modelo });
  } catch (error) {
    // Rust ya avisó por el evento `modelo`; esto cubre lo que falla antes de empezar.
    if (grabaciones.descarga) {
      grabaciones.descarga = null;
      mostrarAviso(mensajeDe(error), true);
      pintar();
    }
  }
}

function filaModelo(modelo: ModeloWhisper): HTMLElement {
  const ficha = FICHAS_MODELOS_WHISPER[modelo];
  const elegido = grabaciones.ajustes.modelo === modelo;
  const fila = crear("label", `modelo-fila${elegido ? " elegido" : ""}`);
  const radio = crear("input");
  radio.type = "radio";
  radio.name = "modelo-whisper";
  radio.checked = elegido;
  radio.addEventListener("change", () => void guardar({ modelo }));
  const texto = crear("span", "modelo-texto");
  const esta = grabaciones.descargados?.[modelo] === true;
  texto.append(crear("strong", undefined, `${modelo}${modelo === "small" ? " (recomendado)" : ""} · ${tamanoDeModelo(modelo)}`), crear("span", "nota", ficha.nota));
  const estadoModelo = crear("span", `modelo-estado${esta ? " ok" : ""}`, esta ? "✅ descargado" : grabaciones.descargados ? "sin descargar" : "");
  fila.append(radio, texto, estadoModelo);
  return fila;
}

function bloqueDescarga(): HTMLElement | null {
  const modelo = grabaciones.ajustes.modelo;
  const esta = grabaciones.descargados?.[modelo] === true;
  const caja = crear("div", "descarga-modelo");
  if (grabaciones.descarga) {
    const { fase, bytes, total, modelo: enCurso } = grabaciones.descarga;
    const barra = crear("div", `barra-progreso${fase === "verificando" ? " trabajando" : ""}`);
    const relleno = crear("i");
    relleno.style.width = `${Math.min(100, Math.round((bytes / total) * 100))}%`;
    barra.append(relleno);
    caja.append(
      crear("p", "nota", fase === "verificando" ? `Verificando ${enCurso}…` : `Descargando ${enCurso}: ${Math.round(bytes / 1_000_000)} de ${Math.round(total / 1_000_000)} MB`),
      barra,
      boton("Cancelar", "boton", () => void invoke("modelo_cancelar")),
    );
    return caja;
  }
  if (esta) return null;
  if (grabaciones.confirmando === modelo) {
    caja.append(
      crear(
        "p",
        "nota",
        `Voy a descargar el modelo ${modelo} (${tamanoDeModelo(modelo)}) desde huggingface.co, el sitio oficial de los modelos de whisper.cpp. ` +
          "Brote comprueba que el archivo sea exactamente el original antes de usarlo. Solo se baja el modelo: tu audio nunca sale de este computador.",
      ),
    );
    const botones = crear("div", "botones");
    botones.append(boton("Cancelar", "boton", () => ((grabaciones.confirmando = null), pintar())), boton(`Descargar ${tamanoDeModelo(modelo)}`, "boton boton-primario", () => void descargar(modelo)));
    caja.append(botones);
    return caja;
  }
  caja.append(boton(`Descargar el modelo ${modelo} (${tamanoDeModelo(modelo)})…`, "boton boton-primario", () => ((grabaciones.confirmando = modelo), pintar()), !grabaciones.descargados));
  return caja;
}

/** Lo que va dentro de la tarjeta de la función `grabaciones` cuando está prendida. */
export function configuracionGrabaciones(): HTMLElement[] {
  const partes: HTMLElement[] = [];

  // 1. Consentimiento (con su versión: si el texto cambia, se pide otra vez).
  const consentimiento = crear("div", `subpaso ${grabaciones.ajustes.consentimiento ? "ok" : "opcional"}`);
  consentimiento.append(crear("p", "subpaso-titulo", `${grabaciones.ajustes.consentimiento ? "✅" : "○"} Aviso de privacidad`));
  const etiqueta = crear("label", "consentimiento");
  const casilla = crear("input");
  casilla.type = "checkbox";
  casilla.checked = grabaciones.ajustes.consentimiento;
  casilla.addEventListener("change", () => void guardar({ consentimiento: casilla.checked }));
  etiqueta.append(casilla, document.createTextNode(TEXTO_CONSENTIMIENTO_GRABACIONES));
  consentimiento.append(etiqueta);
  partes.push(consentimiento);

  // 2. whisper-cli (el programa que transcribe), con "Instalar con Homebrew" en Mac.
  const whisper = paso("whisper");
  if (whisper) {
    const caja = crear("div", `subpaso ${whisper.estado}`);
    caja.append(crear("p", "subpaso-titulo", `${whisper.estado === "ok" ? "✅" : "○"} Transcriptor (whisper.cpp)`), crear("p", "nota", whisper.detalle));
    if (whisper.accion?.tipo === "terminal") {
      const accion = whisper.accion;
      const botones = crear("div", "botones");
      botones.append(boton(accion.etiqueta, "boton boton-primario", () => void actuar(whisper), estado.ocupado));
      caja.append(botones);
    }
    partes.push(caja);
  }

  // 3. Modelo y descarga.
  const modelo = crear("div", "subpaso opcional");
  modelo.append(crear("p", "subpaso-titulo", "Modelo de transcripción"), crear("p", "nota", "Más grande = más preciso y más lento. El que elijas se descarga una vez y queda en tu computador."));
  const lista = crear("div", "modelos");
  for (const m of MODELOS_WHISPER) lista.append(filaModelo(m));
  modelo.append(lista);
  const descarga = bloqueDescarga();
  if (descarga) modelo.append(descarga);
  partes.push(modelo);

  // 4. Días que se conserva el audio.
  const dias = crear("div", "subpaso opcional");
  dias.append(crear("p", "subpaso-titulo", "Cuánto se conserva el audio"));
  const selector = crear("select");
  selector.setAttribute("aria-label", "Días que se conserva el audio");
  const opciones = [...new Set([1, 3, 7, 14, 30, 90, grabaciones.ajustes.diasAudio])].filter((d) => d >= MIN_DIAS_AUDIO && d <= MAX_DIAS_AUDIO).sort((a, b) => a - b);
  for (const d of opciones) {
    const opcion = crear("option", undefined, d === 1 ? "1 día" : `${d} días`);
    opcion.value = String(d);
    opcion.selected = d === grabaciones.ajustes.diasAudio;
    selector.append(opcion);
  }
  selector.addEventListener("change", () => void guardar({ diasAudio: Number(selector.value) }));
  dias.append(
    crear("p", "nota", "Pasado ese tiempo el audio se borra solo (en Mac va a la Papelera). El texto de la transcripción se queda hasta que tú lo borres."),
    selector,
  );
  partes.push(dias);
  return partes;
}
