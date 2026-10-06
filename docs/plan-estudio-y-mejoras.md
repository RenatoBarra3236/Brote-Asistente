# Plan: Estudio y mejoras desde la mirada de un estudiante

Anotado el 5-10-2026 a partir de una revisión "como estudiante universitario" pedida por el usuario. **Nada está empezado.** Se hace en varias sesiones; cada bloque es una sesión (o más). Antes de cada uno: diseño corto en este archivo, el usuario lo aprueba y recién entonces código. Mismas reglas de siempre (CLAUDE.md): español, sin commit, pruebas por paquete, privacidad primero, no copiar código de otros proyectos.

## Diagnóstico

**Lo que ya gusta:** Brote en el notch; gastos sin IA que aprenden; pomodoro, entregas del aula y próxima clase; grabar y transcribir con tareas hacia Agenda; privacidad clara y borrable.

**Lo que falta:** el pilar *estudio* está disperso (piezas sueltas, sin un lugar para estudiar) y el pilar *plata* tiene pestaña y gráficos. Todo se organiza por fecha o tipo, no por ramo.

**Dudas de fondo (no son una tarea, son riesgos):** depende de Claude Pro y de una instalación técnica (Node, OpenClaw): barrera real para compañeros; solo está en el PC (los gastos se anotan en la micro, desde el celular); el personaje es provisional.

## Bloques (orden recomendado)

### A. Pestaña Estudio (la más importante)
1. **Ramos como entidad central:** cada ramo con color, horario, profesor, notas, entregas, apuntes y transcripciones. Hoy nada se agrupa por ramo. (Base de todo lo demás: define tabla `ramos` y cómo se vinculan eventos, entregas, tareas y transcripciones.)
2. **Calculadora de notas, sin IA:** «con 4,2 en el certamen 1, ¿cuánto necesito en el 2 para aprobar?», ponderaciones, nota mínima de examen. Frases del motor + herramienta MCP.
3. **Resumen y tarjetas de repaso desde una transcripción:** resumen por temas, glosario, preguntas de práctica, repaso espaciado. Solo con el agente de Brote (nunca un especialista ni plan gratuito: regla de `delegar`). Pedido del usuario, igual que `agenda_proponer`.
4. **Plan de estudio antes de una prueba:** con la fecha, repartir bloques de estudio en el calendario según el tiempo que falta (con confirmación en la isla).
5. **Estadísticas de estudio:** horas por ramo de la semana, racha de días, pomodoros hechos (hoy el pomodoro se cuenta y se olvida; hay que guardarlo con su ramo).

### B. Gráficos
- **Estudio:** horas por ramo, promedio de notas por semestre, carga semanal.
- **Plata:** tendencia de los últimos meses y proyección «a este ritmo terminas el mes en X» (la pestaña ya tiene barras y categorías).
- **Agenda:** vista semanal o de calendario, además de la lista; que se note la semana de certámenes.
- Estilo: SVG y barras propios armados solo con números, como la pestaña Plata (`plata.ts`).

### C. Organizar temas
- Etiquetas y búsqueda entre apuntes, transcripciones, tareas y gastos: «todo lo de Cálculo» junta clases grabadas, tareas y entregas. Depende de A1 (ramos).

### D. Conectores (en este orden de valor)
1. Google Calendar y Google Drive/Docs.
2. Notion (ya en el catálogo; falta probarlo).
3. Correo institucional (avisos de profesores y secretaría).
4. Zoom / Meet: transcribir clases online, no solo presenciales.
5. Anki: exportar las tarjetas de repaso (depende de A3).
6. Grupos de trabajo: lista de tareas compartida; aviso si alguien del grupo no entregó su parte.
- Pendiente anterior: tarjeta de GitHub (tarea 5 de conectores).
- Cada conector: solo lectura salvo decisión explícita, `hostsAutorizacion` propio, sin leer credenciales ajenas (reglas de la viñeta Conectores de CLAUDE.md).

### E. Cosas chicas de mucho valor
- **Modo concentración:** al partir el pomodoro, Brote silencia los avisos que no importan (usa `Novedades`).
- **Resumen de la mañana:** «hoy tienes 2 clases, una entrega y llevas gastado X de tu presupuesto» (sin IA, con lo que ya existe).
- **Metas de ahorro:** «quiero juntar 150 lucas para marzo», ligada al presupuesto y los gastos hormiga.
- **Gastos compartidos:** «le debo 5 lucas a Juan» (ojo con la privacidad: nombres de terceros).
- **Más personalidad:** Brote celebra al entregar algo o aprobar una prueba.

### F. Barreras de adopción (decisiones de producto, no código inmediato)
- Facilitar la instalación (hoy Node + OpenClaw + Claude Pro). Ver el asistente de 3 pasos y `docs/instalar.md`.
- App del celular (ya planeada después del paso 10): anotar gastos desde la micro.
- Personaje definitivo (hoy provisional; no copiar los de otros proyectos).

## Diseño de A1: Ramos (aprobado y HECHO el 5-10-2026: alias por palabra clave, función nueva `estudio`, sin profesor ni sala)

**Qué es.** Un ramo es una etiqueta con nombre, color y datos opcionales. Hoy el "curso" existe solo como texto suelto en las entregas del aula; el pomodoro tiene `etiqueta` libre; las tareas y transcripciones no tienen ramo. A1 crea el ramo y lo enlaza con lo que ya existe, **sin cambiar lo que ya funciona**.

**Datos** (tabla `ramos` en `asistente.db`, misma base y permisos 600; lógica pura en `packages/motor/src/ramos.ts`, tipos sin Node en `ramos-tipos.ts` para la ventana):
- `id`, `nombre` (1–60 letras, único sin tildes ni mayúsculas), `color` (de una paleta cerrada de 8, para que combine con los temas), `profesor?`, `sala?`, `semestre?` (texto, ej. «2026-2»), `archivado`.
- Los **horarios no se duplican**: salen del calendario. Se asocia un ramo a sus eventos por una *palabra clave* del título (ej. «Cálculo»), guardada en `alias` (lista corta). Sin calendario, el ramo igual existe.
- Enlaces nuevos, todos opcionales (`ramo_id` nulo = «sin ramo», nada se rompe): `tareas.ramo_id`, `propuestas_agenda.ramo_id`, pomodoro (`temporizadores.ramo_id`, además de la etiqueta), y un archivo lateral `ramos-transcripciones.json` (600) `{ idGrabacion: ramoId }` — **no se toca el `.md` de la transcripción** (su formato ya está fijado).
- Entregas del aula: el nombre del curso de Canvas/Moodle se **empareja** con un ramo por nombre o alias; sin coincidencia se ofrece «¿lo agrego como ramo?».

**Cómo se crean (de menos a más esfuerzo):**
1. *Sin IA:* «agrega el ramo Cálculo», «mis ramos», «quita el ramo X» (archiva, no borra; sus tareas quedan «sin ramo»).
2. *Desde lo que ya tengo:* al abrir la pestaña por primera vez, Brote sugiere los cursos que ve en el aula y los títulos repetidos del calendario; el usuario toca Agregar. Nada se crea solo.
3. *Agente:* herramientas MCP `ramos_listar` (solo lectura, sin preguntar) y `ramos_crear` (pide permiso en la isla).

**Isla.** Nueva pestaña **Estudio** (entre Agenda y Grabar; visible si hay ≥1 ramo o la función está prendida). Lista de ramos con su color; al tocar uno: próximas clases, entregas y tareas de ese ramo, pomodoros de la semana y transcripciones. Los chips de Agenda, Grabar y el pomodoro muestran el punto de color del ramo y se pueden filtrar por ramo. «Poner ramo» en cada tarea propuesta (Agregar / Editar ya existe: se suma un selector).

**Función.** Id nuevo `estudio` en el catálogo (`funciones.ts`, `funciones.rs`, preset Estudiante y Todo; apagada = sin pestaña y las herramientas MCP responden `MENSAJE_APAGADA_MCP`). Lo ya guardado se ve en «Lo que sé de ti» y se puede borrar aunque se apague.

**Privacidad.** Solo nombres, colores y fechas; nunca texto de clases. Profesor es dato de un tercero: opcional, local, nunca pasa a especialistas de planes gratuitos (se agrega a la lista de la skill `delegar`, con prueba). «Lo que sé de ti» lista los ramos y permite borrarlos.

**Fuera de A1 (para no mezclar):** notas y ponderaciones (A2), resumen y tarjetas (A3), plan de estudio (A4), estadísticas (A5), gráficos (B).

**Pruebas previstas:** `pruebas/ramos.test.ts` (validación, unicidad sin tildes, paleta, archivar, emparejar curso/alias/evento, ramo borrado deja «sin ramo»), frases del motor con frases de control, MCP, el puente real de punta a punta, textos y estado de la isla, vista previa `?pestana=estudio` (con `&estudio=sin|con`).

**Decisiones que necesito de ti antes de programar:**
1. ¿Palabra clave (alias) para unir ramos con eventos del calendario, o prefieres elegir el ramo a mano en cada evento? (Recomiendo alias: cero esfuerzo repetido.)
2. ¿Función nueva `estudio` o que cuelgue de las que ya hay? (Recomiendo función nueva.)
3. ¿El profesor y la sala entran en A1 o los dejamos para después? (Recomiendo dejarlos fuera hasta que sirvan para algo.)

## Lo que quedó hecho en A1 (5-10-2026)

- **Motor** (`packages/motor`): `ramos-tipos.ts` (paleta de 8 colores, validación, `emparejarRamo` por palabra clave completa, la más larga gana y el empate no adivina), `ramos.ts` (tabla `ramos` y tabla aparte `ramo_de` que enlaza tarea, propuesta, pomodoro o grabación a un ramo sin tocar sus tablas; archivar no borra, borrar deja lo suyo «sin ramo»; `marca()`), `ramos-ficha.ts` (`armarFichas`: próximas clases, entregas, tareas y transcripciones de cada ramo; `sugerirRamos`: cursos del aula y eventos que se repiten 3 veces) y `ramos-frases.ts`.
- **Sin IA:** «agrega el ramo Cálculo», «tengo el ramo de…», «mis ramos» / «¿qué ramos tengo?», «quita el ramo X» (archiva), con frases de control; «pomodoro de 30 para cálculo» asigna el pomodoro al ramo cuyo nombre o palabra clave calza.
- **MCP:** `ramos_listar` (solo lectura, sin preguntar) y `ramos_crear` (pide permiso en la isla). Función `estudio` (Estudiante y Todo); apagada, las frases dicen «Eso está apagado» y el MCP informa.
- **Puente:** aviso `ramos` (mira la marca cada 2 s, así aparece lo que crea el agente), pedidos `ramos-estado`, `ramo-crear|editar|archivar|borrar|asignar` y `ramos-todos` (no depende de la función: «Lo que sé de ti»); el aviso `temporizadores` lleva `ramoId`; borrar una transcripción quita su enlace. Prueba de punta a punta con el puente real (`ramos-puente.test.ts`).
- **Isla:** pestaña **Estudio** (ícono de libro, entre Agenda y Grabar; visible con la función prendida): ramos con su punto de color y resumen, ficha desplegable, Editar (nombre, palabras clave, color) y Archivar, sugerencias «¿Son tus ramos?» y formulario para agregar. **Lo que sé de ti → Ramos** (con archivados, Desarchivar y Borrar con segundo toque). Vistas previas `?pestana=estudio` (`&abrir=1`, `&estudio=sin|sugerencias`) y `vista-previa-memoria.html`.
- **Privacidad:** la skill `delegar` prohíbe pasar los ramos a planes gratuitos (con prueba). Nunca texto de clases; sin profesor ni sala.

**Sin hacer de A1 (anotado para no perderlo):** el punto de color del ramo en las filas de Agenda y en la píldora del pomodoro (el puente ya manda `ramoDeTarea` y `ramoId`), un selector «Poner ramo» en cada tarea propuesta y en cada transcripción (el pedido `ramo-asignar` existe, falta la interfaz) y emparejar automáticamente las transcripciones por palabra clave. Hoy las asignaciones se hacen por pedido al puente o con el pomodoro.

### Pruebas pendientes de A1 (para un Mac)

- [ ] Reiniciar los procesos MCP (`pkill -f packages/motor/src/mcp.ts` y el `claude … --resume`), abrir sesión nueva con el TUI y pedir «agrega el ramo Cálculo» y «¿qué ramos tengo?»: que use `ramos_crear` (con permiso en la isla) y `ramos_listar` (sin preguntar). `openclaw mcp probe gastos` debe listar las dos herramientas.
- [ ] En `Brote.app` con el calendario real: que las clases de un ramo aparezcan en su ficha por la palabra clave, y que un título parecido («Calculadora») no se cuele.
- [ ] Con un aula real (Canvas o Moodle): que los cursos se sugieran y se emparejen con el ramo.
- [ ] Que la función `estudio` aparezca en Configurar Brote → Funciones y que apagarla esconda la pestaña y responda «Eso está apagado» a las frases.
- [ ] El aspecto de la pestaña Estudio y de «Lo que sé de ti → Ramos» en el notch real y en el modo flotante.
- [ ] Borrar un ramo desde «Lo que sé de ti» con tareas y pomodoros asignados: quedan sin ramo y no se pierden.

## Diseño de A2: Calculadora de notas (aprobado y HECHO el 5-10-2026, con las recomendaciones de abajo en las seis decisiones)

**Qué es.** Por cada ramo, una lista de evaluaciones («Certamen 1», 30 %, nota 4,2 o pendiente). Con eso Brote calcula, sin IA, el promedio actual, lo que falta para aprobar y cuánto hay que sacar en lo que queda.

**Datos** (tablas nuevas en `asistente.db`, 600; puro en `packages/motor/src/notas.ts`, tipos sin Node en `notas-tipos.ts`):
- `evaluaciones`: `id`, `ramo_id`, `nombre` (1–60), `peso` (% entero 1–100), `nota` (1,0–7,0 con un decimal, o nula = pendiente), `fecha?` (para enlazarla después con Agenda).
- Ajustes por ramo en `notas_ramo`: `aprobacion` (por defecto 4,0), `examen_peso?` (% del examen, ej. 30), `examen_minimo?` (nota mínima del examen), `presentacion_minima?`. Sin examen = solo promedio ponderado.
- Enlace al ramo: columna propia `ramo_id` (no `ramo_de`, que es para cosas que existen aparte; una evaluación no vive sin ramo). Borrar o archivar un ramo: archivar conserva las notas; borrar el ramo borra sus evaluaciones (se dice en la confirmación de «Lo que sé de ti»).
- Escala: chilena 1,0–7,0, aprobación 4,0, configurable por ramo (`aprobacion`). Coma o punto decimal en las frases. Redondeo a un decimal, mostrando también el valor exacto que falta («necesitas 5,37 → pon 5,4»).

