// La ventana "Lo que sé de ti" (paso 9): muestra lo que Brote recuerda y las frases que aprendió,
// y permite corregir u olvidar. Todo pasa por el puente; el contenido viene de archivos de
// memoria, así que siempre se pone como texto, nunca como HTML.

import { invoke } from "@tauri-apps/api/core";
import { avisoGrabacionBorrada, avisoOlvidado, avisoTemaOlvidado, confirmarBorrarTodo, pieGrabaciones, pieOlvidar, type QueGrabacion } from "./agente/papelera";
import {
  textoAviso,
  textoCopiado,
  textoDuracion,
  textoFecha,
  textoTamano,
  textoVencimiento,
  totalGrabaciones,
  type Grabaciones,
  type ItemAudio,
  type ItemTranscripcion,
} from "./agente/grabaciones-memoria";
import { TransportePuente } from "./agente/puente";
import { copiarTexto } from "./copiar";

type TipoRecuerdo = "brote" | "conversacion" | "importado";

interface Recuerdo {
  id: string;
  tipo: TipoRecuerdo;
  titulo: string;
  texto: string;
  fecha: string | null;
  editable: boolean;
}

interface Frase {
  id: number;
  ejemplo: string;
  accion: string;
}

interface Memoria {
  recuerdos: Recuerdo[];
  frases: Frase[];
  sinIA: number;
}

const SECCIONES: { tipo: TipoRecuerdo | "frases"; titulo: string; nota?: string; vacio: string }[] = [
  { tipo: "brote", titulo: "Lo que me contaste", vacio: "Todavía no guardo nada de lo que me has contado." },
  { tipo: "frases", titulo: "Frases que aprendí", vacio: "Aún no aprendo frases nuevas." },
  { tipo: "conversacion", titulo: "Conversaciones guardadas", vacio: "No hay conversaciones guardadas." },
  {
    tipo: "importado",
    titulo: "De otros proyectos",
    nota: "OpenClaw copió estas memorias de tus proyectos de Claude Code al instalarse. Olvidarlas no toca tus proyectos.",
    vacio: "No hay memorias importadas.",
  },
];

/** Cuánto espera el segundo toque de "Olvidar" antes de volver atrás. */
const CONFIRMACION_MS = 3000;

const EN_MAC = navigator.userAgent.includes("Mac");

const puente = new TransportePuente();
const secciones = document.querySelector<HTMLElement>("#secciones")!;
const aviso = document.querySelector<HTMLParagraphElement>("#aviso")!;
const sinIA = document.querySelector<HTMLSpanElement>("#sin-ia")!;
const nueva = document.querySelector<HTMLButtonElement>("#nueva")!;
const buscar = document.querySelector<HTMLInputElement>("#buscar")!;
const tema = document.querySelector<HTMLDivElement>("#tema")!;
const temaTexto = document.querySelector<HTMLSpanElement>("#tema-texto")!;
const temaOlvidar = document.querySelector<HTMLButtonElement>("#tema-olvidar")!;

let memoria: Memoria | null = null;
/** Las grabaciones guardadas (`null`: todavía no se leyeron o no se pudo). */
let grabaciones: Grabaciones | null = null;
/** Lo que se está buscando y los ids que lo mencionan (según el contenido completo, que ve el puente). */
let filtro = "";
let coincidencias: Set<string> | null = null;

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

