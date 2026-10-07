// Capa B del plan sin IA (docs/plan-sin-ia.md): entender por piezas. Cuando una frase no calza con ninguna
// plantilla, se sacan las piezas que ya sabemos leer (monto, periodo, duración, hora, nombre de un ramo o de una
// meta) y la intención se decide por palabras clave, sin importar el orden. El resultado no es una acción sino una
// FRASE EN LA FORMA DE LA GUÍA («gaste 5 lucas en almuerzo»): el motor la pasa por las plantillas de siempre, así
// toda la lógica de interpretar y ejecutar es una sola. Puro: sin Node ni base de datos.

import { NOMBRES_DE_CATEGORIA, categoriaDe } from "./categorias.ts";
import { leerMonto } from "./montos.ts";
import { normalizar } from "./texto.ts";

export interface ContextoPiezas {
  /** Nombres de los ramos del usuario. */
  ramos: string[];
  /** Nombres de las metas de ahorro del usuario. */
  metas: string[];
}

export interface Pieza {
  desde: number;
  hasta: number;
}
export interface Monto extends Pieza {
  /** Tal como lo escribió el usuario («5 lucas», «$3.500»). */
  texto: string;
  valor: number;
}

export interface Tok {
  /** Como lo escribió el usuario, sin signos en los bordes. */
  o: string;
  /** Minúsculas y sin tildes. */
  n: string;
}

