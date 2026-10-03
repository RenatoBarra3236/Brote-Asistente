// Las funciones de Brote que se pueden prender y apagar (Configurar Brote → Funciones) y las tarjetas
// de Inicio en la isla. Sin imports de Node: también lo usan las ventanas (configuracion.ts, panel.ts).
//
// ~/.asistente-prototipo/funciones.json (permisos 600, lo escribe Rust con `guardar_funciones`):
//   { "version": 1, "activas": { "musica": false, … }, "tarjetas": { "orden": ["temporizadores", …], "ocultas": ["descargas"] } }
// Lo que falta en el archivo toma el valor del preset Estudiante: quien ya tenía Brote (sin archivo)
// sigue con casi todo prendido.

/** Ids de las funciones. La lista cerrada de Rust (`FUNCIONES` en funciones.rs) debe coincidir. */
export const IDS_FUNCIONES = [
  "gastos",
  "temporizadores",
  "calendario",
  "aula",
  "musica",
  "descargas",
  "equipo",
  "programador",
  "uso-del-plan",
  "memoria-local",
] as const;
export type IdFuncion = (typeof IDS_FUNCIONES)[number];

/** Ids de las tarjetas de Inicio, en su orden por defecto. La lista cerrada de Rust (`TARJETAS`) debe coincidir. */
export const IDS_TARJETAS = ["temporizadores", "calendario", "aula", "musica", "descargas", "claude"] as const;
export type IdTarjeta = (typeof IDS_TARJETAS)[number];

/** Los permisos de macOS que piden algunas funciones (Privacidad y seguridad). */
export type PermisoMac = "descargas" | "automatizacion" | "calendarios";

export interface Funcion {
  id: IdFuncion;
  nombre: string;
  /** Qué hace, en una línea. */
  descripcion: string;
  /** El permiso de macOS que pide, si pide alguno. */
  permiso: PermisoMac | null;
  /** La tarjeta de Inicio que muestra, si muestra alguna. */
  tarjeta: IdTarjeta | null;
}

export const FUNCIONES: readonly Funcion[] = [
  { id: "gastos", nombre: "Gastos", descripcion: "Anota y suma tus gastos al instante, sin IA ⚡.", permiso: null, tarjeta: null },
  {
    id: "temporizadores",
    nombre: "Pomodoro y recordatorios",
    descripcion: "Cronometra tu estudio y te recuerda cosas («recuérdame en 10 minutos…»).",
    permiso: null,
    tarjeta: "temporizadores",
  },
  {
    id: "calendario",
    nombre: "Calendario",
    descripcion: "Te dice qué tienes hoy y te avisa 10 minutos antes de cada clase.",
    permiso: "calendarios",
    tarjeta: "calendario",
  },
  {
    id: "aula",
    nombre: "Aula (Canvas o Moodle)",
    descripcion: "Tu próxima entrega, con aviso 24 h y 2 h antes. Solo lectura.",
    permiso: null,
    tarjeta: "aula",
  },
  {
    id: "musica",
    nombre: "Música",
    descripcion: "Muestra la canción de Spotify o Música y la controla desde la isla. Nunca abre una app.",
    permiso: "automatizacion",
    tarjeta: "musica",
  },
  {
    id: "descargas",
    nombre: "Descargas",
    descripcion: "Te avisa cuando termina una descarga y te la muestra en un clic.",
    permiso: "descargas",
    tarjeta: "descargas",
  },
  {
    id: "equipo",
    nombre: "Reacciones al computador",
    descripcion: "Brote se cansa con poca batería, suda con la CPU al máximo y te avisa si se llena el disco.",
    permiso: null,
    tarjeta: null,
  },
  {
    id: "programador",
    nombre: "Modo programador",
    descripcion: "Tus sesiones de Claude Code en vivo, y sus permisos para responder desde la isla.",
    permiso: null,
    tarjeta: "claude",
  },
  {
    id: "uso-del-plan",
    nombre: "Uso del plan de Claude",
    descripcion:
      "Cuánto llevas de tu sesión de 5 h y de la semana, y tus tokens con su valor API. Lo lee de Claude Code, de la app de Claude y, si hace falta, de una consulta mínima (~600 tokens, como mucho cada 15 min y solo con la pestaña Claude a la vista). Sin tocar tus credenciales.",
    permiso: null,
    tarjeta: null,
  },
  {
    id: "memoria-local",
    nombre: "Búsqueda por significado",
    descripcion: "Brote encuentra mejor lo que recuerda. Descarga un modelo de ~0,3 GB y funciona sin internet.",
    permiso: null,
    tarjeta: null,
  },
];

export const NOMBRES_TARJETAS: Record<IdTarjeta, string> = {
  temporizadores: "Pomodoro y temporizadores",
  calendario: "Próximo evento",
  aula: "Entregas",
  musica: "Música",
  descargas: "Descargas",
  claude: "Claude Code",
};

export type IdPreset = "estudiante" | "programador" | "todo" | "minimo";

/** Conjuntos listos para elegir de una vez. */
export const PRESETS: Record<IdPreset, { nombre: string; descripcion: string; activas: readonly IdFuncion[] }> = {
  estudiante: {
    nombre: "Estudiante",
    descripcion: "Gastos, pomodoro, calendario, aula, música, descargas y reacciones.",
    activas: ["gastos", "temporizadores", "calendario", "aula", "musica", "descargas", "equipo"],
  },
  programador: {
    nombre: "Programador",
    descripcion: "Lo de estudiante sin el aula, más tus sesiones de Claude Code y el uso de tu plan.",
    activas: ["gastos", "temporizadores", "calendario", "musica", "descargas", "equipo", "programador", "uso-del-plan"],
  },
  todo: { nombre: "Todo", descripcion: "Todas las funciones.", activas: [...IDS_FUNCIONES] },
  minimo: { nombre: "Lo mínimo", descripcion: "Solo conversar y anotar gastos. Sin permisos de macOS.", activas: ["gastos"] },
};

