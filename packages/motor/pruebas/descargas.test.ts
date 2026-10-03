import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  SeguidorDescargas,
  describirDescargas,
  esTemporal,
  formatearTamano,
  hace,
  listarCarpeta,
  nombreFinal,
  recientes,
  sePuedeAbrir,
  type EntradaCarpeta,
} from "../src/descargas.ts";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";

const CARPETA = "/Users/ana/Downloads";
const archivo = (nombre: string, tamano = 1000, fechaMs = 1000): EntradaCarpeta => ({ nombre, tamano, fechaMs, carpeta: false });
const carpeta = (nombre: string, tamano = 0, fechaMs = 1000): EntradaCarpeta => ({ nombre, tamano, fechaMs, carpeta: true });
const nombres = (r: { listas: { nombre: string }[] }) => r.listas.map((d) => d.nombre);

describe("descargas: nombres", () => {
  it("reconoce los temporales de cada navegador", () => {
    for (const nombre of ["apunte.pdf.crdownload", "apunte.pdf.download", "apunte.pdf.part", "apunte.pdf.opdownload", "Unconfirmed 812.crdownload"]) {
      assert.equal(esTemporal(nombre), true, nombre);
    }
    for (const nombre of ["apunte.pdf", "partes.zip", ".part", "descarga.txt"]) assert.equal(esTemporal(nombre), false, nombre);
    assert.equal(nombreFinal("apunte.pdf.crdownload"), "apunte.pdf");
    assert.equal(nombreFinal("Unconfirmed 812.crdownload"), null);
  });

  it("solo abre documentos; los programas se muestran", () => {
    assert.equal(sePuedeAbrir("Guía 3.PDF"), true);
    assert.equal(sePuedeAbrir("instalador.dmg"), false);
    assert.equal(sePuedeAbrir("setup.exe"), false);
    assert.equal(sePuedeAbrir("script.command"), false);
  });
});

describe("descargas: seguimiento", () => {
  it("la primera revisión no avisa de lo que ya había", () => {
    const s = new SeguidorDescargas();
    assert.deepEqual(s.revisar([archivo("viejo.pdf"), archivo("a medias.zip.crdownload")], CARPETA), {
      enCurso: [{ id: "a medias.zip.crdownload", nombre: "a medias.zip", tamano: 1000 }],
      listas: [],
    });
  });

  it("Chrome: el temporal se renombra al terminar", () => {
    const s = new SeguidorDescargas();
    s.revisar([archivo("viejo.pdf")], CARPETA);
    const bajando = s.revisar([archivo("viejo.pdf"), archivo("apunte.pdf.crdownload", 500)], CARPETA);
    assert.deepEqual(bajando.enCurso, [{ id: "apunte.pdf.crdownload", nombre: "apunte.pdf", tamano: 500 }]);
    const lista = s.revisar([archivo("viejo.pdf"), archivo("apunte.pdf", 2000, 5000)], CARPETA);
    assert.deepEqual(lista, {
      enCurso: [],
      listas: [{ nombre: "apunte.pdf", ruta: join(CARPETA, "apunte.pdf"), tamano: 2000, fechaMs: 5000 }],
    });
  });

  it("Chrome sin nombre todavía («Unconfirmed»): toma el archivo nuevo", () => {
    const s = new SeguidorDescargas();
    s.revisar([], CARPETA);
    assert.equal(s.revisar([archivo("Unconfirmed 812.crdownload")], CARPETA).enCurso[0].nombre, null);
    assert.deepEqual(nombres(s.revisar([archivo("Guía 3.pdf")], CARPETA)), ["Guía 3.pdf"]);
  });

  it("Firefox: el vacío que deja mientras descarga no cuenta hasta que termina", () => {
    const s = new SeguidorDescargas();
    s.revisar([], CARPETA);
    assert.deepEqual(nombres(s.revisar([archivo("libro.epub", 0), archivo("libro.epub.part", 300)], CARPETA)), []);
    assert.deepEqual(nombres(s.revisar([archivo("libro.epub", 0), archivo("libro.epub.part", 900)], CARPETA)), []);
    assert.deepEqual(nombres(s.revisar([archivo("libro.epub", 1200)], CARPETA)), ["libro.epub"]);
    // Y no se repite después.
    assert.deepEqual(nombres(s.revisar([archivo("libro.epub", 1200)], CARPETA)), []);
  });

  it("Safari: la carpeta .download desaparece y queda el archivo", () => {
    const s = new SeguidorDescargas();
    s.revisar([], CARPETA);
    assert.equal(s.revisar([carpeta("foto.png.download", 50)], CARPETA).enCurso[0].nombre, "foto.png");
    assert.deepEqual(nombres(s.revisar([archivo("foto.png")], CARPETA)), ["foto.png"]);
  });

  it("una descarga cancelada no avisa", () => {
    const s = new SeguidorDescargas();
    s.revisar([], CARPETA);
    s.revisar([archivo("grande.iso.crdownload")], CARPETA);
    assert.deepEqual(s.revisar([], CARPETA), { enCurso: [], listas: [] });
  });

  it("un archivo que llega directo avisa cuando su tamaño se queda quieto", () => {
    const s = new SeguidorDescargas();
    s.revisar([], CARPETA);
    assert.deepEqual(nombres(s.revisar([archivo("copia.zip", 100)], CARPETA)), []);
    assert.deepEqual(nombres(s.revisar([archivo("copia.zip", 400)], CARPETA)), []);
    assert.deepEqual(nombres(s.revisar([archivo("copia.zip", 400)], CARPETA)), ["copia.zip"]);
  });

  it("ignora archivos ocultos y del sistema", () => {
    const s = new SeguidorDescargas();
    s.revisar([], CARPETA);
    s.revisar([archivo(".DS_Store"), archivo("desktop.ini")], CARPETA);
    assert.deepEqual(s.revisar([archivo(".DS_Store"), archivo("desktop.ini")], CARPETA), { enCurso: [], listas: [] });
  });
});

