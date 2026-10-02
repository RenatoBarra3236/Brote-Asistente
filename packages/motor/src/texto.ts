// Utilidades de texto compartidas por las plantillas y los lectores de montos y periodos.

export interface TextoNormalizado {
  /** Minúsculas, sin tildes ni signos de pregunta o exclamación, espacios simples. */
  texto: string;
  /** Para cada letra de `texto`, su posición en el original (para recuperar "café" y no "cafe"). */
  origen: number[];
}

/** Normaliza letra por letra, recordando de dónde salió cada una. */
export function normalizarConMapa(original: string): TextoNormalizado {
  let texto = "";
  const origen: number[] = [];
  for (let i = 0; i < original.length; i++) {
    let letra = original[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (/[¿?¡!\s]/.test(letra)) letra = " ";
    // Un punto o una coma al final de una palabra es puntuación; dentro de un número ("3.500"), no.
    if (/[.,;:]/.test(letra) && (i + 1 === original.length || /\s/.test(original[i + 1]))) continue;
    if (letra === "" || (letra === " " && (texto === "" || texto.endsWith(" ")))) continue;
    for (const parte of letra) {
      texto += parte;
      origen.push(i);
    }
  }
  if (texto.endsWith(" ")) {
    texto = texto.slice(0, -1);
    origen.pop();
  }
  return { texto, origen };
}

export function normalizar(original: string): string {
  return normalizarConMapa(original).texto;
}

/** Pesos chilenos con punto de miles: 23500 → "$23.500". */
export function formatearMonto(monto: number): string {
  return `$${String(Math.round(monto)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