export interface ConfigFunciones {
  activas: Record<IdFuncion, boolean>;
  tarjetas: { orden: IdTarjeta[]; ocultas: IdTarjeta[] };
}

/** Las funciones activas de un preset. */
export function activasDePreset(preset: IdPreset): Record<IdFuncion, boolean> {
  const activas = PRESETS[preset].activas;
  return Object.fromEntries(IDS_FUNCIONES.map((id) => [id, activas.includes(id)])) as Record<IdFuncion, boolean>;
}

/** El preset que coincide exactamente con las funciones activas, si alguno. */
export function presetDe(activas: Record<IdFuncion, boolean>): IdPreset | null {
  for (const id of Object.keys(PRESETS) as IdPreset[]) {
    const del = activasDePreset(id);
    if (IDS_FUNCIONES.every((f) => del[f] === activas[f])) return id;
  }
  return null;
}

/** La configuración por defecto (preset Estudiante, tarjetas en su orden). */
export function funcionesPorDefecto(): ConfigFunciones {
  return { activas: activasDePreset("estudiante"), tarjetas: { orden: [...IDS_TARJETAS], ocultas: [] } };
}

/**
 * Lee lo que haya en el archivo (cualquier cosa) y devuelve una configuración completa: lo que no
 * es válido se ignora y lo que falta toma el valor por defecto. Las tarjetas que faltan en el orden
 * van al final.
 */
export function normalizarFunciones(datos: unknown): ConfigFunciones {
  const config = funcionesPorDefecto();
  if (!datos || typeof datos !== "object") return config;
  const { activas, tarjetas } = datos as { activas?: unknown; tarjetas?: unknown };
  if (activas && typeof activas === "object") {
    for (const id of IDS_FUNCIONES) {
      const valor = (activas as Record<string, unknown>)[id];
      if (typeof valor === "boolean") config.activas[id] = valor;
    }
  }
  if (tarjetas && typeof tarjetas === "object") {
    const { orden, ocultas } = tarjetas as { orden?: unknown; ocultas?: unknown };
    const validas = (lista: unknown): IdTarjeta[] =>
      Array.isArray(lista) ? [...new Set(lista.filter((t): t is IdTarjeta => (IDS_TARJETAS as readonly unknown[]).includes(t)))] : [];
    const primero = validas(orden);
    config.tarjetas.orden = [...primero, ...IDS_TARJETAS.filter((t) => !primero.includes(t))];
    config.tarjetas.ocultas = validas(ocultas);
  }
  return config;
}

/** Lo que se guarda en funciones.json. */
export function serializarFunciones(config: ConfigFunciones): string {
  return JSON.stringify({ version: 1, activas: config.activas, tarjetas: config.tarjetas });
}

/** La función de la que depende una intención del motor (`null`: siempre disponible, como "ver-memoria"). */
export function funcionDeIntencion(intencion: string): IdFuncion | null {
  if (/^(registrar-gasto|consultar-gastos|ultimos-gastos|borrar-ultimo-gasto)$/.test(intencion)) return "gastos";
  if (/^(pomodoro|temporizador|cancelar-pomodoro|cancelar-temporizador|consultar-temporizador)$/.test(intencion)) return "temporizadores";
  if (intencion.startsWith("calendario-")) return "calendario";
  if (intencion.startsWith("aula-")) return "aula";
  if (intencion.startsWith("musica-")) return "musica";
  if (/^(ver-descargas|abrir-ultima-descarga|mostrar-ultima-descarga)$/.test(intencion)) return "descargas";
  if (intencion === "estado-equipo") return "equipo";
  if (intencion === "programador-sesiones") return "programador";
  if (intencion.startsWith("plan-")) return "uso-del-plan";
  return null;
}

/** La función de la que depende una herramienta del servidor MCP (`null`: siempre disponible). */
export function funcionDeHerramienta(nombre: string): IdFuncion | null {
  if (nombre.startsWith("gastos_")) return "gastos";
  if (nombre.startsWith("temporizador_")) return "temporizadores";
  if (nombre.startsWith("calendario_")) return "calendario";
  if (nombre === "aula_entregas") return "aula";
  if (nombre.startsWith("musica_")) return "musica";
  if (nombre === "descargas_recientes") return "descargas";
  if (nombre === "equipo_estado") return "equipo";
  if (nombre === "programador_sesiones") return "programador";
  if (nombre === "claude_uso") return "uso-del-plan";
  return null;
}

/** Lo que responde el motor a una frase de una función apagada. */
export const MENSAJE_APAGADA = "Eso está apagado: actívalo en Configurar Brote ⚙️";

/**
 * Lo que responde una herramienta MCP de una función apagada. Dice qué pasa sin darle órdenes al
 * agente (una instrucción dentro de un resultado se parece a una inyección).
 */
export const MENSAJE_APAGADA_MCP = "Eso está apagado en Brote: el usuario puede activarlo en Configurar Brote ⚙️ → Funciones.";

/** Las funciones activas que usan un permiso de macOS. */
export function funcionesQueUsan(permiso: PermisoMac, activas: Record<IdFuncion, boolean>): Funcion[] {
  return FUNCIONES.filter((f) => f.permiso === permiso && activas[f.id]);
}
