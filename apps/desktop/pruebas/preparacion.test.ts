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

  it("el micrófono no se puede saber sin pedirlo: se explica y nunca figura como dado ni negado", () => {
    const lectura = { descargas: "sin-usar", automatizacion: {}, calendarios: "concedido" } as const;
    const con = filasPermisos({ ...activasDePreset("todo"), grabaciones: true }, lectura).find((f) => f.id === "microfono")!;
    assert.deepEqual(con.usadoPor.map((f) => f.id), ["grabaciones"]);
    assert.equal(con.estado, "no-se-sabe");
    assert.equal(con.falta, false);
    assert.equal(con.sobra, false);
    const sin = filasPermisos({ ...activasDePreset("todo"), grabaciones: false }, lectura).find((f) => f.id === "microfono")!;
    assert.equal(sin.sobra, true);
    assert.equal(filasPermisos(activasDePreset("todo"), null).find((f) => f.id === "microfono")!.estado, "no-se-sabe");
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
    const pasos: Paso[] = [ok("calendario-ical"), { ...ok("aula"), estado: "opcional" }, { ...ok("programador"), estado: "opcional" }, ok("memoria-local"), ok("statusline")];
    assert.deepEqual(funcionesSinConfigurar(activas, pasos).map((f) => f.id), ["aula", "programador"]);
    assert.deepEqual(funcionesSinConfigurar({ ...activas, aula: false, programador: false }, pasos), []);
  });
});

describe("Empezar sin IA y diagnóstico", () => {
  it("«Empezar sin IA» se ofrece cuando el script corrió y falta algo técnico (también sin Node del sistema)", async () => {
    const { puedeEmpezarSinIA, PASOS_DE_IA } = await import("../src/agente/preparacion.ts");
    assert.equal(PASOS_DE_IA.includes("node"), false);
    assert.equal(PASOS_DE_IA.includes("openclaw"), true);
    // Sin ningún Node, Rust solo devuelve el paso «Node»: no hay con qué correr nada.
    const sinNada: Paso[] = [{ id: "node", titulo: "Node", estado: "falta", detalle: "" }];
    assert.equal(puedeEmpezarSinIA(sinNada), false);
    // Node ok y la IA pendiente.
    const conNode = [ok("node"), automatico("openclaw"), ...TECNICOS.slice(2).map((id) => ({ ...ok(id), estado: "falta" as const }))];
    assert.equal(puedeEmpezarSinIA(conNode), true);
    // Con el Node de la app: el script corrió, el paso «Node» (del sistema) falta y la IA también.
    const conEmbebido = [{ ...ok("node"), estado: "falta" as const }, ...conNode.slice(1)];
    assert.equal(puedeEmpezarSinIA(conEmbebido), true);
    // Con todo listo no hace falta ofrecerlo.
    assert.equal(puedeEmpezarSinIA(TECNICOS.map(ok)), false);
  });

  it("sin IA quedan apagadas las funciones que la necesitan, y sus interruptores bloqueados", async () => {
    const { sinLasDeIA, bloqueadaSinIA } = await import("../src/agente/preparacion.ts");
    const todo = activasDePreset("todo");
    const apagadas = sinLasDeIA(todo);
    assert.equal(apagadas.especialistas, false);
    assert.equal(apagadas["memoria-local"], false);
    assert.equal(apagadas.gastos, true);
    assert.equal(todo.especialistas, true, "no cambia el original");
    assert.equal(bloqueadaSinIA("especialistas", true), true);
    assert.equal(bloqueadaSinIA("especialistas", false), false);
    assert.equal(bloqueadaSinIA("gastos", true), false);
  });

  it("el diagnóstico trae ids y estados, nunca el detalle de un paso (que puede traer rutas o errores)", async () => {
    const { armarDiagnostico } = await import("../src/agente/preparacion.ts");
    const pasos: Paso[] = [
      { id: "node", titulo: "Node", estado: "ok", detalle: "Node 24.1 en /Users/ana/.nvm/bin/node" },
      { id: "claude", titulo: "Claude Code", estado: "falta", detalle: "error: sk-ant-secreto" },
    ];
    const texto = armarDiagnostico({ version: "0.1.0", sistema: "macOS", pasos, activas: activasDePreset("inicio"), sinIA: true });
    assert.match(texto, /Brote 0\.1\.0 · macOS · sin IA/);
    assert.match(texto, /- node: ok/);
    assert.match(texto, /- claude: falta/);
    assert.match(texto, /Funciones prendidas: gastos, temporizadores, equipo, estudio/);
    assert.doesNotMatch(texto, /Users|ana|secreto|sk-ant/);
  });
});

describe("Preparar con el Node de la app", () => {
  it("sin Node del sistema no se arregla nada automático hasta instalarlo", () => {
    const pasos = [{ ...ok("node"), estado: "falta" as const }, automatico("openclaw"), ...TECNICOS.slice(2).map((id) => ({ ...ok(id), estado: "falta" as const }))];
    assert.equal(siguienteAutomatico(pasos, new Set()), undefined);
    assert.equal(preparacion(pasos, new Set()).hayAutomatico, false);
    assert.equal(siguienteAutomatico([ok("node"), ...pasos.slice(1)], new Set())?.id, "openclaw");
  });
});
