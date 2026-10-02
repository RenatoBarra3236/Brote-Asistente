// El motor que aprende (paso 7). Cuando una frase llega al agente pero era un comando, el
// agente propone una plantilla; aquí se revisa que sirva y no sea peligrosa antes de
// guardarla como propuesta. Solo se usa cuando el usuario la acepta en la isla.

import type { Gastos, PlantillaGuardada } from "./gastos.ts";
import { interpretarCon, type Motor } from "./motor.ts";
import { leerMonto } from "./montos.ts";
import { compilar, type Intencion } from "./plantillas.ts";
import { normalizar } from "./texto.ts";

const INTENCIONES: readonly Intencion[] = ["registrar-gasto", "consultar-gastos", "ultimos-gastos", "borrar-ultimo-gasto"];

/** Cuántas plantillas aprendidas se aceptan como máximo (para que el motor siga siendo rápido). */
const MAXIMO_APRENDIDAS = 200;

/**
 * Frases que nunca deben caer en una plantilla aprendida: si una propuesta calza con alguna,
 * es demasiado general (por ejemplo "{cosa} {monto}" o "{cosa}").
 */
const NO_SON_COMANDOS = [
  "hola",
  "hola como andas",
  "gracias",
  "que hora es",
  "lee el archivo user.md y resumelo",
  "ejecuta el comando date",
  "ayudame con mi tarea de calculo",
  "explicame la fotosintesis en 5 lineas",
  "cuanto es 2 mas 2",
  "recuerdame estudiar manana a las 5",
  "que tiempo hace hoy",
  "escribe un correo para mi profe",
  "cuanto cuesta un pasaje a valparaiso",
  "gaste la tarde estudiando",
];

export interface Propuesta {
  patron: string;
  intencion: string;
  /** La frase del usuario que la originó. */
  ejemplo: string;
}

export type Revision = { ok: true; propuesta: PlantillaGuardada } | { ok: false; motivo: string };

/** Revisa una propuesta del agente y, si sirve, la guarda como pendiente de confirmación. */
export function proponerPlantilla(gastos: Gastos, motor: Motor, propuesta: Propuesta, ahora: Date): Revision {
  const patron = propuesta.patron.trim().replace(/\s+/g, " ");
  const ejemplo = propuesta.ejemplo.trim();
  const intencion = propuesta.intencion as Intencion;
  const no = (motivo: string): Revision => ({ ok: false, motivo });

  if (!INTENCIONES.includes(intencion)) return no(`«intencion» debe ser una de: ${INTENCIONES.join(", ")}`);
  if (!ejemplo) return no("Falta la frase de ejemplo");
  try {
    compilar(patron);
  } catch (error) {
    return no((error as Error).message);
  }
  // Al menos una palabra fija de 3 letras o más: "{cosa} {monto}" lo capturaría todo.
  const fijas = patron.replace(/\{[a-z]+\}/g, " ").match(/[a-z0-9ñ]{3,}/g);
  if (!fijas) return no("La plantilla necesita al menos una palabra fija de 3 letras o más");

  const plantilla = { id: "propuesta", patron, intencion, origen: "aprendida" as const };
  if (!interpretarCon(plantilla, ejemplo)) {
    return no("La frase de ejemplo no calza con la plantilla o no se puede interpretar (¿el monto o el periodo?)");
  }
  if (motor.entender(ejemplo)) return no("Esa frase ya la entiendo sin IA; no hace falta una plantilla");
  const general = NO_SON_COMANDOS.find((frase) => compilar(patron).test(frase));
  if (general) return no(`La plantilla es demasiado general: también calza con «${general}»`);

  const estado = gastos.estadoDePlantilla(patron);
  if (estado === "activa") return no("Esa plantilla ya está aprendida");
  if (estado === "rechazada") return no("El usuario ya rechazó esa plantilla; no la vuelvas a proponer");
  if (gastos.plantillasActivas().length >= MAXIMO_APRENDIDAS) return no("Ya hay demasiadas plantillas aprendidas");

  return { ok: true, propuesta: gastos.proponerPlantilla({ patron, intencion, ejemplo }, ahora) };
}

