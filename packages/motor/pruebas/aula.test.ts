import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  AvisadorEntregas,
  cuandoVence,
  describirEntregas,
  errorMoodle,
  interpretarCanvas,
  interpretarMoodle,
  leerAula,
  leerConfigAula,
  normalizarUrlAula,
  pedidoMoodle,
  pedidosCanvas,
  pendientes,
  type ConfigAula,
  type Entrega,
} from "../src/aula.ts";

const datos = (nombre: string) => JSON.parse(readFileSync(new URL(`./datos/${nombre}`, import.meta.url), "utf8"));
const AHORA = Date.parse("2026-10-05T15:00:00Z");
const HORA = 3_600_000;
const CANVAS: ConfigAula = { tipo: "canvas", url: "https://canvas.ejemplo.cl", token: "1234~TokenDePruebaNoReal0000" };
const MOODLE: ConfigAula = { tipo: "moodle", url: "https://aula.ejemplo.cl", token: "0123456789abcdef0123456789abcdef" };

describe("aula: configuración", () => {
  it("lee aula.json y rechaza lo que no es https o un token raro", () => {
    const carpeta = mkdtempSync(join(tmpdir(), "aula-"));
    const ruta = join(carpeta, "aula.json");
    writeFileSync(ruta, JSON.stringify({ tipo: "canvas", url: "https://canvas.ejemplo.cl/", token: CANVAS.token }));
    assert.deepEqual(leerConfigAula(ruta), CANVAS);
    for (const malo of [
      { tipo: "canvas", url: "http://canvas.ejemplo.cl", token: CANVAS.token },
      { tipo: "blackboard", url: CANVAS.url, token: CANVAS.token },
      { tipo: "moodle", url: CANVAS.url, token: "corto" },
      { tipo: "moodle", url: CANVAS.url, token: "con espacio 1234567890123" },
    ]) {
      writeFileSync(ruta, JSON.stringify(malo));
      assert.equal(leerConfigAula(ruta), null, JSON.stringify(malo));
    }
    assert.equal(leerConfigAula(join(carpeta, "no-existe.json")), null);
    assert.equal(normalizarUrlAula("https://aula.ejemplo.cl/moodle/"), "https://aula.ejemplo.cl/moodle");
    for (const mala of ["https://x.cl/?a=1", "https://user@x.cl", "file:///etc/passwd", "x.cl"]) assert.equal(normalizarUrlAula(mala), null, mala);
  });
});

describe("aula: pedidos", () => {
  it("Canvas: las tres rutas de la API con el token en la cabecera", () => {
    const pedidos = pedidosCanvas(CANVAS);
    assert.equal(pedidos.todo.url, "https://canvas.ejemplo.cl/api/v1/users/self/todo?per_page=100");
    assert.equal(pedidos.proximos.url, "https://canvas.ejemplo.cl/api/v1/users/self/upcoming_events?per_page=100");
    assert.equal(pedidos.cursos.url, "https://canvas.ejemplo.cl/api/v1/courses?enrollment_state=active&per_page=100");
    assert.equal(pedidos.todo.init.headers.authorization, `Bearer ${CANVAS.token}`);
    for (const p of Object.values(pedidos)) assert.ok(!p.url.includes(CANVAS.token));
  });

  it("Moodle: POST a server.php con el token en el cuerpo, nunca en la URL", () => {
    const pedido = pedidoMoodle(MOODLE, "core_enrol_get_users_courses", { userid: 42 });
    assert.equal(pedido.url, "https://aula.ejemplo.cl/webservice/rest/server.php");
    assert.equal(pedido.init.method, "POST");
    const cuerpo = new URLSearchParams(pedido.init.body);
    assert.equal(cuerpo.get("wstoken"), MOODLE.token);
    assert.equal(cuerpo.get("wsfunction"), "core_enrol_get_users_courses");
    assert.equal(cuerpo.get("moodlewsrestformat"), "json");
    assert.equal(cuerpo.get("userid"), "42");
  });
});

