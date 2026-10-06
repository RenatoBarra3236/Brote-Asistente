# Todo lo que sabe hacer Brote 🌱

Lo opcional y el detalle de cada función. Para instalar y empezar, lo justo está en [instalar.md](instalar.md). Casi todo se prende y se apaga en 🌱 → **Configurar Brote → Funciones**: lo que apagas no corre, no pide permisos y no aparece en la isla.

**Después**, 🌱 → **Configurar Brote** abre una ventana con secciones a la izquierda:

| Sección | Para qué |
|---|---|
| **Estado** | "Brote está funcionando" o qué le falta, con **Reparar** |
| **Funciones** | Prender y apagar funciones, y elegir qué tarjetas ves en la isla y en qué orden |
| **Cuentas de IA** | Claude (la de siempre), Gemini, ChatGPT y Grok, para el equipo de Brote (abajo) |
| **Equipo** | Los especialistas en los que Brote puede delegar y con qué IA trabaja cada uno (abajo) |
| **Conectores** | Todoist, Notion, GitHub, Canva (abajo) |
| **Aula** | Canvas o Moodle (abajo) |
| **Permisos** | Cada permiso de macOS: qué función lo usa, si está dado y cuáles ya no hacen falta (con cómo quitarlos) |
| **Memoria** | Abre **Lo que sé de ti** |

La función **Búsqueda por significado** es opcional: hace que Brote encuentre mejor lo que recuerda. Puedes dejarla apagada.

## La isla y las frases

**🕘 Anteriores** (arriba en Inicio): tus conversaciones pasadas con Brote, con el chat completo mientras Claude Code lo guarda (30 días) y el resumen después. **Retomar esta conversación** le pasa a Brote lo último que hablaron para seguir desde ahí. Para olvidar una: «Lo que sé de ti → Conversaciones guardadas».

- **Mac:** Brote vive en el notch. Pasa el cursor por encima y se despliega. Arriba hay cuatro pestañas: **Brote** (lo que pasa ahora y la conversación: mientras te responde, las tarjetas se encogen a una fila de píldoras como "🍅 18:20 · 📅 en 25 min"; tócalas para verlas de nuevo), **Plata** (tus gastos del mes, abajo), **Claude** (cuánto llevas de tu plan de Claude, si prendes el **uso del plan**, y tus sesiones de Claude Code, si usas el modo programador) y **Equipo** (batería, CPU, memoria y disco).
- **Windows:** Brote vive en la esquina inferior derecha. Pasa el cursor por encima y aparece el panel. Puedes arrastrarlo a donde quieras.

Prueba decirle:

| Escribe | Qué pasa |
|---|---|
| `gasté 5 lucas en almuerzo` | Lo anota al instante, sin IA ⚡ |
| `¿cuánto llevo esta semana?` | Tu total, sin IA ⚡ |
| `mis últimos gastos` | La lista, sin IA ⚡ |
| `mi presupuesto es 200 lucas` · `¿cuánto me queda del presupuesto?` · `¿cuánto puedo gastar hoy?` | Tu presupuesto del mes, sin IA ⚡. Te aviso una vez al pasar el 80 % y otra al pasar el 100 % |
| `¿en qué estoy gastando más?` | Lo responde la IA, con tus datos |
| Una forma tuya de anotar un gasto que Brote no entienda | La IA lo resuelve y Brote te pregunta si aprende esa frase. La próxima vez, sin IA |
| `¿qué sabes de mí?` | Abre **Lo que sé de ti**: todo lo que recuerda, para corregirlo u olvidarlo |

### La pestaña Plata

En la pestaña **Plata** de la isla (o del panel, en Windows) ves de un vistazo:

- **Este mes:** cuánto llevas y si vas más arriba o más abajo que el mes pasado **a esta misma altura** (el 13 se compara con lo que llevabas el 13 del mes pasado).
- **Puedes gastar hoy:** lo que te queda del presupuesto repartido entre los días que faltan, menos lo que ya gastaste hoy. Verde si vas bien, ámbar si vas justo, rojo si te pasaste. Sin presupuesto, te invita a ponerlo (en **Configurar Brote → Funciones → Gastos**, o diciéndole `mi presupuesto es 200 lucas`).
- **Los últimos 7 días** en barras (hoy resaltado) y **por categoría**, cada una con su color.
- **Un descubrimiento**, calculado sin IA: un "gasto hormiga" (por ejemplo, los cafés que juntos suman harto), una categoría que se disparó contra la semana pasada o un gasto que se repite cada mes (una suscripción).
- **Tus últimos movimientos** y **botones de un toque** con tus gastos más repetidos ("🍔 café $1.500"): un toque y queda anotado, igual que si lo escribieras.

Todo se calcula en tu computador; la IA solo lee tu presupuesto si se lo preguntas.

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

Para activarlo: 🌱 → **Configurar Brote** → **Funciones** → prende **Uso del plan de Claude**. Brote saca el % de tres lugares, sin tocar nunca tus contraseñas ni tus claves, y usa el más reciente:

