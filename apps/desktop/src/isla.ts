// macOS: la "isla" negra que continúa el notch, como la Dynamic Island del iPhone.
// Cerrada, apenas sobresale: Brote asoma pequeño en el ala derecha y en la izquierda va lo más
// urgente (un temporizador, la música…). Abierta, se despliega hacia abajo: las pestañas en la
// fila del notch y, debajo, una tarjeta con Brote a la izquierda y el panel (`panel.ts`) a la
// derecha. Crece lo justo para el contenido del panel.

import type { Zona } from "./panel";
import { ESTADOS, type RGB } from "./personaje/estados";
import { Resorte, lerp, limitar } from "./personaje/fisica";
import type { Personaje } from "./personaje/personaje";

/** Ancho de cada costado de la isla cerrada, en múltiplos del alto del notch. */
const ALA = 1.6;
/** Curvas cóncavas en las esquinas superiores, para que la isla se funda con la barra de menú. */
const OREJA = 8;
/** Cuánto sigue abierta la isla después de que el cursor se va y el agente queda en reposo. */
const ESPERA_CIERRE = 0.8;
/** Ancho preferido de la isla abierta. La ventana del notch mide 600 × 380 (lib.rs). */
const ANCHO_ABIERTA = 560;
/** Alto mínimo de la tarjeta interior: lo que ocupan Brote y su etiqueta. */
const ALTO_TARJETA = 168;
/** Columna de Brote dentro de la tarjeta. */
const COLUMNA = 116;
/** Margen entre el borde de la isla y la tarjeta, y dentro de la tarjeta. */
const BORDE = 8;
const MARGEN = 10;
/** El tamaño de Brote con la isla abierta. */
const RADIO_GRANDE = 30;

interface Tamano {
  ancho: number;
  alto: number;
}

/** Lo que se ve en el ala izquierda de la isla cerrada: un texto ("12:34") o las ondas de la música. */
export interface Ala {
  texto: string;
  color: string;
  ondas?: boolean;
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
    this.desplegada = { ancho: Math.max(notchAncho + 2 * ala + 60, ANCHO_ABIERTA), alto: notchAlto + ALTO_TARJETA + BORDE };
    this.ancho = new Resorte(this.cerrada.ancho, 2.2, 0.74);
    this.alto = new Resorte(this.cerrada.alto, 2.2, 0.74);
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

  /** Dónde va el panel (a la derecha de Brote, dentro de la tarjeta) y las pestañas (en la fila del notch). */
  zonaPanel(W: number): Zona {
    const ancho = this.desplegada.ancho;
    const x0 = W / 2 - ancho / 2;
    const arriba = this.notchAlto + MARGEN;
    return {
      x: x0 + BORDE + COLUMNA,
      y: arriba,
      ancho: ancho - 2 * BORDE - COLUMNA - MARGEN,
      altoMax: Math.max(0, this.ventana.alto - 4 - arriba - MARGEN - BORDE),
      barra: { x: x0 + 14, y: 0, ancho: ancho - 28, alto: this.notchAlto },
    };
  }

