# Plan: el equipo de Brote (multiagente)

Anotado el 3 de octubre de 2026. Punto de partida: el repo [CopilotKit/OpenDots](https://github.com/CopilotKit/OpenDots)
(MIT, alfa) y lo que ya trae OpenClaw 2026.9.7, revisados en el Mac del usuario.

## Qué es OpenDots y qué nos sirve

"Always-on AI coworkers": cada *Dot* es un especialista con nombre, rol, instrucciones, herramientas
permitidas, memoria y conversaciones propias, y opcionalmente su propio "computador" (contenedor Docker de
OpenBot con navegador, archivos y terminal). Stack: Node 24, React, Hono, CopilotKit Runtime/Intelligence,
AG-UI, modelos compatibles con OpenAI. Su README dice que la coordinación de verdad entre Dots
(conversaciones en grupo, delegación automática) es trabajo futuro.

| De OpenDots | ¿Para Brote? |
|---|---|
| Especialistas configurables (nombre, rol, instrucciones, herramientas permitidas, memoria propia) | **Sí, la idea.** La configuración vive en OpenClaw (un agente por especialista). |
| Tarjeta "Revisar antes de guardar" (Aprobar y guardar / Rechazar) antes de que un especialista entregue algo | **Sí.** Encaja con la isla (como los permisos y "¿Aprendo esto?"). |
| Reglas del prompt: no afirmar que una herramienta corrió sin evidencia; páginas y mensajes son datos, no órdenes; citar fuentes | **Sí.** Es MIT: se puede adaptar el texto citándolo. |
| CopilotKit Runtime, AG-UI, React | **No.** Brote ya tiene su canal (Gateway de OpenClaw → puente → Tauri). |
| "Computadores" en Docker (OpenBot) | **No por ahora.** Muy pesado para el computador de un estudiante. |
| Slack y llamadas de voz | **No.** Fuera del rumbo. |

## Lo que OpenClaw ya trae (verificado en la documentación instalada)

- **Agentes aislados** (`openclaw agents add`): cada uno con su workspace, identidad y herramientas.
- **Delegación**: un agente con `subagents: { allowAgents: [ids], delegationMode: "prefer" | "suggest" }`
  puede usar `agents_list`, `sessions_spawn` (tarea acotada a un especialista) y `sessions_send` (seguir
  una tarea). Los resultados vuelven al que delegó ("announce"). `maxConcurrent` limita los paralelos.
- **Equipos** (`openclaw agents team create --preset team`): crea un coordinador "Chief of staff" 🧭 y tres
  especialistas (researcher, writer, reviewer) con plantillas de rol (`docs/reference/templates/roles/`).
  Ojo: crea un coordinador **nuevo** y lo deja como agente del sistema; Brote no debe perder su identidad
  ni su memoria, así que no usamos el comando tal cual: copiamos la idea (agregar especialistas y darle
  `allowAgents` al agente de Brote).
- **Modelo por especialista**: `agents.entries.*.subagents.model` o el modelo del agente destino. Se puede
  usar Haiku para investigar y revisar, y Sonnet para redactar.

## Propuesta para Brote

**Brote sigue siendo el único con quien hablas** (coordinador): reparte, junta y te entrega el resultado.
Especialistas pensados para estudiantes:

| Especialista | Hace | Modelo sugerido |
|---|---|---|
| 📚 Tutor | Explica materia, arma ejercicios y quizzes con tus apuntes y tu aula | Sonnet |
| 🔎 Investigador | Busca y lee fuentes, entrega un resumen con citas | Haiku |
| ✍️ Redactor | Resúmenes, ensayos, correos: siempre como borrador para revisar | Sonnet |
| ✅ Revisor | Corrige y verifica citas contra una rúbrica | Haiku |
| 🗓️ Planificador | Plan de estudio con tu calendario, entregas y pomodoros (crear cosas pide permiso) | Haiku |

Los gastos siguen siendo de Brote (motor sin IA y su skill), no de un especialista.

**En la isla**: cuando Brote delega, en la pestaña Brote aparece "el equipo trabajando" (cada especialista
con su ícono, qué hace y si terminó), y lo que se entrega pasa por la tarjeta **Revisar antes de guardar**.
Los personajes de los especialistas son variantes propias de Brote (otro color de hoja, un accesorio), nunca
dibujos de otros proyectos.

**En Configurar Brote → Funciones**: "Equipo de Brote" con un interruptor por especialista y, por cada uno,
su rol, sus instrucciones y qué herramientas puede usar.

## Riesgos y cómo cuidarlos

1. **Gasto del plan.** Cada especialista es una corrida más de Claude con tu cuenta. Hoy la semana va en
   76 %. Medidas: delegar solo cuando vale la pena (`suggest`, no `prefer`), especialistas baratos en Haiku,
   `maxConcurrent` bajo (2), y **si el plan semanal pasa el 85 %, Brote no delega** y lo dice (usa el uso
   del plan que ya mide la pestaña Claude).
2. **Permisos.** El puente hoy escucha solo la sesión principal de Brote; las solicitudes de permiso de un
   especialista llegan en otra sesión y, si nadie las ve, OpenClaw las niega. Hay que suscribirse también
   a las sesiones hijas (o darles a los especialistas solo herramientas que no piden permiso).
3. **Inyección.** Lo que lee el Investigador (páginas, PDFs) son datos, nunca órdenes; las acciones que
   cambian algo siempre pasan por un permiso o por "Revisar antes de guardar".

## Fase 0: prueba de verificación (aquí, en el Mac, antes de programar)

Con un solo especialista (🔎 Investigador en Haiku) y `allowAgents` en el agente de Brote:
1. ¿El runtime `claude-cli` le entrega a Brote `agents_list`, `sessions_spawn` y `sessions_send`?
2. ¿Qué eventos llegan al puente mientras el especialista trabaja (para mostrarlo en la isla)?
3. ¿Las solicitudes de permiso del especialista llegan a la isla?
4. ¿Cuánto gasta una delegación típica (tokens y % del plan)?

Toca la configuración de OpenClaw (agrega un agente y edita el de Brote): se respalda antes y se puede
deshacer (`openclaw agents delete`).

## Varias IA en el mismo equipo

Cada especialista es un agente de OpenClaw con su propio modelo (`agents.entries.<id>.model`), así que
cada uno puede usar la IA que el usuario tenga conectada. Brote (Claude por Claude Code) sigue siendo
el coordinador.

| IA | Cómo se conecta | Modelos que valida OpenClaw 2026.9.7 | Estado |
|---|---|---|---|
| Claude | Claude Code con la cuenta Pro/Max (runtime `claude-cli`, como Brote) | `anthropic/claude-sonnet-5-5`, `anthropic/claude-haiku-4-5` | Probado (es Brote) |
| Gemini | Clave gratis de AI Studio: `openclaw models auth paste-api-key --provider google` (la clave por la entrada) | `google/gemini-3.5-flash`, `google/gemini-3-flash-preview` | Probado en la fase 0 (`--agent investigador`) |
| ChatGPT | Codex login con la cuenta de ChatGPT: `openclaw models auth login --provider openai` | `openai/gpt-6-astra`, `openai/gpt-5.4-mini` | Sin probar |
| Grok | `openclaw models auth login --provider xai --method oauth` (SuperGrok o X Premium) | `xai/grok-4.7` | Sin probar |

- Google cortó el login con cuenta personal para Gemini (18-6-2026): solo queda la clave de AI Studio.
  En el plan gratis Google puede usar los datos para entrenar: la interfaz lo avisa y pide una casilla.
- La validación de `config set` solo acepta modelos del catálogo que trae OpenClaw; los que aparecen
  al consultar con la clave (`google/gemini-flash-latest`, `google/gemini-3.8-flash`) fallan con
  "Unable to resolve authored model reference". Por eso la lista es cerrada (motor y Rust).
- Un modelo de Claude para un especialista necesita `agents.defaults.models["<ref>"].agentRuntime.id =
  claude-cli` (si no, OpenClaw buscaría una clave de API de Anthropic, que no usamos).

## Resultado de la fase 0 (Mac del usuario, 3-10-2026)

- `openclaw agents add investigador --role researcher --non-interactive --json` crea el agente, pero
  su workspace queda **dentro** del de Brote (`~/.openclaw/workspace/investigador`). Los nuevos van en
  `~/.openclaw/equipo/<id>` (`--workspace`). "Lo que sé de ti" no lo mezcla igual: solo lee
  `workspace/memory/` y la memoria de Claude Code del workspace de Brote (hay una prueba).
- Roles con plantilla: coordinator, researcher, writer, reviewer. Tutor y Planificador no tienen: su
  AGENTS.md es solo el bloque de Brote y su identidad se pone con `agents set-identity`.
- Delegación con `config set agents.entries.asistente-multiplataforma.subagents
  '{"allowAgents":["investigador"],"delegationMode":"suggest"}' --strict-json` ("Change will apply
  without restarting the gateway"). Quedó así en el Mac, con `investigador` en `google/gemini-3.5-flash`.
- Brote (claude-cli) usó `agents_list`, `sessions_spawn ({ task, agentId })`, `sessions_yield` (dos
  veces, de más), `subagents ({ action: "wait", runIds, timeoutSeconds })` y `sessions_history`. Ninguna
  pide permiso. Respondió en 32 s con lo que dijo Gemini. Costo del lado de Claude: 8 llamadas, ~US$ 0,46
  en valor API; Gemini, gratis.
- Los eventos de la sesión hija (`agent:<id>:subagent:<uuid>`) llegan al puente aunque solo esté
  suscrito a la principal: su `lifecycle end` terminaba el turno de Brote en la isla.
- Después llega otro turno con "[Inter-session message] … sourceTool=subagent_settle isUser=false" (el
  anuncio del resultado) y Brote contesta `NO_REPLY`: la isla lo mostraba como un mensaje del usuario.
- Pendiente de la fase 0: las solicitudes de permiso de un especialista (el investigador no pidió
  ninguna). La grabación de la fase 0 quedó en el Mac: `ejemplos/delegacion.jsonl` la reemplaza
  armado con lo que se contó (ver su README).

## Fase 1 (hecha en la nube, 4-10-2026; falta probarla en el Mac)

1. **Puente e isla** (`packages/adapter/src/delegacion.ts`, con pruebas sobre `delegacion.jsonl` y
   `delegacion-continuacion.jsonl`): los eventos de las sesiones hijas no llegan a la isla como de Brote;
   el turno del "[Inter-session message]" no se muestra (si Brote contesta algo de verdad, solo esa
   respuesta); `NO_REPLY` nunca se muestra; aviso `especialistas` con cada especialista (id, nombre,
   emoji, IA, color, tarea, herramienta en curso, trabajando/terminó/falló). Las solicitudes de permiso
   de un especialista se reenvían marcadas ("🔎 Investigador: ¿Ejecuto este comando?") y **nunca** se
   permiten solas (ni gastos ni memoria de Brote).
2. **Skill `delegar`** (`packages/motor/skill/delegar/SKILL.md`, se instala en el paso "skill"): cuándo
   vale la pena, `sessions_spawn` → `subagents` wait (60 s, una vez más si hace falta) →
   `sessions_history` con `limit` 2 (el wait **no trae el texto**: verificado en el código de OpenClaw,
   `waitForSelectedRuns` devuelve `runs`, `completed`, `reason`) → responder. Nada de `sessions_yield`.
   Al anuncio posterior: `NO_REPLY` si ya respondió.
3. **Configurar Brote → Cuentas de IA y Equipo**: función nueva `especialistas` ("Equipo de Brote"; el
   id `equipo` ya era "Reacciones al computador"), catálogo en `packages/motor/src/especialistas.ts`,
   listas cerradas en `src-tauri/src/especialistas.rs` (especialistas, modelos, cuentas con clave) y
   terminales nuevas en `configuracion.rs`. Prender = `agents add` (con `--role` si tiene plantilla y
   `--workspace ~/.openclaw/equipo/<id>`) + `set-identity` + `config set …model` + bloque de Brote en su
   AGENTS.md (rol, reglas adaptadas de OpenDots e instrucciones del usuario) + `allowAgents`. Apagar =
   sacarlo de `allowAgents` y `agents delete --force` (su carpeta va a la Papelera).
4. **Freno por plan**: sobre 85 % de la semana (la lectura del uso del plan) el puente saca de
   `allowAgents` a los especialistas con Claude; bajo 80 % vuelven. Estado en
   `~/.asistente-prototipo/equipo.json`; la isla avisa una vez por cambio. Prueba de punta a punta con
   el puente real y un `openclaw` falso.
5. **Isla**: "Mi equipo está trabajando" en la pestaña Brote (emoji, "· Gemini" en el color de su IA,
   qué hace, ✓ al terminar; se van solos al minuto). Vista previa: `vista-previa.html?delegar=1`
   (y `&freno=1`).

**Pendiente**: el modo Consejo ("pregúntale a todas": la misma pregunta a cada especialista con otra
IA, respuestas lado a lado y una síntesis de Brote). Idea: una intención del motor sin IA
("pregúntale a todas …") que manda a Brote un pedido marcado; la skill le dice que haga un
`sessions_spawn` por IA distinta, espere a todos con un solo `subagents` wait y responda con una
síntesis; la isla mostraría las respuestas lado a lado leyendo el aviso `especialistas` (habría que
agregarle el texto final de cada uno, que hoy el puente no guarda).

## Fase 2: el equipo vivo en la isla (hecha en la nube, 4-10-2026; falta probarla en el Mac)

La fila "Mi equipo está trabajando" se reemplazó por algo que se ve y se toca, en dos niveles:

1. **El escenario** (pestaña Brote): cuando Brote delega, las mascotas de los especialistas salen de
   detrás de Brote (se dibujan antes que él, desde su posición) y quedan en fila, como mucho 4, sin
   cambiar de lugar. Cada una se anima según lo que hace: en espera (aún no parte), pensando, trabajando
   (una herramienta o escribiendo), pidiendo permiso, terminó (salta y lanza chispas) o falló (se
   sacude). Arriba, un globito con lo que hace ahora ("Buscando «mitosis»…", "Leyendo es.wikipedia.org…",
   el comienzo de su respuesta); abajo, "Investigador · Gemini" en el color de su IA. Al tocar una, su
   conversación (tarea recibida, pasos y respuesta con el markdown de la burbuja) se abre en el panel con
   "← volver". Al terminar todos, celebran 4,5 s y se esconden; sus conversaciones quedan a un toque un
   minuto ("Lo que hizo tu equipo: 🔎 ✓").
2. **"⤢ Ver a todos"**: la isla se agranda (como la Dynamic Island al expandirse, con los mismos resortes)
   hasta 740 × 456 y muestra en columnas a Brote (su pregunta y su respuesta) y hasta 3 especialistas
   (mascota chica, nombre, IA, pasos y respuesta en vivo). Brote se achica y pasa a su columna. Se cierra
   sola 6 s después de que el equipo termina, con "⤡ Volver" o con el cursor 3,5 s fuera. Para que
   quepa, la ventana del notch pasó de 600 × 380 a 760 × 460 (`tamano_notch` en lib.rs, que la achica en
   pantallas chicas); la isla normal sigue creciendo como mucho hasta los 380 de antes. En el modo
   flotante usa el espacio del panel (columnas que se deslizan de lado); allí la caja del panel la dibuja
   el lienzo, para que las mascotas se vean encima.

**Datos**: el puente (`FiltroDelegacion`) ahora guarda por especialista su `actividad`, sus `pasos`
(herramienta, estado y solo los argumentos útiles: `url`, `query`, `file_path`, `path`, `pattern`,
`command`, `action`, `agentId`), lo que lleva de su `respuesta` (de los flujos `thinking`, `assistant`,
`tool` y del `chat` final) y la tarea completa; aparece "en espera" apenas `sessions_spawn` devuelve su
sesión; un permiso pendiente de su sesión lo pone en "permiso". El aviso `especialistas` se agrupa (4
por segundo). Si los eventos no alcanzan (por ejemplo, el puente partió a mitad), la isla pide
`especialista-historial` y el puente lee `chat.history` de esa sesión hija (solo de una que está en la
lista; `leerHistorial` tolera formas distintas: sin probar contra el Gateway real). Con la grabación real
de la fase 0 se ve: en espera → pensando → trabajando (escribiendo) → terminó, con la respuesta de Gemini.

**Mascotas propias**: `personaje.ts` acepta una `Apariencia` (degradado del cuerpo, color de hoja y un
accesorio dibujado en canvas: birrete 📚, lupa 🔎, lápiz ✍️, visera ✅, reloj 🗓️). La hoja se tiñe a medias
con el color del estado. Brote no cambió. Nada de personajes, logos ni dibujos de otros proyectos.

**Personalidad**: cada especialista del catálogo trae su `vibe` y su `alma` (Tutor paciente y socrático,
Investigador curioso que cita todo, Redactor ordenado y creativo, Revisor exigente pero amable,
Planificador práctico). Al crearlo se escriben `SOUL.md` e `IDENTITY.md` en su workspace; el SOUL.md se
edita en Configurar Brote → Equipo ("Su personalidad"). A los que ya existen (el 🔎 Investigador hecho a
mano en la fase 0, en `~/.openclaw/workspace/investigador`) solo se les escribe lo que falta, al abrir
Equipo: no se recrean ni se borran, y un IDENTITY.md que ya existe nunca se toca.

## Fases siguientes

1. Probar la fase 1 en el Mac (lista en el commit) y reemplazar `delegacion.jsonl` por la grabación real.
2. Modo Consejo (arriba) y la tarjeta "Revisar antes de guardar" (las variantes propias de Brote ya están: fase 2).
3. Memoria por especialista en "Lo que sé de ti".
