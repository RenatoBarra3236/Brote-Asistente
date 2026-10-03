// Plantillas: frases con huecos que el motor reconoce sin IA. Se escriben en un formato
// simple para que en el paso 7 el LLM pueda proponer plantillas nuevas y el usuario las
// confirme:
//
//   palabra      debe aparecer tal cual (sin tildes y en minúsculas)
//   [a b]        opcional        [a|b]  opcional, una de varias
//   (a|b c)      una de varias
//   {ranura}     lo que se captura: {monto}, {cosa}, {periodo} o {categoria}
//
// Ejemplo: "[me] (gaste|pague) {monto} en {cosa}" reconoce "Gasté 5 lucas en almuerzo".

import { NOMBRES_DE_CATEGORIA } from "./categorias.ts";
import { FORMAS_DE_PERIODO } from "./periodos.ts";
import { normalizarConMapa } from "./texto.ts";
import { PATRON_DURACION } from "./tiempo.ts";

export type Intencion =
  | "registrar-gasto"
  | "consultar-gastos"
  | "ultimos-gastos"
  | "borrar-ultimo-gasto"
  | "ver-memoria"
  | "pomodoro"
  | "temporizador"
  | "cancelar-pomodoro"
  | "cancelar-temporizador"
  | "consultar-temporizador"
  | "estado-equipo"
  | "ver-descargas"
  | "abrir-ultima-descarga"
  | "mostrar-ultima-descarga"
  | "musica-pausa"
  | "musica-play"
  | "musica-siguiente"
  | "musica-anterior"
  | "musica-estado";

export type Ranura = "monto" | "cosa" | "periodo" | "categoria" | "tiempo";

export interface Plantilla {
  id: string;
  intencion: Intencion;
  patron: string;
  /** "base": viene con la app; "aprendida": la propuso el LLM y el usuario la confirmó (paso 7). */
  origen: "base" | "aprendida";
}

export interface Coincidencia {
  /** Lo capturado en cada ranura, normalizado (para interpretarlo). */
  ranuras: Partial<Record<Ranura, string>>;
  /** Lo capturado en cada ranura tal como lo escribió el usuario (para mostrarlo). */
  originales: Partial<Record<Ranura, string>>;
}

type Nodo =
  | { tipo: "palabra"; texto: string }
  | { tipo: "ranura"; nombre: Ranura }
  | { tipo: "grupo"; opcional: boolean; alternativas: Nodo[][] };

function alternancia(formas: string[]): string {
  // Las más largas primero, para que "la semana pasada" gane a "la semana".
  return [...formas].sort((a, b) => b.length - a.length).map(escapar).join("|");
}

const RANURAS: Record<Ranura, string> = {
  monto: ".+?",
  cosa: ".+?",
  tiempo: PATRON_DURACION,
  periodo: alternancia(Object.keys(FORMAS_DE_PERIODO)),
  categoria: alternancia(Object.keys(NOMBRES_DE_CATEGORIA)),
};

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lee un patrón y lo convierte en nodos. Lanza un error si está mal escrito. */
function leerPatron(patron: string): Nodo[] {
  let i = 0;
  const error = (motivo: string) => new Error(`Plantilla mal escrita (${motivo}): ${patron}`);

  function secuencia(cierre: string | null): Nodo[][] {
    const alternativas: Nodo[][] = [[]];
    while (i < patron.length) {
      const letra = patron[i];
      if (letra === " ") {
        i++;
      } else if (letra === cierre) {
        i++;
        return alternativas;
      } else if (letra === "|") {
        if (cierre === null) throw error("| fuera de un grupo");
        i++;
        alternativas.push([]);
      } else if (letra === "[" || letra === "(") {
        i++;
        const opcional = letra === "[";
        const grupo = secuencia(opcional ? "]" : ")");
        if (grupo.some((alternativa) => alternativa.length === 0)) throw error("grupo vacío");
        alternativas.at(-1)!.push({ tipo: "grupo", opcional, alternativas: grupo });
      } else if (letra === "{") {
        const fin = patron.indexOf("}", i);
        const nombre = patron.slice(i + 1, fin) as Ranura;
        if (fin < 0 || !(nombre in RANURAS)) throw error(`ranura desconocida`);
        alternativas.at(-1)!.push({ tipo: "ranura", nombre });
        i = fin + 1;
      } else {
        const palabra = patron.slice(i).match(/^[a-z0-9ñ$]+/)?.[0];
        if (!palabra) throw error(`carácter inesperado "${letra}"`);
        alternativas.at(-1)!.push({ tipo: "palabra", texto: palabra });
        i += palabra.length;
      }
    }
    if (cierre !== null) throw error(`falta "${cierre}"`);
    return alternativas;
  }

  const [nodos, ...resto] = secuencia(null);
  if (resto.length > 0 || nodos.length === 0) throw error("patrón vacío");
  return nodos;
}

