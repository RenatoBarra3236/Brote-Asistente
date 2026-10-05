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

## Diseño de A4: Plan de estudio antes de una prueba (PROPUESTO el 5-10-2026, SIN aprobar: no hay código)

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

## Pendientes previos que no son de este plan
Probar en un Mac las fases 2 a 5 de grabar y transcribir (`docs/demo/pauta-pruebas-mac-grabaciones.md`); Agenda: diseño estilo Notion y mensaje cuando falla `agenda-estado`; ideas de la sección 9 de `plan-rediseno.md` (no se empiezan sin pedirlo).

## Progreso
- [x] A1 Ramos (hecho el 5-10-2026; probado con pruebas y en la vista previa, falta un Mac: ver «Pruebas pendientes de A1») · [x] A2 Calculadora de notas (hecha el 5-10-2026; probada con pruebas y en la vista previa, falta un Mac: ver «Pruebas pendientes de A2») · [x] A3 Resumen y tarjetas (hecho el 5-10-2026; probado con pruebas y en la vista previa, falta un Mac: ver «Pruebas pendientes de A3») · [ ] A4 Plan de estudio (diseño propuesto, esperando aprobación) · [ ] A5 Estadísticas
- [ ] B Gráficos · [ ] C Organizar temas · [ ] D Conectores · [ ] E Cosas chicas · [ ] F Adopción
