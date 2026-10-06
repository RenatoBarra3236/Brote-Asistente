// El transporte real: habla con OpenClaw a través del puente que lanza Rust
// (packages/adapter/src/puente.ts). Los pedidos van con el comando `agente_escribir` y
// los avisos llegan como evento `puente`, una línea JSON cada uno.

import type { PropuestaAgenda } from "./propuestas-agenda.ts";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Decision, Marco, Propuesta, ResultadoEnvio, Transporte } from "./transporte.ts";
import type { ConfigFunciones } from "./funciones.ts";
import type { EstadoUso } from "./uso.ts";
import type { Trabajando } from "./especialistas.ts";
import type { ResumenAhorro } from "./ahorro.ts";
import type { EstadoPlata } from "./plata.ts";
import type { EstadoEstudio, Ramo } from "./estudio.ts";
import type { BloquePlan, PlanEstudio, PropuestaVista } from "./plan-estudio.ts";
import type { ResumenEstudio } from "./estadisticas.ts";
import type { DecisionRepaso, EstadoRepaso, Resultado as ResultadoRepaso } from "./repaso.ts";

/** Cuánto se espera la respuesta del puente a un pedido. */
const ESPERA_RESPUESTA = 15000;

/** Un temporizador, recordatorio o pomodoro corriendo (lo manda el puente cuando cambian). */
export interface TemporizadorActivo {
  id: number;
  tipo: "temporizador" | "pomodoro";
  etiqueta: string | null;
  fase: "estudio" | "descanso" | null;
  ciclos: number;
  finMs: number;
  duracionMs: number;
  /** El ramo de este pomodoro, si alguno (pestaña Estudio). */
  ramoId?: number | null;
}

/** Una descarga terminada en la carpeta de descargas. */
export interface Descarga {
  nombre: string;
  ruta: string;
  tamano: number;
  fechaMs: number;
}

/** Una descarga en curso (`nombre` es `null` si el navegador todavía no sabe cómo se llamará). */
export interface DescargaEnCurso {
  id: string;
  nombre: string | null;
  tamano: number;
}

export type FaseTranscripcion = "en-cola" | "transcribiendo" | "lista" | "error" | "cancelada";

export interface AvisoTranscripcion {
  id: string;
  fase: FaseTranscripcion;
  texto: string;
}

/** Lo que suena en el computador (Spotify, Música o, en Windows, el reproductor del sistema). */
export interface EstadoMusica {
  app: string;
  sonando: boolean;
  cancion: string | null;
  artista: string | null;
}

/** El próximo evento del calendario y cómo decirlo ("Cálculo en 25 min"). */
export interface EstadoCalendario {
  proximo: { titulo: string; lugar: string | null; inicioMs: number; finMs: number; todoElDia: boolean } | null;
  etiqueta: string | null;
}

/** Una entrega del aula (Canvas o Moodle). */
export interface Entrega {
  curso: string;
  titulo: string;
  entregaMs: number;
  url: string | null;
  entregada: boolean;
}

/** El aula: la próxima entrega pendiente, cuántas quedan y, si no se pudo leer, por qué. */
export interface EstadoAula {
  configurada: boolean;
  proxima: Entrega | null;
  pendientes: number;
  error: string | null;
}

/** Una sesión de Claude Code del usuario (modo programador). */
export interface SesionClaude {
  id: string;
  proyecto: string;
  estado: "pensando" | "trabajando" | "permiso" | "esperando" | "lista" | "error";
  actividad: string;
  ultimaActividadMs: number;
}

/** Un permiso que pide una sesión de Claude Code y se puede responder desde la isla. */
export interface PermisoClaude {
  id: string;
  proyecto: string;
  titulo: string;
  detalle: string;
}

export interface EstadoProgramador {
  sesiones: SesionClaude[];
  permisos: PermisoClaude[];
}

export type AccionMusica = "play-pausa" | "play" | "pausa" | "siguiente" | "anterior";

/** Lo que el puente sabe del computador (pedido `equipo-estado`). Tamaños en bytes; `cpu` entre 0 y 1. */
export interface LecturaEquipo {
  bateria: { porcentaje: number; conectado: boolean } | null;
  cpu: number | null;
  disco: { libre: number; total: number } | null;
  procesoPesado: string | null;
  memoria?: { total: number; libre: number } | null;
}

