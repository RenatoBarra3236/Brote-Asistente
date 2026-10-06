// El aviso automático del resumen de la mañana (E2 de docs/plan-estudio-y-mejoras.md): una vez al día, entre las
// 6 y las 12, como una novedad (no abre la isla). Sin DOM, para probarlo con Node.

/** «2026-10-07»: el día en hora local, para recordar que ya se mostró. */
export function claveDelDia(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ¿Toca mostrar el resumen? Prendido, entre las 6:00 y las 11:59, y todavía no se mostró hoy. */
export function debeMostrarResumen(ahoraMs: number, ultimoDia: string | null, activo: boolean): boolean {
  if (!activo) return false;
  const h = new Date(ahoraMs).getHours();
  return h >= 6 && h < 12 && ultimoDia !== claveDelDia(ahoraMs);
}
