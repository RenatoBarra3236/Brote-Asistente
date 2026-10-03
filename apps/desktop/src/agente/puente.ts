// El transporte real: habla con OpenClaw a través del puente que lanza Rust
// (packages/adapter/src/puente.ts). Los pedidos van con el comando `agente_escribir` y
// los avisos llegan como evento `puente`, una línea JSON cada uno.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Decision, Marco, Propuesta, ResultadoEnvio, Transporte } from "./transporte.ts";

/** Cuánto se espera la respuesta del puente a un pedido. */
const ESPERA_RESPUESTA = 15000;

/** Un temporizador, recordatorio o pomodoro corriendo (lo manda el puente cuando cambian). */
export interface TemporizadorActivo {
  id: number;
  tipo: "temporizador" | "pomodoro";
  etiqueta: string | null;
  fase: "estudio" | "descanso" | null;
  ciclos: number;
  finMs: number;
  duracionMs: number;
}

/** Una descarga terminada en la carpeta de descargas. */
export interface Descarga {
  nombre: string;
  ruta: string;
  tamano: number;
  fechaMs: number;
}

/** Una descarga en curso (`nombre` es `null` si el navegador todavía no sabe cómo se llamará). */
export interface DescargaEnCurso {
  id: string;
  nombre: string | null;
  tamano: number;
}

/** El ánimo de Brote según el computador (batería baja, CPU alta). */
export type Animo = "cansado" | "acalorado" | null;

export interface EstadoConexion {
  conectado: boolean;
  detalle?: string;
}

type Aviso =
  | { tipo: "conexion"; conectado: boolean; detalle?: string }
  | { tipo: "evento"; marco: Marco }
  | { tipo: "propuesta"; propuesta: Propuesta }
  | { tipo: "temporizadores"; lista: TemporizadorActivo[] }
  | { tipo: "temporizador-aviso"; texto: string }
  | { tipo: "equipo-aviso"; texto: string; celebrar: boolean }
  | { tipo: "animo"; animo: Animo }
  | { tipo: "descargas"; enCurso: DescargaEnCurso[] }
  | { tipo: "descarga-lista"; descarga: Descarga }
  | {
      tipo: "respuesta";
      id: string;
      ok: boolean;
      error?: string;
      local?: ResultadoEnvio["local"];
      mensaje?: string;
      datos?: unknown;
    };

/** Lo que trae una respuesta del puente además del "ok". */
type Extras = ResultadoEnvio & { mensaje?: string; datos?: unknown };

interface Pendiente {
  resolver: (extras: Extras) => void;
  rechazar: (error: Error) => void;
  plazo: ReturnType<typeof setTimeout>;
}

export class TransportePuente implements Transporte {
  private readonly oyentes = new Set<(marco: Marco) => void>();
  private readonly oyentesConexion = new Set<(estado: EstadoConexion) => void>();
  private readonly oyentesPropuesta = new Set<(propuesta: Propuesta) => void>();
  private readonly oyentesTemporizadores = new Set<(lista: TemporizadorActivo[]) => void>();
  private readonly oyentesAvisoTemporizador = new Set<(texto: string) => void>();
  private readonly oyentesEquipo = new Set<(aviso: { texto: string; celebrar: boolean }) => void>();
  private readonly oyentesAnimo = new Set<(animo: Animo) => void>();
  private readonly oyentesDescargas = new Set<(enCurso: DescargaEnCurso[]) => void>();
  private readonly oyentesDescargaLista = new Set<(descarga: Descarga) => void>();
  private readonly pendientes = new Map<string, Pendiente>();
  private conexion: EstadoConexion = { conectado: false, detalle: "Conectando con OpenClaw…" };
  private siguienteId = 1;
  /** Cada ventana le habla al mismo puente: el prefijo evita confundir las respuestas. */
  private readonly prefijo = Math.random().toString(36).slice(2, 8);

  /** Empieza a escuchar el puente y pide el estado de la conexión, que pudo llegar antes. */
  async iniciar(): Promise<void> {
    await listen<string>("puente", (evento) => this.recibir(evento.payload));
    this.recibir(await invoke<string>("agente_conexion"));
  }

  get estadoConexion(): EstadoConexion {
    return this.conexion;
  }

  alCambiarConexion(oyente: (estado: EstadoConexion) => void): () => void {
    this.oyentesConexion.add(oyente);
    return () => this.oyentesConexion.delete(oyente);
  }

  /** Sin conexión igual se envía: el motor de comandos del puente funciona sin OpenClaw. */
  enviar(texto: string): Promise<ResultadoEnvio> {
    return this.pedir({ tipo: "enviar", texto });
  }

  async resolverAprobacion(id: string, kind: string, decision: Decision): Promise<void> {
    await this.pedir({ tipo: "resolver", aprobacion: id, kind, decision });
  }

  escuchar(oyente: (marco: Marco) => void): () => void {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  }

  /** La lista de temporizadores cada vez que cambia. */
  alCambiarTemporizadores(oyente: (lista: TemporizadorActivo[]) => void): () => void {
    this.oyentesTemporizadores.add(oyente);
    return () => this.oyentesTemporizadores.delete(oyente);
  }

