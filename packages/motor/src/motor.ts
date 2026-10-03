// El motor de comandos: prueba las plantillas en orden y, si una calza y se puede
// interpretar, hace lo pedido y arma la respuesta. Si ninguna sirve, devuelve `null` y el
// pedido sigue hacia el agente (con IA).

import { NOMBRES_DE_CATEGORIA, categoriaDe, type Categoria } from "./categorias.ts";
import type { Gastos } from "./gastos.ts";
import { leerMonto } from "./montos.ts";
import { FORMAS_DE_PERIODO, fechaCorta, rangoDe, type Periodo } from "./periodos.ts";
import { PLANTILLAS_BASE, coincidir, type Coincidencia, type Intencion, type Plantilla } from "./plantillas.ts";
import { describirDescargas, explorador, sePuedeAbrir, type Descarga } from "./descargas.ts";
import { describirDia, describirProximo, type EventoCalendario } from "./calendario.ts";
import { describirSesiones, type SesionClaude } from "./programador.ts";
import { describirMusica, respuestaControl, type AccionMusica, type EstadoMusica } from "./musica.ts";
import { describirEquipo, type LecturaEquipo } from "./sistema.ts";
import { POMODORO, type Temporizadores } from "./temporizadores.ts";
import { describirDuracion, leerDuracion, reloj } from "./tiempo.ts";
import { capitalizar, formatearMonto, normalizar } from "./texto.ts";

export interface Resultado {
  intencion: Intencion;
  /** La plantilla que lo resolvió. */
  plantilla: string;
  /** La respuesta para mostrar en la burbuja. */
  texto: string;
  /** Lo que la isla necesita para terminar el pedido (por ejemplo, qué descarga abrir). */
  datos?: unknown;
}

/** Lo que el motor entendió de una frase, antes de hacer nada. */
export type Accion =
  | { intencion: "registrar-gasto"; monto: number; categoria: Categoria; descripcion: string | null }
  | { intencion: "consultar-gastos"; periodo: Periodo; categoria?: Categoria }
  | { intencion: "ultimos-gastos" }
  | { intencion: "borrar-ultimo-gasto" }
  | { intencion: "ver-memoria" }
  | { intencion: "pomodoro"; estudioMs: number; etiqueta: string | null }
  | { intencion: "temporizador"; duracionMs: number; etiqueta: string | null }
  | { intencion: "cancelar-pomodoro" }
  | { intencion: "cancelar-temporizador" }
  | { intencion: "consultar-temporizador" }
  | { intencion: "estado-equipo" }
  | { intencion: "ver-descargas" }
  | { intencion: "abrir-ultima-descarga" }
  | { intencion: "mostrar-ultima-descarga" }
  | { intencion: "musica-pausa" | "musica-play" | "musica-siguiente" | "musica-anterior" | "musica-estado" }
  | { intencion: "calendario-hoy" | "calendario-manana" | "calendario-proximo" }
  | { intencion: "programador-sesiones" };

/** Cuántos gastos muestra "mis últimos gastos". */
const ULTIMOS = 5;
/** Periodos ya terminados: "ayer gastaste", no "ayer llevas". */
const PASADOS = new Set<Periodo>(["ayer", "la semana pasada", "el mes pasado"]);

/** Lo que significa una frase según una plantilla, o `null` si no calza o no se puede interpretar. */
export function interpretarCon(plantilla: Plantilla, texto: string): Accion | null {
  const coincidencia = coincidir(plantilla, texto);
  return coincidencia ? interpretar(plantilla.intencion, coincidencia) : null;
}

