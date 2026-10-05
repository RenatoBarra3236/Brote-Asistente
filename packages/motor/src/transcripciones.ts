// Contrato común de las transcripciones de Brote (sección 8 de docs/plan-rediseno.md). Sin imports de
// Node: lo usarán el PC, el celular y la casa, que solo tienen que entregar este formato.
//
// Un Markdown por grabación en ~/.asistente-prototipo/transcripciones/<id>.md:
//
//   ---
//   fecha: 2026-10-04T10:30:00-03:00
//   duracionSeg: 3725
//   origen: pc
//   modelo: small
//   idioma: es
//   avisoAPresentes: si
//   ---
//
//   [00:00:00] Buenos días, hoy vemos derivadas.
//   [00:00:07] Partimos con la regla de la cadena.
//
// El audio de esa grabación, mientras no se borre, es `<id>.wav` en la carpeta de grabaciones.

export const ORIGENES = ["pc", "celular", "casa"] as const;
export type Origen = (typeof ORIGENES)[number];

/** Respuesta a "¿avisaste a los presentes?" (una vez por grabación). */
export const AVISOS_A_PRESENTES = ["si", "no", "solo-mi-voz"] as const;
export type AvisoAPresentes = (typeof AVISOS_A_PRESENTES)[number];

/** Lo que devuelve `transcribir(audio, modelo)`: un trozo de texto con su tiempo, en segundos. */
export interface Segmento {
  inicioSeg: number;
  finSeg: number;
  texto: string;
}

/** La interfaz que cada aparato implementa a su manera (whisper-cli en el PC; otra en el celular o la casa). */
export type Transcribir = (audio: string, modelo: string) => Promise<Segmento[]>;

export interface Transcripcion {
  /** Identificador de la grabación (`idDeGrabacion`); también el nombre del archivo sin extensión. */
  id: string;
  fecha: string;
  duracionSeg: number;
  origen: Origen;
  modelo: string;
  idioma: string;
  avisoAPresentes: AvisoAPresentes;
  segmentos: Segmento[];
}

/** Lo que dice la cabecera, sin el texto (para listar sin cargar transcripciones enteras). */
export type CabeceraTranscripcion = Omit<Transcripcion, "segmentos">;

/** Tope de una grabación (3 horas), para no llenar el disco por un olvido. */
export const MAX_DURACION_SEG = 3 * 60 * 60;
/** Días que se conserva el audio antes de borrarse solo. */
export const DIAS_AUDIO_POR_DEFECTO = 7;
export const IDIOMA_POR_DEFECTO = "es";
/** Tamaño de un trozo para el agente, en caracteres (unos 3.000 tokens). */
export const MAX_CARACTERES_TROZO = 12_000;

/** `2026-10-04-103000`, con la hora local. */
export const PATRON_ID = /^\d{4}-\d{2}-\d{2}-\d{6}$/;
export const PATRON_ARCHIVO_TRANSCRIPCION = /^(\d{4}-\d{2}-\d{2}-\d{6})\.md$/;
export const PATRON_ARCHIVO_AUDIO = /^(\d{4}-\d{2}-\d{2}-\d{6})\.wav$/;

const dos = (n: number) => String(n).padStart(2, "0");

