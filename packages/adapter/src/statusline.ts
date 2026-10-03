// La statusline de Brote para Claude Code (función "Uso del plan"). Claude Code la ejecuta después de
// cada respuesta (con 300 ms de espera entre eventos) y le pasa por la entrada estándar un JSON con el
// estado de la sesión; lo que se imprime es la línea que el usuario ve abajo en Claude Code.
// Documentación: https://code.claude.com/docs/en/statusline
//
// Qué hace:
//   - Le manda al puente de Brote (servidor local con el token de ~/.asistente-prototipo/hooks.json)
//     SOLO `rate_limits` (el % usado y la hora de reinicio de la sesión de 5 h y de la semana) y el id
//     del modelo. Nada más del JSON: ni la carpeta, ni el costo, ni la transcripción.
//   - Si el usuario ya tenía una statusline, Brote no la pisa: la guarda en
//     ~/.asistente-prototipo/statusline-original.json y aquí la corre con la misma entrada y muestra
//     su salida tal cual. Si no tenía, imprime una línea corta: "🌱 5 h 23 % · semana 41 % · contexto 12 %".
//   - Siempre imprime algo y sale con 0, aunque Brote esté cerrado, y rápido: al puente le da como
//     mucho ~300 ms y a la statusline original unos segundos.
//
// Sin dependencias ni imports de otros módulos del repo: se empaqueta solo (statusline.mjs).

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

/** Lo más que se espera al puente (Brote cerrado o colgado no debe atrasar la línea). */
const LIMITE_PUENTE_MS = 300;
/** Lo más que se espera la statusline original del usuario. */
const LIMITE_ORIGINAL_MS = 4000;
/** Corte total, por si algo se cuelga. */
const CORTE_MS = 5000;

const CARPETA = join(homedir(), ".asistente-prototipo");

function porcentaje(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : null;
}

function ventana(v: any): { used_percentage: number; resets_at: number } | undefined {
  const usado = porcentaje(v?.used_percentage);
  const reinicia = v?.resets_at;
  if (usado === null || typeof reinicia !== "number" || !Number.isFinite(reinicia)) return undefined;
  return { used_percentage: usado, resets_at: reinicia };
}

/**
 * Lo que se le manda al puente: solo las ventanas de `rate_limits` y el id del modelo, o `null` si no
 * trae ninguna ventana (antes de la primera respuesta, o en planes sin límites).
 */
export function resumirPlan(entrada: any): { rate_limits: Record<string, unknown>; modelo: string | null } | null {
  const limites = entrada?.rate_limits;
  const five_hour = ventana(limites?.five_hour);
  const seven_day = ventana(limites?.seven_day);
  if (!five_hour && !seven_day) return null;
  const id = entrada?.model?.id;
  return {
    rate_limits: { ...(five_hour ? { five_hour } : {}), ...(seven_day ? { seven_day } : {}) },
    modelo: typeof id === "string" ? id.slice(0, 80) : null,
  };
}

/** La línea de Brote: "🌱 5 h 23 % · semana 41 % · contexto 12 %" (lo que falte no se muestra). */
export function lineaBrote(entrada: any): string {
  const partes: string[] = [];
  const sesion = porcentaje(entrada?.rate_limits?.five_hour?.used_percentage);
  const semana = porcentaje(entrada?.rate_limits?.seven_day?.used_percentage);
  const contexto = porcentaje(entrada?.context_window?.used_percentage);
  if (sesion !== null) partes.push(`5 h ${Math.round(sesion)} %`);
  if (semana !== null) partes.push(`semana ${Math.round(semana)} %`);
  // Sin límites todavía (antes de la primera respuesta), al menos el modelo.
  if (partes.length === 0 && typeof entrada?.model?.display_name === "string") partes.push(entrada.model.display_name.slice(0, 40));
  if (contexto !== null) partes.push(`contexto ${Math.round(contexto)} %`);
  return partes.length > 0 ? `🌱 ${partes.join(" · ")}` : "🌱 Brote";
}

/** La statusline que el usuario tenía antes de instalar la de Brote (o `null`). */
export function leerOriginal(ruta = join(CARPETA, "statusline-original.json")): { command: string } | null {
  try {
    const original = JSON.parse(readFileSync(ruta, "utf8"))?.statusLine;
    if (!original || typeof original.command !== "string" || !original.command.trim()) return null;
    // Nunca la de Brote misma (se llamaría a sí misma sin fin).
    return /--brote/.test(original.command) && /statusline\.(mjs|ts)/.test(original.command) ? null : original;
  } catch {
    return null;
  }
}

