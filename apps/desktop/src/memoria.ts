// La ventana "Lo que sé de ti" (paso 9): muestra lo que Brote recuerda y las frases que aprendió,
// y permite corregir u olvidar. Todo pasa por el puente; el contenido viene de archivos de
// memoria, así que siempre se pone como texto, nunca como HTML.

import { TransportePuente } from "./agente/puente";

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
function botonOlvidar(alConfirmar: () => Promise<void>): HTMLButtonElement {
  const boton = crear("button", "boton boton-peligro", "Olvidar");
  boton.type = "button";
  let plazo: ReturnType<typeof setTimeout> | undefined;
  boton.addEventListener("click", async () => {
    if (!boton.classList.contains("confirmando")) {
      boton.classList.add("confirmando");
      boton.textContent = "¿Seguro?";
      plazo = setTimeout(() => {
        boton.classList.remove("confirmando");
        boton.textContent = "Olvidar";
      }, CONFIRMACION_MS);
      return;
    }
    clearTimeout(plazo);
    boton.disabled = true;
    try {
      await alConfirmar();
    } catch (error) {
      boton.disabled = false;
      mostrarAviso(`No pude olvidarlo: ${mensajeDe(error)}`, true);
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
      mostrarAviso("Listo, lo olvidé. Para que deje de usarlo ya, empieza una conversación nueva.");
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
  secciones.replaceChildren(...contenido);
}

async function cargar(): Promise<void> {
  try {
    memoria = await puente.consultar<Memoria>({ tipo: "memoria-listar" });
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
    mostrarAviso(`Olvidé ${olvidados} ${olvidados === 1 ? "cosa" : "cosas"} sobre «${buscado}» y empecé una conversación nueva. 🌱`);
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

// Al volver a la ventana se recarga, por si Brote aprendió o recordó algo mientras tanto.
window.addEventListener("focus", () => void cargar());

void puente.iniciar().then(cargar, (error) => mostrarAviso(`No pude conectar con el puente: ${mensajeDe(error)}`, true));
