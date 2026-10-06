// Metas de ahorro (docs/plan-estudio-y-mejoras.md, «Diseño de metas de ahorro»). Brote ve gastos, no ingresos
// ni saldos: el ahorro es DECLARADO por el usuario («aparté 20 lucas para el viaje») y Brote solo lo anota,
// como una libreta. Nunca mueve plata ni deduce ahorro. Puro y sin Node: también lo usa la ventana.

import { formatearMonto, normalizar } from "./texto.ts";

export type ColorAhorro = "verde" | "ambar" | "rojo";
export type EstadoMeta = "activa" | "cumplida" | "archivada";

export interface MetaAhorro {
  id: number;
  nombre: string;
  /** Lo que se quiere juntar, en pesos. */
  monto: number;
  /** Fecha límite (fin del día en ms) o `null` si no tiene. */
  limiteMs: number | null;
  creadaMs: number;
  estado: EstadoMeta;
}

export interface AporteAhorro {
  id: number;
  metaId: number;
  /** Positivo = aparté; negativo = saqué. */
  monto: number;
  ms: number;
}

export const MAX_METAS_ACTIVAS = 3;
export const MAX_NOMBRE_META = 40;
export const MONTO_MIN_AHORRO = 1000;
export const MONTO_MAX_AHORRO = 1_000_000_000;
/** Hasta dónde se acepta una fecha límite. */
const MAX_ANOS_LIMITE = 10;
/** Nombre que se le da a una meta cuando el usuario no la nombra. */
export const NOMBRE_POR_DEFECTO = "Ahorro";

const DIA = 86_400_000;
const DIAS_POR_MES = 30.4375;
/** Ventana con la que se mide el ritmo real (días) y mínimo de vida de la meta para juzgarlo. */
const VENTANA_RITMO_DIAS = 60;
const MIN_DIAS_PARA_JUZGAR = 14;

export type ResultadoValidacion<T> = { ok: true; valor: T } | { ok: false; motivo: string };

/** Deja el nombre de una meta en una sola línea corta. */
export function limpiarNombreMeta(texto: string): string {
  return texto.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NOMBRE_META).trim();
}

/** La clave para comparar nombres: sin tildes, sin artículos y sin «meta». */
export function claveMeta(nombre: string): string {
  return normalizar(nombre)
    .replace(/\b(la|el|los|las|un|una|mi|mis|del|de|meta|metas)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validarMontoAhorro(monto: unknown, esMeta = false): ResultadoValidacion<number> {
  if (typeof monto !== "number" || !Number.isInteger(monto) || monto < MONTO_MIN_AHORRO || monto > MONTO_MAX_AHORRO) {
    return { ok: false, motivo: `El monto de ${esMeta ? "una meta" : "un aporte"} tiene que estar entre ${formatearMonto(MONTO_MIN_AHORRO)} y ${formatearMonto(MONTO_MAX_AHORRO)}` };
  }
  return { ok: true, valor: monto };
}

export interface NuevaMeta {
  nombre: string;
  monto: number;
  limiteMs: number | null;
}

/** Revisa los datos de una meta nueva. El nombre vacío se vuelve «Ahorro»; una fecha ya pasada no se acepta. */
export function validarMetaAhorro(datos: { nombre?: unknown; monto?: unknown; limiteMs?: unknown }, ahoraMs: number): ResultadoValidacion<NuevaMeta> {
  const monto = validarMontoAhorro(datos.monto, true);
  if (!monto.ok) return monto;
  const nombre = typeof datos.nombre === "string" ? limpiarNombreMeta(datos.nombre) : "";
  let limiteMs: number | null = null;
  if (datos.limiteMs !== null && datos.limiteMs !== undefined) {
    if (typeof datos.limiteMs !== "number" || !Number.isFinite(datos.limiteMs)) return { ok: false, motivo: "La fecha límite no es válida" };
    const tope = new Date(ahoraMs);
    tope.setFullYear(tope.getFullYear() + MAX_ANOS_LIMITE);
    if (datos.limiteMs < ahoraMs) return { ok: false, motivo: "Esa fecha ya pasó" };
    if (datos.limiteMs > tope.getTime()) return { ok: false, motivo: `La fecha límite no puede pasar de ${MAX_ANOS_LIMITE} años` };
    limiteMs = Math.round(datos.limiteMs);
  }
  return { ok: true, valor: { nombre: nombre || NOMBRE_POR_DEFECTO, monto: monto.valor, limiteMs } };
}

/** Lo que se juntó: la suma de los aportes (con retiros), nunca menos que cero. */
export function juntadoAhorro(aportes: readonly AporteAhorro[], metaId: number): number {
  return Math.max(0, aportes.reduce((t, a) => (a.metaId === metaId ? t + a.monto : t), 0));
}

export interface ProgresoMetaAhorro {
  meta: MetaAhorro;
  juntado: number;
  falta: number;
  /** 0 a 1. */
  fraccion: number;
  /** Entero de 0 a 100. */
  porcentaje: number;
  cumplida: boolean;
  /** Meses que quedan hasta la fecha límite (mínimo 1), o `null` sin fecha o ya vencida. */
  mesesQuedan: number | null;
  /** Lo que habría que apartar cada mes para llegar a tiempo. */
  cuotaMensual: number | null;
  /** Lo apartado por mes en los últimos 60 días (o desde que existe la meta), nunca negativo. */
  ritmoMensual: number;
  /** El semáforo; `null` sin fecha límite o cuando aún no hay con qué juzgar. */
  color: ColorAhorro | null;
  /** Cuándo llegarías a ritmo actual (solo si hay ritmo y falta plata). */
  llegariaMs: number | null;
  vencida: boolean;
}

function inicioDia(ms: number, dias = 0): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias).getTime();
}

