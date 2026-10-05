import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Gastos } from "../src/gastos.ts";
import { Ramos } from "../src/ramos.ts";
import { COLORES_RAMO, colorSiguiente, contienePalabras, emparejarRamo, normalizarRamo, validarRamo } from "../src/ramos-tipos.ts";
import type { Ramo } from "../src/ramos-tipos.ts";

const AHORA = Date.UTC(2026, 9, 5, 12);
const nuevo = () => new Ramos(new Gastos(":memory:"));
const ramo = (id: number, nombre: string, alias: string[] = [], archivado = false): Ramo => ({ id, nombre, color: "azul", alias, archivado });

describe("reglas de los ramos", () => {
  test("normaliza tildes, mayúsculas y signos", () => {
    assert.equal(normalizarRamo("  Cálculo   II! "), "calculo ii");
  });

  test("las palabras clave calzan por palabra completa", () => {
    assert.ok(contienePalabras("Clase de Cálculo II (sala 4)", "calculo ii"));
    assert.ok(!contienePalabras("Calculadora científica", "calculo"));
    assert.ok(!contienePalabras("cualquier cosa", ""));
  });

  test("valida nombre, color y alias", () => {
    assert.equal(validarRamo({ nombre: "a" }).ok, false);
    assert.equal(validarRamo({ nombre: "Física", color: "fucsia" }).ok, false);
    assert.equal(validarRamo({ nombre: "Física", alias: "fis" }).ok, false);
    assert.equal(validarRamo({ nombre: "Física", alias: ["a", "b", "c", "d", "e", "f", "g"].map((x) => x + x) }).ok, false);
    const v = validarRamo({ nombre: "  Física\n General ", alias: ["FIS", "fis", "física general", "Fis 101"], color: "verde" });
    assert.ok(v.ok);
    assert.equal(v.nombre, "Física General");
    assert.deepEqual(v.alias, ["FIS", "Fis 101"], "sin repetidos ni el mismo nombre");
    assert.equal(v.color, "verde");
  });

  test("empareja con la palabra clave más larga y no inventa en empates", () => {
    const ramos = [ramo(1, "Cálculo", ["calc"]), ramo(2, "Cálculo Avanzado", ["calc av"]), ramo(3, "Física")];
    assert.equal(emparejarRamo("Clase Cálculo Avanzado", ramos)?.id, 2);
    assert.equal(emparejarRamo("CALC martes", ramos)?.id, 1);
    assert.equal(emparejarRamo("Almuerzo", ramos), null);
    assert.equal(emparejarRamo("Física", [ramo(1, "Física"), ramo(2, "Otra", ["física"])]), null, "empate");
    assert.equal(emparejarRamo("Física", [ramo(1, "Física", [], true)]), null, "archivados no cuentan");
  });

  test("reparte los colores sin repetir hasta agotar la paleta", () => {
    const ramos: Ramo[] = [];
    for (let i = 0; i < COLORES_RAMO.length; i++) ramos.push({ ...ramo(i, `R${i}`), color: colorSiguiente(ramos) });
    assert.equal(new Set(ramos.map((r) => r.color)).size, COLORES_RAMO.length);
  });
});

