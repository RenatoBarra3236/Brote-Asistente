// "Lo que sé de ti" (paso 9): lee, corrige y olvida lo que Brote recuerda del usuario.
//
// Hay tres lugares:
//   - Los recuerdos de Brote: la memoria de Claude Code para el workspace de OpenClaw (un archivo
//     por recuerdo, con frontmatter, más el índice MEMORY.md que se carga en cada sesión).
//   - Las conversaciones guardadas: los resúmenes que OpenClaw escribe en cada /new o /reset.
//   - Lo importado: memorias de otros proyectos de Claude Code que OpenClaw copió al instalarse.
//
// Olvidar manda el archivo a la Papelera (se puede recuperar) y lo saca del índice.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type TipoRecuerdo = "brote" | "conversacion" | "importado";

export interface Recuerdo {
  /** `<tipo>:<nombre>`; el nombre es un archivo o carpeta, nunca una ruta. */
  id: string;
  tipo: TipoRecuerdo;
  titulo: string;
  texto: string;
  /** Fecha ISO, si se conoce. */
  fecha: string | null;
  /** Solo los recuerdos de Brote se pueden corregir; el resto, solo olvidar. */
  editable: boolean;
}

export interface Lugares {
  brote: string;
  conversaciones: string;
  importados: string;
}

export const LUGARES: Lugares = {
  brote: join(homedir(), ".claude", "projects", "-Users-renatobarra--openclaw-workspace", "memory"),
  conversaciones: join(homedir(), ".openclaw", "workspace", "memory"),
  importados: join(homedir(), ".openclaw", "workspace", "memory", "imports", "claude-code"),
};

const INDICE = "MEMORY.md";
const NOMBRE_VALIDO = /^[\w.-]+$/;
const CONVERSACION = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.md$/;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Manda un archivo o carpeta a la Papelera de macOS (o lo borra en otros sistemas). */
export function aLaPapelera(ruta: string): void {
  if (process.platform === "darwin") {
    execFileSync("osascript", ["-e", `tell application "Finder" to delete POSIX file ${JSON.stringify(ruta)}`], {
      stdio: "ignore",
    });
    return;
  }
  rmSync(ruta, { recursive: true, force: true });
}

interface Documento {
  campos: Record<string, string>;
  /** Las líneas del frontmatter tal cual, para reescribirlo sin perder nada. */
  frontmatter: string[];
  cuerpo: string;
}

/** Separa el frontmatter (`---` … `---`) del cuerpo y lee sus campos de primer nivel. */
function leerDocumento(contenido: string): Documento {
  const lineas = contenido.split("\n");
  if (lineas[0]?.trim() !== "---") return { campos: {}, frontmatter: [], cuerpo: contenido.trim() };
  const fin = lineas.indexOf("---", 1);
  if (fin < 0) return { campos: {}, frontmatter: [], cuerpo: contenido.trim() };
  const frontmatter = lineas.slice(1, fin);
  const campos: Record<string, string> = {};
  for (const linea of frontmatter) {
    const par = linea.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!par) continue;
    let valor = par[2].trim();
    if (valor.startsWith('"')) {
      try {
        valor = JSON.parse(valor);
      } catch {
        valor = valor.slice(1, -1);
      }
    }
    campos[par[1]] = valor;
  }
  return { campos, frontmatter, cuerpo: lineas.slice(fin + 1).join("\n").trim() };
}

function fechaDe(ruta: string, campo?: string): string | null {
  if (campo && !Number.isNaN(Date.parse(campo))) return new Date(campo).toISOString();
  try {
    return statSync(ruta).mtime.toISOString();
  } catch {
    return null;
  }
}

function recortar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;
}

function archivosMd(carpeta: string): string[] {
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta).filter((nombre) => nombre.endsWith(".md") && statSync(join(carpeta, nombre)).isFile());
}

