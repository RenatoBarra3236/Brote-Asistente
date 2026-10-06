// La pestaña Agenda: cómo se dice lo que arma el motor (packages/motor/src/agenda.ts) y qué se explica
// cuando no hay nada que mostrar. Sin DOM, para probarlo con Node.

import type { DiaAgenda, ItemAgenda } from "../../../../packages/motor/src/agenda.ts";
import { SEMANAS_ADELANTE, cargaDeLaSemana, lunesDe, type DiaCarga, type NivelCarga, type PuntoDia, type SemanaCarga } from "../../../../packages/motor/src/agenda-carga.ts";

export type { DiaAgenda, ItemAgenda, DiaCarga, NivelCarga, PuntoDia, SemanaCarga };
export { SEMANAS_ADELANTE, cargaDeLaSemana, lunesDe };

/** Cuántos días muestra la lista: todo lo que lee el puente (los mismos que alcanza la vista semanal). */
export const DIAS_LISTA = 35;

/** Los días de la lista: solo los próximos `DIAS_LISTA` (la vista semanal usa el resto). */
export function diasDeLaLista(dias: readonly DiaAgenda[], ahoraMs: number): DiaAgenda[] {
  const hoy = new Date(ahoraMs);
  const tope = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + DIAS_LISTA).getTime();
  return dias.filter((d) => d.diaMs < tope);
}

export type VistaAgenda = "lista" | "semana";

/** Lo guardado en `localStorage`: cualquier cosa rara vuelve a la lista. */
export function leerVista(texto: string | null | undefined): VistaAgenda {
  return texto === "semana" ? "semana" : "lista";
}

/** El lunes de la semana `desplazamiento` (0 = esta) semanas adelante. */
export function inicioDeSemana(ahoraMs: number, desplazamiento: number): number {
  const lunes = new Date(lunesDe(ahoraMs));
  return new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + desplazamiento * 7).getTime();
}

/** Los desplazamientos que se pueden ver: esta semana y hasta `SEMANAS_ADELANTE` más. */
export function desplazamientoValido(n: number): number {
  return Math.min(SEMANAS_ADELANTE, Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0)));
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "Esta semana · 12–18 oct", "Próxima semana · 19–25 oct", "26 oct – 1 nov". */
export function tituloDeSemana(desdeMs: number, desplazamiento: number): string {
  const a = new Date(desdeMs);
  const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6);
  const rango = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${MESES_CORTOS[b.getMonth()]}` : `${a.getDate()} ${MESES_CORTOS[a.getMonth()]} – ${b.getDate()} ${MESES_CORTOS[b.getMonth()]}`;
  if (desplazamiento === 0) return `Esta semana · ${rango}`;
  if (desplazamiento === 1) return `Próxima semana · ${rango}`;
  return rango;
}

const LETRAS = ["D", "L", "M", "M", "J", "V", "S"];
export function letraDelDia(diaMs: number): string {
  return LETRAS[new Date(diaMs).getDay()];
}

const NOMBRES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const NIVELES: Record<NivelCarga, string> = { 0: "sin nada", 1: "liviano", 2: "cargado", 3: "muy cargado" };

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Los puntos de color de un día: lo fuerte primero, como mucho `max`, y cuántos quedaron fuera. */
export function puntosVisibles(puntos: readonly PuntoDia[], max = 4): { puntos: PuntoDia[]; resto: number } {
  const ordenados = [...puntos].sort((a, b) => Number(b.fuerte) - Number(a.fuerte));
  return { puntos: ordenados.slice(0, max), resto: Math.max(0, ordenados.length - max) };
}

/** "1 prueba y 2 entregas" (lo que pesa en «semana pesada»). */
export function textoFuertes(dias: readonly DiaCarga[]): string {
  const pruebas = dias.reduce((t, d) => t + d.fuertes.filter((f) => f.tipo === "prueba").length, 0);
  const entregas = dias.reduce((t, d) => t + d.fuertes.filter((f) => f.tipo === "entrega").length, 0);
  const partes = [pruebas > 0 ? plural(pruebas, "prueba", "pruebas") : null, entregas > 0 ? plural(entregas, "entrega", "entregas") : null].filter(Boolean);
  return partes.join(" y ");
}

/** La línea bajo la grilla: «🔥 Semana pesada: 1 prueba y 1 entrega», o cuántas cosas hay. */
export function textoDeLaSemana(semana: SemanaCarga): { texto: string; pesada: boolean } {
  if (semana.pesada) return { texto: `🔥 Semana pesada: ${textoFuertes(semana.dias)}`, pesada: true };
  if (semana.cantidad === 0) return { texto: "Semana libre: nada agendado", pesada: false };
  const fuertes = textoFuertes(semana.dias);
  return { texto: `${plural(semana.cantidad, "cosa agendada", "cosas agendadas")}${fuertes ? ` · ${fuertes}` : ""}`, pesada: false };
}

/** Lo que dice el título de una columna: «miércoles 14 oct: muy cargado · 1 prueba». */
export function descripcionDelDia(dia: DiaCarga): string {
  const d = new Date(dia.diaMs);
  const cabeza = `${NOMBRES[d.getDay()]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
  if (dia.pasado) return `${cabeza}: ya pasó`;
  const fuertes = textoFuertes([dia]);
  return `${cabeza}: ${NIVELES[dia.nivel]}${dia.puntos.length > 0 ? ` · ${plural(dia.puntos.length, "cosa", "cosas")}` : ""}${fuertes ? ` · ${fuertes}` : ""}`;
}

/** El día que se abre de partida: hoy si cae en la semana; si no, el primero con algo (o el lunes). */
export function diaDeInicio(semana: SemanaCarga): number {
  return (semana.dias.find((d) => d.hoy) ?? semana.dias.find((d) => d.puntos.length > 0) ?? semana.dias[0]).diaMs;
}

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
  return { titulo: `Nada en los próximos ${DIAS_LISTA} días`, texto: "Día libre. Puedes agendar algo con «agenda X a las 16:30».", boton: null };
}
