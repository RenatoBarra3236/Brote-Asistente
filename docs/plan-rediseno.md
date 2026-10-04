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

## 6. Privacidad y protección de datos (revisión del 4-10-2026; puntos 1, 4, 5, 6 y 7 (borrador) hechos; faltan 2, 3 y 8)

Revisado en el Mac del usuario: todos los archivos con datos o secretos están en 600 (`~/.asistente-prototipo/*`,
`openclaw.json`, las bases de OpenClaw, `gateway.log`), FileVault activado, telemetría de funciones de OpenClaw
apagada (queda solo el aviso diario de versión), Gateway y servidor del puente solo en 127.0.0.1 con token,
nunca se leen credenciales de Claude y el repo no tiene secretos. Lo que falta, en orden:

1. **Gemini gratis y datos personales** (hecho y probado en el Mac el 4-10-2026; la skill se reinstala con `openclaw skills install ./packages/motor/skill/delegar --as delegar --agent <id> --force` y se carga en una sesión nueva): en el plan gratis Google puede usar lo que recibe para entrenar y
   revisarlo con personas. La skill `delegar` debe prohibir pasarle a especialistas de planes gratuitos datos
   personales (nombre, gastos, memoria, calendario, aula); la tarjeta de Gemini en Cuentas de IA lo avisa más claro.
2. **Secretos en texto plano** (permisos 600 + cifrado del disco): `openclaw.json` (token del Gateway, clave de
   búsqueda de Gemini…), `aula.json` (token), `calendario.json` (dirección iCal secreta). Llevarlos al Llavero de
   macOS / Administrador de credenciales de Windows donde se pueda (los de OpenClaw dependen de OpenClaw).
3. **Registros con conversaciones**: `~/Library/Logs/openclaw/gateway.log` guarda fragmentos de lo conversado
   (28 líneas el 4-10-2026). Limpieza periódica o bajar lo que registra OpenClaw.
4. **Datos en claro en el disco** (hecho el 4-10-2026): docs/instalar.md, en "Tus datos", recomienda FileVault
   (Mac) o BitLocker (Windows) y explica por qué (gastos, memoria y transcripciones quedan en claro).
5. **"Olvidar" va a la Papelera** (hecho el 4-10-2026, `src/agente/papelera.ts`): en macOS la ventana dice que el dato sigue en la
   Papelera hasta vaciarla; en Windows y Linux `aLaPapelera` borra de verdad (sin Papelera) y el texto lo dice así.
6. **Respaldos que se acumulan** (hecho el 4-10-2026: `podarRespaldos` deja los 3 últimos): `~/.claude/settings.json.brote-*.bak`.
7. **Antes de repartir Brote a más gente** (borrador hecho el 4-10-2026 en `docs/privacidad.md`, falta que alguien lo revise): una política de privacidad corta (qué se guarda, dónde, a qué empresas
   va —Anthropic, Google, conectores— y cómo borrarlo), partiendo de "Tus datos" en docs/instalar.md. En Chile
   rige la Ley 21.719 desde diciembre de 2026 (orientación, no asesoría legal).
8. **Avisar si Brote quedó con una clave de API** (anotado el 4-10-2026; pendiente): hoy `entorno::sin_clave_api` solo evita
   heredarla desde la terminal; no impide que alguien la ponga a propósito (`env` de `~/.claude/settings.json`, la
   config de OpenClaw o el plist del Gateway). Configurar Brote → Estado debe avisar cuando `claude auth status`
   (sin la variable) muestre `apiKeySource`, o cuando `settings.json` tenga `ANTHROPIC_API_KEY` en `env`. Solo leer
   el estado y los nombres de las variables, nunca sus valores ni credenciales.

## 7. Calendario como sección propia de la isla (anotado el 4-10-2026; pendiente)

Hoy el calendario es solo una tarjeta de Inicio. La idea: una **sección en la isla** para ver eventos y todo lo
relacionado con el orden del usuario (clases, entregas, recordatorios, tareas), con un estilo parecido a Notion.
Al hacerla, arreglar lo del permiso: en Ajustes del Sistema → Privacidad → Calendarios solo aparece **Terminal**
con "Acceso completo" (captura del 4-10-2026), porque con `tauri dev` el permiso es de la Terminal y no de Brote.
Brote.app empaquetada tiene que pedir y tener el suyo (ver `Info.plist` y el paso "Calendario del Mac" de
Configurar Brote), y la sección nueva debe explicar qué hacer si falta.

## 8. Grabar y transcribir (anotado el 4-10-2026; pendiente, por pensar)

Opción de grabar audio (por ejemplo una clase) y transcribirlo. A partir de las transcripciones, Brote ayuda al
usuario: resúmenes, apuntes, tareas y fechas que salen a la vista (alimentando el calendario de la sección 7).
Por decidir antes de programar: transcripción local o en la nube, permiso de micrófono de macOS/Windows,
dónde se guardan los audios y textos (privacidad, sección 6: datos personales en claro en el disco) y consentimiento
de grabar a otras personas.

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
