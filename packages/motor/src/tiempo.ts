// Lee duraciones como las dice un estudiante: "25 minutos", "media hora", "hora y media",
// "un cuarto de hora", "90 min", "2 horas", "30 segundos". Recibe texto ya normalizado.

const PALABRAS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, quince: 15, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cuarentaicinco: 45,
  cincuenta: 50, sesenta: 60, noventa: 90,
};

const SEGUNDO = 1000;
const MINUTO = 60 * SEGUNDO;
const HORA = 60 * MINUTO;

/** La duración más larga que se acepta (un temporizador de un día no tiene sentido aquí). */
const MAXIMO = 12 * HORA;

function cantidad(texto: string): number | null {
  if (texto in PALABRAS) return PALABRAS[texto];
  return /^\d+([.,]\d+)?$/.test(texto) ? Number(texto.replace(",", ".")) : null;
}

/**
 * La duración en milisegundos, o `null` si el texto no es una duración. Un número solo se
 * entiende como minutos ("pomodoro de 30").
 */
export function leerDuracion(entrada: string): number | null {
  const texto = entrada.trim().replace(/\s+/g, " ");
  const fijas: Record<string, number> = {
    "media hora": 30 * MINUTO,
    "un cuarto de hora": 15 * MINUTO,
    "cuarto de hora": 15 * MINUTO,
    "tres cuartos de hora": 45 * MINUTO,
    "hora y media": 90 * MINUTO,
    "una hora y media": 90 * MINUTO,
    "un minuto": MINUTO,
    "una hora": HORA,
  };
  if (texto in fijas) return validar(fijas[texto]);

  // "2 horas y media", "1 hora y 15 minutos"
  const compuesta = texto.match(/^(\S+) horas? y (media|\S+ minutos?|\S+ min)$/);
  if (compuesta) {
    const horas = cantidad(compuesta[1]);
    const resto = compuesta[2] === "media" ? 30 * MINUTO : leerDuracion(compuesta[2]);
    return horas === null || resto === null ? null : validar(horas * HORA + resto);
  }

  const simple = texto.match(/^(\S+)(?: (horas?|hrs?|h|minutos?|mins?|m|segundos?|segs?|s))?$/);
  if (!simple) return null;
  const valor = cantidad(simple[1]);
  if (valor === null) return null;
  const unidad = simple[2] ?? "min";
  const factor = /^h/.test(unidad) ? HORA : /^s/.test(unidad) ? SEGUNDO : MINUTO;
  return validar(valor * factor);
}

function validar(ms: number): number | null {
  const redondeado = Math.round(ms);
  return redondeado >= SEGUNDO && redondeado <= MAXIMO ? redondeado : null;
}

/** "25 minutos", "1 hora y 30 minutos", "45 segundos": para las respuestas. */
export function describirDuracion(ms: number): string {
  const total = Math.round(ms / SEGUNDO);
  if (total < 60) return `${total} ${total === 1 ? "segundo" : "segundos"}`;
  const minutos = Math.round(total / 60);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  const textoMinutos = `${resto} ${resto === 1 ? "minuto" : "minutos"}`;
  if (horas === 0) return textoMinutos;
  const textoHoras = `${horas} ${horas === 1 ? "hora" : "horas"}`;
  return resto === 0 ? textoHoras : `${textoHoras} y ${textoMinutos}`;
}

/** "12:34" o "1:02:03": para la cuenta regresiva. */
export function reloj(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / SEGUNDO));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  const dos = (n: number) => String(n).padStart(2, "0");
  return horas > 0 ? `${horas}:${dos(minutos)}:${dos(segundos)}` : `${minutos}:${dos(segundos)}`;
}

export const UNIDADES = { SEGUNDO, MINUTO, HORA };

/**
 * La expresión regular de una duración, para la ranura {tiempo} de las plantillas. Las formas
 * largas van primero y la unidad es codiciosa: en "recuérdame en 10 minutos sacar la ropa"
 * captura "10 minutos", no solo "10".
 */
const NUMERO = `(?:\\d+(?:[.,]\\d+)?|${Object.keys(PALABRAS).sort((a, b) => b.length - a.length).join("|")})`;
const UNIDAD = "(?:horas?|hrs?|h|minutos?|mins?|m|segundos?|segs?|s)";
export const PATRON_DURACION = [
  "media hora",
  "(?:un |tres )?cuartos? de hora",
  "(?:una )?hora y media",
  `${NUMERO} horas? y (?:media|${NUMERO} (?:minutos?|mins?))`,
  `${NUMERO}(?: ${UNIDAD})?`,
].join("|");
