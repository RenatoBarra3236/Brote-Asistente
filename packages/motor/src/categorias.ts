// Categorías de gasto y las palabras que las delatan. Se elige la categoría por la
// descripción ("almuerzo" → comida); si ninguna palabra calza, queda en "otros".

export const CATEGORIAS = ["comida", "transporte", "estudio", "salidas", "salud", "cuentas", "otros"] as const;

export type Categoria = (typeof CATEGORIAS)[number];

const PALABRAS: Record<Exclude<Categoria, "otros">, string[]> = {
  comida: [
    "almuerzo", "desayuno", "once", "cena", "comida", "cafe", "completo", "sushi", "pizza", "colacion",
    "snack", "bebida", "super", "supermercado", "pan", "empanada", "hamburguesa", "fruta", "galleta", "jugo",
    "chicle", "dulce", "golosina", "chocolate", "helado", "papas", "sopaipilla", "mote", "te",
  ],
  transporte: [
    "micro", "metro", "bip", "uber", "didi", "cabify", "taxi", "colectivo", "bencina", "pasaje", "bus",
    "estacionamiento", "tren", "bicicleta", "scooter",
  ],
  estudio: [
    "fotocopia", "impresion", "libro", "apunte", "cuaderno", "matricula", "arancel", "curso", "u",
    "universidad", "material", "lapiz", "calculadora", "estudio",
  ],
  salidas: [
    "cine", "carrete", "cerveza", "chela", "copete", "entrada", "concierto", "juego", "netflix", "spotify",
    "salida", "bar", "disco", "regalo",
  ],
  salud: ["farmacia", "remedio", "doctor", "medico", "dentista", "consulta", "examen", "vitamina"],
  cuentas: ["luz", "agua", "gas", "internet", "arriendo", "plan", "celular", "telefono", "cuenta", "gastos comunes"],
};

/** Cómo se puede nombrar cada categoría al consultar ("¿cuánto llevo en carrete?"). */
export const NOMBRES_DE_CATEGORIA: Record<string, Categoria> = {
  comida: "comida",
  "la comida": "comida",
  transporte: "transporte",
  "el transporte": "transporte",
  movilizacion: "transporte",
  estudio: "estudio",
  estudios: "estudio",
  "la u": "estudio",
  universidad: "estudio",
  salidas: "salidas",
  carrete: "salidas",
  entretencion: "salidas",
  salud: "salud",
  cuentas: "cuentas",
  otros: "otros",
  "otras cosas": "otros",
};

/** Quita el plural simple: "fotocopias" → "fotocopia", "impresiones" → "impresion". */
function singular(palabra: string): string {
  if (palabra.endsWith("ones")) return palabra.slice(0, -2);
  if (palabra.length > 3 && palabra.endsWith("s")) return palabra.slice(0, -1);
  return palabra;
}

/** La categoría que corresponde a una descripción ya normalizada. */
export function categoriaDe(descripcion: string): Categoria {
  const palabras = descripcion.split(" ").map(singular);
  for (const [categoria, claves] of Object.entries(PALABRAS)) {
    for (const clave of claves) {
      const encontrada = clave.includes(" ") ? descripcion.includes(clave) : palabras.includes(clave);
      if (encontrada) return categoria as Categoria;
    }
  }
  return "otros";
}

/** Cómo se ve cada categoría en la isla (pestaña Plata): un emoji y un color propio. */
export const EMOJI_CATEGORIA: Record<Categoria, string> = {
  comida: "🍔",
  transporte: "🚌",
  estudio: "📚",
  salidas: "🎉",
  salud: "💊",
  cuentas: "💡",
  otros: "🧾",
};

export const COLOR_CATEGORIA: Record<Categoria, string> = {
  comida: "#ff8a66",
  transporte: "#5ca0ff",
  estudio: "#a084fa",
  salidas: "#ffba48",
  salud: "#5fd3b8",
  cuentas: "#f2d05b",
  otros: "#9aa0ab",
};