**Cálculos puros** (`calcularRamo`):
1. Promedio actual = Σ(nota×peso) ÷ Σ(peso rendido) y «puntos acumulados» sobre el total.
2. Nota necesaria en lo pendiente: (aprobación×100 − Σ(nota×peso)) ÷ Σ(peso pendiente). Si es > 7,0 → «ya no alcanza con lo que queda» (y dice cuánto máximo llegarías); si es ≤ 1,0 → «ya aprobaste».
3. Con varias pendientes, «¿cuánto en el 2?» = nota necesaria en esa, suponiendo las demás pendientes en la misma nota; si las demás ya tienen nota, se usa esa.
4. Examen: nota de presentación = promedio de las evaluaciones del período; final = presentación×(100−examen_peso)% + examen×examen_peso%. «¿Cuánto necesito en el examen?» y aviso si no cumple `examen_minimo`/`presentacion_minima`. Todo opcional.
5. Escenarios: «¿y si me saco 5 en el 2?» (no guarda nada).

**Sin IA (frases del motor, intención `notas-*`, función `estudio`):**
- «agrega una nota 5,5 en Cálculo» / «me saqué 5,5 en el certamen 1 de cálculo» (crea la evaluación si no existe, con peso por definir → pregunta; ver decisión 3).
- «evaluaciones de cálculo: certamen 1 30%, certamen 2 30%, examen 40%» (define varias de una vez; también «agrega evaluación certamen 2 de 30% en cálculo»).
- «con 4,2 en el certamen 1, ¿cuánto necesito en el 2 para aprobar?» (la nota entra como dato de la frase y se guarda solo si dices «anótala»; por defecto solo calcula) y «¿cuánto necesito en el examen de cálculo?».
- «¿cómo voy en Cálculo?», «mi promedio», «¿cómo voy en mis ramos?» (una línea por ramo).
- «borra la nota del certamen 1 de cálculo» (con confirmación en la isla).
- Ramo por nombre o palabra clave (`emparejarRamo`); ambiguo o desconocido → pregunta, nunca adivina. Frases de control que NO deben calzar: «con 4,2 de cambio…», «pagué 4200 en el certamen», «me saqué una foto con 5 amigos», gastos en general.

**MCP:** `notas_resumen` (solo lectura, sin preguntar), `notas_necesaria` (cálculo puro, sin preguntar) y `notas_anotar` (escribe: pide permiso en la isla). Sin borrar (como los gastos). Tras cambiarlas hay que reiniciar los procesos MCP.

**Puente:** aviso `notas` (marca cada 2 s, como `ramos`), pedidos `notas-estado`, `evaluacion-guardar|borrar`, `notas-ajustes` y `notas-todas` (no depende de la función: «Lo que sé de ti»).

**Isla:** en la ficha de cada ramo de la pestaña Estudio, bloque «Notas»: filas de evaluaciones (nombre, peso, nota editable), barra de promedio con la línea de aprobación, y el texto «Necesitas un 5,4 en el Certamen 2 para aprobar» (verde/ámbar/rojo según se pueda). Formulario «+ Evaluación». Sin gráficos (van en B).

**Lo que sé de ti → Notas:** lista por ramo (incluidos archivados), borrar una evaluación, borrar las de un ramo y «Borrar todas» con segundo toque; a la Papelera no aplica (es una base, no archivos): se explica que se borran de verdad. Se ve y borra aunque la función esté apagada.

**Privacidad.** Las notas son dato personal sensible. Solo quedan en `asistente.db` (600), nunca en registros ni avisos de plan. La skill `delegar` prohíbe pasarlas (y el ramo, ya prohibido) a especialistas de planes gratuitos, con su prueba. El agente de Brote sí puede leerlas porque lo pide el usuario. No se guarda nada de lo que el usuario no dijo.

**Pruebas previstas:** `pruebas/notas.test.ts` (promedio, necesaria, imposible/ya aprobado, varias pendientes, examen con mínimo, escala configurable, redondeo, coma decimal), frases con controles, MCP, puente real de punta a punta, textos e isla (`src/agente/notas.ts`), vista previa `?pestana=estudio&abrir=1&notas=sin|con|imposible`.

**Fuera de A2:** gráfico de promedio por semestre (B), promedio general entre ramos / semestre (se anota para después), enlazar evaluaciones con fechas de Agenda y avisos «se acerca el certamen» (A4), Celebrar al aprobar (E).

**Decisiones que necesito de ti:**
1. **Examen y nota mínima**: ¿los incluyo en A2 (recomiendo sí, como opcionales por ramo) o solo promedio ponderado y el examen después?
2. **Escala y aprobación**: ¿1,0–7,0 y 4,0 por defecto con aprobación editable por ramo (recomiendo), o también otras escalas (0–100, 1–10)?
3. **Anotar con peso desconocido**: «me saqué 5,5 en el certamen 1» sin haber definido pesos: ¿pregunto el peso (recomiendo) o guardo la nota con peso «sin definir» y no calculo hasta que lo pongas?
4. **«Con 4,2 en el certamen 1, ¿cuánto necesito…?»**: ¿por defecto solo calcula sin guardar (recomiendo, evita notas falsas) o la guarda también?
5. **Borrar el ramo**: ¿borra sus evaluaciones (recomiendo, es lo que hace «olvidar») o las deja huérfanas?
6. **Promedio general del semestre** entre ramos: ¿entra ahora (una línea, «¿cómo voy en mis ramos?») o se deja para B?

## Lo que quedó hecho en A2 (5-10-2026)

- **Decisiones tomadas** (todas las recomendadas): examen y notas mínimas incluidos como opcionales por ramo; escala 1,0–7,0 con aprobación 4,0 editable por ramo; sin pesos definidos, Brote pregunta el peso y no guarda nada; «con 4,2 en el certamen 1, ¿cuánto necesito…?» solo calcula; borrar un ramo borra sus evaluaciones (un trigger de SQLite; archivar las conserva); el promedio de todos los ramos entra como «¿cómo voy en mis ramos?» (una línea por ramo; el promedio general del semestre queda para B).
- **Motor:** `notas-tipos.ts` (puro: `calcularRamo`, `notaNecesaria` —las otras pendientes se suponen con la misma nota; redondea hacia arriba, nunca se queda corta—, `notaNecesariaExamen` con nota mínima y presentación mínima; el examen cuenta como pendiente más en el cálculo), `notas.ts` (tablas `evaluaciones` y `notas_ramo`, `marca()`), `notas-ficha.ts` (la ficha lista para mostrar, la usan el puente y la ventana), `notas-frases.ts` y `notas-motor.ts` (frases). Plantillas `notas-*` al final de `PLANTILLAS_BASE`; función `estudio`.
- **Sin IA:** «evaluaciones de cálculo: certamen 1 30%, certamen 2 30%, examen 40%», «agrega la evaluación control 1 de 20% en cálculo», «me saqué 5,5 en el certamen 1 de cálculo» / «agrega una nota 5.5 en…», «con 4,2 en el certamen 1, ¿cuánto necesito en el 2 [de cálculo] para aprobar?», «¿cuánto necesito en el examen de cálculo?», «¿cómo voy en Cálculo?» / «¿cómo voy en mis ramos?», «borra la nota del certamen 1 de cálculo» (la deja pendiente, **sin** confirmación: el motor no puede preguntar; la evaluación sigue ahí), «la nota de aprobación de cálculo es 5», «el examen de cálculo vale 30%». Una nota fuera de 1,0–7,0, un ramo desconocido o una evaluación inexistente se dicen o van al agente; nunca se adivina. Hay 15 frases de control que no deben tocar ninguna nota.
- **MCP:** `notas_resumen` y `notas_necesaria` (sin preguntar) y `notas_anotar` (pide permiso). Sin borrar a propósito.
- **Puente:** aviso `notas` (marca cada 2 s, también lo que anota el MCP), las fichas viajan además dentro de `ramos-estado`; pedidos `notas-estado`, `notas-todas` (no dependen de la función), `evaluacion-guardar`, `evaluacion-borrar`, `notas-ajustes`, `notas-borrar` (`ramo: null` = todas). Escribir exige la función prendida; ver y borrar, no. Prueba de punta a punta con el puente real en carpeta temporal (`notas-puente.test.ts`).
- **Isla:** bloque «Notas» en la ficha de cada ramo de la pestaña Estudio (meta en verde/ámbar/rojo, barra 1,0–7,0 con la línea de aprobación, evaluaciones con la nota editable al tocarla, «necesitas X» en las pendientes, «+ Evaluación»); el promedio también va en la cabecera del ramo. **Lo que sé de ti → Notas:** por ramo (con archivados), Borrar una, «Borrar las de este ramo» y «Borrar todas las notas», todos con segundo toque; explica que no hay Papelera (es una base de datos). Vistas previas `?pestana=estudio&abrir=1&notas=sin|con|imposible` y `vista-previa-memoria.html`.
- **Privacidad:** la skill `delegar` prohíbe pasar notas y evaluaciones a planes gratuitos (con prueba). Solo en `asistente.db` (600); el puente no registra su contenido (solo «notas borradas (N)»).
- **No incluido:** editar el nombre o el peso de una evaluación en la isla (solo la nota; por frase o MCP sí se puede), ajustes de aprobación y examen en la isla (solo por frase o pedido al puente), fecha de la evaluación en Agenda (A4).

### Pruebas pendientes de A2 (para un Mac)

- [ ] Reiniciar los procesos MCP (`pkill -f packages/motor/src/mcp.ts` y el `claude … --resume`), abrir sesión nueva con el TUI y pedir «¿cómo voy en cálculo?» y «me saqué 5,5 en el certamen 1 de cálculo»: que use `notas_resumen` (sin preguntar) y `notas_anotar` (con permiso en la isla). `openclaw mcp probe gastos` debe listar las tres herramientas nuevas.
- [ ] En la isla real: definir evaluaciones por frase, tocar una nota, escribir 5,5 y Enter; que la barra y la meta cambien y que la ficha no se cierre sola al refrescar.
- [ ] «Lo que sé de ti → Notas»: borrar una evaluación, las de un ramo y todas con datos de prueba (nunca notas reales).
- [ ] Apagar la función `estudio`: las frases responden «Eso está apagado», la pestaña desaparece y las notas guardadas siguen visibles y borrables en «Lo que sé de ti».
- [ ] El aspecto del bloque Notas en el notch real (la ficha abierta es alta y hace scroll) y en el modo flotante.
- [ ] Frases reales con acentos y coma decimal escritas desde el teclado del Mac («me saqué un 5,5…»).

### Pendientes de A2 que quedaron abiertos (5-10-2026)

- **HECHO el 5-10-2026 (opciones 1 + 2):** «Notas» va arriba de «Próximas clases» y la cabecera del ramo, sin abrirlo, trae una píldora «promedio 4,2 · necesitas 4,0» con el color del semáforo (`.estudio-notas-chip`). Probado con las vistas previas `notas=sin|con|imposible`; falta verlo en el notch real.
- (Texto anterior) **Ramos y calculadora ya conviven en una sola vista** (el bloque «Notas» vive dentro de la ficha de cada ramo en «Tus ramos»; decisión del usuario: no hay pestaña aparte). Falta decidir CÓMO se ve, porque hoy «Notas» queda al final de la ficha y hay que abrir el ramo y hacer scroll. Opciones propuestas (recomendada: 1 y 2 juntas): (1) «Notas» arriba de «Próximas clases»; (2) la cabecera del ramo, sin abrirlo, con promedio y «necesitas X» en el color del semáforo; (3) dos pestañas dentro del ramo, «Resumen» y «Notas». Sin decidir ni programar.
- Editar en la isla el nombre y el peso de una evaluación y los ajustes del ramo (aprobación, examen): hoy solo por frase, MCP o pedido al puente. Decisión abierta.
- Promedio general del semestre entre ramos: para el bloque B (gráficos).

## Diseño de A3: Resumen y tarjetas de repaso (aprobado y HECHO el 5-10-2026, con las siete recomendaciones de abajo)

**Qué es.** Bajo pedido («hazme un resumen y tarjetas de la clase de ayer»), el agente de Brote lee una transcripción entera y deja una **propuesta pendiente**: resumen por temas, glosario y preguntas de práctica. El usuario decide en la isla qué se queda; lo aceptado se repasa con repetición espaciada. Mismo molde que `agenda_proponer` (fase 5 de grabar): la herramienta no agrega nada por sí sola y la confirmación es el toque en la isla.

**Quién lo hace (privacidad).** Solo el agente de Brote, con la cuenta Pro del usuario. Nunca un especialista ni un plan gratuito (la skill `delegar` ya prohíbe pasar transcripciones; se agrega una línea para resúmenes y tarjetas, con prueba). Solo bajo pedido: nada corre solo ni al terminar de transcribir. La skill `gastos` (o una nueva `estudio`) explica cuándo usar la herramienta; el texto de la herramienta no da órdenes sueltas (lección de la inyección).

**Herramienta MCP** `repaso_proponer` (función `estudio`; además exige `grabaciones` prendida para leer la transcripción; permitida sin preguntar porque solo deja pendientes, como `agenda_proponer`): `{ grabacion, ramo?, temas: [{ titulo, puntos: [≤ 5 de ≤ 160 letras] }], glosario: [{ termino, definicion ≤ 200 }], preguntas: [{ pregunta ≤ 200, respuesta ≤ 300 }] }`. Topes: 8 temas, 20 términos, 20 preguntas. Se valida en el motor (largos, sin repetidos, grabación existente, ramo por `emparejarRamo`; ambiguo = sin ramo, nunca adivina). La descripción pide frases propias y cortas, **no copiar párrafos de la clase**, y nada que no se haya dicho.

**Datos** (`asistente.db`, 600; puro en `packages/motor/src/repaso.ts`, tipos sin Node en `repaso-tipos.ts`):
- `repaso_propuestas`: la propuesta pendiente completa (JSON acotado) por grabación. Se borra al decidir, al borrar la transcripción o a los 14 días.
- `tarjetas`: `id`, `grabacion` (id, solo referencia), `ramo_id?`, `tipo` (`termino` | `pregunta`), `frente`, `reverso`, y el estado de repaso (`caja` 0–5, `proximo_ms`, `ultima_ms`, `aciertos`, `fallos`). El enlace al ramo va en la tabla `ramo_de` con tipo nuevo `tarjeta` (o `grabacion` para el kit entero), como en A1.
- `resumenes`: los temas aceptados (`grabacion`, `ramo_id?`, JSON de temas) para releerlos. La transcripción **no se toca** ni se copia.
- Lo único del texto de la clase que persiste es lo que el usuario aceptó, ya en palabras cortas del agente. Nada de la propuesta se registra en consola ni en avisos (el aviso dice solo «N cosas para revisar»).

**Repaso espaciado** (puro, sin IA, probado): cajas tipo Leitner con intervalos 1, 3, 7, 14, 30 días; «Sabía» sube una caja, «Casi» se queda, «No sabía» vuelve a la caja 1 (mañana). Sin horas del día: «vence hoy» = antes de las 23:59 locales. Cola del día ordenada por lo más atrasado y tope de 15 por sesión (configurable después).

**Isla** (pestaña Estudio, dentro del ramo y arriba si hay algo pendiente):
1. Tarjeta «Brote preparó un repaso de tu clase (N temas, M tarjetas)» con **revisar y aceptar**: temas con casilla, tarjetas con casilla (todas marcadas de partida), «Aceptar lo marcado» / «Descartar», y un selector de ramo si no se emparejó solo.
2. «Repasar (N)»: una tarjeta a la vez, tocar para ver el reverso, tres botones (No sabía / Casi / Sabía), progreso «3 de 12». Al terminar Brote celebra.
3. En la ficha del ramo: línea «Repaso: 7 tarjetas para hoy · 24 en total» y los temas aceptados plegados.
Aviso de Novedades (tipo nuevo `repaso`) una vez al día si hay tarjetas que vencen y la isla estuvo cerrada: «Tienes 7 tarjetas para repasar». Nunca abre la isla sola.

