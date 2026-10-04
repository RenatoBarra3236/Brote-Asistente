// Los formularios que piden datos secretos: la dirección iCal del calendario y el aula (Canvas o
// Moodle). Los guarda Rust (`guardar_calendario`, `guardar_aula`), que los valida y los deja con
// permisos 600. Lo escrito sobrevive a que la ventana se vuelva a armar, y nunca sale de aquí salvo
// hacia Rust.

import { invoke } from "@tauri-apps/api/core";
import { boton, crear, estado, guardarPresupuesto, mensajeDe, mostrarAviso, revisar } from "./comun";

let borradorPresupuesto = "";

/** "200.000", "$200000", "200 mil" → 200000; `null` si no se entiende o está fuera de rango. */
export function leerPresupuestoEscrito(texto: string): number | null {
  const limpio = texto.toLowerCase().replace(/[$\s.]/g, "").replace(/(lucas|luca|mil|k)$/, "000");
  if (!/^\d+$/.test(limpio)) return null;
  const monto = Number(limpio);
  return monto >= 1000 && monto <= 100_000_000 ? monto : null;
}

/** El presupuesto mensual (tarjeta Gastos): un monto en pesos, guardar y quitar. Va al puente, que lo guarda en la base. */
export function formularioPresupuesto(actual: number | null): HTMLElement {
  const formulario = crear("form", "formulario-ical");
  const campo = crear("input", "campo");
  campo.inputMode = "numeric";
  campo.autocomplete = "off";
  campo.placeholder = actual ? `Ahora: $${actual.toLocaleString("es-CL")} al mes` : "Por ejemplo: 200.000";
  campo.value = borradorPresupuesto;
  campo.setAttribute("aria-label", "Presupuesto mensual en pesos");
  const guardar = crear("button", "boton boton-primario", actual ? "Cambiar" : "Guardar");
  guardar.type = "submit";
  guardar.disabled = leerPresupuestoEscrito(borradorPresupuesto) === null;
  campo.addEventListener("input", () => {
    borradorPresupuesto = campo.value;
    guardar.disabled = leerPresupuestoEscrito(borradorPresupuesto) === null;
  });
  const botones = crear("div", "botones");
  if (actual) botones.append(boton("Quitar", "boton", () => void guardarPresupuesto(null)));
  botones.append(guardar);
  formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const monto = leerPresupuestoEscrito(borradorPresupuesto);
    if (monto === null) return;
    void guardarPresupuesto(monto).then((ok) => {
      if (ok) borradorPresupuesto = "";
    });
  });
  formulario.append(campo, botones);
  return formulario;
}

let borradorIcal = "";

/** La dirección iCal secreta: un campo oculto, como una contraseña, y los botones para guardarla o quitarla. */
export function formularioIcal(configurada: boolean): HTMLElement {
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
  guardar.disabled = estado.ocupado || borradorIcal.trim() === "";
  campo.addEventListener("input", () => {
    borradorIcal = campo.value;
    guardar.disabled = estado.ocupado || borradorIcal.trim() === "";
  });
  const botones = crear("div", "botones");
  if (configurada) botones.append(boton("Quitar", "boton", () => void guardarIcal(null), estado.ocupado));
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

const borradorAula = { plataforma: "canvas" as "canvas" | "moodle", url: "", token: "" };

const AYUDA_AULA = {
  canvas: "En Canvas: Cuenta → Configuración → «+ Nuevo token de acceso». Copia el token (se muestra una sola vez).",
  moodle: "En Moodle: tu nombre → Preferencias → Claves de seguridad, y copia la del servicio «Moodle mobile web service».",
};

/** El aula, solo lectura: la dirección del campus y un token personal. Nunca la contraseña. */
export function formularioAula(configurada: boolean, plataforma: "canvas" | "moodle" | null): HTMLElement {
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
  const actualizar = () => (guardar.disabled = estado.ocupado || !borradorAula.url.trim() || !borradorAula.token.trim());
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
  if (configurada) botones.append(boton("Quitar", "boton", () => void guardarAula(false), estado.ocupado));
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
    await invoke(
      "guardar_aula",
      guardar ? { tipo: borradorAula.plataforma, url: borradorAula.url, token: borradorAula.token } : { tipo: null, url: null, token: null },
    );
    borradorAula.url = "";
    borradorAula.token = "";
    mostrarAviso(guardar ? "Guardé tu aula. Reviso que funcione…" : "Quité el aula.");
  } catch (error) {
    mostrarAviso(`Aula: ${mensajeDe(error)}`, true);
    return;
  }
  await revisar();
}