function interpretar(intencion: Intencion, { ranuras, originales }: Coincidencia): Accion | null {
  switch (intencion) {
    case "registrar-gasto": {
      const monto = ranuras.monto === undefined ? null : leerMonto(ranuras.monto);
      if (monto === null) return null;
      const descripcion = originales.cosa ? sinArticulo(originales.cosa.trim()) || null : null;
      const categoria = ranuras.cosa ? categoriaDe(normalizar(sinArticulo(ranuras.cosa))) : "otros";
      return { intencion, monto, categoria, descripcion };
    }
    case "consultar-gastos": {
      const periodo: Periodo | undefined = ranuras.periodo ? FORMAS_DE_PERIODO[ranuras.periodo] : "este mes";
      const categoria = ranuras.categoria ? NOMBRES_DE_CATEGORIA[ranuras.categoria] : undefined;
      if (!periodo || (ranuras.categoria && !categoria)) return null;
      return categoria ? { intencion, periodo, categoria } : { intencion, periodo };
    }
    case "ultimos-gastos":
    case "borrar-ultimo-gasto":
    case "ver-memoria":
    case "cancelar-pomodoro":
    case "cancelar-temporizador":
    case "consultar-temporizador":
    case "estado-equipo":
    case "ver-descargas":
    case "abrir-ultima-descarga":
    case "mostrar-ultima-descarga":
    case "musica-pausa":
    case "musica-play":
    case "musica-siguiente":
    case "musica-anterior":
    case "musica-estado":
    case "calendario-hoy":
    case "calendario-manana":
    case "calendario-proximo":
    case "programador-sesiones":
      return { intencion };
    case "pomodoro": {
      const estudioMs = ranuras.tiempo === undefined ? POMODORO.estudioMs : leerDuracion(ranuras.tiempo);
      if (estudioMs === null) return null;
      return { intencion, estudioMs, etiqueta: originales.cosa?.trim() || null };
    }
    case "temporizador": {
      const duracionMs = ranuras.tiempo === undefined ? null : leerDuracion(ranuras.tiempo);
      if (duracionMs === null) return null;
      return { intencion, duracionMs, etiqueta: originales.cosa?.trim() || null };
    }
  }
}

export class Motor {
  private readonly gastos: Gastos;
  private readonly plantillas: () => Plantilla[];
  private readonly reloj: () => Date;
  private readonly temporizadores: Temporizadores | null;
  private readonly equipo: (() => LecturaEquipo | null) | null;
  private readonly descargas: (() => Descarga[] | null) | null;
  private readonly musica: Musica | null;
  private readonly calendario: (() => EventoCalendario[] | null) | null;
  private readonly sesionesClaude: (() => SesionClaude[]) | null;

  /** `plantillas` puede ser una función, para incluir las aprendidas que se activen después. */
  constructor(
    gastos: Gastos,
    opciones: {
      plantillas?: Plantilla[] | (() => Plantilla[]);
      reloj?: () => Date;
      temporizadores?: Temporizadores;
      /** La última lectura del computador (la mantiene el puente). */
      equipo?: () => LecturaEquipo | null;
      /** Las últimas descargas, de la más nueva a la más vieja (`null` si no se pudo leer la carpeta). */
      descargas?: () => Descarga[] | null;
      /** Lo que suena y cómo pedirle algo (lo mantiene el puente). */
      musica?: Musica;
      /** Los eventos de hoy a pasado mañana (`null` si no hay calendario configurado o sin permiso). */
      calendario?: () => EventoCalendario[] | null;
      /** Las sesiones de Claude Code que se ven por los hooks (modo programador). */
      sesionesClaude?: () => SesionClaude[];
    } = {},
  ) {
    this.sesionesClaude = opciones.sesionesClaude ?? null;
    this.calendario = opciones.calendario ?? null;
    this.musica = opciones.musica ?? null;
    this.descargas = opciones.descargas ?? null;
    this.equipo = opciones.equipo ?? null;
    this.gastos = gastos;
    this.temporizadores = opciones.temporizadores ?? null;
    const plantillas = opciones.plantillas ?? PLANTILLAS_BASE;
    this.plantillas = typeof plantillas === "function" ? plantillas : () => plantillas;
    this.reloj = opciones.reloj ?? (() => new Date());
  }

  /** Qué haría el motor con una frase, sin hacerlo. */
  entender(texto: string): { plantilla: Plantilla; accion: Accion } | null {
    for (const plantilla of this.plantillas()) {
      const accion = interpretarCon(plantilla, texto);
      if (accion) return { plantilla, accion };
    }
    return null;
  }

