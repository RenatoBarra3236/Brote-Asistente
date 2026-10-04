// La ventana "Configurar Brote". Dos caras:
//
//   Primera vez (falta algo obligatorio y todavía no se eligieron funciones): un asistente de 3 pasos.
//     1. Preparar: los 11 pasos técnicos como una sola barra de progreso; solo aparece una tarjeta
//        cuando el usuario tiene que hacer algo (instalar Node, iniciar sesión en Claude, aceptar el
//        consentimiento del agente). Los nombres técnicos quedan plegados en "Detalles".
//     2. Qué quieres que haga Brote: presets y una tarjeta con interruptor por función.
//     3. Listo: "Empezar" guarda las funciones y reinicia Brote.
//   Uso diario: barra lateral con Estado (y Reparar), Funciones, Cuentas de IA, Equipo, Conectores,
//   Aula, Permisos y Memoria.
//
// La revisión y los arreglos los hace Rust con el script `configurar` (ver configuracion.rs); esta
// ventana solo pide pasos conocidos y abre terminales o páginas de listas cerradas.

import { invoke } from "@tauri-apps/api/core";
import { FUNCIONES, normalizarFunciones } from "./agente/funciones";
import { filasPermisos, funcionesSinConfigurar, necesitaAsistente, permisoCalendarioDePaso, preparacion, esTecnico, type LecturaPermisos } from "./agente/preparacion";
import { TransportePuente } from "./agente/puente";
import { revisarConectores, vistaConectores } from "./configurar/conectores";
import { EN_MAC, alPintar, boton, cabecera, crear, estado, filaPaso, guardarFunciones, mensajeDe, mostrarAviso, paso, pintar, prepararTodo, revisar, tarjetaPaso } from "./configurar/comun";
import { formularioAula } from "./configurar/formularios";
import { vistaFunciones, vistaTarjetasInicio } from "./configurar/funciones";
import { revisarEquipo, vistaCuentas, vistaEquipo } from "./configurar/equipo";

type Seccion = "estado" | "funciones" | "cuentas" | "equipo" | "conectores" | "aula" | "permisos" | "memoria";

const SECCIONES: { id: Seccion; icono: string; titulo: string }[] = [
  { id: "estado", icono: "🌱", titulo: "Estado" },
  { id: "funciones", icono: "✨", titulo: "Funciones" },
  { id: "cuentas", icono: "🔑", titulo: "Cuentas de IA" },
  { id: "equipo", icono: "👥", titulo: "Equipo" },
  { id: "conectores", icono: "🔌", titulo: "Conectores" },
  { id: "aula", icono: "📚", titulo: "Aula" },
  { id: "permisos", icono: "🔒", titulo: "Permisos" },
  { id: "memoria", icono: "🧠", titulo: "Memoria" },
];

const raiz = document.querySelector<HTMLDivElement>("#raiz")!;
let modo: "cargando" | "asistente" | "diario" = "cargando";
let pasoAsistente: 1 | 2 | 3 = 1;
let seccion: Seccion = "estado";

// ---------------------------------------------------------------- piezas comunes

/** La barra de progreso de los pasos técnicos (Preparar y Estado). */
function barraPreparacion(): HTMLElement {
  const resumen = preparacion(estado.pasos, estado.consentimientos);
  const caja = crear("div", `progreso${resumen.listo ? " listo" : ""}`);
  const texto = crear("p", "progreso-texto");
  if (estado.trabajandoEn) texto.textContent = `${estado.trabajandoEn} (${resumen.listos} de ${resumen.total})`;
  else if (!estado.revisado) texto.textContent = "Revisando lo que hay en tu computador…";
  else if (resumen.listo) texto.textContent = "Todo listo por dentro ✓";
  else texto.textContent = `${resumen.listos} de ${resumen.total} listos`;
  const barra = crear("div", `barra-progreso${estado.trabajandoEn || !estado.revisado ? " trabajando" : ""}`);
  const relleno = crear("i");
  relleno.style.width = `${Math.round((resumen.listos / resumen.total) * 100)}%`;
  barra.append(relleno);
  caja.append(texto, barra);
  return caja;
}

