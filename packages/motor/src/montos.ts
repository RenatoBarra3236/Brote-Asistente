// Lee montos escritos como los escribe un estudiante en Chile: "5 lucas", "luca y media",
// "12 mil", "3k", "$3.500", "un palo". Recibe texto ya normalizado (ver texto.ts).

const PALABRAS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40,
  cincuenta: 50, cien: 100,
};

const UNIDADES: Record<string, number> = {
  luca: 1000, lucas: 1000, mil: 1000, k: 1000, palo: 1_000_000, palos: 1_000_000,
};

/** El monto más alto que se acepta, para no anotar por error un número absurdo. */
const MAXIMO = 100_000_000;

/** Un número escrito con cifras ("2,5", "3.500") o con palabras ("dos"). */
function leerCantidad(texto: string, conUnidad: boolean): number | null {
  if (texto in PALABRAS) return PALABRAS[texto];
  if (!/^\d[\d.,]*$/.test(texto)) return null;
  // Con unidad ("2,5 lucas") la coma o el punto son decimales; sin unidad, el punto
  // separa miles ("3.500") y la coma es decimal.
  if (conUnidad) return Number(texto.replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(texto)) return Number(texto.replace(/\./g, ""));
  return Number(texto.replace(",", "."));
}

/** El monto en pesos, o `null` si el texto no es un monto. */
export function leerMonto(entrada: string): number | null {
  let texto = entrada.replace(/\$\s*/g, "").replace(/\s+(pesos|lucas?\s+chilenas|clp)$/, "").trim();
  texto = texto.replace(/^(\d[\d.,]*)\s*(k|mil|lucas?|palos?)$/, "$1 $2");

  // "media luca", "medio palo"
  const medio = texto.match(/^medi[ao] (luca|palo)$/);
  if (medio) return UNIDADES[medio[1]] / 2;

  // "luca y media", "2 lucas y media", "un palo"
  const conUnidad = texto.match(/^(?:(.+?) )?(lucas?|mil|k|palos?)( y medi[ao])?$/);
  if (conUnidad) {
    const [, cantidadTexto, unidad, ymedia] = conUnidad;
    const cantidad = cantidadTexto === undefined ? 1 : leerCantidad(cantidadTexto, true);
    if (cantidad === null || !Number.isFinite(cantidad)) return null;
    return validar((cantidad + (ymedia ? 0.5 : 0)) * UNIDADES[unidad]);
  }

  const cantidad = leerCantidad(texto, false);
  return cantidad === null ? null : validar(cantidad);
}

function validar(monto: number): number | null {
  const redondeado = Math.round(monto);
  return redondeado > 0 && redondeado <= MAXIMO ? redondeado : null;
}
