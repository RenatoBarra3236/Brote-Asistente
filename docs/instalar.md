# Instalar Brote 🌱

**Brote es el agente que crece contigo**: un personaje que vive en tu computador y te acompaña con el estudio y la plata.

- **Anota tus gastos al tiro, sin IA** ⚡ (y aprende tu forma de escribirlos).
- **Te ayuda a estudiar:** ramos, notas, repaso, plan antes de una prueba y documentos que arrastras hacia él.
- **Todo vive en tu computador y tú decides lo que recuerda.**

> Es un **prototipo**: puede tener errores. Tus datos quedan en tu computador ([privacidad.md](privacidad.md)).

## Antes de empezar

| | Para qué |
|---|---|
| **Un Mac con chip Apple (M1 o posterior)** o **un PC con Windows 10 u 11** | En el Mac, Brote vive en el notch; en Windows, arriba al centro de la pantalla |
| **Claude Code con tu cuenta Pro o Max** ([claude.com/claude-code](https://claude.com/claude-code)) | Es la IA con la que Brote conversa. **Opcional al empezar**: sin ella, Brote funciona igual con lo que resuelve sin IA ⚡ y la activas cuando quieras |
| **Node 24 o superior** ([nodejs.org](https://nodejs.org/es/download), versión LTS) | **Solo para activar la IA** (la instalación de OpenClaw lo usa). Brote trae su propio Node para todo lo demás; con Homebrew, la ventana de configuración instala Node por ti |

## 1. Descargar

En la página de [Releases](https://github.com/RenatoBarra3236/Asistente-multiplataforma/releases) baja el último instalador:

- **Mac:** `Brote_…_aarch64.dmg`
- **Windows:** `Brote_…_x64-setup.exe`

## 2. Instalar

**Mac:** abre el `.dmg` y arrastra **Brote** a **Aplicaciones**. Como es un prototipo sin firma de Apple, macOS dice que no puede verificarlo: abre **Configuración del Sistema → Privacidad y seguridad**, baja hasta el mensaje sobre Brote y pulsa **Abrir igualmente**. Si no aparece, en la Terminal: `xattr -dr com.apple.quarantine /Applications/Brote.app` y ábrelo de nuevo.

**Windows:** abre el `.exe`. Si dice "Windows protegió su PC", pulsa **Más información → Ejecutar de todas formas**, y sigue los pasos.

## 3. La primera vez

Al abrir Brote aparece **Configurar Brote**, con tres pasos:

1. **Preparar.** Una barra muestra cuánto falta. Si te pide algo, aparece una tarjeta (instalar Node, iniciar sesión en Claude Code, aceptar que OpenClaw —el "cerebro" de Brote— pueda usar tu computador; Brote siempre te pide permiso antes de ejecutar comandos). Con Node instalado, pulsa **Preparar Brote** y espera unos minutos. **¿No tienes Claude o quieres probar primero?** Aparece **Empezar sin IA** (no hace falta tener Node instalado): te salta este paso y la IA la activas después en 🌱 → **Configurar Brote → Estado → Activar la IA**.
2. **Qué quieres que haga Brote.** Parte con **Para empezar** (gastos, pomodoro, ramos y reacciones: nada que pida permisos de macOS). Calendario, aula, música y descargas quedan para cuando quieras prenderlos; cada tarjeta dice qué hace y qué permiso pide.
3. **Listo.** Un recuadro resume qué hace Brote en tu computador. Pulsa **Empezar**.

## 4. Pruébalo

Pasa el cursor por el notch (Mac) o por arriba al centro (Windows): la isla se despliega. En **Inicio** verás la tarjeta **🌱 Primeros pasos**: cuatro cosas para probar con un toque (**Probar** deja la frase en el campo; se tachan solas, y **Ocultar** la quita). Estas son las frases:

| Escribe | Qué pasa |
|---|---|
| `gasté 3 lucas en el almuerzo` | Lo anota al instante, sin IA ⚡ |
| `pomodoro de 25 para cálculo` | Parte un pomodoro; la cuenta regresiva se ve en la isla |
| `agrega el ramo cálculo` | Crea el ramo (pestaña Estudio) |
| `¿qué sabes de mí?` | Abre **Lo que sé de ti**: todo lo que Brote recuerda, para corregirlo u olvidarlo |
| `¿en qué estoy gastando más?` | Lo responde la IA, con tus datos (necesita la IA activada) |

La primera semana, la tarjeta te sugiere un uso nuevo por día (una línea, descartable con ✕). Todo lo demás que sabe hacer —presupuesto, notas, plan de estudio, calendario, aula, música, grabar clases, el equipo de especialistas— está en [funciones.md](funciones.md).

El menú **🌱** (barra de menú del Mac, arriba a la derecha; en Windows, junto al reloj) tiene: **Lo que sé de ti**, **Privacidad**, **Configurar Brote** y **Salir de Brote**.

## Permisos que tu Mac te va a preguntar

macOS pregunta la primera vez que Brote necesita algo, y solo para las funciones que prendas: Calendarios, Automatización (Spotify y Música), carpeta Descargas y Micrófono. Con **Para empezar** no verás ninguno. Qué pide cada función y cómo cambiarlo: [funciones.md](funciones.md) y 🌱 → **Configurar Brote → Permisos**.

## Tus datos

- Tus gastos, notas, ramos y lo que Brote recuerda quedan **solo en tu computador** (`~/.asistente-prototipo` y la carpeta de OpenClaw).
- **Sin IA, nada de lo que escribes sale de tu computador.** Con la IA, lo que le preguntas pasa por tu cuenta de Claude, como cuando usas Claude Code.
- En **Lo que sé de ti** ves y borras todo. En Mac, lo que olvidas va a la Papelera y sigue en tu disco hasta que la vacíes; en Windows se borra de inmediato.
- Qué se guarda, a qué empresas llega algo y cómo borrarlo, todo: [privacidad.md](privacidad.md) (también dentro de la app: menú 🌱 → **Privacidad**).

### Cifra el disco de tu computador (recomendado)

Tus datos quedan como archivos normales en tu disco. Si alguien se lleva tu computador y el disco no está cifrado, puede leerlos. Cifrarlo lo evita:

- **Mac**: activa **FileVault** (Ajustes del Sistema → Privacidad y seguridad → FileVault) y guarda la clave de recuperación.
- **Windows**: activa **BitLocker** o "Cifrado de dispositivo" (Configuración → Privacidad y seguridad). BitLocker viene en Windows Pro; en Home, aparece el cifrado de dispositivo si tu equipo lo permite.

## Si algo falla

| Problema | Qué hacer |
|---|---|
| El campo dice "Sin IA por ahora" | Empezaste sin IA: 🌱 → **Configurar Brote → Estado → Activar la IA** |
| El campo dice "Sin OpenClaw…" | 🌱 → **Configurar Brote → Estado** y **Reparar** |
| La configuración dice que falta Node | Es para activar la IA: **Instalar con Homebrew** o **Descargar Node** (24 o superior); la ventana revisa sola al volver. Para usar Brote sin IA no hace falta |
| Brote no responde preguntas, solo frases con ⚡ | Revisa que Claude Code tenga tu sesión iniciada (`claude` en una terminal) |
| Brote dice "Eso está apagado" | Prende esa función en **Configurar Brote → Funciones** |
| Otra cosa | **Configurar Brote → Estado → Copiar diagnóstico** y pega el resultado en tu mensaje (solo trae versiones y el estado de cada paso, nada tuyo) |
| No sé cómo cerrarlo | 🌱 → **Salir de Brote** |

Más problemas de cada función (aula, conectores, equipo, uso del plan…): [funciones.md](funciones.md).

## Desinstalar

1. 🌱 → **Salir de Brote** y borra la app (Mac: de Aplicaciones; Windows: "Agregar o quitar programas").
2. Si instalaste el modo programador o la statusline del uso del plan, desinstálalos antes en **Configurar Brote → Funciones** (si no, Claude Code los sigue llamando; no hacen nada sin Brote, pero tu statusline anterior no vuelve sola).
3. Para borrar tus datos: la carpeta `.asistente-prototipo` de tu carpeta personal. OpenClaw se desinstala aparte (`npm uninstall -g openclaw`).
