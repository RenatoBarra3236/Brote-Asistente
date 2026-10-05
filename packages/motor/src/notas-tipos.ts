// Tipos y cálculos puros de las notas (A2 de docs/plan-estudio-y-mejoras.md). Sin Node: también los
// usa la ventana. Escala chilena 1,0–7,0; la nota de aprobación es configurable por ramo.

export const NOTA_MIN = 1;
export const NOTA_MAX = 7;
export const APROBACION_POR_DEFECTO = 4;
export const MAX_EVALUACIONES_POR_RAMO = 30;
export const MAX_NOMBRE_EVALUACION = 60;

export interface Evaluacion {
  id: number;
  ramoId: number;
  nombre: string;
  /** Porcentaje entero 1–100. */
  peso: number;
  /** 1,0–7,0 con un decimal, o null si está pendiente. */
  nota: number | null;
  /** AAAA-MM-DD opcional. */
  fecha: string | null;
}

export interface AjustesNotas {
  aprobacion: number;
  /** Peso del examen en la nota final (%), o null si el ramo no tiene examen. */
  examenPeso: number | null;
  examenMinimo: number | null;
  presentacionMinima: number | null;
}

export const AJUSTES_POR_DEFECTO: AjustesNotas = { aprobacion: APROBACION_POR_DEFECTO, examenPeso: null, examenMinimo: null, presentacionMinima: null };

/** Redondea a un decimal. */
export function redondear1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Una nota es válida si está entre 1,0 y 7,0. Se guarda con un decimal. */
export function validarNota(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n < NOTA_MIN || n > NOTA_MAX) return null;
  return redondear1(n);
}

/** «5,5», «5.5» o «5» → 5,5. Cualquier otra cosa o fuera de la escala → null. */
export function leerNota(texto: string): number | null {
  const t = texto.trim();
  if (!/^\d(?:[.,]\d{1,2})?$/.test(t)) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < NOTA_MIN || n > NOTA_MAX) return null;
  return n;
}

/** Texto de una nota: 5,5 (coma chilena). */
export function formatearNota(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

export type ResultadoEvaluacion = { ok: true; nombre: string; peso: number; nota: number | null; fecha: string | null } | { ok: false; motivo: string };

function limpiarLinea(t: unknown, largo: number): string {
  return typeof t === "string" ? t.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, largo) : "";
}

/** Valida lo que llega para crear o editar una evaluación (de la isla, del motor o del agente). */
export function validarEvaluacion(entrada: unknown): ResultadoEvaluacion {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const nombre = limpiarLinea(e.nombre, MAX_NOMBRE_EVALUACION);
  if (nombre.length < 2) return { ok: false, motivo: "Falta el «nombre» de la evaluación (por ejemplo «Certamen 1»)" };
  const peso = e.peso;
  if (typeof peso !== "number" || !Number.isInteger(peso) || peso < 1 || peso > 100) return { ok: false, motivo: "El «peso» debe ser un porcentaje entero entre 1 y 100" };
  let nota: number | null = null;
  if (e.nota !== undefined && e.nota !== null) {
    nota = validarNota(e.nota);
    if (nota === null) return { ok: false, motivo: "La «nota» debe estar entre 1,0 y 7,0" };
  }
  let fecha: string | null = null;
  if (e.fecha !== undefined && e.fecha !== null) {
    if (typeof e.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.fecha) || Number.isNaN(Date.parse(e.fecha))) return { ok: false, motivo: "La «fecha» debe ser AAAA-MM-DD" };
    fecha = e.fecha;
  }
  return { ok: true, nombre, peso, nota, fecha };
}

