// Medición permanente de cuánto entiende el motor sin IA (docs/plan-sin-ia.md, decisión 4). Falla si baja de las
// metas o si una frase de control (que NO debe activar nada) activa algo. Las frases son inventadas.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AREAS_DE_AYUDA } from "../src/ayuda.ts";
import { todosLosEjemplos } from "../src/sugerir.ts";
import { motorDeCorpus, medir, porAreaSinControl, porcentaje, texto } from "./ayuda-corpus.ts";
import { CASOS } from "./corpus-frases.ts";
import { CASOS_VALIDACION } from "./corpus-validacion.ts";

const motor = motorDeCorpus();
const comprender = (frase: string): string | null => motor.comprender(frase)?.accion.intencion ?? null;

const META = { ok: 100, tipeo: 85, otra: 75, areaMinima: 70 };

function revisar(nombre: string, casos: typeof CASOS) {
  describe(nombre, () => {
    const informe = medir(comprender, casos);
    const sinControl = porAreaSinControl(casos, comprender);
    it(`mide: ${casos.length} frases`, () => {
      console.log(`\n[${nombre}]\n${texto(informe)}`);
      assert.ok(casos.length > 0);
    });
    it("las exactas se entienden todas", () => {
      const m = informe.porTipo.ok;
      if (m) assert.equal(porcentaje(m), META.ok, informe.fallas.filter((f) => f.includes("/ok:")).join("\n"));
    });
    it(`con errores de escritura: al menos ${META.tipeo} %`, () => {
      const m = informe.porTipo.tipeo;
      assert.ok(!m || porcentaje(m) >= META.tipeo, `${m ? Math.round(porcentaje(m)) : 0} %\n${informe.fallas.filter((f) => f.includes("/tipeo:")).join("\n")}`);
    });
    it(`dichas de otra forma: al menos ${META.otra} %`, () => {
      const m = informe.porTipo.otra;
      assert.ok(!m || porcentaje(m) >= META.otra, `${m ? Math.round(porcentaje(m)) : 0} %\n${informe.fallas.filter((f) => f.includes("/otra:")).join("\n")}`);
    });
    it("ninguna frase de control activa algo (0 falsos positivos)", () => {
      assert.deepEqual(informe.falsosPositivos, []);
    });
    it(`ningún área baja de ${META.areaMinima} %`, () => {
      for (const [area, m] of Object.entries(sinControl)) {
        if (m.total >= 5) assert.ok(porcentaje(m) >= META.areaMinima, `${area}: ${Math.round(porcentaje(m))} %`);
      }
    });
  });
}

revisar("corpus de ajuste", CASOS);
revisar("corpus de validación (frases nuevas, sin ajustar las reglas a ellas)", CASOS_VALIDACION);

describe("el corpus", () => {
  it("tiene unas 400 frases o más y cubre control en cada área grande", () => {
    assert.ok(CASOS.length + CASOS_VALIDACION.length >= 400);
    for (const area of ["gastos", "presupuesto", "calendario", "estudio", "ahorro", "pomodoro", "musica"]) {
      assert.ok(CASOS.some((c) => c.area === area && c.tipo === "control"), area);
    }
  });

  it("las frases «ok» calzan con una plantilla tal cual (no por corrección ni piezas)", () => {
    for (const c of CASOS.filter((x) => x.tipo === "ok")) assert.equal(motor.comprender(c.frase)?.via, "exacta", c.frase);
  });

  it("no repite frases", () => {
    const vistas = new Set<string>();
    for (const c of [...CASOS, ...CASOS_VALIDACION]) {
      assert.ok(!vistas.has(c.frase), `repetida: ${c.frase}`);
      vistas.add(c.frase);
    }
  });
});

describe("los ejemplos de la ayuda", () => {
  it("cada uno se entiende tal cual con una plantilla (si no, el botón fallaría)", () => {
    for (const e of todosLosEjemplos()) assert.equal(motor.comprender(e.frase)?.via, "exacta", e.frase);
  });
  it("cada área tiene tres ejemplos", () => {
    for (const a of AREAS_DE_AYUDA) assert.equal(a.ejemplos.length, 3, a.id);
  });
});
