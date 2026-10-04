import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estadoDelItem, explicarAgenda, horaDelItem, tituloDelDia, type EstadoAgenda, type ItemAgenda } from "../src/agente/agenda.ts";

const AHORA = new Date(2026, 9, 5, 10, 0).getTime();
const item = (p: Partial<ItemAgenda>): ItemAgenda => ({ tipo: "evento", titulo: "x", detalle: null, inicioMs: AHORA, finMs: AHORA + 3_600_000, todoElDia: false, url: null, ...p });
const estado = (f: Partial<EstadoAgenda["fuentes"]>): EstadoAgenda => ({
  dias: [],
  fuentes: { calendario: true, aula: false, temporizadores: false, permisoMac: null, mac: true, ical: false, ...f },
});

describe("pestaña Agenda", () => {
  it("titula los días", () => {
    assert.equal(tituloDelDia(new Date(2026, 9, 5).getTime(), AHORA), "Hoy · lun 5 oct");
    assert.equal(tituloDelDia(new Date(2026, 9, 6).getTime(), AHORA), "Mañana · mar 6 oct");
    assert.equal(tituloDelDia(new Date(2026, 9, 9).getTime(), AHORA), "vie 9 oct");
  });

  it("dice la hora de cada fila", () => {
    assert.equal(horaDelItem(item({ inicioMs: new Date(2026, 9, 5, 8, 30).getTime(), finMs: new Date(2026, 9, 5, 10).getTime() })), "08:30–10:00");
    assert.equal(horaDelItem(item({ tipo: "entrega", inicioMs: new Date(2026, 9, 5, 23, 59).getTime(), finMs: new Date(2026, 9, 5, 23, 59).getTime() })), "23:59");
    assert.equal(horaDelItem(item({ todoElDia: true })), "todo el día");
  });

  it("atenúa lo pasado, resalta lo que pasa ahora y marca las entregas urgentes", () => {
    assert.equal(estadoDelItem(item({ inicioMs: AHORA - 7_200_000, finMs: AHORA - 3_600_000 }), AHORA), "pasado");
    assert.equal(estadoDelItem(item({ inicioMs: AHORA - 60_000 }), AHORA), "ahora");
    assert.equal(estadoDelItem(item({ inicioMs: AHORA + 60_000 }), AHORA), "proximo");
    assert.equal(estadoDelItem(item({ todoElDia: true, inicioMs: AHORA - 36_000_000, finMs: AHORA + 36_000_000 }), AHORA), "proximo");
    assert.equal(estadoDelItem(item({ tipo: "entrega", inicioMs: AHORA + 3_600_000, finMs: AHORA + 3_600_000 }), AHORA), "urgente");
    assert.equal(estadoDelItem(item({ tipo: "entrega", inicioMs: AHORA + 3 * 86_400_000, finMs: AHORA + 3 * 86_400_000 }), AHORA), "proximo");
  });

  it("explica por qué no hay calendario según el caso", () => {
    const dev = explicarAgenda(estado({ permisoMac: 2 }), { desarrollo: true });
    assert.match(dev.titulo, /desarrollo/);
    assert.match(dev.texto, /Terminal/);
    assert.equal(dev.boton?.accion, "configurar");

    const sinDecidir = explicarAgenda(estado({ permisoMac: 0 }), { desarrollo: false });
    assert.match(sinDecidir.texto, /Calendario del Mac/);
    assert.equal(explicarAgenda(estado({ permisoMac: null }), { desarrollo: false }).boton?.accion, "configurar");

    const negado = explicarAgenda(estado({ permisoMac: 2 }), { desarrollo: false });
    assert.equal(negado.boton?.accion, "privacidad-calendarios");
    assert.equal(explicarAgenda(estado({ permisoMac: 4 }), { desarrollo: false }).boton?.accion, "privacidad-calendarios");

    const otroSistema = explicarAgenda(estado({ mac: false }), { desarrollo: false });
    assert.match(otroSistema.texto, /iCal/);
  });

  it("con permiso o con iCal, o sin calendario pero con otra fuente, no culpa al permiso", () => {
    assert.equal(explicarAgenda(estado({ permisoMac: 3 }), { desarrollo: true }).titulo, "Nada en los próximos 14 días");
    assert.equal(explicarAgenda(estado({ permisoMac: 2, ical: true }), { desarrollo: false }).boton, null);
    assert.equal(explicarAgenda(estado({ calendario: false, temporizadores: true }), { desarrollo: false }).boton, null);
    assert.match(explicarAgenda(estado({ calendario: false }), { desarrollo: false }).titulo, /apagada/);
  });
});
