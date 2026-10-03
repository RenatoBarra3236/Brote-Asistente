import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  avisosPlan,
  colorPlan,
  cuandoReinicia,
  describirPlan,
  describirReinicio,
  faltaPara,
  haceCuanto,
  leerDatosPlan,
  limpiarAvisados,
  normalizarLectura,
  vigente,
  type LecturaPlan,
} from "../src/plan.ts";
import { guardarPlan, leerPlanGuardado } from "../src/uso-archivo.ts";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";

// Hora local fija (el formato depende de la zona del computador).
const AHORA = new Date(2026, 9, 3, 16, 30).getTime();
const MIN = 60_000;
const HORA = 60 * MIN;

const temporales: string[] = [];
after(() => temporales.forEach((d) => rmSync(d, { recursive: true, force: true })));

function lectura(sesion: number | null, semana: number | null = 41, actualizadoMs = AHORA - 3 * MIN): LecturaPlan {
  return {
    sesion: sesion === null ? null : { porcentaje: sesion, reiniciaMs: AHORA + 2 * HORA + 10 * MIN },
    semana: semana === null ? null : { porcentaje: semana, reiniciaMs: new Date(2026, 9, 8, 9, 0).getTime() },
    modelo: "claude-sonnet-5",
    actualizadoMs,
  };
}

