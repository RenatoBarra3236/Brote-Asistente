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

Cuando Brote quiera ejecutar algo en tu computador, te pide permiso con dos botones: **Permitir** o **Rechazar**. Si se demora, el botón ■ lo detiene.

**El menú 🌱** (en la barra de menú del Mac, arriba a la derecha; en Windows, junto al reloj) tiene: Lo que sé de ti, Configurar Brote y **Salir de Brote**.

## Tus datos

- Tus gastos, lo que Brote recuerda y las frases que aprendió quedan **solo en tu computador** (`~/.asistente-prototipo` y la carpeta de OpenClaw).
- Las conversaciones con la IA pasan por tu cuenta de Claude, como cuando usas Claude Code.
- En **Lo que sé de ti** puedes ver y borrar todo lo que Brote recuerda.

## Si algo falla

| Problema | Qué hacer |
|---|---|
| El campo dice "Sin OpenClaw: solo gastos…" | Abre 🌱 → **Configurar Brote** y revisa qué falta |
| La configuración dice que falta Node | Instala Node 24 o superior y pulsa **Revisar de nuevo** |
| Brote no responde preguntas, solo gastos | Revisa que Claude Code tenga tu sesión iniciada (`claude` en una terminal) |
| No sé cómo cerrarlo | 🌱 → **Salir de Brote** |

## Desinstalar

1. 🌱 → **Salir de Brote**, y borra la app (Mac: de Aplicaciones; Windows: desde "Agregar o quitar programas").
2. Si también quieres borrar tus datos: la carpeta `.asistente-prototipo` de tu carpeta personal. OpenClaw se desinstala aparte (`npm uninstall -g openclaw`).
