import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cargaDeLaSemana,
  descripcionDelDia,
  desplazamientoValido,
  diaDeInicio,
  diasDeLaLista,
  estadoDelItem,
  explicarAgenda,
  horaDelItem,
  inicioDeSemana,
  leerVista,
  letraDelDia,
  puntosVisibles,
  textoDeLaSemana,
  tituloDeSemana,
  tituloDelDia,
  type EstadoAgenda,
  type ItemAgenda,
} from "../src/agente/agenda.ts";
import { armarAgenda } from "../../../packages/motor/src/agenda.ts";

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
    assert.equal(explicarAgenda(estado({ permisoMac: 3 }), { desarrollo: true }).titulo, "Nada en los próximos 35 días");
    assert.equal(explicarAgenda(estado({ permisoMac: 2, ical: true }), { desarrollo: false }).boton, null);
    assert.equal(explicarAgenda(estado({ calendario: false, temporizadores: true }), { desarrollo: false }).boton, null);
    assert.match(explicarAgenda(estado({ calendario: false }), { desarrollo: false }).titulo, /apagada/);
  });
});

describe("vista semanal de la Agenda", () => {
  // Martes 13 de octubre de 2026: la semana va del lunes 12 al domingo 18.
  const HOY = new Date(2026, 9, 13, 10).getTime();
  const LUNES = new Date(2026, 9, 12).getTime();
  const en = (dia: number, hora = 9) => new Date(2026, 9, dia, hora).getTime();
  const dias = armarAgenda(
    {
      pruebas: [{ id: 1, ramoId: 1, titulo: "Certamen 2 · Cálculo", inicioMs: en(14, 15), conHora: true }],
      entregas: [{ id: 1, curso: "Física", titulo: "Informe 3", entregaMs: en(15, 23), url: null, entregada: false }],
      eventos: [{ titulo: "Clase", lugar: null, inicioMs: en(15, 8), finMs: en(15, 10), todoElDia: false }, { titulo: "Lejos", lugar: null, inicioMs: en(30, 8), finMs: en(30, 9), todoElDia: false }],
    },
    HOY,
    35,
  );

  it("la lista muestra los 35 días que lee el puente, ni uno más", () => {
    assert.equal(dias.length, 3);
    assert.deepEqual(diasDeLaLista(dias, HOY).map((d) => new Date(d.diaMs).getDate()), [14, 15, 30]);
    const fuera = armarAgenda({ eventos: [{ titulo: "Muy lejos", lugar: null, inicioMs: new Date(2026, 10, 20, 9).getTime(), finMs: new Date(2026, 10, 20, 10).getTime(), todoElDia: false }] }, HOY, 60);
    assert.deepEqual(diasDeLaLista(fuera, HOY), []);
  });

  it("recuerda la vista y no se deja engañar por valores raros", () => {
    assert.equal(leerVista("semana"), "semana");
    for (const raro of [null, undefined, "", "mes", "SEMANA", "<b>"]) assert.equal(leerVista(raro), "lista");
  });

  it("navega de lunes a lunes y no pasa de 3 semanas", () => {
    assert.equal(inicioDeSemana(HOY, 0), LUNES);
    assert.equal(inicioDeSemana(HOY, 1), new Date(2026, 9, 19).getTime());
    assert.equal(inicioDeSemana(HOY, 3), new Date(2026, 10, 2).getTime());
    assert.deepEqual([-2, 0, 2, 3, 4, 99, NaN, 1.7].map(desplazamientoValido), [0, 0, 2, 3, 3, 3, 0, 1]);
  });

  it("titula la semana, también cuando cruza de mes", () => {
    assert.equal(tituloDeSemana(LUNES, 0), "Esta semana · 12–18 oct");
    assert.equal(tituloDeSemana(inicioDeSemana(HOY, 1), 1), "Próxima semana · 19–25 oct");
    assert.equal(tituloDeSemana(inicioDeSemana(HOY, 2), 2), "26 oct – 1 nov");
    assert.equal(letraDelDia(LUNES), "L");
    assert.equal(letraDelDia(new Date(2026, 9, 18).getTime()), "D");
  });

  it("dice la semana con palabras", () => {
    const semana = cargaDeLaSemana(dias, LUNES, HOY);
    assert.deepEqual(textoDeLaSemana(semana), { texto: "🔥 Semana pesada: 1 prueba y 1 entrega", pesada: true });
    const tranquila = cargaDeLaSemana(armarAgenda({ eventos: [{ titulo: "Clase", lugar: null, inicioMs: en(15, 8), finMs: en(15, 10), todoElDia: false }] }, HOY, 35), LUNES, HOY);
    assert.deepEqual(textoDeLaSemana(tranquila), { texto: "1 cosa agendada", pesada: false });
    assert.deepEqual(textoDeLaSemana(cargaDeLaSemana([], LUNES, HOY)), { texto: "Semana libre: nada agendado", pesada: false });
  });

  it("describe cada día y abre hoy de partida", () => {
    const semana = cargaDeLaSemana(dias, LUNES, HOY);
    assert.equal(descripcionDelDia(semana.dias[0]), "lunes 12 oct: ya pasó");
    assert.equal(descripcionDelDia(semana.dias[2]), "miércoles 14 oct: cargado · 1 cosa · 1 prueba");
    assert.equal(descripcionDelDia(semana.dias[4]), "viernes 16 oct: sin nada");
    assert.equal(diaDeInicio(semana), HOY - 10 * 3_600_000);
    const conAlgo = cargaDeLaSemana(dias, inicioDeSemana(HOY, 2), HOY);
    assert.equal(diaDeInicio(conAlgo), en(30, 0), "otra semana: el primer día con algo");
    assert.equal(diaDeInicio(cargaDeLaSemana(dias, inicioDeSemana(HOY, 3), HOY)), new Date(2026, 10, 2).getTime(), "sin nada: el lunes");
  });

  it("los puntos muestran primero lo fuerte y cuentan los que sobran", () => {
    const p = (tipo: any, fuerte = false) => ({ tipo, fuerte });
    const r = puntosVisibles([p("evento"), p("evento"), p("prueba", true), p("estudio"), p("tarea"), p("entrega", true)], 4);
    assert.deepEqual(r.puntos.map((x) => x.tipo), ["prueba", "entrega", "evento", "evento"]);
    assert.equal(r.resto, 2);
    assert.deepEqual(puntosVisibles([], 4), { puntos: [], resto: 0 });
  });
});