/** Cuántos meses quedan entre dos momentos (por días de pared, mínimo 1). */
export function mesesHastaAhorro(ahoraMs: number, limiteMs: number): number {
  const dias = Math.round((inicioDia(limiteMs) - inicioDia(ahoraMs)) / DIA);
  return Math.max(1, Math.round(dias / DIAS_POR_MES));
}

/** El avance de una meta con sus aportes. Puro: todo depende de `ahoraMs`. */
export function progresoDeMetaAhorro(meta: MetaAhorro, aportes: readonly AporteAhorro[], ahoraMs: number): ProgresoMetaAhorro {
  const suyos = aportes.filter((a) => a.metaId === meta.id);
  const j = juntadoAhorro(suyos, meta.id);
  const falta = Math.max(0, meta.monto - j);
  const fraccion = Math.min(1, j / meta.monto);
  const cumplida = falta === 0;
  const vencida = meta.limiteMs !== null && meta.limiteMs < ahoraMs && !cumplida;

  const mesesQuedan = meta.limiteMs !== null && !vencida ? mesesHastaAhorro(ahoraMs, meta.limiteMs) : null;
  const cuotaMensual = mesesQuedan !== null && !cumplida ? Math.ceil(falta / mesesQuedan) : null;

  // Ritmo: lo apartado (neto) en la ventana, llevado a un mes. Una meta nueva se mide desde que existe.
  const diasDeVida = Math.max(1, Math.round((ahoraMs - meta.creadaMs) / DIA));
  const ventana = Math.min(VENTANA_RITMO_DIAS, Math.max(diasDeVida, MIN_DIAS_PARA_JUZGAR));
  const netoVentana = suyos.reduce((t, a) => (a.ms >= ahoraMs - ventana * DIA && a.ms <= ahoraMs ? t + a.monto : t), 0);
  const ritmoMensual = Math.max(0, Math.round((netoVentana / ventana) * DIAS_POR_MES));

  let color: ColorAhorro | null = null;
  if (cumplida) color = "verde";
  else if (cuotaMensual !== null) {
    const sinHistoria = diasDeVida < MIN_DIAS_PARA_JUZGAR && ritmoMensual === 0;
    if (!sinHistoria) color = ritmoMensual >= cuotaMensual ? "verde" : ritmoMensual >= cuotaMensual * 0.7 ? "ambar" : "rojo";
  }

  const llegariaMs = !cumplida && ritmoMensual > 0 ? Math.round(ahoraMs + (falta / ritmoMensual) * DIAS_POR_MES * DIA) : null;
  return {
    meta,
    juntado: j,
    falta,
    fraccion,
    porcentaje: Math.floor(fraccion * 100),
    cumplida,
    mesesQuedan,
    cuotaMensual,
    ritmoMensual,
    color,
    llegariaMs,
    vencida,
  };
}

// ---------------------------------------------------------------- buscar una meta por lo que dijo el usuario

