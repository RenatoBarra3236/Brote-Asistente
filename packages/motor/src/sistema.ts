// Brote reacciona al computador: lee la batería, el uso de CPU y el espacio libre (en macOS,
// Windows y Linux, sin permisos especiales) y decide su ánimo y sus avisos. Las lecturas tocan el
// sistema; las reglas (`Vigilante`) son lógica pura, para probarlas con lecturas inventadas.

import { execFileSync } from "node:child_process";
import { readFileSync, statfsSync } from "node:fs";
import { cpus, freemem, homedir, totalmem } from "node:os";
import { basename } from "node:path";

export interface Bateria {
  porcentaje: number;
  /** Conectado a la corriente (aunque ya esté llena). */
  conectado: boolean;
}

export interface LecturaEquipo {
  bateria: Bateria | null;
  /** Uso de CPU entre 0 y 1, o `null` si todavía no hay dos muestras para comparar. */
  cpu: number | null;
  disco: { libre: number; total: number } | null;
  /** El programa que más CPU usa, si se pudo saber. */
  procesoPesado: string | null;
  memoria?: Memoria | null;
}

export interface Memoria {
  total: number;
  /** Lo que de verdad está disponible (en macOS, según `memory_pressure`, no la memoria "libre" a secas). */
  libre: number;
}

export interface Proceso {
  nombre: string;
  /** % de un núcleo (puede pasar de 100 con varios núcleos), o `null` si no se sabe. */
  cpu: number | null;
  memoria: number;
}

export type Animo = "cansado" | "acalorado" | null;

export interface AvisoEquipo {
  tipo: "bateria-baja" | "bateria-critica" | "cargando" | "cpu-alta" | "disco-lleno";
  texto: string;
  /** Una buena noticia: Brote celebra. */
  celebrar: boolean;
}

// ---------------------------------------------------------------- lecturas