/** Las tarjetas de lo que el usuario tiene que hacer él (instalar Node, iniciar sesión, aceptar…). */
function tarjetasDelUsuario(): HTMLElement[] {
  return preparacion(estado.pasos, estado.consentimientos).delUsuario.map((p) => {
    const tarjeta = tarjetaPaso(p);
    tarjeta.classList.add("del-usuario");
    return tarjeta;
  });
}

/** Los pasos técnicos, plegados: para quien quiera saber qué hay por dentro. */
function detallesTecnicos(): HTMLElement {
  const detalles = crear("details", "detalles");
  detalles.append(crear("summary", undefined, "Detalles técnicos"));
  const tecnicos = estado.pasos.filter(esTecnico);
  if (tecnicos.length === 0) detalles.append(crear("p", "nota", "Todavía no reviso nada."));
  detalles.append(...tecnicos.map(filaPaso));
  return detalles;
}

// ---------------------------------------------------------------- asistente

function pasosDelAsistente(): HTMLElement {
  const lista = crear("ol", "pasos-asistente");
  (["Preparar", "Qué quieres que haga Brote", "Listo"] as const).forEach((titulo, i) => {
    const n = (i + 1) as 1 | 2 | 3;
    const item = crear("li", n === pasoAsistente ? "actual" : n < pasoAsistente ? "hecho" : "");
    item.append(crear("span", "numero", n < pasoAsistente ? "✓" : String(n)), crear("span", undefined, titulo));
    lista.append(item);
  });
  return lista;
}

function asistentePreparar(): HTMLElement[] {
  const resumen = preparacion(estado.pasos, estado.consentimientos);
  const preparar = boton(
    resumen.listo ? "Listo" : "Preparar Brote",
    "boton boton-primario boton-grande",
    () => void prepararTodo(),
    estado.ocupado || resumen.listo || !resumen.hayAutomatico,
  );
  const fila = crear("div", "fila-preparar");
  fila.append(barraPreparacion(), preparar);
  const partes: HTMLElement[] = [
    cabecera("Preparemos a Brote", "Brote necesita OpenClaw (su cerebro) y Claude Code con tu cuenta. Lo instalo y lo configuro yo; solo te pido ayuda cuando haga falta."),
    fila,
  ];
  const delUsuario = tarjetasDelUsuario();
  if (delUsuario.length > 0) partes.push(crear("p", "nota-seccion", "Necesito que hagas esto:"), ...delUsuario);
  else if (!resumen.listo && !resumen.hayAutomatico && estado.revisado && !estado.ocupado) {
    partes.push(crear("p", "nota", "Revisa los detalles: algo no se pudo arreglar solo."));
  }
  partes.push(detallesTecnicos());
  return partes;
}

function asistenteFunciones(): HTMLElement[] {
  return [
    cabecera("¿Qué quieres que haga Brote?", "Elige un punto de partida y ajusta lo que quieras. Puedes cambiarlo cuando quieras en Configurar Brote → Funciones."),
    vistaFunciones(true),
  ];
}

function asistenteListo(): HTMLElement[] {
  const activas = FUNCIONES.filter((f) => estado.funciones.activas[f.id]);
  const lista = crear("ul", "resumen-funciones");
  for (const f of activas) lista.append(crear("li", undefined, f.nombre));
  const partes: HTMLElement[] = [cabecera("¡Listo! 🌱", "Brote ya puede acompañarte. Esto es lo que va a hacer:"), lista];
  const pendientes = funcionesSinConfigurar(estado.funciones.activas, estado.pasos);
  if (pendientes.length > 0) {
    const aviso = crear("p", "nota-pendiente", `Quedó por configurar: ${pendientes.map((f) => f.nombre).join(", ")}. Hasta entonces no muestran nada; puedes hacerlo en el paso anterior o después en Configurar Brote → Funciones.`);
    partes.push(aviso);
  }
  const permisos = filasPermisos(estado.funciones.activas, null).filter((f) => f.usadoPor.length > 0);
  if (EN_MAC && permisos.length > 0) {
    partes.push(
      crear("p", "nota", `macOS te va a preguntar por algunos permisos la primera vez que Brote los necesite: ${permisos.map((p) => p.nombre).join(", ")}. Puedes revisarlos en Configurar Brote → Permisos.`),
    );
  }
  partes.push(crear("p", "nota", "¿Usas Todoist, Notion, GitHub o Canva? Conéctalos después en Configurar Brote → Conectores."));
  if (estado.funciones.activas.especialistas) {
    partes.push(crear("p", "nota", "Elige a tu equipo (Tutor, Investigador…) y con qué IA trabaja cada uno en Configurar Brote → Equipo."));
  }
  return partes;
}

