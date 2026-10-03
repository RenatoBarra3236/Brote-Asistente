// El modelo de la conversación: qué escribió el usuario, qué va respondiendo el agente,
// qué herramienta corre y si espera un permiso. También decide el estado del personaje.
// Es una función pura (`aplicar`), así se prueba con los eventos grabados sin interfaz.

import type { Estado } from "../personaje/estados.ts";
import type { Aprobacion, Suceso } from "./traduccion.ts";
import type { Propuesta } from "./transporte.ts";

export interface HerramientaEnCurso {
  id: string;
  nombre: string;
  etiqueta: string;
}

export interface PropuestaPendiente extends Propuesta {
  /** Ya se envió la decisión y se espera la confirmación. */
  decidiendo: boolean;
}

export interface AprobacionPendiente extends Aprobacion {
  /** Ya se envió la respuesta y se espera que el Gateway la confirme. */
  respondiendo: boolean;
}

export interface Conversacion {
  estado: Estado;
  runId: string | null;
  mensajeUsuario: string | null;
  /** El texto de la respuesta, completo o a medio llegar. */
  respuesta: string;
  /** La ejecución terminó (bien o con error). */
  terminada: boolean;
  herramienta: HerramientaEnCurso | null;
  aprobacion: AprobacionPendiente | null;
  /**
   * Las que llegaron mientras se mostraba otra (el agente puede pedir varias a la vez, por ejemplo
   * tres comandos seguidos): se muestran una tras otra.
   */
  aprobacionesEnEspera: AprobacionPendiente[];
  error: string | null;
  /** La respuesta la dio el motor de comandos, sin IA. */
  sinIA: boolean;
  /** Una plantilla que el motor podría aprender, esperando que el usuario decida. */
  propuesta: PropuestaPendiente | null;
}

/** Sucesos que no vienen del Gateway sino de la propia interfaz. */
export type SucesoLocal =
  | { tipo: "resuelto-sin-ia"; texto: string }
  | { tipo: "propuesta"; propuesta: Propuesta }
  | { tipo: "decidiendo"; id: number }
  | { tipo: "decision-fallida"; id: number }
  | { tipo: "propuesta-decidida"; id: number; aceptada: boolean; mensaje: string }
  | { tipo: "respondiendo"; id: string }
  | { tipo: "respuesta-fallida"; id: string };

export const CONVERSACION_INICIAL: Conversacion = {
  estado: "reposo",
  runId: null,
  mensajeUsuario: null,
  respuesta: "",
  terminada: false,
  herramienta: null,
  aprobacion: null,
  aprobacionesEnEspera: [],
  error: null,
  sinIA: false,
  propuesta: null,
};

/** El agente está ocupado con una ejecución: todavía no conviene enviarle otro mensaje. */
export function ocupado(c: Conversacion): boolean {
  return c.estado === "pensando" || c.estado === "trabajando" || c.estado === "pidiendo-permiso";
}

