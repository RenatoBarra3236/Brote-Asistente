// La lógica de "Configurar Brote" sin DOM (para probarla con Node): qué pasos son técnicos y van en
// la barra de "Preparar", cuáles necesitan que el usuario haga algo, el orden de los arreglos
// automáticos y qué se sabe de cada permiso de macOS.

import { FUNCIONES, type Funcion, type IdFuncion, type PermisoMac } from "./funciones.ts";

export type EstadoPaso = "ok" | "falta" | "opcional";

export type Accion =
  | { tipo: "automatica"; etiqueta: string; requiereConsentimiento?: boolean; textoConsentimiento?: string }
  | { tipo: "terminal"; etiqueta: string; terminal: string }
  | { tipo: "enlace"; etiqueta: string; enlace: string }
  | { tipo: "ical"; etiqueta: string; configurada: boolean }
  | { tipo: "aula"; etiqueta: string; configurada: boolean; plataforma: "canvas" | "moodle" | null };

/** Un paso de la revisión (packages/adapter/src/configurar.ts, o Rust si falta Node). */
export interface Paso {
  id: string;
  titulo: string;
  estado: EstadoPaso;
  detalle: string;
  accion?: Accion;
  /** Otra forma de hacerlo (por ejemplo, descargar Node si no se quiere usar Homebrew). */
  alternativa?: Accion | null;
  quitar?: { paso: string; etiqueta: string };
}

/** Los pasos técnicos: van todos juntos en la barra de "Preparar Brote" (y plegados en "Detalles"). */
export const TECNICOS = ["node", "openclaw", "claude", "agente", "modelo", "gateway", "identidad", "permisos", "skill", "mcp", "memoria"] as const;

/** Qué se ve en la barra mientras se arregla cada paso. */
export const TRABAJANDO_EN: Record<string, string> = {
  openclaw: "Instalando OpenClaw (el cerebro de Brote)…",
  agente: "Configurando OpenClaw…",
  modelo: "Eligiendo el modelo…",
  gateway: "Encendiendo OpenClaw…",
  identidad: "Dándole su personalidad a Brote…",
  permisos: "Ajustando los permisos…",
  skill: "Enseñándole tus gastos y a delegar en su equipo…",
  mcp: "Conectando tus gastos…",
  memoria: "Ajustando la memoria…",
};

export function esTecnico(paso: Paso): boolean {
  return (TECNICOS as readonly string[]).includes(paso.id);
}

/** El paso necesita al usuario: instalar algo, iniciar sesión o aceptar el consentimiento. */
export function necesitaAlUsuario(paso: Paso, consentimientos: ReadonlySet<string>): boolean {
  if (paso.estado !== "falta" || !paso.accion) return false;
  if (paso.accion.tipo === "enlace" || paso.accion.tipo === "terminal") return true;
  return paso.accion.tipo === "automatica" && paso.accion.requiereConsentimiento === true && !consentimientos.has(paso.id);
}

/** El próximo paso técnico que el script puede arreglar solo (con el consentimiento, si lo pide). */
export function siguienteAutomatico(pasos: readonly Paso[], consentimientos: ReadonlySet<string>): Paso | undefined {
  return pasos.find(
    (p) =>
      esTecnico(p) &&
      p.estado === "falta" &&
      p.accion?.tipo === "automatica" &&
      (!p.accion.requiereConsentimiento || consentimientos.has(p.id)),
  );
}

export interface Preparacion {
  total: number;
  listos: number;
  /** Los pasos técnicos que faltan. */
  faltan: Paso[];
  /** Los que el usuario tiene que hacer él (tarjetas a la vista). */
  delUsuario: Paso[];
  /** Si "Preparar Brote" tiene algo que hacer solo. */
  hayAutomatico: boolean;
  listo: boolean;
}

/** El resumen de los pasos técnicos para la barra de progreso. */
export function preparacion(pasos: readonly Paso[], consentimientos: ReadonlySet<string>): Preparacion {
  const tecnicos = pasos.filter(esTecnico);
  // Sin Node, Rust solo devuelve ese paso: el resto cuenta como pendiente.
  const total = Math.max(TECNICOS.length, tecnicos.length);
  const listos = tecnicos.filter((p) => p.estado === "ok").length;
  const faltan = tecnicos.filter((p) => p.estado === "falta");
  return {
    total,
    listos,
    faltan,
    delUsuario: faltan.filter((p) => necesitaAlUsuario(p, consentimientos) || (p.accion?.tipo === "automatica" && p.accion.requiereConsentimiento)),
    hayAutomatico: siguienteAutomatico(pasos, consentimientos) !== undefined,
    listo: tecnicos.length >= TECNICOS.length && faltan.length === 0,
  };
}

