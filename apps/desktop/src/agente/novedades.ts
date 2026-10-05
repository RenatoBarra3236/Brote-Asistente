// Avisos que no abren la isla (sección 5 de docs/plan-rediseno.md): una descarga lista, un temporizador,
// el calendario, que Claude terminó… Se muestran unos segundos en el ala izquierda con la isla cerrada,
// dejan un punto en la pestaña que corresponde y, al abrir la isla, quedan en una lista corta de
// "Novedades". Solo se abre sola para decisiones (permisos y propuestas): eso no pasa por aquí.
// Sin DOM, para probarlo con Node.

import type { Pestana } from "./tarjetas.ts";

export type TipoNovedad = "claude" | "descarga" | "temporizador" | "calendario" | "aula" | "plan" | "plata" | "equipo" | "computador" | "transcripcion";

export interface Novedad {
  id: number;
  tipo: TipoNovedad;
  texto: string;
  /** Cuándo llegó (ms). */
  ms: number;
  /** Si el usuario ya abrió la isla después de que llegó. */
  vista: boolean;
}

/** Cuánto se queda el aviso en el ala izquierda. */
export const AVISO_EN_ALA_MS = 6000;
/** Cuánto tiempo sigue en la lista "Novedades". */
export const NOVEDADES_VIGENTES_MS = 10 * 60_000;
/** Cuántas guarda la lista. */
const MAXIMO = 8;

/** En qué pestaña vive el tema de cada aviso (ahí se pone el punto). */
export const PESTANA_DE: Record<TipoNovedad, Pestana> = {
  claude: "claude",
  plan: "claude",
  descarga: "brote",
  temporizador: "brote",
  calendario: "brote",
  aula: "brote",
  plata: "plata",
  equipo: "brote",
  computador: "equipo",
  transcripcion: "brote",
};

/** El color del pulso alrededor del notch (rgb): el mismo que usan las tarjetas de cada tema. */
export const COLOR_DE: Record<TipoNovedad, string> = {
  claude: "rgb(122, 178, 255)",
  plan: "rgb(255, 190, 90)",
  descarga: "rgb(255, 255, 255)",
  temporizador: "rgb(132, 226, 160)",
  calendario: "rgb(150, 195, 255)",
  aula: "rgb(255, 190, 90)",
  plata: "rgb(132, 226, 160)",
  equipo: "rgb(190, 170, 255)",
  computador: "rgb(255, 128, 102)",
  transcripcion: "rgb(150, 195, 255)",
};

/** Un texto corto para el ala: sin saltos de línea y con "…" si se pasa de `maximo`. */
export function textoCorto(texto: string, maximo = 38): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length <= maximo ? limpio : `${limpio.slice(0, maximo - 1).trimEnd()}…`;
}

export class Novedades {
  private lista: Novedad[] = [];
  private siguiente = 1;

  /** Anota un aviso nuevo (el más reciente va primero). Devuelve la novedad. */
  agregar(tipo: TipoNovedad, texto: string, ahora: number): Novedad {
    const novedad: Novedad = { id: this.siguiente++, tipo, texto: texto.trim(), ms: ahora, vista: false };
    this.lista = [novedad, ...this.lista].slice(0, MAXIMO);
    return novedad;
  }

  /** El aviso que va en el ala ahora: el más reciente, mientras no pase `AVISO_EN_ALA_MS` ni se haya visto. */
  enAla(ahora: number): Novedad | null {
    const ultima = this.lista[0];
    return ultima && !ultima.vista && ahora - ultima.ms < AVISO_EN_ALA_MS ? ultima : null;
  }

  /** La lista de "Novedades": las de los últimos 10 min, la más reciente primero. */
  recientes(ahora: number): Novedad[] {
    return this.lista.filter((n) => ahora - n.ms < NOVEDADES_VIGENTES_MS);
  }

  /** Los avisos vigentes que el usuario aún no vio. */
  sinVer(ahora: number): Novedad[] {
    return this.recientes(ahora).filter((n) => !n.vista);
  }

  /** Las pestañas que llevan punto: tienen algún aviso vigente que el usuario aún no vio. */
  pestanasConPunto(ahora: number): Set<Pestana> {
    return new Set(this.sinVer(ahora).map((n) => PESTANA_DE[n.tipo]));
  }

  /** El usuario abrió la isla: todo lo anterior queda visto (sigue en la lista, sin punto). */
  marcarVistas(): void {
    for (const n of this.lista) n.vista = true;
  }

  /** El usuario entró a una pestaña: sus avisos pierden el punto. */
  marcarVistasDe(pestana: Pestana): void {
    for (const n of this.lista) if (PESTANA_DE[n.tipo] === pestana) n.vista = true;
  }
}
