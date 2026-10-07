# Plan de la versión móvil de Brote (iPhone y Android)

Escrito el 6-10-2026. **Es una propuesta: nada está programado ni aprobado.** Esta sesión fue de planificación y análisis; no se tocó código de la app, no se descargó ni instaló nada y no se corrió ningún emulador. Antes de escribir una línea de la app, el usuario aprueba las decisiones de la sección 8.

Partimos de lo ya decidido (no se re-discute): software gratis y sin suscripciones, ganancias solo del Brote físico; **el celular va sin IA por ahora**; el agente vive en PC, celular y aparato con los mismos datos; sin nube propia por ahora (sin cerrarle la puerta); el aparato es un cliente delgado con ESP32 que depende del celular por Bluetooth de baja energía; aplazados las pruebas con personas, el video, la firma y la capa G; todo en español. Lo anterior viene de `CLAUDE.md`, `docs/plan-multiplataforma.md`, `docs/plan-sin-ia.md` (secciones 7, 12 y 13), `docs/resumen-pc-celular-fisico.md`, `docs/modelo-de-negocio.md`, `docs/privacidad.md`, `docs/comparacion-taby.md` y `docs/plan-rediseno.md` (secciones 6 y 8).

**Cómo leer las marcas:** **[V]** hecho verificado (lo vi en el código de este repo, en este Mac o en una fuente citada con fecha de consulta), **[C]** cálculo o estimación mía, **[S]** suposición o conocimiento mío que no pude verificar hoy: hay que comprobarlo en la fase 0. Todas las fuentes web se consultaron el 6-10-2026 (lista en la sección 9).

## 0. Respuesta corta

1. **Herramienta:** un **núcleo en TypeScript compartido** (el motor sin IA que ya existe, con el almacenamiento detrás de una capa) más una app **Expo (React Native)** con módulos nativos finos donde haga falta (widgets, Bluetooth). Segunda opción si la fase 0 la desmiente: **Capacitor** (la web actual en un contenedor), a cambio de volver asíncrono el almacenamiento. Tauri móvil, Flutter, nativo puro y PWA quedan descartados por las razones de la sección 3.
2. **Lo que más pesa en esa elección** no es el personaje ni la interfaz: es que **el motor entero usa SQLite síncrono** (`node:sqlite`: 10 archivos con 11 clases y ~165 consultas sobre una sola base [V]). Expo trae SQLite con API síncrona sobre JSI [V], así que el SQL actual se puede conservar casi tal cual; en un webview habría que volver asíncrono todo el motor.
3. **Sincronización:** local primero, **un registro de cambios por registro** (ids globales, reloj híbrido, «gana el último» por fila) con **el PC como concentrador**, emparejado por QR y **cifrado de punta a punta en la aplicación** (así sirve por WiFi, por Tailscale y, mañana, por un relé que no ve nada). Ni CRDT ni PowerSync hoy (secciones 4.3 y 4.4). «Olvidar» viaja como una lápida que cada aparato obedece y confirma.
4. **Lo que hay que hacer primero:** una **fase 0 de una semana** con un prototipo desechable para verificar cinco cosas que no puedo saber desde el escritorio (sección 7). Y **hoy este Mac no tiene Xcode ni Android Studio** [V, verificado con `xcode-select` y `ls`], así que sin instalarlos no hay iPhone ni Android que probar: es la primera decisión que necesito de ti.
5. **Costo mínimo para publicar:** Apple 99 USD al año; Google 25 USD una sola vez [V, fuentes en la sección 9]. TestFlight y pruebas internas permiten probar con amigos sin publicar. Google exige a las cuentas personales nuevas una prueba cerrada con 12 testers durante 14 días antes de publicar [V, fuente secundaria].

## 1. Inventario de funciones y qué pasa en el celular

Clasificación: **(a)** se reutiliza tal cual (TypeScript puro), **(b)** se adapta (hoy depende de Node, disco, `node:sqlite` o macOS), **(c)** solo PC, **(d)** distinta en el celular (hardware o servicios del teléfono). Medido en este repo: de los 15.433 renglones de `packages/motor/src`, ~9.300 están en archivos sin imports de Node (puros) y ~6.100 en archivos que sí los tienen (de esos, solo 10 archivos tocan `node:sqlite`; el resto es disco, procesos del sistema y el servidor MCP) [V, conteo con `grep`]. De los 41 archivos de `apps/desktop/src/agente/`, **solo 5 tocan el DOM, `localStorage` o Tauri** (`agenda.ts`, `notificaciones.ts`, `primeros-pasos.ts`, `preferencias.ts`, `puente.ts`); los otros 36 son lógica de presentación pura y con pruebas [V].

**Lo que ata a casi todo (el cuello de botella):** `Gastos` abre la base (`new DatabaseSync(ruta)`) y la comparte con las otras nueve clases por `gastos.baseDeDatos()`; `Motor` recibe un `Gastos` en su constructor. Las consultas son SQL estándar de SQLite (`returning`, `on conflict`, triggers, `collate nocase`, `pragma busy_timeout`) y los ids son enteros locales (`integer primary key`). Todo eso se conserva en un SQLite de teléfono; lo que cambia es **quién abre la base** y los **ids**, que para sincronizar deben ser globales (sección 4).

| Función | Clase | Qué la ata hoy (archivos) | En el celular |
|---|---|---|---|
| **Frases sin IA** (plantillas, corrector A, piezas B, confirmación C, sugerencias D, ayuda E) | **a** | `motor.ts`, `plantillas.ts`, `corregir.ts`, `piezas.ts`, `piezas-reglas.ts`, `sugerir.ts`, `ayuda.ts`, `fechas.ts`, `tiempo.ts`, `montos.ts`, `periodos.ts`, `texto.ts`: sin imports de Node. Solo pide un `Gastos` en el constructor. Dudas de motor JS: `\p{…}` en `corregir.ts`, `normalize()` en 5 archivos, `Intl.DateTimeFormat` en `ics.ts` **[S: Hermes]** | Es **la base del celular**. Entra tal cual una vez que `Gastos` reciba un almacén en vez de una ruta |
| **Frases aprendidas y «que no entendí»** | **b** | `frases-locales.ts` (SQLite vía `gastos.baseDeDatos()`) | Mismo código sobre el almacén del teléfono. Las confirmadas pueden sincronizarse; las «que no entendí» **no** (son texto libre del usuario, apagadas de fábrica) |
| **Gastos, presupuesto y proyección** | **b** | Lógica pura en `plata.ts`, `categorias.ts`; datos en `gastos.ts` (SQLite, tabla `ajustes`) | La función más importante del celular («en la micro»). Sin conexión, siempre |
| **Metas de ahorro** | **b** | Puro: `ahorro-tipos.ts`, `ahorro-motor.ts`. Datos: `ahorro.ts` | Igual que gastos. Los aportes son solo-agregar: sincronizan sin conflicto |
| **Formulario «+ Gasto» y autocompletado** | **a** (lógica) / **d** (vista) | Lógica pura: `agente/gasto-formulario.ts`, `agente/autocompletar.ts`. Vistas: DOM en `panel.ts`, `gasto-vista.ts` | La lógica se reutiliza; la pantalla se reescribe como componente móvil. En el celular el formulario pasa a ser **la vía principal** (un toque no se equivoca) |
| **Pomodoro, temporizadores y recordatorios** | **b + d** | `temporizadores.ts` (SQLite + reloj); el puente los revisa cada segundo | Distinta: no hay proceso corriendo cada segundo en segundo plano. Se programa una **notificación local** al terminar, y en iPhone una **Live Activity**. No se sincronizan entre aparatos en la versión 1 (evita avisos dobles; decisión 6) |
| **Calendario** | **d** | `calendario.ts` (lectura por JXA/EventKit del Mac con `execFile`), `ics.ts` (lector iCal, puro) | Se lee el **calendario del teléfono** (EventKit en iPhone, Calendar Provider en Android). El iCal con dirección secreta **no se copia** al celular: si el usuario tiene ese calendario en Google, ya está en el del teléfono |
| **Aula (Canvas y Moodle)** | **c → foto** | `aula.ts` (lee `aula.json` con el token; en el Mac el token va al Llavero) | El token **nunca** sale del PC. El celular recibe una **foto de solo lectura** de las entregas (título, curso, fecha) cuando se sincroniza |
| **Ramos** | **b** | Puro: `ramos-tipos.ts`, `ramos-ficha.ts`, `ramos-frases.ts`. Datos: `ramos.ts` | Se reutiliza; sincroniza |
| **Notas y calculadora** | **b** | Puro: `notas-tipos.ts`, `notas-ficha.ts`, `notas-frases.ts`, `notas-motor.ts`. Datos: `notas.ts` | Se reutiliza; sincroniza |
| **Repaso (tarjetas)** | **b** | Puro: `repaso-tipos.ts`, `repaso-frases.ts`. Datos: `repaso.ts` | **Gran ganancia en el celular** (repasar en la micro). Las propuestas nuevas las crea el agente en el PC (`repaso_proponer`, MCP); las **aceptadas** viajan al celular |
| **Plan de estudio antes de una prueba** | **b + d** | Puro: `plan-estudio-tipos.ts`, `plan-estudio-ficha.ts`, `plan-estudio-frases.ts`, `plan-estudio-motor.ts`. Datos: `plan-estudio.ts`. Agendar usa el Calendario del Mac | Se reutiliza; agendar usa el calendario del teléfono (y ahí sí se puede guardar el id del evento, así que Brote **podría borrarlos**, cosa que hoy no puede) |
| **Estadísticas de estudio, meta y racha** | **b** | Puro: `estadisticas-tipos.ts`, `estadisticas-frases.ts`, `estadisticas-metas.ts`, `estadisticas-motor.ts`, `celebraciones.ts`. Datos: `estadisticas.ts` (clave única `fuente+ref+inicio`, ya idempotente) | Se reutiliza; la unión de registros ya es segura |
| **Todo lo de un ramo y buscador** | **a / b** | Puro: `ramo-todo.ts`; `ramo-todo-datos.ts` arma las fuentes desde la base | Se reutiliza |
| **Agenda (lista y semana)** | **a + d** | Puro: `agenda.ts`, `agenda-carga.ts`; vista DOM | Lógica igual; fuentes = calendario del teléfono + foto del aula + pruebas + bloques |
| **Resumen del día y de la mañana** | **a + d** | `resumen-dia.ts` (puro); aviso diario en `agente/resumen-manana.ts` | La lógica igual; el aviso diario pasa a ser una notificación local programada |
| **Avisos / Novedades, modo concentración, primeros pasos** | **a + d** | `agente/novedades.ts`, `agente/concentracion.ts` (puros); `primeros-pasos.ts` y `notificaciones.ts` usan `localStorage`/Tauri | Lógica reutilizable; el almacenamiento de preferencias y las notificaciones del sistema son del teléfono |
| **Grabar y transcribir** | **d** | Formato puro (`transcripciones.ts`); disco (`transcripciones-archivo.ts`); captura en Rust con `cpal` (`grabacion.rs`); `whisper-cli` (`transcribir.ts`) | Distinta: micrófono del teléfono, permisos y servicio en primer plano. **Aplazada a la fase 5** (decisión 7): grabar sí, transcribir en el celular es pesado (el modelo `small` pesa 487.601.967 B [V, `modelos-whisper.ts`]) |
| **Documentos (PDF, Word…)** | **c** | `documentos-extraer.ts` usa `textutil` y PDFKit por `osascript` (solo macOS); `documentos-zip.ts` usa `node:zlib` | Solo PC en la versión 1. Más adelante, «compartir a Brote» desde el teléfono hacia el PC |
| **Música** | **c** | `musica.ts` (JXA/Spotify/Música del Mac) | Solo PC. En iPhone una app no puede leer lo que suena en otra [S] y en Android exigiría un permiso sensible |
| **Descargas** | **c** | `descargas.ts` (`fs.watch` sobre `~/Downloads`) | Solo PC |
| **Reacciones al computador** (batería, CPU, disco) | **c → d** | `sistema.ts` (`pmset`, `ps`, `statfs`) | El celular puede reaccionar a **su propia batería** (el `Vigilante` es lógica pura reutilizable) |
| **Modo programador, hooks, statusline** | **c** | `programador.ts`, `hook.ts`, `hooks-claude.ts`, `statusline*.ts` | Solo PC. Más adelante una pestaña de **solo lectura** («Claude está trabajando en…») por la foto del PC |
| **Uso del plan de Claude** | **c → foto** | `plan.ts` (puro), `uso*.ts`, `consulta-plan.ts` | Solo PC; el celular podría mostrar el % guardado (solo lectura) |
| **Conectores (Todoist, Notion, GitHub, Canva)** | **c** | `conectores.ts`, OpenClaw | Solo PC |
| **Equipo de especialistas** | **c** | `especialistas.ts`, `delegacion.ts`, OpenClaw | Solo PC |
| **IA conversacional, MCP, memoria del agente** | **c** | `mcp.ts`, `puente.ts` ↔ Gateway de OpenClaw, `~/.openclaw` | Solo PC; el celular deriva (sección 2.4) |
| **«Lo que sé de ti»** | **b + d** | `memoria.ts` (puente), `memoria-grabaciones.ts`, `agente/memoria-vista.ts` (pura) | Versión del celular: **solo lo que el celular guarda** (gastos, ramos, notas, frases…) con borrar. La memoria del agente es del PC y la pantalla lo dice |
| **Funciones que se prenden y apagan** | **a + b** | `funciones.ts` (puro); `funciones-archivo.ts` (`fs`) | El catálogo se comparte; el archivo es **por aparato** (el celular solo ofrece lo que soporta) |
| **Secretos** | **b** | `secretos.ts` (interfaz pura); Rust `keyring` (Llavero) | Llavero de iOS / Keystore de Android para la clave de emparejamiento. Ningún secreto del PC viaja |
| **Personaje y mascotas** | **b** | `personaje/personaje.ts` (1.044 renglones, Canvas 2D, resortes y física), `mascotas.ts`; usa ~20 métodos de `CanvasRenderingContext2D` (`arc`, `quadraticCurveTo`, `ellipse`, `roundRect`…) [V] | Ver sección 2 y 3: o se reutiliza dentro de un webview, o se porta a Skia |
| **Isla y pestañas (panel)** | **d** | `panel.ts` (3.610 renglones, DOM a mano), vistas `*-vista.ts` | Se **reescribe** como pantallas móviles; la lógica de `agente/*.ts` se reutiliza |
| **Configurar Brote** | **d** | `configuracion.ts` + Rust (Node, OpenClaw, Gateway) | No aplica: el celular tiene un asistente de permisos y el **emparejamiento opcional** |

