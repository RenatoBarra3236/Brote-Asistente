# Plan: rediseño de la isla, uso del plan de Claude y Configurar Brote

Anotado el 3 de octubre de 2026, para la próxima sesión. Referencia de ideas (no de código: es GPL-3):
[vorssaint-utils](https://github.com/vorssaint/vorssaint-utils), que en su isla muestra de Claude, Codex y
OpenCode "plan limits and when they reset, tokens, API value, models, projects and live work".

## 1. Pestañas de la isla: de 4 a 3

> Hecho (ver CLAUDE.md): Brote, Claude (con el espacio reservado para la sección 2) y Equipo.

Hoy Inicio y Chat son casi lo mismo (las dos tienen el campo para preguntar). Propuesta:

| Pestaña | Contenido |
|---|---|
| **Brote** (Inicio + Chat juntos) | Tarjetas de lo que pasa ahora. Al conversar, la respuesta ocupa el espacio y las tarjetas se encogen a una fila de píldoras (♪ Santa Fe · 🍅 18:20 · 📅 en 25 min); al terminar de leer, vuelven. |
| **Claude** (antes Código) | Uso del plan (sección 2), sesiones en vivo con sus pasos y permisos, proyectos. |
| **Equipo** | Igual que hoy. |

A la derecha siguen "Lo que sé de ti" y Configurar. Ideas de distribución de vorssaint a copiar como
concepto: títulos de sección cortos en mayúsculas pequeñas, modo compacto, y poder **ocultar y reordenar**
las tarjetas de Inicio (en Configurar Brote → Funciones).

## 2. Uso del plan de Claude (pestaña Claude)

> **Hecho (3 de octubre de 2026).** El % llega de tres fuentes y vale la más reciente: la statusline
> (Claude Code interactivo), el archivo de la app de escritorio de Claude (idea de vorssaint-utils) y una
> consulta mínima `claude -p` que lee el evento `rate_limit_event` (~585 tokens, como mucho cada 15 min y
> solo con la pestaña Claude a la vista o el botón ↻). Detalles en CLAUDE.md. Lo de abajo es el plan original.

> Hecho (ver CLAUDE.md, "Uso del plan"): función `uso-del-plan`, statusline de Brote (`statusline.ts`, con
> consentimiento y envolviendo la que ya hubiera) que reenvía `rate_limits` al puente (`POST /plan`,
> `plan.json`), lector incremental de las transcripciones (`uso.ts`, `uso-archivo.ts`), tabla de precios del
> 3 de octubre de 2026 (`precios.ts`), barras, tokens y precios en la pestaña Claude, avisos de 80 % y 95 %,
> frases sin IA y MCP `claude_uso`. Verificado en la documentación de la statusline (Claude Code 2.1.283):
> trae `rate_limits.five_hour` / `seven_day` con `used_percentage` y `resets_at`, solo en Pro/Max y después
> de la primera respuesta. Probado con datos armados en Linux; falta probarlo en un Mac con Claude Code real.

Qué mostrar:
- Límite de la sesión de 5 h y el semanal: barra con % usado y "se reinicia en 2 h 10 min".
- Tokens de hoy y de la semana por modelo (entrada, salida, caché), y su **valor API** en USD.
- Tabla de precios por millón de tokens (entrada / salida / caché) de cada modelo usado, con la fecha de
  la tabla y el enlace a la página oficial de precios de Anthropic.
- Cuánto de eso gastó Brote (OpenClaw) y cuánto tus sesiones de Claude Code, por proyecto.

De dónde sacarlo **sin tocar credenciales** (sigue PROHIBIDO leer el Llavero, `~/.claude/.credentials.json`
o llamar APIs con el token del usuario):
1. **Límites del plan:** la statusline de Claude Code recibe un JSON por la entrada estándar. Verificar en la
   documentación oficial (https://code.claude.com/docs/en/statusline) si trae los límites (algo como
   `rate_limits` con el % usado y la hora de reinicio de las ventanas de 5 h y 7 días) y con qué versión.
   Si los trae: instalar (con consentimiento, como los hooks del modo programador: respaldo de
   `settings.json`, sin pisar una statusline que ya exista, envolviéndola) un script que reenvía solo esos
   números al servidor local del puente (`servidor-hooks.ts`, mismo token). Límite conocido: solo se
   actualiza mientras hay una sesión de Claude Code abierta; mostrar "actualizado hace X min". Si no los
   trae: no inventar el %, mostrar solo tokens y valor API.
2. **Tokens y valor API:** leer de las transcripciones locales `~/.claude/projects/**/*.jsonl` solo los
   campos de uso (`message.model` y `message.usage`: `input_tokens`, `output_tokens`,
   `cache_creation_input_tokens`, `cache_read_input_tokens`) y la fecha, nunca el texto de los mensajes
   (la misma idea que la herramienta ccusage). Las corridas de Brote también quedan ahí, en la carpeta del
   workspace de OpenClaw (`memoriaDeClaudeCode` en `rutas.ts` sabe calcularla). Cálculo incremental (recordar
   hasta qué byte se leyó cada archivo) para no releer gigas.
3. **Precios:** tabla en el código con fecha y fuente; verificar los precios vigentes de Sonnet 5.5, Opus 5.5
   y Haiku 4.5 antes de escribirla. Un modelo desconocido muestra tokens sin valor en USD.

Actualizar en CLAUDE.md la regla del modo programador ("el uso del plan solo llega por la statusline, que
no instalamos").

## 3. Configurar Brote: menos pasos y mejor distribución

> Hecho (ver CLAUDE.md): asistente de 3 pasos, barra lateral, funciones.json y Node con Homebrew.

Problema: 16 pasos seguidos con el mismo peso (Node, OpenClaw, Agente, Modelo, Gateway, Identidad, Permisos,
Skill, MCP, Memoria… y después opcionales y conectores).

- **Primera vez: asistente de 3 pasos.** (1) *Preparar*: los 11 pasos técnicos como una sola barra de
  progreso; solo aparece una tarjeta si el usuario debe hacer algo (instalar Node, iniciar sesión en Claude).
  (2) *Qué quieres que haga Brote*: presets (Estudiante, Programador, Todo, Lo mínimo) y una tarjeta con
  interruptor por función, que dice qué permiso de macOS pide. (3) *Listo*.
- **Después: barra lateral** con Estado (un indicador "Brote está funcionando", Reparar y los detalles
  técnicos plegados), Funciones, Conectores, Aula, Permisos (cada permiso, qué función lo usa y aviso si ya
  no hace falta) y Memoria.
- **Interruptores de verdad:** `~/.asistente-prototipo/funciones.json`; el puente no arranca los vigilantes
  de lo que está apagado (música cada 3 s, descargas, calendario, aula) y el motor responde "eso está
  apagado, actívalo en Configurar Brote".
- **Node con Homebrew:** si falta Node y existe `brew`, ofrecer "Instalar con Homebrew" (`brew install node`).
  Un cask de Brote en Homebrew solo vale la pena con la app firmada y notarizada (Apple Developer, 99 USD/año).

## 4. Pestaña Plata

> **Hecho (4 de octubre de 2026, en la nube; falta probarla en el Mac).** Detalles en CLAUDE.md ("Pestaña Plata").

Una pestaña entre Brote y Claude, de la función `gastos`, con lo que un estudiante quiere saber de su plata
sin preguntar nada:

| Qué | Cómo |
|---|---|
| **Este mes** | Total y comparación con el mes pasado **a la misma altura** (el 13 contra lo gastado hasta el 13 del mes pasado; si el mes pasado era más corto, su último día). Subir se muestra en ámbar, bajar en verde. |
| **Puedes gastar hoy** | (presupuesto − lo gastado antes de hoy) ÷ días que faltan contando hoy, menos lo gastado hoy. Verde, ámbar (menos de la mitad de la cuota diaria) o rojo (te pasaste). Sin presupuesto, invita a ponerlo. |
| **Últimos 7 días** | Barras en SVG propio, hoy resaltado. |
| **Por categoría** | Barras con un color por categoría (`COLOR_CATEGORIA` en `categorias.ts`) y su emoji. |
| **Descubrimiento sin IA** | Primero una categoría que se disparó (≥ 50 % y ≥ $5.000 más que los 7 días anteriores), después un gasto hormiga (≤ $3.000, 4+ veces y ≥ $8.000 en 30 días) y después uno que se repite cada mes (los dos meses anteriores, ±15 %). |
| **Últimos movimientos** | Los 5 más recientes con emoji. |
| **Un toque** | Los 2–3 gastos más repetidos (misma descripción y monto, 60 días) como botones; anotan igual que el motor (`Motor.anotarGasto`), y el puente solo acepta uno de esos. |

**Presupuesto mensual** (opcional): tabla `ajustes` de `asistente.db`. Se pone en Configurar Brote →
Funciones → Gastos (a través del puente) o sin IA ("mi presupuesto es 200 lucas", "pon mi presupuesto en
300 mil", "quita mi presupuesto"); se consulta con "¿cuánto me queda del presupuesto?" y "¿cuánto puedo
gastar hoy?". El agente lo lee con la herramienta MCP `gastos_presupuesto` (solo lectura). Avisos con
personalidad al pasar 80 % y 100 %, una vez cada uno por mes y por presupuesto (`avisos-presupuesto` en
`ajustes`).

Se actualiza al anotar: el puente mira `gastos.marca()` cada 2 s (así también aparece lo que anota el
agente por MCP, que es otro proceso) y manda el aviso `plata`.

Ideas para después: metas de ahorro, gastos compartidos con amigos, exportar el mes a CSV.

## 5. Avisos sin abrir la isla (pedido del usuario, 4-10-2026; hecho; notificación del sistema sin probar en un equipo real)

Hoy casi todo aviso **abre la isla** (`panel.mostrarAviso` + `retener` la mantienen abierta unos segundos):
que terminó o falló una sesión de Claude Code, una descarga lista, un temporizador, el calendario 10 min
antes, una entrega del aula, el plan o el presupuesto al 80 %, lo que hizo el equipo… Es molesto: tapa lo que
el usuario está haciendo.

Regla nueva: **solo se abre sola cuando hace falta una decisión** (un permiso de Brote o de Claude Code, una
propuesta "¿Aprendo esto?"). Lo demás es una **notificación discreta con la isla cerrada**:
- En el ala izquierda, unos segundos: un ícono y un texto corto ("✅ Claude terminó · tarea-rust",
  "📥 apunte.pdf listo", "📅 Cálculo en 10 min"), con una animación suave (un pulso o brillo alrededor del notch
  del color del aviso) y Brote dando un saltito en el ala derecha. Nada de agrandar la isla.
- Un **punto** en el ala o en la pestaña que corresponde, hasta que el usuario abra la isla.
- Al abrirla (con el cursor), los avisos de los últimos minutos quedan en una lista corta de "Novedades".
- Opcional (configurable): además, una notificación del sistema (Centro de notificaciones de macOS /
  notificaciones de Windows) para lo importante, como el calendario.
- En el modo flotante (ya no es el de Windows, que usa la misma isla; solo con `ASISTENTE_MODO=flotante`) igual: Brote reacciona y muestra el aviso en una burbuja chica junto a él,
  sin desplegar el panel.

## 6. Privacidad y protección de datos (revisión del 4-10-2026; puntos 1 a 8 hechos; el 2 solo con A: aula e iCal, sin probar en un Mac real)

Revisado en el Mac del usuario: todos los archivos con datos o secretos están en 600 (`~/.asistente-prototipo/*`,
`openclaw.json`, las bases de OpenClaw, `gateway.log`), FileVault activado, telemetría de funciones de OpenClaw
apagada (queda solo el aviso diario de versión), Gateway y servidor del puente solo en 127.0.0.1 con token,
nunca se leen credenciales de Claude y el repo no tiene secretos. Lo que falta, en orden:

1. **Gemini gratis y datos personales** (hecho y probado en el Mac el 4-10-2026; la skill se reinstala con `openclaw skills install ./packages/motor/skill/delegar --as delegar --agent <id> --force` y se carga en una sesión nueva): en el plan gratis Google puede usar lo que recibe para entrenar y
   revisarlo con personas. La skill `delegar` debe prohibir pasarle a especialistas de planes gratuitos datos
   personales (nombre, gastos, memoria, calendario, aula); la tarjeta de Gemini en Cuentas de IA lo avisa más claro.
2. **Secretos en texto plano** (hecho el 4-10-2026, opción A; falta probarlo en un Mac real y en Windows): el token del aula y la dirección iCal van al Llavero de
   macOS / Administrador de credenciales de Windows (`apps/desktop/src-tauri/src/secretos.rs`, crate `keyring`). Solo Rust toca el Llavero y
   le pasa los secretos al puente (y a `configurar.ts`) por la entrada estándar; el archivo queda con `enLlavero: true`.
   Migración idempotente al arrancar. Sin Llavero (Linux o si falla) el archivo conserva el secreto (600). Auditoría de OpenClaw
   (`openclaw secrets audit`, 4-10-2026): en texto plano `gateway.auth.token`, `models.providers.llama-cpp.apiKey`,
   `plugins.entries.google.config.webSearch.apiKey` y la clave de Gemini del Investigador (`openclaw-agent.sqlite`); aceptan SecretRef
   (`env|file|exec|store`, sin Llavero nativo), pero no se tocan: si el Gateway no resuelve el secreto al partir, Brote queda muerto, y las
   cabeceras de los servidores MCP (token de GitHub) no admiten SecretRef. `dispositivo.json` (clave del dispositivo) queda como está (opción B, pendiente).
3. **Registros con conversaciones** (hecho el 4-10-2026, `packages/adapter/src/limpiar-registros.ts`): `~/Library/Logs/openclaw/gateway.log`
   es la salida estándar del Gateway bajo launchd. Sus líneas con marca de tiempo o `[subsistema]` son técnicas; lo que
   traía conversación eran 63 líneas sueltas (sin marca) con respuestas completas de un especialista, que el logger de
   OpenClaw no controla (`logging.level`/`redactPatterns` no sirven). El puente quita esas líneas al partir y cada hora,
   solo en `gateway.log` y `gateway.log.N`, en el mismo archivo (mismo inodo, permisos 600). El registro propio de OpenClaw
   (`/tmp/openclaw/openclaw-AAAA-MM-DD.log`) se borra solo a las 24 h.
4. **Datos en claro en el disco** (hecho el 4-10-2026): docs/instalar.md, en "Tus datos", recomienda FileVault
   (Mac) o BitLocker (Windows) y explica por qué (gastos, memoria y transcripciones quedan en claro).
5. **"Olvidar" va a la Papelera** (hecho el 4-10-2026, `src/agente/papelera.ts`): en macOS la ventana dice que el dato sigue en la
   Papelera hasta vaciarla; en Windows y Linux `aLaPapelera` borra de verdad (sin Papelera) y el texto lo dice así.
6. **Respaldos que se acumulan** (hecho el 4-10-2026: `podarRespaldos` deja los 3 últimos): `~/.claude/settings.json.brote-*.bak`.
7. **Antes de repartir Brote a más gente** (borrador hecho el 4-10-2026 en `docs/privacidad.md`, falta que alguien lo revise): una política de privacidad corta (qué se guarda, dónde, a qué empresas
   va —Anthropic, Google, conectores— y cómo borrarlo), partiendo de "Tus datos" en docs/instalar.md. En Chile
   rige la Ley 21.719 desde diciembre de 2026 (orientación, no asesoría legal).
8. **Avisar si Brote quedó con una clave de API** (hecho el 4-10-2026, `packages/adapter/src/clave-api.ts`; el paso "Claude Code con tu cuenta" de Configurar Brote queda en "falta" con el aviso): hoy `entorno::sin_clave_api` solo evita
   heredarla desde la terminal; no impide que alguien la ponga a propósito (`env` de `~/.claude/settings.json`, la
   config de OpenClaw o el plist del Gateway). Configurar Brote → Estado debe avisar cuando `claude auth status`
   (sin la variable) muestre `apiKeySource`, o cuando `settings.json` tenga `ANTHROPIC_API_KEY` en `env`. Solo leer
   el estado y los nombres de las variables, nunca sus valores ni credenciales.

## 7. Calendario como sección propia de la isla (anotado el 4-10-2026; hecho el mismo día como pestaña Agenda; sin probar en un Mac real)

> Hecho (ver CLAUDE.md, viñeta «Pestaña Agenda»): pestaña propia con 14 días, entregas del aula y recordatorios, y la explicación del permiso. Pendiente: tareas de Todoist (hay un tipo `tarea` previsto), navegar por semanas si 14 días no alcanza, probar EventKit y `Brote.app` en un Mac.

> **Pendiente de diseño (pedido del usuario, 4-10-2026):** la pestaña Agenda hoy es funcional pero casi sin diseño (lista simple por día). Darle un diseño propio, estilo Notion: por ejemplo vista de semana o mes, tarjetas por tipo, y un estado vacío con más gracia. En la prueba real (`tauri dev`) se quedó en «Armando tu agenda…» porque corría el puente anterior, sin el pedido `agenda-estado`; tras reiniciar la app cargó bien y mostró un evento real de todo el día (confirmado por el usuario, 4-10-2026). Falta que un fallo del pedido muestre un mensaje en vez de quedarse cargando.

Hoy el calendario es solo una tarjeta de Inicio. La idea: una **sección en la isla** para ver eventos y todo lo
relacionado con el orden del usuario (clases, entregas, recordatorios, tareas), con un estilo parecido a Notion.
Al hacerla, arreglar lo del permiso: en Ajustes del Sistema → Privacidad → Calendarios solo aparece **Terminal**
con "Acceso completo" (captura del 4-10-2026), porque con `tauri dev` el permiso es de la Terminal y no de Brote.
Brote.app empaquetada tiene que pedir y tener el suyo (ver `Info.plist` y el paso "Calendario del Mac" de
Configurar Brote), y la sección nueva debe explicar qué hacer si falta.

## 8. Grabar y transcribir (conversado y aprobado el 4-10-2026; fases 1 a 4 hechas el 5-10-2026; la 3 sin probar con un micrófono real)

Grabar audio (por ejemplo una clase), transcribirlo y que Brote ayude con el texto: resúmenes y, en la fase 2,
tareas y fechas para Agenda (sección 7). El proyecto vivirá además en el celular (app Tauri móvil) y en una "casa"
física cuyo hardware **no está decidido** (depende de lo que pidan los usuarios): por eso el diseño separa captura,
transcripción y un contrato común, y cualquier aparato solo tiene que cumplir una de dos cosas (capturar y entregar
audio a otro aparato tuyo, o capturar y transcribir por su cuenta).

### Decisiones tomadas

1. **Transcripción local** con whisper.cpp: el audio no sale del aparato. Sin API, costo en plata cero. La casa o el
   celular que no puedan correr el modelo mandan el audio por la red propia al PC o al celular, nunca a la nube.
   Cada aparato declara qué puede hacer (`captura`, `transcribe` y con qué modelo).
2. **Privacidad (`docs/privacidad.md`, Ley 21.719):** el audio no llega a ninguna empresa y no se suma ningún proveedor
   a la lista. El texto transcrito solo viaja a Anthropic cuando el usuario pide algo a Brote (un resumen). Nunca a
   especialistas de planes gratuitos (Gemini): se extiende la sección de privacidad de la skill `delegar`, con prueba.
   Las voces de terceros son datos personales de otros: de ahí el consentimiento (punto 5). Todo en claro con
   permisos 600 y la recomendación de FileVault/BitLocker.
3. **Micrófono:** la captura se hace en Rust (no en el WebView), para que el permiso sea de `Brote.app`.
   `NSMicrophoneUsageDescription` en `Info.plist`; el permiso se pide la primera vez que el usuario graba, no al
   abrir la app. Con `tauri dev` el permiso es de la Terminal (como Calendarios). En Windows no hay aviso por app, solo
   el interruptor general: la función debe detectar "no llega sonido" y explicarlo. **Solo manual**: el usuario inicia
   y detiene (botón 🎙 o "graba esta clase"); Brote nunca graba por su cuenta (ni con el calendario). Mientras graba,
   punto rojo en la isla y en el ícono 🌱 de la barra de menú.
4. **Almacenamiento:** audio en `~/.asistente-prototipo/grabaciones/` y texto en
   `~/.asistente-prototipo/transcripciones/` (uno por grabación), ambos 600, separados de la memoria de OpenClaw.
   **El audio se conserva N días y se borra solo** (propuesto 7, por confirmar). El borrado toca solo esa carpeta, con
   nombres exactos, va a la Papelera en Mac y se prueba solo en carpeta temporal. Ver y borrar desde "Lo que sé de ti".
5. **Consentimiento:** aviso con casilla propia la primera vez (y cada vez que cambie el texto) y, **en cada
   grabación, Brote pregunta "¿avisaste a los presentes?"** (sí / no / solo mi voz); la respuesta queda en el campo
   `avisoAPresentes` de la transcripción. Brote no da asesoría legal ni firma por el usuario. El texto se suma a
   `docs/privacidad.md` y debe revisarlo alguien antes de repartir Brote.
6. **Modelos (cifras de memoria, verificar antes de anotarlas en la guía):** base ~150 MB, small ~500 MB, medium
   ~1,5 GB, large-v3-turbo ~1,6 GB. **El usuario elige en Configurar Brote, con `small` de partida**; la descarga
   pide confirmación. En el celular, `small` es lo realista. Medir la velocidad real en el M5 antes de dar cifras.
7. **Alcance:** fase 1 = guardar, mostrar y resumir bajo pedido. Fase 2 (B) = extraer tareas y fechas y proponerlas en
   la isla, con confirmación antes de llamar a `calendario_crear`.

### Diseño

Flujo: 🎙 en la isla (o la frase) → pregunta de consentimiento → graba con punto rojo → al detener, transcribe en
segundo plano → guarda el texto → aviso por Novedades (sin abrir la isla).

- **Captura:** Rust, `grabacion.rs`, WAV mono 16 kHz.
- **Transcripción:** el puente lanza `whisper-cli` como proceso hijo (como hace con Node), detrás de la interfaz
  `transcribir(audio, modelo) → segmentos con tiempo`, para que el celular y la casa la implementen distinto.
- **Contrato común:** un Markdown por grabación con cabecera (fecha, duración, origen `pc|celular|casa`, modelo,
  `avisoAPresentes`) y el texto con marcas de tiempo. Resúmenes, tareas y fechas leen solo esto.
- **Agente:** MCP de solo lectura `transcripciones_listar` / `transcripciones_leer` (solo esa carpeta; las largas por
  partes). Función nueva `grabaciones` en `funciones.json`, apagada de fábrica y fuera del preset Estudiante hasta que
  se pruebe.
- **Configurar Brote:** tarjeta con la casilla de consentimiento, el modelo, los días de conservación y el estado del
  permiso del micrófono.

### Fases

1. **Cimientos sin micrófono:** contrato y formato (`packages/motor/src/transcripciones.ts`, puro), borrado a los N
   días, MCP y su regla en `delegar`. Pruebas con carpeta temporal y una transcripción armada.
2. **Transcripción de un WAV (hecha el 5-10-2026):** puente con `whisper-cli`, descarga del modelo en Configurar Brote. Probado con un
   audio de ejemplo y un `whisper-cli` falso.
3. **Captura y permiso (hecha el 5-10-2026):** `grabacion.rs` (cpal), `Info.plist`, punto rojo y pregunta de
   consentimiento. Solo se prueba de verdad con `Brote.app` en un Mac.
4. **Isla y memoria (hecha el 5-10-2026):** frases sin IA, sección «Grabaciones» en "Lo que sé de ti" (ver y borrar), botón «Abrir Privacidad» en el error del micrófono, el micrófono en Configurar → Permisos, vistas previas y `docs/privacidad.md`. El botón 🎙 ya venía de la fase 3.
5. **Tareas y fechas hacia Agenda (hecha el 5-10-2026, sin probar en un Mac):** el agente de Brote las propone y la isla pide confirmación. Ver «Fase 5: diseño y pruebas pendientes».

### Pruebas pendientes de la fase 1 (anotadas el 5-10-2026, para hacer en un Mac)

- [ ] Borrado de audios vencidos a la Papelera real: en un Mac, con `ASISTENTE_GRABACIONES` apuntando a una carpeta de prueba, crear `2026-01-01-080000.wav` y llamar `borrarAudiosVencidos(7)`; revisar que va a la Papelera de Finder (la prueba automática se salta en Mac a propósito).
- [ ] MCP bajo OpenClaw: detener los procesos `node …/packages/motor/src/mcp.ts` y el `claude … --resume`, abrir sesión nueva y pedir "lista mis transcripciones" y "léeme la transcripción X" con una transcripción armada a mano en `~/.asistente-prototipo/transcripciones/` (el MCP corre bajo launchd: comprobar que lee esa carpeta y que `openclaw mcp probe gastos` muestra las dos herramientas).
- [ ] Función apagada: con `grabaciones` apagada, el agente recibe el mensaje de apagada y no lee nada; prenderla desde Configurar Brote → Funciones (aparece en el listado genérico; comprobar que el interruptor guarda).
- [ ] Skill `delegar`: reinstalarla (`openclaw skills install ./packages/motor/skill/delegar --as delegar --agent <id> --force`, sesión nueva) y comprobar que, con un especialista de Gemini, Brote se niega a pasarle una transcripción.
- [ ] Permisos reales: que `~/.asistente-prototipo/transcripciones/` y `grabaciones/` queden 700 y los archivos 600 al crearlos la app (hoy solo probado en carpeta temporal en Linux/Mac de desarrollo).
- [ ] Windows: `aLaPapelera` borra de verdad (sin Papelera); comprobar que los textos de la isla lo dicen cuando exista la ventana (fase 4).
- [ ] Texto de `docs/privacidad.md` sobre voces de terceros: que lo revise alguien antes de repartir Brote.

### Pruebas pendientes de la fase 2 (anotadas el 5-10-2026, para hacer en un Mac)

- [x] (5-10-2026) `whisper-cli` instalado con Homebrew en `/opt/homebrew/bin`: `--help` confirma que acepta `-m -f -l -t -oj -of -np`. **Probado el 5-10-2026 con `whisper-cli` 1.9.4 real y el modelo `base` (descargado a /tmp, SHA-256 y tamaño correctos, borrado después)**: el JSON tiene la forma supuesta; una frase hablada con `say` salió bien ("Buenos días, hoy vemos derivadas y la regla de la cadena.", 0,4 s para 3 s de audio en `base`); sobre silencio devuelve la marca `[Música]`, que el lector descarta (`esMarcaSinHabla`); `-sns` NO sirve (sobre silencio inventa frases). Sigue sin probar: `small`, la descarga por Rust y la velocidad con grabaciones largas.
- [ ] `brew install whisper-cpp` desde el botón "Instalar con Homebrew" (terminal `brew-whisper`): comprobar que deja `whisper-cli` en el PATH y que Configurar Brote lo reconoce al volver a la ventana. Con `ASISTENTE_WHISPER` si Brote se abre desde el Finder y no lo encuentra.
- [ ] `whisper-cli` real contra un WAV corto de verdad (mono 16 kHz): que el JSON `-oj -of` tenga la forma que se supuso (`transcription[].offsets.{from,to}` en ms y `text`; verificada solo en el código fuente de whisper.cpp 1.9.4, no corriéndolo) y que `-l es` y `-np` sean aceptados por la versión de Homebrew.
- [ ] Descarga real del modelo `small` (488 MB) desde Configurar Brote en `Brote.app`: avance, "verificando", SHA-256 correcto, archivo 600 y carpeta 700; cortar la red a la mitad (queda `.parte` y se borra); cancelar; descargar otra vez con el archivo ya completo (no baja de nuevo). Probar `base` con un SHA-256 alterado a propósito en una copia local de la lista para ver el error. El `curl` de macOS es `/usr/bin/curl`; en Windows se usa `curl.exe` (viene con Windows 10 1803+): sin probar.
- [ ] Velocidad real de `small` y `large-v3-turbo` en el M5 con una grabación de 10 minutos (no hay cifras aún; no anotar "X veces más rápido" hasta medir), y que el vigilante del puente no la tome por colgada (el tope es 4 h).
- [ ] Transcripción de punta a punta desde `Brote.app`: copiar a mano un WAV a `~/.asistente-prototipo/grabaciones/AAAA-MM-DD-HHMMSS.wav`, prender la función, aceptar el aviso y mandar un pedido `transcribir` (hoy solo se puede por el puente; la isla llega en la fase 4): aviso "🎙 Tu transcripción está lista" en la isla cerrada y el `.md` con permisos 600.
- [ ] Borrado de audios vencidos con la función prendida (Papelera real en Mac) a la hora de prenderla y a la hora de uso; con la función apagada, nada se borra aunque haya audios viejos.
- [ ] El aviso de la isla (`Novedades` tipo `transcripcion`): punto en la pestaña Brote y notificación del sistema si está prendida (`IMPORTANTES`).
- [ ] Windows: `whisper-cli.exe` en el PATH (no hay "Instalar con Homebrew"; el paso solo explica dónde bajarlo), `curl.exe` y la ruta de `modelos/`.
- [ ] Cambiar el texto de consentimiento y subir `VERSION_CONSENTIMIENTO_GRABACIONES` (motor + `configuracion.rs`: una prueba del motor las compara): comprobar que la casilla vuelve a quedar sin marcar y el puente no transcribe hasta aceptar otra vez.

### Pendientes al cerrar la fase 2 (5-10-2026)

- **Sin commit**: todo lo de la fase 2 está en el árbol de trabajo (el usuario hace el commit con GitHub Desktop).
- **Decisiones del usuario sin responder**: (1) ¿se queda el consentimiento obligatorio, sin el cual el puente no transcribe? (2) ¿descargar modelos con el `curl` del sistema (en Windows, `curl.exe`) o sumar una librería HTTP a Rust? (3) quién revisa el texto de consentimiento y de `docs/privacidad.md` antes de repartir Brote.
- **Sin probar**: descarga real del modelo por Rust (`modelo_descargar`) en `Brote.app`; `small` y velocidad en el M5; grabaciones largas (10 min o más); el botón "Instalar con Homebrew" (`brew-whisper`); borrado a la Papelera real; el aviso de la isla y la notificación del sistema; Windows (`whisper-cli.exe`, `curl.exe`); ver "Pruebas pendientes de la fase 2" arriba.
- **Cabos sueltos conocidos**: no hay frases sin IA, ni botón 🎙, ni sección en "Lo que sé de ti" (fase 4); nada lanza `transcribir` salvo el pedido al puente; `modelo_borrar` existe en Rust pero ninguna ventana lo usa; el MCP `transcripciones_*` sigue sin probarse bajo OpenClaw (lista de la fase 1); Agenda tiene dos pendientes ajenos (diseño estilo Notion y mensaje cuando falla `agenda-estado`).
- **Siguiente (5-10-2026, actualizado al cerrar la fase 5)**: la fase 5 está hecha (ver «Fase 5: diseño y pruebas pendientes»); queda probar todo en un Mac. (Antes: la fase 4 está hecha (ver «Pruebas pendientes de la fase 4»); sigue la fase 5 (tareas y fechas hacia Agenda, con confirmación). Antes: la fase 3 está hecha (ver «Pruebas pendientes de la fase 3»); sigue la fase 4 (frases sin IA «graba esta clase», sección en «Lo que sé de ti» con un lugar para borrar transcripciones, y el botón «Abrir Privacidad» en el error del micrófono).

### Fase 5: diseño y pruebas pendientes (5-10-2026)

**Cómo funciona.** Solo cuando el usuario le pide a Brote «saca las tareas de la clase de hoy»: Brote lee la transcripción con `transcripciones_leer` y llama a la herramienta MCP `agenda_proponer` con una lista corta (`tipo` tarea o evento, `titulo`, `fecha`, `detalle`). Nada se extrae solo al detener o transcribir. La herramienta valida (`validarPropuesta`: título de 3 a 120 letras, fecha local real entre ayer y un año, un evento exige hora, id de grabación con la forma exacta y que exista) y deja **propuestas pendientes** en la tabla `propuestas_agenda` de `asistente.db` (solo título corto, fecha y el id de la grabación: nunca el texto de la clase). El puente mira la base cada 2 s y manda el aviso `propuestas-agenda`; la isla muestra en la pestaña Agenda la tarjeta «Encontré N cosas en tu grabación» con Agregar / Editar / Descartar y «Agregar todo», y avisa por Novedades (tipo `agenda`, sin abrir la isla). Decisión del usuario (5-10-2026): lo aceptado convive en la isla y en el calendario. Una **tarea** se guarda en la tabla `tareas` (Agenda, con check) y, con el calendario prendido, también se crea en el Calendario del Mac como un evento de 30 min que termina a su hora límite (Agenda esconde ese evento para no repetirla: `armarAgenda`); una **prueba con hora** crea el evento (1 h) y Agenda lo muestra desde el calendario. El toque en la isla es la confirmación, no se pide otra. Sin calendario prendido o sin permiso, la tarea queda solo en Agenda y la prueba queda como tarea. Marcar hecha una tarea no cambia su evento del calendario. Lo descartado no vuelve a proponerse. Al borrar una transcripción se van sus propuestas pendientes (no lo ya aceptado). Pedidos del puente: `propuestas-listar`, `propuesta-decidir { propuesta, decision: "aceptar"|"descartar", titulo?, fecha? }`, `tarea-hecha { tarea, hecha }`. Sin función nueva: cuelga de `grabaciones` (la herramienta) y la pestaña Agenda se ve también con solo Grabar prendida; las tareas ya aceptadas se ven aunque la función se apague.

**Reglas que se cumplen.** Quien extrae es el agente de Brote (Anthropic), nunca un especialista; la skill `delegar` ya lo prohíbe. `agenda_proponer` no escribe en el calendario ni en la Agenda. Ningún texto de transcripción sale de `~/.asistente-prototipo/transcripciones`.

Hecho con pruebas: validación y tablas (`pruebas/tareas-agenda.test.ts`), tipo `tarea` en `armarAgenda`, la herramienta MCP (`mcp.test.ts`), el puente real de punta a punta con otro proceso que propone (`propuestas-agenda-puente.test.ts`), textos de la isla (`propuestas-agenda.test.ts`) y la vista previa `vista-previa.html?pestana=agenda&propuestas=1`.

Pruebas pendientes (para un Mac):

- [ ] Reiniciar los procesos MCP (`node …/packages/motor/src/mcp.ts` y el `claude … --resume`), sesión nueva, y con una transcripción real pedirle a Brote «saca las tareas de mi última clase»: que lea la transcripción, llame a `agenda_proponer` sin pedir permiso y la tarjeta aparezca en Agenda. Comprobar que `openclaw mcp probe gastos` lista la herramienta.
- [ ] Qué tan bien saca las fechas el modelo («el viernes», «la próxima semana»): revisar que calcule bien la fecha con la de la grabación y no invente tareas. Si falla, ajustar la descripción de la herramienta.
- [ ] Aceptar una tarea con el calendario prendido: que aparezca una sola vez en Agenda (con check) y en el Calendario del Mac como evento de 30 min hasta su hora límite.
- [ ] Aceptar una prueba con hora en `Brote.app` con el permiso de Calendarios: que aparezca en el Calendario del Mac (1 h) y en Agenda. Sin el permiso: que quede como tarea y el mensaje lo diga.
- [ ] El check de una tarea en la tarjeta y que recargar la isla lo conserve.
- [ ] Borrar una transcripción desde «Lo que sé de ti» con propuestas pendientes: que desaparezcan de Agenda.
- [ ] El aviso de Novedades tipo `agenda` (punto en la pestaña Agenda, texto en el ala, y notificación del sistema si está prendida) y el aspecto de la tarjeta en el notch real.
- [ ] Con solo Grabar prendida (sin calendario, aula ni temporizadores): que la pestaña Agenda aparezca y explique bien lo que falta.

### Pruebas pendientes de la fase 3 (anotadas el 5-10-2026, para hacer en un Mac)

Hecho: lógica pura con `cargo test` (conversión a 16 bits, mono, remuestreo 48 k y 44,1 k → 16 k, encabezado WAV, escritor
con encabezado válido sin cerrar, permisos 600, tope de 3 h, ids), `clippy`, estado y textos de la isla con `node --test`
y las cinco escenas en la vista previa (Chrome). NUNCA se abrió el micrófono real ni se grabó nada.

- [ ] Micrófono real con `Brote.app` (`tauri build --bundles app`): la primera vez, el aviso de macOS sale con el texto de `NSMicrophoneUsageDescription` y es de Brote, no de la Terminal; `grabacion_iniciar` espera la respuesta (hasta 2 min) y la isla muestra «Abriendo el micrófono…». Con `tauri dev` el permiso es de la Terminal.
- [ ] Permiso negado: decir que no (o quitarlo en Ajustes) y comprobar que el error de la isla dice cómo activarlo y que no queda un `.wav` vacío en `~/.asistente-prototipo/grabaciones/`. Falta un botón «Abrir Privacidad» en ese error (el enlace `privacidad-microfono` ya existe en Rust).
- [ ] Formato real: grabar 30 s y 10 min y comprobar con `whisper-cli` y `afinfo`: mono, 16 kHz, 16 bits, duración correcta; ninguna distorsión por el remuestreo (el micrófono del M5 suele dar 48 kHz, pero AirPods y otros dan 16 o 24 kHz estéreo/mono: probar al menos uno de cada).
- [ ] Cambiar de micrófono a media grabación (desconectar AirPods): cpal debe avisar (`DeviceNotAvailable`/`DeviceChanged`); comprobar que la isla muestra el error, el WAV queda válido y se puede transcribir lo grabado. No se sabe cómo reacciona cpal 0.18 en macOS al cambio de ruta por defecto.
- [ ] Cierre a la mitad: grabar, cerrar Brote con Cmd + Q y con `kill -9`; el WAV debe abrirse (con `kill -9` pierde como mucho los últimos 5 s: el encabezado se refresca cada 5 s).
- [ ] Tope de 3 h: no se probó con 3 h reales (solo el contador); dejar grabando en silencio y comprobar que corta, avisa y transcribe (y el tamaño: ~345 MB).
- [ ] Punto rojo: `🌱🔴` en la barra de menú de macOS (si el emoji se ve raro en el título del ícono, cambiar por un ícono dibujado), el tooltip en Windows y el `🔴 mm:ss` del ala izquierda sobre el notch real y sobre apps en pantalla completa.
- [ ] «No llega sonido» (8 s sin una muestra distinta de cero): con el micrófono silenciado por hardware en Mac y, sobre todo, con el interruptor general de micrófono de Windows. En una sala muy silenciosa los micrófonos dan ruido de fondo (no cero), pero un micrófono virtual puede dar ceros exactos y avisar de más.
- [ ] Punta a punta: grabar 1 min diciendo una frase, detener, responder «¿avisaste?», y comprobar que `transcripciones/<id>.md` queda con `avisoAPresentes` igual a lo respondido, permisos 600, y que el aviso de la isla dice «Transcribiendo…» y luego «Tu transcripción está lista». Sin la función o sin el consentimiento: el audio queda guardado y el aviso lo explica.
- [ ] Windows: compilar con `cpal` (WASAPI), el aviso del micrófono (no hay por app), `ms-settings:privacy-microphone`, grabar con el micrófono por defecto y el texto de «no llega sonido». Linux: necesita `libasound2-dev` para compilar; la CI de Linux (si se agrega) debe instalarlo.
- [ ] Segunda grabación seguida sin cerrar la app y grabar con la ventana de Configurar abierta (los dos comparten el proceso Rust).

### Pruebas pendientes de la fase 4 (anotadas el 5-10-2026, para hacer en un Mac)

Hecho: frases del motor con sus frases de control (`pnpm --dir packages/motor test`), la decisión de la isla (`accionDeFrase`), el borrado con nombres exactos, sin enlaces ni carpetas, en carpeta temporal (motor y adaptador), el pedido del puente de punta a punta con la función apagada (el borrado real se salta en Mac), los textos por plataforma, y las vistas previas en Chrome (`vista-previa-memoria.html`, el error del micrófono, Permisos). Decisiones del usuario: el punto rojo de la barra de menú se queda como `🌱🔴` (a revisar cuando se vea en el Mac); las transcripciones y los audios se borran de a una y con «Borrar todo».

- [ ] Frases con la app real (`Brote.app`): «graba esta clase» abre la pregunta «¿avisaste a los presentes?» y NO graba hasta responderla; «para la grabación» detiene; «¿estoy grabando?» responde; «mis transcripciones» y «¿qué grabé hoy?» listan. Con la función apagada, «graba esta clase» responde «Eso está apagado» y no abre nada. (La vista previa del navegador no pasa por el motor: no se vieron estas frases en la isla.)
- [ ] Borrar a la Papelera real en Mac, desde «Lo que sé de ti»: una transcripción, un audio y «Borrar todo» de cada tipo, con transcripciones armadas a mano en una carpeta de prueba (`ASISTENTE_TRANSCRIPCIONES` / `ASISTENTE_GRABACIONES` al lanzar la app) — nunca con las grabaciones reales. Comprobar que van a la Papelera de Finder y que el aviso lo dice.
- [ ] Windows y Linux: el borrado es de verdad (sin Papelera) y los textos dicen «para siempre» (la prueba automática del borrado real corre en Linux; en Windows no se probó).
- [ ] «Ver el texto» con una transcripción de 3 h real (hasta ~300.000 caracteres): que la ventana no se trabe.
- [ ] Con la función apagada, la sección Grabaciones sigue mostrando y borrando lo guardado (se probó con el puente real, no con la ventana).
- [ ] El error de permiso del micrófono con `Brote.app`: el botón «Abrir Privacidad» abre Ajustes del Sistema en Micrófono (en Windows, `ms-settings:privacy-microphone`). La detección del error es por el texto de Rust (`esErrorDePermisoMicrofono`: «permiso» y «micrófono»); si se cambia `explicar` en `grabacion.rs`, revisarla.
- [ ] Configurar → Permisos → Micrófono: el texto «No se puede saber» y el botón a Privacidad se leen bien en el Mac.

**Pestaña Grabar de la isla (pedido del usuario el 5-10-2026):** el micrófono arriba, y dos listas: «Grabaciones» guardadas (al tocar una sale «Transcribir») y «Transcripciones». Cambia el flujo de la fase 3: detener ya no transcribe solo. Pendiente de probar en un Mac:

- [ ] Grabar → detener → el audio aparece en la pestaña Grabar como «Sin transcribir» y el aviso dice que está ahí (sin transcribir solo).
- [ ] «Transcribir» con `whisper-cli` y modelo reales: pasa a «En cola», «Transcribiendo…», «Transcrita» y aparece en «Transcripciones» con `avisoAPresentes` igual a lo respondido al grabar (`avisos-grabaciones.json`, permisos 600).
- [ ] «Transcribir» sin consentimiento aceptado o sin modelo: la fila muestra «No se pudo transcribir» y el aviso explica por qué.
- [ ] Cerrar la isla mientras transcribe y volver: el estado sigue (hoy se pierde el chip «Transcribiendo…» si se reinicia la app a mitad; el audio sigue sin transcripción).
- [ ] Ver el texto de una transcripción larga dentro de la fila (130 px con scroll) y borrar con segundo toque (a la Papelera en Mac).
- [ ] «Copiar» una transcripción en `Brote.app` (isla y «Lo que sé de ti»): pegar en otra app y comprobar que trae el texto completo con marcas de tiempo. En el navegador se probó con Chrome y permisos concedidos; el webview de Tauri en macOS/Windows no.
- [ ] La pestaña sobre el notch real: con 6 pestañas a la izquierda ya cabe justo en la vista previa; revisar que no choque con el notch.

### Sin probar hasta tener un Mac (y otros aparatos)

Permiso del micrófono con `Brote.app`; punto rojo sobre el notch real; velocidad en el M5; Windows (interruptor
general de micrófono); celular y casa (solo quedan el contrato y la interfaz, sin código).

### Decisiones aún abiertas (mi recomendación entre paréntesis; el usuario aprobó el plan sin cambiarlas)

1. Cómo llega `whisper-cli`: Homebrew (`brew install whisper-cpp`, como Node) o empaquetado en `Brote.app` (Homebrew
   en la primera versión: no hay que firmar un binario extra).
2. Días de conservación del audio (7).
3. Formato del archivo (Markdown con cabecera simple).
4. Idioma (español por defecto, con selector).
5. Tope de duración de una grabación (3 horas, para no llenar el disco por un olvido).
6. Texto legal del aviso de consentimiento (revisión de alguien antes de repartir).
7. Hardware de la casa (no decidido; se anotan requisitos mínimos a medida que haya decisiones).

## 9. Ideas para después (anotadas el 4-10-2026; paréntesis, nada empezado)

1. **Brote recibe archivos y hace lo que el usuario pida con ellos.** El usuario le suelta un archivo (por ejemplo
   arrastrándolo a la isla) y le dice qué hacer: resumirlo, extraer fechas, ordenar apuntes, etc. Con una animación
   propia (Brote "recibe" el archivo, lo mastica, lo revisa). Por pensar: qué tipos de archivo, cómo llega al agente
   (OpenClaw), permisos de lectura de la carpeta y privacidad (sección 6: el contenido va a la IA que elija el usuario).
2. **Distintos estilos de Brote**: otros animales, cosas u objetos, o disfraces. Probablemente haya que **rediseñar el
   personaje** para que sea fácil de variar (hoy es un cuerpo crema con brote dibujado en el lienzo, y las mascotas del
   equipo ya usan `Apariencia` con cuerpo, hoja y accesorio: ahí hay una base). Respetar la regla de no copiar
   personajes ni dibujos de otros proyectos.
3. **Quizás cambiar el nombre del proyecto**, a raíz del punto 2: si Brote puede ser un animal o un objeto, "Brote"
   (un brote de planta) deja de calzar. Decidirlo junto con el rediseño; el nombre está en la app, `Brote.app`, los
   textos, la identidad del agente (`IDENTITY.md`/`SOUL.md`), `docs/` y el repo.

4. **Conectar los gastos con los bancos (anotado el 5-10-2026, sin decidir ni empezar).** Hoy los gastos los anota el
   usuario o el agente; Brote no se conecta a ningún banco. Caminos, de más a menos recomendado:
   (a) **importar la cartola** que el banco deja descargar (CSV o Excel), en el computador y sin red, con categoría
   propuesta por el motor: encaja con la privacidad y no depende de nadie (probar solo con cartolas inventadas);
   (b) un **agregador por API** (Fintoc o Belvo; Fintoc cubre Chile y México, sin tarjetas de crédito según un
   desarrollador, precio no público y orientado a empresas), solo lectura y con consentimiento propio, si lo piden los
   usuarios; (c) las **Finanzas Abiertas** de la Ley Fintech 21.521 (NCG 514 y 569 de la CMF), cuyo plazo se
   postergó a julio de 2027 según las fuentes (confirmar en cmfchile.cl) y que exigen registrarse como proveedor;
   Cómo funcionan los agregadores (info aportada por el usuario el 5-10-2026, sin verificar contra su documentación):
   el usuario toca «Conectar mi banco», se abre un widget del agregador, pone sus credenciales ahí (la app nunca ve la
   clave), el agregador valida y entrega un token de solo lectura, y con él la app descarga transacciones y saldos cada
   día. Proveedores a investigar: Fintoc, Belvo y **Prometeo** (nuevo en la lista). **Problema a resolver antes de
   elegir uno:** estos servicios suelen exigir una clave secreta de la empresa que no puede viajar dentro de una app que
   se instala en cada computador; probablemente haría falta un servidor propio que la guarde, y Brote hoy no tiene
   ninguno (todo es local). Eso cambiaría la privacidad (los movimientos pasarían por ese servidor) y los costos:
   confirmar con cada proveedor si hay un modo para apps locales y cuánto cuesta.
   (d) **no** guardar claves del banco ni hacer scraping. Antes de cualquier agregador: sumarlo a la lista de empresas de
   `docs/privacidad.md`, no pasar nunca esos datos a especialistas de planes gratuitos y nada de pagos ni
   transferencias (solo lectura).

5. **Registrar los pagos solos desde Google Wallet o Apple Pay (pedido del usuario, 5-10-2026, sin decidir ni empezar).**
   La idea: que la pestaña Plata anote automáticamente lo que se paga con el teléfono, sin escribirlo. Ojo, **por
   confirmar antes de prometer nada** (nada de esto está verificado): hasta donde se sabe, ni Google Wallet ni Apple Pay
   ofrecen una API pública para que una app de terceros lea el historial de pagos; lo que existe son atajos indirectos:
   (a) **iPhone: automatización de Atajos** con el disparador de transacción de Wallet (al pagar entrega comercio, monto
   y tarjeta; hay que confirmar si funciona con tarjetas chilenas y desde qué versión de iOS) que manda el pago al
   computador o al celular de Brote; (b) **FinanceKit** de Apple (lectura de transacciones con permiso del usuario; hoy
   solo en algunos países, confirmar si llega a Chile); (c) **Android: leer la notificación** del pago (o del banco) con un
   servicio de acceso a notificaciones en la app propia del celular; (d) las vías del punto 4 (cartola, agregador,
   Finanzas Abiertas), que sirven igual para pagos hechos con tarjeta física. Depende de la app propia en el celular
   (Tauri móvil), que aún no existe. Reglas si se hace: solo lectura (nunca iniciar pagos), nada de claves ni
   scraping, cada pago nuevo se **propone y el usuario lo confirma** antes de entrar a los gastos (o se agrega solo
   con un interruptor que el usuario prenda), el comercio y el monto no pasan a especialistas de planes gratuitos, y
   se suma al texto de `docs/privacidad.md`.

## Orden sugerido

1. Unir a `main` la rama de conectores (`claude/inspiring-clarke-qq0ulj`, con los arreglos de la revisión).
2. Sección 2 (uso del plan): es lo que más valor nuevo da; parte por verificar la statusline.
3. Sección 1 (pestañas): cambio acotado en `panel.ts`, `isla.ts` y `estilos.css`; revisar en `vista-previa.html`.
4. Sección 3 (Configurar Brote): la más grande; buena candidata para la nube con su propia vista previa.