function pintarAsistente(): void {
  const contenido = crear("main", "asistente-contenido");
  contenido.append(...(pasoAsistente === 1 ? asistentePreparar() : pasoAsistente === 2 ? asistenteFunciones() : asistenteListo()));
  const pie = crear("footer", "pie");
  const izquierda = crear("p", undefined, "Todo queda en tu computador. Brote siempre te pide permiso antes de ejecutar comandos.");
  const botones = crear("div", "botones-pie");
  if (pasoAsistente > 1) botones.append(boton("Atrás", "boton", () => irA((pasoAsistente - 1) as 1 | 2), estado.ocupado));
  if (pasoAsistente === 1) {
    const resumen = preparacion(estado.pasos, estado.consentimientos);
    const siguiente = boton("Siguiente", "boton boton-primario", () => irA(2), estado.ocupado || !resumen.listo);
    if (!resumen.listo) siguiente.title = "Primero hay que preparar a Brote";
    botones.append(siguiente);
  } else if (pasoAsistente === 2) botones.append(boton("Siguiente", "boton boton-primario", () => irA(3), estado.ocupado));
  else botones.append(boton("Empezar", "boton boton-primario", () => void empezar(), estado.ocupado));
  pie.append(izquierda, botones);
  const cabeza = crear("header", "cabecera asistente-cabecera");
  cabeza.append(crear("h1", undefined, "Configurar Brote 🌱"), pasosDelAsistente());
  raiz.replaceChildren(cabeza, contenido, pie);
  raiz.className = "raiz modo-asistente";
}

function irA(n: 1 | 2 | 3): void {
  pasoAsistente = n;
  pintar();
  raiz.querySelector("main")?.scrollTo(0, 0);
}

async function empezar(): Promise<void> {
  if (!(await guardarFunciones())) return;
  void invoke("reiniciar");
}

// ---------------------------------------------------------------- uso diario

function seccionEstado(): HTMLElement[] {
  const resumen = preparacion(estado.pasos, estado.consentimientos);
  const indicador = crear("div", `indicador ${!estado.revisado ? "revisando" : resumen.listo ? "bien" : "mal"}`);
  const punto = crear("span", "indicador-punto");
  const textos = crear("div", "indicador-texto");
  if (!estado.revisado) textos.append(crear("strong", undefined, "Revisando…"));
  else if (resumen.listo) textos.append(crear("strong", undefined, "Brote está funcionando"), crear("span", undefined, "OpenClaw, Claude Code y tus gastos están conectados."));
  else textos.append(crear("strong", undefined, "A Brote le falta algo"), crear("span", undefined, resumen.faltan.map((p) => p.titulo).join(", ")));
  const botones = crear("div", "botones");
  botones.append(boton("Revisar de nuevo", "boton", () => void revisarTodo(), estado.ocupado));
  if (!resumen.listo || estado.trabajandoEn) botones.append(boton("Reparar", "boton boton-primario", () => void prepararTodo(), estado.ocupado || !resumen.hayAutomatico));
  if (estado.reparado && resumen.listo) botones.append(boton("Reiniciar Brote", "boton boton-primario", () => void invoke("reiniciar"), estado.ocupado));
  indicador.append(punto, textos, botones);
  const partes: HTMLElement[] = [cabecera("Estado"), indicador];
  if (estado.trabajandoEn || !resumen.listo) partes.push(barraPreparacion());
  partes.push(...tarjetasDelUsuario(), detallesTecnicos());
  return partes;
}

function seccionFunciones(): HTMLElement[] {
  return [
    cabecera("Funciones", "Lo apagado no corre por detrás, no pide permisos y no aparece en la isla."),
    vistaFunciones(false),
    cabecera("Tarjetas de Inicio", "Qué se ve en la pestaña Brote de la isla, y en qué orden."),
    vistaTarjetasInicio(),
  ];
}

