// Lo que el motor hace con las frases de notas (A2). Recibe las tablas y devuelve el texto de la
// respuesta; `null` = "no es para mí" y la frase sigue al agente. Nunca adivina entre dos opciones.

import type { Notas } from "./notas.ts";
import { normalizarRamo, emparejarRamo } from "./ramos-tipos.ts";
import type { Ramo } from "./ramos-tipos.ts";
import type { Ramos } from "./ramos.ts";
import { calcularRamo, formatearNota, leerNota, notaNecesaria, notaNecesariaExamen } from "./notas-tipos.ts";
import type { Evaluacion } from "./notas-tipos.ts";
import { textoComoVoy, textoEvaluacionCreada, textoExamen, textoNecesaria, textoNotaAnotada, textoSinEvaluaciones } from "./notas-frases.ts";

export type AccionNotas =
  | { intencion: "notas-anotar"; nota: number; cosa: string }
  | { intencion: "notas-evaluaciones"; lista: string }
  | { intencion: "notas-agregar-eval"; evaluacion: string; peso: number; ramo: string }
  | { intencion: "notas-necesaria"; conNota: number | null; evaluacion: string | null; objetivo: string | null; ramo: string | null }
  | { intencion: "notas-como-voy"; ramo: string | null }
  | { intencion: "notas-borrar"; cosa: string }
  | { intencion: "notas-ajuste"; ramo: string; aprobacion: number | null; examenPeso: number | null };

export interface ContextoNotas {
  ramos: Ramos;
  notas: Notas;
  ahoraMs: number;
}

/** «el certamen 1» → «certamen 1». */
function sinArticulo(t: string): string {
  return t.replace(/^(el|la|los|las|un|una|mi)\s+/i, "").trim();
}

/** Un ramo por su nombre o palabra clave; si hay dos que calzan igual, no adivina. */
export function buscarRamo(texto: string, ramos: readonly Ramo[]): Ramo | null {
  const t = sinArticulo(texto);
  if (normalizarRamo(t).length < 2) return null;
  return emparejarRamo(t, ramos) ?? ramos.find((r) => !r.archivado && normalizarRamo(r.nombre) === normalizarRamo(t)) ?? null;
}

/** «certamen 1 de cálculo» → { evaluacion: «certamen 1», ramo }. Prueba cada « de » / « en » como corte. */
export function separarEvaluacionYRamo(texto: string, ramos: readonly Ramo[]): { evaluacion: string | null; ramo: Ramo } | null {
  const completo = buscarRamo(texto, ramos);
  const cortes = [...texto.matchAll(/\s(?:de la|del|de|en la|en el|en)\s/gi)];
  for (const corte of cortes.reverse()) {
    const i = corte.index as number;
    const ramo = buscarRamo(texto.slice(i + corte[0].length), ramos);
    const evaluacion = sinArticulo(texto.slice(0, i));
    if (ramo && evaluacion) return { evaluacion, ramo };
  }
  return completo ? { evaluacion: null, ramo: completo } : null;
}

/** La evaluación de un ramo por su nombre (sin tildes ni mayúsculas). «el 2» toma el nombre de `modelo` con el número cambiado. */
export function buscarEvaluacion(nombre: string, evals: readonly Evaluacion[], modelo: string | null = null): Evaluacion | null {
  let t = normalizarRamo(sinArticulo(nombre));
  const soloNumero = /^\d{1,2}$/.test(t);
  if (soloNumero && modelo) {
    const base = normalizarRamo(sinArticulo(modelo)).replace(/\s*\d{1,2}$/, "");
    if (base) t = `${base} ${t}`;
  }
  const exacta = evals.filter((e) => normalizarRamo(e.nombre) === t);
  if (exacta.length === 1) return exacta[0];
  return null;
}

/** Dónde está una evaluación cuando la frase no nombra el ramo: en un solo ramo → ese; en varios → null. */
function ramoDeEvaluacion(nombre: string, ctx: ContextoNotas, ramos: readonly Ramo[]): Ramo | null {
  const hallados = ramos.filter((r) => !r.archivado && buscarEvaluacion(nombre, ctx.notas.listar(r.id)) !== null);
  return hallados.length === 1 ? hallados[0] : null;
}

function leerPeso(texto: string | undefined): number | null {
  const n = Number((texto ?? "").replace(/[^\d]/g, ""));
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}

