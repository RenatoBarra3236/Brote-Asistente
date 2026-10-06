import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { agregarDocumento, asignarRamoDocumento, borrarDocumento, borrarTodosLosDocumentos, leerDocumentoGuardado, listarDocumentos } from "../src/documentos-archivo.ts";
import { extraerTexto } from "../src/documentos-extraer.ts";
import { ErrorZip, leerEntrada, listarZip } from "../src/documentos-zip.ts";
import {
  MAX_CARACTERES_DOCUMENTO,
  MAX_DOCUMENTOS,
  MOTIVOS,
  escribirDocumento,
  fechaDeIdDocumento,
  idDeDocumento,
  leerCabeceraDocumento,
  leerDocumento,
  limpiarNombreDocumento,
  normalizarTextoDocumento,
  partirDocumento,
  tipoDeArchivo,
} from "../src/documentos-tipos.ts";
import { armarDocx, armarOdt, armarPdf, armarPptx, armarZip } from "./ayuda-documentos.ts";

function carpeta(): string {
  return mkdtempSync(join(tmpdir(), "documentos-"));
}
function archivo(nombre: string, contenido: string | Buffer): string {
  const ruta = join(carpeta(), nombre);
  writeFileSync(ruta, contenido);
  return ruta;
}

describe("documentos: reglas puras", () => {
  it("el id lleva la fecha y se lee de vuelta; lo que no es un id exacto no", () => {
    const f = new Date(2026, 9, 6, 14, 5, 9);
    assert.equal(idDeDocumento(f), "doc-2026-10-06-140509");
    assert.equal(fechaDeIdDocumento("doc-2026-10-06-140509")?.getTime(), f.getTime());
    assert.equal(fechaDeIdDocumento("2026-10-06-140509"), null);
    assert.equal(fechaDeIdDocumento("doc-2026-02-31-140509"), null);
    assert.equal(fechaDeIdDocumento("doc-../../x"), null);
  });
  it("solo acepta las extensiones de la lista, sin importar mayúsculas", () => {
    assert.equal(tipoDeArchivo("Apuntes.PDF"), "pdf");
    assert.equal(tipoDeArchivo("a.b.docx"), "docx");
    for (const malo of ["virus.exe", "script.sh", "sin-extension", "doc.pdf.exe", "foto.png"]) assert.equal(tipoDeArchivo(malo), null, malo);
  });
  it("del nombre solo queda el archivo (nunca la carpeta del usuario) y sin caracteres de control", () => {
    assert.equal(limpiarNombreDocumento("/Users/ana/Documents/Tesis privada/Apuntes.pdf"), "Apuntes.pdf");
    assert.equal(limpiarNombreDocumento("C:\\Users\\ana\\a.docx"), "a.docx");
    assert.equal(limpiarNombreDocumento("a\nb\u0000c.txt"), "a b c.txt");
    assert.ok(limpiarNombreDocumento(`${"x".repeat(500)}.pdf`).length <= 120);
  });
  it("normaliza espacios y líneas en blanco", () => {
    assert.equal(normalizarTextoDocumento("a  b\t\tc\r\n\r\n\r\n\r\nd \u0000e"), "a b c\n\nd e");
  });
  it("escribe y lee de vuelta; el texto puede traer rayas sin romper la cabecera", () => {
    const d = { id: "doc-2026-10-06-140509", nombre: "Apuntes.pdf", tipo: "pdf" as const, paginas: 12, caracteres: 30, ramoId: 3, creado: "2026-10-06T17:05:09.000Z", texto: "Hola\n---\nchao: x" };
    const leido = leerDocumento(d.id, escribirDocumento(d));
    assert.deepEqual(leido, d);
    assert.equal(leerCabeceraDocumento(d.id, escribirDocumento({ ...d, ramoId: null, paginas: null }))?.ramoId, null);
    assert.equal(leerCabeceraDocumento("otro", escribirDocumento(d)), null);
    assert.equal(leerCabeceraDocumento(d.id, "no es un documento"), null);
  });
  it("parte el texto en trozos que no pasan el máximo y que juntos dicen lo mismo", () => {
    const texto = Array.from({ length: 50 }, (_, i) => `Párrafo ${i} ${"palabra ".repeat(20)}`).join("\n\n");
    const partes = partirDocumento(texto, 1000);
    assert.ok(partes.length > 3);
    assert.ok(partes.every((p) => p.texto.length <= 1000 && p.total === partes.length));
    assert.equal(partes.map((p) => p.texto).join(" ").replace(/\s+/g, " ").trim(), texto.replace(/\s+/g, " ").trim());
    assert.deepEqual(partirDocumento("corto").map((p) => [p.parte, p.total]), [[1, 1]]);
    assert.equal(partirDocumento("x".repeat(2500), 1000).length, 3);
  });
});

