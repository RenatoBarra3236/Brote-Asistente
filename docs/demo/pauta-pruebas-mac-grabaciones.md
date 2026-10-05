# Pauta de pruebas en el Mac: grabar, transcribir y Agenda

Para hacer **tú**, en tu Mac, con `Brote.app`. Cubre las fases 2 a 5 de la sección 8 de `docs/plan-rediseno.md`.
Marca cada casilla y anota lo raro. Tiempo estimado: 1 h 30.

**Reglas:** usa solo audios y transcripciones de prueba (di una frase tuya, no grabes clases reales). No pegues en el chat contenido de transcripciones.

## 0. Preparación (10 min)

- [ ] `export PATH="$HOME/.cargo/bin:$PATH"` y `pnpm --dir apps/desktop tauri build --bundles app` (antes corre `empaquetar-puente`).
- [ ] Cierra Brote si estaba abierto y abre `src-tauri/target/release/bundle/macos/Brote.app` desde el Finder (así el permiso del micrófono y del calendario es de Brote, no de la Terminal).
- [ ] Configurar Brote (🌱 → Configurar Brote…) → Funciones: prende **Grabar y transcribir**. Acepta la casilla de consentimiento.
- [ ] En la misma tarjeta: paso `whisper` en verde (si falta, «Instalar con Homebrew»). Elige modelo `small` y descárgalo.
- [ ] Prende también **Calendario** (con el permiso del Calendario del Mac) para la parte 5.

## 1. Descarga del modelo (10 min)

- [ ] Avance visible y luego «verificando»; termina sin error.
- [ ] `ls -l ~/.asistente-prototipo/modelos/` → archivo `-rw-------` (600) y carpeta 700.
- [ ] Vuelve a pedir la descarga con el archivo ya completo: no baja de nuevo.
- [ ] (Opcional) Con otro modelo, corta el Wi-Fi a la mitad: queda un `.parte`, y al cancelar o fallar se borra. Reconecta.

## 2. Micrófono real (15 min)

- [ ] Abre la isla y di «graba esta clase»: aparece «¿Avisaste a los presentes?» y **no** graba hasta responder. Responde «Sí, avisé».
- [ ] La primera vez sale el aviso de macOS con el texto de Brote (no de la Terminal). Acepta.
- [ ] Se ve `🌱🔴` en la barra de menú y `🔴 mm:ss` en el ala izquierda con la isla cerrada.
- [ ] Di una frase de prueba durante 30 s, y detén con «para la grabación» (o ■ Detener).
- [ ] `ls -l ~/.asistente-prototipo/grabaciones/` → un `.wav` 600, carpeta 700. Comprueba el formato: `afinfo <archivo>.wav` → mono, 16 000 Hz, 16 bits, duración ≈ 30 s.
- [ ] «¿Estoy grabando?» responde bien en ambos estados.
- [ ] Con la función apagada (apágala un momento), «graba esta clase» responde «Eso está apagado» y no abre nada. Vuelve a prenderla.
- [ ] **Permiso negado:** en Ajustes → Privacidad → Micrófono quita a Brote y graba: el error dice cómo activarlo, aparece «Abrir Privacidad» y no queda un `.wav` vacío. Vuelve a darle el permiso.

## 3. Transcribir (10 min)

- [ ] Pestaña **Grabar**: la grabación aparece con su duración y chip «Sin transcribir». Al detener **no** se transcribió sola.
- [ ] Toca la fila → «Transcribir»: chips En cola → Transcribiendo → Transcrita. Aviso «Tu transcripción está lista» (punto en la pestaña Grabar).
- [ ] `ls -l ~/.asistente-prototipo/transcripciones/` → `.md` 600, con `avisoAPresentes: si` en la cabecera. (No pegues su contenido en el chat.)
- [ ] El texto es razonable en español. «Copiar» en la transcripción lo copia («Copiado ✓»).
- [ ] Graba 10 min hablando o con un podcast de fondo y transcríbelo con `small`: anota cuánto tarda (el plan pide la cifra real) y que la isla no lo da por colgado.
- [ ] Sin consentimiento aceptado, o con la función apagada: el audio queda guardado y el aviso explica por qué no se transcribe.

## 4. Casos raros de la captura (15 min)