  /** Cuando termina un temporizador o el pomodoro cambia de fase. */
  alAvisoTemporizador(oyente: (texto: string) => void): () => void {
    this.oyentesAvisoTemporizador.add(oyente);
    return () => this.oyentesAvisoTemporizador.delete(oyente);
  }

  /** Avisos sobre el computador (batería baja, CPU alta, disco lleno…). */
  alAvisoEquipo(oyente: (aviso: { texto: string; celebrar: boolean }) => void): () => void {
    this.oyentesEquipo.add(oyente);
    return () => this.oyentesEquipo.delete(oyente);
  }

  alCambiarAnimo(oyente: (animo: Animo) => void): () => void {
    this.oyentesAnimo.add(oyente);
    return () => this.oyentesAnimo.delete(oyente);
  }

  /** Las descargas en curso, cada vez que cambian. */
  alCambiarDescargas(oyente: (enCurso: DescargaEnCurso[]) => void): () => void {
    this.oyentesDescargas.add(oyente);
    return () => this.oyentesDescargas.delete(oyente);
  }

  /** Cuando termina una descarga. */
  alDescargaLista(oyente: (descarga: Descarga) => void): () => void {
    this.oyentesDescargaLista.add(oyente);
    return () => this.oyentesDescargaLista.delete(oyente);
  }

  async cancelarTemporizador(id: number): Promise<void> {
    await this.pedir({ tipo: "temporizador-cancelar", temporizador: id });
  }

  alProponer(oyente: (propuesta: Propuesta) => void): () => void {
    this.oyentesPropuesta.add(oyente);
    return () => this.oyentesPropuesta.delete(oyente);
  }

  async detener(runId?: string): Promise<void> {
    await this.pedir(runId ? { tipo: "detener", runId } : { tipo: "detener" });
  }

  async decidirPlantilla(id: number, aceptar: boolean): Promise<string> {
    const { mensaje } = await this.pedir({ tipo: "decidir-plantilla", plantilla: id, aceptar });
    return mensaje ?? (aceptar ? "Listo, la aprendí." : "Ok, no la aprendo.");
  }

  /** Un pedido cualquiera al puente (por ejemplo, los de "Lo que sé de ti"); devuelve sus datos. */
  async consultar<T = unknown>(pedido: Record<string, unknown>): Promise<T> {
    const { datos } = await this.pedir(pedido);
    return datos as T;
  }

  private async pedir(pedido: Record<string, unknown>): Promise<Extras> {
    const id = `${this.prefijo}-${this.siguienteId++}`;
    const respuesta = new Promise<Extras>((resolver, rechazar) => {
      const plazo = setTimeout(() => {
        this.pendientes.delete(id);
        rechazar(new Error("OpenClaw no respondió a tiempo"));
      }, ESPERA_RESPUESTA);
      this.pendientes.set(id, { resolver, rechazar, plazo });
    });
    try {
      await invoke("agente_escribir", { linea: JSON.stringify({ id, ...pedido }) });
    } catch (error) {
      const pendiente = this.pendientes.get(id);
      if (pendiente) {
        clearTimeout(pendiente.plazo);
        this.pendientes.delete(id);
      }
      throw new Error(String(error));
    }
    return respuesta;
  }

  private recibir(linea: string): void {
    let aviso: Aviso;
    try {
      aviso = JSON.parse(linea);
    } catch {
      console.warn("[puente] aviso que no es JSON:", linea);
      return;
    }
    switch (aviso.tipo) {
      case "evento":
        for (const oyente of this.oyentes) oyente(aviso.marco);
        return;
      case "respuesta": {
        const pendiente = this.pendientes.get(aviso.id);
        if (!pendiente) return;
        clearTimeout(pendiente.plazo);
        this.pendientes.delete(aviso.id);
        if (aviso.ok) pendiente.resolver({ local: aviso.local, mensaje: aviso.mensaje, datos: aviso.datos });
        else pendiente.rechazar(new Error(aviso.error ?? "OpenClaw rechazó el pedido"));
        return;
      }
      case "propuesta":
        for (const oyente of this.oyentesPropuesta) oyente(aviso.propuesta);
        return;
      case "temporizadores":
        for (const oyente of this.oyentesTemporizadores) oyente(aviso.lista);
        return;
      case "temporizador-aviso":
        for (const oyente of this.oyentesAvisoTemporizador) oyente(aviso.texto);
        return;
      case "equipo-aviso":
        for (const oyente of this.oyentesEquipo) oyente({ texto: aviso.texto, celebrar: aviso.celebrar });
        return;
      case "animo":
        for (const oyente of this.oyentesAnimo) oyente(aviso.animo);
        return;
      case "descargas":
        for (const oyente of this.oyentesDescargas) oyente(aviso.enCurso);
        return;
      case "descarga-lista":
        for (const oyente of this.oyentesDescargaLista) oyente(aviso.descarga);
        return;
      case "conexion": {
        const estado = { conectado: aviso.conectado, detalle: aviso.detalle };
        if (estado.conectado === this.conexion.conectado && estado.detalle === this.conexion.detalle) return;
        this.conexion = estado;
        for (const oyente of this.oyentesConexion) oyente(estado);
        return;
      }
    }
  }
}
