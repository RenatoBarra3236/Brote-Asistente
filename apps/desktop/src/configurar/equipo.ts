// Configurar Brote → Cuentas de IA y Equipo (el equipo de Brote, docs/plan-multiagente.md).
//
//   Cuentas de IA: Claude (la de siempre, por Claude Code), Gemini (clave gratis de AI Studio, que se
//   pega aquí o en la terminal), ChatGPT y Grok (inicio de sesión en la terminal; "sin probar").
//   Equipo: un interruptor por especialista (📚 Tutor, 🔎 Investigador, ✍️ Redactor, ✅ Revisor,
//   🗓️ Planificador), con qué IA trabaja (solo modelos de cuentas conectadas), su rol en una línea y
//   sus instrucciones y su personalidad (SOUL.md) editables. Prender crea el agente en OpenClaw (con su
//   SOUL.md e IDENTITY.md); apagar lo borra.
//
// Todo pasa por Rust (`equipo_estado`, `especialista_guardar`, `especialista_quitar`, `cuenta_clave`,
// `abrir_terminal`, `abrir_enlace`), que valida contra listas cerradas. La clave nunca se guarda aquí
// más que en el campo mientras se escribe.

import { invoke } from "@tauri-apps/api/core";
import { MAX_INSTRUCCIONES, MAX_PERSONALIDAD, modeloInicial, modelosElegibles, type EstadoCuenta, type EstadoEspecialista } from "../agente/especialistas";
import { boton, crear, estado, guardarFunciones, mensajeDe, mostrarAviso, pintar } from "./comun";

interface EstadoEquipo {
  cuentas: EstadoCuenta[];
  especialistas: EstadoEspecialista[];
  delegacion: string[];
  frenado: boolean;
}

let datos: EstadoEquipo | null = null;
let revisando = false;
let error: string | null = null;
/** El especialista o la cuenta que se está guardando (solo uno a la vez). */
let trabajandoEn: string | null = null;
/** Lo escrito en los formularios (sobrevive a que la ventana se vuelva a armar). */
const borradores = new Map<string, { modelo?: string; instrucciones?: string; personalidad?: string }>();
const clave = { texto: "", acepto: false };

export async function revisarEquipo(): Promise<void> {
  revisando = true;
  pintar();
  try {
    datos = JSON.parse(await invoke<string>("equipo_estado"));
    error = null;
  } catch (e) {
    error = mensajeDe(e);
  } finally {
    revisando = false;
    pintar();
  }
}

/** Corre una orden de Rust que responde { ok, detalle } y vuelve a revisar. */
async function hacer(clave: string, orden: () => Promise<string>): Promise<boolean> {
  trabajandoEn = clave;
  pintar();
  let ok = false;
  try {
    const resultado = JSON.parse(await orden()) as { ok: boolean; detalle: string };
    ok = resultado.ok;
    mostrarAviso(resultado.detalle, !resultado.ok);
  } catch (e) {
    mostrarAviso(mensajeDe(e), true);
  } finally {
    trabajandoEn = null;
  }
  await revisarEquipo();
  return ok;
}

function vacio(): HTMLElement[] {
  if (error) return [crear("p", "vacio", `No pude revisar el equipo: ${error}`)];
  return [crear("p", "vacio", "Revisando…")];
}

// ---------------------------------------------------------------- cuentas de IA

function abrirTerminal(cual: string): void {
  invoke("abrir_terminal", { cual }).then(
    () => mostrarAviso("Abrí una terminal. Cuando termines ahí, vuelve a esta ventana: reviso solo."),
    (e) => mostrarAviso(mensajeDe(e), true),
  );
}

/** La clave de Gemini: el enlace para crearla, el campo, el aviso de entrenamiento y la terminal como plan B. */
function formularioClave(cuenta: EstadoCuenta): HTMLElement {
  const formulario = crear("form", "formulario-conector");
  const crearClave = boton("Crear una clave en AI Studio", "boton", () => {
    invoke("abrir_enlace", { cual: "aistudio-clave" }).catch((e) => mostrarAviso(mensajeDe(e), true));
  });
  const campo = crear("input", "campo");
  campo.type = "password";
  campo.autocomplete = "off";
  campo.spellcheck = false;
  campo.placeholder = "Pega aquí tu clave (empieza con AIza…)";
  campo.value = clave.texto;
  campo.setAttribute("aria-label", `Clave de ${cuenta.nombre}`);
  const etiqueta = crear("label", "consentimiento");
  const casilla = crear("input");
  casilla.type = "checkbox";
  casilla.checked = clave.acepto;
  etiqueta.append(casilla, document.createTextNode(` Entiendo que, en el plan gratis, Google puede usar lo que le mande a ${cuenta.nombre} para entrenar sus modelos.`));
  const guardar = crear("button", "boton boton-primario", "Guardar clave");
  guardar.type = "submit";
  const actualizar = () => (guardar.disabled = trabajandoEn !== null || !clave.acepto || clave.texto.trim().length < 20);
  actualizar();
  campo.addEventListener("input", () => {
    clave.texto = campo.value;
    actualizar();
  });
  casilla.addEventListener("change", () => {
    clave.acepto = casilla.checked;
    actualizar();
  });
  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const texto = clave.texto.trim();
    void hacer(cuenta.id, () => invoke<string>("cuenta_clave", { cuenta: cuenta.id, clave: texto })).then((ok) => {
      if (ok) Object.assign(clave, { texto: "", acepto: false });
      pintar();
    });
  });
  const botones = crear("div", "botones");
  if (cuenta.terminal) botones.append(boton("Pegarla en la terminal", "boton", () => abrirTerminal(cuenta.terminal!), trabajandoEn !== null));
  botones.append(guardar);
  const filaCrear = crear("div", "botones");
  filaCrear.append(crearClave);
  formulario.append(filaCrear, campo, etiqueta, botones);
  return formulario;
}

