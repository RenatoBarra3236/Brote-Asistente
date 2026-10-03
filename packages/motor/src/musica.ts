// La música que suena en el computador: canción, artista y si está sonando, más play/pausa,
// siguiente y anterior. En macOS habla con Spotify y Música (Apple Music) por `osascript`, pero
// solo si ya están abiertas: primero mira la lista de procesos y nunca abre una app. En Windows usa
// los controles de medios del sistema (GlobalSystemMediaTransportControlsSessionManager) desde
// PowerShell, así sirve cualquier reproductor (Spotify, el navegador, Groove…). En Linux no hace nada.
//
// Los comandos se arman solo con constantes (apps y acciones de una lista cerrada); la lógica de
// interpretar sus salidas es pura y tiene pruebas. Cualquier falla (sin la app, sin permiso de
// Automatización, sin PowerShell) termina en `null`, sin errores. Lo que suena no sale del computador.

import { execFile } from "node:child_process";

export type AppMusica = "Spotify" | "Music";
export type AccionMusica = "play-pausa" | "play" | "pausa" | "siguiente" | "anterior";
export const ACCIONES_MUSICA: readonly AccionMusica[] = ["play-pausa", "play", "pausa", "siguiente", "anterior"];

export interface EstadoMusica {
  /** "Spotify", "Música" o, en Windows, el nombre del programa que la reproduce. */
  app: string;
  sonando: boolean;
  cancion: string | null;
  artista: string | null;
}

/** El resultado de una lectura: lo que suena, o que la app no dio permiso (para no insistir). */
export interface LecturaMusica {
  estado: EstadoMusica | null;
  sinPermiso: AppMusica[];
}

export interface Comando {
  programa: string;
  args: string[];
}

const NOMBRE_VISIBLE: Record<AppMusica, string> = { Spotify: "Spotify", Music: "Música" };

// ---------------------------------------------------------------- macOS

/** Qué apps de música están abiertas, según `ps -Ao comm=` (sin preguntarle nada a las apps). */
export function appsAbiertas(salidaPs: string): AppMusica[] {
  const abiertas: AppMusica[] = [];
  for (const linea of salidaPs.split("\n")) {
    const comando = linea.trim();
    if (/\/Spotify\.app\/Contents\/MacOS\/Spotify$/.test(comando) && !abiertas.includes("Spotify")) abiertas.push("Spotify");
    if (/\/Music\.app\/Contents\/MacOS\/Music$/.test(comando) && !abiertas.includes("Music")) abiertas.push("Music");
  }
  return abiertas;
}

/**
 * JXA que lee el estado de las apps indicadas. `running()` no abre la app; aun así solo se llama
 * con las que `ps` mostró abiertas. Un error de permiso (-1743) se informa para no volver a preguntar.
 */
function scriptLectura(apps: AppMusica[]): string {
  return `
function leer(nombre) {
  try {
    const app = Application(nombre);
    if (!app.running()) return null;
    const estado = app.playerState();
    if (estado === "stopped") return { app: nombre, estado: estado };
    const pista = app.currentTrack;
    return { app: nombre, estado: estado, cancion: pista.name(), artista: pista.artist() };
  } catch (error) {
    return { app: nombre, error: String(error) };
  }
}
JSON.stringify(${JSON.stringify(apps)}.map(leer));`;
}

export function comandoLecturaMac(apps: AppMusica[]): Comando | null {
  const validas = apps.filter((a): a is AppMusica => a === "Spotify" || a === "Music");
  if (validas.length === 0) return null;
  return { programa: "osascript", args: ["-l", "JavaScript", "-e", scriptLectura(validas)] };
}

const METODO: Record<AccionMusica, string> = {
  "play-pausa": "playpause",
  play: "play",
  pausa: "pause",
  siguiente: "nextTrack",
  anterior: "previousTrack",
};

export function comandoControlMac(app: AppMusica, accion: AccionMusica): Comando | null {
  if ((app !== "Spotify" && app !== "Music") || !(accion in METODO)) return null;
  // Solo si sigue abierta: nunca la abre.
  const script = `const app = Application(${JSON.stringify(app)}); if (app.running()) app.${METODO[accion]}();`;
  return { programa: "osascript", args: ["-l", "JavaScript", "-e", script] };
}

