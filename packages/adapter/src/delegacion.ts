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

/** Un paso de un especialista: una herramienta que usó (o está usando). */
export interface PasoEspecialista {
  id: string;
  herramienta: string;
  /** Solo lo que sirve para decir qué hace (dominio, búsqueda, archivo…), recortado. */
  args: Record<string, string>;
  estado: "en-curso" | "ok" | "error";
}

/**
 * Qué hace ahora un especialista que trabaja (para animar su mascota): esperando que parta, pensando,
 * trabajando (una herramienta o escribiendo la respuesta) o esperando un permiso en la isla.
 */
export type Actividad = "en-espera" | "pensando" | "trabajando" | "permiso";

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
  /** La tarea completa (recortada a un largo razonable), para su conversación en la isla. */
  tareaCompleta: string | null;
  /** La herramienta que está usando ahora ("WebSearch"), para que la isla diga "Buscando en la web…". */
  herramienta: string | null;
  /** Los argumentos útiles de esa herramienta (dominio, búsqueda…), para el globito. */
  args: Record<string, string> | null;
  estado: "trabajando" | "termino" | "fallo";
  actividad: Actividad;
  /** Las herramientas que usó, en orden (las últimas `MAX_PASOS`). */
  pasos: PasoEspecialista[];
  /** Lo que lleva escrito de su respuesta (recortado). */
  respuesta: string;
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
const MAX_TAREA_COMPLETA = 2000;
const MAX_RESPUESTA = 6000;
export const MAX_PASOS = 12;
/** Los argumentos de una herramienta que sirven para decir qué hace; nada más se guarda. */
const ARGS_UTILES = ["url", "query", "file_path", "path", "pattern", "command", "action", "agentId"] as const;

