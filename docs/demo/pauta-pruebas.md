# Pauta de pruebas con usuarios

**Objetivo:** saber si otra persona puede instalar Brote sola (condición de salida del paso 10) y si lo seguiría usando (criterio de éxito del prototipo: al menos 3 de 5 dicen que sí).

**Participantes:** 3 a 5 estudiantes universitarios. Idealmente al menos uno con Windows. Requisito: cuenta de Claude Pro o Max (si no tienen, pueden probar solo la parte sin IA: gastos y personaje).

**Duración:** unos 30 minutos por persona.

## Antes

- Pásales el instalador y el enlace a [docs/instalar.md](../instalar.md). Nada más.
- Explícales que es un prototipo y que lo que se prueba es Brote, no ellos.
- Pide permiso para observar y tomar notas. Sus datos quedan en su computador; no les pidas capturas de sus gastos reales.

## 1. Instalación (15 min) — no ayudes

Pídeles que lo instalen siguiendo la guía. **No intervengas** salvo que lleven más de 5 minutos trabados en lo mismo (y anota que tuviste que ayudar).

Anota:

- ¿Lo logró sin ayuda? (Sí / Con ayuda / No)
- ¿Dónde dudó o se trabó? (aviso de seguridad al abrir, Node, Claude Code, casilla de consentimiento, "Preparar Brote", elegir funciones…)
- ¿Cuánto tardó?

## 2. Tareas (10 min)

Pídeselas en voz alta, sin decir cómo hacerlas:

1. "Anota que gastaste 3 lucas en el almuerzo."
2. "¿Cuánto llevas gastado este mes?"
3. "Pregúntale algo cualquiera" (por ejemplo, el clima o ayuda con un ramo).
4. "Anota un gasto como lo escribirías tú en WhatsApp." (Probablemente active el motor que aprende.)
5. "Mira qué sabe Brote de ti y borra algo."
6. "Ciérralo."

Para cada una: ¿la logró? ¿con qué dificultad (fácil / con dudas / no pudo)? ¿qué dijo?

## 3. Preguntas (5 min)

1. Del 1 al 5, ¿qué tan fácil fue instalarlo?
2. Del 1 al 5, ¿qué tan útil te parece para tu día a día en la U?
3. ¿Qué te gustó más? ¿Qué te molestó?
4. ¿Te da confianza lo que Brote recuerda de ti? ¿Por qué?
5. **¿Lo seguirías usando?** (Sí / Tal vez / No) ¿Por qué?
6. ¿Pagarías por una versión con IA incluida (sin necesitar tu propia cuenta de Claude)? ¿Cuánto al mes?

## Después

Si alguien acepta usarlo dos semanas, pídele al final el número que aparece arriba en **Lo que sé de ti** ("⚡ N% sin IA"): es la métrica del motor que aprende (criterio de éxito: medir qué porcentaje se resuelve sin IA).

## Registro

| Persona | Sistema | Instaló sin ayuda | Dónde se trabó | Tareas logradas (de 6) | Facilidad (1–5) | Utilidad (1–5) | ¿Lo seguiría usando? | Comentario clave |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |

## 4. Semana 1 (a los 7 días, por mensaje o en persona)

Brote no mide el uso desde la app (decisión del bloque F: sin telemetría); el éxito se mide aquí. A los 7 días, pregunta a cada tester, sin guiar:

1. ¿Lo abriste después de la primera vez? ¿Cuántos días de los 7? ¿Qué estabas haciendo cuando lo usaste?
2. ¿Qué usaste más? ¿Qué dejaste de usar, y por qué?
3. ¿Empezaste **sin IA** o con la IA? Si empezaste sin IA, ¿la activaste? ¿Por qué sí o por qué no?
4. ¿Te sirvió la tarjeta **Primeros pasos**? ¿Probaste alguna sugerencia del día? ¿La ocultaste?
5. ¿Qué te dio desconfianza o te hizo dudar de dejarlo instalado (permisos, avisos, datos)?
6. ¿Lo seguirías usando? ¿Se lo recomendarías a un compañero? (Criterio de éxito: **3 de 5 dicen que sí**.)

Anota también, para cada uno: sistema, si necesitó **Copiar diagnóstico**, y qué dijo de la **instalación** ahora que Node y Claude pueden esperar.