/** La salida del JXA → lo que suena (o lo que está en pausa) y las apps que negaron el permiso. */
export function interpretarJxa(salida: string): LecturaMusica {
  const sinPermiso: AppMusica[] = [];
  let datos: unknown;
  try {
    datos = JSON.parse(salida.trim());
  } catch {
    return { estado: null, sinPermiso };
  }
  if (!Array.isArray(datos)) return { estado: null, sinPermiso };
  const estados: EstadoMusica[] = [];
  for (const d of datos) {
    if (!d || (d.app !== "Spotify" && d.app !== "Music")) continue;
    if (typeof d.error === "string") {
      if (/-1743|not authori[sz]ed|no autorizad/i.test(d.error)) sinPermiso.push(d.app);
      continue;
    }
    if (d.estado !== "playing" && d.estado !== "paused") continue;
    const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    estados.push({ app: NOMBRE_VISIBLE[d.app as AppMusica], sonando: d.estado === "playing", cancion: texto(d.cancion), artista: texto(d.artista) });
  }
  return { estado: elegir(estados), sinPermiso };
}

/** Si hay varias, la que suena; si ninguna suena, la primera en pausa. */
export function elegir(estados: EstadoMusica[]): EstadoMusica | null {
  return estados.find((e) => e.sonando) ?? estados[0] ?? null;
}

// ---------------------------------------------------------------- Windows

