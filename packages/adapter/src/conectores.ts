// Conectores: servicios externos (Todoist, Notion, GitHub, Canva…) que el agente usa como servidores
// MCP remotos registrados en OpenClaw. Este archivo es lógica pura: el catálogo, cómo se arman los
// comandos de la CLI de OpenClaw y cómo se lee lo que imprime. Lo usan Configurar Brote
// (configurar.ts, que ejecuta los comandos) y el puente (qué herramientas se permiten sin preguntar
// y cómo se llaman en la isla).
//
// Seguridad:
//   - Lo que no está en `soloLectura` pide permiso en la isla. Las listas son explícitas, sin
//     comodines: una herramienta nueva del servicio pide permiso hasta que la agreguemos aquí.
//   - Los conectores agregados por URL ("propios") nunca se permiten sin preguntar.
//   - La página de autorización solo se abre si es https y su host está en `hostsAutorizacion` de
//     ESE conector (Rust repite la lista en src-tauri/src/conectores.rs; una prueba revisa que coincidan).
//   - Un token personal (GitHub) nunca se registra ni va en un aviso: `ocultarSecretos` lo tapa en
//     todo texto que salga de aquí.

import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Autenticacion = "oauth" | "token";

export interface Conector {
  id: string;
  nombre: string;
  descripcion: string;
  url: string;
  transporte: "streamable-http";
  /** oauth: OpenClaw hace el registro dinámico y abre la autorización; token: el usuario pega un token. */
  auth: Autenticacion;
  /** Hosts donde puede estar la página de autorización (solo https). Vacío con token. */
  hostsAutorizacion: string[];
  /** Herramientas que se permiten sin preguntar, con su nombre exacto (sin `mcp__<id>__`). */
  soloLectura: string[];
  /** Si ya se probó de punta a punta en un Mac real. */
  probado: boolean;
  /** Con token: dónde crearlo y qué permisos darle (se muestra en Configurar Brote). */
  ayudaToken?: string;
}

export const CATALOGO: readonly Conector[] = [
  {
    id: "todoist",
    nombre: "Todoist",
    descripcion: "Tus tareas y proyectos: Brote puede ver qué tienes pendiente y, con tu permiso, agregar o completar tareas.",
    url: "https://ai.todoist.net/mcp",
    transporte: "streamable-http",
    auth: "oauth",
    hostsAutorizacion: ["todoist.com", "app.todoist.com"],
    soloLectura: [
      "fetch",
      "fetch-object",
      "find-activity",
      "find-comments",
      "find-completed-tasks",
      "find-filters",
      "find-labels",
      "find-project-collaborators",
      "find-projects",
      "find-reminders",
      "find-sections",
      "find-tasks",
      "find-tasks-by-date",
      "get-overview",
      "get-productivity-stats",
      "get-project-activity-stats",
      "get-project-health",
      "get-workspace-insights",
      "list-workspaces",
      "prompts_get",
      "prompts_list",
      "resources_list",
      "resources_read",
      "search",
      "user-info",
      "view-attachment",
    ],
    probado: true,
  },
  {
    id: "notion",
    nombre: "Notion",
    descripcion: "Tus páginas y bases de datos: Brote puede buscar y leer tus apuntes; escribir siempre pide permiso.",
    url: "https://mcp.notion.com/mcp",
    transporte: "streamable-http",
    auth: "oauth",
    hostsAutorizacion: ["mcp.notion.com", "www.notion.so", "notion.so"],
    soloLectura: ["notion-search", "notion-fetch", "notion-get-comments", "notion-get-users", "notion-get-user", "notion-get-self", "notion-get-teams"],
    probado: false,
  },
  {
    id: "github",
    nombre: "GitHub",
    descripcion: "Tus repositorios, issues y pull requests. Con un token de solo lectura Brote no puede cambiar nada.",
    url: "https://api.githubcopilot.com/mcp/",
    transporte: "streamable-http",
    // GitHub no acepta el registro dinámico de clientes OAuth: se usa un token personal.
    auth: "token",
    hostsAutorizacion: [],
    soloLectura: [
      "get_me",
      "get_file_contents",
      "get_commit",
      "get_label",
      "get_latest_release",
      "get_release_by_tag",
      "get_tag",
      "get_teams",
      "get_team_members",
      "get_check_run",
      "get_job_logs",
      "issue_read",
      "pull_request_read",
      "actions_get",
      "actions_list",
      "list_branches",
      "list_commits",
      "list_issues",
      "list_issue_types",
      "list_pull_requests",
      "list_releases",
      "list_tags",
      "search_code",
      "search_issues",
      "search_pull_requests",
      "search_repositories",
      "search_users",
    ],
    probado: false,
    ayudaToken:
      "Créalo en GitHub → Settings → Developer settings → Fine-grained tokens, con acceso de solo lectura (Contents, Issues, " +
      "Pull requests, Metadata, Actions) a los repositorios que quieras. Queda guardado en la configuración de OpenClaw.",
  },
  {
    id: "canva",
    nombre: "Canva",
    descripcion: "Tus diseños: Brote puede buscarlos y leerlos; crear o editar siempre pide permiso.",
    url: "https://mcp.canva.com/mcp",
    transporte: "streamable-http",
    auth: "oauth",
    hostsAutorizacion: ["mcp.canva.com", "www.canva.com", "canva.com"],
    soloLectura: [
      "get-assets",
      "get-brand-template-dataset",
      "get-design-dataset",
      "get-export-formats",
      "help",
      "list-brand-kits",
      "list-comments",
      "list-folder-items",
      "list-replies",
      "read-design",
      "resolve-shortlink",
      "search-brand-templates",
      "search-designs",
      "search-folders",
    ],
    probado: false,
  },
];

