// El personaje: un cuerpo con forma de huevo, con un brote en la cabeza que cambia de color
// según el estado. Se dibuja entero con Canvas 2D, sin imágenes.
// Diseño provisional, hasta definir el personaje definitivo.
//
// Las mascotas del equipo de Brote son variantes del mismo personaje (`Apariencia`): otro color de
// cuerpo y de hoja, y un accesorio dibujado aquí (birrete, lupa, lápiz, visera o reloj). Son dibujos
// propios: nada de personajes, logos ni dibujos de otros proyectos.

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

/** Una nota musical que sube flotando mientras suena música (en unidades del radio). */
interface Nota {
  x: number;
  edad: number;
  vida: number;
  lado: number;
}

/** El ritmo del balanceo con música (radianes por segundo): unas 46 oscilaciones por minuto. */
const RITMO = 2.4;

const CREMA_ARRIBA: RGB = [1, 0.96, 0.84];
const CREMA_ABAJO: RGB = [0.98, 0.82, 0.5];

export type Accesorio = "birrete" | "lupa" | "lapiz" | "visera" | "reloj";

/** Cómo se ve: Brote (por defecto) o la mascota de un especialista. */
export interface Apariencia {
  cuerpo: readonly [RGB, RGB];
  /** El color de la hoja en reposo; al trabajar se mezcla con el del estado. `null`: el del estado (Brote). */
  hoja: RGB | null;
  accesorio: Accesorio | null;
}

export const APARIENCIA_BROTE: Apariencia = { cuerpo: [CREMA_ARRIBA, CREMA_ABAJO], hoja: null, accesorio: null };
const TINTA = "rgb(58, 40, 30)";
/** Leer un documento: renglones de la hoja y lo que tarda cada uno. */
const LINEAS_LECTURA = 6;
const SEG_POR_LINEA = 1.15;
const TALLO = "rgb(96, 140, 70)";

const tramo = (valor: number, ms: number, curva: Curva = curvas.salida): Tramo => ({ valor, ms, curva });

const rgba = (c: RGB, a = 1) =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

