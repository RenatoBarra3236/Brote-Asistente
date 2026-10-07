// Capas C, D y E del plan sin IA, del lado de la isla: los botones que acompañan una respuesta del motor.
//  · «¿Anoto $5.000 en almuerzo?»  [Sí] [No]
//  · «No te entendí. ¿Quisiste decir…?»  [gasté 5 lucas en almuerzo] … [Ver ayuda]
//  · «Esto sé hacer…»  [💸 Gastos y presupuesto] … o tres ejemplos para probar
// Sin DOM, para probarlo con Node. Nada de lo que viene en `datos` se toma por bueno: se revisa la forma.

export type AccionOpcion =
  | { tipo: "confirmar"; frase: string; original: string | null }
  | { tipo: "enviar"; texto: string }
  | { tipo: "rechazar" };

export interface OpcionLocal {
  etiqueta: string;
  accion: AccionOpcion;
  /** El botón principal (el «Sí»). */
  destacada?: boolean;
}

export const TEXTO_RECHAZADO = "Ok, no hice nada. Dime de otra forma lo que necesitas 🌱";
export const MAX_OPCIONES = 6;
export const MAX_ETIQUETA = 70;

const texto = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() !== "" && v.length <= max ? v.trim() : null);
const objeto = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null);

/** Los botones de una respuesta del motor, según su intención y sus datos. */
export function opcionesDe(intencion: string, datos: unknown): OpcionLocal[] {
  const d = objeto(datos);
  if (!d) return [];
  if (intencion === "confirmar") {
    const c = objeto(d.confirmar);
    const frase = texto(c?.frase, 300);
    if (!c || !frase) return [];
    const original = texto(c.original, 200);
    return [
      { etiqueta: "Sí", accion: { tipo: "confirmar", frase, original }, destacada: true },
      { etiqueta: "No", accion: { tipo: "rechazar" } },
    ];
  }
  if (intencion === "elegir-monto") {
    // «¿Cuál es el monto?»: un botón por monto; tocarlo anota ese gasto (nunca se elige uno solo).
    const e = objeto(d.elegirMonto);
    const original = texto(e?.original, 200);
    const salida: OpcionLocal[] = [];
    for (const o of Array.isArray(e?.opciones) ? (e!.opciones as unknown[]) : []) {
      const x = objeto(o);
      const etiqueta = texto(x?.etiqueta, MAX_ETIQUETA);
      const frase = texto(x?.frase, 300);
      if (etiqueta && frase && salida.length < 4) salida.push({ etiqueta, accion: { tipo: "confirmar", frase, original } });
    }
    return salida.length >= 2 ? salida : [];
  }
  if (intencion === "no-entendi") {
    const n = objeto(d.noEntendi);
    const original = texto(n?.original, 200);
    const sugeridas = Array.isArray(n?.sugerencias) ? (n!.sugerencias as unknown[]) : [];
    const salida: OpcionLocal[] = [];
    for (const s of sugeridas) {
      const frase = texto(s, MAX_ETIQUETA);
      if (frase && salida.length < 3) salida.push({ etiqueta: frase, accion: { tipo: "confirmar", frase, original } });
    }
    salida.push({ etiqueta: "Ver ayuda", accion: { tipo: "enviar", texto: "ayuda" } });
    return salida;
  }
  if (intencion === "ayuda") {
    const a = objeto(d.ayuda);
    if (!a) return [];
    const salida: OpcionLocal[] = [];
    for (const area of Array.isArray(a.areas) ? a.areas : []) {
      const o = objeto(area);
      const titulo = texto(o?.titulo, 60);
      const frase = texto(o?.frase, 80);
      if (titulo && frase && salida.length < MAX_OPCIONES + 2) salida.push({ etiqueta: `${typeof o?.emoji === "string" ? `${o.emoji.slice(0, 4)} ` : ""}${titulo}`, accion: { tipo: "enviar", texto: frase } });
    }
    for (const ejemplo of Array.isArray(a.ejemplos) ? a.ejemplos : []) {
      const frase = texto(ejemplo, MAX_ETIQUETA);
      if (frase && salida.length < MAX_OPCIONES + 2) salida.push({ etiqueta: frase, accion: { tipo: "enviar", texto: frase } });
    }
    return salida;
  }
  return [];
}
