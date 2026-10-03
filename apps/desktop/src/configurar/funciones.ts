// "Qué quieres que haga Brote": presets y una tarjeta con interruptor por función, que dice en una
// línea qué hace y qué permiso de macOS pide. Lo que pide datos (iCal, aula) o consentimiento (modo
// programador) se configura dentro de su tarjeta al prenderla. Debajo, el orden y la visibilidad de
// las tarjetas de Inicio en la isla. Todo va a funciones.json (Rust lo valida y lo guarda).

import { FUNCIONES, NOMBRES_TARJETAS, PRESETS, activasDePreset, presetDe, type Funcion, type IdPreset, type IdTarjeta } from "../agente/funciones";
import { PERMISOS, type Paso } from "../agente/preparacion";
import { EN_MAC, boton, botonesDePaso, crear, estado, guardarFunciones, paso, pintar } from "./comun";
import { formularioAula, formularioIcal } from "./formularios";

/** En el asistente se guarda al final ("Empezar"); en el uso diario, al tiro. */
async function cambiar(enAsistente: boolean): Promise<void> {
  pintar();
  if (!enAsistente) await guardarFunciones();
}

function nombrePermiso(funcion: Funcion): string {
  if (!funcion.permiso) return "No pide permisos de macOS.";
  const permiso = PERMISOS.find((p) => p.id === funcion.permiso)!;
  if (funcion.id === "calendario") return "macOS pide permiso de Calendarios (solo si usas el Calendario del Mac).";
  if (funcion.id === "musica") return "macOS pide permiso de Automatización la primera vez que Spotify o Música están abiertos.";
  return `macOS pide permiso: ${permiso.nombre}.`;
}

/** Una línea de estado de un paso opcional dentro de la tarjeta de una función, con sus botones. */
function subpaso(p: Paso | undefined, titulo: string, extra: HTMLElement[] = []): HTMLElement | null {
  if (!p) return null;
  const caja = crear("div", `subpaso ${p.estado}`);
  caja.append(crear("p", "subpaso-titulo", `${p.estado === "ok" ? "✅" : "○"} ${titulo}`), crear("p", "nota", p.detalle), ...extra, ...botonesDePaso(p));
  return caja;
}

/** Lo que se configura dentro de la tarjeta de una función prendida (o lo que queda instalado si se apagó). */
function configuracionDe(funcion: Funcion, activa: boolean): HTMLElement[] {
  const partes: (HTMLElement | null)[] = [];
  if (funcion.id === "programador") {
    const hooks = paso("programador");
    // Apagado con los hooks instalados: se ofrece quitarlos (si no, Claude Code los sigue llamando).
    if (!activa && hooks?.estado === "ok") partes.push(subpaso(hooks, "Los hooks siguen instalados en Claude Code"));
    if (activa) partes.push(subpaso(hooks, hooks?.estado === "ok" ? "Hooks instalados" : "Falta instalar los hooks en Claude Code"));
  }
  if (!activa) return partes.filter((p): p is HTMLElement => p !== null);
  switch (funcion.id) {
    case "calendario": {
      if (EN_MAC) partes.push(subpaso(paso("calendario-mac"), "Calendario del Mac"));
      const ical = paso("calendario-ical");
      if (ical?.accion?.tipo === "ical") partes.push(subpaso({ ...ical, accion: undefined }, "Dirección iCal (Google Calendar)", [formularioIcal(ical.accion.configurada)]));
      break;
    }
    case "aula": {
      const aula = paso("aula");
      if (aula?.accion?.tipo === "aula") partes.push(subpaso({ ...aula, accion: undefined }, "Tu campus", [formularioAula(aula.accion.configurada, aula.accion.plataforma)]));
      break;
    }
    case "memoria-local":
      partes.push(subpaso(paso("memoria-local"), "Modelo de búsqueda"));
      break;
  }
  return partes.filter((p): p is HTMLElement => p !== null);
}

