// Cómo se ve y se mueve el personaje en cada estado.
// El adaptador del paso 5 elegirá el estado a partir de los eventos del agente.

export type Estado = "reposo" | "pensando" | "trabajando" | "pidiendo-permiso" | "listo" | "error";

export type RGB = readonly [number, number, number];
export type FormaOjos = "normal" | "abiertos" | "felices" | "concentrados" | "cruz";
export type Boca = "sonrisa" | "o" | "linea" | "risa" | "ondulada";
export type Insignia = "puntos" | "engranaje" | "exclamacion" | "gota" | null;
/** Hacia dónde mira: al cursor, o a una dirección fija [x, y] entre -1 y 1. */
export type Mirada = "cursor" | readonly [number, number];

export interface ConfigEstado {
  nombre: string;
  /** Color del brote: es la señal principal del estado. */
  color: RGB;
  ojos: FormaOjos;
  boca: Boca;
  insignia: Insignia;
  mirada: Mirada;
  /** Saltitos continuos, para llamar la atención. */
  rebota: boolean;
  /** Balanceo corto y rápido, como quien está concentrado trabajando. */
  trabaja: boolean;
  /** Inclinación del brote hacia abajo, en radianes (alicaído). */
  caidaHoja: number;
  inclinacion: number;
}

export const ESTADOS: Record<Estado, ConfigEstado> = {
  reposo: {
    nombre: "En reposo",
    color: [0.42, 0.8, 0.47],
    ojos: "normal",
    boca: "sonrisa",
    insignia: null,
    mirada: "cursor",
    rebota: false,
    trabaja: false,
    caidaHoja: 0,
    inclinacion: 0,
  },
  pensando: {
    nombre: "Pensando",
    color: [0.61, 0.48, 0.97],
    ojos: "normal",
    boca: "o",
    insignia: "puntos",
    mirada: [0.55, -0.6],
    rebota: false,
    trabaja: false,
    caidaHoja: 0,
    inclinacion: 0.08,
  },
  trabajando: {
    nombre: "Trabajando",
    color: [0.3, 0.62, 1],
    ojos: "concentrados",
    boca: "linea",
    insignia: "engranaje",
    mirada: [0, 0.25],
    rebota: false,
    trabaja: true,
    caidaHoja: 0,
    inclinacion: 0,
  },
  "pidiendo-permiso": {
    nombre: "Pidiendo permiso",
    color: [1, 0.69, 0.13],
    ojos: "abiertos",
    boca: "o",
    insignia: "exclamacion",
    mirada: "cursor",
    rebota: true,
    trabaja: false,
    caidaHoja: 0,
    inclinacion: 0,
  },
  listo: {
    nombre: "¡Listo!",
    color: [0.2, 0.83, 0.6],
    ojos: "felices",
    boca: "risa",
    insignia: null,
    mirada: "cursor",
    rebota: false,
    trabaja: false,
    caidaHoja: 0,
    inclinacion: 0,
  },
  error: {
    nombre: "Error",
    color: [0.95, 0.37, 0.36],
    ojos: "cruz",
    boca: "ondulada",
    insignia: "gota",
    mirada: [0, 0.35],
    rebota: false,
    trabaja: false,
    caidaHoja: 0.9,
    inclinacion: -0.1,
  },
};