  resolver(texto: string): Resultado | null {
    const entendido = this.entender(texto);
    if (!entendido) return null;
    // Sin temporizadores conectados (por ejemplo, en el servidor MCP), esas frases van al agente.
    if (!this.temporizadores && esDeTemporizador(entendido.accion)) return null;
    if (entendido.accion.intencion === "estado-equipo" && !this.equipo?.()) return null;
    const { plantilla, accion } = entendido;
    if (accion.intencion === "programador-sesiones") {
      if (!this.sesionesClaude) return null;
      return { intencion: accion.intencion, plantilla: plantilla.id, texto: describirSesiones(this.sesionesClaude()) };
    }
    if (accion.intencion.startsWith("calendario-")) {
      if (!this.calendario) return null;
      return { intencion: accion.intencion, plantilla: plantilla.id, texto: this.agenda(accion.intencion) };
    }
    if (accion.intencion.startsWith("musica-")) {
      if (!this.musica) return null;
      return { intencion: accion.intencion, plantilla: plantilla.id, texto: this.tocar(accion.intencion) };
    }
    if (esDeDescargas(accion)) {
      const lista = this.descargas?.();
      if (!lista) return null;
      return { intencion: accion.intencion, plantilla: plantilla.id, ...this.descargar(accion.intencion, lista) };
    }
    return { intencion: accion.intencion, plantilla: plantilla.id, texto: this.ejecutar(accion) };
  }

  /** "¿Qué tengo hoy?", "¿qué tengo mañana?", "mi próxima clase". */
  private agenda(intencion: Intencion): string {
    const eventos = this.calendario!();
    if (!eventos) {
      return "📅 Todavía no veo tu calendario. Conéctalo en 🌱 → Configurar Brote (el Calendario del Mac o la dirección iCal de Google Calendar).";
    }
    const ahora = this.reloj().getTime();
    if (intencion === "calendario-proximo") return describirProximo(eventos, ahora);
    return describirDia(eventos, ahora, intencion === "calendario-hoy" ? 0 : 1);
  }

  /** "Pausa la música", "siguiente canción", "¿qué está sonando?". Nunca abre una app de música. */
  private tocar(intencion: Intencion): string {
    const musica = this.musica!;
    const estado = musica.estado();
    if (intencion === "musica-estado") return describirMusica(estado);
    const accion = ACCION_DE[intencion]!;
    if (estado) musica.controlar(accion);
    return respuestaControl(accion, estado);
  }

  /** "Mis descargas" y "abre la última descarga". Abrir o mostrar lo hace la isla (Rust valida la ruta). */
  private descargar(intencion: Intencion, lista: Descarga[]): { texto: string; datos?: unknown } {
    if (intencion === "ver-descargas") return { texto: describirDescargas(lista.slice(0, 5), this.reloj().getTime()) };
    const ultima = lista[0];
    if (!ultima) return { texto: "No encontré descargas en tu carpeta de Descargas." };
    const abrir = intencion === "abrir-ultima-descarga" && sePuedeAbrir(ultima.nombre);
    const texto = abrir
      ? `📂 Abro ${ultima.nombre}.`
      : intencion === "abrir-ultima-descarga"
        ? `📂 ${ultima.nombre} es un programa o un archivo que no abro solo: te lo muestro en ${explorador()}.`
        : `📂 Te muestro ${ultima.nombre} en ${explorador()}.`;
    return { texto, datos: { ruta: ultima.ruta, abrir } };
  }

  private ejecutar(accion: Accion): string {
    switch (accion.intencion) {
      case "registrar-gasto":
        return this.registrar(accion.monto, accion.categoria, accion.descripcion);
      case "consultar-gastos":
        return this.consultar(accion.periodo, accion.categoria);
      case "ultimos-gastos":
        return this.listarUltimos();
      case "borrar-ultimo-gasto":
        return this.borrarUltimo();
      case "ver-memoria":
        // La isla abre el panel "Lo que sé de ti" al ver esta intención.
        return "Te muestro todo lo que sé de ti 🌱";
      case "pomodoro":
      case "temporizador":
      case "cancelar-pomodoro":
      case "cancelar-temporizador":
      case "consultar-temporizador":
        return this.temporizar(accion);
      case "estado-equipo":
        return describirEquipo(this.equipo!()!);
      default:
        throw new Error(`El motor no ejecuta «${accion.intencion}» aquí`);
    }
  }