**Sin IA** (frases del motor, función `estudio`): «¿tengo tarjetas para repasar?», «repasemos [cálculo]» (abre la sesión; el motor devuelve `datos: { repaso: … }` y la isla decide, como con grabar), «¿cuántas tarjetas tengo?». Pedir el resumen **sí va al agente** (necesita IA): frases tipo «resume la clase de ayer» no calzan con plantillas.

**Puente:** aviso `repaso` (marca cada 2 s: el MCP es otro proceso), pedidos `repaso-estado`, `repaso-propuesta-decidir { grabacion, temas[], tarjetas[], ramo }`, `repaso-responder { tarjeta, resultado }`, `repaso-todo` y `repaso-borrar { que: tarjeta|grabacion|ramo|todo }` (ver y borrar no dependen de la función, como notas y grabaciones). Recuerda: en los pedidos `id` es de correlación, por eso `grabacion`.

**Lo que sé de ti → Repaso:** por ramo y por grabación, con tarjetas, temas y estado; borrar una tarjeta, las de una grabación, las de un ramo o «Borrar todo» con segundo toque; se dice que no hay Papelera (es una base). Borrar una transcripción borra sus propuestas pendientes; las tarjetas **aceptadas** se quedan (son del usuario) salvo que las borre. Borrar el ramo las deja «sin ramo».

**Fuera de A3 (para no mezclar):** exportar a Anki (D5, depende de esto), plan de estudio que use las fechas (A4), estadísticas de repaso y racha (A5), gráficos (B), generar tarjetas desde apuntes o PDF que no sean transcripciones, ajustar intervalos por tarjeta.

**Pruebas previstas:** `pruebas/repaso.test.ts` (validación y topes, repetidos, ramo ambiguo, cajas y fechas con cambio de hora, cola del día, borrados), MCP (`repaso_proponer` con y sin función, grabación inexistente, `grabaciones` apagada), puente real de punta a punta en carpeta temporal, textos de la isla (`src/agente/repaso.ts`), prueba de la skill `delegar`, vista previa `?pestana=estudio&repaso=sin|propuesta|hoy|nada`. Nunca con transcripciones reales; datos inventados.

**Decisiones que necesito de ti antes de programar:**
1. **Qué se guarda del resumen**: ¿guardo los temas aceptados para releerlos (recomiendo sí, son cortos) o solo las tarjetas?
2. **Aceptar**: ¿todo marcado de partida y desmarcas lo que no quieres (recomiendo), o aceptas de a una?
3. **Repaso espaciado**: ¿cajas Leitner 1-3-7-14-30 (recomiendo: simple, explicable, sin parámetros ocultos) o algo tipo SM-2 (más fino, más difícil de explicar)?
4. **Aviso diario** «tienes N tarjetas»: ¿sí, una vez al día solo con la isla cerrada (recomiendo), o nunca?
5. **Ramo de la propuesta**: ¿el agente lo sugiere y tú lo confirmas en el selector (recomiendo), o siempre lo eliges tú? (Falta el selector «Poner ramo» en transcripciones; aquí se resuelve dentro de la propuesta.)
6. **Función**: ¿cuelga de `estudio` y exige también `grabaciones` solo para proponer (recomiendo), o es una función nueva `repaso`?
7. **Tarjetas de preguntas**: ¿el agente las genera con respuesta y tú las corriges en la isla antes de aceptar (recomiendo editar el texto en la propuesta), o solo aceptas/descartas?

## Lo que quedó hecho en A3 (5-10-2026)

- **Decisiones tomadas** (las siete recomendadas): se guardan los temas aceptados además de las tarjetas; todo viene marcado de partida; cajas 1-3-7-14-30 días; aviso diario solo con la isla cerrada; el agente sugiere el ramo y el usuario lo confirma en un selector; cuelga de `estudio` (y `repaso_proponer` exige además `grabaciones`); las tarjetas de término y de pregunta se corrigen en la propuesta antes de aceptar.
- **Motor:** `repaso-tipos.ts` (puro, sin Node: `validarKit` deja fuera lo largo o repetido y dice por qué, nunca recorta; `validarDecision`; cajas de Leitner `siguienteEstado`, `colaDelDia` con tope 15, días en hora de pared; `armarEstadoRepaso`), `repaso.ts` (tablas `repaso_propuestas`, `tarjetas` y `resumenes`; un trigger suelta tarjetas y resúmenes «sin ramo» al borrar el ramo; aceptar dos veces no duplica; propuesta sin decidir se descarta a los 14 días; tope 2.000 tarjetas) y `repaso-frases.ts`. Sin IA: «¿tengo tarjetas para repasar?» (siempre con «de repaso» o «para repasar», así «tarjetas de crédito» no calza), «¿qué me toca repasar?», «repasemos [cálculo]», «quiero repasar», «hagamos un repaso». El motor devuelve `datos: { repaso: { ramoId } }` y la isla abre la sesión; un ramo que no calza va al agente.
- **MCP:** `repaso_proponer` (permitida sin preguntar: solo deja una propuesta pendiente; exige `estudio` y `grabaciones`, la transcripción tiene que existir, el ramo se empareja por nombre o palabra clave y si no calza falla en vez de adivinar). La skill `delegar` prohíbe pasar tarjetas, resúmenes, glosarios y preguntas de práctica a planes gratuitos (con prueba).
- **Puente:** aviso `repaso` (marca cada 2 s y al cambiar el día), pedidos `repaso-estado`, `repaso-todo` (no depende de la función), `repaso-propuesta-decidir`, `repaso-responder`, `repaso-borrar` (`tarjeta|grabacion|ramo|todo`; ver y borrar no dependen de la función). Borrar una transcripción borra su propuesta pendiente, no las tarjetas ya aceptadas. Nada del contenido se registra (solo «repaso aceptado (N tarjetas)»). Prueba de punta a punta con el puente real (`repaso-puente.test.ts`).
- **Isla:** `repaso-vista.ts` + `agente/repaso.ts` (con pruebas). En Estudio: tarjeta «Brote preparó un repaso de tu clase…» (Revisar → ramo, temas, términos y preguntas con casilla y «Editar», «Aceptar lo marcado (N)» / Descartar), tarjeta «Repaso» con «Repasar», sesión de una tarjeta a la vez (Mostrar respuesta → No sabía / Casi / Sabía), y en la ficha de cada ramo «Repaso: N para hoy · M en total» con sus temas plegados. La isla no se cierra sola en plena sesión ni con una propuesta abierta. Novedades tipo `repaso` (propuesta nueva y «Tienes N tarjetas para repasar» una vez al día, solo con la isla cerrada; no abre la isla). **Lo que sé de ti → Repaso:** por clase, borrar una tarjeta, lo de una clase, lo de un ramo o todo, con segundo toque. Vistas previas `?pestana=estudio&repaso=sin|propuesta|hoy|nada` y `vista-previa-memoria.html`.

### Pruebas pendientes de A3 (para un Mac)

- [ ] Reiniciar los procesos MCP (`pkill -f packages/motor/src/mcp.ts` y el `claude … --resume`), abrir sesión nueva con el TUI y pedir «hazme un resumen y tarjetas de la clase de ayer» con una grabación de prueba: que lea todas las partes con `transcripciones_leer`, llame a `repaso_proponer` (sin permiso) y que la propuesta aparezca en Estudio. `openclaw mcp probe gastos` debe listar la herramienta nueva. Ojo con la calidad: que NO copie párrafos de la clase.
- [ ] Aceptar con algunas casillas desmarcadas y un texto corregido; que el ramo sugerido se pueda cambiar.
- [ ] Repasar con tarjetas reales de prueba: las cajas y las fechas al día siguiente; que la sesión no se corte al cerrar la isla con el cursor.
- [ ] El aviso «Tienes N tarjetas» una sola vez por día y solo con la isla cerrada; que no abra la isla.
- [ ] Apagar `estudio`: las frases dicen «Eso está apagado», `repaso_proponer` informa, la pestaña desaparece y lo guardado se ve y se borra en «Lo que sé de ti → Repaso».
- [ ] Borrar una transcripción con una propuesta pendiente: la propuesta se va y las tarjetas aceptadas se quedan.
- [ ] El aspecto de la propuesta (lista larga con scroll) y de la sesión en el notch real y en el modo flotante.
- [ ] Frases reales: «repasemos cálculo», «¿tengo tarjetas para repasar?» desde el teclado del Mac.

**Sin hacer de A3:** exportar a Anki (D5), ajustar intervalos por tarjeta, tope de sesión configurable (hoy 15), «Poner ramo» a una propuesta ya aceptada, y el gráfico/racha de repaso (A5/B).

## Diseño de A4: Plan de estudio antes de una prueba (aprobado y HECHO el 5-10-2026, con las ocho recomendaciones de abajo)

**Qué es.** Dada una prueba con fecha («Certamen 2 de Cálculo, viernes 9 a las 15:00»), Brote reparte bloques de estudio en los días que faltan, esquivando lo que ya tienes en el calendario, y te lo muestra para que lo confirmes. Todo lo calcula el motor sin IA (determinista, probado); la IA no interviene salvo que el agente lo pida por MCP.

**De dónde sale la prueba.** La evaluación de A2 ya tiene un campo `fecha` (solo día) que nadie llena todavía. A4 le suma hora opcional y tres formas de ponerla: por frase («el certamen 2 de cálculo es el viernes 9 a las 15:00»), con un campo en el bloque «Notas» de la ficha del ramo, y como sugerencia cuando un evento del calendario o una propuesta de Agenda (fase 5 de grabar) calza con una evaluación pendiente del ramo (nunca se asigna sola). Sin fecha no hay plan.

**Cuánto estudiar** (puro, `packages/motor/src/plan-estudio.ts`, tipos sin Node): horas objetivo = 2 h base + 0,2 h por cada 1 % de peso de la evaluación, multiplicadas por la dificultad que ya calcula A2 (si la nota que necesitas es ≤ 4,5: ×1; ≤ 5,5: ×1,3; > 5,5: ×1,6; si «ya no alcanza» o «ya aprobaste», no se ofrece plan y se dice por qué), con tope de 12 h. Es un punto de partida editable: se muestra el total y el usuario puede subirlo o bajarlo antes de agendar. Si hay tarjetas de repaso del ramo (A3), los bloques de repaso lo mencionan («Repasar tarjetas de Cálculo: 7»).

**Dónde caen los bloques.** Ventanas de estudio por defecto: lunes a viernes 16:00–21:30, fin de semana 10:00–19:00; bloques de 50 min con 10 min de descanso, máximo 2 por día, ninguno en la hora previa a una clase o evento, el último termina 3 h antes de la prueba y nada después de las 22:00. Los días se reparten con más peso hacia la prueba (el estudio parejo no funciona: se estudia más cerca) y siempre hay un «Repaso final» el día anterior. Tres tipos: «Estudiar temas» (primeros bloques), «Practicar ejercicios» (los del medio) y «Repaso final». Si queda menos de un día, se arma uno o dos bloques y se avisa «te queda poco tiempo». Tope: 20 bloques por plan, 4 planes activos, horizonte de 30 días. Sin calendario conectado se asume libre y se avisa.

**Datos** (`asistente.db`, 600): tabla `planes_estudio` (`id`, `ramo_id`, `evaluacion_id`, `prueba_ms`, `horas`, `creado_ms`) y `bloques_estudio` (`id`, `plan_id`, `tipo`, `inicio_ms`, `fin_ms`, `estado` pendiente|hecho|saltado, `calendario` 0/1). Borrar un ramo borra sus planes (trigger, como las notas); archivar los conserva. Títulos genéricos: «Estudiar Cálculo», nunca el contenido de la clase.

**Dónde viven.** Los bloques viven en la Agenda de Brote (tipo nuevo `estudio`, con el punto de color del ramo y un check). «Agregar también a mi calendario» es una casilla aparte, apagada de partida y por plan: crea los eventos en el Calendario del Mac con `crearEventoMacAhora`. Limitación honesta: hoy no guardamos el id de lo creado en EventKit, así que borrar un plan borra los bloques de Brote pero **los eventos del calendario se borran a mano** (la isla lo dice antes de agendar).

**Isla.** En la ficha del ramo, cada evaluación con fecha muestra «en 5 días» y un botón «Planear estudio». Eso abre una propuesta (mismo molde de la propuesta de repaso): total de horas con − / +, lista de bloques por día y hora con casilla (todos marcados) y «Quitar», casilla «Agregar también a mi calendario», «Agendar». La Agenda muestra los bloques con su check. Cada bloque tiene «Empezar» que arranca un pomodoro con la etiqueta del ramo (así el pomodoro queda enlazado a su ramo, base de A5). Aviso de Novedades 10 min antes de cada bloque (no abre la isla); nada la noche anterior. Rehacer el plan es manual («Rehacer plan» recalcula lo que queda, conservando lo hecho); no se reprograma solo.

**Sin IA** (función `estudio`): «el certamen 2 de cálculo es el viernes 9 a las 15:00» (pone la fecha; pregunta si el ramo o la evaluación no calzan y nunca adivina), «plan de estudio para el certamen 2 de cálculo» / «organízame el estudio para el certamen 1», «¿qué tengo que estudiar hoy?» (los bloques de hoy). Frases de control que no deben calzar: «estudio para el certamen» sin ramo, «el viernes 9 pago el arriendo», gastos.

**MCP:** `estudio_plan` (solo lectura: calcula un plan y lo devuelve sin guardarlo; sirve para que el agente lo comente) y `estudio_hoy` (bloques de hoy, solo lectura). El agente no agenda: confirmar es un toque en la isla. Tras cambiar `mcp.ts` hay que reiniciar los procesos MCP.

**Puente:** aviso `plan-estudio` (marca cada 2 s), pedidos `plan-estudio-proponer { ramo, evaluacion, horas? }`, `plan-estudio-agendar { …, bloques[], calendario }`, `plan-estudio-bloque { bloque, estado }`, `plan-estudio-borrar` y `plan-estudio-todo` (no depende de la función: «Lo que sé de ti → Plan de estudio»); el aviso de 10 min antes sale del mismo vigilante del calendario.

**Privacidad.** Solo ramos, fechas y horas; nada de texto de clases. La skill `delegar` prohíbe pasar planes, fechas de pruebas y horarios de estudio a planes gratuitos (con prueba). Los eventos que vayan al calendario del Mac pueden sincronizarse con la nube del usuario: por eso la casilla es explícita.

**Fuera de A4:** estadísticas de horas realmente estudiadas (A5), gráficos (B), reprogramación automática, estudio con IA («explícame este tema»), compartir planes en grupo.

