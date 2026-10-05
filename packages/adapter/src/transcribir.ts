// Transcripción local con whisper.cpp (sección 8 de docs/plan-rediseno.md, fase 2): implementa la
// interfaz `Transcribir` del motor lanzando `whisper-cli` como proceso hijo. Argumentos siempre como
// arreglo (nunca por shell), sin consola en Windows, sin ANTHROPIC_API_KEY, con tiempo máximo y
// cancelable. El audio no sale del computador: whisper-cli no usa la red.
//
// Salida: `-oj -of <base>` escribe `<base>.json` (verificado en whisper.cpp 1.9.4, examples/cli/cli.cpp):
//   { "transcription": [ { "offsets": { "from": 0, "to": 3200 }, "text": " Hola" }, … ], … }
// con los tiempos en milisegundos. Se lee ese archivo (no la salida estándar, que mezcla registros).
import { spawn } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, openSync, readFileSync, readSync, closeSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import {
  FICHAS_MODELOS_WHISPER,
  IDIOMA_POR_DEFECTO,
  MAX_DURACION_SEG,
  PATRON_ARCHIVO_AUDIO,
  carpetaGrabaciones,
  duracionDeWav,
  esModeloWhisper,
  type Segmento,
  type Transcribir,
} from "@asistente/motor";

const EN_WINDOWS = process.platform === "win32";

/** Tiempo máximo de un proceso: 3 h de audio no deberían tardar más que esto ni en un equipo modesto. */
export const TIEMPO_MAXIMO_MS = 4 * 60 * 60 * 1000;

export function carpetaModelos(): string {
  return process.env.ASISTENTE_MODELOS ?? join(homedir(), ".asistente-prototipo", "modelos");
}

