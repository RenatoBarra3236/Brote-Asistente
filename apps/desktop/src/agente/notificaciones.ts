// Notificaciones del sistema (Centro de notificaciones de macOS, notificaciones de Windows) para lo
// importante, cuando la isla está cerrada: el usuario puede estar en otra app y no mirar el notch.
// Opcional y apagado de fábrica. Sin DOM ni Tauri, para probarlo con Node.

import type { TipoNovedad } from "./novedades.ts";

/** De qué avisos vale la pena molestar fuera de la isla (el resto queda en el ala y en la lista). */
export const IMPORTANTES: readonly TipoNovedad[] = ["calendario", "aula", "temporizador", "plan", "claude"];

/** Dónde se recuerda la elección (la comparten las ventanas, que son del mismo origen). */
export const CLAVE_NOTIFICACIONES = "brote.notificaciones-sistema";

/** Lo mínimo que se usa de `localStorage`. */
export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

export function leerNotificaciones(almacen: Almacen): boolean {
  return almacen.getItem(CLAVE_NOTIFICACIONES) === "1";
}

export function guardarNotificaciones(almacen: Almacen, activa: boolean): void {
  almacen.setItem(CLAVE_NOTIFICACIONES, activa ? "1" : "0");
}

/** Si un aviso nuevo debe salir también como notificación del sistema. */
export function debeNotificarAlSistema(tipo: TipoNovedad, activa: boolean, islaAbierta: boolean): boolean {
  return activa && !islaAbierta && IMPORTANTES.includes(tipo);
}
