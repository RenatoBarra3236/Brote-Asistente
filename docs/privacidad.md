# Privacidad de Brote 🌱

Borrador del 4-10-2026, para quien pruebe Brote. Es orientación, no asesoría legal: antes de repartir Brote a más
gente conviene que alguien lo revise (en Chile rige la Ley 21.719 de protección de datos personales desde
diciembre de 2026).

## En corto

- Brote guarda lo suyo **en tu computador**. No tiene servidores propios ni cuenta propia: no hay nadie de Brote que reciba tus datos.
- Lo que le escribes a la IA va a la empresa de esa IA, igual que cuando usas Claude Code.
- Puedes ver y borrar lo que Brote recuerda en **Lo que sé de ti**.

## Qué se guarda y dónde

| Qué | Dónde (en tu computador) |
|---|---|
| Tus gastos, tu presupuesto, las frases que Brote aprendió, los temporizadores y cuántas veces respondió sin IA (sin el texto de tus mensajes) | `~/.asistente-prototipo/asistente.db` |
| Qué funciones tienes prendidas, el equipo y sus avisos | `~/.asistente-prototipo/` |
| Token del aula, dirección secreta de tu calendario iCal, conectores conectados | `~/.asistente-prototipo/` (aula.json, calendario.json, conectores.json), solo legibles por tu usuario |
| Lo que Brote recuerda de ti y las conversaciones guardadas | la carpeta de OpenClaw (`~/.openclaw/workspace`) y la memoria de Claude Code de ese espacio |
| Registros de OpenClaw | `~/Library/Logs/openclaw/gateway.log` (Mac). **Pueden incluir fragmentos de lo conversado**; hoy no se limpian solos |
| Tus sesiones de Claude Code (si prendes el modo programador o el uso del plan) | `~/.claude/projects`: Brote lee solo la cantidad de tokens y el modelo, no el texto |

Los archivos de Brote quedan con permisos de solo tu usuario, pero **no están cifrados**: por eso recomendamos
cifrar el disco (FileVault en Mac, BitLocker en Windows; ver "Tus datos" en `docs/instalar.md`).

## A qué empresas llega algo

- **Anthropic**: tus conversaciones con Brote, por tu cuenta de Claude (Claude Code). Brote nunca lee tus credenciales de Claude ni usa tu clave de API.
- **Google (Gemini), OpenAI (ChatGPT), xAI (Grok)**: solo si prendes el equipo de Brote y eliges esa IA para un especialista. Con Gemini en el plan gratis, Google puede usar lo que recibe para mejorar sus productos y revisarlo con personas, por eso Brote le pasa **solo el tema en general**, nunca tu nombre, gastos, memoria, calendario ni aula.
- **Conectores** (Todoist, Notion, GitHub, Canva o uno propio): solo si los conectas. Cada uno ve lo que le pidas a Brote que haga con él.
- **Tu campus** (Canvas o Moodle) y **tu calendario de Google** (dirección iCal): Brote los consulta directo, solo para leer, y no pasan por ningún tercero de Brote.
- Brote no manda estadísticas ni telemetría propias.

## Cómo borrar tus datos

- **Lo que Brote recuerda**: Lo que sé de ti → Olvidar (o "olvidar todo sobre «tema»"). En Mac va a la Papelera y sigue en tu disco hasta que la vacíes; en Windows se borra de inmediato.
- **Todo lo de Brote**: cierra la app y borra `~/.asistente-prototipo`. La memoria y los registros de OpenClaw están en `~/.openclaw` y se borran aparte (o desinstalando OpenClaw).
- **Lo que quedó en cada empresa**: se borra desde tu cuenta de esa empresa (Claude, Google, etc.), no desde Brote.

## Lo que todavía no está resuelto

- Los registros de OpenClaw (`gateway.log`) guardan fragmentos de conversaciones sin limpieza automática.
- Algunos secretos (token del aula, dirección iCal, claves de OpenClaw) están en archivos de texto con permisos de tu usuario, no en el Llavero de macOS ni en el Administrador de credenciales de Windows.
- Si alguien configura a propósito una clave de API de Claude, Brote hoy no avisa que dejó de usar el plan.
