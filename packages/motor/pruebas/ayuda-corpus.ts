// Armado del motor y la medición del corpus de frases (corpus.test.ts y el script de medir.ts).
import { Ahorro } from "../src/ahorro.ts";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { Notas } from "../src/notas.ts";
import { Ramos } from "../src/ramos.ts";
import { Temporizadores } from "../src/temporizadores.ts";
import { CASOS, type Caso, type Tipo } from "./corpus-frases.ts";

export function motorDeCorpus(): Motor {
  const gastos = new Gastos(":memory:");
  const ramos = new Ramos(gastos);
  const ahora = Date.now();
  ramos.crear({ nombre: "Cálculo" }, ahora);
  ramos.crear({ nombre: "Física" }, ahora);
  ramos.crear({ nombre: "Álgebra" }, ahora);
  ramos.crear({ nombre: "Programación" }, ahora);
  const ahorro = new Ahorro(gastos);
  ahorro.crear({ nombre: "viaje", monto: 300000 }, ahora);
  return new Motor(gastos, { reloj: () => new Date(2026, 9, 6, 13, 0), ramos, notas: new Notas(gastos, ramos), temporizadores: new Temporizadores(gastos), ahorro });
}

export interface Medida {
  total: number;
  bien: number;
}
export interface Informe {
  porTipo: Record<string, Medida>;
  porArea: Record<string, Medida>;
  /** Frases de control que activaron algo (falsos positivos). */
  falsosPositivos: string[];
  /** Frases que debían entenderse y no (o con otra intención). */
  fallas: string[];
}

/** `entender` devuelve la intención que resolvió una frase, o `null` si no la entiende. */
export function medir(entender: (frase: string) => string | null, casos: Caso[] = CASOS): Informe {
  const porTipo: Record<string, Medida> = {};
  const porArea: Record<string, Medida> = {};
  const falsosPositivos: string[] = [];
  const fallas: string[] = [];
  for (const c of casos) {
    let intencion: string | null = null;
    try {
      intencion = entender(c.frase);
    } catch {
      intencion = null;
    }
    const bien = c.intencion === null ? intencion === null : intencion === c.intencion;
    if (c.tipo === "control") {
      if (intencion !== null) falsosPositivos.push(`${c.area}: ${c.frase} → ${intencion}`);
    } else if (!bien) fallas.push(`${c.area}/${c.tipo}: ${c.frase} → ${intencion ?? "—"} (esperaba ${c.intencion})`);
    for (const [mapa, clave] of [[porTipo, c.tipo], [porArea, c.area]] as const) {
      (mapa[clave] ??= { total: 0, bien: 0 }).total++;
      if (bien) mapa[clave].bien++;
    }
  }
  return { porTipo, porArea, falsosPositivos, fallas };
}

export const porcentaje = (m: Medida): number => (m.total === 0 ? 100 : (m.bien / m.total) * 100);

/** Cuántas de las frases que NO son de control se entienden bien, por área (sin contar el control: el control mide otra cosa). */
export function porAreaSinControl(casos: Caso[], entender: (frase: string) => string | null): Record<string, Medida> {
  return medir(entender, casos.filter((c) => c.tipo !== "control")).porArea;
}

export function texto(informe: Informe): string {
  const fila = ([k, v]: [string, Medida]) => `${k} ${v.bien}/${v.total} (${Math.round(porcentaje(v))}%)`;
  return [
    "POR TIPO: " + Object.entries(informe.porTipo).map(fila).join(" · "),
    "POR ÁREA: " + Object.entries(informe.porArea).map(fila).join(" · "),
    `FALSOS POSITIVOS: ${informe.falsosPositivos.length}`,
  ].join("\n");
}
