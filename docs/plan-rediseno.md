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

## Orden sugerido

1. Unir a `main` la rama de conectores (`claude/inspiring-clarke-qq0ulj`, con los arreglos de la revisión).
2. Sección 2 (uso del plan): es lo que más valor nuevo da; parte por verificar la statusline.
3. Sección 1 (pestañas): cambio acotado en `panel.ts`, `isla.ts` y `estilos.css`; revisar en `vista-previa.html`.
4. Sección 3 (Configurar Brote): la más grande; buena candidata para la nube con su propia vista previa.