**Lectura del cuadro:** el celular de la versión 1 es el **motor sin IA + las funciones de plata y estudio + el calendario del teléfono + avisos**. Eso es casi todo lo que el estudiante usa «en la micro» y coincide con la decisión de que el celular funcione sin el PC. Lo que queda solo en el PC es justamente lo que depende de OpenClaw, de macOS o de secretos.

## 2. La isla en el celular

El notch de macOS no existe en un teléfono, y no hace falta imitarlo: la «isla» es una idea (Brote está siempre a mano y avisa sin molestar), no una pieza de hardware. Equivalentes, de más a menos recomendados:

| En el PC | En el celular | Comentario |
|---|---|---|
| Isla en el notch (Brote + panel con pestañas) | **Pantalla principal de la app**: Brote arriba (el mismo personaje), debajo las tarjetas de Inicio, y una **barra inferior** con las pestañas | Es el equivalente directo. Una mano, pulgar abajo |
| Aviso en el ala izquierda (Novedades) | **Notificación local** + banner dentro de la app + punto en la pestaña | `novedades.ts` y `concentracion.ts` (puros) deciden qué avisa y qué espera; solo cambia cómo se muestra |
| Reloj del pomodoro en el ala | **iPhone: Live Activity** (pantalla de bloqueo y Dynamic Island en los modelos que la tienen). **Android: notificación persistente con cronómetro** | Un temporizador no necesita servidor: la cuenta regresiva la dibuja el sistema **[S: confirmar en la fase 0]**. Una Live Activity solo se puede iniciar con la app abierta **[S]** y es lo normal en un pomodoro |
| «Próximo» / entregas / presupuesto del día | **Widgets** de pantalla de inicio | iPhone: Expo trae `expo-widgets` estable desde el SDK 56 (widgets y Live Activities con componentes de Expo UI, sin proyecto iOS aparte; no funciona en Expo Go) [V]. Android: **[S]** por una biblioteca de la comunidad, sin verificar |
| Botones de gastos frecuentes (`plata-anotar`) | **Botón de widget / atajo** («+ Café 2.000») | En iPhone, un widget interactivo o un App Intent corre en una extensión **sin el motor de TypeScript**: por eso solo puede escribir un gasto **ya estructurado** (monto, categoría, descripción) en la base compartida; las frases libres se entienden dentro de la app |
| Burbuja flotante (modo flotante) | **No se hace** | En Android exigiría el permiso «Mostrar sobre otras apps» y la tienda lo mira con lupa **[S]**; en iPhone no existe. Widget + notificación cubren lo mismo |
| Teclas 1–9 de prueba, `Cmd+Q` | Pantalla oculta «Diagnóstico» (solo desarrollo) | Sirve también para correr el corpus en el aparato (sección 3.6) |

**Qué se hace con las pestañas actuales** (la barra inferior aguanta 5 cómodamente):

| Pestaña del PC | En el celular v1 | Nota |
|---|---|---|
| **Brote** (Inicio + Chat) | **Brote**: personaje, tarjetas, campo de texto con autocompletado, confirmaciones «¿Anoto…?» con botones y el mensaje de «vamos al PC» | Sin IA no hay «conversación»: es un asistente de comandos, como hoy sin OpenClaw |
| **Plata** | **Plata**, completa (presupuesto, proyección, tendencia, metas de ahorro, «+ Gasto») | Es la razón de ser del celular |
| **Agenda** | **Agenda** (lista y semana) | Eventos del teléfono, entregas del aula (foto del PC), pruebas y bloques |
| **Estudio** | **Estudio** (ramos, notas, repaso, plan, estadísticas) | El **repaso** gana mucho en el celular |
| **Grabar** | Dentro de **Más** y solo en la fase 5 | Ver decisión 7 |
| **Claude** | **No existe** en v1. Más adelante, una pestaña **«Mi PC»** de solo lectura (sesiones y % del plan) dentro de **Más** | Depende de la foto del PC (sección 4) |
| **Equipo** (mascotas de especialistas) | **No existe** | Son de OpenClaw |
| «Lo que sé de ti», Configurar | Dentro de **Más** | «Lo que sé de ti» muestra solo lo que guarda el celular |

Entonces la barra queda: **Brote · Plata · Agenda · Estudio · Más**.

**Brote reacciona a su teléfono:** batería baja → «cansado» (la lógica del `Vigilante` es pura), celebra al anotar o cumplir una meta (`celebraciones.ts`), y los ojos siguen el dedo en vez del cursor. Para no gastar batería, el lienzo solo dibuja con la pantalla encendida y la pestaña Brote a la vista, y baja de cuadros por segundo en reposo **[C: medir en la fase 0]**.

### 2.4 Lo que el celular no puede responder («vamos al PC»)

El motor ya devuelve `intencion: "no-entendi"` con sugerencias y nunca un error técnico; en el celular se agrega una segunda salida **solo para frases que de verdad piden IA** (la decisión es del motor, no del texto):

1. **Sin PC emparejado:** mensaje amable fijo: «Eso necesita mi IA y hoy solo la tengo en tu PC. Vamos al PC y te ayudo allá» + «Ver ayuda».
2. **Con PC emparejado:** además, el botón **«Dejarla para mi PC»**. La frase se guarda en una tabla `preguntas_pendientes` (id global, texto, fecha, estado) que **viaja solo al PC** (cifrada, como todo) y vuelve con la respuesta. Es la «bandeja de preguntas pendientes» de `docs/plan-sin-ia.md` §7.5.
3. **Cuándo la responde el PC** (decisión 5): lo recomendado es que **no se ejecute sola**. Un agente puede pedir permisos de herramientas, y con el usuario lejos del PC OpenClaw los niega a los 2 minutos (`terminal_reason: no-route`, `CLAUDE.md`). Propongo que el PC muestre «Tienes 2 preguntas del celular» y las responda **cuando el usuario lo pida** en la isla; más adelante, un modo automático solo con herramientas de lectura.
4. **Privacidad:** son texto libre del usuario: nunca a registros, nunca a especialistas de planes gratuitos (hay que sumarlas a la lista de la skill `delegar`, que hoy prohíbe las «que no entendí»), y se borran al responder si el usuario así lo elige.

## 3. Herramientas: análisis y recomendación

### 3.1 Criterios y matriz

