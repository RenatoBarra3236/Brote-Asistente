// Las tareas de fondo del puente que dependen de una función (Configurar Brote → Funciones): leer la
// música cada 3 s, vigilar Descargas, el calendario, el aula, el equipo… Solo corren las de las
// funciones prendidas; al apagar una se detiene y se limpia lo que mostraba la isla.

import type { IdFuncion } from "@asistente/motor";

/** Arranca la tarea y devuelve cómo detenerla. */
export type Arranque = () => () => void;

export class TareasPorFuncion {
  private readonly arranques: Partial<Record<IdFuncion, Arranque>>;
  private readonly enMarcha = new Map<IdFuncion, () => void>();

  constructor(arranques: Partial<Record<IdFuncion, Arranque>>) {
    this.arranques = arranques;
  }

  /** Arranca lo prendido que no corría y detiene lo apagado que corría. Devuelve qué cambió. */
  aplicar(activas: Record<IdFuncion, boolean>): { arrancadas: IdFuncion[]; detenidas: IdFuncion[] } {
    const arrancadas: IdFuncion[] = [];
    const detenidas: IdFuncion[] = [];
    for (const [id, arrancar] of Object.entries(this.arranques) as [IdFuncion, Arranque][]) {
      const detener = this.enMarcha.get(id);
      if (activas[id] && !detener) {
        this.enMarcha.set(id, arrancar());
        arrancadas.push(id);
      } else if (!activas[id] && detener) {
        this.enMarcha.delete(id);
        detener();
        detenidas.push(id);
      }
    }
    return { arrancadas, detenidas };
  }

  corriendo(id: IdFuncion): boolean {
    return this.enMarcha.has(id);
  }

  /** Detiene todo (al salir). */
  detenerTodo(): void {
    for (const detener of this.enMarcha.values()) detener();
    this.enMarcha.clear();
  }
}

/** Un `setInterval` que corre también al tiro; devuelve cómo detenerlo. */
export function cada(ms: number, tarea: () => void, alTiro = true): () => void {
  const intervalo = setInterval(tarea, ms);
  if (alTiro) tarea();
  return () => clearInterval(intervalo);
}