- **La app de escritorio de Claude**, si la tienes abierta con su ícono en la barra de menú: ella misma anota tu % cada 5 a 15 minutos y Brote lo lee. No sabe la hora exacta de reinicio, así que Brote la estima ("se reinicia en ≈ 2 h").
- **Claude Code**, si instalas la statusline de Brote (abajo): se actualiza cada vez que Claude Code te responde.
- **Una consulta mínima** cuando las otras dos están viejas (más de 15 minutos): Brote le hace a Claude Code una pregunta cortísima solo para que le diga tus límites. Gasta unos 600 tokens (una fracción mínima de tu plan), corre solo mientras miras la pestaña Claude o cuando pulsas **↻**, y como mucho una vez cada 15 minutos.

Cuando una ventana se reinicia, la barra queda en "0 % · se reinició a las 18:40" hasta la próxima lectura.

Para la statusline (opcional): en la tarjeta **Uso del plan**, marca la casilla y pulsa **Instalar**. Brote la pone en `~/.claude/settings.json`:

- Claude Code le entrega el % a la statusline después de cada respuesta. Brote solo se queda con el % y la hora de reinicio.
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

### El equipo de Brote (opcional)

Brote puede pasarle tareas largas a **especialistas**: 📚 Tutor (explica y arma ejercicios), 🔎 Investigador (busca fuentes y cita), ✍️ Redactor (borradores), ✅ Revisor (corrige contra una rúbrica) y 🗓️ Planificador (planes de estudio). Tú sigues hablando solo con Brote: él decide cuándo vale la pena delegar, espera y te cuenta el resultado.

Mientras trabajan, en la pestaña **Brote** las **mascotas** de los especialistas (primas de Brote, cada una con su color y su accesorio: birrete, lupa, lápiz, visera o reloj) salen de detrás de Brote y se ponen en fila, cada una con un globito que dice qué hace ("Leyendo es.wikipedia.org…", "Pensando…", el comienzo de su respuesta) y su nombre con la IA que usa ("Investigador · Gemini"). **Toca una** para ver su conversación: la tarea que le pasó Brote, sus pasos y su respuesta (con **← volver** regresas). Con **⤢ Ver a todos** la isla se agranda un rato y muestra lado a lado las conversaciones de Brote y de hasta tres especialistas, en vivo; se cierra sola cuando el equipo termina, con **⤡ Volver** o si alejas el cursor. Al terminar, las mascotas celebran y se esconden (sus conversaciones siguen a un toque un minuto más). En Windows, "Ver a todos" usa el espacio del panel: desliza de lado para ver cada columna.

1. Prende **Equipo de Brote** en **Configurar Brote → Funciones**.
2. En **Cuentas de IA**, conecta las IA que quieras usar además de Claude:
   - **Gemini:** pulsa **Crear una clave en AI Studio**, copia la clave gratis, pégala en Brote, marca la casilla y pulsa **Guardar clave** (o **Pegarla en la terminal**). Ojo: en el plan gratis, Google puede usar lo que le mandes para entrenar sus modelos; no le pases datos privados.
   - **ChatGPT** (tu cuenta de ChatGPT) y **Grok** (SuperGrok o X Premium): **Iniciar sesión en la terminal** abre una terminal con el comando de OpenClaw para entrar en el navegador. Están marcados **sin probar**: cuéntanos si te funcionan.
3. En **Equipo**, prende a cada especialista, elige con qué IA trabaja (solo aparecen las que conectaste) y, si quieres, cambia sus instrucciones y su **personalidad** (el Tutor es paciente y socrático, el Investigador curioso y cita todo, el Redactor ordenado y creativo, el Revisor exigente pero amable y el Planificador práctico). Apagar uno lo saca del equipo (su carpeta va a la Papelera).

Los especialistas con Claude gastan de tu plan, como Brote. Si tu plan semanal de Claude pasa el 85 %, Brote deja de pasarles tareas (los de otras IA siguen) y te avisa; vuelven cuando baja del 80 %. Para esto necesita la función **Uso del plan de Claude**.

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

Más detalle de lo que se guarda y a dónde llega: [privacidad.md](privacidad.md).

## Si algo falla con una función

| Problema | Qué hacer |
|---|---|
| No veo una tarjeta en la isla (la música, las descargas…) | Revisa en **Configurar Brote → Funciones** que su función esté prendida y que la tarjeta esté marcada en **Tarjetas de Inicio** |
| La pestaña Claude dice "Pulsa ↻ para revisar tu plan" | Pulsa **↻**: Brote le pregunta a Claude Code tus límites (necesita Claude Code con tu sesión iniciada). Para que se mantenga al día sin consultas, deja abierta la app de Claude con su ícono en la barra de menú o usa Claude Code con la statusline de Brote |
| La tarjeta de Entregas dice "No pude leer tu aula" | El token venció o lo borraste: crea uno nuevo y pégalo en **Configurar Brote → Aula** |
| Un conector dice "Guardado, pero falta autorizar" | Pulsa **Autorizar** (o pega un token nuevo, en GitHub) |
| Brote no delega en un especialista | Revisa que **Equipo de Brote** esté prendido en Funciones y el especialista en **Equipo**; si usa Claude y tu semana pasó el 85 %, espera a que baje del 80 % |
| Un especialista con Gemini falla | La clave venció o se borró: créala de nuevo en AI Studio y pégala en **Cuentas de IA** |

Los problemas de instalación y de la primera vez están en [instalar.md](instalar.md).
