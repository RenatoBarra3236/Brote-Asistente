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
import { avisoDocumentoBorrado, confirmarBorrarTodosDocumentos, pieDocumentos, avisoGrabacionBorrada, avisoOlvidado, avisoTemaOlvidado, confirmarBorrarTodo, pieGrabaciones, pieOlvidar, type QueGrabacion } from "./agente/papelera";
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

function seccionRamos(lista: Ramo[]): HTMLElement {
  const seccion = crear("section", "seccion seccion-ramos");
  const encabezado = crear("h2", undefined, "Ramos");
  encabezado.append(crear("span", "cuenta", String(lista.length)));
  seccion.append(encabezado, crear("p", "nota", NOTA_RAMOS));
  seccion.append(...(lista.length > 0 ? lista.map(tarjetaRamo) : [crear("p", "vacio", "No tienes ramos guardados.")]));
  return seccion;
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
  const tarjeta = crear("article", `tarjeta ramo${ramo?.archivado ? " archivado" : ""}`);
  if (ramo) tarjeta.style.setProperty("--ramo", HEX_RAMO[ramo.color]);
  const cabeza = crear("div", "tarjeta-cabeza");
  cabeza.append(crear("h3", undefined, nombre), crear("span", "fecha", ramo?.archivado ? "Archivado" : ""));
  tarjeta.append(cabeza, crear("p", "meta", resumenNotas(ficha)));
  for (const e of ficha.evaluaciones) {
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
    tarjeta.append(fila);
  }
  const botones = crear("div", "botones");
  botones.append(
    botonOlvidar(async () => {
      const { borradas } = await puente.consultar<{ borradas: number }>({ tipo: "notas-borrar", ramo: ficha.ramoId });
      mostrarAviso(avisoNotasBorradas(nombre, borradas));
      await cargarNotas();
      pintarTodo();
    }, "Borrar las de este ramo"),
  );
  tarjeta.append(botones);
  return tarjeta;
}

function seccionNotas(datos: { ramos: Ramo[]; fichas: FichaNotas[] }): HTMLElement {
  const seccion = crear("section", "seccion seccion-ramos");
  const total = datos.fichas.reduce((n, f) => n + f.evaluaciones.length, 0);
  const encabezado = crear("h2", undefined, "Notas");
  encabezado.append(crear("span", "cuenta", String(total)));
  seccion.append(encabezado, crear("p", "nota", NOTA_NOTAS_MEMORIA));
  seccion.append(...datos.fichas.map((f) => tarjetaNotasRamo(f, datos.ramos.find((r) => r.id === f.ramoId))));
  const todo = crear("div", "botones");
  todo.append(
    botonOlvidar(async () => {
      const { borradas } = await puente.consultar<{ borradas: number }>({ tipo: "notas-borrar", ramo: null });
      mostrarAviso(avisoNotasBorradas(null, borradas));
      await cargarNotas();
      pintarTodo();
    }, "Borrar todas las notas"),
  );
  seccion.append(todo);
  return seccion;
}

// ---- Repaso (A3): ver y borrar tarjetas, lo de una clase, lo de un ramo o todo ----

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

function tarjetaRepasoClase(grabacion: string, datos: NonNullable<typeof repasoGuardado>): HTMLElement {
  const tarjetas = datos.tarjetas.filter((t) => t.grabacion === grabacion);
  const temas = datos.resumenes.filter((r) => r.grabacion === grabacion).flatMap((r) => r.temas);
  const ramoId = tarjetas[0]?.ramoId ?? datos.resumenes.find((r) => r.grabacion === grabacion)?.ramoId ?? null;
  const ramo = datos.ramos.find((r) => r.id === ramoId);
  const tarjeta = crear("article", `tarjeta ramo${ramo?.archivado ? " archivado" : ""}`);
  if (ramo) tarjeta.style.setProperty("--ramo", HEX_RAMO[ramo.color]);
  const cabeza = crear("div", "tarjeta-cabeza");
  const nombreDoc = grabacion.startsWith("doc-") ? (documentosGuardados?.find((d) => d.id === grabacion)?.nombre ?? "un documento que ya borraste") : null;
  cabeza.append(crear("h3", undefined, nombreDoc !== null ? `Documento «${nombreDoc}»` : `Clase del ${fechaDeClase(grabacion)}`), crear("span", "fecha", ramo ? ramo.nombre : "Sin ramo"));
  tarjeta.append(cabeza, crear("p", "meta", `${tarjetas.length} tarjeta${tarjetas.length === 1 ? "" : "s"} · ${temas.length} tema${temas.length === 1 ? "" : "s"}`));
  for (const t of tarjetas) {
    const fila = crear("div", "botones fila-nota");
    fila.append(crear("span", "meta", `${t.frente} · ${estadoDeTarjeta(t, Date.now())}`));
    fila.append(botonOlvidar(() => borrarRepaso({ que: "tarjeta", tarjeta: t.id }), "Borrar"));
    tarjeta.append(fila);
  }
  for (const t of temas) tarjeta.append(crear("p", "meta", `Tema: ${t.titulo}`));
  const botones = crear("div", "botones");
  botones.append(botonOlvidar(() => borrarRepaso({ que: "grabacion", grabacion }), "Borrar lo de esta clase"));
  tarjeta.append(botones);
  return tarjeta;
}

