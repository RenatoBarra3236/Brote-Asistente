// La máquina de estados de la tarjeta de documentos (arrastrar, leer, elegir qué hacer, vencer solo), con un DOM falso mínimo.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

class Elemento {
  className = "";
  hidden = false;
  textContent = "";
  title = "";
  type = "";
  value = "";
  children: Elemento[] = [];
  style = { setProperty() {}, visibility: "" };
  oyentes = new Map<string, (() => void)[]>();
  append(...c: Elemento[]) {
    this.children.push(...c);
  }
  replaceChildren(...c: Elemento[]) {
    this.children = c;
  }
  setAttribute() {}
  addEventListener(tipo: string, f: () => void) {
    this.oyentes.set(tipo, [...(this.oyentes.get(tipo) ?? []), f]);
  }
  clic() {
    for (const f of this.oyentes.get("click") ?? []) f();
  }
  /** Todos los descendientes con ese texto (para encontrar botones). */
  buscar(texto: string): Elemento[] {
    return [...this.children.flatMap((h) => h.buscar(texto)), ...(this.textContent.includes(texto) ? [this] : [])];
  }
}

const original = (globalThis as { document?: unknown }).document;
beforeEach(() => {
  (globalThis as { document?: unknown }).document = { createElement: () => new Elemento() };
});
afterEach(() => {
  (globalThis as { document?: unknown }).document = original;
});

const { VistaDocumento, LECTURA_MINIMA_MS } = await import("../src/documento-vista.ts");
assert.equal(VistaDocumento.lecturaMinimaMs, LECTURA_MINIMA_MS);
assert.ok(LECTURA_MINIMA_MS >= 2000, "se disfruta la animación");
// Las pruebas no esperan lo que espera una persona.
VistaDocumento.lecturaMinimaMs = 30;

const doc = { id: "doc-2026-10-06-140509", nombre: "Apuntes.pdf", tipo: "pdf" as const, paginas: 12, caracteres: 21000, ramoId: null, creado: "2026-10-06T17:05:09.000Z" };

function armar(agregar: (ruta: string) => Promise<typeof doc> = async () => doc) {
  const enviados: string[] = [];
  const campo: string[] = [];
  const vistas: string[] = [];
  const v = new VistaDocumento(
    {
      agregar,
      enviar: (t) => enviados.push(t),
      escribirEnCampo: (t) => campo.push(t),
      asignarRamo: async () => {},
      verRespuesta: () => vistas.push("brote"),
    },
    () => {},
  );
  return { v, enviados, campo, vistas, el: v.el as unknown as Elemento };
}

describe("tarjeta de documentos", () => {
  it("arrastrar un archivo que se puede leer: Brote se pone lentes; uno que no, no", () => {
    const { v, el } = armar();
    assert.equal(v.modoLectura("reposo"), null);
    v.arrastrar(["/a/Apuntes.pdf"]);
    assert.equal(v.fase, "arrastrando");
    assert.equal(v.modoLectura("reposo"), "lentes");
    assert.equal(el.hidden, false);
    v.salirDelArrastre();
    assert.equal(v.fase, "inactivo");
    assert.equal(el.hidden, true);
    v.arrastrar(["/a/foto.png"]);
    assert.equal(v.modoLectura("reposo"), null, "sin lentes si no lo puede leer");
  });

  it("soltar: lee con la hoja al menos un rato, y después pregunta qué hacer (con los lentes puestos)", async () => {
    const { v } = armar();
    VistaDocumento.lecturaMinimaMs = 300;
    const inicio = Date.now();
    const promesa = v.soltar(["/a/Apuntes.pdf"]);
    assert.equal(v.fase, "leyendo");
    assert.equal(v.modoLectura("reposo"), "leyendo");
    await promesa;
    VistaDocumento.lecturaMinimaMs = 30;
    assert.ok(Date.now() - inicio >= 250, "se ve leer aunque el texto salga al tiro");
    assert.equal(v.fase, "listo");
    assert.equal(v.modoLectura("reposo"), "lentes");
  });

  it("un archivo que no se puede leer muestra el motivo y se retira solo", async () => {
    const { v, el } = armar();
    await v.soltar(["/a/virus.exe"]);
    assert.equal(v.fase, "error");
    assert.equal(v.modoLectura("reposo"), null);
    assert.match(el.children[0].textContent, /Eso no lo puedo leer/);
    const futuro = Date.now() + 9000;
    const real = Date.now;
    Date.now = () => futuro;
    try {
      assert.equal(v.activa, false);
    } finally {
      Date.now = real;
    }
  });

  it("si el puente rechaza el archivo, dice por qué", async () => {
    const { v, el } = armar(async () => {
      throw new Error("Ese archivo pesa más de 25 MB.");
    });
    await v.soltar(["/a/enorme.pdf"]);
    assert.equal(v.fase, "error");
    assert.equal(el.children[0].textContent, "Ese archivo pesa más de 25 MB.");
  });

  it("elegir una acción manda el mensaje al agente y Brote sigue leyendo hasta que el agente termina", async () => {
    const { v, enviados, vistas } = armar();
    await v.soltar(["/a/Apuntes.pdf"]);
    v.hacer("resumen", doc);
    assert.equal(enviados.length, 1);
    assert.match(enviados[0], /resumen del documento «Apuntes.pdf» \(id doc-2026-10-06-140509\)/);
    assert.deepEqual(vistas, ["brote"]);
    assert.equal(v.fase, "inactivo");
    // El agente todavía no arranca: sigue leyendo; cuando trabaja y vuelve a reposo, se saca los lentes.
    assert.equal(v.modoLectura("reposo"), "leyendo");
    assert.equal(v.modoLectura("pensando"), "leyendo");
    assert.equal(v.modoLectura("trabajando"), "leyendo");
    assert.equal(v.modoLectura("reposo"), null);
    assert.equal(v.modoLectura("reposo"), null);
  });

  it("si el agente nunca arranca, Brote se saca los lentes pasado un rato", () => {
    const { v } = armar();
    const ahora = Date.now();
    v.hacer("tarjetas", doc);
    assert.equal(v.modoLectura("reposo", ahora + 1000), "leyendo");
    assert.equal(v.modoLectura("reposo", ahora + 26_000), null);
  });

  it("«Otra cosa» deja el prefijo en el campo para que el usuario lo termine", async () => {
    const { v, enviados, campo } = armar();
    await v.soltar(["/a/Apuntes.pdf"]);
    v.hacer("otra", doc);
    assert.deepEqual(enviados, []);
    assert.deepEqual(campo, ["Sobre el documento «Apuntes.pdf» (id doc-2026-10-06-140509): "]);
  });

  it("un arrastre que nadie suelta ni cancela se retira solo; sigueArrastrando lo mantiene", () => {
    const { v } = armar();
    const real = Date.now;
    const t0 = real();
    try {
      Date.now = () => t0;
      v.arrastrar(["/a/Apuntes.pdf"]);
      Date.now = () => t0 + 5000;
      v.sigueArrastrando();
      Date.now = () => t0 + 9000;
      assert.equal(v.activa, true, "llegó un aviso hace 4 s");
      Date.now = () => t0 + 12_000;
      assert.equal(v.activa, false, "pasaron 7 s sin avisos");
    } finally {
      Date.now = real;
    }
  });
});
