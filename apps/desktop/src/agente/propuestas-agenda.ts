// Tareas y pruebas que el agente sacó de una transcripción y que el usuario decide si agrega (sección 8,
// fase 5). Textos y reglas puras, sin DOM, para probarlas con Node.

import type { Propuesta as PropuestaAgenda } from "../../../../packages/motor/src/tareas-agenda-tipos.ts";

export type { PropuestaAgenda };

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function dosCifras(n: number): string {
  return String(n).padStart(2, "0");
}

/** "vie 9 oct", "vie 9 oct · 08:30" (la hora solo si la tiene). */
export function fechaDePropuesta(p: Pick<PropuestaAgenda, "inicioMs" | "conHora">): string {
  const d = new Date(p.inicioMs);
  const dia = `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
  return p.conHora ? `${dia} · ${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}` : dia;
}

/** Lo que se escribe en el campo de fecha al editar: AAAA-MM-DD o AAAA-MM-DD HH:MM, hora local. */
export function fechaParaEditar(p: Pick<PropuestaAgenda, "inicioMs" | "conHora">): string {
  const d = new Date(p.inicioMs);
  const dia = `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`;
  return p.conHora ? `${dia} ${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}` : dia;
}

export function tituloDeTarjeta(cuantas: number): string {
  return cuantas === 1 ? "Encontré 1 cosa en tu grabación" : `Encontré ${cuantas} cosas en tu grabación`;
}

export function etiquetaDeTipo(tipo: PropuestaAgenda["tipo"]): string {
  return tipo === "evento" ? "Prueba o evento" : "Tarea";
}

/** Qué hace «Agregar»: con el calendario prendido, todo va también al calendario (hay que decirlo). */
export function destinoDePropuesta(tipo: PropuestaAgenda["tipo"], calendarioPrendido: boolean): string {
  if (tipo === "tarea") return calendarioPrendido ? "Se agrega a tu Agenda y a tu calendario" : "Se agrega a tu Agenda";
  return calendarioPrendido ? "Se agrega a tu calendario" : "Se agrega a tu Agenda como tarea";
}

/** El aviso de Novedades cuando llegan propuestas nuevas (sin abrir la isla). */
export function textoAvisoPropuestas(nuevas: number): string {
  return nuevas === 1 ? "Brote encontró 1 tarea o fecha en tu grabación" : `Brote encontró ${nuevas} tareas o fechas en tu grabación`;
}

/** Cuántas propuestas hay que no estaban en la lista anterior (para avisar solo lo nuevo). */
export function propuestasNuevas(antes: readonly Pick<PropuestaAgenda, "id">[], ahora: readonly Pick<PropuestaAgenda, "id">[]): number {
  const conocidas = new Set(antes.map((p) => p.id));
  return ahora.filter((p) => !conocidas.has(p.id)).length;
}
