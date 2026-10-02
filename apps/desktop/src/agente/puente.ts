// El transporte real: habla con OpenClaw a través del puente que lanza Rust
// (packages/adapter/src/puente.ts). Los pedidos van con el comando `agente_escribir` y
// los avisos llegan como evento `puente`, una línea JSON cada uno.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Decision, Marco, ResultadoEnvio, Transporte } from "./transporte.ts";

/** Cuánto se espera la respuesta del puente a un pedido. */
const ESPERA_RESPUESTA = 15000;

export interface EstadoConexion {
  conectado: boolean;
  detalle?: string;
}

type Aviso =
  | { tipo: "conexion"; conectado: boolean; detalle?: string }
  | { tipo: "evento"; marco: Marco }
  | { tipo: "respuesta"; id: string; ok: boolean; error?: string; local?: ResultadoEnvio["local"] };

interface Pendiente {
  resolver: (resultado: ResultadoEnvio) => void;
  rechazar: (error: Error) => void;
  plazo: ReturnType<typeof setTimeout>;
}

export class TransportePuente implements Transporte {
  private readonly oyentes = new Set<(marco: Marco) => void>();
  private readonly oyentesConexion = new Set<(estado: EstadoConexion) => void>();
  private readonly pendientes = new Map<string, Pendiente>();
  private conexion: EstadoConexion = { conectado: false, detalle: "Conectando con OpenClaw…" };
  private siguienteId = 1;

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

  private async pedir(pedido: Record<string, unknown>): Promise<ResultadoEnvio> {
    const id = String(this.siguienteId++);
    const respuesta = new Promise<ResultadoEnvio>((resolver, rechazar) => {
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
        if (aviso.ok) pendiente.resolver(aviso.local ? { local: aviso.local } : {});
        else pendiente.rechazar(new Error(aviso.error ?? "OpenClaw rechazó el pedido"));
        return;
      }
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
