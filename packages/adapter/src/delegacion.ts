// Lo que pasa cuando Brote delega en un especialista (fase 1 del equipo, docs/plan-multiagente.md).
// Lógica pura: recibe cada evento del Gateway y decide qué le llega a la isla. Se prueba con
// ejemplos/delegacion.jsonl y ejemplos/delegacion-continuacion.jsonl.
//
//   - Los eventos de las sesiones hijas ("agent:<id>:subagent:<uuid>") llegan al puente aunque solo
//     esté suscrito a la principal. No se reenvían como si fueran de Brote (el fin de una sesión hija
//     terminaba el turno de Brote en la isla): con ellos se arma la lista del equipo trabajando.
//   - Al terminar, OpenClaw le anuncia el resultado a Brote en otro turno, con un mensaje
//     "[Inter-session message] … isUser=false". Ese turno no se muestra; si Brote contesta NO_REPLY
//     (ya había respondido) se descarta, y si contesta algo de verdad (por ejemplo, porque la espera
//     se cortó antes), la isla recibe solo esa respuesta.
//   - Una respuesta NO_REPLY de cualquier turno nunca se muestra.
//   - Las solicitudes de permiso de un especialista sí se reenvían (si nadie las responde, OpenClaw
//     las niega), marcadas con quién pide.

import { agenteDeSesion, esSesionHija } from "@asistente/motor";

export const PREFIJO_INTER_SESION = "[Inter-session message]";
export const NO_REPLY = "NO_REPLY";

/** Lo que la isla muestra de cada especialista trabajando (aviso "especialistas"). */
export interface Trabajando {
  /** La sesión hija ("agent:investigador:subagent:…"). */
  sesion: string;
  /** El agente de OpenClaw ("investigador"). */
  id: string;
  nombre: string;
  emoji: string;
  /** La IA que usa ("Gemini"), o `null` si no se sabe. */
  ia: string | null;
  color: string | null;
  /** La tarea que le pasó Brote, recortada. */
  tarea: string | null;
  /** La herramienta que está usando ahora ("WebSearch"), para que la isla diga "Buscando en la web…". */
  herramienta: string | null;
  estado: "trabajando" | "termino" | "fallo";
  inicioMs: number;
  finMs: number | null;
}

export type Ficha = Pick<Trabajando, "nombre" | "emoji" | "ia" | "color">;

export interface Resultado {
  /** Los eventos que se le mandan a la isla (cero, el mismo, o uno armado). */
  reenviar: object[];
  /** Cambió la lista del equipo: hay que mandar el aviso. */
  equipo: boolean;
}

const MAX_TAREA = 160;
const MAX_INTERNOS = 20;

function textoDe(contenido: unknown): string {
  if (typeof contenido === "string") return contenido;
  if (!Array.isArray(contenido)) return "";
  return contenido.map((b) => (b?.type === "text" && typeof b.text === "string" ? b.text : "")).join("");
}

function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

export function esNoReply(texto: unknown): boolean {
  return typeof texto === "string" && texto.trim() === NO_REPLY;
}

/** El resultado de una herramienta puede venir como texto JSON, como objeto o como bloques de texto. */
function objetoDe(valor: unknown): any {
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    const v = valor as any;
    if (Array.isArray(v.content)) return objetoDe(textoDe(v.content));
    return v;
  }
  const texto = Array.isArray(valor) ? textoDe(valor) : valor;
  if (typeof texto !== "string") return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

export class FiltroDelegacion {
  private readonly trabajando = new Map<string, Trabajando>();
  /** Tareas pasadas con sessions_spawn que todavía no tienen sesión hija conocida. */
  private pendientes: { agente: string; tarea: string; sesion: string | null }[] = [];
  /** Llegó un "[Inter-session message]": el próximo turno de Brote es interno. */
  private internoPorVenir = false;
  /** Turnos internos (no se muestran) y lo que Brote fue respondiendo en cada uno. */
  private readonly internos = new Map<string, { texto: string; cerrado: boolean }>();
  /** Turnos normales: lo respondido hasta ahora y los eventos de texto retenidos (podría ser NO_REPLY). */
  private readonly textos = new Map<string, { texto: string; retenidos: object[] }>();

  private readonly principal: string;
  private readonly ficha: (agente: string) => Ficha;

  constructor(principal: string, ficha: (agente: string) => Ficha) {
    this.principal = principal;
    this.ficha = ficha;
  }

  /** El equipo, en el orden en que empezó a trabajar. */
  equipo(): Trabajando[] {
    return [...this.trabajando.values()].sort((a, b) => a.inicioMs - b.inicioMs).map((t) => ({ ...t }));
  }

  hayTrabajando(): boolean {
    return [...this.trabajando.values()].some((t) => t.estado === "trabajando");
  }

