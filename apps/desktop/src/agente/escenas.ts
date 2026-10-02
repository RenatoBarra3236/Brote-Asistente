// Las escenas del simulador, con los eventos de packages/adapter/ejemplos/ incluidos en
// el paquete por Vite (`?raw`). Solo lo usa la app; las pruebas leen los archivos directo.

import aprobacionPermitida from "../../../../packages/adapter/ejemplos/aprobacion-permitida.jsonl?raw";
import aprobacionRechazada from "../../../../packages/adapter/ejemplos/aprobacion-rechazada.jsonl?raw";
import error from "../../../../packages/adapter/ejemplos/error.jsonl?raw";
import respuestaConHerramienta from "../../../../packages/adapter/ejemplos/respuesta-con-herramienta.jsonl?raw";
import respuestaSimple from "../../../../packages/adapter/ejemplos/respuesta-simple.jsonl?raw";
import { marcosDesdeJsonl, type Escena } from "./simulado.ts";

/** Qué palabras del mensaje llevan a cada escena. El resto recibe la respuesta simple. */
export const ESCENAS: Escena[] = [
  { nombre: "error", patron: /\b(error|falla|fallar)\b/i, marcos: marcosDesdeJsonl(error) },
  {
    nombre: "aprobación",
    patron: /\b(ejecuta|ejecutar|comando|terminal|permiso)\b/i,
    marcos: marcosDesdeJsonl(aprobacionPermitida),
    siRechaza: marcosDesdeJsonl(aprobacionRechazada),
  },
  {
    nombre: "herramienta",
    patron: /\b(lee|leer|archivo|user\.md|busca|buscar)\b/i,
    marcos: marcosDesdeJsonl(respuestaConHerramienta),
  },
  { nombre: "simple", marcos: marcosDesdeJsonl(respuestaSimple) },
];
