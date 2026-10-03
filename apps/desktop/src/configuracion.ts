// La ventana "Configurar Brote" (paso 10): muestra qué falta para que Brote funcione y lo arregla.
// La revisión y los arreglos los hace Rust con el script `configurar` (ver configuracion.rs); esta
// ventana solo pide pasos conocidos y abre terminales o páginas de una lista cerrada.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type Estado = "ok" | "falta" | "opcional";

type Accion =
  | { tipo: "automatica"; etiqueta: string; requiereConsentimiento?: boolean; textoConsentimiento?: string }
  | { tipo: "terminal"; etiqueta: string; terminal: string }
  | { tipo: "enlace"; etiqueta: string; enlace: string }
  | { tipo: "ical"; etiqueta: string; configurada: boolean }
  | { tipo: "aula"; etiqueta: string; configurada: boolean; plataforma: "canvas" | "moodle" | null };

interface Paso {
  id: string;
  titulo: string;
  estado: Estado;
  detalle: string;
  accion?: Accion;
  quitar?: { paso: string; etiqueta: string };
}

const ICONOS: Record<Estado, string> = { ok: "✅", falta: "⚠️", opcional: "○" };
/** Cuántas vueltas da "Arreglar todo" como máximo (cada arreglo puede destrabar otro). */
const VUELTAS = 14;

const contenedor = document.querySelector<HTMLElement>("#pasos")!;
const aviso = document.querySelector<HTMLParagraphElement>("#aviso")!;
const listo = document.querySelector<HTMLDivElement>("#listo")!;
const revisarBoton = document.querySelector<HTMLButtonElement>("#revisar")!;
const todoBoton = document.querySelector<HTMLButtonElement>("#todo")!;
const empezar = document.querySelector<HTMLButtonElement>("#empezar")!;

let pasos: Paso[] = [];
let ocupado = false;
/** Los pasos que el usuario aceptó explícitamente (configurar OpenClaw, instalar el modo programador…). */
const consentimientos = new Set<string>();
const TEXTO_CONSENTIMIENTO =
  " Entiendo que OpenClaw podrá usar este computador para ayudarme, y que Brote me pedirá permiso antes de ejecutar comandos.";
/** Lo escrito en el campo de la dirección iCal (sobrevive a que la ventana se vuelva a pintar). */
let borradorIcal = "";

