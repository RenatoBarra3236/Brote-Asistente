// Estadísticas de estudio (A5 de docs/plan-estudio-y-mejoras.md). Puro, sin Node: lo usan el motor, el
// puente y la ventana. Todo se mide en minutos reales de un registro (`estudio_registro`): pomodoros,
// bloques del plan de estudio marcados como hechos y lo que el usuario anotó a mano. Los días y las
// semanas se cuentan en hora de pared (la semana parte el lunes) y respetan el cambio de hora.

const MIN = 60_000;
/** Un día cuenta para la racha desde 25 minutos estudiados. */
export const MIN_RACHA = 25;
/** Un pomodoro cancelado a mitad solo cuenta si pasaron más de 10 minutos. */
export const MIN_PARCIAL = 10;
/** Lo más que se anota a mano de una vez. */
export const MAX_MANUAL_MIN = 12 * 60;
/** Si un día suma más de esto, se avisa (puede ser un error al escribir). */
export const AVISO_DIA_MIN = 16 * 60;
/** Cuántos días hacia atrás se mira para la racha. */
const DIAS_RACHA = 400;

export type FuenteRegistro = "pomodoro" | "bloque" | "manual";

export interface RegistroEstudio {
  id: number;
  inicioMs: number;
  finMs: number;
  /** null = sin ramo. */
  ramoId: number | null;
  fuente: FuenteRegistro;
}

function inicioDelDia(ms: number, dias = 0): number {
  const f = new Date(ms);
  return new Date(f.getFullYear(), f.getMonth(), f.getDate() + dias).getTime();
}

/** El lunes 00:00 (hora local) de la semana de `ms`. */
export function inicioDeSemana(ms: number): number {
  const d = inicioDelDia(ms);
  return inicioDelDia(d, -((new Date(d).getDay() + 6) % 7));
}

/**
 * Un bloque del plan de estudio marcado «hecho» no se suma si hubo un pomodoro que se solapa con su horario
 * (sería contar dos veces lo mismo). Lo anotado a mano nunca se descarta.
 */
export function sinDuplicados(registros: readonly RegistroEstudio[]): RegistroEstudio[] {
  const pomodoros = registros.filter((r) => r.fuente === "pomodoro");
  return registros.filter((r) => r.fuente !== "bloque" || !pomodoros.some((p) => r.inicioMs < p.finMs && r.finMs > p.inicioMs));
}

/** Minutos de un registro dentro de [desde, hasta). */
function minutosDentro(r: RegistroEstudio, desdeMs: number, hastaMs: number): number {
  const ini = Math.max(r.inicioMs, desdeMs);
  const fin = Math.min(r.finMs, hastaMs);
  return fin > ini ? (fin - ini) / MIN : 0;
}

/** Minutos estudiados en un rango (ya sin duplicados), opcionalmente de un ramo (`null` = sin ramo). */
export function minutosEnRango(registros: readonly RegistroEstudio[], desdeMs: number, hastaMs: number, ramoId?: number | null): number {
  let total = 0;
  for (const r of sinDuplicados(registros)) {
    if (ramoId !== undefined && r.ramoId !== ramoId) continue;
    total += minutosDentro(r, desdeMs, hastaMs);
  }
  return Math.round(total);
}

/** Minutos de cada uno de `dias` días seguidos desde `desdeMs` (un registro que cruza la medianoche se reparte). */
export function minutosPorDia(registros: readonly RegistroEstudio[], desdeMs: number, dias: number): number[] {
  const validos = sinDuplicados(registros);
  return Array.from({ length: dias }, (_, i) => {
    const a = inicioDelDia(desdeMs, i);
    const b = inicioDelDia(desdeMs, i + 1);
    return Math.round(validos.reduce((s, r) => s + minutosDentro(r, a, b), 0));
  });
}

/**
 * Días seguidos con al menos `minimo` minutos. Si hoy todavía no llegas al mínimo, la racha de ayer sigue
 * viva hasta que termine el día (no se pierde a las 8 de la mañana).
 */