/** "Users-renatobarra-Desktop-Repositorios-alumco-proyecto-1ba1220cbd" → "alumco-proyecto". */
export function nombreDeProyecto(carpeta: string): string {
  return carpeta
    .replace(/-[0-9a-f]{10}$/, "")
    .replace(/^Users-[^-]+-/, "")
    .replace(/^(Desktop-|Documents-)?(Repositorios-|GitHub-)?(Library-Application-Support-Claude-scratch-workspaces-*)?/, "") ||
    "conversaciones con Claude";
}

/** Todo lo que Brote recuerda, agrupado por tipo y del más reciente al más antiguo. */
export function listarRecuerdos(lugares: Lugares = LUGARES): Recuerdo[] {
  const recuerdos: Recuerdo[] = [];

  for (const nombre of archivosMd(lugares.brote)) {
    if (nombre === INDICE) continue;
    const ruta = join(lugares.brote, nombre);
    const contenido = readFileSync(ruta, "utf8");
    const { campos, cuerpo } = leerDocumento(contenido);
    const modificado = contenido.match(/^\s*modified:\s*(\S+)/m)?.[1];
    recuerdos.push({
      id: `brote:${nombre}`,
      tipo: "brote",
      titulo: campos.description || campos.name || nombre,
      texto: cuerpo,
      fecha: fechaDe(ruta, modificado || undefined),
      editable: true,
    });
  }

  for (const nombre of archivosMd(lugares.conversaciones)) {
    const partes = nombre.match(CONVERSACION);
    if (!partes) continue;
    const ruta = join(lugares.conversaciones, nombre);
    const contenido = readFileSync(ruta, "utf8");
    const resumen = (contenido.split("## Conversation Summary")[1] ?? contenido)
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((linea) =>
        linea
          .replace(/^user:\s*/, "Tú: ")
          .replace(/^assistant:\s*/, "Brote: ")
          .replace(/"(.*)"$/, "$1")
          .replace(/\\n/g, " "),
      )
      .join("\n");
    const [, anio, mes, dia, hora, minuto] = partes;
    recuerdos.push({
      id: `conversacion:${nombre}`,
      tipo: "conversacion",
      titulo: `Conversación del ${Number(dia)} de ${MESES[Number(mes) - 1]}, ${hora}:${minuto}`,
      texto: recortar(resumen, 700),
      fecha: new Date(Number(anio), Number(mes) - 1, Number(dia), Number(hora), Number(minuto)).toISOString(),
      editable: false,
    });
  }

  if (existsSync(lugares.importados)) {
    for (const carpeta of readdirSync(lugares.importados)) {
      const ruta = join(lugares.importados, carpeta);
      if (!statSync(ruta).isDirectory()) continue;
      const temas = archivosMd(ruta)
        .filter((nombre) => nombre !== INDICE)
        .map((nombre) => {
          const { campos, cuerpo } = leerDocumento(readFileSync(join(ruta, nombre), "utf8"));
          return `• ${recortar(campos.description || campos.name || cuerpo.split("\n")[0] || nombre, 140)}`;
        });
      recuerdos.push({
        id: `importado:${carpeta}`,
        tipo: "importado",
        titulo: `Proyecto «${nombreDeProyecto(carpeta)}» (importado de Claude Code)`,
        texto: temas.length > 0 ? temas.join("\n") : "Solo el índice, sin recuerdos.",
        fecha: fechaDe(ruta),
        editable: false,
      });
    }
  }

  return recuerdos.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
}

/** La ruta de un recuerdo a partir de su id, o un error si el id no es válido. */
function ubicar(id: string, lugares: Lugares): { tipo: TipoRecuerdo; nombre: string; ruta: string } {
  const [tipo, nombre, ...resto] = id.split(":");
  if (resto.length > 0 || !nombre || !NOMBRE_VALIDO.test(nombre) || nombre === "." || nombre === "..") {
    throw new Error("Recuerdo no válido");
  }
  const carpeta = tipo === "brote" ? lugares.brote : tipo === "conversacion" ? lugares.conversaciones : tipo === "importado" ? lugares.importados : null;
  if (!carpeta || (tipo === "brote" && nombre === INDICE) || (tipo === "conversacion" && !CONVERSACION.test(nombre))) {
    throw new Error("Recuerdo no válido");
  }
  const ruta = join(carpeta, nombre);
  if (!existsSync(ruta)) throw new Error("Ese recuerdo ya no existe");
  return { tipo: tipo as TipoRecuerdo, nombre, ruta };
}

