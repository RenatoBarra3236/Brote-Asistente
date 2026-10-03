// Uso de Claude por tokens, leído de las transcripciones locales de Claude Code
// (~/.claude/projects/<carpeta>/<sesión>.jsonl). Aquí está la lógica pura: sacar de cada línea SOLO
// los campos de uso (fecha, ids para no contar dos veces, modelo y `usage`), calcular su valor API
// con la tabla de precios.ts y resumir hoy y los últimos 7 días. Nunca se lee el texto de los
// mensajes. La lectura incremental de los archivos está en uso-archivo.ts.
// Sin imports de Node: también lo usan las ventanas (los formatos).

import { PRECIOS, PRECIOS_RAPIDO, RECARGO_EEUU, USD_POR_BUSQUEDA, claveModelo, nombreModelo, type Precio } from "./precios.ts";

export interface TokensUso {
  entrada: number;
  salida: number;
  escritura5m: number;
  escritura1h: number;
  lectura: number;
}

/** Una respuesta del modelo, ya reducida a lo que importa para el uso (es lo que se guarda en la caché). */
export interface RegistroUso {
  /** message.id + requestId: una respuesta puede repetirse en varias líneas. */
  clave: string;
  ms: number;
  modelo: string;
  tokens: TokensUso;
  rapido: boolean;
  eeuu: boolean;
  busquedas: number;
  /** La carpeta de la transcripción dentro de ~/.claude/projects (la ruta del proyecto con "-"). */
  carpeta: string;
}

/** Cuántos días de registros se guardan (7 días + margen para el cambio de día). */
export const DIAS_GUARDADOS = 8;

function entero(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : 0;
}

/**
 * Una línea de una transcripción → su registro de uso, o `null` si no es una respuesta con uso (un
 * mensaje del usuario, una línea a medio escribir, un modelo "<synthetic>"…).
 */
export function leerLineaUso(linea: string, carpeta: string): RegistroUso | null {
  if (!linea.includes('"usage"')) return null;
  let datos: any;
  try {
    datos = JSON.parse(linea);
  } catch {
    return null;
  }
  const mensaje = datos?.message;
  const usage = mensaje?.usage;
  if (!usage || typeof usage !== "object" || typeof mensaje.model !== "string" || !mensaje.model.startsWith("claude")) return null;
  const ms = typeof datos.timestamp === "string" ? Date.parse(datos.timestamp) : NaN;
  if (!Number.isFinite(ms)) return null;
  const creacion = entero(usage.cache_creation_input_tokens);
  const detalle = usage.cache_creation && typeof usage.cache_creation === "object" ? usage.cache_creation : null;
  const escritura1h = detalle ? Math.min(creacion, entero(detalle.ephemeral_1h_input_tokens)) : 0;
  const idMensaje = typeof mensaje.id === "string" ? mensaje.id.slice(0, 120) : "";
  const idPedido = typeof datos.requestId === "string" ? datos.requestId.slice(0, 120) : "";
  const tokens: TokensUso = {
    entrada: entero(usage.input_tokens),
    // Los tokens de razonamiento (output_tokens_details.thinking_tokens) ya vienen en output_tokens.
    salida: entero(usage.output_tokens),
    // Sin el desglose, toda la escritura de caché se cuenta como de 5 minutos (la más común).
    escritura5m: creacion - escritura1h,
    escritura1h,
    lectura: entero(usage.cache_read_input_tokens),
  };
  return {
    clave: idMensaje || idPedido ? `${idMensaje}:${idPedido}` : `${ms}:${mensaje.model}:${Object.values(tokens).join(",")}`,
    ms,
    modelo: mensaje.model.slice(0, 80),
    tokens,
    rapido: usage.speed === "fast",
    eeuu: usage.inference_geo === "us",
    busquedas: entero(usage.server_tool_use?.web_search_requests),
    carpeta,
  };
}

/** El precio que corresponde a un registro (modo rápido incluido), o `null` si no se sabe. */
function precioDeRegistro(r: RegistroUso): Precio | null {
  const clave = claveModelo(r.modelo);
  const base = clave ? PRECIOS[clave] : undefined;
  if (!clave || !base) return null;
  if (!r.rapido) return base;
  const rapido = PRECIOS_RAPIDO[clave];
  if (!rapido) return null;
  const factor = rapido.entrada / base.entrada;
  return {
    nombre: base.nombre,
    entrada: rapido.entrada,
    escritura5m: base.escritura5m * factor,
    escritura1h: base.escritura1h * factor,
    lectura: base.lectura * factor,
    salida: rapido.salida,
  };
}

