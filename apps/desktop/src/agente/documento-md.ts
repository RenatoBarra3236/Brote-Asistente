// Un lector de Markdown un poco más completo que el de la burbuja (`markdown.ts`), para mostrar los
// documentos que vienen con la app (por ahora, docs/privacidad.md): títulos, párrafos, listas y tablas.
// Devuelve una estructura; la ventana la convierte en elementos con texto, nunca en HTML. Sin DOM.

import { analizarLinea, type Fragmento } from "./markdown.ts";

export type BloqueDocumento =
  | { tipo: "titulo"; nivel: 1 | 2 | 3; texto: Fragmento[] }
  | { tipo: "parrafo"; texto: Fragmento[] }
  | { tipo: "lista"; items: Fragmento[][] }
  | { tipo: "tabla"; cabecera: Fragmento[][]; filas: Fragmento[][][] };

const TITULO = /^(#{1,3})\s+(.*)$/;
const VINETA = /^\s*[-*]\s+(.*)$/;
const SEPARADOR_TABLA = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** Las celdas de una fila de tabla: se parte por «|» fuera de los trozos `con acentos graves`. */
export function celdasDeFila(linea: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let enCodigo = false;
  for (const letra of linea.trim()) {
    if (letra === "`") enCodigo = !enCodigo;
    if (letra === "|" && !enCodigo) {
      celdas.push(actual);
      actual = "";
    } else actual += letra;
  }
  celdas.push(actual);
  // Una fila escrita «| a | b |» deja vacías las puntas.
  if (celdas.length > 0 && celdas[0].trim() === "") celdas.shift();
  if (celdas.length > 0 && celdas[celdas.length - 1].trim() === "") celdas.pop();
  return celdas.map((c) => c.trim());
}

export function analizarDocumento(texto: string): BloqueDocumento[] {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const bloques: BloqueDocumento[] = [];
  let parrafo: string[] = [];
  const cerrarParrafo = () => {
    if (parrafo.length > 0) bloques.push({ tipo: "parrafo", texto: analizarLinea(parrafo.join(" ")) });
    parrafo = [];
  };
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (linea.trim() === "") {
      cerrarParrafo();
      continue;
    }
    const titulo = TITULO.exec(linea);
    if (titulo) {
      cerrarParrafo();
      bloques.push({ tipo: "titulo", nivel: titulo[1].length as 1 | 2 | 3, texto: analizarLinea(titulo[2]) });
      continue;
    }
    if (linea.trim().startsWith("|") && i + 1 < lineas.length && SEPARADOR_TABLA.test(lineas[i + 1])) {
      cerrarParrafo();
      const cabecera = celdasDeFila(linea).map(analizarLinea);
      const filas: Fragmento[][][] = [];
      i += 2;
      while (i < lineas.length && lineas[i].trim().startsWith("|")) {
        filas.push(celdasDeFila(lineas[i]).map(analizarLinea));
        i++;
      }
      i--;
      bloques.push({ tipo: "tabla", cabecera, filas });
      continue;
    }
    const vineta = VINETA.exec(linea);
    if (vineta) {
      cerrarParrafo();
      const anterior = bloques[bloques.length - 1];
      const item = analizarLinea(vineta[1]);
      if (anterior?.tipo === "lista") anterior.items.push(item);
      else bloques.push({ tipo: "lista", items: [item] });
      continue;
    }
    parrafo.push(linea.replace(/^>\s?/, "").trim());
  }
  cerrarParrafo();
  return bloques;
}
