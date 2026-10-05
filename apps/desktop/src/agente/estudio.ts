// La pestaña Estudio (A1 de docs/plan-estudio-y-mejoras.md): textos y reglas puras, sin DOM, para probarlas
// con Node. Los datos los arma el puente (`ramos-estado`) con la lógica del motor.

import type { FichaRamo, SugerenciaRamo } from "../../../../packages/motor/src/ramos-ficha.ts";
import type { ColorRamo, Ramo } from "../../../../packages/motor/src/ramos-tipos.ts";
import type { FichaNotas } from "../../../../packages/motor/src/notas-ficha.ts";

export type { FichaRamo, SugerenciaRamo, Ramo, ColorRamo };

/** Lo que devuelve el pedido `ramos-estado`. */
export interface EstadoEstudio {
  ramos: Ramo[];
  fichas: FichaRamo[];
  sugerencias: SugerenciaRamo[];
  fuentes: { calendario: boolean; aula: boolean };
  /** Id de la tarea → id de su ramo (para el punto de color en la Agenda). */
  ramoDeTarea: Record<string, number>;
  /** Evaluaciones y notas de cada ramo que tiene (A2). Un puente más viejo no la manda. */
  notas?: FichaNotas[];
}

/** Colores de la paleta de ramos (los mismos de `COLORES_RAMO`), para el punto y la barra. */
export const HEX_RAMO: Record<ColorRamo, string> = {
  azul: "#5b9cf5",
  verde: "#5bc08a",
  ambar: "#e8b04a",
  rojo: "#e8675f",
  violeta: "#a78bfa",
  turquesa: "#4fc3c7",
  rosa: "#ee7fb0",
  gris: "#9aa3ad",
};

export function colorDeRamo(ramos: readonly Ramo[], id: number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  const ramo = ramos.find((r) => r.id === id);
  return ramo ? HEX_RAMO[ramo.color] : null;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function dosCifras(n: number): string {
  return String(n).padStart(2, "0");
}

/** "hoy 10:30", "mañana 08:00", "vie 09:00". */
export function cuandoClase(inicioMs: number, ahoraMs: number): string {
  const d = new Date(inicioMs);
  const hoy = new Date(ahoraMs);
  const dias = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) / 86_400_000);
  const hora = `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`;
  if (dias === 0) return `hoy ${hora}`;
  if (dias === 1) return `mañana ${hora}`;
  return `${DIAS[d.getDay()]} ${d.getDate()} · ${hora}`;
}

/** "en 3 h", "mañana", "en 5 días": lo que falta para una entrega o tarea. */
export function cuandoVence(venceMs: number, ahoraMs: number): string {
  const faltan = venceMs - ahoraMs;
  if (faltan < 0) return "vencida";
  const horas = faltan / 3_600_000;
  if (horas < 1) return "en menos de 1 h";
  if (horas < 24) return `en ${Math.floor(horas)} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "mañana" : `en ${dias} días`;
}

/** Una línea de resumen de la ficha: "2 clases · 1 entrega · 3 tareas · 1 transcripción". Vacía si no hay nada. */
export function resumenDeFicha(f: FichaRamo): string {
  const partes: string[] = [];
  if (f.clases.length) partes.push(f.clases.length === 1 ? "1 clase" : `${f.clases.length} clases`);
  if (f.entregas.length) partes.push(f.entregas.length === 1 ? "1 entrega" : `${f.entregas.length} entregas`);
  if (f.tareas.length) partes.push(f.tareas.length === 1 ? "1 tarea" : `${f.tareas.length} tareas`);
  if (f.transcripciones) partes.push(f.transcripciones === 1 ? "1 transcripción" : `${f.transcripciones} transcripciones`);
  return partes.join(" · ");
}

export const TEXTO_SIN_RAMOS =
  "Aquí van tus ramos. Cada uno con su color, y lo que viene de él —clases, entregas y tareas— junto. Agrega el primero abajo, o escribe «agrega el ramo Cálculo».";

export const TEXTO_FICHA_VACIA = "Todavía no hay clases, entregas ni tareas de este ramo.";

/** Por qué un ramo puede no mostrar clases ni entregas aunque existan, para no dejar al usuario adivinando. */
export function explicarFichaVacia(fuentes: EstadoEstudio["fuentes"], tieneAlias: boolean): string {
  if (!fuentes.calendario && !fuentes.aula) return "Conecta tu calendario o tu aula en Configurar Brote para ver aquí sus clases y entregas.";
  return tieneAlias
    ? TEXTO_FICHA_VACIA
    : `${TEXTO_FICHA_VACIA} Si en tu calendario o aula se llama distinto, agrégale una palabra clave (por ejemplo «calc»).`;
}

export function textoSugerencia(s: SugerenciaRamo): string {
  return s.origen === "aula" ? `${s.nombre} · de tu aula` : `${s.nombre} · se repite en tu calendario`;
}

/** Las palabras clave que escribió el usuario en el campo de edición («calc, cal 2») → lista. */
export function leerAlias(texto: string): string[] {
  return texto
    .split(/[,;\n]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

export function aliasParaEditar(alias: readonly string[]): string {
  return alias.join(", ");
}

/** La nota de la sección «Ramos» de «Lo que sé de ti». */
export const NOTA_RAMOS =
  "Los ramos que agregaste. Borrar uno no borra sus tareas ni sus grabaciones: solo quedan sin ramo. Archivar (desde la pestaña Estudio) lo esconde sin borrarlo.";

export function avisoRamoBorrado(nombre: string): string {
  return `Listo, borré el ramo ${nombre}. Sus tareas y grabaciones siguen, sin ramo.`;
}