/** La meta activa que corresponde a un texto («el viaje», «viaje a la playa»), o `null` si ninguna o varias calzan. */
export function buscarMetaAhorro(texto: string, metas: readonly MetaAhorro[]): MetaAhorro | null {
  const clave = claveMeta(texto);
  if (clave.length < 2) return null;
  const activas = metas.filter((m) => m.estado !== "archivada");
  const exacta = activas.filter((m) => claveMeta(m.nombre) === clave);
  if (exacta.length === 1) return exacta[0];
  if (exacta.length > 1) return null;
  const parecidas = activas.filter((m) => {
    const c = claveMeta(m.nombre);
    return c.length >= 2 && (c.includes(clave) || clave.includes(c));
  });
  return parecidas.length === 1 ? parecidas[0] : null;
}

// ---------------------------------------------------------------- hitos y celebraciones

export const HITOS_AHORRO = [25, 50, 75, 100] as const;

/** Lo ya celebrado: por meta, los hitos avisados. */
export type AvisosAhorro = Record<string, number[]>;

export function leerAvisosAhorro(texto: string | null): AvisosAhorro {
  if (!texto) return {};
  try {
    const v: unknown = JSON.parse(texto);
    if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
    const salida: AvisosAhorro = {};
    for (const [k, lista] of Object.entries(v)) {
      if (/^\d+$/.test(k) && Array.isArray(lista)) salida[k] = lista.filter((n): n is number => HITOS_AHORRO.includes(n as 25));
    }
    return salida;
  } catch {
    return {};
  }
}

function nombreCorto(nombre: string): string {
  return nombre.length > 12 ? `${nombre.slice(0, 11).trimEnd()}…` : nombre;
}

export function textoHitoAhorro(hito: number, nombre: string): string {
  const n = nombreCorto(nombre);
  if (hito >= 100) return `🎉 ¡Meta «${n}» cumplida! 💰`;
  if (hito >= 75) return `💰 ¡75 % de «${n}»! Ya casi 🌱`;
  if (hito >= 50) return `💰 ¡Mitad de «${n}»! Vamos 💪`;
  return `💰 ¡Un cuarto de «${n}»! 🌱`;
}

export interface CelebracionAhorro {
  metaId: number;
  hito: number;
  texto: string;
}

/**
 * Qué hitos celebrar. Si un aporte grande cruza varios a la vez, se celebra solo el más alto (y los de abajo
 * quedan como avisados). Cada hito, una sola vez por meta, aunque después saques plata y la vuelvas a juntar.
 * Nunca hay avisos por atrasarse.
 */
export function celebracionesDeAhorro(progresos: readonly ProgresoMetaAhorro[], previos: AvisosAhorro): { celebrar: CelebracionAhorro[]; guardar: AvisosAhorro } {
  const guardar: AvisosAhorro = {};
  const celebrar: CelebracionAhorro[] = [];
  for (const p of progresos) {
    if (p.meta.estado === "archivada") continue;
    const id = String(p.meta.id);
    const ya = previos[id] ?? [];
    const cruzados = HITOS_AHORRO.filter((h) => (h === 100 ? p.cumplida : p.porcentaje >= h));
    const nuevos = cruzados.filter((h) => !ya.includes(h));
    guardar[id] = [...ya, ...nuevos];
    if (nuevos.length > 0) {
      const hito = Math.max(...nuevos);
      celebrar.push({ metaId: p.meta.id, hito, texto: textoHitoAhorro(hito, p.meta.nombre) });
    }
  }
  return { celebrar, guardar };
}

// ---------------------------------------------------------------- lo que se muestra

