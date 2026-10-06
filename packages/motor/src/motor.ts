// El motor de comandos: prueba las plantillas en orden y, si una calza y se puede
// interpretar, hace lo pedido y arma la respuesta. Si ninguna sirve, devuelve `null` y el
// pedido sigue hacia el agente (con IA).

import { NOMBRES_DE_CATEGORIA, categoriaDe, type Categoria } from "./categorias.ts";
import type { Gastos } from "./gastos.ts";
import { leerMonto } from "./montos.ts";
import { FORMAS_DE_PERIODO, fechaCorta, rangoDe, type Periodo } from "./periodos.ts";
import { PLANTILLAS_BASE, coincidir, type Coincidencia, type Intencion, type Plantilla } from "./plantillas.ts";
import { describirDescargas, explorador, sePuedeAbrir, type Descarga } from "./descargas.ts";
import { describirCreacion, describirDia, describirProximo, type EventoCalendario, type NuevoEvento, type ResultadoCreacion } from "./calendario.ts";
import { describirSesiones, type SesionClaude } from "./programador.ts";
import { describirEntregas, type Entrega } from "./aula.ts";
import { describirMusica, respuestaControl, type AccionMusica, type EstadoMusica } from "./musica.ts";
import { describirEquipo, type LecturaEquipo } from "./sistema.ts";
import { POMODORO, type Temporizadores } from "./temporizadores.ts";
import { UNIDADES, describirDuracion, leerDuracion, leerHora, reloj } from "./tiempo.ts";
import { capitalizar, formatearMonto, normalizar } from "./texto.ts";
import { FUNCIONES_DE_AGENDA, FUNCIONES_DE_RESUMEN, MENSAJE_APAGADA, esDeAgenda, funcionDeIntencion, type IdFuncion } from "./funciones.ts";
import { describirPlan, describirReinicio, type LecturaPlan } from "./plan.ts";
import { describirUso, type ResumenUso } from "./uso.ts";
import { TEXTO_GRABAR, describirGrabadoHoy, describirTranscripciones, type AccionGrabar } from "./grabaciones-frases.ts";
import type { CabeceraTranscripcion } from "./transcripciones.ts";
import { Ramos } from "./ramos.ts";
import { Notas } from "./notas.ts";
import { Repaso } from "./repaso.ts";
import { resumirRamo, textoResumenRamo } from "./ramo-todo.ts";
import type { ItemDeRamo } from "./ramo-todo.ts";
import { PlanesEstudio } from "./plan-estudio.ts";
import { interpretarPlanEstudio, responderPlanEstudio } from "./plan-estudio-motor.ts";
import type { AccionPlanEstudio } from "./plan-estudio-motor.ts";
import { EstadisticasEstudio } from "./estadisticas.ts";
import { interpretarEstadisticas, responderEstadisticas } from "./estadisticas-motor.ts";
import { interpretarAhorro, responderAhorro } from "./ahorro-motor.ts";
import type { AccionAhorro } from "./ahorro-motor.ts";
import type { Ahorro } from "./ahorro.ts";
import { holguraDelMes, resumirAhorro } from "./ahorro-tipos.ts";
import type { ResumenAhorro } from "./ahorro-tipos.ts";
import type { AccionEstadisticas } from "./estadisticas-motor.ts";
import { textoEmpezarRepaso, textoHayRepaso } from "./repaso-frases.ts";
import { interpretarNotas, responderNotas } from "./notas-motor.ts";
import type { AccionNotas } from "./notas-motor.ts";
import { describirRamos, textoRamoArchivado, textoRamoCreado } from "./ramos-frases.ts";
import { emparejarRamo, normalizarRamo, limpiarTexto, MAX_NOMBRE_RAMO } from "./ramos-tipos.ts";
import type { DiaAgenda } from "./agenda.ts";
import { describirSemana } from "./agenda-carga.ts";
import { armarResumenDelDia, type PlataDelDia, type ResumenDelDia } from "./resumen-dia.ts";
import { resumirRepaso } from "./repaso-tipos.ts";
import { describirHoy, describirPresupuestoPuesto, describirProyeccion, describirQueda, hormigaDelMes, presupuestoDelMes, proyectarMes, type PresupuestoMes, type ProyeccionMes } from "./plata.ts";

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
  | {
      intencion: "calendario-crear" | "calendario-crear-manana";
      titulo: string;
      /** Dentro de cuánto ("en 12 minutos") o a qué hora ("a las 15:30"). */
      cuando: { enMs: number } | { horas: number; minutos: number; manana: boolean };
    }
  | { intencion: "programador-sesiones" }
  | { intencion: "aula-entregas" | "aula-semana" }
  | { intencion: "plan-uso" | "plan-reinicio" | "plan-tokens" }
  | { intencion: "presupuesto-poner"; monto: number }
  | { intencion: "presupuesto-quitar" | "presupuesto-queda" | "presupuesto-hoy" | "plata-proyeccion" | "agenda-semana" | "resumen-dia" }
  | { intencion: "grabar-iniciar" | "grabar-detener" | "grabar-estado" | "transcripciones-ver" | "transcripciones-hoy" }
  | { intencion: "ramos-agregar" | "ramos-archivar"; nombre: string }
  | { intencion: "ramos-ver" }
  | { intencion: "ramo-todo"; ramo: string }
  | { intencion: "repaso-hay" }
  | { intencion: "repaso-empezar"; ramo: string | null }
  | AccionPlanEstudio
  | AccionEstadisticas
  | AccionAhorro
  | AccionNotas;

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
    case "aula-entregas":
    case "aula-semana":
    case "plan-uso":
    case "plan-reinicio":
    case "plan-tokens":
    case "presupuesto-quitar":
    case "presupuesto-queda":
    case "presupuesto-hoy":
    case "plata-proyeccion":
    case "agenda-semana":
    case "resumen-dia":
    case "grabar-iniciar":
    case "grabar-detener":
    case "grabar-estado":
    case "transcripciones-ver":
    case "transcripciones-hoy":
    case "ramos-ver":
      return { intencion };
    case "notas-anotar":
    case "notas-evaluaciones":
    case "notas-agregar-eval":
    case "notas-necesaria":
    case "notas-como-voy":
    case "notas-borrar":
    case "notas-ajuste":
      return interpretarNotas(intencion, ranuras, originales);
    case "estudio-horas":
    case "estudio-racha":
    case "estudio-anotar":
    case "estudio-meta-poner":
    case "estudio-meta-quitar":
    case "estudio-meta-como":
      return interpretarEstadisticas(intencion, ranuras, originales);
    case "ahorro-crear":
    case "ahorro-aportar":
    case "ahorro-retirar":
    case "ahorro-como":
    case "ahorro-archivar":
      return interpretarAhorro(intencion, ranuras, originales);
    case "estudio-fecha":
    case "estudio-plan":
    case "estudio-hoy":
      return interpretarPlanEstudio(intencion, ranuras, originales);
    case "ramo-todo": {
      const ramo = originales.cosa ? limpiarTexto(sinArticulo(originales.cosa.trim()), MAX_NOMBRE_RAMO) : "";
      return ramo ? { intencion, ramo } : null;
    }
    case "repaso-hay":
      return { intencion };
    case "repaso-empezar": {
      // «repasemos» solo, o con el nombre de un ramo (se empareja después; si no calza, va al agente).
      const ramo = originales.cosa ? limpiarTexto(sinArticulo(originales.cosa.trim()), MAX_NOMBRE_RAMO) : "";
      return { intencion, ramo: ramo || null };
    }
    case "ramos-agregar":
    case "ramos-archivar": {
      const nombre = limpiarTexto(sinArticulo(originales.cosa?.trim() ?? ""), MAX_NOMBRE_RAMO);
      return normalizarRamo(nombre).length >= 2 ? { intencion, nombre } : null;
    }
    case "presupuesto-poner": {
      const monto = ranuras.monto === undefined ? null : leerMonto(ranuras.monto);
      // Un presupuesto mensual de menos de mil pesos es casi seguro un error de lectura.
      return monto === null || monto < 1000 ? null : { intencion, monto };
    }
    case "calendario-crear":
    case "calendario-crear-manana": {
      const titulo = originales.cosa ? sinArticulo(originales.cosa.trim()).slice(0, 200) || "Evento" : "Evento";
      if (ranuras.tiempo !== undefined) {
        const enMs = leerDuracion(ranuras.tiempo);
        return enMs === null ? null : { intencion, titulo: capitalizar(titulo), cuando: { enMs } };
      }
      const hora = ranuras.hora === undefined ? null : leerHora(ranuras.hora);
      if (!hora) return null;
      return { intencion, titulo: capitalizar(titulo), cuando: { ...hora, manana: intencion === "calendario-crear-manana" } };
    }
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
  private readonly crearEvento: ((evento: NuevoEvento) => ResultadoCreacion) | null;
  private readonly aula: (() => Entrega[] | null) | null;
  private readonly dias: (() => DiaAgenda[] | null) | null;
  private readonly activa: (funcion: IdFuncion) => boolean;
  private readonly uso: (() => UsoClaude) | null;
  private readonly transcripciones: (() => CabeceraTranscripcion[]) | null;
  private readonly ramos: Ramos | null;
  private readonly notas: Notas | null;
  private readonly repaso: Repaso | null;
  private readonly todoRamo: ((ramoId: number) => ItemDeRamo[] | null) | null;
  private readonly planes: PlanesEstudio | null;
  private readonly estadisticas: EstadisticasEstudio | null;
  private readonly ahorro: Ahorro | null;

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
      /** Crea un evento en el Calendario del Mac (lo hace el puente con EventKit). */
      crearEvento?: (evento: NuevoEvento) => ResultadoCreacion;
      /** Las entregas del aula (Canvas o Moodle; `null` si no está configurada). */
      aula?: () => Entrega[] | null;
      /** La agenda ya armada (eventos, entregas, pruebas…) para «¿cómo viene mi semana?»; `null` = nada conectado. */
      agenda?: () => DiaAgenda[] | null;
      /** Si una función está prendida (Configurar Brote → Funciones). Sin esto, todas lo están. */
      activa?: (funcion: IdFuncion) => boolean;
      /** El plan de Claude y el uso por tokens (lo mantiene el puente). */
      uso?: () => UsoClaude;
      /** Las transcripciones guardadas, de la más nueva a la más vieja (solo la cabecera). */
      transcripciones?: () => CabeceraTranscripcion[];
      /** Los ramos del usuario (la pestaña Estudio). Sin esto, esas frases van al agente. */
      ramos?: Ramos;
      /** Las evaluaciones y notas por ramo. Sin esto (o sin ramos), esas frases van al agente. */
      notas?: Notas;
      /** Las tarjetas de repaso. Sin esto (o sin ramos), esas frases van al agente. */
      repaso?: Repaso;
      /** Todo lo de un ramo (clases, tareas, pruebas…) ya armado por el puente. Sin esto, «todo lo de cálculo» va al agente. */
      todoDeRamo?: (ramoId: number) => ItemDeRamo[] | null;
      /** Los planes de estudio. Sin esto, «¿qué estudio hoy?» va al agente (la fecha y el plan solo necesitan ramos y notas). */
      planes?: PlanesEstudio;
      /** El tiempo estudiado. Sin esto, esas frases van al agente. */
      estadisticas?: EstadisticasEstudio;
      /** Las metas de ahorro. Sin esto, esas frases van al agente. */
      ahorro?: Ahorro;
    } = {},
  ) {
    this.ramos = opciones.ramos ?? null;
    this.notas = opciones.notas ?? null;
    this.repaso = opciones.repaso ?? null;
    this.todoRamo = opciones.todoDeRamo ?? null;
    this.planes = opciones.planes ?? null;
    this.estadisticas = opciones.estadisticas ?? null;
    this.ahorro = opciones.ahorro ?? null;
    this.uso = opciones.uso ?? null;
    this.transcripciones = opciones.transcripciones ?? null;
    this.activa = opciones.activa ?? (() => true);
    this.aula = opciones.aula ?? null;
    this.dias = opciones.agenda ?? null;
    this.crearEvento = opciones.crearEvento ?? null;
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
    // Una frase de una función apagada no va al agente: se le dice al usuario dónde prenderla.
    const funcion = funcionDeIntencion(entendido.accion.intencion);
    const apagada = esDeAgenda(entendido.accion.intencion) ? !(entendido.accion.intencion === "resumen-dia" ? FUNCIONES_DE_RESUMEN : FUNCIONES_DE_AGENDA).some((f) => this.activa(f)) : funcion !== null && !this.activa(funcion);
    if (apagada) {
      return { intencion: entendido.accion.intencion, plantilla: entendido.plantilla.id, texto: MENSAJE_APAGADA };
    }
    // Sin temporizadores conectados (por ejemplo, en el servidor MCP), esas frases van al agente.
    if (!this.temporizadores && esDeTemporizador(entendido.accion)) return null;
    if (entendido.accion.intencion === "estado-equipo" && !this.equipo?.()) return null;
    const { plantilla, accion } = entendido;
    if (accion.intencion === "programador-sesiones") {
      if (!this.sesionesClaude) return null;
      return { intencion: accion.intencion, plantilla: plantilla.id, texto: describirSesiones(this.sesionesClaude()) };
    }
    if (accion.intencion === "plan-uso" || accion.intencion === "plan-reinicio" || accion.intencion === "plan-tokens") {
      if (!this.uso) return null;
      const { plan, statusline, resumen } = this.uso();
      const ahora = this.reloj().getTime();
      const texto =
        accion.intencion === "plan-tokens"
          ? describirUso(resumen)
          : accion.intencion === "plan-uso"
            ? describirPlan(plan, ahora, statusline)
            : describirReinicio(plan, ahora, statusline);
      return { intencion: accion.intencion, plantilla: plantilla.id, texto };
    }
    if (accion.intencion === "grabar-iniciar" || accion.intencion === "grabar-detener" || accion.intencion === "grabar-estado") {
      // La captura es de Rust y de la ventana: aquí solo se pide. La isla pregunta "¿avisaste?" antes de grabar.
      const grabar: AccionGrabar = accion.intencion === "grabar-iniciar" ? "iniciar" : accion.intencion === "grabar-detener" ? "detener" : "estado";
      return { intencion: accion.intencion, plantilla: plantilla.id, texto: TEXTO_GRABAR[grabar], datos: { grabar } };
    }
    if (accion.intencion === "transcripciones-ver" || accion.intencion === "transcripciones-hoy") {
      if (!this.transcripciones) return null;
      const lista = this.transcripciones();
      const ahora = this.reloj();
      const texto = accion.intencion === "transcripciones-ver" ? describirTranscripciones(lista, ahora) : describirGrabadoHoy(lista, ahora);
      return { intencion: accion.intencion, plantilla: plantilla.id, texto };
    }
    if (accion.intencion === "ramos-agregar" || accion.intencion === "ramos-archivar" || accion.intencion === "ramos-ver") {
      if (!this.ramos) return null;
      return { intencion: accion.intencion, plantilla: plantilla.id, texto: this.ramear(accion) };
    }
    if (accion.intencion === "ramo-todo") {
      // Nunca se adivina el ramo: sin uno que calce (o con empate) la frase va al agente.
      if (!this.ramos || !this.todoRamo) return null;
      const ramo = emparejarRamo(accion.ramo, this.ramos.listar());
      const items = ramo ? this.todoRamo(ramo.id) : null;
      if (!ramo || !items) return null;
      const texto = textoResumenRamo(ramo.nombre, resumirRamo(items, this.reloj().getTime()), this.reloj().getTime());
      return { intencion: accion.intencion, plantilla: plantilla.id, texto, datos: { ramoTodo: { ramoId: ramo.id } } };
    }
    if (accion.intencion === "repaso-hay" || accion.intencion === "repaso-empezar") {
      if (!this.ramos || !this.repaso) return null;
      const ahora = this.reloj().getTime();
      const lista = this.repaso.tarjetas();
      if (accion.intencion === "repaso-hay") {
        return { intencion: accion.intencion, plantilla: plantilla.id, texto: textoHayRepaso(lista, this.ramos.listar(), ahora) };
      }
      // Con nombre de ramo, tiene que calzar con uno (nunca se adivina); sin nombre, repasa lo de todos.
      let ramoId: number | null = null;
      let nombreRamo: string | null = null;
      if (accion.ramo !== null) {
        const r = emparejarRamo(accion.ramo, this.ramos.listar());
        if (!r) return null;
        ramoId = r.id;
        nombreRamo = r.nombre;
      }
      const { texto, hay } = textoEmpezarRepaso(lista, nombreRamo, ramoId, ahora);
      return { intencion: accion.intencion, plantilla: plantilla.id, texto, ...(hay ? { datos: { repaso: { ramoId } } } : {}) };
    }
    if (accion.intencion === "estudio-horas" || accion.intencion === "estudio-racha" || accion.intencion === "estudio-anotar" || accion.intencion.startsWith("estudio-meta-")) {
      if (!this.ramos || !this.estadisticas) return null;
      const texto = responderEstadisticas(accion, { ramos: this.ramos, estadisticas: this.estadisticas, ahoraMs: this.reloj().getTime() });
      return texto === null ? null : { intencion: accion.intencion, plantilla: plantilla.id, texto };
    }
    if (accion.intencion.startsWith("ahorro-")) {
      if (!this.ahorro) return null;
      const texto = responderAhorro(accion as AccionAhorro, { ahorro: this.ahorro, ahoraMs: this.reloj().getTime(), resumen: () => this.resumenAhorro() });
      return texto === null ? null : { intencion: accion.intencion, plantilla: plantilla.id, texto };
    }
    if (accion.intencion === "estudio-fecha" || accion.intencion === "estudio-plan" || accion.intencion === "estudio-hoy") {
      if (!this.ramos || !this.notas) return null;
      const r = responderPlanEstudio(accion, { ramos: this.ramos, notas: this.notas, planes: this.planes, ahoraMs: this.reloj().getTime() });
      return r === null ? null : { intencion: accion.intencion, plantilla: plantilla.id, texto: r.texto, ...(r.datos !== undefined ? { datos: r.datos } : {}) };
    }
    if (accion.intencion.startsWith("notas-")) {
      if (!this.ramos || !this.notas) return null;
      const texto = responderNotas(accion as AccionNotas, { ramos: this.ramos, notas: this.notas, ahoraMs: this.reloj().getTime() });
      return texto === null ? null : { intencion: accion.intencion, plantilla: plantilla.id, texto };
    }
    if (accion.intencion === "resumen-dia") {
      return { intencion: accion.intencion, plantilla: plantilla.id, texto: this.resumenDelDia().texto };
    }
    if (accion.intencion === "agenda-semana") {
      const dias = this.dias?.();
      if (!dias) return { intencion: accion.intencion, plantilla: plantilla.id, texto: "📅 Todavía no tengo nada conectado para ver tu semana: conecta tu calendario o tu aula en 🌱 → Configurar Brote." };
      return { intencion: accion.intencion, plantilla: plantilla.id, texto: describirSemana(dias, this.reloj().getTime()) };
    }
    if (accion.intencion === "aula-entregas" || accion.intencion === "aula-semana") {
      if (!this.aula) return null;
      const texto = describirEntregas(this.aula(), this.reloj().getTime(), accion.intencion === "aula-semana");
      return { intencion: accion.intencion, plantilla: plantilla.id, texto };
    }
    if (accion.intencion === "calendario-crear" || accion.intencion === "calendario-crear-manana") {
      if (!this.crearEvento) return null;
      return { intencion: accion.intencion, plantilla: plantilla.id, texto: this.agendar(accion) };
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

  /**
   * "Pon un evento en 12 minutos", "agenda estudiar cálculo mañana a las 10". Dura una hora. Si no se
   * puede crear en el Calendario (sin permiso, fuera del Mac), deja un recordatorio para esa hora.
   */
  private agendar(accion: Extract<Accion, { intencion: "calendario-crear" | "calendario-crear-manana" }>): string {
    const ahora = this.reloj();
    let inicioMs: number;
    if ("enMs" in accion.cuando) {
      inicioMs = ahora.getTime() + accion.cuando.enMs;
    } else {
      const { horas, minutos, manana } = accion.cuando;
      const fecha = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + (manana ? 1 : 0), horas, minutos);
      // "A las 9" cuando ya pasaron las 9: es mañana.
      if (!manana && fecha.getTime() < ahora.getTime() - UNIDADES.MINUTO) fecha.setDate(fecha.getDate() + 1);
      inicioMs = fecha.getTime();
    }
    const evento: NuevoEvento = { titulo: accion.titulo, lugar: null, inicioMs, finMs: inicioMs + UNIDADES.HORA };
    const resultado = this.crearEvento!(evento);
    const texto = describirCreacion(evento, resultado, ahora.getTime());
    const faltan = inicioMs - ahora.getTime();
    if (resultado.ok || resultado.motivo === "invalido" || !this.temporizadores || !this.activa("temporizadores") || faltan <= 0 || faltan > 12 * UNIDADES.HORA) return texto;
    this.temporizadores.crear(faltan, accion.titulo, ahora);
    return `${texto} Mientras, te dejé un recordatorio ⏰ para esa hora.`;
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

  /** "Agrega el ramo Cálculo", "mis ramos", "quita el ramo Física". Archivar no borra nada. */
  private ramear(accion: Extract<Accion, { intencion: "ramos-agregar" | "ramos-archivar" | "ramos-ver" }>): string {
    const ramos = this.ramos!;
    if (accion.intencion === "ramos-ver") return describirRamos(ramos.listar());
    if (accion.intencion === "ramos-agregar") {
      const resultado = ramos.crear({ nombre: capitalizar(accion.nombre) }, this.reloj().getTime());
      return resultado.ok ? textoRamoCreado(resultado.ramo) : `${resultado.motivo}.`;
    }
    const ramo = emparejarRamo(accion.nombre, ramos.listar()) ?? ramos.listar().find((r) => normalizarRamo(r.nombre) === normalizarRamo(accion.nombre)) ?? null;
    if (!ramo) return `No encontré un ramo llamado ${accion.nombre}. Dime «mis ramos» para ver los que tienes.`;
    ramos.archivar(ramo.id);
    return textoRamoArchivado(ramo.nombre);
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
      case "presupuesto-poner":
        this.gastos.ponerPresupuesto(accion.monto);
        return describirPresupuestoPuesto(this.estadoPresupuesto()!);
      case "presupuesto-quitar":
        if (this.gastos.presupuesto() === null) return "No tenías presupuesto puesto.";
        this.gastos.ponerPresupuesto(null);
        return "Listo, quité tu presupuesto. Igual sigo anotando tus gastos 🌱";
      case "presupuesto-queda":
        return describirQueda(this.estadoPresupuesto());
      case "presupuesto-hoy":
        return describirHoy(this.estadoPresupuesto());
      case "plata-proyeccion": {
        const ahora = this.reloj();
        return describirProyeccion(this.proyeccionDelMes(ahora), this.gastos.presupuesto());
      }
      default:
        throw new Error(`El motor no ejecuta «${accion.intencion}» aquí`);
    }
  }

  private temporizar(accion: Accion): string {
    const temporizadores = this.temporizadores!;
    const ahora = this.reloj();
    switch (accion.intencion) {
      case "pomodoro": {
        const pomodoro = temporizadores.iniciarPomodoro(accion.estudioMs, accion.etiqueta, ahora);
        // «pomodoro de 30 para cálculo»: si el tema calza con un ramo, el bloque queda de ese ramo.
        const ramo = accion.etiqueta && this.ramos && this.activa("estudio") ? emparejarRamo(accion.etiqueta, this.ramos.listar()) : null;
        if (ramo) this.ramos!.asignar("pomodoro", pomodoro.id, ramo.id);
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

  /** El presupuesto del mes con lo gastado hasta ahora, o `null` si no hay presupuesto. */
  estadoPresupuesto(): PresupuestoMes | null {
    const monto = this.gastos.presupuesto();
    if (monto === null) return null;
    const ahora = this.reloj();
    return presupuestoDelMes(monto, this.gastos.total(rangoDe("este mes", ahora)).total, this.gastos.total(rangoDe("hoy", ahora)).total, ahora.getTime());
  }

  /**
   * El resumen del día (E2): lo de hoy con lo que esté prendido (calendario, aula, pruebas, tareas, bloques,
   * tarjetas de repaso y plata). Lo usan la frase, el aviso automático de la mañana y la isla.
   */
  resumenDelDia(): ResumenDelDia {
    const ahora = this.reloj();
    const plata = this.activa("gastos") ? this.plataDelDia(ahora) : null;
    const tarjetasHoy = this.activa("estudio") && this.repaso ? resumirRepaso(this.repaso.tarjetas(), ahora.getTime()).hoy : null;
    return armarResumenDelDia({ ahoraMs: ahora.getTime(), dias: this.dias?.() ?? null, tarjetasHoy, plata });
  }

  private plataDelDia(ahora: Date): PlataDelDia {
    const p = this.estadoPresupuesto();
    return { mesGastado: p ? p.gastado : this.gastos.total(rangoDe("este mes", ahora)).total, presupuesto: p ? p.monto : null, puedesHoy: p ? p.puedesHoy : null };
  }

  /** Las metas de ahorro con su avance, la holgura del mes y la sugerencia del gasto hormiga (sin las archivadas). */
  resumenAhorro(): ResumenAhorro {
    const ahora = this.reloj();
    const ms = ahora.getTime();
    const proy = this.proyeccionDelMes(ahora);
    const holgura = proy.estado === "ok" ? holguraDelMes(this.gastos.presupuesto(), proy.proyectado) : null;
    const recientes = this.gastos
      .entre({ desde: new Date(ms - 31 * 86_400_000), hasta: new Date(ms + 1) })
      .map((g) => ({ id: g.id, monto: g.monto, categoria: g.categoria, descripcion: g.descripcion, fechaMs: g.fecha.getTime() }));
    return resumirAhorro(this.ahorro?.metas() ?? [], this.ahorro?.aportes() ?? [], ms, { holgura, hormiga: hormigaDelMes(recientes, ms) });
  }

  /** "A este ritmo terminas el mes en X" con los gastos de este mes (hasta ahora). */
  proyeccionDelMes(ahora: Date = this.reloj()): ProyeccionMes {
    const lista = this.gastos
      .entre({ desde: new Date(ahora.getFullYear(), ahora.getMonth(), 1), hasta: new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1) })
      .map((g) => ({ id: g.id, monto: g.monto, categoria: g.categoria, descripcion: g.descripcion, fechaMs: g.fecha.getTime() }));
    return proyectarMes(lista, this.gastos.presupuesto(), ahora.getTime());
  }

  /** Anota un gasto como lo haría la frase "gasté {monto} en {descripcion}" (los botones de un toque de la pestaña Plata). */
  anotarGasto(monto: number, descripcion: string | null): string {
    const limpia = descripcion?.trim() ? descripcion.trim().slice(0, 200) : null;
    return this.registrar(monto, limpia ? categoriaDe(normalizar(sinArticulo(limpia))) : "otros", limpia);
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

/** Lo que el motor sabe del uso de Claude. */
export interface UsoClaude {
  plan: LecturaPlan | null;
  /** Si la statusline de Brote está instalada (sin ella, el % no llega nunca). */
  statusline: boolean;
  /** El uso por tokens (`null` si todavía no se calculó). */
  resumen: ResumenUso | null;
}

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
