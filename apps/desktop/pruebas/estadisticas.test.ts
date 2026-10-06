import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alturasBarras,
  barrasPorRamo,
  columnasDias,
  columnasSemanas,
  etiquetaDia,
  etiquetaSemana,
  lineaDeRamo,
  lineaMini,
  promedioSemanal,
  segmentosApilados,
  serieDeRamo,
  textoDeMeta,
  textoDesde,
  textoDiferencia,
  textoPromedio,
  textoRachaCorto,
  textoSerie,
  tituloDeSemanaEstudio,
} from "../src/agente/estadisticas.ts";
import { resumirEstudio, semanasDeEstudio, type RegistroEstudio } from "../../../packages/motor/src/estadisticas-tipos.ts";

describe("las estadísticas de estudio en la isla", () => {
  it("la diferencia con la semana pasada, a la misma altura", () => {
    assert.equal(textoDiferencia(380, 310), "+1 h 10 min que la semana pasada");
    assert.equal(textoDiferencia(200, 220), "−20 min que la semana pasada");
    assert.equal(textoDiferencia(120, 120), "igual que la semana pasada");
    assert.equal(textoDiferencia(120, 0), null);
  });

  it("la racha solo se muestra si existe", () => {
    assert.equal(textoRachaCorto(0), null);
    assert.equal(textoRachaCorto(1), "🔥 1 día");
    assert.equal(textoRachaCorto(4), "🔥 4 días");
  });

  it("las barras: la mayor llena la caja y lo poco no desaparece", () => {
    assert.deepEqual(alturasBarras([60, 0, 120, 0, 0, 0, 0]), [50, 0, 100, 0, 0, 0, 0]);
    assert.deepEqual(alturasBarras([1, 1000, 0, 0, 0, 0, 0]), [6, 100, 0, 0, 0, 0, 0]);
    assert.deepEqual(alturasBarras([0, 0, 0, 0, 0, 0, 0]), [0, 0, 0, 0, 0, 0, 0]);
    assert.equal(etiquetaDia(2, 90), "miércoles: 1 h 30 min");
    assert.equal(etiquetaDia(0, 0), "lunes: nada");
  });

  it("las barras por ramo agrupan lo que pasa del tope en «Otros»", () => {
    const porRamo = [1, 2, 3, 4, 5, 6, 7].map((id, i) => ({ ramoId: id as number | null, min: 70 - i * 10, fraccion: (70 - i * 10) / 280 }));
    const barras = barrasPorRamo(porRamo, (id) => `R${id}`);
    assert.equal(barras.length, 6);
    assert.equal(barras.at(-1)!.etiqueta, "Otros");
    assert.equal(barras.at(-1)!.min, 20 + 10); // 7.º y 6.º: 20 y 10... con mínimos 70-50=20 y 70-60=10
    assert.equal(barrasPorRamo(porRamo.slice(0, 3), (id) => `R${id}`).length, 3);
  });

  it("la línea de la ficha del ramo y desde cuándo hay datos", () => {
    assert.equal(lineaDeRamo(undefined), null);
    assert.equal(lineaDeRamo({ ramoId: 1, semanaMin: 0, totalMin: 0 }), null);
    assert.equal(lineaDeRamo({ ramoId: 1, semanaMin: 130, totalMin: 840 }), "Esta semana: 2 h 10 min · en total: 14 h");
    assert.equal(lineaDeRamo({ ramoId: 1, semanaMin: 0, totalMin: 60 }), "Esta semana: nada · en total: 1 h");
    assert.equal(textoDesde(new Date(2026, 9, 5).getTime()), "Contando desde el 5 oct");
    assert.equal(textoDesde(null), null);
  });
});