const mezclar = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export class Personaje {
  estado: Estado = "reposo";
  private readonly apariencia: Apariencia;
  /** Transparencia de todo el dibujo (las mascotas aparecen y se van de a poco). */
  alfa = 1;

  constructor(apariencia: Apariencia = APARIENCIA_BROTE) {
    this.apariencia = apariencia;
    if (apariencia.hoja) this.color = apariencia.hoja;
    // Cada mascota parpadea a su ritmo.
    this.proximoParpadeo = 0.5 + Math.random() * 2.5;
  }
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
  /** Con música sonando, Brote se balancea: 0 quieto, 1 balanceo completo (sube y baja suave). */
  private conMusica = false;
  private ritmo = 0;
  private notas: Nota[] = [];
  private proximaNota = 0;

  // Leer un documento: se pone lentes (caen desde arriba y rebotan), sube una hoja y los ojos la recorren línea por línea.
  private lecturaModo: "lentes" | "leyendo" | null = null;
  private lentes = new Resorte(0, 1.6, 0.5);
  private hojaLectura = new Resorte(0, 1.3, 0.62);
  private tLectura = 0;
  private lentesPuestos = false;

  /**
   * El ánimo según el computador, independiente del estado del agente (Brote puede estar
   * pensando y a la vez cansado): "cansado" con poca batería, "acalorado" con la CPU al máximo.
   */
  setAnimo(animo: Animo): void {
    this.animo = animo;
  }

  /**
   * Leer un documento. `"lentes"`: se pone unos lentes (alguien arrastra un archivo hacia él, o espera a que le digan
   * qué hacer). `"leyendo"`: además sostiene una hoja y la lee de arriba abajo. `null`: se los saca y baja la hoja.
   */
  setLectura(modo: "lentes" | "leyendo" | null): void {
    if (modo === this.lecturaModo) return;
    const antes = this.lecturaModo;
    this.lecturaModo = modo;
    if (modo !== null && antes === null) {
      // Se agacha un poquito antes de que le caigan los lentes.
      this.aplastar();
      this.lentesPuestos = false;
    }
    if (modo === "leyendo" && antes !== "leyendo") this.tLectura = 0;
    if (modo === null && antes !== null) {
      this.parpadear();
      this.hoja.impulsar(4);
    }
    this.lentes.objetivo = modo === null ? 0 : 1;
    this.hojaLectura.objetivo = modo === "leyendo" ? 1 : 0;
  }

  get leyendo(): boolean {
    return this.lecturaModo !== null;
  }

  /** Si suena música en el computador: Brote se balancea suave y le salen notas. */
  setMusica(sonando: boolean): void {
    this.conMusica = sonando;
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
      this.ritmo < 0.01 &&
      this.lecturaModo === null &&
      this.lentes.valor < 0.005 &&
      this.hojaLectura.valor < 0.005 &&
      this.notas.length === 0 &&
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
    let objetivoY = cfg.mirada === "cursor" ? this.miradaY : cfg.mirada[1];
    if (this.estado === "pensando") objetivoX += Math.sin(this.t * 0.9) * 0.12;
    if (this.estado === "trabajando") objetivoX += Math.sin(this.t * 2.3) * 0.35;
    // Con la hoja a la vista, los ojos recorren cada línea de izquierda a derecha y bajan a la siguiente.
    let rapidezMirada = 8;
    if (this.lecturaModo === "leyendo" && this.hojaLectura.valor > 0.6) {
      this.tLectura += dt;
      const m = this.posicionDeLectura();
      objetivoX = m.x;
      objetivoY = m.y;
      rapidezMirada = 14;
    }
    this.yaw = acercar(this.yaw, objetivoX * 0.6, dt, rapidezMirada);
    this.pitch = acercar(this.pitch, objetivoY * 0.45, dt, rapidezMirada);

    const objetivoInclinacion =
      cfg.inclinacion + (this.estado === "pensando" ? Math.sin(this.t * 1.1) * 0.05 : 0) + (this.lecturaModo === "leyendo" ? Math.sin(this.t * 1.9) * 0.035 : 0);
    this.inclinacion = acercar(this.inclinacion, objetivoInclinacion, dt, 5);
    // La hoja de una mascota es la suya en reposo; al trabajar se tiñe a medias con el color del estado.
    const hoja = this.apariencia.hoja;
    const objetivoColor = hoja ? (this.estado === "reposo" ? hoja : mezclar(hoja, cfg.color, 0.6)) : cfg.color;
    this.color = mezclar(this.color, objetivoColor, 1 - Math.exp(-6 * dt));

    // El brote se mece solo, cae si el estado lo pide y reacciona cuando el cuerpo salta.
    // Con música el balanceo entra y sale de a poco, y el brote se mece con un poco de retraso.
    this.ritmo = acercar(this.ritmo, this.conMusica ? 1 : 0, dt, 1.5);
    this.hoja.objetivo =
      cfg.caidaHoja +
      (this.animo === "cansado" ? 0.35 : 0) +
      Math.sin(this.t * 1.3) * 0.06 +
      Math.sin(this.t * RITMO - 0.7) * 0.16 * this.ritmo;
    this.hoja.impulsar((this.valores.salto - this.saltoAnterior) * 18);
    this.saltoAnterior = this.valores.salto;
    this.hoja.avanzar(dt);
    this.lentes.avanzar(dt);
    this.hojaLectura.avanzar(dt);
    // Cuando los lentes llegan a la cara: parpadeo, saltito y unas chispas.
    if (this.lecturaModo !== null && !this.lentesPuestos && this.lentes.valor >= 0.98) {
      this.lentesPuestos = true;
      this.parpadear();
      this.hoja.impulsar(7);
      this.chispas(6);
    }

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

    if (this.conMusica && this.ritmo > 0.5 && this.t > this.proximaNota) {
      this.notas.push({ x: (Math.random() - 0.5) * 0.4, edad: 0, vida: 2.2, lado: Math.random() < 0.5 ? -1 : 1 });
      this.proximaNota = this.t + 1.6 + Math.random() * 1.4;
    }
    for (const nota of this.notas) nota.edad += dt;
    this.notas = this.notas.filter((n) => n.edad < n.vida);

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
    // Con música: un vaivén lado a lado y un pequeño rebote en cada tiempo.
    const balanceo = Math.sin(t * RITMO) * 0.08 * this.ritmo;
    const pulso = -Math.abs(Math.sin(t * RITMO)) * 0.025 * this.ritmo;
    const altura = (this.valores.salto + rebote + vaiven + pulso) * R;

    ctx.save();
    ctx.globalAlpha *= this.alfa;
    this.dibujarSombra(ctx, cx, suelo + R * 0.05, rx, R, altura);

    // El cuerpo se aplasta y estira desde la base, así se ve apoyado en el suelo.
    ctx.save();
    ctx.translate(cx, suelo + altura);
    ctx.rotate(this.inclinacion + this.valores.sacudida + balanceo);
    ctx.scale(this.valores.sx / Math.sqrt(respiracion), this.valores.sy * respiracion);
    ctx.translate(0, -ry);

    this.dibujarBrote(ctx, ry, R);
    const cuerpo = this.caminoCuerpo(rx, ry);
    this.dibujarCuerpo(ctx, cuerpo, rx, ry, R);
    ctx.save();
    ctx.clip(cuerpo);
    this.dibujarCara(ctx, rx, ry, R);
    ctx.restore();
    this.dibujarAccesorio(ctx, rx, ry, R);
    this.dibujarLentes(ctx, rx, ry, R);
    this.dibujarHojaLectura(ctx, ry, R);
    ctx.restore();

    const centroY = suelo + altura - ry;
    this.zona = { cx, cy: centroY, rx, ry, R };
    this.dibujarInsignia(ctx, cx, centroY, rx, ry, R);
    if (this.animo === "acalorado") this.dibujarSudor(ctx, cx, centroY, rx, ry, R);
    this.dibujarParticulas(ctx, cx, centroY, R);
    this.dibujarNotas(ctx, cx, centroY, ry, R);
    ctx.restore();
  }

  /**
   * El accesorio de una mascota, en las coordenadas del cuerpo (centro en 0,0; se inclina y se estira
   * con él). Todo con trazos simples de Canvas.
   */
  private dibujarAccesorio(ctx: CanvasRenderingContext2D, rx: number, ry: number, R: number): void {
    const accesorio = this.apariencia.accesorio;
    if (!accesorio) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const t = this.t;
    switch (accesorio) {
      case "birrete": {
        // Gorro de graduación: un cuadrado en perspectiva sobre la cabeza, con su borla que cuelga.
        const y = -ry * 0.82;
        ctx.fillStyle = "rgb(44, 40, 70)";
        ctx.beginPath();
        ctx.ellipse(0, y + R * 0.06, rx * 0.5, R * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-rx * 0.78, y - R * 0.08);
        ctx.lineTo(0, y - R * 0.3);
        ctx.lineTo(rx * 0.78, y - R * 0.08);
        ctx.lineTo(0, y + R * 0.12);
        ctx.closePath();
        ctx.fill();
        const balanceo = Math.sin(t * 2.2) * 0.12;
        ctx.strokeStyle = "rgb(255, 200, 70)";
        ctx.lineWidth = R * 0.05;
        ctx.beginPath();
        ctx.moveTo(0, y - R * 0.09);
        ctx.quadraticCurveTo(rx * 0.45, y - R * 0.12, rx * (0.62 + balanceo * 0.2), y + R * 0.22);
        ctx.stroke();
        ctx.fillStyle = "rgb(255, 200, 70)";
        ctx.beginPath();
        ctx.arc(rx * (0.62 + balanceo * 0.2), y + R * 0.27, R * 0.06, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "lupa": {
        // Una lupa que sostiene a un costado, con un brillo en el vidrio.
        const x = rx * 0.98;
        const y = ry * 0.12 + Math.sin(t * 1.6) * R * 0.03;
        ctx.strokeStyle = "rgb(120, 82, 50)";
        ctx.lineWidth = R * 0.11;
        ctx.beginPath();
        ctx.moveTo(x - R * 0.12, y + R * 0.12);
        ctx.lineTo(x - R * 0.36, y + R * 0.42);
        ctx.stroke();
        ctx.fillStyle = "rgba(200, 230, 255, 0.55)";
        ctx.strokeStyle = "rgb(70, 74, 92)";
        ctx.lineWidth = R * 0.07;
        ctx.beginPath();
        ctx.arc(x, y, R * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.lineWidth = R * 0.04;
        ctx.beginPath();
        ctx.arc(x, y, R * 0.14, Math.PI * 1.1, Math.PI * 1.5);
        ctx.stroke();
        break;
      }
      case "lapiz": {
        // Un lápiz detrás de la oreja, inclinado.
        ctx.translate(rx * 0.72, -ry * 0.45);
        ctx.rotate(-0.9 + Math.sin(t * 1.4) * 0.04);
        const largo = R * 0.78;
        const ancho = R * 0.14;
        ctx.fillStyle = "rgb(255, 196, 64)";
        ctx.fillRect(-largo / 2, -ancho / 2, largo, ancho);
        ctx.fillStyle = "rgb(240, 130, 140)";
        ctx.fillRect(-largo / 2 - R * 0.1, -ancho / 2, R * 0.1, ancho);
        ctx.fillStyle = "rgb(245, 222, 180)";
        ctx.beginPath();
        ctx.moveTo(largo / 2, -ancho / 2);
        ctx.lineTo(largo / 2 + R * 0.16, 0);
        ctx.lineTo(largo / 2, ancho / 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgb(58, 40, 30)";
        ctx.beginPath();
        ctx.arc(largo / 2 + R * 0.13, 0, R * 0.03, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "visera": {
        // Una visera verde de corrector, con su cinta alrededor de la cabeza.
        const y = -ry * 0.55;
        ctx.strokeStyle = "rgba(30, 90, 60, 0.9)";
        ctx.lineWidth = R * 0.07;
        ctx.beginPath();
        ctx.ellipse(0, y, rx * 0.86, R * 0.16, 0, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
        ctx.fillStyle = "rgba(60, 170, 110, 0.82)";
        ctx.beginPath();
        ctx.moveTo(-rx * 0.82, y);
        ctx.quadraticCurveTo(0, y + R * 0.42, rx * 0.82, y);
        ctx.quadraticCurveTo(0, y + R * 0.16, -rx * 0.82, y);
        ctx.fill();
        break;
      }
      case "reloj": {
        // Un reloj despertador chiquito a su lado, con las agujas que avanzan.
        const x = -rx * 1.02;
        const y = ry * 0.28;
        ctx.fillStyle = "rgb(250, 250, 252)";
        ctx.strokeStyle = "rgb(230, 90, 80)";
        ctx.lineWidth = R * 0.07;
        for (const lado of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(x + lado * R * 0.15, y - R * 0.22, R * 0.07, 0, Math.PI * 2);
          ctx.fillStyle = "rgb(230, 90, 80)";
          ctx.fill();
        }
        ctx.fillStyle = "rgb(250, 250, 252)";
        ctx.beginPath();
        ctx.arc(x, y, R * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgb(58, 40, 30)";
        ctx.lineWidth = R * 0.035;
        const a = t * 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(a) * R * 0.15, y - Math.cos(a) * R * 0.15);
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(a / 12) * R * 0.1, y - Math.cos(a / 12) * R * 0.1);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  /** Notas que salen de un costado, suben ondulando y se desvanecen. */
  private dibujarNotas(ctx: CanvasRenderingContext2D, cx: number, cy: number, ry: number, R: number): void {
    if (this.notas.length === 0) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.max(8, R * 0.38)}px system-ui, sans-serif`;
    for (const nota of this.notas) {
      const p = nota.edad / nota.vida;
      ctx.globalAlpha = Math.min(1, p * 5) * (1 - p);
      ctx.fillStyle = rgba(this.color);
      const x = cx + nota.lado * R * (0.9 + p * 0.5) + Math.sin(nota.edad * 3) * R * 0.12 + nota.x * R;
      const y = cy - ry * 0.4 - p * R * 1.1;
      ctx.fillText(nota.lado < 0 ? "♪" : "♫", x, y);
    }
    ctx.restore();
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
    degradado.addColorStop(0, rgba(this.apariencia.cuerpo[0]));
    degradado.addColorStop(1, rgba(this.apariencia.cuerpo[1]));
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


  // ── Leer un documento ──────────────────────────────────────────────────────

  /** Dónde va la lectura: línea (0 a LINEAS_LECTURA − 1), avance dentro de la línea (0 a 1) y adónde miran los ojos. */
  private posicionDeLectura(): { linea: number; avance: number; x: number; y: number } {
    const ciclo = this.tLectura / SEG_POR_LINEA;
    const linea = Math.floor(ciclo) % LINEAS_LECTURA;
    const f = ciclo - Math.floor(ciclo);
    // 85 % de la línea es leer de izquierda a derecha; el resto, volver rápido al comienzo de la siguiente.
    const leyendo = f < 0.85;
    const avance = leyendo ? f / 0.85 : 1;
    const x = leyendo ? lerp(-0.75, 0.75, avance) : lerp(0.75, -0.75, (f - 0.85) / 0.15);
    return { linea, avance, x, y: 0.55 + linea * 0.07 };
  }

  /** Dos aros con su puente y sus patillas, siguiendo la cara; caen desde arriba y rebotan al llegar. */
  private dibujarLentes(ctx: CanvasRenderingContext2D, rx: number, ry: number, R: number): void {
    const puestos = this.lentes.valor;
    if (puestos < 0.01) return;
    const pitchCara = 0.1 - this.pitch;
    const cosPitch = Math.cos(pitchCara);
    const yOjos = -Math.sin(pitchCara) * ry;
    const caida = (1 - puestos) * -R * 1.5;
    const radio = R * 0.27;
    ctx.save();
    ctx.globalAlpha *= limitar(puestos * 3, 0, 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const aros: { x: number; esc: number }[] = [];
    for (const lado of [-1, 1]) {
      const yawOjo = lado * 0.36 + this.yaw;
      const esc = Math.max(0.25, Math.cos(yawOjo));
      if (Math.cos(yawOjo) * cosPitch < 0.05) continue;
      const x = Math.sin(yawOjo) * cosPitch * rx;
      aros.push({ x, esc });
      ctx.save();
      ctx.translate(x, yOjos + caida);
      ctx.scale(esc, Math.max(0.25, cosPitch));
      ctx.fillStyle = "rgba(190, 225, 255, 0.22)";
      ctx.beginPath();
      ctx.arc(0, 0, radio, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgb(58, 40, 30)";
      ctx.lineWidth = R * 0.055;
      ctx.stroke();
      // Un brillo en el vidrio que se pasea de vez en cuando.
      const brillo = 0.55 + 0.45 * Math.max(0, Math.sin(this.t * 1.1 + lado));
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * brillo})`;
      ctx.lineWidth = R * 0.04;
      ctx.beginPath();
      ctx.arc(0, 0, radio * 0.68, Math.PI * 1.12, Math.PI * 1.45);
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = "rgb(58, 40, 30)";
    ctx.lineWidth = R * 0.05;
    if (aros.length === 2) {
      // El puente sobre la nariz, entre los aros.
      const [izq, der] = aros;
      ctx.beginPath();
      ctx.moveTo(izq.x + radio * izq.esc, yOjos + caida - R * 0.02);
      ctx.quadraticCurveTo((izq.x + der.x) / 2, yOjos + caida - R * 0.1, der.x - radio * der.esc, yOjos + caida - R * 0.02);
      ctx.stroke();
    }
    // Las patillas, hacia los lados de la cabeza.
    for (const [i, aro] of aros.entries()) {
      const lado = aros.length === 2 ? (i === 0 ? -1 : 1) : aro.x < 0 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(aro.x + lado * radio * aro.esc, yOjos + caida - R * 0.03);
      ctx.lineTo(lado * rx * 0.97, yOjos + caida - R * 0.07);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Una hoja en blanco con renglones que sostiene con dos manitas; se va marcando lo que lleva leído. */
  private dibujarHojaLectura(ctx: CanvasRenderingContext2D, ry: number, R: number): void {
    const subida = this.hojaLectura.valor;
    if (subida < 0.01) return;
    const ancho = R * 1.2;
    const alto = R * 1.05;
    const arriba = ry * 0.2 + (1 - subida) * R * 1.8;
    const balanceo = Math.sin(this.t * 1.7) * R * 0.015;
    ctx.save();
    ctx.globalAlpha *= limitar(subida * 2, 0, 1);
    ctx.translate(balanceo, 0);
    ctx.rotate(-0.04 + Math.sin(this.t * 1.3) * 0.015);
    // Sombra suave y el papel.
    ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
    ctx.beginPath();
    ctx.roundRect(-ancho / 2 + R * 0.03, arriba + R * 0.05, ancho, alto, R * 0.07);
    ctx.fill();
    ctx.fillStyle = "rgb(253, 252, 247)";
    ctx.strokeStyle = "rgb(205, 200, 188)";
    ctx.lineWidth = R * 0.03;
    ctx.beginPath();
    ctx.roundRect(-ancho / 2, arriba, ancho, alto, R * 0.07);
    ctx.fill();
    ctx.stroke();
    // Renglones: los ya leídos se tiñen de azul, el actual se va llenando al ritmo de los ojos.
    const pos = this.lecturaModo === "leyendo" && subida > 0.6 ? this.posicionDeLectura() : null;
    const margen = ancho * 0.12;
    const largoLinea = ancho - margen * 2;
    for (let i = 0; i < LINEAS_LECTURA; i++) {
      const y = arriba + alto * 0.16 + i * (alto * 0.7) / (LINEAS_LECTURA - 1);
      const largo = largoLinea * (i === LINEAS_LECTURA - 1 ? 0.55 : 1 - ((i * 37) % 17) / 100);
      ctx.lineCap = "round";
      ctx.lineWidth = R * 0.055;
      ctx.strokeStyle = "rgb(222, 219, 209)";
      ctx.beginPath();
      ctx.moveTo(-ancho / 2 + margen, y);
      ctx.lineTo(-ancho / 2 + margen + largo, y);
      ctx.stroke();
      const leido = pos ? (i < pos.linea ? 1 : i === pos.linea ? pos.avance : 0) : 0;
      if (leido > 0) {
        ctx.strokeStyle = "rgba(92, 150, 235, 0.85)";
        ctx.beginPath();
        ctx.moveTo(-ancho / 2 + margen, y);
        ctx.lineTo(-ancho / 2 + margen + largo * leido, y);
        ctx.stroke();
      }
    }
    // Las manitas del cuerpo, sujetando la hoja por los lados.
    ctx.fillStyle = rgba(this.apariencia.cuerpo[1]);
    ctx.strokeStyle = "rgba(120, 90, 60, 0.45)";
    ctx.lineWidth = R * 0.03;
    for (const lado of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(lado * ancho * 0.5, arriba + alto * 0.52, R * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
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
