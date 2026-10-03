// Brote mira la carpeta de descargas: avisa cuando algo se está descargando y cuando terminó, y
// sabe cuáles fueron las últimas. Las lecturas (listar la carpeta, `fs.watch`) tocan el sistema;
// la lógica (`SeguidorDescargas`, `recientes`, cómo se describe) es pura, para probarla con
// listados inventados. Los nombres de los archivos se quedan en el computador (Ley 21.719).
//
// Cada navegador descarga primero a un archivo temporal y al terminar lo renombra:
//   Chrome, Edge, Brave  apunte.pdf.crdownload (o "Unconfirmed 123.crdownload" antes de saber el nombre)
//   Safari               apunte.pdf.download   (una carpeta con el archivo a medias adentro)
//   Firefox              apunte.pdf.part       (y un apunte.pdf vacío mientras tanto)
//   Opera                apunte.pdf.opdownload

import { readdirSync, statSync, watch } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";

/** Un archivo o carpeta dentro de la carpeta de descargas, como lo deja `listarCarpeta`. */
export interface EntradaCarpeta {
  nombre: string;
  tamano: number;
  /** Cuándo llegó o cambió por última vez (ms). */
  fechaMs: number;
  carpeta: boolean;
}

export interface Descarga {
  nombre: string;
  ruta: string;
  tamano: number;
  fechaMs: number;
}

export interface DescargaEnCurso {
  /** El nombre del archivo temporal (no cambia mientras dura la descarga). */
  id: string;
  /** El nombre que tendrá al terminar, o `null` si el navegador todavía no lo sabe. */
  nombre: string | null;
  tamano: number;
}

const TEMPORALES = [".crdownload", ".download", ".part", ".opdownload"];

/** Lo que nunca es una descarga: archivos ocultos y los que crea el sistema. */
export function esIgnorado(nombre: string): boolean {
  return nombre.startsWith(".") || /^(desktop\.ini|thumbs\.db)$/i.test(nombre) || nombre.startsWith("~$");
}

export function esTemporal(nombre: string): boolean {
  const extension = extname(nombre).toLowerCase();
  return TEMPORALES.includes(extension) && nombre.length > extension.length;
}

/** "apunte.pdf.crdownload" → "apunte.pdf"; "Unconfirmed 123.crdownload" → `null` (aún sin nombre). */
export function nombreFinal(temporal: string): string | null {
  const sinExtension = temporal.slice(0, temporal.length - extname(temporal).length);
  if (/^unconfirmed \d+$/i.test(sinExtension) || !sinExtension) return null;
  return sinExtension;
}

/** Documentos que se pueden abrir sin miedo con la app por defecto. Programas e instaladores, no: se muestran. */
const SE_PUEDEN_ABRIR = new Set(
  "pdf doc docx odt rtf txt md csv ppt pptx odp key xls xlsx ods numbers pages epub png jpg jpeg gif webp heic svg mp3 m4a wav mp4 mov".split(" "),
);

export function sePuedeAbrir(nombre: string): boolean {
  return SE_PUEDEN_ABRIR.has(extname(nombre).slice(1).toLowerCase());
}

/**
 * Sigue la carpeta entre una revisión y la siguiente. La primera revisión solo toma nota de lo que
 * ya había (no avisa de descargas viejas). Una descarga está lista cuando su temporal desaparece y
 * aparece el archivo final; un archivo que llega directo (sin temporal) se da por listo cuando su
 * tamaño deja de cambiar entre dos revisiones.
 */
export class SeguidorDescargas {
  private anterior: Map<string, EntradaCarpeta> | null = null;
  /** Archivos nuevos que llegaron sin temporal, esperando que su tamaño se quede quieto. */
  private porConfirmar = new Map<string, number>();

  revisar(listado: EntradaCarpeta[], carpeta: string): { enCurso: DescargaEnCurso[]; listas: Descarga[] } {
    const actual = new Map(listado.filter((e) => !esIgnorado(e.nombre)).map((e) => [e.nombre, e]));
    const enCurso = [...actual.values()]
      .filter((e) => esTemporal(e.nombre))
      .map((e) => ({ id: e.nombre, nombre: nombreFinal(e.nombre), tamano: e.tamano }));
    const anterior = this.anterior;
    this.anterior = actual;
    if (!anterior) return { enCurso, listas: [] };

    const listas: Descarga[] = [];
    const lista = (e: EntradaCarpeta) => listas.push({ nombre: e.nombre, ruta: join(carpeta, e.nombre), tamano: e.tamano, fechaMs: e.fechaMs });
    const nuevos = [...actual.values()].filter((e) => !esTemporal(e.nombre) && !anterior.has(e.nombre));
    const reclamados = new Set<string>();

    // Temporales que desaparecieron: la descarga terminó (o se canceló, si no quedó nada).
    for (const viejo of anterior.values()) {
      if (!esTemporal(viejo.nombre) || actual.has(viejo.nombre)) continue;
      const nombre = nombreFinal(viejo.nombre);
      let final = nombre ? actual.get(nombre) : undefined;
      if (final && (esTemporal(final.nombre) || reclamados.has(final.nombre))) final = undefined;
      // Chrome renombra "Unconfirmed 123" al nombre real: sirve el archivo nuevo más reciente.
      final ??= nuevos.filter((e) => !reclamados.has(e.nombre)).sort((a, b) => b.fechaMs - a.fechaMs)[0];
      if (!final) continue;
      reclamados.add(final.nombre);
      this.porConfirmar.delete(final.nombre);
      lista(final);
    }

    // Archivos que llegaron sin temporal (o el vacío que deja Firefox mientras descarga).
    const temporalesDe = new Set(enCurso.map((d) => d.nombre).filter(Boolean));
    for (const nuevo of nuevos) {
      if (reclamados.has(nuevo.nombre) || nuevo.carpeta || temporalesDe.has(nuevo.nombre)) continue;
      this.porConfirmar.set(nuevo.nombre, nuevo.tamano);
    }
    for (const [nombre, tamano] of this.porConfirmar) {
      if (reclamados.has(nombre)) continue;
      const ahora = actual.get(nombre);
      if (!ahora || temporalesDe.has(nombre)) {
        if (!ahora) this.porConfirmar.delete(nombre);
        continue;
      }
      if (anterior.has(nombre) && ahora.tamano === tamano && tamano > 0) {
        this.porConfirmar.delete(nombre);
        lista(ahora);
      } else {
        this.porConfirmar.set(nombre, ahora.tamano);
      }
    }
    return { enCurso, listas };
  }
}