  procesar(marco: any, ahoraMs: number): Resultado {
    const payload = marco?.payload ?? {};
    const sesion = typeof payload.sessionKey === "string" ? payload.sessionKey : null;

    if (marco?.event === "session.approval") return this.aprobacion(marco, ahoraMs);
    if (sesion && sesion !== this.principal) {
      // De una sesión hija: solo cuenta para el equipo. De otra sesión (el TUI…): no es de la isla.
      return { reenviar: [], equipo: esSesionHija(sesion) && this.hija(marco, sesion, ahoraMs) };
    }
    if (!sesion) return { reenviar: [marco], equipo: false };
    return this.deBrote(marco, ahoraMs);
  }

  /** Un evento de la sesión principal (Brote). */
  private deBrote(marco: any, ahoraMs: number): Resultado {
    const payload = marco.payload;
    const datos = payload.data ?? {};
    const runId = typeof payload.runId === "string" ? payload.runId : null;

    if (marco.event === "session.message" && payload.message?.role === "user") {
      if (textoDe(payload.message.content).trimStart().startsWith(PREFIJO_INTER_SESION)) {
        this.internoPorVenir = true;
        return { reenviar: [], equipo: false };
      }
      return { reenviar: [marco], equipo: false };
    }

    if (marco.event === "agent" && payload.stream === "lifecycle" && datos.phase === "start" && runId) {
      if (this.internoPorVenir) {
        this.internoPorVenir = false;
        this.internos.set(runId, { texto: "", cerrado: false });
        if (this.internos.size > MAX_INTERNOS) this.internos.delete(this.internos.keys().next().value!);
        return { reenviar: [], equipo: false };
      }
      // Un turno nuevo de Brote: lo que el equipo ya terminó se deja de mostrar.
      const antes = this.trabajando.size;
      for (const [clave, t] of this.trabajando) if (t.estado !== "trabajando") this.trabajando.delete(clave);
      this.pendientes = [];
      this.textos.set(runId, { texto: "", retenidos: [] });
      return { reenviar: [marco], equipo: this.trabajando.size !== antes };
    }

    if (runId && this.internos.has(runId)) return { reenviar: this.interno(marco, runId), equipo: false };

    const equipo = this.herramientaDeBrote(marco);
    return { reenviar: this.normal(marco, runId), equipo };
  }

  /** Un evento de un turno interno: se calla, salvo una respuesta de verdad al terminar. */
  private interno(marco: any, runId: string): object[] {
    const payload = marco.payload;
    const datos = payload.data ?? {};
    const turno = this.internos.get(runId)!;
    if (marco.event === "agent" && payload.stream === "assistant") {
      turno.texto = typeof datos.text === "string" ? datos.text : turno.texto + (typeof datos.delta === "string" ? datos.delta : "");
      return [];
    }
    const fin = marco.event === "agent" && payload.stream === "lifecycle" && datos.phase === "end";
    const final = marco.event === "chat" && payload.state === "final";
    // Solo una vez: después del `end` llega el `chat` final con lo mismo.
    if ((!fin && !final) || turno.cerrado) return [];
    turno.cerrado = true;
    const texto: string = (fin ? datos.terminalReply?.text : textoDe(payload.message?.content)) || turno.texto;
    if (!texto.trim() || esNoReply(texto)) return [];
    return [
      {
        event: "chat",
        payload: {
          sessionKey: this.principal,
          runId,
          state: "final",
          message: { role: "assistant", content: [{ type: "text", text: texto.trim() }] },
        },
        seq: marco.seq,
      },
    ];
  }

  /** Un evento de un turno normal de Brote: pasa tal cual, salvo un NO_REPLY. */
  private normal(marco: any, runId: string | null): object[] {
    const payload = marco.payload;
    const datos = payload.data ?? {};
    const turno = runId ? this.textos.get(runId) : undefined;
    if (!turno) return [marco];
    if (marco.event === "agent" && payload.stream === "assistant") {
      turno.texto = typeof datos.text === "string" ? datos.text : turno.texto + (typeof datos.delta === "string" ? datos.delta : "");
      // Mientras lo escrito pueda ser el comienzo de "NO_REPLY", se retiene.
      if (turno.texto.trim() && NO_REPLY.startsWith(turno.texto.trim())) {
        turno.retenidos.push(marco);
        return [];
      }
      const salen = [...turno.retenidos, marco];
      turno.retenidos = [];
      return salen;
    }
    if (marco.event === "agent" && payload.stream === "lifecycle" && datos.phase === "end") {
      if (esNoReply(turno.texto) || esNoReply(datos.terminalReply?.text)) {
        turno.retenidos = [];
        const { terminalReply: _respuesta, ...resto } = datos;
        return [{ ...marco, payload: { ...payload, data: resto } }];
      }
      const salen = [...turno.retenidos, marco];
      turno.retenidos = [];
      return salen;
    }
    if (marco.event === "chat" && payload.state === "final") {
      const texto = textoDe(payload.message?.content);
      this.textos.delete(runId!);
      if (esNoReply(texto) || esNoReply(turno.texto)) {
        const { message: _mensaje, ...resto } = payload;
        return [{ ...marco, payload: resto }];
      }
      return [marco];
    }
    return [marco];
  }