/** El ánimo de Brote según el computador (batería baja, CPU alta). */
export type Animo = "cansado" | "acalorado" | null;

export interface EstadoConexion {
  conectado: boolean;
  detalle?: string;
}

type Aviso =
  | { tipo: "conexion"; conectado: boolean; detalle?: string }
  | { tipo: "evento"; marco: Marco }
  | { tipo: "propuesta"; propuesta: Propuesta }
  | { tipo: "temporizadores"; lista: TemporizadorActivo[] }
  | { tipo: "temporizador-aviso"; texto: string }
  | { tipo: "equipo-aviso"; texto: string; celebrar: boolean }
  | { tipo: "celebracion"; motivo: string; texto: string }
  | { tipo: "animo"; animo: Animo }
  | { tipo: "descargas"; enCurso: DescargaEnCurso[] }
  | { tipo: "descarga-lista"; descarga: Descarga }
  | { tipo: "musica"; estado: EstadoMusica | null }
  | ({ tipo: "calendario" } & EstadoCalendario)
  | { tipo: "calendario-aviso"; texto: string }
  | { tipo: "propuestas-agenda"; propuestas: PropuestaAgenda[] }
  | { tipo: "transcripcion"; id: string; fase: FaseTranscripcion; texto: string }
  | ({ tipo: "aula" } & EstadoAula)
  | { tipo: "aula-aviso"; texto: string }
  | ({ tipo: "programador" } & EstadoProgramador)
  | { tipo: "programador-reaccion"; reaccion: "termino" | "fallo"; proyecto: string }
  | ({ tipo: "funciones" } & ConfigFunciones)
  | ({ tipo: "uso" } & EstadoUso)
  | { tipo: "plan-aviso"; texto: string }
  | { tipo: "especialistas"; lista: Trabajando[] }
  | { tipo: "especialistas-aviso"; texto: string }
  | { tipo: "plata"; plata: EstadoPlata | null }
  | { tipo: "ahorro"; ahorro: ResumenAhorro | null }
  | { tipo: "ramos"; ramos: Ramo[] }
  | { tipo: "notas"; fichas: unknown[] }
  | { tipo: "repaso"; repaso: EstadoRepaso }
  | { tipo: "plan-estudio"; planes: PlanEstudio[] }
  | { tipo: "estadisticas-estudio"; resumen: ResumenEstudio }
  | { tipo: "plan-estudio-aviso"; texto: string; bloque: number; ramo: number }
  | { tipo: "plata-aviso"; texto: string }
  | {
      tipo: "respuesta";
      id: string;
      ok: boolean;
      error?: string;
      local?: ResultadoEnvio["local"];
      mensaje?: string;
      datos?: unknown;
    };

/** Lo que trae una respuesta del puente además del "ok". */
type Extras = ResultadoEnvio & { mensaje?: string; datos?: unknown };

interface Pendiente {
  resolver: (extras: Extras) => void;
  rechazar: (error: Error) => void;
  plazo: ReturnType<typeof setTimeout>;
}

