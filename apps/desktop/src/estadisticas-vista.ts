// La tarjeta «Esta semana» de la pestaña Estudio (A5): total, diferencia con la semana pasada, racha, siete
// barras de lunes a domingo y barras por ramo. Armada solo con números; los textos y reglas, en
// `agente/estadisticas.ts` (con pruebas). Sin datos, una línea que invita a empezar.

import { HEX_RAMO } from "./agente/estudio";
import type { Ramo } from "./agente/estudio";
import {
  LETRAS_DIAS,
  TEXTO_SIN_DATOS,
  barrasPorRamo,
  columnasDias,
  columnasSemanas,
  textoDeMeta,
  formatearMinutos,
  lineaDeRamo,
  lineaMini,
  promedioSemanal,
  serieDeRamo,
  textoDesde,
  textoDiferencia,
  textoPromedio,
  textoRachaCorto,
  textoSerie,
} from "./agente/estadisticas";
import type { ResumenEstudio } from "./agente/estadisticas";

function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(etiqueta);
  e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Si el desplegable de las 8 semanas está abierto: se recuerda mientras la isla repinta la tarjeta con cada aviso. */
let semanasAbiertas = false;

const NS = "http://www.w3.org/2000/svg";

/** Las últimas 8 semanas como columnas apiladas por ramo (cada una con su color), con el promedio semanal debajo. */
function graficoSemanas(resumen: ResumenEstudio, ramos: readonly Ramo[]): HTMLElement {
  const caja = crear("div", "estadisticas-semanas");
  const semanas = resumen.semanas ?? [];
  const nombre = (id: number | null) => (id === null ? "Sin ramo" : (ramos.find((r) => r.id === id)?.nombre ?? "Sin ramo"));
  const columnas = columnasSemanas(semanas, nombre);
  const grafico = crear("div", "estadisticas-semanas-grafico");
  grafico.setAttribute("role", "img");
  grafico.setAttribute("aria-label", columnas.map((c) => c.titulo).join(". "));
  for (const c of columnas) {
    const col = crear("div", `estadisticas-semana${c.actual ? " actual" : ""}`);
    col.title = c.titulo;
    const pila = crear("div", "estadisticas-pila");
    pila.style.height = `${c.altoPct}%`;
    // Cada ramo con su color (la paleta cerrada de los ramos), de abajo hacia arriba: el que más estudió abajo.
    for (const seg of [...c.segmentos].reverse()) {
      const ramo = typeof seg.ramoId === "number" ? ramos.find((r) => r.id === seg.ramoId) : undefined;
      const trozo = crear("div", "estadisticas-trozo");
      trozo.style.height = `${seg.pct}%`;
      trozo.style.background = ramo ? HEX_RAMO[ramo.color] : "#9aa3ad";
      pila.append(trozo);
    }
    col.append(pila, crear("span", "estadisticas-letra", c.etiqueta));
    grafico.append(col);
  }
  caja.append(grafico);
  const promedio = textoPromedio(promedioSemanal(semanas, resumen.desdeMs));
  if (promedio) caja.append(crear("div", "repaso-detalle", promedio));
  else caja.append(crear("div", "repaso-detalle", "Con unas semanas más de datos verás tu promedio."));
  return caja;
}

/** La meta semanal: una barra fina con «6 h 20 min de 10 h», o una invitación a ponerla. `alPonerMeta` deja la frase en el campo. */
function lineaDeMeta(resumen: ResumenEstudio, alPonerMeta: () => void): HTMLElement {
  const fila = crear("div", "estadisticas-meta");
  if (!resumen.meta) {
    const poner = crear("button", "estadisticas-ver", "Poner una meta semanal");
    poner.type = "button";
    poner.title = "Escribe «mi meta es estudiar 10 horas a la semana» en el campo y cambia el número";
    poner.addEventListener("click", alPonerMeta);
    fila.append(poner);
    return fila;
  }
  const m = textoDeMeta(resumen.meta);
  const texto = crear("button", `estadisticas-meta-texto${m.cumplida ? " cumplida" : ""}`, m.texto);
  texto.type = "button";
  texto.title = "Tocar para cambiar tu meta";
  texto.addEventListener("click", alPonerMeta);
  const pista = crear("div", "estadisticas-meta-pista");
  pista.setAttribute("role", "progressbar");
  pista.setAttribute("aria-valuemin", "0");
  pista.setAttribute("aria-valuemax", "100");
  pista.setAttribute("aria-valuenow", String(m.pct));
  const relleno = crear("div", `estadisticas-meta-relleno${m.cumplida ? " cumplida" : ""}`);
  relleno.style.width = `${Math.max(2, m.pct)}%`;
  pista.append(relleno);
  fila.append(texto, pista);
  return fila;
}