**Pruebas previstas:** `pruebas/plan-estudio.test.ts` (horas según peso y dificultad, ventanas y ocupados, cambio de hora, poco tiempo, prueba pasada, tope de bloques, bloque final siempre antes, determinismo), frases con controles, MCP, puente real de punta a punta en carpeta temporal, textos e isla (`src/agente/plan-estudio.ts`), vista previa `?pestana=estudio&abrir=1&plan=sin|propuesta|poco`.

**Decisiones que necesito de ti antes de programar:**
1. **Cómo se pone la fecha de una prueba**: ¿frase + campo en la isla + sugerencia desde el calendario (recomiendo las tres, la sugerencia sin asignar sola) o solo frase y campo?
2. **Dónde viven los bloques**: ¿Agenda de Brote y casilla opcional para el calendario, apagada de partida (recomiendo), o directo al calendario del Mac?
3. **Horario de estudio**: ¿lunes a viernes 16:00–21:30 y fin de semana 10:00–19:00, bloques de 50 min, 2 por día (recomiendo, editable en Configurar), o prefieres dar tú tus horas ahora?
4. **Cuánto estudiar**: ¿fórmula por peso y dificultad con − / + para ajustarla (recomiendo) o siempre preguntarte las horas?
5. **Empezar un bloque**: ¿botón «Empezar» que arranca un pomodoro del ramo (recomiendo, alimenta A5) o los bloques son solo informativos?
6. **Avisos**: ¿10 min antes de cada bloque sin abrir la isla y nada la noche anterior (recomiendo) o también un aviso el día anterior a la prueba?
7. **Reprogramar**: ¿manual con «Rehacer plan» (recomiendo) o automático al saltarte un bloque?
8. **Borrar un plan**: ¿te parece bien que no pueda borrar los eventos que ya creó en tu calendario (se hace a mano, y la isla lo avisa antes) o prefieres que A4 parta solo con Agenda de Brote, sin calendario, hasta guardar el id de EventKit?

## Lo que quedó hecho en A4 (5-10-2026)

- **Decisiones tomadas** (las ocho recomendadas): fecha por frase, campo en la isla y (ver «Sin hacer») sugerencia desde el calendario; los bloques viven en la Agenda de Brote con casilla opcional para el calendario (apagada de partida); horario 16:00–21:30 entre semana y 10:00–19:00 el fin de semana, bloques de 50 min, 2 por día; horas por fórmula con − / +; «Empezar» arranca un pomodoro del ramo; aviso 10 min antes y nada la noche anterior; «Rehacer plan» manual; los eventos ya creados en el calendario se borran a mano (la isla lo avisa).
- **Motor (sin IA, determinista):** `fechas.ts` (`leerDia`: «hoy», «mañana», «el viernes», «viernes 9», «el 14 de octubre», «14 de octubre de 2026», «el 14»; fechas pasadas o imposibles dan null y «viernes 10» no adivina si ningún viernes cae 10 en dos meses), `plan-estudio-tipos.ts` (puro, sin Node: `horasObjetivo` = (2 h + 0,2 h por 1 % de peso) × dificultad 1 / 1,3 / 1,6 según la nota que hace falta, de 1 a 12 h; `armarPlan` reparte con más peso hacia la prueba, nunca deja un día vacío mientras otro tiene dos, respeta ventanas, la hora previa a cada evento y las 22:00, termina 3 h antes de la prueba; `validarBloques`; `bloquesPorAvisar`), `plan-estudio-ficha.ts` (`proponerPlan`: usa la ficha de notas de A2; sin plan si la evaluación ya tiene nota, si ya apruebas el ramo o si ni con 7,0 alcanzas), `plan-estudio.ts` (tablas `planes_estudio` y `bloques_estudio`; un plan por evaluación; rehacerlo conserva los bloques hechos; triggers al borrar ramo o evaluación; tope 4 planes activos; se van solos 7 días después de la prueba), `plan-estudio-frases.ts` y `plan-estudio-motor.ts`. La evaluación (`fecha` de A2) ahora admite hora: «AAAA-MM-DD HH:MM» (sin hora se asume las 8:00).
- **Sin IA:** «el certamen 2 de cálculo es el viernes 9 a las 15:00» (también «será», «cae»; nunca adivina ramo ni evaluación: sin uno conocido va al agente), «plan de estudio para el certamen 2 de cálculo» (el motor NO agenda: devuelve `datos: { planEstudio }` y la isla arma la propuesta), «¿qué tengo que estudiar hoy?». Con controles que no deben calzar.
- **MCP:** `estudio_plan` (solo lectura: calcula sin guardar; mira el calendario a través de Brote y si no puede lo dice) y `estudio_hoy`. Agendar solo se hace con un toque en la isla.
- **Puente:** aviso `plan-estudio` (marca cada 2 s) y `plan-estudio-aviso` (10 min antes, sin abrir la isla), pedidos `plan-estudio-estado|todo|proponer|agendar|bloque|borrar` y `pomodoro-iniciar`; `agenda-estado` suma los bloques (tipo `estudio`, con check). Proponer esquiva el calendario (14 días) y los bloques de otros planes. Agendar con la casilla copia los bloques al Calendario del Mac (`crearEventoMacAhora`, uno por uno y de forma síncrona: con 20 bloques puede tardar unos segundos). Prueba de punta a punta con el puente real (`plan-estudio-puente.test.ts`).
- **Isla:** en cada evaluación sin nota de la ficha del ramo, «Prueba: en 6 días · 15:00» con «Cambiar fecha» (campo de fecha y hora) y «Planear estudio» / «Rehacer plan»; la propuesta (`plan-estudio-vista.ts`, `agente/plan-estudio.ts` con pruebas) con las horas − / +, los bloques con casilla, la casilla del calendario con su advertencia y «Agendar N bloques»; los planes agendados con check, «Empezar», «Saltar» y «Borrar plan» con segundo toque. La Agenda muestra los bloques (también visible con solo Estudio prendido). Novedades tipo `estudio`. **Lo que sé de ti → Plan de estudio** (por plan, por ramo y todo, con segundo toque; se ve y se borra aunque la función esté apagada). Vistas previas `?pestana=estudio&abrir=1&plan=sin|propuesta|poco|agendado` y `vista-previa-memoria.html`.
- **Privacidad:** la skill `delegar` prohíbe pasar planes de estudio, fechas de pruebas y horarios a planes gratuitos (con prueba). Los títulos de los bloques son genéricos («Estudiar Cálculo»). Nada del contenido va a registros.

**Dos detalles que conviene saber:** el «Repaso final» es el último espacio libre antes de la prueba, así que si la prueba es en la tarde puede caer esa misma mañana (y no necesariamente «el día anterior» como decía el diseño); y las tarjetas de repaso (A3) del ramo solo se mencionan en la propuesta, todavía no se enlazan a un bloque.

**Sin hacer de A4 (abierto, anotado para no perderlo):**
- **Editar el horario de estudio** en Configurar Brote (hoy fijo en `HORARIO_POR_DEFECTO` del motor).
- **Sugerir la fecha** cuando un evento del calendario o una propuesta de Agenda calza con una evaluación pendiente (el diseño la preveía; hoy la fecha se pone por frase o con el campo).
- Que el aviso previo de un bloque ofrezca «Empezar» directamente, y que el bloque «Repaso final» abra la sesión de tarjetas del ramo.
- Borrar los eventos del calendario que Brote creó (hace falta guardar el id de EventKit).

### Pruebas pendientes de A4 (para un Mac)

- [ ] Reiniciar Brote (el puente carga código nuevo solo al partir) y los procesos MCP (`pkill -f packages/motor/src/mcp.ts`), abrir sesión nueva con el TUI y pedir «explícame el plan de estudio del certamen 2 de cálculo»: que use `estudio_plan` (sin permiso), diga que no queda nada guardado y mencione el calendario.
- [ ] Con un ramo y evaluaciones de prueba (nunca notas reales): «el certamen 2 de cálculo es el viernes 9 a las 15:00», después «plan de estudio para el certamen 2 de cálculo»: que la propuesta se abra en la ficha, que − / + recalculen y que «Agendar» deje los bloques en la Agenda.
- [ ] Con la casilla «Agregar también a mi calendario» en `Brote.app` (no en `tauri dev`): que los eventos aparezcan en el Calendario del Mac con título genérico y que Brote avise que se borran a mano.
- [ ] Que los bloques esquiven de verdad tus clases del calendario real (una hora antes de cada evento).
- [ ] El aviso 10 minutos antes de un bloque: no abre la isla, sale en el ala izquierda y la próxima apertura lo lista.
- [ ] «Empezar»: que arranque el pomodoro con el nombre del ramo y quede enlazado a él.
- [ ] Marcar hechos, «Saltar», «Rehacer plan» (conserva lo hecho) y «Borrar plan» con segundo toque; borrar el ramo o la evaluación se lleva el plan.
- [ ] Apagar `estudio`: las frases dicen «Eso está apagado», la pestaña desaparece y el plan guardado se ve y se borra en «Lo que sé de ti → Plan de estudio».
- [ ] Un cambio de hora (primer fin de semana de abril/septiembre en Chile) con una prueba justo después.
- [ ] El aspecto de la propuesta (lista larga con scroll) y de la fecha en el notch real y en el modo flotante.

## Diseño de A5: Estadísticas de estudio (aprobado y HECHO el 5-10-2026, con las siete recomendaciones de abajo)

**Qué es.** Responder «¿cuánto he estudiado esta semana?», «¿de qué ramo?» y «¿llevo racha?» con datos reales, sin IA, en la pestaña Estudio, en las frases del motor y para el agente por MCP.

**Hallazgo que condiciona todo.** Hoy un pomodoro es **una sola fila** en `temporizadores` (`ciclos` cuenta los bloques completos, pero no guarda *cuándo* terminó cada uno) y el pomodoro nuevo cancela al anterior. Con eso se sabe cuánto duró una sesión, no en qué día: no alcanza para «horas por semana» ni para una racha. Además, los bloques de A4 se marcan «hecho» a mano y la mayoría de los estudiantes estudia **sin pomodoro**. Hace falta un registro propio.

**Datos** (`asistente.db`, 600; puro en `packages/motor/src/estadisticas-tipos.ts`, tabla en `estadisticas.ts`): tabla `estudio_registro` con `id`, `inicio_ms`, `fin_ms`, `ramo_id` (nulo = sin ramo), `fuente` (`pomodoro` | `bloque` | `manual`), `ref` (id del temporizador o del bloque; nulo si es manual) y una clave única (`fuente`, `ref`, `inicio_ms`) para que nunca se cuente dos veces. Un trigger deja los registros «sin ramo» al borrar el ramo (como en A1); archivarlo no cambia nada. Solo tiempos y ramos: nunca texto de clases.

**Qué cuenta como estudio** (todo se mide en minutos reales):
1. **Pomodoro:** cada bloque de estudio que termina deja su registro (inicio = fin − duración). Si cancelas a mitad (■ o al iniciar otro pomodoro), cuenta lo transcurrido **si pasó de 10 minutos**; menos que eso es un toque accidental y no cuenta. El descanso nunca cuenta.
2. **Bloque de A4 marcado «hecho»:** cuenta con el horario del bloque (no con la hora en que lo marcaste); al desmarcarlo se quita. Si hubo un pomodoro que se solapa con ese horario, el bloque **no se suma** (sería contar dos veces lo mismo).
3. **Anotado a mano:** «estudié 2 horas de cálculo» (también «ayer», «hoy», «1 hora y media»; tope 12 h por anotación y aviso si el día pasa de 16 h). Quedan como `manual`, a las 12:00 del día si no se dice hora.
No hay datos retroactivos: los pomodoros anteriores no tienen fecha, así que las estadísticas **parten de cero el día que se instale** (la isla lo dice).

**Cálculos puros** (`estadisticas-tipos.ts`, probados): minutos por día (un registro que cruza la medianoche se reparte entre los dos días), total de la semana (de lunes a domingo, hora de pared: respeta el cambio de hora) frente a la semana pasada **a la misma altura**, minutos por ramo con su porcentaje, y **racha**: días seguidos con **al menos 25 minutos** estudiados. Si hoy todavía no estudias, la racha de ayer sigue viva hasta que termine el día (no se pierde a las 8 de la mañana).

**Isla** (pestaña Estudio, arriba de la lista de ramos, solo cuando hay datos): una tarjeta «Esta semana» con el total grande («6 h 20 min»), la diferencia con la semana pasada, la racha («🔥 4 días»), siete barritas de lunes a domingo (hoy resaltado) y barras horizontales por ramo con su color (los 5 que más, el resto agrupado). Sin datos: una línea que invita a empezar un pomodoro o a decir «estudié 1 hora de cálculo». En la ficha de cada ramo: «Esta semana: 2 h 10 min · en total: 14 h». Un botón «+ Anotar horas» que escribe «estudié » en el campo, como «+ Evento» en la Agenda. Meses y semestres no entran (van en B, Gráficos).

**Sin IA** (función `estudio`, intenciones `estudio-horas` y `estudio-racha`): «¿cuánto he estudiado esta semana?» (con la ranura de periodo que ya existe: hoy, ayer, esta semana, la semana pasada, este mes), «¿cuánto estudié de cálculo?», «¿cuál es mi racha?» y «estudié 2 horas de cálculo [ayer]» (anotar). Nunca adivina el ramo; con frases de control («estudié para el certamen» sin tiempo, «pagué 2 horas de estacionamiento»). **MCP:** `estudio_estadisticas` (solo lectura, por periodo y ramo). Tras cambiarlo hay que reiniciar los procesos MCP.

**Puente:** aviso `estadisticas-estudio` (marca cada 2 s), pedidos `estadisticas-estado`, `estadisticas-anotar`, `estadisticas-todo` (no depende de la función: «Lo que sé de ti») y `estadisticas-borrar` (`todo | ramo | registro`). El registro de pomodoros lo hace `Temporizadores` mismo al terminar o cancelar, así cuentan también los que cancele el agente por MCP.

**Privacidad.** Cuánto y cuándo estudias es dato personal: queda solo en `asistente.db` (600), nunca en registros del puente; la skill `delegar` lo prohíbe para planes gratuitos (con prueba). «Lo que sé de ti → Estadísticas de estudio» muestra el total por ramo y deja borrar un ramo o todo, con segundo toque (borrado de verdad, no hay Papelera), aunque la función esté apagada.

**Fuera de A5:** gráficos por mes o semestre y tendencias largas (B), metas semanales de horas, celebraciones de racha y mensajes de ánimo (E), comparar con otros estudiantes (nunca), horas «recomendadas» por IA.

**Pruebas previstas:** `pruebas/estadisticas.test.ts` (minutos por día, medianoche, cambio de hora, semana a la misma altura, racha con ayer viva, dedupe bloque/pomodoro, cancelar ≥/< 10 min, tope de 12 h, borrar ramo), `Temporizadores` registrando al terminar y cancelar, frases con controles, MCP, puente real de punta a punta en carpeta temporal, textos e isla (`src/agente/estadisticas.ts`), vista previa `?pestana=estudio&estadisticas=sin|semana|racha`.