export class TransportePuente implements Transporte {
  private readonly oyentes = new Set<(marco: Marco) => void>();
  private readonly oyentesConexion = new Set<(estado: EstadoConexion) => void>();
  private readonly oyentesPropuesta = new Set<(propuesta: Propuesta) => void>();
  private readonly oyentesTemporizadores = new Set<(lista: TemporizadorActivo[]) => void>();
  private readonly oyentesAvisoTemporizador = new Set<(texto: string) => void>();
  private readonly oyentesEquipo = new Set<(aviso: { texto: string; celebrar: boolean }) => void>();
  private readonly oyentesCelebracion = new Set<(aviso: { motivo: string; texto: string }) => void>();
  private readonly oyentesAnimo = new Set<(animo: Animo) => void>();
  private readonly oyentesDescargas = new Set<(enCurso: DescargaEnCurso[]) => void>();
  private readonly oyentesDescargaLista = new Set<(descarga: Descarga) => void>();
  private readonly oyentesMusica = new Set<(estado: EstadoMusica | null) => void>();
  private readonly oyentesCalendario = new Set<(estado: EstadoCalendario) => void>();
  private readonly oyentesAvisoCalendario = new Set<(texto: string) => void>();
  private readonly oyentesEstadisticas = new Set<(resumen: ResumenEstudio) => void>();
  private readonly oyentesPlanEstudio = new Set<(planes: PlanEstudio[]) => void>();
  private readonly oyentesAvisoBloque = new Set<(aviso: { texto: string; bloque: number; ramo: number }) => void>();
  private readonly oyentesRepaso = new Set<(estado: EstadoRepaso) => void>();
  private readonly oyentesPropuestas = new Set<(propuestas: PropuestaAgenda[]) => void>();
  private readonly oyentesTranscripcion = new Set<(aviso: AvisoTranscripcion) => void>();
  private readonly oyentesAula = new Set<(estado: EstadoAula) => void>();
  private readonly oyentesAvisoAula = new Set<(texto: string) => void>();
  private readonly oyentesProgramador = new Set<(estado: EstadoProgramador) => void>();
  private readonly oyentesReaccion = new Set<(reaccion: { reaccion: "termino" | "fallo"; proyecto: string }) => void>();
  private readonly oyentesFunciones = new Set<(config: ConfigFunciones) => void>();
  private readonly oyentesUso = new Set<(estado: EstadoUso) => void>();
  private readonly oyentesAvisoPlan = new Set<(texto: string) => void>();
  private readonly oyentesEspecialistas = new Set<(lista: Trabajando[]) => void>();
  private readonly oyentesAvisoEspecialistas = new Set<(texto: string) => void>();
  private readonly oyentesPlata = new Set<(estado: EstadoPlata | null) => void>();
  private readonly oyentesAhorro = new Set<(resumen: ResumenAhorro | null) => void>();
  private readonly oyentesAvisoPlata = new Set<(texto: string) => void>();
  private readonly oyentesRamos = new Set<(ramos: Ramo[]) => void>();
  private readonly pendientes = new Map<string, Pendiente>();
  private conexion: EstadoConexion = { conectado: false, detalle: "Conectando con OpenClaw…" };
  private siguienteId = 1;
  /** Cada ventana le habla al mismo puente: el prefijo evita confundir las respuestas. */
  private readonly prefijo = Math.random().toString(36).slice(2, 8);

  /** Empieza a escuchar el puente y pide el estado de la conexión, que pudo llegar antes. */
  async iniciar(): Promise<void> {
    await listen<string>("puente", (evento) => this.recibir(evento.payload));
    this.recibir(await invoke<string>("agente_conexion"));
  }

  get estadoConexion(): EstadoConexion {
    return this.conexion;
  }

  alCambiarConexion(oyente: (estado: EstadoConexion) => void): () => void {
    this.oyentesConexion.add(oyente);
    return () => this.oyentesConexion.delete(oyente);
  }

  /** Sin conexión igual se envía: el motor de comandos del puente funciona sin OpenClaw. */
  enviar(texto: string): Promise<ResultadoEnvio> {
    return this.pedir({ tipo: "enviar", texto });
  }

  async resolverAprobacion(id: string, kind: string, decision: Decision): Promise<void> {
    await this.pedir({ tipo: "resolver", aprobacion: id, kind, decision });
  }

  escuchar(oyente: (marco: Marco) => void): () => void {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  }

  /** La lista de temporizadores cada vez que cambia. */
  alCambiarTemporizadores(oyente: (lista: TemporizadorActivo[]) => void): () => void {
    this.oyentesTemporizadores.add(oyente);
    return () => this.oyentesTemporizadores.delete(oyente);
  }

  /** Cuando termina un temporizador o el pomodoro cambia de fase. */
  alAvisoTemporizador(oyente: (texto: string) => void): () => void {
    this.oyentesAvisoTemporizador.add(oyente);
    return () => this.oyentesAvisoTemporizador.delete(oyente);
  }

  /** Avisos sobre el computador (batería baja, CPU alta, disco lleno…). */
  /** Brote celebra algo que lograste y marcaste tú: la meta de la semana, una racha, una tarea o un ramo aprobado. */
  alCelebrar(oyente: (aviso: { motivo: string; texto: string }) => void): () => void {
    this.oyentesCelebracion.add(oyente);
    return () => this.oyentesCelebracion.delete(oyente);
  }

