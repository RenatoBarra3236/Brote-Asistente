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

- Personaje en el PC: `pnpm --dir apps/desktop tauri dev` (necesita `export PATH="$HOME/.cargo/bin:$PATH"`). Teclas 1–6 cambian el estado; Cmd + Q cierra (en macOS no hay ícono en el Dock).
- Pruebas y tipos del personaje: `pnpm --dir apps/desktop test` y `pnpm --dir apps/desktop tipos` (las pruebas corren con `node --test`, sin compilar).
- Prueba del Gateway: `pnpm --dir packages/adapter spike "mensaje"`. Con `SPIKE_APROBACION=allow-once` responde las solicitudes de permiso.
- Gateway de OpenClaw: `openclaw gateway status` / `openclaw gateway restart`. Config en `~/.openclaw/openclaw.json` (no versionar; tiene el token).

## Trampas conocidas

- pnpm 12 no acepta `-s`.
- OpenClaw usa el runtime `claude-cli` (Claude Code del usuario, cuenta Pro) con `anthropic/claude-sonnet-5-5`. Nunca usar el método `setup-token`.
- Política de comandos: `openclaw exec-policy preset cautious`. Por defecto OpenClaw ejecuta todo sin preguntar.
- Sin identidad de dispositivo el Gateway solo da `operator.read`. La identidad está en `~/.asistente-prototipo/dispositivo.json` (`packages/adapter/src/identidad.ts`).
- Eventos reales grabados del Gateway (anonimizados, uno por línea, tal como llegan a `onEvent`) en `packages/adapter/ejemplos/`: respuesta simple, respuesta con herramienta y aprobación permitida. `aprobacion-rechazada.jsonl` y `error.jsonl` están **armados** con la misma forma (ver su README). Sirven para pruebas sin OpenClaw.
- `apps/desktop/src/agente/` se importa desde Node en las pruebas: imports entre sus archivos con extensión `.ts`, `import type` para los tipos y nada que Node no pueda borrar (enums, propiedades en el constructor).
- Las aprobaciones llegan como `session.approval` solo con `sessions.messages.subscribe` + `includeApprovals: true`; se responden con `approval.resolve { id, kind, decision }`.
- Transparencia en macOS: `macOSPrivateApi: true` en `tauri.conf.json` + feature `macos-private-api` en Cargo.
- Notch en macOS (`src-tauri/src/notch.rs`): la ventana se convierte en una subclase de `NSPanel` no activadora (`PersonajePanel`), nivel 27, `collectionBehavior` de todos los escritorios + pantalla completa, y la app usa `ActivationPolicy::Accessory`. Sin el panel no aparece sobre apps en pantalla completa. Los clics atraviesan la ventana salvo sobre la isla (`setIgnoreCursorEvents` cada 50 ms).
- La vista previa del navegador de Claude busca `.claude/launch.json` en la carpeta inicial de la sesión, no en el repo.

## Estado

- [x] Paso 1: entorno · [x] Paso 2: referencias · [x] Paso 3: prueba del Gateway
- [x] Paso 4: personaje base — `apps/desktop` (Tauri 2 + Canvas: resortes, ojos sobre esfera que siguen al cursor global, 6 estados). macOS: isla en el notch (`src/isla.ts`) que se despliega con hover o actividad. Resto: ventana flotante arrastrable. Windows sin probar.
- [ ] Paso 5: personaje conectado al agente — hecho el código en `apps/desktop/src/agente/` (interfaz `Transporte`, traducción de eventos, modelo de la conversación, `TransporteSimulado` con los ejemplos) y el panel de la isla (`src/panel.ts`). Falta el transporte con el `GatewayClient` real y probar en el Mac.
- Siguiente: 6 motor de comandos y skill de gastos · 7 motor que aprende · 8 continuidad y memoria (embeddings locales) · 9 "Lo que sé de ti" · 10 pulido y demo.