/** Solo los argumentos útiles, como texto corto (nunca el contenido de un archivo o un mensaje). */
export function argsUtiles(args: unknown): Record<string, string> {
  const salida: Record<string, string> = {};
  if (!args || typeof args !== "object") return salida;
  for (const clave of ARGS_UTILES) {
    const valor = (args as Record<string, unknown>)[clave];
    if (typeof valor === "string" && valor.trim()) salida[clave] = recortar(valor, 120);
  }
  return salida;
}
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
  private pendientes: { agente: string; tarea: string; completa: string; sesion: string | null }[] = [];
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

    const equipo = this.herramientaDeBrote(marco, ahoraMs);
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
  private herramientaDeBrote(marco: any, ahoraMs: number): boolean {
    const payload = marco.payload;
    const datos = payload.data ?? {};
    if (marco.event !== "agent" || payload.stream !== "tool" || !String(datos.name ?? "").endsWith("sessions_spawn")) return false;
    if (datos.phase === "start") {
      const agente = typeof datos.args?.agentId === "string" ? datos.args.agentId : null;
      const texto = typeof datos.args?.task === "string" ? datos.args.task : "";
      const tarea = recortar(texto, MAX_TAREA);
      const completa = texto.trim().slice(0, MAX_TAREA_COMPLETA);
      if (agente) this.pendientes.push({ agente, tarea, completa, sesion: null });
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
        yaEsta.tareaCompleta = pendiente.completa || null;
        this.pendientes = this.pendientes.filter((p) => p !== pendiente);
        return true;
      }
      return false;
    }
    // Ya se sabe su sesión: aparece "en espera" hasta que llegue su primer evento.
    if (!agente) return false;
    if (pendiente) this.pendientes = this.pendientes.filter((p) => p !== pendiente);
    this.trabajando.set(sesion, this.nuevo(sesion, agente, pendiente ?? null, "en-espera", ahoraMs));
    return true;
  }

  private nuevo(sesion: string, agente: string, pendiente: { tarea: string; completa: string } | null, actividad: Actividad, ahoraMs: number): Trabajando {
    return {
      sesion,
      id: agente,
      ...this.ficha(agente),
      tarea: pendiente?.tarea || null,
      tareaCompleta: pendiente?.completa || null,
      herramienta: null,
      args: null,
      estado: "trabajando",
      actividad,
      pasos: [],
      respuesta: "",
      inicioMs: ahoraMs,
      finMs: null,
    };
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
      t = this.nuevo(sesion, agente, pendiente ?? null, "pensando", ahoraMs);
      this.trabajando.set(sesion, t);
    }
    const antes = JSON.stringify(t);
    const fin = (estado: "termino" | "fallo") => {
      Object.assign(t!, { estado, herramienta: null, args: null, finMs: ahoraMs });
      for (const paso of t!.pasos) if (paso.estado === "en-curso") paso.estado = estado === "fallo" ? "error" : "ok";
    };
    if (marco.event === "agent") {
      if (payload.stream === "lifecycle") {
        if (datos.phase === "start") Object.assign(t, { estado: "trabajando", actividad: t.actividad === "en-espera" ? "pensando" : t.actividad, finMs: null });
        else if (datos.phase === "end") fin(datos.aborted ? "fallo" : "termino");
        else if (/error|fail|abort/i.test(String(datos.phase ?? ""))) fin("fallo");
      } else if (payload.stream === "error") fin("fallo");
      else if (t.estado === "trabajando") this.avance(t, payload.stream, datos);
    } else if (marco.event === "chat" && (payload.state === "error" || payload.state === "aborted") && t.estado === "trabajando") {
      fin("fallo");
    } else if (marco.event === "chat" && payload.state === "final" && !t.respuesta) {
      // Si los trozos de texto no llegaron, la respuesta final igual queda en su conversación.
      t.respuesta = textoDe(payload.message?.content).trim().slice(0, MAX_RESPUESTA);
    }
    return nuevo || JSON.stringify(t) !== antes;
  }

  /** Pensando, una herramienta o escribiendo: lo que se ve en el globito y en su conversación. */
  private avance(t: Trabajando, flujo: unknown, datos: any): void {
    if (flujo === "thinking") {
      if (!t.herramienta && t.actividad !== "permiso") t.actividad = "pensando";
    } else if (flujo === "assistant") {
      const texto = typeof datos.text === "string" ? datos.text : t.respuesta + (typeof datos.delta === "string" ? datos.delta : "");
      t.respuesta = texto.slice(0, MAX_RESPUESTA);
      if (t.actividad !== "permiso") t.actividad = "trabajando";
    } else if (flujo === "tool") {
      const id = String(datos.toolCallId ?? datos.name ?? t.pasos.length);
      if (datos.phase === "start") {
        const nombre = typeof datos.name === "string" ? datos.name : "herramienta";
        const args = argsUtiles(datos.args);
        Object.assign(t, { herramienta: nombre, args, actividad: t.actividad === "permiso" ? "permiso" : "trabajando" });
        if (!t.pasos.some((p) => p.id === id)) t.pasos = [...t.pasos, { id, herramienta: nombre, args, estado: "en-curso" as const }].slice(-MAX_PASOS);
      } else if (datos.phase === "result") {
        const paso = t.pasos.find((p) => p.id === id);
        if (paso) paso.estado = datos.isError ? "error" : "ok";
        Object.assign(t, { herramienta: null, args: null });
        if (t.actividad !== "permiso") t.actividad = "pensando";
      }
    }
  }

  /** Las solicitudes de permiso pasan siempre; las de un especialista llevan quién pide. */
  private aprobacion(marco: any, _ahoraMs: number): Resultado {
    const payload = marco.payload ?? {};
    const sesion = [payload.sourceSessionKey, payload.sessionKey].find((s) => esSesionHija(s));
    if (!sesion) return { reenviar: [marco], equipo: false };
    const agente = agenteDeSesion(sesion)!;
    const t = this.trabajando.get(sesion);
    const { nombre, emoji } = t ?? this.ficha(agente);
    // Mientras espera que el usuario responda, su mascota lo muestra; al resolverse, sigue trabajando.
    let cambio = false;
    if (t && t.estado === "trabajando") {
      const actividad: Actividad = payload.phase === "pending" ? "permiso" : t.herramienta ? "trabajando" : "pensando";
      cambio = actividad !== t.actividad;
      t.actividad = actividad;
    }
    const presentacion = payload.approval?.presentation;
    if (!presentacion || typeof presentacion !== "object") return { reenviar: [marco], equipo: cambio };
    return {
      reenviar: [
        {
          ...marco,
          payload: { ...payload, approval: { ...payload.approval, presentation: { ...presentacion, especialista: { nombre, emoji } } } },
        },
      ],
      equipo: cambio,
    };
  }
}