/** Nombres que un conector propio no puede usar: los del catálogo y el servidor de Brote. */
export const NOMBRES_RESERVADOS: readonly string[] = ["gastos", ...CATALOGO.map((c) => c.id)];

export function conectorDe(id: string): Conector | null {
  return CATALOGO.find((c) => c.id === id) ?? null;
}

// ---------------------------------------------------------------- validación

/** Un nombre para un conector propio: [a-z0-9-], de 2 a 32, sin guion al borde, sin chocar. */
export function validarNombre(nombre: string, existentes: Iterable<string> = []): string | null {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(nombre) || nombre.length < 2) {
    return "El nombre solo puede tener minúsculas, números y guiones (2 a 32 caracteres).";
  }
  if (NOMBRES_RESERVADOS.includes(nombre)) return `«${nombre}» ya lo usa Brote.`;
  if ([...existentes].includes(nombre)) return `Ya tienes un servidor llamado «${nombre}».`;
  return null;
}

/** La URL de un servidor MCP propio: solo https, con host, sin usuario ni contraseña, sin espacios. */
export function validarUrlServidor(texto: string): string | null {
  const limpio = texto.trim();
  if (limpio.length > 500 || /[\s"'`<>\\%^]/.test(limpio)) return null;
  try {
    const url = new URL(limpio);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    // Sin "%" ni "^": en Windows los argumentos pasan por cmd, que los interpreta.
    return /[%^]/.test(url.toString()) ? null : url.toString();
  } catch {
    return null;
  }
}

/** Un token personal: ASCII visible, sin espacios ni comillas, de largo razonable. */
export function validarToken(token: string): boolean {
  return /^[A-Za-z0-9_\-.~+/=]{20,400}$/.test(token);
}

/**
 * Si la página de autorización se puede abrir para este conector: https, sin usuario, y su host es
 * uno de los permitidos. Para un conector propio, el host del servidor o un subdominio de su dominio.
 */
export function autorizacionPermitida(url: string, hosts: readonly string[]): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return false;
    return hosts.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Hosts para la autorización de un conector propio: el del servidor y los de su dominio (dos últimas partes). */
export function hostsDePropio(urlServidor: string): { exactos: string[]; dominio: string } | null {
  try {
    const host = new URL(urlServidor).hostname.toLowerCase();
    return { exactos: [host], dominio: host.split(".").slice(-2).join(".") };
  } catch {
    return null;
  }
}

export function autorizacionPropiaPermitida(url: string, urlServidor: string): boolean {
  const hosts = hostsDePropio(urlServidor);
  if (!hosts) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || u.username || u.password) return false;
    return hosts.exactos.includes(host) || host === hosts.dominio || host.endsWith(`.${hosts.dominio}`);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- comandos de la CLI

/** `openclaw mcp add` para un conector OAuth del catálogo o un servidor propio. */
export function argsAgregarOauth(nombre: string, url: string): string[] {
  return ["mcp", "add", nombre, "--url", url, "--auth", "oauth", "--transport", "streamable-http"];
}

/** `openclaw mcp add` con un token personal (GitHub). El token va en la cabecera, nunca en un registro. */
export function argsAgregarConToken(nombre: string, url: string, token: string): string[] {
  if (!validarToken(token)) throw new Error("Ese token no parece válido.");
  return ["mcp", "add", nombre, "--url", url, "--transport", "streamable-http", "--header", `Authorization=Bearer ${token}`];
}

export const argsLogin = (nombre: string): string[] => ["mcp", "login", nombre];
export const argsLogout = (nombre: string): string[] => ["mcp", "logout", nombre];
export const argsQuitar = (nombre: string): string[] => ["mcp", "unset", nombre];
export const ARGS_RECARGAR: readonly string[] = ["mcp", "reload"];
export const ARGS_PROBAR: readonly string[] = ["mcp", "probe", "--json"];

// ---------------------------------------------------------------- lectura de la salida

/** Lo que interesa de una línea de `openclaw mcp login`. */
export type LineaLogin =
  | { tipo: "autorizar"; url: string }
  | { tipo: "esperando" }
  | { tipo: "listo" }
  | { tipo: "otra" };

/**
 * Interpreta una línea de `openclaw mcp login <n>` (salida real de OpenClaw 2026.9.7):
 *   Open this URL to authorize "todoist":
 *   https://todoist.com/oauth/authorize?response_type=code&…
 *   Waiting for the browser to return to OpenClaw...
 *   If the callback cannot reach this terminal, run openclaw mcp login todoist --code <code>.
 *   MCP OAuth credentials saved for "todoist".
 */
export function leerLineaLogin(linea: string): LineaLogin {
  const texto = linea.trim();
  if (/^https:\/\/\S+$/.test(texto)) return { tipo: "autorizar", url: texto };
  if (/^MCP OAuth credentials saved for /.test(texto)) return { tipo: "listo" };
  if (/^Waiting for the browser/.test(texto)) return { tipo: "esperando" };
  return { tipo: "otra" };
}

/** Si `openclaw mcp add` guardó el servidor ("Saved MCP server "todoist" to …"). */
export function guardadoAlAgregar(salida: string, nombre: string): boolean {
  return salida.includes(`Saved MCP server "${nombre}"`);
}

/** Cuántas herramientas tiene cada servidor según `openclaw mcp probe --json` (`null` si no se pudo leer). */
export function herramientasPorServidor(salida: string): Map<string, number> | null {
  let datos: any;
  try {
    // Por si algo se imprime antes del JSON (avisos de la CLI).
    datos = JSON.parse(salida.slice(Math.max(0, salida.indexOf("{"))));
  } catch {
    return null;
  }
  const servidores = datos?.servers;
  if (!servidores || typeof servidores !== "object") return null;
  const cuenta = new Map<string, number>();
  for (const [nombre, servidor] of Object.entries<any>(servidores)) {
    const tools = servidor?.tools;
    cuenta.set(nombre, typeof tools === "number" ? tools : Array.isArray(tools) ? tools.length : 0);
  }
  // `tools` de arriba trae "servidor__herramienta": sirve si un servidor no trae su cuenta.
  if (Array.isArray(datos.tools)) {
    for (const completo of datos.tools) {
      const nombre = typeof completo === "string" ? completo.split("__")[0] : null;
      if (nombre && !cuenta.get(nombre)) cuenta.set(nombre, datos.tools.filter((t: unknown) => typeof t === "string" && t.startsWith(`${nombre}__`)).length);
    }
  }
  return cuenta;
}

/** La URL de un servidor en `mcp.servers` de openclaw.json (o `null` si es de comando, como gastos). */
export function urlDeServidor(entrada: any): string | null {
  for (const valor of [entrada?.url, entrada?.endpoint, entrada?.transport?.url, entrada?.remote?.url]) {
    if (typeof valor === "string") return valor;
  }
  return null;
}

/** Misma URL sin importar la barra final ni mayúsculas en el host. */
function mismaUrl(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.protocol === y.protocol && x.host === y.host && x.pathname.replace(/\/$/, "") === y.pathname.replace(/\/$/, "") && x.search === y.search;
  } catch {
    return false;
  }
}

export type EstadoConector = "conectado" | "sin-autorizar" | "desconectado";

export interface FilaConector {
  id: string;
  nombre: string;
  descripcion: string;
  auth: Autenticacion;
  probado: boolean;
  estado: EstadoConector;
  herramientas: number;
  ayudaToken?: string;
}

export interface FilaPropio {
  id: string;
  url: string;
  estado: EstadoConector;
  herramientas: number;
}

/**
 * El estado de cada conector a partir de la configuración de OpenClaw y de `probe --json`:
 *   conectado      está en la configuración con la URL del catálogo y el probe le encontró herramientas
 *   sin-autorizar  está guardado pero sin herramientas (falta iniciar sesión, o el token no sirve)
 *   desconectado   no está
 * Un servidor con el nombre de un conector pero otra URL no cuenta como ese conector.
 */
export function estadoConectores(config: any, herramientas: Map<string, number> | null): { catalogo: FilaConector[]; propios: FilaPropio[] } {
  const servidores: Record<string, any> = config?.mcp?.servers ?? {};
  const catalogo = CATALOGO.map((c): FilaConector => {
    const url = urlDeServidor(servidores[c.id]);
    const guardado = url !== null && mismaUrl(url, c.url);
    const cuantas = herramientas?.get(c.id) ?? 0;
    return {
      id: c.id,
      nombre: c.nombre,
      descripcion: c.descripcion,
      auth: c.auth,
      probado: c.probado,
      estado: !guardado ? "desconectado" : cuantas > 0 ? "conectado" : "sin-autorizar",
      herramientas: guardado ? cuantas : 0,
      ...(c.ayudaToken ? { ayudaToken: c.ayudaToken } : {}),
    };
  });
  const propios = Object.entries(servidores)
    .filter(([nombre, entrada]) => !NOMBRES_RESERVADOS.includes(nombre) && urlDeServidor(entrada) !== null)
    .map(([nombre, entrada]): FilaPropio => {
      const cuantas = herramientas?.get(nombre) ?? 0;
      return { id: nombre, url: urlDeServidor(entrada)!, estado: cuantas > 0 ? "conectado" : "sin-autorizar", herramientas: cuantas };
    });
  return { catalogo, propios };
}

// ---------------------------------------------------------------- permisos (puente)

/** ~/.asistente-prototipo/conectores.json (600): qué conectores del catálogo están conectados. */
export const RUTA_CONECTORES = process.env.ASISTENTE_CONECTORES ?? join(homedir(), ".asistente-prototipo", "conectores.json");

/** Guarda los conectores del catálogo que están en la configuración (lo hace Configurar Brote). */
export function guardarConectados(ids: string[], ruta = RUTA_CONECTORES): void {
  const validos = ids.filter((id) => conectorDe(id) !== null);
  writeFileSync(ruta, `${JSON.stringify({ conectados: validos })}\n`, { mode: 0o600 });
  chmodSync(ruta, 0o600);
}

export function leerConectados(ruta = RUTA_CONECTORES): string[] {
  try {
    const datos = JSON.parse(readFileSync(ruta, "utf8"));
    return Array.isArray(datos?.conectados) ? datos.conectados.filter((id: unknown) => typeof id === "string" && conectorDe(id) !== null) : [];
  } catch {
    return [];
  }
}

/** Separa `mcp__<servidor>__<herramienta>`; `null` si no es una herramienta MCP. */
export function partirHerramienta(nombre: string): { servidor: string; herramienta: string } | null {
  const partes = /^mcp__([a-z0-9-]+)__(.+)$/.exec(nombre);
  return partes ? { servidor: partes[1], herramienta: partes[2] } : null;
}

/**
 * Si una herramienta de un conector se puede permitir sin preguntar: el conector está en el
 * catálogo, conectado (en conectores.json y en la configuración de OpenClaw con la URL del
 * catálogo) y la herramienta está, con su nombre exacto, en su lista de solo lectura.
 */
export function permitidaSinPreguntar(nombre: unknown, conectados: readonly string[], config: any): boolean {
  if (typeof nombre !== "string") return false;
  const partes = partirHerramienta(nombre);
  if (!partes) return false;
  const conector = conectorDe(partes.servidor);
  if (!conector || !conectados.includes(conector.id)) return false;
  const url = urlDeServidor(config?.mcp?.servers?.[conector.id]);
  if (url === null || !mismaUrl(url, conector.url)) return false;
  return conector.soloLectura.includes(partes.herramienta);
}

// ---------------------------------------------------------------- nombres bonitos (isla)

const VERBOS: Record<string, string> = {
  add: "Agregar",
  create: "Crear",
  find: "Buscar",
  search: "Buscar",
  get: "Ver",
  fetch: "Abrir",
  read: "Leer",
  list: "Ver",
  view: "Ver",
  update: "Actualizar",
  edit: "Editar",
  delete: "Borrar",
  remove: "Quitar",
  complete: "Completar",
  uncomplete: "Reabrir",
  reschedule: "Reprogramar",
  reorder: "Reordenar",
  move: "Mover",
  manage: "Gestionar",
  import: "Importar",
  export: "Exportar",
  analyze: "Analizar",
  comment: "Comentar",
  reply: "Responder",
  copy: "Copiar",
  duplicate: "Duplicar",
  upload: "Subir",
  generate: "Generar",
  merge: "Unir",
  resize: "Cambiar tamaño de",
  publish: "Publicar",
  resolve: "Resolver",
  query: "Consultar",
};

const PALABRAS: Record<string, string> = {
  task: "tarea",
  tasks: "tareas",
  project: "proyecto",
  projects: "proyectos",
  comment: "comentario",
  comments: "comentarios",
  label: "etiqueta",
  labels: "etiquetas",
  filter: "filtro",
  filters: "filtros",
  section: "sección",
  sections: "secciones",
  reminder: "recordatorio",
  reminders: "recordatorios",
  page: "página",
  pages: "páginas",
  database: "base de datos",
  design: "diseño",
  designs: "diseños",
  folder: "carpeta",
  folders: "carpetas",
  issue: "issue",
  issues: "issues",
  user: "usuario",
  users: "usuarios",
  team: "equipo",
  teams: "equipos",
  object: "objeto",
  by: "por",
  date: "fecha",
  completed: "completadas",
  overview: "resumen",
  me: "mi perfil",
  self: "mi perfil",
};

/** Nombres hechos a mano para las herramientas más comunes (el resto se arma con las tablas). */
const NOMBRES: Record<string, string> = {
  "todoist:find-tasks": "Buscar tareas",
  "todoist:find-tasks-by-date": "Ver tareas por fecha",
  "todoist:add-tasks": "Agregar tareas",
  "todoist:complete-tasks": "Completar tareas",
  "todoist:delete-object": "Borrar",
  "todoist:get-overview": "Ver resumen",
  "todoist:user-info": "Ver tu cuenta",
  "notion:notion-search": "Buscar",
  "notion:notion-fetch": "Leer una página",
  "notion:notion-create-pages": "Crear páginas",
  "notion:notion-update-page": "Modificar una página",
  "github:get_me": "Ver tu perfil",
  "github:pull_request_read": "Leer un pull request",
  "github:issue_read": "Leer un issue",
  "canva:search-designs": "Buscar diseños",
  "canva:read-design": "Leer un diseño",
};

/** "find-tasks-by-date" → "Buscar tareas por fecha" (lo que se pueda traducir; lo demás, tal cual). */
function traducirHerramienta(herramienta: string): string {
  const palabras = herramienta.replace(/^notion-/, "").split(/[-_]/).filter(Boolean);
  if (palabras.length === 0) return herramienta;
  const [verbo, ...resto] = palabras;
  const traducido = VERBOS[verbo];
  if (!traducido) return herramienta;
  return [traducido, ...resto.map((p) => PALABRAS[p] ?? p)].join(" ");
}

/**
 * Cómo se muestra una herramienta MCP en la isla: { servicio: "Todoist", accion: "Buscar tareas" }.
 * `null` para las de Brote (gastos) y lo que no es MCP. Un servidor propio muestra su nombre.
 */
export function nombreBonito(nombre: unknown): { servicio: string; accion: string; propio: boolean } | null {
  if (typeof nombre !== "string") return null;
  const partes = partirHerramienta(nombre);
  if (!partes || partes.servidor === "gastos") return null;
  const conector = conectorDe(partes.servidor);
  return {
    servicio: conector?.nombre ?? partes.servidor,
    accion: NOMBRES[`${partes.servidor}:${partes.herramienta}`] ?? traducirHerramienta(partes.herramienta),
    propio: conector === null,
  };
}

// ---------------------------------------------------------------- secretos

/** Tapa tokens que puedan aparecer en un texto (salida de la CLI, errores) antes de mostrarlo o registrarlo. */
export function ocultarSecretos(texto: string, secretos: readonly string[] = []): string {
  let limpio = texto;
  for (const secreto of secretos) if (secreto) limpio = limpio.split(secreto).join("••••");
  return limpio
    .replace(/(Bearer\s+)[^\s"']+/gi, "$1••••")
    .replace(/\b(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, "$1••••")
    .replace(/([?&](?:code|state|code_challenge|access_token|token)=)[^&\s]+/gi, "$1••••");
}
