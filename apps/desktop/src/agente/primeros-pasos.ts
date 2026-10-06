// «Primeros pasos» (bloque F de docs/plan-estudio-y-mejoras.md): una tarjeta en Inicio, solo para quien
// terminó el asistente de primera vez, con 4 cosas para probar con un toque y, la primera semana,
// una sugerencia por día. Sin DOM: la lógica se prueba con Node; el panel solo la pinta.
//
// Reglas (no presionar): se tacha sola cuando el usuario hace algo equivalente; se oculta con
// «Ocultar»; desaparece al completar los pasos y a los 7 días; nunca avisa ni suena.
// Se guarda en `localStorage` (clave `brote.primeros-pasos`): no es un dato personal.

import type { IdFuncion } from "./funciones.ts";
import { type AlmacenPreferencias, leerTexto, guardarTexto } from "./preferencias.ts";

export const CLAVE_PRIMEROS_PASOS = "brote.primeros-pasos";

/** Pasados estos días desde que terminó el asistente, la tarjeta ya no aparece. */
export const DIAS_DE_PRIMEROS_PASOS = 7;

const DIA_MS = 24 * 60 * 60 * 1000;

export interface Sugerencia {
  id: string;
  /** La función que tiene que estar prendida (`null`: sirve siempre). */
  funcion: IdFuncion | null;
  /** Lo que se explica en una línea. */
  texto: string;
  /** La frase que se deja escrita en el campo (con el cursor al final). */
  frase: string;
  /** Qué intenciones del motor la dan por hecha. */
  intencion: RegExp;
  /** Otro paso que tiene que estar hecho antes (por ejemplo, el ramo, para hablar de sus notas). */
  requiere?: string;
}

/** Las 4 cosas de partida. El orden es el de la tarjeta. */
export const PASOS: readonly Sugerencia[] = [
  { id: "gasto", funcion: "gastos", texto: "Anota un gasto", frase: "gasté 3 lucas en el almuerzo", intencion: /^registrar-gasto$/ },
  { id: "pomodoro", funcion: "temporizadores", texto: "Parte un pomodoro", frase: "pomodoro de 25 para cálculo", intencion: /^pomodoro$/ },
  { id: "ramo", funcion: "estudio", texto: "Agrega un ramo", frase: "agrega el ramo cálculo", intencion: /^ramos-agregar$/ },
  { id: "memoria", funcion: null, texto: "Mira lo que Brote sabe de ti", frase: "¿qué sabes de mí?", intencion: /^ver-memoria$/ },
];

/** Un uso nuevo por día durante la primera semana (de las funciones que el usuario prendió). */
export const SUGERENCIAS: readonly Sugerencia[] = [
  { id: "resumen", funcion: null, texto: "Pídele el resumen de tu día", frase: "dame el resumen del día", intencion: /^resumen-dia$/ },
  { id: "semana-gasto", funcion: "gastos", texto: "Mira cuánto llevas esta semana", frase: "¿cuánto llevo esta semana?", intencion: /^consultar-gastos$/ },
  { id: "presupuesto", funcion: "gastos", texto: "Ponle un presupuesto al mes", frase: "mi presupuesto es ", intencion: /^presupuesto-/ },
  { id: "agenda", funcion: "calendario", texto: "Pregúntale qué tienes hoy", frase: "¿qué tengo hoy?", intencion: /^calendario-/ },
  { id: "entregas", funcion: "aula", texto: "Mira tus próximas entregas", frase: "¿qué entregas tengo?", intencion: /^aula-/ },
  { id: "notas", funcion: "estudio", texto: "Anota una nota y mira cuánto necesitas", frase: "evaluaciones de cálculo: certamen 1 30%, certamen 2 30%, examen 40%", intencion: /^notas-/, requiere: "ramo" },
  { id: "musica", funcion: "musica", texto: "Pregúntale qué está sonando", frase: "¿qué está sonando?", intencion: /^musica-/ },
  { id: "descargas", funcion: "descargas", texto: "Mira tus últimas descargas", frase: "mis descargas", intencion: /^(ver-descargas|abrir-ultima-descarga)$/ },
  { id: "equipo", funcion: "equipo", texto: "Pregúntale cómo está tu computador", frase: "¿cómo está el computador?", intencion: /^estado-equipo$/ },
  { id: "recordatorio", funcion: "temporizadores", texto: "Pídele un recordatorio", frase: "recuérdame en 10 minutos tomar agua", intencion: /^temporizador$/ },
];

export interface EstadoPrimerosPasos {
  /** Cuándo terminó el asistente (ms). */
  desde: number;
  hechos: string[];
  /** Las sugerencias que el usuario descartó. */
  descartadas: string[];
  /** El usuario tocó «Ocultar». */
  oculta: boolean;
}

/** Lo que la tarjeta muestra ahora. `null`: no hay tarjeta. */
export interface VistaPrimerosPasos {
  pasos: { id: string; texto: string; frase: string; hecho: boolean }[];
  /** La sugerencia de hoy, si queda alguna. */
  sugerencia: { id: string; texto: string; frase: string } | null;
}

