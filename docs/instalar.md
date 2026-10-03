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

Al abrir Brote por primera vez aparece la ventana **Configurar Brote**. Revisa lo que falta y lo arregla:

1. Marca la casilla de **Agente de OpenClaw** (aceptas que OpenClaw pueda usar tu computador para ayudarte; Brote siempre te pide permiso antes de ejecutar comandos).
2. Pulsa **Arreglar todo** y espera: instala y configura OpenClaw (el "cerebro" de Brote), su personalidad, los permisos y la conexión con tus gastos. Puede tardar unos minutos.
3. Si algún paso dice **Iniciar sesión** o **Instalar**, pulsa su botón, sigue las instrucciones y vuelve a la ventana.
4. Cuando veas **¡Todo listo!**, pulsa **Empezar**.

El paso **Búsqueda por significado** es opcional: hace que Brote encuentre mejor lo que recuerda. Puedes saltarlo.

## 4. Usar Brote

- **Mac:** Brote vive en el notch. Pasa el cursor por encima y se despliega.
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

### Modo programador (opcional)

Si usas [Claude Code](https://claude.com/claude-code) para programar, Brote puede mostrar en la isla tus sesiones en vivo ("⌨️ tarea-rust · Editando lib.rs…"), trabajar mientras ellas trabajan y celebrar cuando terminan. Cuando una sesión pide permiso, puedes responder en la terminal como siempre **o** con **Permitir / Rechazar** en la isla; si no respondes en la isla, todo sigue igual que antes.

Para activarlo: 🌱 → **Configurar Brote** → **Modo programador** → marca la casilla y pulsa **Instalar**. Brote agrega sus "hooks" (avisos oficiales de Claude Code) a `~/.claude/settings.json`:

- Antes guarda una copia del archivo (`settings.json.brote-<fecha>.bak`) y no toca tus otros hooks.
- No lee tus credenciales ni el texto de tus mensajes: solo qué herramienta usa Claude y sobre qué archivo o comando.
- Las sesiones que usa el propio Brote (OpenClaw) no aparecen ahí: ya las ves en la isla.
- El uso de tu plan no se muestra (Claude Code no lo entrega por los hooks).
- Para quitarlo: el mismo paso → **Desinstalar**.

### Conectar tu calendario (opcional)

En 🌱 → **Configurar Brote**, al final:

- **Calendario del Mac:** pulsa **Permitir acceso** y acepta el aviso de macOS. Brote verá los calendarios que tengas en la app Calendario (iCloud, Google, Outlook…). No abre la app ni cambia nada.
- **Dirección iCal (Mac y Windows):** en [Google Calendar](https://calendar.google.com) → ⚙️ Configuración → tu calendario → **Integrar el calendario** → copia la **dirección secreta en formato iCal** y pégala en Brote. Es secreta (quien la tenga ve tu calendario): Brote la guarda solo en tu computador, en un archivo que únicamente tu usuario puede leer. Con **Quitar** la borras.

### Conectar tu aula: Canvas o Moodle (opcional)

En 🌱 → **Configurar Brote** → **Aula**: elige Canvas o Moodle, pega la dirección de tu campus (por ejemplo `https://campus.tu-universidad.cl`) y un **token personal**. Nunca tu contraseña.

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

macOS pide permiso la primera vez que Brote necesita algo. Puedes cambiarlos después en **Configuración del Sistema → Privacidad y seguridad**.

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
- El token del aula y la autorización de cada conector quedan solo en tu computador; Brote nunca los muestra ni los anota en registros. Un conector ve lo que le pidas a Brote que haga con él.
- En **Lo que sé de ti** puedes ver y borrar todo lo que Brote recuerda.

## Si algo falla

| Problema | Qué hacer |
|---|---|
| El campo dice "Sin OpenClaw: solo gastos…" | Abre 🌱 → **Configurar Brote** y revisa qué falta |
| La configuración dice que falta Node | Instala Node 24 o superior y pulsa **Revisar de nuevo** |
| Brote no responde preguntas, solo gastos | Revisa que Claude Code tenga tu sesión iniciada (`claude` en una terminal) |
| La tarjeta de Entregas dice "No pude leer tu aula" | El token venció o lo borraste: crea uno nuevo y pégalo en **Configurar Brote → Aula** |
| Un conector dice "Guardado, pero falta autorizar" | Pulsa **Autorizar** (o pega un token nuevo, en GitHub) |
| No sé cómo cerrarlo | 🌱 → **Salir de Brote** |

## Desinstalar

1. 🌱 → **Salir de Brote**, y borra la app (Mac: de Aplicaciones; Windows: desde "Agregar o quitar programas").
2. Si también quieres borrar tus datos: la carpeta `.asistente-prototipo` de tu carpeta personal. OpenClaw se desinstala aparte (`npm uninstall -g openclaw`).
