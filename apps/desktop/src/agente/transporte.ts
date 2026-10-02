// El transporte es lo único que sabe cómo hablar con el Gateway. El resto del agente
// (traducción de eventos, conversación, interfaz) solo conoce esta interfaz, así que
// el GatewayClient real se enchufa después sin tocar nada más.
//
// Los imports entre archivos de esta carpeta llevan la extensión `.ts` para que las
// pruebas corran directo con Node, sin compilar.

/** Un evento del Gateway tal como llega a `onEvent` del GatewayClient. */
export interface Marco {
  type?: string;
  event: string;
  // La forma de cada payload depende del evento; la traducción la revisa con cuidado.
  payload?: any;
  seq?: number;
}

/** Respuestas que acepta `approval.resolve`. */
export type Decision = "allow-once" | "allow-always" | "deny";

export interface Transporte {
  /** Envía un mensaje del usuario (en el Gateway real, `chat.send`). Termina cuando el Gateway lo acepta. */
  enviar(texto: string): Promise<void>;
  /** Responde una solicitud de permiso (en el Gateway real, `approval.resolve { id, kind, decision }`). */
  resolverAprobacion(id: string, kind: string, decision: Decision): Promise<void>;
  /** Escucha los eventos que llegan. Devuelve la función para dejar de escuchar. */
  escuchar(oyente: (marco: Marco) => void): () => void;
}
