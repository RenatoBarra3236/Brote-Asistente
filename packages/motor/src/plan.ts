// Límites del plan de Claude (Pro/Max): el % usado de la sesión de 5 h y de la semana, y cuándo se
// reinicia cada una. Solo llegan por la statusline de Claude Code (packages/adapter/src/statusline.ts),
// que los reenvía al puente: nunca se leen credenciales ni se llaman APIs con la cuenta del usuario.
// Límite conocido: el % solo se actualiza mientras el usuario usa Claude Code de forma interactiva
// (las corridas de Brote no muestran statusline). Lógica pura, sin imports de Node.

export interface VentanaPlan {
  /** 0 a 100. */
  porcentaje: number;
  /** Cuándo se reinicia (ms). */
  reiniciaMs: number;
}

export interface LecturaPlan {
  sesion: VentanaPlan | null;
  semana: VentanaPlan | null;
  /** El id del modelo de la sesión que la mandó ("claude-sonnet-5"). */
  modelo: string | null;
  /** Cuándo llegó (ms). */
  actualizadoMs: number;
}

/** Umbrales de la sesión de 5 h que merecen un aviso (una vez por ventana). */
export const UMBRALES_PLAN = [80, 95] as const;

function ventana(datos: unknown): VentanaPlan | null {
  const v = datos as { used_percentage?: unknown; resets_at?: unknown } | null;
  if (!v || typeof v !== "object") return null;
  const { used_percentage: porcentaje, resets_at: reinicia } = v;
  if (typeof porcentaje !== "number" || !Number.isFinite(porcentaje)) return null;
  if (typeof reinicia !== "number" || !Number.isFinite(reinicia) || reinicia <= 0) return null;
  return { porcentaje: Math.min(100, Math.max(0, porcentaje)), reiniciaMs: Math.round(reinicia * 1000) };
}

/**
 * Lo que manda la statusline (`{ rate_limits: { five_hour, seven_day }, modelo }`, con los nombres de
 * Claude Code: `used_percentage` de 0 a 100 y `resets_at` en segundos Unix) → una lectura, o `null`
 * si no trae ninguna ventana válida (antes de la primera respuesta, o en planes sin límites).
 */
export function leerDatosPlan(datos: unknown, ahoraMs: number): LecturaPlan | null {
  const d = datos as { rate_limits?: { five_hour?: unknown; seven_day?: unknown }; modelo?: unknown } | null;
  if (!d || typeof d !== "object" || !d.rate_limits || typeof d.rate_limits !== "object") return null;
  const sesion = ventana(d.rate_limits.five_hour);
  const semana = ventana(d.rate_limits.seven_day);
  if (!sesion && !semana) return null;
  const modelo = typeof d.modelo === "string" && /^[\w.:\-[\]/]{1,80}$/.test(d.modelo) ? d.modelo : null;
  return { sesion, semana, modelo, actualizadoMs: ahoraMs };
}

/** Valida una lectura guardada en plan.json (o lo que sea). */
export function normalizarLectura(datos: unknown): LecturaPlan | null {
  const d = datos as Partial<Record<keyof LecturaPlan, unknown>> | null;
  if (!d || typeof d !== "object" || typeof d.actualizadoMs !== "number") return null;
  const v = (x: unknown): VentanaPlan | null => {
    const w = x as Partial<VentanaPlan> | null;
    return w && typeof w.porcentaje === "number" && typeof w.reiniciaMs === "number" && Number.isFinite(w.porcentaje) && Number.isFinite(w.reiniciaMs)
      ? { porcentaje: Math.min(100, Math.max(0, w.porcentaje)), reiniciaMs: w.reiniciaMs }
      : null;
  };
  const sesion = v(d.sesion);
  const semana = v(d.semana);
  if (!sesion && !semana) return null;
  return { sesion, semana, modelo: typeof d.modelo === "string" ? d.modelo.slice(0, 80) : null, actualizadoMs: d.actualizadoMs };
}

/** La lectura sin las ventanas que ya se reiniciaron (su % ya no vale); `null` si no queda ninguna. */
export function vigente(lectura: LecturaPlan | null, ahoraMs: number): LecturaPlan | null {
  if (!lectura) return null;
  const sesion = lectura.sesion && lectura.sesion.reiniciaMs > ahoraMs ? lectura.sesion : null;
  const semana = lectura.semana && lectura.semana.reiniciaMs > ahoraMs ? lectura.semana : null;
  return sesion || semana ? { ...lectura, sesion, semana } : null;
}

/** El color de la barra: verde bajo 60 %, ámbar bajo 85 %, rojo desde ahí. */
export function colorPlan(porcentaje: number): "verde" | "ambar" | "rojo" {
  return porcentaje < 60 ? "verde" : porcentaje < 85 ? "ambar" : "rojo";
}