function fechaCorta(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

/** Un botón "Olvidar" que pide un segundo toque para confirmar. */
function botonOlvidar(alConfirmar: () => Promise<void>, etiqueta = "Olvidar", pregunta = "¿Seguro?"): HTMLButtonElement {
  const boton = crear("button", "boton boton-peligro", etiqueta);
  boton.type = "button";
  let plazo: ReturnType<typeof setTimeout> | undefined;
  boton.addEventListener("click", async () => {
    if (!boton.classList.contains("confirmando")) {
      boton.classList.add("confirmando");
      boton.textContent = pregunta;
      plazo = setTimeout(() => {
        boton.classList.remove("confirmando");
        boton.textContent = etiqueta;
      }, CONFIRMACION_MS);
      return;
    }
    clearTimeout(plazo);
    boton.disabled = true;
    try {
      await alConfirmar();
    } catch (error) {
      boton.disabled = false;
      mostrarAviso(`No pude ${etiqueta.toLowerCase()}: ${mensajeDe(error)}`, true);
    }
  });
  return boton;
}

function tarjetaRecuerdo(recuerdo: Recuerdo): HTMLElement {
  const tarjeta = crear("article", `tarjeta ${recuerdo.tipo}`);
  const cabeza = crear("div", "tarjeta-cabeza");
  cabeza.append(crear("h3", undefined, recuerdo.titulo), crear("span", "fecha", fechaCorta(recuerdo.fecha)));
  const texto = crear("p", "tarjeta-texto", recuerdo.texto);
  const botones = crear("div", "botones");

  if (recuerdo.editable) {
    const corregir = crear("button", "boton", "Corregir");
    corregir.type = "button";
    corregir.addEventListener("click", () => editar(tarjeta, texto, botones, recuerdo));
    botones.append(corregir);
  }
  botones.append(
    botonOlvidar(async () => {
      await puente.consultar({ tipo: "memoria-olvidar", recuerdo: recuerdo.id });
      mostrarAviso(avisoOlvidado(EN_MAC));
      await cargar();
    }),
  );
  tarjeta.append(cabeza, texto, botones);
  return tarjeta;
}

/** Cambia el texto de un recuerdo por un área editable con Guardar y Cancelar. */
function editar(tarjeta: HTMLElement, texto: HTMLElement, botones: HTMLElement, recuerdo: Recuerdo): void {
  const area = crear("textarea", "editor");
  area.value = recuerdo.texto;
  area.rows = Math.min(10, Math.max(3, recuerdo.texto.split("\n").length + 1));
  const guardar = crear("button", "boton boton-primario", "Guardar");
  const cancelar = crear("button", "boton", "Cancelar");
  guardar.type = cancelar.type = "button";
  const acciones = crear("div", "botones");
  acciones.append(cancelar, guardar);

  texto.replaceWith(area);
  botones.replaceWith(acciones);
  area.focus();

  cancelar.addEventListener("click", () => {
    area.replaceWith(texto);
    acciones.replaceWith(botones);
  });
  guardar.addEventListener("click", async () => {
    guardar.disabled = true;
    try {
      await puente.consultar({ tipo: "memoria-corregir", recuerdo: recuerdo.id, texto: area.value });
      mostrarAviso("Corregido. Brote usará la versión nueva desde la próxima conversación.");
      await cargar();
    } catch (error) {
      guardar.disabled = false;
      mostrarAviso(`No pude corregirlo: ${mensajeDe(error)}`, true);
    }
  });
  tarjeta.classList.add("editando");
}

function tarjetaFrase(frase: Frase): HTMLElement {
  const tarjeta = crear("article", "tarjeta frase");
  const texto = crear("p", "tarjeta-texto");
  texto.append(crear("strong", undefined, `«${frase.ejemplo}»`), document.createTextNode(` → ${frase.accion}, sin IA ⚡`));
  const botones = crear("div", "botones");
  botones.append(
    botonOlvidar(async () => {
      await puente.consultar({ tipo: "frase-olvidar", plantilla: frase.id });
      mostrarAviso("Listo, ya no uso esa frase. La próxima vez irá al agente.");
      await cargar();
    }),
  );
  tarjeta.append(texto, botones);
  return tarjeta;
}

// ---- Grabaciones (sección 8, fase 4): lista, ver el texto y borrar ----

async function borrarGrabaciones(que: QueGrabacion, id: string | null): Promise<void> {
  const { borradas } = await puente.consultar<{ borradas: number }>({ tipo: "grabacion-borrar", que, grabacion: id });
  mostrarAviso(avisoGrabacionBorrada(EN_MAC, que, borradas));
  await cargarGrabaciones();
  pintarTodo();
}

function tarjetaTranscripcion(t: ItemTranscripcion): HTMLElement {
  const tarjeta = crear("article", "tarjeta grabacion transcripcion");
  const cabeza = crear("div", "tarjeta-cabeza");
  cabeza.append(crear("h3", undefined, textoFecha(t.fecha, t.id)), crear("span", "fecha", textoDuracion(t.duracionSeg)));
  const meta = crear("p", "meta", `${textoAviso(t.avisoAPresentes)} · modelo ${t.modelo}`);
  const botones = crear("div", "botones");
  const ver = crear("button", "boton", "Ver el texto");
  ver.type = "button";
  let cuerpo: HTMLPreElement | null = null;
  ver.addEventListener("click", async () => {
    if (cuerpo) {
      cuerpo.remove();
      cuerpo = null;
      ver.textContent = "Ver el texto";
      return;
    }
    ver.disabled = true;
    try {
      const { texto, recortado } = await puente.consultar<{ texto: string; recortado: boolean }>({ tipo: "grabacion-ver", grabacion: t.id });
      cuerpo = crear("pre", "texto-grabacion", recortado ? `${texto}\n\n[…se cortó aquí: el texto es larguísimo]` : texto);
      tarjeta.insertBefore(cuerpo, botones);
      ver.textContent = "Ocultar el texto";
    } catch (error) {
      mostrarAviso(`No pude leer la transcripción: ${mensajeDe(error)}`, true);
    } finally {
      ver.disabled = false;
    }
  });
  const copiar = crear("button", "boton", "Copiar");
  copiar.type = "button";
  let plazoCopiar: ReturnType<typeof setTimeout> | undefined;
  copiar.addEventListener("click", async () => {
    copiar.disabled = true;
    let mensaje: string;
    try {
      const { texto, recortado } = await puente.consultar<{ texto: string; recortado: boolean }>({ tipo: "grabacion-ver", grabacion: t.id });
      mensaje = textoCopiado(await copiarTexto(texto), recortado);
    } catch {
      mensaje = textoCopiado(false, false);
    }
    copiar.textContent = mensaje;
    copiar.disabled = false;
    clearTimeout(plazoCopiar);
    plazoCopiar = setTimeout(() => (copiar.textContent = "Copiar"), 2000);
  });
  botones.append(ver, copiar, botonOlvidar(() => borrarGrabaciones("transcripcion", t.id), "Borrar"));
  tarjeta.append(cabeza, meta, botones);
  return tarjeta;
}

function tarjetaAudio(a: ItemAudio): HTMLElement {
  const tarjeta = crear("article", `tarjeta grabacion audio${a.vencido ? " vencido" : ""}`);
  const cabeza = crear("div", "tarjeta-cabeza");
  cabeza.append(crear("h3", undefined, `Audio · ${textoFecha(a.fecha, a.id)}`), crear("span", "fecha", textoTamano(a.bytes)));
  const vence = textoVencimiento(a, Date.now());
  const meta = crear("p", "meta", `${a.transcrito ? "Ya tiene transcripción" : "Sin transcripción"}${vence ? ` · ${vence}` : ""}`);
  const botones = crear("div", "botones");
  botones.append(botonOlvidar(() => borrarGrabaciones("audio", a.id), "Borrar"));
  tarjeta.append(cabeza, meta, botones);
  return tarjeta;
}

/** Un subtítulo con su botón «Borrar todo» (con segundo toque). */
function subtitulo(texto: string, que: QueGrabacion, cuantas: number): HTMLElement {
  const fila = crear("div", "subtitulo");
  fila.append(crear("span", undefined, `${texto} (${cuantas})`), botonOlvidar(() => borrarGrabaciones(que, null), "Borrar todo", confirmarBorrarTodo(que, cuantas)));
  return fila;
}

function seccionGrabaciones(g: Grabaciones): HTMLElement {
  const seccion = crear("section", "seccion seccion-grabaciones");
  const encabezado = crear("h2", undefined, "Grabaciones");
  encabezado.append(crear("span", "cuenta", String(totalGrabaciones(g))));
  seccion.append(
    encabezado,
    crear("p", "nota", "Lo que grabaste y transcribiste en este computador. Brote solo lo usa cuando tú se lo pides; el audio no sale de tu equipo."),
  );
  if (totalGrabaciones(g) === 0) {
    seccion.append(crear("p", "vacio", "No hay grabaciones ni transcripciones guardadas."));
    return seccion;
  }
  if (g.transcripciones.length > 0) seccion.append(subtitulo("Transcripciones", "transcripcion", g.transcripciones.length), ...g.transcripciones.map(tarjetaTranscripcion));
  if (g.audios.length > 0) {
    seccion.append(subtitulo(`Audios (se borran solos a los ${g.diasAudio} días)`, "audio", g.audios.length), ...g.audios.map(tarjetaAudio));
  }
  seccion.append(crear("p", "nota", pieGrabaciones(EN_MAC)));
  return seccion;
}

async function cargarGrabaciones(): Promise<void> {
  try {
    grabaciones = await puente.consultar<Grabaciones>({ tipo: "grabaciones-listar" });
  } catch {
    grabaciones = null; // un puente más viejo no conoce el pedido: la sección no aparece
  }
}

function pintarTodo(): void {
  if (memoria) pintar(memoria);
}

function simplificar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function pintar(memoria: Memoria): void {
  sinIA.textContent = `⚡ ${memoria.sinIA}% sin IA`;
  sinIA.title = "De todo lo que le has pedido, cuánto resolvió el motor sin usar IA";
  sinIA.hidden = false;

  const contenido = SECCIONES.map(({ tipo, titulo, nota, vacio }) => {
    const seccion = crear("section", "seccion");
    const buscado = simplificar(filtro.trim());
    const tarjetas =
      tipo === "frases"
        ? memoria.frases.filter((f) => !coincidencias || simplificar(f.ejemplo).includes(buscado)).map(tarjetaFrase)
        : memoria.recuerdos
            .filter((r) => r.tipo === tipo && (!coincidencias || coincidencias.has(r.id)))
            .map(tarjetaRecuerdo);
    const encabezado = crear("h2", undefined, titulo);
    encabezado.append(crear("span", "cuenta", String(tarjetas.length)));
    seccion.append(encabezado);
    if (nota) seccion.append(crear("p", "nota", nota));
    seccion.append(...(tarjetas.length > 0 ? tarjetas : [crear("p", "vacio", vacio)]));
    return seccion;
  });
  // Buscar es sobre lo que Brote recuerda; las grabaciones son aparte (y «olvidar todo sobre» no las toca).
  if (grabaciones && !coincidencias) contenido.push(seccionGrabaciones(grabaciones));
  secciones.replaceChildren(...contenido);
}

async function cargar(): Promise<void> {
  try {
    memoria = await puente.consultar<Memoria>({ tipo: "memoria-listar" });
    await cargarGrabaciones();
    await filtrar();
  } catch (error) {
    mostrarAviso(`No pude leer la memoria: ${mensajeDe(error)}`, true);
  }
}

/** Aplica la búsqueda: muestra solo lo que menciona el tema y ofrece olvidarlo todo junto. */
async function filtrar(): Promise<void> {
  const buscado = filtro.trim();
  coincidencias = null;
  if (buscado.length >= 3) {
    try {
      coincidencias = new Set(await puente.consultar<string[]>({ tipo: "memoria-buscar", tema: buscado }));
    } catch (error) {
      mostrarAviso(`No pude buscar: ${mensajeDe(error)}`, true);
    }
  }
  if (memoria) pintar(memoria);

  const frases = memoria?.frases.filter((f) => simplificar(f.ejemplo).includes(simplificar(buscado))).length ?? 0;
  const total = (coincidencias?.size ?? 0) + (coincidencias ? frases : 0);
  tema.hidden = !coincidencias;
  if (!coincidencias) return;
  temaTexto.textContent =
    total === 0 ? `Nada menciona «${buscado}».` : `«${buscado}» aparece en ${total} ${total === 1 ? "lugar" : "lugares"}.`;
  temaOlvidar.hidden = total === 0;
  temaOlvidar.textContent = `Olvidar todo sobre «${buscado}»`;
  temaOlvidar.classList.remove("confirmando");
  temaOlvidar.disabled = false;
}

let esperaBusqueda: ReturnType<typeof setTimeout> | undefined;
buscar.addEventListener("input", () => {
  filtro = buscar.value;
  clearTimeout(esperaBusqueda);
  esperaBusqueda = setTimeout(() => void filtrar(), 250);
});

let plazoTema: ReturnType<typeof setTimeout> | undefined;
temaOlvidar.addEventListener("click", async () => {
  const buscado = filtro.trim();
  if (!temaOlvidar.classList.contains("confirmando")) {
    temaOlvidar.classList.add("confirmando");
    temaOlvidar.textContent = "¿Seguro? Se olvida todo y empieza una conversación nueva";
    plazoTema = setTimeout(() => void filtrar(), CONFIRMACION_MS);
    return;
  }
  clearTimeout(plazoTema);
  temaOlvidar.disabled = true;
  try {
    const { olvidados } = await puente.consultar<{ olvidados: number }>({ tipo: "memoria-olvidar-tema", tema: buscado });
    mostrarAviso(avisoTemaOlvidado(EN_MAC, olvidados, buscado));
    buscar.value = filtro = "";
    await cargar();
  } catch (error) {
    temaOlvidar.disabled = false;
    mostrarAviso(`No pude olvidar «${buscado}»: ${mensajeDe(error)}`, true);
  }
});

nueva.addEventListener("click", async () => {
  nueva.disabled = true;
  try {
    await puente.consultar({ tipo: "conversacion-nueva" });
    mostrarAviso("Empecé una conversación nueva. Brote ya no usa lo que olvidaste. 🌱");
    // OpenClaw guarda un resumen de la conversación anterior: aparece al recargar.
    setTimeout(() => void cargar(), 1500);
  } catch (error) {
    mostrarAviso(`No pude empezar una conversación nueva: ${mensajeDe(error)}`, true);
  } finally {
    nueva.disabled = false;
  }
});

document.querySelector("#configurar")!.addEventListener("click", () => void invoke("abrir_configuracion"));

// Al volver a la ventana se recarga, por si Brote aprendió o recordó algo mientras tanto.
window.addEventListener("focus", () => void cargar());

document.querySelector("#pie-olvidar")!.textContent = pieOlvidar(EN_MAC);

void puente.iniciar().then(cargar, (error) => mostrarAviso(`No pude conectar con el puente: ${mensajeDe(error)}`, true));