  alAvisoEquipo(oyente: (aviso: { texto: string; celebrar: boolean }) => void): () => void {
    this.oyentesEquipo.add(oyente);
    return () => this.oyentesEquipo.delete(oyente);
  }

  alCambiarAnimo(oyente: (animo: Animo) => void): () => void {
    this.oyentesAnimo.add(oyente);
    return () => this.oyentesAnimo.delete(oyente);
  }

  /** Las descargas en curso, cada vez que cambian. */
  alCambiarDescargas(oyente: (enCurso: DescargaEnCurso[]) => void): () => void {
    this.oyentesDescargas.add(oyente);
    return () => this.oyentesDescargas.delete(oyente);
  }

  /** Cuando termina una descarga. */
  alDescargaLista(oyente: (descarga: Descarga) => void): () => void {
    this.oyentesDescargaLista.add(oyente);
    return () => this.oyentesDescargaLista.delete(oyente);
  }

  /** Lo que suena, cada vez que cambia (canción, pausa, app cerrada…). */
  alCambiarMusica(oyente: (estado: EstadoMusica | null) => void): () => void {
    this.oyentesMusica.add(oyente);
    return () => this.oyentesMusica.delete(oyente);
  }

  /** El próximo evento del calendario, cada vez que cambia (al menos cada minuto mientras falte poco). */
  alCambiarCalendario(oyente: (estado: EstadoCalendario) => void): () => void {
    this.oyentesCalendario.add(oyente);
    return () => this.oyentesCalendario.delete(oyente);
  }

  /** El aviso 10 min antes de un evento. */
  /** Las propuestas de tareas y fechas sacadas de una grabación que esperan una decisión, cada vez que cambian. */
  alCambiarPropuestas(oyente: (propuestas: PropuestaAgenda[]) => void): () => void {
    this.oyentesPropuestas.add(oyente);
    return () => this.oyentesPropuestas.delete(oyente);
  }

  /** El tiempo estudiado de la semana, la racha y los totales por ramo (A5): al partir y cada vez que cambian. */
  alCambiarEstadisticas(oyente: (resumen: ResumenEstudio) => void): () => void {
    this.oyentesEstadisticas.add(oyente);
    return () => this.oyentesEstadisticas.delete(oyente);
  }

  /** Los planes de estudio con sus bloques (A4): al partir y cada vez que cambian (también si los toca el agente). */
  alCambiarPlanEstudio(oyente: (planes: PlanEstudio[]) => void): () => void {
    this.oyentesPlanEstudio.add(oyente);
    return () => this.oyentesPlanEstudio.delete(oyente);
  }

  /** Aviso 10 minutos antes de un bloque de estudio. */
  alAvisoBloque(oyente: (aviso: { texto: string; bloque: number; ramo: number }) => void): () => void {
    this.oyentesAvisoBloque.add(oyente);
    return () => this.oyentesAvisoBloque.delete(oyente);
  }

  /** Propuestas de repaso, tarjetas que vencen y resúmenes (A3): al partir y cada vez que cambian (también si los deja el agente). */
  alCambiarRepaso(oyente: (estado: EstadoRepaso) => void): () => void {
    this.oyentesRepaso.add(oyente);
    return () => this.oyentesRepaso.delete(oyente);
  }

  /** Avisos de "Grabar y transcribir": en cola, transcribiendo, lista, error o cancelada (sin el contenido de la grabación). */
  alAvisoTranscripcion(oyente: (aviso: AvisoTranscripcion) => void): () => void {
    this.oyentesTranscripcion.add(oyente);
    return () => this.oyentesTranscripcion.delete(oyente);
  }

  alAvisoCalendario(oyente: (texto: string) => void): () => void {
    this.oyentesAvisoCalendario.add(oyente);
    return () => this.oyentesAvisoCalendario.delete(oyente);
  }

  /** El aula (próxima entrega), cada vez que cambia. */
  /** Las funciones prendidas y las tarjetas de Inicio (Configurar Brote → Funciones), cada vez que cambian. */
  alCambiarFunciones(oyente: (config: ConfigFunciones) => void): () => void {
    this.oyentesFunciones.add(oyente);
    return () => this.oyentesFunciones.delete(oyente);
  }

