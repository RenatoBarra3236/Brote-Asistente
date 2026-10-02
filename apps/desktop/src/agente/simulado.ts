// Un transporte de mentira que reproduce eventos grabados del Gateway
// (packages/adapter/ejemplos/), con sus pausas, mientras no hay conexión real.
// Se detiene en cada solicitud de permiso hasta que se responda, como el Gateway.

import type { Decision, Marco, Transporte } from "./transporte.ts";

export interface Escena {
  nombre: string;
  /** Si el mensaje del usuario coincide, se reproduce esta escena. Sin patrón, es la escena por defecto. */
  patron?: RegExp;
  marcos: Marco[];
  /** Otra grabación de la misma escena que sigue cuando se rechaza el permiso, desde su `pending`. */
  siRechaza?: Marco[];
}

export interface OpcionesSimulador {
  escenas: Escena[];
  /** 1 = el ritmo grabado; 0 = sin pausas (para pruebas). */
  velocidad?: number;
  /** Para reemplazar el reloj en las pruebas. */
  esperar?: (ms: number) => Promise<void>;
}

/** Pausas grabadas recortadas a este rango, para que la demo no se haga lenta ni instantánea. */
const PAUSA_MIN = 40;
const PAUSA_MAX = 900;

/** Lee un archivo `.jsonl` con un evento por línea. */
export function marcosDesdeJsonl(texto: string): Marco[] {
  return texto
    .split("\n")
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea) => JSON.parse(linea) as Marco);
}

export function esAprobacionPendiente(marco: Marco): boolean {
  return marco.event === "session.approval" && marco.payload?.phase === "pending";
}

export class TransporteSimulado implements Transporte {
  private readonly escenas: Escena[];
  private readonly velocidad: number;
  private readonly esperar: (ms: number) => Promise<void>;
  private readonly oyentes = new Set<(marco: Marco) => void>();
  private reproduciendo = false;
  /** Cambia con cada envío: una reproducción vieja deja de emitir si empezó otra. */
  private generacion = 0;
  private pendiente: { id: string; responder: (decision: Decision) => void } | null = null;

  constructor(opciones: OpcionesSimulador) {
    if (opciones.escenas.length === 0) throw new Error("El simulador necesita al menos una escena");
    this.escenas = opciones.escenas;
    this.velocidad = opciones.velocidad ?? 1;
    this.esperar = opciones.esperar ?? ((ms) => new Promise((listo) => setTimeout(listo, ms)));
  }

  escuchar(oyente: (marco: Marco) => void): () => void {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  }

  async enviar(texto: string): Promise<void> {
    if (this.reproduciendo) throw new Error("Ya hay una ejecución en curso");
    this.reproduciendo = true;
    const generacion = ++this.generacion;
    // Como `chat.send`: responde apenas acepta el mensaje y los eventos llegan después.
    void this.reproducir(this.elegir(texto), texto, generacion).finally(() => {
      if (generacion !== this.generacion) return;
      this.reproduciendo = false;
      this.pendiente = null;
    });
  }

  async resolverAprobacion(id: string, _kind: string, decision: Decision): Promise<void> {
    if (!this.pendiente || this.pendiente.id !== id) throw new Error(`No hay una aprobación pendiente con id ${id}`);
    const { responder } = this.pendiente;
    this.pendiente = null;
    responder(decision);
  }

  /** La primera escena cuyo patrón coincide con el mensaje; si no, la que no tiene patrón. */
  elegir(texto: string): Escena {
    return (
      this.escenas.find((e) => e.patron?.test(texto)) ?? this.escenas.find((e) => !e.patron) ?? this.escenas[0]
    );
  }