/** De las ranuras de una plantilla de notas a una acción (o `null` si no se puede interpretar). */
export function interpretarNotas(intencion: string, ranuras: Partial<Record<string, string>>, originales: Partial<Record<string, string>>): AccionNotas | null {
  const orig = (k: string): string => (originales[k] ?? "").trim();
  switch (intencion) {
    case "notas-anotar": {
      const nota = leerNota(ranuras.nota ?? "");
      return nota === null || orig("cosa").length < 2 ? null : { intencion, nota, cosa: orig("cosa") };
    }
    case "notas-evaluaciones":
      return orig("lista").includes(":") ? { intencion, lista: orig("lista") } : null;
    case "notas-agregar-eval": {
      const peso = leerPeso(ranuras.peso);
      return peso === null ? null : { intencion, evaluacion: sinArticulo(orig("evaluacion")), peso, ramo: orig("ramo") };
    }
    case "notas-necesaria": {
      const conNota = ranuras.nota === undefined ? null : leerNota(ranuras.nota);
      if (ranuras.nota !== undefined && conNota === null) return null;
      return {
        intencion,
        conNota,
        evaluacion: orig("evaluacion") || null,
        objetivo: orig("objetivo") || null,
        ramo: orig("ramo") || null,
      };
    }
    case "notas-como-voy":
      return { intencion, ramo: orig("ramo") || null };
    case "notas-borrar":
      return orig("cosa").length >= 2 ? { intencion, cosa: orig("cosa") } : null;
    case "notas-ajuste": {
      const nota = ranuras.nota === undefined ? null : leerNota(ranuras.nota);
      const peso = ranuras.peso === undefined ? null : leerPeso(ranuras.peso);
      if (nota === null && peso === null) return null;
      return { intencion, ramo: orig("ramo"), aprobacion: nota, examenPeso: peso };
    }
    default:
      return null;
  }
}

/** El examen cuenta como una evaluación pendiente más (no se guarda): así «lo que falta» lo incluye. */
function conExamenVirtual(evals: readonly Evaluacion[], examenPeso: number | null): Evaluacion[] {
  return examenPeso === null ? [...evals] : [...evals, { id: -1, ramoId: evals[0]?.ramoId ?? 0, nombre: "Examen", peso: examenPeso, nota: null, fecha: null }];
}

const NO_ES_EXAMEN = (t: string): boolean => !/^examen\b/.test(normalizarRamo(sinArticulo(t)));

function noEncontreRamo(nombre: string): string {
  return `No encontré un ramo llamado ${nombre}. Dime «mis ramos» para ver los que tienes.`;
}

/** Resuelve el ramo de una frase: el nombrado o, si no se nombra, el único donde existe esa evaluación. */
function resolverRamo(ramoTexto: string | null, evaluacion: string | null, ctx: ContextoNotas): { ramo: Ramo } | { texto: string } {
  const ramos = ctx.ramos.listar();
  if (ramoTexto) {
    const ramo = buscarRamo(ramoTexto, ramos);
    return ramo ? { ramo } : { texto: noEncontreRamo(ramoTexto) };
  }
  const inferido = evaluacion ? ramoDeEvaluacion(evaluacion, ctx, ramos) : null;
  if (inferido) return { ramo: inferido };
  return { texto: "¿De qué ramo? Dímelo así: «… en Cálculo»." };
}

function guardarLista(ramo: Ramo, lista: string, ctx: ContextoNotas): string {
  const creadas: string[] = [];
  const problemas: string[] = [];
  for (const trozo of lista.split(/[,;]|\sy\s/i).map((t) => t.trim()).filter(Boolean)) {
    const m = /^(.+?)\s+(\d{1,3})\s*(?:%|por ciento)?$/i.exec(trozo);
    if (!m) {
      problemas.push(`«${trozo}» (falta el peso)`);
      continue;
    }
    const peso = Number(m[2]);
    if (/^examen\b/i.test(normalizarRamo(m[1]))) {
      const r = ctx.notas.ponerAjustes(ramo.id, { ...ctx.notas.ajustes(ramo.id), examenPeso: peso });
      if (r.ok) creadas.push(`Examen ${peso} %`);
      else problemas.push(`Examen (${r.motivo})`);
      continue;
    }
    const r = ctx.notas.crear(ramo.id, { nombre: m[1], peso }, ctx.ahoraMs);
    if (r.ok) creadas.push(`${r.evaluacion.nombre} ${peso} %`);
    else problemas.push(`${m[1]} (${r.motivo})`);
  }
  const todas = ctx.notas.listar(ramo.id);
  const examen = ctx.notas.ajustes(ramo.id).examenPeso ?? 0;
  const suma = todas.reduce((s, e) => s + e.peso, 0) + examen;
  const partes: string[] = [];
  if (creadas.length > 0) partes.push(`Listo, en ${ramo.nombre} quedó: ${creadas.join(", ")}.`);
  if (problemas.length > 0) partes.push(`No pude con: ${problemas.join("; ")}.`);
  if (creadas.length > 0 && suma !== 100) partes.push(`Ojo: los pesos suman ${suma} %, no 100 %.`);
  return partes.join(" ") || "No entendí ninguna evaluación. Dime «evaluaciones de cálculo: certamen 1 30%, certamen 2 70%».";
}