**Decisiones que necesito de ti antes de programar:**
1. **Qué cuenta como estudio:** ¿pomodoros (completos y cancelados con más de 10 min), bloques de A4 hechos sin duplicar y lo anotado a mano (recomiendo), o solo pomodoros?
2. **Racha:** ¿al menos 25 minutos por día, con la racha de ayer viva hasta que termine hoy (recomiendo), u otro mínimo?
3. **Anotar a mano por frase** («estudié 2 horas de cálculo»): ¿sí (recomiendo; la mayoría no usa pomodoro) o solo medir?
4. **Datos anteriores:** ¿partir de cero el día que se instale y decirlo (recomiendo), o intentar estimar con los pomodoros viejos (sin fechas, quedaría inventado)?
5. **Qué muestra la isla:** ¿tarjeta «Esta semana» con total, diferencia, racha, barras de 7 días y barras por ramo, más una línea en cada ficha (recomiendo)? Meses y semestres quedan para B.
6. **Metas y celebraciones de racha:** ¿dejarlas para el bloque E (recomiendo) o incluir una meta semanal ahora?
7. **Borrado y privacidad:** ¿«Lo que sé de ti → Estadísticas de estudio» con borrar por ramo y todo, y la regla en `delegar` (recomiendo)?

## Lo que quedó hecho en A5 (5-10-2026)

- **Decisiones tomadas** (las siete recomendadas): cuenta pomodoros completos y cancelados con más de 10 min, bloques de A4 hechos (sin duplicar) y lo anotado a mano; racha desde 25 min por día con ayer viva hasta que termine hoy; anotar por frase; sin datos retroactivos (parten el día que se instale); tarjeta «Esta semana» en Estudio y una línea en cada ficha; metas y celebraciones para el bloque E; borrado y regla en `delegar`.
- **Motor:** `estadisticas-tipos.ts` (puro, sin Node: `minutosEnRango`, `minutosPorDia` —un registro que cruza la medianoche se reparte—, `sinDuplicados` —un bloque hecho no se suma si un pomodoro se solapa—, `racha`, `resumirEstudio` —lunes a domingo en hora de pared, semana pasada a la misma altura, totales por ramo—, `formatearMinutos`), `estadisticas.ts` (tabla `estudio_registro` con clave única `fuente + ref + inicio`: nunca cuenta dos veces; un trigger deja el tiempo «sin ramo» al borrar el ramo; anotar a mano: hoy termina ahora y se mueve para que quepa en el día, otro día parte a las 12:00, tope 12 h y aviso si el día pasa de 16 h) y `estadisticas-frases.ts` / `estadisticas-motor.ts`. **`Temporizadores` registra él mismo** (así también cuentan los pomodoros que cancela el agente por MCP): al terminar un bloque de estudio (con su horario programado), al cancelar a mitad (solo si pasaron más de 10 min) y al empezar otro pomodoro encima; el descanso no cuenta. **`PlanesEstudio.marcar`** suma el horario del bloque al marcarlo «hecho» y lo quita al desmarcarlo o saltarlo.
- **Sin IA** (intenciones `estudio-horas`, `estudio-racha`, `estudio-anotar`): «¿cuánto he estudiado esta semana / hoy / ayer / este mes?», «¿cuánto estudié de cálculo?», «¿cuál es mi racha?» / «mi racha» y «estudié 2 horas de cálculo [ayer]» (también «hora y media», «45 minutos», sin ramo). Nunca adivina el ramo: uno desconocido se dice y no guarda; más de 12 h no se anota. Con frases de control. La semana de «esta semana» se compara con la pasada a la misma altura.
- **MCP:** `estudio_estadisticas` (solo lectura: periodo, ramo opcional, racha, semana día por día y por ramo). La skill `delegar` prohíbe pasar cuánto y cuándo estudia a planes gratuitos (con prueba).
- **Puente:** aviso `estadisticas-estudio` (marca cada 2 s y al cambiar el día; lo que suma el pomodoro, un bloque o el MCP aparece solo), pedidos `estadisticas-estado`, `estadisticas-todo` (no depende de la función) y `estadisticas-borrar` (`registro | ramo | todo`). Nada del contenido va a registros del puente. Prueba de punta a punta con el puente real (`estadisticas-puente.test.ts`).
- **Isla:** `estadisticas-vista.ts` + `agente/estadisticas.ts` (con pruebas): arriba de «Tus ramos», la tarjeta «Esta semana» con el total, la diferencia con la semana pasada, la racha 🔥, siete barras de lunes a domingo (hoy resaltado) y barras por ramo con su color (los 5 que más y «Otros»), «+ Anotar horas» (escribe «estudié » en el campo) y, sin datos, la explicación de que parten desde la instalación. En la ficha de cada ramo: «Esta semana: 2 h 10 min · en total: 14 h». **Lo que sé de ti → Estadísticas de estudio:** por ramo, «Borrar el tiempo de X», «Borrar el tiempo sin ramo» y «Borrar todo», con segundo toque (aunque la función esté apagada). Vistas previas `?pestana=estudio&estadisticas=sin|semana|racha` (finge que hoy es jueves para que la semana se vea armada) y `vista-previa-memoria.html`.
- **Cambió respecto del diseño:** el pedido `estadisticas-anotar` no existe; anotar horas se hace siempre por la frase (el botón «+ Anotar horas» la escribe), así hay una sola puerta con las mismas reglas.

**Sin hacer de A5 (anotado para no perderlo):** gráficos por mes o semestre y tendencias largas (B), metas semanales y celebraciones de racha (E), editar o borrar un solo registro desde la isla (hoy: por ramo o todo), y que el aviso de bloque muestre el tiempo de hoy.

### Pruebas pendientes de A5 (para un Mac)

- [ ] Reiniciar Brote y los procesos MCP (`pkill -f packages/motor/src/mcp.ts`), abrir sesión nueva con el TUI y preguntar «¿cuánto he estudiado esta semana?» al agente (cuando la frase no calce): que use `estudio_estadisticas` sin pedir permiso.
- [ ] Un pomodoro real hasta el final de un bloque (25 min): que aparezca en la tarjeta «Esta semana» sin recargar y con el ramo correcto («pomodoro de 25 para cálculo»).
- [ ] Cancelar un pomodoro con ■ a los 5 min (no cuenta) y a los 15 (cuenta 15), y empezar otro encima.
- [ ] Marcar un bloque del plan de estudio «hecho» y desmarcarlo; comprobar que no se duplica con un pomodoro del mismo horario.
- [ ] «Estudié 1 hora de cálculo», «estudié media hora ayer», un ramo inexistente y 20 horas: el motor responde y la tarjeta cambia.
- [ ] La racha entre dos días reales (estudiar 25 min hoy y mañana en la mañana ver que sigue viva) y a través de un cambio de hora.
- [ ] Apagar `estudio`: las frases dicen «Eso está apagado» y lo guardado se ve y se borra en «Lo que sé de ti → Estadísticas de estudio».
- [ ] El aspecto de la tarjeta en el notch real y en el modo flotante.

## Diseño de B: Gráficos (aprobado el 6-10-2026 con las ocho recomendaciones; B1 Plata, B2 Agenda y B3 Estudio HECHAS el 6-10-2026: el bloque B está completo)

**Qué es.** Que las tres pestañas con datos (Plata, Estudio, Agenda) muestren *tendencias* y no solo el momento actual. Todo con SVG y barras propios, armados solo con números (como `graficoSemana` de Plata); sin librerías de gráficos. **No hay tablas nuevas**: los datos ya existen (`gastos` con fecha, `estudio_registro`, eventos y entregas de Agenda). Lo que falta son cálculos puros que los agrupen.

**Lo que ya hay y condiciona el diseño.**
- El panel de la isla es la mitad derecha de 560 px (unos 330 px útiles): los gráficos tienen que leerse chicos. Nada de ejes con muchos números; etiquetas de una letra o dos y el valor solo en el elemento resaltado.
- **No existe el concepto de semestre** en ningún dato (los ramos no tienen periodo; archivar no guarda fecha). «Promedio de notas por semestre» exigiría inventarlo; ver decisión 4.
- Estudio solo tiene datos desde que se instaló A5 (sin retroactivos): los gráficos largos de estudio parten casi vacíos y lo dicen. Plata sí tiene historia (todos los gastos tienen fecha).

**Pieza común.** `packages/motor/src/graficos-tipos.ts` (puro, sin Node): escalas (`escalaLineal`), barras (`barras`, `barrasApiladas`) y línea (`linea`, con punto de proyección en trazo punteado) que devuelven *geometría en números* (x, y, ancho, alto, color), y `src/graficos.ts` en desktop que solo convierte esa geometría a SVG. Así todo lo difícil se prueba con `node --test` y la ventana no calcula nada. Accesibilidad: cada gráfico lleva `role="img"` y un `aria-label`/texto con el resumen en palabras («Gastaste $412.000 este mes; a este ritmo terminas en $560.000»).

**B1 · Plata (la más valiosa; pilar de plata).**
- **Tendencia de 6 meses:** barras mensuales (mes actual resaltado y marcado «parcial»), con una línea horizontal fina del presupuesto de hoy si existe (se avisa que es el de hoy, no el de cada mes). Toque en una barra = ese mes con su total y su categoría más grande.
- **Proyección «a este ritmo terminas el mes en X»:** gasto del mes ÷ días transcurridos × días del mes, **solo desde el día 5** (antes dice «aún es pronto»); si hay presupuesto, «te pasarías por $X» / «te sobrarían $X» con el semáforo de siempre. Un gasto único grande distorsiona: se calcula sobre el gasto *sin* el mayor gasto único del mes cuando este supera la mitad del total, y se muestra «sin contar tu gasto de $X en Y». Se dibuja como la barra del mes con su tramo proyectado punteado.
- **Sin IA:** «¿cómo voy este mes?» / «¿a qué ritmo gasto?» / «¿cuánto voy a gastar este mes?» (intención `plata-proyeccion`, antes que los gastos, con frases de control). **MCP:** `gastos_presupuesto` suma `proyeccion` al resultado (sigue de solo lectura y sin preguntar).
- **Puente:** `plata-estado` agrega `meses` (6) y `proyeccion`; sin pedido nuevo.

**B2 · Agenda (vista semanal; «que se note la semana de certámenes»).**
- Selector **Lista | Semana** arriba de la pestaña (recuerda la última en `localStorage`). La vista semanal es una grilla de 7 columnas (lun–dom, hoy resaltado) con una **franja por día** (no por hora: no cabe una grilla horaria en 330 px): puntos de color por cosa (evento azul, entrega ámbar/roja, recordatorio verde, bloque de estudio con el color del ramo, prueba con 📝) y el número de cosas. Tocar un día abre su lista debajo (la lista de siempre, filtrada).
- **Carga de la semana:** cada día recibe un nivel (0–3) según cuántas horas ocupa lo agendado + entregas y pruebas (las pruebas pesan doble); la semana con 2 o más pruebas/entregas fuertes se marca «Semana pesada 🔥» con las fechas. Puro en `packages/motor/src/agenda-carga.ts` (`cargaDeLaSemana`, probado, hora de pared). Navegación ‹ semana › (hasta 4 semanas hacia adelante y 1 hacia atrás; la ventana leída hoy es de 14 días, así que se ensancha a 35 solo cuando se abre la vista semanal).
- **Sin IA:** «¿cómo viene mi semana?» → «Jueves es el día pesado: certamen 2 de Cálculo y entrega de Física» (intención `agenda-semana`). **MCP:** `calendario_proximos`/`aula_entregas` no cambian; no hace falta herramienta nueva.
- **Puente:** `agenda-estado` acepta `dias` mayor (tope 35) y devuelve también las pruebas de `evaluaciones` con fecha.

**B3 · Estudio.**
- **Carga semanal de estudio:** las últimas 8 semanas como barras apiladas por ramo (color del ramo; semana actual resaltada), con el total de cada una al tocar. Debajo de la tarjeta «Esta semana» de A5, plegable («Ver 8 semanas»).
- **Por ramo:** en la ficha, una mini-línea (sparkline) de las últimas 8 semanas de ese ramo y la nota actual al lado.
- **Notas:** en vez del «promedio por semestre» (no hay semestre), una **comparación de ramos**: barras horizontales con el promedio actual de cada ramo activo contra la línea de la aprobación (4,0), en el color del semáforo de A2. Es lo que de verdad sirve para ver qué ramo está en riesgo.
- **Sin IA y MCP:** nada nuevo (`estudio_estadisticas` ya devuelve semana por día; se le agrega `semanas` de 8, solo lectura).
- **Puente:** `estadisticas-estado` agrega `semanas`; `ramos-estado` ya trae las fichas de notas.

**Orden recomendado (una sesión cada una):** B1 Plata → B2 Agenda → B3 Estudio. Plata tiene datos reales desde el primer día y es el otro pilar; Estudio es lo que más tarda en tener historia.

**Privacidad.** Nada sale de la isla ni se registra: los gráficos se arman en la ventana a partir de lo que el puente ya manda. La skill `delegar` ya prohíbe pasar gastos, notas, horas y agenda a planes gratuitos; las series nuevas son derivados de esos mismos datos, así que se agregan sus nombres a la prueba.

**Fuera de B:** exportar gráficos como imagen, comparar con otros estudiantes (nunca), metas y líneas objetivo de horas (E), gráficos de más de 6 meses o de años, categorías por mes apiladas (queda la categoría principal al tocar), vistas por hora en Agenda.

**Pruebas previstas:** `pruebas/graficos.test.ts` (escalas, barras, apiladas, línea con tramo proyectado, series vacías, un solo dato, valores enormes), `pruebas/plata-tendencia.test.ts` (6 meses con meses vacíos, mes parcial, proyección antes del día 5, con un gasto único dominante, febrero/bisiesto, cambio de hora), `pruebas/agenda-carga.test.ts` (niveles, semana pesada, cruce de medianoche, cambio de hora), `semanas` de estudio (8 semanas con huecos), frases con controles, puente real de punta a punta en carpeta temporal, textos e isla en `src/agente/` (con pruebas) y vistas previas `?pestana=plata&tendencia=sin|seis|proyeccion`, `?pestana=agenda&vista=semana&carga=pesada|ligera`, `?pestana=estudio&semanas=sin|ocho`. Capturas a 800×520 y a 560 de isla.

**Decisiones que necesito de ti antes de programar:**
1. **Alcance de esta sesión:** ¿solo B1 Plata (recomiendo, y B2 y B3 en sesiones aparte), B1 + B2, o los tres juntos?
2. **Plata, tendencia:** ¿6 meses de barras con la línea del presupuesto de hoy (recomiendo), o 12 meses (se ve apretado en 330 px)?
3. **Plata, proyección:** ¿simple desde el día 5, descontando un gasto único que sea más de la mitad del mes y diciéndolo (recomiendo), o el promedio simple siempre?
4. **Notas por semestre:** ¿reemplazarlo por la comparación de ramos activos contra la aprobación (recomiendo, no inventa un dato que no existe), o agregar un concepto de «semestre» a los ramos (más trabajo: migrar A1, A2 y la ficha)?
5. **Agenda semanal:** ¿franja por día con puntos y nivel de carga, tocar un día abre su lista (recomiendo), o intentar una grilla por hora (no cabe bien en la isla)?
6. **Semana de certámenes:** ¿«semana pesada» cuando hay 2 o más pruebas/entregas fuertes, con las pruebas pesando doble (recomiendo; el umbral se puede cambiar después), u otra regla?
7. **Estudio, 8 semanas:** ¿barras apiladas por ramo plegadas bajo «Esta semana», más una mini-línea en cada ficha (recomiendo), o solo la apilada?
8. **Frases sin IA nuevas:** ¿«¿cómo voy este mes?» y «¿cómo viene mi semana?» (recomiendo, con frases de control), o dejar los gráficos solo visuales por ahora?

