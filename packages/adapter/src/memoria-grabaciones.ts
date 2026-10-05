// "Grabaciones" en «Lo que sé de ti» (sección 8, fase 4): lista de transcripciones y de audios que esperan
// borrarse, ver el texto de una y borrar (de a una o todo). Solo toca las carpetas de Brote
// (`transcripciones/` y `grabaciones/`), con nombres exactos `<id>.md` / `<id>.wav` (lo valida el motor);
// las carpetas se inyectan para probarlo en una carpeta temporal, nunca con las grabaciones del usuario.
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  AVISOS_A_PRESENTES,
  PATRON_ID,
  audiosVencidos,
  borrarGrabacion,
  borrarTodasLasGrabaciones,
  carpetaGrabaciones,
  carpetaTranscripciones,
  fechaDeId,
  leerTranscripcionGuardada,
  listarAudios,
  listarTranscripciones,
  textoConMarcas,
  type AvisoAPresentes,
} from "@asistente/motor";

const DIA_MS = 24 * 60 * 60 * 1000;
/** Lo más que viaja al mostrar un texto (3 h de habla son ~150.000 caracteres). */
const MAX_CARACTERES_VISTA = 300_000;

export interface Carpetas {
  transcripciones: string;
  grabaciones: string;
}

export const CARPETAS: () => Carpetas = () => ({ transcripciones: carpetaTranscripciones(), grabaciones: carpetaGrabaciones() });

export interface ItemTranscripcion {
  id: string;
  /** ISO de la hora del id (la de la grabación, local). */
  fecha: string | null;
  duracionSeg: number;
  avisoAPresentes: AvisoAPresentes;
  modelo: string;
}

export interface ItemAudio {
  id: string;
  fecha: string | null;
  bytes: number;
  /** Cuándo se borra solo (ISO), según los días de conservación; `null` si no se sabe. */
  venceEn: string | null;
  /** Ya pasó su plazo: se borra en la próxima pasada (cada hora, con la función prendida). */
  vencido: boolean;
  /** Tiene una transcripción guardada con el mismo id. */
  transcrito: boolean;
}

export interface Grabaciones {
  transcripciones: ItemTranscripcion[];
  audios: ItemAudio[];
  diasAudio: number;
}

/** Lo que se muestra de las grabaciones: de la más nueva a la más vieja. Sin el texto de nada. */
export function listarGrabaciones(diasAudio: number, ahora: Date = new Date(), carpetas: Carpetas = CARPETAS()): Grabaciones {
  const cabeceras = listarTranscripciones(carpetas.transcripciones);
  const transcritos = new Set(cabeceras.map((c) => c.id));
  const vencidos = new Set(audiosVencidos(diasAudio, ahora, carpetas.grabaciones));
  const audios = listarAudios(carpetas.grabaciones);
  return {
    diasAudio,
    transcripciones: cabeceras.map((c) => ({
      id: c.id,
      fecha: fechaDeId(c.id)?.toISOString() ?? null,
      duracionSeg: c.duracionSeg,
      avisoAPresentes: c.avisoAPresentes,
      modelo: c.modelo,
    })),
    audios: audios.map(({ id, bytes }) => {
      const inicio = fechaDeId(id);
      return {
        id,
        fecha: inicio?.toISOString() ?? null,
        bytes,
        venceEn: inicio ? new Date(inicio.getTime() + diasAudio * DIA_MS).toISOString() : null,
        vencido: vencidos.has(id),
        transcrito: transcritos.has(id),
      };
    }),
  };
}

/** El texto de una transcripción, con sus marcas de tiempo, o `null` si no existe. */
export function verTranscripcion(id: string, carpetas: Carpetas = CARPETAS()): { texto: string; recortado: boolean } | null {
  const t = leerTranscripcionGuardada(id, carpetas.transcripciones);
  if (!t) return null;
  const texto = textoConMarcas(t.segmentos);
  return texto.length > MAX_CARACTERES_VISTA ? { texto: texto.slice(0, MAX_CARACTERES_VISTA), recortado: true } : { texto, recortado: false };
}

/** Borra una (por su id) o todas. Devuelve cuántas borró. `eliminar` se inyecta en las pruebas. */
export function borrarDeGrabaciones(
  tipo: "transcripcion" | "audio",
  id: string | null,
  carpetas: Carpetas = CARPETAS(),
  eliminar?: (ruta: string) => void,
): number {
  const carpeta = tipo === "audio" ? carpetas.grabaciones : carpetas.transcripciones;
  if (id === null) return borrarTodasLasGrabaciones(tipo, carpeta, eliminar).length;
  return borrarGrabacion(tipo, id, carpeta, eliminar) ? 1 : 0;
}

// ---- La respuesta a «¿avisaste a los presentes?», guardada hasta que se transcriba ----
// Se pregunta al grabar, pero la transcripción ahora es un paso aparte (pestaña Grabar de la isla): la
// respuesta se guarda en un archivo propio, `avisos-grabaciones.json` (600), y se limpia de lo que ya no
// tiene audio. Cambia con ASISTENTE_AVISOS_GRABACIONES en las pruebas.

export function rutaAvisos(): string {
  return process.env.ASISTENTE_AVISOS_GRABACIONES ?? join(homedir(), ".asistente-prototipo", "avisos-grabaciones.json");
}

export function leerAvisos(ruta: string = rutaAvisos()): Record<string, AvisoAPresentes> {
  try {
    const crudo = JSON.parse(readFileSync(ruta, "utf8")) as Record<string, unknown>;
    const salida: Record<string, AvisoAPresentes> = {};
    for (const [id, aviso] of Object.entries(crudo)) {
      if (PATRON_ID.test(id) && (AVISOS_A_PRESENTES as readonly unknown[]).includes(aviso)) salida[id] = aviso as AvisoAPresentes;
    }
    return salida;
  } catch {
    return {};
  }
}

function escribirAvisos(avisos: Record<string, AvisoAPresentes>, ruta: string): void {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  const temporal = `${ruta}.tmp`;
  writeFileSync(temporal, JSON.stringify(avisos), { mode: 0o600 });
  chmodSync(temporal, 0o600);
  renameSync(temporal, ruta);
}

/** Guarda la respuesta de una grabación (id exacto y respuesta válida; si no, lanza). */
export function guardarAviso(id: string, aviso: unknown, ruta: string = rutaAvisos()): void {
  if (!PATRON_ID.test(id)) throw new Error("Esa grabación no es válida");
  if (!(AVISOS_A_PRESENTES as readonly unknown[]).includes(aviso)) throw new Error("Respuesta no válida");
  escribirAvisos({ ...leerAvisos(ruta), [id]: aviso as AvisoAPresentes }, ruta);
}

/** Lo que respondió el usuario para esa grabación; sin dato, «no» (lo más cauto). */
export function avisoDe(id: string, ruta: string = rutaAvisos()): AvisoAPresentes {
  return leerAvisos(ruta)[id] ?? "no";
}

/** Quita las respuestas de grabaciones que ya no tienen audio (solo reescribe si algo cambió). */
export function podarAvisos(idsConAudio: readonly string[], ruta: string = rutaAvisos()): void {
  const actuales = leerAvisos(ruta);
  const vivos = Object.fromEntries(Object.entries(actuales).filter(([id]) => idsConAudio.includes(id)));
  if (Object.keys(vivos).length !== Object.keys(actuales).length) escribirAvisos(vivos, ruta);
}
