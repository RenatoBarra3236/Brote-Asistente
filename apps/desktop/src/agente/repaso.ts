// Resumen y tarjetas de repaso en la isla (A3 de docs/plan-estudio-y-mejoras.md): textos y reglas puras,
// sin DOM, para probarlas con Node. Los datos y las cajas los arma el motor (`armarEstadoRepaso`).

import { fechaDeId } from "../../../../packages/motor/src/transcripciones.ts";
import { TOPE_SESION, colaDelDia } from "../../../../packages/motor/src/repaso-tipos.ts";
import type { DecisionRepaso, EstadoRepaso, Kit, PropuestaRepaso, RepasoDeRamo, Resultado, Tarjeta } from "../../../../packages/motor/src/repaso-tipos.ts";

export type { DecisionRepaso, EstadoRepaso, Kit, PropuestaRepaso, RepasoDeRamo, Resultado, Tarjeta };
export { TOPE_SESION };

export const REPASO_VACIO: EstadoRepaso = { propuestas: [], deHoy: [], porRamo: [], total: 0, hoy: 0, resumenes: [] };

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function dosCifras(n: number): string {
  return String(n).padStart(2, "0");
}

/** "lun 4 oct · 10:30" a partir del id de la grabación (o el id tal cual si no se puede leer). */
export function fechaDeClase(grabacion: string): string {
  const f = fechaDeId(grabacion);
  if (!f) return grabacion;
  return `${DIAS[f.getDay()]} ${f.getDate()} ${MESES[f.getMonth()]} · ${dosCifras(f.getHours())}:${dosCifras(f.getMinutes())}`;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

export function tituloPropuesta(p: Pick<PropuestaRepaso, "grabacion">): string {
  return `Brote preparó un repaso de tu clase del ${fechaDeClase(p.grabacion)}`;
}

/** "3 temas · 8 términos · 6 preguntas" (solo lo que hay). */
export function resumenPropuesta(kit: Kit): string {
  const partes: string[] = [];
  if (kit.temas.length > 0) partes.push(plural(kit.temas.length, "tema", "temas"));
  if (kit.glosario.length > 0) partes.push(plural(kit.glosario.length, "término", "términos"));
  if (kit.preguntas.length > 0) partes.push(plural(kit.preguntas.length, "pregunta", "preguntas"));
  return partes.join(" · ");
}

// ---- Qué se acepta ----------------------------------------------------------------------------------

/** Lo que el usuario deja marcado en una propuesta: todo, de partida (decisión del usuario). */
export interface Marcas {
  temas: boolean[];
  glosario: boolean[];
  preguntas: boolean[];
}

export function marcasIniciales(kit: Kit): Marcas {
  return { temas: kit.temas.map(() => true), glosario: kit.glosario.map(() => true), preguntas: kit.preguntas.map(() => true) };
}

export function cuantasMarcadas(m: Marcas): number {
  return [...m.temas, ...m.glosario, ...m.preguntas].filter(Boolean).length;
}

/** Las tarjetas que saldrían de lo marcado (términos y preguntas; los temas no son tarjetas). */
export function tarjetasMarcadas(m: Marcas): number {
  return [...m.glosario, ...m.preguntas].filter(Boolean).length;
}

const posiciones = (marcas: boolean[]): number[] => marcas.flatMap((x, i) => (x ? [i] : []));

/** El pedido `repaso-propuesta-decidir` a partir de las marcas, el ramo elegido y los textos corregidos. */
export function armarDecision(
  m: Marcas,
  ramoId: number | null,
  ediciones: { glosario?: Record<number, { termino: string; definicion: string }>; preguntas?: Record<number, { pregunta: string; respuesta: string }> } = {},
): DecisionRepaso {
  const decision: DecisionRepaso = { temas: posiciones(m.temas), glosario: posiciones(m.glosario), preguntas: posiciones(m.preguntas), ramoId };
  if (ediciones.glosario && Object.keys(ediciones.glosario).length > 0) decision.glosarioEditado = ediciones.glosario;
  if (ediciones.preguntas && Object.keys(ediciones.preguntas).length > 0) decision.preguntasEditado = ediciones.preguntas;
  return decision;
}

export function textoBotonAceptar(m: Marcas): string {
  const n = cuantasMarcadas(m);
  return n === 0 ? "Marca algo para aceptar" : `Aceptar lo marcado (${n})`;
}

export function textoAceptado(r: { tarjetas: number; repetidas: number; temas: number }): string {
  const partes: string[] = [];
  if (r.tarjetas > 0) partes.push(plural(r.tarjetas, "tarjeta guardada", "tarjetas guardadas"));
  if (r.temas > 0) partes.push(plural(r.temas, "tema guardado", "temas guardados"));
  if (r.repetidas > 0) partes.push(`${plural(r.repetidas, "ya estaba", "ya estaban")}`);
  return partes.length > 0 ? `${partes.join(" · ")} 🌱` : "No quedó nada nuevo que guardar.";
}

// ---- Sesión de repaso ------------------------------------------------------------------------------

export const ETIQUETA_RESULTADO: Record<Resultado, string> = {
  "no-sabia": "No sabía",
  casi: "Casi",
  sabia: "Sabía",
};

/** Una sesión: la cola del día (o la de un ramo), una tarjeta a la vez. Sin DOM ni red. */
export class SesionRepaso {
  readonly cola: readonly Tarjeta[];
  readonly ramoId: number | null;
  private posicion = 0;
  private reverso = false;
  private resultados: Resultado[] = [];

  constructor(estado: Pick<EstadoRepaso, "deHoy">, ahoraMs: number, ramoId: number | null = null, tope = TOPE_SESION) {
    this.ramoId = ramoId;
    this.cola = colaDelDia(estado.deHoy, ahoraMs, tope, ramoId ?? undefined);
  }

  get vacia(): boolean {
    return this.cola.length === 0;
  }
  get terminada(): boolean {
    return this.posicion >= this.cola.length;
  }
  get actual(): Tarjeta | null {
    return this.cola[this.posicion] ?? null;
  }
  get mostrandoRespuesta(): boolean {
    return this.reverso;
  }
  get hechas(): number {
    return this.posicion;
  }
  /** "3 de 12" */
  get progreso(): string {
    return `${Math.min(this.posicion + 1, this.cola.length)} de ${this.cola.length}`;
  }

  mostrarRespuesta(): void {
    if (!this.terminada) this.reverso = true;
  }

  /** Registra cómo le fue con la tarjeta actual y pasa a la siguiente; devuelve la que se contestó. */
  responder(resultado: Resultado): Tarjeta | null {
    const t = this.actual;
    if (!t || !this.reverso) return null;
    this.resultados.push(resultado);
    this.posicion++;
    this.reverso = false;
    return t;
  }

  get sabidas(): number {
    return this.resultados.filter((r) => r === "sabia").length;
  }
  get falladas(): number {
    return this.resultados.filter((r) => r === "no-sabia").length;
  }

  textoFin(): string {
    if (this.cola.length === 0) return "No hay tarjetas para repasar hoy 🎉";
    const vuelven = this.falladas > 0 ? ` Las que no sabías vuelven mañana.` : "";
    return `¡Listo! Repasaste ${plural(this.cola.length, "tarjeta", "tarjetas")} y sabías ${this.sabidas}.${vuelven} 🌱`;
  }
}

// ---- Resumen en la ficha del ramo y avisos ---------------------------------------------------------------

/** "7 para hoy · 24 en total" (o null si el ramo no tiene tarjetas). */
export function lineaRepasoDeRamo(r: RepasoDeRamo | undefined): string | null {
  if (!r || r.total === 0) return null;
  return `${r.hoy === 0 ? "nada para hoy" : `${r.hoy} para hoy`} · ${r.total} en total`;
}

export function textoAvisoPropuestaRepaso(nuevas: number): string {
  return nuevas === 1 ? "Brote preparó un repaso de tu clase" : `Brote preparó ${nuevas} repasos de tus clases`;
}

/** Cuántas propuestas son de una grabación que no estaba en la lista anterior (para avisar solo lo nuevo). */
export function propuestasRepasoNuevas(antes: readonly Pick<PropuestaRepaso, "grabacion">[], ahora: readonly Pick<PropuestaRepaso, "grabacion">[]): number {
  const previas = new Set(antes.map((p) => p.grabacion));
  return ahora.filter((p) => !previas.has(p.grabacion)).length;
}

export function textoAvisoTarjetas(hoy: number): string {
  return hoy === 1 ? "Tienes 1 tarjeta para repasar" : `Tienes ${hoy} tarjetas para repasar`;
}

/** "AAAA-MM-DD" local: sirve de clave para avisar a lo más una vez al día. */
export function claveDia(ms: number): string {
  const f = new Date(ms);
  return `${f.getFullYear()}-${dosCifras(f.getMonth() + 1)}-${dosCifras(f.getDate())}`;
}

/** El aviso diario «tienes N tarjetas»: una vez por día y solo con la isla cerrada (decisión del usuario). */
export function debeAvisarTarjetas(hoy: number, ultimoDiaAvisado: string | null, ahoraMs: number, islaAbierta: boolean): boolean {
  return hoy > 0 && !islaAbierta && ultimoDiaAvisado !== claveDia(ahoraMs);
}

// ---- «Lo que sé de ti → Repaso» -----------------------------------------------------------------------

export const TEXTO_SIN_REPASO_MEMORIA = "Todavía no hay tarjetas ni resúmenes de repaso. Cuando aceptes un repaso de una clase aparecerá aquí.";
export const NOTA_REPASO_MEMORIA =
  "Las tarjetas y los resúmenes se guardan solo en tu computador, en una base de datos de Brote, con tus palabras (no la transcripción). Al borrarlos desaparecen de verdad (no hay Papelera).";

export function avisoRepasoBorrado(n: number): string {
  return n === 1 ? "Borré 1 elemento de repaso." : `Borré ${n} elementos de repaso.`;
}

/** "caja 3 · vence hoy" / "vence en 4 días" */
export function estadoDeTarjeta(t: Pick<Tarjeta, "caja" | "proximoMs">, ahoraMs: number): string {
  const dias = Math.round((new Date(t.proximoMs).setHours(0, 0, 0, 0) - new Date(ahoraMs).setHours(0, 0, 0, 0)) / 86_400_000);
  const cuando = dias <= 0 ? "vence hoy" : dias === 1 ? "vence mañana" : `vence en ${dias} días`;
  return `caja ${t.caja} · ${cuando}`;
}