export function tarjetaEstadisticas(resumen: ResumenEstudio, ramos: readonly Ramo[], alAnotar: () => void, alPonerMeta: () => void = () => {}): HTMLElement {
  const caja = crear("div", "tarjeta estadisticas");
  const cabeza = crear("div", "estadisticas-cabeza");
  cabeza.append(crear("div", "tarjeta-titulo", "Esta semana"));
  const anotar = crear("button", "pildora", "+ Anotar horas");
  anotar.type = "button";
  anotar.title = "Escribe «estudié 1 hora de cálculo» en el campo";
  anotar.addEventListener("click", alAnotar);
  cabeza.append(anotar);
  caja.append(cabeza);

  if (!resumen.hay) {
    caja.append(crear("p", "vacia-texto", TEXTO_SIN_DATOS));
    if (resumen.meta) caja.append(lineaDeMeta(resumen, alPonerMeta));
    return caja;
  }

  const total = crear("div", "estadisticas-total");
  total.append(crear("span", "estadisticas-numero", formatearMinutos(resumen.totalMin)));
  const racha = textoRachaCorto(resumen.racha);
  if (racha) total.append(crear("span", "estadisticas-racha", racha));
  caja.append(total);
  const diferencia = textoDiferencia(resumen.totalMin, resumen.pasadaMin);
  if (diferencia) caja.append(crear("div", "repaso-linea", diferencia));
  caja.append(lineaDeMeta(resumen, alPonerMeta));

  // Siete barras, de lunes a domingo; hoy resaltado. Cada una se apila con los colores de los ramos: más
  // alto = más tiempo ese día, y cada color ocupa lo que estudiaste de ese ramo.
  const nombre = (id: number | null) => (id === null ? "Sin ramo" : (ramos.find((r) => r.id === id)?.nombre ?? "Sin ramo"));
  const columnas = columnasDias(resumen, nombre);
  const barras = crear("div", "estadisticas-dias");
  barras.setAttribute("role", "img");
  barras.setAttribute("aria-label", columnas.map((c) => c.titulo).join(". "));
  columnas.forEach((c, i) => {
    const columna = crear("div", `estadisticas-dia${i === resumen.hoy ? " hoy" : ""}`);
    columna.title = c.titulo;
    const barra = crear("div", `estadisticas-barra${c.segmentos.length > 0 ? " apilada" : ""}`);
    barra.style.height = `${c.altoPct}%`;
    // El color de cada ramo sale de la paleta cerrada (nunca de texto de afuera); el que más estudió, abajo.
    for (const seg of [...c.segmentos].reverse()) {
      const ramo = typeof seg.ramoId === "number" ? ramos.find((r) => r.id === seg.ramoId) : undefined;
      const trozo = crear("div", "estadisticas-trozo");
      trozo.style.height = `${seg.pct}%`;
      trozo.style.background = ramo ? HEX_RAMO[ramo.color] : "#9aa3ad";
      barra.append(trozo);
    }
    columna.append(barra, crear("span", "estadisticas-letra", LETRAS_DIAS[i]));
    barras.append(columna);
  });
  caja.append(barras);

  // Por ramo (los 5 que más), con su color.
  for (const b of barrasPorRamo(resumen.porRamo, nombre)) {
    const fila = crear("div", "estadisticas-ramo");
    const ramo = typeof b.ramoId === "number" ? ramos.find((r) => r.id === b.ramoId) : undefined;
    fila.style.setProperty("--ramo", ramo ? HEX_RAMO[ramo.color] : "#9aa3ad");
    fila.append(crear("span", "estadisticas-ramo-nombre", b.etiqueta));
    const pista = crear("span", "estadisticas-ramo-pista");
    const relleno = crear("span", "estadisticas-ramo-relleno");
    relleno.style.width = `${Math.max(3, Math.round(b.fraccion * 100))}%`;
    pista.append(relleno);
    fila.append(pista, crear("span", "estadisticas-ramo-min", formatearMinutos(b.min)));
    caja.append(fila);
  }
  // Las últimas 8 semanas, plegadas: un toque las abre.
  if ((resumen.semanas ?? []).some((s) => s.totalMin > 0)) {
    const abrir = crear("button", "estadisticas-ver", semanasAbiertas ? "Ocultar las 8 semanas" : "Ver 8 semanas");
    abrir.type = "button";
    abrir.setAttribute("aria-expanded", String(semanasAbiertas));
    const lugar = crear("div", "estadisticas-semanas-lugar");
    if (semanasAbiertas) lugar.append(graficoSemanas(resumen, ramos));
    abrir.addEventListener("click", () => {
      semanasAbiertas = !semanasAbiertas;
      abrir.textContent = semanasAbiertas ? "Ocultar las 8 semanas" : "Ver 8 semanas";
      abrir.setAttribute("aria-expanded", String(semanasAbiertas));
      lugar.replaceChildren(...(semanasAbiertas ? [graficoSemanas(resumen, ramos)] : []));
    });
    caja.append(abrir, lugar);
  }
  const desde = textoDesde(resumen.desdeMs);
  if (desde) caja.append(crear("div", "repaso-detalle", desde));
  return caja;
}

/**
 * La línea de la ficha de un ramo: «Esta semana: 2 h 10 min · en total: 14 h» y, a su lado, una mini-línea
 * con sus últimas 8 semanas (solo si hay algo que dibujar).
 */
export function lineaEstadisticasDeRamo(resumen: ResumenEstudio, ramoId: number): HTMLElement | null {
  const texto = lineaDeRamo(resumen.totales.find((t) => t.ramoId === ramoId));
  if (!texto) return null;
  const fila = crear("div", "estadisticas-ficha");
  fila.append(crear("div", "repaso-linea", texto));
  const serie = serieDeRamo(resumen.semanas ?? [], ramoId);
  const ANCHO = 64;
  const ALTO = 18;
  const linea = lineaMini(serie, ANCHO, ALTO);
  if (linea) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "estadisticas-mini");
    svg.setAttribute("viewBox", `0 0 ${ANCHO} ${ALTO}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", textoSerie(serie));
    const trazo = document.createElementNS(NS, "polyline");
    trazo.setAttribute("points", linea.puntos);
    const punto = document.createElementNS(NS, "circle");
    punto.setAttribute("cx", linea.ultimo.x.toFixed(1));
    punto.setAttribute("cy", linea.ultimo.y.toFixed(1));
    punto.setAttribute("r", "2");
    const titulo = document.createElementNS(NS, "title");
    titulo.textContent = textoSerie(serie);
    svg.append(titulo, trazo, punto);
    fila.append(svg);
  }
  return fila;
}