describe("documentos: zip", () => {
  it("lee entradas comprimidas y sin comprimir", () => {
    for (const comprimir of [true, false]) {
      const zip = armarZip({ "a.txt": "hola", "carpeta/b.txt": "chao" }, comprimir);
      const e = listarZip(zip);
      assert.deepEqual(e.map((x) => x.nombre), ["a.txt", "carpeta/b.txt"]);
      assert.equal(leerEntrada(zip, e[1]).toString(), "chao");
    }
  });
  it("rechaza lo que no es un zip o está cortado", () => {
    assert.throws(() => listarZip(Buffer.from("esto no es un zip")), ErrorZip);
    assert.throws(() => listarZip(armarZip({ "a.txt": "hola" }).subarray(0, 40)), ErrorZip);
  });
  it("no descomprime una entrada que dice ser gigante", () => {
    const zip = armarZip({ "a.txt": "hola" });
    const e = listarZip(zip)[0];
    assert.throws(() => leerEntrada(zip, { ...e, tamano: 2 ** 31 }), ErrorZip);
  });
});

describe("documentos: sacar el texto", () => {
  it("Word: párrafos, entidades y tildes", async () => {
    const r = await extraerTexto(archivo("Clase 1.docx", armarDocx(["Límites y continuidad", "a < b & c > d", "Tercera línea"])));
    assert.ok(r.ok);
    assert.equal(r.texto, "Límites y continuidad\na < b & c > d\nTercera línea");
  });
  it("PowerPoint: una diapositiva tras otra, en orden numérico, con sus notas", async () => {
    const diapos = Array.from({ length: 11 }, (_, i) => ({ texto: [`Título ${i + 1}`, `punto ${i + 1}`], notas: i === 1 ? "decir esto" : undefined }));
    const r = await extraerTexto(archivo("Clase.pptx", armarPptx(diapos)));
    assert.ok(r.ok);
    assert.equal(r.paginas, 11);
    assert.match(r.texto, /^Diapositiva 1\nTítulo 1\npunto 1\n\nDiapositiva 2\nTítulo 2\npunto 2\nNotas: decir esto\n\nDiapositiva 3/);
    assert.ok(r.texto.indexOf("Diapositiva 10") > r.texto.indexOf("Diapositiva 9"));
  });
  it("OpenDocument, texto y Markdown", async () => {
    const odt = await extraerTexto(archivo("a.odt", armarOdt(["uno", "dos & tres"])));
    assert.ok(odt.ok);
    assert.equal(odt.texto, "uno\ndos & tres");
    const txt = await extraerTexto(archivo("a.txt", "Hola   mundo\n\n\n\nchao"));
    assert.ok(txt.ok);
    assert.equal(txt.texto, "Hola mundo\n\nchao");
    assert.ok((await extraerTexto(archivo("a.md", "# Título\ntexto"))).ok);
  });
  it("PDF (solo en Mac, con PDFKit): lee el texto y cuenta las páginas", { skip: process.platform !== "darwin" }, async () => {
    const r = await extraerTexto(archivo("a.pdf", armarPdf("Derivadas de funciones compuestas")));
    assert.ok(r.ok, JSON.stringify(r));
    assert.match(r.texto, /Derivadas de funciones compuestas/);
    assert.equal(r.paginas, 1);
  });
  it("RTF (solo en Mac, con textutil)", { skip: process.platform !== "darwin" }, async () => {
    const r = await extraerTexto(archivo("a.rtf", "{\\rtf1\\ansi Hola \\b mundo\\b0  desde RTF}"));
    assert.ok(r.ok, JSON.stringify(r));
    assert.match(r.texto, /Hola mundo desde RTF/);
  });
  it("dice por qué no, en lenguaje de persona", async () => {
    const motivo = async (ruta: string) => {
      const r = await extraerTexto(ruta);
      assert.equal(r.ok, false);
      return r.ok ? "" : r.motivo;
    };
    assert.equal(await motivo(archivo("a.exe", "x")), MOTIVOS.extension);
    assert.equal(await motivo(join(carpeta(), "no-existe.pdf")), MOTIVOS.noExiste);
    assert.equal(await motivo(archivo("vacio.txt", "   \n  ")), MOTIVOS.vacio);
    assert.equal(await motivo(archivo("falso.docx", "esto no es un zip")), MOTIVOS.ilegible);
    assert.equal(await motivo(archivo("sin-texto.docx", armarZip({ "otra.xml": "x" }))), MOTIVOS.ilegible);
    assert.equal(await motivo(archivo("cifrado.docx", Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(64)]))), MOTIVOS.protegido);
    assert.equal(await motivo(archivo("largo.txt", "palabra ".repeat(MAX_CARACTERES_DOCUMENTO / 4))), MOTIVOS.largo);
    const dir = carpeta();
    mkdirSync(join(dir, "carpeta.pdf"));
    assert.equal(await motivo(join(dir, "carpeta.pdf")), MOTIVOS.noEsArchivo);
  });
  it("no sigue enlaces simbólicos", async () => {
    const real = archivo("real.txt", "secreto");
    const enlace = join(carpeta(), "enlace.txt");
    symlinkSync(real, enlace);
    const r = await extraerTexto(enlace);
    assert.equal(r.ok, false);
    assert.equal(r.ok ? "" : r.motivo, MOTIVOS.enlace);
  });
});

