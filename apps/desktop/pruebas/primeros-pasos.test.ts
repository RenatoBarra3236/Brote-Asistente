import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activasDePreset } from "../src/agente/funciones.ts";
import {
  CLAVE_PRIMEROS_PASOS,
  DIAS_DE_PRIMEROS_PASOS,
  PASOS,
  SUGERENCIAS,
  descartarSugerencia,
  iniciarPrimerosPasos,
  leerPrimerosPasos,
  marcarPorIntencion,
  ocultarPrimerosPasos,
  sugerenciaDelDia,
  textoCampoSinConexion,
  vistaPrimerosPasos,
} from "../src/agente/primeros-pasos.ts";
import { PLANTILLAS_BASE } from "../../../packages/motor/src/plantillas.ts";

const DIA = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 6, 15, 0, 0);

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (c: string) => datos.get(c) ?? null,
    setItem: (c: string, v: string) => void datos.set(c, v),
  };
}

describe("Primeros pasos", () => {
  it("quien ya usaba Brote (sin lo guardado por el asistente) no ve la tarjeta", () => {
    const a = almacen();
    assert.equal(leerPrimerosPasos(a), null);
    assert.equal(vistaPrimerosPasos(leerPrimerosPasos(a), activasDePreset("inicio"), T0), null);
    assert.equal(marcarPorIntencion(a, "registrar-gasto"), false);
    assert.equal(a.getItem(CLAVE_PRIMEROS_PASOS), null);
  });

  it("un dato roto o un almacén que falla equivale a no tener nada", () => {
    assert.equal(leerPrimerosPasos(almacen({ [CLAVE_PRIMEROS_PASOS]: "{no es json" })), null);
    assert.equal(leerPrimerosPasos(almacen({ [CLAVE_PRIMEROS_PASOS]: JSON.stringify({ desde: "ayer" }) })), null);
    const roto = { getItem: () => { throw new Error("sin almacén"); }, setItem: () => { throw new Error("sin almacén"); } };
    assert.equal(leerPrimerosPasos(roto), null);
    assert.doesNotThrow(() => iniciarPrimerosPasos(roto, T0));
  });

  it("los pasos son los de las funciones prendidas y se tachan solos con la intención que los hace", () => {
    const a = almacen();
    iniciarPrimerosPasos(a, T0);
    const activas = activasDePreset("inicio");
    assert.deepEqual(vistaPrimerosPasos(leerPrimerosPasos(a), activas, T0)!.pasos.map((p) => [p.id, p.hecho]), [["gasto", false], ["pomodoro", false], ["ramo", false], ["memoria", false]]);
    assert.equal(marcarPorIntencion(a, "registrar-gasto"), true);
    // Otra vez lo mismo no cambia nada, y una intención que no es de ningún paso tampoco.
    assert.equal(marcarPorIntencion(a, "registrar-gasto"), false);
    assert.equal(marcarPorIntencion(a, "otra-cosa"), false);
    const vista = vistaPrimerosPasos(leerPrimerosPasos(a), activas, T0)!;
    assert.equal(vista.pasos.find((p) => p.id === "gasto")!.hecho, true);
    // Sin la función de estudio no hay paso del ramo.
    const sinEstudio = vistaPrimerosPasos(leerPrimerosPasos(a), { ...activas, estudio: false }, T0)!;
    assert.deepEqual(sinEstudio.pasos.map((p) => p.id), ["gasto", "pomodoro", "memoria"]);
  });

  it("al completar los pasos queda solo la sugerencia del día; sin sugerencias, no hay tarjeta", () => {
    const a = almacen();
    iniciarPrimerosPasos(a, T0);
    for (const intencion of ["registrar-gasto", "pomodoro", "ramos-agregar", "ver-memoria"]) marcarPorIntencion(a, intencion);
    const vista = vistaPrimerosPasos(leerPrimerosPasos(a), activasDePreset("inicio"), T0)!;
    assert.deepEqual(vista.pasos, []);
    assert.ok(vista.sugerencia);
    // Con todo descartado o hecho no queda nada que mostrar.
    for (const s of SUGERENCIAS) descartarSugerencia(a, s.id);
    assert.equal(vistaPrimerosPasos(leerPrimerosPasos(a), activasDePreset("inicio"), T0), null);
  });

  it("«Ocultar» la esconde para siempre y a los 7 días se apaga sola", () => {
    const a = almacen();
    iniciarPrimerosPasos(a, T0);
    const activas = activasDePreset("inicio");
    assert.ok(vistaPrimerosPasos(leerPrimerosPasos(a), activas, T0 + (DIAS_DE_PRIMEROS_PASOS - 1) * DIA));
    assert.equal(vistaPrimerosPasos(leerPrimerosPasos(a), activas, T0 + DIAS_DE_PRIMEROS_PASOS * DIA), null);
    ocultarPrimerosPasos(a);
    assert.equal(vistaPrimerosPasos(leerPrimerosPasos(a), activas, T0), null);
  });

  it("la sugerencia rota por día, solo usa funciones prendidas y no repite lo hecho ni lo descartado", () => {
    const a = almacen();
    iniciarPrimerosPasos(a, T0);
    const estado = leerPrimerosPasos(a)!;
    const activas = activasDePreset("inicio");
    const hoy = sugerenciaDelDia(estado, activas, T0)!;
    // Misma durante todo el día.
    assert.equal(sugerenciaDelDia(estado, activas, T0 + 5 * 60 * 60 * 1000)!.id, hoy.id);
    const vistas = new Set([0, 1, 2, 3].map((d) => sugerenciaDelDia(estado, activas, T0 + d * DIA)!.id));
    assert.ok(vistas.size > 1);
    // Con «Para empezar» no se sugiere nada de calendario, aula, música ni descargas.
    for (let d = 0; d < 7; d++) {
      const s = sugerenciaDelDia(estado, activas, T0 + d * DIA)!;
      assert.ok(s.funcion === null || activas[s.funcion], s.id);
      assert.notEqual(s.id, "agenda");
    }
    // Lo de las notas solo se sugiere después de agregar un ramo.
    assert.ok(!SUGERENCIAS.filter((s) => s.id === "notas").some((s) => sugerenciaDelDia(estado, { ...activas }, T0 + DIA * 9) === s));
    descartarSugerencia(a, hoy.id);
    assert.notEqual(sugerenciaDelDia(leerPrimerosPasos(a)!, activas, T0)?.id, hoy.id);
    marcarPorIntencion(a, "resumen-dia");
    assert.ok(leerPrimerosPasos(a)!.hechos.includes("resumen"));
  });

  it("cada intención de un paso o sugerencia existe de verdad en el motor", () => {
    const intenciones = [...new Set(PLANTILLAS_BASE.map((p) => p.intencion))];
    for (const s of [...PASOS, ...SUGERENCIAS]) {
      assert.ok(intenciones.some((i) => s.intencion.test(i)), `${s.id}: ninguna intención del motor calza`);
    }
  });

  it("las frases de los pasos las resuelve el motor sin IA, con la intención esperada", async () => {
    const { Motor } = await import("../../../packages/motor/src/motor.ts");
    const { Gastos } = await import("../../../packages/motor/src/gastos.ts");
    const { Temporizadores } = await import("../../../packages/motor/src/temporizadores.ts");
    const { Ramos } = await import("../../../packages/motor/src/ramos.ts");
    const gastos = new Gastos(":memory:");
    const motor = new Motor(gastos, { reloj: () => new Date(2026, 9, 6, 13, 0), ramos: new Ramos(gastos), temporizadores: new Temporizadores(gastos) });
    for (const p of PASOS) {
      const resuelto = motor.resolver(p.frase);
      assert.ok(resuelto, `${p.id}: «${p.frase}» no la resuelve el motor`);
      assert.ok(p.intencion.test(resuelto!.intencion), `${p.id}: dio ${resuelto!.intencion}`);
    }
  });

  it("el texto del campo sin conexión distingue empezar sin IA de una falla", () => {
    assert.match(textoCampoSinConexion(true), /Sin IA/);
    assert.match(textoCampoSinConexion(false), /OpenClaw/);
  });
});