export function racha(registros: readonly RegistroEstudio[], ahoraMs: number, minimo = MIN_RACHA): number {
  const hoy = inicioDelDia(ahoraMs);
  const dias = minutosPorDia(registros, inicioDelDia(hoy, -DIAS_RACHA + 1), DIAS_RACHA);
  let i = dias.length - 1;
  if (dias[i] < minimo) i--;
  let n = 0;
  while (i >= 0 && dias[i] >= minimo) {
    n++;
    i--;
  }
  return n;
}

export interface TotalDeRamo {
  ramoId: number | null;
  semanaMin: number;
  totalMin: number;
}
export interface ResumenEstudio {
  /** Lunes 00:00 de esta semana. */
  desdeSemanaMs: number;
  totalMin: number;
  /** La semana pasada hasta la misma altura (mismo día y hora). */
  pasadaMin: number;
  /** Lunes a domingo; `hoy` es la posición de hoy (0 a 6). */
  porDia: number[];
  hoy: number;
  hoyMin: number;
  /** Esta semana por ramo, de más a menos, con su fracción del total. */
  porRamo: { ramoId: number | null; min: number; fraccion: number }[];
  /** Esta semana y en total, por ramo (para la ficha de cada uno). */
  totales: TotalDeRamo[];
  racha: number;
  totalHistoricoMin: number;
  /** Desde cuándo hay datos (el primer registro), o null. */
  desdeMs: number | null;
  hay: boolean;
}

export function resumirEstudio(registros: readonly RegistroEstudio[], ahoraMs: number): ResumenEstudio {
  const lunes = inicioDeSemana(ahoraMs);
  const siguiente = inicioDelDia(lunes, 7);
  const lunesPasado = inicioDelDia(lunes, -7);
  // La semana pasada «a la misma altura»: en hora de pared, no sumando milisegundos (un cambio de hora la correría).
  const f = new Date(ahoraMs);
  const alturaPasada = new Date(f.getFullYear(), f.getMonth(), f.getDate() - 7, f.getHours(), f.getMinutes()).getTime();
  const porDia = minutosPorDia(registros, lunes, 7);
  const hoy = Math.round((inicioDelDia(ahoraMs) - lunes) / 86_400_000);
  const totalMin = minutosEnRango(registros, lunes, siguiente);
  const ramos = new Set<number | null>(registros.map((r) => r.ramoId));
  const totales: TotalDeRamo[] = [...ramos].map((ramoId) => ({
    ramoId,
    semanaMin: minutosEnRango(registros, lunes, siguiente, ramoId),
    totalMin: minutosEnRango(registros, 0, Number.MAX_SAFE_INTEGER, ramoId),
  }));
  const porRamo = totales
    .filter((t) => t.semanaMin > 0)
    .sort((a, b) => b.semanaMin - a.semanaMin)
    .map((t) => ({ ramoId: t.ramoId, min: t.semanaMin, fraccion: totalMin > 0 ? t.semanaMin / totalMin : 0 }));
  return {
    desdeSemanaMs: lunes,
    totalMin,
    pasadaMin: minutosEnRango(registros, lunesPasado, alturaPasada),
    porDia,
    hoy,
    hoyMin: porDia[hoy] ?? 0,
    porRamo,
    totales,
    racha: racha(registros, ahoraMs),
    totalHistoricoMin: minutosEnRango(registros, 0, Number.MAX_SAFE_INTEGER),
    desdeMs: registros.length > 0 ? Math.min(...registros.map((r) => r.inicioMs)) : null,
    hay: registros.length > 0,
  };
}

/** «6 h 20 min», «45 min», «2 h», «0 min». */
export function formatearMinutos(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** Revisa una anotación a mano: minutos enteros entre 1 y 720. */
export function validarMinutosManual(minutos: unknown): { ok: true; minutos: number } | { ok: false; motivo: string } {
  if (typeof minutos !== "number" || !Number.isFinite(minutos)) return { ok: false, motivo: "Falta el tiempo estudiado" };
  const m = Math.round(minutos);
  if (m < 1) return { ok: false, motivo: "Tiene que ser al menos 1 minuto" };
  if (m > MAX_MANUAL_MIN) return { ok: false, motivo: "Anota como máximo 12 horas de una vez" };
  return { ok: true, minutos: m };
}
