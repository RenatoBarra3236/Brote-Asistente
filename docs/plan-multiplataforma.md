# Plan multiplataforma: Brote en el PC, el celular y la casa

Escrito el 5-10-2026. **EN PAUSA por decisión del usuario (se retoma después del plan «Estudio y mejoras»).** Es un diseño: nada está programado ni aprobado. Mismas reglas de siempre (CLAUDE.md): español, privacidad primero, nada de leer credenciales de Claude, sin commit. Antes de cualquier código: el usuario aprueba las decisiones de la sección 8.

## 1. La pregunta y la respuesta corta

**¿Hace falta una nube para que el agente viva en los tres medios?** No para empezar, y no recomendamos montarla ahora. Lo que hace falta es decidir **dónde vive el cerebro** (el agente, la base de datos, la memoria) y cómo llegan a él el celular y la casa. La recomendación es:

> El **PC es el centro** (cerebro único, como hoy). El **celular** y la **casa** son clientes que se conectan a él por una red privada (la de la casa o Tailscale). Lo único que el celular debe hacer solo, sin conexión, es **anotar un gasto**; eso se guarda en el celular y se sincroniza después.

Una nube (un servidor tuyo en internet) solo aparece, y chica, si algún día quieres notificaciones push con la app cerrada o acceso sin VPN.

## 2. Qué existe hoy (hechos)

- **Todo corre en el Mac.** El agente usa Claude Code con la cuenta Pro del usuario, a través del Gateway de OpenClaw (`ws://127.0.0.1:18789`, solo loopback). La app de escritorio lanza el **puente** (`packages/adapter/src/puente.ts`) como proceso hijo y habla con él por líneas JSON en stdin/stdout.
- **El puente es, en la práctica, una API.** Cada función de Brote (gastos, notas, ramos, repaso, plan de estudio, agenda…) es un `pedido` JSON con respuesta y avisos. Eso es lo más valioso para el celular: la API ya existe, solo le falta otro transporte.
- **Los datos son locales:** `~/.asistente-prototipo/asistente.db` (SQLite con gastos, ramos, notas, tarjetas, planes…), `~/.openclaw` (memoria del agente), secretos en el Llavero del Mac.
- **Lo ya decidido para el celular y la casa** (`CLAUDE.md`, `docs/plan-rediseno.md` sección 8): el celular será una app propia (Tauri móvil) después del paso 10; el hardware de la casa **no está decidido**; el audio nunca va a la nube (los aparatos lo mandan por la red propia al PC o al celular, y cada aparato declara si `captura` y/o `transcribe`).

## 3. Lo que verificamos hoy en OpenClaw 2026.9.7 (solo con las ayudas de la CLI)

Comandos de lectura (`openclaw gateway --help`, `devices`, `qr`, `node`, `nodes`). Sin tocar `~/.openclaw`.

| Pieza | Qué dice la ayuda | Para qué nos sirve |
|---|---|---|
| `gateway --bind` | `loopback \| lan \| tailnet \| auto \| custom` (por defecto loopback) | El centro puede escuchar en la red de la casa o en Tailscale sin servidor intermedio. |
| `gateway --tailscale` | `off \| serve \| funnel` | Acceso desde fuera de casa por Tailscale (`serve` = solo tus dispositivos; `funnel` = público, **no lo queremos**). |
| `gateway --auth` | `none \| token \| password \| trusted-proxy` | Autenticación obligatoria al abrirlo a la red (nunca `none`). |
| `openclaw qr` | Genera un QR de emparejamiento para una app móvil; `--limited` quita `operator.admin`; `--voice-node` empareja un nodo de voz con solo `node, read, Talk`; `--remote` usa `gateway.remote.url` | El celular y la casa se emparejan con permisos mínimos. |
| `openclaw devices` | `list / approve / revoke / rotate / remove` | Revocar un celular perdido sin cambiar nada más. |
| `openclaw node` | Servicio «headless node host» (launchd / systemd / schtasks), `node run --host … --port …` | Candidato natural para el aparato de la **casa** (Linux, sin pantalla). |
| `openclaw nodes` | `camera`, `location`, `notify`, `screen`, `invoke` y `push` («APNs test push to an iOS node») | OpenClaw ya contempla notificaciones y push hacia un nodo iOS. |

**Lo que NO verificamos y hay que comprobar antes de construir** (ver sección 9): cómo se autentica y emparejaría **nuestra** app (no la de OpenClaw); si el push APNs de OpenClaw sirve para una app con otro identificador; qué tan completa es la voz en un nodo; y las condiciones de usar la cuenta Pro desde un equipo sin pantalla.

## 4. El problema real: qué datos viven dónde

La nube no es el problema; lo es la **sincronización**. Qué necesita cada aparato:

