// Prepara lo que la app lleva adentro para hablar con OpenClaw sin el repo:
//   src-tauri/recursos/puente.mjs  el puente (con sus dependencias)
//   src-tauri/recursos/mcp.mjs     el servidor MCP de gastos
//   src-tauri/recursos/node_modules/ws  la librería de WebSocket, que la de OpenClaw carga desde disco
//   src-tauri/recursos/configurar.mjs   el asistente "Configurar Brote"
//   src-tauri/recursos/hook.mjs         el hook de Claude Code del modo programador (sin dependencias)
//   src-tauri/recursos/skill/gastos     la skill de gastos para el agente
//   src-tauri/recursos/plantillas       la identidad de Brote (IDENTITY.md, SOUL.md)

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const recursos = join(app, "src-tauri", "recursos");

// En Windows `npx` es un .cmd y necesita la consola para ejecutarse.
execFileSync("npx", ["vite", "build", "--config", "vite.puente.config.ts"], {
  cwd: app,
  stdio: "inherit",
  shell: process.platform === "win32",
});

// `ws` tal como la usa @openclaw/gateway-client (misma versión fijada).
const desdeElCliente = createRequire(createRequire(join(app, "../../packages/adapter/package.json")).resolve("@openclaw/gateway-client"));
const ws = dirname(desdeElCliente.resolve("ws/package.json"));
rmSync(join(recursos, "node_modules"), { recursive: true, force: true });
mkdirSync(join(recursos, "node_modules"), { recursive: true });
cpSync(ws, join(recursos, "node_modules", "ws"), { recursive: true, dereference: true });

cpSync(join(app, "../../packages/motor/skill/gastos"), join(recursos, "skill", "gastos"), { recursive: true });
cpSync(join(app, "../../packages/adapter/plantillas"), join(recursos, "plantillas"), { recursive: true });
console.log(`Listo: ${recursos}`);
