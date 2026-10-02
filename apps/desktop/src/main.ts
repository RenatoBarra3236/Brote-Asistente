import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Isla } from "./isla";
import type { Estado } from "./personaje/estados";
import { Personaje } from "./personaje/personaje";

/** Lo decide Rust al iniciar: notch en macOS, ventana flotante en el resto. */
interface Diseno {
  modo: "notch" | "flotante";
  notchAncho: number;
  notchAlto: number;
}

// Teclas para probar los estados mientras no hay agente conectado.
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

async function iniciar(): Promise<void> {
  const diseno = await invoke<Diseno>("diseno");
  const isla = diseno.modo === "notch" ? new Isla(diseno.notchAncho, diseno.notchAlto) : null;

  function ajustarTamano(): void {
    const escala = window.devicePixelRatio || 1;
    lienzo.width = Math.round(lienzo.clientWidth * escala);
    lienzo.height = Math.round(lienzo.clientHeight * escala);
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
  }
  ajustarTamano();
  window.addEventListener("resize", ajustarTamano);

  window.addEventListener("keydown", (evento) => {
    if (evento.metaKey && evento.key.toLowerCase() === "q") {
      void invoke("salir");
      return;
    }
    const estado = TECLAS[evento.key];
    if (estado) personaje.setEstado(estado, true);
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
  // deja pasar los clics salvo cuando el cursor está sobre el personaje o la isla.
  let hover = false;
  let atravesable = false;
  setInterval(async () => {
    if (document.hidden) return;
    const d = await invoke<{ x: number; y: number }>("cursor_relativo");
    personaje.mirarHacia(d.x, d.y);

    const x = lienzo.clientWidth / 2 + d.x;
    const y = lienzo.clientHeight / 2 + d.y;
    hover = isla ? isla.contiene(x, y, lienzo.clientWidth) : personaje.contiene(x, y);
    if (presion) return;
    if (hover === atravesable) {
      atravesable = !hover;
      await ventana.setIgnoreCursorEvents(atravesable);
    }
  }, 50);

  // En calma se dibuja a la mitad de cuadros por segundo para gastar menos CPU.
  let anterior = performance.now();
  let saltarCuadro = false;
  function cuadro(ahora: number): void {
    requestAnimationFrame(cuadro);
    if (personaje.enCalma() && (!isla || isla.quieta())) {
      saltarCuadro = !saltarCuadro;
      if (saltarCuadro) return;
    }
    const dt = Math.min((ahora - anterior) / 1000, 0.05);
    anterior = ahora;
    const W = lienzo.clientWidth;
    const H = lienzo.clientHeight;

    personaje.actualizar(dt);
    ctx.clearRect(0, 0, W, H);
    if (isla) {
      isla.actualizar(dt, hover, personaje.estado !== "reposo");
      isla.dibujar(ctx, W, personaje);
    } else {
      const R = Math.min(W, H) * 0.26;
      personaje.dibujar(ctx, W / 2, H * 0.6 + R * 0.92, R);
      personaje.dibujarEtiqueta(ctx, W / 2, H - 16);
    }
  }
  requestAnimationFrame(cuadro);
}

void iniciar();
