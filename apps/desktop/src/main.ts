import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Agente } from "./agente/agente";
import { ESCENAS } from "./agente/escenas";
import {
  TransportePuente,
  type Descarga,
  type DescargaEnCurso,
  type EstadoCalendario,
  type EstadoAula,
  type EstadoMusica,
  type EstadoProgramador,
  type LecturaEquipo,
  type TemporizadorActivo,
} from "./agente/puente";
import { TransporteSimulado } from "./agente/simulado";
import type { ConfigFunciones } from "./agente/funciones";
import { Isla, type Ala } from "./isla";
import { Panel, cuentaRegresiva } from "./panel";
import type { Estado } from "./personaje/estados";
import { Personaje } from "./personaje/personaje";

/** Lo decide Rust al iniciar: notch en macOS, ventana flotante en el resto. */
interface Diseno {
  modo: "notch" | "flotante";
  notchAncho: number;
  notchAlto: number;
}

// Teclas para probar los estados a mano (depuración); el agente los cambia solo.
const TECLAS: Record<string, Estado> = {
  "1": "reposo",
  "2": "pensando",
  "3": "trabajando",
  "4": "pidiendo-permiso",
  "5": "listo",
  "6": "error",
};

const lienzo = document.querySelector<HTMLCanvasElement>("#lienzo")!;
const ctx = lienzo.getContext("2d")!;
const ventana = getCurrentWindow();
const personaje = new Personaje();

/** Modo flotante: cuánto sigue abierto el panel después de que el cursor se va (ms). */
const ESPERA_CIERRE_MS = 800;

/** Cuánto sigue a la vista una descarga terminada, con su botón "Mostrar" (ms). */
const DESCARGA_A_LA_VISTA_MS = 60_000;

/** Muestra una descarga en el Finder o el Explorador, o la abre si es un documento. Rust valida la ruta. */
function mostrarDescarga(ruta: string, abrir = false): void {
  invoke("mostrar_descarga", { ruta, abrir }).catch((error) => console.error(`No pude mostrar la descarga: ${error}`));
}

/** Cuánto dura la cara de error antes de volver al reposo; el mensaje sigue en la burbuja (ms). */
const DURACION_ERROR = 6000;

/**
 * El agente habla con OpenClaw a través del puente que lanza Rust. Si la app se abrió con
 * `ASISTENTE_SIMULADO=1`, reproduce eventos grabados (no hace falta OpenClaw).
 */
async function crearAgente(): Promise<{ agente: Agente; puente: TransportePuente | null }> {
  if ((await invoke<string>("agente_modo")) === "simulado") {
    return { agente: new Agente(new TransporteSimulado({ escenas: ESCENAS })), puente: null };
  }
  const puente = new TransportePuente();
  await puente.iniciar();
  // "¿Qué sabes de mí?" lo resuelve el motor sin IA y abre la ventana "Lo que sé de ti".
  const agente = new Agente(puente, {
    alResolverSinIA: (intencion, datos) => {
      if (intencion === "ver-memoria") void invoke("abrir_memoria");
      // "Abre la última descarga": el motor eligió el archivo y si se puede abrir o solo mostrar.
      const descarga = datos as { ruta?: unknown; abrir?: unknown } | undefined;
      if ((intencion === "abrir-ultima-descarga" || intencion === "mostrar-ultima-descarga") && typeof descarga?.ruta === "string") {
        mostrarDescarga(descarga.ruta, descarga.abrir === true);
      }
    },
  });
  return { agente, puente };
}

