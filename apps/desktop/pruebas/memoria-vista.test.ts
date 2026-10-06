import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GRUPOS,
  SECCIONES_DE,
  almacenamientoDe,
  almacenamientosDeGrupo,
  buscaEnElPuente,
  coincide,
  grupoDe,
  lineaDeGrupo,
  resumenDeClase,
  textoBuscado,
  totalDeGrupo,
  type Conteos,
  type SeccionId,
} from "../src/agente/memoria-vista.ts";
import { etiquetaAlmacenamiento, explicacionAlmacenamiento } from "../src/agente/papelera.ts";

const VACIO: Conteos = { brote: 0, frases: 0, conversacion: 0, importado: 0, ramos: 0, notas: 0, repaso: 0, planes: 0, estadisticas: null, documentos: 0, ahorro: 0, transcripciones: 0, audios: 0 };

const TODAS: SeccionId[] = ["brote", "frases", "conversacion", "importado", "ramos", "notas", "repaso", "planes", "estadisticas", "documentos", "ahorro", "transcripciones", "audios"];

test("cada sección está en un solo grupo y no falta ninguna", () => {
  const vistas = Object.values(SECCIONES_DE).flat();
  assert.equal(vistas.length, new Set(vistas).size);
  assert.deepEqual([...vistas].sort(), [...TODAS].sort());
  for (const s of TODAS) assert.ok(SECCIONES_DE[grupoDe(s)].includes(s));
  assert.deepEqual(GRUPOS.map((g) => g.id), ["resumen", "brote", "estudio", "plata", "grabaciones"]);
});

test("el borrado va a la Papelera solo en Mac y solo lo que vive en archivos", () => {
  for (const s of ["brote", "conversacion", "importado", "documentos", "transcripciones", "audios"] as SeccionId[]) {
    assert.equal(almacenamientoDe(s, true), "papelera", s);
    assert.equal(almacenamientoDe(s, false), "definitivo", s);
  }
  for (const s of ["frases", "ramos", "notas", "repaso", "planes", "estadisticas", "ahorro"] as SeccionId[]) {
    assert.equal(almacenamientoDe(s, true), "definitivo", s);
  }
  assert.deepEqual(almacenamientosDeGrupo("estudio", true), ["papelera", "definitivo"]);
  assert.deepEqual(almacenamientosDeGrupo("estudio", false), ["definitivo"]);
  assert.deepEqual(almacenamientosDeGrupo("plata", true), ["definitivo"]);
  assert.deepEqual(almacenamientosDeGrupo("grabaciones", true), ["papelera"]);
});

test("las etiquetas y explicaciones distinguen la Papelera del borrado definitivo", () => {
  assert.match(etiquetaAlmacenamiento("papelera"), /Papelera/);
  assert.match(etiquetaAlmacenamiento("definitivo"), /Definitivo/);
  assert.match(explicacionAlmacenamiento("papelera"), /hasta que la vacíes/);
  assert.match(explicacionAlmacenamiento("definitivo"), /para siempre/);
});

test("las cuentas del resumen", () => {
  assert.equal(totalDeGrupo("estudio", VACIO), 0);
  assert.match(lineaDeGrupo("estudio", VACIO), /agrega un ramo/);
  const c = { ...VACIO, ramos: 4, repaso: 17, documentos: 1, estadisticas: "21 h", planes: 1 };
  assert.equal(lineaDeGrupo("estudio", c), "4 ramos · 17 tarjetas · 1 plan · 21 h estudiadas · 1 documento");
  assert.equal(totalDeGrupo("estudio", c), 4 + 17 + 1 + 1 + 1);
  assert.equal(lineaDeGrupo("plata", { ...VACIO, ahorro: 1 }), "1 meta de ahorro");
  assert.equal(lineaDeGrupo("grabaciones", { ...VACIO, transcripciones: 3, audios: 2 }), "3 transcripciones · 2 audios");
  assert.equal(lineaDeGrupo("brote", { ...VACIO, importado: 2 }), "2 de otros proyectos");
  assert.equal(resumenDeClase(17, 6), "17 tarjetas · 6 temas");
  assert.equal(resumenDeClase(1, 0), "1 tarjeta · 0 temas");
});

test("la búsqueda ignora tildes y mayúsculas, y empieza en 2 letras", () => {
  assert.equal(textoBuscado(" Cálculo "), "calculo");
  assert.equal(textoBuscado("c"), "");
  assert.equal(coincide("calculo", "Cálculo II"), true);
  assert.equal(coincide("calculo", "Química", null), false);
  assert.equal(coincide("", "lo que sea"), true);
  assert.equal(buscaEnElPuente("no"), false);
  assert.equal(buscaEnElPuente("not"), true);
});