// PowerShell 5.1 no sabe esperar operaciones de WinRT: se usa `AsTask` de .NET. Estado del sistema:
// 4 = sonando, 5 = en pausa (0–3: cerrado, abriendo, cambiando, detenido).
const PREPARAR_WINRT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Esperar($op, $tipo) { $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); $null = $t.Wait(3000); $t.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$gestor = Esperar ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$sesion = $gestor.GetCurrentSession()
`;

const LEER_WINDOWS = `${PREPARAR_WINRT}
if ($sesion) {
  $p = Esperar ($sesion.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  [pscustomobject]@{ app = $sesion.SourceAppUserModelId; estado = [int]$sesion.GetPlaybackInfo().PlaybackStatus; cancion = $p.Title; artista = $p.Artist } | ConvertTo-Json -Compress
}`;

const METODO_WINDOWS: Record<AccionMusica, string> = {
  "play-pausa": "TryTogglePlayPauseAsync",
  play: "TryPlayAsync",
  pausa: "TryPauseAsync",
  siguiente: "TrySkipNextAsync",
  anterior: "TrySkipPreviousAsync",
};

export function comandoLecturaWindows(): Comando {
  return { programa: "powershell", args: ["-NoProfile", "-NonInteractive", "-Command", LEER_WINDOWS] };
}

export function comandoControlWindows(accion: AccionMusica): Comando | null {
  if (!(accion in METODO_WINDOWS)) return null;
  const script = `${PREPARAR_WINRT}
if ($sesion) { $null = Esperar ($sesion.${METODO_WINDOWS[accion]}()) ([bool]) }`;
  return { programa: "powershell", args: ["-NoProfile", "-NonInteractive", "-Command", script] };
}

/** "Spotify.exe" → "Spotify"; "Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic" → "ZuneMusic". */
export function nombreDeAppWindows(id: string): string {
  const sinPaquete = id.split("!").pop() ?? id;
  const ultimo = sinPaquete.split(/[\\/]/).pop() ?? sinPaquete;
  const limpio = ultimo.replace(/\.exe$/i, "").replace(/^Microsoft\./, "").replace(/_[a-z0-9]{13}$/, "");
  const conocidos: Record<string, string> = { chrome: "Chrome", msedge: "Edge", firefox: "Firefox", spotify: "Spotify", zunemusic: "Reproductor multimedia" };
  return conocidos[limpio.toLowerCase()] ?? limpio;
}

export function interpretarGsmtc(salida: string): EstadoMusica | null {
  try {
    const d = JSON.parse(salida.trim());
    if (d?.estado !== 4 && d?.estado !== 5) return null;
    const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return { app: nombreDeAppWindows(String(d.app ?? "")), sonando: d.estado === 4, cancion: texto(d.cancion), artista: texto(d.artista) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- textos

/** "«Flowers» de Miley Cyrus". */
export function tituloCancion(estado: EstadoMusica): string {
  if (!estado.cancion) return "algo";
  return estado.artista ? `«${estado.cancion}» de ${estado.artista}` : `«${estado.cancion}»`;
}

export function describirMusica(estado: EstadoMusica | null): string {
  if (!estado) return "No está sonando nada (miro Spotify y Música si están abiertos).";
  return estado.sonando
    ? `🎵 Está sonando ${tituloCancion(estado)} en ${estado.app}.`
    : `⏸ ${estado.app} está en pausa: ${tituloCancion(estado)}.`;
}

/** Lo que dice Brote al pedirle algo a la música (antes de saber el resultado). */
export function respuestaControl(accion: AccionMusica, estado: EstadoMusica | null): string {
  if (!estado) return "No veo música abierta (Spotify o Música). Ábrela tú y le doy play 🎵";
  switch (accion) {
    case "pausa":
      return estado.sonando ? "⏸ Pausé la música." : "La música ya estaba en pausa.";
    case "play":
      return estado.sonando ? `Ya está sonando ${tituloCancion(estado)} 🎵` : "▶️ ¡Dale play! 🎵";
    case "play-pausa":
      return estado.sonando ? "⏸ Pausé la música." : "▶️ ¡Dale play! 🎵";
    case "siguiente":
      return "⏭ Siguiente canción.";
    case "anterior":
      return "⏮ Canción anterior.";
  }
}

// ---------------------------------------------------------------- lecturas

/** Corre un comando: `null` si falla o tarda (sin la app, sin permiso, sin PowerShell). */
export function ejecutarEsperando(comando: Comando, tiempoMs = 8000): Promise<string | null> {
  return new Promise((listo) => {
    execFile(comando.programa, comando.args, { encoding: "utf8", timeout: tiempoMs, windowsHide: true }, (error, salida) =>
      listo(error ? null : salida),
    );
  });
}

type Ejecutor = (comando: Comando) => Promise<string | null>;

/** Qué hacer con la lista de procesos de macOS: el JXA para las apps abiertas, o nada si no hay. */
function lecturaMac(ps: string, ignorar: AppMusica[]): Comando | null {
  return comandoLecturaMac(appsAbiertas(ps).filter((a) => !ignorar.includes(a)));
}

const NADA: LecturaMusica = { estado: null, sinPermiso: [] };

/** Lee lo que suena. `ignorar`: apps que ya negaron el permiso (no se les vuelve a preguntar). */
export async function leerMusica(ignorar: AppMusica[] = [], ejecutar: Ejecutor = ejecutarEsperando): Promise<LecturaMusica | null> {
  if (process.platform === "darwin") {
    const ps = await ejecutar({ programa: "ps", args: ["-Ao", "comm="] });
    const comando = ps === null ? null : lecturaMac(ps, ignorar);
    if (!comando) return ps === null ? null : NADA;
    const salida = await ejecutar(comando);
    return salida === null ? null : interpretarJxa(salida);
  }
  if (process.platform === "win32") {
    const salida = await ejecutar(comandoLecturaWindows());
    // Sin sesión de medios PowerShell no imprime nada: no suena nada.
    return salida === null ? null : { estado: interpretarGsmtc(salida), sinPermiso: [] };
  }
  return null;
}

/** El comando para pedirle algo a la app que suena (o a la que está en pausa), o `null`. */
export function comandoControl(accion: AccionMusica, estado: EstadoMusica | null, plataforma: string = process.platform): Comando | null {
  if (!ACCIONES_MUSICA.includes(accion) || !estado) return null;
  if (plataforma === "darwin") {
    const app = (Object.keys(NOMBRE_VISIBLE) as AppMusica[]).find((a) => NOMBRE_VISIBLE[a] === estado.app);
    return app ? comandoControlMac(app, accion) : null;
  }
  return plataforma === "win32" ? comandoControlWindows(accion) : null;
}

/** Pide algo a la música. Devuelve si se pudo pedir. */
export async function controlarMusica(accion: AccionMusica, estado: EstadoMusica | null): Promise<boolean> {
  const comando = comandoControl(accion, estado);
  return comando !== null && (await ejecutarEsperando(comando)) !== null;
}