  /** `ala`: lo que se ve en el ala izquierda mientras la isla está cerrada. */
  dibujar(ctx: CanvasRenderingContext2D, W: number, personaje: Personaje, ala?: Ala): void {
    const camino = this.camino(W);
    ctx.fillStyle = "#000";
    ctx.fill(camino);

    // Progreso del despliegue: 0 cerrada, 1 abierta. Brote crece y pasa a su columna.
    const p = this.progreso();
    const x0 = W / 2 - this.ancho.valor / 2;
    const color = colorDe(ESTADOS[personaje.estado].color);

    ctx.save();
    ctx.clip(camino);
    if (p > 0.05) this.dibujarTarjeta(ctx, W, p);

    const ala0 = this.notchAlto * ALA;
    const radioChico = this.notchAlto * 0.3;
    const xChico = W / 2 + this.notchAncho / 2 + ala0 / 2;
    const xGrande = x0 + BORDE + COLUMNA / 2;
    const sueloChico = this.notchAlto * 0.5 + radioChico * 0.92;
    const sueloGrande = this.notchAlto + 4 + ALTO_TARJETA * 0.62;
    const cx = lerp(xChico, xGrande, p);
    const suelo = lerp(sueloChico, sueloGrande, p);
    const radio = lerp(radioChico, RADIO_GRANDE, p);

    // Un halo suave del color del estado detrás de Brote.
    if (p > 0.3) {
      const alfa = ((p - 0.3) / 0.7) * 0.22;
      const cy = suelo - radio;
      const halo = ctx.createRadialGradient(cx, cy, radio * 0.4, cx, cy, radio * 2.4);
      halo.addColorStop(0, `rgba(${color}, ${alfa})`);
      halo.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = halo;
      ctx.fillRect(cx - radio * 2.5, cy - radio * 2.5, radio * 5, radio * 5);
    }
    personaje.dibujar(ctx, cx, suelo, radio);

    if (p > 0.6) {
      ctx.globalAlpha = (p - 0.6) / 0.4;
      // En reposo se muestra su nombre: "En reposo" sobraba mientras se lee una respuesta.
      const nombre = personaje.estado === "reposo" ? "Brote" : ESTADOS[personaje.estado].nombre;
      etiqueta(ctx, nombre, color, xGrande, sueloGrande + 22, COLUMNA - 16);
      ctx.globalAlpha = 1;
    }
    if (ala && p < 0.5) {
      ctx.globalAlpha = 1 - p * 2;
      const x = W / 2 - this.notchAncho / 2 - ala0 / 2;
      if (ala.ondas) ondas(ctx, x, this.notchAlto / 2, ala.color, this.t);
      else {
        ctx.fillStyle = ala.color;
        ctx.font = "600 10px ui-monospace, 'SF Mono', Menlo, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ala.texto, x, this.notchAlto / 2);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** La tarjeta interior: un poco más clara que la isla, con un degradado sutil y un borde fino. */
  private dibujarTarjeta(ctx: CanvasRenderingContext2D, W: number, p: number): void {
    const x = W / 2 - this.ancho.valor / 2 + BORDE;
    const y = this.notchAlto + 2;
    const ancho = this.ancho.valor - 2 * BORDE;
    const alto = this.alto.valor - this.notchAlto - 2 - BORDE;
    if (alto < 8 || ancho < 8) return;
    const forma = new Path2D();
    forma.roundRect(x, y, ancho, alto, Math.min(16, alto / 2));
    ctx.globalAlpha = limitar((p - 0.05) / 0.6, 0, 1);
    const fondo = ctx.createLinearGradient(x, y, x + ancho * 0.4, y + alto);
    fondo.addColorStop(0, "#17171d");
    fondo.addColorStop(1, "#0f0f13");
    ctx.fillStyle = fondo;
    ctx.fill(forma);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 1;
    ctx.stroke(forma);
    ctx.globalAlpha = 1;
  }

  private tamanoDesplegada(altoPanel: number): Tamano {
    // Cabe en la ventana: el ancho deja lugar a las orejas y el alto, un respiro abajo.
    this.desplegada.ancho = Math.min(
      Math.max(this.notchAncho + 2 * this.notchAlto * ALA + 60, ANCHO_ABIERTA),
      this.ventana.ancho - 2 * OREJA - 4,
    );
    this.desplegada.alto = Math.min(
      this.notchAlto + BORDE + Math.max(ALTO_TARJETA, altoPanel + 2 * MARGEN),
      this.ventana.alto - 4,
    );
    return this.desplegada;
  }

  private progreso(): number {
    return limitar(
      (this.alto.valor - this.cerrada.alto) / (this.notchAlto + BORDE + ALTO_TARJETA - this.cerrada.alto),
      0,
      1,
    );
  }

  private camino(W: number): Path2D {
    const ancho = this.ancho.valor;
    const alto = this.alto.valor;
    const x0 = W / 2 - ancho / 2;
    const x1 = W / 2 + ancho / 2;
    const radio = Math.min(alto * 0.45, 22);
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

/** "R, G, B" (0–255) para usar en `rgba(…)`. */
function colorDe([r, g, b]: RGB): string {
  return `${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}`;
}

/** La etiqueta bajo Brote: una píldora con un punto del color de su estado y el nombre. */
function etiqueta(ctx: CanvasRenderingContext2D, texto: string, color: string, cx: number, cy: number, anchoMax: number): void {
  ctx.font = "600 11px system-ui, -apple-system, sans-serif";
  const anchoTexto = Math.min(ctx.measureText(texto).width, anchoMax - 24);
  const ancho = anchoTexto + 24;
  const x = cx - ancho / 2;
  const forma = new Path2D();
  forma.roundRect(x, cy - 10, ancho, 20, 10);
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.fill(forma);
  ctx.fillStyle = `rgb(${color})`;
  ctx.beginPath();
  ctx.arc(x + 10, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, x + 17, cy + 0.5, anchoTexto);
}

/** Cuatro barritas que suben y bajan, como un ecualizador: la música está sonando. */
function ondas(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, t: number): void {
  ctx.fillStyle = color;
  const fases = [0, 1.7, 0.6, 2.4];
  fases.forEach((fase, i) => {
    const alto = 3 + 7 * (0.5 + 0.5 * Math.sin(t * 7 + fase * 2.1)) * (0.6 + 0.4 * Math.sin(t * 2.3 + fase));
    const forma = new Path2D();
    forma.roundRect(cx - 7.5 + i * 4.5, cy - alto / 2, 2.5, alto, 1.25);
    ctx.fill(forma);
  });
}
