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
```

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
- [ ] Paso 3: prueba del Gateway
- [ ] Paso 4: personaje base
- [ ] Paso 5: personaje conectado al agente
- [ ] Paso 6: motor de comandos y skill de gastos
- [ ] Paso 7: motor que aprende
- [ ] Paso 8: continuidad y memoria
- [ ] Paso 9: lo que sé de ti
- [ ] Paso 10: pulido y demo