/**
 * Une los nodos con un espacio. Un opcional lleva su espacio adentro: delante si ya hubo
 * algo obligatorio ("cuanto gaste[ hoy]"), detrás si va al comienzo ("[mis ]gastos").
 */
function compilarSecuencia(nodos: Nodo[], vistas: Set<Ranura>): string {
  let salida = "";
  let hayAntes = false;
  for (const nodo of nodos) {
    if (nodo.tipo === "grupo" && nodo.opcional) {
      const contenido = compilarAlternativas(nodo.alternativas, vistas);
      salida += hayAntes ? `(?: ${contenido})?` : `(?:${contenido} )?`;
    } else {
      salida += (hayAntes ? " " : "") + compilarNodo(nodo, vistas);
      hayAntes = true;
    }
  }
  return salida;
}

function compilarAlternativas(alternativas: Nodo[][], vistas: Set<Ranura>): string {
  return `(?:${alternativas.map((nodos) => compilarSecuencia(nodos, vistas)).join("|")})`;
}

function compilarNodo(nodo: Nodo, vistas: Set<Ranura>): string {
  switch (nodo.tipo) {
    case "palabra":
      return escapar(nodo.texto);
    case "ranura":
      if (vistas.has(nodo.nombre)) throw new Error(`La ranura {${nodo.nombre}} aparece dos veces`);
      vistas.add(nodo.nombre);
      return `(?<${nodo.nombre}>${RANURAS[nodo.nombre]})`;
    case "grupo":
      return compilarAlternativas(nodo.alternativas, vistas);
  }
}

const compiladas = new Map<string, RegExp>();

/** La expresión regular de un patrón (se compila una sola vez). Lanza un error si está mal escrito. */
export function compilar(patron: string): RegExp {
  let regex = compiladas.get(patron);
  if (!regex) {
    regex = new RegExp(`^${compilarSecuencia(leerPatron(patron), new Set())}$`, "d");
    compiladas.set(patron, regex);
  }
  return regex;
}

/** Si el texto calza con la plantilla, lo capturado en cada ranura. */
export function coincidir(plantilla: Plantilla, original: string): Coincidencia | null {
  const { texto, origen } = normalizarConMapa(original);
  const resultado = compilar(plantilla.patron).exec(texto);
  if (!resultado) return null;
  const ranuras: Coincidencia["ranuras"] = {};
  const originales: Coincidencia["originales"] = {};
  for (const [nombre, valor] of Object.entries(resultado.groups ?? {})) {
    const posicion = resultado.indices?.groups?.[nombre];
    if (valor === undefined || !posicion) continue;
    ranuras[nombre as Ranura] = valor;
    originales[nombre as Ranura] = original.slice(origen[posicion[0]], origen[posicion[1] - 1] + 1);
  }
  return { ranuras, originales };
}

