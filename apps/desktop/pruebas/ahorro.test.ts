import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { avisoAhorroBorrado, filaDeMeta, frasePorAporte, lineaDeMetaGuardada, progresoDeMetaAhorro, resumirAhorro } from "../src/agente/ahorro.ts";
import type { AporteAhorro, MetaAhorro } from "../src/agente/ahorro.ts";

const DIA = 86_400_000;
const AHORA = new Date(2026, 9, 7, 14, 0).getTime();
const MARZO = new Date(2027, 2, 31, 23, 59, 59, 999).getTime();
const meta = (extra: Partial<MetaAhorro> = {}): MetaAhorro => ({ id: 1, nombre: "Viaje", monto: 150_000, limiteMs: MARZO, creadaMs: AHORA - 40 * DIA, estado: "activa", ...extra });
const aporte = (monto: number, haceDias: number): AporteAhorro => ({ id: 1, metaId: 1, monto, ms: AHORA - haceDias * DIA });

describe("metas de ahorro en la isla (textos)", () => {
  it("una meta con fecha: avance, cuota y meses", () => {
    const f = filaDeMeta(progresoDeMetaAhorro(meta(), [aporte(30_000, 10)], AHORA), AHORA);
    assert.equal(f.nombre, "Viaje");
    assert.equal(f.montos, "$30.000 de $150.000");
    assert.equal(f.porcentaje, 20);
    assert.equal(f.detalle, "$20.000 al mes · 6 meses (hasta marzo de 2027)");
    assert.equal(f.cumplida, false);
  });

  it("sin fecha, vencida y cumplida", () => {
    assert.equal(filaDeMeta(progresoDeMetaAhorro(meta({ limiteMs: null }), [aporte(30_000, 10)], AHORA), AHORA).detalle, "te faltan $120.000 · sin fecha límite");
    assert.match(filaDeMeta(progresoDeMetaAhorro(meta({ limiteMs: AHORA - DIA }), [], AHORA), AHORA).detalle, /ya pasó · te faltan \$150\.000/);
    const lista = filaDeMeta(progresoDeMetaAhorro(meta(), [aporte(150_000, 2)], AHORA), AHORA);
    assert.equal(lista.detalle, "¡Meta cumplida! 🎉");
    assert.equal(lista.color, "verde");
  });

  it("el ritmo lento dice cuándo llegarías, sin reproches; el rápido, nada", () => {
    const lento = filaDeMeta(progresoDeMetaAhorro(meta(), [aporte(10_000, 20)], AHORA), AHORA);
    assert.equal(lento.color, "rojo");
    assert.match(lento.ritmo!, /^A tu ritmo llegarías en /);
    assert.ok(!/(atras|tarde|mal|falla)/i.test(`${lento.detalle} ${lento.ritmo}`));
    const bien = filaDeMeta(progresoDeMetaAhorro(meta(), [aporte(60_000, 20)], AHORA), AHORA);
    assert.equal(bien.color, "verde");
    assert.equal(bien.ritmo, null);
  });

  it("la barra: vacía sin aportes, con un mínimo visible si hay algo", () => {
    assert.equal(filaDeMeta(progresoDeMetaAhorro(meta(), [], AHORA), AHORA).fraccion, 0);
    assert.equal(filaDeMeta(progresoDeMetaAhorro(meta(), [aporte(1000, 1)], AHORA), AHORA).fraccion, 0.03);
  });

  it("la frase de «+ Aporte» deja el cursor después del verbo", () => {
    const f = frasePorAporte("Viaje a la Playa");
    assert.equal(f.texto, "aparté  para viaje a la playa");
    assert.equal(f.texto.slice(0, f.cursor), "aparté ");
  });

  it("el resumen sin metas no inventa holgura ni sugerencia", () => {
    const r = resumirAhorro([], [], AHORA, { holgura: 10_000, hormiga: { nombre: "café", suma: 20_000 } });
    assert.equal(r.metas.length, 0);
    assert.equal(r.lineaHolgura, null);
    assert.equal(r.sugerencia, null);
  });

  it("lo guardado: la línea de cada meta y el aviso de borrado", () => {
    assert.equal(lineaDeMetaGuardada(meta(), [aporte(30_000, 3), aporte(10_000, 2)]), "$40.000 de $150.000 · 2 anotaciones");
    assert.equal(lineaDeMetaGuardada(meta({ estado: "archivada" }), [aporte(30_000, 3)]), "$30.000 de $150.000 · 1 anotación · archivada");
    assert.equal(lineaDeMetaGuardada(meta({ estado: "cumplida" }), [aporte(150_000, 3)]), "$150.000 de $150.000 · 1 anotación · cumplida");
    assert.equal(avisoAhorroBorrado(1), "Borré 1 meta de ahorro con sus aportes.");
    assert.equal(avisoAhorroBorrado(3), "Borré 3 metas de ahorro con sus aportes.");
  });
});
