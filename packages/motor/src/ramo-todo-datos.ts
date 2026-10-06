// Lo que «Todo lo de un ramo» saca de la base de datos de Brote (tareas, pruebas, bloques de estudio,
// tarjetas y grabaciones asignadas). Lo comparten el puente y el servidor MCP; los eventos del calendario
// y las entregas del aula los pone quien llama (los lee Brote, que tiene los permisos). Solo títulos y
// fechas: ni el texto de las clases ni el de las tarjetas pasan por aquí.

import { listarDocumentos } from "./documentos-archivo.ts";
import type { Notas } from "./notas.ts";
import type { PlanesEstudio } from "./plan-estudio.ts";
import { leerFechaPrueba, tituloDeBloque } from "./plan-estudio-tipos.ts";
import type { Ramos } from "./ramos.ts";
import type { FuentesRamo } from "./ramo-todo.ts";
import type { Repaso } from "./repaso.ts";
import { inicioDelDia, venceHoy } from "./repaso-tipos.ts";
import type { TareasAgenda } from "./tareas-agenda.ts";
import { fechaDeId } from "./transcripciones.ts";

const DIA_MS = 86_400_000;
/** Cuánto hacia atrás y hacia adelante se mira lo que tiene fecha. */
export const DIAS_ATRAS_RAMO = 30;
export const DIAS_ADELANTE_RAMO = 90;

export function fuentesDeBaseDeDatos(
  d: { ramos: Ramos; notas: Notas; planes: PlanesEstudio; repaso: Repaso; tareas: TareasAgenda },
  ahoraMs: number,
): Omit<FuentesRamo, "eventos" | "entregas"> {
  const desde = inicioDelDia(ahoraMs) - DIAS_ATRAS_RAMO * DIA_MS;
  const hasta = inicioDelDia(ahoraMs) + DIAS_ADELANTE_RAMO * DIA_MS;
  const nombres = new Map(d.ramos.listar(true).map((r) => [r.id, r.nombre]));

  const pruebas: FuentesRamo["pruebas"] = [];
  for (const e of d.notas.listar()) {
    const fecha = e.nota === null ? leerFechaPrueba(e.fecha) : null;
    if (fecha) pruebas.push({ id: e.id, ramoId: e.ramoId, titulo: e.nombre, inicioMs: fecha.ms });
  }

  const repasoHoy = new Map<number, number>();
  for (const t of d.repaso.tarjetas()) {
    if (t.ramoId !== null && venceHoy(t, ahoraMs)) repasoHoy.set(t.ramoId, (repasoHoy.get(t.ramoId) ?? 0) + 1);
  }

  const grabaciones: FuentesRamo["grabaciones"] = [];
  for (const [id, ramoId] of d.ramos.enlaces("grabacion")) {
    const fecha = fechaDeId(id);
    if (fecha) grabaciones.push({ id, ramoId, ms: fecha.getTime() });
  }

  return {
    pruebas,
    bloques: d.planes.bloquesEntre(desde, hasta).map((b) => ({
      id: b.id,
      ramoId: b.ramoId,
      titulo: tituloDeBloque(b.tipo, nombres.get(b.ramoId) ?? "tu ramo"),
      inicioMs: b.inicioMs,
      hecho: b.estado === "hecho",
    })),
    tareas: d.tareas.tareas(desde, hasta).map((t) => ({ id: t.id, titulo: t.titulo, venceMs: t.venceMs, hecha: t.hecha })),
    ramoDeTarea: d.ramos.enlaces("tarea"),
    repasoHoy,
    grabaciones,
    documentos: listarDocumentos()
      .filter((d) => d.ramoId !== null)
      .map((d) => ({ id: d.id, ramoId: d.ramoId as number, nombre: d.nombre, ms: Date.parse(d.creado) || 0 })),
  };
}
