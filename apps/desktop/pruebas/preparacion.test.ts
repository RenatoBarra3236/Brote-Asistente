import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activasDePreset } from "../src/agente/funciones.ts";
import { TECNICOS, filasPermisos, necesitaAlUsuario, necesitaAsistente, permisoCalendarioDePaso, preparacion, siguienteAutomatico, type Paso } from "../src/agente/preparacion.ts";

const ok = (id: string): Paso => ({ id, titulo: id, estado: "ok", detalle: "" });
const automatico = (id: string, requiereConsentimiento = false): Paso => ({
  id,
  titulo: id,
  estado: "falta",
  detalle: "",
  accion: { tipo: "automatica", etiqueta: "Arreglar", requiereConsentimiento },
});

describe("Preparar Brote", () => {
  it("sin Node solo llega ese paso: todo lo demás cuenta como pendiente", () => {
    const sinNode: Paso[] = [{ id: "node", titulo: "Node", estado: "falta", detalle: "", accion: { tipo: "terminal", etiqueta: "Instalar con Homebrew", terminal: "brew-node" } }];
    const resumen = preparacion(sinNode, new Set());
    assert.deepEqual([resumen.total, resumen.listos, resumen.listo, resumen.hayAutomatico], [TECNICOS.length, 0, false, false]);
    assert.deepEqual(resumen.delUsuario.map((p) => p.id), ["node"]);
    assert.equal(necesitaAsistente(sinNode, false), true);
  });

  it("el consentimiento del agente aparece como tarjeta y destraba los arreglos automáticos", () => {
    const pasos = [ok("node"), automatico("openclaw"), ok("claude"), automatico("agente", true), ...TECNICOS.slice(4).map((id) => ({ ...ok(id), estado: "falta" as const }))];
    const sin = new Set<string>();
    assert.equal(siguienteAutomatico(pasos, sin)?.id, "openclaw");
    assert.equal(necesitaAlUsuario(pasos[3], sin), true);
    assert.deepEqual(preparacion(pasos, sin).delUsuario.map((p) => p.id), ["agente"]);
    const con = new Set(["agente"]);
    assert.equal(siguienteAutomatico([ok("openclaw"), pasos[3]], con)?.id, "agente");
    // Aceptado, la tarjeta sigue a la vista (para poder desmarcarla) pero ya no bloquea.
    assert.equal(necesitaAlUsuario(pasos[3], con), false);
  });

  it("los pasos opcionales no cuentan en la barra ni abren el asistente", () => {
    const pasos = [...TECNICOS.map(ok), { ...automatico("programador"), estado: "opcional" as const }];
    const resumen = preparacion(pasos, new Set());
    assert.equal(resumen.listo, true);
    assert.equal(resumen.listos, TECNICOS.length);
    assert.equal(necesitaAsistente(pasos, false), false);
    // Quien ya eligió funciones y tiene un problema va a Estado, no al asistente.
    assert.equal(necesitaAsistente([ok("node"), automatico("gateway")], true), false);
  });
});

describe("permisos de macOS", () => {
  it("dice qué función usa cada permiso, si falta y si ya no hace falta", () => {
    const activas = { ...activasDePreset("estudiante"), descargas: false };
    const filas = filasPermisos(activas, { descargas: "sin-usar", automatizacion: { Spotify: false, Music: true }, calendarios: "concedido" });
    const fila = (id: string) => filas.find((f) => f.id === id)!;
    assert.deepEqual(fila("calendarios").usadoPor.map((f) => f.id), ["calendario"]);
    assert.equal(fila("automatizacion").estado, "negado");
    assert.equal(fila("automatizacion").falta, true);
    assert.equal(fila("descargas").sobra, true);
    assert.equal(fila("calendarios").sobra, false);
    const sinMusica = filasPermisos({ ...activas, musica: false }, { descargas: "sin-usar", automatizacion: { Music: true }, calendarios: "concedido" });
    assert.equal(sinMusica.find((f) => f.id === "automatizacion")!.sobra, true);
  });

  it("el permiso de Calendarios sale del paso del Calendario del Mac", () => {
    assert.equal(permisoCalendarioDePaso([ok("calendario-mac")]), "concedido");
    assert.equal(
      permisoCalendarioDePaso([{ id: "calendario-mac", titulo: "", estado: "opcional", detalle: "", accion: { tipo: "enlace", etiqueta: "Abrir Privacidad", enlace: "privacidad-calendarios" } }]),
      "negado",
    );
    assert.equal(permisoCalendarioDePaso([{ ...automatico("calendario-mac"), estado: "opcional" }]), "sin-preguntar");
    assert.equal(permisoCalendarioDePaso([]), null);
  });
});

describe("al terminar el asistente", () => {
  it("avisa las funciones prendidas a las que les falta configurar algo", async () => {
    const { funcionesSinConfigurar } = await import("../src/agente/preparacion.ts");
    const activas = { ...activasDePreset("todo") };
    const pasos: Paso[] = [ok("calendario-ical"), { ...ok("aula"), estado: "opcional" }, { ...ok("programador"), estado: "opcional" }, ok("memoria-local")];
    assert.deepEqual(funcionesSinConfigurar(activas, pasos).map((f) => f.id), ["aula", "programador"]);
    assert.deepEqual(funcionesSinConfigurar({ ...activas, aula: false, programador: false }, pasos), []);
  });
});
