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
| Token del aula y dirección secreta de tu calendario iCal | En el Llavero de macOS / Administrador de credenciales de Windows (los archivos aula.json y calendario.json dicen solo `enLlavero`). Sin Llavero (Linux o si falla) quedan en esos archivos, solo legibles por tu usuario |
| Qué conectores tienes conectados (sin secretos) | `~/.asistente-prototipo/conectores.json` |
| Lo que Brote recuerda de ti y las conversaciones guardadas | la carpeta de OpenClaw (`~/.openclaw/workspace`) y la memoria de Claude Code de ese espacio |
| Registros de OpenClaw | `~/Library/Logs/openclaw/gateway.log` (Mac). Pueden caer respuestas de los agentes; Brote las quita solo (al abrir y cada hora). El registro propio de OpenClaw está en `/tmp/openclaw` y se borra a las 24 h |
| Grabaciones y sus transcripciones (solo si prendes **Grabar y transcribir**, apagada de fábrica; todavía sin captura de micrófono) | Audio en `~/.asistente-prototipo/grabaciones/`, que se borra solo a los 7 días (a la Papelera en Mac); texto en `~/.asistente-prototipo/transcripciones/`, que se queda hasta que lo borres. Separado de la memoria de OpenClaw |
| Tus sesiones de Claude Code (si prendes el modo programador o el uso del plan) | `~/.claude/projects`: Brote lee solo la cantidad de tokens y el modelo, no el texto |

Los archivos de Brote quedan con permisos de solo tu usuario, pero **no están cifrados**: por eso recomendamos
cifrar el disco (FileVault en Mac, BitLocker en Windows; ver "Tus datos" en `docs/instalar.md`).

## A qué empresas llega algo

- **Anthropic**: tus conversaciones con Brote, por tu cuenta de Claude (Claude Code). Brote nunca lee tus credenciales de Claude ni usa tu clave de API (y Configurar Brote te avisa si queda una puesta en `settings.json`, en OpenClaw o en el servicio del Gateway).
- **Google (Gemini), OpenAI (ChatGPT), xAI (Grok)**: solo si prendes el equipo de Brote y eliges esa IA para un especialista. Con Gemini en el plan gratis, Google puede usar lo que recibe para mejorar sus productos y revisarlo con personas, por eso Brote le pasa **solo el tema en general**, nunca tu nombre, gastos, memoria, calendario ni aula.
- **Conectores** (Todoist, Notion, GitHub, Canva o uno propio): solo si los conectas. Cada uno ve lo que le pidas a Brote que haga con él.
- **Tu campus** (Canvas o Moodle) y **tu calendario de Google** (dirección iCal): Brote los consulta directo, solo para leer, y no pasan por ningún tercero de Brote.
- **Grabaciones**: el audio se transcribe en tu computador y no llega a ninguna empresa. El **texto** viaja a Anthropic solo cuando le pides algo a Brote (por ejemplo un resumen), y nunca a especialistas de planes gratuitos (la skill `delegar` lo prohíbe).
- Brote no manda estadísticas ni telemetría propias.

## Cómo borrar tus datos

- **Lo que Brote recuerda**: Lo que sé de ti → Olvidar (o "olvidar todo sobre «tema»"). En Mac va a la Papelera y sigue en tu disco hasta que la vacíes; en Windows se borra de inmediato.
- **Todo lo de Brote**: cierra la app y borra `~/.asistente-prototipo`. La memoria y los registros de OpenClaw están en `~/.openclaw` y se borran aparte (o desinstalando OpenClaw).
- **Lo que quedó en cada empresa**: se borra desde tu cuenta de esa empresa (Claude, Google, etc.), no desde Brote.

## Voces de otras personas (grabaciones)

Una clase o una reunión grabada tiene la voz, y a veces datos personales, de gente que no usa Brote. Por eso:
Brote graba solo cuando tú lo inicias, te pregunta **en cada grabación** si avisaste a los presentes (sí, no o
«solo mi voz») y lo anota en la transcripción (`avisoAPresentes`). El audio se conserva **7 días** (puedes cambiarlo)
y después se borra; la transcripción, no, hasta que tú la borres. Todo en claro, con permisos de tu usuario:
cifra el disco. Brote no da asesoría legal ni firma por ti: avisar o pedir permiso es cosa tuya, y conviene que
alguien revise este texto antes de repartir Brote.

## Lo que todavía no está resuelto

- El token de Gateway y las claves de OpenClaw (`~/.openclaw/openclaw.json`), el token de GitHub si lo conectas y la clave del dispositivo (`~/.asistente-prototipo/dispositivo.json`) siguen en archivos de texto con permisos de tu usuario, no en el Llavero. Brote no los mueve: dependen de OpenClaw.
