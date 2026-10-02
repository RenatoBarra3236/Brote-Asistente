// Une un transporte con el modelo de la conversación y avisa a quien escuche cada cambio.

import { CONVERSACION_INICIAL, aplicar, ocupado, type Conversacion, type SucesoLocal } from "./conversacion.ts";
import { traducir, type Suceso } from "./traduccion.ts";
import type { Decision, Transporte } from "./transporte.ts";

export class Agente {
  private readonly transporte: Transporte;
  private actual: Conversacion = CONVERSACION_INICIAL;
  private readonly oyentes = new Set<(c: Conversacion) => void>();
  private dejarDeEscuchar: (() => void) | null = null;

  constructor(transporte: Transporte) {
    this.transporte = transporte;
  }

  get conversacion(): Conversacion {
    return this.actual;
  }

  /** Empieza a recibir eventos del transporte. */
  conectar(): void {
    if (this.dejarDeEscuchar) return;
    this.dejarDeEscuchar = this.transporte.escuchar((marco) => {
      const suceso = traducir(marco);
      if (suceso) this.aplicar(suceso);
    });
  }

  desconectar(): void {
    this.dejarDeEscuchar?.();
    this.dejarDeEscuchar = null;
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
    try {
      const resultado = await this.transporte.enviar(limpio);
      if (resultado?.local) this.aplicar({ tipo: "resuelto-sin-ia", texto: resultado.local.texto });
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
