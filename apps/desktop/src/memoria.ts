// La ventana "Lo que sé de ti" (paso 9): muestra lo que Brote recuerda y las frases que aprendió,
// y permite corregir u olvidar. Todo pasa por el puente; el contenido viene de archivos de
// memoria, así que siempre se pone como texto, nunca como HTML.

import { invoke } from "@tauri-apps/api/core";
import { HEX_RAMO, NOTA_RAMOS, avisoRamoBorrado, type Ramo } from "./agente/estudio";
import { NOTA_AHORRO_MEMORIA, avisoAhorroBorrado, lineaDeMetaGuardada, type AporteAhorro, type MetaAhorro } from "./agente/ahorro";
import { NOTA_ESTADISTICAS_MEMORIA, avisoEstadisticasBorradas, formatearMinutos, lineaDeRamo, textoDesde, type ResumenEstudio } from "./agente/estadisticas";
import { NOTA_PLAN_MEMORIA, avisoPlanBorrado, describirPrueba as describirPruebaPlan, resumenPlan, type PlanEstudio } from "./agente/plan-estudio";
import { describirDocumento, type DocumentoVista } from "./agente/documentos";
import { NOTA_REPASO_MEMORIA, avisoRepasoBorrado, estadoDeTarjeta, fechaDeClase, type EstadoRepaso } from "./agente/repaso";
import { NOTA_NOTAS_MEMORIA, avisoNotasBorradas, formatearNota, resumenNotas, type FichaNotas } from "./agente/notas";
import { avisoDocumentoBorrado, confirmarBorrarTodosDocumentos, avisoGrabacionBorrada, avisoConversacionOlvidada, avisoOlvidado, avisoTemaOlvidado, confirmarBorrarTodo, etiquetaAlmacenamiento, explicacionAlmacenamiento, type QueGrabacion } from "./agente/papelera";
import {
  GRUPOS,
  SECCIONES_DE,
  almacenamientoDe,
  almacenamientosDeGrupo,
  buscaEnElPuente,
  coincide,
  lineaDeGrupo,
  plural,
  resumenDeClase,
  simplificar,
  textoBuscado,
  textoVacioDeGrupo,
  textoVer,
  totalDeGrupo,
  type Conteos,
  type GrupoConDatos,
  type GrupoId,
  type SeccionId,
} from "./agente/memoria-vista";
import {
  textoAviso,
  textoCopiado,
  textoDuracion,
  textoFecha,
  textoTamano,
  textoVencimiento,
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

/** Las cuatro secciones del grupo «Brote recuerda»; las demás las arma cada `seccion…` de más abajo. */
const SECCIONES: { tipo: TipoRecuerdo | "frases"; seccion: SeccionId; titulo: string; nota?: string; vacio: string }[] = [
  { tipo: "brote", seccion: "brote", titulo: "Lo que me contaste", vacio: "Todavía no guardo nada de lo que me has contado." },
  { tipo: "frases", seccion: "frases", titulo: "Frases que aprendí", vacio: "Aún no aprendo frases nuevas." },
  { tipo: "conversacion", seccion: "conversacion", titulo: "Conversaciones guardadas", vacio: "No hay conversaciones guardadas." },
  {
    tipo: "importado",
    seccion: "importado",
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
const nav = document.querySelector<HTMLElement>("#nav")!;
const buscar = document.querySelector<HTMLInputElement>("#buscar")!;
const tema = document.querySelector<HTMLDivElement>("#tema")!;
const temaTexto = document.querySelector<HTMLSpanElement>("#tema-texto")!;
const temaOlvidar = document.querySelector<HTMLButtonElement>("#tema-olvidar")!;

let memoria: Memoria | null = null;
/** Los ramos guardados, con los archivados (`null`: todavía no se leyeron o no se pudo). */
let ramosGuardados: Ramo[] | null = null;
/** Las notas guardadas, por ramo (con los archivados). Se ven y se borran aunque la función Estudio esté apagada. */
/** Las tarjetas y resúmenes de repaso (A3), con las propuestas pendientes. Se ven y se borran aunque Estudio esté apagado. */
let repasoGuardado: (EstadoRepaso & { ramos: Ramo[]; tarjetas: import("./agente/repaso").Tarjeta[] }) | null = null;
/** Los planes de estudio (A4): ramos, fechas y horas. Se ven y se borran aunque Estudio esté apagado. */
let planesGuardados: { ramos: Ramo[]; planes: PlanEstudio[]; evaluaciones: Record<number, string> } | null = null;
/** El tiempo estudiado (A5): totales por ramo. Se ve y se borra aunque Estudio esté apagado. */
let estudioGuardado: { ramos: Ramo[]; resumen: ResumenEstudio } | null = null;
/** Las metas de ahorro y sus aportes (con las archivadas). Se ven y se borran aunque Gastos esté apagado. */
let ahorroGuardado: { metas: MetaAhorro[]; aportes: AporteAhorro[] } | null = null;
let notasGuardadas: { ramos: Ramo[]; fichas: FichaNotas[] } | null = null;
/** Los documentos que el usuario le dio a Brote (`null`: todavía no se leyeron o no se pudo). */
let documentosGuardados: DocumentoVista[] | null = null;
/** Las grabaciones guardadas (`null`: todavía no se leyeron o no se pudo). */
let grabaciones: Grabaciones | null = null;
/** Lo que se está buscando y los ids que lo mencionan (según el contenido completo, que ve el puente). */
let filtro = "";
/** Lo que se busca en títulos y nombres ya cargados (simplificado; vacío = sin búsqueda). */
let buscado = "";
/** El grupo que se está viendo y qué secciones están abiertas (se recuerda entre repintados). */
let grupoActual: GrupoId = "resumen";
const abiertas = new Map<string, boolean>();
/** Qué filas resumidas tienen su «Ver» abierto (para no cerrarlo al borrar una cosa de adentro). */
const detallesAbiertos = new Set<string>();
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
      const olvidado = await puente.consultar<{ transcripciones: number; quedan: number } | undefined>({ tipo: "memoria-olvidar", recuerdo: recuerdo.id });
      mostrarAviso(recuerdo.tipo === "conversacion" && olvidado ? avisoConversacionOlvidada(EN_MAC, olvidado.transcripciones, olvidado.quedan) : avisoOlvidado(EN_MAC));
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


// ---- Secciones plegables ----

/** Una sección con su cuenta, la etiqueta de cómo se borra (Papelera o definitivo) y su nota detrás de un ⓘ. */
function envolver(id: SeccionId, titulo: string, cuenta: string, nota: string | undefined, hijos: Node[]): HTMLElement {
  const detalle = crear("details", "seccion");
  detalle.dataset.seccion = id;
  detalle.open = buscado !== "" || abiertas.get(id) === true;
  const resumen = crear("summary");
  resumen.append(crear("span", undefined, titulo), crear("span", "cuenta", cuenta));
  const almacen = almacenamientoDe(id, EN_MAC);
  const etiqueta = crear("span", `etiqueta-borrado ${almacen}`, etiquetaAlmacenamiento(almacen));
  const contenido: Node[] = [];
  if (nota) {
    const parrafo = crear("p", "nota", nota);
    parrafo.hidden = true;
    const info = crear("button", "info", "ⓘ");
    info.type = "button";
    info.title = "Más sobre esto";
    info.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      parrafo.hidden = !parrafo.hidden;
    });
    resumen.append(info);
    contenido.push(parrafo);
  }
  resumen.append(etiqueta);
  detalle.addEventListener("toggle", () => {
    if (buscado === "") abiertas.set(id, detalle.open);
  });
  detalle.append(resumen, ...contenido, ...hijos);
  return detalle;
}

/** Una fila resumida con «Ver» que despliega el detalle (con sus botones de borrar finos) y su borrar de grupo aparte. */
function filaConDetalle(clave: string, tarjeta: HTMLElement, detalle: HTMLElement[], botonesGrupo: HTMLElement[]): void {
  const abierta = buscado !== "" || detallesAbiertos.has(clave);
  const cuerpo = crear("div", "detalle");
  cuerpo.append(...detalle);
  cuerpo.hidden = !abierta;
  const ver = crear("button", "boton", textoVer(abierta));
  ver.type = "button";
  ver.addEventListener("click", () => {
    cuerpo.hidden = !cuerpo.hidden;
    ver.textContent = textoVer(!cuerpo.hidden);
    if (cuerpo.hidden) detallesAbiertos.delete(clave);
    else detallesAbiertos.add(clave);
  });
  const botones = crear("div", "botones reparto");
  botones.append(ver, ...botonesGrupo);
  tarjeta.append(botones, cuerpo);
}

// ---- Brote recuerda ----

function pasaRecuerdo(r: Recuerdo): boolean {
  if (buscado === "") return true;
  return coincidencias ? coincidencias.has(r.id) : coincide(buscado, r.titulo, r.texto);
}

function seccionesBrote(m: Memoria): HTMLElement[] {
  const hechas: HTMLElement[] = [];
  for (const { tipo, seccion, titulo, nota, vacio } of SECCIONES) {
    const tarjetas =
      tipo === "frases"
        ? m.frases.filter((f) => coincide(buscado, f.ejemplo)).map(tarjetaFrase)
        : m.recuerdos.filter((r) => r.tipo === tipo && pasaRecuerdo(r)).map(tarjetaRecuerdo);
    if (buscado !== "" && tarjetas.length === 0) continue;
    hechas.push(envolver(seccion, titulo, String(tarjetas.length), nota, tarjetas.length > 0 ? tarjetas : [crear("p", "vacio", vacio)]));
  }
  return hechas;
}

// ---- Ramos (A1 de docs/plan-estudio-y-mejoras.md): ver, desarchivar y borrar ----

async function cargarRamos(): Promise<void> {
  try {
    ramosGuardados = await puente.consultar<Ramo[]>({ tipo: "ramos-todos" });
  } catch {
    ramosGuardados = null; // un puente más viejo no conoce el pedido: la sección no aparece
  }
}

function tarjetaRamo(r: Ramo): HTMLElement {
  const tarjeta = crear("article", `tarjeta ramo${r.archivado ? " archivado" : ""}`);
  tarjeta.style.setProperty("--ramo", HEX_RAMO[r.color]);
  const cabeza = crear("div", "tarjeta-cabeza");
  cabeza.append(crear("h3", undefined, r.nombre), crear("span", "fecha", r.archivado ? "Archivado" : ""));
  const meta = crear("p", "meta", r.alias.length > 0 ? `Palabras clave: ${r.alias.join(", ")}` : "Sin palabras clave");
  const botones = crear("div", "botones");
  if (r.archivado) {
    const volver = crear("button", "boton", "Desarchivar");
    volver.type = "button";
    volver.addEventListener("click", async () => {
      volver.disabled = true;
      try {
        await puente.consultar({ tipo: "ramo-archivar", ramo: r.id, archivado: false });
        await cargarRamos();
        pintarTodo();
      } catch (error) {
        volver.disabled = false;
        mostrarAviso(`No pude desarchivar: ${mensajeDe(error)}`, true);
      }
    });
    botones.append(volver);
  }
  botones.append(
    botonOlvidar(async () => {
      await puente.consultar({ tipo: "ramo-borrar", ramo: r.id });
      mostrarAviso(avisoRamoBorrado(r.nombre));
      await cargarRamos();
      pintarTodo();
    }, "Borrar"),
  );
  tarjeta.append(cabeza, meta, botones);
  return tarjeta;
}

function seccionRamos(lista: Ramo[]): HTMLElement | null {
  const filtrados = lista.filter((r) => coincide(buscado, r.nombre, ...r.alias));
  if (filtrados.length === 0) return null;
  return envolver("ramos", "Ramos", String(filtrados.length), NOTA_RAMOS, filtrados.map(tarjetaRamo));
}

// ---- Notas (A2): ver y borrar una evaluación, las de un ramo o todas ----

async function cargarNotas(): Promise<void> {
  try {
    notasGuardadas = await puente.consultar<{ ramos: Ramo[]; fichas: FichaNotas[] }>({ tipo: "notas-todas" });
  } catch {
    notasGuardadas = null; // un puente más viejo no conoce el pedido: la sección no aparece
  }
}

function tarjetaNotasRamo(ficha: FichaNotas, ramo: Ramo | undefined): HTMLElement {
  const nombre = ramo?.nombre ?? "Ramo";
  const tarjeta = crear("article", `tarjeta ramo resumen-fila${ramo?.archivado ? " archivado" : ""}`);
  if (ramo) tarjeta.style.setProperty("--ramo", HEX_RAMO[ramo.color]);
  const cabeza = crear("div", "tarjeta-cabeza");
  cabeza.append(crear("h3", undefined, nombre), crear("span", "fecha", ramo?.archivado ? "Archivado" : ""));
  tarjeta.append(cabeza, crear("p", "meta", `${plural(ficha.evaluaciones.length, "evaluación", "evaluaciones")} · ${resumenNotas(ficha)}`));
  const filas = ficha.evaluaciones.map((e) => {
    const fila = crear("div", "botones fila-nota");
    fila.append(crear("span", "meta", `${e.nombre} · ${e.peso} % · ${e.nota === null ? "pendiente" : formatearNota(e.nota)}`));
    fila.append(
      botonOlvidar(async () => {
        await puente.consultar({ tipo: "evaluacion-borrar", evaluacion: e.id });
        mostrarAviso(avisoNotasBorradas(nombre, 1));
        await cargarNotas();
        pintarTodo();
      }, "Borrar"),
    );
    return fila;
  });
  const borrarRamo = botonOlvidar(async () => {
    const { borradas } = await puente.consultar<{ borradas: number }>({ tipo: "notas-borrar", ramo: ficha.ramoId });
    mostrarAviso(avisoNotasBorradas(nombre, borradas));
    await cargarNotas();
    pintarTodo();
  }, "Borrar las de este ramo");
  filaConDetalle(`notas:${ficha.ramoId}`, tarjeta, filas, [borrarRamo]);
  return tarjeta;
}

function seccionNotas(datos: { ramos: Ramo[]; fichas: FichaNotas[] }): HTMLElement | null {
  const nombreDe = (f: FichaNotas) => datos.ramos.find((r) => r.id === f.ramoId);
  const fichas = datos.fichas.filter((f) => coincide(buscado, nombreDe(f)?.nombre, ...f.evaluaciones.map((e) => e.nombre)));
  if (fichas.length === 0) return null;
  const total = fichas.reduce((n, f) => n + f.evaluaciones.length, 0);
  const todo = crear("div", "botones");
  todo.append(
    botonOlvidar(async () => {
      const { borradas } = await puente.consultar<{ borradas: number }>({ tipo: "notas-borrar", ramo: null });
      mostrarAviso(avisoNotasBorradas(null, borradas));
      await cargarNotas();
      pintarTodo();
    }, "Borrar todas las notas"),
  );
  return envolver("notas", "Notas", String(total), NOTA_NOTAS_MEMORIA, [...fichas.map((f) => tarjetaNotasRamo(f, nombreDe(f))), todo]);
}

// ---- Repaso (A3): una fila por clase o documento; el detalle y el borrar fino bajo «Ver» ----

async function cargarRepaso(): Promise<void> {
  try {
    repasoGuardado = await puente.consultar({ tipo: "repaso-todo" });
  } catch {
    repasoGuardado = null; // un puente más viejo no conoce el pedido: la sección no aparece
  }
}

async function borrarRepaso(pedido: Record<string, unknown>): Promise<void> {
  const { borradas } = await puente.consultar<{ borradas: number }>({ tipo: "repaso-borrar", ...pedido });
  mostrarAviso(avisoRepasoBorrado(borradas));
  await cargarRepaso();
  pintarTodo();
}

function tituloDeClase(grabacion: string): string {
  const nombreDoc = grabacion.startsWith("doc-") ? (documentosGuardados?.find((d) => d.id === grabacion)?.nombre ?? "un documento que ya borraste") : null;
  return nombreDoc !== null ? `Documento «${nombreDoc}»` : `Clase del ${fechaDeClase(grabacion)}`;
}

function tarjetaRepasoClase(grabacion: string, datos: NonNullable<typeof repasoGuardado>): HTMLElement {
  const tarjetas = datos.tarjetas.filter((t) => t.grabacion === grabacion);
  const temas = datos.resumenes.filter((r) => r.grabacion === grabacion).flatMap((r) => r.temas);
  const ramoId = tarjetas[0]?.ramoId ?? datos.resumenes.find((r) => r.grabacion === grabacion)?.ramoId ?? null;
  const ramo = datos.ramos.find((r) => r.id === ramoId);
  const tarjeta = crear("article", `tarjeta ramo resumen-fila${ramo?.archivado ? " archivado" : ""}`);
  if (ramo) tarjeta.style.setProperty("--ramo", HEX_RAMO[ramo.color]);
  const cabeza = crear("div", "tarjeta-cabeza");
  cabeza.append(crear("h3", undefined, tituloDeClase(grabacion)), crear("span", "fecha", ramo ? ramo.nombre : "Sin ramo"));
  tarjeta.append(cabeza, crear("p", "meta", resumenDeClase(tarjetas.length, temas.length)));
  const detalle: HTMLElement[] = [];
  for (const t of tarjetas) {
    const fila = crear("div", "botones fila-nota");
    fila.append(crear("span", "meta", `${t.frente} · ${estadoDeTarjeta(t, Date.now())}`));
    fila.append(botonOlvidar(() => borrarRepaso({ que: "tarjeta", tarjeta: t.id }), "Borrar"));
    detalle.push(fila);
  }
  for (const t of temas) detalle.push(crear("p", "meta", `Tema: ${t.titulo}`));
  filaConDetalle(`repaso:${grabacion}`, tarjeta, detalle, [botonOlvidar(() => borrarRepaso({ que: "grabacion", grabacion }), "Borrar lo de esta clase")]);
  return tarjeta;
}

function seccionRepaso(datos: NonNullable<typeof repasoGuardado>): HTMLElement | null {
  const todas = [...new Set([...datos.tarjetas.map((t) => t.grabacion), ...datos.resumenes.map((r) => r.grabacion)])].sort().reverse();
  const nombreRamo = (g: string) => {
    const id = datos.tarjetas.find((t) => t.grabacion === g)?.ramoId ?? datos.resumenes.find((r) => r.grabacion === g)?.ramoId ?? null;
    return datos.ramos.find((r) => r.id === id)?.nombre;
  };
  const clases = todas.filter((g) => coincide(buscado, tituloDeClase(g), nombreRamo(g), ...datos.tarjetas.filter((t) => t.grabacion === g).map((t) => t.frente)));
  if (clases.length === 0) return null;
  const cuantas = datos.tarjetas.filter((t) => clases.includes(t.grabacion)).length;
  const botones = crear("div", "botones reparto");
  if (buscado === "") {
    const ramosConRepaso = datos.ramos.filter((r) => datos.tarjetas.some((t) => t.ramoId === r.id) || datos.resumenes.some((x) => x.ramoId === r.id));
    for (const r of ramosConRepaso) botones.append(botonOlvidar(() => borrarRepaso({ que: "ramo", ramo: r.id }), `Borrar el repaso de ${r.nombre}`));
    botones.append(botonOlvidar(() => borrarRepaso({ que: "todo" }), "Borrar todo el repaso"));
  }
  return envolver("repaso", "Repaso", String(cuantas), NOTA_REPASO_MEMORIA, [...clases.map((g) => tarjetaRepasoClase(g, datos)), botones]);
}

// ---- Plan de estudio (A4): ver y borrar un plan, los de un ramo o todos ----

async function cargarPlanes(): Promise<void> {
  try {
    planesGuardados = await puente.consultar({ tipo: "plan-estudio-todo" });
  } catch {
    planesGuardados = null; // un puente más viejo no conoce el pedido: la sección no aparece
  }
}

async function borrarPlanes(pedido: Record<string, unknown>): Promise<void> {
  const { borrados } = await puente.consultar<{ borrados: number }>({ tipo: "plan-estudio-borrar", ...pedido });
  mostrarAviso(avisoPlanBorrado(borrados));
  await cargarPlanes();
  pintarTodo();
}

function seccionPlanes(datos: NonNullable<typeof planesGuardados>): HTMLElement | null {
  const planes = datos.planes.filter((p) => coincide(buscado, datos.evaluaciones[p.evaluacionId], datos.ramos.find((r) => r.id === p.ramoId)?.nombre));
  if (planes.length === 0) return null;
  const hijos: HTMLElement[] = [];
  for (const plan of planes) {
    const ramo = datos.ramos.find((r) => r.id === plan.ramoId);
    const tarjeta = crear("article", `tarjeta ramo${ramo?.archivado ? " archivado" : ""}`);
    if (ramo) tarjeta.style.setProperty("--ramo", HEX_RAMO[ramo.color]);
    const cabeza = crear("div", "tarjeta-cabeza");
    cabeza.append(crear("h3", undefined, `${datos.evaluaciones[plan.evaluacionId] ?? "Prueba"} · ${describirPruebaPlan(plan.pruebaMs, true)}`), crear("span", "fecha", ramo ? ramo.nombre : "Sin ramo"));
    tarjeta.append(cabeza, crear("p", "meta", resumenPlan(plan, Date.now())));
    if (plan.calendario) tarjeta.append(crear("p", "meta", "Copiado a tu calendario: ahí se borra a mano."));
    const botones = crear("div", "botones");
    botones.append(botonOlvidar(() => borrarPlanes({ que: "plan", plan: plan.id }), "Borrar este plan"));
    tarjeta.append(botones);
    hijos.push(tarjeta);
  }
  if (buscado === "") {
    const botones = crear("div", "botones reparto");
    const ramosConPlan = datos.ramos.filter((r) => datos.planes.some((p) => p.ramoId === r.id));
    for (const r of ramosConPlan) botones.append(botonOlvidar(() => borrarPlanes({ que: "ramo", ramo: r.id }), `Borrar los planes de ${r.nombre}`));
    botones.append(botonOlvidar(() => borrarPlanes({ que: "todo" }), "Borrar todos los planes"));
    hijos.push(botones);
  }
  return envolver("planes", "Plan de estudio", String(planes.length), NOTA_PLAN_MEMORIA, hijos);
}

// ---- Estadísticas de estudio (A5): ver y borrar el tiempo de un ramo o todo ----

async function cargarEstadisticas(): Promise<void> {
  try {
    estudioGuardado = await puente.consultar({ tipo: "estadisticas-todo" });
  } catch {
    estudioGuardado = null; // un puente más viejo no conoce el pedido: la sección no aparece
  }
}

async function borrarEstadisticas(pedido: Record<string, unknown>): Promise<void> {
  const { borrados } = await puente.consultar<{ borrados: number }>({ tipo: "estadisticas-borrar", ...pedido });
  mostrarAviso(avisoEstadisticasBorradas(borrados));
  await cargarEstadisticas();
  pintarTodo();
}

function seccionEstadisticas(datos: NonNullable<typeof estudioGuardado>): HTMLElement | null {
  const { resumen } = datos;
  const totales = [...resumen.totales]
    .sort((a, b) => b.totalMin - a.totalMin)
    .filter((t) => coincide(buscado, datos.ramos.find((r) => r.id === t.ramoId)?.nombre ?? "Sin ramo"));
  if (totales.length === 0) return null;
  const hijos: HTMLElement[] = [];
  const desde = textoDesde(resumen.desdeMs);
  if (desde) hijos.push(crear("p", "meta", desde));
  for (const total of totales) {
    const ramo = total.ramoId === null ? undefined : datos.ramos.find((r) => r.id === total.ramoId);
    const tarjeta = crear("article", `tarjeta ramo${ramo?.archivado ? " archivado" : ""}`);
    if (ramo) tarjeta.style.setProperty("--ramo", HEX_RAMO[ramo.color]);
    const cabeza = crear("div", "tarjeta-cabeza");
    cabeza.append(crear("h3", undefined, ramo ? ramo.nombre : "Sin ramo"), crear("span", "fecha", ramo?.archivado ? "Archivado" : ""));
    tarjeta.append(cabeza, crear("p", "meta", lineaDeRamo(total) ?? ""));
    const botones = crear("div", "botones");
    botones.append(botonOlvidar(() => borrarEstadisticas({ que: "ramo", ramo: total.ramoId }), ramo ? `Borrar el tiempo de ${ramo.nombre}` : "Borrar el tiempo sin ramo"));
    tarjeta.append(botones);
    hijos.push(tarjeta);
  }
  if (buscado === "") {
    const todo = crear("div", "botones");
    todo.append(botonOlvidar(() => borrarEstadisticas({ que: "todo" }), "Borrar todo el tiempo de estudio"));
    hijos.push(todo);
  }
  return envolver("estadisticas", "Estadísticas de estudio", formatearMinutos(resumen.totalHistoricoMin), NOTA_ESTADISTICAS_MEMORIA, hijos);
}

// ---- Metas de ahorro: ver y borrar una meta (con sus aportes) o todas ----

async function cargarAhorro(): Promise<void> {
  try {
    ahorroGuardado = await puente.consultar({ tipo: "ahorro-todo" });
  } catch {
    ahorroGuardado = null; // un puente más viejo no conoce el pedido: la sección no aparece
  }
}

async function borrarAhorro(meta: number | null): Promise<void> {
  const { borrados } = await puente.consultar<{ borrados: number }>({ tipo: "ahorro-borrar", meta });
  mostrarAviso(avisoAhorroBorrado(borrados));
  await cargarAhorro();
  pintarTodo();
}

function seccionAhorro(datos: NonNullable<typeof ahorroGuardado>): HTMLElement | null {
  const metas = datos.metas.filter((m) => coincide(buscado, m.nombre));
  if (metas.length === 0) return null;
  const hijos: HTMLElement[] = [];
  for (const meta of metas) {
    const tarjeta = crear("article", `tarjeta ramo${meta.estado === "archivada" ? " archivado" : ""}`);
    const cabeza = crear("div", "tarjeta-cabeza");
    cabeza.append(crear("h3", undefined, meta.nombre), crear("span", "fecha", meta.estado === "archivada" ? "Archivada" : ""));
    tarjeta.append(cabeza, crear("p", "meta", lineaDeMetaGuardada(meta, datos.aportes)));
    const botones = crear("div", "botones");
    botones.append(botonOlvidar(() => borrarAhorro(meta.id), `Borrar la meta «${meta.nombre}»`));
    tarjeta.append(botones);
    hijos.push(tarjeta);
  }
  if (buscado === "") {
    const todo = crear("div", "botones");
    todo.append(botonOlvidar(() => borrarAhorro(null), "Borrar todas las metas de ahorro"));
    hijos.push(todo);
  }
  return envolver("ahorro", "Metas de ahorro", String(metas.length), NOTA_AHORRO_MEMORIA, hijos);
}

// ---- Documentos (D): lo que Brote leyó de los archivos del usuario; solo su texto, nunca el original ----

async function borrarDocumentos(que: "documento" | "todo", id: string | null): Promise<void> {
  const { borrados } = await puente.consultar<{ borrados: number }>({ tipo: "documento-borrar", que, ...(id ? { documento: id } : {}) });
  mostrarAviso(avisoDocumentoBorrado(EN_MAC, borrados));
  await cargarDocumentos();
  pintarTodo();
}

function tarjetaDocumento(d: DocumentoVista): HTMLElement {
  const ramo = ramosGuardados?.find((r) => r.id === d.ramoId);
  const tarjeta = crear("article", "tarjeta grabacion documento");
  if (ramo) tarjeta.style.setProperty("--ramo", HEX_RAMO[ramo.color]);
  const cabeza = crear("div", "tarjeta-cabeza");
  cabeza.append(crear("h3", undefined, d.nombre), crear("span", "fecha", ramo ? ramo.nombre : "Sin ramo"));
  const botones = crear("div", "botones");
  botones.append(botonOlvidar(() => borrarDocumentos("documento", d.id), "Borrar"));
  tarjeta.append(cabeza, crear("p", "meta", describirDocumento(d)), botones);
  return tarjeta;
}

const NOTA_DOCUMENTOS =
  "Los PDF, Word, PowerPoint y textos que le diste a Brote para que los lea. Guarda solo el texto que sacó (tu archivo original no se toca) y solo lo usa cuando tú se lo pides. Las tarjetas que ya aceptaste de un documento se quedan: se borran en «Repaso».";

async function cargarDocumentos(): Promise<void> {
  try {
    documentosGuardados = await puente.consultar<DocumentoVista[]>({ tipo: "documentos-estado" });
  } catch {
    documentosGuardados = null; // un puente más viejo no conoce el pedido: la sección no aparece
  }
}

function seccionDocumentos(lista: DocumentoVista[]): HTMLElement | null {
  const docs = lista.filter((d) => coincide(buscado, d.nombre, ramosGuardados?.find((r) => r.id === d.ramoId)?.nombre));
  if (docs.length === 0) return null;
  const hijos: HTMLElement[] = docs.map(tarjetaDocumento);
  if (buscado === "") {
    const fila = crear("div", "botones");
    fila.append(botonOlvidar(() => borrarDocumentos("todo", null), "Borrar todo", confirmarBorrarTodosDocumentos(lista.length)));
    hijos.push(fila);
  }
  return envolver("documentos", "Documentos", String(docs.length), NOTA_DOCUMENTOS, hijos);
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

const NOTA_GRABACIONES = "Lo que grabaste y transcribiste en este computador. Brote solo lo usa cuando tú se lo pides; el audio no sale de tu equipo.";

function seccionTranscripciones(g: Grabaciones): HTMLElement | null {
  const lista = g.transcripciones.filter((t) => coincide(buscado, textoFecha(t.fecha, t.id), t.modelo));
  if (lista.length === 0) return null;
  const hijos: HTMLElement[] = lista.map(tarjetaTranscripcion);
  if (buscado === "") {
    const fila = crear("div", "botones");
    fila.append(botonOlvidar(() => borrarGrabaciones("transcripcion", null), "Borrar todo", confirmarBorrarTodo("transcripcion", lista.length)));
    hijos.push(fila);
  }
  return envolver("transcripciones", "Transcripciones", String(lista.length), NOTA_GRABACIONES, hijos);
}

function seccionAudios(g: Grabaciones): HTMLElement | null {
  const lista = g.audios.filter((a) => coincide(buscado, textoFecha(a.fecha, a.id)));
  if (lista.length === 0) return null;
  const hijos: HTMLElement[] = lista.map(tarjetaAudio);
  if (buscado === "") {
    const fila = crear("div", "botones");
    fila.append(botonOlvidar(() => borrarGrabaciones("audio", null), "Borrar todo", confirmarBorrarTodo("audio", lista.length)));
    hijos.push(fila);
  }
  return envolver("audios", "Audios", String(lista.length), `Se borran solos a los ${g.diasAudio} días (lo eliges en Configurar Brote). ${NOTA_GRABACIONES}`, hijos);
}

// ---- Pintar: Resumen, un grupo o los resultados de una búsqueda ----

function conteos(): Conteos {
  const recuerdos = (tipo: TipoRecuerdo) => memoria?.recuerdos.filter((r) => r.tipo === tipo).length ?? 0;
  const repaso = repasoGuardado;
  return {
    brote: recuerdos("brote"),
    frases: memoria?.frases.length ?? 0,
    conversacion: recuerdos("conversacion"),
    importado: recuerdos("importado"),
    ramos: ramosGuardados?.length ?? 0,
    notas: notasGuardadas?.fichas.reduce((n, f) => n + f.evaluaciones.length, 0) ?? 0,
    repaso: repaso ? (repaso.tarjetas.length > 0 ? repaso.tarjetas.length : repaso.resumenes.length) : 0,
    planes: planesGuardados?.planes.length ?? 0,
    estadisticas: estudioGuardado?.resumen.hay ? formatearMinutos(estudioGuardado.resumen.totalHistoricoMin) : null,
    documentos: documentosGuardados?.length ?? 0,
    ahorro: ahorroGuardado?.metas.length ?? 0,
    transcripciones: grabaciones?.transcripciones.length ?? 0,
    audios: grabaciones?.audios.length ?? 0,
  };
}

function pintarTodo(): void {
  pintar();
}

/** Las secciones de un grupo con lo que haya guardado; solo las que tienen algo (menos en «Brote recuerda»). */
function seccionesDeGrupo(grupo: GrupoConDatos): HTMLElement[] {
  const nulas: (HTMLElement | null)[] = [];
  switch (grupo) {
    case "brote":
      return memoria ? seccionesBrote(memoria) : [];
    case "estudio":
      if (ramosGuardados) nulas.push(seccionRamos(ramosGuardados));
      if (notasGuardadas) nulas.push(seccionNotas(notasGuardadas));
      if (repasoGuardado && (repasoGuardado.tarjetas.length > 0 || repasoGuardado.resumenes.length > 0)) nulas.push(seccionRepaso(repasoGuardado));
      if (planesGuardados) nulas.push(seccionPlanes(planesGuardados));
      if (estudioGuardado?.resumen.hay) nulas.push(seccionEstadisticas(estudioGuardado));
      if (documentosGuardados) nulas.push(seccionDocumentos(documentosGuardados));
      break;
    case "plata":
      if (ahorroGuardado) nulas.push(seccionAhorro(ahorroGuardado));
      break;
    case "grabaciones":
      if (grabaciones) nulas.push(seccionTranscripciones(grabaciones), seccionAudios(grabaciones));
      break;
  }
  return nulas.filter((s): s is HTMLElement => s !== null);
}

function pintarNav(): void {
  const c = conteos();
  const botones = GRUPOS.map(({ id, titulo, icono }) => {
    const boton = crear("button");
    boton.type = "button";
    boton.dataset.grupo = id;
    boton.classList.toggle("activo", buscado === "" && grupoActual === id);
    boton.append(crear("span", undefined, `${icono} ${titulo}`));
    if (id !== "resumen") boton.append(crear("span", "cuenta", String(totalDeGrupo(id, c))));
    boton.addEventListener("click", () => {
      grupoActual = id;
      if (filtro !== "") {
        buscar.value = filtro = "";
        void filtrar();
      } else {
        pintar();
      }
    });
    return boton;
  });
  nav.replaceChildren(...botones);
}

function pintarResumen(): HTMLElement[] {
  const c = conteos();
  const tarjetas = GRUPOS.filter((g): g is (typeof GRUPOS)[number] & { id: GrupoConDatos } => g.id !== "resumen").map(({ id, titulo, icono }) => {
    const boton = crear("button", "tarjeta-grupo");
    boton.type = "button";
    boton.append(crear("h3", undefined, `${icono} ${titulo}`), crear("p", undefined, lineaDeGrupo(id, c)));
    boton.addEventListener("click", () => {
      grupoActual = id;
      pintar();
    });
    return boton;
  });
  const pie = crear("div", "resumen-pie");
  const nueva = crear("button", "boton", "Empezar conversación nueva");
  nueva.type = "button";
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
  pie.append(crear("p", undefined, "Si olvidaste algo, empieza una conversación nueva para que Brote deje de usarlo ya."), nueva);
  return [...tarjetas, pie];
}

function pintarGrupo(grupo: GrupoConDatos): HTMLElement[] {
  const hechas = seccionesDeGrupo(grupo);
  if (hechas.length === 0) return [crear("p", "vacio", textoVacioDeGrupo(grupo))];
  // La primera sección del grupo se abre sola si el usuario todavía no tocó ninguna.
  if (!SECCIONES_DE[grupo].some((s) => abiertas.has(s))) {
    const primera = hechas[0] as HTMLDetailsElement;
    primera.open = true;
    abiertas.set(primera.dataset.seccion!, true);
  }
  const pie = crear("div", "pie-grupo");
  for (const tipo of almacenamientosDeGrupo(grupo, EN_MAC)) pie.append(crear("p", undefined, explicacionAlmacenamiento(tipo)));
  return [...hechas, pie];
}

/** Con una búsqueda: todas las secciones de todos los grupos, solo con lo que coincide. */
function pintarBusqueda(): HTMLElement[] {
  const hechas = (Object.keys(SECCIONES_DE) as GrupoConDatos[]).flatMap(seccionesDeGrupo);
  return hechas.length > 0 ? hechas : [crear("p", "vacio", "Nada coincide con lo que buscas.")];
}

function pintar(): void {
  if (!memoria) return;
  buscado = textoBuscado(filtro);
  sinIA.textContent = `⚡ ${memoria.sinIA}% sin IA`;
  sinIA.title = "De todo lo que le has pedido, cuánto resolvió el motor sin usar IA";
  sinIA.hidden = false;
  pintarNav();
  const y = secciones.scrollTop;
  secciones.replaceChildren(...(buscado !== "" ? pintarBusqueda() : grupoActual === "resumen" ? pintarResumen() : pintarGrupo(grupoActual)));
  secciones.scrollTop = y;
}

async function cargar(): Promise<void> {
  try {
    memoria = await puente.consultar<Memoria>({ tipo: "memoria-listar" });
    await cargarGrabaciones();
    await cargarDocumentos();
    await cargarRamos();
    await cargarNotas();
    await cargarRepaso();
    await cargarPlanes();
    await cargarEstadisticas();
    await cargarAhorro();
    await filtrar();
  } catch (error) {
    mostrarAviso(`No pude leer la memoria: ${mensajeDe(error)}`, true);
  }
}

async function cargarGrabaciones(): Promise<void> {
  try {
    grabaciones = await puente.consultar<Grabaciones>({ tipo: "grabaciones-listar" });
  } catch {
    grabaciones = null; // un puente más viejo no conoce el pedido: la sección no aparece
  }
}

/** Aplica la búsqueda: muestra solo lo que coincide y, para los recuerdos, ofrece olvidar el tema entero. */
async function filtrar(): Promise<void> {
  const texto = filtro.trim();
  coincidencias = null;
  if (buscaEnElPuente(texto)) {
    try {
      coincidencias = new Set(await puente.consultar<string[]>({ tipo: "memoria-buscar", tema: texto }));
    } catch (error) {
      mostrarAviso(`No pude buscar: ${mensajeDe(error)}`, true);
    }
  }
  pintar();

  const frases = memoria?.frases.filter((f) => simplificar(f.ejemplo).includes(simplificar(texto))).length ?? 0;
  const total = (coincidencias?.size ?? 0) + (coincidencias ? frases : 0);
  tema.hidden = !coincidencias;
  if (!coincidencias) return;
  temaTexto.textContent =
    total === 0
      ? `Ningún recuerdo menciona «${texto}».`
      : `«${texto}» aparece en ${total} ${total === 1 ? "recuerdo" : "recuerdos"} de Brote (recuerdos, frases, conversaciones e importados; lo demás se borra desde su sección).`;
  temaOlvidar.hidden = total === 0;
  temaOlvidar.textContent = `Olvidar todo sobre «${texto}»`;
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
  const texto = filtro.trim();
  if (!temaOlvidar.classList.contains("confirmando")) {
    temaOlvidar.classList.add("confirmando");
    temaOlvidar.textContent = "¿Seguro? Se olvida todo y empieza una conversación nueva";
    plazoTema = setTimeout(() => void filtrar(), CONFIRMACION_MS);
    return;
  }
  clearTimeout(plazoTema);
  temaOlvidar.disabled = true;
  try {
    const { olvidados } = await puente.consultar<{ olvidados: number }>({ tipo: "memoria-olvidar-tema", tema: texto });
    mostrarAviso(avisoTemaOlvidado(EN_MAC, olvidados, texto));
    buscar.value = filtro = "";
    await cargar();
  } catch (error) {
    temaOlvidar.disabled = false;
    mostrarAviso(`No pude olvidar «${texto}»: ${mensajeDe(error)}`, true);
  }
});

document.querySelector("#configurar")!.addEventListener("click", () => void invoke("abrir_configuracion"));

// Al volver a la ventana se recarga, por si Brote aprendió o recordó algo mientras tanto.
window.addEventListener("focus", () => void cargar());

void puente.iniciar().then(cargar, (error) => mostrarAviso(`No pude conectar con el puente: ${mensajeDe(error)}`, true));