/** Valida los ajustes de un ramo. Lo que falta toma el valor por defecto. */
export function validarAjustes(entrada: unknown): { ok: true; ajustes: AjustesNotas } | { ok: false; motivo: string } {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const nota = (v: unknown): number | null | "mal" => {
    if (v === undefined || v === null) return null;
    const n = validarNota(v);
    return n === null ? "mal" : n;
  };
  const aprobacion = e.aprobacion === undefined || e.aprobacion === null ? APROBACION_POR_DEFECTO : validarNota(e.aprobacion);
  if (aprobacion === null) return { ok: false, motivo: "La «aprobacion» debe estar entre 1,0 y 7,0" };
  const examenMinimo = nota(e.examenMinimo);
  const presentacionMinima = nota(e.presentacionMinima);
  if (examenMinimo === "mal" || presentacionMinima === "mal") return { ok: false, motivo: "Las notas mínimas deben estar entre 1,0 y 7,0" };
  let examenPeso: number | null = null;
  if (e.examenPeso !== undefined && e.examenPeso !== null) {
    if (typeof e.examenPeso !== "number" || !Number.isInteger(e.examenPeso) || e.examenPeso < 1 || e.examenPeso > 99) return { ok: false, motivo: "El «examenPeso» debe ser un porcentaje entero entre 1 y 99" };
    examenPeso = e.examenPeso;
  }
  return { ok: true, ajustes: { aprobacion, examenPeso, examenMinimo, presentacionMinima } };
}

export type Veredicto = "aprobado" | "alcanza" | "imposible" | "sin-pendientes-reprobado";

export interface ResultadoRamoNotas {
  /** Suma de pesos definidos (debería ser 100; si no, se avisa). */
  pesoTotal: number;
  pesoRendido: number;
  pesoPendiente: number;
  /** Promedio ponderado de lo rendido (1 decimal), o null si no hay nada rendido. */
  promedio: number | null;
  /** Puntos acumulados sobre la nota final (Σ nota×peso ÷ 100), exactos. */
  acumulado: number;
  /** Nota que hay que sacar en TODO lo pendiente (la misma) para llegar a la aprobación. Exacta. */
  necesariaEnPendientes: number | null;
  /** Lo mejor que se puede llegar a sacar si se saca 7,0 en todo lo pendiente. */
  maximoPosible: number | null;
  veredicto: Veredicto;
  /** «El peso suma 90 %, no 100 %»: la cuenta no es fiable. */
  avisoPeso: string | null;
}

function sumaPesos(evals: readonly Evaluacion[]): number {
  return evals.reduce((s, e) => s + e.peso, 0);
}

/** Promedio, lo que falta y veredicto de un ramo. Solo mira las evaluaciones del período (sin examen si hay `examenPeso`). */
export function calcularRamo(evals: readonly Evaluacion[], ajustes: AjustesNotas = AJUSTES_POR_DEFECTO): ResultadoRamoNotas {
  const rendidas = evals.filter((e) => e.nota !== null);
  const pendientes = evals.filter((e) => e.nota === null);
  const pesoRendido = sumaPesos(rendidas);
  // El examen no se guarda como evaluación: cuenta como una pendiente más del ramo.
  const pesoPendiente = sumaPesos(pendientes) + (ajustes.examenPeso ?? 0);
  const pesoTotal = pesoRendido + pesoPendiente;
  const puntos = rendidas.reduce((s, e) => s + (e.nota as number) * e.peso, 0);
  const acumulado = puntos / 100;
  const promedio = pesoRendido > 0 ? redondear1(puntos / pesoRendido) : null;
  const objetivo = ajustes.aprobacion * 100;
  let necesaria: number | null = null;
  let maximo: number | null = null;
  let veredicto: Veredicto;
  if (pesoPendiente > 0) {
    necesaria = (objetivo - puntos) / pesoPendiente;
    maximo = (puntos + NOTA_MAX * pesoPendiente) / pesoTotal;
    veredicto = necesaria <= NOTA_MIN ? "aprobado" : necesaria > NOTA_MAX ? "imposible" : "alcanza";
  } else {
    veredicto = pesoTotal > 0 && puntos / pesoTotal >= ajustes.aprobacion - 1e-9 ? "aprobado" : "sin-pendientes-reprobado";
    if (pesoTotal > 0) maximo = puntos / pesoTotal;
  }
  const avisoPeso = pesoTotal !== 100 && evals.length > 0 ? `Los pesos suman ${pesoTotal} %, no 100 %: revisa las ponderaciones.` : null;
  return { pesoTotal, pesoRendido, pesoPendiente, promedio, acumulado, necesariaEnPendientes: necesaria, maximoPosible: maximo === null ? null : redondear1(maximo), veredicto, avisoPeso };
}

