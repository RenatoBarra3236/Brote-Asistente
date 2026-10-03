// Las otras dos fuentes del plan: el archivo de la app de escritorio de Claude y la consulta mínima
// (evento rate_limit_event de `claude -p`), y cómo se juntan con la statusline. Datos armados con la
// forma real (consulta-limites.jsonl, con los números de una consulta de verdad; la organización
// de la app es inventada).

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PlanDeAppClaude } from "../src/uso-archivo.ts";
import { avisosPlan, combinarPlan, describirPlan, describirReinicio, leerEventoLimites, leerPlanApp, paraMostrar, vigente, type LecturaPlan } from "../src/plan.ts";

const MIN = 60_000;
const HORA = 60 * MIN;
const AHORA = 1_791_070_000_000;

const app = (muestras: [number, number, number][], org = "org-ejemplo") =>
  JSON.stringify({ version: 2, samples: muestras.map(([ms, fh, sd]) => ({ t: ms, org, u: { fh, sd } })) });

describe("plan: consulta mínima y app de Claude", () => {
  it("lee el rate_limit_event de la consulta mínima (utilization de 0 a 1, resetsAt en segundos)", () => {
    const salida = readFileSync(fileURLToPath(new URL("./datos/consulta-limites.jsonl", import.meta.url)), "utf8");
    assert.deepEqual(leerEventoLimites(salida, AHORA), {
      sesion: { porcentaje: 14.000000000000002, reiniciaMs: 1_791_087_000_000 },
      semana: { porcentaje: 75, reiniciaMs: 1_791_187_200_000 },
      modelo: null,
      actualizadoMs: AHORA,
      fuente: "consulta",
    });
    assert.equal(leerEventoLimites('{"type":"result"}\nbasura\n', AHORA), null);
    assert.equal(leerEventoLimites('{"type":"rate_limit_event","rate_limit_info":{"unifiedWindows":{}}}', AHORA), null);
  });

  it("lee la última muestra de la app y estima el reinicio desde el comienzo de la ventana", () => {
    const texto = app([
      [AHORA - 9 * HORA, 30, 20], // otra ventana de 5 h (antes de bajar a 0)
      [AHORA - 6 * HORA, 0, 20],
      [AHORA - 2 * HORA, 5, 21], // aquí empezó la ventana actual
      [AHORA - 1 * HORA, 12, 22],
      [AHORA - 10 * MIN, 16, 22],
    ]);
    const l = leerPlanApp(texto, AHORA)!;
    assert.equal(l.fuente, "app");
    assert.equal(l.actualizadoMs, AHORA - 10 * MIN);
    assert.deepEqual(l.sesion, { porcentaje: 16, reiniciaMs: AHORA - 2 * HORA + 5 * HORA, estimado: true });
    // La semana no bajó en todo el archivo: empezó a más tardar en la primera muestra.
    assert.deepEqual(l.semana, { porcentaje: 22, reiniciaMs: AHORA - 9 * HORA + 7 * 24 * HORA, estimado: true });
  });

  it("app: 0 % es una ventana sin empezar; otra organización, formato desconocido o basura se descartan", () => {
    const l = leerPlanApp(app([[AHORA - 5 * MIN, 0, 40]]), AHORA)!;
    assert.deepEqual(l.sesion, { porcentaje: 0, reiniciaMs: null, estimado: true });
    // Vale la organización de la última muestra.
    const mezcla = JSON.stringify({
      version: 2,
      samples: [
        { t: AHORA - 20 * MIN, org: "otra", u: { fh: 90, sd: 90 } },
        { t: AHORA - 10 * MIN, org: "mia", u: { fh: 10, sd: 30 } },
      ],
    });
    assert.equal(leerPlanApp(mezcla, AHORA)!.sesion!.porcentaje, 10);
    assert.equal(leerPlanApp(JSON.stringify({ version: 3, samples: [] }), AHORA), null);
    assert.equal(leerPlanApp("{roto", AHORA), null);
    assert.equal(leerPlanApp(app([[AHORA - MIN, Number.NaN, Number.NaN]]), AHORA), null);
    // Segundos en vez de milisegundos también sirven.
    assert.equal(leerPlanApp(app([[(AHORA - MIN) / 1000, 7, 8]]), AHORA)!.actualizadoMs, AHORA - MIN);
  });

  it("combina: vale la más reciente, pero hereda la hora exacta de la misma ventana", () => {
    const exacta: LecturaPlan = {
      sesion: { porcentaje: 14, reiniciaMs: AHORA + 3 * HORA },
      semana: { porcentaje: 75, reiniciaMs: AHORA + 30 * HORA },
      modelo: "claude-opus-5-5",
      actualizadoMs: AHORA - 20 * MIN,
      fuente: "consulta",
    };
    const deApp: LecturaPlan = {
      sesion: { porcentaje: 18, reiniciaMs: AHORA + 2 * HORA, estimado: true },
      semana: { porcentaje: 76, reiniciaMs: AHORA + 40 * HORA, estimado: true },
      modelo: null,
      actualizadoMs: AHORA - 5 * MIN,
      fuente: "app",
    };
    const c = combinarPlan(exacta, deApp)!;
    assert.equal(c.fuente, "app");
    assert.deepEqual(c.sesion, { porcentaje: 18, reiniciaMs: AHORA + 3 * HORA });
    assert.deepEqual(c.semana, { porcentaje: 76, reiniciaMs: AHORA + 30 * HORA });
    assert.equal(c.modelo, "claude-opus-5-5");
    // El orden de los argumentos no importa: vale la más reciente.
    assert.deepEqual(combinarPlan(deApp, exacta), c);
    // Si el % bajó, es otra ventana: no hereda.
    const bajo = { ...deApp, sesion: { porcentaje: 2, reiniciaMs: AHORA + 4 * HORA, estimado: true } };
    assert.deepEqual(combinarPlan(exacta, bajo)!.sesion, bajo.sesion);
    assert.equal(combinarPlan(null, deApp), deApp);
    assert.equal(combinarPlan(exacta, null), exacta);
  });

  it("muestra 0 % y la hora en que se reinició, en vez de hacer desaparecer la barra", () => {
    const l: LecturaPlan = {
      sesion: { porcentaje: 60, reiniciaMs: AHORA + HORA },
      semana: { porcentaje: 75, reiniciaMs: AHORA + 30 * HORA },
      modelo: null,
      actualizadoMs: AHORA,
    };
    assert.deepEqual(paraMostrar(l, AHORA)!.sesion, { porcentaje: 60, reiniciaMs: AHORA + HORA, reiniciada: false });
    const despues = paraMostrar(l, AHORA + 2 * HORA)!;
    assert.deepEqual(despues.sesion, { porcentaje: 0, reiniciaMs: AHORA + HORA, reiniciada: true });
    assert.equal(despues.semana!.porcentaje, 75);
    // vigente (para los avisos y el motor) sí la quita.
    assert.equal(vigente(l, AHORA + 2 * HORA)!.sesion, null);
    // Reiniciada hace más de una semana: se quita.
    assert.equal(paraMostrar(l, AHORA + 9 * 24 * HORA), null);
    // Sin hora de reinicio: vale mientras la lectura sea más nueva que la ventana.
    const sinHora: LecturaPlan = { sesion: { porcentaje: 30, reiniciaMs: null, estimado: true }, semana: null, modelo: null, actualizadoMs: AHORA };
    assert.equal(paraMostrar(sinHora, AHORA + 4 * HORA)!.sesion!.reiniciada, false);
    assert.equal(paraMostrar(sinHora, AHORA + 6 * HORA)!.sesion!.reiniciada, true);
  });

  it("sin hora de reinicio no avisa; con hora estimada dice «cerca de»", () => {
    const sinHora: LecturaPlan = { sesion: { porcentaje: 90, reiniciaMs: null, estimado: true }, semana: null, modelo: null, actualizadoMs: AHORA };
    assert.deepEqual(avisosPlan(sinHora, AHORA, new Set()), []);
    assert.equal(describirPlan(sinHora, AHORA, true), "📊 Sesión de 5 h: 90 %\nActualizado recién.");
    assert.match(describirReinicio(sinHora, AHORA, true), /Todavía no sé/);
    const estimada: LecturaPlan = { ...sinHora, sesion: { porcentaje: 90, reiniciaMs: AHORA + HORA, estimado: true } };
    assert.match(avisosPlan(estimada, AHORA, new Set())[0], /se reinicia cerca de/);
    assert.match(describirPlan(estimada, AHORA, true), /cerca de .*en unos 1 h/);
  });

  it("el archivo de la app se relee solo cuando cambia, y si desaparece no queda nada", () => {
    const carpeta = mkdtempSync(join(tmpdir(), "plan-app-"));
    after(() => rmSync(carpeta, { recursive: true, force: true }));
    const ruta = join(carpeta, "plan-usage-history.json");
    const lector = new PlanDeAppClaude(() => ruta);
    assert.equal(lector.leer(AHORA), null);
    writeFileSync(ruta, app([[AHORA - MIN, 10, 20]]));
    utimesSync(ruta, new Date(AHORA - 60_000), new Date(AHORA - 60_000));
    assert.equal(lector.leer(AHORA)!.sesion!.porcentaje, 10);
    writeFileSync(ruta, app([[AHORA - MIN, 30, 20]]));
    utimesSync(ruta, new Date(AHORA), new Date(AHORA));
    assert.equal(lector.leer(AHORA)!.sesion!.porcentaje, 30);
    rmSync(ruta);
    assert.equal(lector.leer(AHORA), null);
    assert.equal(new PlanDeAppClaude(() => null).leer(AHORA), null);
  });
});