export function aplicar(c: Conversacion, suceso: Suceso | SucesoLocal): Conversacion {
  switch (suceso.tipo) {
    case "mensaje-usuario":
      // El Gateway repite el mensaje que acabamos de enviar; solo uno distinto (por ejemplo,
      // escrito desde el celular) empieza una conversación nueva.
      if (suceso.texto === c.mensajeUsuario && !c.terminada) return c;
      return { ...CONVERSACION_INICIAL, estado: "pensando", mensajeUsuario: suceso.texto };

    case "inicio":
      return {
        ...CONVERSACION_INICIAL,
        estado: "pensando",
        runId: suceso.runId,
        mensajeUsuario: c.mensajeUsuario,
      };

    case "pensando":
      return conEstado({ ...c, terminada: false });

    case "texto": {
      const respuesta = suceso.texto ?? c.respuesta + (suceso.delta ?? "");
      return conEstado({ ...c, respuesta, terminada: false });
    }

    case "herramienta-inicio":
      return conEstado({
        ...c,
        terminada: false,
        herramienta: { id: suceso.id, nombre: suceso.nombre, etiqueta: suceso.etiqueta },
      });

    case "herramienta-fin":
      if (c.herramienta?.id !== suceso.id) return c;
      return conEstado({ ...c, herramienta: null });

    case "aprobacion": {
      const nueva = { ...suceso.aprobacion, respondiendo: false };
      if (c.aprobacion && c.aprobacion.id !== nueva.id) {
        if (c.aprobacionesEnEspera.some((a) => a.id === nueva.id)) return c;
        return conEstado({ ...c, terminada: false, aprobacionesEnEspera: [...c.aprobacionesEnEspera, nueva] });
      }
      return conEstado({ ...c, terminada: false, aprobacion: nueva });
    }

    case "aprobacion-fin": {
      if (c.aprobacion?.id === suceso.id) {
        // Se respondió (o venció) la que se mostraba: pasa la siguiente de la cola.
        const [siguiente = null, ...resto] = c.aprobacionesEnEspera;
        return conEstado({ ...c, aprobacion: siguiente, aprobacionesEnEspera: resto });
      }
      const resto = c.aprobacionesEnEspera.filter((a) => a.id !== suceso.id);
      return resto.length === c.aprobacionesEnEspera.length ? c : conEstado({ ...c, aprobacionesEnEspera: resto });
    }

    case "fin":
      return {
        ...c,
        // Si antes llegó un error, la ejecución terminó mal aunque después llegue el `end`.
        estado: c.error ? "error" : "listo",
        respuesta: suceso.texto ?? c.respuesta,
        terminada: true,
        herramienta: null,
        aprobacion: null,
        aprobacionesEnEspera: [],
      };

    case "detenido":
      // Puede llegar dos veces (la isla lo marca al tiro y después confirma el Gateway).
      if (c.terminada) return c;
      return {
        ...c,
        estado: "reposo",
        terminada: true,
        herramienta: null,
        aprobacion: null,
        aprobacionesEnEspera: [],
        respuesta: c.respuesta || "Ok, lo dejé ahí. ✋",
      };

    case "error":
      return {
        ...c,
        estado: "error",
        error: suceso.mensaje,
        terminada: true,
        herramienta: null,
        aprobacion: null,
        aprobacionesEnEspera: [],
      };

    case "resuelto-sin-ia":
      return {
        ...CONVERSACION_INICIAL,
        estado: "listo",
        mensajeUsuario: c.mensajeUsuario,
        respuesta: suceso.texto,
        terminada: true,
        sinIA: true,
      };

    case "propuesta":
      return { ...c, propuesta: { ...suceso.propuesta, decidiendo: false } };

    case "decidiendo":
    case "decision-fallida":
      if (c.propuesta?.id !== suceso.id) return c;
      return { ...c, propuesta: { ...c.propuesta, decidiendo: suceso.tipo === "decidiendo" } };

    case "propuesta-decidida":
      if (c.propuesta?.id !== suceso.id) return c;
      // Aprender algo es motivo de celebración: el personaje vuelve a "listo".
      return {
        ...c,
        propuesta: null,
        respuesta: suceso.mensaje,
        sinIA: false,
        estado: suceso.aceptada ? "listo" : c.estado,
      };

    case "respondiendo":
    case "respuesta-fallida":
      if (c.aprobacion?.id !== suceso.id) return c;
      return { ...c, aprobacion: { ...c.aprobacion, respondiendo: suceso.tipo === "respondiendo" } };
  }
}

/** El estado del personaje mientras la ejecución sigue en curso. */
function conEstado(c: Conversacion): Conversacion {
  if (c.error) return { ...c, estado: "error" };
  if (c.aprobacion) return { ...c, estado: "pidiendo-permiso" };
  if (c.herramienta) return { ...c, estado: "trabajando" };
  return { ...c, estado: "pensando" };
}
