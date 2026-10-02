// Herramientas de movimiento: resortes, suavizado y curvas de animación.

export type Curva = (t: number) => number;

export const curvas = {
  salida: (t: number) => 1 - Math.pow(1 - t, 3),
  entrada: (t: number) => t * t,
  entradaSalida: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  // Se pasa un poco del objetivo y vuelve: da sensación de elasticidad.
  rebote: (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Acerca un valor a su objetivo de forma suave e independiente de los FPS:
 * con la misma `rapidez` se ve igual a 30 o a 120 cuadros por segundo.
 */
export function acercar(actual: number, objetivo: number, dt: number, rapidez: number): number {
  return actual + (objetivo - actual) * (1 - Math.exp(-rapidez * dt));
}

/** Resorte amortiguado: oscila alrededor de su objetivo y se va calmando. */
export class Resorte {
  valor: number;
  objetivo: number;
  velocidad = 0;
  private omega: number;
  private zeta: number;

  /** `frecuencia` en oscilaciones por segundo; `amortiguacion` de 0 (eterno) a 1 (sin rebote). */
  constructor(valor: number, frecuencia: number, amortiguacion: number) {
    this.valor = valor;
    this.objetivo = valor;
    this.omega = 2 * Math.PI * frecuencia;
    this.zeta = amortiguacion;
  }

  impulsar(velocidad: number): void {
    this.velocidad += velocidad;
  }

  avanzar(dt: number): void {
    // Sub-pasos cortos: un cuadro lento no desestabiliza el resorte.
    const pasos = Math.max(1, Math.ceil(dt * 240));
    const h = dt / pasos;
    for (let i = 0; i < pasos; i++) {
      const aceleracion =
        this.omega * this.omega * (this.objetivo - this.valor) - 2 * this.zeta * this.omega * this.velocidad;
      this.velocidad += aceleracion * h;
      this.valor += this.velocidad * h;
    }
  }
}
