// Une un transporte con el modelo de la conversación y avisa a quien escuche cada cambio.

import { CONVERSACION_INICIAL, aplicar, ocupado, type Conversacion, type SucesoLocal } from "./conversacion.ts";
import { traducir, type Suceso } from "./traduccion.ts";
import type { Decision, Transporte } from "./transporte.ts";

/** Cuánto silencio del agente se tolera mientras trabaja, sin contar la espera de un permiso. */
const SILENCIO_MAXIMO_MS = 120_000;

export class Agente {
  private readonly transporte: Transporte;
  private readonly silencioMaximoMs: number;
  private readonly reloj: () => number;
  private readonly alResolverSinIA?: (intencion: string, datos?: unknown) => void;
  private actual: Conversacion = CONVERSACION_INICIAL;
  private readonly oyentes = new Set<(c: Conversacion) => void>();
  private dejarDeEscuchar: (() => void) | null = null;
  /** La última señal del agente (un evento) o del usuario (un envío): mide el silencio. */
  private ultimaSenal = 0;

  constructor(
    transporte: Transporte,
    opciones: { silencioMaximoMs?: number; reloj?: () => number; alResolverSinIA?: (intencion: string, datos?: unknown) => void } = {},
  ) {
    this.transporte = transporte;
    this.alResolverSinIA = opciones.alResolverSinIA;
    this.silencioMaximoMs = opciones.silencioMaximoMs ?? SILENCIO_MAXIMO_MS;
    this.reloj = opciones.reloj ?? (() => Date.now());
  }

  get conversacion(): Conversacion {
    return this.actual;
  }

  /** Empieza a recibir eventos del transporte. */
  conectar(): void {
    if (this.dejarDeEscuchar) return;
    const dejarEventos = this.transporte.escuchar((marco) => {
      this.ultimaSenal = this.reloj();
      const suceso = traducir(marco);
      if (suceso) this.aplicar(suceso);
    });
    const dejarPropuestas = this.transporte.alProponer?.((propuesta) => this.aplicar({ tipo: "propuesta", propuesta }));
    const vigilante = setInterval(() => this.revisarSilencio(), 5_000);
    // Que el vigilante no mantenga vivo a Node en las pruebas.
    (vigilante as { unref?: () => void }).unref?.();
    this.dejarDeEscuchar = () => {
      dejarEventos();
      dejarPropuestas?.();
      clearInterval(vigilante);
    };
  }

  /**
   * Si el agente trabaja pero lleva demasiado rato sin dar señales (por ejemplo, OpenClaw
   * reintenta un modelo caído), corta la espera para que la isla no quede pegada.
   */
  revisarSilencio(): void {
    const c = this.actual;
    if (!ocupado(c) || c.aprobacion) return;
    if (this.reloj() - this.ultimaSenal < this.silencioMaximoMs) return;
    const minutos = Math.round(this.silencioMaximoMs / 60_000);
    this.aplicar({
      tipo: "error",
      mensaje: `OpenClaw no da señales hace ${minutos} min, así que dejé de esperar. Revisa que esté funcionando.`,
    });
    this.transporte.detener?.(c.runId ?? undefined).catch(() => {});
  }

  /**
   * Una señal de vida que no llega como evento de Brote: por ejemplo, un especialista del equipo
   * trabajando mientras Brote espera su resultado.
   */
  senal(): void {
    this.ultimaSenal = this.reloj();
  }

  /** Corta el turno en curso. La isla se libera al tiro, aunque OpenClaw tarde en confirmarlo. */
  async detener(): Promise<void> {
    const c = this.actual;
    if (!ocupado(c)) return;
    this.aplicar({ tipo: "detenido" });
    try {
      await this.transporte.detener?.(c.runId ?? undefined);
    } catch (error) {
      console.error(`No pude detener al agente: ${mensajeDe(error)}`);
    }
  }

  desconectar(): void {
    this.dejarDeEscuchar?.();
    this.dejarDeEscuchar = null;
  }

  /** Acepta o rechaza la plantilla propuesta. Si falla, la deja pendiente para volver a intentarlo. */
  async decidirPropuesta(aceptar: boolean): Promise<void> {
    const propuesta = this.actual.propuesta;
    if (!propuesta || propuesta.decidiendo || !this.transporte.decidirPlantilla) return;
    this.aplicar({ tipo: "decidiendo", id: propuesta.id });
    try {
      const mensaje = await this.transporte.decidirPlantilla(propuesta.id, aceptar);
      this.aplicar({ tipo: "propuesta-decidida", id: propuesta.id, aceptada: aceptar, mensaje });
    } catch (error) {
      console.error(`No pude responder la propuesta: ${mensajeDe(error)}`);
      this.aplicar({ tipo: "decision-fallida", id: propuesta.id });
    }
  }

  /** Avisa cada vez que cambia la conversación. Devuelve la función para dejar de escuchar. */
  alCambiar(oyente: (c: Conversacion) => void): () => void {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  }

  /** Envía un mensaje. Devuelve `false` si está vacío o si el agente sigue ocupado con otro. */
  async enviar(texto: string): Promise<boolean> {
    const limpio = texto.trim();
    if (!limpio || ocupado(this.actual)) return false;
    this.aplicar({ tipo: "mensaje-usuario", texto: limpio });
    this.ultimaSenal = this.reloj();
    try {
      const resultado = await this.transporte.enviar(limpio);
      if (resultado?.local) {
        this.aplicar({ tipo: "resuelto-sin-ia", texto: resultado.local.texto });
        this.alResolverSinIA?.(resultado.local.intencion, resultado.local.datos);
      }
      return true;
    } catch (error) {
      this.aplicar({ tipo: "error", mensaje: `No pude enviar el mensaje: ${mensajeDe(error)}` });
      return false;
    }
  }

  /** Responde la aprobación pendiente. Si falla, la deja pendiente para volver a intentarlo. */
  async responder(decision: Decision): Promise<boolean> {
    const aprobacion = this.actual.aprobacion;
    if (!aprobacion || aprobacion.respondiendo) return false;
    this.aplicar({ tipo: "respondiendo", id: aprobacion.id });
    try {
      await this.transporte.resolverAprobacion(aprobacion.id, aprobacion.kind, decision);
      return true;
    } catch (error) {
      console.error(`No pude responder la aprobación: ${mensajeDe(error)}`);
      this.aplicar({ tipo: "respuesta-fallida", id: aprobacion.id });
      return false;
    }
  }

  private aplicar(suceso: Suceso | SucesoLocal): void {
    const siguiente = aplicar(this.actual, suceso);
    if (siguiente === this.actual) return;
    this.actual = siguiente;
    for (const oyente of this.oyentes) oyente(siguiente);
  }
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