export function tokenizar(frase: string): Tok[] {
  return frase
    .split(/\s+/)
    .map((t) => t.replace(/^[¿¡"'(\[]+|[?!"')\].,;:]+$/g, ""))
    .filter((t) => t !== "")
    .map((o) => ({ o, n: normalizar(o) }))
    .filter((t) => t.n !== "");
}

const UNIDADES_DE_MONTO = new Set(["luca", "lucas", "mil", "k", "palo", "palos"]);
const NUMEROS = new Set(["un", "una", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "quince", "veinte", "treinta", "cuarenta", "cincuenta", "cien", "medio", "media"]);
const UNIDADES_DE_TIEMPO = new Set(["minuto", "minutos", "min", "mins", "hora", "horas", "hrs", "hr", "h", "segundo", "segundos", "seg", "dia", "dias", "semana", "semanas", "mes", "meses", "ano", "anos", "%", "porciento"]);

/** Los montos que aparecen en la frase («5 lucas», «2 mil», «$3.500», «1500», «luca y media»). */
export function hallarMontos(toks: Tok[]): Monto[] {
  const montos: Monto[] = [];
  let i = 0;
  while (i < toks.length) {
    let hallado: Monto | null = null;
    for (let j = Math.min(i + 3, toks.length - 1); j >= i; j--) {
      const span = toks.slice(i, j + 1);
      const texto = span.map((t) => t.n).join(" ");
      const tieneCifra = /\d/.test(texto);
      const tieneUnidad = span.some((t) => UNIDADES_DE_MONTO.has(t.n));
      if (!tieneCifra && !tieneUnidad) continue;
      // Un número suelto («k», «mil») no es un monto; hace falta una cifra, un número en palabras o «luca»/«palo».
      if (!tieneCifra && !span.some((t) => NUMEROS.has(t.n) || t.n === "luca" || t.n === "lucas" || t.n === "palo" || t.n === "palos")) continue;
      if (!tieneCifra && span.length === 1 && !["luca", "palo"].includes(span[0].n)) continue;
      if (/^[a-z]+$/.test(span[0].n) && !NUMEROS.has(span[0].n) && !UNIDADES_DE_MONTO.has(span[0].n)) continue;
      const valor = leerMonto(texto.replace(/^\$ /, "$"));
      if (valor === null) continue;
      if (!tieneUnidad) {
        // Una cifra sin unidad: no si es una hora, una nota, una duración o un número chico.
        const siguiente = toks[j + 1]?.n;
        const anterior = toks[i - 1]?.n;
        if (texto.includes(":") || (siguiente && UNIDADES_DE_TIEMPO.has(siguiente)) || anterior === "las" || anterior === "la") continue;
        if (valor < 100 && !texto.includes("$")) continue;
        if (/^\d[.,]\d$/.test(texto)) continue;
      }
      hallado = { desde: i, hasta: j, texto: span.map((t) => t.o).join(" "), valor };
      break;
    }
    if (hallado) {
      montos.push(hallado);
      i = hallado.hasta + 1;
    } else i++;
  }
  return montos;
}

const PERIODOS: [string, string][] = [
  ["el dia de hoy", "hoy"],
  ["hoy dia", "hoy"],
  ["hoy", "hoy"],
  ["ayer", "ayer"],
  ["la semana pasada", "la semana pasada"],
  ["semana pasada", "la semana pasada"],
  ["el mes pasado", "el mes pasado"],
  ["mes pasado", "el mes pasado"],
  ["esta semana", "esta semana"],
  ["en la semana", "esta semana"],
  ["la semana", "esta semana"],
  ["semana", "esta semana"],
  ["este mes", "este mes"],
  ["en el mes", "este mes"],
  ["del mes", "este mes"],
  ["el mes", "este mes"],
  ["mes", "este mes"],
  ["este ano", "este ano"],
  ["en el ano", "este ano"],
];

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Si la frase (normalizada) contiene la expresión como palabras completas. */
export function contiene(norma: string, expresion: string): boolean {
  return new RegExp(`(?:^| )${esc(expresion)}(?: |$)`).test(norma);
}

/** El periodo que nombra la frase, en la forma que entienden las plantillas. */
export function hallarPeriodo(norma: string): string | null {
  for (const [forma, periodo] of PERIODOS) if (contiene(norma, forma)) return periodo;
  return null;
}

/** La categoría que nombra la frase («comida», «carrete», «café» → comida…). */
export function hallarCategoria(norma: string): string | null {
  for (const clave of Object.keys(NOMBRES_DE_CATEGORIA).sort((a, b) => b.length - a.length)) {
    if (clave !== "otros" && contiene(norma, clave)) return clave;
  }
  const categoria = categoriaDe(norma);
  return categoria === "otros" ? null : categoria;
}

const NUM_TIEMPO = "(?:\\d+(?:[.,]\\d+)?|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta|cuarenta|cincuenta|sesenta)";
const PATRON_TIEMPO = new RegExp(`(?:^| )(media hora|(?:una )?hora y media|${NUM_TIEMPO} ?(?:horas?|hrs?|h|minutos?|mins?|min)(?: y (?:media|\\d+ minutos))?)(?= |$)`);

/** Una duración escrita («30 minutos», «2 horas», «media hora»), tal como la dijo el usuario. */
export function hallarTiempo(frase: string): string | null {
  const m = PATRON_TIEMPO.exec(normalizar(frase));
  return m ? m[1] : null;
}

const HORA = /(?:^| )(?:a las|a la|las) (\d{1,2}(?:[:.]\d{2})?(?: ?(?:am|pm))?|mediodia)(?= |$)/;

/** Una hora del día («a las 16:30», «a las 9»): lo que va después de «a las». */
export function hallarHora(norma: string): string | null {
  const m = HORA.exec(norma);
  return m ? m[1] : null;
}

const MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";

export function hallarMes(norma: string): string | null {
  const m = new RegExp(`(?:^| )(${MESES})(?= |$)`).exec(norma);
  return m ? m[1] : null;
}

/** Un nombre de la lista que aparece en la frase (por el nombre entero o por su palabra más larga), ya normalizado. */
export function hallarNombre(norma: string, nombres: string[]): string | null {
  const palabras = new Set(norma.split(" "));
  for (const nombre of nombres) {
    const n = normalizar(nombre);
    if (n && contiene(norma, n)) return n;
  }
  for (const nombre of nombres) {
    const n = normalizar(nombre);
    const largas = n.split(" ").filter((p) => p.length >= 5);
    if (largas.length === 1 && palabras.has(largas[0])) return n;
  }
  return null;
}

export function singular(palabra: string): string {
  if (palabra.length > 4 && palabra.endsWith("es")) return palabra.slice(0, -2);
  return palabra.length > 3 && palabra.endsWith("s") ? palabra.slice(0, -1) : palabra;
}

const DIAS = "lunes|martes|miercoles|jueves|viernes|sabado|domingo";

/** El día que nombra la frase («viernes», «viernes 9», «14 de octubre», «pasado manana»), tal como lo entiende `leerDia`. */
export function hallarDia(norma: string): string | null {
  const m =
    new RegExp(`(?:^| )((?:${DIAS})(?: \\d{1,2})?(?: de (?:${MESES_PARA_DIA}))?)(?= |$)`).exec(norma) ??
    new RegExp(`(?:^| )(\\d{1,2} de (?:${MESES_PARA_DIA}))(?= |$)`).exec(norma) ??
    /(?:^| )(pasado manana)(?= |$)/.exec(norma);
  return m ? m[1] : null;
}
const MESES_PARA_DIA = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre";