/** Si dos frases son la misma (para comprobar que la propuesta viene del último mensaje). */
export function mismaFrase(a: string, b: string): boolean {
  return normalizar(a) === normalizar(b);
}

/** Qué hace una intención, en palabras para la isla. */
export function describirIntencion(intencion: Intencion): string {
  switch (intencion) {
    case "registrar-gasto":
      return "anotar un gasto";
    case "consultar-gastos":
      return "consultar tus gastos";
    case "ultimos-gastos":
      return "mostrar tus últimos gastos";
    case "borrar-ultimo-gasto":
      return "borrar el último gasto";
    case "ver-memoria":
      return "mostrar lo que sé de ti";
  }
}

/** Porcentaje de pedidos resueltos sin IA, para mostrar el progreso. */
export function porcentajeSinIA(gastos: Gastos): number {
  const { motor, agente } = gastos.resumenUso();
  return motor + agente === 0 ? 0 : Math.round((100 * motor) / (motor + agente));
}

/** Artículos que pueden ir antes de la descripción: quedan dentro de {cosa} ("un libro"). */
const ARTICULOS = new Set(["un", "una", "unos", "unas", "el", "la", "los", "las"]);
/** Palabras que una plantilla puede tener tal cual (el formato no admite otros signos). */
const PALABRA_VALIDA = /^[a-z0-9ñ]+$/;

/**
 * Deduce una plantilla a partir de cómo el agente resolvió una frase: si llamó a
 * `gastos_anotar` con `monto` y `descripcion`, se buscan en la frase y se reemplazan por
 * {monto} y {cosa}; el resto queda como palabras fijas. "paque 2 lucas de jugo" con
 * { monto: 2000, descripcion: "jugo" } → "paque {monto} de {cosa}".
 * Devuelve `null` si no se encuentran o si queda algo que el formato no admite.
 */
export function deducirPlantilla(frase: string, anotacion: { monto: number; descripcion?: string | null }): string | null {
  const palabras = normalizar(frase).split(" ");

  // El monto: el tramo más largo (hasta 5 palabras) que se lee como ese monto.
  let monto: [number, number] | null = null;
  for (let largo = Math.min(5, palabras.length); largo >= 1 && !monto; largo--) {
    for (let i = 0; i + largo <= palabras.length; i++) {
      if (leerMonto(palabras.slice(i, i + largo).join(" ")) === anotacion.monto) {
        monto = [i, i + largo];
        break;
      }
    }
  }
  if (!monto) return null;

  // La descripción, fuera del monto, con su artículo si lo tiene.
  let cosa: [number, number] | null = null;
  const descripcion = anotacion.descripcion ? normalizar(anotacion.descripcion).split(" ") : [];
  if (descripcion.length > 0) {
    for (let i = 0; i + descripcion.length <= palabras.length; i++) {
      const fin = i + descripcion.length;
      const solapa = i < monto[1] && fin > monto[0];
      if (!solapa && descripcion.every((palabra, j) => palabras[i + j] === palabra)) {
        cosa = [i > 0 && ARTICULOS.has(palabras[i - 1]) && i - 1 !== monto[1] - 1 ? i - 1 : i, fin];
        break;
      }
    }
    if (!cosa) return null;
  }

  const partes: string[] = [];
  for (let i = 0; i < palabras.length; i++) {
    if (i === monto[0]) {
      partes.push("{monto}");
      i = monto[1] - 1;
    } else if (cosa && i === cosa[0]) {
      partes.push("{cosa}");
      i = cosa[1] - 1;
    } else if (PALABRA_VALIDA.test(palabras[i])) {
      partes.push(palabras[i]);
    } else {
      return null;
    }
  }
  return partes.join(" ");
}
