// El equipo de Brote en la isla: "el equipo trabajando" en la pestaña Brote (cada especialista con
// su emoji, "· Gemini" en el color de su IA, qué está haciendo y si terminó). Sin DOM, para probarlo
// con Node. El catálogo es el del motor (packages/motor/src/especialistas.ts).

export * from "../../../../packages/motor/src/especialistas.ts";
import { etiquetaHerramienta } from "./traduccion.ts";

/** Lo que manda el puente por cada especialista (aviso "especialistas"). */
export interface Trabajando {
  sesion: string;
  id: string;
  nombre: string;
  emoji: string;
  ia: string | null;
  color: string | null;
  tarea: string | null;
  herramienta: string | null;
  estado: "trabajando" | "termino" | "fallo";
  inicioMs: number;
  finMs: number | null;
}

export interface FilaEquipo {
  clave: string;
  /** "🔎 Investigador". */
  nombre: string;
  /** "Gemini", o `null` si no se sabe. */
  ia: string | null;
  color: string | null;
  /** "Buscando en la web…", la tarea, "Listo ✓"… */
  detalle: string;
  /** Para el `title`: la tarea completa. */
  titulo: string;
  estado: Trabajando["estado"];
}

/** Cuánto sigue a la vista un especialista que ya terminó (después se va solo). */
export const TERMINADO_A_LA_VISTA_MS = 60_000;

/** Las filas de "el equipo trabajando": primero los que trabajan; los terminados, un minuto. */
export function filasEquipo(lista: readonly Trabajando[], ahoraMs: number): FilaEquipo[] {
  return lista
    .filter((t) => t.estado === "trabajando" || t.finMs === null || ahoraMs - t.finMs < TERMINADO_A_LA_VISTA_MS)
    .sort((a, b) => Number(b.estado === "trabajando") - Number(a.estado === "trabajando") || a.inicioMs - b.inicioMs)
    .map((t) => ({
      clave: t.sesion,
      nombre: `${t.emoji} ${t.nombre}`,
      ia: t.ia,
      color: t.color,
      detalle:
        t.estado === "termino"
          ? "Listo ✓"
          : t.estado === "fallo"
            ? "No pudo terminar"
            : t.herramienta
              ? etiquetaHerramienta(t.herramienta)
              : (t.tarea ?? "Trabajando…"),
      titulo: t.tarea ?? "",
      estado: t.estado,
    }));
}

/** El título de la caja: "El equipo está trabajando" o "El equipo terminó". */
export function tituloEquipo(filas: readonly FilaEquipo[]): string {
  if (filas.some((f) => f.estado === "trabajando")) return filas.length === 1 ? "Le pasé la tarea a mi equipo" : "Mi equipo está trabajando";
  return "Mi equipo terminó";
}

// ---------------------------------------------------------------- Configurar Brote → Equipo

/** Una cuenta de IA como la manda `configurar equipo`. */
export interface EstadoCuenta {
  id: string;
  nombre: string;
  probado: boolean;
  conexion: "claude-code" | "clave" | "terminal";
  terminal: string | null;
  requisito: string;
  aviso: string | null;
  modelos: readonly { ref: string; nombre: string }[];
  conectada: boolean;
}

/** Un especialista como lo manda `configurar equipo`. */
export interface EstadoEspecialista {
  id: string;
  nombre: string;
  emoji: string;
  rol: string;
  sugerido: string;
  activo: boolean;
  modelo: string | null;
  instrucciones: string;
  dentroDeBrote: boolean;
}

export interface OpcionModelo {
  ref: string;
  /** "Gemini · Gemini 3.5 Flash". */
  nombre: string;
}

/** Los modelos que se pueden elegir: solo los de cuentas conectadas (y el actual, aunque su cuenta ya no esté). */
export function modelosElegibles(cuentas: readonly EstadoCuenta[], actual: string | null = null): OpcionModelo[] {
  const opciones = cuentas
    .filter((c) => c.conectada)
    .flatMap((c) => c.modelos.map((m) => ({ ref: m.ref, nombre: `${c.nombre} · ${m.nombre}` })));
  if (actual && !opciones.some((o) => o.ref === actual)) {
    const cuenta = cuentas.find((c) => c.modelos.some((m) => m.ref === actual));
    const modelo = cuenta?.modelos.find((m) => m.ref === actual);
    opciones.unshift({ ref: actual, nombre: `${cuenta?.nombre ?? "?"} · ${modelo?.nombre ?? actual} (sin conectar)` });
  }
  return opciones;
}

/** Con qué modelo parte un especialista al prenderlo: el sugerido si su IA está conectada; si no, el primero disponible. */
export function modeloInicial(especialista: Pick<EstadoEspecialista, "sugerido" | "modelo">, cuentas: readonly EstadoCuenta[]): string | null {
  if (especialista.modelo) return especialista.modelo;
  const elegibles = modelosElegibles(cuentas);
  return elegibles.find((o) => o.ref === especialista.sugerido)?.ref ?? elegibles[0]?.ref ?? null;
}