async function iniciar(): Promise<void> {
  const diseno = await invoke<Diseno>("diseno");
  const { agente, puente } = await crearAgente();
  const isla = diseno.modo === "notch" ? new Isla(diseno.notchAncho, diseno.notchAlto) : null;
  // La interfaz para hablarle al agente: dentro de la isla (notch) o junto a Brote (flotante).
  const panel = new Panel(agente, document.body, {
    flotante: !isla,
    ...(puente
      ? {
          alAbrirMemoria: () => void invoke("abrir_memoria"),
          alAbrirConfiguracion: () => void invoke("abrir_configuracion"),
          alCancelarTemporizador: (id: number) => void puente.cancelarTemporizador(id),
          alMostrarDescarga: (ruta: string) => mostrarDescarga(ruta),
          alControlarMusica: (accion) => void puente.controlarMusica(accion).catch((error) => console.error(String(error))),
          alDecidirPermisoClaude: (id, decision) =>
            void puente.decidirPermisoClaude(id, decision).catch((error) => panel.mostrarAviso(String(error).replace(/^Error: /, ""))),
        }
      : {}),
  });

  // Temporizadores y pomodoro: la lista viene del puente cada vez que cambia (y al iniciar, por
  // si llegó antes de escuchar). Al terminar uno, Brote celebra y lo destaca.
  let temporizadores: TemporizadorActivo[] = [];
  let descargasEnCurso: DescargaEnCurso[] = [];
  let musica: EstadoMusica | null = null;
  let proximoEvento: EstadoCalendario["proximo"] = null;
  let programador: EstadoProgramador = { sesiones: [], permisos: [] };
  /** Si el estado actual de Brote lo puso el modo programador (y no su propio agente). */
  let porProgramador = false;
  const mostrarTemporizadores = (lista: TemporizadorActivo[]) => {
    temporizadores = lista;
    panel.mostrarTemporizadores(lista);
  };
  if (puente) {
    // Qué funciones están prendidas y qué tarjetas se ven (Configurar Brote → Funciones).
    puente.alCambiarFunciones((config) => panel.mostrarFunciones(config));
    void puente.consultar<ConfigFunciones>({ tipo: "funciones-estado" }).then((config) => panel.mostrarFunciones(config), () => {});
    puente.alCambiarTemporizadores(mostrarTemporizadores);
    puente.alAvisoTemporizador((texto) => {
      panel.mostrarAviso(texto);
      personaje.setEstado("listo");
    });
    // Brote reacciona al computador: su ánimo (cansado, acalorado) y avisos con personalidad.
    puente.alAvisoEquipo(({ texto, celebrar }) => {
      panel.mostrarAviso(texto);
      if (celebrar) personaje.setEstado("listo");
    });
    puente.alCambiarAnimo((animo) => personaje.setAnimo(animo));
    void puente
      .consultar<{ animo: "cansado" | "acalorado" | null }>({ tipo: "equipo-estado" })
      .then(({ animo }) => personaje.setAnimo(animo), () => {});
    void puente.consultar<TemporizadorActivo[]>({ tipo: "temporizadores-listar" }).then(mostrarTemporizadores, () => {});

    // Equipo: batería, CPU, memoria y disco. Se pide siempre (el puente responde con su última
    // lectura, sin medir de nuevo), así el gráfico de la CPU ya tiene historia al abrir la pestaña.
    const pedirEquipo = () =>
      void puente
        .consultar<{ lectura: LecturaEquipo | null }>({ tipo: "equipo-estado" })
        .then(({ lectura }) => panel.mostrarEquipo(lectura), () => {});
    pedirEquipo();
    setInterval(pedirEquipo, 3000);

    // Música: la tarjeta con sus botones y Brote se balancea mientras suena.
    const cambiarMusica = (estado: EstadoMusica | null) => {
      musica = estado;
      panel.mostrarMusica(estado);
      personaje.setMusica(estado?.sonando === true);
    };
    puente.alCambiarMusica(cambiarMusica);
    void puente.consultar<EstadoMusica | null>({ tipo: "musica-estado" }).then(cambiarMusica, () => {});

    // Calendario: el próximo evento y un aviso 10 min antes (Brote da un saltito para llamar la atención).
    const cambiarCalendario = (estado: EstadoCalendario) => {
      proximoEvento = estado.proximo;
      panel.mostrarCalendario(estado);
    };
    puente.alCambiarCalendario(cambiarCalendario);
    void puente.consultar<EstadoCalendario>({ tipo: "calendario-estado" }).then(cambiarCalendario, () => {});
    puente.alAvisoCalendario((texto) => {
      panel.mostrarAviso(texto);
      personaje.tocar();
    });

    // Aula: la próxima entrega (se repinta cada minuto para que "en 45 min" no quede viejo) y los
    // avisos 24 h y 2 h antes, con un saltito de Brote.
    let aula: EstadoAula | null = null;
    const cambiarAula = (estado: EstadoAula) => {
      aula = estado;
      panel.mostrarAula(estado);
    };
    puente.alCambiarAula(cambiarAula);
    void puente.consultar<EstadoAula>({ tipo: "aula-estado" }).then(cambiarAula, () => {});
    setInterval(() => aula && panel.mostrarAula(aula), 60_000);
    puente.alAvisoAula((texto) => {
      panel.mostrarAviso(texto);
      personaje.tocar();
    });

    // Modo programador: las sesiones de Claude Code del usuario. Brote trabaja mientras ellas
    // trabajan (si no está ocupado con su propio agente) y celebra cuando una termina.
    const cambiarProgramador = (estado: EstadoProgramador) => {
      programador = estado;
      panel.mostrarProgramador(estado);
    };
    puente.alCambiarProgramador(cambiarProgramador);
    void puente.consultar<EstadoProgramador>({ tipo: "programador-estado" }).then(cambiarProgramador, () => {});
    puente.alReaccionProgramador(({ reaccion, proyecto }) => {
      porProgramador = false;
      if (reaccion === "termino") {
        if (agente.conversacion.estado === "reposo") personaje.setEstado("listo");
        panel.mostrarAviso(`✅ Claude Code terminó${proyecto ? ` en ${proyecto}` : ""}`);
      } else {
        personaje.tocar();
        panel.mostrarAviso(`⚠️ Claude Code se detuvo por un error${proyecto ? ` en ${proyecto}` : ""}`);
      }
    });
    setInterval(() => {
      if (agente.conversacion.estado !== "reposo") return;
      const trabajando = programador.sesiones.some((s) => s.estado === "trabajando" || s.estado === "pensando");
      const deseado = programador.permisos.length > 0 ? "pidiendo-permiso" : trabajando ? "trabajando" : null;
      if (deseado && (personaje.estado === "reposo" || porProgramador) && personaje.estado !== deseado) {
        personaje.setEstado(deseado);
        porProgramador = true;
      } else if (!deseado && porProgramador) {
        porProgramador = false;
        if (personaje.estado !== "listo") personaje.setEstado("reposo");
      }
    }, 500);

    // Descargas: las que van en curso y, por un minuto, las que terminaron (con su botón "Mostrar").
    let listas: { descarga: Descarga; hasta: number }[] = [];
    const pintarDescargas = () => {
      const ahora = Date.now();
      listas = listas.filter((l) => l.hasta > ahora);
      panel.mostrarDescargas(descargasEnCurso, listas.map((l) => l.descarga));
    };
    puente.alCambiarDescargas((enCurso) => {
      descargasEnCurso = enCurso;
      pintarDescargas();
    });
    puente.alDescargaLista((descarga) => {
      listas = [{ descarga, hasta: Date.now() + DESCARGA_A_LA_VISTA_MS }, ...listas.filter((l) => l.descarga.ruta !== descarga.ruta)].slice(0, 3);
      pintarDescargas();
      panel.retener();
      personaje.setEstado("listo");
    });
    setInterval(() => {
      if (listas.some((l) => l.hasta <= Date.now())) pintarDescargas();
    }, 5000);
  }
  if (puente) {
    panel.mostrarConexion(puente.estadoConexion);
    puente.alCambiarConexion((estado) => panel.mostrarConexion(estado));
  }

  let estadoAgente = agente.conversacion.estado;
  let temporizadorError: ReturnType<typeof setTimeout> | undefined;
  agente.alCambiar((c) => {
    if (c.estado === estadoAgente) return;
    estadoAgente = c.estado;
    porProgramador = false;
    personaje.setEstado(c.estado);
    clearTimeout(temporizadorError);
    if (c.estado === "error") {
      temporizadorError = setTimeout(() => {
        if (personaje.estado === "error") personaje.setEstado("reposo");
      }, DURACION_ERROR);
    }
  });
  agente.conectar();

  function ajustarTamano(): void {
    const escala = window.devicePixelRatio || 1;
    lienzo.width = Math.round(lienzo.clientWidth * escala);
    lienzo.height = Math.round(lienzo.clientHeight * escala);
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    isla?.medirVentana(lienzo.clientWidth, lienzo.clientHeight);
  }
  ajustarTamano();
  window.addEventListener("resize", ajustarTamano);

  let probandoMusica = false;
  window.addEventListener("keydown", (evento) => {
    if (evento.metaKey && evento.key.toLowerCase() === "q") {
      void invoke("salir");
      return;
    }
    // Mientras se escribe, las teclas son para el campo de texto.
    if (evento.target instanceof HTMLInputElement) return;
    const estado = TECLAS[evento.key];
    if (estado) personaje.setEstado(estado, true);
    // 7, 8 y 9 prueban el ánimo según el computador (cansado, acalorado, normal).
    const animo = ({ "7": "cansado", "8": "acalorado", "9": null } as const)[evento.key as "7" | "8" | "9"];
    if (animo !== undefined) personaje.setAnimo(animo);
    // 0 prueba el balanceo con música.
    if (evento.key === "0") personaje.setMusica((probandoMusica = !probandoMusica));
  });

  // Un clic toca al personaje. En modo flotante, si el mouse se mueve con el botón
  // presionado, se arrastra la ventana; en el notch la posición es fija.
  let presion: { x: number; y: number } | null = null;
  lienzo.addEventListener("mousedown", (evento) => {
    if (evento.button === 0) presion = { x: evento.screenX, y: evento.screenY };
  });
  window.addEventListener("mousemove", (evento) => {
    if (!presion || isla) return;
    if (Math.hypot(evento.screenX - presion.x, evento.screenY - presion.y) > 4) {
      presion = null;
      void ventana.startDragging();
    }
  });
  window.addEventListener("mouseup", () => {
    if (presion) personaje.tocar();
    presion = null;
  });

  // Con la posición global del cursor: los ojos lo siguen en toda la pantalla, y la ventana
  // deja pasar los clics salvo cuando el cursor está sobre el personaje, la isla o el panel.
  let hover = false;
  let atravesable = false;
  setInterval(async () => {
    if (document.hidden) return;
    const d = await invoke<{ x: number; y: number }>("cursor_relativo");
    personaje.mirarHacia(d.x, d.y);

    const x = lienzo.clientWidth / 2 + d.x;
    const y = lienzo.clientHeight / 2 + d.y;
    hover = (isla ? isla.contiene(x, y, lienzo.clientWidth) : personaje.contiene(x, y)) || panel.contiene(x, y);
    if (presion) return;
    if (hover === atravesable) {
      atravesable = !hover;
      await ventana.setIgnoreCursorEvents(atravesable);
    }
  }, 50);

  // En calma se dibuja a la mitad de cuadros por segundo para gastar menos CPU.
  let anterior = performance.now();
  let saltarCuadro = false;
  // Modo flotante: el panel se abre igual que la isla (cursor encima o agente activo) y se cierra solo.
  let panelAbierto = false;
  let ultimaActividad = -Infinity;
  function cuadro(ahora: number): void {
    requestAnimationFrame(cuadro);
    if (personaje.enCalma() && (isla ? isla.quieta() : !panelAbierto)) {
      saltarCuadro = !saltarCuadro;
      if (saltarCuadro) return;
    }
    const dt = Math.min((ahora - anterior) / 1000, 0.05);
    anterior = ahora;
    const W = lienzo.clientWidth;
    const H = lienzo.clientHeight;

    personaje.actualizar(dt);
    panel.actualizarRelojes();
    // Con la isla cerrada, el ala izquierda muestra lo más urgente: un temporizador, una descarga o la música.
    const reloj: Ala | null =
      relojPrincipal(temporizadores) ??
      (descargasEnCurso.length > 0 ? { texto: "📥", color: "#ffffff" } : null) ??
      relojCalendario(proximoEvento) ??
      (musica?.sonando ? { texto: "♪", color: "rgb(190, 170, 255)", ondas: true } : null) ??
      (programador.sesiones.some((s) => s.estado === "trabajando" || s.estado === "pensando") ? { texto: "⌨", color: "rgb(122, 178, 255)" } : null);
    ctx.clearRect(0, 0, W, H);
    // Lo que hace Brote por el modo programador no abre la isla (las sesiones pueden trabajar
    // por horas); un permiso de Claude Code sí, por `retieneIsla`.
    const activo = (personaje.estado !== "reposo" && !porProgramador) || panel.retieneIsla(ahora);
    if (isla) {
      isla.actualizar(dt, hover, activo, panel.alto());
      isla.dibujar(ctx, W, personaje, reloj ?? undefined);
      panel.ubicar(isla.zonaPanel(W), isla.lista());
    } else {
      // Brote abajo a la derecha; el panel a su izquierda, alineado abajo.
      const R = 40;
      const centro = W - 62;
      personaje.dibujar(ctx, centro, H - 16, R);
      personaje.dibujarEtiqueta(ctx, centro, H - R * 2 - 34);
      if (reloj && !panelAbierto) {
        ctx.fillStyle = reloj.color;
        ctx.font = "600 12px ui-monospace, 'SF Mono', Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillText(reloj.texto, centro, H - R * 2 - 22);
      }
      if (hover || activo) {
        panelAbierto = true;
        ultimaActividad = ahora;
      } else if (ahora - ultimaActividad > ESPERA_CIERRE_MS) {
        panelAbierto = false;
      }
      const ancho = W - 140;
      panel.ubicar({ x: 10, y: Math.max(10, H - 12 - panel.alto()), ancho, altoMax: H - 22 }, panelAbierto);
    }
  }
  requestAnimationFrame(cuadro);
}

/** Con un evento en menos de una hora, el ala muestra cuánto falta: "📅25m". */
function relojCalendario(evento: EstadoCalendario["proximo"]): { texto: string; color: string } | null {
  if (!evento) return null;
  const minutos = Math.ceil((evento.inicioMs - Date.now()) / 60_000);
  if (minutos > 60 || evento.finMs < Date.now()) return null;
  return { texto: minutos > 0 ? `📅${minutos}m` : "📅", color: "rgb(150, 195, 255)" };
}

/** El temporizador que se muestra con la isla cerrada: el pomodoro primero, si no el que termina antes. */
function relojPrincipal(lista: TemporizadorActivo[]): { texto: string; color: string } | null {
  const principal = lista.find((t) => t.tipo === "pomodoro") ?? lista[0];
  if (!principal) return null;
  const color =
    principal.tipo === "temporizador" ? "#ffffff" : principal.fase === "descanso" ? "rgb(132, 226, 160)" : "rgb(255, 128, 102)";
  return { texto: cuentaRegresiva(principal.finMs - Date.now()), color };
}

void iniciar();