## Lo que quedó hecho en B1 Plata (6-10-2026)

- **Decisiones tomadas** (las ocho recomendadas): esta sesión solo B1; 6 meses de barras con la línea del presupuesto de hoy; proyección simple desde el día 5 descontando un gasto único dominante; notas por semestre reemplazadas por la comparación de ramos (B3); Agenda semanal por franja de día (B2); «semana pesada» con 2 o más pruebas/entregas fuertes y las pruebas pesando doble (B2); 8 semanas apiladas más mini-línea por ramo (B3); frases sin IA nuevas.
- **Motor** (`packages/motor/src/plata.ts`, puro): `tendenciaMeses` (6 meses, el último parcial, con la categoría que más pesó cada mes), `proyectarMes` (gastado ÷ días que van × días del mes; antes del día 5 `estado: "pronto"`; si un gasto pasa de la mitad del mes se deja fuera del ritmo y se suma una vez; semáforo contra el presupuesto: verde hasta 90 %, ámbar hasta 100 %, rojo si se pasa) y `describirProyeccion`. `resumenPlata` suma `meses` y `proyeccion`; `DIAS_PLATA` sube de 100 a 190 para cubrir 6 meses. Sin tablas nuevas.
- **Sin IA** (intención `plata-proyeccion`, función `gastos`): «¿cómo voy este mes?», «cómo voy con la plata», «¿cuánto voy a gastar este mes?», «a qué ritmo gasto». Con controles: «¿cómo voy en cálculo?» (notas), «cómo voy con el presupuesto» (sigue siendo `presupuesto-queda`) y «cuánto gasté este mes» (consulta de gastos) no cambian. **MCP:** `gastos_presupuesto` suma `proyeccion` (con o sin presupuesto; antes del día 5 `disponible: false`). Tras cambiar `mcp.ts` hay que reiniciar los procesos MCP.
- **Puente:** sin pedidos nuevos: `plata` y `plata-estado` ya traen `meses` y `proyeccion`. Prueba de punta a punta en `plata-puente.test.ts`.
- **Isla:** tarjeta «Últimos 6 meses» en la pestaña Plata (`tarjetaTendencia` y `graficoMeses` en `panel.ts`; geometría y textos puros en `src/agente/plata.ts`: `barrasMeses`, `textoMes`, `textoProyeccion`, `resumenTendencia`, con pruebas). Barras tocables (el mes elegido dice su total y su categoría más grande; un segundo toque vuelve al mes en curso), mes en curso en verde con su tramo proyectado punteado (color del semáforo), línea punteada del presupuesto de hoy (solo entra a la escala si no pasa del doble de lo gastado: si no, se omite) y la línea «A este ritmo cierras el mes en $X · te pasarías por $Y · sin contar $Z en matrícula». `role="img"` con `aria-label` en palabras. Vista previa `?pestana=plata&tendencia=sin|seis|proyeccion` (los datos de ejemplo ahora cubren 6 meses).
- **Cambió respecto del diseño:** la geometría de las barras vive en `src/agente/plata.ts` (como `barrasSemana`) y no en un `graficos-tipos.ts` del motor: con un solo gráfico no justifica un módulo aparte; se crea cuando B2 y B3 necesiten compartir escalas. Las pruebas están en `pruebas/plata-tendencia.test.ts` (motor) y `pruebas/plata.test.ts` (desktop). La skill `delegar` ya prohíbe pasar «cualquier cifra de su plata», así que cubre las series nuevas sin cambios.

### Pruebas pendientes de B1 (para un Mac)

- [ ] Con gastos reales de varios meses (o anotados de prueba con fechas antiguas en una base aparte): que las 6 barras y la categoría de cada mes calcen con lo que esperas.
- [ ] Tocar una barra y tocarla otra vez; que la isla no se cierre sola ni la selección se pierda cuando llega un aviso `plata` (al anotar un gasto).
- [ ] Antes del día 5 del mes: «Aún es pronto para proyectar» y sin tramo punteado; el 5, que aparezca.
- [ ] Una matrícula o un arriendo grande: que diga «sin contar…» y que la cifra tenga sentido.
- [ ] Reiniciar los procesos MCP, sesión nueva con el TUI y preguntar «¿cuánto voy a gastar este mes?» al agente (si la frase no calza): que `gastos_presupuesto` traiga `proyeccion`.
- [ ] Frases reales desde el teclado del Mac: «¿cómo voy este mes?», «a qué ritmo gasto».
- [ ] El aspecto de la tarjeta en el notch real y en el modo flotante (el gráfico mide 280 de ancho y se estira al panel).
- [ ] Con presupuesto muy grande o muy chico frente a lo gastado: la línea aparece o se omite sin aplastar las barras.

## Lo que quedó hecho en B2 Agenda semanal (6-10-2026)

- **Decisiones tomadas** (las recomendadas: franja por día con puntos y nivel de carga, tocar un día abre su lista, «semana pesada» con las pruebas pesando doble, frase «¿cómo viene mi semana?»).
- **Motor** (`packages/motor/src/agenda-carga.ts`, puro): `cargaDeLaSemana` (siete días desde un lunes o desde hoy: nivel 0–3 por «puntos de carga» —horas de eventos y bloques, 1,5 por entrega, 3 por prueba, 0,5 por tarea; lo hecho no pesa; lo que cruza la medianoche se reparte—, puntos por cosa y las pruebas/entregas de cada día), `describirSemana` y `lunesDe`. **Regla de «pesado»:** puntaje = 2 × pruebas + entregas; un día o una semana con puntaje ≥ 3 (`UMBRAL_PESADO`) es pesado: una prueba y una entrega, dos pruebas o tres entregas (dos entregas solas no). Se cambia en una constante. `armarAgenda` suma el tipo `prueba` (evaluaciones con fecha y sin nota de ramos activos; sin hora salen «todo el día»; solo con Estudio prendido). `DIAS_VENTANA` pasa de 14 a 35 (lo que se lee del calendario, las tareas y los bloques); la lista también muestra 35 (`DIAS_LISTA`; primero quedó en 14 y el usuario pidió igualarla).
- **Sin IA** (intención `agenda-semana`, proveedor `agenda` del `Motor`): «¿cómo viene mi semana?», «como se ve la semana», «¿viene pesada la semana?», «mi semana viene pesada/complicada». Mira los próximos 7 días desde hoy (no lunes a domingo). Disponible con cualquiera de las fuentes de la Agenda prendida (`FUNCIONES_DE_AGENDA`: calendario, aula, temporizadores, estudio, grabaciones); sin ninguna dice que está apagado. Sin MCP nuevo: `calendario_proximos` y `aula_entregas` no cambian.
- **Puente:** `estadoAgenda` se parte en `agendaDeAhora` (sin leer de nuevo) y la lectura; `agenda-estado` ya trae 35 días y las pruebas. Prueba de punta a punta en `agenda-puente.test.ts`.
- **Isla:** selector Lista | Semana en la cabecera de Agenda (se recuerda en `localStorage` `brote.agenda-vista`), ‹ › para navegar, grilla de 7 columnas con nivel de carga (azul más fuerte = más carga), puntos por tipo (prueba violeta, entrega ámbar, evento azul, tarea/recordatorio verde, estudio blanco; lo fuerte con aro), borde ámbar en el día pesado y la línea «🔥 Semana pesada: 2 pruebas y 3 entregas». Tocar un día abre su lista debajo. Las pruebas salen también en la lista con 📝. Lógica y textos puros en `src/agente/agenda.ts` (con pruebas), vista en `semanaDeAgenda` de `panel.ts`. Vista previa `?pestana=agenda&vista=semana&carga=pesada|ligera`.
- **Cambió respecto del diseño:** (1) no hay navegación hacia atrás: la agenda solo lee desde hoy, así que los días ya pasados de esta semana salen apagados y sin tocar; se puede ir hasta 3 semanas adelante (`SEMANAS_ADELANTE`). (2) La ventana se ensanchó a 35 días siempre, no solo al abrir la vista semanal (más simple: la lectura es chica). (3) `agenda-estado` no recibe `dias`. (4) No hay herramienta MCP ni pedido nuevo.

### Pruebas pendientes de B2 (para un Mac)

- [ ] Con el calendario real (EventKit o iCal) y 35 días de ventana: que la lectura siga siendo rápida y las clases repetidas de las 5 semanas aparezcan bien (incluso a través de un cambio de hora).
- [ ] Un ramo con una evaluación con fecha (A4): que salga como 📝 en la lista y como punto violeta en la semana, y que desaparezca al ponerle nota o archivar el ramo.
- [ ] La semana de certámenes real: que «Semana pesada» salga cuando corresponde y que el umbral (≥ 3 puntos) te parezca bien; si no, cambiarlo en `UMBRAL_PESADO`.
- [ ] Alternar Lista/Semana, navegar ‹ ›, tocar días; que la isla no se cierre sola ni la selección se pierda cuando llega un aviso (calendario, aula, recordatorio).
- [ ] «¿Cómo viene mi semana?» desde el teclado del Mac, con y sin calendario conectado.
- [ ] El aspecto de la grilla en el notch real y en el modo flotante (columnas de unos 44 px) y con 5 pestañas en la fila del notch.
- [ ] Reiniciar Brote (el puente carga código nuevo solo al partir).

## Lo que quedó hecho en B3 Estudio (6-10-2026)

- **Decisiones tomadas** (las recomendadas): 8 semanas apiladas por ramo plegadas bajo «Esta semana», mini-línea en cada ficha y, en vez del «promedio por semestre» (no existe el semestre), la comparación de ramos contra la aprobación.
- **Motor** (`estadisticas-tipos.ts`, puro): `semanasDeEstudio` (8 semanas de lunes a domingo, de la más vieja a la actual, con los minutos por ramo; sin duplicados bloque/pomodoro; lo que cruza el domingo se reparte; sale dentro de `resumirEstudio` como `semanas`) y `serieDeRamo`. Sin tablas ni pedidos nuevos: viaja en el aviso `estadisticas-estudio` y en `estadisticas-estado`. **MCP:** `estudio_estadisticas` suma `ultimasSemanas` (lunes, minutos y ramos por nombre). Tras cambiar `mcp.ts` hay que reiniciar los procesos MCP.
- **Isla:** (1) «Ver 8 semanas» bajo las barras por ramo de «Esta semana»: columnas apiladas con el color de cada ramo (la actual con borde punteado), título al pasar el cursor («5–11 oct (esta semana, va a medias): 3 h · Cálculo 2 h, Física 1 h»), y «Promedio: 3 h 6 min por semana» contando solo semanas completas desde que hay datos. (2) Mini-línea de 8 semanas a la derecha de «Esta semana: … · en total: …» en la ficha de cada ramo. (3) Tarjeta «Notas por ramo» (`comparacion-notas-vista.ts`): barras 1,0–7,0 con el color del semáforo de A2 y una raya en la nota de aprobación de cada ramo, el ramo en más riesgo primero; solo ramos con alguna nota rendida. Reglas puras en `agente/estadisticas.ts` (`columnasSemanas`, `promedioSemanal`, `lineaMini`) y `agente/notas.ts` (`barrasDeNotas`), con pruebas. Vista previa `?pestana=estudio&estadisticas=semana&historia=ocho&notas=con|imposible|sin` (`&abrir=1` abre la ficha).
- **Pedido del usuario después de verlo (6-10-2026):** las 7 barras diarias de «Esta semana» (de A5) dejan de ser moradas y pasan a ser pilas con los colores de los ramos (`minutosPorDiaYRamo` → `ResumenEstudio.porDiaRamo`, `columnasDias`): la altura sigue al día más estudiado y cada color ocupa lo estudiado de ese ramo; el título de cada barra dice los ramos del día. Un puente más viejo sin el desglose da barras lisas.
- **Cambió respecto del diseño:** no puse «la nota actual al lado» de la mini-línea: la ficha ya la muestra en la píldora «promedio 4,2 · necesitas 4,0» de su cabecera, y repetirla apretaba la fila. La comparación quedó sin toque (no abre la ficha del ramo).

### Pruebas pendientes de B3 (para un Mac)

- [ ] Con un par de semanas de estudio reales (o de prueba): que «Ver 8 semanas» muestre las semanas correctas y que el desplegable no se cierre cuando llega un aviso (un pomodoro que termina).
- [ ] Un pomodoro o un «estudié 1 hora de cálculo» que cae un domingo tarde o un lunes temprano: que cuente en la semana correcta; y un registro que cruza la medianoche del domingo.
- [ ] La mini-línea en las fichas de varios ramos (uno sin estudio no debe mostrar nada) y el «Promedio» al cumplir su primera semana completa.
- [ ] «Notas por ramo» con ramos reales de prueba (no tus notas): el orden por riesgo, el color y la raya de aprobación cuando el ramo tiene una aprobación distinta de 4,0.
- [ ] El aspecto en el notch real y en el modo flotante (8 columnas de ~30 px).
- [ ] Reiniciar los procesos MCP, sesión nueva con el TUI y preguntar «¿cómo ha ido mi estudio las últimas semanas?»: que use `estudio_estadisticas` y traiga `ultimasSemanas`.

## Diseño de E: Cosas chicas de mucho valor (aprobado el 6-10-2026 con las nueve recomendaciones; E1, E2, E3 y E4 HECHAS el 6-10-2026; metas de ahorro y gastos compartidos quedan afuera)

**Qué es.** Cuatro piezas chicas que usan lo que ya existe (sin tablas pesadas, sin IA, sin conectores nuevos): que Brote no te interrumpa mientras estudias, que te resuma el día, que te ponga una meta de estudio y celebre tus rachas, y que celebre lo que de verdad cuesta. Las dos restantes del bloque (metas de ahorro y gastos compartidos) se dejan para después; ver «Fuera de E».

**Lo que ya hay y condiciona el diseño.**
- `Novedades` (`src/agente/novedades.ts`) ya decide qué aviso va al ala izquierda, deja un punto en la pestaña y lo guarda 10 minutos en la lista; solo las decisiones (permisos, «¿Aprendo esto?») abren la isla y no pasan por ahí. El modo concentración se cuelga de ese único punto.
- El pomodoro ya sabe cuándo estás en un bloque de estudio y cuándo en descanso (`temporizadores.ts`); la isla ya recibe el aviso `temporizadores`.
- Brote ya «celebra» (estado del personaje) al terminar un temporizador, al enchufar el computador y al terminar un especialista. Falta enganchar lo escolar.
- Las estadísticas de A5 ya calculan la racha y el total de la semana: la meta y las celebraciones solo agregan un número y avisos «una vez».
- Todo lo del día ya se puede pedir: `armarAgenda` (clases, entregas, pruebas, bloques), el presupuesto de hoy, las tarjetas de repaso que vencen. Falta juntarlo en una frase.

