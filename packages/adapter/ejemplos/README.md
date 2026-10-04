# Eventos de ejemplo del Gateway

Un evento por línea, tal como llegan a `onEvent` del `GatewayClient`. Los usan las pruebas y el `TransporteSimulado` de `apps/desktop/src/agente/`.

| Archivo | Origen | Qué muestra |
| --- | --- | --- |
| `respuesta-simple.jsonl` | Grabado (paso 3), anonimizado | Respuesta de texto sin herramientas |
| `respuesta-con-herramienta.jsonl` | Grabado (paso 3), anonimizado | El agente lee `USER.md` con `Read` y responde |
| `aprobacion-permitida.jsonl` | Grabado (paso 3), anonimizado | Pide permiso para `Bash date`, se permite y responde |
| `aprobacion-rechazada.jsonl` | **Armado** a partir de `aprobacion-permitida.jsonl` | Pide permiso para `ls ~/Documentos`, se rechaza y el agente lo explica |
| `error.jsonl` | **Armado** a partir de `respuesta-simple.jsonl` | La ejecución falla después de empezar a pensar |
| `delegacion.jsonl` | **Armado** con la forma de los grabados y lo observado en la fase 0 del equipo (3-10-2026) | Brote delega en 🔎 Investigador (Gemini): `agents_list`, `sessions_spawn`, dos `sessions_yield`, `subagents` wait y `sessions_history`; los eventos de la sesión hija `agent:investigador:subagent:<uuid>` llegan intercalados; después, el turno del anuncio ("[Inter-session message] … sourceTool=subagent_settle isUser=false") que Brote contesta con `NO_REPLY` |
| `delegacion-continuacion.jsonl` | **Armado** | Solo el turno del anuncio, cuando Brote no alcanzó a responder antes (la espera se cortó): esta vez contesta con texto de verdad |
| `delegacion-grabada.jsonl` | **Grabado** (fase 0, 3-10-2026, OpenClaw 2026.9.7), anonimizado | La delegación real en 🔎 Investigador (Gemini) hasta que el especialista termina; se corta antes de la respuesta de Brote (el script de prueba tomó el fin de la hija como fin del turno). `pruebas/delegacion.test.ts` la usa para confirmar el filtro con eventos de verdad |

Los dos archivos armados mantienen la forma de los grabados, pero tienen datos supuestos que hay que confirmar con el Gateway real:

- Rechazo: `approval.status: "denied"` en la fase `terminal` (confirmado con el Gateway real), el `result` de la herramienta (`isError: true`) y `status: "failed"` en el `item` final.
- Error: el flujo `error` con `data.message` y `lifecycle` con `phase: "error"` y `data.error`. La documentación del protocolo nombra el flujo `error`, pero aún no lo hemos visto en vivo.

La traducción de eventos no depende de esos valores supuestos: un `terminal` siempre cierra la aprobación, y cualquier fase de `lifecycle` que contenga `error`, `fail` o `abort` cuenta como error.

La grabación real de la fase 0 ya está aquí (`delegacion-grabada.jsonl`, revisada en el Mac el 4-10-2026: pasa por el filtro sin dar el turno por terminado). `delegacion.jsonl` sigue armado porque cubre también la respuesta de Brote y el turno del anuncio, que la grabación no alcanzó a tener. Lo que se había supuesto:

- ✅ (confirmado en la transcripción de la fase 0: el mensaje llegó 3 s antes de la respuesta) Que el mensaje del anuncio llega como `session.message` con `role: "user"` **antes** del `lifecycle` `start` de su turno (como los mensajes del usuario en `aprobacion-permitida.jsonl`). El puente marca como interno el turno que sigue a ese mensaje (`FiltroDelegacion` en `src/delegacion.ts`).
- ✅ (confirmado en la grabación) Que el resultado de `sessions_spawn` trae `childSessionKey` (la documentación lo nombra así) y que la sesión hija trae `agentId`. Si no, el especialista igual se reconoce por la sesión (`agent:<id>:subagent:…`) y la tarea se toma de la última llamada a `sessions_spawn` para ese agente.
- La forma exacta del `result` de `subagents` wait está tomada del código de OpenClaw 2026.9.7 (`waitForSelectedRuns`): trae `runs`, `completed` y `reason`, **pero no el texto final** del especialista; por eso la skill de delegación usa `sessions_history` con `limit` 2 después de esperar.
