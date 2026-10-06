// Preferencias de la ventana que se guardan en `localStorage` (como las notificaciones del sistema): se leen y
// escriben con `try/catch` en quien llama, porque el almacén puede faltar o lanzar. Sin DOM.

export interface AlmacenPreferencias {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

export const CLAVE_CONCENTRACION = "brote.modo-concentracion";
export const CLAVE_RESUMEN_MANANA = "brote.resumen-manana";
export const CLAVE_RESUMEN_MOSTRADO = "brote.resumen-mostrado";

/** Un interruptor guardado como «1» / «0»; sin dato (o si el almacén falla), el valor de fábrica. */
export function leerInterruptor(almacen: AlmacenPreferencias, clave: string, deFabrica: boolean): boolean {
  try {
    const v = almacen.getItem(clave);
    return v === null ? deFabrica : v === "1";
  } catch {
    return deFabrica;
  }
}

export function guardarInterruptor(almacen: AlmacenPreferencias, clave: string, valor: boolean): void {
  try {
    almacen.setItem(clave, valor ? "1" : "0");
  } catch {
    // sin almacén: se queda el valor de fábrica
  }
}

/** Un texto guardado (por ejemplo, el último día en que se mostró el resumen); `null` si no hay o si el almacén falla. */
export function leerTexto(almacen: AlmacenPreferencias, clave: string): string | null {
  try {
    return almacen.getItem(clave);
  } catch {
    return null;
  }
}

export function guardarTexto(almacen: AlmacenPreferencias, clave: string, valor: string): void {
  try {
    almacen.setItem(clave, valor);
  } catch {
    // sin almacén: avisará de nuevo la próxima vez, no pasa nada
  }
}