describe("documentos: guardar, listar y borrar", () => {
  it("guarda solo el texto y el nombre (con permisos 600), lista y lee de vuelta; el original queda intacto", async () => {
    const dir = carpeta();
    const origen = archivo("Apuntes de cálculo.docx", armarDocx(["Derivadas", "Integrales"]));
    const antes = readFileSync(origen);
    const r = await agregarDocumento(origen, { carpeta: dir, ramoId: 2, ahora: new Date(2026, 9, 6, 10, 0, 0) });
    assert.ok(r.ok);
    assert.equal(r.documento.id, "doc-2026-10-06-100000");
    assert.equal(r.documento.nombre, "Apuntes de cálculo.docx");
    assert.equal(r.documento.ramoId, 2);
    assert.equal(statSync(join(dir, `${r.documento.id}.md`)).mode & 0o777, 0o600);
    assert.equal(statSync(dir).mode & 0o777, 0o700);
    assert.deepEqual(readFileSync(origen), antes);
    assert.equal(readFileSync(join(dir, `${r.documento.id}.md`), "utf8").includes(origen), false, "no guarda la ruta del usuario");
    assert.deepEqual(listarDocumentos(dir).map((d) => d.nombre), ["Apuntes de cálculo.docx"]);
    assert.equal(leerDocumentoGuardado(r.documento.id, dir)?.texto, "Derivadas\nIntegrales");
    assert.equal(leerDocumentoGuardado("doc-2026-10-06-100001", dir), null);
    assert.equal(leerDocumentoGuardado("../../etc/passwd", dir), null);
  });
  it("dos documentos en el mismo segundo no se pisan", async () => {
    const dir = carpeta();
    const ahora = new Date(2026, 9, 6, 10, 0, 0);
    const a = await agregarDocumento(archivo("a.txt", "uno"), { carpeta: dir, ahora });
    const b = await agregarDocumento(archivo("b.txt", "dos"), { carpeta: dir, ahora });
    assert.ok(a.ok && b.ok);
    assert.notEqual(a.documento.id, b.documento.id);
    assert.equal(listarDocumentos(dir).length, 2);
  });
  it(`no pasa de ${MAX_DOCUMENTOS} documentos`, async () => {
    const dir = carpeta();
    const fuente = archivo("a.txt", "texto");
    for (let i = 0; i < MAX_DOCUMENTOS; i++) assert.ok((await agregarDocumento(fuente, { carpeta: dir, ahora: new Date(2026, 9, 6, 10, 0, i) })).ok);
    const r = await agregarDocumento(fuente, { carpeta: dir });
    assert.equal(r.ok, false);
    assert.equal(r.ok ? "" : r.motivo, MOTIVOS.muchos);
  });
  it("un archivo que falla no deja nada guardado", async () => {
    const dir = carpeta();
    assert.equal((await agregarDocumento(archivo("mal.docx", "no zip"), { carpeta: dir })).ok, false);
    assert.deepEqual(listarDocumentos(dir), []);
  });
  it("cambia el ramo, y borra de a uno o todo, solo nombres exactos", async () => {
    const dir = carpeta();
    const a = await agregarDocumento(archivo("a.txt", "uno"), { carpeta: dir, ahora: new Date(2026, 9, 6, 10, 0, 0) });
    const b = await agregarDocumento(archivo("b.txt", "dos"), { carpeta: dir, ahora: new Date(2026, 9, 6, 10, 0, 5) });
    assert.ok(a.ok && b.ok);
    assert.equal(asignarRamoDocumento(a.documento.id, 7, dir), true);
    assert.equal(leerDocumentoGuardado(a.documento.id, dir)?.ramoId, 7);
    assert.equal(leerDocumentoGuardado(a.documento.id, dir)?.texto, "uno");
    assert.equal(asignarRamoDocumento(a.documento.id, null, dir), true);
    assert.equal(asignarRamoDocumento("doc-2026-01-01-000000", 1, dir), false);
    writeFileSync(join(dir, "notas-ajenas.md"), "no es mío");
    const borrados: string[] = [];
    const eliminar = (r: string) => {
      borrados.push(r);
      rmSync(r);
    };
    assert.equal(borrarDocumento("../notas-ajenas", dir, eliminar), false);
    assert.equal(borrarDocumento(a.documento.id, dir, eliminar), true);
    assert.deepEqual(borrados, [join(dir, `${a.documento.id}.md`)]);
    assert.deepEqual(borrarTodosLosDocumentos(dir, eliminar), [b.documento.id]);
    assert.deepEqual(listarDocumentos(dir), []);
    assert.equal(readFileSync(join(dir, "notas-ajenas.md"), "utf8"), "no es mío", "lo que no es nuestro no se toca");
  });
});