/** El valor API de una respuesta en USD (lo que costaría pagando por token), o `null` si no se sabe. */
export function valorApi(r: RegistroUso): number | null {
  const p = precioDeRegistro(r);
  if (!p) return null;
  const t = r.tokens;
  const tokens = (t.entrada * p.entrada + t.escritura5m * p.escritura5m + t.escritura1h * p.escritura1h + t.lectura * p.lectura + t.salida * p.salida) / 1_000_000;
  return (tokens + r.busquedas * USD_POR_BUSQUEDA) * (r.eeuu ? RECARGO_EEUU : 1);
}

export interface TotalUso {
  entrada: number;
  salida: number;
  /** Escritura y lectura de caché, juntas. */
  cache: number;
  /** Valor API en USD de lo que tiene precio. */
  usd: number;
  /** Tokens de modelos que no están en la tabla (se muestran sin USD). */
  sinPrecio: number;
}

export interface ResumenPeriodo {
  total: TotalUso;
  /** Lo que gastó Brote (OpenClaw corre en su workspace). */
  brote: TotalUso;
  /** Las sesiones de Claude Code del usuario. */
  tuyas: TotalUso;
  porModelo: { modelo: string; nombre: string; total: TotalUso }[];
  /** Los 3 proyectos que más gastan (Brote incluido). */
  proyectos: { nombre: string; brote: boolean; total: TotalUso }[];
}

export interface ResumenUso {
  hoy: ResumenPeriodo;
  semana: ResumenPeriodo;
  /** Los modelos usados en los 7 días (para la tabla de precios). */
  modelos: string[];
  calculadoMs: number;
}

function totalVacio(): TotalUso {
  return { entrada: 0, salida: 0, cache: 0, usd: 0, sinPrecio: 0 };
}

export function tokensDe(t: TotalUso): number {
  return t.entrada + t.salida + t.cache;
}

function sumar(total: TotalUso, r: RegistroUso): void {
  const t = r.tokens;
  total.entrada += t.entrada;
  total.salida += t.salida;
  total.cache += t.escritura5m + t.escritura1h + t.lectura;
  const usd = valorApi(r);
  if (usd === null) total.sinPrecio += t.entrada + t.salida + t.escritura5m + t.escritura1h + t.lectura;
  else total.usd += usd;
}

/** De más a menos gasto: primero el valor API y, si empatan (o no tienen precio), los tokens. */
function porGasto(a: TotalUso, b: TotalUso): number {
  return b.usd - a.usd || tokensDe(b) - tokensDe(a);
}

function resumirPeriodo(registros: RegistroUso[], carpetaBrote: string | null, nombreDe: (carpeta: string) => string): ResumenPeriodo {
  const resumen: ResumenPeriodo = { total: totalVacio(), brote: totalVacio(), tuyas: totalVacio(), porModelo: [], proyectos: [] };
  const modelos = new Map<string, TotalUso>();
  const proyectos = new Map<string, TotalUso>();
  for (const r of registros) {
    const esBrote = r.carpeta === carpetaBrote;
    sumar(resumen.total, r);
    sumar(esBrote ? resumen.brote : resumen.tuyas, r);
    const modelo = modelos.get(r.modelo) ?? totalVacio();
    sumar(modelo, r);
    modelos.set(r.modelo, modelo);
    const proyecto = proyectos.get(r.carpeta) ?? totalVacio();
    sumar(proyecto, r);
    proyectos.set(r.carpeta, proyecto);
  }
  resumen.porModelo = [...modelos]
    .map(([modelo, total]) => ({ modelo, nombre: nombreModelo(modelo), total }))
    .sort((a, b) => porGasto(a.total, b.total));
  resumen.proyectos = [...proyectos]
    .sort((a, b) => porGasto(a[1], b[1]))
    .slice(0, 3)
    .map(([carpeta, total]) => ({ nombre: carpeta === carpetaBrote ? "Brote" : nombreDe(carpeta), brote: carpeta === carpetaBrote, total }));
  return resumen;
}

/** La medianoche local de hace `dias` días. */
function medianoche(ahoraMs: number, dias: number): number {
  const d = new Date(ahoraMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dias).getTime();
}

/**
 * Hoy (desde la medianoche) y los últimos 7 días (hoy y los 6 anteriores). `carpetaBrote` es la
 * carpeta del workspace de OpenClaw; `nombreDe` da el nombre del proyecto de una carpeta.
 */
export function resumirUso(
  registros: RegistroUso[],
  ahoraMs: number,
  carpetaBrote: string | null,
  nombreDe: (carpeta: string) => string = nombreDeCarpeta,
): ResumenUso {
  const desdeHoy = medianoche(ahoraMs, 0);
  const desdeSemana = medianoche(ahoraMs, 6);
  const semana = registros.filter((r) => r.ms >= desdeSemana && r.ms <= ahoraMs + 60_000);
  return {
    hoy: resumirPeriodo(
      semana.filter((r) => r.ms >= desdeHoy),
      carpetaBrote,
      nombreDe,
    ),
    semana: resumirPeriodo(semana, carpetaBrote, nombreDe),
    modelos: [...new Set(semana.map((r) => r.modelo))],
    calculadoMs: ahoraMs,
  };
}