function crear<K extends keyof HTMLElementTagNameMap>(etiqueta: K, clase?: string, texto?: string): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function mostrarAviso(texto: string, error = false): void {
  aviso.textContent = texto;
  aviso.classList.toggle("error", error);
  aviso.hidden = false;
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function puedeAutomatico(paso: Paso): boolean {
  return paso.estado === "falta" && paso.accion?.tipo === "automatica" && (!paso.accion.requiereConsentimiento || consentimientos.has(paso.id));
}

function pintar(): void {
  const faltan = pasos.filter((p) => p.estado === "falta");
  listo.hidden = faltan.length > 0 || pasos.length === 0;
  todoBoton.disabled = ocupado || !pasos.some((p) => p.estado === "falta" && p.accion?.tipo === "automatica");
  revisarBoton.disabled = ocupado;

  contenedor.replaceChildren(
    ...pasos.map((paso) => {
      const tarjeta = crear("article", `tarjeta paso ${paso.estado}`);
      const cabeza = crear("div", "tarjeta-cabeza");
      cabeza.append(crear("h3", undefined, `${ICONOS[paso.estado]}  ${paso.titulo}`));
      tarjeta.append(cabeza, crear("p", "tarjeta-texto", paso.detalle));

      if (paso.quitar) {
        const quitar = paso.quitar;
        const botones = crear("div", "botones");
        const boton = crear("button", "boton", quitar.etiqueta);
        boton.type = "button";
        boton.disabled = ocupado;
        boton.addEventListener("click", () => void deshacer(paso.titulo, quitar.paso));
        botones.append(boton);
        tarjeta.append(botones);
      }
      const accion = paso.accion;
      if (!accion) return tarjeta;
      if (accion.tipo === "ical") {
        tarjeta.append(formularioIcal(accion.configurada));
        return tarjeta;
      }
      if (accion.tipo === "aula") {
        tarjeta.append(formularioAula(accion.configurada, accion.plataforma));
        return tarjeta;
      }
      const botones = crear("div", "botones");
      if (accion.tipo === "automatica" && accion.requiereConsentimiento) {
        const etiqueta = crear("label", "consentimiento");
        const casilla = crear("input");
        casilla.type = "checkbox";
        casilla.checked = consentimientos.has(paso.id);
        casilla.addEventListener("change", () => {
          if (casilla.checked) consentimientos.add(paso.id);
          else consentimientos.delete(paso.id);
          aviso.hidden = true;
          pintar();
        });
        etiqueta.append(casilla, document.createTextNode(accion.textoConsentimiento ?? TEXTO_CONSENTIMIENTO));
        tarjeta.append(etiqueta);
      }
      const boton = crear("button", "boton boton-primario", accion.etiqueta);
      boton.type = "button";
      boton.disabled = ocupado || (accion.tipo === "automatica" && accion.requiereConsentimiento === true && !consentimientos.has(paso.id));
      boton.addEventListener("click", () => void actuar(paso));
      botones.append(boton);
      tarjeta.append(botones);
      return tarjeta;
    }),
  );
}

/**
 * La dirección iCal secreta: un campo (oculto, como una contraseña) y los botones para guardarla o
 * quitarla. La guarda Rust (`guardar_calendario`), que la valida y la deja con permisos 600.
 */
function formularioIcal(configurada: boolean): HTMLElement {
  const formulario = crear("form", "formulario-ical");
  const campo = crear("input", "campo");
  campo.type = "password";
  campo.autocomplete = "off";
  campo.spellcheck = false;
  campo.placeholder = configurada ? "Dirección guardada (oculta). Pega otra para cambiarla" : "https://calendar.google.com/calendar/ical/…/basic.ics";
  campo.value = borradorIcal;
  campo.setAttribute("aria-label", "Dirección secreta en formato iCal");
  const guardar = crear("button", "boton boton-primario", "Guardar");
  guardar.type = "submit";
  guardar.disabled = ocupado || borradorIcal.trim() === "";
  campo.addEventListener("input", () => {
    borradorIcal = campo.value;
    guardar.disabled = ocupado || borradorIcal.trim() === "";
  });
  const botones = crear("div", "botones");
  if (configurada) {
    const quitar = crear("button", "boton", "Quitar");
    quitar.type = "button";
    quitar.disabled = ocupado;
    quitar.addEventListener("click", () => void guardarIcal(null));
    botones.append(quitar);
  }
  botones.append(guardar);
  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    void guardarIcal(borradorIcal);
  });
  formulario.append(campo, botones);
  return formulario;
}

async function guardarIcal(url: string | null): Promise<void> {
  try {
    await invoke("guardar_calendario", { url });
    borradorIcal = "";
    mostrarAviso(url ? "Guardé la dirección. Reviso que funcione…" : "Quité la dirección del calendario.");
  } catch (error) {
    mostrarAviso(`Calendario: ${mensajeDe(error)}`, true);
    return;
  }
  await revisar();
}

/** Lo escrito en el formulario del aula (el token nunca sale de esta ventana salvo hacia Rust). */
const borradorAula = { plataforma: "canvas" as "canvas" | "moodle", url: "", token: "" };

const AYUDA_AULA = {
  canvas: "En Canvas: Cuenta → Configuración → «+ Nuevo token de acceso». Copia el token (se muestra una sola vez).",
  moodle: "En Moodle: tu nombre → Preferencias → Claves de seguridad, y copia la del servicio «Moodle mobile web service».",
};

/**
 * El aula (Canvas o Moodle), solo lectura: la dirección del campus y un token personal. Nunca la
 * contraseña. Lo guarda Rust (`guardar_aula`), que lo valida y lo deja con permisos 600.
 */