export interface ResumenAhorro {
  metas: ProgresoMetaAhorro[];
  /** Lo que habría que apartar este mes para todas las metas con fecha. */
  cuotaTotal: number;
  /** Presupuesto − proyección del mes (negativo = te pasarías); `null` sin presupuesto o sin proyección. */
  holgura: number | null;
  /** La línea de holgura lista para mostrar, o `null`. */
  lineaHolgura: string | null;
  /** «Si dejaras “café” a la mitad, juntarías $X al mes», o `null`. */
  sugerencia: string | null;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function nombreDeMes(ms: number): string {
  return MESES[new Date(ms).getMonth()];
}

/** «marzo» o «marzo de 2027» (con año solo si no es este año). */
export function textoLimite(limiteMs: number, ahoraMs: number): string {
  const f = new Date(limiteMs);
  const mes = MESES[f.getMonth()];
  return f.getFullYear() === new Date(ahoraMs).getFullYear() ? mes : `${mes} de ${f.getFullYear()}`;
}

export function lineaHolgura(cuotaTotal: number, holgura: number | null): string | null {
  if (cuotaTotal <= 0 || holgura === null) return null;
  if (holgura >= cuotaTotal) return `Cabe en tu presupuesto: a este ritmo te sobrarían ${formatearMonto(holgura)} este mes.`;
  return "Ojo: este mes tu presupuesto no deja holgura para esto; mira si algo se puede ajustar.";
}

/** La sugerencia del gasto hormiga: la mitad de lo que suma en 30 días, como ahorro posible al mes. */
export function sugerenciaHormiga(hormiga: { nombre: string; suma: number } | null): string | null {
  if (!hormiga) return null;
  const mitad = Math.round(hormiga.suma / 2 / 100) * 100;
  if (mitad < MONTO_MIN_AHORRO) return null;
  return `Si dejaras «${hormiga.nombre}» a la mitad, juntarías unos ${formatearMonto(mitad)} al mes.`;
}

/** Arma lo que muestra la isla. Las archivadas no aparecen. */
export function resumirAhorro(metas: readonly MetaAhorro[], aportes: readonly AporteAhorro[], ahoraMs: number, contexto: { holgura: number | null; hormiga: { nombre: string; suma: number } | null }): ResumenAhorro {
  const progresos = metas.filter((m) => m.estado !== "archivada").map((m) => progresoDeMetaAhorro(m, aportes, ahoraMs));
  const cuotaTotal = progresos.reduce((t, p) => t + (p.cuotaMensual ?? 0), 0);
  return {
    metas: progresos,
    cuotaTotal,
    holgura: contexto.holgura,
    lineaHolgura: lineaHolgura(cuotaTotal, contexto.holgura),
    sugerencia: progresos.some((p) => !p.cumplida) ? sugerenciaHormiga(contexto.hormiga) : null,
  };
}

/** Presupuesto − lo que proyectas gastar este mes. */
export function holguraDelMes(presupuesto: number | null, proyectado: number | null): number | null {
  return presupuesto !== null && proyectado !== null ? presupuesto - proyectado : null;
}

/** «$45.000 de $150.000 (30 %)» */
export function textoAvance(p: ProgresoMetaAhorro): string {
  return `${formatearMonto(p.juntado)} de ${formatearMonto(p.meta.monto)} (${p.porcentaje} %)`;
}

/** Una meta en una línea: avance, cuota y, si va lento, cuándo llegarías. */
export function describirMetaAhorro(p: ProgresoMetaAhorro, ahoraMs: number): string {
  const nombre = `«${p.meta.nombre}»`;
  if (p.cumplida) return `🎉 ${nombre}: ¡cumplida! Juntaste ${formatearMonto(p.juntado)}.`;
  const partes = [`${nombre}: ${textoAvance(p)}, te faltan ${formatearMonto(p.falta)}.`];
  if (p.meta.limiteMs !== null && p.vencida) partes.push(`La fecha (${textoLimite(p.meta.limiteMs, ahoraMs)}) ya pasó; si quieres, la archivo o la dejo igual.`);
  else if (p.cuotaMensual !== null && p.mesesQuedan !== null && p.meta.limiteMs !== null) {
    partes.push(`Para ${textoLimite(p.meta.limiteMs, ahoraMs)} serían ${formatearMonto(p.cuotaMensual)} al mes (${p.mesesQuedan} ${p.mesesQuedan === 1 ? "mes" : "meses"}).`);
    if (p.color === "ambar" || p.color === "rojo") {
      partes.push(p.llegariaMs !== null ? `A tu ritmo actual llegarías en ${textoLimite(p.llegariaMs, ahoraMs)}.` : "Todavía no hay aportes recientes para calcular tu ritmo.");
    }
  }
  return partes.join(" ");
}

export const TEXTO_SIN_METAS = "Todavía no tienes metas de ahorro. Dime «quiero juntar 150 lucas para marzo» y las seguimos juntos 🌱 (yo solo anoto lo que tú dices que apartaste).";

/** Todas las metas, con la holgura y la sugerencia si las hay. */
export function describirAhorro(r: ResumenAhorro, ahoraMs: number): string {
  if (r.metas.length === 0) return TEXTO_SIN_METAS;
  const lineas = r.metas.map((p) => describirMetaAhorro(p, ahoraMs));
  if (r.lineaHolgura) lineas.push(r.lineaHolgura);
  if (r.sugerencia) lineas.push(r.sugerencia);
  return lineas.join("\n");
}
