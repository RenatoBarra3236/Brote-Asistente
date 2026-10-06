// Arma documentos de prueba a mano (zip, docx, pptx, odt y un PDF mínimo), sin depender de ningún programa.
import { crc32, deflateRawSync } from "node:zlib";

export function armarZip(entradas: Record<string, string | Buffer>, comprimir = true): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;
  for (const [nombre, contenido] of Object.entries(entradas)) {
    const datos = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido, "utf8");
    const comp = comprimir ? deflateRawSync(datos) : datos;
    const metodo = comprimir ? 8 : 0;
    const nom = Buffer.from(nombre, "utf8");
    const crc = crc32(datos);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nom.length, 26);
    locales.push(local, nom, comp);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(datos.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    centrales.push(central, nom);
    desplazamiento += 30 + nom.length + comp.length;
  }
  const dirCentral = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Object.keys(entradas).length, 8);
  fin.writeUInt16LE(Object.keys(entradas).length, 10);
  fin.writeUInt32LE(dirCentral.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, dirCentral, fin]);
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function armarDocx(parrafos: string[]): Buffer {
  const cuerpo = parrafos.map((p) => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`).join("");
  return armarZip({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${cuerpo}</w:body></w:document>`,
  });
}

export function armarPptx(diapositivas: { texto: string[]; notas?: string }[]): Buffer {
  const entradas: Record<string, string> = { "[Content_Types].xml": "<Types/>" };
  diapositivas.forEach((d, i) => {
    entradas[`ppt/slides/slide${i + 1}.xml`] = `<p:sld>${d.texto.map((t) => `<a:p><a:r><a:t>${esc(t)}</a:t></a:r></a:p>`).join("")}</p:sld>`;
    if (d.notas) entradas[`ppt/notesSlides/notesSlide${i + 1}.xml`] = `<p:notes><a:p><a:r><a:t>${esc(d.notas)}</a:t></a:r></a:p></p:notes>`;
  });
  return armarZip(entradas);
}

export function armarOdt(parrafos: string[]): Buffer {
  return armarZip({ mimetype: "application/vnd.oasis.opendocument.text", "content.xml": `<office:document-content><office:body><office:text>${parrafos.map((p) => `<text:p>${esc(p)}</text:p>`).join("")}</office:text></office:body></office:document-content>` }, false);
}

/** Un PDF de una página con una línea de texto (Helvetica, sin comprimir). */
export function armarPdf(texto: string): Buffer {
  const flujo = `BT /F1 18 Tf 72 720 Td (${texto.replace(/[()\\]/g, "")}) Tj ET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let salida = "%PDF-1.4\n";
  const posiciones: number[] = [];
  objetos.forEach((o, i) => {
    posiciones.push(salida.length);
    salida += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const inicioXref = salida.length;
  salida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  salida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(salida, "latin1");
}
