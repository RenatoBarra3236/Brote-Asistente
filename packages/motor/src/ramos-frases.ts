// Textos de las frases sin IA sobre ramos. Puro.

import type { Ramo } from "./ramos-tipos.ts";

export const EMOJI_COLOR: Record<Ramo["color"], string> = {
  azul: "🟦",
  verde: "🟩",
  ambar: "🟨",
  rojo: "🟥",
  violeta: "🟪",
  turquesa: "🟦",
  rosa: "🟪",
  gris: "⬜",
};

export function describirRamos(ramos: readonly Ramo[]): string {
  const activos = ramos.filter((r) => !r.archivado);
  if (activos.length === 0) return "Todavía no tienes ramos. Dime «agrega el ramo Cálculo» y lo creo 🌱";
  const lineas = activos.map((r) => `• ${EMOJI_COLOR[r.color]} ${r.nombre}${r.alias.length > 0 ? ` (también: ${r.alias.join(", ")})` : ""}`);
  return `Tus ramos:\n${lineas.join("\n")}`;
}

export function textoRamoCreado(ramo: Ramo): string {
  return `Listo, agregué el ramo ${ramo.nombre} ${EMOJI_COLOR[ramo.color]}. Lo ves en la pestaña Estudio 🌱`;
}

export function textoRamoArchivado(nombre: string): string {
  return `Listo, archivé ${nombre}. Sus tareas y grabaciones siguen ahí, solo que sin ramo a la vista; lo puedes volver a agregar cuando quieras.`;
}