Criterios que importan **a este proyecto**: reutilizar el motor TypeScript (15.433 renglones en `packages/motor/src`), que el almacenamiento síncrono actual no obligue a reescribir, el personaje (Canvas 2D), calendario del teléfono, notificaciones locales, widgets/Live Activities, Bluetooth de baja energía para el aparato, grabar audio (y whisper.cpp), archivos, base local, **una sola persona**, costo, curva de aprendizaje, mantenimiento y publicación.

| Criterio | **Expo (React Native)** | **Capacitor** (web en contenedor) | **Tauri 2 móvil** | **PWA** | **Flutter** | **Nativo** (Swift + Kotlin) |
|---|---|---|---|---|---|---|
| Reutiliza el motor TS | **Sí**, corre en Hermes [S: probar] | **Sí**, en el motor JS del webview | **Sí**, en el webview | **Sí** | **No**: reescribir en Dart (o incrustar un motor JS) | **No**: dos reescrituras |
| SQLite **síncrono** (como hoy) | **Sí**: `expo-sqlite` con `openDatabaseSync`, `runSync`, `getAllSync`, `prepareSync` [V] | **No** de forma natural (plugins asíncronos); habría que volver asíncrono todo el motor | **No**: el puente a Rust es asíncrono | **No** (Wasm en un worker, asíncrono) | Otro lenguaje | Otro lenguaje |
| Personaje en Canvas 2D | **Portar a Skia** (~20 métodos de dibujo, [C] 3–5 días) o correrlo en un componente web (`DOM component`) **[S]** | **Tal cual** (es un `<canvas>`) | **Tal cual** | **Tal cual** | Reescribir | Reescribir |
| Calendario del teléfono | `expo-calendar` **[S]** | Plugin de comunidad **[S]** | Hay que escribir plugin Swift/Kotlin | **No** | Plugin **[S]** | Nativo |
| Notificaciones locales | `expo-notifications` **[S]** | Plugin oficial **[S]** | Plugin oficial **[S]** | Solo con la app instalada en iOS 16.4+ y push, no locales fiables [V, fuente secundaria] | Plugin | Nativo |
| Widgets y Live Activities | **`expo-widgets` estable desde SDK 56** [V] | Extensión Swift a mano | Extensión Swift a mano | **No** | Extensión a mano | Nativo (lo mejor) |
| Bluetooth de baja energía para el aparato | `react-native-ble-plx` / `ble-manager` **[S]**, requiere build de desarrollo (no Expo Go) | `bluetooth-le` de comunidad **[S]** | Plugin de comunidad **[S]** | **No** en iPhone (Web Bluetooth no está en Safari **[S]**) | `flutter_blue_plus` **[S]** | Nativo (lo mejor) |
| Grabar audio y whisper.cpp | `whisper.rn` (binding de whisper.cpp) existe [V]; grabación con módulo de Expo **[S]** | Plugin + whisper nativo a mano | Rust (`cpal` ya está en el repo) o plugin | Micrófono web, sin segundo plano | Plugins | Nativo |
| Archivos y documentos | `expo-document-picker`, `expo-file-system` **[S]** | Plugins oficiales | Plugin de diálogo ya usado en desktop | Limitado | Plugins | Nativo |
| Una persona | **Buena**: un lenguaje (TS), un repo, sin Xcode para casi todo salvo compilar | **Buena** | Mala: Rust + Swift + Kotlin para los vacíos | Buena, pero sin el resto | Mala (otro lenguaje) | Muy mala |
| Costo | Gratis; la compilación en la nube (EAS) tiene plan gratis con límites **[S]** y se puede compilar local | Gratis | Gratis | Gratis | Gratis | Gratis |
| Curva de aprendizaje (viniendo de TS + Tauri) | Media (React) | Baja | Alta | Baja | Alta | Muy alta |
| Madurez hoy | **SDK 57 estable (30-6-2026) y SDK 58 en beta (15-9-2026)** [V]; la arquitectura nueva es obligatoria desde el SDK 55 [V, fuente secundaria] | Capacitor 8 estable; pide **Xcode 26+**, Android Studio Otter (2025.2.1) o más nuevo y Node 22+ [V] | El 2.x móvil «sirve para producción pero no es de primera clase» según su propio equipo [V, fuente secundaria]; **Tauri 3.0.0-alpha.4 salió el 1-10-2026** [V]: el terreno se mueve | Estable pero limitada | Estable | Estable |
| Publicación | EAS Submit o compilar local **[S]** | Compilar con Xcode / Android Studio | Igual | Sin tiendas | Igual | Igual |

### 3.2 Cada opción, en concreto

**Expo (React Native)** · *se reutiliza:* todo `packages/motor` puro, la lógica de `agente/*.ts` (36 de 41 archivos), los formatos, el corpus y las pruebas; el SQL tal cual. *Se reescribe:* las pantallas (`panel.ts`, 3.610 renglones de DOM a mano y las vistas) como componentes móviles, y el personaje si se elige Skia. *Riesgos:* Hermes no es Node (RegExp `\p{…}`, `normalize`, `Intl.DateTimeFormat` con zona horaria, ver 3.4); los módulos nativos exigen **compilaciones de desarrollo**, no Expo Go; dependencia de cadenas de herramientas de Apple y Google (Xcode, Android Studio). *Madurez:* la más alta de las que reutilizan TypeScript, con widgets de iPhone resueltos.

**Capacitor** · *se reutiliza:* **más interfaz** que en Expo (el DOM, `panel.ts` y el personaje, aunque la isla de 560 px habría que rediseñarla para un teléfono de todos modos). *Se reescribe:* el almacenamiento (asíncrono) y, con él, la firma de `Motor.resolver` y de las 11 clases, es decir, **tocar casi todo el motor y sus 56 archivos de prueba** [C]. *Riesgos:* el webview se suspende en segundo plano; widgets y Live Activities son Swift a mano; Bluetooth de comunidad. *Es mi segunda opción* si la fase 0 muestra que portar el personaje o Hermes es un problema.

**Tauri 2 móvil** · *se reutiliza:* el stack actual (el repo ya es Tauri, con 3.017 renglones de Rust y `cpal` para grabar). *Riesgos:* cada capacidad que falte (calendario, notificaciones programadas, widgets, BLE, Live Activities) exige un plugin en **Swift y Kotlin**; el almacenamiento tendría el mismo problema asíncrono que Capacitor; y justo ahora está en alfa de la siguiente versión mayor [V]. **Descartada**: es la que más trabajo de bajo nivel le pide a una sola persona.

**PWA** · útil como idea de «probar sin tiendas» (era la fase 2 de `docs/plan-multiplataforma.md`), pero **ya no sirve como cliente**: la decisión nueva es que el celular tenga su propio motor y funcione sin el PC; la PWA no tiene Bluetooth en iPhone, no tiene Background Sync y solo recibe push instalada en la pantalla de inicio [V, fuentes secundarias]. **Descartada.**

**Flutter** · obliga a reescribir el motor (15.433 renglones) y su corpus en Dart, o a incrustar un motor de JavaScript dentro de Flutter (un parche frágil **[S]**). **Descartada.**

**Nativo (Swift + Kotlin)** · mejor integración con widgets, Bluetooth y segundo plano, pero son **dos reescrituras** del motor y de la interfaz mantenidas por una persona. **Descartada.**

**Combinaciones** · la recomendada es **«núcleo TypeScript compartido + Expo + módulos nativos finos»**: el núcleo (motor, formatos, lógica de presentación) vive en el monorepo y lo importan por igual el PC (Node) y el teléfono (Hermes); la app Expo es una carcasa de pantallas, notificaciones, calendario y Bluetooth; y solo donde Expo no llegue se escribe un **módulo nativo chico** (Expo Modules) en Swift o Kotlin. Otra combinación posible, **Capacitor para las pantallas + núcleo compartido**, es la de respaldo.

### 3.3 Base de datos local: qué reemplaza a `node:sqlite` y cómo se esconde

**Qué usa hoy:** `DatabaseSync` de `node:sqlite` en 10 archivos [V], con tres detalles a respetar: `Gastos.baseDeDatos()` entrega la misma conexión a las otras clases; el puente y el servidor MCP son **dos procesos** sobre el mismo archivo (WAL + `busy_timeout`); y los resultados de `run()` se usan por `changes` en 10 archivos y por `lastInsertRowid` en varios.

**Qué la reemplaza en el teléfono:** `expo-sqlite`, que trae SQLite propio (no el del sistema), con API **síncrona** (`openDatabaseSync`, `runSync`, `getFirstSync`, `getAllSync`, `prepareSync` + `executeSync`), **WAL**, **SQLCipher** (cifrado de la base, opcional) y **bases compartidas por App Group** en iPhone para que un widget lea los mismos datos [V, documentación de Expo]. Alternativa más rápida: `op-sqlite` (compilada para bare React Native; no corre en Expo Go) [V, fuente secundaria]. Recomiendo `expo-sqlite`: es la oficial y alcanza.

**Cómo se esconde (la capa de almacenamiento):** una interfaz **síncrona** mínima que imita lo que el motor ya usa:

```ts
interface Almacen {
  exec(sql: string): void;
  preparar(sql: string): { ejecutar(...p): { cambios: number; ultimoId: number }; uno(...p): Fila | undefined; todos(...p): Fila[] };
  transaccion<T>(fn: () => T): T;
}
```

con **tres implementaciones**: `AlmacenNode` (`node:sqlite`, para el PC y las pruebas), `AlmacenExpo` (`expo-sqlite`, para el teléfono) y `AlmacenMemoria` (SQLite en memoria, para las pruebas del núcleo). Cambios en el motor: `Gastos` recibe un `Almacen` en vez de una ruta (con un `Gastos.abrir(ruta)` que conserva la API de hoy), `baseDeDatos()` devuelve `Almacen`, y las 10 clases no cambian su SQL. **Es un refactor mecánico y comprobable con los 56 archivos de prueba actuales** [C: unos días; lo confirma la fase 1]. Dos diferencias que el adaptador absorbe: los nombres del resultado de `run` (`changes`/`lastInsertRowid` vs. los de Expo **[S: confirmar nombres exactos]**) y que cada proceso del PC abre su propia conexión.

**Ids globales:** hoy los ids son enteros locales (`integer primary key`). Para sincronizar hace falta que dos aparatos no repitan ids; esa migración se explica en la sección 4.2 y es lo único que **sí** toca el esquema.

### 3.4 Motor de JavaScript: Hermes, JavaScriptCore y V8