describe("las 8 semanas en la isla", () => {
  const MIN = 60_000;
  // Miércoles 7 de octubre de 2026, 14:00: la semana actual parte el lunes 5.
  const AHORA = new Date(2026, 9, 7, 14).getTime();
  const en = (dias: number, h: number) => new Date(2026, 9, 7 + dias, h).getTime();
  let n = 1;
  const reg = (ini: number, min: number, ramoId: number | null): RegistroEstudio => ({ id: n++, inicioMs: ini, finMs: ini + min * MIN, ramoId, fuente: "manual" });
  const nombre = (id: number | null) => (id === null ? "Sin ramo" : id === 1 ? "Cálculo" : "Física");
  const registros = [reg(en(0, 9), 120, 1), reg(en(0, 12), 60, 2), reg(en(-8, 9), 240, 1), reg(en(-15, 9), 60, 2)];
  const semanas = semanasDeEstudio(registros, AHORA);

  it("la semana más estudiada llena la caja y las demás son proporcionales", () => {
    const c = columnasSemanas(semanas, nombre);
    assert.equal(c.length, 8);
    assert.equal(c[6].altoPct, 100, "la de 4 h es la mayor");
    assert.equal(c[7].altoPct, Math.round((180 / 240) * 100));
    assert.equal(c[5].altoPct, 25);
    assert.equal(c[0].altoPct, 0, "una semana sin estudio queda vacía");
    assert.equal(c[7].actual, true);
  });

  it("los segmentos de cada columna suman 100 % y siguen el orden de los ramos", () => {
    const c = columnasSemanas(semanas, nombre);
    assert.deepEqual(c[7].segmentos.map((s) => s.ramoId), [1, 2]);
    assert.ok(Math.abs(c[7].segmentos.reduce((t, s) => t + s.pct, 0) - 100) < 1e-9);
    assert.ok(Math.abs(c[7].segmentos[0].pct - (120 / 180) * 100) < 1e-6);
    // Un ramo diminuto igual se ve: nunca menos de ~4 %.
    const chico = semanasDeEstudio([reg(en(0, 9), 600, 1), reg(en(0, 20), 1, 2)], AHORA);
    assert.ok(columnasSemanas(chico, nombre)[7].segmentos[1].pct >= 3.5);
    assert.ok(columnasSemanas(semanasDeEstudio([], AHORA), nombre).every((x) => x.altoPct === 0 && x.segmentos.length === 0));
  });

  it("titula cada semana con su rango y sus ramos", () => {
    assert.equal(etiquetaSemana(semanas[7].desdeMs), "5/10");
    assert.equal(tituloDeSemanaEstudio(semanas[7], nombre), "5–11 oct (esta semana, va a medias): 3 h · Cálculo 2 h, Física 1 h");
    assert.equal(tituloDeSemanaEstudio(semanas[0], nombre), "17–23 ago: nada");
    const cruce = semanasDeEstudio([reg(new Date(2026, 8, 30, 10).getTime(), 30, 1)], AHORA)[6];
    assert.match(tituloDeSemanaEstudio(cruce, nombre), /^28 sep – 4 oct: 30 min · Cálculo 30 min$/);
  });

  it("el promedio solo cuenta semanas completas desde que hay datos", () => {
    const desde = Math.min(...registros.map((r) => r.inicioMs));
    const p = promedioSemanal(semanas, desde);
    // Hay datos desde la semana del 21 de septiembre: completas desde ahí son 21/9, 28/9 → (60 + 240) ÷ 2.
    assert.deepEqual(p, { minutos: 150, semanas: 2 });
    assert.equal(textoPromedio(p), "Promedio: 2 h 30 min por semana (2 semanas completas)");
    assert.equal(promedioSemanal(semanas, null), null);
    assert.equal(promedioSemanal(semanasDeEstudio([reg(en(0, 9), 60, 1)], AHORA), en(0, 9)), null, "solo la semana actual: nada completo");
    assert.equal(textoPromedio({ minutos: 60, semanas: 1 }), "Promedio: 1 h por semana (1 semana completa)");
  });

  it("la mini-línea de un ramo: la mayor arriba, y nada si no hay datos", () => {
    const serie = serieDeRamo(semanas, 1);
    assert.deepEqual(serie, [0, 0, 0, 0, 0, 0, 240, 120]);
    const l = lineaMini(serie, 80, 20)!;
    assert.equal(l.max, 240);
    assert.equal(l.puntos.split(" ").length, 8);
    assert.equal(l.puntos.split(" ")[6].split(",")[1], "2.0", "el máximo toca el borde de arriba");
    assert.equal(l.puntos.split(" ")[0].split(",")[1], "18.0", "cero queda abajo");
    assert.ok(l.ultimo.x <= 78 && l.ultimo.y >= 2 && l.ultimo.y <= 18);
    assert.equal(lineaMini([0, 0, 0, 0], 80, 20), null);
    assert.equal(lineaMini([5], 80, 20), null);
    assert.match(textoSerie(serie), /^Minutos por semana, de la más vieja a esta: 0 min, .*, 4 h, 2 h$/);
  });
});

