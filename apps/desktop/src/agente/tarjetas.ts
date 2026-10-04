// Qué tarjetas de Inicio se ven, en qué orden, cómo se dicen como píldora (la fila compacta mientras
// se conversa) y a qué pestaña conviene ir. Sin DOM, para probarlo con Node.

import { FUNCIONES, type ConfigFunciones, type IdTarjeta } from "./funciones.ts";
import { cuandoEmpieza, cuentaRegresiva, venceEn } from "./formato.ts";

export type Pestana = "brote" | "plata" | "claude" | "equipo";

/** Las tarjetas a la vista, en el orden elegido: con algo que mostrar, de una función prendida y no ocultas. */
export function tarjetasVisibles(config: ConfigFunciones, conDatos: Partial<Record<IdTarjeta, boolean>>): IdTarjeta[] {
  return config.tarjetas.orden.filter((id) => {
    const funcion = FUNCIONES.find((f) => f.tarjeta === id);
    return conDatos[id] === true && (!funcion || config.activas[funcion.id]) && !config.tarjetas.ocultas.includes(id);
  });
}

/** Lo que muestran las tarjetas, para armar sus píldoras. */
export interface DatosPildoras {
  temporizadores: { tipo: "temporizador" | "pomodoro"; fase: "estudio" | "descanso" | null; etiqueta: string | null; finMs: number }[];
  calendario: { titulo: string; inicioMs: number; finMs: number; todoElDia: boolean } | null;
  aula: { titulo: string; entregaMs: number } | null;
  musica: { cancion: string | null; app: string; sonando: boolean } | null;
  descargas: { enCurso: number; listas: number };
  claude: { sesiones: number; pideProyecto: string | null };
}

/** "🍅 18:20", "📅 en 25 min", "📚 mañana 23:59", "♪ Demons"… (`null` si esa tarjeta no tiene nada). */
export function textoPildora(id: IdTarjeta, datos: DatosPildoras, ahoraMs: number): { texto: string; titulo: string } | null {
  switch (id) {
    case "temporizadores": {
      const principal = datos.temporizadores.find((t) => t.tipo === "pomodoro") ?? datos.temporizadores[0];
      if (!principal) return null;
      const ic = principal.tipo === "temporizador" ? "⏰" : principal.fase === "descanso" ? "☕" : "🍅";
      const tiempo = cuentaRegresiva(principal.finMs - ahoraMs);
      return { texto: `${ic} ${tiempo}`, titulo: principal.etiqueta ? `${principal.etiqueta}: ${tiempo}` : tiempo };
    }
    case "calendario": {
      const e = datos.calendario;
      if (!e) return null;
      const cuando = cuandoEmpieza(e, ahoraMs);
      return { texto: `📅 ${cuando}`, titulo: `${e.titulo} · ${cuando}` };
    }
    case "aula": {
      const e = datos.aula;
      if (!e) return null;
      const cuando = venceEn(e.entregaMs, ahoraMs);
      return { texto: `📚 ${cuando}`, titulo: `${e.titulo} · ${cuando}` };
    }
    case "musica": {
      const m = datos.musica;
      if (!m) return null;
      const nombre = m.cancion ?? m.app;
      return { texto: `${m.sonando ? "♪" : "⏸"} ${nombre}`, titulo: `${nombre} (${m.app})` };
    }
    case "descargas": {
      const { enCurso, listas } = datos.descargas;
      if (enCurso + listas === 0) return null;
      return enCurso > 0 ? { texto: "📥 Descargando", titulo: `${enCurso} en curso` } : { texto: "📥 Lista ✓", titulo: "Descarga lista" };
    }
    case "claude": {
      const { sesiones, pideProyecto } = datos.claude;
      if (sesiones === 0 && !pideProyecto) return null;
      if (pideProyecto) return { texto: "⌨ pide permiso", titulo: `${pideProyecto} pide permiso` };
      return { texto: `⌨ ${sesiones === 1 ? "1 sesión" : `${sesiones} sesiones`}`, titulo: "Claude Code" };
    }
  }
}

/**
 * Adónde vuelve la isla tras un rato cerrada: a Brote si hay algo de la conversación pendiente, a
 * Claude si una sesión de Claude Code pide permiso (y se puede responder), si no a Brote.
 */
export function pestanaSugerida(estado: { conversacionPendiente: boolean; permisoClaude: boolean }): Pestana {
  if (estado.conversacionPendiente) return "brote";
  return estado.permisoClaude ? "claude" : "brote";
}
