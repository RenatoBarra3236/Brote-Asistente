import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { debeNotificarAlSistema, guardarNotificaciones, leerNotificaciones, type Almacen } from "../src/agente/notificaciones.ts";

const almacenFalso = (): Almacen => {
  const datos = new Map<string, string>();
  return { getItem: (c) => datos.get(c) ?? null, setItem: (c, v) => void datos.set(c, v) };
};

describe("notificaciones del sistema", () => {
  it("vienen apagadas y se recuerda la elección", () => {
    const almacen = almacenFalso();
    assert.equal(leerNotificaciones(almacen), false);
    guardarNotificaciones(almacen, true);
    assert.equal(leerNotificaciones(almacen), true);
    guardarNotificaciones(almacen, false);
    assert.equal(leerNotificaciones(almacen), false);
  });

  it("solo avisan lo importante, con la isla cerrada y la opción prendida", () => {
    assert.equal(debeNotificarAlSistema("calendario", true, false), true);
    assert.equal(debeNotificarAlSistema("claude", true, false), true);
    assert.equal(debeNotificarAlSistema("temporizador", true, false), true);
    // Lo que no es importante se queda en la isla.
    assert.equal(debeNotificarAlSistema("descarga", true, false), false);
    assert.equal(debeNotificarAlSistema("plata", true, false), false);
    assert.equal(debeNotificarAlSistema("computador", true, false), false);
    // Con la isla abierta el usuario ya lo está viendo; apagado, nada.
    assert.equal(debeNotificarAlSistema("calendario", true, true), false);
    assert.equal(debeNotificarAlSistema("calendario", false, false), false);
  });
});