describe("las barras de cada día, apiladas por ramo", () => {
  const MIN = 60_000;
  const AHORA = new Date(2026, 9, 7, 14).getTime(); // miércoles; la semana parte el lunes 5
  const en = (dias: number, h: number) => new Date(2026, 9, 7 + dias, h).getTime();
  let n = 1;
  const reg = (ini: number, min: number, ramoId: number | null): RegistroEstudio => ({ id: n++, inicioMs: ini, finMs: ini + min * MIN, ramoId, fuente: "manual" });
  const nombre = (id: number | null) => (id === null ? "Sin ramo" : id === 1 ? "Programación" : "Redes");

  it("la altura sigue al día más estudiado y los colores, a lo que estudiaste de cada ramo", () => {
    const r = resumirEstudio([reg(en(-1, 9), 60, 1), reg(en(-1, 11), 60, 2), reg(en(0, 9), 180, 1), reg(en(0, 15), 60, 2)], AHORA);
    const c = columnasDias(r, nombre);
    assert.equal(c.length, 7);
    assert.equal(c[2].altoPct, 100, "el miércoles (4 h) llena la caja");
    assert.equal(c[1].altoPct, 50, "el martes (2 h) llega a la mitad");
    assert.equal(c[0].altoPct, 0);
    assert.deepEqual(c[2].segmentos.map((s) => s.ramoId), [1, 2]);
    assert.ok(Math.abs(c[2].segmentos[0].pct - 75) < 1e-9, "3 h de 4 h");
    assert.ok(Math.abs(c[1].segmentos[0].pct - 50) < 1e-9, "mitad y mitad");
    assert.deepEqual(c[0].segmentos, []);
  });

  it("el título dice los ramos del día", () => {
    const r = resumirEstudio([reg(en(-1, 9), 60, 1), reg(en(-1, 11), 60, 2)], AHORA);
    assert.equal(columnasDias(r, nombre)[1].titulo, "martes: 2 h · Programación 1 h, Redes 1 h");
    assert.equal(columnasDias(r, nombre)[4].titulo, "viernes: nada");
  });

  it("un puente viejo sin el desglose da barras lisas y sigue funcionando", () => {
    const r = resumirEstudio([reg(en(-1, 9), 60, 1)], AHORA);
    const { porDiaRamo: _quitado, ...viejo } = r;
    const c = columnasDias(viejo, nombre);
    assert.equal(c[1].altoPct, 100);
    assert.deepEqual(c[1].segmentos, []);
  });

  it("un ramo con un rato corto igual se ve, y los trozos suman 100 %", () => {
    const s = segmentosApilados([{ ramoId: 1, min: 600 }, { ramoId: 2, min: 1 }], 601);
    assert.ok(s[1].pct >= 3.5);
    assert.ok(Math.abs(s.reduce((t, x) => t + x.pct, 0) - 100) < 1e-9);
    assert.deepEqual(segmentosApilados([], 0), []);
  });
});

describe("la meta semanal en la isla", () => {
  it("dice cuánto llevas sin reproches, y festeja cuando la cumples", () => {
    assert.deepEqual(textoDeMeta({ metaMin: 600, totalMin: 445, fraccion: 445 / 600, faltaMin: 155, cumplida: false }), { texto: "7 h 25 min de 10 h · meta semanal", cumplida: false, pct: 74 });
    assert.deepEqual(textoDeMeta({ metaMin: 360, totalMin: 445, fraccion: 1, faltaMin: 0, cumplida: true }), { texto: "🎯 ¡Meta cumplida! 7 h 25 min de 6 h", cumplida: true, pct: 100 });
    assert.equal(textoDeMeta({ metaMin: 600, totalMin: 0, fraccion: 0, faltaMin: 600, cumplida: false }).pct, 0);
  });
});
