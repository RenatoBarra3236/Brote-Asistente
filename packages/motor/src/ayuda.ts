// Capa E del plan sin IA: lo básico de conversar (saludos, gracias, despedida) y la ayuda por áreas. Puro.
// Cada ejemplo de la ayuda es una frase que el motor entiende tal cual (una prueba lo exige).

import type { IdFuncion } from "./funciones.ts";

export interface AreaDeAyuda {
  id: string;
  titulo: string;
  emoji: string;
  /** La función que tiene que estar prendida para que la ayuda la ofrezca (`null`: siempre). */
  funcion: IdFuncion | null;
  /** Palabras con las que el usuario nombra el área («ayuda con los gastos»). */
  palabras: string[];
  /** Tres frases que se pueden tocar. */
  ejemplos: string[];
}

export const AREAS_DE_AYUDA: readonly AreaDeAyuda[] = [
  { id: "gastos", titulo: "Gastos y presupuesto", emoji: "💸", funcion: "gastos", palabras: ["gasto", "gastos", "plata", "dinero", "presupuesto", "gastar"], ejemplos: ["gasté 5 lucas en almuerzo", "cuánto he gastado esta semana", "mi presupuesto es 200 lucas"] },
  { id: "estudio", titulo: "Estudio y notas", emoji: "📚", funcion: "estudio", palabras: ["estudio", "estudiar", "ramo", "ramos", "nota", "notas", "repaso", "tarjetas"], ejemplos: ["agrega el ramo cálculo", "me saqué 5,5 en el certamen 1 de cálculo", "cómo voy en cálculo"] },
  { id: "agenda", titulo: "Agenda y entregas", emoji: "📅", funcion: "calendario", palabras: ["agenda", "calendario", "clases", "eventos", "entregas", "tareas", "horario"], ejemplos: ["qué tengo hoy", "agenda estudiar cálculo a las 16:30", "qué entregas tengo"] },
  { id: "tiempo", titulo: "Pomodoro y recordatorios", emoji: "🍅", funcion: "temporizadores", palabras: ["pomodoro", "temporizador", "temporizadores", "recordatorio", "recordatorios", "alarma"], ejemplos: ["pomodoro de 30 para cálculo", "recuérdame en 10 minutos sacar la ropa", "cuánto falta"] },
  { id: "ahorro", titulo: "Metas de ahorro", emoji: "🎯", funcion: "gastos", palabras: ["ahorro", "ahorros", "meta", "metas", "ahorrar"], ejemplos: ["quiero juntar 150 lucas para marzo para el viaje", "aparté 20 lucas para el viaje", "cómo van mis metas de ahorro"] },
  { id: "musica", titulo: "Música", emoji: "♪", funcion: "musica", palabras: ["musica", "cancion", "canciones", "spotify"], ejemplos: ["pausa la música", "pon la siguiente canción", "qué canción es esta"] },
  { id: "computador", titulo: "Tu computador", emoji: "💻", funcion: "equipo", palabras: ["computador", "compu", "pc", "bateria", "disco", "descargas"], ejemplos: ["cómo está el computador", "cuánta batería me queda", "mis descargas"] },
  { id: "memoria", titulo: "Lo que sé de ti", emoji: "🧠", funcion: null, palabras: ["memoria", "recuerdos", "privacidad"], ejemplos: ["qué sabes de mí", "mis ramos", "mis últimos gastos"] },
];

/** El área que nombra una frase corta («los gastos» → gastos), o `null`. */
export function areaDeAyuda(tema: string): AreaDeAyuda | null {
  const palabras = tema.split(" ").filter(Boolean);
  if (palabras.length === 0 || palabras.length > 3) return null;
  return AREAS_DE_AYUDA.find((a) => palabras.some((p) => a.palabras.includes(p))) ?? null;
}

export interface TextoDeAyuda {
  texto: string;
  /** Lo que la isla muestra como botones: las áreas (ayuda general) o los ejemplos (de un área). */
  areas: { id: string; titulo: string; emoji: string; frase: string }[];
  ejemplos: string[];
  area: string | null;
}

export function textoDeAyuda(areaId: string | null, activa: (f: IdFuncion) => boolean): TextoDeAyuda {
  const ofrecidas = AREAS_DE_AYUDA.filter((a) => a.funcion === null || activa(a.funcion));
  const area = areaId ? ofrecidas.find((a) => a.id === areaId) ?? null : null;
  if (area) {
    return {
      texto: `${area.emoji} ${area.titulo}: puedes decirme, por ejemplo,\n${area.ejemplos.map((e) => `• ${e}`).join("\n")}\nToca uno para probarlo. Entiendo varias formas de decirlo, y si dudo te pregunto antes de anotar algo 🌱`,
      areas: [],
      ejemplos: area.ejemplos,
      area: area.id,
    };
  }
  return {
    texto: `Esto sé hacer sin IA ⚡ (toca un tema para ver ejemplos):\n${ofrecidas.map((a) => `${a.emoji} ${a.titulo}`).join("\n")}\nEscríbeme como te salga: si no te entiendo, te sugiero qué quisiste decir 🌱`,
    areas: ofrecidas.map((a) => ({ id: a.id, titulo: a.titulo, emoji: a.emoji, frase: `ayuda con ${a.palabras[0]}` })),
    ejemplos: [],
    area: null,
  };
}

const SALUDOS = ["¡Hola! 🌱 ¿Qué hacemos hoy?", "¡Hola! 🌱 Aquí estoy. ¿En qué te ayudo?", "¡Holi! 🌱 Cuéntame, ¿qué necesitas?"];
const GRACIAS = ["¡De nada! 🌱", "¡Para eso estoy! 🌱", "¡Con gusto! 🌱 Aquí sigo para lo que necesites."];
const DESPEDIDAS = ["¡Chao! 🌱 Aquí te espero.", "¡Nos vemos! 🌱 Cuídate.", "¡Hasta luego! 🌱 Que te vaya bien."];

export function respuestaDeCortesia(intencion: "saludo" | "gracias" | "despedida", semilla: number, hora: number, frase: string): string {
  const lista = intencion === "saludo" ? SALUDOS : intencion === "gracias" ? GRACIAS : DESPEDIDAS;
  const base = lista[Math.abs(semilla) % lista.length];
  if (intencion === "despedida" && /dormir|descansar/.test(frase)) return "¡Que descanses! 🌱 Mañana seguimos.";
  if (intencion === "saludo" && /noches/.test(frase)) return "¡Buenas noches! 🌱 ¿Qué necesitas?";
  if (intencion === "saludo" && /tardes/.test(frase)) return "¡Buenas tardes! 🌱 ¿En qué te ayudo?";
  if (intencion === "saludo" && hora >= 22) return "¡Hola! 🌱 Ya es tarde: ¿algo rápido antes de dormir?";
  return base;
}
