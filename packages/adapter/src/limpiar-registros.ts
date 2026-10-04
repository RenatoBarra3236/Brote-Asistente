// El Gateway de OpenClaw corre bajo launchd, que manda su salida estándar a ~/Library/Logs/openclaw/gateway.log.
// Además de las líneas de su registro (marca de tiempo o `[subsistema]`, todas técnicas), ahí caen respuestas
// completas de los agentes impresas sin formato, que se acumulan para siempre. Esta limpieza quita solo esas
// líneas sueltas y deja el resto. Solo toca `gateway.log` y sus rotados (`gateway.log.1`…), con esos nombres exactos.

import { closeSync, fstatSync, lstatSync, ftruncateSync, openSync, readdirSync, readSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const NOMBRE_REGISTRO = /^gateway\.log(\.\d+)?$/;
const MAX_BYTES = 50 * 1024 * 1024;
/** Línea del registro: marca de tiempo ISO o `[subsistema]`. */
const MARCADA = /^(\d{4}-\d{2}-\d{2}T|\[)/;
/** Avisos de Node que también caen sin marca: se dejan. */
const AVISO_DE_NODE = /^\((node:\d+\)|Use `node )/;

/** Quita las líneas de texto suelto (y las vacías que las rodean). Devuelve el texto nuevo y cuántas líneas quitó. */
export function limpiarTexto(texto: string): { texto: string; quitadas: number } {
  const salida: string[] = [];
  let quitadas = 0;
  let enBloque = false;
  for (const linea of texto.split("\n")) {
    if (MARCADA.test(linea) || AVISO_DE_NODE.test(linea)) {
      enBloque = false;
      salida.push(linea);
    } else if (linea.trim() === "") {
      if (enBloque) quitadas++;
      else salida.push(linea);
    } else {
      enBloque = true;
      quitadas++;
    }
  }
  return { texto: salida.join("\n"), quitadas };
}

export function carpetaDeRegistros(): string | null {
  return process.platform === "darwin" ? join(homedir(), "Library", "Logs", "openclaw") : null;
}

/** Limpia un archivo en el mismo lugar (mismo inodo y permisos, el Gateway lo sigue escribiendo). Devuelve las líneas quitadas. */
function limpiarArchivo(ruta: string): number {
  const info = lstatSync(ruta);
  if (!info.isFile() || info.size > MAX_BYTES || info.size === 0) return 0;
  const fd = openSync(ruta, "r+");
  try {
    const tamano = fstatSync(fd).size;
    const buf = Buffer.alloc(tamano);
    readSync(fd, buf, 0, tamano, 0);
    const { texto, quitadas } = limpiarTexto(buf.toString("utf8"));
    if (quitadas === 0) return 0;
    // Si el Gateway escribió mientras tanto, se deja para la próxima vuelta (no se pierde nada).
    if (fstatSync(fd).size !== tamano) return 0;
    const nuevo = Buffer.from(texto, "utf8");
    ftruncateSync(fd, 0);
    writeSync(fd, nuevo, 0, nuevo.length, 0);
    return quitadas;
  } finally {
    closeSync(fd);
  }
}

/** Limpia `gateway.log` y sus rotados de la carpeta. Nunca lanza. Devuelve el total de líneas quitadas. */
export function limpiarRegistros(carpeta: string | null = carpetaDeRegistros()): number {
  if (!carpeta) return 0;
  let total = 0;
  try {
    for (const nombre of readdirSync(carpeta)) {
      if (!NOMBRE_REGISTRO.test(nombre)) continue;
      try {
        total += limpiarArchivo(join(carpeta, nombre));
      } catch {
        // un archivo que no se pudo leer o escribir no detiene a los demás
      }
    }
  } catch {
    return 0;
  }
  return total;
}
