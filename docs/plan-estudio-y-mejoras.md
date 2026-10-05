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

## Pendientes previos que no son de este plan
Probar en un Mac las fases 2 a 5 de grabar y transcribir (`docs/demo/pauta-pruebas-mac-grabaciones.md`); Agenda: diseño estilo Notion y mensaje cuando falla `agenda-estado`; ideas de la sección 9 de `plan-rediseno.md` (no se empiezan sin pedirlo).

## Progreso
- [x] A1 Ramos (hecho el 5-10-2026; probado con pruebas y en la vista previa, falta un Mac: ver «Pruebas pendientes de A1») · [ ] A2 Calculadora de notas · [ ] A3 Resumen y tarjetas · [ ] A4 Plan de estudio · [ ] A5 Estadísticas
- [ ] B Gráficos · [ ] C Organizar temas · [ ] D Conectores · [ ] E Cosas chicas · [ ] F Adopción
