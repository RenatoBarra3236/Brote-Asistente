// La tarjeta «Esta semana» de la pestaña Estudio (A5): total, diferencia con la semana pasada, racha, siete
// barras de lunes a domingo y barras por ramo. Armada solo con números; los textos y reglas, en
// `agente/estadisticas.ts` (con pruebas). Sin datos, una línea que invita a empezar.

import { HEX_RAMO } from "./agente/estudio";
import type { Ramo } from "./agente/estudio";
import {
  LETRAS_DIAS,
  TEXTO_SIN_DATOS,
  alturasBarras,
  barrasPorRamo,
  etiquetaDia,
  formatearMinutos,
  lineaDeRamo,
  textoDesde,
  textoDiferencia,
  textoRachaCorto,
} from "./agente/estadisticas";
import type { ResumenEstudio } from "./agente/estadisticas";

function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(etiqueta);
  e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

export function tarjetaEstadisticas(resumen: ResumenEstudio, ramos: readonly Ramo[], alAnotar: () => void): HTMLElement {
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
    return caja;
  }

  const total = crear("div", "estadisticas-total");
  total.append(crear("span", "estadisticas-numero", formatearMinutos(resumen.totalMin)));
  const racha = textoRachaCorto(resumen.racha);
  if (racha) total.append(crear("span", "estadisticas-racha", racha));
  caja.append(total);
  const diferencia = textoDiferencia(resumen.totalMin, resumen.pasadaMin);
  if (diferencia) caja.append(crear("div", "repaso-linea", diferencia));

  // Siete barras, de lunes a domingo; hoy resaltado.
  const barras = crear("div", "estadisticas-dias");
  barras.setAttribute("role", "img");
  barras.setAttribute("aria-label", resumen.porDia.map((m, i) => etiquetaDia(i, m)).join(". "));
  const alturas = alturasBarras(resumen.porDia);
  resumen.porDia.forEach((min, i) => {
    const columna = crear("div", `estadisticas-dia${i === resumen.hoy ? " hoy" : ""}`);
    columna.title = etiquetaDia(i, min);
    const barra = crear("div", "estadisticas-barra");
    barra.style.height = `${alturas[i]}%`;
    columna.append(barra, crear("span", "estadisticas-letra", LETRAS_DIAS[i]));
    barras.append(columna);
  });
  caja.append(barras);

  // Por ramo (los 5 que más), con su color.
  const nombre = (id: number | null) => (id === null ? "Sin ramo" : (ramos.find((r) => r.id === id)?.nombre ?? "Sin ramo"));
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
  const desde = textoDesde(resumen.desdeMs);
  if (desde) caja.append(crear("div", "repaso-detalle", desde));
  return caja;
}

/** La línea de la ficha de un ramo: «Esta semana: 2 h 10 min · en total: 14 h». */
export function lineaEstadisticasDeRamo(resumen: ResumenEstudio, ramoId: number): HTMLElement | null {
  const texto = lineaDeRamo(resumen.totales.find((t) => t.ramoId === ramoId));
  return texto ? crear("div", "repaso-linea", texto) : null;
}
