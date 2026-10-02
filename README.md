# Asistente multiplataforma: prototipo

Un personaje animado que vive en el PC, conectado a un agente de IA ([OpenClaw](https://github.com/openclaw/openclaw)), que hace tareas básicas sin IA y sigue siendo el mismo agente cuando le hablas desde el celular.

## Requisitos

| Herramienta | Versión |
| --- | --- |
| Node | 24.16 o superior |
| pnpm | 12.8.1 |
| Rust | estable (vía rustup) |
| Xcode Command Line Tools | — |
| OpenClaw | 2026.9.7 (fija durante el prototipo) |

## Configurar OpenClaw

Para el prototipo, OpenClaw usa el Claude Code instalado en el equipo con la cuenta del desarrollador (runtime `claude-cli`), sin API key. Es solo para desarrollo personal; nunca se usa el método `setup-token`.

```bash
npm install -g openclaw@2026.9.7 --allow-scripts=openclaw
openclaw onboard --install-daemon
openclaw exec-policy preset cautious
```

El último comando es importante: por defecto OpenClaw deja que el agente ejecute cualquier comando sin preguntar. Con `cautious`, pide permiso para todo lo que no esté en la lista permitida.

El personaje se conecta al Gateway con una identidad de dispositivo propia, que se crea sola la primera vez en `~/.asistente-prototipo/dispositivo.json`, fuera del repositorio.

En `~/.openclaw/openclaw.json`, el modelo principal es `anthropic/claude-sonnet-5-5` con `agentRuntime: { id: "claude-cli" }`, y el Gateway escucha solo en `127.0.0.1:18789`. Para comprobarlo:

```bash
openclaw config validate
openclaw gateway status
```

## Estructura

Monorepo con pnpm. Cada pieza se crea en su paso del plan:

| Carpeta | Qué es | Paso |
| --- | --- | --- |
| `packages/adapter` | Conexión al Gateway de OpenClaw | 3 |
| `apps/desktop` | El personaje en el PC (Tauri 2 + Canvas) | 4 |
| `packages/commands` | Motor de comandos sin IA, que aprende frases nuevas | 6 y 7 |
| `packages/skill-gastos` | Servidor MCP con la skill de gastos | 6 |

## Estado

- [x] Paso 1: preparar el entorno
- [x] Paso 2: estudiar las referencias ([resumen](docs/referencias-tecnicas.md))
- [x] Paso 3: prueba del Gateway (`pnpm --dir packages/adapter spike "mensaje"`)
- [x] Paso 4: personaje base (`pnpm --dir apps/desktop tauri dev`; en macOS vive en el notch, en el resto en una ventana flotante)
- [x] Paso 5: personaje conectado al agente (habla con OpenClaw a través de un puente Node; `ASISTENTE_SIMULADO=1` usa el simulador)
- [x] Paso 6: motor de comandos y skill de gastos (`pnpm --dir packages/motor test`; skill: `openclaw mcp add gastos --command node --arg <repo>/packages/motor/src/mcp.ts`)
- [x] Paso 7: motor que aprende (el agente resuelve, el motor deduce la plantilla y el usuario la confirma en la isla)
- [x] Paso 8: continuidad y memoria (memoria de OpenClaw con embeddings locales; el celular llega con la app propia)
- [x] Paso 9: lo que sé de ti (🧠 en la isla o "¿qué sabes de mí?": ver, corregir y olvidar lo que Brote recuerda)
- [ ] Paso 10: pulido y demo