| Dato | Dónde nace | ¿Lo necesita el celular? | Cómo |
|---|---|---|---|
| Gastos (anotar) | PC, celular («en la micro») | **Sí, también sin conexión** | Se anota en el celular y se envía al centro cuando haya conexión. |
| Gastos (ver resumen), presupuesto | PC | Sí, con conexión | Lo pide al centro. |
| Chat con el agente | PC | Sí, con conexión | Siempre pasa por el centro (el celular **no** puede correr Claude Code). |
| Agenda, entregas, ramos, notas, plan de estudio, tarjetas | PC | Ver sí, con conexión | Lo pide al centro. Marcar un bloque o una tarjeta puede quedar en cola. |
| Grabaciones y transcripciones | PC (y celular/casa a futuro) | Captura sí; transcribir en el aparato o en el centro | Contrato ya fijado (`origen: pc\|celular\|casa`). |
| Secretos (token del aula, iCal, GitHub) | PC (Llavero) | **Nunca** | Se quedan en el centro. |
| Memoria del agente | PC (`~/.openclaw`) | Solo vía el agente | Nunca se copia al celular. |

Regla de oro: **un solo escritor de la base**. El centro es el único que escribe `asistente.db`. Los clientes mandan **pedidos**, no copias de la base.

## 5. Las tres opciones

| | **A. El PC es el centro** (recomendada para partir) | **B. Un equipo tuyo siempre prendido** | **C. Servidor en la nube** |
|---|---|---|---|
| Qué es | Como hoy. Celular y casa se conectan al Gateway y al puente del PC por la red de la casa o por Tailscale. | Igual, pero el centro es un mini PC / Raspberry (la «casa» podría serlo) y el PC pasa a ser un cliente más. | Todo corre en un servidor en internet. |
| Costo | Cero. | Compra del equipo. | Mensual, más trabajo de seguridad. |
| Privacidad | Los datos no salen de tus equipos. | Igual. | Tus gastos, notas y transcripciones viven en un servidor que operas tú (choca con `docs/privacidad.md` y la Ley 21.719). |
| Disponibilidad | El PC debe estar encendido y despierto. | Siempre. | Siempre. |
| Riesgo principal | PC dormido o apagado. | Que Claude Code con la cuenta Pro funcione en un equipo sin pantalla (sin verificar). | Cada usuario necesitaría su propio servidor y su propia cuenta; no escala sin rediseñar cuentas. |
| Reversible | Sí: pasar de A a B es mover el centro. | Sí. | Difícil. |

OpenClaw soporta A y B de forma nativa (`--bind lan|tailnet`, `--tailscale serve`). C no está en el camino y se descarta por ahora.

## 6. Arquitectura propuesta

```
        ┌────────────── CENTRO (PC, luego quizá un equipo fijo) ──────────────┐
        │  OpenClaw Gateway ── agente (Claude Code, cuenta Pro)               │
        │  Puente de Brote como SERVICIO ── motor sin IA ── asistente.db      │
        │  secretos (Llavero), memoria, transcripción (whisper.cpp)           │
        └──────────▲──────────────────────▲────────────────────▲──────────────┘
          stdio/local│      red privada (LAN o Tailscale), WebSocket + token por dispositivo
        ┌───────────┴───┐   ┌──────────────┴───────┐   ┌───────┴───────────────┐
        │ App del PC    │   │ Celular (PWA → Tauri) │   │ Casa (nodo: mic/altavoz│
        │ (isla, Tauri) │   │ chat, gastos, agenda  │   │ /pantalla), sin cerebro│
        └───────────────┘   └───────────────────────┘   └────────────────────────┘
```

