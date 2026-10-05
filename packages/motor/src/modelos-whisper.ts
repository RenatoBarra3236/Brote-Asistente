// Los modelos de whisper.cpp que Brote deja elegir (sección 8 de docs/plan-rediseno.md). Sin imports de
// Node: lo comparan las pruebas con la lista cerrada de Rust (src-tauri/src/modelos.rs), que es quien
// descarga y valida. Cifras verificadas el 5-10-2026 con los encabezados de Hugging Face (`x-linked-size`
// y `x-linked-etag`, que es el SHA-256 del archivo) del commit fijado abajo: si el repositorio cambia un
// modelo, la descarga falla la verificación en vez de aceptar algo distinto.

export const MODELOS_WHISPER = ["base", "small", "medium", "large-v3-turbo"] as const;
export type ModeloWhisper = (typeof MODELOS_WHISPER)[number];

/** El que se propone de partida. */
export const MODELO_WHISPER_POR_DEFECTO: ModeloWhisper = "small";

/** Commit de https://huggingface.co/ggerganov/whisper.cpp del que salen las cifras. */
export const COMMIT_MODELOS_WHISPER = "5359861c739e955e79d9a303bcbc70fb988958b1";
export const HOST_MODELOS_WHISPER = "huggingface.co";

export interface FichaModeloWhisper {
  id: ModeloWhisper;
  /** Nombre del archivo en la carpeta de modelos. */
  archivo: string;
  bytes: number;
  sha256: string;
  /** Una línea para quien elige. */
  nota: string;
}

export const FICHAS_MODELOS_WHISPER: Record<ModeloWhisper, FichaModeloWhisper> = {
  base: {
    id: "base",
    archivo: "ggml-base.bin",
    bytes: 147_951_465,
    sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    nota: "El más liviano y rápido; se equivoca más con voces lejanas o acentos.",
  },
  small: {
    id: "small",
    archivo: "ggml-small.bin",
    bytes: 487_601_967,
    sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
    nota: "El punto medio: buena calidad en español sin pedirle mucho al computador.",
  },
  medium: {
    id: "medium",
    archivo: "ggml-medium.bin",
    bytes: 1_533_763_059,
    sha256: "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208",
    nota: "Más preciso y más lento; conviene si tu computador es potente.",
  },
  "large-v3-turbo": {
    id: "large-v3-turbo",
    archivo: "ggml-large-v3-turbo.bin",
    bytes: 1_624_555_275,
    sha256: "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69",
    nota: "El más preciso de la lista; el que más pesa y más memoria pide.",
  },
};

export function esModeloWhisper(valor: unknown): valor is ModeloWhisper {
  return typeof valor === "string" && (MODELOS_WHISPER as readonly string[]).includes(valor);
}

/** La dirección oficial de descarga de un modelo (fijada al commit, así el hash no cambia). */
export function urlModeloWhisper(modelo: ModeloWhisper): string {
  return `https://${HOST_MODELOS_WHISPER}/ggerganov/whisper.cpp/resolve/${COMMIT_MODELOS_WHISPER}/${FICHAS_MODELOS_WHISPER[modelo].archivo}`;
}

/** "488 MB", "1,5 GB" (decimales con coma, como en el resto de la isla). */
export function tamanoDeModelo(modelo: ModeloWhisper): string {
  const { bytes } = FICHAS_MODELOS_WHISPER[modelo];
  const mb = bytes / 1_000_000;
  return mb >= 1000 ? `${(mb / 1000).toFixed(1).replace(".", ",")} GB` : `${Math.round(mb)} MB`;
}

/**
 * La duración (en segundos) de un WAV PCM a partir de sus primeros bytes y del tamaño del archivo.
 * `null` si no es un WAV que entendamos. Se lee el encabezado RIFF: `fmt ` (tasa de bytes) y `data`.
 */
export function duracionDeWav(cabecera: Uint8Array, bytesTotales: number): number | null {
  const v = new DataView(cabecera.buffer, cabecera.byteOffset, cabecera.byteLength);
  const texto = (desde: number) => String.fromCharCode(...cabecera.slice(desde, desde + 4));
  if (cabecera.length < 12 || texto(0) !== "RIFF" || texto(8) !== "WAVE") return null;
  let posicion = 12;
  let bytesPorSegundo = 0;
  while (posicion + 8 <= cabecera.length) {
    const id = texto(posicion);
    const largo = v.getUint32(posicion + 4, true);
    if (id === "fmt " && posicion + 8 + 12 <= cabecera.length) {
      bytesPorSegundo = v.getUint32(posicion + 8 + 8, true);
    } else if (id === "data") {
      if (!bytesPorSegundo) return null;
      // Un WAV que se está grabando (o cortado) puede tener el largo en 0 o más grande que el archivo.
      const disponible = Math.max(0, bytesTotales - (posicion + 8));
      const datos = largo === 0 || largo === 0xffffffff || largo > disponible ? disponible : largo;
      return datos / bytesPorSegundo;
    }
    posicion += 8 + largo + (largo % 2);
  }
  return null;
}
