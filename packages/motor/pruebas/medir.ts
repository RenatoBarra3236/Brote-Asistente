// Mide el corpus a mano: node packages/motor/pruebas/medir.ts [exacta] [fallas]
import { motorDeCorpus, medir, texto } from "./ayuda-corpus.ts";

const motor = motorDeCorpus();
const soloExacta = process.argv.includes("exacta");
const entender = (frase: string): string | null => (soloExacta ? motor.entender(frase)?.accion.intencion ?? null : motor.comprender(frase)?.accion.intencion ?? null);
const informe = medir(entender);
console.log(texto(informe));
if (process.argv.includes("fallas")) console.log("\nFALLAS:\n" + informe.fallas.join("\n"));
if (informe.falsosPositivos.length) console.log("\nFALSOS POSITIVOS:\n" + informe.falsosPositivos.join("\n"));