- **Expo/React Native:** Hermes (con la arquitectura nueva, obligatoria desde el SDK 55 [V, fuente secundaria]). Es un motor propio, **no** igual a Node ni a Safari. Los puntos del motor de Brote que podrían diferir **[S: todo esto a probar en la fase 0]**: las dos expresiones con `\p{…}` de `corregir.ts` (propiedades Unicode), `String.prototype.normalize("NFD")` (usado por `texto.ts`, `ramos-tipos.ts`, `repaso*.ts`, `tareas-agenda.ts` para comparar sin tildes), `Intl.DateTimeFormat` con `timeZone` (en `ics.ts`, para zonas horarias de iCal) y los conteos de `Date` en hora local. Hermes **no ejecuta WebAssembly** **[S]**, lo que descarta bibliotecas CRDT escritas en Rust compiladas a Wasm (sección 4.3).
- **Capacitor/Tauri (webview):** JavaScriptCore en iPhone y V8 en Android (el motor del WebView del sistema). Más parecido a lo que hoy corre en el PC (el webview de Tauri en Mac es WebKit).
- **Mitigación común:** el corpus de frases (sección 3.5) detecta cualquier diferencia de comportamiento en cuanto se pueda correr en el aparato.

### 3.5 Cómo se corre el corpus de frases en el celular

Hoy el corpus es una prueba de `node:test` (`pruebas/corpus.test.ts`, 519 frases de ajuste + 152 de validación, con metas exactas 100 %, typos ≥ 85 %, otra forma ≥ 75 %, 0 falsos positivos [V, `docs/plan-sin-ia.md` §9]) y el motor se arma con `motorDeCorpus()` de `ayuda-corpus.ts`. Tres capas, de menos a más cara:

1. **En CI y en el Mac (Node):** el mismo `corpus.test.ts` con el `AlmacenMemoria`. Prueba que el refactor no rompió nada. **No** prueba Hermes.
2. **En el aparato (Hermes), dentro de la app:** una pantalla oculta «Diagnóstico del motor» que importa `corpus-frases.ts` y `corpus-validacion.ts` (son datos puros), arma el motor con `AlmacenExpo` en memoria y muestra el mismo informe por tipo y área, con ✓/✗ contra las mismas metas. Se corre a mano en un teléfono real y se compara con la cifra de Node: **cualquier diferencia de un solo caso es un hallazgo de motor JS**.
3. **Automático (más adelante):** Maestro o Detox lanzan la pantalla en un emulador y leen el resultado. Pide emuladores: **no lo hago sin tu permiso** (regla del encargo).

Lo que el corpus **no** cubre: el rendimiento (en Node una frase típica toma ~4 ms [V, `docs/plan-sin-ia.md` §10]; en un teléfono gama baja hay que medirlo) y el teclado real del teléfono (autocorrector del sistema, que cambia lo que el usuario escribe).

### 3.6 Recomendación

**Expo + núcleo TypeScript compartido + módulos nativos finos**, con **Capacitor como plan B** si la fase 0 falla en cualquiera de estos tres puntos: (1) el corpus en Hermes no llega a las mismas metas, (2) el personaje no corre fluido portado a Skia ni dentro de un componente web, (3) `expo-sqlite` síncrono no pasa las pruebas del motor. **Por qué esta y no otra:** mantiene un solo lenguaje, conserva el motor y el SQL casi intactos, resuelve el widget de iPhone sin escribir Swift y es la única de las que reutilizan TypeScript con madurez comprobable hoy. La contra honesta: hay que reescribir las pantallas (el mayor costo de la versión móvil) y depender de dos cadenas de compilación.

## 4. Sincronización PC ↔ celular (↔ aparato)

**Cambio de principio respecto de `docs/plan-multiplataforma.md`** (sin editar ese documento hasta que lo apruebes): allí el PC era el **único escritor** de la base y el celular un cliente de pedidos; la decisión nueva (el celular funciona solo, con su propio motor y sus propios datos) obliga a que **cada aparato escriba en su base y se reconcilien al verse**. Del plan anterior se conserva lo demás: el PC como centro (concentrador), red privada, sin nube, secretos que no salen del PC, y permisos limitados para los clientes.

### 4.1 Qué viaja y qué no

| Dato | ¿Viaja? | Sentido | Por qué |
|---|---|---|---|
| Gastos, presupuesto, metas de ahorro y sus aportes | Sí | ↔ | Es lo que se anota en la micro |
| Ramos, evaluaciones, notas y ajustes por ramo | Sí | ↔ | Se consultan en ambos |
| Tarjetas de repaso aceptadas, su estado y los resúmenes | Sí | ↔ | Se repasa en el celular |
| Planes y bloques de estudio, registro de estudio (`estudio_registro`), tareas | Sí | ↔ | Se marcan en cualquiera. El registro ya es idempotente por `fuente+ref+inicio` [V] |
| Frases que el usuario confirmó (`frases_confirmadas`) | Sí | ↔ | Mejoran el motor en ambos. El monto no se guarda, solo un hueco [V, `docs/privacidad.md`] |
| Lo ya celebrado y avisado (`avisos-*` de la tabla `ajustes`) | Sí | ↔ | Evita celebrar dos veces la misma meta |
| Propuestas de repaso y de agenda **pendientes** (las crea el agente) | Sí | PC → celular | Nacen en el PC; se aceptan en cualquiera |
| **Foto de solo lectura**: entregas del aula, % del plan de Claude, sesiones de Claude Code | Sí, sin secretos | PC → celular | Datos derivados; el token del aula nunca sale |
| `preguntas_pendientes` y sus respuestas (sección 2.4) | Sí | celular → PC → celular | Es la bandeja «vamos al PC» |
| Temporizadores y pomodoro en curso | **No** (v1) | — | Cada aparato avisa lo suyo; si no, dos avisos |
| Frases «que no entendí» | **No** | — | Texto libre, apagado de fábrica, es del aparato donde se escribió |
| Documentos, **audios** y **transcripciones** | **No** | — | Tamaño y sensibilidad. Excepción posible y explícita: mandar **un audio** al PC para transcribirlo, una vez, por el canal cifrado, sin quedar en el registro de cambios |
| Memoria del agente y conversaciones | **No** | — | Viven en `~/.openclaw`; el celular no tiene agente |
| Secretos (token del aula, iCal, GitHub, claves de OpenClaw) | **Nunca** | — | Regla del proyecto |
| `funciones.json`, ajustes de pantalla | **No** | — | Es por aparato (decisión 9) |

### 4.2 El modelo recomendado: registro de cambios por registro

Idea en cuatro piezas, pensada para que **no cambie el SQL de las 11 clases**:

1. **Ids globales sin cambiar de tipo.** Hoy los ids son enteros locales (`integer primary key`) y los usan las claves foráneas, los 94 pedidos del puente y la interfaz. Propongo conservarlos **numéricos**, repartiendo el espacio por aparato: `id = aparato × 2^40 + contador` (cabe en un entero seguro de JavaScript, 2^53, y alcanza para 8.192 aparatos [C]). El PC actual queda como «aparato 0», así que **los ids existentes no cambian** y no hay migración de datos; el celular recibe su número al emparejarse. La alternativa, ULID/UUID como texto, es más limpia pero cambia el tipo del id en todo el puente, el MCP y la isla (decisión 10).
2. **Captura con disparadores (`triggers`) de SQLite.** Cada tabla sincronizable lleva un disparador que anota en una tabla `cambios` (`aparato`, `seq`, `hlc`, `tabla`, `fila`, `operación`, `campos`). Así se capturan **todas** las escrituras sin tocar las clases, incluidas las del servidor MCP y las de una extensión de widget. Al aplicar un cambio ajeno, un indicador temporal desactiva el disparador para no reenviarlo. (El repo ya usa triggers en 5 archivos [V].)
3. **Reloj híbrido (HLC).** Cada cambio lleva marca de tiempo física + contador lógico + número de aparato: ordena de forma total aunque los relojes del PC y del teléfono difieran unos segundos.
4. **Intercambio por «lo que te falta».** Cada aparato guarda hasta qué `seq` recibió de cada otro; al verse, se mandan solo los cambios posteriores. Cuando todos los aparatos emparejados confirmaron un cambio, se **compacta** (queda lo último de cada fila).

**Reglas de conflicto** (el caso real es una persona que casi nunca edita lo mismo en dos aparatos a la vez, así que la regla debe ser simple y explicable):

| Tipo de dato | Regla |
|---|---|
| Solo-agregar (gastos, aportes de ahorro, registro de estudio) | **Unión**: nada se pierde; un borrado posterior gana |
| Edición de campos (nota de una evaluación, color de un ramo, presupuesto, archivado) | **Gana el último por campo** (HLC) |
| Estado de una tarjeta de repaso (caja de Leitner) | Gana la **última revisión**; las dos revisiones quedan en el historial |
| Bloques de estudio (hecho / saltado) | Gana el último |
| Dos filas únicas creadas a la vez (el mismo ramo «Cálculo» en el PC y en el celular) | Se conserva la **más antigua** y se reapuntan las filas hijas a ella |
| Borrado contra edición simultánea | **El borrado gana** (el usuario quiso olvidar) |

**Cómo se prueba sin teléfonos:** dos `AlmacenMemoria` en Node que reciben escrituras al azar en cualquier orden y deben **converger al mismo estado**, más casos fijos para cada regla de la tabla. Es la parte con más riesgo de errores sutiles y la que más conviene probar con datos aleatorios (propiedades), no a mano.

### 4.3 Opciones comparadas