function seccionAula(): HTMLElement[] {
  const partes: HTMLElement[] = [cabecera("Aula", "Canvas o Moodle, solo lectura: tus entregas en la isla y un aviso 24 h y 2 h antes. Nunca tu contraseña.")];
  if (!estado.funciones.activas.aula) {
    const apagada = crear("div", "tarjeta aviso-apagada");
    apagada.append(
      crear("p", undefined, "La función Aula está apagada: Brote no lee tu campus."),
      boton("Prender el aula", "boton boton-primario", () => {
        estado.funciones.activas.aula = true;
        pintar();
        void guardarFunciones();
      }),
    );
    partes.push(apagada);
  }
  const aula = paso("aula");
  if (aula?.accion?.tipo === "aula") partes.push(tarjetaPaso({ ...aula, accion: undefined }, [formularioAula(aula.accion.configurada, aula.accion.plataforma)]));
  else partes.push(crear("p", "vacio", estado.revisado ? "No pude revisar el aula." : "Revisando…"));
  return partes;
}

const ESTADOS_PERMISO = { concedido: "Concedido", negado: "Negado", "sin-preguntar": "No lo ha pedido", "sin-usar": "Sin usar" } as const;

function seccionPermisos(): HTMLElement[] {
  const partes: HTMLElement[] = [cabecera("Permisos de macOS", "Qué permisos usa Brote, para qué, y cuáles puedes quitar.")];
  if (!EN_MAC) {
    partes.push(crear("p", "nota", "En este computador Brote no necesita permisos especiales del sistema."));
    return partes;
  }
  const lectura: LecturaPermisos | null = estado.permisos
    ? { ...estado.permisos, calendarios: permisoCalendarioDePaso(estado.pasos) ?? estado.permisos.calendarios }
    : null;
  for (const fila of filasPermisos(estado.funciones.activas, lectura)) {
    const tarjeta = crear("article", `tarjeta permiso${fila.falta ? " falta" : ""}${fila.sobra ? " sobra" : ""}`);
    const cabeza = crear("div", "tarjeta-cabeza");
    cabeza.append(crear("h3", undefined, fila.nombre), crear("span", `chip-estado ${fila.estado}`, ESTADOS_PERMISO[fila.estado]));
    tarjeta.append(
      cabeza,
      crear("p", "tarjeta-texto", fila.usadoPor.length > 0 ? `Lo usa: ${fila.usadoPor.map((f) => f.nombre).join(", ")}.` : "Ninguna función activa lo usa."),
    );
    if (fila.falta) tarjeta.append(crear("p", "nota-permiso", `Sin este permiso, «${fila.usadoPor[0].nombre}» no funciona. Actívalo en Configuración del Sistema → ${fila.donde}.`));
    if (fila.sobra) {
      tarjeta.append(
        crear("p", "nota-permiso", `Ya no hace falta. Si se lo diste antes, puedes quitarlo en Configuración del Sistema → ${fila.donde}.`),
      );
    }
    if (fila.falta || fila.sobra) {
      const botones = crear("div", "botones");
      botones.append(
        boton("Abrir Privacidad y seguridad", "boton", () => void invoke("abrir_enlace", { cual: fila.enlace }).catch((e) => mostrarAviso(mensajeDe(e), true))),
      );
      tarjeta.append(botones);
    }
    partes.push(tarjeta);
  }
  partes.push(crear("p", "nota", "Brote sabe si un permiso está dado solo cuando lo usa: nunca pregunta nada para averiguarlo."));
  return partes;
}

function seccionMemoria(): HTMLElement[] {
  const tarjeta = crear("article", "tarjeta");
  tarjeta.append(
    crear("h3", undefined, "Lo que sé de ti"),
    crear("p", "tarjeta-texto", "Todo lo que Brote recuerda, las frases que aprendió y las conversaciones guardadas, para corregirlo u olvidarlo."),
  );
  const botones = crear("div", "botones");
  botones.append(boton("Abrir «Lo que sé de ti»", "boton boton-primario", () => void invoke("abrir_memoria").catch((e) => mostrarAviso(mensajeDe(e), true))));
  tarjeta.append(botones);
  const partes: HTMLElement[] = [cabecera("Memoria"), tarjeta];
  const local = paso("memoria-local");
  if (local) {
    const busqueda = crear("p", "nota", `Búsqueda por significado: ${local.estado === "ok" ? "activada" : "sin configurar"} (en Funciones).`);
    partes.push(busqueda);
  }
  return partes;
}