function formularioAula(configurada: boolean, plataforma: "canvas" | "moodle" | null): HTMLElement {
  const formulario = crear("form", "formulario-conector");
  if (plataforma && !borradorAula.url && !borradorAula.token) borradorAula.plataforma = plataforma;
  const selector = crear("select");
  selector.setAttribute("aria-label", "Plataforma del aula");
  for (const [valor, texto] of [["canvas", "Canvas"], ["moodle", "Moodle"]] as const) {
    const opcion = crear("option", undefined, texto);
    opcion.value = valor;
    opcion.selected = borradorAula.plataforma === valor;
    selector.append(opcion);
  }
  const ayuda = crear("p", "nota", AYUDA_AULA[borradorAula.plataforma]);
  const url = crear("input", "campo");
  url.type = "url";
  url.placeholder = "https://campus.tu-universidad.cl";
  url.value = borradorAula.url;
  url.setAttribute("aria-label", "Dirección del campus");
  const token = crear("input", "campo");
  token.type = "password";
  token.autocomplete = "off";
  token.spellcheck = false;
  token.placeholder = configurada ? "Token guardado (oculto). Pega otro para cambiarlo" : "Token personal (nunca tu contraseña)";
  token.value = borradorAula.token;
  token.setAttribute("aria-label", "Token personal del aula");
  const guardar = crear("button", "boton boton-primario", "Guardar");
  guardar.type = "submit";
  const actualizar = () => (guardar.disabled = ocupado || !borradorAula.url.trim() || !borradorAula.token.trim());
  actualizar();
  selector.addEventListener("change", () => {
    borradorAula.plataforma = selector.value === "moodle" ? "moodle" : "canvas";
    ayuda.textContent = AYUDA_AULA[borradorAula.plataforma];
  });
  url.addEventListener("input", () => {
    borradorAula.url = url.value;
    actualizar();
  });
  token.addEventListener("input", () => {
    borradorAula.token = token.value;
    actualizar();
  });
  const botones = crear("div", "botones");
  if (configurada) {
    const quitar = crear("button", "boton", "Quitar");
    quitar.type = "button";
    quitar.disabled = ocupado;
    quitar.addEventListener("click", () => void guardarAula(false));
    botones.append(quitar);
  }
  botones.append(guardar);
  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    void guardarAula(true);
  });
  formulario.append(selector, ayuda, url, token, botones);
  return formulario;
}

async function guardarAula(guardar: boolean): Promise<void> {
  try {
    await invoke("guardar_aula", guardar ? { tipo: borradorAula.plataforma, url: borradorAula.url, token: borradorAula.token } : { tipo: null, url: null, token: null });
    borradorAula.url = "";
    borradorAula.token = "";
    mostrarAviso(guardar ? "Guardé tu aula. Reviso que funcione…" : "Quité el aula.");
  } catch (error) {
    mostrarAviso(`Aula: ${mensajeDe(error)}`, true);
    return;
  }
  await revisar();
}

async function revisar(): Promise<void> {
  ocupado = true;
  pintar();
  try {
    pasos = JSON.parse(await invoke<string>("configuracion", { orden: "revisar" }));
  } catch (error) {
    mostrarAviso(`No pude revisar: ${mensajeDe(error)}`, true);
  } finally {
    ocupado = false;
    pintar();
  }
}

/** Aplica un paso automático. Devuelve si salió bien. */
async function aplicar(paso: Paso): Promise<boolean> {
  mostrarAviso(`${paso.titulo}: trabajando… (puede tardar un poco)`);
  const resultado = JSON.parse(await invoke<string>("configuracion", { orden: "aplicar", paso: paso.id })) as {
    ok: boolean;
    detalle: string;
  };
  mostrarAviso(resultado.detalle, !resultado.ok);
  return resultado.ok;
}

/** El segundo botón de un paso (por ejemplo, desinstalar el modo programador). */
async function deshacer(titulo: string, id: string): Promise<void> {
  ocupado = true;
  pintar();
  try {
    await aplicar({ id, titulo, estado: "ok", detalle: "" });
  } catch (error) {
    mostrarAviso(`${titulo}: ${mensajeDe(error)}`, true);
  } finally {
    ocupado = false;
  }
  await revisar();
}

async function actuar(paso: Paso): Promise<void> {
  const accion = paso.accion;
  if (!accion) return;
  try {
    if (accion.tipo === "terminal") {
      await invoke("abrir_terminal", { cual: accion.terminal });
      mostrarAviso("Abrí una terminal. Cuando termines ahí, vuelve y pulsa «Revisar de nuevo».");
      return;
    }
    if (accion.tipo === "enlace") {
      await invoke("abrir_enlace", { cual: accion.enlace });
      mostrarAviso("Abrí la página en tu navegador. Después de instalarlo, pulsa «Revisar de nuevo».");
      return;
    }
    ocupado = true;
    pintar();
    await aplicar(paso);
  } catch (error) {
    mostrarAviso(`${paso.titulo}: ${mensajeDe(error)}`, true);
  } finally {
    ocupado = false;
  }
  await revisar();
}