**E1 · Modo concentración.**
- Mientras corre un bloque de estudio de un pomodoro, Brote **no muestra en el ala ni notifica al sistema** los avisos que no importan: descargas, plata, computador, equipo, Claude Code terminó, uso del plan, transcripción lista, repaso. Siguen quedando en la lista de «Novedades» y con su punto (nada se pierde); al empezar el descanso aparece una sola línea «Mientras estudiabas llegaron 3 avisos».
- **Pasan igual:** el aviso del propio temporizador, la clase que empieza en 10 minutos, una entrega a 2 horas y el aviso de un bloque del plan de estudio. **Las decisiones** (permisos de Brote o de Claude Code, «¿Aprendo esto?») **siguen abriendo la isla**: no pasan por `Novedades` y dejar a un agente esperando 25 minutos es peor que una interrupción.
- Interruptor en Configurar Brote → Funciones («Modo concentración», encendido de fábrica, guardado en `localStorage` como el de las notificaciones del sistema). Solo la ventana lo decide: ni el puente ni el motor cambian. Lógica pura en `Novedades` (`silenciadasEnConcentracion`, con pruebas) y `src/agente/concentracion.ts`.

**E2 · Resumen de la mañana.**
- Sin IA: «dame el resumen del día», «resumen de hoy», «buenos días», «¿cómo viene mi día?». Una frase armada con lo que existe: «Hoy tienes 2 clases (la primera a las 8:30), 1 entrega que vence a las 23:59 y un certamen de Cálculo en 3 días. Tienes 4 tarjetas para repasar y puedes gastar $6.500; llevas $84.000 de tu presupuesto». Solo dice lo que está prendido y lo que existe (sin ceros ni líneas vacías); sin nada, «Hoy no veo nada agendado 🌱».
- **Automático (una vez al día):** la primera vez que abres la isla entre las 6 y las 12, llega como una novedad «☀️ Buenos días: …» (no abre la isla; el recordatorio de que ya se mostró va en `localStorage` como el de las tarjetas de repaso). Interruptor en Configurar → Funciones («Resumen de la mañana», encendido de fábrica). Pura en `packages/motor/src/resumen-dia.ts` (`armarResumenDelDia`, con pruebas) y el motor la usa para la frase; la ventana pide el mismo texto al puente por `resumen-dia` para el automático.
- **MCP:** ninguno (el agente ya tiene las herramientas de calendario, aula, plata y estudio).

**E3 · Metas de estudio y celebraciones de racha** (lo que quedó anotado en A5).
- **Meta semanal de horas**, una sola para todo (no por ramo): «mi meta es estudiar 10 horas a la semana», «quita mi meta de estudio», «¿cómo voy con mi meta?». Se guarda en la tabla `ajustes` (como el presupuesto). En «Esta semana» aparece «6 h 20 min de 10 h» con una barra fina; **nada de reproches**: si no llegas, la barra solo está a medias. Al cumplirla, Brote celebra y deja una novedad, una vez por semana.
- **Racha:** celebración (novedad + Brote celebra) al llegar a 3, 7, 14 y 30 días seguidos, una vez por racha y por hito (`avisos-estudio` en `ajustes`). Sin mensajes cuando se pierde.
- Sin IA: intenciones `estudio-meta` (poner, quitar, cómo voy; prefijo `estudio-` por la trampa de `plan-*`). MCP: `estudio_estadisticas` suma `metaSemanalMin`. Puente: aviso `estadisticas-estudio` ya existente trae la meta; aviso `estudio-celebracion`. Pura en `estadisticas-tipos.ts` (`progresoDeMeta`, `hitoDeRacha`).

**E4 · Más personalidad (celebrar lo escolar).**
- Brote celebra, con una línea corta en su estilo (chileno, motivador, breve), cuando: marcas una tarea o un bloque de estudio como hecho, rindes una nota y quedas con el ramo **aprobado** («¡Aprobaste Cálculo! 🎉»), o cumples la meta o un hito de racha (E3). Una celebración por evento, nunca repetida.
- **No** se celebra «entregaste algo» a partir de que una entrega desaparece del aula: puede desaparecer porque venció, no porque la entregaste (falso positivo y mala sensación). Solo cuenta lo que tú marcas.
- Textos puros en `src/agente/celebraciones.ts` (con pruebas); el personaje usa el estado de celebración que ya existe.

**Fuera de E (decisiones aparte).**
- **Metas de ahorro** (HECHAS el 6-10-2026, ver «Diseño de metas de ahorro»; antes: «quiero juntar 150 lucas para marzo»): merecía su propio diseño (de dónde sale el ahorro si Brote solo ve gastos, no ingresos; cómo se une al presupuesto y a los gastos hormiga). Recomiendo hacerla en la siguiente sesión.
- **Gastos compartidos** («le debo 5 lucas a Juan»): guarda nombres de terceros. Recomiendo no hacerla ahora; si se hace, solo en el computador, el nombre tal como lo escribes, nunca a planes gratuitos (regla de `delegar`) y con borrado desde «Lo que sé de ti».

**Privacidad.** Nada sale del computador ni va a registros. La meta de estudio y las rachas son datos de estudio (ya cubiertos por la regla de `delegar` para planes gratuitos; se agrega «meta de estudio» a su lista y a su prueba). El resumen del día junta datos de varias áreas: solo se muestra en la isla y lo calcula Brote sin IA.

**Pruebas previstas:** `pruebas/resumen-dia.test.ts` (armado con cada fuente presente y ausente, sin ceros, hora de pared, un día sin nada), `pruebas/estadisticas-meta.test.ts` (progreso, hitos 3/7/14/30 una sola vez, semana nueva), frases con controles («buenos días» a secas, «mi meta es 10 horas» sin «estudiar», «quiero ahorrar» no se confunde), `concentracion.test.ts` (qué pasa y qué se silencia, el resumen de «llegaron N avisos»), celebraciones, puente real de punta a punta en carpeta temporal y vistas previas `?concentracion=1`, `?pestana=estudio&meta=sin|media|cumplida`, `?resumen=1`.

**Decisiones que necesito de ti antes de programar:**
1. **Alcance de esta sesión:** ¿E1 + E2 + E3 + E4 juntas (recomiendo: son chicas y se apoyan entre sí), o solo algunas?
2. **Concentración, qué pasa:** ¿pasan la clase en 10 min, una entrega a 2 h, el bloque del plan y el propio temporizador, y el resto se silencia con el resumen «llegaron N avisos» al descanso (recomiendo), o se silencia todo salvo el temporizador?
3. **Concentración y decisiones:** ¿los permisos y «¿Aprendo esto?» siguen abriendo la isla (recomiendo), o también esperan al descanso?
4. **Concentración, de fábrica:** ¿encendido con interruptor en Configurar (recomiendo) o apagado hasta que lo prendas?
5. **Resumen de la mañana:** ¿por pedido y además una novedad automática una vez al día entre las 6 y las 12 (recomiendo), o solo por pedido?
6. **Meta de estudio:** ¿una meta semanal global en horas, con barra suave y sin reproches (recomiendo), o por ramo?
7. **Racha:** ¿celebrar a los 3, 7, 14 y 30 días, una vez por racha (recomiendo)? ¿Otros hitos?
8. **Celebrar lo escolar:** ¿solo lo que tú marcas (tarea o bloque hecho, ramo aprobado, meta, racha) (recomiendo), o también cuando una entrega del aula desaparece?
9. **Lo que queda afuera:** ¿metas de ahorro en la sesión siguiente y gastos compartidos pospuestos (recomiendo), o prefieres cambiar el orden?

## Lo que quedó hecho en E (6-10-2026)

- **Decisiones tomadas** (las nueve recomendadas): E1 a E4 juntas; en concentración pasan el temporizador, la clase, la entrega, el bloque del plan (y las celebraciones) y el resto se calla con un resumen al descanso; las decisiones (permisos, «¿Aprendo esto?») siguen abriendo la isla; concentración y resumen de la mañana encendidos de fábrica con interruptor; una sola meta semanal global; hitos de racha 3/7/14/30; solo se celebra lo que el usuario marca; metas de ahorro en la sesión siguiente y gastos compartidos pospuestos.
- **E1 Modo concentración** (`src/agente/concentracion.ts`, puro, con pruebas): `SeguidorDeConcentracion` mira si hay un pomodoro en su bloque de estudio (el descanso no cuenta) y cuenta lo que calla; `Novedades.agregar(…, silenciada)` deja el aviso en la lista y con punto pero no en el ala, y `avisar` de `main.ts` tampoco manda la notificación del sistema ni mueve a Brote (aviso del computador). Al empezar el descanso (o al apagar el interruptor) sale una sola novedad «Mientras estudiabas llegaron 3 avisos: 2 de Claude Code y 1 de plata. Los dejé en Novedades.». Interruptor en Configurar Brote → Funciones → «Concentración y resumen» (`localStorage` `brote.modo-concentracion`, `src/agente/preferencias.ts`). Ni el puente ni el motor cambian.
- **E2 Resumen de la mañana** (`packages/motor/src/resumen-dia.ts`, puro): `armarResumenDelDia` junta eventos de hoy (lo que ya pasó no cuenta), todo el día, entregas de hoy y mañana, la próxima prueba de los próximos 7 días, tareas y bloques de estudio de hoy, tarjetas de repaso que vencen y la plata (puedes gastar hoy / llevas X de Y; sin presupuesto, lo gastado del mes). Solo dice lo que existe; sin nada, «Hoy no veo nada agendado 🌱». `Motor.resumenDelDia()` respeta las funciones prendidas. Sin IA: «dame el resumen del día», «resumen de hoy», «mi resumen de la mañana», «¿cómo viene mi día?», «buenos días» y «buen día» (solo si es el saludo suelto: «buenos días, explícame…» va al agente). Pedido del puente `resumen-dia` → `{ texto, corto, hay }`. Automático: una novedad `☀️ Hoy: 2 eventos · 1 entrega · 4 tarjetas · $6.500 libres` una vez al día entre las 6 y las 12 (`src/agente/resumen-manana.ts`; `localStorage` `brote.resumen-mostrado`; interruptor `brote.resumen-manana`). Sin MCP.
- **E3 Meta semanal y racha** (`estadisticas-tipos.ts`, `estadisticas-metas.ts`, `estadisticas.ts`): una meta global en minutos (1 a 100 h) guardada en `ajustes` (`meta-estudio-min`); `ResumenEstudio.meta` trae el progreso. Sin IA (intenciones `estudio-meta-poner|quitar|como`): «mi meta es estudiar 10 horas a la semana», «mi meta de estudio es 8 horas», «mi meta semanal es 6 horas», «pon mi meta de estudio en 5 horas», «quita mi meta de estudio», «¿cómo voy con mi meta de estudio?»; siempre con «semana/semanal» o «de estudio» para no chocar con otras metas, y `leerDuracion` ahora acepta un tope propio (una meta puede pasar de las 12 h de un temporizador). Isla: bajo el total de «Esta semana», una barra fina «7 h 25 min de 10 h · meta semanal» (tocarla escribe la frase en el campo para cambiarla; sin meta, «Poner una meta semanal»); cumplida, «🎯 ¡Meta cumplida!» en verde. Celebraciones (`celebracionesDeEstudio`): la meta, una vez por semana; la racha a los 3, 7, 14 y 30 días, una vez por racha (si se corta y vuelves a partir, vuelven a contar); nada cuando se pierde. Lo ya celebrado en `ajustes` (`avisos-estudio`). MCP `estudio_estadisticas` suma `metaSemanal`.
- **E4 Celebrar lo escolar** (`packages/motor/src/celebraciones.ts`): aviso del puente `celebracion { motivo, texto }` (motivos meta, racha, tarea, bloque, aprobado) → novedad + saltito de Brote en la isla. Tarea o bloque marcados «hecho» (una vez por tarea/bloque y por sesión), ramo que pasa a «aprobado» (veredicto `aprobado` de A2: ya no hace falta nota; `ramos-aprobados` en `ajustes`; al partir lo que ya estaba aprobado se da por celebrado en silencio). Textos cortos para caber en el ala (≤ 38 letras, con prueba). Nunca se celebra algo que Brote dedujo (una entrega que desaparece del aula).
- **Privacidad:** la skill `delegar` ahora también prohíbe la meta semanal y el resumen del día a planes gratuitos (con prueba). En los registros del puente solo queda el motivo de cada celebración, nunca el texto.
- **Cambió respecto del diseño:** (1) el aviso de la **entrega** pasa entero en concentración (el aviso del aula no distingue 24 h de 2 h); las celebraciones también pasan. (2) El resumen de la mañana sale **la primera vez que la app está abierta entre las 6 y las 12** (a los 5 s de abrir y cada 10 min), no «al abrir la isla», porque no abre la isla; y el aviso del ala trae la versión corta, el texto completo se pide con «dame el resumen del día». (3) La celebración de una tarea o un bloque no se recuerda entre sesiones de Brote (marcar y desmarcar de nuevo después de reiniciar celebra otra vez). (4) Pruebas de punta a punta con el puente real para la meta, la racha y el ramo aprobado; la tarea y el bloque se probaron solo en la lógica pura (necesitan una grabación o un plan armados).

### Pruebas pendientes de E (para un Mac)

- [ ] Reiniciar Brote (el puente carga código nuevo solo al partir) y los procesos MCP (`pkill -f packages/motor/src/mcp.ts`).
- [ ] Empezar un pomodoro real y, durante el bloque, hacer que llegue un aviso de otro tipo (soltar una descarga, que Claude Code termine una tarea): que no salga en el ala ni como notificación, que quede en Novedades con su punto y que al empezar el descanso salga «Mientras estudiabas llegaron N avisos». Que sí suenen el aviso del temporizador y la clase en 10 minutos.
- [ ] Apagar el interruptor de concentración en Configurar a mitad de un bloque: que lo callado se resuma y de ahí en adelante suene todo.
- [ ] Un permiso de Claude Code durante el bloque: que siga abriendo la isla.
- [ ] «dame el resumen del día» con calendario, aula, un presupuesto y alguna tarjeta de repaso; y con todo apagado.
- [ ] El aviso automático por la mañana (entre 6 y 12, una sola vez; probar cambiando el día de `brote.resumen-mostrado` o esperando a mañana) y que con el interruptor apagado no salga.
- [ ] «mi meta es estudiar 10 horas a la semana»: ver la barra en «Esta semana», anotar horas hasta llegar y comprobar la celebración (una sola vez); cambiar la meta tocando la barra; «quita mi meta de estudio».
- [ ] Una racha real de 3 días (o anotar horas a mano en 3 días): que celebre al llegar a 3 y no antes.
- [ ] Marcar una tarea (de una grabación) y un bloque del plan como hechos: que Brote celebre; anotar la nota de un ramo hasta que quede «aprobado»: que celebre una vez, y que al reiniciar Brote no vuelva a festejar lo ya aprobado.
- [ ] El aspecto de la barra de meta y de los avisos de celebración en el notch real y en el modo flotante.

## Diseño de metas de ahorro (aprobado y HECHO el 6-10-2026, con las siete recomendaciones de abajo)

**Qué es.** «Quiero juntar 150 lucas para marzo»: Brote guarda la meta, te dice cuánto tendrías que apartar al mes y celebra el avance. Vive en la pestaña Plata (función `gastos`, sin función nueva), sin IA y con MCP de solo lectura.

