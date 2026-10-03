// Límites del plan de Claude (Pro/Max): el % usado de la sesión de 5 h y de la semana, y cuándo se
// reinicia cada una. Nunca se leen credenciales ni se llaman APIs con la cuenta del usuario. Tres
// fuentes, y vale la más reciente (`combinarPlan`):
//   - "statusline": la de Brote en Claude Code (packages/adapter/src/statusline.ts), mientras el
//     usuario usa Claude Code de forma interactiva. Gratis y con la hora exacta de reinicio.
//   - "app": el archivo que guarda la app de escritorio de Claude cada 5 a 15 min mientras su ícono
//     está en la barra de menú (`leerPlanApp`). Gratis, cubre claude.ai y la app, pero sin hora de
//     reinicio: se estima. Formato interno de esa app: lo que no se reconoce se descarta.
//   - "consulta": un `claude -p` mínimo que corre el puente (consulta-plan.ts) y lee el evento
//     `rate_limit_event` de Claude Code (`leerEventoLimites`). Gasta ~900 tokens: solo como respaldo.
// Lógica pura, sin imports de Node.

export interface VentanaPlan {
  /** 0 a 100. */
  porcentaje: number;
  /** Cuándo se reinicia (ms); `null` si no se sabe (la app de Claude no lo guarda y no se pudo estimar). */
  reiniciaMs: number | null;
  /** La hora de reinicio es una estimación (de la app de Claude), no la que dio Claude Code. */
  estimado?: boolean;
}

export type FuentePlan = "statusline" | "consulta" | "app";

export interface LecturaPlan {
  sesion: VentanaPlan | null;
  semana: VentanaPlan | null;
  /** El id del modelo de la sesión que la mandó ("claude-sonnet-5"). */
  modelo: string | null;
  /** Cuándo se midió (ms). */
  actualizadoMs: number;
  /** De dónde salió (las lecturas viejas de plan.json no lo traen: eran de la statusline). */
  fuente?: FuentePlan;
}

/** Cuánto dura cada ventana (ms). */
export const DURACION_PLAN = { sesion: 5 * 3_600_000, semana: 7 * 86_400_000 } as const;

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
  return { sesion, semana, modelo, actualizadoMs: ahoraMs, fuente: "statusline" };
}

/**
 * La salida de `claude -p … --output-format stream-json --verbose` (una línea JSON por evento) → la
 * lectura de su evento `rate_limit_event`: `rate_limit_info.unifiedWindows.{five_hour,seven_day}` con
 * `utilization` (0 a 1) y `resetsAt` (segundos Unix). `null` si no vino (versión sin ese evento, o
 * cuenta sin plan).
 */
export function leerEventoLimites(salida: string, ahoraMs: number): LecturaPlan | null {
  for (const linea of salida.split("\n")) {
    if (!linea.includes("rate_limit_event")) continue;
    let evento: any;
    try {
      evento = JSON.parse(linea);
    } catch {
      continue;
    }
    if (evento?.type !== "rate_limit_event") continue;
    const ventanas = evento.rate_limit_info?.unifiedWindows;
    const v = (w: any): VentanaPlan | null => {
      const uso = w?.utilization;
      const reinicia = w?.resetsAt;
      if (typeof uso !== "number" || !Number.isFinite(uso) || typeof reinicia !== "number" || !Number.isFinite(reinicia) || reinicia <= 0) return null;
      return { porcentaje: Math.min(100, Math.max(0, uso * 100)), reiniciaMs: Math.round(reinicia * 1000) };
    };
    const sesion = v(ventanas?.five_hour);
    const semana = v(ventanas?.seven_day);
    if (sesion || semana) return { sesion, semana, modelo: null, actualizadoMs: ahoraMs, fuente: "consulta" };
  }
  return null;
}

/**
 * El archivo de la app de escritorio de Claude (~/Library/Application Support/Claude/
 * plan-usage-history.json): `{ version: 2, samples: [{ t, org, u: { fh, sd } }] }`, una muestra cada 5 a
 * 15 min con el % de la sesión de 5 h (`fh`) y de la semana (`sd`). Vale la última muestra de la última
 * organización. No trae la hora de reinicio: se estima desde la primera muestra de la ventana actual
 * (la ventana empezó a más tardar ahí, así que se reinicia a más tardar 5 h o 7 días después).
 * `null` si el formato no es el conocido.
 */
