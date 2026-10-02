# Asistente multiplataforma — prototipo

Personaje animado que vive en el PC (y más adelante en el celular y en su "casa" física), conectado a un agente de IA ([OpenClaw](https://github.com/openclaw/openclaw)). Rumbo elegido: estudiantes, con dos pilares, estudio y plata.

- Plan completo, decisiones y roadmap: doc "Asistente multiplataforma: plan final" (https://claude.ai/code/artifact/19af47bd-49d9-4938-8505-f2f8687fea3d), pestaña **Prototipo inicial**.
- Hallazgos técnicos del Gateway: `docs/referencias-tecnicas.md`. Leer antes de tocar la conexión al agente.

## Convenciones

- Todo en español: código, nombres, comentarios, commits y respuestas al usuario.
- TypeScript en monorepo pnpm (`apps/*`, `packages/*`). Rust solo donde Tauri lo exige.
- Versiones fijadas: OpenClaw y `@openclaw/gateway-client`/`-protocol` en **2026.9.7**; no actualizar durante el prototipo.
- El personaje actual (cuerpo crema con brote) es provisional; no copiar personajes ni dibujos de otros proyectos (Mochi de Coucou, sprites de OC-Claw). KKClaw tiene licencia solo personal: no copiar su código.
- Commits: el usuario usa GitHub Desktop; solo hacer commit o push cuando lo pida.

## Cómo ejecutar

- Personaje en el PC: `pnpm --dir apps/desktop tauri dev` (necesita `export PATH="$HOME/.cargo/bin:$PATH"`). Teclas 1–6 cambian el estado; Cmd + Q cierra (en macOS no hay ícono en el Dock). Habla con OpenClaw de verdad (gasta el plan del usuario); con `ASISTENTE_SIMULADO=1` usa el simulador.
- Pruebas y tipos del personaje: `pnpm --dir apps/desktop test` y `pnpm --dir apps/desktop tipos` (las pruebas corren con `node --test`, sin compilar).
- Motor de comandos: `pnpm --dir packages/motor test`.
- Puente solo, para depurar: `pnpm --dir packages/adapter puente` (pedidos JSON por la entrada, avisos por la salida).
- Prueba del Gateway: `pnpm --dir packages/adapter spike "mensaje"`. Con `SPIKE_APROBACION=allow-once` responde las solicitudes de permiso.
- Gateway de OpenClaw: `openclaw gateway status` / `openclaw gateway restart`. Config en `~/.openclaw/openclaw.json` (no versionar; tiene el token).

## Trampas conocidas

- pnpm 12 no acepta `-s`.
- OpenClaw usa el runtime `claude-cli` (Claude Code del usuario, cuenta Pro) con `anthropic/claude-sonnet-5-5`. Nunca usar el método `setup-token`.
- Política de comandos: `openclaw exec-policy preset cautious`. Por defecto OpenClaw ejecuta todo sin preguntar.
- Sin identidad de dispositivo el Gateway solo da `operator.read`. La identidad está en `~/.asistente-prototipo/dispositivo.json` (`packages/adapter/src/identidad.ts`).
- Eventos reales grabados del Gateway (anonimizados, uno por línea, tal como llegan a `onEvent`) en `packages/adapter/ejemplos/`: respuesta simple, respuesta con herramienta y aprobación permitida. `aprobacion-rechazada.jsonl` y `error.jsonl` están **armados** con la misma forma (ver su README). Sirven para pruebas sin OpenClaw.
- `apps/desktop/src/agente/` se importa desde Node en las pruebas: imports entre sus archivos con extensión `.ts`, `import type` para los tipos y nada que Node no pueda borrar (enums, propiedades en el constructor).
- Conexión real: Rust (`src-tauri/src/puente.rs`) lanza `node packages/adapter/src/puente.ts` (ruta fija del repo, solo sirve en desarrollo; `node` debe estar en el PATH o en `ASISTENTE_NODE`). Pedidos por la entrada estándar con el comando `agente_escribir`; cada línea de su salida llega a la ventana como evento `puente`. `agente_conexion` devuelve el último aviso de conexión. En la ventana, `src/agente/puente.ts` (`TransportePuente`). Lo común con el spike está en `packages/adapter/src/conexion.ts`.
- Motor de comandos (`packages/motor`): plantillas con ranuras (`[opcional]`, `(a|b)`, `{monto}`, `{cosa}`, `{periodo}`, `{categoria}`) que el puente prueba antes de enviar al agente. Si una calza, responde con `local` y la isla muestra "⚡ sin IA"; funciona aunque OpenClaw esté apagado. Los gastos y el contador de uso (motor/agente, sin el texto de los mensajes) van en `~/.asistente-prototipo/asistente.db` (`node:sqlite`, permisos 600).
- Skill de gastos para el agente: servidor MCP propio y sin dependencias (`packages/motor/src/mcp.ts`, herramientas `gastos_anotar`, `gastos_listar`, `gastos_resumen`; sin borrar a propósito). Se registra una vez con `openclaw mcp add gastos --command node --arg <repo>/packages/motor/src/mcp.ts` y se verifica con `openclaw mcp probe gastos`. OpenClaw se lo pasa al runtime claude-cli por su puente MCP local. Con la política `cautious` cada herramienta nativa pide permiso; el puente permite sin preguntar solo `ToolSearch` y las tres de gastos (`PERMITIDAS_SIN_PREGUNTAR` en `packages/adapter/src/puente.ts`).
- Las aprobaciones llegan como `session.approval` solo con `sessions.messages.subscribe` + `includeApprovals: true`; se responden con `approval.resolve { id, kind, decision }`.
- Transparencia en macOS: `macOSPrivateApi: true` en `tauri.conf.json` + feature `macos-private-api` en Cargo.
- Notch en macOS (`src-tauri/src/notch.rs`): la ventana se convierte en una subclase de `NSPanel` no activadora (`PersonajePanel`), nivel 27, `collectionBehavior` de todos los escritorios + pantalla completa, y la app usa `ActivationPolicy::Accessory`. Sin el panel no aparece sobre apps en pantalla completa. Los clics atraviesan la ventana salvo sobre la isla (`setIgnoreCursorEvents` cada 50 ms).
- La vista previa del navegador de Claude busca `.claude/launch.json` en la carpeta inicial de la sesión, no en el repo.

## Estado

- [x] Paso 1: entorno · [x] Paso 2: referencias · [x] Paso 3: prueba del Gateway
- [x] Paso 4: personaje base — `apps/desktop` (Tauri 2 + Canvas: resortes, ojos sobre esfera que siguen al cursor global, 6 estados). macOS: isla en el notch (`src/isla.ts`) que se despliega con hover o actividad. Resto: ventana flotante arrastrable. Windows sin probar.
- [x] Paso 5: personaje conectado al agente — `apps/desktop/src/agente/` (traducción de eventos, modelo de la conversación, `TransportePuente` real y `TransporteSimulado`) y panel de la isla (`src/panel.ts`). Probado con OpenClaw real: respuesta, herramienta, permitir y rechazar. El error real aún no se ha visto en vivo. Pendiente para el pulido: mostrar markdown en la burbuja y no mostrar "En reposo" mientras se lee la respuesta.
- [x] Paso 6: motor de comandos y skill de gastos — motor de plantillas sin IA (`packages/motor`, integrado en el puente, "⚡ sin IA" en la isla) y skill MCP de gastos registrada en OpenClaw. Probado con el agente real: anota, resume por categoría y consulta por fechas sin pedir permisos repetidos.
- Siguiente: 7 motor que aprende · 8 continuidad y memoria (embeddings locales) · 9 "Lo que sé de ti" · 10 pulido y demo.