export interface ResultadoNecesaria {
  /** Nota exacta que hay que sacar en la evaluación pedida. */
  exacta: number;
  /** Nota que conviene apuntar: la exacta redondeada hacia arriba a un decimal (nunca se queda corta). */
  redondeada: number;
  veredicto: "aprobado" | "alcanza" | "imposible";
  /** Las otras pendientes se supusieron con esta nota (la misma que se pide), o null si no había otras. */
  supuesto: boolean;
}

/**
 * ¿Cuánto necesito en la evaluación `objetivoId` para llegar a la aprobación? Las demás pendientes se
 * suponen con la misma nota; las que ya tienen nota cuentan con esa. `escenario` pone notas hipotéticas
 * (id → nota) sin guardar nada. Devuelve null si la evaluación no existe o ya tiene nota.
 */
export function notaNecesaria(evals: readonly Evaluacion[], objetivoId: number, ajustes: AjustesNotas = AJUSTES_POR_DEFECTO, escenario: ReadonlyMap<number, number> = new Map()): ResultadoNecesaria | null {
  const objetivo = evals.find((e) => e.id === objetivoId);
  if (!objetivo) return null;
  const notaDe = (e: Evaluacion): number | null => escenario.get(e.id) ?? e.nota;
  if (notaDe(objetivo) !== null) return null;
  let puntos = 0;
  let pesoLibre = objetivo.peso;
  let otrasPendientes = false;
  for (const e of evals) {
    if (e.id === objetivo.id) continue;
    const n = notaDe(e);
    if (n === null) {
      pesoLibre += e.peso;
      otrasPendientes = true;
    } else puntos += n * e.peso;
  }
  const exacta = (ajustes.aprobacion * 100 - puntos) / pesoLibre;
  const redondeada = Math.ceil(exacta * 10 - 1e-9) / 10;
  const veredicto = exacta <= NOTA_MIN ? "aprobado" : exacta > NOTA_MAX ? "imposible" : "alcanza";
  return { exacta, redondeada: Math.max(NOTA_MIN, redondeada), veredicto, supuesto: otrasPendientes };
}

export interface ResultadoExamen {
  /** Promedio de presentación (evaluaciones del período), o null si falta alguna nota. */
  presentacion: number | null;
  /** Nota exacta que hay que sacar en el examen para aprobar (considerando las notas mínimas). */
  necesaria: number | null;
  redondeada: number | null;
  veredicto: "aprobado" | "alcanza" | "imposible" | "falta-presentacion" | "sin-presentacion-minima";
  /** Si hay nota mínima de examen y pesa más que lo necesario, es la que manda. */
  manda: "aprobacion" | "minimo" | null;
}

/**
 * Con examen: final = presentación × (100 − pesoExamen)% + examen × pesoExamen%. Las evaluaciones del
 * período deben estar todas con nota; si no, `falta-presentacion`.
 */
export function notaNecesariaExamen(periodo: readonly Evaluacion[], ajustes: AjustesNotas): ResultadoExamen | null {
  if (ajustes.examenPeso === null) return null;
  if (periodo.length === 0 || periodo.some((e) => e.nota === null)) return { presentacion: null, necesaria: null, redondeada: null, veredicto: "falta-presentacion", manda: null };
  const pesoPeriodo = sumaPesos(periodo);
  const presentacion = periodo.reduce((s, e) => s + (e.nota as number) * e.peso, 0) / pesoPeriodo;
  if (ajustes.presentacionMinima !== null && redondear1(presentacion) < ajustes.presentacionMinima) return { presentacion: redondear1(presentacion), necesaria: null, redondeada: null, veredicto: "sin-presentacion-minima", manda: null };
  const w = ajustes.examenPeso / 100;
  let necesaria = (ajustes.aprobacion - presentacion * (1 - w)) / w;
  let manda: ResultadoExamen["manda"] = "aprobacion";
  if (ajustes.examenMinimo !== null && ajustes.examenMinimo > necesaria) {
    necesaria = ajustes.examenMinimo;
    manda = "minimo";
  }
  const redondeada = Math.max(NOTA_MIN, Math.ceil(necesaria * 10 - 1e-9) / 10);
  const veredicto = necesaria <= NOTA_MIN ? "aprobado" : necesaria > NOTA_MAX ? "imposible" : "alcanza";
  return { presentacion: redondear1(presentacion), necesaria, redondeada, veredicto, manda: necesaria <= NOTA_MIN ? null : manda };
}