/** Corre la statusline original con la misma entrada; su salida, o `null` si falló o no imprimió nada. */
export function correrOriginal(comando: string, entrada: string, limiteMs = LIMITE_ORIGINAL_MS): Promise<string | null> {
  return new Promise((listo) => {
    let salida = "";
    let hijo;
    try {
      // Claude Code la corre en una shell: aquí igual, tal como el usuario la escribió.
      hijo = spawn(comando, { shell: true, stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    } catch {
      return listo(null);
    }
    const plazo = setTimeout(() => {
      hijo.kill();
      listo(salida.trim() ? salida : null);
    }, limiteMs);
    hijo.stdout.setEncoding("utf8");
    hijo.stdout.on("data", (parte: string) => {
      if (salida.length < 100_000) salida += parte;
    });
    hijo.on("error", () => {
      clearTimeout(plazo);
      listo(null);
    });
    hijo.on("close", () => {
      clearTimeout(plazo);
      listo(salida.trim() ? salida : null);
    });
    hijo.stdin.on("error", () => {});
    hijo.stdin.end(entrada);
  });
}

function leerEntrada(limiteMs: number): Promise<string> {
  return new Promise((listo) => {
    let texto = "";
    const plazo = setTimeout(() => listo(texto), limiteMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (parte) => {
      if (texto.length < 1_000_000) texto += parte;
    });
    process.stdin.on("end", () => {
      clearTimeout(plazo);
      listo(texto);
    });
    process.stdin.on("error", () => listo(texto));
  });
}

/** Manda el plan al puente (POST /plan). Nunca falla: si Brote está cerrado, no pasa nada. */
export function enviarPlan(cuerpo: object, conexion = join(CARPETA, "hooks.json"), limiteMs = LIMITE_PUENTE_MS): Promise<void> {
  let datos: { puerto?: unknown; token?: unknown };
  try {
    datos = JSON.parse(readFileSync(conexion, "utf8"));
  } catch {
    return Promise.resolve();
  }
  if (!Number.isInteger(datos.puerto) || typeof datos.token !== "string") return Promise.resolve();
  const texto = JSON.stringify(cuerpo);
  return new Promise((listo) => {
    const pedido = request(
      {
        host: "127.0.0.1",
        port: datos.puerto as number,
        path: "/plan",
        method: "POST",
        timeout: limiteMs,
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(texto), authorization: `Bearer ${datos.token}` },
      },
      (respuesta) => {
        respuesta.resume();
        respuesta.on("end", () => listo());
        respuesta.on("error", () => listo());
      },
    );
    const plazo = setTimeout(() => pedido.destroy(), limiteMs);
    pedido.on("close", () => {
      clearTimeout(plazo);
      listo();
    });
    pedido.on("timeout", () => pedido.destroy());
    pedido.on("error", () => listo());
    pedido.end(texto);
  });
}

async function principal(): Promise<string> {
  const texto = await leerEntrada(500);
  let entrada: any = null;
  try {
    entrada = JSON.parse(texto);
  } catch {
    // Sin JSON igual se muestra algo (y la original recibe lo mismo que llegó).
  }
  const plan = resumirPlan(entrada);
  const original = leerOriginal();
  const [salida] = await Promise.all([original ? correrOriginal(original.command, texto) : Promise.resolve(null), plan ? enviarPlan(plan) : Promise.resolve()]);
  return salida ?? `${lineaBrote(entrada)}\n`;
}

if (import.meta.main) {
  // Pase lo que pase, se imprime una línea y se sale con 0 a tiempo.
  const corte = setTimeout(() => {
    process.stdout.write("🌱 Brote\n");
    process.exit(0);
  }, CORTE_MS);
  principal().then(
    (salida) => {
      clearTimeout(corte);
      process.stdout.write(salida.endsWith("\n") ? salida : `${salida}\n`, () => process.exit(0));
    },
    () => {
      clearTimeout(corte);
      process.stdout.write("🌱 Brote\n", () => process.exit(0));
    },
  );
}
