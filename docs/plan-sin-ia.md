# Plan: perfeccionar Brote sin IA (propuesta del 6-10-2026; **aprobado y hecho el 6-10-2026**, ver secciones 8 a 10)

Pedido del usuario: el apartado sin IA está limitado a comandos escritos casi textuales; con un pequeño error gramatical no entiende, y si el usuario no tiene IA, la app «simplemente no hace nada». Hay que perfeccionar todas las secciones débiles sin IA. Con la decisión de que el software es gratis (docs/modelo-de-negocio.md), la parte sin IA pasa a ser **el producto principal para quien no tiene Claude**, y hay que tratarla así.

Método de siempre: este documento fue una **propuesta**; el usuario aprobó las 9 decisiones recomendadas de la sección 5 (6-10-2026, sin la capa G ni el modelo local) y se implementó (secciones 8 a 10). Nada de esto toca la parte con IA.

## 1. Cómo entiende hoy el motor (leído en el código)

- `packages/motor/src/plantillas.ts`: unas 100 **plantillas** escritas a mano con ranuras (`{monto}`, `{cosa}`, `{periodo}`, `[opcional]`, `(a|b)`). El texto se normaliza (minúsculas, sin tildes ni signos) y se prueba **plantilla por plantilla, en orden; gana la primera que calza entera** (`^…$`). Una palabra de más, de menos, en otro orden o con una letra cambiada y no calza.
- `motor.ts`: si ninguna calza, el mensaje va al agente; sin IA, el usuario recibe «La IA no está activada… las frases con ⚡ funcionan igual» (texto del puente) y nada más. No sugiere qué escribir ni qué quiso decir.
- Lo que sí hace bien: tildes y mayúsculas, montos («5 lucas», «3.500»), periodos y fechas («el viernes 9»), aprendizaje de frases nuevas **solo con ayuda del agente**.

## 2. Medición (batería de 103 frases que armé; indicativa, no estadística)

Batería guardada en `docs/demo/bateria-sin-ia.ts` (`node docs/demo/bateria-sin-ia.ts`; se convertirá en prueba permanente si se aprueba el plan). Mide si el motor **entiende** la frase (`motor.entender`), sin mirar si hay datos conectados.

| Tipo de frase | Entiende |
|---|---|
| Como está escrita en la guía (exactas) | 29 de 29 (100 %) |
| Con un error de tipeo (letra cambiada o comida: «lukas», «presupesto», «oy», «gatos») | **5 de 21 (24 %)** |
| Dicha de otra forma («almuerzo 5 lucas», «cuánta plata llevo», «tengo clases hoy», «siguiente») | **24 de 53 (45 %)** |
| **Total** | **58 de 103 (56 %)** |

Por área (frases exactas + tipeos + otras formas): gastos 7/22 (32 %), presupuesto 3/7 (43 %), aula 2/5 (40 %), ahorro 3/6 (50 %), equipo 2/4 (50 %), calendario 6/11 (55 %), música 3/5 (60 %), pomodoro 9/13 (69 %), estudio 16/18 (89 %), descargas 3/3, memoria 3/3, plan 1/2 y **saludos y ayuda 0/4** («hola», «gracias», «ayuda», «qué puedes hacer»).

**Lo más grave:** lo que más usa un estudiante, **anotar y consultar gastos, es lo que peor entiende** (32 %). Y «hola», «ayuda» o «qué puedes hacer» no responden nada.

## 3. Causas (en orden de impacto)

1. **Sin tolerancia a errores de escritura.** Solo se perdonan tildes y mayúsculas. «lukas», «gastdo», «presupesto», «calsulo» no calzan.
2. **Plantillas rígidas en orden y palabras.** «Almuerzo 5 lucas» o «me salió 5 lucas el almuerzo» no calzan porque la plantilla es «gasté {monto} en {cosa}». Cada forma de decirlo es otra plantilla que alguien tiene que escribir.
3. **Sin comprensión de lo básico.** Saludos, gracias, ayuda y «qué puedes hacer» no tienen respuesta; tampoco una lista de lo que Brote sabe hacer.
4. **Cuando no entiende, no ayuda.** No ofrece «¿quisiste decir…?», ni botones, ni cómo pedir lo que quería.
5. **El aprendizaje depende de la IA.** El motor solo aprende frases nuevas viéndolas resueltas por el agente; sin IA no aprende nada.
6. **Hay cosas que solo se pueden hacer escribiendo.** Varias acciones no tienen un botón o formulario equivalente en la isla.

## 4. Propuesta de solución (capas, de menor a mayor esfuerzo)

