// Documentos (D), de punta a punta con el puente de verdad (sin OpenClaw) y carpetas temporales: agregar por
// pedido, solo el texto queda guardado, asignar ramo, «Todo lo de un ramo», propuestas de repaso con el
// nombre del documento, borrar, lo que se rechaza y que ni la ruta ni el nombre lleguen a los registros.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Gastos, Ramos, Repaso } from "@asistente/motor";
import { armarDocx } from "../../motor/pruebas/ayuda-documentos.ts";

const PUENTE = fileURLToPath(new URL("../src/puente.ts", import.meta.url));

function esperarHasta<T>(condicion: () => T | undefined | null | false, ms = 8000): Promise<T> {
  return new Promise((listo, fallo) => {
    const limite = Date.now() + ms;
    const revisar = () => {
      const valor = condicion();
      if (valor) return listo(valor);
      if (Date.now() > limite) return fallo(new Error("se acabó el tiempo"));
      setTimeout(revisar, 50);
    };
    revisar();
  });
}

describe("documentos en el puente", { skip: process.platform === "win32" }, () => {
  it("agrega, asigna, lista en «todo lo de un ramo», nombra las propuestas de repaso y borra", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "documentos-puente-"));
    const funciones = join(raiz, "funciones.json");
    writeFileSync(funciones, JSON.stringify({ activas: { estudio: true, calendario: false, aula: false, grabaciones: false } }));
    mkdirSync(join(raiz, "transcripciones"), { recursive: true, mode: 0o700 });
    const carpetaDocumentos = join(raiz, "documentos");
    const { OPENCLAW_PROFILE: _p, ...resto } = process.env;
    const puente: ChildProcess = spawn(process.execPath, [PUENTE], {
      env: {
        ...resto,
        HOME: raiz,
        OPENCLAW_STATE_DIR: join(raiz, "sin-openclaw"),
        ASISTENTE_FUNCIONES: funciones,
        ASISTENTE_EQUIPO: join(raiz, "equipo.json"),
        ASISTENTE_PLAN: join(raiz, "plan.json"),
        ASISTENTE_PLAN_APP: join(raiz, "no-existe.json"),
        ASISTENTE_DESCARGAS: join(raiz, "descargas"),
        ASISTENTE_TRANSCRIPCIONES: join(raiz, "transcripciones"),
        ASISTENTE_GRABACIONES: join(raiz, "grabaciones"),
        ASISTENTE_GRABACIONES_AJUSTES: join(raiz, "grabaciones.json"),
        ASISTENTE_DOCUMENTOS: carpetaDocumentos,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const avisos: any[] = [];
    let registros = "";
    puente.stderr!.on("data", (d) => (registros += String(d)));
    createInterface({ input: puente.stdout! }).on("line", (linea) => {
      try {
        avisos.push(JSON.parse(linea));
      } catch {
        // no es JSON
      }
    });
    let id = 0;
    const pedir = async (pedido: object): Promise<any> => {
      const mio = String(++id);
      puente.stdin!.write(`${JSON.stringify({ id: mio, ...pedido })}\n`);
      return esperarHasta(() => avisos.find((a) => a.tipo === "respuesta" && a.id === mio));
    };
    try {
      await esperarHasta(() => avisos.find((a) => a.tipo === "ramos"));
      const calculo = (await pedir({ tipo: "ramo-crear", nombre: "Cálculo" })).datos;
      const original = join(raiz, "Apuntes secretos de la tesis.docx");
      writeFileSync(original, armarDocx(["Derivadas", "Regla de la cadena", "Integrales por partes"]));
      const antes = readFileSync(original);

      // Agregar: solo queda el texto; el archivo original no se toca; el aviso trae lo mismo que el estado.
      const r = await pedir({ tipo: "documento-agregar", ruta: original, ramo: calculo.id });
      assert.equal(r.ok, true, JSON.stringify(r));
      const doc = r.datos.documento;
      assert.match(doc.id, /^doc-\d{4}-\d{2}-\d{2}-\d{6}$/);
      assert.deepEqual([doc.nombre, doc.tipo, doc.ramoId], ["Apuntes secretos de la tesis.docx", "docx", calculo.id]);
      assert.deepEqual(readFileSync(original), antes);
      assert.deepEqual(readdirSync(carpetaDocumentos), [`${doc.id}.md`]);
      assert.equal(readFileSync(join(carpetaDocumentos, `${doc.id}.md`), "utf8").includes(raiz), false, "no guarda la ruta del usuario");
      const aviso = await esperarHasta(() => avisos.find((a) => a.tipo === "documentos" && a.documentos.length === 1));
      assert.equal(aviso.documentos[0].id, doc.id);
      assert.deepEqual((await pedir({ tipo: "documentos-estado" })).datos.map((d: any) => d.id), [doc.id]);

      // «Todo lo de un ramo» lo muestra como documento, con su nombre.
      const todo = (await pedir({ tipo: "ramo-todo", ramo: calculo.id })).datos;
      assert.deepEqual(todo.items.map((i: any) => [i.tipo, i.titulo, i.ref]), [["documento", "Apuntes secretos de la tesis.docx", doc.id]]);

      // Una propuesta de repaso que sale del documento lleva su nombre; sin documento, no.
      const otro = new Gastos(join(raiz, ".asistente-prototipo", "asistente.db"));
      const propuesta = new Repaso(otro, new Ramos(otro)).proponer(doc.id, { glosario: [{ termino: "Derivada", definicion: "Tasa de cambio instantánea" }] }, calculo.id, Date.now());
      otro.cerrar();
      assert.equal(propuesta.ok, true);
      const repaso = (await pedir({ tipo: "repaso-estado" })).datos;
      assert.equal(repaso.propuestas.length, 1);
      assert.equal(repaso.propuestas[0].documento, "Apuntes secretos de la tesis.docx");

      // Cambiar de ramo y dejarlo sin ramo.
      assert.equal((await pedir({ tipo: "documento-ramo", documento: doc.id, ramo: null })).ok, true);
      assert.equal((await pedir({ tipo: "documentos-estado" })).datos[0].ramoId, null);
      assert.equal((await pedir({ tipo: "documento-ramo", documento: doc.id, ramo: 999 })).ok, false);
      assert.equal((await pedir({ tipo: "documento-ramo", documento: "doc-2026-01-01-000000", ramo: null })).ok, false);

      // Lo que se rechaza, con su motivo y sin dejar nada.
      const falla = async (pedido: object) => {
        const x = await pedir(pedido);
        assert.equal(x.ok, false);
        return String(x.error);
      };
      assert.match(await falla({ tipo: "documento-agregar", ruta: join(raiz, "virus.exe") }), /Brote lee PDF, Word/);
      assert.match(await falla({ tipo: "documento-agregar", ruta: join(raiz, "no-existe.pdf") }), /No encontré ese archivo/);
      assert.equal((await pedir({ tipo: "documento-agregar", ruta: "relativa/a.pdf" })).ok, false);
      assert.equal((await pedir({ tipo: "documento-agregar", ruta: 5 })).ok, false);
      assert.match(await falla({ tipo: "documento-agregar", ruta: original, ramo: 999 }), /ramo no existe/);
      assert.equal(readdirSync(carpetaDocumentos).length, 1);

      // Borrar: se va el documento y su propuesta pendiente; las tarjetas ya aceptadas serían del usuario.
      assert.equal((await pedir({ tipo: "documento-borrar", que: "documento", documento: "../../x" })).datos.borrados, 0);
      assert.equal((await pedir({ tipo: "documento-borrar", que: "documento", documento: doc.id })).datos.borrados, 1);
      assert.equal(existsSync(join(carpetaDocumentos, `${doc.id}.md`)) && readdirSync(carpetaDocumentos).length > 0, false);
      assert.deepEqual((await pedir({ tipo: "documentos-estado" })).datos, []);
      assert.equal((await pedir({ tipo: "repaso-estado" })).datos.propuestas.length, 0);
      assert.equal((await pedir({ tipo: "documento-borrar", que: "otra-cosa" })).ok, false);

      // Ni la ruta ni el nombre del archivo en los registros.
      assert.equal(registros.includes("secretos"), false);
      const lineasDeDocumentos = registros.split("\n").filter((l) => l.startsWith("[puente] documento"));
      assert.ok(lineasDeDocumentos.length >= 2, "se registra que pasó algo");
      assert.deepEqual(lineasDeDocumentos.filter((l) => l.includes(raiz) || l.includes(".docx") || l.includes("Apuntes")), []);
    } finally {
      puente.stdin!.end();
      await new Promise((listo) => puente.once("exit", listo));
    }
  });

  it("con Estudio apagado no se puede agregar, pero lo guardado se ve", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "documentos-puente-"));
    const funciones = join(raiz, "funciones.json");
    writeFileSync(funciones, JSON.stringify({ activas: { estudio: false } }));
    const { OPENCLAW_PROFILE: _p, ...resto } = process.env;
    const puente: ChildProcess = spawn(process.execPath, [PUENTE], {
      env: { ...resto, HOME: raiz, OPENCLAW_STATE_DIR: join(raiz, "sin-openclaw"), ASISTENTE_FUNCIONES: funciones, ASISTENTE_EQUIPO: join(raiz, "equipo.json"), ASISTENTE_PLAN: join(raiz, "plan.json"), ASISTENTE_PLAN_APP: join(raiz, "no-existe.json"), ASISTENTE_DESCARGAS: join(raiz, "descargas"), ASISTENTE_DOCUMENTOS: join(raiz, "documentos") },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const avisos: any[] = [];
    createInterface({ input: puente.stdout! }).on("line", (linea) => {
      try {
        avisos.push(JSON.parse(linea));
      } catch {
        // no es JSON
      }
    });
    try {
      const original = join(raiz, "a.txt");
      writeFileSync(original, "hola");
      puente.stdin!.write(`${JSON.stringify({ id: "a", tipo: "documento-agregar", ruta: original })}\n`);
      assert.equal((await esperarHasta(() => avisos.find((a) => a.tipo === "respuesta" && a.id === "a"))).ok, false);
      puente.stdin!.write(`${JSON.stringify({ id: "b", tipo: "documentos-estado" })}\n`);
      assert.deepEqual((await esperarHasta(() => avisos.find((a) => a.tipo === "respuesta" && a.id === "b"))).datos, []);
    } finally {
      puente.stdin!.end();
      await new Promise((listo) => puente.once("exit", listo));
    }
  });
});
