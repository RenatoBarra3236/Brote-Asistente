// Plan de estudio antes de una prueba (A4 de docs/plan-estudio-y-mejoras.md). Puro, sin Node: lo usan el
// motor, el puente y la ventana. Todo es determinista (sin IA): cuánto estudiar sale del peso de la
// evaluación y de la nota que hace falta (A2); dónde caen los bloques, de las ventanas de estudio y de
// lo que ya hay en el calendario. Los días se cuentan en hora de pared (respeta el cambio de hora).

const MIN = 60_000;
export const BLOQUE_MIN = 50;
export const DESCANSO_MIN = 10;
export const MAX_POR_DIA = 2;
export const MAX_BLOQUES = 20;
export const MAX_PLANES = 4;
export const HORIZONTE_DIAS = 30;
export const HORAS_MIN = 1;
export const HORAS_MAX = 12;
/** El último bloque termina al menos 3 h antes de la prueba. */
export const ANTES_DE_LA_PRUEBA_H = 3;
/** Nada de estudio planeado después de las 22:00. */
export const HORA_TOPE_MIN = 22 * 60;
/** Ningún bloque en la hora previa a un evento del calendario. */
export const MARGEN_ANTES_EVENTO_MIN = 60;
/** Una prueba sin hora se asume a las 8:00 (el estudio termina el día anterior, lo más seguro). */
export const HORA_PRUEBA_SIN_HORA = 8;

export interface Ventana {
  desdeMin: number;
  hastaMin: number;
}
export interface HorarioEstudio {
  semana: Ventana;
  finDeSemana: Ventana;
  bloqueMin: number;
  maxPorDia: number;
}
export const HORARIO_POR_DEFECTO: HorarioEstudio = {
  semana: { desdeMin: 16 * 60, hastaMin: 21 * 60 + 30 },
  finDeSemana: { desdeMin: 10 * 60, hastaMin: 19 * 60 },
  bloqueMin: BLOQUE_MIN,
  maxPorDia: MAX_POR_DIA,
};

export type TipoBloque = "temas" | "ejercicios" | "repaso-final";
export type EstadoBloque = "pendiente" | "hecho" | "saltado";
export const TIPOS_BLOQUE: readonly TipoBloque[] = ["temas", "ejercicios", "repaso-final"];

export interface BloquePlan {
  tipo: TipoBloque;
  inicioMs: number;
  finMs: number;
}
export interface Ocupado {
  inicioMs: number;
  finMs: number;
}

// ---- La fecha de una prueba -----------------------------------------------------------------------------

const FORMA_FECHA = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/;