| Opción | Qué es | A favor | En contra | Veredicto |
|---|---|---|---|---|
| **A. Registro de cambios propio** (4.2) | Triggers + HLC + «lo que te falta» sobre el mismo SQLite | El SQL no cambia; sin dependencias; datos chicos; fácil de explicar; **funciona igual sobre WiFi, Tailscale o un relé futuro** | Hay que escribirlo y probarlo bien ([C] varias semanas); la fusión de filas únicas es a mano | **Recomendada** |
| **B. cr-sqlite** (CRDT dentro de SQLite) | Extensión que hace que las tablas converjan sin lógica propia | Converge «solo»; mismo SQLite. `expo-sqlite` puede cargar extensiones [V] y Expo publicó una prueba de concepto de integración [V, 2023] | Mantenimiento: el repositorio muestra más de 2.100 commits y pruebas automáticas, pero **no pude verificar la fecha del último lanzamiento** [S]; exige convertir cada tabla y tiene restricciones con claves únicas y foráneas **[S]**; en iPhone cargar una extensión exige compilarla dentro de la app **[S]** | Plan B; mirarla en la fase 4 con datos reales |
| **C. Automerge / Yjs** | Documentos CRDT | Muy bueno para texto colaborativo | Cambiaría el modelo de datos de relacional a documentos; el núcleo de Automerge es Rust compilado a Wasm y Hermes no ejecuta Wasm **[S]** | Descartada |
| **D. PowerSync, ElectricSQL, Turso/libSQL** | Sincronización contra un servidor | Maduras (el SDK de React Native de PowerSync tuvo versión el 7-7-2026 [V]) | **Exigen un servidor** (base Postgres/Mongo + servicio, o la nube del proveedor): choca con «sin nube» | Descartada **hoy**; si algún día se decide la nube, el registro de cambios (A) se puede transportar por ahí sin reescribir |
| **E. Pedidos al puente** (el plan multiplataforma anterior) | El celular sin datos propios, pide todo al PC | Muy simple | **No funciona sin el PC** (viola la decisión del celular autónomo) | Solo para la «foto» del PC y las preguntas pendientes |
| **F. Exportar / importar un archivo** | Respaldo cifrado a mano | Sin red, sirve de red de seguridad | Nada automático | Complemento del paso 1 |

### 4.4 Transporte

| Camino | Qué hace falta | Problemas | Papel |
|---|---|---|---|
| **Misma WiFi** | El PC escucha en un puerto de la red local (WebSocket) y se anuncia por Bonjour; el QR trae también las direcciones | iPhone pide el permiso «Red local» y declarar el servicio Bonjour **[S]**; macOS pregunta si Brote acepta conexiones entrantes **[S]**; **muchas WiFi de campus aíslan a los clientes entre sí** **[S]**: justo donde está el estudiante. En casa funciona; en la universidad probablemente no | **Camino principal** (la mayor parte de la sincronización ocurre en casa) |
| **Tailscale** | Su app en el PC y en el celular; Brote conecta al nombre del PC en la red privada | Fricción de instalación; el plan gratuito personal admite 3 usuarios y 100 aparatos [V, fuente secundaria]. OpenClaw ya sabe abrir su Gateway en la red de Tailscale (`--tailscale serve`, nunca `funnel`) [V, `docs/plan-multiplataforma.md` §3] pero **el servidor de sincronización de Brote es otro** | **Opcional y documentado**: resuelve campus y casa/universidad |
| **Bluetooth entre PC y celular** | — | Ancho de banda y emparejamiento incómodos; en iPhone casi no corre en segundo plano | **No** |
| **Un relé cifrado** | Un buzón en internet que solo ve bytes cifrados | Es infraestructura propia (costo y operación) | **No hoy, sin cerrar la puerta** (4.8) |

El PC necesita para esto un **servidor de sincronización dentro del puente** (hoy el puente es un proceso hijo de la ventana y ya tiene un servidor HTTP en `127.0.0.1` con token para los hooks, `servidor-hooks.ts`). Debe ser **opcional** (una función apagada de fábrica, «Celular»), escuchar solo mientras haya emparejamiento activo y rechazar todo lo que no venga de un aparato emparejado.

### 4.5 Emparejamiento y cifrado

1. En el PC: Configurar → Celular → «Emparejar»: muestra un **QR** con la versión del protocolo, el id del PC, su clave pública, las direcciones y un secreto de un solo uso que **caduca en 5 minutos** [C].
2. En el celular: escanea el QR (permiso de cámara) y hace un **intercambio de claves** (X25519) con cifrado autenticado (ChaCha20-Poly1305); ambos muestran un **código corto de 6 dígitos** para comparar, que impide que alguien se meta en medio. El PC pide «¿Emparejar «iPhone de …»?».
3. Las claves de largo plazo se guardan en el **Llavero del PC** (ya existe, `secretos.rs`) y en el **Llavero de iOS / Keystore de Android** **[S: `expo-secure-store`]**.
4. **Cifrado en la aplicación, no en el transporte:** así protege igual por WiFi, por Tailscale y, mañana, por un relé que no vería nada. Hay bibliotecas de JavaScript puro y auditadas para estas primitivas (la familia `@noble`) **[S: confirmar que corren en Hermes]**. **No se inventa criptografía:** se usa un protocolo conocido (Noise o sealed boxes) y se pide **revisión de seguridad** antes de publicar.
5. **Permisos de un celular emparejado:** solo sincronizar y mandar preguntas; no configura el PC, no instala conectores, no toca secretos. Revocar = borrar su clave en Configurar → Celular (como `openclaw devices revoke`, pero en el puente de Brote).
6. **Cifrado en reposo en el teléfono:** `expo-sqlite` admite **SQLCipher** [V]; la clave iría en el Llavero. Costo: los widgets (que leen la misma base por App Group) necesitan acceso a esa clave **[S]**. Decisión 11.

### 4.6 Fuente de verdad

No hay una fuente única: **cada fila vale lo que diga su último cambio** (4.2), y el PC es solo el **concentrador** (guarda el registro y lo reparte). La excepción es la «foto»: ahí **el PC es la autoridad** (aula, plan de Claude, sesiones), porque solo él tiene el token. Efecto secundario bueno: como el PC conserva todo el registro, **si el PC muere, el celular guarda una copia** de los datos sincronizables y podría restaurar un PC nuevo (función futura, útil como respaldo).

### 4.7 «Olvidar» en todos los aparatos

La promesa de `docs/privacidad.md` («lo ves y lo borras») no puede romperse por una copia olvidada. Reglas:

1. **Borrar es una operación del registro** (`borrar fila`, `purgar tabla con filtro`, `olvidarlo todo`), igual que escribir: viaja a los demás y **cada aparato la obedece**.
2. **El registro de cambios también guarda datos** (los valores viejos de cada fila). Al olvidar hay que **vaciar esos valores del registro** y compactar, con `PRAGMA secure_delete` y `VACUUM` **[S]**; si no, el dato «borrado» seguiría en `cambios`. Es el error clásico de este diseño y debe tener prueba propia.
3. **Lápidas con acuse:** la orden de borrar se guarda hasta que **todos los aparatos emparejados** confirmen; solo entonces se compacta.
4. **Aparato ausente:** la orden espera. La pantalla lo dice («pendiente en el iPhone, sin conexión hace 12 días») y ofrece **revocarlo**, lo que impide que sincronice de nuevo **pero no puede borrarle los datos a distancia**; por eso conviene bloquear la app con biometría y cifrar la base (4.5).
5. **Lo que el celular no puede olvidar:** la memoria del agente (vive en el PC). «Lo que sé de ti» del celular debe decir **«esto es solo lo que guardo en este teléfono; lo que Brote recuerda de ti con IA está en tu PC»**.
6. **Copias de seguridad del teléfono:** iCloud y la copia de Google pueden llevarse la base por su cuenta **[S]**. Recomiendo **excluir la base de esas copias** (en iPhone, marcar el archivo como excluido; en Android, desactivar la copia automática de ese archivo) porque la promesa es que los datos viven en los aparatos del usuario y el PC ya guarda una copia (decisión 11).

### 4.8 Si el PC está apagado, y la puerta de la nube

- **PC apagado o dormido:** el celular **sigue funcionando completo** con sus datos; el registro de cambios crece unos pocos KB; la pantalla muestra «sincronizado hace X»; la «foto» muestra «actualizado hace…»; las preguntas pendientes esperan. Nada se pierde.
- **No se cierra la puerta de la nube:** la sincronización por registro de cambios con cifrado en la aplicación funciona igual si mañana el transporte es un **relé** (buzón cifrado entre aparatos) o un servidor con cuentas. Lo que **no** se hace hoy es diseñar cuentas, relé ni servidor (regla de `plan-multiplataforma.md` §11: «no estorbar»).

### 4.9 Ruta por pasos (cada paso se puede parar)

1. **Almacén + ids por aparato + captura por triggers + exportar/importar archivo cifrado.** Sin red, probado con dos bases en memoria.
2. **Sincronización por WiFi con el PC como concentrador**, emparejamiento por QR y cifrado.
3. **La «foto» del PC y las preguntas pendientes** (pedido/respuesta sobre el mismo canal).
4. **Tailscale documentado** como camino fuera de casa.
5. **Solo si lo decides:** relé cifrado (una decisión aparte, con su propio plan).

## 5. Aparato físico: lo que el celular debe soportar

No se diseña el aparato; solo lo que el celular necesita para no cerrarle la puerta. Todo lo siguiente es sobre el lado del teléfono; cifras y chips del ESP32 siguen **sin investigar** (`docs/plan-sin-ia.md` §7.5).

**Rol Bluetooth:** el celular es el *central* (cliente GATT) y el ESP32 el *peripheral* (servidor): el aparato publica características y el celular se suscribe a sus notificaciones y le escribe estado.

**iPhone, segundo plano [V, Apple]:** con el modo de fondo `bluetooth-central`, una app suspendida despierta unos segundos (del orden de 10) por cada evento Bluetooth; con **preservación y restauración de estado** el sistema relanza la app si **él** la terminó, **pero no si el usuario la cierra deslizándola**; no se puede «consultar cada tanto» con la app cerrada: **es el aparato quien debe empujar** los datos. **Android [V, documentación de Android]:** desde Android 14 todo servicio en primer plano debe declarar su tipo en el manifiesto; hay un tipo `connectedDevice` (para interactuar con un aparato externo) y uno `microphone` (con su permiso propio) que serviría a la voz futura. Los permisos de Bluetooth en tiempo de ejecución (`BLUETOOTH_SCAN`/`CONNECT`) y los ahorradores de batería de cada fabricante son **[S]** y se prueban en un teléfono real.

**Qué le pide el aparato al celular (y por tanto qué debe poder dar):**

| Qué | Cómo se resuelve en el celular |
|---|---|
| **Estado** (ánimo de Brote, pomodoro, próxima clase, presupuesto del día) | Un modelo de «tarjeta chica» calculado con la misma lógica pura de las tarjetas (`agente/tarjetas.ts`, `formato.ts`) |
| **Avisos programados** (10 min antes de una clase, entrega, fin de pomodoro) | **Se le manda el horario por adelantado** (hora absoluta + sincronía de reloj) y el aparato avisa con su propio reloj: el teléfono **no puede garantizar que despierta a la hora exacta** en iPhone. Es la decisión de diseño más importante para el aparato |
| **Botones** | Un **código de evento** (no texto libre): «iniciar pomodoro», «anotar el gasto frecuente 2». El celular decide qué significa; la lista es cerrada, como `plata-anotar` |
| **Voz** (apretar y hablar, idea posterior, `plan-sin-ia` §13) | El celular necesitará audio por BLE, voz a texto y, en Android, servicio en primer plano de tipo micrófono. Hoy no se construye |