  private async reproducir(escena: Escena, texto: string, generacion: number): Promise<void> {
    // Cada envío es una ejecución nueva: se cambian los ids de la grabación por unos frescos.
    const cambios: Cambios = { texto, runId: nuevoId(), idAprobacion: null, herramientas: new Map() };
    let marcos = escena.marcos;
    let anterior: number | null = null;

    for (let i = 0; i < marcos.length; i++) {
      const marco = adaptar(marcos[i], cambios);
      const instante = instanteDe(marco);
      if (anterior !== null && instante !== null) {
        await this.esperar(limitar(instante - anterior, PAUSA_MIN, PAUSA_MAX) * this.velocidad);
      }
      if (generacion !== this.generacion) return;
      if (instante !== null) anterior = instante;
      // Terminada la ejecución ya se puede enviar otro mensaje, aunque falten los `chat` finales.
      if (terminaEjecucion(marco)) this.reproduciendo = false;
      this.emitir(marco);

      if (esAprobacionPendiente(marco)) {
        cambios.idAprobacion = marco.payload.approval.id as string;
        const decision = await this.esperarDecision(cambios.idAprobacion);
        const desde = escena.siRechaza?.findIndex(esAprobacionPendiente) ?? -1;
        if (decision === "deny" && escena.siRechaza && desde >= 0) {
          // Sigue la grabación del rechazo desde su propia solicitud de permiso. Sus
          // herramientas tienen otros ids: se emparejan por orden con las ya mostradas.
          const propias = idsDeHerramientas(marcos.slice(0, i + 1));
          const ajenas = idsDeHerramientas(escena.siRechaza.slice(0, desde + 1));
          const mostradas = propias.map((id) => cambios.herramientas.get(id) ?? id);
          cambios.herramientas = new Map(ajenas.map((id, k) => [id, mostradas[k] ?? id]));
          marcos = escena.siRechaza;
          i = desde;
        }
        anterior = null;
      }
    }
  }

  private esperarDecision(id: string): Promise<Decision> {
    return new Promise((responder) => {
      this.pendiente = { id, responder };
    });
  }

  private emitir(marco: Marco): void {
    for (const oyente of this.oyentes) oyente(marco);
  }
}

interface Cambios {
  texto: string;
  runId: string;
  idAprobacion: string | null;
  /** id de herramienta en la grabación → id que se usa en esta ejecución. */
  herramientas: Map<string, string>;
}

/** Copia del marco con el mensaje real del usuario y los ids de esta ejecución. */
function adaptar(original: Marco, cambios: Cambios): Marco {
  const marco = structuredClone(original);
  const payload = marco.payload;
  if (!payload) return marco;
  if (typeof payload.runId === "string") payload.runId = cambios.runId;
  const data = payload.data;
  if (typeof data?.toolCallId === "string") {
    let id = cambios.herramientas.get(data.toolCallId);
    if (!id) {
      id = `toolu_${nuevoId()}`;
      cambios.herramientas.set(data.toolCallId, id);
    }
    data.toolCallId = id;
    if (typeof data.itemId === "string") data.itemId = `tool:${id}`;
  }
  if (marco.event === "session.message" && payload.message?.role === "user") {
    payload.message.content = cambios.texto;
  }
  if (marco.event === "session.approval" && payload.approval) {
    // Al saltar a la grabación del rechazo, su `terminal` debe cerrar la solicitud que se mostró.
    if (cambios.idAprobacion && payload.phase !== "pending") payload.approval.id = cambios.idAprobacion;
    else if (payload.phase === "pending") payload.approval.id = `plugin:${nuevoId()}`;
  }
  return marco;
}

function terminaEjecucion(marco: Marco): boolean {
  if (marco.event !== "agent") return false;
  const { stream, data } = marco.payload ?? {};
  return stream === "error" || (stream === "lifecycle" && /end|error|fail|abort/i.test(String(data?.phase ?? "")));
}

/** Los ids de herramienta en el orden en que aparecen, sin repetir. */
function idsDeHerramientas(marcos: Marco[]): string[] {
  const ids: string[] = [];
  for (const marco of marcos) {
    const id = marco.payload?.data?.toolCallId;
    if (typeof id === "string" && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Cuándo ocurrió el evento según la grabación, en milisegundos. */
function instanteDe(marco: Marco): number | null {
  const p = marco.payload;
  for (const valor of [p?.ts, p?.updatedAtMs, p?.message?.timestamp]) {
    if (typeof valor === "number") return valor;
  }
  return null;
}

function limitar(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function nuevoId(): string {
  return globalThis.crypto.randomUUID();
}