/** El asistente terminó: desde ahora corre la primera semana. Quien ya usaba Brote nunca llega aquí. */
export function iniciarPrimerosPasos(almacen: AlmacenPreferencias, ahora: number): void {
  const estado: EstadoPrimerosPasos = { desde: ahora, hechos: [], descartadas: [], oculta: false };
  guardarTexto(almacen, CLAVE_PRIMEROS_PASOS, JSON.stringify(estado));
}

/** Lee lo guardado; sin dato (o dato roto) no hay primeros pasos. */
export function leerPrimerosPasos(almacen: AlmacenPreferencias): EstadoPrimerosPasos | null {
  const texto = leerTexto(almacen, CLAVE_PRIMEROS_PASOS);
  if (!texto) return null;
  try {
    const crudo = JSON.parse(texto) as Partial<EstadoPrimerosPasos>;
    if (typeof crudo.desde !== "number" || !Number.isFinite(crudo.desde)) return null;
    const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return { desde: crudo.desde, hechos: lista(crudo.hechos), descartadas: lista(crudo.descartadas), oculta: crudo.oculta === true };
  } catch {
    return null;
  }
}

function guardar(almacen: AlmacenPreferencias, estado: EstadoPrimerosPasos): void {
  guardarTexto(almacen, CLAVE_PRIMEROS_PASOS, JSON.stringify(estado));
}

/** El día de uso (0 el día en que terminó el asistente). */
export function diaDeUso(estado: EstadoPrimerosPasos, ahora: number): number {
  return Math.max(0, Math.floor((ahora - estado.desde) / DIA_MS));
}

/**
 * Un mensaje resuelto sin IA: tacha el paso o la sugerencia que le corresponde. Devuelve si algo
 * cambió (para que el panel se repinte solo entonces).
 */
export function marcarPorIntencion(almacen: AlmacenPreferencias, intencion: string): boolean {
  const estado = leerPrimerosPasos(almacen);
  if (!estado) return false;
  const nuevos = [...PASOS, ...SUGERENCIAS].filter((s) => s.intencion.test(intencion) && !estado.hechos.includes(s.id)).map((s) => s.id);
  if (nuevos.length === 0) return false;
  guardar(almacen, { ...estado, hechos: [...estado.hechos, ...nuevos] });
  return true;
}

/** «Ocultar»: la tarjeta no vuelve. */
export function ocultarPrimerosPasos(almacen: AlmacenPreferencias): void {
  const estado = leerPrimerosPasos(almacen);
  if (estado) guardar(almacen, { ...estado, oculta: true });
}

/** «No me sirve»: esa sugerencia no vuelve (la de mañana será otra). */
export function descartarSugerencia(almacen: AlmacenPreferencias, id: string): void {
  const estado = leerPrimerosPasos(almacen);
  if (estado && !estado.descartadas.includes(id)) guardar(almacen, { ...estado, descartadas: [...estado.descartadas, id] });
}

/**
 * La sugerencia de hoy: una de las que sirven con las funciones prendidas, que el usuario no haya
 * hecho ni descartado. Rota por día (la misma durante todo el día, otra mañana).
 */
export function sugerenciaDelDia(estado: EstadoPrimerosPasos, activas: Record<IdFuncion, boolean>, ahora: number): Sugerencia | null {
  const posibles = SUGERENCIAS.filter(
    (s) => (s.funcion === null || activas[s.funcion]) && (!s.requiere || estado.hechos.includes(s.requiere)) && !estado.hechos.includes(s.id) && !estado.descartadas.includes(s.id),
  );
  if (posibles.length === 0) return null;
  return posibles[diaDeUso(estado, ahora) % posibles.length];
}

/** Lo que muestra la tarjeta (o `null` si no corresponde mostrarla). */
export function vistaPrimerosPasos(estado: EstadoPrimerosPasos | null, activas: Record<IdFuncion, boolean>, ahora: number): VistaPrimerosPasos | null {
  if (!estado || estado.oculta) return null;
  if (diaDeUso(estado, ahora) >= DIAS_DE_PRIMEROS_PASOS) return null;
  const pasos = PASOS.filter((p) => p.funcion === null || activas[p.funcion]).map((p) => ({
    id: p.id,
    texto: p.texto,
    frase: p.frase,
    hecho: estado.hechos.includes(p.id),
  }));
  const completos = pasos.every((p) => p.hecho);
  const sugerida = sugerenciaDelDia(estado, activas, ahora);
  const sugerencia = sugerida ? { id: sugerida.id, texto: sugerida.texto, frase: sugerida.frase } : null;
  if (completos && !sugerencia) return null;
  return { pasos: completos ? [] : pasos, sugerencia };
}

/** Lo que dice el campo cuando no hay conexión con la IA (F1: «Empezar sin IA»). */
export function textoCampoSinConexion(sinIA: boolean): string {
  return sinIA ? "Sin IA por ahora: prueba una frase con ⚡…" : "Sin OpenClaw: solo las frases con ⚡…";
}