function tarjetaFuncion(funcion: Funcion, enAsistente: boolean): HTMLElement {
  const activa = estado.funciones.activas[funcion.id];
  const tarjeta = crear("article", `tarjeta funcion${activa ? " activa" : ""}`);
  const cabeza = crear("div", "funcion-cabeza");
  const texto = crear("div", "funcion-texto");
  texto.append(crear("h3", undefined, funcion.nombre), crear("p", "tarjeta-texto", funcion.descripcion));
  const interruptor = crear("label", "interruptor");
  interruptor.title = activa ? "Apagar" : "Prender";
  const casilla = crear("input");
  casilla.type = "checkbox";
  casilla.setAttribute("role", "switch");
  casilla.setAttribute("aria-label", funcion.nombre);
  casilla.checked = activa;
  casilla.addEventListener("change", () => {
    estado.funciones.activas[funcion.id] = casilla.checked;
    void cambiar(enAsistente);
  });
  interruptor.append(casilla, crear("span", "interruptor-riel"));
  cabeza.append(texto, interruptor);
  tarjeta.append(cabeza);
  if (EN_MAC) tarjeta.append(crear("p", `funcion-permiso${funcion.permiso ? " con-permiso" : ""}`, nombrePermiso(funcion)));
  tarjeta.append(...configuracionDe(funcion, activa));
  return tarjeta;
}

/** Los presets: un clic deja las funciones como las del preset (lo configurado adentro se conserva). */
function presets(enAsistente: boolean): HTMLElement {
  const fila = crear("div", "presets");
  const actual = presetDe(estado.funciones.activas);
  for (const id of Object.keys(PRESETS) as IdPreset[]) {
    const p = PRESETS[id];
    const b = boton("", `preset${actual === id ? " elegido" : ""}`, () => {
      estado.funciones.activas = activasDePreset(id);
      void cambiar(enAsistente);
    });
    b.setAttribute("aria-pressed", String(actual === id));
    b.append(crear("strong", undefined, p.nombre), crear("span", undefined, p.descripcion));
    fila.append(b);
  }
  return fila;
}

/** Presets y tarjetas de funciones. */
export function vistaFunciones(enAsistente: boolean): HTMLElement {
  const caja = crear("div", "funciones");
  const lista = crear("div", "lista-funciones");
  lista.append(...FUNCIONES.map((f) => tarjetaFuncion(f, enAsistente)));
  caja.append(presets(enAsistente), lista);
  return caja;
}

/** El orden de las tarjetas de Inicio y cuáles se muestran (lo apagado no se muestra igual). */
export function vistaTarjetasInicio(): HTMLElement {
  const caja = crear("div", "tarjetas-inicio");
  const { orden, ocultas } = estado.funciones.tarjetas;
  const mover = (i: number, delta: number) => {
    const nuevo = [...orden];
    [nuevo[i], nuevo[i + delta]] = [nuevo[i + delta], nuevo[i]];
    estado.funciones.tarjetas.orden = nuevo;
    void cambiar(false);
  };
  orden.forEach((id: IdTarjeta, i) => {
    const funcion = FUNCIONES.find((f) => f.tarjeta === id);
    const apagada = funcion !== undefined && !estado.funciones.activas[funcion.id];
    const fila = crear("div", `fila-tarjeta${apagada ? " apagada" : ""}`);
    const mostrar = crear("label", "mostrar-tarjeta");
    const casilla = crear("input");
    casilla.type = "checkbox";
    casilla.checked = !ocultas.includes(id);
    casilla.disabled = apagada;
    casilla.addEventListener("change", () => {
      estado.funciones.tarjetas.ocultas = casilla.checked ? ocultas.filter((t) => t !== id) : [...ocultas, id];
      void cambiar(false);
    });
    mostrar.append(casilla, document.createTextNode(` ${NOMBRES_TARJETAS[id]}`));
    if (apagada) mostrar.append(crear("span", "nota-apagada", " · su función está apagada"));
    const subir = boton("↑", "boton boton-icono", () => mover(i, -1), i === 0);
    subir.setAttribute("aria-label", `Subir ${NOMBRES_TARJETAS[id]}`);
    const bajar = boton("↓", "boton boton-icono", () => mover(i, 1), i === orden.length - 1);
    bajar.setAttribute("aria-label", `Bajar ${NOMBRES_TARJETAS[id]}`);
    fila.append(mostrar, subir, bajar);
    caja.append(fila);
  });
  return caja;
}