  alCambiarAula(oyente: (estado: EstadoAula) => void): () => void {
    this.oyentesAula.add(oyente);
    return () => this.oyentesAula.delete(oyente);
  }

  /** El aviso 24 h y 2 h antes de una entrega. */
  alAvisoAula(oyente: (texto: string) => void): () => void {
    this.oyentesAvisoAula.add(oyente);
    return () => this.oyentesAvisoAula.delete(oyente);
  }

  /** Las sesiones de Claude Code y sus permisos pendientes, cada vez que cambian. */
  alCambiarProgramador(oyente: (estado: EstadoProgramador) => void): () => void {
    this.oyentesProgramador.add(oyente);
    return () => this.oyentesProgramador.delete(oyente);
  }

  /** Cuando una sesión de Claude Code termina su turno (o falla). */
  alReaccionProgramador(oyente: (reaccion: { reaccion: "termino" | "fallo"; proyecto: string }) => void): () => void {
    this.oyentesReaccion.add(oyente);
    return () => this.oyentesReaccion.delete(oyente);
  }

  /** El plan de Claude y el uso por tokens, cada vez que cambian. */
  alCambiarUso(oyente: (estado: EstadoUso) => void): () => void {
    this.oyentesUso.add(oyente);
    return () => this.oyentesUso.delete(oyente);
  }

  /** El aviso al pasar 80 % y 95 % de la sesión de 5 h. */
  alAvisoPlan(oyente: (texto: string) => void): () => void {
    this.oyentesAvisoPlan.add(oyente);
    return () => this.oyentesAvisoPlan.delete(oyente);
  }

  /** El equipo de Brote trabajando (los especialistas en los que delegó). */
  alCambiarEspecialistas(oyente: (lista: Trabajando[]) => void): () => void {
    this.oyentesEspecialistas.add(oyente);
    return () => this.oyentesEspecialistas.delete(oyente);
  }

  /** El freno por plan: los especialistas con Claude salen o vuelven (una vez por cambio). */
  alAvisoEspecialistas(oyente: (texto: string) => void): () => void {
    this.oyentesAvisoEspecialistas.add(oyente);
    return () => this.oyentesAvisoEspecialistas.delete(oyente);
  }

  /** Las metas de ahorro: con cada cambio (una frase, la isla o el MCP). `null` = la función está apagada. */
  alCambiarAhorro(oyente: (resumen: ResumenAhorro | null) => void): () => void {
    this.oyentesAhorro.add(oyente);
    return () => this.oyentesAhorro.delete(oyente);
  }

  /** La pestaña Plata: el resumen de los gastos, cada vez que cambian (o el presupuesto, o el día). */
  alCambiarPlata(oyente: (estado: EstadoPlata | null) => void): () => void {
    this.oyentesPlata.add(oyente);
    return () => this.oyentesPlata.delete(oyente);
  }

  /** La pestaña Estudio: la lista de ramos, cada vez que cambia (también si la cambia el agente). */
  alCambiarRamos(oyente: (ramos: Ramo[]) => void): () => void {
    this.oyentesRamos.add(oyente);
    return () => this.oyentesRamos.delete(oyente);
  }

  /** Los ramos con su ficha (clases, entregas, tareas) y lo que se sugiere agregar. */
  async estadoEstudio(): Promise<EstadoEstudio> {
    const { datos } = await this.pedir({ tipo: "ramos-estado" });
    return datos as EstadoEstudio;
  }

  async crearRamo(nombre: string, alias: string[] = []): Promise<string> {
    const { mensaje } = await this.pedir({ tipo: "ramo-crear", nombre, alias });
    return mensaje ?? "Listo.";
  }

  async editarRamo(ramo: number, cambios: { nombre?: string; alias?: string[]; color?: string }): Promise<void> {
    await this.pedir({ tipo: "ramo-editar", ramo, ...cambios });
  }

  async archivarRamo(ramo: number, archivado = true): Promise<void> {
    await this.pedir({ tipo: "ramo-archivar", ramo, archivado });
  }

