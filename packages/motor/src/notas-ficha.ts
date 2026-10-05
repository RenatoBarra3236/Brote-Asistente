// La ficha de notas de un ramo, lista para mostrar (A2). Pura: sin Node, la usan el puente y la ventana.

import { calcularRamo, notaNecesariaExamen, notaNecesaria } from "./notas-tipos.ts";
import type { AjustesNotas, Evaluacion, ResultadoExamen, ResultadoNecesaria, ResultadoRamoNotas } from "./notas-tipos.ts";

export interface FichaNotas {
  ramoId: number;
  ajustes: AjustesNotas;
  evaluaciones: Evaluacion[];
  calculo: ResultadoRamoNotas;
  /** Qué hay que sacar en cada evaluación pendiente (id → resultado), suponiendo la misma nota en las otras. */
  necesarias: Record<number, ResultadoNecesaria>;
  /** Solo si el ramo tiene examen configurado. */
  examen: ResultadoExamen | null;
}

/** Arma la ficha de un ramo. El examen cuenta como pendiente más al repartir el esfuerzo. */
export function armarFichaNotas(ramoId: number, evaluaciones: readonly Evaluacion[], ajustes: AjustesNotas): FichaNotas {
  const lista = [...evaluaciones];
  const base: Evaluacion[] = ajustes.examenPeso === null ? lista : [...lista, { id: -1, ramoId, nombre: "Examen", peso: ajustes.examenPeso, nota: null, fecha: null }];
  const necesarias: Record<number, ResultadoNecesaria> = {};
  for (const e of lista) {
    if (e.nota !== null) continue;
    const r = notaNecesaria(base, e.id, ajustes);
    if (r) necesarias[e.id] = r;
  }
  return { ramoId, ajustes, evaluaciones: lista, calculo: calcularRamo(lista, ajustes), necesarias, examen: notaNecesariaExamen(lista, ajustes) };
}