/** Lo que se reconstruye de la conversación de un especialista con `chat.history` de su sesión hija. */
export interface Historial {
  tarea: string | null;
  pasos: PasoEspecialista[];
  respuesta: string;
}

/**
 * Lee el resultado de `chat.history` (la forma exacta no está en el protocolo: `messages` es una
 * lista libre). Se toma lo mismo que de los eventos: la primera pregunta (la tarea), las herramientas
 * que usó (bloques `tool_use` / `toolCall` con su nombre y solo los argumentos útiles) y su última
 * respuesta de texto. Lo que no se reconoce se ignora. Probado contra el Gateway real (4-10-2026): trae
 * `{ sessionKey, sessionId, messages: [{ role, content: string | bloques, timestamp, … }], hasMore, … }`.
 */
export function leerHistorial(resultado: unknown): Historial {
  const mensajes: any[] = Array.isArray((resultado as any)?.messages) ? (resultado as any).messages : Array.isArray(resultado) ? (resultado as any[]) : [];
  const historial: Historial = { tarea: null, pasos: [], respuesta: "" };
  for (const crudo of mensajes) {
    const mensaje = crudo?.message && typeof crudo.message === "object" ? crudo.message : crudo;
    const rol = mensaje?.role;
    const bloques: any[] = typeof mensaje?.content === "string" ? [{ type: "text", text: mensaje.content }] : Array.isArray(mensaje?.content) ? mensaje.content : [];
    if (rol === "user") {
      const texto = textoDe(bloques).trim();
      if (texto && historial.tarea === null && !texto.startsWith(PREFIJO_INTER_SESION)) historial.tarea = tareaSinEnvoltorio(texto).slice(0, MAX_TAREA_COMPLETA);
      for (const b of bloques) if (b?.type === "tool_result") marcarPaso(historial, b.tool_use_id, b.is_error === true);
      continue;
    }
    if (rol === "toolResult" || rol === "tool") {
      marcarPaso(historial, mensaje.toolCallId ?? mensaje.tool_call_id, mensaje.isError === true);
      continue;
    }
    if (rol !== "assistant") continue;
    for (const b of bloques) {
      if (b?.type === "tool_use" || b?.type === "toolCall" || b?.type === "tool_call") {
        const id = String(b.id ?? b.toolCallId ?? historial.pasos.length);
        historial.pasos = [...historial.pasos, { id, herramienta: String(b.name ?? "herramienta"), args: argsUtiles(b.input ?? b.arguments ?? b.args), estado: "ok" as const }].slice(-MAX_PASOS);
      }
    }
    const texto = textoDe(bloques).trim();
    if (texto && !esNoReply(texto)) historial.respuesta = texto.slice(0, MAX_RESPUESTA);
  }
  return historial;
}

/**
 * OpenClaw le pasa la tarea al especialista envuelta en sus instrucciones ("[Subagent Context] You are
 * running as a subagent… [Subagent Task]\n\n<tarea>\n\nBegin. Execute the assigned task to completion.").
 * La isla muestra solo la tarea.
 */
export function tareaSinEnvoltorio(texto: string): string {
  const marca = "[Subagent Task]";
  const i = texto.lastIndexOf(marca);
  if (i === -1) return texto;
  let tarea = texto.slice(i + marca.length);
  const fin = tarea.search(/\n\s*Begin\. Execute the assigned task/);
  if (fin !== -1) tarea = tarea.slice(0, fin);
  return tarea.trim() || texto;
}

function marcarPaso(historial: Historial, id: unknown, error: boolean): void {
  const paso = historial.pasos.find((p) => p.id === String(id));
  if (paso) paso.estado = error ? "error" : "ok";
}