/**
 * Si abrir el asistente de primera vez: falta algo técnico y todavía no se eligieron funciones (quien
 * ya usaba Brote y tiene un problema va directo a Estado, con "Reparar").
 */
export function necesitaAsistente(pasos: readonly Paso[], hayFunciones: boolean): boolean {
  return !hayFunciones && pasos.some((p) => esTecnico(p) && p.estado === "falta");
}

// ---------------------------------------------------------------- permisos de macOS

export type EstadoPermiso = "concedido" | "negado" | "sin-preguntar" | "sin-usar";

/** Lo que el puente sabe de los permisos (pedido `permisos-estado`), solo por lecturas ya hechas. */
export interface LecturaPermisos {
  descargas: "concedido" | "negado" | "sin-usar";
  automatizacion: Record<string, boolean>;
  calendarios: EstadoPermiso;
}

export const PERMISOS: readonly { id: PermisoMac; nombre: string; donde: string; enlace: string }[] = [
  { id: "calendarios", nombre: "Calendarios", donde: "Privacidad y seguridad → Calendarios → Brote", enlace: "privacidad-calendarios" },
  {
    id: "automatizacion",
    nombre: "Automatización (Spotify y Música)",
    donde: "Privacidad y seguridad → Automatización → Brote",
    enlace: "privacidad-automatizacion",
  },
  { id: "descargas", nombre: "Carpeta Descargas", donde: "Privacidad y seguridad → Archivos y carpetas → Brote", enlace: "privacidad-descargas" },
];

export interface FilaPermiso {
  id: PermisoMac;
  nombre: string;
  donde: string;
  enlace: string;
  /** Las funciones prendidas que lo usan. */
  usadoPor: Funcion[];
  estado: EstadoPermiso;
  /**
   * Ninguna función prendida lo usa y pudo haberse dado antes: se explica cómo quitarlo. (Lo que no
   * se usa no se lee, así que "sin usar" puede ser un permiso que quedó dado.)
   */
  sobra: boolean;
  /** Lo usa una función prendida y está negado: hay que darlo. */
  falta: boolean;
}

/** El estado de un permiso a partir de lo que vio el puente (`null`: el puente no respondió). */
export function estadoPermiso(id: PermisoMac, lectura: LecturaPermisos | null): EstadoPermiso {
  if (!lectura) return "sin-usar";
  if (id === "calendarios") return lectura.calendarios;
  if (id === "descargas") return lectura.descargas;
  const apps = Object.values(lectura.automatizacion);
  if (apps.length === 0) return "sin-usar";
  return apps.includes(false) ? "negado" : "concedido";
}

/**
 * El permiso de Calendarios según el paso "Calendario del Mac" de la revisión (lo lee el script sin
 * preguntar nada, aunque la función esté apagada), o `null` si no está ese paso (fuera del Mac).
 */
export function permisoCalendarioDePaso(pasos: readonly Paso[]): EstadoPermiso | null {
  const paso = pasos.find((p) => p.id === "calendario-mac");
  if (!paso) return null;
  if (paso.estado === "ok") return "concedido";
  return paso.accion?.tipo === "enlace" ? "negado" : "sin-preguntar";
}

export function filasPermisos(activas: Record<IdFuncion, boolean>, lectura: LecturaPermisos | null): FilaPermiso[] {
  return PERMISOS.map((p) => {
    const usadoPor = FUNCIONES.filter((f) => f.permiso === p.id && activas[f.id]);
    const estado = estadoPermiso(p.id, lectura);
    const sobra = usadoPor.length === 0 && (estado === "concedido" || estado === "sin-usar");
    return { ...p, usadoPor, estado, sobra, falta: estado === "negado" && usadoPor.length > 0 };
  });
}

/**
 * Las funciones prendidas a las que les falta configurar algo dentro de su tarjeta (el calendario sin
 * ninguna fuente, el aula sin campus, el modo programador sin hooks, el uso del plan sin la statusline,
 * la búsqueda sin su modelo).
 */
export function funcionesSinConfigurar(activas: Record<IdFuncion, boolean>, pasos: readonly Paso[]): Funcion[] {
  const listo = (id: string) => pasos.find((p) => p.id === id)?.estado === "ok";
  const falta: Partial<Record<IdFuncion, boolean>> = {
    calendario: !listo("calendario-mac") && !listo("calendario-ical"),
    aula: !listo("aula"),
    programador: !listo("programador"),
    "uso-del-plan": !listo("statusline"),
    "memoria-local": !listo("memoria-local"),
  };
  return FUNCIONES.filter((f) => activas[f.id] && falta[f.id] === true);
}
