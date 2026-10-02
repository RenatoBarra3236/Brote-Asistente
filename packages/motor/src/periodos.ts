// Periodos para consultar gastos ("hoy", "esta semana", "el mes pasado"), en hora local.
// La semana parte el lunes.

export type Periodo = "hoy" | "ayer" | "esta semana" | "la semana pasada" | "este mes" | "el mes pasado" | "este año";

/** Cómo se puede escribir cada periodo (ya normalizado: sin tildes, en minúsculas). */
export const FORMAS_DE_PERIODO: Record<string, Periodo> = {
  hoy: "hoy",
  "el dia de hoy": "hoy",
  ayer: "ayer",
  "esta semana": "esta semana",
  "en la semana": "esta semana",
  "la semana pasada": "la semana pasada",
  "este mes": "este mes",
  "en el mes": "este mes",
  "el mes pasado": "el mes pasado",
  "este ano": "este año",
  "en el ano": "este año",
};

export interface Rango {
  desde: Date;
  hasta: Date;
}

function inicioDelDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias);
}

/** El rango [desde, hasta) de un periodo. */
export function rangoDe(periodo: Periodo, ahora: Date): Rango {
  const hoy = inicioDelDia(ahora);
  const lunes = sumarDias(hoy, -((hoy.getDay() + 6) % 7));
  const mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  switch (periodo) {
    case "hoy":
      return { desde: hoy, hasta: sumarDias(hoy, 1) };
    case "ayer":
      return { desde: sumarDias(hoy, -1), hasta: hoy };
    case "esta semana":
      return { desde: lunes, hasta: sumarDias(lunes, 7) };
    case "la semana pasada":
      return { desde: sumarDias(lunes, -7), hasta: lunes };
    case "este mes":
      return { desde: mes, hasta: new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1) };
    case "el mes pasado":
      return { desde: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), hasta: mes };
    case "este año":
      return { desde: new Date(hoy.getFullYear(), 0, 1), hasta: new Date(hoy.getFullYear() + 1, 0, 1) };
  }
}

/** "hoy", "ayer" o la fecha corta ("28/9") para listar gastos. */
export function fechaCorta(fecha: Date, ahora: Date): string {
  const dia = inicioDelDia(fecha).getTime();
  const hoy = inicioDelDia(ahora).getTime();
  if (dia === hoy) return "hoy";
  if (dia === sumarDias(new Date(hoy), -1).getTime()) return "ayer";
  return `${fecha.getDate()}/${fecha.getMonth() + 1}`;
}