todoBoton.addEventListener("click", async () => {
  // Configurar OpenClaw necesita el consentimiento explícito: se avisa en vez de no hacer nada.
  const sinConsentimiento = pasos.find(
    (p) => p.estado === "falta" && p.accion?.tipo === "automatica" && p.accion.requiereConsentimiento && !consentimientos.has(p.id),
  );
  if (sinConsentimiento && !pasos.some(puedeAutomatico)) {
    mostrarAviso("Primero marca la casilla de «Agente de OpenClaw» para aceptar que se configure.", true);
    const casilla = document.querySelector<HTMLElement>(".consentimiento");
    casilla?.scrollIntoView({ behavior: "smooth", block: "center" });
    casilla?.classList.add("resaltada");
    return;
  }
  ocupado = true;
  pintar();
  try {
    for (let vuelta = 0; vuelta < VUELTAS; vuelta++) {
      const siguiente = pasos.find(puedeAutomatico);
      if (!siguiente) break;
      if (!(await aplicar(siguiente))) break;
      pasos = JSON.parse(await invoke<string>("configuracion", { orden: "revisar" }));
      pintar();
    }
  } catch (error) {
    mostrarAviso(mensajeDe(error), true);
  } finally {
    ocupado = false;
  }
  await revisar();
  const pendientes = pasos.filter((p) => p.estado === "falta");
  if (pendientes.length > 0) mostrarAviso(`Falta: ${pendientes.map((p) => p.titulo).join(", ")}. Revisa los botones de cada uno.`);
});

// ---------------------------------------------------------------- conectores

interface FilaConector {
  id: string;
  nombre: string;
  descripcion: string;
  auth: "oauth" | "token";
  probado: boolean;
  estado: "conectado" | "sin-autorizar" | "desconectado";
  herramientas: number;
  ayudaToken?: string;
}

interface FilaPropio {
  id: string;
  url: string;
  estado: "conectado" | "sin-autorizar" | "desconectado";
  herramientas: number;
}

/** Lo que manda Rust (evento `conector`) en cada fase de una conexión. */
interface FaseConector {
  id: string;
  fase: "agregando" | "autorizar" | "esperando" | "listo" | "error" | "cancelado";
  url?: string;
  detalle?: string;
}

const contenedorConectores = document.querySelector<HTMLElement>("#conectores")!;
let conectores: { catalogo: FilaConector[]; propios: FilaPropio[] } | null = null;
/** La conexión en curso: solo una a la vez. */
let conexion: { id: string; fase: FaseConector["fase"]; url?: string } | null = null;
let revisandoConectores = false;
/** Lo escrito en los formularios (sobrevive a que se vuelva a pintar). */
const tokens = new Map<string, string>();
const propio = { nombre: "", url: "", acepto: false };
const TEXTO_CONSENTIMIENTO_PROPIO =
  " Entiendo que este servicio podrá ver lo que le pida a Brote que haga con él, y que cada acción me pedirá permiso.";

function estadoTexto(estado: FilaConector["estado"], herramientas: number): string {
  if (estado === "conectado") return `✅ Conectado · ${herramientas === 1 ? "1 herramienta" : `${herramientas} herramientas`}`;
  if (estado === "sin-autorizar") return "⚠️ Guardado, pero falta autorizar (o el token no sirve)";
  return "○ Sin conectar";
}

function boton(texto: string, clase: string, alHacer: () => void, deshabilitado = false): HTMLButtonElement {
  const b = crear("button", clase, texto);
  b.type = "button";
  b.disabled = deshabilitado;
  b.addEventListener("click", alHacer);
  return b;
}

/** Mientras espera al navegador: el botón para abrir la autorización y Cancelar. */
function panelEsperando(id: string): HTMLElement {
  const caja = crear("div");
  const texto =
    conexion?.fase === "agregando" ? "Preparando la conexión…" : conexion?.url ? "Esperando que autorices en el navegador…" : "Conectando…";
  caja.append(crear("p", "esperando-autorizacion", texto));
  const botones = crear("div", "botones");
  botones.append(boton("Cancelar", "boton", () => void cancelarConexion()));
  if (conexion?.url) {
    const url = conexion.url;
    botones.append(boton("Abrir en el navegador", "boton boton-primario", () => void abrirAutorizacion(id, url)));
  }
  caja.append(botones);
  return caja;
}