/** "18:40". */
export function horaCorta(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "a las 18:40", "mañana a las 9:00", "el jue a las 9:00". */
export function cuandoReinicia(reiniciaMs: number, ahoraMs: number): string {
  const d = new Date(reiniciaMs);
  const hoy = new Date(ahoraMs);
  const dias = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) / 86_400_000);
  if (dias <= 0) return `a las ${horaCorta(reiniciaMs)}`;
  if (dias === 1) return `mañana a las ${horaCorta(reiniciaMs)}`;
  return `el ${DIAS[d.getDay()]} a las ${horaCorta(reiniciaMs)}`;
}

/** Cuánto falta: "2 h 10 min", "25 min", "3 d 4 h", "menos de 1 min". */
export function faltaPara(reiniciaMs: number, ahoraMs: number): string {
  const minutos = Math.floor((reiniciaMs - ahoraMs) / 60_000);
  if (minutos < 1) return "menos de 1 min";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return minutos % 60 ? `${horas} h ${minutos % 60} min` : `${horas} h`;
  return horas % 24 ? `${Math.floor(horas / 24)} d ${horas % 24} h` : `${Math.floor(horas / 24)} d`;
}

/** "recién", "hace 3 min", "hace 2 h", "hace 3 d". */
export function haceCuanto(ms: number, ahoraMs: number): string {
  const minutos = Math.floor((ahoraMs - ms) / 60_000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return horas < 24 ? `hace ${horas} h` : `hace ${Math.floor(horas / 24)} d`;
}

/**
 * Avisa una vez por ventana al pasar 80 % y 95 % de la sesión de 5 h. `avisados` guarda lo ya avisado
 * (`<reinicio>:<umbral>`) y se guarda en plan.json para que un reinicio de Brote no repita el aviso.
 * Si se pasa directo de menos de 80 a 95, solo se avisa 95.
 */
export function avisosPlan(lectura: LecturaPlan | null, ahoraMs: number, avisados: Set<string>): string[] {
  const sesion = vigente(lectura, ahoraMs)?.sesion;
  if (!sesion) return [];
  const pasados = UMBRALES_PLAN.filter((u) => sesion.porcentaje >= u);
  const nuevos = pasados.filter((u) => !avisados.has(`${sesion.reiniciaMs}:${u}`));
  for (const u of pasados) avisados.add(`${sesion.reiniciaMs}:${u}`);
  if (nuevos.length === 0) return [];
  const umbral = nuevos[nuevos.length - 1];
  return [`Llevas ${umbral} % de tu sesión de Claude; se reinicia ${cuandoReinicia(sesion.reiniciaMs, ahoraMs)}`];
}

/** Lo avisado de ventanas que ya pasaron se olvida. */
export function limpiarAvisados(avisados: Iterable<string>, ahoraMs: number): string[] {
  return [...avisados].filter((clave) => Number(clave.split(":")[0]) > ahoraMs);
}

const SIN_PLAN =
  "📊 Todavía no veo tu plan de Claude. Brote lo lee de la statusline de Claude Code: se actualiza cuando usas Claude Code en una terminal o en la pestaña Code.";
const SIN_STATUSLINE = "📊 Para ver tu plan de Claude, instala la statusline de Brote en 🌱 → Configurar Brote → Funciones → Uso del plan.";

function lineaVentana(nombre: string, v: VentanaPlan, ahoraMs: number): string {
  return `${nombre}: ${Math.round(v.porcentaje)} % (se reinicia ${cuandoReinicia(v.reiniciaMs, ahoraMs)}, en ${faltaPara(v.reiniciaMs, ahoraMs)})`;
}

/** Lo que responde el motor a "¿cuánto llevo del plan?". */
export function describirPlan(lectura: LecturaPlan | null, ahoraMs: number, statusline: boolean): string {
  const l = vigente(lectura, ahoraMs);
  if (!l) return statusline ? SIN_PLAN : SIN_STATUSLINE;
  const lineas = [
    l.sesion ? lineaVentana("Sesión de 5 h", l.sesion, ahoraMs) : null,
    l.semana ? lineaVentana("Semana", l.semana, ahoraMs) : null,
  ].filter(Boolean);
  return `📊 ${lineas.join("\n")}\nActualizado ${haceCuanto(l.actualizadoMs, ahoraMs)}.`;
}

/** Lo que responde el motor a "¿cuándo se reinicia mi plan?". */
export function describirReinicio(lectura: LecturaPlan | null, ahoraMs: number, statusline: boolean): string {
  const l = vigente(lectura, ahoraMs);
  if (!l) return statusline ? SIN_PLAN : SIN_STATUSLINE;
  const partes = [
    l.sesion ? `Tu sesión de 5 h se reinicia ${cuandoReinicia(l.sesion.reiniciaMs, ahoraMs)} (en ${faltaPara(l.sesion.reiniciaMs, ahoraMs)})` : null,
    l.semana ? `la semana, ${cuandoReinicia(l.semana.reiniciaMs, ahoraMs)}` : null,
  ].filter(Boolean);
  return `🔄 ${partes.join("; ")}.`;
}