**Hallazgo que condiciona todo.** Brote ve **gastos, no ingresos ni saldos**: no puede saber cuánto ahorraste. Tampoco mueve plata (nunca toca una cuenta). Por eso el ahorro es **declarado**: tú dices «aparté 20 lucas para el viaje» y Brote lo suma a la meta. Es una libreta, no un banco; la isla lo dice una vez («Brote anota lo que tú dices que apartaste»). Dos caminos descartados: deducir el ahorro como «presupuesto − gastado» (inventa un ahorro que quizá nunca apartaste) y leer cuentas del banco (fuera de alcance y de la regla de privacidad).

**Datos** (`asistente.db`, 600; puro en `packages/motor/src/ahorro-tipos.ts` sin Node, tablas en `ahorro.ts`): `metas_ahorro` (`id`, `nombre` corto, `monto` objetivo entero, `fecha_ms` límite o nulo, `creada_ms`, `estado` activa | cumplida | archivada) y `aportes_ahorro` (`id`, `meta_id`, `monto` entero, `ms`; un aporte negativo = retiro, «saqué 10 lucas del viaje»). Máximo 3 metas activas. Trigger: borrar una meta borra sus aportes. Archivar conserva todo.

**Cálculos puros** (con pruebas): `progresoDeMeta` (juntado, falta, % tope 100), `cuotaMensual` = falta ÷ meses que quedan (mínimo 1; meses contados por fecha, en hora de pared), `ritmoReal` (aportes de los últimos 60 días ÷ 2) y el semáforo: verde si el ritmo alcanza la cuota, ámbar si llega al 70 %, rojo si no (sin reproches en el texto: «a este ritmo llegarías en mayo»). `holguraDelMes` = presupuesto − proyección del mes (de B1), solo si hay presupuesto y la proyección existe: si la cuota cabe en la holgura, «cabe en tu presupuesto»; si no, «ojo: este mes tu presupuesto no deja holgura para esto». `ahorroPosible`: el gasto hormiga que ya detecta `descubrir`, convertido en «si lo dejaras a la mitad, juntarías $X al mes» (solo una sugerencia, nunca se aplica).

**Sin IA** (intenciones `ahorro-*`, dependen de la función `gastos` en `funcionDeIntencion`): «quiero juntar 150 lucas para marzo [para el viaje]» / «mi meta de ahorro es 300 mil para diciembre» (crear; sin fecha también vale), «aparté 20 lucas para el viaje» / «ahorré 20 lucas» (aportar; con varias metas y sin nombre, no adivina y pregunta), «saqué 10 lucas de la meta del viaje» (retirar), «¿cómo van mis metas de ahorro?», «¿cuánto me falta para el viaje?», «borra la meta del viaje». Siempre con «meta», «juntar», «apartar/aparté» o «ahorr-» para no chocar con presupuesto («mi presupuesto es…») ni gastos («aparté la mesa»). Frases de control: «quiero ahorrar» a secas va al agente; «ahorré tiempo»; «junté a mis amigos». Montos con `montos.ts` ya existente (lucas, mil); el mes de «para marzo» = último día del próximo marzo (nueva `leerMes` en `fechas.ts`; nunca adivina).

**MCP:** `ahorro_resumen` (solo lectura, sin preguntar). El agente **no** anota aportes: cada aporte lo confirma el usuario con su frase o con el botón de la isla (así Brote nunca inventa ahorro). Tras cambiar `mcp.ts` hay que reiniciar los procesos MCP.

**Puente:** aviso `ahorro` (marca cada 2 s, para ver lo que cambie otro proceso) y los datos dentro de `EstadoPlata` (`ahorro`); pedidos `ahorro-crear`, `ahorro-aportar`, `ahorro-archivar`, `ahorro-borrar` (monto entero 1.000–1.000.000.000, nombre ≤ 40 letras). Avisos con Novedades: hitos de 25, 50, 75 y 100 % de una meta, una vez cada uno (`avisos-ahorro` en `ajustes`) con la celebración de E4 (`celebracion` motivo `ahorro`); nada cuando te atrasas.

**Isla** (pestaña Plata, tarjeta «Metas de ahorro» bajo el presupuesto): por meta, nombre, barra fina con el color del semáforo, «$45.000 de $150.000 · te faltan 5 meses · $21.000 al mes», botón «+ Aporte» (escribe «aparté » en el campo, como «+ Evento») y la línea de holgura. Sin metas, una línea «Ponte una meta» que escribe «quiero juntar » en el campo. Textos en `src/agente/ahorro.ts` (con pruebas). «Lo que sé de ti → Metas de ahorro» lista y borra (de verdad, con segundo toque).

**Privacidad.** Cuánto ahorras y para qué es dato personal: solo en `asistente.db`, nunca en registros; la skill `delegar` lo prohíbe para planes gratuitos (se agrega «metas de ahorro» a su lista y a su prueba). Los nombres de las metas son texto libre del usuario: no se registran.

**Fuera de este bloque:** ingresos o sueldo, cuentas bancarias, intereses o inversión (nunca dar consejo financiero personalizado), metas compartidas, aportes automáticos, gastos compartidos (siguen pospuestos).

**Pruebas previstas:** `pruebas/ahorro.test.ts` (progreso, cuota con meses de distinto largo y cambio de hora, ritmo, semáforo, retiros, tope de 3 metas, hitos una sola vez, borrar meta), frases con controles, MCP, puente real de punta a punta en carpeta temporal, textos de la isla y vistas previas `?pestana=plata&ahorro=sin|una|varias|cumplida`.

**Decisiones que necesito de ti antes de programar:**
1. **Cómo se sabe el ahorro:** ¿aportes declarados por frase o botón (recomiendo), o intentar deducirlo del presupuesto (inventaría ahorro)?
2. **Dónde vive:** ¿dentro de Plata y de la función `gastos`, sin función nueva (recomiendo), o una función `ahorro` aparte con su interruptor?
3. **Cuántas metas:** ¿hasta 3 activas (recomiendo) u otro tope?
4. **Fecha límite:** ¿opcional, y con ella la cuota mensual y el ritmo (recomiendo), o siempre obligatoria?
5. **Unión con el presupuesto y los gastos hormiga:** ¿mostrar la holgura del mes y la sugerencia «si bajaras el gasto hormiga…» solo como texto (recomiendo), o nada de eso en esta primera versión?
6. **El agente:** ¿solo lectura por MCP, y los aportes solo por ti (recomiendo), o también que pueda anotarlos pidiendo permiso?
7. **Celebraciones:** ¿hitos de 25, 50, 75 y 100 %, una vez cada uno, sin avisos de atraso (recomiendo)?

## Lo que quedó hecho en metas de ahorro (6-10-2026)

- **Decisiones tomadas** (las siete recomendadas): ahorro declarado por frase o botón (nunca deducido); dentro de Plata y de la función `gastos`, sin función nueva; hasta 3 metas activas; fecha límite opcional; holgura del mes y sugerencia del gasto hormiga solo como texto; el agente solo lee por MCP; hitos de 25, 50, 75 y 100 % una vez cada uno y sin avisos de atraso.
- **Motor** (`packages/motor`): `ahorro-tipos.ts` (puro, sin Node: `validarMetaAhorro`, `progresoDeMetaAhorro` con meses por días de pared, cuota mensual, ritmo de los últimos 60 días —o desde que existe la meta, con 14 como mínimo para juzgar— y semáforo; una meta nueva sin aportes no se pone en rojo; `buscarMetaAhorro` por nombre sin artículos y sin adivinar; `celebracionesDeAhorro`, un cruce de varios hitos celebra solo el más alto; `resumirAhorro` con holgura y sugerencia), `ahorro.ts` (tablas `metas_ahorro` y `aportes_ahorro` en `asistente.db`, trigger que borra los aportes con la meta; 3 activas, sin nombres repetidos, un retiro nunca pasa de lo juntado; una meta cumplida libera su lugar), `ahorro-motor.ts` (frases) y `fechas.ts` `leerMes` (ranura `{mes}`: «marzo» = último día de ese mes, este año o el que viene; nunca adivina). Los exports del índice llevan el sufijo `Ahorro` porque `validarMeta`, `ProgresoMeta` y `progresoDeMeta` ya eran de la meta de estudio. `plata.ts` exporta `hormigaDelMes` (el descubrimiento la usa igual que antes). `Motor.resumenAhorro()`.
- **Sin IA** (intenciones `ahorro-*`, dependen de la función `gastos`; sus plantillas van **antes** de las de notas para que «cómo voy con la meta del viaje» no caiga en `notas-como-voy`): «quiero juntar 150 lucas para marzo [para el viaje]», «voy a ahorrar 300 mil para el viaje», «mi meta de ahorro es 200 mil para junio», «aparté 20 lucas [para el viaje]», «saqué 10 lucas de la meta del viaje», «¿cómo van mis metas de ahorro?», «cómo voy con la meta del viaje», «borra la meta del viaje» (la **archiva**: lo juntado queda guardado y se borra de verdad en «Lo que sé de ti»). Con una sola meta, «aparté 20 lucas» la usa; con varias pregunta cuál; un nombre que no calza con ninguna da la lista (o va al agente si no hay metas). Frases de control que no deben calzar: «quiero ahorrar», «ahorré tiempo», «aparté la mesa», «junté a mis amigos», «guardé 5 lucas en mi billetera», «cuánto me falta para la meta de estudio».
- **MCP** `ahorro_resumen` (solo lectura, sin preguntar; depende de `gastos`). Nada de aportes por el agente.
- **Puente**: aviso `ahorro` (marca cada 2 s junto a la de Plata) y pedidos `ahorro-estado`, `ahorro-todo`, `ahorro-crear`, `ahorro-aportar` (monto negativo = retiro), `ahorro-archivar` y `ahorro-borrar` (`meta: null` = todas); ver y borrar no dependen de la función. Los hitos salen por el aviso `celebracion` con motivo `ahorro` (lo ya celebrado en `ajustes` `avisos-ahorro`). En los registros solo quedan frases como «ahorro: aporte anotado», nunca nombres ni montos. Prueba de punta a punta con el puente real (`ahorro-puente.test.ts`: crear por frase y por pedido, hitos una sola vez, lo que anota otro proceso, archivar, borrar, función apagada).
- **Isla**: tarjeta «Metas de ahorro» en Plata (`tarjetaAhorro` en `panel.ts`, textos en `src/agente/ahorro.ts` con pruebas): arriba si hay metas, al final como invitación si no hay; por meta, barra con el semáforo, montos, cuota, «A tu ritmo llegarías en …» solo si va lento, «+ Aporte» (escribe «aparté  para viaje» con el cursor tras el verbo), y las líneas de holgura y de gasto hormiga. El tooltip de la tarjeta explica que Brote solo anota lo que tú dices. Novedades: tipo `ahorro` (punto en Plata, pasa en concentración como las demás celebraciones). «Lo que sé de ti → Metas de ahorro» (con las archivadas; borrar una o todas con segundo toque, borrado de verdad). Vistas previas `?pestana=plata&ahorro=sin|una|varias|lenta|cumplida`, `?cerrada=1&celebrar=ahorro` y `vista-previa-memoria.html`.
- **Privacidad:** la skill `delegar` prohíbe pasar las metas de ahorro a planes gratuitos (con prueba).
- **Cambió respecto del diseño:** (1) los datos viajan en un aviso `ahorro` propio y no dentro de `EstadoPlata` (así no se mezclan con el cálculo puro de los gastos y el MCP los lee igual). (2) No hay botones rápidos de monto: el aporte se escribe en el campo (decisión de mantener un solo camino para anotar). (3) `ahorro-aportar` acepta retiros (monto negativo) para el pedido de la isla futura; hoy solo lo usa la frase «saqué…».

### Pruebas pendientes de metas de ahorro (para un Mac)

- [ ] Reiniciar Brote (el puente carga código nuevo solo al partir) y los procesos MCP (`pkill -f packages/motor/src/mcp.ts`); verificar con `openclaw mcp probe gastos` que aparece `ahorro_resumen`.
- [ ] «quiero juntar 150 lucas para marzo para el viaje», «aparté 20 lucas para el viaje» y «¿cómo van mis metas de ahorro?» con la app real; ver la tarjeta en Plata y cómo se ve en el notch (con 3 metas la tarjeta es larga: ¿hay que compactarla?).
- [ ] Con un presupuesto puesto y gastos del mes, comprobar la línea de holgura («Cabe en tu presupuesto» / «no deja holgura») y que con un gasto hormiga real salga la sugerencia.
- [ ] Llegar a 25 % y a 100 % con aportes reales: que Brote celebre una vez cada hito (también con la isla cerrada y durante un pomodoro).
- [ ] «borra la meta del viaje» y después «Lo que sé de ti → Metas de ahorro» (la meta archivada se ve y se borra); apagar Gastos en Configurar y comprobar que la sección sigue ahí.
- [ ] Preguntarle al agente por sus metas («¿cuánto me falta para el viaje?»): que use `ahorro_resumen` y no invente saldos.

## Pendientes previos que no son de este plan
Probar en un Mac las fases 2 a 5 de grabar y transcribir (`docs/demo/pauta-pruebas-mac-grabaciones.md`); Agenda: diseño estilo Notion y mensaje cuando falla `agenda-estado`; ideas de la sección 9 de `plan-rediseno.md` (no se empiezan sin pedirlo).

## Progreso
- [x] A1 Ramos (hecho el 5-10-2026; probado con pruebas y en la vista previa, falta un Mac: ver «Pruebas pendientes de A1») · [x] A2 Calculadora de notas (hecha el 5-10-2026; probada con pruebas y en la vista previa, falta un Mac: ver «Pruebas pendientes de A2») · [x] A3 Resumen y tarjetas (hecho el 5-10-2026; probado con pruebas y en la vista previa, falta un Mac: ver «Pruebas pendientes de A3») · [x] A4 Plan de estudio (hecho el 5-10-2026; probado con pruebas y en la vista previa, falta un Mac: ver «Pruebas pendientes de A4») · [x] A5 Estadísticas (hecha el 5-10-2026; probada con pruebas y en la vista previa, falta un Mac: ver «Pruebas pendientes de A5»)
- [x] B Gráficos (B1, B2 y B3 hechos el 6-10-2026) · [ ] C Organizar temas · [ ] D Conectores · [x] E Cosas chicas (E1–E4 hechas el 6-10-2026; faltan metas de ahorro y gastos compartidos; ver «Pruebas pendientes de E») · [ ] F Adopción · [x] Metas de ahorro (hechas el 6-10-2026; probadas con pruebas y en la vista previa, falta un Mac: ver «Pruebas pendientes de metas de ahorro») · [x] B1 Gráficos de Plata (hecho el 6-10-2026; probado con pruebas y en la vista previa, falta un Mac: ver «Pruebas pendientes de B1»; el bloque B queda completo con B3) · [x] B2 Agenda semanal (hecha el 6-10-2026; probada con pruebas y en la vista previa, falta un Mac: ver «Pruebas pendientes de B2») · [x] B3 Gráficos de Estudio (hecho el 6-10-2026; probado con pruebas y en la vista previa, falta un Mac: ver «Pruebas pendientes de B3»)
