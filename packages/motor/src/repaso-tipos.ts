// Resumen y tarjetas de repaso (A3 de docs/plan-estudio-y-mejoras.md). Parte pura, sin Node: la usan el
// motor, el puente y la ventana. El agente de Brote PROPONE un kit (temas, glosario, preguntas) sacado de
// una transcripción; el usuario acepta lo que quiere y eso se repasa con cajas tipo Leitner.
// Nada del texto de la clase se copia: son frases cortas del agente, con topes de largo.

export const MAX_TEMAS = 8;
export const MAX_PUNTOS = 5;
export const MAX_TITULO_TEMA = 80;
export const MAX_PUNTO = 160;
export const MAX_TERMINOS = 20;
export const MAX_TERMINO = 60;
export const MAX_DEFINICION = 200;
export const MAX_PREGUNTAS = 20;
export const MAX_PREGUNTA = 200;
export const MAX_RESPUESTA = 300;
/** Tarjetas de una sesión de repaso. */
export const TOPE_SESION = 15;
/** Una propuesta sin decidir se descarta a los 14 días. */
export const DIAS_PROPUESTA = 14;

export interface Tema {
  titulo: string;
  puntos: string[];
}
export interface Termino {
  termino: string;
  definicion: string;
}
export interface Pregunta {
  pregunta: string;
  respuesta: string;
}
export interface Kit {
  temas: Tema[];
  glosario: Termino[];
  preguntas: Pregunta[];
}

export type TipoTarjeta = "termino" | "pregunta";
export interface Tarjeta {
  id: number;
  grabacion: string;
  ramoId: number | null;
  tipo: TipoTarjeta;
  frente: string;
  reverso: string;
  /** 1 a 5 (cajas de Leitner). */
  caja: number;
  /** Comienzo (00:00 local) del día en que vence. */
  proximoMs: number;
  ultimaMs: number | null;
  aciertos: number;
  fallos: number;
}
export interface ResumenGuardado {
  id: number;
  grabacion: string;
  ramoId: number | null;
  temas: Tema[];
  creadoMs: number;
}
export interface PropuestaRepaso {
  grabacion: string;
  ramoId: number | null;
  kit: Kit;
  creadaMs: number;
}

/** Qué marcó el usuario al aceptar: posiciones (desde 0) de lo que se queda y, opcional, el texto corregido. */
export interface DecisionRepaso {
  temas: number[];
  glosario: number[];
  preguntas: number[];
  ramoId: number | null;
  /** Textos corregidos en la isla, por posición (solo se aceptan los de lo marcado). */
  glosarioEditado?: Record<number, Termino>;
  preguntasEditado?: Record<number, Pregunta>;
}

export type Resultado = "no-sabia" | "casi" | "sabia";
export const RESULTADOS: readonly Resultado[] = ["no-sabia", "casi", "sabia"];

/** Días hasta el próximo repaso según la caja (1 a 5). */
export const INTERVALOS_DIAS: readonly number[] = [1, 3, 7, 14, 30];
export const CAJA_MAX = INTERVALOS_DIAS.length;

export function limpiarFrase(texto: unknown): string {
  // Sin saltos de línea ni caracteres de control: es el texto de una fila o una tarjeta.
  return typeof texto === "string" ? texto.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim() : "";
}

