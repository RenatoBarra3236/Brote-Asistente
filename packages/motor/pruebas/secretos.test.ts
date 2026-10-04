import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { aulaSoloEnLlavero, leerConfigAula, marcaConfigAula } from "../src/aula.ts";
import { leerUrlIcal, marcaConfigCalendario } from "../src/calendario.ts";
import { aplicarPedidoSecretos, fijarSecretos, leerSecretos } from "../src/secretos.ts";

const carpeta = mkdtempSync(join(tmpdir(), "brote-secretos-"));
const TOKEN = "TOKEN-DE-PRUEBA-1234567";
afterEach(() => fijarSecretos({}));

test("con enLlavero el token sale de lo que entregó la app", () => {
  const ruta = join(carpeta, "aula.json");
  writeFileSync(ruta, JSON.stringify({ tipo: "canvas", url: "https://campus.miu.cl", enLlavero: true }));
  assert.equal(leerConfigAula(ruta), null);
  assert.equal(aulaSoloEnLlavero(ruta), true);
  const antes = marcaConfigAula(ruta);
  assert.ok(aplicarPedidoSecretos({ tipo: "secretos", aulaToken: TOKEN }));
  assert.deepEqual(leerConfigAula(ruta), { tipo: "canvas", url: "https://campus.miu.cl", token: TOKEN });
  assert.equal(aulaSoloEnLlavero(ruta), false);
  assert.notEqual(marcaConfigAula(ruta), antes, "llegar secretos hace releer la configuración");
});

test("un archivo con token en claro sigue funcionando (sin Llavero)", () => {
  const ruta = join(carpeta, "aula-clara.json");
  writeFileSync(ruta, JSON.stringify({ tipo: "moodle", url: "https://m.miu.cl", token: TOKEN }));
  assert.equal(leerConfigAula(ruta)?.token, TOKEN);
  assert.equal(aulaSoloEnLlavero(ruta), false);
});

test("la dirección iCal también viene del Llavero", () => {
  const ruta = join(carpeta, "calendario.json");
  writeFileSync(ruta, JSON.stringify({ enLlavero: true }));
  assert.equal(leerUrlIcal(ruta), null);
  const antes = marcaConfigCalendario(ruta);
  fijarSecretos({ ical: "https://calendar.example/secreta.ics" });
  assert.equal(leerUrlIcal(ruta), "https://calendar.example/secreta.ics");
  assert.notEqual(marcaConfigCalendario(ruta), antes);
});

test("un pedido que no es de secretos se ignora; lo que no llega se olvida", () => {
  assert.equal(aplicarPedidoSecretos({ tipo: "enviar" }), false);
  assert.equal(aplicarPedidoSecretos(null), false);
  aplicarPedidoSecretos({ tipo: "secretos", aulaToken: TOKEN, ical: "https://x.example/a.ics" });
  aplicarPedidoSecretos({ tipo: "secretos", ical: "" });
  assert.deepEqual({ ...leerSecretos() }, { aulaToken: null, ical: null });
});