function tarjetaCuenta(cuenta: EstadoCuenta): HTMLElement {
  const tarjeta = crear("article", `tarjeta paso ${cuenta.conectada ? "ok" : "opcional"}`);
  const titulo = crear("h3", undefined, cuenta.nombre);
  if (!cuenta.probado) titulo.append(crear("span", "etiqueta-sin-probar", "sin probar"));
  tarjeta.append(
    titulo,
    crear("p", "tarjeta-texto", cuenta.requisito),
    crear("p", "estado-conector", cuenta.conectada ? "✅ Conectada" : "○ Sin conectar"),
  );
  if (cuenta.conexion === "claude-code") {
    tarjeta.append(
      crear("p", "nota", cuenta.conectada ? "Es la misma cuenta con que funciona Brote." : "Brote necesita Claude Code con tu cuenta: revísalo en Estado."),
    );
    if (cuenta.aviso) tarjeta.append(crear("p", "nota", cuenta.aviso));
    return tarjeta;
  }
  if (cuenta.conexion === "clave") {
    if (cuenta.aviso) tarjeta.append(crear("p", "nota-permiso", cuenta.aviso));
    if (cuenta.conectada) {
      const botones = crear("div", "botones");
      botones.append(boton("Cambiar la clave", "boton", () => abrirTerminal(cuenta.terminal ?? "clave-gemini"), trabajandoEn !== null));
      tarjeta.append(botones);
    } else tarjeta.append(formularioClave(cuenta));
    return tarjeta;
  }
  if (!cuenta.conectada && cuenta.terminal) {
    tarjeta.append(crear("p", "nota", "Se inicia sesión en el navegador desde una terminal; cuando termines, vuelve a esta ventana."));
    const botones = crear("div", "botones");
    botones.append(boton("Iniciar sesión en la terminal", "boton boton-primario", () => abrirTerminal(cuenta.terminal!), trabajandoEn !== null));
    tarjeta.append(botones);
  }
  return tarjeta;
}

/** Configurar Brote → Cuentas de IA. */
export function vistaCuentas(): HTMLElement[] {
  if (!datos) return vacio();
  return [
    ...datos.cuentas.map(tarjetaCuenta),
    crear("p", "nota", "Brote nunca ve tus contraseñas: las cuentas quedan guardadas en OpenClaw, en este computador."),
  ];
}

// ---------------------------------------------------------------- equipo