/** El id de una grabación que empieza en `fecha` (hora local). */
export function idDeGrabacion(fecha: Date): string {
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}-${dos(fecha.getHours())}${dos(fecha.getMinutes())}${dos(fecha.getSeconds())}`;
}

/** La hora de un id (local), o `null` si no tiene la forma exacta. */
export function fechaDeId(id: string): Date | null {
  if (!PATRON_ID.test(id)) return null;
  const [a, m, d, hms] = [id.slice(0, 4), id.slice(5, 7), id.slice(8, 10), id.slice(11)];
  const fecha = new Date(+a, +m - 1, +d, +hms.slice(0, 2), +hms.slice(2, 4), +hms.slice(4, 6));
  // `new Date` corrige las fechas imposibles (31 de febrero): un id así no es uno nuestro.
  return idDeGrabacion(fecha) === id ? fecha : null;
}

/** `[01:02:03]` */
export function formatearMarca(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `[${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}]`;
}

function limpiarTexto(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/** Una cabecera de un solo renglón por campo: lo que no cabe así no se escribe. */
function valorDeCabecera(valor: string, campo: string): string {
  const limpio = valor.trim();
  if (!limpio || /[\r\n]/.test(limpio)) throw new Error(`${campo} inválido`);
  return limpio;
}

/** Arma el archivo. Lanza si un campo no es válido (mejor no guardar que guardar algo que no se lee). */
export function escribirTranscripcion(t: Transcripcion): string {
  if (!ORIGENES.includes(t.origen)) throw new Error("origen inválido");
  if (!AVISOS_A_PRESENTES.includes(t.avisoAPresentes)) throw new Error("avisoAPresentes inválido");
  if (!Number.isFinite(t.duracionSeg) || t.duracionSeg < 0) throw new Error("duración inválida");
  if (!PATRON_ID.test(t.id)) throw new Error("id inválido");
  const cabecera = [
    "---",
    `fecha: ${valorDeCabecera(t.fecha, "fecha")}`,
    `duracionSeg: ${Math.round(t.duracionSeg)}`,
    `origen: ${t.origen}`,
    `modelo: ${valorDeCabecera(t.modelo, "modelo")}`,
    `idioma: ${valorDeCabecera(t.idioma, "idioma")}`,
    `avisoAPresentes: ${t.avisoAPresentes}`,
    "---",
  ];
  const lineas = t.segmentos
    .map((s) => ({ ...s, texto: limpiarTexto(s.texto) }))
    .filter((s) => s.texto)
    .map((s) => `${formatearMarca(s.inicioSeg)} ${s.texto}`);
  return `${cabecera.join("\n")}\n\n${lineas.join("\n")}\n`;
}

const MARCA = /^\[(\d{2,}):([0-5]\d):([0-5]\d)\] (.+)$/;

/** Separa la cabecera del cuerpo. `null` si el archivo no empieza con una cabecera cerrada. */
function partirCabecera(contenido: string): { campos: Record<string, string>; cuerpo: string } | null {
  const lineas = contenido.replace(/\r\n/g, "\n").split("\n");
  if (lineas[0] !== "---") return null;
  const fin = lineas.indexOf("---", 1);
  if (fin < 0) return null;
  const campos: Record<string, string> = {};
  for (const linea of lineas.slice(1, fin)) {
    const par = linea.match(/^([A-Za-z]+): (.*)$/);
    if (par) campos[par[1]] = par[2].trim();
  }
  return { campos, cuerpo: lineas.slice(fin + 1).join("\n") };
}

/** Lee solo la cabecera. `null` si falta algo o no es válido. */
export function leerCabecera(id: string, contenido: string): CabeceraTranscripcion | null {
  const partes = partirCabecera(contenido);
  if (!partes || !PATRON_ID.test(id)) return null;
  const { fecha, duracionSeg, origen, modelo, idioma, avisoAPresentes } = partes.campos;
  const duracion = Number(duracionSeg);
  if (!fecha || !modelo || !idioma) return null;
  if (!duracionSeg || !Number.isFinite(duracion) || duracion < 0) return null;
  if (!(ORIGENES as readonly string[]).includes(origen)) return null;
  if (!(AVISOS_A_PRESENTES as readonly string[]).includes(avisoAPresentes)) return null;
  return { id, fecha, duracionSeg: duracion, origen: origen as Origen, modelo, idioma, avisoAPresentes: avisoAPresentes as AvisoAPresentes };
}

/** Lee el archivo entero. El fin de cada segmento es el inicio del siguiente (el último, la duración). */
export function leerTranscripcion(id: string, contenido: string): Transcripcion | null {
  const cabecera = leerCabecera(id, contenido);
  const partes = partirCabecera(contenido);
  if (!cabecera || !partes) return null;
  const inicios: { inicioSeg: number; texto: string }[] = [];
  for (const linea of partes.cuerpo.split("\n")) {
    const m = linea.match(MARCA);
    if (m) inicios.push({ inicioSeg: +m[1] * 3600 + +m[2] * 60 + +m[3], texto: m[4].trim() });
    else if (linea.trim() && inicios.length) inicios[inicios.length - 1].texto += ` ${linea.trim()}`;
  }
  const segmentos = inicios.map((s, i) => ({
    inicioSeg: s.inicioSeg,
    finSeg: Math.max(s.inicioSeg, inicios[i + 1]?.inicioSeg ?? cabecera.duracionSeg),
    texto: s.texto,
  }));
  return { ...cabecera, segmentos };
}

export interface Trozo {
  /** 1, 2, 3… */
  numero: number;
  total: number;
  desdeSeg: number;
  hastaSeg: number;
  texto: string;
}

/** El texto con sus marcas, tal como lo lee el agente. */
export function textoConMarcas(segmentos: readonly Segmento[]): string {
  return segmentos
    .map((s) => ({ ...s, texto: limpiarTexto(s.texto) }))
    .filter((s) => s.texto)
    .map((s) => `${formatearMarca(s.inicioSeg)} ${s.texto}`)
    .join("\n");
}

/**
 * Parte una transcripción larga en trozos de como mucho `maximo` caracteres, siempre entre segmentos
 * (un segmento más largo que el máximo se corta entre palabras). Cada trozo sabe de qué segundo a
 * qué segundo va, para que el agente pida "el siguiente" o cite el minuto.
 */
export function partirEnTrozos(segmentos: readonly Segmento[], maximo = MAX_CARACTERES_TROZO): Trozo[] {
  if (!Number.isInteger(maximo) || maximo < 100) throw new Error("el máximo de un trozo es de al menos 100 caracteres");
  type Pieza = { inicioSeg: number; finSeg: number; linea: string };
  const piezas: Pieza[] = [];
  for (const s of segmentos) {
    const texto = limpiarTexto(s.texto);
    if (!texto) continue;
    const marca = `${formatearMarca(s.inicioSeg)} `;
    const cabe = maximo - marca.length;
    if (texto.length <= cabe) {
      piezas.push({ inicioSeg: s.inicioSeg, finSeg: s.finSeg, linea: marca + texto });
      continue;
    }
    // Un segmento enorme: se corta entre palabras y todos los pedazos repiten la marca de su inicio.
    let resto = texto;
    while (resto.length > cabe) {
      let corte = resto.lastIndexOf(" ", cabe);
      if (corte <= 0) corte = cabe;
      piezas.push({ inicioSeg: s.inicioSeg, finSeg: s.finSeg, linea: marca + resto.slice(0, corte).trim() });
      resto = resto.slice(corte).trim();
    }
    if (resto) piezas.push({ inicioSeg: s.inicioSeg, finSeg: s.finSeg, linea: marca + resto });
  }
  const grupos: Pieza[][] = [];
  let actual: Pieza[] = [];
  let largo = 0;
  for (const p of piezas) {
    const suma = p.linea.length + (actual.length ? 1 : 0);
    if (actual.length && largo + suma > maximo) {
      grupos.push(actual);
      actual = [];
      largo = 0;
    }
    largo += p.linea.length + (actual.length ? 1 : 0);
    actual.push(p);
  }
  if (actual.length) grupos.push(actual);
  return grupos.map((g, i) => ({
    numero: i + 1,
    total: grupos.length,
    desdeSeg: g[0].inicioSeg,
    hastaSeg: Math.max(...g.map((p) => p.finSeg)),
    texto: g.map((p) => p.linea).join("\n"),
  }));
}
