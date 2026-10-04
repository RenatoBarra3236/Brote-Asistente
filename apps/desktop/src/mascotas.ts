// Las mascotas del equipo de Brote en el lienzo. Cada especialista que trabaja tiene un `Personaje`
// con su apariencia (color de cuerpo y hoja, y su accesorio) que sale de detrás de Brote, se acomoda
// en su lugar del escenario (o en su columna de "Ver a todos") con resortes y, al irse, vuelve detrás
// de Brote mientras se desvanece. El panel (HTML) dice dónde va cada una; aquí solo se mueven y dibujan.

import { estadoDeMascota, mascotaDe, type Visual } from "./agente/especialistas";
import { Resorte } from "./personaje/fisica";
import { Personaje, type Apariencia } from "./personaje/personaje";

/** Dónde debe estar una mascota: el centro de su base y su tamaño, en píxeles de la ventana. */
export interface Lugar {
  clave: string;
  /** El agente ("investigador"), para elegir su apariencia. */
  id: string;
  x: number;
  suelo: number;
  radio: number;
  visual: Visual;
}

interface Mascota {
  personaje: Personaje;
  x: Resorte;
  suelo: Resorte;
  radio: Resorte;
  alfa: Resorte;
  visual: Visual | null;
  /** Ya no tiene lugar: vuelve detrás de Brote y se desvanece. */
  yendose: boolean;
}

function aparienciaDe(id: string): Apariencia {
  const m = mascotaDe(id);
  return { cuerpo: [m.cuerpo[0], m.cuerpo[1]], hoja: m.hoja, accesorio: m.accesorio };
}

export class Mascotas {
  private readonly mascotas = new Map<string, Mascota>();
  private mirada = { x: 0, y: 0 };

  /** Si hay alguna en pantalla (para no dibujar a medias cuadros por segundo). */
  hayAlguna(): boolean {
    return this.mascotas.size > 0;
  }

  mirarHacia(dx: number, dy: number): void {
    this.mirada = { x: dx, y: dy };
  }

  /**
   * Lleva cada mascota a su lugar. Las nuevas parten desde `origen` (detrás de Brote, chiquitas y
   * transparentes); las que ya no tienen lugar vuelven a `origen` y se borran al desvanecerse.
   */
  actualizar(dt: number, lugares: readonly Lugar[], origen: { x: number; suelo: number; radio: number }): void {
    const vistas = new Set<string>();
    for (const lugar of lugares) {
      vistas.add(lugar.clave);
      let m = this.mascotas.get(lugar.clave);
      if (!m) {
        m = {
          personaje: new Personaje(aparienciaDe(lugar.id)),
          x: new Resorte(origen.x, 1.6, 0.62),
          suelo: new Resorte(origen.suelo, 1.6, 0.62),
          radio: new Resorte(origen.radio * 0.4, 1.8, 0.7),
          alfa: new Resorte(0, 2, 1),
          visual: null,
          yendose: false,
        };
        this.mascotas.set(lugar.clave, m);
      }
      m.yendose = false;
      m.x.objetivo = lugar.x;
      m.suelo.objetivo = lugar.suelo;
      m.radio.objetivo = lugar.radio;
      m.alfa.objetivo = 1;
      if (lugar.visual !== m.visual) {
        // Al terminar, celebra (salto y chispas); al fallar, se sacude.
        m.personaje.setEstado(estadoDeMascota(lugar.visual));
        m.visual = lugar.visual;
      }
    }
    for (const [clave, m] of this.mascotas) {
      if (!vistas.has(clave)) {
        m.yendose = true;
        m.x.objetivo = origen.x;
        m.suelo.objetivo = origen.suelo;
        m.radio.objetivo = origen.radio * 0.4;
        m.alfa.objetivo = 0;
      }
      for (const r of [m.x, m.suelo, m.radio, m.alfa]) r.avanzar(dt);
      m.personaje.actualizar(dt);
      m.personaje.mirarHacia(this.mirada.x, this.mirada.y);
      m.personaje.alfa = Math.max(0, Math.min(1, m.alfa.valor));
      if (m.yendose && m.alfa.valor < 0.04) this.mascotas.delete(clave);
    }
  }

  dibujar(ctx: CanvasRenderingContext2D): void {
    // Las que se van primero: quedan detrás de las que llegan.
    const orden = [...this.mascotas.values()].sort((a, b) => Number(b.yendose) - Number(a.yendose));
    for (const m of orden) {
      if (m.radio.valor < 2 || m.personaje.alfa <= 0.01) continue;
      m.personaje.dibujar(ctx, m.x.valor, m.suelo.valor, m.radio.valor);
    }
  }

  /** Les da un toquecito (por ejemplo, al tocar su lugar en el escenario). */
  tocar(clave: string): void {
    this.mascotas.get(clave)?.personaje.tocar();
  }
}
