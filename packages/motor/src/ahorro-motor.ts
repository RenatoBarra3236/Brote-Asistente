// Lo que el motor hace con las frases de metas de ahorro («quiero juntar 150 lucas para marzo», «aparté 20 lucas
// para el viaje», «¿cómo van mis metas?»). Devuelve el texto; `null` = «no es para mí» y la frase sigue al agente.
// Nunca adivina entre dos metas y nunca mueve plata: solo anota lo que el usuario dice.

import type { Ahorro } from "./ahorro.ts";
import { buscarMetaAhorro, describirAhorro, describirMetaAhorro, limpiarNombreMeta, progresoDeMetaAhorro, textoAvance, textoLimite, NOMBRE_POR_DEFECTO } from "./ahorro-tipos.ts";
import type { MetaAhorro, ResumenAhorro } from "./ahorro-tipos.ts";
import { leerMes } from "./fechas.ts";
import { leerMonto } from "./montos.ts";
import { formatearMonto } from "./texto.ts";

export type AccionAhorro =
  | { intencion: "ahorro-crear"; monto: number; nombre: string | null; mes: string | null }
  | { intencion: "ahorro-aportar" | "ahorro-retirar"; monto: number; cosa: string | null }
  | { intencion: "ahorro-como"; cosa: string | null }
  | { intencion: "ahorro-archivar"; cosa: string };

export interface ContextoAhorro {
  ahorro: Ahorro;
  ahoraMs: number;
  /** El resumen con la holgura del mes y la sugerencia (lo arma el motor con los gastos). */
  resumen: () => ResumenAhorro;
}

function sinArticulo(texto: string): string {
  return texto.replace(/^(?:el|la|los|las|un|una|mi|mis)\s+/i, "").trim();
}

function mayuscula(texto: string): string {
  return texto.length === 0 ? texto : texto[0].toUpperCase() + texto.slice(1);
}

export function interpretarAhorro(intencion: string, ranuras: Partial<Record<string, string>>, originales: Partial<Record<string, string>>): AccionAhorro | null {
  const cosa = originales.cosa ? limpiarNombreMeta(sinArticulo(originales.cosa.trim())) : "";
  const monto = ranuras.monto === undefined ? null : leerMonto(ranuras.monto);
  switch (intencion) {
    case "ahorro-crear":
      return monto === null ? null : { intencion, monto, nombre: cosa ? mayuscula(cosa) : null, mes: ranuras.mes ?? null };
    case "ahorro-aportar":
    case "ahorro-retirar":
      return monto === null ? null : { intencion, monto, cosa: cosa || null };
    case "ahorro-como":
      return { intencion, cosa: cosa || null };
    case "ahorro-archivar":
      return cosa ? { intencion, cosa } : null;
    default:
      return null;
  }
}

function nombresDe(metas: readonly MetaAhorro[]): string {
  return metas.map((m) => `«${m.nombre}»`).join(", ");
}

export function responderAhorro(accion: AccionAhorro, ctx: ContextoAhorro): string | null {
  const { ahorro, ahoraMs } = ctx;
  const metas = ahorro.metas();

  if (accion.intencion === "ahorro-crear") {
    let limiteMs: number | null = null;
    if (accion.mes !== null) {
      limiteMs = leerMes(accion.mes, ahoraMs);
      if (limiteMs === null) return "Ese mes ya pasó: dime un mes que todavía no termine (por ejemplo «para diciembre») 🌱";
    }
    const r = ahorro.crear({ nombre: accion.nombre ?? NOMBRE_POR_DEFECTO, monto: accion.monto, limiteMs }, ahoraMs);
    if (!r.ok) return `${r.motivo}.`;
    const p = progresoDeMetaAhorro(r.meta, [], ahoraMs);
    const cuota = p.cuotaMensual !== null && p.mesesQuedan !== null ? ` Para ${textoLimite(r.meta.limiteMs as number, ahoraMs)} serían unos ${formatearMonto(p.cuotaMensual)} al mes.` : "";
    return `Listo, meta «${r.meta.nombre}»: ${formatearMonto(r.meta.monto)}.${cuota} Cuando apartes plata, dime «aparté 20 lucas para ${r.meta.nombre.toLowerCase()}» y la anoto (yo solo llevo la cuenta de lo que me dices: no muevo plata) 🌱`;
  }

  if (accion.intencion === "ahorro-como") {
    if (accion.cosa === null) return describirAhorro(ctx.resumen(), ahoraMs);
    const meta = buscarMetaAhorro(accion.cosa, metas);
    if (!meta) return null;
    const p = ctx.resumen().metas.find((x) => x.meta.id === meta.id);
    return p ? describirMetaAhorro(p, ahoraMs) : null;
  }

  if (accion.intencion === "ahorro-archivar") {
    const meta = buscarMetaAhorro(accion.cosa, metas);
    if (!meta) return null;
    ahorro.archivar(meta.id);
    return `Listo, archivé la meta «${meta.nombre}». Lo que habías juntado queda guardado: si quieres borrarlo, está en «Lo que sé de ti» 🌱`;
  }

  // Aportar o retirar.
  const sacar = accion.intencion === "ahorro-retirar";
  let meta: MetaAhorro | null;
  if (accion.cosa === null) {
    const activas = metas.filter((m) => m.estado === "activa");
    if (activas.length === 0) return "Todavía no tienes una meta de ahorro a la que sumar. Dime «quiero juntar 150 lucas para marzo» y la creo 🌱";
    if (activas.length > 1) return `¿Para cuál meta? Tienes ${nombresDe(activas)}. Dime por ejemplo «aparté ${formatearMonto(accion.monto)} para ${activas[0].nombre.toLowerCase()}».`;
    meta = activas[0];
  } else {
    meta = buscarMetaAhorro(accion.cosa, metas);
    if (!meta) return metas.length > 0 ? `No encontré una meta llamada «${accion.cosa}». Tus metas: ${nombresDe(metas)}.` : null;
  }
  const r = ahorro.aportar(meta.id, sacar ? -accion.monto : accion.monto, ahoraMs);
  if (!r.ok) return `${r.motivo}.`;
  const p = progresoDeMetaAhorro(r.meta, ahorro.aportes(), ahoraMs);
  const verbo = sacar ? `Anotado: sacaste ${formatearMonto(accion.monto)} de` : `Anotado: ${formatearMonto(accion.monto)} para`;
  const cierre = p.cumplida ? "¡Cumpliste tu meta! 🎉" : `Te faltan ${formatearMonto(p.falta)}.`;
  return `${verbo} «${meta.nombre}». Llevas ${textoAvance(p)}. ${cierre}`;
}
