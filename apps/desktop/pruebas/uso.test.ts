import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { barrasPlan, filasTokens, precioCorto, type LecturaPlan, type ResumenPeriodo } from "../src/agente/uso.ts";
import { funcionesSinConfigurar } from "../src/agente/preparacion.ts";
import { activasDePreset } from "../src/agente/funciones.ts";

const AHORA = new Date(2026, 9, 3, 16, 30).getTime();
const MIN = 60_000;

describe("uso del plan en la isla", () => {
  const plan: LecturaPlan = {
    sesion: { porcentaje: 86.4, reiniciaMs: AHORA + 130 * MIN },
    semana: { porcentaje: 41, reiniciaMs: AHORA + 4 * 1440 * MIN },
    modelo: "claude-sonnet-5",
    actualizadoMs: AHORA - 3 * MIN,
  };

  test("dos barras con su color, % y cuándo se reinician", () => {
    const { barras, actualizado } = barrasPlan(plan, AHORA);
    assert.deepEqual(
      barras.map((b) => [b.nombre, b.porcentaje, b.color, b.reinicia]),
      [
        ["Sesión de 5 h", 86, "rojo", "se reinicia en 2 h 10 min"],
        ["Semana", 41, "verde", "se reinicia en 4 d"],
      ],
    );
    assert.equal(actualizado, "actualizado hace 3 min · Claude Code");
    assert.equal(barrasPlan({ ...plan, sesion: { porcentaje: 70, reiniciaMs: AHORA + MIN } }, AHORA).barras[0].color, "ambar");
  });

  test("sin datos no hay barras; una ventana reiniciada queda en 0 % con la hora en que se reinició", () => {
    assert.deepEqual(barrasPlan(null, AHORA), { barras: [], actualizado: null });
    const despues = barrasPlan(plan, AHORA + 3 * 1440 * MIN).barras;
    assert.deepEqual(despues.map((b) => [b.nombre, b.porcentaje, b.reinicia]), [
      ["Sesión de 5 h", 0, "se reinició a las 18:40"],
      ["Semana", 41, "se reinicia en 1 d"],
    ]);
    assert.deepEqual(barrasPlan(plan, AHORA + 5 * 1440 * MIN).barras.map((b) => [b.porcentaje, b.reinicia]), [
      [0, "se reinició a las 18:40"],
      [0, "se reinició a las 16:30"],
    ]);
    // Más de una semana después de reiniciarse, ya no se muestra.
    assert.deepEqual(barrasPlan(plan, AHORA + 12 * 1440 * MIN).barras, []);
  });

  test("de la app de Claude: hora estimada con ≈, y una ventana sin empezar", () => {
    const deApp: LecturaPlan = {
      sesion: { porcentaje: 0, reiniciaMs: null, estimado: true },
      semana: { porcentaje: 76, reiniciaMs: AHORA + 30 * 60 * MIN, estimado: true },
      modelo: null,
      actualizadoMs: AHORA - 6 * MIN,
      fuente: "app",
    };
    const { barras, actualizado } = barrasPlan(deApp, AHORA);
    assert.deepEqual(barras.map((b) => [b.porcentaje, b.reinicia]), [
      [0, "sin usar desde el último reinicio"],
      [76, "se reinicia en ≈ 1 d 6 h"],
    ]);
    assert.equal(actualizado, "actualizado hace 6 min · app de Claude");
  });

  test("filas de tokens: Brote y tus sesiones, con su valor API", () => {
    const t = (entrada: number, salida: number, cache: number, usd: number, sinPrecio = 0) => ({ entrada, salida, cache, usd, sinPrecio });
    const periodo: ResumenPeriodo = { total: t(0, 0, 0, 0), brote: t(6000, 22_000, 610_000, 0.82), tuyas: t(35_000, 160_000, 8_790_000, 20.55, 2_000_000), porModelo: [], proyectos: [] };
    assert.deepEqual(filasTokens(periodo), [
      ["Entrada", "6 k", "35 k"],
      ["Salida", "22 k", "160 k"],
      ["Caché", "610 k", "8,8 M"],
      ["Valor API", "US$ 0,82", "US$ 20,55 + 2 M sin precio"],
    ]);
    assert.deepEqual([precioCorto(2.5), precioCorto(0.2), precioCorto(10), precioCorto(1.25)], ["2,5", "0,2", "10", "1,25"]);
  });

  test("Configurar Brote avisa si el uso del plan está prendido sin la statusline", () => {
    const activas = activasDePreset("programador");
    const ids = (pasos: { id: string; estado: "ok" | "opcional" }[]) => funcionesSinConfigurar(activas, pasos.map((p) => ({ ...p, titulo: "", detalle: "" }))).map((f) => f.id);
    assert.ok(ids([{ id: "statusline", estado: "opcional" }]).includes("uso-del-plan"));
    assert.ok(!ids([{ id: "statusline", estado: "ok" }]).includes("uso-del-plan"));
  });
});
