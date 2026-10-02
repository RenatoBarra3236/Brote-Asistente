// macOS: la "isla" negra que continúa el notch, como la Dynamic Island del iPhone.
// Cerrada, apenas sobresale y el personaje asoma pequeño en un costado; abierta, se
// despliega hacia abajo y lo muestra completo.

import { ESTADOS } from "./personaje/estados";
import { Resorte, lerp, limitar } from "./personaje/fisica";
import type { Personaje } from "./personaje/personaje";

/** Ancho de cada costado de la isla cerrada, en múltiplos del alto del notch. */
const ALA = 1.6;
/** Curvas cóncavas en las esquinas superiores, para que la isla se funda con la barra de menú. */
const OREJA = 8;
/** Cuánto sigue abierta la isla después de que el cursor se va y el agente queda en reposo. */
const ESPERA_CIERRE = 0.8;

interface Tamano {
  ancho: number;
  alto: number;
}

export class Isla {
  private readonly notchAncho: number;
  private readonly notchAlto: number;
  private readonly cerrada: Tamano;
  private readonly desplegada: Tamano;
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
    this.desplegada = { ancho: Math.max(notchAncho + 2 * ala + 60, 300), alto: notchAlto + 110 };
    this.ancho = new Resorte(this.cerrada.ancho, 2.2, 0.72);
    this.alto = new Resorte(this.cerrada.alto, 2.2, 0.72);
  }

  /** `hover`: el cursor está sobre la isla. `activo`: el agente está haciendo algo. */
  actualizar(dt: number, hover: boolean, activo: boolean): void {
    this.t += dt;
    if (hover || activo) {
      this.abierta = true;
      this.ultimaActividad = this.t;
    } else if (this.t - this.ultimaActividad > ESPERA_CIERRE) {
      this.abierta = false;
    }
    const objetivo = this.abierta ? this.desplegada : this.cerrada;
    this.ancho.objetivo = objetivo.ancho;
    this.alto.objetivo = objetivo.alto;
    this.ancho.avanzar(dt);
    this.alto.avanzar(dt);
  }

  /** Sin movimiento: el bucle puede dibujar a menos cuadros por segundo. */
  quieta(): boolean {
    return !this.abierta && Math.abs(this.alto.velocidad) < 0.5 && Math.abs(this.ancho.velocidad) < 0.5;
  }

  /** Si un punto de la ventana cae sobre la isla (con un pequeño margen). */
  contiene(x: number, y: number, W: number): boolean {
    const mitad = this.ancho.valor / 2 + 4;
    return Math.abs(x - W / 2) <= mitad && y >= 0 && y <= this.alto.valor + 4;
  }

  dibujar(ctx: CanvasRenderingContext2D, W: number, personaje: Personaje): void {
    const camino = this.camino(W);
    ctx.fillStyle = "#000";
    ctx.fill(camino);

    // Progreso del despliegue: 0 cerrada, 1 abierta. El personaje crece y se mueve al centro.
    const p = limitar(
      (this.alto.valor - this.cerrada.alto) / (this.desplegada.alto - this.cerrada.alto),
      0,
      1,
    );
    const ala = this.notchAlto * ALA;
    const radioChico = this.notchAlto * 0.3;
    const radioGrande = 34;
    const xChico = W / 2 + this.notchAncho / 2 + ala / 2;
    const sueloChico = this.notchAlto * 0.5 + radioChico * 0.92;
    const sueloGrande = this.alto.valor - 16;

    ctx.save();
    ctx.clip(camino);
    personaje.dibujar(
      ctx,
      lerp(xChico, W / 2, p),
      lerp(sueloChico, sueloGrande, p),
      lerp(radioChico, radioGrande, p),
    );
    if (p > 0.6) {
      const alfa = (p - 0.6) / 0.4;
      ctx.fillStyle = `rgba(255,255,255,${0.85 * alfa})`;
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(ESTADOS[personaje.estado].nombre, W / 2 - this.ancho.valor / 2 + 18, this.notchAlto + 18);
    }
    ctx.restore();
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