/** Las últimas descargas terminadas, de la más nueva a la más vieja. */
export function recientes(listado: EntradaCarpeta[], carpeta: string, limite = 10): Descarga[] {
  return listado
    .filter((e) => !e.carpeta && !esIgnorado(e.nombre) && !esTemporal(e.nombre))
    .sort((a, b) => b.fechaMs - a.fechaMs)
    .slice(0, limite)
    .map((e) => ({ nombre: e.nombre, ruta: join(carpeta, e.nombre), tamano: e.tamano, fechaMs: e.fechaMs }));
}

/** "830 KB", "2,3 MB", "1,2 GB". */
export function formatearTamano(bytes: number): string {
  const unidades = ["bytes", "KB", "MB", "GB"];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  const texto = i <= 1 || valor >= 10 ? String(Math.round(valor)) : valor.toFixed(1).replace(".", ",");
  return `${texto} ${unidades[i]}`;
}

/** "recién", "hace 5 min", "hace 2 h", "ayer", "hace 3 días". */
export function hace(ms: number): string {
  const minutos = Math.floor(ms / 60_000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "ayer" : `hace ${dias} días`;
}

export function describirDescargas(lista: Descarga[], ahora: number): string {
  if (lista.length === 0) return "No encontré descargas en tu carpeta de Descargas.";
  const lineas = lista.map((d) => `• ${d.nombre} (${formatearTamano(d.tamano)}, ${hace(ahora - d.fechaMs)})`);
  return `Tus últimas descargas:\n${lineas.join("\n")}`;
}

/** Cómo se llama el explorador de archivos en cada sistema. */
export function explorador(plataforma: string = process.platform): string {
  return plataforma === "darwin" ? "el Finder" : plataforma === "win32" ? "el Explorador" : "el explorador de archivos";
}

// ---------------------------------------------------------------- lecturas

/**
 * La carpeta de descargas: `ASISTENTE_DESCARGAS` o "Downloads" dentro de la carpeta personal (en
 * Windows, `%USERPROFILE%\Downloads`). Rust usa la misma regla para validar las rutas (descargas.rs).
 */
export function carpetaDescargas(): string {
  return process.env.ASISTENTE_DESCARGAS ?? join(homedir(), "Downloads");
}

/** Lo que hay en la carpeta, o `null` si no se pudo leer (no existe, sin permiso). */
export function listarCarpeta(carpeta: string): EntradaCarpeta[] | null {
  try {
    const entradas: EntradaCarpeta[] = [];
    for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
      if (esIgnorado(entrada.name)) continue;
      try {
        const datos = statSync(join(carpeta, entrada.name));
        let tamano = datos.size;
        // Safari descarga dentro de una carpeta "x.download": su tamaño es lo que lleva adentro.
        if (datos.isDirectory() && esTemporal(entrada.name)) {
          tamano = 0;
          for (const parte of readdirSync(join(carpeta, entrada.name))) {
            if (!esIgnorado(parte)) tamano += statSync(join(carpeta, entrada.name, parte)).size;
          }
        }
        entradas.push({
          nombre: entrada.name,
          tamano,
          fechaMs: Math.max(datos.mtimeMs, datos.ctimeMs, datos.birthtimeMs || 0),
          carpeta: datos.isDirectory(),
        });
      } catch {
        // Se borró mientras se listaba: no importa.
      }
    }
    return entradas;
  } catch {
    return null;
  }
}

/** Avisa (sin detalle) cada vez que algo cambia en la carpeta. Devuelve cómo dejar de vigilar. */
export function vigilarCarpeta(carpeta: string, alCambiar: () => void): () => void {
  try {
    const vigilante = watch(carpeta, { persistent: false }, () => alCambiar());
    vigilante.on("error", () => vigilante.close());
    return () => vigilante.close();
  } catch {
    // Sin permiso o sin la carpeta: queda la revisión periódica del puente.
    return () => {};
  }
}
