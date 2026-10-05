// Copiar texto al portapapeles desde las ventanas. Primero la API moderna; si el webview la niega,
// el método de siempre (un área de texto oculta y `execCommand`). Devuelve si se pudo.

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // sigue con el respaldo
  }
  const area = document.createElement("textarea");
  area.value = texto;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.append(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
