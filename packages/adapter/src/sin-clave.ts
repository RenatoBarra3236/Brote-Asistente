// Brote usa el plan de Claude Code del usuario, nunca su clave de API (que es solo para programar y vive
// en ~/.zshrc). Si una terminal con la clave cargada lanza la app, el puente y todo lo que él lance la
// heredarían, y un `claude` hijo dejaría de usar la cuenta Pro. Se quita al partir, sin leerla ni mostrarla.

export function quitarClaveDeApi(entorno: NodeJS.ProcessEnv = process.env): void {
  delete entorno.ANTHROPIC_API_KEY;
}
