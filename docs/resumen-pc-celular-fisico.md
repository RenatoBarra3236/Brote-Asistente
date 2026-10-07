# Brote en el PC, el celular y el espacio físico: cómo quedó (resumen del 6-10-2026)

Resumen de lo decidido y de lo que sigue abierto. El detalle y las fuentes están en `docs/modelo-de-negocio.md`, `docs/plan-sin-ia.md` y `docs/plan-multiplataforma.md` (este último, en pausa y sin aprobar).

## Principios decididos
1. **El software de Brote es gratis, sin suscripciones.** Las ganancias vendrán **solo del Brote físico**.
2. **La IA no se vende.** Cada persona usa la suya (hoy, su cuenta de Claude en el PC). Nunca se promete «Claude incluido».
3. **Todo vive en los aparatos del usuario** (sin nube propia) y **el agente vive en los tres espacios con los mismos datos**.
4. **Celular y aparato van sin IA por ahora**, mejorando lo sin IA al máximo, hasta ver si el modelo da frutos.

## Cómo se comporta en cada espacio

| | **PC** (Mac y Windows) | **Celular** (iPhone y Android) | **Espacio físico** (llavero y aparato de casa) |
|---|---|---|---|
| **Qué es** | La app completa, hoy un prototipo funcionando | Cliente con su propio motor y sus propios datos. **No existe todavía** (falta la app móvil) | Cliente delgado con un **ESP32** (no corre ninguna IA). **Idea, sin diseño** |
| **Entiende lo que escribes** | El motor sin IA (con las mejoras A–F del plan sin IA, **hechas**); opcionalmente un modelo local pequeño (descarga con permiso) | El mismo motor sin IA (TypeScript) y, si el teléfono lo trae, el modelo del sistema (Apple Foundation Models, Gemini Nano) | No entiende texto: botones, luz, vibración, quizá una pantalla chica; **el celular interpreta** |
| **IA conversacional** | **Sí**, con la cuenta de Claude del usuario (por OpenClaw), solo para mayores de 18, u otro proveedor | **No por ahora.** Lo que no puede responder, lo dice con un mensaje amable que lleva al PC (idea: dejar la pregunta pendiente y mostrar la respuesta cuando el PC la dé) | **No** |
| **Datos** | Base local (`~/.asistente-prototipo`), hoy la única | Copia local sincronizada con el PC | Casi ninguno (estado y avisos) |
| **Se conecta con** | El celular, por la misma red WiFi o por una red privada (tipo Tailscale) | El PC (red) y el aparato (Bluetooth de baja energía) | **El celular**, por Bluetooth de baja energía |
| **Funciona sin el otro** | Sí, solo | **Sí**, sin PC (gastos en la micro, agenda, pomodoro), salvo la IA | Solo con el celular cerca; sin él, lo mínimo |
| **Cómo se gana plata** | No se cobra | No se cobra | **Aquí está el ingreso:** primero algo sin electrónica (peluche, láminas) para ver si hay cariño por el personaje; después el aparato |

## Los datos entre los tres
- Sincronización «local primero»: cada aparato guarda lo suyo y se sincronizan al verse (WiFi, red privada o Bluetooth); sin servidor de Brote.
- **Falta decidir:** qué se sincroniza (gastos, ramos, notas, metas, repaso, temporizadores sí; documentos, audios y transcripciones, probablemente no), la fuente de verdad y los conflictos, el emparejamiento seguro (por ejemplo, un QR) y que **«olvidar» borre en los tres**.
- **Lo técnico:** el motor usa `node:sqlite`, que no existe en el celular; el almacenamiento irá detrás de una capa. Las plantillas, los montos, las fechas y **las capas del plan sin IA** (corregir la escritura, entender por piezas, sugerir, ayuda: `corregir.ts`, `piezas.ts`, `piezas-reglas.ts`, `sugerir.ts`, `ayuda.ts`) son TypeScript puro y se reutilizan tal cual; solo `frases-locales.ts` (lo confirmado y las frases que no entendió) toca SQLite. El celular heredará también el corpus de pruebas.

## El camino con Anthropic y la IA
- **La duda está acotada a una sola pieza: la IA de Claude en el PC.** El celular, el aparato y lo que se vende no ejecutan Claude Code y no dependen de él; si Anthropic dijera que no, solo se perdería esa IA (el resto, y los ingresos, seguiría igual), así que es una duda de **bajo impacto** que no frena nada. Ya es **opt-in doble**: la IA es opcional («Empezar sin IA» y Estado → «Activar la IA») y el `claude -p` solo lo lanza la función «Uso del plan», que el usuario debe prender aparte (no el modo programador, que usa hooks). Para acotarla aún más, se podría quitar esa consulta o poner «Empezar sin IA» como botón principal del asistente.
- Brote usa el `claude` del usuario por OpenClaw. Es una **zona gris**: Anthropic exige los Commercial Terms para «ejecutar Claude Code en tu producto» y no dice nada sobre productos gratis. La carta con las preguntas está lista (nadie la envió); el chat de ventas no resolvió nada.
- Claude exige **18 años o más** para tener cuenta. La IA de Brote es para mayores de 18; la parte sin IA no depende de eso (los datos de menores igual hay que revisarlos con un abogado antes de lanzar).
- **Idea anotada:** si el proyecto va bien, ofrecer la opción de usar **clave de API** (la propia del usuario, o «Brote Plus» con IA incluida en un servidor propio), que serviría a los tres espacios sin zona gris. Solo con demanda real; ver `docs/modelo-de-negocio.md`.

## Orden de trabajo propuesto
1. **Ahora:** hacer commit y probar en un Mac lo ya hecho. Las capas A–F del plan sin IA **están aprobadas y hechas** (6-10-2026; `docs/plan-sin-ia.md`, secciones 8 a 11): el motor entiende errores de escritura y otras formas de decir las cosas, pregunta antes de anotar algo dudoso y sugiere qué quisiste decir; lo pendiente es probarlo en un Mac y con personas.
2. **Pruebas con 3–5 personas** (gratis, ojalá mayores de 18) y, en paralelo, lista de espera del Brote físico (peluche o láminas primero).
3. **App móvil sin IA:** capa de almacenamiento, sincronización con el PC, emparejamiento, mensaje «vamos al PC».
4. **Aparato con ESP32** (llavero primero), cuando la app móvil exista.
5. **Firmar** la app (después de las pruebas y de la versión móvil).

## Decisiones que siguen abiertas
- Las de modelo local pequeño (G1–G6; el plan sin IA A–F ya está aprobado y hecho) y las 4 notas de `docs/plan-sin-ia.md` sección 11 (aprendido sin preguntar, dos montos, más frases).
- El diseño de sincronización (qué, cómo y con qué cifrado) y el del aparato (placa, Bluetooth en segundo plano en iPhone, homologación en Chile, precio).
- Qué se vende primero en lo físico y cómo validar que alguien lo quiere.
- Enviar o no la carta a Anthropic, y una revisión legal de los términos completos.