**A. Corrector de escritura (typos).** Antes de buscar plantillas, si la frase no calza, se corrigen palabras sueltas contra el **vocabulario del propio motor** (las palabras de las plantillas + los nombres de tus ramos y metas): distancia de edición de 1 en palabras de 4 letras o más, dos en las de 8 o más, y equivalencias de jerga chilena («lukas», «luca», «k», «mil», «q», «xq», «oy»). Nunca toca números ni montos.
**B. Entender por piezas, no por frase entera («slot-first»).** Primero se extraen las piezas que ya sabemos leer (monto, periodo, fecha, hora, duración, nombre de ramo o meta) y después se decide la **intención** por palabras clave y verbos, sin importar el orden. Así «almuerzo 5 lucas», «pagué 5 lucas por el almuerzo» y «se me fueron 5 lucas en el almuerzo» son lo mismo. Las plantillas actuales siguen siendo la primera vía (exactitud) y esta capa entra solo cuando no calzaron.
**C. Confirmación cuando no hay certeza** (regla de seguridad en la decisión 2). Una acción que cambia algo (anotar, borrar, agendar) por una vía «aproximada» pregunta con botones: «¿Anoto $5.000 en almuerzo?» [Sí] [No]. Una consulta que no cambia nada se responde directo. Con IA disponible, lo dudoso va al agente; sin IA, se pregunta.
**D. Cuando no entiende, ayudar.** «No te entendí. ¿Quisiste decir…?» con las 2–3 frases más parecidas como botones, más «Escribe *ayuda* para ver lo que sé hacer». Lo que el usuario confirma se **recuerda en su computador** (frase → intención) y la próxima vez se entiende sola (aprendizaje sin IA, sin enviar nada fuera).
**E. Lo básico de conversar.** Saludos, gracias, despedidas, «¿qué puedes hacer?» y **ayuda por áreas** con botones (Gastos, Estudio, Agenda…, cada uno con 3 ejemplos que se pueden tocar).
**F. Hacerlo sin escribir.** Un formulario de «+ Gasto» (monto, qué fue, categoría), botones en cada tarjeta para las acciones comunes (aplazar, borrar el último, anotar un gasto frecuente ya existe) y **autocompletado mientras se escribe** (sugiere frases de las plantillas y tus ramos). Es lo más robusto: un toque no se equivoca.
**G. Más adelante (opcional):** buscar la intención por **similitud semántica** con un modelo pequeño local (la memoria ya puede usar EmbeddingGemma 300M, ~0,3 GB, sin internet). Mejora «otras formas de decirlo», pero pesa y exige instalar algo: solo si A–F no alcanzan.

**Medir siempre:** el corpus de frases se vuelve **prueba permanente** (por área y por tipo: exactas, con typos, con otra forma, y frases de control que NO deben activar nada). Metas sugeridas en la decisión 4. Cada mejora se aprueba solo si sube la medición y no aparecen falsos positivos.

## 5. Decisiones (cada una con recomendación y alternativas)

1. **Qué capas hacer.** Recomendado: **A, B, C, D, E y F** (todo menos G), en ese orden de dependencia (A y B primero, C y D con ellas, E y F después). Alternativa: solo A y E (rápido y barato, pero no arregla «almuerzo 5 lucas»); o dejar G para después, solo si A–F no llegan a las metas.
2. **Qué se ejecuta solo y qué se confirma.** Recomendado: **consultas** (cuánto llevo, qué tengo hoy) se responden directo aunque la frase sea aproximada; **acciones** (anotar, borrar, agendar, crear meta, cambiar presupuesto) por vía aproximada **siempre piden confirmación con botones**; y los **montos nunca se corrigen ni se adivinan** (si hay dos números posibles, se pregunta). Alternativa: confirmar siempre cualquier cosa aproximada (más seguro, más lento); o confirmar solo borrados (más rápido, riesgo de anotar mal).
3. **Frases que no entendió.** Recomendado: **guardar en el computador, con permiso explícito (apagado de fábrica), las frases que no entendió sin IA**, verlas y borrarlas en «Lo que sé de ti», y un botón «Copiar las que no entendí» para que el usuario decida si se las manda al desarrollador. Es la mejor fuente real para mejorar y no sale nada solo. Alternativa: no guardar nada y mejorar solo con el corpus inventado (más privado, mejora más lenta).
4. **Metas de éxito.** Recomendado, sobre el corpus ampliado a ~400 frases: **exactas 100 %, con typos ≥ 85 %, con otra forma ≥ 75 %, y 0 falsos positivos en las frases de control**; por área, ninguna debajo de 70 %. Alternativa: metas más bajas al inicio (typos ≥ 70 %, otra forma ≥ 60 %).
5. **Orden por áreas.** Recomendado: **gastos y presupuesto primero** (lo que más se usa y peor entiende), luego saludos y ayuda (E), después aula, calendario y estudio, y al final pomodoro, música, equipo y descargas. Alternativa: todas a la vez por capa (A y B en todo el motor), que es más parejo pero tarda más en notarse.
6. **Aprendizaje sin IA (D).** Recomendado: lo que el usuario confirma con un toque se guarda en su base local y vale solo para él, con borrado en «Lo que sé de ti → Frases que aprendí» (donde ya viven las que aprende con IA). Alternativa: no recordar y preguntar siempre (sin riesgo, pero molesta).
7. **Formulario «+ Gasto» y autocompletado (F).** Recomendado: ambos. El formulario va en la pestaña Plata (monto, descripción, categoría; Enter para anotar); el autocompletado sugiere 3 frases mientras se escribe. Alternativa: solo el formulario.
8. **Cuando no hay nada que sugerir.** Recomendado: respuesta amable y breve, nunca un error técnico: «No te entendí. Prueba con: …» y el botón «Ver ayuda». Con la IA conectada, esa frase va al agente como hoy.
9. **Qué NO cambia.** La parte con IA, el aprendizaje desde el agente, las plantillas actuales (siguen siendo la primera vía) y el principio «sin enviar nada fuera».

