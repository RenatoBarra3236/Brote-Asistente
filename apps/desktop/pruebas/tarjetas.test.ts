import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activasDePreset, funcionesPorDefecto, type ConfigFunciones } from "../src/agente/funciones.ts";
import { pestanaSugerida, tarjetasVisibles, textoPildora, type DatosPildoras } from "../src/agente/tarjetas.ts";

const AHORA = new Date(2026, 9, 3, 15, 0).getTime();
const todo = (): ConfigFunciones => ({ ...funcionesPorDefecto(), activas: activasDePreset("todo") });
const conDatos = { temporizadores: true, calendario: true, aula: true, musica: true, descargas: false, claude: true };

const datos: DatosPildoras = {
  temporizadores: [
    { tipo: "temporizador", fase: null, etiqueta: "sacar la ropa", finMs: AHORA + 60_000 },
    { tipo: "pomodoro", fase: "estudio", etiqueta: "cálculo", finMs: AHORA + 18 * 60_000 + 20_000 },
  ],
  calendario: { titulo: "Cálculo II", inicioMs: AHORA + 25 * 60_000, finMs: AHORA + 85 * 60_000, todoElDia: false },
  aula: { titulo: "Lab 4", entregaMs: AHORA + 30 * 60_000 },
  musica: { cancion: "Santa Fe", app: "Spotify", sonando: true },
  descargas: { enCurso: 0, listas: 0 },
  claude: { sesiones: 2, pideProyecto: null },
};

describe("tarjetas de la pestaña Brote", () => {
  it("se ven las que tienen datos, de funciones prendidas y no ocultas, en el orden elegido", () => {
    assert.deepEqual(tarjetasVisibles(todo(), conDatos), ["temporizadores", "calendario", "aula", "musica", "claude"]);
    const config = todo();
    config.activas.musica = false;
    config.activas.programador = false;
    config.tarjetas = { orden: ["aula", "calendario", "temporizadores", "musica", "descargas", "claude"], ocultas: ["calendario"] };
    assert.deepEqual(tarjetasVisibles(config, conDatos), ["aula", "temporizadores"]);
  });

  it("las píldoras: el pomodoro primero, cuánto falta y la canción", () => {
    assert.equal(textoPildora("temporizadores", datos, AHORA)?.texto, "🍅 18:20");
    assert.equal(textoPildora("calendario", datos, AHORA)?.texto, "📅 en 25 min");
    assert.equal(textoPildora("aula", datos, AHORA)?.texto, "📚 en 30 min");
    assert.equal(textoPildora("musica", datos, AHORA)?.texto, "♪ Santa Fe");
    assert.equal(textoPildora("musica", { ...datos, musica: { ...datos.musica!, sonando: false } }, AHORA)?.texto, "⏸ Santa Fe");
    assert.equal(textoPildora("claude", datos, AHORA)?.texto, "⌨ 2 sesiones");
    assert.equal(textoPildora("claude", { ...datos, claude: { sesiones: 1, pideProyecto: "tarea-rust" } }, AHORA)?.texto, "⌨ pide permiso");
    assert.equal(textoPildora("descargas", datos, AHORA), null);
    assert.equal(textoPildora("descargas", { ...datos, descargas: { enCurso: 1, listas: 0 } }, AHORA)?.texto, "📥 Descargando");
    const descanso = { ...datos, temporizadores: [{ tipo: "pomodoro" as const, fase: "descanso" as const, etiqueta: null, finMs: AHORA + 300_000 }] };
    assert.equal(textoPildora("temporizadores", descanso, AHORA)?.texto, "☕ 5:00");
  });

  it("al reabrir la isla: Brote si la conversación espera, Claude si una sesión pide permiso", () => {
    assert.equal(pestanaSugerida({ conversacionPendiente: false, permisoClaude: false }), "brote");
    assert.equal(pestanaSugerida({ conversacionPendiente: false, permisoClaude: true }), "claude");
    assert.equal(pestanaSugerida({ conversacionPendiente: true, permisoClaude: true }), "brote");
  });
});
