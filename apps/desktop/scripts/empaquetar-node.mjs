// Mete una copia de Node dentro de la app (src-tauri/recursos/node/node[.exe]) para que Brote funcione
// sin que el usuario instale Node: el motor, los gastos y todo lo que no usa IA corren con ella. La IA
// (OpenClaw) sigue pidiendo el Node del sistema. Se corre antes de `tauri build` (beforeBuildCommand).
//
// Copia el Node que corre este script (el que dejó `actions/setup-node` en CI, o el tuyo): tiene que ser
// un Node "oficial", de un solo archivo. Uno de Homebrew carga bibliotecas de /opt/homebrew y no sirve.
// No descarga nada. Usa `ASISTENTE_NODE_PARA_EMPAQUETAR` para elegir otro ejecutable.

import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const NODE_MINIMO = 24;

/**
 * Si la salida de `otool -L` (macOS) muestra un Node de un solo archivo: solo bibliotecas del sistema
 * (/usr/lib, /System). Una ruta de Homebrew, nvm u otra carpeta ajena lo haría fallar en otro Mac.
 */
export function esAutocontenidoMac(salidaOtool) {
  const rutas = salidaOtool
    .split("\n")
    .slice(1)
    .map((l) => l.trim().split(" (")[0])
    .filter(Boolean);
  return rutas.length > 0 && rutas.every((r) => r.startsWith("/usr/lib/") || r.startsWith("/System/Library/"));
}

/** Revisa que el ejecutable sirva para llevarlo dentro de la app; lanza un error que dice qué falla. */
export function revisarNode(ruta, ejecutar = execFileSync) {
  const version = String(ejecutar(ruta, ["--version"], { encoding: "utf8" })).trim();
  const principal = Number(version.replace(/^v/, "").split(".")[0]);
  if (!(principal >= NODE_MINIMO)) throw new Error(`${ruta} es ${version}: Brote necesita Node ${NODE_MINIMO} o superior`);
  if (process.platform === "darwin") {
    const salida = String(ejecutar("otool", ["-L", ruta], { encoding: "utf8" }));
    if (!esAutocontenidoMac(salida)) {
      throw new Error(
        `${ruta} carga bibliotecas de fuera del sistema (¿Node de Homebrew?). Usa un Node oficial de nodejs.org o de nvm, o apunta ASISTENTE_NODE_PARA_EMPAQUETAR a uno.`,
      );
    }
  }
  return version;
}

if (import.meta.main) {
  const app = join(dirname(fileURLToPath(import.meta.url)), "..");
  const destino = join(app, "src-tauri", "recursos", "node");
  const origen = process.env.ASISTENTE_NODE_PARA_EMPAQUETAR ?? process.execPath;
  const version = revisarNode(origen);
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });
  const archivo = join(destino, process.platform === "win32" ? "node.exe" : "node");
  copyFileSync(origen, archivo);
  if (process.platform !== "win32") chmodSync(archivo, 0o755);
  console.log(`Node ${version} dentro de la app: ${archivo} (${Math.round(statSync(archivo).size / 1e6)} MB)`);
}