function seccionRepaso(datos: NonNullable<typeof repasoGuardado>): HTMLElement {
  const seccion = crear("section", "seccion seccion-ramos");
  const clases = [...new Set([...datos.tarjetas.map((t) => t.grabacion), ...datos.resumenes.map((r) => r.grabacion)])].sort().reverse();
  const encabezado = crear("h2", undefined, "Repaso");
  encabezado.append(crear("span", "cuenta", String(datos.tarjetas.length)));
  seccion.append(encabezado, crear("p", "nota", NOTA_REPASO_MEMORIA));
  seccion.append(...clases.map((g) => tarjetaRepasoClase(g, datos)));
  const botones = crear("div", "botones");
  const ramosConRepaso = datos.ramos.filter((r) => datos.tarjetas.some((t) => t.ramoId === r.id) || datos.resumenes.some((x) => x.ramoId === r.id));
  for (const r of ramosConRepaso) botones.append(botonOlvidar(() => borrarRepaso({ que: "ramo", ramo: r.id }), `Borrar el repaso de ${r.nombre}`));
  botones.append(botonOlvidar(() => borrarRepaso({ que: "todo" }), "Borrar todo el repaso"));
  seccion.append(botones);
  return seccion;
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

function seccionPlanes(datos: NonNullable<typeof planesGuardados>): HTMLElement {
  const seccion = crear("section", "seccion seccion-ramos");
  const encabezado = crear("h2", undefined, "Plan de estudio");
  encabezado.append(crear("span", "cuenta", String(datos.planes.length)));
  seccion.append(encabezado, crear("p", "nota", NOTA_PLAN_MEMORIA));
  for (const plan of datos.planes) {
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
    seccion.append(tarjeta);
  }
  const botones = crear("div", "botones");
  const ramosConPlan = datos.ramos.filter((r) => datos.planes.some((p) => p.ramoId === r.id));
  for (const r of ramosConPlan) botones.append(botonOlvidar(() => borrarPlanes({ que: "ramo", ramo: r.id }), `Borrar los planes de ${r.nombre}`));
  botones.append(botonOlvidar(() => borrarPlanes({ que: "todo" }), "Borrar todos los planes"));
  seccion.append(botones);
  return seccion;
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

function seccionEstadisticas(datos: NonNullable<typeof estudioGuardado>): HTMLElement {
  const { resumen } = datos;
  const seccion = crear("section", "seccion seccion-ramos");
  const encabezado = crear("h2", undefined, "Estadísticas de estudio");
  encabezado.append(crear("span", "cuenta", formatearMinutos(resumen.totalHistoricoMin)));
  seccion.append(encabezado, crear("p", "nota", NOTA_ESTADISTICAS_MEMORIA));
  const desde = textoDesde(resumen.desdeMs);
  if (desde) seccion.append(crear("p", "meta", desde));
  for (const total of [...resumen.totales].sort((a, b) => b.totalMin - a.totalMin)) {
    const ramo = total.ramoId === null ? undefined : datos.ramos.find((r) => r.id === total.ramoId);
    const tarjeta = crear("article", `tarjeta ramo${ramo?.archivado ? " archivado" : ""}`);
    if (ramo) tarjeta.style.setProperty("--ramo", HEX_RAMO[ramo.color]);
    const cabeza = crear("div", "tarjeta-cabeza");
    cabeza.append(crear("h3", undefined, ramo ? ramo.nombre : "Sin ramo"), crear("span", "fecha", ramo?.archivado ? "Archivado" : ""));
    tarjeta.append(cabeza, crear("p", "meta", lineaDeRamo(total) ?? ""));
    const botones = crear("div", "botones");
    botones.append(botonOlvidar(() => borrarEstadisticas({ que: "ramo", ramo: total.ramoId }), ramo ? `Borrar el tiempo de ${ramo.nombre}` : "Borrar el tiempo sin ramo"));
    tarjeta.append(botones);
    seccion.append(tarjeta);
  }
  const todo = crear("div", "botones");
  todo.append(botonOlvidar(() => borrarEstadisticas({ que: "todo" }), "Borrar todo el tiempo de estudio"));
  seccion.append(todo);
  return seccion;
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

function seccionAhorro(datos: NonNullable<typeof ahorroGuardado>): HTMLElement {
  const seccion = crear("section", "seccion seccion-ramos");
  const encabezado = crear("h2", undefined, "Metas de ahorro");
  encabezado.append(crear("span", "cuenta", String(datos.metas.length)));
  seccion.append(encabezado, crear("p", "nota", NOTA_AHORRO_MEMORIA));
  for (const meta of datos.metas) {
    const tarjeta = crear("article", `tarjeta ramo${meta.estado === "archivada" ? " archivado" : ""}`);
    const cabeza = crear("div", "tarjeta-cabeza");
    cabeza.append(crear("h3", undefined, meta.nombre), crear("span", "fecha", meta.estado === "archivada" ? "Archivada" : ""));
    tarjeta.append(cabeza, crear("p", "meta", lineaDeMetaGuardada(meta, datos.aportes)));
    const botones = crear("div", "botones");
    botones.append(botonOlvidar(() => borrarAhorro(meta.id), `Borrar la meta «${meta.nombre}»`));
    tarjeta.append(botones);
    seccion.append(tarjeta);
  }
  const todo = crear("div", "botones");
  todo.append(botonOlvidar(() => borrarAhorro(null), "Borrar todas las metas de ahorro"));
  seccion.append(todo);
  return seccion;
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

function seccionDocumentos(lista: DocumentoVista[]): HTMLElement {
  const seccion = crear("section", "seccion seccion-documentos");
  const encabezado = crear("h2", undefined, "Documentos");
  encabezado.append(crear("span", "cuenta", String(lista.length)));
  seccion.append(
    encabezado,
    crear("p", "nota", "Los PDF, Word, PowerPoint y textos que le diste a Brote para que los lea. Guarda solo el texto que sacó, y solo lo usa cuando tú se lo pides."),
    ...lista.map(tarjetaDocumento),
  );
  const fila = crear("div", "botones");
  fila.append(botonOlvidar(() => borrarDocumentos("todo", null), "Borrar todo", confirmarBorrarTodosDocumentos(lista.length)));
  seccion.append(fila, crear("p", "nota", pieDocumentos(EN_MAC)));
  return seccion;
}

async function cargarDocumentos(): Promise<void> {
  try {
    documentosGuardados = await puente.consultar<DocumentoVista[]>({ tipo: "documentos-estado" });
  } catch {
    documentosGuardados = null; // un puente más viejo no conoce el pedido: la sección no aparece
  }
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
  if (ramosGuardados && ramosGuardados.length > 0 && !coincidencias) contenido.push(seccionRamos(ramosGuardados));
  if (notasGuardadas && notasGuardadas.fichas.length > 0 && !coincidencias) contenido.push(seccionNotas(notasGuardadas));
  if (repasoGuardado && (repasoGuardado.tarjetas.length > 0 || repasoGuardado.resumenes.length > 0) && !coincidencias) contenido.push(seccionRepaso(repasoGuardado));
  if (planesGuardados && planesGuardados.planes.length > 0 && !coincidencias) contenido.push(seccionPlanes(planesGuardados));
  if (estudioGuardado && estudioGuardado.resumen.hay && !coincidencias) contenido.push(seccionEstadisticas(estudioGuardado));
  if (ahorroGuardado && ahorroGuardado.metas.length > 0 && !coincidencias) contenido.push(seccionAhorro(ahorroGuardado));
  if (grabaciones && !coincidencias) contenido.push(seccionGrabaciones(grabaciones));
  if (documentosGuardados && documentosGuardados.length > 0 && !coincidencias) contenido.push(seccionDocumentos(documentosGuardados));
  secciones.replaceChildren(...contenido);
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