1. **El puente pasa a ser un servicio con otro transporte.** Hoy es un hijo de la ventana (stdio). Se agrega un transporte WebSocket autenticado que habla **el mismo protocolo de pedidos y avisos**; la app del PC puede seguir usando stdio. Así el celular hereda todas las funciones ya hechas sin reescribirlas. (Hoy dos ventanas ya comparten el puente con ids de pedido con prefijo: el modelo multicliente existe en pequeño.)
2. **Dos conexiones distintas, una sola puerta.** El chat con el agente es del Gateway de OpenClaw; el motor sin IA, los gastos, la agenda, etc. son del puente. Para el celular conviene que **solo hable con el puente** y que este reenvíe lo que sea del agente, igual que ya hace con la isla: así se conserva el orden «motor primero, agente después» y los permisos de herramientas.
3. **Seguridad al abrir la red.** Escuchar solo en LAN o Tailscale (nunca `funnel`, nunca `auth none`); token por dispositivo con emparejamiento aprobado en el PC; el celular se empareja con permisos **limitados** (sin `operator.admin`, como `openclaw qr --limited`); una lista blanca de pedidos para clientes remotos (leer, anotar gastos, marcar tarjetas y bloques; **no** configurar, no instalar conectores, no borrar datos: eso solo en el PC); revocar un celular perdido con `openclaw devices revoke`. Los secretos y la memoria del agente **no salen del centro**.
4. **La IA siempre pasa por el centro.** El celular nunca llama a Anthropic ni lleva una API key. Sin conexión al centro, el chat con IA no funciona y la app lo dice.
5. **Sin conexión: solo anotar gastos.** El celular reutiliza la parte pura del motor (`plantillas`, `montos`, `categorias`: sin Node) para entender «paqué 2500 de sushi» al instante y guarda el gasto ya estructurado en una **cola local** con un id único. Al ver el centro, lo envía con un pedido idempotente (`gasto-importar { id, monto, categoria, descripcion, fechaMs }`); el centro guarda una sola vez (columna `origen_id` única en la tabla de gastos: una migración). Lo demás (marcar una tarjeta, un bloque) puede quedar en cola con el mismo mecanismo, pero no es necesario en la primera versión.
6. **La casa** es un cliente más simple: capta audio y lo manda al centro (o lo transcribe si puede), y muestra/dice la respuesta. Su primera prueba puede ser un `openclaw node` en un PC viejo o una Raspberry, **sin comprar hardware**; el hardware definitivo se decide cuando se vea qué piden los usuarios.

## 7. Fases (cada una termina con pruebas y una nota en este archivo)

0. **Verificar** (una sesión, sin tocar tu instalación real): leer la documentación de OpenClaw sobre acceso remoto, nodos y voz; con el perfil aislado de pruebas (`OPENCLAW_PROFILE=prueba`, puerto 18799) abrir el Gateway en LAN y conectar un cliente de prueba desde otro aparato con `@openclaw/gateway-client`; comprobar cómo se empareja una app nuestra. Entregable: una lista de hallazgos que confirma o corrige este diseño.
1. **Centro accesible:** el puente como servicio con transporte WebSocket + token por dispositivo + emparejamiento + lista blanca de pedidos. Pruebas con el puente real en carpeta temporal (nunca con datos reales).
2. **Cliente móvil web (PWA servida por el centro)** para validar sin tiendas de apps: Inicio, Gastos (anotar y ver), Agenda, Repaso y chat. Se instala desde el navegador del celular por LAN o Tailscale.
3. **Gastos sin conexión:** cola local, id único, migración `origen_id` y el pedido idempotente.
4. **App nativa (Tauri móvil)** solo si la PWA no alcanza (micrófono en segundo plano, widgets, push). Aquí se decide el push (sección 8, decisión 7).
5. **Casa:** nodo con micrófono y altavoz; captura → transcribe en el centro; luego pantalla/personaje.
6. **Centro fijo (opcional):** mover el centro a un equipo siempre prendido si el PC apagado molesta.

## 8. Decisiones que necesito de ti antes de programar

1. **Dónde vive el centro:** ¿el PC por ahora (recomiendo, opción A) y quizá un equipo fijo más adelante, o un equipo fijo desde el principio, o nube?
2. **Acceso fuera de casa:** ¿solo la red de la casa al partir, con Tailscale `serve` como paso opcional después (recomiendo)? `funnel` (público) queda prohibido.
3. **Cliente del celular:** ¿PWA primero y app nativa solo si hace falta (recomiendo), app Tauri directo, o usar la app móvil de OpenClaw ya existente?
4. **Sin conexión:** ¿solo anotar gastos con cola e id único (recomiendo), nada offline, o todo offline (mucho más caro)?
5. **Permisos del celular:** ¿limitados, sin configurar ni borrar datos (recomiendo)?
6. **IA:** ¿siempre por el centro y sin API key en el celular (recomiendo)?
7. **Push con la app cerrada:** ¿postergarlo (recomiendo: avisos locales mientras la app esté abierta) o planearlo desde ya? Requeriría un pequeño servicio propio o un relay de APNs/FCM.
8. **Casa:** ¿probar primero con un `openclaw node` en un equipo que ya tengas, sin comprar hardware (recomiendo)?
9. **Varias personas o casas:** ¿cada usuario con su propio centro, sin cuentas ni servidor compartido (recomiendo)?
10. **Respaldo de `asistente.db`** (ahora un solo archivo en un solo equipo): ¿copia automática semanal a una carpeta que elijas (recomiendo, local) o nada por ahora?

## 9. Riesgos y cosas sin verificar

