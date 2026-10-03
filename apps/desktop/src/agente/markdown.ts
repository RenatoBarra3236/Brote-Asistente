// Markdown mínimo para la burbuja: párrafos, listas, **negrita**, *cursiva* y `código`.
// Es un lector propio y pequeño: devuelve una estructura que la isla convierte en elementos
// con texto, nunca en HTML, así que la respuesta del agente no puede inyectar nada.
// Lo que no reconoce (o un marcador sin cerrar mientras la respuesta va llegando) queda como texto.

export type Fragmento =
  | { tipo: "texto"; texto: string }
  | { tipo: "negrita"; texto: string }
  | { tipo: "cursiva"; texto: string }
  | { tipo: "codigo"; texto: string };

export type Bloque =
  | { tipo: "parrafo"; lineas: Fragmento[][] }
  | { tipo: "lista"; ordenada: boolean; items: Fragmento[][] };

const VINETA = /^\s*[-*•]\s+(.*)$/;
const NUMERO = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Los fragmentos de una línea: **negrita**, *cursiva* o _cursiva_, `código`. Con guion bajo solo
 * cuenta al borde de una palabra (como en Markdown): "session10_intro_ml.pdf" queda tal cual.
 */
export function analizarLinea(linea: string): Fragmento[] {
  const fragmentos: Fragmento[] = [];
  const marcas = /`([^`]+)`|\*\*([^*]+)\*\*|(?<![\p{L}\p{N}])__([^_]+)__(?![\p{L}\p{N}])|\*([^*\s][^*]*)\*|(?<![\p{L}\p{N}_])_([^_\s][^_]*)_(?![\p{L}\p{N}_])/gu;
  let desde = 0;
  for (const marca of linea.matchAll(marcas)) {
    if (marca.index > desde) fragmentos.push({ tipo: "texto", texto: linea.slice(desde, marca.index) });
    const [, codigo, negrita, negrita2, cursiva, cursiva2] = marca;
    if (codigo !== undefined) fragmentos.push({ tipo: "codigo", texto: codigo });
    else if (negrita !== undefined || negrita2 !== undefined) fragmentos.push({ tipo: "negrita", texto: negrita ?? negrita2 });
    else fragmentos.push({ tipo: "cursiva", texto: cursiva ?? cursiva2 });
    desde = marca.index + marca[0].length;
  }
  if (desde < linea.length) fragmentos.push({ tipo: "texto", texto: linea.slice(desde) });
  return fragmentos;
}

/** Bloques del texto: listas seguidas forman una lista; el resto, párrafos separados por líneas en blanco. */
export function analizarMarkdown(texto: string): Bloque[] {
  const bloques: Bloque[] = [];
  let parrafo: Fragmento[][] = [];
  const cerrarParrafo = () => {
    if (parrafo.length > 0) bloques.push({ tipo: "parrafo", lineas: parrafo });
    parrafo = [];
  };

  for (const crudo of texto.replace(/\r\n/g, "\n").split("\n")) {
    const vineta = crudo.match(VINETA);
    const numero = vineta ? null : crudo.match(NUMERO);
    if (vineta || numero) {
      cerrarParrafo();
      const ordenada = numero !== null;
      const ultimo = bloques[bloques.length - 1];
      const item = analizarLinea((vineta ?? numero)![1]);
      if (ultimo?.tipo === "lista" && ultimo.ordenada === ordenada) ultimo.items.push(item);
      else bloques.push({ tipo: "lista", ordenada, items: [item] });
      continue;
    }
    if (crudo.trim() === "") {
      cerrarParrafo();
      continue;
    }
    // Un título (# …) se muestra como una línea en negrita.
    const titulo = crudo.match(/^\s*#{1,6}\s+(.*)$/);
    parrafo.push(titulo ? [{ tipo: "negrita", texto: titulo[1] }] : analizarLinea(crudo));
  }
  cerrarParrafo();
  return bloques;
}