  private temporizar(accion: Accion): string {
    const temporizadores = this.temporizadores!;
    const ahora = this.reloj();
    switch (accion.intencion) {
      case "pomodoro": {
        temporizadores.iniciarPomodoro(accion.estudioMs, accion.etiqueta, ahora);
        const tema = accion.etiqueta ? ` de ${accion.etiqueta}` : "";
        return `🍅 Pomodoro${tema}: ${describirDuracion(accion.estudioMs)} de estudio. ¡Vamos! Te aviso cuando toque descansar 🌱`;
      }
      case "temporizador": {
        temporizadores.crear(accion.duracionMs, accion.etiqueta, ahora);
        const cuando = describirDuracion(accion.duracionMs);
        return accion.etiqueta ? `⏰ Listo, en ${cuando} te recuerdo: ${accion.etiqueta}.` : `⏱ Temporizador de ${cuando}, corriendo.`;
      }
      case "cancelar-pomodoro":
        return temporizadores.cancelar({ tipo: "pomodoro" }) > 0 ? "Listo, detuve el pomodoro. ¡Buen trabajo! 🌱" : "No tienes un pomodoro corriendo.";
      case "cancelar-temporizador": {
        const cuantos = temporizadores.cancelar({ tipo: "temporizador" });
        if (cuantos === 0) return "No tienes temporizadores ni recordatorios corriendo.";
        return cuantos === 1 ? "Listo, cancelé el temporizador." : `Listo, cancelé ${cuantos} temporizadores.`;
      }
      default: {
        const activos = temporizadores.activos();
        if (activos.length === 0) return "No tienes temporizadores corriendo.";
        const lineas = activos.map((t) => {
          const queda = reloj(t.finMs - ahora.getTime());
          if (t.tipo === "pomodoro") return `• 🍅 ${t.fase === "estudio" ? "Estudio" : "Descanso"}${t.etiqueta ? ` (${t.etiqueta})` : ""}: quedan ${queda}`;
          return `• ⏰ ${t.etiqueta ?? "Temporizador"}: quedan ${queda}`;
        });
        return lineas.join("\n");
      }
    }
  }

  private registrar(monto: number, categoria: Categoria, descripcion: string | null): string {
    const ahora = this.reloj();
    this.gastos.agregar({ monto, categoria, descripcion, fecha: ahora });
    const mes = this.gastos.total(rangoDe("este mes", ahora));
    const que = descripcion ? ` en ${descripcion}` : "";
    return `Anotado: ${formatearMonto(monto)}${que} (${categoria}). Este mes llevas ${formatearMonto(mes.total)}.`;
  }

  private consultar(periodo: Periodo, categoria?: Categoria): string {
    const { total, cantidad } = this.gastos.total(rangoDe(periodo, this.reloj()), categoria);
    const enCategoria = categoria ? ` en ${categoria}` : "";
    if (cantidad === 0) return `${capitalizar(periodo)} no tienes gastos anotados${enCategoria}.`;
    const verbo = PASADOS.has(periodo) ? "gastaste" : "llevas";
    const gastos = cantidad === 1 ? "1 gasto" : `${cantidad} gastos`;
    return `${capitalizar(periodo)} ${verbo} ${formatearMonto(total)}${enCategoria} (${gastos}).`;
  }

  private listarUltimos(): string {
    const ultimos = this.gastos.ultimos(ULTIMOS);
    if (ultimos.length === 0) return "Todavía no tienes gastos anotados.";
    const ahora = this.reloj();
    const lineas = ultimos.map((gasto) => {
      const que = gasto.descripcion ?? gasto.categoria;
      return `• ${formatearMonto(gasto.monto)} · ${que} (${fechaCorta(gasto.fecha, ahora)})`;
    });
    return `Tus últimos gastos:\n${lineas.join("\n")}`;
  }

  private borrarUltimo(): string {
    const borrado = this.gastos.borrarUltimo();
    if (!borrado) return "No tienes gastos anotados.";
    const que = borrado.descripcion ? ` en ${borrado.descripcion}` : "";
    return `Listo, borré el último gasto: ${formatearMonto(borrado.monto)}${que}.`;
  }
}

/** "un café" → "café", "el almuerzo" → "almuerzo". */
function sinArticulo(texto: string): string {
  return texto.replace(/^(un|una|unos|unas|el|la|los|las)\s+/i, "");
}

const ACCION_DE: Partial<Record<Intencion, AccionMusica>> = {
  "musica-pausa": "pausa",
  "musica-play": "play",
  "musica-siguiente": "siguiente",
  "musica-anterior": "anterior",
};

export interface Musica {
  estado: () => EstadoMusica | null;
  controlar: (accion: AccionMusica) => void;
}

function esDeDescargas(accion: Accion): boolean {
  return ["ver-descargas", "abrir-ultima-descarga", "mostrar-ultima-descarga"].includes(accion.intencion);
}

function esDeTemporizador(accion: Accion): boolean {
  return ["pomodoro", "temporizador", "cancelar-pomodoro", "cancelar-temporizador", "consultar-temporizador"].includes(
    accion.intencion,
  );
}
