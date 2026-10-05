// "Grabar y transcribir", lado del puente (sección 8 de docs/plan-rediseno.md, fase 2): una cola de
// transcripciones que corre de a una en segundo plano, guarda el resultado con `guardarTranscripcion` y
// avisa cuando termina. Y el borrado de audios vencidos. Todo se hace solo con la función `grabaciones`
// prendida (el puente arranca esto con `TareasPorFuncion`). Las carpetas, el programa y el modelo se
// inyectan para probarlo con un `whisper-cli` falso, nunca con las grabaciones del usuario.
import { join } from "node:path";
import {
  AVISOS_A_PRESENTES,
  IDIOMA_POR_DEFECTO,
  PATRON_ID,
  borrarAudiosVencidos,
  carpetaGrabaciones,
  carpetaTranscripciones,
  fechaDeId,
  guardarTranscripcion,
  leerAjustesGrabaciones,
  listarTranscripciones,
  type AvisoAPresentes,
  type Transcribir,
} from "@asistente/motor";
import { duracionDeArchivoWav, validarAudio } from "./transcribir.ts";

export type FaseTranscripcion = "en-cola" | "transcribiendo" | "lista" | "error" | "cancelada";

export interface AvisoTranscripcion {
  id: string;
  fase: FaseTranscripcion;
  /** Para la isla: una frase corta, sin el contenido de la grabación. */
  texto: string;
}

export interface OpcionesTranscriptor {
  /** La transcripción de verdad (`transcribirConWhisper`); aquí recibe además la señal de cancelar. */
  transcribir: (audio: string, modelo: string, senal: AbortSignal) => ReturnType<Transcribir>;
  avisar: (aviso: AvisoTranscripcion) => void;
  /** El modelo vigente (se lee en cada trabajo: un cambio en Configurar Brote vale al tiro). */
  modelo?: () => string;
  carpetaGrabaciones?: string;
  carpetaTranscripciones?: string;
}

/** "2026-10-05T10:30:00-03:00" con la hora local (la cabecera de la transcripción). */
export function fechaIsoLocal(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  const desfase = -fecha.getTimezoneOffset();
  const signo = desfase >= 0 ? "+" : "-";
  return (
    `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:${dos(fecha.getSeconds())}` +
    `${signo}${dos(Math.floor(Math.abs(desfase) / 60))}:${dos(Math.abs(desfase) % 60)}`
  );
}

interface Trabajo {
  id: string;
  aviso: AvisoAPresentes;
}

export class Transcriptor {
  private readonly opciones: OpcionesTranscriptor;
  private readonly cola: Trabajo[] = [];
  private actual: { id: string; control: AbortController } | null = null;
  private detenido = false;

  constructor(opciones: OpcionesTranscriptor) {
    this.opciones = opciones;
  }

  private get carpetaAudios(): string {
    return this.opciones.carpetaGrabaciones ?? carpetaGrabaciones();
  }
  private get carpetaTextos(): string {
    return this.opciones.carpetaTranscripciones ?? carpetaTranscripciones();
  }

  /** Los ids que están esperando o corriendo. */
  pendientes(): string[] {
    return [...(this.actual ? [this.actual.id] : []), ...this.cola.map((t) => t.id)];
  }

  /**
   * Pone una grabación en la cola. Lanza (antes de encolar) si el id no es válido, el audio no existe
   * o no es un `<id>.wav` de la carpeta de grabaciones, si ya hay transcripción o ya está en la cola.
   */
  pedir(id: unknown, avisoAPresentes: unknown = "no"): void {
    if (typeof id !== "string" || !PATRON_ID.test(id) || fechaDeId(id) === null) throw new Error("id de grabación no válido");
    if (!(AVISOS_A_PRESENTES as readonly unknown[]).includes(avisoAPresentes)) throw new Error("avisoAPresentes no válido");
    validarAudio(join(this.carpetaAudios, `${id}.wav`), this.carpetaAudios);
    if (this.pendientes().includes(id)) throw new Error("esa grabación ya está en la cola");
    if (listarTranscripciones(this.carpetaTextos).some((t) => t.id === id)) throw new Error("esa grabación ya tiene transcripción");
    this.cola.push({ id, aviso: avisoAPresentes as AvisoAPresentes });
    this.opciones.avisar({ id, fase: "en-cola", texto: "🎙 Transcripción en cola" });
    void this.correr();
  }

  /** Cancela una grabación en cola o la que está corriendo. Devuelve si había algo que cancelar. */
  cancelar(id: string): boolean {
    const posicion = this.cola.findIndex((t) => t.id === id);
    if (posicion >= 0) {
      this.cola.splice(posicion, 1);
      this.opciones.avisar({ id, fase: "cancelada", texto: "Transcripción cancelada" });
      return true;
    }
    if (this.actual?.id === id) {
      this.actual.control.abort();
      return true;
    }
    return false;
  }

  /** Al apagar la función o salir: cancela lo que corre y vacía la cola (sin avisos). */
  detener(): void {
    this.detenido = true;
    this.cola.length = 0;
    this.actual?.control.abort();
  }

  private async correr(): Promise<void> {
    if (this.actual) return;
    const trabajo = this.cola.shift();
    if (!trabajo) return;
    const control = new AbortController();
    this.actual = { id: trabajo.id, control };
    this.opciones.avisar({ id: trabajo.id, fase: "transcribiendo", texto: "🎙 Transcribiendo…" });
    try {
      const ruta = validarAudio(join(this.carpetaAudios, `${trabajo.id}.wav`), this.carpetaAudios);
      const duracion = duracionDeArchivoWav(ruta);
      const modelo = this.opciones.modelo?.() ?? leerAjustesGrabaciones().modelo;
      const segmentos = await this.opciones.transcribir(ruta, modelo, control.signal);
      if (control.signal.aborted) throw new Error("transcripción cancelada");
      guardarTranscripcion(
        {
          id: trabajo.id,
          fecha: fechaIsoLocal(fechaDeId(trabajo.id)!),
          duracionSeg: duracion,
          origen: "pc",
          modelo,
          idioma: IDIOMA_POR_DEFECTO,
          avisoAPresentes: trabajo.aviso,
          segmentos,
        },
        this.carpetaTextos,
      );
      if (!this.detenido) this.opciones.avisar({ id: trabajo.id, fase: "lista", texto: "🎙 Tu transcripción está lista" });
    } catch (error) {
      if (!this.detenido) {
        const cancelada = control.signal.aborted;
        // El mensaje es técnico (de whisper-cli o de las validaciones): nunca lleva el contenido de la grabación.
        this.opciones.avisar({
          id: trabajo.id,
          fase: cancelada ? "cancelada" : "error",
          texto: cancelada ? "Transcripción cancelada" : `No pude transcribir: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    } finally {
      this.actual = null;
      if (!this.detenido) void this.correr();
    }
  }
}

/**
 * Borra los audios con más de N días (N sale de los ajustes: 7 por defecto) y devuelve cuántos. Solo la
 * carpeta de grabaciones, nombres exactos, a la Papelera en Mac (ver `borrarAudiosVencidos`).
 */
export function limpiarAudiosVencidos(ahora: Date = new Date(), carpeta?: string, dias: number = leerAjustesGrabaciones().diasAudio): string[] {
  return borrarAudiosVencidos(dias, ahora, carpeta);
}