  async borrarRamo(ramo: number): Promise<void> {
    await this.pedir({ tipo: "ramo-borrar", ramo });
  }

  /** Crea (sin `evaluacion`) o edita una evaluación; `nota: null` la deja pendiente. */
  async guardarEvaluacion(datos: { ramo?: number; evaluacion?: number; nombre?: string; peso?: number; nota?: number | null; fecha?: string | null }): Promise<void> {
    await this.pedir({ tipo: "evaluacion-guardar", ...datos });
  }

  async borrarEvaluacion(evaluacion: number): Promise<void> {
    await this.pedir({ tipo: "evaluacion-borrar", evaluacion });
  }

  async ajustesNotas(ramo: number, ajustes: { aprobacion?: number; examenPeso?: number | null; examenMinimo?: number | null; presentacionMinima?: number | null }): Promise<void> {
    await this.pedir({ tipo: "notas-ajustes", ramo, ...ajustes });
  }

  /** Pone (o quita, con `null`) el ramo de una tarea, pomodoro o transcripción. */
  async asignarRamo(que: "tarea" | "propuesta" | "pomodoro" | "grabacion", ref: number | string, ramo: number | null): Promise<void> {
    await this.pedir({ tipo: "ramo-asignar", que, ref, ramo });
  }

  /** Los avisos del presupuesto (80 % y 100 %, una vez cada uno por mes). */
  alAvisoPlata(oyente: (texto: string) => void): () => void {
    this.oyentesAvisoPlata.add(oyente);
    return () => this.oyentesAvisoPlata.delete(oyente);
  }

  /** Un botón de un toque de la pestaña Plata: anota ese gasto frecuente. Devuelve lo que dice Brote. */
  async anotarFrecuente(monto: number, descripcion: string): Promise<string> {
    const { mensaje } = await this.pedir({ tipo: "plata-anotar", monto, descripcion });
    return mensaje ?? "Anotado.";
  }

  /** Pone (o quita, con `null`) el presupuesto mensual. */
  async ponerPresupuesto(monto: number | null): Promise<EstadoPlata | null> {
    const { datos } = await this.pedir({ tipo: "presupuesto-poner", monto });
    return (datos as EstadoPlata | null) ?? null;
  }

  async decidirPermisoClaude(id: string, decision: "allow" | "deny"): Promise<void> {
    await this.pedir({ tipo: "programador-decidir", permiso: id, decision });
  }

  async controlarMusica(accion: AccionMusica): Promise<void> {
    await this.pedir({ tipo: "musica-control", accion });
  }

  async cancelarTemporizador(id: number): Promise<void> {
    await this.pedir({ tipo: "temporizador-cancelar", temporizador: id });
  }

  alProponer(oyente: (propuesta: Propuesta) => void): () => void {
    this.oyentesPropuesta.add(oyente);
    return () => this.oyentesPropuesta.delete(oyente);
  }

  async detener(runId?: string): Promise<void> {
    await this.pedir(runId ? { tipo: "detener", runId } : { tipo: "detener" });
  }

  async decidirPlantilla(id: number, aceptar: boolean): Promise<string> {
    const { mensaje } = await this.pedir({ tipo: "decidir-plantilla", plantilla: id, aceptar });
    return mensaje ?? (aceptar ? "Listo, la aprendí." : "Ok, no la aprendo.");
  }

  /** Agregar o descartar una tarea o fecha que Brote sacó de una grabación (con el título o la fecha corregidos, si los cambió). */
  async decidirPropuestaAgenda(propuesta: number, decision: "aceptar" | "descartar", cambios?: { titulo: string; fecha: string }): Promise<{ mensaje: string }> {
    const { mensaje } = await this.pedir({ tipo: "propuesta-decidir", propuesta, decision, ...(cambios ? { titulo: cambios.titulo, fecha: cambios.fecha } : {}) });
    return { mensaje: mensaje ?? "" };
  }

  /** Acepta lo marcado de una propuesta de repaso (con las correcciones del usuario); devuelve cuánto se guardó. */
  async aceptarRepaso(grabacion: string, decision: DecisionRepaso): Promise<{ tarjetas: number; repetidas: number; temas: number }> {
    return this.consultar({ tipo: "repaso-propuesta-decidir", grabacion, decision: "aceptar", ...decision });
  }

