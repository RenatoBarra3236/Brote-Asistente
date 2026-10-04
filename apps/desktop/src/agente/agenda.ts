// La pestaña Agenda: cómo se dice lo que arma el motor (packages/motor/src/agenda.ts) y qué se explica
// cuando no hay nada que mostrar. Sin DOM, para probarlo con Node.

import type { DiaAgenda, ItemAgenda } from "../../../../packages/motor/src/agenda.ts";

export type { DiaAgenda, ItemAgenda };

/** Lo que responde el puente al pedido `agenda-estado`. */
export interface EstadoAgenda {
  dias: DiaAgenda[];
  fuentes: {
    calendario: boolean;
    aula: boolean;
    temporizadores: boolean;
    /** Permiso de Calendarios de macOS: null = no se ha leído; 3 = completo; 0 = sin decidir; 2 = negado; 4 = solo escritura. */
    permisoMac: number | null;
    mac: boolean;
    ical: boolean;
  };
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function hora(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "Hoy · lun 5 oct", "Mañana · mar 6 oct", "mié 7 oct". */
export function tituloDelDia(diaMs: number, ahoraMs: number): string {
  const d = new Date(diaMs);
  const corto = `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
  const hoy = new Date(ahoraMs);
  const dias = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) / 86_400_000);
  return dias === 0 ? `Hoy · ${corto}` : dias === 1 ? `Mañana · ${corto}` : corto;
}

/** La hora de una fila: "08:30–10:00", "23:59", "todo el día". */
export function horaDelItem(item: ItemAgenda): string {
  if (item.todoElDia) return "todo el día";
  if (item.finMs > item.inicioMs) return `${hora(item.inicioMs)}–${hora(item.finMs)}`;
  return hora(item.inicioMs);
}

export type EstadoItem = "pasado" | "ahora" | "proximo" | "urgente";

/** Cómo se pinta una fila: lo que ya pasó se atenúa, lo que está pasando se resalta, una entrega a menos de 24 h es urgente. */
export function estadoDelItem(item: ItemAgenda, ahoraMs: number): EstadoItem {
  if (item.tipo === "entrega") return item.inicioMs - ahoraMs <= 24 * 3_600_000 ? "urgente" : "proximo";
  if (item.todoElDia) return "proximo";
  const fin = Math.max(item.finMs, item.inicioMs);
  if (fin <= ahoraMs) return "pasado";
  return item.inicioMs <= ahoraMs ? "ahora" : "proximo";
}

export interface ExplicacionAgenda {
  titulo: string;
  texto: string;
  /** Qué botón mostrar: Configurar Brote o los ajustes de Privacidad de macOS. */
  boton: { texto: string; accion: "configurar" | "privacidad-calendarios" } | null;
}

/**
 * Qué decirle al usuario cuando la agenda no trae nada: distingue "no hay nada en 14 días" de "no hay
 * ningún calendario conectado" y, en macOS, de por qué falta el permiso (con `tauri dev` el permiso
 * es de la Terminal, no de Brote).
 */
export function explicarAgenda(estado: EstadoAgenda, opciones: { desarrollo: boolean }): ExplicacionAgenda {
  const f = estado.fuentes;
  const hayFuente = (f.calendario && (f.ical || f.permisoMac === 3)) || f.aula || f.temporizadores;
  if (f.calendario && f.mac && f.permisoMac !== 3 && !f.ical) {
    if (opciones.desarrollo) {
      return {
        titulo: "Estás en modo desarrollo",
        texto: "Con `tauri dev`, macOS le da el permiso de Calendarios a la Terminal, no a Brote. Usa la dirección iCal en Configurar Brote o la app empaquetada (Brote.app).",
        boton: { texto: "Configurar Brote", accion: "configurar" },
      };
    }
    if (f.permisoMac === null || f.permisoMac === 0) {
      return {
        titulo: "Falta conectar tu calendario",
        texto: "Brote aún no te pidió permiso para el Calendario del Mac. En Configurar Brote → Funciones → Calendario, usa «Calendario del Mac» (o pega tu dirección iCal).",
        boton: { texto: "Configurar Brote", accion: "configurar" },
      };
    }
    return {
      titulo: "Brote no tiene permiso de Calendarios",
      texto: "Ajustes del Sistema → Privacidad y seguridad → Calendarios: activa Brote con acceso completo. También puedes pegar tu dirección iCal en Configurar Brote.",
      boton: { texto: "Abrir Privacidad", accion: "privacidad-calendarios" },
    };
  }
  if (f.calendario && !f.mac && !f.ical) {
    return {
      titulo: "Falta conectar tu calendario",
      texto: "Pega la dirección secreta iCal de tu calendario (por ejemplo la de Google Calendar) en Configurar Brote → Funciones → Calendario.",
      boton: { texto: "Configurar Brote", accion: "configurar" },
    };
  }
  if (!hayFuente) {
    return {
      titulo: "La agenda está apagada",
      texto: "Prende Calendario, Aula o Temporizadores en Configurar Brote → Funciones para verlos aquí.",
      boton: { texto: "Configurar Brote", accion: "configurar" },
    };
  }
  return { titulo: "Nada en los próximos 14 días", texto: "Día libre. Puedes agendar algo con «agenda X a las 16:30».", boton: null };
}
