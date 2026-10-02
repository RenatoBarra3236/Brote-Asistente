# Eventos de ejemplo del Gateway

Un evento por línea, tal como llegan a `onEvent` del `GatewayClient`. Los usan las pruebas y el `TransporteSimulado` de `apps/desktop/src/agente/`.

| Archivo | Origen | Qué muestra |
| --- | --- | --- |
| `respuesta-simple.jsonl` | Grabado (paso 3), anonimizado | Respuesta de texto sin herramientas |
| `respuesta-con-herramienta.jsonl` | Grabado (paso 3), anonimizado | El agente lee `USER.md` con `Read` y responde |
| `aprobacion-permitida.jsonl` | Grabado (paso 3), anonimizado | Pide permiso para `Bash date`, se permite y responde |
| `aprobacion-rechazada.jsonl` | **Armado** a partir de `aprobacion-permitida.jsonl` | Pide permiso para `ls ~/Documentos`, se rechaza y el agente lo explica |
| `error.jsonl` | **Armado** a partir de `respuesta-simple.jsonl` | La ejecución falla después de empezar a pensar |

Los dos archivos armados mantienen la forma de los grabados, pero tienen datos supuestos que hay que confirmar con el Gateway real:

- Rechazo: `approval.status: "denied"` en la fase `terminal` (confirmado con el Gateway real), el `result` de la herramienta (`isError: true`) y `status: "failed"` en el `item` final.
- Error: el flujo `error` con `data.message` y `lifecycle` con `phase: "error"` y `data.error`. La documentación del protocolo nombra el flujo `error`, pero aún no lo hemos visto en vivo.

La traducción de eventos no depende de esos valores supuestos: un `terminal` siempre cierra la aprobación, y cualquier fase de `lifecycle` que contenga `error`, `fail` o `abort` cuenta como error.