## 6. Cómo se haría (si se aprueba)

- Un corpus `packages/motor/pruebas/corpus-frases.ts` (empezando por las 103 de la medición; después hasta ~400, escritas por mí y con las frases reales que el usuario permita guardar) y una prueba `corpus.test.ts` que **calcula el porcentaje por área y tipo** y falla si baja de la meta o aparece un falso positivo.
- Capas A y B como módulos puros (`corregir.ts`, `piezas.ts`) probados aparte; C y D en el motor y en la isla (botones «¿Anoto…?»); E y F en `panel.ts`.
- Pruebas por paquete de siempre y vista previa; al terminar, lo hecho y lo pendiente de probar en un Mac en este documento, `CLAUDE.md` y la lista de progreso.

## 7. Anexo: modelo pequeño local (capa G), para el PC, el celular y el aparato físico (investigación del 6-10-2026)

Pregunta del usuario: ¿puede Brote traer (o descargar) un modelo muy liviano solo para texto, y qué pasa con la versión móvil y la física? Lo de abajo sale de búsquedas en la web y de las fichas de los modelos; **no probé ningún modelo en este computador** y lo marcado «sin verificar» hay que comprobarlo antes de decidir. No se descargó nada.

### 7.1 Para qué serviría (y para qué no)
- **Sí:** entender frases. Dada «almuerzo 5 lucas», devolver `{ intención: "registrar-gasto", monto: 5000, cosa: "almuerzo" }`. Con **salida restringida** (llama.cpp permite forzar una gramática o un formato JSON) el modelo solo puede responder una de las intenciones que Brote ya conoce, así que no inventa acciones. Para eso alcanzan modelos muy chicos.
- **No:** conversar libre en español chileno, ni hacer de agente con herramientas. Para eso sigue haciendo falta la IA de verdad.
- Las acciones que cambian algo se confirman con botones (capa C), así un error del modelo no anota ni borra nada solo.