function listaDe(evals: readonly Evaluacion[]): string {
  return evals.length === 0 ? "ninguna todavía" : evals.map((e) => e.nombre).join(", ");
}

/** Responde una frase de notas, o `null` si no es para el motor (va al agente). */
export function responderNotas(accion: AccionNotas, ctx: ContextoNotas): string | null {
  const ramos = ctx.ramos.listar();
  switch (accion.intencion) {
    case "notas-anotar": {
      const sep = separarEvaluacionYRamo(accion.cosa, ramos);
      if (!sep) return null; // «me saqué un 6 en la foto»: no es de un ramo, no es mío
      if (!sep.evaluacion) return `¿En qué evaluación de ${sep.ramo.nombre}? Dime por ejemplo «me saqué ${formatearNota(accion.nota)} en el certamen 1 de ${sep.ramo.nombre}».`;
      const evals = ctx.notas.listar(sep.ramo.id);
      const e = buscarEvaluacion(sep.evaluacion, evals);
      if (!e) return `No tengo «${sep.evaluacion}» en ${sep.ramo.nombre} (tengo: ${listaDe(evals)}). Dime cuánto pesa: «agrega la evaluación ${sep.evaluacion} de 30% en ${sep.ramo.nombre}» y después anoto la nota.`;
      const r = ctx.notas.ponerNota(e.id, accion.nota);
      return r.ok ? textoNotaAnotada(sep.ramo.nombre, r.evaluacion) : `${r.motivo}.`;
    }
    case "notas-evaluaciones": {
      const corte = accion.lista.indexOf(":");
      const ramo = buscarRamo(accion.lista.slice(0, corte), ramos);
      return ramo ? guardarLista(ramo, accion.lista.slice(corte + 1), ctx) : noEncontreRamo(accion.lista.slice(0, corte).trim());
    }
    case "notas-agregar-eval": {
      const ramo = buscarRamo(accion.ramo, ramos);
      if (!ramo) return noEncontreRamo(accion.ramo);
      if (!NO_ES_EXAMEN(accion.evaluacion)) return guardarLista(ramo, `${accion.evaluacion} ${accion.peso}`, ctx);
      const r = ctx.notas.crear(ramo.id, { nombre: accion.evaluacion, peso: accion.peso }, ctx.ahoraMs);
      return r.ok ? textoEvaluacionCreada(ramo.nombre, r.evaluacion) : `${r.motivo}.`;
    }
    case "notas-borrar": {
      const sep = separarEvaluacionYRamo(accion.cosa, ramos);
      if (!sep || !sep.evaluacion) return null;
      const e = buscarEvaluacion(sep.evaluacion, ctx.notas.listar(sep.ramo.id));
      if (!e) return `No tengo «${sep.evaluacion}» en ${sep.ramo.nombre}.`;
      ctx.notas.ponerNota(e.id, null);
      return `Listo, ${e.nombre} de ${sep.ramo.nombre} quedó pendiente (sin nota).`;
    }
    case "notas-ajuste": {
      const ramo = buscarRamo(accion.ramo, ramos);
      if (!ramo) return noEncontreRamo(accion.ramo);
      const actual = ctx.notas.ajustes(ramo.id);
      const r = ctx.notas.ponerAjustes(ramo.id, { ...actual, aprobacion: accion.aprobacion ?? actual.aprobacion, examenPeso: accion.examenPeso ?? actual.examenPeso });
      if (!r.ok) return `${r.motivo}.`;
      return accion.aprobacion !== null ? `Listo, en ${ramo.nombre} se aprueba con ${formatearNota(accion.aprobacion)}.` : `Listo, el examen de ${ramo.nombre} vale ${accion.examenPeso} %.`;
    }
    case "notas-como-voy":
      return comoVoy(accion.ramo, ctx);
    case "notas-necesaria":
      return necesaria(accion, ctx);
  }
}

