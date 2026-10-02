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

/** Cuántos gastos muestra "mis últimos gastos". */
const ULTIMOS = 5;
/** Periodos ya terminados: "ayer gastaste", no "ayer llevas". */
const PASADOS = new Set<Periodo>(["ayer", "la semana pasada", "el mes pasado"]);

export class Motor {
  private readonly gastos: Gastos;
  private readonly plantillas: Plantilla[];
  private readonly reloj: () => Date;

  constructor(gastos: Gastos, opciones: { plantillas?: Plantilla[]; reloj?: () => Date } = {}) {
    this.gastos = gastos;
    this.plantillas = opciones.plantillas ?? PLANTILLAS_BASE;
    this.reloj = opciones.reloj ?? (() => new Date());
  }

  resolver(texto: string): Resultado | null {
    for (const plantilla of this.plantillas) {
      const coincidencia = coincidir(plantilla, texto);
      if (!coincidencia) continue;
      const respuesta = this.ejecutar(plantilla.intencion, coincidencia);
      if (respuesta !== null) return { intencion: plantilla.intencion, plantilla: plantilla.id, texto: respuesta };
    }
    return null;
  }

  /** La respuesta, o `null` si lo capturado no tiene sentido (por ejemplo, un monto que no es monto). */
  private ejecutar(intencion: Intencion, { ranuras, originales }: Coincidencia): string | null {
    switch (intencion) {
      case "registrar-gasto":
        return this.registrar(ranuras.monto, ranuras.cosa, originales.cosa);
      case "consultar-gastos":
        return this.consultar(ranuras.periodo, ranuras.categoria);
      case "ultimos-gastos":
        return this.listarUltimos();
      case "borrar-ultimo-gasto":
        return this.borrarUltimo();
    }
  }

  private registrar(montoTexto?: string, cosa?: string, cosaOriginal?: string): string | null {
    const monto = montoTexto === undefined ? null : leerMonto(montoTexto);
    if (monto === null) return null;
    const descripcion = cosaOriginal ? sinArticulo(cosaOriginal.trim()) : null;
    const categoria = cosa ? categoriaDe(normalizar(sinArticulo(cosa))) : "otros";
    const ahora = this.reloj();
    this.gastos.agregar({ monto, categoria, descripcion, fecha: ahora });

    const mes = this.gastos.total(rangoDe("este mes", ahora));
    const que = descripcion ? ` en ${descripcion}` : "";
    return `Anotado: ${formatearMonto(monto)}${que} (${categoria}). Este mes llevas ${formatearMonto(mes.total)}.`;
  }

  private consultar(periodoTexto?: string, categoriaTexto?: string): string | null {
    const periodo: Periodo = periodoTexto ? FORMAS_DE_PERIODO[periodoTexto] : "este mes";
    const categoria: Categoria | undefined = categoriaTexto ? NOMBRES_DE_CATEGORIA[categoriaTexto] : undefined;
    if (!periodo || (categoriaTexto && !categoria)) return null;

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