### 7.2 Candidatos (licencias y tamaños verificados en las fichas; el resto, sin verificar)
| Modelo | Licencia | Tamaño | Notas |
|---|---|---|---|
| **Qwen3-0.6B** | **Apache 2.0** (ficha) | Q8_0: **639 MB** (ficha); el Q4 sería menor, sin verificar | «100+ idiomas», incluye español (ficha). El más liviano de la lista |
| **Qwen3-1.7B** | **Apache 2.0** (ficha) | Q8_0: **1,83 GB** (ficha); Q4 ≈ 1 GB, sin verificar | Más fuerte; sigue siendo liviano |
| **Gemma 4 E2B** (abril de 2026) | **Apache 2.0** (según [The Decoder](https://the-decoder.com/googles-gemma-4-is-now-available-with-apache-2-0-licensing-for-the-first-time/) y otros) | 2,3 B de parámetros efectivos; bajo 1,5 GB con cuantización de 2 bits (una prueba en Raspberry Pi 5 lo corrió a 7,6 tokens/s) | Nuevo, multimodal, pensado para teléfonos y placas chicas; no probado aquí |
| **SmolLM3-3B** | Apache 2.0 (según reseñas, sin verificar en la ficha) | ~2 GB en Q4, sin verificar | Declara español entre sus idiomas principales |
| Gemma 3 270M | **Términos de Uso de Gemma** (no Apache; la ficha dice «Gemma»; una reseña decía Apache 2.0 y **está equivocada**) | 270 M de parámetros | Diseñado para clasificar y extraer datos; sus términos traen condiciones y una política de uso prohibido |
| Llama 3.2 1B | Licencia comunitaria de Llama 3.2 (con condiciones) | ~1 GB | Descartado por la licencia |
| EmbeddingGemma 300M | **Términos de Uso de Gemma** (ficha) | 300 M | Es el que la memoria de Brote ya puede usar (lo descarga cada usuario con OpenClaw; Brote no lo redistribuye). Si Brote lo distribuyera, valen sus términos |

**Recomendación de licencias:** quedarse con modelos **Apache 2.0** (Qwen3 y Gemma 4): se pueden distribuir o enlazar sin condiciones especiales; solo hay que incluir sus avisos de licencia. Evitar Llama y Gemma 3 mientras no haga falta.

### 7.3 En el PC (macOS y Windows)
- **Cómo:** `llama.cpp` (licencia MIT) con el modelo en formato GGUF y una gramática; se llama desde el puente solo cuando las capas A–F no entendieron.
- **Cómo llega:** **descarga opcional con permiso del usuario**, igual que los modelos de transcripción (Rust descarga, verifica tamaño y huella, y recién entonces lo activa; `src-tauri/src/modelos.rs`). No dentro del instalador (ya pesa 122 MB de Node).
- **Costo esperado (sin verificar):** de 0,5 a 2 GB de disco, 1–2 GB de RAM mientras está cargado (se descarga tras un rato sin uso) y del orden de 1 segundo por frase en un Mac con chip Apple; en Windows depende del equipo. Brote ya avisa si la CPU se acalora.
- **Alternativa solo para Mac:** el **modelo del propio sistema de Apple** (Foundation Models framework): ~3 mil millones de parámetros, **sin descarga y gratis**, español entre los idiomas soportados, con generación guiada (salida estructurada), pero exige **macOS 26 o más nuevo con Apple Intelligence activado**, tiene un contexto chico (~4.900 tokens según fuentes) y solo se usa desde Swift (habría que crear un puente nativo). Sirve de acelerador opcional en Macs nuevos, no como base ([resumen](https://9to5mac.com/2025/09/29/apple-intelligence-ios-26-models-developers/)).

### 7.4 En el celular (versión móvil)
- **iPhone:** el mismo Foundation Models framework de Apple (iOS 26, gratis, sin conexión, salida estructurada, español soportado). Solo en dispositivos compatibles con Apple Intelligence y con un reporte de que depende del idioma del sistema ([foro de Apple](https://developer.apple.com/forums/thread/805378)). Plan B: `llama.cpp` con un Qwen3-0.6B, en un plugin nativo de Tauri móvil.
- **Android:** **Gemini Nano** vía AICore y ML Kit GenAI (incluye una Prompt API): un solo modelo compartido por todas las apps, sin descarga propia, pero **solo en teléfonos compatibles** ([documentación de Android](https://developer.android.com/ai/gemini-nano)). Para un modelo propio, **LiteRT-LM**. Plan B igual: `llama.cpp` con Qwen3-0.6B.
- **Lo más importante para el móvil:** el motor de Brote ya es **TypeScript puro** (plantillas, montos, fechas). Las capas A–F (corrector, entender por piezas, ayuda, confirmación) se pueden correr **en el teléfono sin ningún modelo**. El modelo es un extra donde el teléfono lo permita. Y en el diseño del plan multiplataforma el teléfono también puede mandarle la frase al PC por la red privada, que entiende mejor.

### 7.5 En el aparato físico
- **Opción recomendada: el aparato es un cliente delgado** (pantalla, parlante, micrófono y botones) y el **PC (o el teléfono) entiende la frase**. No lleva modelo adentro, es barato y no tiene el problema de las licencias de IA en el hardware. Coincide con la regla ya decidida: el aparato **no ejecuta Claude Code**.
- **Aparato autónomo (sin PC):** una Raspberry Pi 5 de 8 GB podría correr reconocimiento de voz tiny + un modelo de 1–2 B, pero las pruebas públicas dan entre 15–20 tokens/s para un 1B y **8 a 25 segundos de punta a punta** para un asistente de voz completo, además de exigir ventilación activa (sin ella se limita a los 90 segundos) ([ejemplo](https://bmdpat.com/blog/raspberry-pi-5-local-voice-ai-2026)). Con salida restringida, de pocos tokens, sería bastante menos, pero sube el costo y la complejidad. No lo haría en una primera versión.
- **Aparato sin electrónica** (peluche, láminas): no aplica.
- **ESP32 (decisión del usuario):** ver la aclaración de abajo.

**Aclaración del usuario (6-10-2026):** el aparato físico se pensó con un **ESP32** (las Raspberry Pi son caras). Un ESP32 **no puede correr un modelo de lenguaje** (tiene del orden de cientos de KB de RAM, y algunos modelos con PSRAM llegan a unos pocos MB), así que el aparato es **obligatoriamente un cliente delgado**: botones, pantalla chica, quizá micrófono y parlante, WiFi o Bluetooth hacia el PC o el teléfono, que es quien entiende la frase. Es la opción recomendada de arriba y la que menos cuesta. Las cifras del ESP32 (memoria, precio, voz sin conexión, homologación en Chile) **no están investigadas**; falta una investigación específica antes de diseñar.

**Segunda aclaración del usuario (6-10-2026): el aparato dependería del celular, no del PC** (un llavero va siempre con el celular; en la casa pasa algo parecido). Entonces quien entiende las frases del aparato es **el celular**, y ahí valen las capas A–F del motor en TypeScript, más el modelo del sistema (Apple Foundation Models en iPhone, Gemini Nano en Android) o un Qwen3-0.6B si hace falta. El ESP32 sigue siendo un cliente delgado, pero ahora hablando con el teléfono (lo más probable, por Bluetooth de baja energía). Ver `docs/modelo-de-negocio.md`, sección 8.

**¿Raspberry Pi barata en vez de ESP32? (consulta del 6-10-2026, según [la guía de series de Raspberry Pi](https://www.raspberrypi.com/news/raspberry-pi-product-series-explained/); la página de uelectronics dio error 403 y no se pudo leer)**
- **Pico 2 W** es un microcontrolador como el ESP32 (no corre Linux; 520 KB de RAM; WiFi y Bluetooth), de unos 7 USD de precio sugerido. **Misma clase que un ESP32, sin ventaja para la IA.**
- **Zero 2 W** sí corre Linux, pero con **512 MB de RAM** y Bluetooth 4.2: no alcanza para ningún modelo útil (el Qwen3-0.6B en Q8 pesa 639 MB), y en 2026 los precios de Raspberry Pi subieron por la escasez de memoria (alrededor de 21 USD en una tienda en agosto de 2026, con variación grande entre regiones).
- **Conclusión:** una Raspberry barata no aporta nada frente a un ESP32 para este aparato. Tamaños y precios de ESP32 vistos: placas ESP32-C3 con pantalla de unos 10–11 USD y ESP32-S3 con pantalla de unos 36–38 USD (sin precios para Chile; el C3 y el S3 «sin pantalla» cuestan bastante menos). El ESP32-C3 trae Bluetooth LE 5 y el C6 suma WiFi 6 y Thread (conocimiento general; falta verificarlo).

**DECISIÓN DEL USUARIO (6-10-2026): el celular (y el aparato) funcionan SIN IA por ahora, mejorando lo sin IA al máximo, hasta ver si el modelo de negocio da frutos.** Lo que el celular no pueda responder lo dice con un mensaje amable que lleva al PC (por ejemplo, «Eso necesita mi IA y hoy solo la tengo en tu PC. Vamos al PC y te ayudo allá»). **La idea no cambia: el agente vive en los tres espacios (PC, celular y aparato) y comparten los mismos datos.** Consecuencias:
- El plan sin IA (capas A–F, secciones 4 y 5) pasa a ser **la base del celular** y su prioridad sube.
- **Idea para el mensaje de «vamos al PC»:** en vez de solo negarse, el celular puede **dejar la pregunta pendiente** («¿La dejo guardada para cuando prendas tu PC?») y, cuando el PC la responda, la respuesta aparece en el celular. Es un dato más que se sincroniza (una bandeja de preguntas pendientes), sin servidor y sin tocar los términos. Sin decidir.
- **Lo que hay que diseñar para que el agente viva en los tres espacios** (sin decidir): qué datos se sincronizan (gastos, ramos, notas, metas, tarjetas de repaso, temporizadores; y qué NO, por ejemplo documentos, audios y transcripciones por su tamaño y sensibilidad); la **fuente de verdad** y cómo se resuelven los conflictos cuando se edita lo mismo en dos lugares; el **emparejamiento** (por ejemplo, un código QR) y el cifrado entre aparatos; y que **«olvidar» borre en los tres** (la promesa de privacidad no puede romperse por una copia olvidada en el celular).
- **Lo técnico que no está listo:** el motor de Brote es TypeScript, pero hoy usa `node:sqlite` y archivos de Node, que **no existen en el celular**. Las partes puras (plantillas, montos, fechas, cálculos) se pueden reutilizar; el almacenamiento hay que ponerlo detrás de una capa que cambie según el aparato. Es trabajo de la versión móvil.

### 7.6 Riesgos y lo que falta verificar
1. **Calidad en español chileno** («lukas», «paque», «al tiro»): lo único que decide es **probar cada candidato con la batería de frases** (`docs/demo/bateria-sin-ia.ts`, después el corpus ampliado). Sin esa prueba, cualquier elección es una apuesta.
2. **Velocidad y memoria reales** en un Mac como el tuyo y en un Windows modesto.
3. **Licencias:** guardar el texto de la licencia y el aviso de cada modelo; revisar los términos de Hugging Face para descargar los archivos.
4. **Una mala interpretación** no puede ejecutar nada: salida restringida + confirmación en acciones + montos tomados solo de los números escritos (nunca inventados por el modelo).
5. **Peso del instalador y de la RAM:** por eso es una descarga opcional.

### 7.7 Decisiones (con recomendación)
- **G1. Cómo llega al PC.** Recomendado: **descarga opcional con permiso**, no dentro del instalador. Alternativa: incluir el más chico (Qwen3-0.6B, ~0,4–0,6 GB) en el instalador para que todo funcione sin internet desde el primer minuto.
- **G2. Qué modelos probar.** Recomendado: **Qwen3-0.6B, Qwen3-1.7B y Gemma 4 E2B** (todos Apache 2.0). Alternativa: sumar SmolLM3-3B.
- **G3. Permiso para descargarlos y compararlos.** Hay que bajar de Hugging Face tres archivos (unos 0,4–1,5 GB cada uno; los tamaños exactos los confirmo al elegir la cuantización) y medirlos con la batería. **No lo hago sin que me lo apruebes**, indicando archivo, origen y tamaño cada vez. Recomendado: sí, **después** de haber hecho las capas A–F, para saber cuánto falta que cubra el modelo.
- **G4. Mac y iPhone.** Recomendado: dejar los modelos del sistema de Apple (Foundation Models) como **mejora opcional** cuando exista la versión móvil; no depender de ellos.
- **G5. Aparato físico.** Recomendado: **cliente delgado**, sin modelo adentro; el PC o el teléfono entiende. Revisar un aparato autónomo solo si hay demanda y presupuesto.
- **G6. Móvil.** Recomendado: **el mismo motor TypeScript con las capas A–F** y el modelo como extra; el teléfono también puede mandar la frase al PC.

### 7.8 Fuentes
- [Small Language Models in 2026: 10 to Know](https://www.turingpost.com/p/slmslist) y otras reseñas (para el panorama; las cifras de licencia y tamaño se contrastaron con las fichas).
- Fichas: [Qwen3-0.6B-GGUF](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF), [Qwen3-1.7B-GGUF](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF), [Gemma 3 270M](https://huggingface.co/google/gemma-3-270m-it), [EmbeddingGemma 300M](https://huggingface.co/google/embeddinggemma-300m).
- [Gemma 4 con licencia Apache 2.0](https://the-decoder.com/googles-gemma-4-is-now-available-with-apache-2-0-licensing-for-the-first-time/).
- [Foundation Models de Apple](https://9to5mac.com/2025/09/29/apple-intelligence-ios-26-models-developers/) y [limitación por idioma](https://developer.apple.com/forums/thread/805378).
- [Gemini Nano en Android](https://developer.android.com/ai/gemini-nano).
- [Asistente de voz local en Raspberry Pi 5](https://bmdpat.com/blog/raspberry-pi-5-local-voice-ai-2026).


## 8. Decisiones aprobadas (6-10-2026)

El usuario aprobó **las 9 decisiones recomendadas de la sección 5**: capas A, B, C, D, E y F (sin G); consultas aproximadas se responden directo y acciones aproximadas siempre piden confirmación (los montos nunca se corrigen ni se adivinan); frases que no entendió guardadas **solo con permiso explícito** (apagado de fábrica); metas sobre un corpus de ~400 frases (exactas 100 %, typos ≥ 85 %, otra forma ≥ 75 %, 0 falsos positivos, ningún área bajo 70 %); orden por áreas; lo confirmado con un toque se recuerda localmente; formulario «+ Gasto» y autocompletado; «No te entendí. Prueba con…» + «Ver ayuda»; sin cambios en la parte con IA ni en las plantillas actuales (siguen siendo la primera vía).

## 9. Lo que quedó hecho

**Cómo entiende ahora una frase** (`Motor.resolver(texto, { aproximar, conIA, motivoSinIA })`, en `packages/motor/src/motor.ts`; el puente lo llama con `aproximar: true`):
1. **Plantillas tal cual** (vía de siempre, sin cambios). Si calzan, se resuelve como antes (incluida la regla de que, si falta una fuente de datos, la frase va al agente).
2. **Lo que el usuario confirmó antes** (`FrasesAprendidas`, `frases-locales.ts`; tabla `frases_confirmadas`): vale para él, con el monto cambiado por un hueco (así «almuerzo 8 lucas» también sirve). Lo destructivo aprendido igual pregunta.
3. **Capa A, corregir la escritura** (`corregir.ts`, puro): jerga («lukas», «oy», «q»…), «e gastado» → «he gastado», palabras a 1 letra (2 si tienen 11 o más; las de 3 solo si empiezan igual, con b y v iguales) del vocabulario del motor (palabras de las plantillas, categorías, periodos, unidades y nombres de tus ramos). Prueba hasta 3 candidatas por palabra y todas las combinaciones, de la que más cambia a la que menos; nunca toca números ni montos; conserva tildes y mayúsculas de lo que no cambia.
4. **Capa B, entender por piezas** (`piezas.ts` + `piezas-reglas.ts`, puros): saca monto, periodo, categoría, duración, hora, mes y nombres de ramos y metas, decide la intención por palabras clave y devuelve una **frase en la forma de la guía** («gaste 5 lucas en almuerzo») que pasa por las plantillas de siempre: así hay una sola lógica de interpretar y ejecutar. El monto sale tal cual lo escribió el usuario; con dos montos no adivina. Las reglas son de «mundo cerrado» donde hacía falta (por ejemplo, «presupuesto» solo si todas las palabras son de consulta) y bloquean palabras ajenas.
5. **Capa C, confirmación**: una **consulta** aproximada se responde directo con «Entendí «…»»; una **acción** (`REQUIEREN_CONFIRMAR`: anotar, borrar, agendar, presupuesto, ramos, notas, metas de ahorro, cancelar…) devuelve `intencion: "confirmar"` con la pregunta («¿Anoto $5.000 en almuerzo?», «¿Borro tu último gasto ($3.500 en café)?») y **no hace nada** hasta que la isla manda `confirmar-frase`. Con la IA conectada, una acción dudosa va al agente.
6. **Capa D, cuando no entiende**: sin IA, `intencion: "no-entendi"` con hasta 3 frases parecidas como botones (`sugerir.ts`; llevan el monto del usuario) y «Ver ayuda»; sin sugerencias, «No te entendí. Prueba con: …». Nunca un error técnico (antes, sin OpenClaw, el usuario veía «OpenClaw no está conectado…»). Con IA conectada la frase va al agente como hoy. Tocar una sugerencia o «Sí» **recuerda** lo que escribió el usuario.
7. **Capa E**: plantillas nuevas al final (saludo, gracias, despedida, ayuda; ninguna anterior cambió) y `ayuda.ts`: «ayuda» lista las áreas de las funciones prendidas, «ayuda con los gastos» da 3 ejemplos tocables. Con IA conectada, saludos/gracias/despedida van al agente (Brote responde con su personalidad); la ayuda es siempre local.
8. **Capa F**: formulario **«+ Gasto»** en la pestaña Plata (`gasto-vista.ts` + `agente/gasto-formulario.ts`; pedido `gasto-anotar`: monto entero 1–100 millones, descripción ≤ 200, categoría de la lista o «elegir sola») y **autocompletado** mientras se escribe (`agente/autocompletar.ts`: hasta 3 frases de la guía o el nombre de tu ramo completo; tocar una la deja en el campo, no la envía).

**Frases que no entendió** (decisión 3): `FrasesNoEntendidas` (tabla `frases_no_entendidas`, ≤ 200, ≤ 200 letras cada una), **apagado de fábrica**; el interruptor, la lista, «Copiar las que no entendí» y «Borrar todo» están en «Lo que sé de ti → Frases que no entendí»; ver y borrar no dependen del permiso; solo se guarda cuando no hay IA (con IA, la frase se la queda el agente). Las confirmadas se ven y se borran en «Frases que aprendí». La skill `delegar` prohíbe pasar ambas a planes gratuitos (con prueba) y `docs/privacidad.md` las describe. Nada de esto va a los registros.

**Medición** (corpus `packages/motor/pruebas/corpus-frases.ts`, 519 frases inventadas con su intención esperada, 77 de ellas de control, más `corpus-validacion.ts`, 152 frases **nuevas escritas después de las reglas** (43 de control), que es la cifra honesta; `corpus.test.ts` falla bajo las metas; a mano: `node packages/motor/pruebas/medir.ts [exacta] [fallas]` y `medir-validacion.ts`):

| | Exactas | Con typos | Otra forma | Control (falsos +) |
|---|---|---|---|---|
| Línea base (solo plantillas) | 100 % | 15 % | 35 % | 0 |
| + A (corregir) | 100 % | 86 % | 35 % | 0 |
| + B (piezas) | 100 % | 88 % | 85 % | 0 |
| + E (saludos y ayuda) y afinar | 100 % | 98 % | 100 % | 0 |
| **Validación** (frases nuevas) | — | 100 % (18/18) | 99 % (90/91) | 0 de 43 |

Lo que sigue sin entenderse: «mil quinientos» (números compuestos en palabras) y typos que cambian la primera letra («kito»). Ojo con la cifra del corpus de ajuste: las reglas se afinaron con él, así que su 100 % es optimista; la validación (escrita después, y con una segunda ronda cuando una frase obligó a tocar una regla) dice que generaliza a ~97–99 % **con frases escritas por la misma persona que las reglas**, no por usuarios reales. La medición real será la de las pruebas con personas y, si el usuario lo permite, las frases que guarde la sección «Frases que no entendí».

**Pruebas**: motor 787 (+ corpus, corregir, piezas, frases locales, aproximado), adapter 188 (`sin-ia-puente.test.ts`, el puente real con HOME aislado), desktop 272 (opciones, autocompletar, formulario, `Agente.elegir`, memoria) y `pnpm --dir apps/desktop tipos` limpio. Vista previa: `?escribe=almuerzo 5 lucas` (confirmar), `?escribe=zzz qqq` (no entendí; `&sin-sugerencias=1`), `?escribe=ayuda`, `?escribe=gast&sin-enviar=1` (autocompletado), `?pestana=plata` (botón «+ Gasto») y `vista-previa-memoria.html?grupo=brote&abrir=todo&permiso=1` (`&frases=sin`).

## 10. Pruebas pendientes (en un Mac real, con la app empaquetada)
1. Escribir de verdad frases sueltas y con errores (sin OpenClaw y con OpenClaw) y ver que: las acciones preguntan, las consultas responden con «Entendí…», lo que no entiende sugiere, y con IA conectada una frase que no es de Brote llega al agente.
2. Tocar «Sí» → que anote → repetir con otro monto → que se entienda sola; borrar en «Frases que aprendí».
3. Activar el permiso de «Frases que no entendí», escribir tonteras, ver la lista, copiar y borrar; apagarlo y comprobar que no guarda más.
4. El formulario «+ Gasto» con teclado (Enter, Tab) y el autocompletado sobre el campo con el notch real (que la fila de sugerencias no tape nada y la isla no se cierre a mitad de un gasto).
5. Latencia con la app real (en pruebas: ~4 ms una frase típica, ~60 ms un texto de 1.000 letras; textos de más de 300 letras no se corrigen).
6. Pruebas con 3–5 personas: anotar qué frases usan y no se entienden (la semana 1 de `docs/demo/pauta-pruebas.md`) y agregarlas al corpus.

## 11. Decisiones del usuario sobre los límites (6-10-2026) y lo que queda
Resueltas el mismo día:
1. **Lo aprendido pregunta igual.** Una frase que el usuario confirmó antes se entiende sola, pero si es una acción («¿Anoto $8.000 en almuerzo?») sigue pidiendo el Sí (también con IA conectada); solo las consultas aprendidas se responden directo. Ejecutar sin preguntar molestaba.
2. **Dos montos se preguntan.** «Gasté 5 lucas y 3 mil en el almuerzo» → «¿Cuál es el monto?» con un botón por monto (`intencion: "elegir-monto"`, `Motor.dudaDeMonto`, `montosAmbiguos` en `piezas-reglas.ts`); tocar uno anota solo ese gasto. Exige verbo de gasto, montos distintos y ninguna palabra de otra área; con IA conectada lo ve el agente. De paso, la jerga («lukas») ahora se arregla siempre antes de entender, no solo cuando ayuda.
3. **Eventos con día de la semana o fecha.** «Tengo prueba de física el viernes a las 9», «agenda estudiar el 14 de octubre a las 15:30», «reunión de grupo el lunes a las 18:00» se entienden (plantillas `evento-dia` y `evento-agenda-dia`, `Accion.cuando.dia`, resuelto con `leerDia`: el próximo viernes, nunca una fecha pasada), preguntan con la fecha ya resuelta («¿Agendo «Prueba de física» viernes, 9 de octubre a las 9:00?») y agendan una hora en el Calendario del Mac (o dejan solo la pregunta si no hay calendario). Siguen sin hacerse: eventos sin hora, y «estoy ahorrando para un notebook» (una meta necesita monto). Falsos positivos que la prueba atrapó y quedaron cubiertos: «tengo clases el viernes a las nueve de la mañana, qué hago» (la «mañana» de «de la mañana» no es mañana).

Quedan abiertas:
- **Más frases**: el corpus es mío; conviene que el usuario (o los testers) sumen frases reales. La capa G (modelo local) sigue sin aprobarse.
- **Horas en palabras** («a las nueve») y números compuestos («mil quinientos») no se leen.
- **Celular y aparato**: las capas A–F son TypeScript puro (corregir, piezas, sugerir, ayuda) y se reutilizan tal cual; lo único atado a Node es el almacenamiento de `frases-locales.ts` (SQLite), que irá detrás de la capa de almacenamiento de la versión móvil.