  async descartarRepaso(grabacion: string): Promise<void> {
    await this.pedir({ tipo: "repaso-propuesta-decidir", grabacion, decision: "descartar" });
  }

  async responderRepaso(tarjeta: number, resultado: ResultadoRepaso): Promise<void> {
    await this.pedir({ tipo: "repaso-responder", tarjeta, resultado });
  }

  /** Arma (sin guardar) la propuesta de plan de estudio de una evaluación. */
  async proponerPlanEstudio(ramo: number, evaluacion: number, horas?: number): Promise<PropuestaVista> {
    return this.consultar({ tipo: "plan-estudio-proponer", ramo, evaluacion, ...(horas !== undefined ? { horas } : {}) });
  }

  async agendarPlanEstudio(ramo: number, evaluacion: number, horas: number, bloques: BloquePlan[], calendario: boolean): Promise<{ plan: PlanEstudio | null; calendario: { pedido: boolean; creados: number; fallidos: number } }> {
    return this.consultar({ tipo: "plan-estudio-agendar", ramo, evaluacion, horas, bloques, calendario });
  }

  async marcarBloque(bloque: number, estado: "pendiente" | "hecho" | "saltado"): Promise<void> {
    await this.pedir({ tipo: "plan-estudio-bloque", bloque, estado });
  }

  async borrarPlanEstudio(plan: number): Promise<void> {
    await this.pedir({ tipo: "plan-estudio-borrar", que: "plan", plan });
  }

  /** «Empezar» en un bloque: un pomodoro con el nombre del ramo. */
  async iniciarPomodoro(ramo: number): Promise<void> {
    await this.pedir({ tipo: "pomodoro-iniciar", ramo });
  }

  /** Un pedido cualquiera al puente (por ejemplo, los de "Lo que sé de ti"); devuelve sus datos. */
  async consultar<T = unknown>(pedido: Record<string, unknown>): Promise<T> {
    const { datos } = await this.pedir(pedido);
    return datos as T;
  }

  private async pedir(pedido: Record<string, unknown>): Promise<Extras> {
    const id = `${this.prefijo}-${this.siguienteId++}`;
    const respuesta = new Promise<Extras>((resolver, rechazar) => {
      const plazo = setTimeout(() => {
        this.pendientes.delete(id);
        rechazar(new Error("OpenClaw no respondió a tiempo"));
      }, ESPERA_RESPUESTA);
      this.pendientes.set(id, { resolver, rechazar, plazo });
    });
    try {
      await invoke("agente_escribir", { linea: JSON.stringify({ id, ...pedido }) });
    } catch (error) {
      const pendiente = this.pendientes.get(id);
      if (pendiente) {
        clearTimeout(pendiente.plazo);
        this.pendientes.delete(id);
      }
      throw new Error(String(error));
    }
    return respuesta;
  }