describe("aula: normalizar", () => {
  it("Canvas: junta por hacer y próximos, ignora eventos y lo que no es del estudiante", () => {
    const entregas = interpretarCanvas(datos("canvas-todo.json"), datos("canvas-upcoming.json"), datos("canvas-courses.json"));
    assert.deepEqual(
      entregas.map((e) => [e.curso, e.titulo, new Date(e.entregaMs).toISOString(), e.entregada]),
      [
        ["Cálculo II", "Informe 2: derivadas", "2026-10-06T02:59:59.000Z", false],
        ["Álgebra Lineal", "Tarea 1: vectores", "2026-10-07T03:59:00.000Z", true],
        ["Álgebra Lineal", "Control 3", "2026-10-09T22:00:00.000Z", false],
        ["Cálculo II", "Proyecto final", "2026-10-20T03:59:00.000Z", false],
      ],
    );
    assert.equal(entregas[0].url, "https://canvas.ejemplo.cl/courses/101/assignments/5001");
    // Un enlace que no es https no se guarda.
    assert.equal(entregas[3].url, null);
    assert.deepEqual(interpretarCanvas(null, { error: "x" }, undefined), []);
  });

  it("Moodle: action events con su curso; sin acción = ya hecho", () => {
    const entregas = interpretarMoodle(datos("moodle-eventos.json"), datos("moodle-courses.json"));
    assert.deepEqual(
      entregas.map((e) => [e.curso, e.titulo, e.entregaMs, e.entregada]),
      [
        ["Física I", "Foro 1", 1791115200000, false],
        ["Física I", "Laboratorio 4", 1791327600000, false],
        ["Química General", "Cuestionario 2", 1791583200000, false],
      ],
    );
    assert.equal(entregas[1].url, "https://aula.ejemplo.cl/mod/assign/view.php?id=901&action=editsubmission");
    const sinAccion = interpretarMoodle({ events: [{ activityname: "Hecho", timesort: 1791327600, course: { id: 11 } }] }, datos("moodle-courses.json"));
    assert.deepEqual(sinAccion.map((e) => [e.curso, e.entregada]), [["Física I", true]]);
  });

  it("Moodle: reconoce sus errores (llegan con HTTP 200)", () => {
    assert.equal(errorMoodle({ exception: "moodle_exception", errorcode: "invalidtoken", message: "Token no válido" }), "token");
    assert.equal(errorMoodle({ exception: "x", errorcode: "invalidparameter" }), "respuesta");
    assert.equal(errorMoodle(datos("moodle-site-info.json")), null);
    assert.equal(errorMoodle([]), null);
  });
});

/** Un `fetch` falso que responde según la URL (y, en Moodle, según wsfunction). */
function falso(respuestas: Record<string, { status?: number; json: unknown }>, vistos: { url: string; init: any }[] = []) {
  return async (url: string, init: any) => {
    vistos.push({ url, init });
    const funcion = init.body ? new URLSearchParams(init.body).get("wsfunction") : null;
    const clave = funcion ?? Object.keys(respuestas).find((k) => url.includes(k));
    const r = clave ? respuestas[clave] : undefined;
    if (!r) throw new Error("sin red");
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.json };
  };
}

describe("aula: leer", () => {
  it("Canvas de punta a punta", async () => {
    const lectura = await leerAula(
      CANVAS,
      AHORA,
      falso({ "/todo": { json: datos("canvas-todo.json") }, "/upcoming_events": { json: datos("canvas-upcoming.json") }, "/courses": { json: datos("canvas-courses.json") } }),
    );
    assert.ok("entregas" in lectura);
    assert.equal(lectura.entregas.length, 4);
  });

  it("Moodle de punta a punta (pide el id del usuario primero)", async () => {
    const vistos: { url: string; init: any }[] = [];
    const lectura = await leerAula(
      MOODLE,
      AHORA,
      falso(
        {
          core_webservice_get_site_info: { json: datos("moodle-site-info.json") },
          core_enrol_get_users_courses: { json: datos("moodle-courses.json") },
          core_calendar_get_action_events_by_timesort: { json: datos("moodle-eventos.json") },
        },
        vistos,
      ),
    );
    assert.ok("entregas" in lectura);
    assert.equal(lectura.entregas.length, 3);
    const eventos = vistos.find((v) => v.init.body.includes("action_events"))!;
    assert.equal(new URLSearchParams(eventos.init.body).get("timesortfrom"), String((AHORA - 24 * HORA) / 1000));
    assert.ok(vistos.every((v) => !v.url.includes(MOODLE.token)));
  });

  it("errores: token vencido, sin red, respuesta rara; nunca lanza", async () => {
    assert.deepEqual(await leerAula(CANVAS, AHORA, falso({ "/todo": { status: 401, json: {} }, "/upcoming_events": { json: [] } })), { error: "token" });
    assert.deepEqual(await leerAula(CANVAS, AHORA, falso({})), { error: "red" });
    assert.deepEqual(await leerAula(MOODLE, AHORA, falso({ core_webservice_get_site_info: { json: { exception: "e", errorcode: "invalidtoken" } } })), { error: "token" });
    assert.deepEqual(await leerAula(MOODLE, AHORA, falso({ core_webservice_get_site_info: { json: { sitename: "x" } } })), { error: "respuesta" });
  });
});

