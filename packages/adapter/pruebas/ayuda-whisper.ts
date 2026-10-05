// Ayudantes de las pruebas de transcripción: un WAV corto generado, un modelo "descargado" (archivo
// disperso del tamaño exacto) y un whisper-cli falso. Nunca tocan las grabaciones ni los modelos reales.
import { chmodSync, closeSync, ftruncateSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FICHAS_MODELOS_WHISPER } from "@asistente/motor";

/** Un WAV mono 16 kHz de 16 bits con `segundos` de silencio (así de corto, la prueba es rápida). */
export function wavDeSilencio(segundos: number): Buffer {
  const datos = Buffer.alloc(Math.round(segundos * 16000) * 2);
  const cabecera = Buffer.alloc(44);
  cabecera.write("RIFF", 0);
  cabecera.writeUInt32LE(36 + datos.length, 4);
  cabecera.write("WAVEfmt ", 8);
  cabecera.writeUInt32LE(16, 16);
  cabecera.writeUInt16LE(1, 20);
  cabecera.writeUInt16LE(1, 22);
  cabecera.writeUInt32LE(16000, 24);
  cabecera.writeUInt32LE(32000, 28);
  cabecera.writeUInt16LE(2, 32);
  cabecera.writeUInt16LE(16, 34);
  cabecera.write("data", 36);
  cabecera.writeUInt32LE(datos.length, 40);
  return Buffer.concat([cabecera, datos]);
}

/** Un archivo "descargado" del tamaño exacto del modelo, sin gastar disco (archivo disperso). */
export function modeloFalso(carpeta: string, modelo: keyof typeof FICHAS_MODELOS_WHISPER): void {
  mkdirSync(carpeta, { recursive: true });
  const fd = openSync(join(carpeta, FICHAS_MODELOS_WHISPER[modelo].archivo), "w");
  ftruncateSync(fd, FICHAS_MODELOS_WHISPER[modelo].bytes);
  closeSync(fd);
}

/** Un `whisper-cli` falso: guarda sus argumentos y escribe el JSON de `-of`. `modo` cambia lo que hace. */
export function whisperFalso(carpeta: string, modo: "bien" | "error" | "cuelga" | "json-roto" = "bien"): string {
  const ruta = join(carpeta, "whisper-cli");
  const cuerpo = {
    bien: `const salida = { transcription: [
      { offsets: { from: 0, to: 3200 }, text: " Buenos días, hoy vemos derivadas." },
      { offsets: { from: 3200, to: 7400 }, text: "  Partimos con la\\n regla de la cadena. " },
      { offsets: { from: 7400, to: 8000 }, text: "   " } ] };
      writeFileSync(base + ".json", JSON.stringify(salida));`,
    error: `console.error("error: no pude abrir el modelo"); process.exit(3);`,
    cuelga: `setInterval(() => {}, 1000);`,
    "json-roto": `writeFileSync(base + ".json", "{ no es json");`,
  }[modo];
  writeFileSync(
    ruta,
    `#!${process.execPath}\nimport { writeFileSync } from "node:fs";\nconst a = process.argv.slice(2);\n` +
      `writeFileSync(${JSON.stringify(join(carpeta, "args.json"))}, JSON.stringify({ a, clave: process.env.ANTHROPIC_API_KEY ?? null }));\n` +
      `const base = a[a.indexOf("-of") + 1];\n${cuerpo}\n`,
  );
  chmodSync(ruta, 0o755);
  return ruta;
}