function tarjetaConector(c: FilaConector): HTMLElement {
  const tarjeta = crear("article", `tarjeta paso ${c.estado === "conectado" ? "ok" : "opcional"}`);
  const titulo = crear("h3", undefined, c.nombre);
  if (!c.probado) titulo.append(crear("span", "etiqueta-sin-probar", "sin probar"));
  tarjeta.append(titulo, crear("p", "tarjeta-texto", c.descripcion), crear("p", "estado-conector", estadoTexto(c.estado, c.herramientas)));
  if (conexion?.id === c.id) {
    tarjeta.append(panelEsperando(c.id));
    return tarjeta;
  }
  const ocupadoAhora = conexion !== null || revisandoConectores;
  if (c.auth === "token" && c.estado !== "conectado") {
    const formulario = crear("form", "formulario-conector");
    if (c.ayudaToken) formulario.append(crear("p", "nota", c.ayudaToken));
    const campo = crear("input", "campo");
    campo.type = "password";
    campo.autocomplete = "off";
    campo.spellcheck = false;
    campo.placeholder = "Token personal (fine-grained, de solo lectura)";
    campo.value = tokens.get(c.id) ?? "";
    campo.setAttribute("aria-label", `Token de ${c.nombre}`);
    const conectar = crear("button", "boton boton-primario", "Conectar");
    conectar.type = "submit";
    conectar.disabled = ocupadoAhora || !campo.value.trim();
    campo.addEventListener("input", () => {
      tokens.set(c.id, campo.value);
      conectar.disabled = ocupadoAhora || !campo.value.trim();
    });
    formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      void conectar_(c.id, { token: tokens.get(c.id) ?? "" });
    });
    const botones = crear("div", "botones");
    if (c.estado === "sin-autorizar") botones.append(boton("Desconectar", "boton", () => void desconectar(c.id, c.nombre), ocupadoAhora));
    botones.append(conectar);
    formulario.append(campo, botones);
    tarjeta.append(formulario);
    return tarjeta;
  }
  const botones = crear("div", "botones");
  if (c.estado !== "desconectado") botones.append(boton("Desconectar", "boton", () => void desconectar(c.id, c.nombre), ocupadoAhora));
  if (c.estado !== "conectado") {
    botones.append(boton(c.estado === "sin-autorizar" ? "Autorizar" : "Conectar", "boton boton-primario", () => void conectar_(c.id, {}), ocupadoAhora));
  }
  tarjeta.append(botones);
  return tarjeta;
}

function tarjetaPropio(p: FilaPropio): HTMLElement {
  const tarjeta = crear("article", `tarjeta paso ${p.estado === "conectado" ? "ok" : "opcional"}`);
  tarjeta.append(crear("h3", undefined, `${p.id} (agregado por ti)`), crear("p", "tarjeta-texto", p.url), crear("p", "estado-conector", estadoTexto(p.estado, p.herramientas)));
  if (conexion?.id === p.id) {
    tarjeta.append(panelEsperando(p.id));
    return tarjeta;
  }
  const botones = crear("div", "botones");
  botones.append(boton("Desconectar", "boton", () => void desconectar(p.id, p.id), conexion !== null || revisandoConectores));
  tarjeta.append(botones);
  return tarjeta;
}

/** "Agregar otro por URL": nombre, dirección https y una casilla de consentimiento propia. */
function formularioPropio(): HTMLElement {
  const detalles = crear("details", "tarjeta avanzado");
  detalles.open = propio.nombre !== "" || propio.url !== "" || conexion?.id === propio.nombre;
  detalles.append(crear("summary", undefined, "Agregar otro por URL (avanzado)"));
  const formulario = crear("form", "formulario-conector");
  formulario.append(crear("p", "nota", "Un servidor MCP remoto con OAuth. Ninguna de sus herramientas queda permitida sin preguntar."));
  const nombre = crear("input", "campo");
  nombre.placeholder = "nombre (minúsculas, números y guiones)";
  nombre.value = propio.nombre;
  nombre.setAttribute("aria-label", "Nombre del servidor");
  const url = crear("input", "campo");
  url.type = "url";
  url.placeholder = "https://…/mcp";
  url.value = propio.url;
  url.setAttribute("aria-label", "Dirección del servidor MCP");
  const etiqueta = crear("label", "consentimiento");
  const casilla = crear("input");
  casilla.type = "checkbox";
  casilla.checked = propio.acepto;
  etiqueta.append(casilla, document.createTextNode(TEXTO_CONSENTIMIENTO_PROPIO));
  const agregar = crear("button", "boton boton-primario", "Conectar");
  agregar.type = "submit";
  const actualizar = () => {
    agregar.disabled = conexion !== null || !propio.acepto || !/^[a-z0-9-]{2,32}$/.test(propio.nombre) || !propio.url.startsWith("https://");
  };
  actualizar();
  nombre.addEventListener("input", () => {
    propio.nombre = nombre.value.trim();
    actualizar();
  });
  url.addEventListener("input", () => {
    propio.url = url.value.trim();
    actualizar();
  });
  casilla.addEventListener("change", () => {
    propio.acepto = casilla.checked;
    actualizar();
  });
  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    if (propio.acepto) void conectar_(propio.nombre, { url: propio.url });
  });
  const botones = crear("div", "botones");
  botones.append(agregar);
  formulario.append(nombre, url, etiqueta, botones);
  detalles.append(formulario);
  return detalles;
}