describe("Ramos (tabla)", () => {
  test("crea, lista y no deja repetir sin importar tildes", () => {
    const r = nuevo();
    const a = r.crear({ nombre: "Cálculo", alias: ["calc"] }, AHORA);
    assert.ok(a.ok);
    assert.deepEqual(r.listar().map((x) => x.nombre), ["Cálculo"]);
    const b = r.crear({ nombre: "CALCULO" }, AHORA);
    assert.equal(b.ok, false);
    assert.match((b as { motivo: string }).motivo, /Ya tienes/);
  });

  test("cada ramo nuevo toma un color distinto", () => {
    const r = nuevo();
    const colores = ["Uno", "Dos", "Tres"].map((n) => (r.crear({ nombre: n }, AHORA) as { ramo: Ramo }).ramo.color);
    assert.equal(new Set(colores).size, 3);
  });

  test("archivar no borra y crear de nuevo lo reactiva", () => {
    const r = nuevo();
    const { ramo: a } = r.crear({ nombre: "Química", color: "rojo" }, AHORA) as { ramo: Ramo };
    assert.ok(r.archivar(a.id));
    assert.equal(r.listar().length, 0);
    assert.equal(r.listar(true).length, 1);
    const otra = r.crear({ nombre: "química" }, AHORA) as { ok: true; ramo: Ramo };
    assert.ok(otra.ok);
    assert.equal(otra.ramo.id, a.id);
    assert.equal(otra.ramo.archivado, false);
    assert.equal(otra.ramo.color, "rojo", "conserva su color");
  });

  test("edita y no deja chocar con otro ramo", () => {
    const r = nuevo();
    const { ramo: a } = r.crear({ nombre: "Álgebra" }, AHORA) as { ramo: Ramo };
    r.crear({ nombre: "Historia" }, AHORA);
    const e = r.editar(a.id, { alias: ["alg"], color: "rosa" });
    assert.ok(e.ok);
    assert.deepEqual(r.obtener(a.id)?.alias, ["alg"]);
    assert.equal(r.editar(a.id, { nombre: "historia" }).ok, false);
    assert.equal(r.editar(999, { nombre: "X Y" }).ok, false);
  });

  test("borra definitivamente y respeta el tope", () => {
    const r = nuevo();
    const { ramo: a } = r.crear({ nombre: "Ética" }, AHORA) as { ramo: Ramo };
    assert.ok(r.borrar(a.id));
    assert.equal(r.obtener(a.id), null);
    assert.equal(r.borrar(a.id), false);
    for (let i = 0; i < 40; i++) assert.ok(r.crear({ nombre: `Ramo ${i}` }, AHORA).ok);
    assert.equal(r.crear({ nombre: "Uno más" }, AHORA).ok, false);
  });

  test("alias dañados en la base no rompen el listado", () => {
    const g = new Gastos(":memory:");
    const r = new Ramos(g);
    r.crear({ nombre: "Arte" }, AHORA);
    g.baseDeDatos().exec("update ramos set alias = 'no es json'");
    assert.deepEqual(r.listar()[0].alias, []);
  });
});

describe("enlaces de un ramo", () => {
  test("asigna, cambia y quita el ramo de una tarea", () => {
    const r = nuevo();
    const { ramo: a } = r.crear({ nombre: "Cálculo" }, AHORA) as { ramo: Ramo };
    const { ramo: b } = r.crear({ nombre: "Física" }, AHORA) as { ramo: Ramo };
    assert.equal(r.ramoDe("tarea", 7), null);
    assert.ok(r.asignar("tarea", 7, a.id));
    assert.equal(r.ramoDe("tarea", 7), a.id);
    assert.ok(r.asignar("tarea", 7, b.id));
    assert.equal(r.ramoDe("tarea", "7"), b.id);
    assert.ok(r.asignar("tarea", 7, null));
    assert.equal(r.ramoDe("tarea", 7), null);
  });

  test("no asigna a un ramo que no existe ni un tipo raro", () => {
    const r = nuevo();
    assert.equal(r.asignar("tarea", 1, 99), false);
    assert.equal(r.asignar("cosa" as never, 1, null), false);
  });

  test("borrar el ramo deja lo suyo «sin ramo»; archivarlo no", () => {
    const r = nuevo();
    const { ramo: a } = r.crear({ nombre: "Historia" }, AHORA) as { ramo: Ramo };
    r.asignar("grabacion", "2026-10-05-080000", a.id);
    r.asignar("pomodoro", 3, a.id);
    r.archivar(a.id);
    assert.equal(r.ramoDe("grabacion", "2026-10-05-080000"), a.id);
    r.borrar(a.id);
    assert.equal(r.ramoDe("grabacion", "2026-10-05-080000"), null);
    assert.equal(r.enlaces("pomodoro").size, 0);
  });

  test("enlaces lista un tipo y la marca cambia con cada cambio", () => {
    const r = nuevo();
    const m0 = r.marca();
    const { ramo: a } = r.crear({ nombre: "Química" }, AHORA) as { ramo: Ramo };
    const m1 = r.marca();
    r.asignar("tarea", 1, a.id);
    const m2 = r.marca();
    r.editar(a.id, { alias: ["quim"] });
    const m3 = r.marca();
    assert.equal(new Set([m0, m1, m2, m3]).size, 4);
    assert.deepEqual([...r.enlaces("tarea")], [["1", a.id]]);
    assert.equal(r.enlaces("propuesta").size, 0);
  });
});