export function leerPlanApp(texto: string, ahoraMs: number): LecturaPlan | null {
  let datos: any;
  try {
    datos = JSON.parse(texto);
  } catch {
    return null;
  }
  if (datos?.version !== 2 || !Array.isArray(datos.samples)) return null;
  const aMs = (t: unknown): number | null => (typeof t === "number" && Number.isFinite(t) && t > 0 ? (t > 1e12 ? t : t * 1000) : null);
  const validas = datos.samples
    .map((m: any) => ({ ms: aMs(m?.t), org: m?.org, fh: m?.u?.fh, sd: m?.u?.sd }))
    .filter((m: any) => m.ms !== null && m.ms <= ahoraMs + 60_000);
  if (validas.length === 0) return null;
  validas.sort((a: any, b: any) => a.ms - b.ms);
  const org = validas[validas.length - 1].org;
  const muestras: { ms: number; fh: unknown; sd: unknown }[] = validas.filter((m: any) => m.org === org);
  const ultima = muestras[muestras.length - 1];

  const ventana = (clave: "fh" | "sd", duracion: number): VentanaPlan | null => {
    const valor = (m: { fh: unknown; sd: unknown }) => m[clave];
    const actual = valor(ultima);
    if (typeof actual !== "number" || !Number.isFinite(actual)) return null;
    const porcentaje = Math.min(100, Math.max(0, actual));
    if (porcentaje === 0) return { porcentaje: 0, reiniciaMs: null, estimado: true };
    // Hacia atrás mientras sea la misma ventana: el % no baja dentro de una ventana, y entre dos
    // muestras no puede pasar más que su duración.
    let inicio = ultima;
    for (let i = muestras.length - 2; i >= 0; i--) {
      const m = muestras[i];
      const v = valor(m);
      if (typeof v !== "number" || v <= 0 || v > (valor(inicio) as number) || inicio.ms - m.ms >= duracion) break;
      inicio = m;
    }
    return { porcentaje, reiniciaMs: inicio.ms + duracion, estimado: true };
  };
  const sesion = ventana("fh", DURACION_PLAN.sesion);
  const semana = ventana("sd", DURACION_PLAN.semana);
  if (!sesion && !semana) return null;
  return { sesion, semana, modelo: null, actualizadoMs: ultima.ms, fuente: "app" };
}

/**
 * Junta la lectura que había con una nueva: vale la más reciente. Si la más reciente no sabe la hora
 * exacta de reinicio de una ventana (la de la app de Claude) y la anterior sí, y es la misma ventana
 * (seguía corriendo cuando se midió la nueva y el % no bajó), se queda con la hora exacta.
 */
export function combinarPlan(actual: LecturaPlan | null, nueva: LecturaPlan | null): LecturaPlan | null {
  if (!actual || !nueva) return nueva ?? actual;
  const [vieja, reciente] = nueva.actualizadoMs >= actual.actualizadoMs ? [actual, nueva] : [nueva, actual];
  const heredar = (r: VentanaPlan | null, v: VentanaPlan | null): VentanaPlan | null => {
    if (!r || !v || !r.estimado || v.estimado || v.reiniciaMs === null) return r;
    const misma = v.reiniciaMs > reciente.actualizadoMs && r.porcentaje + 1 >= v.porcentaje;
    return misma ? { porcentaje: r.porcentaje, reiniciaMs: v.reiniciaMs } : r;
  };
  return {
    ...reciente,
    sesion: heredar(reciente.sesion, vieja.sesion),
    semana: heredar(reciente.semana, vieja.semana),
    modelo: reciente.modelo ?? vieja.modelo,
  };
}

/** Lo que se muestra de una ventana: su % o, si ya se reinició, 0 % y desde cuándo. */
export interface VentanaVista extends VentanaPlan {
  /** Ya pasó su hora de reinicio (o la lectura es más vieja que la ventana): el % mostrado es 0. */
  reiniciada: boolean;
}

/**
 * Para la isla: en vez de hacer desaparecer una ventana que se reinició, la muestra en 0 % con la hora
 * en que se reinició, hasta la próxima lectura. Una ventana reiniciada hace más de una semana se quita.
 */
export function paraMostrar(lectura: LecturaPlan | null, ahoraMs: number): { sesion: VentanaVista | null; semana: VentanaVista | null } | null {
  if (!lectura) return null;
  const vista = (v: VentanaPlan | null, duracion: number): VentanaVista | null => {
    if (!v) return null;
    const pasada = v.reiniciaMs !== null ? v.reiniciaMs <= ahoraMs : ahoraMs - lectura.actualizadoMs >= duracion;
    if (!pasada) return { ...v, reiniciada: false };
    const desde = v.reiniciaMs ?? lectura.actualizadoMs + duracion;
    if (ahoraMs - desde > DURACION_PLAN.semana) return null;
    return { ...v, porcentaje: 0, reiniciada: true };
  };
  const sesion = vista(lectura.sesion, DURACION_PLAN.sesion);
  const semana = vista(lectura.semana, DURACION_PLAN.semana);
  return sesion || semana ? { sesion, semana } : null;
}