function tarjetaEspecialista(e: EstadoEspecialista, cuentas: EstadoCuenta[]): HTMLElement {
  const borrador = borradores.get(e.id) ?? {};
  const ocupadoAhora = trabajandoEn !== null || revisando;
  const tarjeta = crear("article", `tarjeta funcion${e.activo ? " activa" : ""}`);
  const cabeza = crear("div", "funcion-cabeza");
  const texto = crear("div", "funcion-texto");
  texto.append(crear("h3", undefined, `${e.emoji} ${e.nombre}`), crear("p", "tarjeta-texto", e.rol));
  const interruptor = crear("label", "interruptor");
  interruptor.title = e.activo ? "Sacar del equipo" : "Sumar al equipo";
  const casilla = crear("input");
  casilla.type = "checkbox";
  casilla.setAttribute("role", "switch");
  casilla.setAttribute("aria-label", e.nombre);
  casilla.checked = e.activo;
  casilla.disabled = ocupadoAhora;
  const modelo = borrador.modelo ?? modeloInicial(e, cuentas);
  casilla.addEventListener("change", () => {
    if (casilla.checked) {
      if (!modelo) {
        casilla.checked = false;
        mostrarAviso("Primero conecta una IA en Cuentas de IA.", true);
        return;
      }
      void hacer(e.id, () =>
        invoke<string>("especialista_guardar", {
          id: e.id,
          modelo,
          instrucciones: borrador.instrucciones ?? e.instrucciones,
          personalidad: borrador.personalidad ?? null,
        }),
      );
    } else void hacer(e.id, () => invoke<string>("especialista_quitar", { id: e.id }));
  });
  interruptor.append(casilla, crear("span", "interruptor-riel"));
  cabeza.append(texto, interruptor);
  tarjeta.append(cabeza);
  if (trabajandoEn === e.id) tarjeta.append(crear("p", "esperando-autorizacion", e.activo ? "Guardando…" : "Sumándolo al equipo…"));

  const formulario = crear("form", "formulario-conector");
  const opciones = modelosElegibles(cuentas, e.modelo);
  const selector = crear("select");
  selector.setAttribute("aria-label", `IA de ${e.nombre}`);
  for (const opcion of opciones) {
    const o = crear("option", undefined, opcion.nombre);
    o.value = opcion.ref;
    o.selected = opcion.ref === modelo;
    selector.append(o);
  }
  if (opciones.length === 0) {
    const o = crear("option", undefined, "Conecta una IA en Cuentas de IA");
    o.value = "";
    selector.append(o);
    selector.disabled = true;
  }
  selector.addEventListener("change", () => borradores.set(e.id, { ...borradores.get(e.id), modelo: selector.value }));
  const instrucciones = crear("textarea", "campo instrucciones");
  instrucciones.rows = 3;
  instrucciones.maxLength = MAX_INSTRUCCIONES;
  instrucciones.value = borrador.instrucciones ?? e.instrucciones;
  instrucciones.setAttribute("aria-label", `Instrucciones de ${e.nombre}`);
  instrucciones.addEventListener("input", () => {
    borradores.set(e.id, { ...borradores.get(e.id), instrucciones: instrucciones.value });
    guardar.disabled = ocupadoAhora || !e.activo;
  });
  const personalidad = crear("textarea", "campo instrucciones");
  personalidad.rows = 3;
  personalidad.maxLength = MAX_PERSONALIDAD;
  personalidad.value = borrador.personalidad ?? e.personalidad;
  personalidad.setAttribute("aria-label", `Personalidad de ${e.nombre}`);
  personalidad.addEventListener("input", () => {
    borradores.set(e.id, { ...borradores.get(e.id), personalidad: personalidad.value });
    guardar.disabled = ocupadoAhora || !e.activo || !personalidad.value.trim();
  });
  const guardar = crear("button", "boton boton-primario", "Guardar cambios");
  guardar.type = "submit";
  guardar.disabled = ocupadoAhora || !e.activo || !borradores.has(e.id);
  selector.addEventListener("change", () => (guardar.disabled = ocupadoAhora || !e.activo));
  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const elegido = selector.value;
    if (!elegido) return;
    const editada = borradores.get(e.id)?.personalidad;
    void hacer(e.id, () =>
      invoke<string>("especialista_guardar", { id: e.id, modelo: elegido, instrucciones: instrucciones.value, personalidad: editada?.trim() ? editada : null }),
    ).then((ok) => {
      if (ok) borradores.delete(e.id);
      pintar();
    });
  });
  formulario.append(
    crear("p", "subpaso-titulo", "Trabaja con"),
    selector,
    crear("p", "subpaso-titulo", "Sus instrucciones"),
    instrucciones,
    crear("p", "subpaso-titulo", `Su personalidad · ${e.vibe}`),
    personalidad,
  );
  if (e.activo) {
    const botones = crear("div", "botones");
    botones.append(guardar);
    formulario.append(botones);
  }
  tarjeta.append(formulario);
  if (e.dentroDeBrote) {
    tarjeta.append(
      crear("p", "nota-permiso", "Este especialista se creó dentro de la carpeta de Brote. Apágalo y vuelve a prenderlo para darle su propia carpeta."),
    );
  }
  return tarjeta;
}

/** Configurar Brote → Equipo. */
export function vistaEquipo(): HTMLElement[] {
  const partes: HTMLElement[] = [];
  if (!estado.funciones.activas.especialistas) {
    const apagada = crear("div", "tarjeta aviso-apagada");
    apagada.append(
      crear("p", undefined, "El equipo está apagado: Brote responde todo solo."),
      boton("Prender el equipo", "boton boton-primario", () => {
        estado.funciones.activas.especialistas = true;
        pintar();
        void guardarFunciones();
      }),
    );
    partes.push(apagada);
  }
  if (!datos) return [...partes, ...vacio()];
  if (datos.frenado) {
    partes.push(crear("p", "nota-pendiente", "Tu plan semanal de Claude pasó el 85 %: Brote no le pasa tareas a los especialistas con Claude hasta que baje del 80 %. Los de otras IA siguen."));
  }
  partes.push(...datos.especialistas.map((e) => tarjetaEspecialista(e, datos!.cuentas)));
  partes.push(
    crear("p", "nota", "Cada especialista con Claude gasta de tu plan, como Brote. Brote solo delega cuando vale la pena, y sobre el 85 % de tu semana deja de usar a los de Claude."),
    crear("p", "nota", "Pendiente: modo Consejo (la misma pregunta a cada IA, respuestas lado a lado y una síntesis de Brote)."),
  );
  return partes;
}