function ejecutar(programa: string, args: string[]): string | null {
  try {
    return execFileSync(programa, args, { encoding: "utf8", timeout: 5000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/** La batería, o `null` en un computador sin batería (o si no se pudo leer). */
export function leerBateria(): Bateria | null {
  if (process.platform === "darwin") {
    const salida = ejecutar("pmset", ["-g", "batt"]);
    const porcentaje = salida?.match(/InternalBattery[^\n]*?(\d+)%/)?.[1];
    if (!salida || porcentaje === undefined) return null;
    return { porcentaje: Number(porcentaje), conectado: /AC Power/.test(salida) };
  }
  if (process.platform === "win32") {
    const salida = ejecutar("powershell", [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json",
    ]);
    try {
      const datos = JSON.parse(salida ?? "");
      const bateria = Array.isArray(datos) ? datos[0] : datos;
      if (typeof bateria?.EstimatedChargeRemaining !== "number") return null;
      // BatteryStatus 1 = descargándose; el resto (2, 6–9…) = conectado o cargando.
      return { porcentaje: bateria.EstimatedChargeRemaining, conectado: bateria.BatteryStatus !== 1 };
    } catch {
      return null;
    }
  }
  try {
    const porcentaje = Number(readFileSync("/sys/class/power_supply/BAT0/capacity", "utf8"));
    const estado = readFileSync("/sys/class/power_supply/BAT0/status", "utf8").trim();
    return Number.isFinite(porcentaje) ? { porcentaje, conectado: estado !== "Discharging" } : null;
  } catch {
    return null;
  }
}

/** Mide el uso de CPU comparando dos muestras: guarda la anterior entre llamadas. */
export class MedidorCpu {
  private anterior: { ocupado: number; total: number } | null = null;

  medir(): number | null {
    let ocupado = 0;
    let total = 0;
    for (const nucleo of cpus()) {
      const t = nucleo.times;
      const suma = t.user + t.nice + t.sys + t.idle + t.irq;
      total += suma;
      ocupado += suma - t.idle;
    }
    const anterior = this.anterior;
    this.anterior = { ocupado, total };
    if (!anterior || total <= anterior.total) return null;
    return Math.min(1, Math.max(0, (ocupado - anterior.ocupado) / (total - anterior.total)));
  }
}

/** Espacio libre del disco donde está la carpeta personal. */
export function leerDisco(ruta = homedir()): { libre: number; total: number } | null {
  try {
    const datos = statfsSync(ruta);
    return { libre: datos.bavail * datos.bsize, total: datos.blocks * datos.bsize };
  } catch {
    return null;
  }
}

/** El programa que más CPU usa (macOS y Linux; en Windows se omite). */
export function procesoMasPesado(): string | null {
  if (process.platform === "win32") return null;
  const args = process.platform === "darwin" ? ["-Aro", "pcpu=,comm="] : ["-eo", "pcpu=,comm=", "--sort=-pcpu"];
  const primera = ejecutar("ps", args)?.trim().split("\n")[0];
  const nombre = primera?.trim().replace(/^[\d.]+\s+/, "");
  if (!nombre) return null;
  // "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" → "Google Chrome"
  return basename(nombre).replace(/\.app$/, "") || null;
}

/** La memoria RAM: total y lo realmente disponible. */
export function leerMemoria(): Memoria | null {
  const total = totalmem();
  if (process.platform === "darwin") {
    const libre = ejecutar("memory_pressure", ["-Q"])?.match(/free percentage:\s*(\d+)%/)?.[1];
    if (libre !== undefined) return { total, libre: (total * Number(libre)) / 100 };
  }
  return { total, libre: freemem() };
}

/** Las líneas de `ps -o pid=,pcpu=,rss=,comm=` → procesos (rss en KB). Junta los que se llaman igual. */
export function interpretarPs(salida: string): Proceso[] {
  const porNombre = new Map<string, Proceso>();
  for (const linea of salida.split("\n")) {
    const partes = linea.trim().match(/^\d+\s+([\d.]+)\s+(\d+)\s+(.+)$/);
    if (!partes) continue;
    const nombre = basename(partes[3].trim()).replace(/\.app$/, "");
    const actual = porNombre.get(nombre) ?? { nombre, cpu: 0, memoria: 0 };
    actual.cpu = (actual.cpu ?? 0) + Number(partes[1]);
    actual.memoria += Number(partes[2]) * 1024;
    porNombre.set(nombre, actual);
  }
  return [...porNombre.values()];
}

/** Los programas que más memoria usan (con su CPU), del más pesado al más liviano. */
export function procesosPesados(cantidad = 5): Proceso[] {
  if (process.platform === "win32") {
    const salida = ejecutar("powershell", [
      "-NoProfile",
      "-Command",
      "Get-Process | Group-Object ProcessName | ForEach-Object { [pscustomobject]@{ Nombre = $_.Name; Memoria = ($_.Group | Measure-Object WorkingSet64 -Sum).Sum } } | Sort-Object Memoria -Descending | Select-Object -First " +
        cantidad +
        " | ConvertTo-Json",
    ]);
    try {
      const datos = JSON.parse(salida ?? "[]");
      return (Array.isArray(datos) ? datos : [datos]).map((p: any) => ({ nombre: String(p.Nombre), cpu: null, memoria: Number(p.Memoria) }));
    } catch {
      return [];
    }
  }
  const salida = ejecutar("ps", process.platform === "darwin" ? ["-Acmo", "pid=,pcpu=,rss=,comm="] : ["-eo", "pid=,pcpu=,rss=,comm="]);
  return interpretarPs(salida ?? "")
    .sort((a, b) => b.memoria - a.memoria)
    .slice(0, cantidad);
}

// ---------------------------------------------------------------- reglas

const MINUTO = 60_000;
export const UMBRALES = {
  bateriaBaja: 20,
  bateriaCritica: 10,
  /** Sobre esto, la batería ya no cuenta como "baja" (para no avisar dos veces si oscila). */
  bateriaRecuperada: 25,
  cpuAlta: 0.85,
  cpuNormal: 0.6,
  /** Cuánto tiempo seguido con la CPU alta antes de reaccionar. */
  cpuSostenidaMs: 30_000,
  cpuEntreAvisosMs: 20 * MINUTO,
  discoLibreFraccion: 0.1,
  discoLibreBytes: 5 * 1024 ** 3,
  discoEntreAvisosMs: 24 * 60 * MINUTO,
};

/** "4,2 GB", "120 GB". */
export function formatearBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return `${gb < 10 ? gb.toFixed(1).replace(".", ",") : Math.round(gb)} GB`;
}

export class Vigilante {
  private avisoBateria: "baja" | "critica" | null = null;
  private cpuAltaDesde: number | null = null;
  private ultimoAvisoCpu = -Infinity;
  private ultimoAvisoDisco = -Infinity;

  /** Revisa una lectura: el ánimo de Brote y los avisos nuevos (cada uno con su tiempo de espera). */
  evaluar(lectura: LecturaEquipo, ahora: number): { animo: Animo; avisos: AvisoEquipo[] } {
    const avisos: AvisoEquipo[] = [];
    let animo: Animo = null;

    const bateria = lectura.bateria;
    if (bateria) {
      if (bateria.conectado || bateria.porcentaje > UMBRALES.bateriaRecuperada) {
        if (bateria.conectado && this.avisoBateria) {
          avisos.push({ tipo: "cargando", texto: "⚡ ¡Gracias! Ya estoy cargando 🌱", celebrar: true });
        }
        this.avisoBateria = null;
      }
      const baja = !bateria.conectado && bateria.porcentaje <= UMBRALES.bateriaBaja;
      if (baja) {
        animo = "cansado";
        if (bateria.porcentaje <= UMBRALES.bateriaCritica && this.avisoBateria !== "critica") {
          this.avisoBateria = "critica";
          avisos.push({
            tipo: "bateria-critica",
            texto: `🪫 ¡Solo ${bateria.porcentaje}% de batería! Enchúfame pronto o te quedas sin computador.`,
            celebrar: false,
          });
        } else if (!this.avisoBateria) {
          this.avisoBateria = "baja";
          avisos.push({
            tipo: "bateria-baja",
            texto: `🔋 Me queda poca batería (${bateria.porcentaje}%). ¿Me enchufas? 🥱`,
            celebrar: false,
          });
        }
      }
    }

    const cpu = lectura.cpu;
    if (cpu !== null) {
      if (cpu >= UMBRALES.cpuAlta) this.cpuAltaDesde ??= ahora;
      else if (cpu < UMBRALES.cpuNormal) this.cpuAltaDesde = null;
      if (this.cpuAltaDesde !== null && ahora - this.cpuAltaDesde >= UMBRALES.cpuSostenidaMs) {
        animo = "acalorado";
        if (ahora - this.ultimoAvisoCpu >= UMBRALES.cpuEntreAvisosMs) {
          this.ultimoAvisoCpu = ahora;
          const culpable = lectura.procesoPesado ? ` ${lectura.procesoPesado} es el que más está usando.` : "";
          avisos.push({
            tipo: "cpu-alta",
            texto: `🥵 El computador está trabajando a full (CPU ${Math.round(cpu * 100)}%).${culpable}`,
            celebrar: false,
          });
        }
      }
    }

    const disco = lectura.disco;
    if (disco && disco.total > 0) {
      const lleno = disco.libre / disco.total < UMBRALES.discoLibreFraccion || disco.libre < UMBRALES.discoLibreBytes;
      if (lleno && ahora - this.ultimoAvisoDisco >= UMBRALES.discoEntreAvisosMs) {
        this.ultimoAvisoDisco = ahora;
        avisos.push({
          tipo: "disco-lleno",
          texto: `💾 Te queda poco espacio: ${formatearBytes(disco.libre)} libres. Vaciar la Papelera o Descargas ayuda.`,
          celebrar: false,
        });
      }
    }
    return { animo, avisos };
  }
}

/** "🔋 76% (cargando) · CPU 23% · 💾 120 GB libres de 494 GB": para "¿cómo está el computador?". */
export function describirEquipo(lectura: LecturaEquipo): string {
  const partes: string[] = [];
  if (lectura.bateria) {
    const { porcentaje, conectado } = lectura.bateria;
    partes.push(`${porcentaje <= UMBRALES.bateriaBaja && !conectado ? "🪫" : "🔋"} Batería ${porcentaje}%${conectado ? " (enchufado)" : ""}`);
  }
  if (lectura.cpu !== null) partes.push(`🧠 CPU ${Math.round(lectura.cpu * 100)}%`);
  if (lectura.memoria) {
    const { total, libre } = lectura.memoria;
    partes.push(`🧮 RAM ${formatearBytes(total - libre)} de ${formatearBytes(total)} en uso`);
  }
  if (lectura.disco) partes.push(`💾 ${formatearBytes(lectura.disco.libre)} libres de ${formatearBytes(lectura.disco.total)}`);
  return partes.length > 0 ? partes.join(" · ") : "No pude leer el estado del computador.";
}