function clave(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export interface ResultadoKit {
  ok: boolean;
  kit: Kit;
  /** Lo que se dejó fuera y por qué (el agente lo ve y puede corregir). */
  rechazadas: string[];
  motivo?: string;
}

/** Revisa lo que propone el agente. Lo demasiado largo o repetido se deja fuera con su motivo; nunca se recorta. */
export function validarKit(entrada: unknown): ResultadoKit {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const rechazadas: string[] = [];
  const kit: Kit = { temas: [], glosario: [], preguntas: [] };
  const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  const vistosTema = new Set<string>();
  for (const t of lista(e.temas)) {
    const o = (t ?? {}) as Record<string, unknown>;
    const titulo = limpiarFrase(o.titulo);
    if (titulo.length < 3 || titulo.length > MAX_TITULO_TEMA) {
      rechazadas.push(`tema sin título válido (3 a ${MAX_TITULO_TEMA} letras)`);
      continue;
    }
    if (kit.temas.length >= MAX_TEMAS) {
      rechazadas.push(`tema «${titulo}»: más de ${MAX_TEMAS} temas`);
      continue;
    }
    if (vistosTema.has(clave(titulo))) continue;
    const puntos: string[] = [];
    for (const p of lista(o.puntos)) {
      const punto = limpiarFrase(p);
      if (punto.length < 3) continue;
      if (punto.length > MAX_PUNTO) {
        rechazadas.push(`un punto de «${titulo}» pasa de ${MAX_PUNTO} letras`);
        continue;
      }
      if (puntos.length >= MAX_PUNTOS) {
        rechazadas.push(`«${titulo}»: más de ${MAX_PUNTOS} puntos`);
        break;
      }
      puntos.push(punto);
    }
    if (puntos.length === 0) {
      rechazadas.push(`tema «${titulo}» sin puntos`);
      continue;
    }
    vistosTema.add(clave(titulo));
    kit.temas.push({ titulo, puntos });
  }

  const vistosTermino = new Set<string>();
  for (const g of lista(e.glosario)) {
    const o = (g ?? {}) as Record<string, unknown>;
    const termino = limpiarFrase(o.termino);
    const definicion = limpiarFrase(o.definicion);
    if (termino.length < 2 || termino.length > MAX_TERMINO || definicion.length < 3 || definicion.length > MAX_DEFINICION) {
      rechazadas.push(`término «${termino.slice(0, 30)}»: término de 2 a ${MAX_TERMINO} y definición de 3 a ${MAX_DEFINICION} letras`);
      continue;
    }
    if (kit.glosario.length >= MAX_TERMINOS) {
      rechazadas.push(`término «${termino}»: más de ${MAX_TERMINOS} términos`);
      continue;
    }
    if (vistosTermino.has(clave(termino))) continue;
    vistosTermino.add(clave(termino));
    kit.glosario.push({ termino, definicion });
  }

  const vistasPregunta = new Set<string>();
  for (const q of lista(e.preguntas)) {
    const o = (q ?? {}) as Record<string, unknown>;
    const pregunta = limpiarFrase(o.pregunta);
    const respuesta = limpiarFrase(o.respuesta);
    if (pregunta.length < 5 || pregunta.length > MAX_PREGUNTA || respuesta.length < 1 || respuesta.length > MAX_RESPUESTA) {
      rechazadas.push(`pregunta «${pregunta.slice(0, 30)}»: pregunta de 5 a ${MAX_PREGUNTA} y respuesta de 1 a ${MAX_RESPUESTA} letras`);
      continue;
    }
    if (kit.preguntas.length >= MAX_PREGUNTAS) {
      rechazadas.push(`pregunta «${pregunta.slice(0, 30)}»: más de ${MAX_PREGUNTAS} preguntas`);
      continue;
    }
    if (vistasPregunta.has(clave(pregunta))) continue;
    vistasPregunta.add(clave(pregunta));
    kit.preguntas.push({ pregunta, respuesta });
  }

  const hay = kit.temas.length + kit.glosario.length + kit.preguntas.length > 0;
  return hay ? { ok: true, kit, rechazadas } : { ok: false, kit, rechazadas, motivo: "No quedó nada válido que proponer" };
}

/** Revisa la decisión que llega de la isla (posiciones dentro del kit y textos corregidos). */
export function validarDecision(entrada: unknown, kit: Kit): { ok: true; decision: DecisionRepaso } | { ok: false; motivo: string } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const posiciones = (v: unknown, largo: number): number[] | null => {
    if (!Array.isArray(v)) return [];
    const vistos = new Set<number>();
    for (const n of v) {
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n >= largo) return null;
      vistos.add(n);
    }
    return [...vistos].sort((a, b) => a - b);
  };
  const temas = posiciones(e.temas, kit.temas.length);
  const glosario = posiciones(e.glosario, kit.glosario.length);
  const preguntas = posiciones(e.preguntas, kit.preguntas.length);
  if (!temas || !glosario || !preguntas) return { ok: false, motivo: "Una posición no existe en la propuesta" };
  const ramoId = typeof e.ramoId === "number" && Number.isInteger(e.ramoId) ? e.ramoId : null;

  const decision: DecisionRepaso = { temas, glosario, preguntas, ramoId };
  // Correcciones hechas en la isla: mismas reglas de largo que las del agente, solo de lo que se acepta.
  const gl = (e.glosarioEditado ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(gl)) {
    const i = Number(k);
    if (!glosario.includes(i)) continue;
    const o = (v ?? {}) as Record<string, unknown>;
    const termino = limpiarFrase(o.termino);
    const definicion = limpiarFrase(o.definicion);
    if (termino.length < 2 || termino.length > MAX_TERMINO || definicion.length < 3 || definicion.length > MAX_DEFINICION) return { ok: false, motivo: "Un término corregido no cumple los largos" };
    (decision.glosarioEditado ??= {})[i] = { termino, definicion };
  }
  const pr = (e.preguntasEditado ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(pr)) {
    const i = Number(k);
    if (!preguntas.includes(i)) continue;
    const o = (v ?? {}) as Record<string, unknown>;
    const pregunta = limpiarFrase(o.pregunta);
    const respuesta = limpiarFrase(o.respuesta);
    if (pregunta.length < 5 || pregunta.length > MAX_PREGUNTA || respuesta.length < 1 || respuesta.length > MAX_RESPUESTA) return { ok: false, motivo: "Una pregunta corregida no cumple los largos" };
    (decision.preguntasEditado ??= {})[i] = { pregunta, respuesta };
  }
  return { ok: true, decision };
}