**Lo que el diseño del celular debe cumplir desde el día uno, sin construir el aparato:** (1) una abstracción «dispositivo» con **entradas** (eventos de botón) y **salidas** (tarjeta chica, horario de avisos), que hoy solo usa el propio teléfono; (2) un modelo de «horarios para el aparato» en los datos; (3) compilar siempre con **build de desarrollo** (no Expo Go), porque Bluetooth y widgets no corren ahí; (4) el protocolo GATT queda versionado y documentado cuando se diseñe el aparato; (5) elegir la biblioteca de Bluetooth **con una prueba corta con un ESP32 de desarrollo** en la fase 5, no antes.

## 6. Tiendas, cuentas y costos

### 6.1 Cuentas y precios

| Qué | Costo | Notas |
|---|---|---|
| **Apple Developer Program** | **99 USD al año** [V, apple.com, 6-10-2026] | Exige Apple Account con verificación en dos pasos, mayoría de edad en tu región (si eres menor, un padre o tutor puede inscribirse y compartirte la cuenta) y **nombre legal real**, que se muestra como **nombre del vendedor** en la App Store si te inscribes como persona [V, apple.com]. Como organización pide número D-U-N-S **[S]** |
| **Google Play Console** | **25 USD, una sola vez** [V, fuentes secundarias] | Cuenta personal u organización |
| **Tailscale** (opcional, sección 4.4) | Gratis para uso personal (3 usuarios, 100 aparatos) [V, fuente secundaria] | Solo si el usuario lo instala |
| **Compilación** | Expo ofrece compilar en su nube (EAS) con plan gratuito limitado **[S: confirmar límites]**; también se compila local con Xcode y Android Studio | Hoy este Mac **no tiene Xcode ni Android Studio** [V]; para iPhone con compilación local hace falta Xcode (varios GB, **sin verificar el peso**) |
| **Página pública de privacidad** | Gratis o casi gratis | Las dos tiendas piden una **dirección pública** con la política. Tu repo es privado y `docs/privacidad.md` hoy se ve dentro de la app (`privacidad.html`): hay que publicar una copia en un sitio público (otro repositorio o página aparte, **sin código**) |
| **Revisión legal** | A cotizar | Ver 6.4 |

**Total mínimo para estar en las dos tiendas: 124 USD el primer año y 99 USD los siguientes** [C: 99 + 25] (sin legal, sin hardware y sin dominio propio).

### 6.2 Probar sin publicar

- **iPhone, TestFlight:** hasta **100 usuarios internos** (con acceso a App Store Connect) y hasta **10.000 externos**; cada compilación se puede probar hasta **90 días**; la **primera compilación** que se suma a un grupo pasa por revisión de Apple, y las externas pueden requerir revisión beta [V, apple.com]. Sirve para dar a probar a los amigos más adelante.
- **Android, pruebas internas y cerradas:** si la cuenta de **persona** se creó después del 13-11-2023, antes de publicar en producción hay que correr una **prueba cerrada con al menos 12 testers inscritos de forma continua durante 14 días** (bajó de 20 a 12 el 11-12-2024); las cuentas de **organización** están exentas [V, fuentes secundarias; no pude leerlo en la página oficial de Google]. **Cuidado con el cruce con una decisión tuya:** las pruebas con personas están aplazadas «hasta tener Brote montado en PC y celular»; Google las exigiría justo para publicar en Android.
- **Verificación de desarrolladores de Android:** desde el **30-9-2026** (empezando por Brasil, Indonesia, Singapur y Tailandia) todas las apps en dispositivos certificados deben venir de un desarrollador verificado, también las que se instalan por fuera de Play; en 2027 se extiende al resto del mundo [V, Android Developers Blog, junio de 2026]. Chile caería en esa extensión: **registrar la identidad en Play Console antes**.

### 6.3 Qué piden las tiendas a una app con voz, calendario y Bluetooth

| Capacidad | iPhone | Android |
|---|---|---|
| Calendario | Texto de uso del calendario con acceso completo **[S: nombres exactos de las claves]** | `READ_CALENDAR` / `WRITE_CALENDAR`, permiso en tiempo de ejecución |
| Micrófono (Grabar, fase 5) | Texto de uso del micrófono | `RECORD_AUDIO` + servicio en primer plano de tipo `microphone` con su permiso propio [V, documentación de Android] |
| Cámara (escanear el QR) | Texto de uso de la cámara | `CAMERA` |
| Red local (sincronizar con el PC) | Permiso «Red local» y servicios Bonjour declarados **[S]** | Permiso de red local / tráfico en claro **[S]** |
| Bluetooth (aparato, fase 5) | Texto de uso de Bluetooth y modo de fondo `bluetooth-central` [V, Apple] | `BLUETOOTH_SCAN`/`CONNECT` + servicio `connectedDevice` [V, Android] |
| Avisos | Permiso de notificaciones | `POST_NOTIFICATIONS` (Android 13+) **[S]**; alarmas exactas para el pomodoro: la tienda restringe `USE_EXACT_ALARM` a apps de alarma o calendario **[S]**: verificar si un pomodoro califica |
| **Etiquetas de privacidad** | «Datos recogidos» (App Store) | «Seguridad de los datos» (Play) |

Sobre las **etiquetas**: si ningún dato llega al desarrollador, ambas permiten declararlo así; el emparejamiento con **tu propio PC** no es «recoger datos» en el sentido de la tienda **[S]**, pero la redacción exacta la debe revisar quien conozca los formularios. Además: las dos tiendas piden **política de privacidad pública**; no hay cuentas, así que el requisito de «borrar la cuenta desde la app» **no aplica** **[S]**; la ficha **no puede decir «con Claude» ni prometer «IA incluida»** (`docs/modelo-de-negocio.md`), y **la versión del celular no lleva IA**, así que el límite de **18 años de la cuenta de Claude no se aplica a la app del celular** (sí a la IA del PC).

### 6.4 Ley 21.719, menores y tiendas (marca: **necesita abogado**)

Lo que encontré, todo en fuentes secundarias (**no pude abrir el texto oficial en la Biblioteca del Congreso** y una de las notas habla del proyecto, no de la ley final):

- **Entra en vigor el 1-12-2026** [V, fuentes secundarias]: antes de cualquier publicación posible. Crea la Agencia de Protección de Datos Personales; multas de hasta 5.000, 10.000 y 20.000 UTM según gravedad.
- **Consentimiento:** libre, específico, inequívoco e informado, con acción afirmativa y lenguaje claro; revocable con la misma facilidad con que se dio.
- **Datos sensibles:** la lista incluye la **situación socioeconómica** (algo distinto del RGPD europeo) además de salud y biometría [V, fuente secundaria]. **Pregunta abierta: los gastos, el presupuesto y las metas de ahorro de Brote ¿son «situación socioeconómica»?** Si lo son, el tratamiento exige las reglas de datos sensibles y, para menores de 16, consentimiento de los padres.
- **Menores:** menores de 14, consentimiento de padres o representantes; de 14 a 17, se aplican las reglas de los adultos, **salvo los datos sensibles de menores de 16**, que requieren a los padres; el tratamiento debe guiarse por el interés superior del niño y su autonomía progresiva [V, fuentes secundarias].
- **Brote apunta a universitarios y en Chile varios entran con 17 años.** La parte sin IA no depende de Claude, pero **sí trata datos de menores**.
- **Lo que nuestro diseño ayuda:** nada llega al desarrollador (sin nube), así que quizá el desarrollador no sea «responsable» de esos datos **[S]**; y hay ver, exportar y borrar (derechos de acceso, portabilidad y supresión), que el paso 1 de la sincronización (exportar archivo) ayuda a cumplir.

**Qué necesita un abogado (lista para llevar):** (1) si Brote, sin servidores propios, es «responsable de datos» respecto de lo que se guarda en el teléfono; (2) si gastos, presupuesto y metas son datos sensibles; (3) la **edad mínima** que declarar en las tiendas y en el primer uso (mi recomendación inicial: **18+ o al menos 16+**, decisión 14); (4) el texto del consentimiento y de la política pública; (5) qué se declara en las etiquetas de privacidad; (6) la revisión de los Consumer y Commercial Terms de Anthropic (pendiente de antes, ya no bloquea al celular porque no lleva IA); (7) si grabar a terceros desde el teléfono cambia algo respecto del PC (fase 5).

## 7. Fases con condición de salida

Estimaciones **[C, muy gruesas: ±100 %, una sola persona, tiempo parcial]**. Cada fase termina con un punto en el que se puede parar. Las pruebas automáticas corren en el Mac con Node; «solo en un teléfono real» es lo que ningún emulador ni Node demuestra.

