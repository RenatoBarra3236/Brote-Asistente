// Reglas puras de la ventana «Lo que sé de ti» (rediseño del 6-10-2026): qué grupo tiene cada sección,
// cuentas y resúmenes, búsqueda y de qué tipo es el borrado de cada cosa. `memoria.ts` solo pinta.
// Se importa desde Node en las pruebas: imports con extensión `.ts` y nada que Node no pueda borrar.

import type { Almacenamiento } from "./papelera.ts";

export type GrupoId = "resumen" | "brote" | "estudio" | "plata" | "grabaciones";
export type GrupoConDatos = Exclude<GrupoId, "resumen">;

export type SeccionId =
  | "brote"
  | "frases"
  | "noentendidas"
  | "conversacion"
  | "importado"
  | "ramos"
  | "notas"
  | "repaso"
  | "planes"
  | "estadisticas"
  | "documentos"
  | "ahorro"
  | "transcripciones"
  | "audios";

export const GRUPOS: { id: GrupoId; titulo: string; icono: string }[] = [
  { id: "resumen", titulo: "Resumen", icono: "🌱" },
  { id: "brote", titulo: "Brote recuerda", icono: "🧠" },
  { id: "estudio", titulo: "Estudio", icono: "📚" },
  { id: "plata", titulo: "Plata", icono: "💰" },
  { id: "grabaciones", titulo: "Grabaciones", icono: "🎙" },
];

/** En qué grupo vive cada sección: todas en uno solo, y en el orden en que se muestran. */
export const SECCIONES_DE: Record<GrupoConDatos, SeccionId[]> = {
  brote: ["brote", "frases", "noentendidas", "conversacion", "importado"],
  estudio: ["ramos", "notas", "repaso", "planes", "estadisticas", "documentos"],
  plata: ["ahorro"],
  grabaciones: ["transcripciones", "audios"],
};

export function grupoDe(seccion: SeccionId): GrupoConDatos {
  for (const g of Object.keys(SECCIONES_DE) as GrupoConDatos[]) if (SECCIONES_DE[g].includes(seccion)) return g;
  throw new Error(`Sección sin grupo: ${seccion}`);
}

/** Lo que va a archivos en el disco (en Mac, a la Papelera). Lo demás está en la base de datos de Brote. */
const EN_ARCHIVOS: SeccionId[] = ["brote", "conversacion", "importado", "documentos", "transcripciones", "audios"];

export function almacenamientoDe(seccion: SeccionId, enMac: boolean): Almacenamiento {
  return enMac && EN_ARCHIVOS.includes(seccion) ? "papelera" : "definitivo";
}

/** Los tipos de borrado que aparecen en un grupo, para escribir su explicación una sola vez. */
export function almacenamientosDeGrupo(grupo: GrupoConDatos, enMac: boolean): Almacenamiento[] {
  const tipos = new Set(SECCIONES_DE[grupo].map((s) => almacenamientoDe(s, enMac)));
  return (["papelera", "definitivo"] as const).filter((t) => tipos.has(t));
}

// ---- Cuentas ----

export interface Conteos {
  brote: number;
  frases: number;
  /** Frases que no entendió sin IA (solo hay si el usuario dio permiso para guardarlas). */
  noEntendidas: number;
  conversacion: number;
  importado: number;
  ramos: number;
  /** Evaluaciones guardadas. */
  notas: number;
  /** Tarjetas de repaso. */
  repaso: number;
  planes: number;
  /** Tiempo de estudio ya formateado («21 h»), o `null` si no hay. */
  estadisticas: string | null;
  documentos: number;
  ahorro: number;
  transcripciones: number;
  audios: number;
}

