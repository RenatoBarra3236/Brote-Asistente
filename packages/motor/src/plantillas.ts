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
import { PATRON_DURACION, PATRON_HORA } from "./tiempo.ts";
import { PATRON_DIA } from "./fechas.ts";

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
  | "musica-estado"
  | "calendario-hoy"
  | "calendario-manana"
  | "calendario-proximo"
  | "calendario-crear"
  | "calendario-crear-manana"
  | "programador-sesiones"
  | "aula-entregas"
  | "aula-semana"
  | "plan-uso"
  | "plan-reinicio"
  | "plan-tokens"
  | "presupuesto-poner"
  | "presupuesto-quitar"
  | "presupuesto-queda"
  | "presupuesto-hoy"
  | "plata-proyeccion"
  | "agenda-semana"
  | "resumen-dia"
  | "grabar-iniciar"
  | "grabar-detener"
  | "grabar-estado"
  | "transcripciones-ver"
  | "transcripciones-hoy"
  | "ramos-agregar"
  | "ramos-ver"
  | "ramos-archivar"
  | "notas-anotar"
  | "notas-evaluaciones"
  | "notas-agregar-eval"
  | "notas-necesaria"
  | "notas-como-voy"
  | "notas-borrar"
  | "notas-ajuste"
  | "repaso-hay"
  | "repaso-empezar"
  | "estudio-fecha"
  | "estudio-plan"
  | "estudio-hoy"
  | "estudio-horas"
  | "estudio-racha"
  | "estudio-anotar"
  | "estudio-meta-poner"
  | "estudio-meta-quitar"
  | "estudio-meta-como";

export type Ranura = "monto" | "cosa" | "periodo" | "categoria" | "tiempo" | "hora" | "nota" | "peso" | "evaluacion" | "ramo" | "objetivo" | "lista" | "fecha" | "dia";

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
  hora: PATRON_HORA,
  fecha: PATRON_DIA,
  dia: "ayer|hoy",
  // Notas (A2): una nota 1–7 con coma o punto, y un peso en % (la coma entre dígitos no se pierde al normalizar).
  nota: "\\d(?:[.,]\\d{1,2})?",
  peso: "\\d{1,3}(?: ?%| por ciento)?",
  evaluacion: ".+?",
  ramo: ".+?",
  objetivo: ".+?",
  lista: ".+",
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
const CLAUDE = "claude|claude code|mis claude|las sesiones de claude|mis sesiones";
const CREAR = "pon|ponme|crea|creame|agrega|agregame|anota|anotame|agenda|agendame";
const EVENTO = "evento|reunion|cita|clase|prueba|actividad";
const NOMBRADO = "de|para|llamado|llamada|que diga|sobre";
const AGENDAR = "agenda|agendame|anota en el calendario|anota en mi calendario|pon en el calendario|pon en mi calendario";
const AGENDA = "agenda|calendario|horario";
const ACTIVIDADES = "clases|clase|pruebas|prueba|reuniones|reunion|eventos|evento|ayudantias|ayudantia";
const ACTIVIDAD = "clase|reunion|evento|prueba|actividad|ayudantia|cita";
const MUSICA = "musica|cancion|tema|spotify";
const ENTREGABLES = "entregas|tareas|trabajos|informes";
const PLAN = "plan|limite|limites";
const GRABABLE = "clase|reunion|charla|conferencia|ayudantia|catedra|exposicion|sesion";
const CUANTO = "cuanto (he gastado|hemos gastado|gaste|gastamos|llevo gastado|llevo|gasto)";

