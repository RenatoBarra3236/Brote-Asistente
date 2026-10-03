// Íconos propios de la isla (trazos simples de 16 × 16, dibujados para Brote). Son constantes:
// se insertan como SVG sin pasar nunca texto de afuera.

const TRAZO = `fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;

const ICONOS = {
  brote: `<path ${TRAZO} d="M8 14V8.5M8 8.5C8 5.5 6 3.8 2.8 3.8 2.8 6.8 4.8 8.5 8 8.5zM8 10c0-3 1.8-5 5.2-5 0 3-1.8 5-5.2 5z"/>`,
  codigo: `<rect ${TRAZO} x="2" y="3" width="12" height="10" rx="1.5"/><path ${TRAZO} d="m5 6.5 2 1.5-2 1.5M8.5 10H11"/>`,
  equipo: `<rect ${TRAZO} x="4.5" y="4.5" width="7" height="7" rx="1"/><path ${TRAZO} d="M6.5 2v2.5M9.5 2v2.5M6.5 11.5V14M9.5 11.5V14M2 6.5h2.5M2 9.5h2.5M11.5 6.5H14M11.5 9.5H14"/>`,
  memoria: `<path ${TRAZO} d="M8 4.5C6.6 3.6 4.6 3.4 2.5 4v8.5c2.1-.6 4.1-.4 5.5.5 1.4-.9 3.4-1.1 5.5-.5V4c-2.1-.6-4.1-.4-5.5.5zM8 4.5V13"/>`,
  ajustes: `<circle ${TRAZO} cx="8" cy="8" r="2"/><path ${TRAZO} d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M3.6 12.4l1.2-1.2M11.2 4.8l1.2-1.2"/>`,
  anterior: `<path fill="currentColor" d="M4 3.5h1.5v9H4zM13 3.6v8.8L6.2 8z"/>`,
  siguiente: `<path fill="currentColor" d="M12 3.5h-1.5v9H12zM3 3.6v8.8L9.8 8z"/>`,
  play: `<path fill="currentColor" d="M5 3v10l8.5-5z"/>`,
  pausa: `<path fill="currentColor" d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z"/>`,
  detener: `<rect fill="currentColor" x="4" y="4" width="8" height="8" rx="1.5"/>`,
  enviar: `<path ${TRAZO} stroke-width="1.8" d="M8 13V3.5M4 7.5l4-4 4 4"/>`,
  listo: `<circle fill="currentColor" opacity=".18" cx="8" cy="8" r="6.5"/><path ${TRAZO} d="m5.3 8.2 1.8 1.8 3.6-3.8"/>`,
  girando: `<circle ${TRAZO} opacity=".25" cx="8" cy="8" r="5.5"/><path ${TRAZO} d="M8 2.5A5.5 5.5 0 0 1 13.5 8"/>`,
  alerta: `<path ${TRAZO} d="M8 2.5 14 13H2zM8 6.5v3M8 11.3v.2"/>`,
  musica: `<path ${TRAZO} d="M6 12V3.5l7-1.5V10.5"/><circle fill="currentColor" cx="4.5" cy="12" r="1.8"/><circle fill="currentColor" cx="11.5" cy="10.5" r="1.8"/>`,
  calendario: `<rect ${TRAZO} x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path ${TRAZO} d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>`,
  entrega: `<path ${TRAZO} d="M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8.5l1.5 1.5L10.5 7"/>`,
  descarga: `<path ${TRAZO} d="M8 2.5V10M4.8 7 8 10.2 11.2 7M3 13h10"/>`,
};

export type NombreIcono = keyof typeof ICONOS;

/** Un `<span>` con el ícono, del tamaño de la letra y del color del texto. */
export function icono(nombre: NombreIcono, clase = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `icono ${clase}`.trim();
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg viewBox="0 0 16 16" width="1em" height="1em">${ICONOS[nombre]}</svg>`;
  return span;
}
