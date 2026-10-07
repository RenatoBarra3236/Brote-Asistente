// node packages/motor/pruebas/medir-validacion.ts
import { motorDeCorpus, medir, texto } from "./ayuda-corpus.ts";
import { CASOS_VALIDACION } from "./corpus-validacion.ts";
const motor = motorDeCorpus();
const informe = medir((f) => motor.comprender(f)?.accion.intencion ?? null, CASOS_VALIDACION);
console.log(texto(informe));
console.log("\nFALLAS:\n" + informe.fallas.join("\n"));
console.log("\nFALSOS POSITIVOS:\n" + informe.falsosPositivos.join("\n"));