/** Las plantillas que trae la app. El orden importa: gana la primera que calza y se puede interpretar. */
export const PLANTILLAS_BASE: Plantilla[] = [
  // El plan de Claude va antes que los gastos: "¿cuánto llevo del plan?" no es una consulta de gastos.
  { id: "plan-uso", intencion: "plan-uso", patron: `(cuanto|que) (llevo|he usado|uso|he gastado|gaste|me queda|queda) (del|de mi|de) (${PLAN}) [de claude]` },
  { id: "plan-uso-como", intencion: "plan-uso", patron: `como (va|esta|anda|voy con) (mi|el) (${PLAN}) [de claude]` },
  { id: "plan-uso-corto", intencion: "plan-uso", patron: `[(muestrame|ver|dame)] [mi|el] (uso del plan|uso de claude|${PLAN} de claude)` },
  { id: "plan-reinicio", intencion: "plan-reinicio", patron: `(cuando|a que hora) se (reinicia|resetea|renueva|reinician|resetean|renuevan) (mi|el|los) (${PLAN}|uso) [de claude]` },
  { id: "plan-tokens", intencion: "plan-tokens", patron: "cuanto (he gastado|gaste|llevo gastado|llevo|he usado|uso|gasto) en tokens [de claude]" },
  { id: "plan-tokens-cuantos", intencion: "plan-tokens", patron: "cuantos tokens (he gastado|gaste|llevo|he usado|uso|gasto) [hoy|esta semana]" },
  { id: "plan-tokens-corto", intencion: "plan-tokens", patron: "[(muestrame|ver|dame)] [mi|el] (gasto|uso) (en|de) tokens" },
  // El presupuesto va antes que los gastos: "¿cuánto puedo gastar hoy?" no es una consulta de gastos.
  { id: "presupuesto-poner", intencion: "presupuesto-poner", patron: "[mi|el] presupuesto [mensual|del mes] (es|sera|va a ser|queda en) [de] {monto} [(al|por) mes|mensual|mensuales]" },
  { id: "presupuesto-poner-verbo", intencion: "presupuesto-poner", patron: "(pon|ponme|deja|dejame|cambia|fija|define) [mi|el] presupuesto [mensual|del mes] (en|a|de) {monto} [(al|por) mes|mensual|mensuales]" },
  { id: "presupuesto-poner-maximo", intencion: "presupuesto-poner", patron: "(quiero|voy a) gastar [como] (maximo|max) {monto} (al|por|este) mes" },
  { id: "presupuesto-quitar", intencion: "presupuesto-quitar", patron: "(quita|quitame|borra|elimina|saca|sacame) [mi|el] presupuesto" },
  { id: "presupuesto-queda", intencion: "presupuesto-queda", patron: "cuanto (me queda|queda|me sobra|sobra) (del|de mi|de|en el|en mi) presupuesto [(del|este) mes]" },
  { id: "presupuesto-como", intencion: "presupuesto-queda", patron: "como (voy|vamos|va|ando|anda) con [mi|el] presupuesto" },
  { id: "presupuesto-ver", intencion: "presupuesto-queda", patron: "[(muestrame|ver|dame)] [mi|el] presupuesto" },
  { id: "presupuesto-hoy", intencion: "presupuesto-hoy", patron: "cuanto (puedo gastar|puedo gastarme|me queda para gastar|me puedo gastar) [hoy|hoy dia|el dia de hoy|para hoy]" },
  // El resumen del día (E2). «buenos días» solo si es el saludo suelto: con más palabras va al agente.
  { id: "resumen-dia", intencion: "resumen-dia", patron: "[dame] [mi|el] resumen (del dia|de hoy|de la manana) [por favor]" },
  { id: "resumen-dia-como", intencion: "resumen-dia", patron: "como (viene|se ve|va a estar|va) [mi|el] dia [de hoy|hoy]" },
  { id: "resumen-dia-buenos", intencion: "resumen-dia", patron: "(buenos dias|buen dia) [brote]" },
  // La semana (B2): qué tan cargada viene. «semana» sola, sin «entregas»/«plata»: eso son otras intenciones.
  { id: "semana-como", intencion: "agenda-semana", patron: "como (viene|se ve|va a estar|va|vendra) [mi|la|esta] semana" },
  { id: "semana-pesada", intencion: "agenda-semana", patron: "(viene|esta|va a estar) pesada [mi|la|esta] semana" },
  { id: "semana-pesada-esta", intencion: "agenda-semana", patron: "[mi|la|esta] semana (viene|esta|va a estar|sera) (pesada|cargada|complicada|liviana|tranquila)" },
  // La proyección del mes (sirve con o sin presupuesto). Siempre con «este mes» o «gasto»: "¿cómo voy en cálculo?" son las notas.
  { id: "proyeccion-como", intencion: "plata-proyeccion", patron: "como voy (este mes|con la plata|con mis gastos) [este mes]" },
  { id: "proyeccion-cuanto", intencion: "plata-proyeccion", patron: "cuanto (voy a gastar|gastare|terminare gastando|me voy a gastar) [en total] (este mes|en el mes)" },
  { id: "proyeccion-ritmo", intencion: "plata-proyeccion", patron: "a que ritmo (gasto|estoy gastando|voy gastando) [este mes]" },
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
    patron: `[(${INICIAR})] [un|una] (temporizador|timer|cronometro|alarma) [de|por|en] {tiempo} [(para|de) {cosa}]`,
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
  { id: "calendario-hoy", intencion: "calendario-hoy", patron: "(que|que cosas) tengo [para] hoy [dia]" },
  { id: "calendario-hoy-agenda", intencion: "calendario-hoy", patron: `[(muestrame|ver|dame)] [mi|el] (${AGENDA}) [(de|para)] hoy` },
  { id: "calendario-hoy-tengo", intencion: "calendario-hoy", patron: `tengo (algo|${ACTIVIDADES}) hoy` },
  { id: "calendario-hoy-que", intencion: "calendario-hoy", patron: `(que|cuales) (${ACTIVIDADES}) tengo hoy` },
  { id: "calendario-manana", intencion: "calendario-manana", patron: "(que|que cosas) tengo [para] manana" },
  { id: "calendario-manana-agenda", intencion: "calendario-manana", patron: `[(muestrame|ver|dame)] [mi|el] (${AGENDA}) [(de|para)] manana` },
  { id: "calendario-manana-tengo", intencion: "calendario-manana", patron: `tengo (algo|${ACTIVIDADES}) manana` },
  { id: "calendario-manana-que", intencion: "calendario-manana", patron: `(que|cuales) (${ACTIVIDADES}) tengo manana` },
  // Crear eventos. "mañana a las" va antes que "a las" (si no, «mañana» quedaría en el título).
  { id: "evento-en", intencion: "calendario-crear", patron: `(${CREAR}) [un|una] (${EVENTO}) en {tiempo} [(${NOMBRADO}) {cosa}]` },
  { id: "evento-de-en", intencion: "calendario-crear", patron: `(${CREAR}) [un|una] (${EVENTO}) (${NOMBRADO}) {cosa} en {tiempo}` },
  { id: "evento-agenda-en", intencion: "calendario-crear", patron: `(${AGENDAR}) {cosa} en {tiempo}` },
  { id: "evento-manana", intencion: "calendario-crear-manana", patron: `(${CREAR}) [un|una] (${EVENTO}) [(${NOMBRADO}) {cosa}] manana a las {hora}` },
  { id: "evento-agenda-manana", intencion: "calendario-crear-manana", patron: `(${AGENDAR}) {cosa} manana a las {hora}` },
  { id: "evento-hora", intencion: "calendario-crear", patron: `(${CREAR}) [un|una] (${EVENTO}) [(${NOMBRADO}) {cosa}] [hoy] a las {hora}` },
  { id: "evento-agenda-hora", intencion: "calendario-crear", patron: `(${AGENDAR}) {cosa} [hoy] a las {hora}` },
  { id: "calendario-proximo", intencion: "calendario-proximo", patron: `[(cual es|cuando es|a que hora es|donde es)] [mi|la] (proxima|siguiente) (${ACTIVIDAD})` },
  { id: "calendario-proximo-que", intencion: "calendario-proximo", patron: "que (viene|sigue|tengo) ahora" },
  { id: "programador-que-hace", intencion: "programador-sesiones", patron: `(que|en que) (esta haciendo|hace|anda|esta) (${CLAUDE})` },
  { id: "programador-como-va", intencion: "programador-sesiones", patron: `como (va|van|anda|andan) (${CLAUDE})` },
  { id: "programador-sesiones", intencion: "programador-sesiones", patron: `[(muestrame|ver)] [mis] sesiones de (${CLAUDE})` },
  // Aula (Canvas o Moodle). "Esta semana" va antes que la general.
  { id: "aula-semana", intencion: "aula-semana", patron: `(que|cuales) (${ENTREGABLES}) tengo [para] esta semana` },
  { id: "aula-semana-entregar", intencion: "aula-semana", patron: "(que|que cosas) tengo que entregar [para] esta semana" },
  { id: "aula-semana-mis", intencion: "aula-semana", patron: "[(muestrame|ver|dame)] [mis] entregas (de|para) esta semana" },
  { id: "aula-entregas", intencion: "aula-entregas", patron: "(que|cuales) entregas tengo [pendientes]" },
  { id: "aula-entregas-mis", intencion: "aula-entregas", patron: "[(muestrame|ver|dame)] [mis] [proximas] entregas [pendientes]" },
  { id: "aula-entregar", intencion: "aula-entregas", patron: `(que|que cosas|cuales) [(${ENTREGABLES})] tengo que entregar` },
  { id: "aula-falta", intencion: "aula-entregas", patron: "que me falta entregar" },
  // Grabar y transcribir. El motor no graba: la isla hace lo mismo que el botón 🎙 (y pregunta si avisaste).
  { id: "grabar-esta", intencion: "grabar-iniciar", patron: `(graba|grabame|grabar) (esta|la|mi|esta misma) (${GRABABLE})` },
  { id: "grabar-empieza", intencion: "grabar-iniciar", patron: "(empieza|empezar|inicia|iniciar|comienza|comenzar|arranca|arrancar) (a grabar|la grabacion|una grabacion)" },
  { id: "grabar-quiero", intencion: "grabar-iniciar", patron: `(quiero|voy a|necesito) grabar (esta|la|mi) (${GRABABLE})` },
  { id: "grabar-para", intencion: "grabar-detener", patron: "(para|parar|deten|detener|termina|terminar|finaliza|finalizar|corta|cortar|cancela|cancelar) [la|mi|esta] grabacion" },
  { id: "grabar-deja", intencion: "grabar-detener", patron: "(deja|dejar|para|parar|ya no|termina|terminar) de grabar" },
  { id: "grabar-estado", intencion: "grabar-estado", patron: "(estoy|estas|esta|sigo|seguimos|estamos) grabando" },
  { id: "transcripciones-ver", intencion: "transcripciones-ver", patron: "[(muestrame|ver|dame|lista|listame|revisa)] [mis|las] [ultimas] (transcripciones|grabaciones)" },
  { id: "transcripciones-hoy", intencion: "transcripciones-hoy", patron: "(que|cuales) (grabe|he grabado|transcripciones tengo|grabaciones tengo|transcribi|he transcrito) hoy" },
  // Ramos (pestaña Estudio). «Ramo» es la palabra fija: sin ella no calza, así «agrega un gasto» no se confunde.
  { id: "ramos-agregar", intencion: "ramos-agregar", patron: "(agrega|agregar|agregame|anade|anadir|crea|crear|suma|sumar|anota|anotar) [el|un|mi|otro] ramo [de|llamado] {cosa}" },
  { id: "ramos-agregar-tengo", intencion: "ramos-agregar", patron: "(tengo|estoy viendo|estoy cursando|curso|cursando) [el|un] ramo [de] {cosa}" },
  { id: "ramos-ver", intencion: "ramos-ver", patron: "[(muestrame|ver|dame|lista|listame|revisa)] [mis|los|todos mis] ramos" },
  { id: "ramos-ver-cuales", intencion: "ramos-ver", patron: "(que|cuales) ramos (tengo|estoy viendo|estoy cursando|curso)" },
  { id: "ramos-archivar", intencion: "ramos-archivar", patron: "(quita|quitar|archiva|archivar|elimina|eliminar|saca|sacar|borra|borrar) [el|mi] ramo [de] {cosa}" },
  // Notas (A2). Van al final: las de plan y gastos ganan si calzan. Cada una lleva una palabra fija
  // ("nota", "evaluacion", "ramo"…) o el verbo «me saqué», para no calzar con gastos ni conversación.
  { id: "notas-me-saque", intencion: "notas-anotar", patron: "(me saque|saque|obtuve|tuve|tengo) [un|una] {nota} en {cosa}" },
  { id: "notas-agregar-nota", intencion: "notas-anotar", patron: "(agrega|agregar|anade|anota|anotar|pon|ponme|apunta|apuntar) [una|mi] nota [de] {nota} en {cosa}" },
  { id: "notas-evaluaciones", intencion: "notas-evaluaciones", patron: "(evaluaciones|ponderaciones) de {lista}" },
  { id: "notas-agregar-eval", intencion: "notas-agregar-eval", patron: "(agrega|agregar|anade|crea|crear|pon|ponme) [una|la] evaluacion {evaluacion} (de|con|que vale|vale) {peso} (en|de|para) [el|la|mi] {ramo}" },
  { id: "notas-necesaria-con", intencion: "notas-necesaria", patron: "con {nota} en [el|la] {evaluacion} cuanto (necesito|me falta|tengo que sacar|debo sacar|necesitaria|necesitare) en [el|la] {objetivo} (de|en) [el|la|mi] {ramo} [para (aprobar|pasar)]" },
  { id: "notas-necesaria-con-corta", intencion: "notas-necesaria", patron: "con {nota} en [el|la] {evaluacion} cuanto (necesito|me falta|tengo que sacar|debo sacar|necesitaria|necesitare) en [el|la] {objetivo} [para (aprobar|pasar)]" },
  { id: "notas-necesaria-en-ramo", intencion: "notas-necesaria", patron: "cuanto (necesito|me falta|tengo que sacar|debo sacar|necesitaria|necesitare) en [el|la] {objetivo} (de|en) [el|la|mi] {ramo} [para (aprobar|pasar)]" },
  { id: "notas-necesaria-en", intencion: "notas-necesaria", patron: "cuanto (necesito|me falta|tengo que sacar|debo sacar|necesitaria|necesitare) en [el|la] {objetivo} [para (aprobar|pasar)]" },
  { id: "notas-necesaria-ramo", intencion: "notas-necesaria", patron: "cuanto (necesito|me falta|tengo que sacar|debo sacar|necesitaria|necesitare) para (aprobar|pasar) [el|la|mi] [ramo] {ramo}" },
  { id: "notas-como-voy-todos", intencion: "notas-como-voy", patron: "(como voy|como me va|como estoy|como van) (con|en) (mis ramos|mis notas|todos mis ramos)" },
  // Repaso (A3): tarjetas de repaso de las clases. Siempre con "repasar"/"repaso" o "tarjetas de repaso" para no confundirlas
  // con las tarjetas de crédito. Pedir el resumen de una clase va al agente (necesita IA).
  { id: "repaso-hay-tengo", intencion: "repaso-hay", patron: "(tengo|hay) tarjetas (de repaso|para repasar) [hoy]" },
  { id: "repaso-hay-cuantas", intencion: "repaso-hay", patron: "cuantas tarjetas (de repaso|para repasar) (tengo|hay|me quedan|me tocan) [hoy]" },
  { id: "repaso-hay-algo", intencion: "repaso-hay", patron: "(tengo|hay) algo para repasar [hoy]" },
  { id: "repaso-hay-que", intencion: "repaso-hay", patron: "que (tengo|me toca) repasar [hoy]" },
  { id: "repaso-empezar-solo", intencion: "repaso-empezar", patron: "(repasemos|a repasar|vamos a repasar|quiero repasar|empecemos a repasar|empieza el repaso)" },
  { id: "repaso-empezar-ramo", intencion: "repaso-empezar", patron: "(repasemos|vamos a repasar|quiero repasar|empecemos a repasar) {cosa}" },
  { id: "repaso-empezar-un", intencion: "repaso-empezar", patron: "(hagamos|haz|hacer|empieza|empezar|inicia|iniciar|quiero) [un|el|mi] repaso" },
  // Plan de estudio (A4): la fecha de una prueba, pedir el plan (la isla lo muestra y el usuario confirma) y los bloques de hoy.
  { id: "estudio-fecha-es", intencion: "estudio-fecha", patron: "{cosa} (es|sera|cae) {fecha} [a las {hora}]" },
  { id: "estudio-plan-hazme", intencion: "estudio-plan", patron: "(armame|hazme|haz|arma|organizame|organiza|dame|crea|crear|prepara|preparame) [un|el|mi] (plan de estudio|plan) (para|de) {cosa}" },
  { id: "estudio-plan-organiza", intencion: "estudio-plan", patron: "(organiza|organizame|planifica|planificame|arma|armame) [el|mi] estudio (para|de) {cosa}" },
  { id: "estudio-plan-solo", intencion: "estudio-plan", patron: "plan de estudio (para|de) {cosa}" },
  { id: "estudio-hoy-que", intencion: "estudio-hoy", patron: "que (tengo|debo|me toca) [que] estudiar [hoy]" },
  { id: "estudio-hoy-estudio", intencion: "estudio-hoy", patron: "que estudio hoy" },
  // Estadísticas de estudio (A5): cuánto, la racha y anotar horas a mano.
  { id: "estudio-horas-periodo", intencion: "estudio-horas", patron: "cuanto (he estudiado|estudie|llevo estudiando|llevo estudiado) {periodo}" },
  { id: "estudio-horas-ramo-periodo", intencion: "estudio-horas", patron: "cuanto (he estudiado|estudie|llevo estudiando|llevo estudiado) (de|en) {cosa} {periodo}" },
  { id: "estudio-horas-ramo", intencion: "estudio-horas", patron: "cuanto (he estudiado|estudie|llevo estudiando|llevo estudiado) (de|en) {cosa}" },
  { id: "estudio-horas-solo", intencion: "estudio-horas", patron: "cuanto (he estudiado|llevo estudiando|llevo estudiado)" },
  { id: "estudio-racha-cual", intencion: "estudio-racha", patron: "(cual es|como va|cuanto es) mi racha [de estudio]" },
  { id: "estudio-racha-mi", intencion: "estudio-racha", patron: "mi racha [de estudio]" },
  { id: "estudio-racha-dias", intencion: "estudio-racha", patron: "cuantos dias seguidos (he estudiado|llevo estudiando)" },
  // La meta semanal de estudio (E3): siempre con «semana»/«semanal» o «de estudio», para no chocar con otras metas.
  { id: "meta-estudio-estudiar", intencion: "estudio-meta-poner", patron: "(mi meta es|mi meta sera|quiero|voy a) estudiar {tiempo} (a la semana|por semana|semanales)" },
  { id: "meta-estudio-de-estudio", intencion: "estudio-meta-poner", patron: "mi meta de estudio (es|sera) [de] {tiempo} [a la semana|por semana|semanales]" },
  { id: "meta-estudio-semanal", intencion: "estudio-meta-poner", patron: "mi meta semanal [de estudio] (es|sera) [de] {tiempo}" },
  { id: "meta-estudio-pon", intencion: "estudio-meta-poner", patron: "(pon|ponme|deja|fija|define) mi meta (semanal|de estudio) en {tiempo} [a la semana|por semana]" },
  { id: "meta-estudio-quitar", intencion: "estudio-meta-quitar", patron: "(quita|quitame|borra|elimina|saca) mi meta (de estudio|semanal de estudio)" },
  { id: "meta-estudio-como", intencion: "estudio-meta-como", patron: "(como voy con|cuanto me falta para) mi meta (de estudio|semanal)" },
  { id: "estudio-anotar-ramo-ayer", intencion: "estudio-anotar", patron: "estudie {tiempo} (de|en) {cosa} {dia}" },
  { id: "estudio-anotar-ramo", intencion: "estudio-anotar", patron: "estudie {tiempo} (de|en) {cosa}" },
  { id: "estudio-anotar-ayer", intencion: "estudio-anotar", patron: "estudie {tiempo} {dia}" },
  { id: "estudio-anotar-solo", intencion: "estudio-anotar", patron: "estudie {tiempo}" },
  { id: "notas-promedio-todos", intencion: "notas-como-voy", patron: "(mi promedio|mis notas|mis promedios)" },
  { id: "notas-como-voy", intencion: "notas-como-voy", patron: "(como voy|como me va|como estoy|como ando) (con|en) [el|la|mi] [ramo] {ramo}" },
  { id: "notas-promedio", intencion: "notas-como-voy", patron: "[cual es] [mi] promedio (de|en) [el|la|mi] [ramo] {ramo}" },
  { id: "notas-borrar", intencion: "notas-borrar", patron: "(borra|borrar|elimina|eliminar|quita|quitar) [la] nota (del|de la|de el|de) {cosa}" },
  { id: "notas-ajuste-aprobacion", intencion: "notas-ajuste", patron: "la nota de aprobacion (de|en) [el|la|mi] [ramo] {ramo} es [un|una] {nota}" },
  { id: "notas-ajuste-examen", intencion: "notas-ajuste", patron: "el examen (de|en) [el|la|mi] [ramo] {ramo} vale {peso}" },
].map((plantilla) => ({ ...plantilla, intencion: plantilla.intencion as Intencion, origen: "base" as const }));