/** Valida una lectura guardada en plan.json (o lo que sea). */
export function normalizarLectura(datos: unknown): LecturaPlan | null {
  const d = datos as Partial<Record<keyof LecturaPlan, unknown>> | null;
  if (!d || typeof d !== "object" || typeof d.actualizadoMs !== "number") return null;
  const v = (x: unknown): VentanaPlan | null => {
    const w = x as Partial<VentanaPlan> | null;
    if (!w || typeof w.porcentaje !== "number" || !Number.isFinite(w.porcentaje)) return null;
    const reinicia = typeof w.reiniciaMs === "number" && Number.isFinite(w.reiniciaMs) ? w.reiniciaMs : null;
    const ventana: VentanaPlan = { porcentaje: Math.min(100, Math.max(0, w.porcentaje)), reiniciaMs: reinicia };
    if (w.estimado === true || reinicia === null) ventana.estimado = true;
    return ventana;
  };
  const sesion = v(d.sesion);
  const semana = v(d.semana);
  if (!sesion && !semana) return null;
  const fuente = d.fuente === "consulta" || d.fuente === "app" ? d.fuente : "statusline";
  return { sesion, semana, modelo: typeof d.modelo === "string" ? d.modelo.slice(0, 80) : null, actualizadoMs: d.actualizadoMs, fuente };
}

/** La lectura sin las ventanas que ya se reiniciaron (su % ya no vale); `null` si no queda ninguna. */
export function vigente(lectura: LecturaPlan | null, ahoraMs: number): LecturaPlan | null {
  if (!lectura) return null;
  // Sin hora de reinicio, vale mientras la lectura sea más nueva que la duración de la ventana.
  const vale = (v: VentanaPlan | null, duracion: number) =>
    v && (v.reiniciaMs !== null ? v.reiniciaMs > ahoraMs : ahoraMs - lectura.actualizadoMs < duracion) ? v : null;
  const sesion = vale(lectura.sesion, DURACION_PLAN.sesion);
  const semana = vale(lectura.semana, DURACION_PLAN.semana);
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
  // Sin hora de reinicio no hay cómo saber si ya se avisó en esta ventana: mejor no repetir avisos.
  if (!sesion || sesion.reiniciaMs === null) return [];
  const pasados = UMBRALES_PLAN.filter((u) => sesion.porcentaje >= u);
  const nuevos = pasados.filter((u) => !avisados.has(`${sesion.reiniciaMs}:${u}`));
  for (const u of pasados) avisados.add(`${sesion.reiniciaMs}:${u}`);
  if (nuevos.length === 0) return [];
  const umbral = nuevos[nuevos.length - 1];
  return [`Llevas ${umbral} % de tu sesión de Claude; se reinicia ${sesion.estimado ? "cerca de " : ""}${cuandoReinicia(sesion.reiniciaMs, ahoraMs)}`];
}

/** Lo avisado de ventanas que ya pasaron se olvida. */
export function limpiarAvisados(avisados: Iterable<string>, ahoraMs: number): string[] {
  return [...avisados].filter((clave) => Number(clave.split(":")[0]) > ahoraMs);
}

const SIN_PLAN =
  "📊 Todavía no veo tu plan de Claude. Abre la pestaña Claude de la isla y pulsa ↻ para revisarlo, o usa Claude Code en una terminal.";
const SIN_STATUSLINE = SIN_PLAN;

function lineaVentana(nombre: string, v: VentanaPlan, ahoraMs: number): string {
  if (v.reiniciaMs === null) return `${nombre}: ${Math.round(v.porcentaje)} %`;
  const cerca = v.estimado ? "cerca de " : "";
  return `${nombre}: ${Math.round(v.porcentaje)} % (se reinicia ${cerca}${cuandoReinicia(v.reiniciaMs, ahoraMs)}, en ${v.estimado ? "unos " : ""}${faltaPara(v.reiniciaMs, ahoraMs)})`;
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
  const cerca = (v: VentanaPlan) => (v.estimado ? "cerca de " : "");
  const partes = [
    l.sesion?.reiniciaMs != null
      ? `Tu sesión de 5 h se reinicia ${cerca(l.sesion)}${cuandoReinicia(l.sesion.reiniciaMs, ahoraMs)} (en ${faltaPara(l.sesion.reiniciaMs, ahoraMs)})`
      : null,
    l.semana?.reiniciaMs != null ? `la semana, ${cerca(l.semana)}${cuandoReinicia(l.semana.reiniciaMs, ahoraMs)}` : null,
  ].filter(Boolean);
  if (partes.length === 0) return "🔄 Todavía no sé cuándo se reinicia tu plan: pulsa ↻ en la pestaña Claude de la isla para revisarlo.";
  return `🔄 ${partes.join("; ")}.`;
}
