// macOS: la "isla" negra que continúa el notch, como la Dynamic Island del iPhone.
// Cerrada, apenas sobresale y el personaje asoma pequeño en un costado; abierta, se
// despliega hacia abajo con el personaje a la izquierda y, a la derecha, el panel para
// hablar con el agente (`panel.ts`). Crece lo justo para el contenido del panel.

import type { Zona } from "./panel";
import { ESTADOS } from "./personaje/estados";
import { Resorte, lerp, limitar } from "./personaje/fisica";
import type { Personaje } from "./personaje/personaje";

/** Ancho de cada costado de la isla cerrada, en múltiplos del alto del notch. */
const ALA = 1.6;
/** Curvas cóncavas en las esquinas superiores, para que la isla se funda con la barra de menú. */
const OREJA = 8;
/** Cuánto sigue abierta la isla después de que el cursor se va y el agente queda en reposo. */
const ESPERA_CIERRE = 0.8;
/** Ancho preferido de la isla abierta. La ventana del notch mide 440 × 300 (lib.rs). */
const ANCHO_ABIERTA = 400;
/** Alto mínimo de la isla abierta bajo el notch: lo que ocupa el personaje. */
const ALTO_PERSONAJE = 110;
/** Columna izquierda de la isla abierta, donde va el personaje. */
const COLUMNA = 104;
const MARGEN = 10;

interface Tamano {
  ancho: number;
  alto: number;
}

export class Isla {
  private readonly notchAncho: number;
  private readonly notchAlto: number;
  private readonly cerrada: Tamano;
  private readonly desplegada: Tamano;
  private ventana: Tamano = { ancho: Infinity, alto: Infinity };
  private readonly ancho: Resorte;
  private readonly alto: Resorte;
  private abierta = false;
  private t = 0;
  private ultimaActividad = -Infinity;

  constructor(notchAncho: number, notchAlto: number) {
    this.notchAncho = notchAncho;
    this.notchAlto = notchAlto;
    const ala = notchAlto * ALA;
    this.cerrada = { ancho: notchAncho + 2 * ala, alto: notchAlto };
    this.desplegada = { ancho: Math.max(notchAncho + 2 * ala + 60, ANCHO_ABIERTA), alto: notchAlto + ALTO_PERSONAJE };
    this.ancho = new Resorte(this.cerrada.ancho, 2.2, 0.72);
    this.alto = new Resorte(this.cerrada.alto, 2.2, 0.72);
  }

  /** El tamaño de la ventana limita cuánto puede crecer la isla. */
  medirVentana(ancho: number, alto: number): void {
    this.ventana = { ancho, alto };
  }

  /**
   * `hover`: el cursor está sobre la isla o el panel. `activo`: el agente está haciendo algo o
   * el panel pide seguir abierta. `altoPanel`: lo que mide el contenido del panel.
   */
  actualizar(dt: number, hover: boolean, activo: boolean, altoPanel = 0): void {
    this.t += dt;
    if (hover || activo) {
      this.abierta = true;
      this.ultimaActividad = this.t;
    } else if (this.t - this.ultimaActividad > ESPERA_CIERRE) {
      this.abierta = false;
    }
    const desplegada = this.tamanoDesplegada(altoPanel);
    const objetivo = this.abierta ? desplegada : this.cerrada;
    this.ancho.objetivo = objetivo.ancho;
    this.alto.objetivo = objetivo.alto;
    this.ancho.avanzar(dt);
    this.alto.avanzar(dt);
  }

  /** Sin movimiento: el bucle puede dibujar a menos cuadros por segundo. */
  quieta(): boolean {
    return !this.abierta && Math.abs(this.alto.velocidad) < 0.5 && Math.abs(this.ancho.velocidad) < 0.5;
  }

  /** Si la isla está abierta y ya casi terminó de desplegarse: el panel se puede mostrar. */
  lista(): boolean {
    return this.abierta && this.progreso() > 0.9;
  }

  /** Si un punto de la ventana cae sobre la isla (con un pequeño margen). */
  contiene(x: number, y: number, W: number): boolean {
    const mitad = this.ancho.valor / 2 + 4;
    return Math.abs(x - W / 2) <= mitad && y >= 0 && y <= this.alto.valor + 4;
  }

