// El motor de comandos: prueba las plantillas en orden y, si una calza y se puede
// interpretar, hace lo pedido y arma la respuesta. Si ninguna sirve, devuelve `null` y el
// pedido sigue hacia el agente (con IA).

import { NOMBRES_DE_CATEGORIA, categoriaDe, type Categoria } from "./categorias.ts";
import type { Gastos } from "./gastos.ts";
import { leerMonto } from "./montos.ts";
import { FORMAS_DE_PERIODO, fechaCorta, rangoDe, type Periodo } from "./periodos.ts";
import { PLANTILLAS_BASE, coincidir, type Coincidencia, type Intencion, type Plantilla } from "./plantillas.ts";
import { capitalizar, formatearMonto, normalizar } from "./texto.ts";

export interface Resultado {
  intencion: Intencion;
  /** La plantilla que lo resolvió. */
  plantilla: string;
  /** La respuesta para mostrar en la burbuja. */
  texto: string;
}

/** Lo que el motor entendió de una frase, antes de hacer nada. */
export type Accion =
  | { intencion: "registrar-gasto"; monto: number; categoria: Categoria; descripcion: string | null }
  | { intencion: "consultar-gastos"; periodo: Periodo; categoria?: Categoria }
  | { intencion: "ultimos-gastos" }
  | { intencion: "borrar-ultimo-gasto" }
  | { intencion: "ver-memoria" };

/** Cuántos gastos muestra "mis últimos gastos". */
const ULTIMOS = 5;
/** Periodos ya terminados: "ayer gastaste", no "ayer llevas". */
const PASADOS = new Set<Periodo>(["ayer", "la semana pasada", "el mes pasado"]);

/** Lo que significa una frase según una plantilla, o `null` si no calza o no se puede interpretar. */
export function interpretarCon(plantilla: Plantilla, texto: string): Accion | null {
  const coincidencia = coincidir(plantilla, texto);
  return coincidencia ? interpretar(plantilla.intencion, coincidencia) : null;
}

function interpretar(intencion: Intencion, { ranuras, originales }: Coincidencia): Accion | null {
  switch (intencion) {
    case "registrar-gasto": {
      const monto = ranuras.monto === undefined ? null : leerMonto(ranuras.monto);
      if (monto === null) return null;
      const descripcion = originales.cosa ? sinArticulo(originales.cosa.trim()) || null : null;
      const categoria = ranuras.cosa ? categoriaDe(normalizar(sinArticulo(ranuras.cosa))) : "otros";
      return { intencion, monto, categoria, descripcion };
    }
    case "consultar-gastos": {
      const periodo: Periodo | undefined = ranuras.periodo ? FORMAS_DE_PERIODO[ranuras.periodo] : "este mes";
      const categoria = ranuras.categoria ? NOMBRES_DE_CATEGORIA[ranuras.categoria] : undefined;
      if (!periodo || (ranuras.categoria && !categoria)) return null;
      return categoria ? { intencion, periodo, categoria } : { intencion, periodo };
    }
    case "ultimos-gastos":
    case "borrar-ultimo-gasto":
    case "ver-memoria":
      return { intencion };
  }
}

export class Motor {
  private readonly gastos: Gastos;
  private readonly plantillas: () => Plantilla[];
  private readonly reloj: () => Date;

  /** `plantillas` puede ser una función, para incluir las aprendidas que se activen después. */
  constructor(gastos: Gastos, opciones: { plantillas?: Plantilla[] | (() => Plantilla[]); reloj?: () => Date } = {}) {
    this.gastos = gastos;
    const plantillas = opciones.plantillas ?? PLANTILLAS_BASE;
    this.plantillas = typeof plantillas === "function" ? plantillas : () => plantillas;
    this.reloj = opciones.reloj ?? (() => new Date());
  }

  /** Qué haría el motor con una frase, sin hacerlo. */
  entender(texto: string): { plantilla: Plantilla; accion: Accion } | null {
    for (const plantilla of this.plantillas()) {
      const accion = interpretarCon(plantilla, texto);
      if (accion) return { plantilla, accion };
    }
    return null;
  }

  resolver(texto: string): Resultado | null {
    const entendido = this.entender(texto);
    if (!entendido) return null;
    const { plantilla, accion } = entendido;
    return { intencion: accion.intencion, plantilla: plantilla.id, texto: this.ejecutar(accion) };
  }

  private ejecutar(accion: Accion): string {
    switch (accion.intencion) {
      case "registrar-gasto":
        return this.registrar(accion.monto, accion.categoria, accion.descripcion);
      case "consultar-gastos":
        return this.consultar(accion.periodo, accion.categoria);
      case "ultimos-gastos":
        return this.listarUltimos();
      case "borrar-ultimo-gasto":
        return this.borrarUltimo();
      case "ver-memoria":
        // La isla abre el panel "Lo que sé de ti" al ver esta intención.
        return "Te muestro todo lo que sé de ti 🌱";
    }
  }

  private registrar(monto: number, categoria: Categoria, descripcion: string | null): string {
    const ahora = this.reloj();
    this.gastos.agregar({ monto, categoria, descripcion, fecha: ahora });
    const mes = this.gastos.total(rangoDe("este mes", ahora));
    const que = descripcion ? ` en ${descripcion}` : "";
    return `Anotado: ${formatearMonto(monto)}${que} (${categoria}). Este mes llevas ${formatearMonto(mes.total)}.`;
  }

  private consultar(periodo: Periodo, categoria?: Categoria): string {
    const { total, cantidad } = this.gastos.total(rangoDe(periodo, this.reloj()), categoria);
    const enCategoria = categoria ? ` en ${categoria}` : "";
    if (cantidad === 0) return `${capitalizar(periodo)} no tienes gastos anotados${enCategoria}.`;
    const verbo = PASADOS.has(periodo) ? "gastaste" : "llevas";
    const gastos = cantidad === 1 ? "1 gasto" : `${cantidad} gastos`;
    return `${capitalizar(periodo)} ${verbo} ${formatearMonto(total)}${enCategoria} (${gastos}).`;
  }

  private listarUltimos(): string {
    const ultimos = this.gastos.ultimos(ULTIMOS);
    if (ultimos.length === 0) return "Todavía no tienes gastos anotados.";
    const ahora = this.reloj();
    const lineas = ultimos.map((gasto) => {
      const que = gasto.descripcion ?? gasto.categoria;
      return `• ${formatearMonto(gasto.monto)} · ${que} (${fechaCorta(gasto.fecha, ahora)})`;
    });
    return `Tus últimos gastos:\n${lineas.join("\n")}`;
  }

  private borrarUltimo(): string {
    const borrado = this.gastos.borrarUltimo();
    if (!borrado) return "No tienes gastos anotados.";
    const que = borrado.descripcion ? ` en ${borrado.descripcion}` : "";
    return `Listo, borré el último gasto: ${formatearMonto(borrado.monto)}${que}.`;
  }
}

/** "un café" → "café", "el almuerzo" → "almuerzo". */
function sinArticulo(texto: string): string {
  return texto.replace(/^(un|una|unos|unas|el|la|los|las)\s+/i, "");
}
