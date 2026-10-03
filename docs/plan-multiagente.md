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

## Fases siguientes (nube, con lo que salga de la fase 0)

1. Equipo base: especialistas, roles, modelos, límites de gasto, y la sección en Configurar Brote.
2. Isla: el equipo trabajando, la tarjeta "Revisar antes de guardar" y los permisos de sesiones hijas.
3. Memoria por especialista en "Lo que sé de ti" y el freno por plan semanal.
