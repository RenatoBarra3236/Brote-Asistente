import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { MENSAJE_APAGADA_MCP } from "../src/funciones.ts";
import { atender } from "../src/mcp.ts";
import { guardarTranscripcion } from "../src/transcripciones-archivo.ts";
import { Ramos } from "../src/ramos.ts";
import { Repaso } from "../src/repaso.ts";

let gastos: Gastos;
let id = 0;

// Que las pruebas nunca hablen con el Brote real del computador (podrían pausar la música).
const CARPETA = mkdtempSync(join(tmpdir(), "mcp-puente-"));
process.env.ASISTENTE_CONEXION_HOOKS = join(CARPETA, "hooks.json");
// Y que usen sus propias funciones (todas prendidas), no las de Configurar Brote del computador.
process.env.ASISTENTE_FUNCIONES = join(CARPETA, "funciones.json");
// Y el plan de Claude guardado, tampoco el del computador.
process.env.ASISTENTE_PLAN = join(CARPETA, "plan.json");
// Y sus propias transcripciones, nunca las del computador.
process.env.ASISTENTE_TRANSCRIPCIONES = join(CARPETA, "transcripciones");
writeFileSync(process.env.ASISTENTE_FUNCIONES, JSON.stringify({ activas: Object.fromEntries(["gastos", "temporizadores", "calendario", "aula", "musica", "descargas", "equipo", "programador", "uso-del-plan", "grabaciones"].map((id) => [id, true])) }));
after(() => rmSync(CARPETA, { recursive: true, force: true }));

beforeEach(() => {
  gastos = new Gastos(":memory:");
});

function llamar(name: string, args: object): { texto: string; error: boolean } {
  const respuesta = atender(gastos, { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) as any;
  return { texto: respuesta.result.content[0].text, error: respuesta.result.isError === true };
}

async function llamarEsperando(name: string, args: object): Promise<{ texto: string; error: boolean }> {
  const respuesta = (await atender(gastos, { jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } })) as any;
  return { texto: respuesta.result.content[0].text, error: respuesta.result.isError === true };
}