| Fase | Objetivo | Qué se prueba y cómo | Condición de salida |
|---|---|---|---|
| **0. Verificar herramientas** (~1 semana) | Un **prototipo desechable en una carpeta temporal fuera del repo** (con tu permiso, y con Xcode/Android Studio instalados si decides instalarlos) que contesta 5 preguntas: **(1)** ¿el corpus (672 frases) da en **Hermes** las mismas cifras que en Node? **(2)** ¿`expo-sqlite` síncrono pasa las pruebas de `Gastos`, `Ramos` y `Notas` detrás de la capa `Almacen`? **(3)** ¿el personaje corre fluido (cuadros por segundo y batería) portado a Skia y, alternativamente, dentro de un componente web? **(4)** ¿se puede leer el calendario del teléfono, programar una notificación local con la app cerrada e iniciar una Live Activity (iPhone)? **(5)** ¿compila una build de desarrollo con una biblioteca de Bluetooth? | Corpus en el aparato con la pantalla «Diagnóstico» y comparación con Node; pruebas del motor con el adaptador Expo; medición de cuadros por segundo; **todo solo en un teléfono real** (los emuladores no miden batería ni notificaciones fiables) | Un cuadro ✓/✗ con la decisión **Expo o Capacitor**. Si ambas fallan en (1) o (2), se vuelve a este documento |
| **1. Núcleo compartido y almacenamiento** (1–2 semanas) | Refactor del motor: `Almacen` con tres implementaciones; `Gastos.abrir(ruta)` conserva la API de hoy; ids por aparato | Los **56 archivos de prueba del motor** + el corpus con `AlmacenNode` y `AlmacenMemoria` (idénticas cifras); pruebas de adapter y desktop siguen en verde; `pnpm --dir apps/desktop tipos` limpio | **El PC se comporta igual** (lo confirmas tú en el Mac) y las cifras del corpus no cambian |
| **2. Gastos y pomodoro, sin conexión** (3–4 semanas) | App Expo con Brote, pestañas Brote y Plata, «+ Gasto», autocompletado, confirmaciones, presupuesto, metas de ahorro y pomodoro con notificación local / Live Activity | Lógica con las pruebas reutilizadas; pantallas con pruebas de componentes; **en un teléfono real**: modo avión, cerrar la app, notificaciones con la pantalla bloqueada, rotación, tamaños de letra, latencia por frase en tu teléfono (meta [C]: menos de 100 ms) | Una semana de uso real tuyo anotando gastos, sin pérdida de datos; corpus en el aparato = Node |
| **3. Calendario, estudio y avisos** (4–6 semanas) | Agenda con el calendario del teléfono, ramos, notas, repaso, plan de estudio, estadísticas, resumen de la mañana, Novedades, widgets (iPhone), «Lo que sé de ti» local, decisión de cifrado en reposo | Pruebas del motor; casos de permiso negado; **cambio de hora** (el motor ya recorre en hora de pared [V]); **solo en un teléfono real**: lectura de un calendario de Google ya agregado al teléfono, escritura de bloques, widgets, notificaciones diarias | Checklist completa; ningún permiso se pide sin que el usuario lo haya iniciado |
| **4. Sincronización con el PC** (4–6 semanas) | Triggers + HLC + lápidas; servidor opcional dentro del puente; Configurar → Celular con QR; la «foto» del PC; preguntas pendientes; olvidar en todos | **Pruebas con datos aleatorios** de dos y tres bases que deben **converger**; prueba de que **olvidar vacía el registro de cambios**; pruebas de rechazo con el puente real en una carpeta temporal (sin token, token revocado, pedido fuera de la lista); **nunca con datos reales**. **En aparatos reales**: emparejar por QR, WiFi de casa, modo avión y volver, PC dormido, Tailscale, WiFi con aislamiento | **Siete días** de uso en PC y celular sin pérdida ni duplicados; olvidar probado con un tercer aparato ausente y luego presente; **revisión de seguridad** del protocolo hecha |
| **5. Aparato (y Grabar)** (2–4 semanas, depende del hardware) | Lado celular del Bluetooth con una **placa de desarrollo ESP32**: botón → evento, horario de avisos entregado por adelantado, tarjeta chica; decisión sobre **Grabar** en el celular | Solo con la placa y teléfonos reales: conexión con la pantalla apagada, app suspendida, app cerrada por el sistema (restauración) y cerrada **a mano** (no restaura) en iPhone; servicio en primer plano en Android | Resultado documentado de lo que **sí** funciona en segundo plano en cada sistema; se decide si el aparato avisa con su propio reloj |
| **6. Publicar** (2–4 semanas + la espera de Google) | Cuentas, etiquetas de privacidad, textos y página pública, TestFlight, prueba cerrada de Android | Revisión legal (6.4); TestFlight interna y externa; los 12 testers × 14 días de Google si la cuenta es personal | La app en TestFlight y en prueba cerrada de Google; **aquí se reanudan las pruebas con personas y el video** (aplazados). Firmar la app del PC sigue siendo un tema aparte |

**Qué solo se puede probar en un teléfono real:** notificaciones con la pantalla bloqueada y el ahorro de batería de cada fabricante, Live Activities y widgets, permisos reales de calendario y micrófono, Bluetooth en segundo plano, rendimiento del lienzo y batería, el teclado y el autocorrector reales, WiFi con aislamiento entre clientes y los avisos de «Red local».

## 8. Riesgos, cosas sin verificar y decisiones que necesito de ti

### 8.1 Riesgos principales

| # | Riesgo | Por qué importa | Mitigación |
|---|---|---|---|
| R1 | **Hermes no es Node**: una expresión regular, `normalize` o `Intl` se comporta distinto y el motor entiende menos | El corpus es la vara de calidad del celular | Fase 0, pregunta 1; el corpus en el aparato (3.5) |
| R2 | **Reescribir las pantallas es el mayor costo** (`panel.ts` 3.610 renglones + 8 vistas) | Una persona, meses | Reutilizar los 36 archivos de lógica de `agente/*`; construir pestaña por pestaña (fases 2 y 3) |
| R3 | **Sincronización con pérdida o duplicación de datos** | Es el riesgo con más daño: gastos o notas perdidos | Pruebas con datos aleatorios; exportar/importar como red de seguridad; una semana de uso real antes de salir de la fase 4 |
| R4 | **El registro de cambios guarda lo que se «olvidó»** | Rompería la promesa de privacidad | Vaciar valores al olvidar, compactar, prueba específica (4.7) |
| R5 | **WiFi de campus que aísla a los clientes** | La sincronización no ocurriría en la universidad | Casa como camino principal; Tailscale opcional (4.4); mostrar «sincronizado hace X» |
| R6 | **iPhone no despierta a la hora exacta** (Bluetooth y notificaciones) | Un aparato que no avisa a tiempo no sirve | Horario por adelantado y reloj propio en el aparato (5) |
| R7 | **Ritmo de Expo**: SDK 56 (21-5-2026), SDK 57 (30-6-2026) y SDK 58 en beta (15-9-2026) [V] ≈ una versión cada 6 a 10 semanas [C] | Mantenimiento recurrente para una persona | Fijar versiones como ya se hace con OpenClaw y actualizar solo cuando haga falta; no seguir cada SDK |
| R8 | **Crear criptografía propia** o implementarla mal | Datos financieros y académicos | Protocolo conocido, bibliotecas auditadas, revisión externa antes de publicar |
| R9 | **Rechazo de las tiendas o cambios de reglas** (verificación de desarrolladores de Android; textos de uso; alarmas exactas) | Retrasa la publicación | Leer cada lista de requisitos en la fase 6 y empezar la verificación de identidad antes |
| R10 | **Datos de menores y datos «sensibles»** bajo la ley nueva | Multas de hasta 20.000 UTM [V, fuente secundaria] | Abogado antes de publicar; edad mínima declarada (decisión 14) |
| R11 | **El PC apagado** | El celular no sincroniza ni responde preguntas | El celular funciona solo; indicadores de «hace cuánto» (4.8) |
| R12 | **Dependencia de dos cadenas de herramientas** (Xcode, Android Studio) en un Mac que hoy no las tiene | Instalarlas pesa y toma tiempo | Pedirte permiso con pesos y orígenes antes (decisión 3); considerar la compilación en la nube de Expo para iPhone **[S]** |

### 8.2 Lo que **no** pude verificar (todo debe aclararse en la fase 0 o antes de publicar)

Marcado **[S]** a lo largo del documento. Las más importantes: comportamiento de Hermes con `\p{…}`, `normalize` e `Intl.DateTimeFormat`; que Hermes no ejecuta Wasm; que `expo-sqlite` entrega `changes`/`lastInsertRowId` con los nombres que supongo; que el personaje rinda en Skia o en un componente web; la biblioteca de widgets para Android; los nombres y reglas exactos de los permisos de iOS y Android (calendario, red local, alarmas exactas); si una Live Activity solo se inicia con la app abierta; cómo se comportan Bonjour y la «Red local» en iPhone; el estado de mantenimiento de cr-sqlite; que las bibliotecas de criptografía de JavaScript corran en Hermes; los límites del plan gratuito de compilación de Expo; el peso de Xcode y Android Studio; el texto oficial de la Ley 21.719 (solo leí fuentes secundarias, y una habla del proyecto y no de la ley final); que Chile entre a la verificación de desarrolladores de Android en 2027; la regla exacta de Google de 12 testers (no la pude leer en su página oficial); qué dice una etiqueta de privacidad para un emparejamiento con tu propio PC. **Tampoco corrí ningún prototipo ni emulador**: todo lo que el documento afirma del código sale de leerlo y contarlo con `grep`.

### 8.3 Decisiones (cada una con mi recomendación y alternativas)