describe("aula: describir y avisar", () => {
  const entregas = interpretarCanvas(datos("canvas-todo.json"), datos("canvas-upcoming.json"), datos("canvas-courses.json"));

  it("pendientes: sin las entregadas ni las vencidas, opcionalmente esta semana", () => {
    assert.deepEqual(pendientes(entregas, AHORA).map((e) => e.titulo), ["Informe 2: derivadas", "Control 3", "Proyecto final"]);
    assert.deepEqual(pendientes(entregas, AHORA, 7).map((e) => e.titulo), ["Informe 2: derivadas", "Control 3"]);
  });

  it("cuánto falta", () => {
    assert.equal(cuandoVence(AHORA + 45 * 60_000, AHORA), "en 45 min");
    assert.equal(cuandoVence(AHORA + 3 * HORA + 20 * 60_000, AHORA), "en 3 h 20 min");
    assert.equal(cuandoVence(AHORA - 1, AHORA), "ya venció");
    const manana = new Date(AHORA);
    manana.setDate(manana.getDate() + 1);
    manana.setHours(23, 59, 0, 0);
    assert.equal(cuandoVence(manana.getTime(), AHORA), "mañana a las 23:59");
    assert.match(cuandoVence(AHORA + 15 * 24 * HORA, AHORA), /^el \d\d\/\d\d$/);
  });

  it("describe las entregas (sin aula, al día y con lista)", () => {
    assert.match(describirEntregas(null, AHORA), /Configurar Brote/);
    assert.equal(describirEntregas([], AHORA), "📚 No tienes entregas pendientes. ¡Al día! 🌱");
    assert.equal(describirEntregas(entregas.slice(3), AHORA, true), "📚 No tienes entregas esta semana. ¡A disfrutar! 🌱");
    const texto = describirEntregas(entregas, AHORA, true);
    assert.match(texto, /^📚 Esta semana tienes 2 entregas:\n• Informe 2: derivadas \(Cálculo II\): /);
    assert.ok(!texto.includes("Tarea 1"));
    assert.match(describirEntregas(entregas, AHORA), /Tienes 3 entregas pendientes/);
  });

  it("avisa 24 h y 2 h antes, una vez cada uno; al abrir tarde, solo el más cercano", () => {
    const e: Entrega = { curso: "Física I", titulo: "Lab 4", entregaMs: AHORA + 30 * HORA, url: null, entregada: false };
    const avisador = new AvisadorEntregas();
    assert.deepEqual(avisador.revisar([e], AHORA), []);
    const a24 = avisador.revisar([e], AHORA + 6 * HORA);
    assert.equal(a24.length, 1);
    assert.match(a24[0], /Mañana a esta hora vence «Lab 4» \(Física I\)/);
    assert.deepEqual(avisador.revisar([e], AHORA + 7 * HORA), []);
    const a2 = avisador.revisar([e], AHORA + 28 * HORA + 60_000);
    assert.equal(a2.length, 1);
    assert.match(a2[0], /En 2 horas vence «Lab 4»/);
    assert.deepEqual(avisador.revisar([e], AHORA + 29 * HORA), []);
    // Entregada o vencida: nada.
    assert.deepEqual(new AvisadorEntregas().revisar([{ ...e, entregada: true }], AHORA + 29 * HORA), []);
    assert.deepEqual(new AvisadorEntregas().revisar([e], AHORA + 31 * HORA), []);
    // Brote se abre 1 h antes: solo el de 2 h.
    const tarde = new AvisadorEntregas().revisar([e], AHORA + 29 * HORA);
    assert.equal(tarde.length, 1);
    assert.match(tarde[0], /En 2 horas/);
  });
});

describe("aula: frases sin IA", async () => {
  const { Motor } = await import("../src/motor.ts");
  const { Gastos } = await import("../src/gastos.ts");
  const gastos = new Gastos(":memory:");
  const entregas = interpretarCanvas(datos("canvas-todo.json"), datos("canvas-upcoming.json"), datos("canvas-courses.json"));
  const motor = new Motor(gastos, { aula: () => entregas, reloj: () => new Date(AHORA) });

  it("entiende las preguntas por entregas", () => {
    for (const frase of ["¿Qué entregas tengo?", "mis entregas", "¿qué tengo que entregar?", "¿Qué me falta entregar?", "cuáles tareas tengo que entregar", "mis entregas pendientes"]) {
      const r = motor.resolver(frase);
      assert.equal(r?.intencion, "aula-entregas", frase);
      assert.match(r!.texto, /Tienes 3 entregas pendientes/, frase);
    }
    for (const frase of ["¿Qué tengo que entregar esta semana?", "¿qué tareas tengo esta semana?", "mis entregas de esta semana"]) {
      const r = motor.resolver(frase);
      assert.equal(r?.intencion, "aula-semana", frase);
      assert.match(r!.texto, /Esta semana tienes 2 entregas/, frase);
    }
  });

  it("no se confunde con conversaciones", () => {
    for (const frase of ["ayúdame con mi tarea de cálculo", "¿cómo entrego la tarea en Canvas?", "explícame qué es una entrega"]) {
      assert.equal(motor.resolver(frase), null, frase);
    }
  });

  it("sin aula conectada responde cómo conectarla; sin la opción, va al agente", () => {
    assert.match(new Motor(gastos, { aula: () => null }).resolver("mis entregas")!.texto, /Configurar Brote/);
    assert.equal(new Motor(gastos).resolver("mis entregas"), null);
  });
});
