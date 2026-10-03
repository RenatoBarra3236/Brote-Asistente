// El personaje: un cuerpo con forma de huevo, con un brote en la cabeza que cambia de color
// según el estado. Se dibuja entero con Canvas 2D, sin imágenes.
// Diseño provisional, hasta definir el personaje definitivo.

import { ESTADOS, type ConfigEstado, type Estado, type FormaOjos, type RGB } from "./estados";
import { Resorte, acercar, curvas, lerp, limitar, type Curva } from "./fisica";

type Animable = "parpado" | "sx" | "sy" | "salto" | "sacudida";

export type Animo = "cansado" | "acalorado" | null;

interface Tramo {
  valor: number;
  ms: number;
  curva: Curva;
}

interface Animacion {
  tramos: Tramo[];
  indice: number;
  desde: number;
  inicio: number;
}

/** Posiciones y velocidades en unidades del radio del cuerpo, para no depender del tamaño. */
interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  edad: number;
  vida: number;
  tam: number;
}

const CREMA_ARRIBA: RGB = [1, 0.96, 0.84];
const CREMA_ABAJO: RGB = [0.98, 0.82, 0.5];
const TINTA = "rgb(58, 40, 30)";
const TALLO = "rgb(96, 140, 70)";

const tramo = (valor: number, ms: number, curva: Curva = curvas.salida): Tramo => ({ valor, ms, curva });

const rgba = (c: RGB, a = 1) =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