describe("descargas: recientes y frases", () => {
  const listado = [archivo("viejo.pdf", 10, 1), archivo("nuevo.dmg", 3 * 1024 ** 2, 9), carpeta("fotos", 0, 20), archivo("a medias.part", 1, 30)];

  it("ordena de la más nueva a la más vieja, sin carpetas ni temporales", () => {
    assert.deepEqual(recientes(listado, CARPETA).map((d) => d.nombre), ["nuevo.dmg", "viejo.pdf"]);
  });

  it("describe tamaños y fechas", () => {
    assert.equal(formatearTamano(830), "830 bytes");
    assert.equal(formatearTamano(2.34 * 1024 ** 2), "2,3 MB");
    assert.equal(formatearTamano(15 * 1024 ** 2), "15 MB");
    assert.equal(hace(30_000), "recién");
    assert.equal(hace(5 * 60_000), "hace 5 min");
    assert.equal(hace(26 * 3_600_000), "ayer");
    assert.equal(
      describirDescargas([{ nombre: "apunte.pdf", ruta: "", tamano: 2048, fechaMs: 0 }], 10 * 60_000),
      "Tus últimas descargas:\n• apunte.pdf (2 KB, hace 10 min)",
    );
  });

  it("«mis descargas» y «abre la última descarga» sin IA", () => {
    const lista = recientes(listado, CARPETA);
    const motor = new Motor(new Gastos(":memory:"), { descargas: () => lista, reloj: () => new Date(60_000) });
    assert.match(motor.resolver("mis descargas")!.texto, /nuevo\.dmg/);
    assert.match(motor.resolver("qué descargué hoy")!.texto, /viejo\.pdf/);
    // Un instalador no se abre solo: se muestra en el explorador de archivos.
    const abrir = motor.resolver("abre la última descarga")!;
    assert.equal(abrir.intencion, "abrir-ultima-descarga");
    assert.deepEqual(abrir.datos, { ruta: join(CARPETA, "nuevo.dmg"), abrir: false });
    const pdf = new Motor(new Gastos(":memory:"), { descargas: () => lista.slice(1) }).resolver("ábreme lo último que descargué")!;
    assert.deepEqual(pdf.datos, { ruta: join(CARPETA, "viejo.pdf"), abrir: true });
    assert.equal(motor.resolver("muéstrame la última descarga")!.intencion, "mostrar-ultima-descarga");
    assert.equal(new Motor(new Gastos(":memory:"), { descargas: () => [] }).resolver("abre la última descarga")!.datos, undefined);
    // Sin la carpeta (por ejemplo, en el servidor MCP), va al agente.
    assert.equal(new Motor(new Gastos(":memory:")).resolver("mis descargas"), null);
  });
});

describe("descargas: lectura de la carpeta", () => {
  it("lista archivos, suma lo que hay dentro de un .download y falla en silencio", () => {
    const dir = mkdtempSync(join(tmpdir(), "descargas-"));
    try {
      writeFileSync(join(dir, "apunte.pdf"), "x".repeat(10));
      writeFileSync(join(dir, ".DS_Store"), "");
      mkdirSync(join(dir, "foto.png.download"));
      writeFileSync(join(dir, "foto.png.download", "foto.png"), "x".repeat(7));
      const listado = listarCarpeta(dir)!.sort((a, b) => a.nombre.localeCompare(b.nombre));
      assert.deepEqual(listado.map((e) => [e.nombre, e.tamano, e.carpeta]), [["apunte.pdf", 10, false], ["foto.png.download", 7, true]]);
      assert.equal(listarCarpeta(join(dir, "no-existe")), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