/** Saca del índice de Brote la línea que apunta a un archivo. */
function quitarDelIndice(lugares: Lugares, nombre: string): void {
  const indice = join(lugares.brote, INDICE);
  if (!existsSync(indice)) return;
  const lineas = readFileSync(indice, "utf8").split("\n");
  const quedan = lineas.filter((linea) => !linea.includes(`](${nombre})`));
  if (quedan.length !== lineas.length) writeFileSync(indice, quedan.join("\n"));
}

/** Olvida un recuerdo: va a la Papelera y, si era de Brote, sale de su índice. */
export function olvidarRecuerdo(id: string, lugares: Lugares = LUGARES, eliminar: (ruta: string) => void = aLaPapelera): void {
  const { tipo, nombre, ruta } = ubicar(id, lugares);
  eliminar(ruta);
  if (tipo === "brote") quitarDelIndice(lugares, nombre);
}

/** Corrige un recuerdo de Brote: el texto nuevo reemplaza al anterior y a su resumen. */
export function corregirRecuerdo(id: string, texto: string, lugares: Lugares = LUGARES): void {
  const { tipo, nombre, ruta } = ubicar(id, lugares);
  if (tipo !== "brote") throw new Error("Solo se pueden corregir los recuerdos de Brote");
  const limpio = texto.trim();
  if (!limpio) throw new Error("El recuerdo no puede quedar vacío");
  const resumen = recortar(limpio.split("\n").find((linea) => linea.trim()) ?? limpio, 200).replace(/\s+/g, " ");

  const { frontmatter } = leerDocumento(readFileSync(ruta, "utf8"));
  const ahora = new Date().toISOString();
  const nuevo = frontmatter
    .map((linea) => (/^description:/.test(linea) ? `description: ${JSON.stringify(resumen)}` : linea))
    .map((linea) => (/^\s*modified:/.test(linea) ? linea.replace(/modified:.*/, `modified: ${ahora}`) : linea));
  if (!nuevo.some((linea) => /^description:/.test(linea))) nuevo.push(`description: ${JSON.stringify(resumen)}`);
  writeFileSync(ruta, ["---", ...nuevo, "---", "", limpio, ""].join("\n"));

  // El índice muestra el resumen después del enlace: se actualiza para que calce.
  const indice = join(lugares.brote, INDICE);
  if (existsSync(indice)) {
    const lineas = readFileSync(indice, "utf8").split("\n");
    writeFileSync(
      indice,
      lineas.map((linea) => (linea.includes(`](${nombre})`) ? linea.replace(/ — .*$/, ` — ${resumen}`) : linea)).join("\n"),
    );
  }
}

/** Minúsculas y sin tildes, para buscar "notebook" o "Ahorro" sin importar cómo se escribió. */
function simplificar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Todo el texto de un recuerdo (el archivo completo, o todos los archivos de una carpeta importada). */
function contenidoCompleto(ruta: string): string {
  if (!statSync(ruta).isDirectory()) return readFileSync(ruta, "utf8");
  return archivosMd(ruta)
    .map((nombre) => readFileSync(join(ruta, nombre), "utf8"))
    .join("\n");
}

/** Los recuerdos que mencionan un tema, buscando en su contenido completo (no solo en lo que se muestra). */
export function buscarRecuerdos(tema: string, lugares: Lugares = LUGARES): Recuerdo[] {
  const buscado = simplificar(tema.trim());
  if (buscado.length < 3) throw new Error("Escribe al menos 3 letras");
  return listarRecuerdos(lugares).filter((recuerdo) => {
    const { ruta } = ubicar(recuerdo.id, lugares);
    return simplificar(`${recuerdo.titulo}\n${contenidoCompleto(ruta)}`).includes(buscado);
  });
}