function comoVoy(ramoTexto: string | null, ctx: ContextoNotas): string | null {
  const ramos = ctx.ramos.listar();
  if (ramoTexto) {
    const ramo = buscarRamo(ramoTexto, ramos);
    if (!ramo) return noEncontreRamo(ramoTexto);
    const evals = ctx.notas.listar(ramo.id);
    if (evals.length === 0) return textoSinEvaluaciones(ramo.nombre);
    const aj = ctx.notas.ajustes(ramo.id);
    return textoComoVoy(ramo.nombre, calcularRamo(evals, aj));
  }
  const conNotas = ramos.filter((r) => ctx.notas.listar(r.id).length > 0);
  if (conNotas.length === 0) return "Todavía no tengo notas tuyas. Dime «evaluaciones de cálculo: certamen 1 30%, certamen 2 70%» y después «me saqué 5,5 en el certamen 1 de cálculo».";
  return conNotas
    .map((r) => {
      const c = calcularRamo(ctx.notas.listar(r.id), ctx.notas.ajustes(r.id));
      const estado = c.veredicto === "aprobado" ? "aprobado ✅" : c.veredicto === "imposible" ? "no alcanza" : c.veredicto === "sin-pendientes-reprobado" ? "reprobado" : c.necesariaEnPendientes !== null ? `necesitas ${formatearNota(Math.ceil(c.necesariaEnPendientes * 10 - 1e-9) / 10)} en lo que falta` : "en curso";
      return `• ${r.nombre}: ${c.promedio === null ? "sin notas" : formatearNota(c.promedio)} — ${estado}`;
    })
    .join("\n");
}

function necesaria(a: Extract<AccionNotas, { intencion: "notas-necesaria" }>, ctx: ContextoNotas): string | null {
  const quien = resolverRamo(a.ramo, a.objetivo ?? a.evaluacion, ctx);
  // Sin ramo claro y sin evaluación concreta, «cuánto necesito para aprobar» no es del motor.
  if ("texto" in quien) return a.ramo === null && a.objetivo === null && a.evaluacion === null ? null : quien.texto;
  const ramo = quien.ramo;
  const evals = ctx.notas.listar(ramo.id);
  if (evals.length === 0) return textoSinEvaluaciones(ramo.nombre);
  const aj = ctx.notas.ajustes(ramo.id);
  const esExamen = a.objetivo !== null && !NO_ES_EXAMEN(a.objetivo);
  const escenario = new Map<number, number>();
  if (a.conNota !== null && a.evaluacion !== null) {
    const dato = buscarEvaluacion(a.evaluacion, evals);
    if (!dato) return `No tengo «${a.evaluacion}» en ${ramo.nombre} (tengo: ${listaDe(evals)}).`;
    escenario.set(dato.id, a.conNota); // solo para este cálculo: no se guarda nada
  }
  if (esExamen) {
    if (aj.examenPeso === null) return `${ramo.nombre} no tiene examen configurado. Dime «el examen de ${ramo.nombre} vale 30%».`;
    const periodo = evals.map((e) => ({ ...e, nota: escenario.get(e.id) ?? e.nota }));
    const r = notaNecesariaExamen(periodo, aj);
    return r ? textoExamen(ramo.nombre, r) : null;
  }
  if (a.objetivo === null) {
    // «¿cuánto necesito para aprobar cálculo?»: lo que falta en promedio.
    const conEscenario = evals.map((e) => ({ ...e, nota: escenario.get(e.id) ?? e.nota }));
    return textoComoVoy(ramo.nombre, calcularRamo(conEscenario, aj));
  }
  const objetivo = buscarEvaluacion(a.objetivo, evals, a.evaluacion);
  if (!objetivo) return `No tengo «${a.objetivo}» en ${ramo.nombre} (tengo: ${listaDe(evals)}).`;
  // Con examen, ese peso también está pendiente: se suma como evaluación virtual para repartir el esfuerzo.
  const base = conExamenVirtual(evals, aj.examenPeso);
  const r = notaNecesaria(base, objetivo.id, aj, escenario);
  if (!r) return `${objetivo.nombre} de ${ramo.nombre} ya tiene nota. Si quieres, dime «borra la nota de ${objetivo.nombre} de ${ramo.nombre}» y la calculo.`;
  return textoNecesaria(ramo.nombre, objetivo.nombre, r);
}
