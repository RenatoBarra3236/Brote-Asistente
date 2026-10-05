import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GRABACION_INACTIVA,
  accionDeFrase,
  esErrorDePermisoMicrofono,
  OPCIONES_AVISO,
  conEvento,
  nuevoIdDeGrabacion,
  textoGrabacionGuardada,
  tiempoGrabado,
  type EstadoGrabacion,
} from "../src/agente/grabaciones.ts";

const ev = (fase: "grabando" | "sin-sonido" | "terminada" | "lista" | "error", extra: Partial<{ id: string; segundos: number; detalle: string | null }> = {}) => ({
  fase,
  id: "2026-10-05-103000",
  segundos: 0,
  detalle: null,
  ...extra,
});

describe("la grabación en la isla", () => {
  it("el id sale de la hora local, con la forma del motor", () => {
    assert.equal(nuevoIdDeGrabacion(new Date(2026, 9, 5, 10, 30, 0)), "2026-10-05-103000");
  });

  it("el tiempo se muestra como mm:ss o h:mm:ss", () => {
    assert.equal(tiempoGrabado(0), "00:00");
    assert.equal(tiempoGrabado(125), "02:05");
    assert.equal(tiempoGrabado(3723), "1:02:03");
    assert.equal(tiempoGrabado(-4), "00:00");
  });

  it("empieza al llegar el primer evento y cuenta los segundos", () => {
    let e: EstadoGrabacion = { fase: "iniciando" };
    e = conEvento(e, ev("grabando"));
    assert.deepEqual(e, { fase: "grabando", id: "2026-10-05-103000", segundos: 0, sinSonido: null });
    e = conEvento(e, ev("grabando", { segundos: 7 }));
    assert.equal(e.fase === "grabando" && e.segundos, 7);
  });

  it("un evento de otra grabación o fuera de turno no cambia nada", () => {
    assert.equal(conEvento(GRABACION_INACTIVA, ev("grabando")), GRABACION_INACTIVA);
    const e: EstadoGrabacion = { fase: "grabando", id: "2026-10-05-103000", segundos: 3, sinSonido: null };
    assert.equal(conEvento(e, ev("sin-sonido", { id: "2026-10-05-110000", detalle: "x" })), e);
    assert.equal(conEvento(e, ev("grabando", { id: "2026-10-05-110000", segundos: 9 })), e);
  });

  it("guarda el aviso de que no llega sonido", () => {
    const e = conEvento({ fase: "grabando", id: "2026-10-05-103000", segundos: 8, sinSonido: null }, ev("sin-sonido", { detalle: "No me llega sonido" }));
    assert.equal(e.fase === "grabando" && e.sinSonido, "No me llega sonido");
  });

  it("si la captura se corta sola (tope de 3 h), queda lista para cerrar y preguntar", () => {
    const e = conEvento({ fase: "grabando", id: "2026-10-05-103000", segundos: 10_800, sinSonido: null }, ev("terminada", { detalle: "tope" }));
    assert.deepEqual(e, { fase: "deteniendo", id: "2026-10-05-103000" });
  });

  it("un error al abrir el micrófono muestra el motivo", () => {
    const e = conEvento({ fase: "iniciando" }, ev("error", { detalle: "No encuentro un micrófono conectado." }));
    assert.deepEqual(e, { fase: "error", mensaje: "No encuentro un micrófono conectado." });
    assert.equal(conEvento(GRABACION_INACTIVA, ev("error")).fase, "inactiva");
  });

  it("las tres respuestas a «¿avisaste a los presentes?» son las del contrato", () => {
    assert.deepEqual(OPCIONES_AVISO.map((o) => o.valor), ["si", "no", "solo-mi-voz"]);
  });

  it("el aviso de lista dice si va a transcribir", () => {
    assert.match(textoGrabacionGuardada(65), /01:05.*pestaña Grabar.*transcribirla/);
  });
});

describe("las frases sin IA en la isla", () => {
  const grabando: EstadoGrabacion = { fase: "grabando", id: "x", segundos: 125, sinSonido: null };
  it("iniciar siempre pasa por la pregunta, nunca graba directo", () => {
    assert.deepEqual(accionDeFrase({ grabar: "iniciar" }, GRABACION_INACTIVA), { hacer: "preguntar" });
    assert.deepEqual(accionDeFrase({ grabar: "iniciar" }, { fase: "error", mensaje: "x" }), { hacer: "preguntar" });
  });
  it("iniciar con una grabación en curso o a medio abrir no abre otra", () => {
    assert.equal(accionDeFrase({ grabar: "iniciar" }, grabando)?.hacer, "avisar");
    for (const estado of [{ fase: "pregunta" }, { fase: "iniciando" }, { fase: "deteniendo", id: "x" }] as EstadoGrabacion[]) {
      assert.equal(accionDeFrase({ grabar: "iniciar" }, estado)?.hacer, "avisar");
    }
  });
  it("detener solo detiene si se está grabando", () => {
    assert.deepEqual(accionDeFrase({ grabar: "detener" }, grabando), { hacer: "detener" });
    assert.equal(accionDeFrase({ grabar: "detener" }, GRABACION_INACTIVA)?.hacer, "avisar");
    assert.equal(accionDeFrase({ grabar: "detener" }, { fase: "pregunta" })?.hacer, "avisar");
  });
  it("el estado responde con el tiempo", () => {
    assert.match((accionDeFrase({ grabar: "estado" }, grabando) as { texto: string }).texto, /02:05/);
    assert.match((accionDeFrase({ grabar: "estado" }, GRABACION_INACTIVA) as { texto: string }).texto, /no estoy grabando/);
  });
  it("datos que no son de grabar no hacen nada", () => {
    for (const datos of [undefined, null, {}, { grabar: "otra" }, { ruta: "/x" }, "iniciar"]) {
      assert.equal(accionDeFrase(datos, GRABACION_INACTIVA), null);
    }
  });
});

describe("el error del micrófono", () => {
  it("ofrece Abrir Privacidad solo cuando es por el permiso", () => {
    assert.equal(esErrorDePermisoMicrofono("macOS no le dio permiso a Brote para usar el micrófono: actívalo en Ajustes del Sistema → Privacidad y seguridad → Micrófono."), true);
    assert.equal(esErrorDePermisoMicrofono("El sistema no le dio permiso a Brote para usar el micrófono: revisa Configuración → Privacidad → Micrófono."), true);
    assert.equal(esErrorDePermisoMicrofono("No encuentro un micrófono conectado."), false);
    assert.equal(esErrorDePermisoMicrofono("El micrófono está ocupado por otra aplicación."), false);
    assert.equal(esErrorDePermisoMicrofono("No pude abrir el micrófono: algo raro"), false);
  });
});