export function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Cuántas cosas guarda un grupo (el estudiado cuenta como una). */
export function totalDeGrupo(grupo: GrupoConDatos, c: Conteos): number {
  switch (grupo) {
    case "brote":
      return c.brote + c.frases + c.noEntendidas + c.conversacion + c.importado;
    case "estudio":
      return c.ramos + c.notas + c.repaso + c.planes + (c.estadisticas ? 1 : 0) + c.documentos;
    case "plata":
      return c.ahorro;
    case "grabaciones":
      return c.transcripciones + c.audios;
  }
}

/** La línea de la tarjeta de Resumen: «4 ramos · 17 tarjetas · 1 documento». */
export function lineaDeGrupo(grupo: GrupoConDatos, c: Conteos): string {
  if (totalDeGrupo(grupo, c) === 0) return textoVacioDeGrupo(grupo);
  const partes: (string | null)[] =
    grupo === "brote"
      ? [
          c.brote > 0 ? plural(c.brote, "recuerdo", "recuerdos") : null,
          c.frases > 0 ? plural(c.frases, "frase aprendida", "frases aprendidas") : null,
          c.noEntendidas > 0 ? plural(c.noEntendidas, "frase que no entendí", "frases que no entendí") : null,
          c.conversacion > 0 ? plural(c.conversacion, "conversación", "conversaciones") : null,
          c.importado > 0 ? `${c.importado} de otros proyectos` : null,
        ]
      : grupo === "estudio"
        ? [
            c.ramos > 0 ? plural(c.ramos, "ramo", "ramos") : null,
            c.notas > 0 ? plural(c.notas, "nota", "notas") : null,
            c.repaso > 0 ? plural(c.repaso, "tarjeta", "tarjetas") : null,
            c.planes > 0 ? plural(c.planes, "plan", "planes") : null,
            c.estadisticas ? `${c.estadisticas} estudiadas` : null,
            c.documentos > 0 ? plural(c.documentos, "documento", "documentos") : null,
          ]
        : grupo === "plata"
          ? [plural(c.ahorro, "meta de ahorro", "metas de ahorro")]
          : [
              c.transcripciones > 0 ? plural(c.transcripciones, "transcripción", "transcripciones") : null,
              c.audios > 0 ? plural(c.audios, "audio", "audios") : null,
            ];
  return partes.filter((p): p is string => p !== null).join(" · ");
}

/** Qué llena cada grupo cuando está vacío. */
export function textoVacioDeGrupo(grupo: GrupoConDatos): string {
  switch (grupo) {
    case "brote":
      return "Todavía no guardo nada de lo que me cuentas.";
    case "estudio":
      return "Aún no hay nada de estudio: agrega un ramo («agrega el ramo Cálculo») o arrastra un documento a Brote.";
    case "plata":
      return "Aún no hay metas de ahorro: dime «quiero juntar 150 lucas para marzo».";
    case "grabaciones":
      return "No hay grabaciones ni transcripciones guardadas.";
  }
}

/** «17 tarjetas · 6 temas», la línea de resumen de una clase o un documento en Repaso. */
export function resumenDeClase(tarjetas: number, temas: number): string {
  return `${plural(tarjetas, "tarjeta", "tarjetas")} · ${plural(temas, "tema", "temas")}`;
}

export function textoVer(abierto: boolean): string {
  return abierto ? "Ocultar" : "Ver";
}

// ---- Búsqueda ----

export function simplificar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Lo que se busca localmente (títulos y nombres ya cargados): desde 2 letras; menos, no se busca. */
export function textoBuscado(filtro: string): string {
  const t = simplificar(filtro.trim());
  return t.length >= 2 ? t : "";
}

/** ¿Alguno de los textos menciona lo buscado? Sin búsqueda, todo coincide. */
export function coincide(buscado: string, ...textos: (string | null | undefined)[]): boolean {
  if (buscado === "") return true;
  return textos.some((t) => t != null && simplificar(t).includes(buscado));
}

/** Con una búsqueda de 3 o más letras el puente aporta los recuerdos que la mencionan por su contenido. */
export function buscaEnElPuente(filtro: string): boolean {
  return filtro.trim().length >= 3;
}
