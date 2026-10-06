// Fechas como las dice un estudiante: "el viernes 9", "el 14 de octubre", "mañana", "9 de octubre de 2026".
// Puro, sin Node. Recibe texto normalizado (minúsculas, sin tildes). Devuelve el comienzo del día
// local o `null`. Una fecha pasada no se acepta: una prueba que ya fue no se planifica.

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** Hasta dónde se busca el próximo "viernes 9" (dos meses alcanzan para encontrar un 9 que caiga viernes). */
const DIAS_DE_BUSQUEDA = 62;

const MES = MESES.join("|");
const DIA = DIAS_SEMANA.join("|");

/** La expresión de la ranura {fecha} de las plantillas (el "el" inicial es opcional y lo trata `leerDia`). */
export const PATRON_DIA = [
  "pasado manana",
  "manana",
  "hoy",
  `(?:el )?(?:${DIA})(?: \\d{1,2})?(?: de (?:${MES}))?`,
  `(?:el )?\\d{1,2} de (?:${MES})(?: de \\d{4})?`,
  "el \\d{1,2}",
].join("|");

function inicioDelDia(ms: number, dias = 0): number {
  const f = new Date(ms);
  return new Date(f.getFullYear(), f.getMonth(), f.getDate() + dias).getTime();
}

function existe(a: number, m: number, d: number): boolean {
  const f = new Date(a, m, d);
  return f.getFullYear() === a && f.getMonth() === m && f.getDate() === d;
}

/** "viernes 9 de octubre" → el próximo día que cumpla lo dicho; null si no existe o ya pasó. */
export function leerDia(entrada: string, ahoraMs: number): number | null {
  const t = entrada.trim().replace(/\s+/g, " ").replace(/^el /, "");
  const hoy = inicioDelDia(ahoraMs);
  if (t === "hoy") return hoy;
  if (t === "manana") return inicioDelDia(hoy, 1);
  if (t === "pasado manana") return inicioDelDia(hoy, 2);

  let m = t.match(new RegExp(`^(${DIA})(?: (\\d{1,2}))?(?: de (${MES}))?$`));
  if (m) {
    const semana = DIAS_SEMANA.indexOf(m[1]);
    const numero = m[2] === undefined ? null : Number(m[2]);
    const mes = m[3] === undefined ? null : MESES.indexOf(m[3]);
    // Sin número: el próximo (si hoy es ese día, el de la semana que viene).
    for (let i = numero === null ? 1 : 0; i <= DIAS_DE_BUSQUEDA; i++) {
      const f = new Date(inicioDelDia(hoy, i));
      if (f.getDay() !== semana) continue;
      if (numero !== null && f.getDate() !== numero) continue;
      if (mes !== null && f.getMonth() !== mes) continue;
      return f.getTime();
    }
    return null;
  }

  m = t.match(new RegExp(`^(\\d{1,2}) de (${MES})(?: de (\\d{4}))?$`));
  if (m) {
    const d = Number(m[1]);
    const mes = MESES.indexOf(m[2]);
    const ahora = new Date(ahoraMs);
    if (m[3] !== undefined) {
      const a = Number(m[3]);
      return existe(a, mes, d) && new Date(a, mes, d).getTime() >= hoy ? new Date(a, mes, d).getTime() : null;
    }
    // Sin año: este año, o el que viene si la fecha ya pasó.
    for (const a of [ahora.getFullYear(), ahora.getFullYear() + 1]) {
      if (existe(a, mes, d) && new Date(a, mes, d).getTime() >= hoy) return new Date(a, mes, d).getTime();
    }
    return null;
  }

  m = t.match(/^(\d{1,2})$/);
  if (m && entrada.trim().startsWith("el ")) {
    const d = Number(m[1]);
    const ahora = new Date(ahoraMs);
    // "el 14": este mes si no ha pasado, si no el siguiente.
    for (let i = 0; i < 2; i++) {
      const a = new Date(ahora.getFullYear(), ahora.getMonth() + i, 1);
      if (existe(a.getFullYear(), a.getMonth(), d) && new Date(a.getFullYear(), a.getMonth(), d).getTime() >= hoy) return new Date(a.getFullYear(), a.getMonth(), d).getTime();
    }
  }
  return null;
}
