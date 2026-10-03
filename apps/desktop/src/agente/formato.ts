// Cómo se dicen las cosas en la isla: tiempos, tamaños, fechas. Sin DOM, para probarlo con Node.

/** "12:34" o "1:02:03". */
export function cuentaRegresiva(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  const dos = (n: number) => String(n).padStart(2, "0");
  return horas > 0 ? `${horas}:${dos(minutos)}:${dos(segundos)}` : `${minutos}:${dos(segundos)}`;
}

/** "830 KB", "12 MB", "1,2 GB". */
export function tamanoCorto(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
}

function hora(fecha: Date): string {
  return `${fecha.getHours()}:${String(fecha.getMinutes()).padStart(2, "0")}`;
}

function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Cuándo es un evento, dicho corto: "ahora", "en 25 min", "a las 16:30", "mañana 8:30", "todo el día". */
export function cuandoEmpieza(evento: { inicioMs: number; finMs: number; todoElDia: boolean }, ahoraMs: number): string {
  const inicio = new Date(evento.inicioMs);
  const ahora = new Date(ahoraMs);
  const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
  if (evento.todoElDia) return mismoDia(inicio, ahora) ? "todo el día" : mismoDia(inicio, manana) ? "mañana" : "pronto";
  if (evento.inicioMs <= ahoraMs) return evento.finMs > ahoraMs ? "ahora" : "terminó";
  const minutos = Math.ceil((evento.inicioMs - ahoraMs) / 60_000);
  if (minutos < 60) return `en ${minutos} min`;
  if (mismoDia(inicio, ahora)) return `a las ${hora(inicio)}`;
  if (mismoDia(inicio, manana)) return `mañana ${hora(inicio)}`;
  return `${inicio.getDate()}/${inicio.getMonth() + 1} ${hora(inicio)}`;
}

/** "Buenos días", "Buenas tardes" o "Buenas noches". */
export function saludo(fecha: Date): string {
  const h = fecha.getHours();
  return h >= 5 && h < 12 ? "Buenos días" : h >= 12 && h < 20 ? "Buenas tardes" : "Buenas noches";
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "viernes 3 de octubre". */
export function fechaLarga(fecha: Date): string {
  return `${DIAS[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;
}

/** "11,4 GB" (memoria y disco). */
export function gigas(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return `${gb >= 100 ? Math.round(gb) : gb.toFixed(1).replace(/\.0$/, "").replace(".", ",")} GB`;
}

/**
 * Los pasos de una sesión de Claude Code, para mostrarlos como lista: agrega la actividad si es
 * nueva y guarda solo las últimas `max`.
 */
export function agregarPaso(pasos: readonly string[], actividad: string, max = 4): string[] {
  if (!actividad || pasos[pasos.length - 1] === actividad) return [...pasos];
  return [...pasos, actividad].slice(-max);
}
