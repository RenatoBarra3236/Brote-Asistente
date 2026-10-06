// La ventana «Privacidad»: muestra docs/privacidad.md tal como viene dentro de la app (se importa en la
// compilación), así se lee sin internet y sin que el repositorio sea público. Todo se arma con texto.

import texto from "../../../docs/privacidad.md?raw";
import { analizarDocumento, type BloqueDocumento } from "./agente/documento-md";
import type { Fragmento } from "./agente/markdown";

function fragmentos(lista: Fragmento[]): Node[] {
  return lista.map((f) => {
    if (f.tipo === "texto") return document.createTextNode(f.texto);
    const el = document.createElement(f.tipo === "negrita" ? "strong" : f.tipo === "cursiva" ? "em" : "code");
    el.textContent = f.texto;
    return el;
  });
}

function bloque(b: BloqueDocumento): HTMLElement {
  switch (b.tipo) {
    case "titulo": {
      const el = document.createElement(`h${b.nivel}` as "h1" | "h2" | "h3");
      el.append(...fragmentos(b.texto));
      return el;
    }
    case "parrafo": {
      const el = document.createElement("p");
      el.append(...fragmentos(b.texto));
      return el;
    }
    case "lista": {
      const ul = document.createElement("ul");
      for (const item of b.items) {
        const li = document.createElement("li");
        li.append(...fragmentos(item));
        ul.append(li);
      }
      return ul;
    }
    case "tabla": {
      const envoltura = document.createElement("div");
      envoltura.className = "tabla-envoltura";
      const tabla = document.createElement("table");
      const cabecera = document.createElement("tr");
      for (const celda of b.cabecera) {
        const th = document.createElement("th");
        th.append(...fragmentos(celda));
        cabecera.append(th);
      }
      const thead = document.createElement("thead");
      thead.append(cabecera);
      const tbody = document.createElement("tbody");
      for (const fila of b.filas) {
        const tr = document.createElement("tr");
        for (const celda of fila) {
          const td = document.createElement("td");
          td.append(...fragmentos(celda));
          tr.append(td);
        }
        tbody.append(tr);
      }
      tabla.append(thead, tbody);
      envoltura.append(tabla);
      return envoltura;
    }
  }
}

document.querySelector<HTMLElement>("#documento")!.append(...analizarDocumento(texto).map(bloque));
