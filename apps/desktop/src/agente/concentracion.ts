// El modo concentración (E1 de docs/plan-estudio-y-mejoras.md): mientras corre un bloque de estudio de un
// pomodoro, los avisos que no importan no salen en el ala ni como notificación del sistema. Siguen en la lista
// de «Novedades» y con su punto, y al empezar el descanso Brote dice cuántos llegaron. Las decisiones (permisos,
// «¿Aprendo esto?») no pasan por aquí: siguen abriendo la isla. Sin DOM, para probarlo con Node.

import type { TipoNovedad } from "./novedades.ts";

/** Lo que sí suena durante la concentración: el propio temporizador, la clase que empieza, una entrega, el bloque del plan y una celebración. */
export const PASAN_EN_CONCENTRACION: readonly TipoNovedad[] = ["temporizador", "calendario", "aula", "estudio", "celebracion"];

/** ¿Este tipo de aviso se calla durante la concentración? */
export function silenciaEnConcentracion(tipo: TipoNovedad): boolean {
  return !PASAN_EN_CONCENTRACION.includes(tipo);
}

/** ¿Hay un pomodoro en su bloque de estudio? (el descanso no cuenta) */
export function hayBloqueDeEstudio(lista: readonly { tipo: string; fase: string | null }[]): boolean {
  return lista.some((t) => t.tipo === "pomodoro" && t.fase === "estudio");
}

const DE: Record<TipoNovedad, string> = {
  claude: "de Claude Code",
  plan: "del plan de Claude",
  descarga: "de descargas",
  temporizador: "de temporizadores",
  calendario: "del calendario",
  aula: "del aula",
  plata: "de plata",
  equipo: "del equipo",
  computador: "del computador",
  transcripcion: "de grabaciones",
  agenda: "de la agenda",
  repaso: "de repaso",
  estudio: "de estudio",
  resumen: "del resumen",
  celebracion: "de celebraciones",
};

/** «Mientras estudiabas llegaron 3 avisos: 2 de Claude Code y 1 de plata. Los dejé en Novedades.» */
export function textoLlegaron(silenciados: readonly { tipo: TipoNovedad }[]): string | null {
  if (silenciados.length === 0) return null;
  const cuenta = new Map<TipoNovedad, number>();
  for (const s of silenciados) cuenta.set(s.tipo, (cuenta.get(s.tipo) ?? 0) + 1);
  const partes = [...cuenta].map(([tipo, n]) => `${n} ${DE[tipo]}`);
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
  const total = silenciados.length === 1 ? "1 aviso" : `${silenciados.length} avisos`;
  return `Mientras estudiabas ${silenciados.length === 1 ? "llegó" : "llegaron"} ${total}: ${lista}. Los dejé en Novedades.`;
}

/**
 * Sigue si estás en concentración y cuenta lo que se calló. `actualizar` se llama cada vez que cambian los
 * temporizadores o el interruptor; devuelve qué pasó para que la isla lo diga una sola vez.
 */
export class SeguidorDeConcentracion {
  private activa = false;
  private silenciados: { tipo: TipoNovedad }[] = [];

  get enConcentracion(): boolean {
    return this.activa;
  }

  /** `enBloque`: hay un bloque de estudio corriendo; `permitido`: el interruptor de Configurar. Devuelve el resumen al terminar. */
  actualizar(enBloque: boolean, permitido: boolean): { termino: string | null } {
    const ahora = enBloque && permitido;
    if (ahora === this.activa) return { termino: null };
    this.activa = ahora;
    if (ahora) {
      this.silenciados = [];
      return { termino: null };
    }
    const texto = textoLlegaron(this.silenciados);
    this.silenciados = [];
    return { termino: texto };
  }

  /** ¿Este aviso se calla ahora? Si sí, lo cuenta para el resumen. */
  silenciar(tipo: TipoNovedad): boolean {
    if (!this.activa || !silenciaEnConcentracion(tipo)) return false;
    this.silenciados.push({ tipo });
    return true;
  }
}
