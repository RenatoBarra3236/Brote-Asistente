// Configurar Brote → Conectores: Todoist, Notion, GitHub, Canva y servidores MCP propios por URL.
// Conectar lo hace Rust con el script `configurar` (lista cerrada de conectores) y avisa cada fase
// con el evento `conector`; la página de autorización solo se abre si es de los hosts del conector.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { boton, crear, mensajeDe, mostrarAviso } from "./comun";


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

/** El contenedor se crea una vez y se reutiliza cuando la ventana se vuelve a armar (guarda su estado). */
const contenedorConectores = crear("div", "conectores");
contenedorConectores.setAttribute("aria-live", "polite");
contenedorConectores.append(crear("p", "vacio", "Revisando…"));
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

export async function revisarConectores(): Promise<void> {
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

/** La sección de conectores (el mismo elemento cada vez). */
export function vistaConectores(): HTMLElement {
  return contenedorConectores;
}