/** "AAAA-MM-DD[ HH:MM]" (hora local) → milisegundos, o null si no es una fecha real. */
export function leerFechaPrueba(texto: unknown): { ms: number; conHora: boolean } | null {
  if (typeof texto !== "string") return null;
  const m = FORMA_FECHA.exec(texto.trim());
  if (!m) return null;
  const [a, mes, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const conHora = m[4] !== undefined;
  const h = conHora ? Number(m[4]) : HORA_PRUEBA_SIN_HORA;
  const min = conHora ? Number(m[5]) : 0;
  const f = new Date(a, mes, d, h, min);
  const igual = f.getFullYear() === a && f.getMonth() === mes && f.getDate() === d && f.getHours() === h && f.getMinutes() === min;
  return igual ? { ms: f.getTime(), conHora } : null;
}

/** Cuándo es la prueba que guarda una evaluación (`fecha` de A2), o null. */
export function pruebaMsDe(fecha: string | null): number | null {
  return fecha === null ? null : (leerFechaPrueba(fecha)?.ms ?? null);
}

export function formatearFechaPrueba(ms: number, conHora: boolean): string {
  const f = new Date(ms);
  const dos = (n: number) => String(n).padStart(2, "0");
  const dia = `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}`;
  return conHora ? `${dia} ${dos(f.getHours())}:${dos(f.getMinutes())}` : dia;
}

// ---- Cuánto estudiar --------------------------------------------------------------------------------------

/** Cuánto más hay que estudiar según la nota que hace falta: ≤ 4,5 → ×1; ≤ 5,5 → ×1,3; más → ×1,6. */
export function factorDeDificultad(necesaria: number | null): number {
  if (necesaria === null || !Number.isFinite(necesaria)) return 1;
  if (necesaria <= 4.5) return 1;
  if (necesaria <= 5.5) return 1.3;
  return 1.6;
}

/** 2 h base + 0,2 h por cada 1 % de peso, por la dificultad; de media en media hora, entre 1 y 12 h. */
export function horasObjetivo(peso: number, factor: number): number {
  const crudo = (2 + 0.2 * Math.max(0, Math.min(100, peso))) * factor;
  return Math.max(HORAS_MIN, Math.min(HORAS_MAX, Math.round(crudo * 2) / 2));
}

// ---- Dónde caen los bloques --------------------------------------------------------------------------------

export interface EntradaPlan {
  ahoraMs: number;
  pruebaMs: number;
  /** Horas a repartir (de `horasObjetivo` o las que ajustó el usuario). */
  horas: number;
  ocupados?: readonly Ocupado[];
  horario?: HorarioEstudio;
}
export type ResultadoPlan = { ok: true; bloques: BloquePlan[]; horas: number; bloquesPedidos: number; avisos: string[] } | { ok: false; motivo: string };

function inicioDelDia(ms: number, dias = 0): number {
  const f = new Date(ms);
  return new Date(f.getFullYear(), f.getMonth(), f.getDate() + dias).getTime();
}
function aMinutos(diaMs: number, min: number): number {
  const f = new Date(diaMs);
  return new Date(f.getFullYear(), f.getMonth(), f.getDate(), Math.floor(min / 60), min % 60).getTime();
}

/** Reparte los bloques de estudio entre ahora y 3 h antes de la prueba, con más peso cerca de la prueba. */
export function armarPlan(e: EntradaPlan): ResultadoPlan {
  const horario = e.horario ?? HORARIO_POR_DEFECTO;
  if (!Number.isFinite(e.pruebaMs) || !Number.isFinite(e.ahoraMs)) return { ok: false, motivo: "Fecha inválida" };
  if (e.pruebaMs <= e.ahoraMs) return { ok: false, motivo: "Esa prueba ya pasó" };
  if (e.pruebaMs > e.ahoraMs + HORIZONTE_DIAS * 86_400_000) return { ok: false, motivo: `Falta más de ${HORIZONTE_DIAS} días: planifícala más cerca` };
  const horas = Math.max(HORAS_MIN, Math.min(HORAS_MAX, e.horas));
  const pedidos = Math.min(MAX_BLOQUES, Math.ceil((horas * 60) / horario.bloqueMin));

  const primeroMs = e.ahoraMs + 15 * MIN;
  const limiteMs = e.pruebaMs - ANTES_DE_LA_PRUEBA_H * 60 * MIN;
  const ocupados = (e.ocupados ?? []).filter((o) => o.finMs > o.inicioMs);
  const libre = (ini: number, fin: number) => !ocupados.some((o) => ini < o.finMs && fin > o.inicioMs - MARGEN_ANTES_EVENTO_MIN * MIN);

  // Candidatos por día (con algo libre), en orden.
  const dias: { diaMs: number; slots: { inicioMs: number; finMs: number }[] }[] = [];
  const ultimo = inicioDelDia(limiteMs);
  for (let d = inicioDelDia(e.ahoraMs); d <= ultimo; d = inicioDelDia(d, 1)) {
    const f = new Date(d).getDay();
    const v = f === 0 || f === 6 ? horario.finDeSemana : horario.semana;
    const slots: { inicioMs: number; finMs: number }[] = [];
    for (let t = v.desdeMin; t + horario.bloqueMin <= Math.min(v.hastaMin, HORA_TOPE_MIN); t += horario.bloqueMin + DESCANSO_MIN) {
      const ini = aMinutos(d, t);
      const fin = ini + horario.bloqueMin * MIN;
      if (ini >= primeroMs && fin <= limiteMs && libre(ini, fin)) slots.push({ inicioMs: ini, finMs: fin });
    }
    if (slots.length > 0) dias.push({ diaMs: d, slots });
  }
  if (dias.length === 0) return { ok: false, motivo: "No encontré espacio libre para estudiar antes de la prueba" };

  const D = dias.length;
  const peso = (i: number) => 1 + i / Math.max(1, D - 1);
  const cuenta = dias.map(() => 0);
  const tope = (i: number) => Math.min(horario.maxPorDia, dias[i].slots.length);
  // Siempre hay algo en el último día con espacio (el repaso final) y el resto se reparte con más peso hacia la prueba.
  cuenta[D - 1] = 1;
  for (let n = 1; n < pedidos; n++) {
    let mejor = -1;
    let mejorValor = -1;
    for (let i = 0; i < D; i++) {
      if (cuenta[i] >= tope(i)) continue;
      const valor = peso(i) / (cuenta[i] + 1);
      if (valor > mejorValor || (valor === mejorValor && i > mejor)) {
        mejor = i;
        mejorValor = valor;
      }
    }
    if (mejor < 0) break;
    cuenta[mejor]++;
  }

  const elegidos: { inicioMs: number; finMs: number }[] = [];
  dias.forEach((dia, i) => {
    if (cuenta[i] === 1) elegidos.push(dia.slots[0]);
    else if (cuenta[i] >= 2) elegidos.push(dia.slots[0], dia.slots[dia.slots.length - 1]);
  });
  elegidos.sort((a, b) => a.inicioMs - b.inicioMs);

  const n = elegidos.length;
  const nTemas = Math.ceil(Math.max(0, n - 1) * 0.6);
  const bloques: BloquePlan[] = elegidos.map((s, i) => ({
    tipo: i === n - 1 ? "repaso-final" : i < nTemas ? "temas" : "ejercicios",
    inicioMs: s.inicioMs,
    finMs: s.finMs,
  }));

  const avisos: string[] = [];
  if (e.pruebaMs - e.ahoraMs < 24 * 60 * MIN) avisos.push("Te queda poco tiempo: armé lo que cabe antes de la prueba.");
  if (n < pedidos) avisos.push(`Solo encontré espacio para ${n} de ${pedidos} bloques.`);
  return { ok: true, bloques, horas: Math.round(((n * horario.bloqueMin) / 60) * 10) / 10, bloquesPedidos: pedidos, avisos };
}

/** Revisa los bloques que llegan de la isla antes de guardarlos (nada raro, nada fuera del plan). */
export function validarBloques(entrada: unknown, ahoraMs: number, pruebaMs: number): { ok: true; bloques: BloquePlan[] } | { ok: false; motivo: string } {
  if (!Array.isArray(entrada) || entrada.length === 0) return { ok: false, motivo: "No hay bloques que agendar" };
  if (entrada.length > MAX_BLOQUES) return { ok: false, motivo: `Hay más de ${MAX_BLOQUES} bloques` };
  const bloques: BloquePlan[] = [];
  for (const b of entrada) {
    const o = (b ?? {}) as Record<string, unknown>;
    if (typeof o.tipo !== "string" || !TIPOS_BLOQUE.includes(o.tipo as TipoBloque)) return { ok: false, motivo: "Un bloque tiene un tipo desconocido" };
    const ini = o.inicioMs;
    const fin = o.finMs;
    if (typeof ini !== "number" || typeof fin !== "number" || !Number.isFinite(ini) || !Number.isFinite(fin)) return { ok: false, motivo: "Un bloque tiene fechas inválidas" };
    if (fin - ini < 10 * MIN || fin - ini > 180 * MIN) return { ok: false, motivo: "Cada bloque debe durar entre 10 minutos y 3 horas" };
    if (fin < ahoraMs - 86_400_000 || fin > pruebaMs) return { ok: false, motivo: "Un bloque queda fuera del tiempo antes de la prueba" };
    bloques.push({ tipo: o.tipo as TipoBloque, inicioMs: ini, finMs: fin });
  }
  bloques.sort((a, b) => a.inicioMs - b.inicioMs);
  return { ok: true, bloques };
}

// ---- Lo guardado ---------------------------------------------------------------------------------------------

export interface BloqueGuardado {
  id: number;
  planId: number;
  tipo: TipoBloque;
  inicioMs: number;
  finMs: number;
  estado: EstadoBloque;
}
export interface PlanEstudio {
  id: number;
  ramoId: number;
  evaluacionId: number;
  pruebaMs: number;
  horas: number;
  /** Si al agendar se pidió copiarlos al Calendario del Mac (borrarlos de ahí es a mano). */
  calendario: boolean;
  creadoMs: number;
  bloques: BloqueGuardado[];
}
/** Un bloque con lo que la Agenda necesita para pintarlo. */
export interface BloqueDeAgenda extends BloqueGuardado {
  ramoId: number;
  evaluacion: string;
}

/** Lo que ve la isla del plan de estudio. */
export interface EstadoPlanEstudio {
  planes: PlanEstudio[];
}

const NOMBRES_TIPO: Record<TipoBloque, string> = {
  temas: "Estudiar",
  ejercicios: "Practicar ejercicios de",
  "repaso-final": "Repaso final de",
};

/** El título genérico de un bloque: «Estudiar Cálculo», nunca el contenido de una clase. */
export function tituloDeBloque(tipo: TipoBloque, ramo: string): string {
  return `${NOMBRES_TIPO[tipo]} ${ramo}`;
}

/** Cuánto antes de un bloque se avisa (sin abrir la isla). */
export const AVISO_BLOQUE_MIN = 10;

/** Los bloques pendientes que empiezan en los próximos 10 minutos y de los que todavía no se avisó. */
export function bloquesPorAvisar(bloques: readonly { id: number; estado: EstadoBloque; inicioMs: number }[], avisados: ReadonlySet<number>, ahoraMs: number): number[] {
  return bloques
    .filter((b) => b.estado === "pendiente" && !avisados.has(b.id) && b.inicioMs >= ahoraMs && b.inicioMs - ahoraMs <= AVISO_BLOQUE_MIN * MIN)
    .map((b) => b.id);
}
