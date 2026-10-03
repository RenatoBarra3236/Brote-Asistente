# Instalar Brote 🌱

Brote es un personaje que vive en tu computador y te acompaña con el estudio y la plata. Anota tus gastos al instante (sin IA), conversa contigo usando tu cuenta de Claude y aprende tu forma de hablar.

> Es un **prototipo**: puede tener errores. Todo lo que guarda queda en tu computador.

## Antes de empezar

Necesitas:

| | Para qué |
|---|---|
| **Un Mac con chip Apple (M1 o posterior)** o **un PC con Windows 10 u 11** | En el Mac, Brote vive en el notch; en Windows, en una esquina de la pantalla |
| **Node 24 o superior** ([nodejs.org](https://nodejs.org/es/download), versión LTS) | Lo usan Brote y OpenClaw por dentro |
| **Claude Code con tu cuenta Pro o Max** ([claude.com/claude-code](https://claude.com/claude-code)) | Es la IA con la que Brote conversa. Usa tu suscripción, no cobra aparte |

Instala Node y Claude Code antes de abrir Brote. Para Claude Code, después de instalarlo abre una terminal, escribe `claude` e inicia sesión con tu cuenta.

## 1. Descargar Brote

Te van a pasar uno de estos archivos:

- **Mac:** `Brote_0.1.0_aarch64.dmg`
- **Windows:** `Brote_0.1.0_x64-setup.exe`

## 2. Instalar

### En Mac

1. Abre el `.dmg` y arrastra **Brote** a la carpeta **Aplicaciones**.
2. Ábrelo desde Aplicaciones. Como es un prototipo sin firma de Apple, macOS va a decir que no puede verificarlo:
   - Cierra el aviso, abre **Configuración del Sistema → Privacidad y seguridad**, baja hasta el mensaje sobre Brote y pulsa **Abrir igualmente**.
   - Si no aparece esa opción, en la Terminal corre: `xattr -dr com.apple.quarantine /Applications/Brote.app` y vuelve a abrirlo.

### En Windows

1. Abre el instalador `.exe`.
2. Windows puede mostrar "Windows protegió su PC" porque el prototipo no está firmado: pulsa **Más información → Ejecutar de todas formas**.
3. Sigue los pasos del instalador.

## 3. Configurar (la primera vez)

Al abrir Brote por primera vez aparece la ventana **Configurar Brote**, con tres pasos:

1. **Preparar.** Una barra muestra cuánto falta. Si te pide algo, aparece una tarjeta:
   - **Node:** si tienes [Homebrew](https://brew.sh), pulsa **Instalar con Homebrew** (se abre una terminal con `brew install node`); si no, **Descargar Node**.
   - **Claude Code:** **Iniciar sesión** abre una terminal con `claude` para que entres con tu cuenta.
   - **Agente de OpenClaw:** marca la casilla (aceptas que OpenClaw pueda usar tu computador para ayudarte; Brote siempre te pide permiso antes de ejecutar comandos).

   Después pulsa **Preparar Brote** y espera: instala y configura OpenClaw (el "cerebro" de Brote), su personalidad, los permisos y la conexión con tus gastos. Puede tardar unos minutos. Si quieres ver cada paso por dentro, abre **Detalles técnicos**.
2. **Qué quieres que haga Brote.** Elige un punto de partida (**Estudiante**, **Programador**, **Todo** o **Lo mínimo**) y prende o apaga cada función. Cada tarjeta dice qué hace y qué permiso de macOS pide. Lo que necesita datos (la dirección de tu calendario, tu aula, el modo programador) se configura dentro de su tarjeta al prenderla; también puedes hacerlo después.
3. **Listo.** Pulsa **Empezar**.

Lo que apagas no corre por detrás, no pide permisos y no aparece en la isla. Si le pides algo de una función apagada, Brote te dice "Eso está apagado: actívalo en Configurar Brote ⚙️".

**Después**, 🌱 → **Configurar Brote** abre una ventana con secciones a la izquierda:

| Sección | Para qué |
|---|---|
| **Estado** | "Brote está funcionando" o qué le falta, con **Reparar** |
| **Funciones** | Prender y apagar funciones, y elegir qué tarjetas ves en la isla y en qué orden |
| **Conectores** | Todoist, Notion, GitHub, Canva (abajo) |
| **Aula** | Canvas o Moodle (abajo) |
| **Permisos** | Cada permiso de macOS: qué función lo usa, si está dado y cuáles ya no hacen falta (con cómo quitarlos) |
| **Memoria** | Abre **Lo que sé de ti** |

La función **Búsqueda por significado** es opcional: hace que Brote encuentre mejor lo que recuerda. Puedes dejarla apagada.

## 4. Usar Brote

- **Mac:** Brote vive en el notch. Pasa el cursor por encima y se despliega. Arriba hay tres pestañas: **Brote** (lo que pasa ahora y la conversación: mientras te responde, las tarjetas se encogen a una fila de píldoras como "🍅 18:20 · 📅 en 25 min"; tócalas para verlas de nuevo), **Claude** (cuánto llevas de tu plan de Claude, si prendes el **uso del plan**, y tus sesiones de Claude Code, si usas el modo programador) y **Equipo** (batería, CPU, memoria y disco).
- **Windows:** Brote vive en la esquina inferior derecha. Pasa el cursor por encima y aparece el panel. Puedes arrastrarlo a donde quieras.

Prueba decirle:

| Escribe | Qué pasa |
|---|---|
| `gasté 5 lucas en almuerzo` | Lo anota al instante, sin IA ⚡ |
| `¿cuánto llevo esta semana?` | Tu total, sin IA ⚡ |
| `mis últimos gastos` | La lista, sin IA ⚡ |
| `¿en qué estoy gastando más?` | Lo responde la IA, con tus datos |
| Una forma tuya de anotar un gasto que Brote no entienda | La IA lo resuelve y Brote te pregunta si aprende esa frase. La próxima vez, sin IA |
| `¿qué sabes de mí?` | Abre **Lo que sé de ti**: todo lo que recuerda, para corregirlo u olvidarlo |

### Más cosas que sabe hacer

| Escribe | Qué pasa |
|---|---|
| `pomodoro de 30 para cálculo` · `recuérdame en 10 minutos sacar la ropa` · `¿cuánto falta?` | Temporizadores y pomodoro, sin IA ⚡ (la cuenta regresiva se ve en la isla) |
| `¿cómo está el computador?` · `¿cuánta batería me queda?` | Batería, CPU, memoria y disco, sin IA ⚡. Brote también se cansa con poca batería y suda con la CPU al máximo |
| `mis descargas` · `abre la última descarga` · `muéstrame la última descarga` | Tus últimas descargas, sin IA ⚡. Mientras algo se descarga, la isla dice "📥 Descargando…" y al terminar "Lista ✓" con un botón **Mostrar**. Solo abre documentos (PDF, Word, imágenes…): un programa o instalador te lo muestra en el Finder / Explorador, nunca lo ejecuta |
| `pausa la música` · `siguiente canción` · `pon la anterior` · `¿qué está sonando?` | Controla Spotify o Música (en Mac) o el reproductor que estés usando (en Windows), sin IA ⚡. La isla muestra "♪ canción — artista" con ⏮ ⏯ ⏭ y Brote se balancea mientras suena. **Nunca abre una app de música**: si no hay ninguna abierta, te lo dice |
| `¿qué tengo hoy?` · `¿qué tengo mañana?` · `¿cuál es mi próxima clase?` | Tu calendario, sin IA ⚡. La isla muestra "📅 Cálculo en 25 min" y Brote te avisa 10 minutos antes de cada evento. Hay que conectarlo primero (abajo) |
| `pon un evento en 12 minutos` · `agenda estudiar cálculo a las 16:30` · `pon una prueba de física mañana a las 9` | Crea el evento (de 1 hora) en el Calendario del Mac, sin IA ⚡. Si Brote no tiene permiso o estás en Windows, te deja un recordatorio ⏰ para esa hora. La IA también puede crear eventos, pero te pide permiso antes |
| `¿qué entregas tengo?` · `¿qué tengo que entregar esta semana?` | Tus entregas de Canvas o Moodle, sin IA ⚡. La isla muestra la próxima ("📄 Laboratorio 4 · mañana 23:59") y Brote te avisa 24 horas y 2 horas antes. Hay que conectar el aula primero (abajo) |
| `¿qué tareas tengo en Todoist?` · `busca mis apuntes de cálculo en Notion` | Lo responde la IA usando tus **conectores** (abajo). Leer no te pregunta; agregar, cambiar o borrar algo siempre te pide permiso en la isla ("Todoist · Agregar tareas") |
| `¿qué está haciendo Claude?` · `¿cómo va Claude Code?` | Si programas con Claude Code y activaste el **modo programador** (abajo): tus sesiones en vivo, sin IA ⚡ |
| `¿cuánto llevo del plan?` · `¿cuándo se reinicia mi plan?` · `¿cuánto he gastado en tokens?` | Con el **uso del plan** prendido (abajo): el % de tu sesión de 5 horas y de la semana, cuándo se reinicia cada una, y tus tokens de hoy y de los últimos 7 días con su "valor API", sin IA ⚡ |

### Modo programador (opcional)

Si usas [Claude Code](https://claude.com/claude-code) para programar, Brote puede mostrar en la isla tus sesiones en vivo ("⌨️ tarea-rust · Editando lib.rs…"), trabajar mientras ellas trabajan y celebrar cuando terminan. Cuando una sesión pide permiso, puedes responder en la terminal como siempre **o** con **Permitir / Rechazar** en la isla; si no respondes en la isla, todo sigue igual que antes.

Para activarlo: 🌱 → **Configurar Brote** → **Funciones** → prende **Modo programador**, marca la casilla de su tarjeta y pulsa **Instalar**. Brote agrega sus "hooks" (avisos oficiales de Claude Code) a `~/.claude/settings.json`:

- Antes guarda una copia del archivo (`settings.json.brote-<fecha>.bak`) y no toca tus otros hooks.
- No lee tus credenciales ni el texto de tus mensajes: solo qué herramienta usa Claude y sobre qué archivo o comando.
- Las sesiones que usa el propio Brote (OpenClaw) no aparecen ahí: ya las ves en la isla.
- El uso de tu plan no llega por los hooks: para eso está la función **Uso del plan de Claude** (abajo).
- Para quitarlo: la misma tarjeta → **Desinstalar**. Si solo apagas la función, los hooks siguen instalados (Brote los ignora) y la tarjeta te ofrece desinstalarlos.

### Uso del plan de Claude (opcional)

Si tienes Claude Pro o Max, Brote te muestra en la pestaña **Claude** de la isla cuánto llevas de tu **sesión de 5 horas** y de la **semana** (una barra verde, ámbar o roja con "se reinicia en 2 h 10 min"), y te avisa una vez al pasar el 80 % y el 95 % de la sesión. Debajo: tus tokens de hoy y de los últimos 7 días (entrada, salida y caché), separados entre lo que gastó Brote y tus propias sesiones de Claude Code, con los proyectos que más gastan y su **valor API**: lo que costaría pagando por token con los precios oficiales de Anthropic. **No es un cobro**: tu plan cuesta lo mismo; es solo para dimensionar cuánto usas.

Para activarlo: 🌱 → **Configurar Brote** → **Funciones** → prende **Uso del plan de Claude**, marca la casilla de su tarjeta y pulsa **Instalar**. Brote pone su "statusline" (la línea de abajo de Claude Code) en `~/.claude/settings.json`:

- Es la única forma de saber el % del plan sin tocar tus credenciales: Claude Code se lo entrega a la statusline. Brote solo se queda con el % y la hora de reinicio. Nunca lee tus contraseñas ni tus claves.
- El % se actualiza **solo mientras usas Claude Code** (en una terminal o en la pestaña Code de la app de Claude), después de su primera respuesta. Si no lo has usado hace rato, la isla dice "actualizado hace…"; si nunca, "Abre Claude Code para ver tu plan". Lo que hace el propio Brote no lo actualiza.
- Si no tenías statusline, en Claude Code verás abajo algo como `🌱 5 h 23 % · semana 41 % · contexto 12 %`. Si ya tenías una, **se sigue viendo igual**: Brote la conserva y la corre por dentro. Ojo: con una statusline puesta, Claude Code esconde la mayoría de las ayudas que muestra abajo.
- Los tokens se leen de los archivos de historial que Claude Code guarda en tu computador (solo las cifras de uso, nunca el texto de las conversaciones), cada minuto mientras miras la pestaña Claude.
- Antes de cambiar la configuración guarda una copia (`settings.json.brote-<fecha>.bak`). Para quitarla: la misma tarjeta → **Desinstalar**, y tu statusline queda exactamente como estaba.

### Conectar tu calendario (opcional)

En 🌱 → **Configurar Brote** → **Funciones** → **Calendario** (prendido):

- **Calendario del Mac:** pulsa **Permitir acceso** y acepta el aviso de macOS. Brote verá los calendarios que tengas en la app Calendario (iCloud, Google, Outlook…). No abre la app ni cambia nada.
- **Dirección iCal (Mac y Windows):** en [Google Calendar](https://calendar.google.com) → ⚙️ Configuración → tu calendario → **Integrar el calendario** → copia la **dirección secreta en formato iCal** y pégala en Brote. Es secreta (quien la tenga ve tu calendario): Brote la guarda solo en tu computador, en un archivo que únicamente tu usuario puede leer. Con **Quitar** la borras.

### Conectar tu aula: Canvas o Moodle (opcional)

En 🌱 → **Configurar Brote** → **Aula** (o dentro de la tarjeta **Aula** de Funciones): elige Canvas o Moodle, pega la dirección de tu campus (por ejemplo `https://campus.tu-universidad.cl`) y un **token personal**. Nunca tu contraseña.

- **Canvas:** en el campus, **Cuenta → Configuración → + Nuevo token de acceso**. Ponle un nombre ("Brote") y copia el token: se muestra una sola vez.
- **Moodle:** tu nombre (arriba a la derecha) → **Preferencias → Claves de seguridad** y copia la clave del servicio **Moodle mobile web service**. Si no aparece, tu universidad no tiene activada la app móvil y Brote no puede leerlo.

Es **solo lectura**: Brote ve tus cursos y fechas de entrega, pero no puede entregar nada ni ver tus notas. El token queda solo en tu computador, en un archivo que únicamente tu usuario puede leer; Brote lo revisa cada 30 minutos. Con **Quitar** lo borras (y en Canvas puedes revocarlo desde la misma página donde lo creaste).

### Conectores: Todoist, Notion, GitHub y Canva (opcional)

En 🌱 → **Configurar Brote** → **Conectores**, cada servicio tiene su botón **Conectar**. Los marcados **sin probar** todavía no los hemos probado de punta a punta: cuéntanos si te funcionan.

- **Todoist, Notion y Canva:** pulsa **Conectar**, luego **Abrir en el navegador**, inicia sesión en el servicio y autoriza. La ventana dice "Esperando que autorices en el navegador…" hasta que vuelvas (o pulsa **Cancelar**). No hay que crear nada en el servicio.
- **GitHub:** no permite autorizar así, así que pide un **token personal**: en GitHub → **Settings → Developer settings → Fine-grained tokens** → genera uno con acceso de **solo lectura** a los repositorios que quieras (Contents, Issues, Pull requests, Metadata, Actions). Pégalo en Brote y pulsa **Conectar**.
- **Agregar otro por URL** (avanzado): cualquier servidor MCP remoto con `https://`. Tienes que marcar la casilla de consentimiento, y todas sus acciones te piden permiso siempre.

Al conectar, la IA lo puede usar desde tu próximo mensaje. Lo que solo lee (buscar tareas, leer una página, ver un diseño) no te pregunta; todo lo que cambia algo sí, y la isla te dice qué servicio y qué acción. **Desconectar** cierra la sesión y lo quita.

### Permisos que tu Mac te va a preguntar

macOS pide permiso la primera vez que Brote necesita algo, y solo para las funciones que tengas prendidas. Puedes cambiarlos después en **Configuración del Sistema → Privacidad y seguridad**; **Configurar Brote → Permisos** te dice cuáles usa cada función y cuáles ya no hacen falta.

| Aviso | Por qué | Si dices que no |
|---|---|---|
| "Brote quiere acceder a archivos de la carpeta Descargas" | Para avisarte cuando termina una descarga y responder "mis descargas" | Brote no ve tus descargas; lo demás funciona igual |
| "Brote quiere controlar Spotify" / "…controlar Música" (Automatización) | Para mostrar la canción y pausar o cambiarla. Solo aparece si esa app está abierta | Brote no muestra esa música (no vuelve a preguntar hasta dentro de un rato). Se cambia en **Privacidad y seguridad → Automatización → Brote** |
| "Brote quiere acceder a tus calendarios" | Al pulsar **Permitir acceso** en Configurar Brote: para decirte qué tienes y avisarte antes de cada clase | Brote no ve el Calendario del Mac (la dirección iCal sigue sirviendo). Se cambia en **Privacidad y seguridad → Calendarios** |

Cuando le preguntas a la IA por tu música o tu calendario, se lo pide a Brote, así que usa los mismos permisos (no hay que darlos dos veces).

Cuando Brote quiera ejecutar algo en tu computador, te pide permiso con dos botones: **Permitir** o **Rechazar**. Si se demora, el botón ■ lo detiene.

**El menú 🌱** (en la barra de menú del Mac, arriba a la derecha; en Windows, junto al reloj) tiene: Lo que sé de ti, Configurar Brote y **Salir de Brote**.

## Tus datos

- Tus gastos, lo que Brote recuerda y las frases que aprendió quedan **solo en tu computador** (`~/.asistente-prototipo` y la carpeta de OpenClaw).
- Los nombres de tus descargas, lo que escuchas y tus eventos no salen del computador; solo los ve la IA si le preguntas por ellos. La dirección iCal se usa solo para descargar tu calendario directo de Google.
- Las conversaciones con la IA pasan por tu cuenta de Claude, como cuando usas Claude Code.
- El uso del plan (el % y tus tokens) se calcula en tu computador con lo que Claude Code ya guarda ahí; Brote no se conecta a tu cuenta para eso.
- El token del aula y la autorización de cada conector quedan solo en tu computador; Brote nunca los muestra ni los anota en registros. Un conector ve lo que le pidas a Brote que haga con él.
- En **Lo que sé de ti** puedes ver y borrar todo lo que Brote recuerda.

## Si algo falla

| Problema | Qué hacer |
|---|---|
| El campo dice "Sin OpenClaw: solo gastos…" | Abre 🌱 → **Configurar Brote** → **Estado** y pulsa **Reparar** |
| La configuración dice que falta Node | Pulsa **Instalar con Homebrew** o **Descargar Node** (24 o superior) y vuelve a la ventana: revisa sola |
| Brote dice "Eso está apagado" | Prende esa función en **Configurar Brote → Funciones** |
| No veo una tarjeta en la isla (la música, las descargas…) | Revisa en **Configurar Brote → Funciones** que su función esté prendida y que la tarjeta esté marcada en **Tarjetas de Inicio** |
| Brote no responde preguntas, solo gastos | Revisa que Claude Code tenga tu sesión iniciada (`claude` en una terminal) |
| La pestaña Claude dice "Abre Claude Code para ver tu plan" | El % llega cuando Claude Code te responde (en una terminal o en la pestaña Code). Si sigue igual, revisa en **Configurar Brote → Funciones → Uso del plan** que la statusline esté instalada |
| La tarjeta de Entregas dice "No pude leer tu aula" | El token venció o lo borraste: crea uno nuevo y pégalo en **Configurar Brote → Aula** |
| Un conector dice "Guardado, pero falta autorizar" | Pulsa **Autorizar** (o pega un token nuevo, en GitHub) |
| No sé cómo cerrarlo | 🌱 → **Salir de Brote** |

## Desinstalar

1. 🌱 → **Salir de Brote**, y borra la app (Mac: de Aplicaciones; Windows: desde "Agregar o quitar programas").
2. Si instalaste el modo programador o la statusline del uso del plan, desinstálalos antes en **Configurar Brote → Funciones** (si no, Claude Code los sigue llamando; no hacen nada sin Brote, pero tu statusline anterior no vuelve sola).
3. Si también quieres borrar tus datos: la carpeta `.asistente-prototipo` de tu carpeta personal. OpenClaw se desinstala aparte (`npm uninstall -g openclaw`).
