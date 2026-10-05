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

## 8. Grabar y transcribir (conversado y aprobado el 4-10-2026; sin código todavía)

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
2. **Transcripción de un WAV:** puente con `whisper-cli`, descarga del modelo en Configurar Brote. Probado con un
   audio de ejemplo y un `whisper-cli` falso.
3. **Captura y permiso:** `grabacion.rs`, `Info.plist`, punto rojo y pregunta de consentimiento. Solo se prueba de
   verdad con `Brote.app` en un Mac.
4. **Isla y memoria:** botón 🎙, frases sin IA, sección en "Lo que sé de ti", vista previa, `docs/privacidad.md`.
5. **Fase 2 (B):** tareas y fechas hacia Agenda, con confirmación en la isla.

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

## Orden sugerido

1. Unir a `main` la rama de conectores (`claude/inspiring-clarke-qq0ulj`, con los arreglos de la revisión).
2. Sección 2 (uso del plan): es lo que más valor nuevo da; parte por verificar la statusline.
3. Sección 1 (pestañas): cambio acotado en `panel.ts`, `isla.ts` y `estilos.css`; revisar en `vista-previa.html`.
4. Sección 3 (Configurar Brote): la más grande; buena candidata para la nube con su propia vista previa.