  private recibir(linea: string): void {
    let aviso: Aviso;
    try {
      aviso = JSON.parse(linea);
    } catch {
      console.warn("[puente] aviso que no es JSON:", linea);
      return;
    }
    switch (aviso.tipo) {
      case "evento":
        for (const oyente of this.oyentes) oyente(aviso.marco);
        return;
      case "respuesta": {
        const pendiente = this.pendientes.get(aviso.id);
        if (!pendiente) return;
        clearTimeout(pendiente.plazo);
        this.pendientes.delete(aviso.id);
        if (aviso.ok) pendiente.resolver({ local: aviso.local, mensaje: aviso.mensaje, datos: aviso.datos });
        else pendiente.rechazar(new Error(aviso.error ?? "OpenClaw rechazó el pedido"));
        return;
      }
      case "propuesta":
        for (const oyente of this.oyentesPropuesta) oyente(aviso.propuesta);
        return;
      case "temporizadores":
        for (const oyente of this.oyentesTemporizadores) oyente(aviso.lista);
        return;
      case "temporizador-aviso":
        for (const oyente of this.oyentesAvisoTemporizador) oyente(aviso.texto);
        return;
      case "equipo-aviso":
        for (const oyente of this.oyentesEquipo) oyente({ texto: aviso.texto, celebrar: aviso.celebrar });
        return;
      case "celebracion":
        for (const oyente of this.oyentesCelebracion) oyente({ motivo: aviso.motivo, texto: aviso.texto });
        return;
      case "animo":
        for (const oyente of this.oyentesAnimo) oyente(aviso.animo);
        return;
      case "descargas":
        for (const oyente of this.oyentesDescargas) oyente(aviso.enCurso);
        return;
      case "calendario":
        for (const oyente of this.oyentesCalendario) oyente({ proximo: aviso.proximo, etiqueta: aviso.etiqueta });
        return;
      case "transcripcion":
        for (const oyente of this.oyentesTranscripcion) oyente({ id: aviso.id, fase: aviso.fase, texto: aviso.texto });
        return;
      case "propuestas-agenda":
        for (const oyente of this.oyentesPropuestas) oyente(aviso.propuestas);
        return;
      case "calendario-aviso":
        for (const oyente of this.oyentesAvisoCalendario) oyente(aviso.texto);
        return;
      case "funciones":
        for (const oyente of this.oyentesFunciones) oyente({ activas: aviso.activas, tarjetas: aviso.tarjetas });
        return;
      case "aula":
        for (const oyente of this.oyentesAula) oyente({ configurada: aviso.configurada, proxima: aviso.proxima, pendientes: aviso.pendientes, error: aviso.error });
        return;
      case "aula-aviso":
        for (const oyente of this.oyentesAvisoAula) oyente(aviso.texto);
        return;
      case "programador":
        for (const oyente of this.oyentesProgramador) oyente({ sesiones: aviso.sesiones, permisos: aviso.permisos });
        return;
      case "uso":
        for (const oyente of this.oyentesUso) oyente({ plan: aviso.plan, statusline: aviso.statusline, resumen: aviso.resumen, precios: aviso.precios });
        return;
      case "plan-aviso":
        for (const oyente of this.oyentesAvisoPlan) oyente(aviso.texto);
        return;
      case "especialistas":
        for (const oyente of this.oyentesEspecialistas) oyente(aviso.lista);
        return;
      case "especialistas-aviso":
        for (const oyente of this.oyentesAvisoEspecialistas) oyente(aviso.texto);
        return;
      case "ramos":
        for (const oyente of this.oyentesRamos) oyente(aviso.ramos);
        return;
      case "notas":
        // Las notas viajan dentro de `ramos-estado`: el aviso solo hace que la pestaña Estudio se vuelva a pedir.
        for (const oyente of this.oyentesRamos) oyente([]);
        return;
      case "repaso":
        for (const oyente of this.oyentesRepaso) oyente(aviso.repaso);
        return;
      case "estadisticas-estudio":
        for (const oyente of this.oyentesEstadisticas) oyente(aviso.resumen);
        return;
      case "plan-estudio":
        for (const oyente of this.oyentesPlanEstudio) oyente(aviso.planes);
        return;
      case "plan-estudio-aviso":
        for (const oyente of this.oyentesAvisoBloque) oyente({ texto: aviso.texto, bloque: aviso.bloque, ramo: aviso.ramo });
        return;
      case "plata":
        for (const oyente of this.oyentesPlata) oyente(aviso.plata);
        return;
      case "ahorro":
        for (const oyente of this.oyentesAhorro) oyente(aviso.ahorro);
        return;
      case "plata-aviso":
        for (const oyente of this.oyentesAvisoPlata) oyente(aviso.texto);
        return;
      case "programador-reaccion":
        for (const oyente of this.oyentesReaccion) oyente({ reaccion: aviso.reaccion, proyecto: aviso.proyecto });
        return;
      case "musica":
        for (const oyente of this.oyentesMusica) oyente(aviso.estado);
        return;
      case "descarga-lista":
        for (const oyente of this.oyentesDescargaLista) oyente(aviso.descarga);
        return;
      case "conexion": {
        const estado = { conectado: aviso.conectado, detalle: aviso.detalle };
        if (estado.conectado === this.conexion.conectado && estado.detalle === this.conexion.detalle) return;
        this.conexion = estado;
        for (const oyente of this.oyentesConexion) oyente(estado);
        return;
      }
    }
  }
}