- **PC dormido o apagado:** el centro desaparece. Mitigación: la opción de mantener el equipo despierto que ya tiene la app, el aviso «no encuentro a Brote en casa» en el celular y, más adelante, el equipo fijo (fase 6).
- **Cuenta Pro en otro equipo y límites compartidos:** todos los dispositivos gastan el mismo plan; hay que verificar las condiciones de uso antes de la opción B.
- **Emparejar nuestra app con el Gateway:** el QR de OpenClaw es para su app móvil; no sabemos si sirve tal cual para una app con otro identificador. Fase 0.
- **Push iOS:** `openclaw nodes push` existe, pero probablemente pasa por la app y el relay de OpenClaw; no sirve sin comprobarlo para una app propia.
- **PWA en iPhone:** el micrófono, las notificaciones y el trabajo en segundo plano son más limitados que en una app nativa; la PWA es para validar, no para quedarse.
- **Distribución nativa:** una app propia en iPhone exige cuenta de desarrollador de Apple (de pago) o firmas que caducan; está sin averiguar.
- **El puente asume hoy una sola cara:** varios avisos son «globales» (estado de la isla). Con celular y PC a la vez hay que decidir qué aviso va a quién (por ejemplo, el aviso de un temporizador solo al aparato que lo pidió).
- **Dos aparatos anotando a la vez:** resuelto con id único e idempotencia; el orden no importa porque cada gasto lleva su fecha.
- **Seguridad de abrir la red:** una mala configuración (bind amplio, `auth none`) deja el agente de tu PC accesible a quien esté en tu red. Por eso la fase 0 prueba todo en un perfil aislado y la fase 1 trae pruebas de rechazo (sin token, token revocado, pedido fuera de la lista blanca).

## 10. Fuera de este plan

Cuentas y servidor multiusuario, sincronizar la memoria del agente, correr el modelo en el celular, el personaje definitivo, y cualquier cosa que mande audio o texto de clases a un servicio de terceros.

## 11. Idea anotada: migrar a la nube más adelante (6-10-2026, a pedido del usuario; sin diseño ni decisión, no se empieza sin pedirlo)

**Hoy** el plan es «sin nube» (opción A, el PC es el centro) y no cambia. **Más adelante** conviene dejar abierta la posibilidad de un servidor propio en internet, porque abriría opciones que hoy no existen: sincronizar PC, celular y aparato sin que el PC esté prendido, notificaciones con la app cerrada, acceso sin VPN, grupos de amigos y el «jardín» (ideas 1 y 1b de `docs/plan-estudio-y-mejoras.md`), y una IA incluida sin depender de la cuenta de cada usuario («Brote Plus» con clave de API, ver `docs/modelo-de-negocio.md`). Habría que refactorizar varias cosas; esta lista es para no cerrarse puertas hoy:

- **Qué habría que cambiar.** Cuentas y sesiones (hoy no existen: todo es «el usuario del computador»); el almacenamiento (`node:sqlite` y archivos de `~/.asistente-prototipo`, ya marcado como «detrás de una capa» para el celular: la misma capa serviría para un servidor); la sincronización con fuente de verdad y conflictos; el emparejamiento y el cifrado entre aparatos; y que «olvidar» borre también en el servidor.
- **Lo que ya ayuda.** El motor sin IA (plantillas, corrector, piezas, fechas, cálculos) es TypeScript puro y correría igual en un servidor; los pedidos del puente ya son mensajes JSON con tipos y podrían ser una API; las funciones se prenden y apagan por usuario (`funciones.json`); los pedidos distinguen quién los manda (`id` de correlación).
- **Lo que choca y hay que resolver antes.** (1) **Privacidad:** hoy la promesa es «todo queda en tu computador» (`docs/privacidad.md`); una nube la cambia y exige cifrado de punta a punta (el servidor solo guarda lo cifrado) o un consentimiento nuevo, además de la Ley 21.719 y los datos de menores. (2) **Términos de Anthropic:** una nube con la cuenta Pro de cada persona está prohibida; solo valdría con clave de API propia (del usuario o de Brote). (3) **Audio y transcripciones:** la regla actual es que nunca van a un tercero; en la nube probablemente quedarían fuera de la sincronización. (4) **Costo y operación:** hosting, respaldos, seguridad y soporte (hoy cero). (5) **Es difícil de revertir** (fila «Reversible» de la sección 5).
- **Una ruta gradual que no obliga a decidir hoy.** Primero la capa de almacenamiento y la sincronización «local primero» entre aparatos (sección 6); después un **relé** mínimo (un buzón cifrado entre aparatos, sin ver los datos) solo para notificaciones y emparejar; y recién si hace falta, un servidor con cuentas. Cada paso se puede parar.
- **Regla para el código de hoy:** seguir separando lo puro (motor, formatos, cálculos) de lo atado a Node o al disco, y no meter en la lógica supuestos de «un solo usuario en un solo computador» que se puedan evitar. No es trabajo nuevo: es no estorbar.

## Progreso

- [ ] Fase 0 verificar · [ ] Fase 1 centro accesible · [ ] Fase 2 PWA · [ ] Fase 3 gastos sin conexión · [ ] Fase 4 app nativa · [ ] Fase 5 casa · [ ] Fase 6 centro fijo
