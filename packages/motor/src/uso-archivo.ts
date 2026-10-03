// Lectura incremental de las transcripciones de Claude Code para el uso por tokens (la lógica pura
// está en uso.ts) y el archivo del plan (plan.ts). Reglas:
//   - De cada línea solo se guardan los campos de uso (ver `leerLineaUso`): nada del texto.
//   - Se recuerda por archivo hasta qué byte se leyó (~/.asistente-prototipo/uso-cache.json, 600),
//     así no se releen gigas: solo lo nuevo. Un archivo que se achicó o cambió de inodo (rotado) se
//     lee de nuevo desde el principio (los ids evitan contar dos veces).
//   - Una línea a medio escribir (sin salto de línea al final) se deja para la próxima vuelta.
//   - Los archivos que no cambian hace más de 8 días ni se abren.
//   - Cada vuelta lee como mucho `presupuesto` bytes y cede el turno entre trozos (el puente sigue
//     atendiendo mientras tanto); lo que falte se lee en la próxima.

import { chmodSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import { DIAS_GUARDADOS, leerLineaUso, nombreDeCarpeta, reconstruirRuta, type RegistroUso } from "./uso.ts";
import { limpiarAvisados, normalizarLectura, vigente, type LecturaPlan } from "./plan.ts";

const CARPETA_DATOS = join(homedir(), ".asistente-prototipo");
export const RUTA_CACHE_USO = join(CARPETA_DATOS, "uso-cache.json");
export const RUTA_PLAN = join(CARPETA_DATOS, "plan.json");

/** plan.json (`ASISTENTE_PLAN` cambia la ruta en las pruebas). */
export function rutaPlan(): string {
  return process.env.ASISTENTE_PLAN ?? RUTA_PLAN;
}

/** Dónde guarda Claude Code las transcripciones (respeta CLAUDE_CONFIG_DIR). */
export function carpetaProyectosClaude(): string {
  return process.env.ASISTENTE_CLAUDE_PROYECTOS ?? join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
}

/** La carpeta de ~/.claude/projects de una ruta de proyecto: todo lo que no es letra o número, "-". */
export function carpetaDeProyecto(ruta: string): string {
  return ruta.replace(/[^A-Za-z0-9]/g, "-");
}

/** Escribe un archivo que solo el usuario puede leer, de forma atómica. */
export function escribirPrivado(ruta: string, texto: string): void {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  const temporal = `${ruta}.${process.pid}.tmp`;
  writeFileSync(temporal, texto, { mode: 0o600 });
  chmodSync(temporal, 0o600);
  renameSync(temporal, ruta);
}

interface EstadoArchivo {
  byte: number;
  ino: number;
}

interface Cache {
  archivos: Record<string, EstadoArchivo>;
  registros: RegistroUso[];
}

const TROZO = 1024 * 1024;
const DIA_MS = 86_400_000;

function leerCache(ruta: string | null): Cache {
  if (!ruta) return { archivos: {}, registros: [] };
  try {
    const datos = JSON.parse(readFileSync(ruta, "utf8"));
    if (datos?.version !== 1 || typeof datos.archivos !== "object" || !Array.isArray(datos.registros)) throw new Error();
    const archivos: Record<string, EstadoArchivo> = {};
    for (const [nombre, e] of Object.entries<any>(datos.archivos)) {
      if (Number.isInteger(e?.byte) && e.byte >= 0 && typeof e.ino === "number") archivos[nombre] = { byte: e.byte, ino: e.ino };
    }
    const registros = datos.registros.filter(
      (r: any) => typeof r?.clave === "string" && typeof r.ms === "number" && typeof r.modelo === "string" && typeof r.carpeta === "string" && r.tokens && typeof r.tokens === "object",
    );
    return { archivos, registros };
  } catch {
    return { archivos: {}, registros: [] };
  }
}

/** Las transcripciones: <carpeta>/<sesión>.jsonl y las de subagentes (<carpeta>/<sesión>/subagents/*.jsonl). */
async function listarTranscripciones(raiz: string): Promise<string[]> {
  const lista: string[] = [];
  const recorrer = async (relativa: string, nivel: number): Promise<void> => {
    let entradas;
    try {
      entradas = await readdir(join(raiz, relativa), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const ruta = relativa ? `${relativa}/${e.name}` : e.name;
      if (e.isFile() && e.name.endsWith(".jsonl") && nivel > 0) lista.push(ruta);
      else if (e.isDirectory() && nivel < 3 && e.name !== "memory") await recorrer(ruta, nivel + 1);
    }
  };
  await recorrer("", 0);
  return lista;
}

export interface OpcionesLector {
  /** La carpeta de las transcripciones (por defecto, la de Claude Code). */
  carpeta?: string;
  /** Dónde se guarda la caché; `null` para no guardarla. */
  cache?: string | null;
  /** Cuántos bytes se leen como mucho en cada vuelta. */
  presupuesto?: number;
}

export class LectorUso {
  private readonly carpeta: string;
  private readonly rutaCache: string | null;
  private readonly presupuesto: number;
  private cache: Cache | null = null;
  private leyendo: Promise<boolean> | null = null;

  constructor(opciones: OpcionesLector = {}) {
    this.carpeta = opciones.carpeta ?? carpetaProyectosClaude();
    this.rutaCache = opciones.cache === undefined ? RUTA_CACHE_USO : opciones.cache;
    this.presupuesto = opciones.presupuesto ?? 64 * 1024 * 1024;
  }

  /** Los registros de los últimos días (después de `actualizar`). */
  registros(): RegistroUso[] {
    return this.cache?.registros ?? [];
  }

  /** Lee lo nuevo de las transcripciones. Devuelve si quedó algo por leer (se acabó el presupuesto). */
  actualizar(ahoraMs = Date.now()): Promise<boolean> {
    this.leyendo ??= this.leer(ahoraMs).finally(() => (this.leyendo = null));
    return this.leyendo;
  }

  private async leer(ahoraMs: number): Promise<boolean> {
    const cache = (this.cache ??= leerCache(this.rutaCache));
    const limite = ahoraMs - DIAS_GUARDADOS * DIA_MS;
    const vistas = new Set(cache.registros.map((r) => r.clave));
    const archivos: Record<string, EstadoArchivo> = {};
    let cambio = false;
    let presupuesto = this.presupuesto;
    let falta = false;
    for (const relativa of await listarTranscripciones(this.carpeta)) {
      const ruta = join(this.carpeta, ...relativa.split("/"));
      let info;
      try {
        info = await stat(ruta);
      } catch {
        continue;
      }
      const antes = cache.archivos[relativa];
      let byte = antes && antes.ino === info.ino && antes.byte <= info.size ? antes.byte : 0;
      // Un archivo viejo que nunca se leyó no tiene nada de los últimos días.
      if (!antes && info.mtimeMs < limite) byte = info.size;
      if (byte < info.size && presupuesto <= 0) falta = true;
      else if (byte < info.size) {
        const carpeta = relativa.split("/")[0];
        const hasta = Math.min(info.size, byte + presupuesto);
        // Lo que no alcanzó a leerse por el presupuesto queda para la próxima (una línea a medio escribir no cuenta).
        if (hasta < info.size) falta = true;
        const lectura = await this.leerDesde(ruta, byte, hasta, info.size, info.mtimeMs < ahoraMs - 60_000, (linea) => {
          const r = leerLineaUso(linea, carpeta);
          if (!r || r.ms < limite || vistas.has(r.clave)) return;
          vistas.add(r.clave);
          cache.registros.push(r);
        });
        presupuesto -= lectura - byte;
        byte = lectura;
      }
      archivos[relativa] = { byte, ino: info.ino };
      if (!antes || antes.byte !== byte || antes.ino !== info.ino) cambio = true;
    }
    if (Object.keys(cache.archivos).length !== Object.keys(archivos).length) cambio = true;
    cache.archivos = archivos;
    const cuantos = cache.registros.length;
    cache.registros = cache.registros.filter((r) => r.ms >= limite);
    if (cache.registros.length !== cuantos) cambio = true;
    if (cambio && this.rutaCache) {
      try {
        escribirPrivado(this.rutaCache, JSON.stringify({ version: 1, archivos: cache.archivos, registros: cache.registros }));
      } catch {
        // Sin caché se relee la próxima vez: no es grave.
      }
    }
    return falta;
  }

  /**
   * Lee las líneas completas entre `desde` y `hasta` y devuelve hasta qué byte quedó leído. Si en ese
   * tramo no cabe ni una línea entera, sigue hasta terminarla (sin pasar de `tope`, el tamaño del
   * archivo), para avanzar siempre. La última línea sin salto se deja para la próxima vuelta, salvo
   * que el archivo esté quieto hace rato y sea JSON completo (`quieto`).
   */
  private async leerDesde(ruta: string, desde: number, hasta: number, tope: number, quieto: boolean, alLeer: (linea: string) => void): Promise<number> {
    let archivo;
    try {
      archivo = await open(ruta, "r");
    } catch {
      return desde;
    }
    let posicion = desde;
    let consumido = desde;
    let resto = Buffer.alloc(0);
    try {
      const buffer = Buffer.alloc(TROZO);
      while (posicion < hasta || (consumido === desde && posicion < tope)) {
        const { bytesRead } = await archivo.read(buffer, 0, Math.min(TROZO, Math.max(hasta, consumido === desde ? tope : 0) - posicion), posicion);
        if (bytesRead === 0) break;
        posicion += bytesRead;
        const datos = Buffer.concat([resto, buffer.subarray(0, bytesRead)]);
        let inicio = 0;
        for (let fin = datos.indexOf(10, inicio); fin !== -1; fin = datos.indexOf(10, inicio)) {
          alLeer(datos.toString("utf8", inicio, fin));
          consumido += fin + 1 - inicio;
          inicio = fin + 1;
        }
        resto = Buffer.from(datos.subarray(inicio));
        // Cede el turno: el puente sigue atendiendo a la isla mientras lee.
        await new Promise((listo) => setImmediate(listo));
      }
      if (resto.length > 0 && quieto && posicion >= tope) {
        const linea = resto.toString("utf8");
        try {
          JSON.parse(linea);
          alLeer(linea);
          consumido += resto.length;
        } catch {
          // A medio escribir: se lee cuando llegue el resto.
        }
      }
    } finally {
      await archivo.close();
    }
    return consumido;
  }
}

/** Los nombres de los proyectos, reconstruyendo su ruta real cuando se puede (con caché). */
export class NombresDeProyectos {
  private readonly nombres = new Map<string, string>();
  private readonly carpetaUsuario = carpetaDeProyecto(homedir());

  nombre(carpeta: string): string {
    let nombre = this.nombres.get(carpeta);
    if (nombre === undefined) {
      const listar = (ruta: string) => {
        try {
          return readdirSync(ruta, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
        } catch {
          return null;
        }
      };
      const ruta = reconstruirRuta(carpeta, listar, sep === "\\" ? "C:\\" : "/", sep);
      nombre = ruta ? basename(ruta) : nombreDeCarpeta(carpeta, this.carpetaUsuario);
      this.nombres.set(carpeta, nombre);
    }
    return nombre;
  }
}

// ---------------------------------------------------------------- plan.json

export interface PlanGuardado {
  lectura: LecturaPlan | null;
  /** Avisos de 80 % y 95 % ya dados (`<reinicio>:<umbral>`). */
  avisados: string[];
}

/** La última lectura del plan (guardada para que sobreviva a un reinicio de Brote). */
export function leerPlanGuardado(ruta = rutaPlan(), ahoraMs = Date.now()): PlanGuardado {
  try {
    const datos = JSON.parse(readFileSync(ruta, "utf8"));
    return {
      // Pasado su reinicio, el % ya no vale.
      lectura: vigente(normalizarLectura(datos?.lectura), ahoraMs),
      avisados: Array.isArray(datos?.avisados) ? limpiarAvisados(datos.avisados.filter((a: unknown) => typeof a === "string"), ahoraMs) : [],
    };
  } catch {
    return { lectura: null, avisados: [] };
  }
}

export function guardarPlan(plan: PlanGuardado, ruta = rutaPlan()): void {
  escribirPrivado(ruta, JSON.stringify({ version: 1, lectura: plan.lectura, avisados: plan.avisados }));
}
