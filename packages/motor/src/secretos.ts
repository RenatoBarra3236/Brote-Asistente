// Secretos que Brote guarda en el Llavero de macOS / Administrador de credenciales de Windows.
//
// Solo la app (Rust) toca el Llavero. Los procesos de Node (el puente y `configurar`) reciben los
// secretos por su entrada estándar y los dejan aquí, en memoria: nunca se escriben a disco ni se
// registran. Los archivos `aula.json` y `calendario.json` llevan `enLlavero: true` en vez del secreto.
// Sin Llavero (Linux, o si falla) el archivo conserva el secreto con permisos 600, como antes.
//
// El servidor MCP corre bajo OpenClaw (launchd): no recibe secretos y le pregunta al puente.

export interface Secretos {
  aulaToken: string | null;
  ical: string | null;
}

const guardados: Secretos = { aulaToken: null, ical: null };
let version = 0;

const comoTexto = (valor: unknown): string | null => (typeof valor === "string" && valor.length > 0 ? valor : null);

/** Reemplaza lo que se sabe (lo que no llega, se olvida). */
export function fijarSecretos(datos: { aulaToken?: unknown; ical?: unknown }): void {
  guardados.aulaToken = comoTexto(datos.aulaToken);
  guardados.ical = comoTexto(datos.ical);
  version++;
}

export function leerSecretos(): Readonly<Secretos> {
  return guardados;
}

/** Cambia cada vez que llegan secretos: se suma a la marca de los archivos para releerlos. */
export function versionSecretos(): number {
  return version;
}

/** `{ "tipo": "secretos", … }` por la entrada del puente. Devuelve true si era ese pedido. */
export function aplicarPedidoSecretos(pedido: unknown): boolean {
  if (typeof pedido !== "object" || pedido === null || (pedido as { tipo?: unknown }).tipo !== "secretos") return false;
  fijarSecretos(pedido as { aulaToken?: unknown; ical?: unknown });
  return true;
}