  /** Dónde va el panel dentro de la isla abierta: a la derecha del personaje, bajo el notch. */
  zonaPanel(W: number): Zona {
    const ancho = this.desplegada.ancho;
    return {
      x: W / 2 - ancho / 2 + COLUMNA,
      y: this.notchAlto + MARGEN,
      ancho: ancho - COLUMNA - MARGEN - 4,
      altoMax: Math.max(0, this.ventana.alto - 4 - this.notchAlto - 2 * MARGEN),
    };
  }

  /**
   * `reloj`: un temporizador corriendo ("12:34" y su color), que se ve en el ala izquierda
   * mientras la isla está cerrada.
   */
  dibujar(ctx: CanvasRenderingContext2D, W: number, personaje: Personaje, reloj?: { texto: string; color: string }): void {
    const camino = this.camino(W);
    ctx.fillStyle = "#000";
    ctx.fill(camino);

    // Progreso del despliegue: 0 cerrada, 1 abierta. El personaje crece y pasa a su columna.
    const p = this.progreso();
    const ala = this.notchAlto * ALA;
    const radioChico = this.notchAlto * 0.3;
    const radioGrande = 30;
    const xChico = W / 2 + this.notchAncho / 2 + ala / 2;
    const xGrande = W / 2 - this.ancho.valor / 2 + COLUMNA / 2 + 4;
    const sueloChico = this.notchAlto * 0.5 + radioChico * 0.92;
    const sueloGrande = this.notchAlto + ALTO_PERSONAJE - 14;

    ctx.save();
    ctx.clip(camino);
    personaje.dibujar(ctx, lerp(xChico, xGrande, p), lerp(sueloChico, sueloGrande, p), lerp(radioChico, radioGrande, p));
    if (p > 0.6) {
      const alfa = (p - 0.6) / 0.4;
      ctx.fillStyle = `rgba(255,255,255,${0.85 * alfa})`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Achica la letra si el nombre del estado no cabe en la columna del personaje.
      // En reposo se muestra su nombre: "En reposo" sobraba mientras se lee una respuesta.
      const nombre = personaje.estado === "reposo" ? "Brote" : ESTADOS[personaje.estado].nombre;
      ctx.font = "600 11px system-ui, sans-serif";
      const tamano = Math.min(11, (11 * (COLUMNA - 12)) / ctx.measureText(nombre).width);
      ctx.font = `600 ${tamano.toFixed(1)}px system-ui, sans-serif`;
      ctx.fillText(nombre, xGrande, this.notchAlto + 12);
    }
    if (reloj && p < 0.5) {
      ctx.globalAlpha = 1 - p * 2;
      ctx.fillStyle = reloj.color;
      ctx.font = "600 10px ui-monospace, 'SF Mono', Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(reloj.texto, W / 2 - this.notchAncho / 2 - (this.notchAlto * ALA) / 2, this.notchAlto / 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private tamanoDesplegada(altoPanel: number): Tamano {
    // Cabe en la ventana: el ancho deja lugar a las orejas y el alto, un respiro abajo.
    this.desplegada.ancho = Math.min(
      Math.max(this.notchAncho + 2 * this.notchAlto * ALA + 60, ANCHO_ABIERTA),
      this.ventana.ancho - 2 * OREJA - 4,
    );
    this.desplegada.alto = Math.min(
      this.notchAlto + Math.max(ALTO_PERSONAJE, altoPanel + 2 * MARGEN),
      this.ventana.alto - 4,
    );
    return this.desplegada;
  }

  private progreso(): number {
    return limitar(
      (this.alto.valor - this.cerrada.alto) / (this.notchAlto + ALTO_PERSONAJE - this.cerrada.alto),
      0,
      1,
    );
  }

  private camino(W: number): Path2D {
    const ancho = this.ancho.valor;
    const alto = this.alto.valor;
    const x0 = W / 2 - ancho / 2;
    const x1 = W / 2 + ancho / 2;
    const radio = Math.min(alto * 0.45, 20);
    const camino = new Path2D();
    camino.moveTo(x0 - OREJA, 0);
    camino.quadraticCurveTo(x0, 0, x0, OREJA);
    camino.lineTo(x0, alto - radio);
    camino.quadraticCurveTo(x0, alto, x0 + radio, alto);
    camino.lineTo(x1 - radio, alto);
    camino.quadraticCurveTo(x1, alto, x1, alto - radio);
    camino.lineTo(x1, OREJA);
    camino.quadraticCurveTo(x1, 0, x1 + OREJA, 0);
    camino.closePath();
    return camino;
  }
}