describe("servidor MCP de gastos", () => {
  it("se presenta y lista sus herramientas", () => {
    const inicio = atender(gastos, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }) as any;
    assert.equal(inicio.result.protocolVersion, "2025-03-26");
    assert.deepEqual(inicio.result.capabilities, { tools: {} });
    const lista = atender(gastos, { jsonrpc: "2.0", id: 2, method: "tools/list" }) as any;
    assert.deepEqual(
      lista.result.tools.map((t: any) => t.name),
      ["gastos_anotar", "gastos_listar", "gastos_resumen", "gastos_presupuesto", "temporizador_crear", "temporizador_listar", "temporizador_cancelar", "equipo_estado", "descargas_recientes", "transcripciones_listar", "transcripciones_leer", "musica_estado", "musica_control", "calendario_proximos", "calendario_crear", "programador_sesiones", "aula_entregas", "claude_uso", "ramos_listar", "ramos_crear", "notas_resumen", "notas_necesaria", "notas_anotar", "agenda_proponer", "repaso_proponer", "motor_proponer_plantilla"],
    );
  });

  it("no responde a notificaciones y rechaza métodos desconocidos", () => {
    assert.equal(atender(gastos, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
    assert.equal((atender(gastos, { jsonrpc: "2.0", id: 3, method: "resources/list" }) as any).error.code, -32601);
  });

  it("anota, deduce la categoría y resume", () => {
    assert.match(llamar("gastos_anotar", { monto: 1500, descripcion: "pasaje de micro", fecha: "2026-10-01" }).texto, /\$1\.500 en pasaje de micro \(transporte\) el 2026-10-01/);
    llamar("gastos_anotar", { monto: 5000, descripcion: "almuerzo", fecha: "2026-10-01" });
    llamar("gastos_anotar", { monto: 3000, descripcion: "algo raro", categoria: "salud", fecha: "2026-10-02" });
    llamar("gastos_anotar", { monto: 9000, descripcion: "zapatillas", fecha: "2026-09-15" });

    const resumen = JSON.parse(llamar("gastos_resumen", { desde: "2026-10-01", hasta: "2026-10-02" }).texto);
    assert.equal(resumen.total, 9500);
    assert.equal(resumen.cantidad, 3);
    assert.deepEqual(resumen.porCategoria[0], { categoria: "comida", total: 5000, cantidad: 1 });

    const lista = JSON.parse(llamar("gastos_listar", { hasta: "2026-09-30" }).texto);
    assert.deepEqual(lista.gastos.map((g: any) => g.descripcion), ["zapatillas"]);
    assert.equal(lista.gastos[0].categoria, "otros");
  });

  it("le cuenta el presupuesto al agente, sin poder cambiarlo", () => {
    assert.equal(JSON.parse(llamar("gastos_presupuesto", {}).texto).presupuesto, null);
    gastos.ponerPresupuesto(200_000);
    llamar("gastos_anotar", { monto: 5000, descripcion: "almuerzo" });
    const p = JSON.parse(llamar("gastos_presupuesto", {}).texto);
    assert.equal(p.presupuestoMensual, 200_000);
    assert.equal(p.gastadoEsteMes, 5000);
    assert.equal(p.queda, 195_000);
    assert.ok(p.diasQueFaltan >= 1 && p.puedeGastarHoy <= p.porDia);
    const herramienta = (atender(gastos, { jsonrpc: "2.0", id: 9, method: "tools/list" }) as any).result.tools.find((t: any) => t.name === "gastos_presupuesto");
    assert.equal(herramienta.annotations.readOnlyHint, true);
    assert.deepEqual(herramienta.inputSchema.properties, {});
  });

  it("valida lo que recibe", () => {
    assert.equal(llamar("gastos_anotar", { monto: 2.5 }).error, true);
    assert.equal(llamar("gastos_anotar", { monto: -100 }).error, true);
    assert.equal(llamar("gastos_anotar", { monto: 100, categoria: "lujos" }).error, true);
    assert.equal(llamar("gastos_anotar", { monto: 100, fecha: "2026-02-31" }).error, true);
    assert.equal(llamar("gastos_borrar", { id: 1 }).error, true);
    assert.equal(gastos.ultimos(10).length, 0);
  });

  it("crea, lista y cancela temporizadores para el agente", () => {
    assert.match(llamar("temporizador_crear", { tipo: "pomodoro", etiqueta: "cálculo" }).texto, /pomodoro de 25 minutos — cálculo/);
    assert.match(llamar("temporizador_crear", { tipo: "temporizador", minutos: 10, etiqueta: "sacar la ropa" }).texto, /temporizador de 10 minutos/);
    assert.equal(llamar("temporizador_crear", { tipo: "temporizador" }).error, true);
    const lista = JSON.parse(llamar("temporizador_listar", {}).texto).temporizadores;
    assert.deepEqual(lista.map((t: any) => t.tipo).sort(), ["pomodoro", "temporizador"]);
    assert.equal(llamar("temporizador_cancelar", { tipo: "pomodoro" }).texto, "Cancelados: 1.");
    assert.equal(llamar("temporizador_cancelar", {}).texto, "Cancelados: 1.");
  });

  it("la música valida la acción y, sin reproductor, no hace nada", async () => {
    assert.equal((await llamarEsperando("musica_control", { accion: "subir-volumen" })).error, true);
    // En Linux (las pruebas) no hay música que leer: responde sin error.
    if (process.platform === "linux") {
      assert.match((await llamarEsperando("musica_estado", {})).texto, /No pude saber/);
      assert.match((await llamarEsperando("musica_control", { accion: "pausa" })).texto, /No hay música abierta/);
    }
  });

  it("con Brote abierto, la música y el calendario se los pide al puente (que tiene los permisos)", async () => {
    const pedidos: any[] = [];
    const inicio = Date.now() + 30 * 60_000;
    const servidor = createServer((pedido, respuesta) => {
      let texto = "";
      pedido.on("data", (parte) => (texto += parte));
      pedido.on("end", () => {
        if (pedido.headers.authorization !== "Bearer secreto") return respuesta.writeHead(401).end();
        const consulta = JSON.parse(texto);
        pedidos.push(consulta);
        const musica = { app: "Spotify", sonando: false, cancion: "Canción", artista: "Artista" };
        const cuerpo =
          consulta.tipo === "musica-estado" ? { musica }
          : consulta.tipo === "musica-control" ? { hecho: true, musica }
          : consulta.tipo === "calendario-crear" ? { resultado: { ok: true, calendario: "Universidad" } }
          : consulta.tipo === "aula"
            ? {
                entregas: [
                  { curso: "Física I", titulo: "Lab 4", entregaMs: Date.now() + 86_400_000, url: null, entregada: false },
                  { curso: "Física I", titulo: "Lab 3", entregaMs: Date.now() + 3_600_000, url: null, entregada: true },
                  { curso: "Química", titulo: "Informe final", entregaMs: Date.now() + 40 * 86_400_000, url: null, entregada: false },
                ],
              }
          : { eventos: [{ titulo: "Cálculo", lugar: "B-12", inicioMs: inicio, finMs: inicio + 3_600_000, todoElDia: false }] };
        respuesta.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(cuerpo));
      });
    });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    const { port } = servidor.address() as { port: number };
    writeFileSync(process.env.ASISTENTE_CONEXION_HOOKS!, JSON.stringify({ puerto: port, token: "secreto" }));
    try {
      assert.match((await llamarEsperando("musica_estado", {})).texto, /Canción/);
      assert.equal((await llamarEsperando("musica_control", { accion: "play" })).texto, "Hecho: play en Spotify.");
      const { eventos } = JSON.parse((await llamarEsperando("calendario_proximos", {})).texto);
      assert.deepEqual(eventos.map((e: any) => [e.titulo, e.lugar]), [["Cálculo", "B-12"]]);
      // Crear un evento también lo hace Brote (el MCP no tiene el permiso de Calendario).
      assert.match((await llamarEsperando("calendario_crear", { titulo: "Prueba de física", inicio: "2026-12-05 10:00", minutos: 90 })).texto, /Listo: «Prueba de física» .* «Universidad»/);
      // El aula también la lee Brote: por defecto solo lo pendiente de los próximos 14 días.
      const aula = JSON.parse((await llamarEsperando("aula_entregas", {})).texto);
      assert.deepEqual(aula.entregas.map((e: any) => [e.titulo, e.entregada]), [["Lab 4", false]]);
      const conEntregadas = JSON.parse((await llamarEsperando("aula_entregas", { dias: 60, incluirEntregadas: true })).texto);
      assert.equal(conEntregadas.entregas.length, 3);
      assert.deepEqual(pedidos.map((p) => p.tipo), ["musica-estado", "musica-control", "calendario", "calendario-crear", "aula", "aula"]);
      assert.equal(pedidos[3].evento.finMs - pedidos[3].evento.inicioMs, 90 * 60_000);
      assert.equal(pedidos[1].accion, "play");
    } finally {
      rmSync(process.env.ASISTENTE_CONEXION_HOOKS!, { force: true });
      servidor.close();
    }
  });

  it("claude_uso: el plan y los tokens que calcula Brote; sin Brote, solo el plan guardado", async () => {
    const reinicia = Date.now() + 2 * 3_600_000;
    const total = { entrada: 1000, salida: 2000, cache: 50_000, usd: 0.1234, sinPrecio: 0 };
    const periodo = { total, brote: { ...total, usd: 0.02 }, tuyas: { ...total, usd: 0.1034 }, porModelo: [{ modelo: "claude-sonnet-5", nombre: "Sonnet 5", total }], proyectos: [{ nombre: "tarea", brote: false, total }] };
    const servidor = createServer((pedido, respuesta) => {
      let texto = "";
      pedido.on("data", (parte) => (texto += parte));
      pedido.on("end", () => {
        assert.equal(JSON.parse(texto).tipo, "uso");
        const plan = { sesion: { porcentaje: 23, reiniciaMs: reinicia }, semana: null, modelo: "claude-sonnet-5", actualizadoMs: Date.now() };
        respuesta.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ plan, resumen: { hoy: periodo, semana: periodo, modelos: [], calculadoMs: 0 } }));
      });
    });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    writeFileSync(process.env.ASISTENTE_CONEXION_HOOKS!, JSON.stringify({ puerto: (servidor.address() as { port: number }).port, token: "secreto" }));
    try {
      const uso = JSON.parse((await llamarEsperando("claude_uso", {})).texto);
      assert.equal(uso.plan.sesion5h.porcentajeUsado, 23);
      assert.equal(uso.plan.semana, null);
      assert.equal(uso.tokens.hoy.total.valorApiUsd, 0.12);
      assert.equal(uso.tokens.ultimos7Dias.brote.valorApiUsd, 0.02);
      assert.deepEqual(uso.tokens.hoy.proyectosQueMasGastan.map((p: any) => p.proyecto), ["tarea"]);
    } finally {
      rmSync(process.env.ASISTENTE_CONEXION_HOOKS!, { force: true });
      servidor.close();
    }
    // Sin Brote abierto: el plan guardado (si sigue vigente) y sin tokens.
    writeFileSync(process.env.ASISTENTE_PLAN!, JSON.stringify({ version: 1, lectura: { sesion: null, semana: { porcentaje: 41, reiniciaMs: reinicia }, modelo: null, actualizadoMs: Date.now() }, avisados: [] }));
    const solo = JSON.parse((await llamarEsperando("claude_uso", {})).texto);
    assert.equal(solo.plan.semana.porcentajeUsado, 41);
    assert.equal(solo.tokens, null);
    assert.match(solo.tokensNoDisponibles, /Brote no está abierto/);
  });

  it("el aula responde aunque no haya ninguna conectada", async () => {
    const respuesta = await llamarEsperando("aula_entregas", {});
    if (process.platform === "linux") assert.match(respuesta.texto, /No hay aula conectada|entregas|aula/);
  });

  it("el calendario responde aunque no haya ninguno conectado", async () => {
    const respuesta = (await atender(gastos, { jsonrpc: "2.0", id: 99, method: "tools/call", params: { name: "calendario_proximos", arguments: {} } })) as any;
    assert.equal(respuesta.id, 99);
    if (process.platform === "linux") assert.match(respuesta.result.content[0].text, /No hay calendario conectado|No pude leer/);
  });

  it("crear eventos valida la fecha y, fuera del Mac, lo dice", async () => {
    assert.equal((await llamarEsperando("calendario_crear", { titulo: "Cálculo", inicio: "2026-02-31 10:00" })).error, true);
    assert.equal((await llamarEsperando("calendario_crear", { titulo: "Cálculo", inicio: "mañana" })).error, true);
    assert.equal((await llamarEsperando("calendario_crear", { titulo: " ", inicio: "2026-10-05 10:00" })).error, true);
    if (process.platform !== "darwin") {
      const r = await llamarEsperando("calendario_crear", { titulo: "Cálculo", inicio: "2026-12-05 10:00" });
      assert.deepEqual([r.error, /Calendario del Mac/.test(r.texto)], [true, true]);
    }
  });

  it("lista las descargas recientes sin abrirlas", () => {
    const carpeta = mkdtempSync(join(tmpdir(), "descargas-mcp-"));
    const antes = process.env.ASISTENTE_DESCARGAS;
    process.env.ASISTENTE_DESCARGAS = carpeta;
    try {
      writeFileSync(join(carpeta, "apunte.pdf"), "x".repeat(2048));
      writeFileSync(join(carpeta, "a medias.zip.crdownload"), "x");
      const { descargas } = JSON.parse(llamar("descargas_recientes", {}).texto);
      assert.deepEqual(descargas.map((d: any) => [d.nombre, d.tamano]), [["apunte.pdf", "2 KB"]]);
    } finally {
      if (antes === undefined) delete process.env.ASISTENTE_DESCARGAS;
      else process.env.ASISTENTE_DESCARGAS = antes;
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it("transcripciones: lista y lee por partes, solo de su carpeta", () => {
    const carpeta = process.env.ASISTENTE_TRANSCRIPCIONES!;
    const base = { fecha: "2026-10-04T10:30:00-03:00", duracionSeg: 600, origen: "pc" as const, modelo: "small", idioma: "es", avisoAPresentes: "si" as const };
    guardarTranscripcion({ ...base, id: "2026-10-04-103000", segmentos: [{ inicioSeg: 0, finSeg: 5, texto: "hola clase" }] }, carpeta);
    const larga = Array.from({ length: 400 }, (_, i) => ({ inicioSeg: i, finSeg: i + 1, texto: `frase ${i} de la clase de derivadas y límites` }));
    guardarTranscripcion({ ...base, id: "2026-10-05-090000", avisoAPresentes: "no", segmentos: larga }, carpeta);
    writeFileSync(join(carpeta, "../secreto.md"), "---\n---");

    const { transcripciones } = JSON.parse(llamar("transcripciones_listar", {}).texto);
    assert.deepEqual(transcripciones.map((t: any) => [t.id, t.avisoAPresentes]), [["2026-10-05-090000", "no"], ["2026-10-04-103000", "si"]]);
    assert.equal("texto" in transcripciones[0], false);

    assert.equal(JSON.parse(llamar("transcripciones_leer", { id: "2026-10-04-103000" }).texto).texto, "[00:00:00] hola clase");
    const primera = JSON.parse(llamar("transcripciones_leer", { id: "2026-10-05-090000" }).texto);
    assert.ok(primera.totalPartes >= 2);
    assert.equal(primera.parte, 1);
    const segunda = JSON.parse(llamar("transcripciones_leer", { id: "2026-10-05-090000", parte: 2 }).texto);
    assert.equal(segunda.parte, 2);
    assert.ok(segunda.desdeSeg > 0);
    assert.equal(llamar("transcripciones_leer", { id: "2026-10-05-090000", parte: 99 }).error, true);
    for (const id of ["../secreto", "2026-10-04-103000.md", "/etc/passwd", "no-existe", ""]) assert.equal(llamar("transcripciones_leer", { id }).error, true, id);
    assert.equal(llamar("transcripciones_leer", {}).error, true);
  });

  it("agenda_proponer: solo deja propuestas pendientes de una transcripción que existe", () => {
    const sig = new Date(Date.now() + 3 * 86_400_000);
    const fecha = `${sig.getFullYear()}-${String(sig.getMonth() + 1).padStart(2, "0")}-${String(sig.getDate()).padStart(2, "0")}`;
    const ok = llamar("agenda_proponer", { grabacion: "2026-10-04-103000", propuestas: [{ tipo: "tarea", titulo: "Guía 3", fecha }, { tipo: "evento", titulo: "Prueba", fecha }] });
    assert.match(ok.texto, /guardadas: 1/);
    assert.match(ok.texto, /Rechazadas/);
    assert.match(ok.texto, /todavía no está agregado nada/);
    assert.equal(llamar("agenda_proponer", { grabacion: "2026-01-01-000000", propuestas: [] }).error, true);
    assert.equal(llamar("agenda_proponer", { grabacion: "../x", propuestas: [] }).error, true);
  });

  it("repaso_proponer: deja una propuesta pendiente, dice qué dejó fuera y no guarda tarjetas", () => {
    const kit = { temas: [{ titulo: "Límites", puntos: ["Se acerca a un valor"] }], glosario: [{ termino: "Límite", definicion: "Valor al que se acerca la función" }], preguntas: [{ pregunta: "¿" + "a".repeat(250) + "?", respuesta: "x" }] };
    const ok = llamar("repaso_proponer", { grabacion: "2026-10-04-103000", ...kit });
    assert.match(ok.texto, /Propuesta guardada: 1 temas, 1 términos y 0 preguntas/);
    assert.match(ok.texto, /Se dejaron fuera/);
    assert.match(ok.texto, /todavía no está guardado nada/);
    assert.equal(new Repaso(gastos, new Ramos(gastos)).tarjetas().length, 0);
    assert.equal(new Repaso(gastos, new Ramos(gastos)).propuestas(Date.now()).length, 1);
  });

  it("repaso_proponer: rechaza ids raros, transcripciones que no existen, ramos desconocidos y kits vacíos", () => {
    const kit = { glosario: [{ termino: "Límite", definicion: "Valor al que se acerca la función" }] };
    assert.equal(llamar("repaso_proponer", { grabacion: "../x", ...kit }).error, true);
    assert.equal(llamar("repaso_proponer", { grabacion: "2026-01-01-000000", ...kit }).error, true);
    assert.equal(llamar("repaso_proponer", { grabacion: "2026-10-04-103000", ramo: "Ramo que no existe", ...kit }).error, true);
    assert.equal(llamar("repaso_proponer", { grabacion: "2026-10-04-103000" }).error, true);
  });

  it("repaso_proponer: con «grabaciones» o «estudio» apagadas no hace nada", async () => {
    const ruta = process.env.ASISTENTE_FUNCIONES!;
    const original = readFileSync(ruta, "utf8");
    const kit = { glosario: [{ termino: "Límite", definicion: "Valor al que se acerca la función" }] };
    try {
      await new Promise((listo) => setTimeout(listo, 15));
      writeFileSync(ruta, JSON.stringify({ activas: { grabaciones: false, estudio: true } }));
      assert.equal(llamar("repaso_proponer", { grabacion: "2026-10-04-103000", ...kit }).texto, MENSAJE_APAGADA_MCP);
      await new Promise((listo) => setTimeout(listo, 15));
      writeFileSync(ruta, JSON.stringify({ activas: { grabaciones: true, estudio: false } }));
      assert.equal(llamar("repaso_proponer", { grabacion: "2026-10-04-103000", ...kit }).texto, MENSAJE_APAGADA_MCP);
    } finally {
      await new Promise((listo) => setTimeout(listo, 15));
      writeFileSync(ruta, original);
    }
  });

  it("ramos: crea con alias, lista y rechaza lo inválido o repetido", () => {
    const ok = llamar("ramos_crear", { nombre: "Cálculo II", alias: ["calc"], color: "rojo" });
    assert.match(ok.texto, /agregué el ramo Cálculo II/);
    const lista = JSON.parse(llamar("ramos_listar", {}).texto);
    assert.deepEqual(lista.ramos.map((r: any) => [r.nombre, r.color, r.palabrasClave]), [["Cálculo II", "rojo", ["calc"]]]);
    assert.equal(llamar("ramos_crear", { nombre: "calculo ii" }).error, true);
    assert.equal(llamar("ramos_crear", { nombre: "x" }).error, true);
    assert.equal(llamar("ramos_crear", { nombre: "Física", color: "fucsia" }).error, true);
  });

  it("notas: define, anota, resume y calcula sin guardar", () => {
    llamar("ramos_crear", { nombre: "Cálculo" });
    assert.match(llamar("notas_anotar", { ramo: "cálculo", evaluacion: "Certamen 1", peso: 30 }).texto, /agregué Certamen 1 \(30 %\)/);
    llamar("notas_anotar", { ramo: "cálculo", evaluacion: "Certamen 2", peso: 70 });
    assert.match(llamar("notas_anotar", { ramo: "cálculo", evaluacion: "certamen 1", nota: 4.2 }).texto, /quedó con 4,2/);
    const resumen = JSON.parse(llamar("notas_resumen", { ramo: "cálculo" }).texto);
    assert.equal(resumen.promedio, 4.2);
    assert.equal(resumen.veredicto, "alcanza");
    const n = JSON.parse(llamar("notas_necesaria", { ramo: "cálculo", evaluacion: "certamen 2", hipoteticas: { "certamen 1": 7 } }).texto);
    assert.equal(n.redondeada, 2.8); // (400 − 7×30) ÷ 70 = 2,71
    assert.equal(JSON.parse(llamar("notas_resumen", { ramo: "cálculo" }).texto).evaluaciones[0].nota, 4.2);
  });

  it("notas: lo inválido se rechaza", () => {
    llamar("ramos_crear", { nombre: "Física" });
    assert.equal(llamar("notas_anotar", { ramo: "química", evaluacion: "Control", peso: 20 }).error, true);
    assert.equal(llamar("notas_anotar", { ramo: "física", evaluacion: "Control" }).error, true);
    assert.equal(llamar("notas_anotar", { ramo: "física", evaluacion: "Control", peso: 20, nota: 9 }).error, true);
    assert.equal(llamar("notas_necesaria", { ramo: "física", evaluacion: "examen" }).error, true);
    assert.equal(llamar("notas_necesaria", { ramo: "física", evaluacion: "nada" }).error, true);
  });

  it("ramos: con la función apagada no hace nada", async () => {
    const ruta = process.env.ASISTENTE_FUNCIONES!;
    const original = readFileSync(ruta, "utf8");
    try {
      await new Promise((listo) => setTimeout(listo, 15));
      writeFileSync(ruta, JSON.stringify({ activas: { estudio: false } }));
      assert.equal(llamar("ramos_listar", {}).texto, MENSAJE_APAGADA_MCP);
      assert.equal(llamar("ramos_crear", { nombre: "Historia" }).texto, MENSAJE_APAGADA_MCP);
      assert.equal(llamar("notas_resumen", {}).texto, MENSAJE_APAGADA_MCP);
      assert.equal(llamar("notas_anotar", { ramo: "x", evaluacion: "y" }).texto, MENSAJE_APAGADA_MCP);
    } finally {
      await new Promise((listo) => setTimeout(listo, 15));
      writeFileSync(ruta, original);
    }
  });

  it("transcripciones: con la función apagada no lee nada", async () => {
    const ruta = process.env.ASISTENTE_FUNCIONES!;
    const original = readFileSync(ruta, "utf8");
    try {
      await new Promise((listo) => setTimeout(listo, 15));
      writeFileSync(ruta, JSON.stringify({ activas: { grabaciones: false } }));
      assert.equal(llamar("transcripciones_listar", {}).texto, MENSAJE_APAGADA_MCP);
      assert.equal(llamar("transcripciones_leer", { id: "2026-10-04-103000" }).texto, MENSAJE_APAGADA_MCP);
      assert.equal(llamar("agenda_proponer", { grabacion: "2026-10-04-103000", propuestas: [] }).texto, MENSAJE_APAGADA_MCP);
    } finally {
      await new Promise((listo) => setTimeout(listo, 15));
      writeFileSync(ruta, original);
    }
  });
});