function pintarDiario(): void {
  const lateral = crear("nav", "lateral");
  lateral.setAttribute("aria-label", "Secciones");
  const titulo = crear("div", "lateral-titulo", "Configurar Brote");
  lateral.append(titulo);
  const resumen = preparacion(estado.pasos, estado.consentimientos);
  for (const s of SECCIONES) {
    const b = boton("", `lateral-boton${s.id === seccion ? " actual" : ""}`, () => {
      seccion = s.id;
      pintar();
      raiz.querySelector("main")?.scrollTo(0, 0);
    });
    b.setAttribute("aria-current", String(s.id === seccion));
    b.append(crear("span", "lateral-icono", s.icono), crear("span", undefined, s.titulo));
    if (s.id === "estado" && estado.revisado && !resumen.listo) b.append(crear("span", "lateral-punto"));
    lateral.append(b);
  }
  const contenido = crear("main", "contenido");
  const vistas: Record<Seccion, () => HTMLElement[]> = {
    estado: seccionEstado,
    funciones: seccionFunciones,
    cuentas: () => [cabecera("Cuentas de IA", "Las IA que pueden usar los especialistas del equipo. Brote sigue usando Claude con tu cuenta."), ...vistaCuentas()],
    equipo: () => [cabecera("Equipo de Brote", "Especialistas en los que Brote puede delegar. Tú sigues hablando solo con Brote."), ...vistaEquipo()],
    conectores: () => [cabecera("Conectores", "Servicios que Brote puede usar cuando se lo pidas. Lo que solo lee no te pregunta; lo que cambia algo te pide permiso en la isla."), vistaConectores()],
    aula: seccionAula,
    permisos: seccionPermisos,
    memoria: seccionMemoria,
  };
  const partes = vistas[seccion]();
  contenido.append(...partes);
  raiz.replaceChildren(lateral, contenido);
  raiz.className = "raiz modo-diario";
}

// ---------------------------------------------------------------- inicio

alPintar(() => {
  // Se rearma todo con el estado nuevo; el scroll se conserva (al prender una función no se salta arriba).
  const scroll = raiz.querySelector("main")?.scrollTop ?? 0;
  if (modo === "asistente") pintarAsistente();
  else if (modo === "diario") pintarDiario();
  const main = raiz.querySelector("main");
  if (main) main.scrollTop = scroll;
});

/** Lo que el puente sabe de los permisos (si Brote está corriendo con el puente). */
const puente = new TransportePuente();
const conPuente = puente.iniciar().then(
  () => true,
  () => false,
);

async function pedirPermisos(): Promise<void> {
  if (!(await conPuente)) return;
  try {
    estado.permisos = await puente.consultar<LecturaPermisos>({ tipo: "permisos-estado" });
    pintar();
  } catch {
    // Sin puente (por ejemplo, con el simulador) los permisos quedan "sin usar".
  }
}

async function revisarTodo(): Promise<void> {
  void revisarConectores();
  void revisarEquipo();
  void pedirPermisos();
  await revisar();
}

async function iniciar(): Promise<void> {
  try {
    const texto = await invoke<string | null>("leer_funciones");
    estado.hayArchivoFunciones = texto !== null;
    estado.funciones = normalizarFunciones(texto ? JSON.parse(texto) : null);
  } catch {
    // Archivo roto: se parte de los valores por defecto (el próximo guardado lo arregla).
  }
  void revisarConectores();
  void revisarEquipo();
  void pedirPermisos();
  await revisar();
  modo = necesitaAsistente(estado.pasos, estado.hayArchivoFunciones) ? "asistente" : "diario";
  // Parámetros solo para la vista previa del diseño: ?seccion=funciones, ?paso=2.
  const parametros = new URLSearchParams(location.search);
  const pedida = parametros.get("seccion");
  if (SECCIONES.some((s) => s.id === pedida)) seccion = pedida as Seccion;
  const pasoPedido = Number(parametros.get("paso"));
  if (modo === "asistente" && (pasoPedido === 2 || pasoPedido === 3)) pasoAsistente = pasoPedido;
  pintar();
}

// Al volver a la ventana (por ejemplo, desde la terminal o Privacidad) se revisa de nuevo.
window.addEventListener("focus", () => {
  if (!estado.ocupado && modo !== "cargando") void revisarTodo();
});

void iniciar();