describe("plan de Claude", () => {
  it("lee lo que manda la statusline (con los nombres de Claude Code) y descarta lo raro", () => {
    const ejemplo = JSON.parse(readFileSync(fileURLToPath(new URL("./datos/statusline.json", import.meta.url)), "utf8"));
    const datos = { rate_limits: ejemplo.rate_limits, modelo: ejemplo.model.id };
    assert.deepEqual(leerDatosPlan(datos, AHORA), {
      sesion: { porcentaje: 23.2, reiniciaMs: 1_790_000_000_000 },
      semana: { porcentaje: 41, reiniciaMs: 1_790_400_000_000 },
      modelo: "claude-sonnet-5",
      actualizadoMs: AHORA,
      fuente: "statusline",
    });
    // Cada ventana puede faltar.
    assert.equal(leerDatosPlan({ rate_limits: { seven_day: ejemplo.rate_limits.seven_day } }, AHORA)?.sesion, null);
    assert.equal(leerDatosPlan({ rate_limits: {} }, AHORA), null);
    assert.equal(leerDatosPlan({ rate_limits: { five_hour: { used_percentage: "50", resets_at: 1 } } }, AHORA), null);
    assert.equal(leerDatosPlan(null, AHORA), null);
    assert.equal(leerDatosPlan({ rate_limits: { five_hour: { used_percentage: 140, resets_at: 1_790_000_000 } } }, AHORA)?.sesion?.porcentaje, 100);
    assert.equal(leerDatosPlan({ ...datos, modelo: "rm -rf /" }, AHORA)?.modelo, null);
  });

  it("descarta cada ventana pasado su reinicio", () => {
    const l = lectura(50);
    assert.equal(vigente(l, AHORA)?.sesion?.porcentaje, 50);
    const despues = AHORA + 3 * HORA;
    assert.equal(vigente(l, despues)?.sesion, null);
    assert.equal(vigente(l, despues)?.semana?.porcentaje, 41);
    assert.equal(vigente(l, new Date(2026, 9, 9).getTime()), null);
    assert.equal(normalizarLectura({ nada: 1 }), null);
    assert.deepEqual(normalizarLectura(JSON.parse(JSON.stringify(l))), { ...l, fuente: "statusline" });
  });

  it("colores y formatos", () => {
    assert.deepEqual([colorPlan(10), colorPlan(59.9), colorPlan(60), colorPlan(84), colorPlan(85), colorPlan(100)], ["verde", "verde", "ambar", "ambar", "rojo", "rojo"]);
    assert.equal(faltaPara(AHORA + 2 * HORA + 10 * MIN, AHORA), "2 h 10 min");
    assert.equal(faltaPara(AHORA + 25 * MIN, AHORA), "25 min");
    assert.equal(faltaPara(AHORA + 76 * HORA, AHORA), "3 d 4 h");
    assert.equal(faltaPara(AHORA + 10_000, AHORA), "menos de 1 min");
    assert.equal(haceCuanto(AHORA - 3 * MIN, AHORA), "hace 3 min");
    assert.equal(haceCuanto(AHORA - 10_000, AHORA), "recién");
    assert.equal(cuandoReinicia(AHORA + 2 * HORA + 10 * MIN, AHORA), "a las 18:40");
    assert.equal(cuandoReinicia(new Date(2026, 9, 4, 9, 5).getTime(), AHORA), "mañana a las 9:05");
    assert.equal(cuandoReinicia(new Date(2026, 9, 8, 9, 0).getTime(), AHORA), "el jue a las 9:00");
  });

  it("avisa una vez por ventana al pasar 80 % y 95 %", () => {
    const avisados = new Set<string>();
    assert.deepEqual(avisosPlan(lectura(70), AHORA, avisados), []);
    assert.deepEqual(avisosPlan(lectura(81), AHORA, avisados), ["Llevas 80 % de tu sesión de Claude; se reinicia a las 18:40"]);
    assert.deepEqual(avisosPlan(lectura(83), AHORA, avisados), [], "una sola vez");
    assert.deepEqual(avisosPlan(lectura(96), AHORA, avisados), ["Llevas 95 % de tu sesión de Claude; se reinicia a las 18:40"]);
    assert.deepEqual(avisosPlan(lectura(99), AHORA, avisados), []);
    // De menos de 80 directo a 95: solo el de 95.
    const otros = new Set<string>();
    assert.equal(avisosPlan(lectura(97), AHORA, otros).length, 1);
    assert.equal(avisosPlan(lectura(97), AHORA, otros).length, 0);
    // Ventana nueva (otro reinicio): avisa de nuevo; lo de ventanas pasadas se olvida.
    const nueva = { ...lectura(85), sesion: { porcentaje: 85, reiniciaMs: AHORA + 5 * HORA } };
    assert.equal(avisosPlan(nueva, AHORA, avisados).length, 1);
    assert.equal(limpiarAvisados(avisados, AHORA + 3 * HORA).length, 1);
    assert.deepEqual(avisosPlan(null, AHORA, avisados), []);
  });

  it("plan.json (600) sobrevive reinicios y pierde lo vencido", () => {
    const carpeta = mkdtempSync(join(tmpdir(), "brote-plan-"));
    temporales.push(carpeta);
    const ruta = join(carpeta, "plan.json");
    guardarPlan({ lectura: lectura(50), avisados: [`${AHORA + 2 * HORA + 10 * MIN}:80`] }, ruta);
    assert.equal((statSync(ruta).mode & 0o777).toString(8), "600");
    assert.equal(leerPlanGuardado(ruta, AHORA).lectura?.sesion?.porcentaje, 50);
    assert.equal(leerPlanGuardado(ruta, AHORA).avisados.length, 1);
    const tarde = leerPlanGuardado(ruta, AHORA + 3 * HORA);
    assert.equal(tarde.lectura?.sesion, null);
    assert.deepEqual(tarde.avisados, []);
    assert.deepEqual(leerPlanGuardado(join(carpeta, "no-existe.json")), { lectura: null, avisados: [] });
  });

  it("el motor responde sin IA «¿cuánto llevo del plan?» y «¿cuándo se reinicia mi plan?»", () => {
    const gastos = new Gastos(":memory:");
    let plan: LecturaPlan | null = lectura(23);
    let statusline = true;
    const motor = new Motor(gastos, { reloj: () => new Date(AHORA), uso: () => ({ plan, statusline, resumen: null }) });
    const uso = motor.resolver("¿Cuánto llevo del plan?")!;
    assert.equal(uso.intencion, "plan-uso");
    assert.equal(uso.texto, "📊 Sesión de 5 h: 23 % (se reinicia a las 18:40, en 2 h 10 min)\nSemana: 41 % (se reinicia el jue a las 9:00, en 4 d 16 h)\nActualizado hace 3 min.");
    assert.equal(motor.resolver("cuando se reinicia mi plan")!.texto, "🔄 Tu sesión de 5 h se reinicia a las 18:40 (en 2 h 10 min); la semana, el jue a las 9:00.");
    assert.equal(motor.resolver("¿cómo va mi plan de Claude?")!.intencion, "plan-uso");
    plan = null;
    assert.match(motor.resolver("¿cuánto llevo del plan?")!.texto, /pulsa ↻/);
    // Sin la statusline también: el plan puede llegar de la app de Claude o de la consulta mínima.
    statusline = false;
    assert.match(motor.resolver("¿cuánto llevo del plan?")!.texto, /pulsa ↻/);
    // Con la función apagada, el motor lo dice (no va al agente).
    const apagado = new Motor(gastos, { uso: () => ({ plan, statusline, resumen: null }), activa: (f) => f !== "uso-del-plan" });
    assert.match(apagado.resolver("¿cuánto llevo del plan?")!.texto, /apagado/);
    // Sin el puente (por ejemplo, en el servidor MCP), va al agente.
    assert.equal(new Motor(gastos).resolver("¿cuánto llevo del plan?"), null);
    gastos.cerrar();
  });
});