// ---- Repaso espaciado (cajas de Leitner) --------------------------------------------------------------

/** 00:00 local del día de `ms`, más `dias` días (en hora de pared: respeta el cambio de hora). */
export function inicioDelDia(ms: number, dias = 0): number {
  const f = new Date(ms);
  return new Date(f.getFullYear(), f.getMonth(), f.getDate() + dias).getTime();
}

/** Último instante del día local de `ms`. */
export function finDelDia(ms: number): number {
  return inicioDelDia(ms, 1) - 1;
}

/** Caja y día de vencimiento después de contestar. «No sabía» vuelve a la caja 1 (mañana); «Casi» se queda. */
export function siguienteEstado(caja: number, resultado: Resultado, ahoraMs: number): { caja: number; proximoMs: number } {
  const actual = Math.min(CAJA_MAX, Math.max(1, Math.trunc(caja) || 1));
  const nueva = resultado === "sabia" ? Math.min(CAJA_MAX, actual + 1) : resultado === "casi" ? actual : 1;
  return { caja: nueva, proximoMs: inicioDelDia(ahoraMs, INTERVALOS_DIAS[nueva - 1]) };
}

export function venceHoy(t: Pick<Tarjeta, "proximoMs">, ahoraMs: number): boolean {
  return t.proximoMs <= finDelDia(ahoraMs);
}

/** Las tarjetas de la sesión de hoy: las que vencen, lo más atrasado primero, con tope. */
export function colaDelDia(tarjetas: readonly Tarjeta[], ahoraMs: number, tope = TOPE_SESION, ramoId?: number): Tarjeta[] {
  return tarjetas
    .filter((t) => venceHoy(t, ahoraMs) && (ramoId === undefined || t.ramoId === ramoId))
    .sort((a, b) => a.proximoMs - b.proximoMs || a.id - b.id)
    .slice(0, tope);
}

export interface ResumenRepaso {
  total: number;
  hoy: number;
}

export function resumirRepaso(tarjetas: readonly Tarjeta[], ahoraMs: number): ResumenRepaso {
  return { total: tarjetas.length, hoy: tarjetas.filter((t) => venceHoy(t, ahoraMs)).length };
}

// ---- Lo que ve la isla -------------------------------------------------------------------------------

export interface RepasoDeRamo {
  ramoId: number | null;
  total: number;
  hoy: number;
}

/** Todo lo que la pestaña Estudio necesita: propuestas pendientes, tarjetas que vencen y cuántas hay por ramo. */
export interface EstadoRepaso {
  propuestas: PropuestaRepaso[];
  /** Tarjetas que vencen hoy (como mucho 100; la isla arma cada sesión con `colaDelDia`). */
  deHoy: Tarjeta[];
  porRamo: RepasoDeRamo[];
  total: number;
  hoy: number;
  resumenes: ResumenGuardado[];
}

export const MAX_DE_HOY = 100;

export function armarEstadoRepaso(tarjetas: readonly Tarjeta[], propuestas: readonly PropuestaRepaso[], resumenes: readonly ResumenGuardado[], ahoraMs: number): EstadoRepaso {
  const porRamo = new Map<number | null, RepasoDeRamo>();
  for (const t of tarjetas) {
    const r = porRamo.get(t.ramoId) ?? { ramoId: t.ramoId, total: 0, hoy: 0 };
    r.total++;
    if (venceHoy(t, ahoraMs)) r.hoy++;
    porRamo.set(t.ramoId, r);
  }
  const deHoy = tarjetas.filter((t) => venceHoy(t, ahoraMs)).sort((a, b) => a.proximoMs - b.proximoMs || a.id - b.id).slice(0, MAX_DE_HOY);
  const { total, hoy } = resumirRepaso(tarjetas, ahoraMs);
  return { propuestas: [...propuestas], deHoy, porRamo: [...porRamo.values()], total, hoy, resumenes: [...resumenes] };
}