  /** Las llamadas de Brote a sessions_spawn: de ahí sale qué tarea tiene cada especialista. */
  private herramientaDeBrote(marco: any): boolean {
    const payload = marco.payload;
    const datos = payload.data ?? {};
    if (marco.event !== "agent" || payload.stream !== "tool" || !String(datos.name ?? "").endsWith("sessions_spawn")) return false;
    if (datos.phase === "start") {
      const agente = typeof datos.args?.agentId === "string" ? datos.args.agentId : null;
      const tarea = typeof datos.args?.task === "string" ? recortar(datos.args.task, MAX_TAREA) : "";
      if (agente) this.pendientes.push({ agente, tarea, sesion: null });
      return false;
    }
    if (datos.phase !== "result") return false;
    const resultado = objetoDe(datos.result);
    const sesion = typeof resultado?.childSessionKey === "string" ? resultado.childSessionKey : null;
    if (!sesion) return false;
    const agente = agenteDeSesion(sesion);
    const yaEsta = this.trabajando.get(sesion);
    const pendiente = this.pendientes.find((p) => p.agente === agente && p.sesion === null);
    if (yaEsta) {
      if (pendiente && !yaEsta.tarea) {
        yaEsta.tarea = pendiente.tarea || null;
        this.pendientes = this.pendientes.filter((p) => p !== pendiente);
        return true;
      }
      return false;
    }
    if (pendiente) pendiente.sesion = sesion;
    return false;
  }

  /** Un evento de una sesión hija: actualiza al especialista. */
  private hija(marco: any, sesion: string, ahoraMs: number): boolean {
    const payload = marco.payload;
    const datos = payload.data ?? {};
    const agente = (typeof payload.agentId === "string" && payload.agentId) || agenteDeSesion(sesion);
    if (!agente) return false;
    let t = this.trabajando.get(sesion);
    const nuevo = !t;
    if (!t) {
      // La tarea: la del sessions_spawn que devolvió esta sesión, o la primera pendiente de ese agente.
      const pendiente = this.pendientes.find((p) => p.sesion === sesion) ?? this.pendientes.find((p) => p.agente === agente && p.sesion === null);
      if (pendiente) this.pendientes = this.pendientes.filter((p) => p !== pendiente);
      t = {
        sesion,
        id: agente,
        ...this.ficha(agente),
        tarea: pendiente?.tarea || null,
        herramienta: null,
        estado: "trabajando",
        inicioMs: ahoraMs,
        finMs: null,
      };
      this.trabajando.set(sesion, t);
    }
    const antes = JSON.stringify(t);
    if (marco.event === "agent") {
      if (payload.stream === "lifecycle") {
        if (datos.phase === "start") Object.assign(t, { estado: "trabajando", finMs: null });
        else if (datos.phase === "end") Object.assign(t, { estado: datos.aborted ? "fallo" : "termino", herramienta: null, finMs: ahoraMs });
        else if (/error|fail|abort/i.test(String(datos.phase ?? ""))) Object.assign(t, { estado: "fallo", herramienta: null, finMs: ahoraMs });
      } else if (payload.stream === "error") Object.assign(t, { estado: "fallo", herramienta: null, finMs: ahoraMs });
      else if (payload.stream === "tool" && t.estado === "trabajando") {
        if (datos.phase === "start") t.herramienta = typeof datos.name === "string" ? datos.name : null;
        else if (datos.phase === "result") t.herramienta = null;
      }
    } else if (marco.event === "chat" && (payload.state === "error" || payload.state === "aborted") && t.estado === "trabajando") {
      Object.assign(t, { estado: "fallo", herramienta: null, finMs: ahoraMs });
    }
    return nuevo || JSON.stringify(t) !== antes;
  }

  /** Las solicitudes de permiso pasan siempre; las de un especialista llevan quién pide. */
  private aprobacion(marco: any, _ahoraMs: number): Resultado {
    const payload = marco.payload ?? {};
    const sesion = [payload.sourceSessionKey, payload.sessionKey].find((s) => esSesionHija(s));
    if (!sesion) return { reenviar: [marco], equipo: false };
    const agente = agenteDeSesion(sesion)!;
    const { nombre, emoji } = this.trabajando.get(sesion) ?? this.ficha(agente);
    const presentacion = payload.approval?.presentation;
    if (!presentacion || typeof presentacion !== "object") return { reenviar: [marco], equipo: false };
    return {
      reenviar: [
        {
          ...marco,
          payload: { ...payload, approval: { ...payload.approval, presentation: { ...presentacion, especialista: { nombre, emoji } } } },
        },
      ],
      equipo: false,
    };
  }
}
