import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Gastos } from "../src/gastos.ts";
import { Motor } from "../src/motor.ts";
import { type LecturaEquipo, Vigilante, describirEquipo, formatearBytes, interpretarPs } from "../src/sistema.ts";

const GB = 1024 ** 3;
const base: LecturaEquipo = { bateria: { porcentaje: 80, conectado: false }, cpu: 0.2, disco: { libre: 200 * GB, total: 500 * GB }, procesoPesado: null };
const con = (cambios: Partial<LecturaEquipo>): LecturaEquipo => ({ ...base, ...cambios });
const tipos = (r: { avisos: { tipo: string }[] }) => r.avisos.map((a) => a.tipo);

describe("Brote reacciona al computador", () => {
  it("batería baja: cansado y un solo aviso, aunque oscile; crítica avisa otra vez", () => {
    const v = new Vigilante();
    assert.deepEqual(v.evaluar(base, 0), { animo: null, avisos: [] });
    const baja = v.evaluar(con({ bateria: { porcentaje: 19, conectado: false } }), 1);
    assert.equal(baja.animo, "cansado");
    assert.deepEqual(tipos(baja), ["bateria-baja"]);
    assert.deepEqual(tipos(v.evaluar(con({ bateria: { porcentaje: 21, conectado: false } }), 2)), []);
    assert.deepEqual(tipos(v.evaluar(con({ bateria: { porcentaje: 18, conectado: false } }), 3)), []);
    assert.deepEqual(tipos(v.evaluar(con({ bateria: { porcentaje: 9, conectado: false } }), 4)), ["bateria-critica"]);
    assert.deepEqual(tipos(v.evaluar(con({ bateria: { porcentaje: 8, conectado: false } }), 5)), []);
  });

  it("al enchufarlo después de avisar, celebra; enchufado no está cansado", () => {
    const v = new Vigilante();
    v.evaluar(con({ bateria: { porcentaje: 15, conectado: false } }), 0);
    const enchufado = v.evaluar(con({ bateria: { porcentaje: 15, conectado: true } }), 1);
    assert.equal(enchufado.animo, null);
    assert.deepEqual(enchufado.avisos.map((a) => [a.tipo, a.celebrar]), [["cargando", true]]);
    // Sin un aviso previo, enchufarlo no dice nada.
    assert.deepEqual(tipos(new Vigilante().evaluar(con({ bateria: { porcentaje: 50, conectado: true } }), 0)), []);
  });

  it("CPU alta: solo si dura 30 s, acalorado, y un aviso cada 20 min con el culpable", () => {
    const v = new Vigilante();
    const alta = con({ cpu: 0.95, procesoPesado: "Google Chrome" });
    assert.deepEqual(v.evaluar(alta, 0), { animo: null, avisos: [] });
    assert.equal(v.evaluar(alta, 20_000).animo, null);
    const caliente = v.evaluar(alta, 30_000);
    assert.equal(caliente.animo, "acalorado");
    assert.match(caliente.avisos[0].texto, /CPU 95%\)\. Google Chrome es el que más/);
    assert.deepEqual(tipos(v.evaluar(alta, 60_000)), []);
    // Baja entre medio (histéresis): vuelve a contar desde cero.
    assert.equal(v.evaluar(con({ cpu: 0.5 }), 61_000).animo, null);
    assert.equal(v.evaluar(alta, 62_000).animo, null);
    assert.deepEqual(tipos(v.evaluar(alta, 62_000 + 20 * 60_000)), ["cpu-alta"]);
  });

  it("disco casi lleno: un aviso al día", () => {
    const v = new Vigilante();
    const lleno = con({ disco: { libre: 4 * GB, total: 500 * GB } });
    assert.match(v.evaluar(lleno, 0).avisos[0].texto, /4,0 GB libres/);
    assert.deepEqual(tipos(v.evaluar(lleno, 60 * 60_000)), []);
    assert.deepEqual(tipos(v.evaluar(lleno, 24 * 60 * 60_000)), ["disco-lleno"]);
  });

  it("sin batería ni CPU todavía, no pasa nada", () => {
    assert.deepEqual(new Vigilante().evaluar({ bateria: null, cpu: null, disco: null, procesoPesado: null }, 0), { animo: null, avisos: [] });
  });

  it("describe el estado", () => {
    assert.equal(describirEquipo(base), "🔋 Batería 80% · 🧠 CPU 20% · 💾 200 GB libres de 500 GB");
    assert.equal(describirEquipo(con({ bateria: { porcentaje: 12, conectado: false } })).startsWith("🪫 Batería 12%"), true);
    assert.equal(formatearBytes(4.25 * GB), "4,3 GB");
  });

  it("«¿cómo está el computador?» sin IA", () => {
    const motor = new Motor(new Gastos(":memory:"), { equipo: () => base });
    for (const frase of ["¿Cómo está el computador?", "qué tal anda mi notebook", "cuánta batería me queda", "cuánto espacio me queda"]) {
      assert.equal(motor.resolver(frase)?.texto, describirEquipo(base), frase);
    }
    // Sin lecturas (por ejemplo, en el servidor MCP), va al agente.
    assert.equal(new Motor(new Gastos(":memory:")).resolver("cómo está el computador"), null);
  });

  it("lee la salida de ps y junta los procesos con el mismo nombre", () => {
    const salida = [
      "42081  40.2 1983520 com.apple.Virtualization.VirtualMachine",
      "26330   0.8 1027168 node",
      "91663  52.6 766416 Claude Helper (Renderer)",
      "91664   1.0 102400 node",
      "basura sin formato",
    ].join("\n");
    const procesos = interpretarPs(salida);
    assert.deepEqual(procesos.find((p) => p.nombre === "node"), { nombre: "node", cpu: 1.8, memoria: (1027168 + 102400) * 1024 });
    assert.equal(procesos.length, 3);
    assert.equal(describirEquipo(con({ memoria: { total: 24 * GB, libre: 6 * GB } })).includes("🧮 RAM 18 GB de 24 GB en uso"), true);
  });
});