1. **Herramienta.** Recomendado: **Expo + núcleo TypeScript compartido + módulos nativos finos**, con **Capacitor de plan B** según el resultado de la fase 0 (3.6). Alternativas: Capacitor desde ya (más interfaz reutilizada, pero volver asíncrono todo el motor); Tauri móvil (descartada: alfa de la versión 3 y mucho Swift/Kotlin); Flutter, nativo, PWA (descartadas).
2. **El personaje en el celular.** El personaje es definitivo (decisión tuya del 6-10-2026), así que el celular debe verse **idéntico**. Recomendado: en la fase 0 probar **las dos** vías y quedarse con la que rinda: (a) **correr el `personaje.ts` actual dentro de un componente web** (cero reescritura, garantiza identidad), o (b) **portarlo a Skia** (más nativo y menos batería, [C] 3–5 días de reescritura de ~20 métodos de dibujo). Por defecto, (a) si rinde bien.
3. **Permiso para instalar Xcode y Android Studio** (hoy no están: `xcode-select` apunta solo a las herramientas de línea de comandos y no hay carpeta de Android [V]) **y para correr emuladores.** No hago nada sin tu permiso y te diré antes: **qué, de dónde y cuánto pesa** (los pesos no los verifiqué). Recomendado: instalarlos solo al empezar la fase 0, y probar siempre en teléfonos reales. Alternativa para iPhone: compilación en la nube de Expo, sin Xcode local **[S]**.
4. **Prioridad iPhone o Android.** Recomendado: **desarrollar en el teléfono que tengas (si tienes iPhone, empezar por él)**, porque es la plataforma con más restricciones (Bluetooth, segundo plano, notificaciones) y lo que funcione ahí suele funcionar en Android; y **publicar primero donde cuente menos esperar** (Google cuesta 25 USD una vez, pero exige 12 testers × 14 días si la cuenta es personal). Alternativa: Android primero, con más usuarios posibles en Chile **[S: sin cifras]**. Necesito saber qué teléfonos tienes (abajo).
5. **Preguntas pendientes para el PC (sección 2.4).** Recomendado: **el PC no las ejecuta solo**; muestra «Tienes N preguntas del celular» y se responden cuando el usuario lo pida en la isla; más adelante un modo automático solo con herramientas de lectura. Alternativas: automático desde el inicio (el agente podría pedir permisos con nadie delante); no ofrecer la bandeja (solo el mensaje «vamos al PC»).
6. **Temporizadores en la versión 1.** Recomendado: **no se sincronizan** (cada aparato avisa lo suyo; evita avisos dobles); solo se sincroniza el **registro de estudio** ya terminado. Alternativa: un pomodoro compartido entre aparatos (más caro y con conflictos de reloj).
7. **Grabar y transcribir en el celular.** Recomendado: **aplazar a la fase 5** y, cuando llegue, **grabar en el celular y mandar el audio al PC por el canal cifrado para transcribirlo allá** (el PC ya tiene `whisper-cli`); transcribir en el teléfono (`whisper.rn`, modelo `base` de ~148 MB [V, `modelos-whisper.ts`]) como mejora posterior. Alternativas: transcribir en el teléfono desde el inicio (pesado, batería); no grabar en el celular.
8. **Sincronización.** Recomendado: **registro de cambios propio** (4.2), PC como concentrador. Alternativas: cr-sqlite (revisar en la fase 4), PowerSync y similares (exigen servidor), Automerge/Yjs (no encajan).
9. **Funciones prendidas por aparato.** Recomendado: **cada aparato tiene las suyas** (el celular solo ofrece lo que soporta; `funciones.json` no se sincroniza). Alternativa: sincronizar la lista y apagar lo no soportado.
10. **Ids de las filas.** Recomendado: **enteros con espacio por aparato** (`aparato × 2^40 + contador`; el PC actual es el aparato 0, sin migrar datos). Alternativa: ULID/UUID como texto (más limpio, pero toca el puente, el MCP y la isla).
11. **Datos en el teléfono.** Recomendado: **bloqueo con biometría al abrir, base con SQLCipher y clave en el llavero** (si los widgets lo permiten, **[S]**) y **excluir la base de las copias de iCloud/Google** (el PC ya tiene copia). Alternativas: nada de esto (menos fricción, más riesgo si se pierde el teléfono); cifrar pero permitir la copia en la nube (más cómodo, rompe «todo vive en tus aparatos»).
12. **Transporte.** Recomendado: **misma WiFi (descubrimiento por Bonjour y dirección manual) y Tailscale opcional documentado**. Alternativas: solo Tailscale (más fricción, funciona en todas partes); un relé cifrado desde ya (infraestructura propia: decisión aparte).
13. **Servidor de sincronización en el puente.** Recomendado: una **función «Celular» apagada de fábrica**, que abre el puerto solo con un emparejamiento activo, con lista cerrada de pedidos. Alternativa: servidor siempre escuchando (más cómodo, más superficie de ataque).
14. **Edad mínima y menores.** Recomendado: declarar **18+** en las tiendas y en el primer uso mientras no haya revisión legal (coincide con el límite de la IA del PC y evita el problema de datos sensibles de menores de 16), y **bajar a 16+** solo con visto bueno del abogado. Alternativa: sin límite (riesgo: universitarios de 17 años y datos que podrían ser «sensibles»). **Necesita abogado.**
15. **Tipo de cuenta de las tiendas.** Recomendado: **cuenta de persona** para empezar, sabiendo que tu nombre legal queda visible como vendedor en Apple [V] y que Google exige los 12 testers [V, secundaria]. Alternativa: constituir una organización (D-U-N-S en Apple **[S]**, sin la regla de los 12 testers en Google): conviene si el negocio del aparato la va a necesitar de todos modos.
16. **Página pública de privacidad.** Recomendado: un **sitio público aparte, sin código**, con una copia de `docs/privacidad.md` (el repo es privado). Alternativa: hacer público el repositorio (no lo recomiendo: tiene decisiones de negocio y del proyecto).
17. **Autorizar el refactor del motor (fase 1) y marcar `docs/plan-multiplataforma.md` como superado en esos puntos.** Recomendado: sí a ambos, con la condición de que **el PC no cambie de comportamiento** y las cifras del corpus queden idénticas. Alternativa: dejar el motor intacto y duplicar la lógica de almacenamiento en el celular (más rápido hoy, deuda grande).
18. **Versiones mínimas.** Recomendado: fijarlas con lo que pida la herramienta elegida (Capacitor 8, por ejemplo, pide iOS 15 y Android API 24 con destino 36 [V]) y con lo que exijan las Live Activities (iOS 16.1 o más **[S]**). Sin verificar; se resuelve en la fase 0.

### 8.4 Lo que necesito saber de ti (no lo puedo averiguar desde el Mac)

1. **¿Qué teléfonos tienes para probar?** iPhone y/o Android, **modelo y versión del sistema**. Esto decide la prioridad y qué funciones (Dynamic Island, widgets) se pueden probar.
2. **¿Instalo Xcode y Android Studio** (decisión 3)? Hoy el Mac (Apple M5, 740 GB libres, Node 24.21 [V]) no tiene ninguno, ni `adb`, ni Flutter.
3. **Presupuesto para las cuentas:** ¿Apple (99 USD al año) y Google (25 USD) ahora, o solo una de las dos para empezar? ¿Persona u organización (decisión 15)?
4. **Prioridad entre iPhone y Android** si tienes los dos (decisión 4).
5. **¿Cuántas horas por semana** puedes dedicarle? Las estimaciones de la sección 7 asumen tiempo parcial.
6. **¿Tienes ya un abogado de confianza** o hay que buscarlo? (Sección 6.4.)

## 9. Fuentes (todas consultadas el 6-10-2026)

**Herramientas**
- Expo, registro de cambios: [expo.dev/changelog](https://expo.dev/changelog) (SDK 56 el 21-5-2026, SDK 57 el 30-6-2026, SDK 58 en beta el 15-9-2026).
- Expo SQLite (API síncrona, WAL, SQLCipher, App Group, extensiones): [docs.expo.dev/versions/latest/sdk/sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/).
- Expo Widgets (estable desde el SDK 56): [docs.expo.dev/versions/latest/sdk/widgets](https://docs.expo.dev/versions/latest/sdk/widgets/) y [expo.dev/blog/ios-widgets-and-live-activities-in-expo](https://expo.dev/blog/ios-widgets-and-live-activities-in-expo). Arquitectura nueva obligatoria desde el SDK 55: reseñas como [pkgpulse.com](https://www.pkgpulse.com/guides/react-native-new-architecture-fabric-turbomodules-expo-2026) (fuente secundaria).
- Capacitor 8, requisitos: [capacitorjs.com/docs/updating/8-0](https://capacitorjs.com/docs/updating/8-0).
- Tauri: [lanzamientos en GitHub](https://github.com/tauri-apps/tauri/releases) (3.0.0-alpha.4 del 1-10-2026), [Tauri 2.0 estable](https://v2.tauri.app/blog/tauri-20/) y [Tauri Mobile Alpha](https://v2.tauri.app/blog/tauri-mobile-alpha/).
- op-sqlite y comparaciones: [powersync-ja/react-native-database-benchmarks](https://github.com/powersync-ja/react-native-database-benchmarks) (secundaria). whisper.cpp en móviles: [whisper.rn](https://www.mintlify.com/mybigday/whisper.rn) y [WhisperKit (arXiv)](https://arxiv.org/html/2507.10860v1).
- iOS PWA: [magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) (secundaria).

**Sincronización**
- [cr-sqlite](https://github.com/vlcn-io/cr-sqlite) (estado de mantenimiento sin verificar con fechas) y la [prueba de concepto de Expo](https://blog.expo.dev/proof-of-concept-expo-sqlite-integration-with-cr-sqlite-4351206fa23d); [PowerSync JS](https://dev.co/databases/open-source/powersync-js) (versión del 7-7-2026, secundaria); [Tailscale, plan gratuito](https://www.costbench.com/software/business-vpn/tailscale/free-plan/) (secundaria).

**Tiendas y plataformas**
- Apple: [inscripción individual](https://developer.apple.com/programs/enroll/) (99 USD, nombre legal visible, padre o tutor si eres menor) y [TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview) (100 internos, 10.000 externos, 90 días).
- Core Bluetooth en segundo plano: [guía de Apple](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html) y [foro de Apple](https://developer.apple.com/forums/thread/773275) (no se restaura tras cerrar a mano; el periférico debe empujar los datos).
- Android: [tipos de servicio en primer plano](https://developer.android.com/guide/components/fg-service-types) y [verificación de desarrolladores](https://developer.android.com/developer-verification/guides) (30-9-2026, ampliación en 2027), [blog de junio de 2026](https://android-developers.googleblog.com/2026/06/android-developer-verification.html).
- Google Play, cuota de 25 USD y la regla de los 12 testers (fuentes secundarias): [choicely.com](https://www.choicely.com/blog/google-play-12-tester-rule), [primetestlab.com](https://primetestlab.com/blog/google-play-developer-fee).

**Ley 21.719 (todas secundarias; no pude abrir el texto oficial en bcn.cl)**
- [Datos sensibles bajo la Ley 21.719](https://alayiatrust.com/blog/datos-sensibles-ley-21719), [autonomía progresiva y datos de niños, niñas y adolescentes](https://actualidadjuridica.doe.cl/autonomia-progresiva-y-tratamiento-de-datos-personales-de-ninos-ninas-y-adolescentes/) (habla del proyecto), [artículo 16 quáter](https://ley.leydedatos.com/proyecto-de-ley/vk2CTQx4n1jzdJTXFE5f8i/art%C3%ADculo-16-qu%C3%A1ter--datos-personales-relativos-a-los-ni%C3%B1os-ni%C3%B1as-y-adolescentes/qYSPs9Z2MsdzBBvBMr9mny), [guía de consentimiento de KPMG](https://assets.kpmg.com/content/dam/kpmg/cl/pdf/2025/10/kpmg-guia-practica-consentimiento.pdf).

**Del repositorio (hecho verificado leyendo y contando):** `CLAUDE.md`; `docs/plan-multiplataforma.md`; `docs/plan-sin-ia.md` §7, §9–§13; `docs/resumen-pc-celular-fisico.md`; `docs/modelo-de-negocio.md`; `docs/privacidad.md`; `docs/comparacion-taby.md`; `packages/motor/src` (imports de Node y de `node:sqlite`, `gastos.ts`, `motor.ts`); `packages/adapter/src/puente.ts` (94 tipos de pedido); `apps/desktop/src` (`agente/*`, `personaje/*`, `panel.ts`); `packages/motor/pruebas` (56 archivos de prueba y el corpus).

## Progreso

- [ ] Aprobar las decisiones de la sección 8 · [ ] Fase 0 verificar herramientas · [ ] Fase 1 núcleo y almacenamiento · [ ] Fase 2 gastos y pomodoro · [ ] Fase 3 calendario, estudio y avisos · [ ] Fase 4 sincronización · [ ] Fase 5 aparato (y Grabar) · [ ] Fase 6 publicar