function pintarConectores(): void {
  if (!conectores) return;
  const nuevo = conexion && !conectores.catalogo.some((c) => c.id === conexion!.id) && !conectores.propios.some((p) => p.id === conexion!.id);
  contenedorConectores.replaceChildren(
    ...conectores.catalogo.map(tarjetaConector),
    ...conectores.propios.map(tarjetaPropio),
    // Un propio recién agregado todavía no aparece en la lista: su espera va en el formulario.
    ...(nuevo ? [panelEsperando(conexion!.id)] : []),
    formularioPropio(),
  );
}

async function revisarConectores(): Promise<void> {
  revisandoConectores = true;
  pintarConectores();
  try {
    conectores = JSON.parse(await invoke<string>("configuracion", { orden: "conectores" }));
  } catch (error) {
    contenedorConectores.replaceChildren(crear("p", "vacio", `No pude revisar los conectores: ${mensajeDe(error)}`));
  } finally {
    revisandoConectores = false;
    pintarConectores();
  }
}

async function conectar_(id: string, datos: { url?: string; token?: string }): Promise<void> {
  if (conexion) return;
  conexion = { id, fase: "agregando" };
  pintarConectores();
  try {
    await invoke("conector_conectar", { id, url: datos.url ?? null, token: datos.token ?? null });
  } catch (error) {
    conexion = null;
    mostrarAviso(`No pude conectar: ${mensajeDe(error)}`, true);
    pintarConectores();
  }
}

async function cancelarConexion(): Promise<void> {
  try {
    await invoke("conector_cancelar");
  } catch (error) {
    mostrarAviso(mensajeDe(error), true);
  }
}

async function abrirAutorizacion(id: string, url: string): Promise<void> {
  try {
    await invoke("abrir_autorizacion", { id, url });
  } catch (error) {
    mostrarAviso(`No abrí la página: ${mensajeDe(error)}`, true);
  }
}

async function desconectar(id: string, nombre: string): Promise<void> {
  revisandoConectores = true;
  pintarConectores();
  try {
    const resultado = JSON.parse(await invoke<string>("configuracion", { orden: "desconectar", paso: id })) as { ok: boolean; detalle: string };
    mostrarAviso(resultado.detalle, !resultado.ok);
  } catch (error) {
    mostrarAviso(`${nombre}: ${mensajeDe(error)}`, true);
  }
  await revisarConectores();
}

void listen<FaseConector>("conector", ({ payload }) => {
  if (!conexion || payload.id !== conexion.id) return;
  switch (payload.fase) {
    case "agregando":
    case "esperando":
      conexion.fase = payload.fase;
      break;
    case "autorizar":
      conexion = { ...conexion, fase: "autorizar", url: payload.url };
      break;
    case "listo":
      conexion = null;
      tokens.delete(payload.id);
      if (payload.id === propio.nombre) Object.assign(propio, { nombre: "", url: "", acepto: false });
      mostrarAviso(payload.detalle ?? "Listo.");
      void revisarConectores();
      return;
    case "error":
    case "cancelado":
      conexion = null;
      mostrarAviso(payload.fase === "cancelado" ? "Cancelé la conexión." : (payload.detalle ?? "No se pudo conectar."), payload.fase === "error");
      void revisarConectores();
      return;
  }
  pintarConectores();
});

revisarBoton.addEventListener("click", () => {
  void revisar();
  void revisarConectores();
});
empezar.addEventListener("click", () => void invoke("reiniciar"));
// Al volver a la ventana (por ejemplo, desde la terminal) se revisa de nuevo.
window.addEventListener("focus", () => {
  if (!ocupado) void revisar();
});

void revisar();
void revisarConectores();
