// La comparación de ramos de la pestaña Estudio (B3): el promedio de cada ramo en la escala 1,0–7,0, con una
// marca donde está su nota de aprobación y el color del semáforo de las notas (A2). El ramo en más riesgo
// va primero. Armada solo con números; las reglas, en `agente/notas.ts` (con pruebas).

import { HEX_RAMO } from "./agente/estudio";
import type { Ramo } from "./agente/estudio";
import { HEX_SEMAFORO, barrasDeNotas, formatearNota } from "./agente/notas";
import type { FichaNotas } from "./agente/notas";

function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(etiqueta);
  e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** La tarjeta «Notas por ramo», o `null` si todavía ningún ramo tiene una nota rendida. */
export function tarjetaComparacionNotas(fichas: readonly FichaNotas[], ramos: readonly Ramo[]): HTMLElement | null {
  const barras = barrasDeNotas(fichas, new Set(ramos.map((r) => r.id)));
  if (barras.length === 0) return null;
  const caja = crear("div", "tarjeta comparacion-notas");
  caja.append(crear("div", "tarjeta-titulo", "Notas por ramo"));
  caja.setAttribute("role", "group");
  caja.setAttribute("aria-label", barras.map((b) => `${ramos.find((r) => r.id === b.ramoId)?.nombre ?? "Ramo"}: ${b.texto}`).join(". "));
  for (const b of barras) {
    const ramo = ramos.find((r) => r.id === b.ramoId);
    if (!ramo) continue;
    const fila = crear("div", "comparacion-fila");
    fila.title = `${ramo.nombre}: ${b.texto}`;
    const nombre = crear("span", "comparacion-nombre", ramo.nombre);
    // El color del ramo sale de la paleta cerrada (nunca de texto de afuera).
    nombre.style.setProperty("--ramo", HEX_RAMO[ramo.color]);
    const pista = crear("span", "comparacion-pista");
    const relleno = crear("span", "comparacion-relleno");
    relleno.style.width = `${Math.max(2, b.pct).toFixed(1)}%`;
    relleno.style.background = HEX_SEMAFORO[b.semaforo];
    const marca = crear("span", "comparacion-marca");
    marca.style.left = `${b.aprobacionPct.toFixed(1)}%`;
    pista.append(relleno, marca);
    fila.append(nombre, pista, crear("span", "comparacion-nota", formatearNota(b.promedio)));
    caja.append(fila);
  }
  caja.append(crear("div", "repaso-detalle", `La raya marca la nota para aprobar (${formatearNota(4)} por defecto); la escala va de 1,0 a 7,0.`));
  return caja;
}