const mezclar = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export class Personaje {
  estado: Estado = "reposo";
  private cfg: ConfigEstado = ESTADOS.reposo;

  private valores: Record<Animable, number> = { parpado: 1, sx: 1, sy: 1, salto: 0, sacudida: 0 };
  private animo: Animo = null;
  private animaciones = new Map<Animable, Animacion>();

  // Hacia dónde mira, en ángulos sobre la "esfera" del cuerpo.
  private yaw = 0;
  private pitch = 0;
  private inclinacion = 0;
  private miradaX = 0;
  private miradaY = 0;

  private color: RGB = ESTADOS.reposo.color;
  private hoja = new Resorte(0, 1.4, 0.18);
  private saltoAnterior = 0;
  private particulas: Particula[] = [];

  /** Dónde quedó dibujado el cuerpo en el último cuadro, para saber si el cursor está encima. */
  private zona = { cx: 0, cy: 0, rx: 0, ry: 0, R: 0 };

  private t = 0;
  private desdeCambio = 0;
  private proximoParpadeo = 1.5;
  private etiqueta: { texto: string; hasta: number } | null = null;

  /**
   * El ánimo según el computador, independiente del estado del agente (Brote puede estar
   * pensando y a la vez cansado): "cansado" con poca batería, "acalorado" con la CPU al máximo.
   */
  setAnimo(animo: Animo): void {
    this.animo = animo;
  }

  setEstado(nuevo: Estado, mostrarEtiqueta = false): void {
    if (mostrarEtiqueta) this.etiqueta = { texto: ESTADOS[nuevo].nombre, hasta: this.t + 1.6 };
    if (nuevo === this.estado) return;
    this.estado = nuevo;
    this.cfg = ESTADOS[nuevo];
    this.desdeCambio = 0;
    this.parpadear();
    this.hoja.impulsar(3);
    if (nuevo === "listo") {
      this.saltar();
      this.chispas(14);
    } else if (nuevo === "error") {
      this.sacudir();
    } else if (nuevo === "pidiendo-permiso") {
      this.aplastar();
    }
  }

  /** Distancia del cursor al centro de la ventana, en píxeles. */
  mirarHacia(dx: number, dy: number): void {
    this.miradaX = limitar(dx / 320, -1, 1);
    this.miradaY = limitar(dy / 260, -1, 1);
  }

  tocar(): void {
    this.aplastar();
    this.parpadear();
    this.hoja.impulsar(8);
  }

  /** Si un punto de la ventana (en píxeles) cae sobre el cuerpo o el brote, con un pequeño margen. */
  contiene(x: number, y: number): boolean {
    const { cx, cy, rx, ry, R } = this.zona;
    const margen = 6;
    const dx = (x - cx) / (rx * this.valores.sx + margen);
    const dy = (y - cy) / (ry * this.valores.sy + margen);
    if (dx * dx + dy * dy <= 1) return true;
    // El brote: un círculo sobre la cabeza.
    const bx = x - cx;
    const by = y - (cy - ry - R * 0.3);
    return bx * bx + by * by <= (R * 0.35) ** 2;
  }

  /** Sin nada animándose: el bucle puede dibujar a menos cuadros por segundo. */
  enCalma(): boolean {
    return (
      this.estado === "reposo" &&
      this.animaciones.size === 0 &&
      this.particulas.length === 0 &&
      this.etiqueta === null &&
      Math.abs(this.hoja.velocidad) < 0.05
    );
  }

  // ── Animaciones puntuales ──────────────────────────────────────────────────

  private animar(prop: Animable, tramos: Tramo[]): void {
    this.animaciones.set(prop, { tramos, indice: 0, desde: this.valores[prop], inicio: this.t });
  }

  private parpadear(): void {
    this.animar("parpado", [tramo(0.08, 70, curvas.entradaSalida), tramo(1, 120)]);
  }

  private aplastar(): void {
    this.animar("sy", [tramo(0.82, 70), tramo(1.08, 120), tramo(1, 160, curvas.entradaSalida)]);
    this.animar("sx", [tramo(1.15, 70), tramo(0.96, 120), tramo(1, 160, curvas.entradaSalida)]);
  }

  private saltar(): void {
    this.aplastar();
    this.animar("salto", [
      tramo(0, 70),
      tramo(-0.5, 230),
      tramo(0, 260, curvas.entrada),
      tramo(-0.08, 120),
      tramo(0, 140, curvas.entrada),
    ]);
  }

  private sacudir(): void {
    this.animar("sacudida", [tramo(-0.14, 60), tramo(0.12, 80), tramo(-0.07, 80), tramo(0.03, 80), tramo(0, 100)]);
  }

  private chispas(cantidad: number): void {
    for (let i = 0; i < cantidad; i++) {
      const angulo = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const rapidez = 1.6 + Math.random() * 1.6;
      this.particulas.push({
        x: (Math.random() - 0.5) * 0.6,
        y: -0.7,
        vx: Math.cos(angulo) * rapidez,
        vy: Math.sin(angulo) * rapidez,
        edad: 0,
        vida: 0.9 + Math.random() * 0.5,
        tam: 0.06 + Math.random() * 0.06,
      });
    }
  }

  // ── Actualización ──────────────────────────────────────────────────────────

  actualizar(dt: number): void {
    this.t += dt;
    this.desdeCambio += dt;
    this.avanzarAnimaciones();

    const cfg = this.cfg;
    let objetivoX = cfg.mirada === "cursor" ? this.miradaX : cfg.mirada[0];
    const objetivoY = cfg.mirada === "cursor" ? this.miradaY : cfg.mirada[1];
    if (this.estado === "pensando") objetivoX += Math.sin(this.t * 0.9) * 0.12;
    if (this.estado === "trabajando") objetivoX += Math.sin(this.t * 2.3) * 0.35;
    this.yaw = acercar(this.yaw, objetivoX * 0.6, dt, 8);
    this.pitch = acercar(this.pitch, objetivoY * 0.45, dt, 8);

    const objetivoInclinacion = cfg.inclinacion + (this.estado === "pensando" ? Math.sin(this.t * 1.1) * 0.05 : 0);
    this.inclinacion = acercar(this.inclinacion, objetivoInclinacion, dt, 5);
    this.color = mezclar(this.color, cfg.color, 1 - Math.exp(-6 * dt));

    // El brote se mece solo, cae si el estado lo pide y reacciona cuando el cuerpo salta.
    this.hoja.objetivo = cfg.caidaHoja + (this.animo === "cansado" ? 0.35 : 0) + Math.sin(this.t * 1.3) * 0.06;
    this.hoja.impulsar((this.valores.salto - this.saltoAnterior) * 18);
    this.saltoAnterior = this.valores.salto;
    this.hoja.avanzar(dt);

    if (this.t > this.proximoParpadeo) {
      if (cfg.ojos !== "felices" && cfg.ojos !== "cruz") this.parpadear();
      this.proximoParpadeo = this.t + (Math.random() < 0.2 ? 0.25 : 2.2 + Math.random() * 3.2);
    }

    for (const p of this.particulas) {
      p.edad += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 3.5 * dt;
    }
    this.particulas = this.particulas.filter((p) => p.edad < p.vida);

    if (this.estado === "listo" && this.desdeCambio > 3) this.setEstado("reposo");
    if (this.etiqueta && this.t > this.etiqueta.hasta) this.etiqueta = null;
  }

  private avanzarAnimaciones(): void {
    for (const [prop, a] of this.animaciones) {
      const actual = a.tramos[a.indice];
      const p = limitar((this.t - a.inicio) / (actual.ms / 1000), 0, 1);
      this.valores[prop] = lerp(a.desde, actual.valor, actual.curva(p));
      if (p < 1) continue;
      a.desde = actual.valor;
      a.indice += 1;
      a.inicio = this.t;
      if (a.indice >= a.tramos.length) this.animaciones.delete(prop);
    }
  }

  // ── Dibujo ─────────────────────────────────────────────────────────────────

  /**
   * Dibuja al personaje con su base en (`cx`, `suelo`) y un radio de cuerpo `R`, en píxeles lógicos
   * (la escala de pantalla ya está aplicada).
   */
  dibujar(ctx: CanvasRenderingContext2D, cx: number, suelo: number, R: number): void {
    const rx = R;
    const ry = R * 0.92;
    const cfg = this.cfg;
    const t = this.t;

    const respiracion = 1 + Math.sin(t * 1.8) * 0.025;
    const rebote = cfg.rebota ? -Math.abs(Math.sin(t * 5.2)) * 0.09 : 0;
    const vaiven = cfg.trabaja ? -Math.abs(Math.sin(t * 9)) * 0.035 : 0;
    const altura = (this.valores.salto + rebote + vaiven) * R;

    this.dibujarSombra(ctx, cx, suelo + R * 0.05, rx, R, altura);

    // El cuerpo se aplasta y estira desde la base, así se ve apoyado en el suelo.
    ctx.save();
    ctx.translate(cx, suelo + altura);
    ctx.rotate(this.inclinacion + this.valores.sacudida);
    ctx.scale(this.valores.sx / Math.sqrt(respiracion), this.valores.sy * respiracion);
    ctx.translate(0, -ry);

    this.dibujarBrote(ctx, ry, R);
    const cuerpo = this.caminoCuerpo(rx, ry);
    this.dibujarCuerpo(ctx, cuerpo, rx, ry, R);
    ctx.save();
    ctx.clip(cuerpo);
    this.dibujarCara(ctx, rx, ry, R);
    ctx.restore();
    ctx.restore();

    const centroY = suelo + altura - ry;
    this.zona = { cx, cy: centroY, rx, ry, R };
    this.dibujarInsignia(ctx, cx, centroY, rx, ry, R);
    if (this.animo === "acalorado") this.dibujarSudor(ctx, cx, centroY, rx, ry, R);
    this.dibujarParticulas(ctx, cx, centroY, R);
  }

  private dibujarSombra(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, R: number, altura: number): void {
    const k = limitar(1 + altura / (R * 1.5), 0.4, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.16 * k})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 0.85 * k, R * 0.12 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Forma de huevo: un poco más ancho abajo que arriba. */
  private caminoCuerpo(rx: number, ry: number): Path2D {
    const camino = new Path2D();
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = Math.sin(a);
      const x = rx * Math.cos(a) * (1 + 0.07 * s);
      const y = ry * s;
      if (i === 0) camino.moveTo(x, y);
      else camino.lineTo(x, y);
    }
    camino.closePath();
    return camino;
  }

  private dibujarCuerpo(ctx: CanvasRenderingContext2D, cuerpo: Path2D, rx: number, ry: number, R: number): void {
    const degradado = ctx.createLinearGradient(0, -ry, 0, ry);
    degradado.addColorStop(0, rgba(CREMA_ARRIBA));
    degradado.addColorStop(1, rgba(CREMA_ABAJO));
    ctx.fillStyle = degradado;
    ctx.fill(cuerpo);

    const brillo = ctx.createRadialGradient(-rx * 0.35, -ry * 0.5, 0, -rx * 0.35, -ry * 0.5, R * 0.5);
    brillo.addColorStop(0, "rgba(255,255,255,0.65)");
    brillo.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = brillo;
    ctx.fill(cuerpo);

    ctx.lineWidth = R * 0.03;
    ctx.strokeStyle = "rgba(150,100,50,0.35)";
    ctx.stroke(cuerpo);
  }

  private dibujarBrote(ctx: CanvasRenderingContext2D, ry: number, R: number): void {
    const angulo = this.hoja.valor;
    const largo = R * 0.42;
    const baseY = -ry * 0.94;
    const puntaX = Math.sin(angulo) * largo;
    const puntaY = baseY - Math.cos(angulo) * largo;

    ctx.strokeStyle = TALLO;
    ctx.lineWidth = R * 0.07;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.quadraticCurveTo(Math.sin(angulo) * largo * 0.2, baseY - largo * 0.55, puntaX, puntaY);
    ctx.stroke();

    // En los estados activos el brote brilla con un pulso.
    const activo = this.estado !== "reposo";
    ctx.save();
    if (activo) {
      ctx.shadowColor = rgba(this.color, 0.8);
      ctx.shadowBlur = R * 0.25 * (0.6 + 0.4 * Math.sin(this.t * 4));
    }
    this.dibujarHoja(ctx, puntaX, puntaY, angulo - 0.55, R * 0.36);
    this.dibujarHoja(ctx, puntaX, puntaY, Math.PI + angulo + 0.55, R * 0.28);
    ctx.restore();
  }

  private dibujarHoja(ctx: CanvasRenderingContext2D, x: number, y: number, angulo: number, largo: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angulo);
    ctx.fillStyle = rgba(this.color);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(largo * 0.5, -largo * 0.45, largo, 0);
    ctx.quadraticCurveTo(largo * 0.5, largo * 0.45, 0, 0);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = largo * 0.06;
    ctx.beginPath();
    ctx.moveTo(largo * 0.1, 0);
    ctx.lineTo(largo * 0.8, 0);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Los ojos, las mejillas y la boca se proyectan sobre una esfera imaginaria:
   * al girar la mirada se desplazan y se achican hacia el borde, como en un objeto 3D.
   */
  private dibujarCara(ctx: CanvasRenderingContext2D, rx: number, ry: number, R: number): void {
    const pitchCara = 0.1 - this.pitch;
    const desplazamientoX = Math.sin(this.yaw) * rx * 0.55;
    const alturaCara = -Math.sin(pitchCara) * ry;

    ctx.fillStyle = this.animo === "acalorado" ? "rgba(255,90,90,0.6)" : "rgba(255,140,150,0.45)";
    for (const lado of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(lado * rx * 0.55 + desplazamientoX, alturaCara + ry * 0.28, R * 0.13, R * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const lado of [-1, 1]) {
      const yawOjo = lado * 0.36 + this.yaw;
      const cosPitch = Math.cos(pitchCara);
      if (Math.cos(yawOjo) * cosPitch < 0.05) continue;
      ctx.save();
      ctx.translate(Math.sin(yawOjo) * cosPitch * rx, alturaCara);
      ctx.scale(Math.max(0.25, Math.cos(yawOjo)), Math.max(0.25, cosPitch));
      this.dibujarOjo(ctx, this.cfg.ojos, R);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(desplazamientoX, alturaCara + ry * 0.34);
    this.dibujarBoca(ctx, R);
    ctx.restore();
  }

  private dibujarOjo(ctx: CanvasRenderingContext2D, forma: FormaOjos, R: number): void {
    const w = R * 0.15;
    const h = R * 0.2;
    ctx.fillStyle = TINTA;
    ctx.strokeStyle = TINTA;
    ctx.lineCap = "round";
    ctx.lineWidth = R * 0.055;

    if (forma === "felices") {
      ctx.beginPath();
      ctx.arc(0, h * 0.3, w * 0.9, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      return;
    }
    if (forma === "cruz") {
      const d = w * 0.65;
      ctx.beginPath();
      ctx.moveTo(-d, -d);
      ctx.lineTo(d, d);
      ctx.moveTo(d, -d);
      ctx.lineTo(-d, d);
      ctx.stroke();
      return;
    }

    const escala = forma === "abiertos" ? 1.25 : 1;
    // Cansado (poca batería): párpados a media asta, salvo que la expresión ya los cierre.
    const apertura = (forma === "concentrados" ? 0.55 : 1) * (this.animo === "cansado" ? 0.45 : 1);
    const alto = Math.max(h * escala * apertura * this.valores.parpado, R * 0.025);
    ctx.beginPath();
    ctx.ellipse(0, 0, (w * escala) / 2, alto / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (alto > h * 0.4) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(w * 0.18 * escala, -alto * 0.22, w * 0.18 * escala, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private dibujarBoca(ctx: CanvasRenderingContext2D, R: number): void {
    ctx.strokeStyle = TINTA;
    ctx.fillStyle = TINTA;
    ctx.lineWidth = R * 0.045;
    ctx.lineCap = "round";
    ctx.beginPath();
    switch (this.cfg.boca) {
      case "sonrisa":
        ctx.arc(0, -R * 0.04, R * 0.09, Math.PI * 0.18, Math.PI * 0.82);
        ctx.stroke();
        break;
      case "o":
        ctx.ellipse(0, 0, R * 0.045, R * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "linea":
        ctx.moveTo(-R * 0.07, 0);
        ctx.lineTo(R * 0.07, 0);
        ctx.stroke();
        break;
      case "risa":
        ctx.arc(0, -R * 0.02, R * 0.11, 0, Math.PI);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgb(240,120,130)";
        ctx.beginPath();
        ctx.ellipse(0, R * 0.055, R * 0.05, R * 0.03, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "ondulada":
        ctx.moveTo(-R * 0.1, 0);
        ctx.quadraticCurveTo(-R * 0.05, -R * 0.04, 0, 0);
        ctx.quadraticCurveTo(R * 0.05, R * 0.04, R * 0.1, 0);
        ctx.stroke();
        break;
    }
  }

  /** Dos gotitas que caen por la frente (acalorado). */
  private dibujarSudor(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, R: number): void {
    ctx.save();
    ctx.fillStyle = "rgba(120,190,255,0.9)";
    for (const [lado, desfase] of [[1, 0], [-1, 0.5]] as const) {
      const fase = (this.t * 0.7 + desfase) % 1;
      ctx.globalAlpha = 1 - fase;
      const x = cx + lado * rx * 0.78;
      const y = cy - ry * 0.45 + fase * R * 0.35;
      const tam = R * 0.07;
      ctx.beginPath();
      ctx.moveTo(x, y - tam * 1.6);
      ctx.quadraticCurveTo(x + tam, y - tam * 0.2, x + tam, y + tam * 0.3);
      ctx.arc(x, y + tam * 0.3, tam, 0, Math.PI);
      ctx.quadraticCurveTo(x - tam, y - tam * 0.2, x, y - tam * 1.6);
      ctx.fill();
    }
    ctx.restore();
  }

  private dibujarInsignia(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    R: number,
  ): void {
    const t = this.t;
    const x = cx + rx * 0.95;
    const y = cy - ry * 1.0;
    ctx.save();
    switch (this.cfg.insignia) {
      case "puntos": {
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.strokeStyle = "rgba(0,0,0,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x - R * 0.32, y - R * 0.17, R * 0.64, R * 0.34, R * 0.17);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = rgba(this.color);
        for (let i = 0; i < 3; i++) {
          const salto = -Math.abs(Math.sin(t * 6 - i * 0.7)) * R * 0.05;
          ctx.beginPath();
          ctx.arc(x + (i - 1) * R * 0.17, y + salto, R * 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "engranaje": {
        ctx.translate(x, y);
        ctx.rotate(t * 2.5);
        ctx.fillStyle = rgba(this.color);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const radio = i % 2 === 0 ? R * 0.2 : R * 0.15;
          const a = (i / 16) * Math.PI * 2;
          ctx.lineTo(Math.cos(a) * radio, Math.sin(a) * radio);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.06, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "exclamacion": {
        const escala = 1 + Math.abs(Math.sin(t * 5)) * 0.1;
        ctx.translate(x, y);
        ctx.scale(escala, escala);
        ctx.fillStyle = rgba(this.color);
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "white";
        ctx.font = `800 ${R * 0.26}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("!", 0, R * 0.01);
        break;
      }
      case "gota": {
        const fase = (t * 0.6) % 1;
        ctx.globalAlpha = 1 - fase;
        ctx.translate(cx - rx * 0.92, cy - ry * 0.55 + fase * R * 0.4);
        ctx.fillStyle = "rgba(120,190,255,0.9)";
        const s = R * 0.09;
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.6);
        ctx.quadraticCurveTo(s, -s * 0.2, s, s * 0.3);
        ctx.arc(0, s * 0.3, s, 0, Math.PI);
        ctx.quadraticCurveTo(-s, -s * 0.2, 0, -s * 1.6);
        ctx.fill();
        break;
      }
      case null:
        break;
    }
    ctx.restore();
  }

  private dibujarParticulas(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
    for (const p of this.particulas) {
      const alfa = 1 - p.edad / p.vida;
      const tam = p.tam * R;
      ctx.save();
      ctx.translate(cx + p.x * R, cy + p.y * R);
      ctx.rotate(p.edad * 4);
      ctx.fillStyle = p.tam > 0.09 ? `rgba(255,214,90,${alfa})` : rgba(this.color, alfa);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const radio = i % 2 === 0 ? tam : tam * 0.35;
        const a = (i / 8) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * radio, Math.sin(a) * radio);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /** Nombre del estado recién elegido con el teclado, centrado en (`x`, `y`). Se desvanece solo. */
  dibujarEtiqueta(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.etiqueta) return;
    const alfa = limitar((this.etiqueta.hasta - this.t) / 0.4, 0, 1);
    ctx.save();
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const ancho = ctx.measureText(this.etiqueta.texto).width + 18;
    ctx.fillStyle = `rgba(20,20,30,${0.75 * alfa})`;
    ctx.beginPath();
    ctx.roundRect(x - ancho / 2, y - 10, ancho, 20, 10);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${alfa})`;
    ctx.fillText(this.etiqueta.texto, x, y);
    ctx.restore();
  }
}