const EQUIPO = "computador|computadora|compu|pc|notebook|mac|equipo";
const INICIAR = "empieza|inicia|comienza|pon|ponme|activa|arranca|crea|crear";
const DETENER = "para|parar|deten|detener|cancela|cancelar|termina|terminar|apaga|apagar|quita|quitar|borra";
const VERBO_GASTO = "gaste|gasto|gastamos|pague|pago|compre|me gaste|me compre";
const ABRIR = "abre|abreme|abrir|abri";
const MOSTRAR = "muestrame|muestra|mostrar|ensename|donde esta|donde quedo";
const MUSICA = "musica|cancion|tema|spotify";
const CUANTO = "cuanto (he gastado|hemos gastado|gaste|gastamos|llevo gastado|llevo|gasto)";

/** Las plantillas que trae la app. El orden importa: gana la primera que calza y se puede interpretar. */
export const PLANTILLAS_BASE: Plantilla[] = [
  { id: "gasto-verbo", intencion: "registrar-gasto", patron: `(${VERBO_GASTO}) {monto} (en|de|por|para) {cosa}` },
  {
    id: "gasto-anota",
    intencion: "registrar-gasto",
    patron: "(anota|anotame|registra|agrega|suma) [un gasto de] {monto} (en|de|por|para) {cosa}",
  },
  { id: "gasto-compra", intencion: "registrar-gasto", patron: "(compre|me compre) {cosa} (en|por|a) {monto}" },
  { id: "gasto-cosa-primero", intencion: "registrar-gasto", patron: "{cosa} (me costo|costo|salio|me salio) {monto}" },
  { id: "gasto-solo-monto", intencion: "registrar-gasto", patron: `(${VERBO_GASTO}|anota|registra) {monto}` },
  { id: "consulta-categoria", intencion: "consultar-gastos", patron: `${CUANTO} en {categoria} [{periodo}]` },
  { id: "consulta-periodo-categoria", intencion: "consultar-gastos", patron: `${CUANTO} {periodo} en {categoria}` },
  { id: "consulta-periodo", intencion: "consultar-gastos", patron: `${CUANTO} [en total] [{periodo}]` },
  { id: "consulta-resumen", intencion: "consultar-gastos", patron: "[mis] (gastos|resumen de [mis] gastos) [de|del] {periodo}" },
  { id: "ultimos", intencion: "ultimos-gastos", patron: "[(muestrame|ver|dame|cuales son)] [mis] ultimos gastos" },
  { id: "borrar-ultimo", intencion: "borrar-ultimo-gasto", patron: "(borra|elimina|quita|deshaz|anula) [el] ultimo gasto" },
  {
    id: "ver-memoria",
    intencion: "ver-memoria",
    patron: "[(muestrame|dime)] [lo] (que sabes|que recuerdas|lo que sabes|lo que recuerdas) de mi",
  },
  { id: "ver-memoria-corto", intencion: "ver-memoria", patron: "(tu memoria|lo que se de ti|que sabes de mi)" },
  {
    id: "pomodoro",
    intencion: "pomodoro",
    patron: `[(${INICIAR})] [un|el|mi] pomodoro [(de|por) {tiempo}] [(para|de) {cosa}]`,
  },
  { id: "pomodoro-tema", intencion: "pomodoro", patron: `[(${INICIAR})] [un|el|mi] pomodoro (para|de) {cosa}` },
  {
    id: "temporizador",
    intencion: "temporizador",
    patron: `[(${INICIAR})] [un] (temporizador|timer|cronometro|alarma) [de|por|en] {tiempo} [(para|de) {cosa}]`,
  },
  { id: "recordatorio", intencion: "temporizador", patron: "(recuerdame|avisame|recordarme) en {tiempo} [que|de|para|a] {cosa}" },
  { id: "recordatorio-tiempo-primero", intencion: "temporizador", patron: "en {tiempo} (recuerdame|avisame) [que|de|para|a] {cosa}" },
  { id: "cancelar-pomodoro", intencion: "cancelar-pomodoro", patron: `(${DETENER}) [el|mi] pomodoro` },
  {
    id: "cancelar-temporizador",
    intencion: "cancelar-temporizador",
    patron: `(${DETENER}) [el|los|mi|mis] (temporizador|temporizadores|timer|alarma|alarmas|recordatorio|recordatorios)`,
  },
  {
    id: "consultar-temporizador",
    intencion: "consultar-temporizador",
    patron:
      "cuanto (queda|falta|le queda|le falta|me queda|me falta) [(al|del|de|para el|para) (pomodoro|temporizador|timer|descanso|recordatorio)]",
  },
  { id: "consultar-temporizadores", intencion: "consultar-temporizador", patron: "[mis] (temporizadores|recordatorios)" },
  { id: "estado-equipo", intencion: "estado-equipo", patron: `(como|que tal) (esta|anda|va) [el|la|mi] (${EQUIPO})` },
  { id: "estado-equipo-corto", intencion: "estado-equipo", patron: `[el] estado (del|de la|de mi) (${EQUIPO})` },
  { id: "bateria", intencion: "estado-equipo", patron: "cuanta bateria [(me queda|tengo|queda|tiene|hay)]" },
  { id: "espacio", intencion: "estado-equipo", patron: "cuanto espacio (me queda|tengo|queda|hay) [(en el disco|libre)]" },
  { id: "descargas", intencion: "ver-descargas", patron: "[(muestrame|ver|dame|cuales son|revisa)] [mis|las] [ultimas] descargas" },
  { id: "descargas-que", intencion: "ver-descargas", patron: "(que|lo que) (descargue|he descargado|baje|he bajado) [(hoy|ultimamente|recien)]" },
  { id: "abrir-descarga", intencion: "abrir-ultima-descarga", patron: `(${ABRIR}) [la|mi] ultima descarga` },
  { id: "abrir-descarga-ultimo", intencion: "abrir-ultima-descarga", patron: `(${ABRIR}) (lo ultimo|el ultimo archivo) que (descargue|baje)` },
  { id: "mostrar-descarga", intencion: "mostrar-ultima-descarga", patron: `(${MOSTRAR}) [la|mi] ultima descarga [en el (finder|explorador)]` },
  { id: "mostrar-descarga-ultimo", intencion: "mostrar-ultima-descarga", patron: `(${MOSTRAR}) (lo ultimo|el ultimo archivo) que (descargue|baje)` },
  { id: "musica-pausa", intencion: "musica-pausa", patron: `(pausa|pausar|pon pausa a|ponle pausa a|${DETENER}) [la|el] (${MUSICA})` },
  { id: "musica-play", intencion: "musica-play", patron: `(pon|ponme|reanuda|reanudar|sigue con|continua|play|dale play a|vuelve a poner) [la|el] (${MUSICA})` },
  { id: "musica-play-corto", intencion: "musica-play", patron: "(play|dale play)" },
  { id: "musica-pausa-corto", intencion: "musica-pausa", patron: "(pausa|pon pausa)" },
  { id: "musica-siguiente", intencion: "musica-siguiente", patron: "[(pon|ponme|dale|pasa a)] [la] (siguiente|proxima|otra) (cancion|tema)" },
  { id: "musica-siguiente-corto", intencion: "musica-siguiente", patron: "(pon|ponme|dale|pasa a) [la] (siguiente|proxima)" },
  { id: "musica-siguiente-verbo", intencion: "musica-siguiente", patron: "(pasa|salta|cambia|adelanta) [la|el|de] (cancion|tema)" },
  { id: "musica-anterior", intencion: "musica-anterior", patron: "[(pon|ponme|dale|vuelve a)] [la|el] (cancion|tema) anterior" },
  { id: "musica-anterior-corto", intencion: "musica-anterior", patron: "(pon|ponme|dale|vuelve a) [la] anterior" },
  { id: "musica-estado", intencion: "musica-estado", patron: "(que|cual) (cancion|tema|musica) (esta sonando|suena|es esta|es|estoy escuchando)" },
  { id: "musica-estado-corto", intencion: "musica-estado", patron: "(que|quien) (esta sonando|suena|canta)" },
].map((plantilla) => ({ ...plantilla, intencion: plantilla.intencion as Intencion, origen: "base" as const }));