/** Dónde puede estar `whisper-cli`: `ASISTENTE_WHISPER`, el PATH y las carpetas típicas de Homebrew. */
export function buscarWhisper(): string | null {
  const propia = process.env.ASISTENTE_WHISPER;
  if (propia) return existsSync(propia) ? propia : null;
  const carpetas = [...(process.env.PATH ?? "").split(delimiter), dirname(process.execPath)];
  if (!EN_WINDOWS) carpetas.push("/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".local", "bin"));
  const variantes = EN_WINDOWS ? ["whisper-cli.exe", "whisper-cli.cmd"] : ["whisper-cli"];
  for (const carpeta of [...new Set(carpetas.filter(Boolean))]) {
    for (const variante of variantes) {
      const ruta = join(carpeta, variante);
      if (existsSync(ruta)) return ruta;
    }
  }
  return null;
}

/** El archivo de un modelo descargado, si está completo (el tamaño exacto de la lista cerrada). */
export function rutaDeModelo(modelo: string, carpeta: string = carpetaModelos()): string | null {
  if (!esModeloWhisper(modelo)) return null;
  const ficha = FICHAS_MODELOS_WHISPER[modelo];
  const ruta = join(carpeta, ficha.archivo);
  try {
    const info = lstatSync(ruta);
    return info.isFile() && info.size === ficha.bytes ? ruta : null;
  } catch {
    return null;
  }
}

/** Qué hay instalado, para Configurar Brote: el programa y cada modelo. */
export function estadoWhisper(carpeta: string = carpetaModelos()): { whisper: string | null; modelos: Record<string, boolean> } {
  return {
    whisper: buscarWhisper(),
    modelos: Object.fromEntries(Object.keys(FICHAS_MODELOS_WHISPER).map((m) => [m, rutaDeModelo(m, carpeta) !== null])),
  };
}

/**
 * Valida que `audio` sea `<id>.wav`, archivo regular (no enlace), dentro de la carpeta de grabaciones, y
 * devuelve su ruta real. Lanza si no.
 */
export function validarAudio(audio: string, carpeta: string = carpetaGrabaciones()): string {
  const ruta = resolve(audio);
  if (dirname(ruta) !== resolve(carpeta) || !PATRON_ARCHIVO_AUDIO.test(basename(ruta))) {
    throw new Error("el audio debe ser una grabación (<id>.wav) de la carpeta de grabaciones");
  }
  const info = lstatSync(ruta); // lanza si no existe
  if (!info.isFile()) throw new Error("el audio no es un archivo");
  return ruta;
}

/** La duración del WAV en segundos (lee solo su encabezado). Lanza si no es un WAV que entendamos. */
export function duracionDeArchivoWav(ruta: string): number {
  const info = lstatSync(ruta);
  const fd = openSync(ruta, "r");
  try {
    const buffer = Buffer.alloc(4096);
    const leidos = readSync(fd, buffer, 0, buffer.length, 0);
    const duracion = duracionDeWav(buffer.subarray(0, leidos), info.size);
    if (duracion === null) throw new Error("el archivo no es un WAV que Brote entienda");
    return duracion;
  } finally {
    closeSync(fd);
  }
}

/**
 * Whisper pone marcas como "[Música]", "(aplausos)" o "*ruido*" donde no hay voz (medido el 5-10-2026 con
 * 3 s de silencio: "[Música]"). Un segmento que es solo eso no es lo que se dijo y no se guarda. (`-sns`
 * no sirve: sobre silencio inventa frases.)
 */
export function esMarcaSinHabla(texto: string): boolean {
  return /^(\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪+)$/.test(texto.trim());
}

/** Convierte el JSON de whisper-cli en segmentos (en segundos). Lanza si no tiene la forma esperada. */
export function leerSalidaWhisper(json: string): Segmento[] {
  const datos = JSON.parse(json) as { transcription?: unknown };
  if (!Array.isArray(datos.transcription)) throw new Error("whisper-cli devolvió algo que no entiendo");
  const segmentos: Segmento[] = [];
  for (const crudo of datos.transcription) {
    const s = crudo as { offsets?: { from?: unknown; to?: unknown }; text?: unknown };
    const desde = s?.offsets?.from;
    const hasta = s?.offsets?.to;
    if (typeof s?.text !== "string" || typeof desde !== "number" || typeof hasta !== "number") {
      throw new Error("whisper-cli devolvió un segmento que no entiendo");
    }
    const texto = s.text.replace(/\s+/g, " ").trim();
    if (texto && !esMarcaSinHabla(texto)) segmentos.push({ inicioSeg: Math.max(0, desde / 1000), finSeg: Math.max(desde, hasta) / 1000, texto });
  }
  return segmentos;
}

/** Los argumentos de whisper-cli (un arreglo: no pasan por ningún shell). */
export function argumentosWhisper(modelo: string, audio: string, base: string, idioma: string, hilos: number): string[] {
  return ["-m", modelo, "-f", audio, "-l", idioma, "-t", String(hilos), "-oj", "-of", base, "-np"];
}

export interface OpcionesTranscribir {
  /** Cancela el proceso (se mata y la promesa se rechaza). */
  senal?: AbortSignal;
  tiempoMaximoMs?: number;
  idioma?: string;
  /** Carpetas que se cambian en las pruebas. */
  carpetaGrabaciones?: string;
  carpetaModelos?: string;
  /** Programa a lanzar (si no, `buscarWhisper()`). */
  whisper?: string;
}

/**
 * La transcripción de un WAV con whisper-cli. `modelo` es uno de la lista cerrada; el audio, un
 * `<id>.wav` de la carpeta de grabaciones de hasta 3 h.
 */
export async function transcribirConWhisper(audio: string, modelo: string, opciones: OpcionesTranscribir = {}): Promise<Segmento[]> {
  if (!esModeloWhisper(modelo)) throw new Error("ese modelo no está en la lista");
  const ruta = validarAudio(audio, opciones.carpetaGrabaciones);
  if (duracionDeArchivoWav(ruta) > MAX_DURACION_SEG) throw new Error("la grabación dura más de 3 horas: es el tope de Brote");
  const archivoModelo = rutaDeModelo(modelo, opciones.carpetaModelos);
  if (!archivoModelo) throw new Error(`falta descargar el modelo ${modelo} (Configurar Brote → Funciones → Grabar y transcribir)`);
  const programa = opciones.whisper ?? buscarWhisper();
  if (!programa) throw new Error("no encuentro whisper-cli: instálalo con Homebrew (brew install whisper-cpp)");
  opciones.senal?.throwIfAborted();

  const temporal = mkdtempSync(join(tmpdir(), "brote-whisper-"));
  const base = join(temporal, "salida");
  const { ANTHROPIC_API_KEY: _clave, ...entorno } = process.env;
  try {
    await new Promise<void>((listo, fallo) => {
      const hijo = spawn(programa, argumentosWhisper(archivoModelo, ruta, base, opciones.idioma ?? IDIOMA_POR_DEFECTO, 4), {
        env: entorno,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      });
      let error = "";
      hijo.stderr!.on("data", (trozo: Buffer) => {
        error = (error + trozo.toString()).slice(-2000);
      });
      const plazo = setTimeout(() => {
        hijo.kill();
        fallo(new Error("whisper-cli tardó demasiado y lo detuve"));
      }, opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_MS);
      const cancelar = () => {
        hijo.kill();
        fallo(new Error("transcripción cancelada"));
      };
      opciones.senal?.addEventListener("abort", cancelar, { once: true });
      hijo.on("error", (e) => {
        clearTimeout(plazo);
        fallo(e);
      });
      hijo.on("close", (codigo) => {
        clearTimeout(plazo);
        opciones.senal?.removeEventListener("abort", cancelar);
        if (codigo === 0) listo();
        // El mensaje de error de whisper-cli no lleva datos nuestros (solo rutas y motivos técnicos).
        else fallo(new Error(`whisper-cli terminó con error ${codigo}${error.trim() ? `: ${error.trim().split("\n").at(-1)}` : ""}`));
      });
    });
    return leerSalidaWhisper(readFileSync(`${base}.json`, "utf8"));
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}

/** La implementación de `Transcribir` para este computador (la usa el puente). */
export const transcribir: Transcribir = (audio, modelo) => transcribirConWhisper(audio, modelo);