/**
 * El nombre de un proyecto sin mirar el disco: la carpeta es la ruta con "-" en vez de "/" y de
 * cualquier otro símbolo, así que no se puede deshacer con certeza; se quita lo que se sabe que es
 * la carpeta del usuario ("-Users-ana-") y queda el resto. uso-archivo.ts intenta antes reconstruir
 * la ruta real (`reconstruirRuta`).
 */
export function nombreDeCarpeta(carpeta: string, carpetaUsuario?: string): string {
  let resto = carpeta;
  if (carpetaUsuario && resto.startsWith(carpetaUsuario)) resto = resto.slice(carpetaUsuario.length);
  return resto.replace(/^-+/, "") || carpeta;
}

/**
 * Reconstruye la ruta real de una carpeta de ~/.claude/projects mirando qué carpetas existen: en cada
 * nivel busca una entrada cuyo nombre, con sus símbolos cambiados por "-", calce con lo que sigue.
 * `listar` devuelve las subcarpetas de una ruta (o `null`). Devuelve la ruta o `null` si no la encontró.
 */
export function reconstruirRuta(carpeta: string, listar: (ruta: string) => string[] | null, raiz = "/", separador = "/"): string | null {
  const codificar = (s: string) => s.replace(/[^A-Za-z0-9]/g, "-");
  const buscar = (ruta: string, resto: string, profundidad: number): string | null => {
    if (resto === "") return ruta;
    if (profundidad > 16 || !resto.startsWith("-")) return null;
    const entradas = listar(ruta);
    if (!entradas) return null;
    // Las más largas primero: "tarea-rust" antes que "tarea".
    for (const entrada of [...entradas].sort((a, b) => b.length - a.length)) {
      const codigo = `-${codificar(entrada)}`;
      if (resto === codigo || resto.startsWith(`${codigo}-`)) {
        const hallada = buscar(ruta.endsWith(separador) ? ruta + entrada : ruta + separador + entrada, resto.slice(codigo.length), profundidad + 1);
        if (hallada) return hallada;
      }
    }
    return null;
  };
  // En Windows la carpeta empieza con la unidad ("C--Users-ana-…").
  const unidad = carpeta.match(/^([A-Za-z])--/);
  if (unidad) return buscar(`${unidad[1]}:\\`, carpeta.slice(2), 0);
  return buscar(raiz, carpeta, 0);
}

// ---------------------------------------------------------------- formatos

/** "830", "12 k", "1,2 M", "3,4 B". */
export function formatearTokens(n: number): string {
  const coma = (x: number) => x.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${Math.round(n / 1000)} k`;
  if (n < 1_000_000_000) return `${coma(n / 1_000_000)} M`;
  return `${coma(n / 1_000_000_000)} B`;
}

/** "US$ 3,40", "US$ 0,02", "US$ 1.234". */
export function formatearUsd(usd: number): string {
  if (usd >= 1000) return `US$ ${Math.round(usd).toLocaleString("es-CL")}`;
  if (usd > 0 && usd < 0.01) return "US$ <0,01";
  return `US$ ${usd.toFixed(2).replace(".", ",")}`;
}

/** El valor API de un total, con aviso si una parte no tiene precio: "US$ 3,40", "US$ 3,40 + 2 M sin precio", "sin precio". */
export function valorDe(total: TotalUso): string {
  if (total.sinPrecio > 0 && total.usd === 0) return "sin precio";
  const usd = formatearUsd(total.usd);
  return total.sinPrecio > 0 ? `${usd} + ${formatearTokens(total.sinPrecio)} sin precio` : usd;
}

/** Lo que responde el motor a "¿cuánto he gastado en tokens?". */
export function describirUso(resumen: ResumenUso | null): string {
  if (!resumen) return "🪙 Todavía no veo tu uso de Claude (no encontré transcripciones de Claude Code en este computador).";
  const { hoy, semana } = resumen;
  if (tokensDe(semana.total) === 0) return "🪙 No usaste Claude Code en los últimos 7 días.";
  const linea = (nombre: string, p: ResumenPeriodo) => `${nombre}: ${formatearTokens(tokensDe(p.total))} tokens · ${valorDe(p.total)} en valor API`;
  const partes = [
    `🪙 ${linea("Hoy", hoy)}`,
    linea("7 días", semana),
    `De eso, Brote: ${valorDe(semana.brote)} · tus sesiones: ${valorDe(semana.tuyas)}.`,
  ];
  if (semana.proyectos.length > 0) partes.push(`Lo que más gasta: ${semana.proyectos.map((p) => p.nombre).join(", ")}.`);
  partes.push("Es lo que costaría pagando por token: tu plan no te cobra eso.");
  return partes.join("\n");
}