- [ ] Graba y cierra con **Cmd + Q**: el `.wav` se abre y se transcribe.
- [ ] Graba y haz `kill -9` al proceso de Brote: el `.wav` se abre (pierde a lo más 5 s).
- [ ] Graba con AirPods y desconéctalos a la mitad: la isla muestra el error y lo grabado se puede transcribir. Anota qué hizo.
- [ ] Graba con el micrófono del Mac y con unos AirPods (formatos distintos): el audio suena bien en ambos.
- [ ] Una segunda grabación seguida, sin cerrar la app, y otra con la ventana de Configurar abierta.
- [ ] «No llega sonido»: silencia el micrófono por hardware o con un micrófono virtual; a los 8 s avisa.

## 5. Agenda y tareas (20 min)

- [ ] Antes: reinicia los procesos MCP (`pkill -f packages/motor/src/mcp.ts`, y el `claude … --resume` que los lanzó) y abre sesión nueva con `openclaw tui --session agent:asistente-multiplataforma:main`. Revisa `openclaw mcp probe gastos`: lista `agenda_proponer`.
- [ ] Arma una transcripción de prueba tuya donde digas: una tarea con plazo («entregar el informe el viernes») y una prueba con hora («la prueba es el próximo martes a las 10»). Transcríbela como en la parte 3.
- [ ] Pídele a Brote «saca las tareas de mi última clase»: lee la transcripción, llama a `agenda_proponer` **sin pedir permiso** y aparece la tarjeta «Encontré N cosas en tu grabación» en Agenda, con punto en la pestaña y texto en el ala si la isla está cerrada.
- [ ] Revisa las fechas: «el viernes» y «el próximo martes» calculadas desde el día de la grabación, sin tareas inventadas. (Si falla, hay que ajustar la descripción de la herramienta.)
- [ ] Acepta la **tarea**: aparece **una sola vez** en Agenda, con check, y en Calendario del Mac como evento de 30 min que termina a la hora límite.
- [ ] Acepta la **prueba con hora**: aparece en el Calendario (1 h) y en Agenda. Repite con el permiso de Calendarios quitado: queda como tarea y el mensaje lo dice.
- [ ] Marca el check de la tarea, cierra y abre la isla (o reinicia Brote): sigue marcada. El evento del calendario no cambia.
- [ ] Genera propuestas nuevas, **no** las aceptes, y borra esa transcripción desde «Lo que sé de ti» (🧠 → Grabaciones, segundo toque): las propuestas desaparecen de Agenda; lo ya aceptado se queda.
- [ ] Descarta una propuesta y vuelve a pedir lo mismo: no reaparece.
- [ ] Con solo **Grabar** prendida (apaga calendario, aula y temporizadores): la pestaña Agenda aparece y explica qué falta.

## 6. Borrado a la Papelera desde la ventana (5 min)

Lanza la app con carpetas de prueba para no tocar lo tuyo:
`ASISTENTE_GRABACIONES=/ruta/prueba/g ASISTENTE_TRANSCRIPCIONES=/ruta/prueba/t open --env … Brote.app` (pon antes dos o tres `.wav` y `.md` de mentira con nombres `AAAA-MM-DD-HHMMSS`).

- [ ] 🧠 → Grabaciones: borra una transcripción, un audio, y «Borrar todo» de cada tipo (segundo toque).
- [ ] Todo va a la Papelera de Finder y el aviso lo dice («sigue ahí hasta vaciar la Papelera»).

## 7. Notch y visual (5 min)

- [ ] La tarjeta de propuestas y las 5–6 pestañas caben en la fila del notch real.
- [ ] `🌱🔴` se ve bien en la barra de menú (si el emoji sale raro, anótalo: habría que dibujar un ícono).
- [ ] El `🔴 mm:ss` se ve sobre una app en pantalla completa.

## Al terminar

Anota abajo qué falló y dímelo (sin pegar contenido de transcripciones): actualizo las listas de pendientes del plan.

| Parte | Resultado | Notas |
|---|---|---|
| 1 Modelo | | |
| 2 Micrófono | | |
| 3 Transcribir | | |
| 4 Casos raros | | |
| 5 Agenda | | |
| 6 Papelera | | |
| 7 Notch | | |

**Fuera de esta pauta:** Windows, el MCP en `Brote.app` con OpenClaw reiniciado por launchd y las ideas de la sección 9 (no se empiezan sin que lo pidas).
