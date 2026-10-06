# Modelo de negocio y términos de uso (PROPUESTA del 6-10-2026, sin decidir)

Brote es también un emprendimiento. Este documento junta dos cosas: **dónde podría cobrarse** y **qué dicen los términos de Anthropic (Claude) y de OpenClaw** sobre construir un producto encima. No es asesoría legal: antes de cobrar, conviene preguntarle por escrito a Anthropic y que lo vea un abogado. No se programa nada de esto sin que el usuario lo apruebe.

## 1. Lo que averigüé de los términos (6-10-2026)

Leí la página oficial de Claude Code «Legal and compliance», la aclaración de febrero de 2026 que reportó The Register y la documentación y el repositorio de OpenClaw. **No leí el texto completo de los Consumer Terms ni de los Commercial Terms**: lo de abajo viene de esas páginas.

**Anthropic** ([Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)):
- El inicio de sesión con una cuenta (OAuth) es solo para quien compró un plan Free, Pro, Max, Team o Enterprise y para el uso normal de Claude Code y las apps propias de Anthropic.
- Quien construye **productos o servicios** que usan Claude, incluido el Agent SDK, debe usar **una clave de API** (Claude Console o un proveedor de nube). Anthropic **no permite** ofrecer el inicio de sesión de Claude.ai dentro de una app de terceros, ni enrutar pedidos con credenciales de planes Free, Pro o Max «en nombre de» los usuarios, ni recolectar, guardar o intermediar credenciales o tokens de sesión de Claude.ai.
- Usar tokens OAuth de Free, Pro o Max en otro producto, herramienta o servicio, **incluido el Agent SDK**, no está permitido ([The Register, 20-2-2026](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/)). Herramientas de terceros como OpenCode dejaron de aceptar cuentas Claude tras pedidos legales de Anthropic.
- **Sí está permitido** que una persona inicie sesión, con su propia suscripción, en el **binario de Claude Code sin modificar**, incluso si una plataforma lo hospeda.
- «Ofrecer Claude Code en un producto» (**instalarlo o ejecutarlo dentro de tu producto**) exige aceptar los **Commercial Terms** y dos condiciones: no modificar el binario ni quitar sus métodos de autenticación, y **no pagar, revender ni intermediar el uso de Claude de los usuarios**; cada usuario se autentica con su propia clave, plan o proveedor.
- Los límites de Pro y Max asumen un **uso individual y normal**.
- No se pueden usar los nombres ni logos «Claude Code» o «Anthropic» como parte del nombre, logo o marca de tu producto, ni sugerir que Anthropic lo respalda. Decir en texto plano que «funciona con Claude Code» sí se puede.
- Anthropic puede hacer cumplir esto sin aviso previo.

**OpenClaw** ([repositorio](https://github.com/openclaw/openclaw), [docs de Anthropic](https://docs.openclaw.ai/providers/anthropic)):
- La licencia es **MIT** y lo administra la OpenClaw Foundation (sin nivel de pago, servicio alojado ni token propio): el código se puede usar comercialmente. Lo que manda para la IA son los términos del proveedor que uses.
- Su documentación dice que personal de Anthropic les indicó que el uso «al estilo OpenClaw» del Claude CLI (`claude -p`, reutilizando el login del usuario) está permitido, y por eso lo tratan como aceptado **mientras Anthropic no publique una política nueva**. Es una afirmación de OpenClaw, no un texto de Anthropic que yo haya podido leer.
- La misma documentación recomienda la **clave de API** para automatización compartida o de producción, y avisa que ese uso gasta los límites de la suscripción de la persona y que Anthropic pausó un plan de créditos para el Agent SDK (la facturación sigue sin definirse).

## 2. Cómo queda Brote frente a eso

| Condición | Brote hoy |
|---|---|
| Binario de Claude Code sin modificar, login propio del usuario | **Sí**: OpenClaw lanza el `claude` del usuario; Brote nunca toca sus credenciales (regla del proyecto: no se leen ni se guardan). Lo que no verifiqué es que OpenClaw no cambie nada del binario. |
| No revender ni intermediar el uso de Claude | **Sí, si se cobra solo por la app** y el usuario pone su propia cuenta. Se rompería si el plan de pago incluyera «IA incluida». |
| No usar OAuth de Free, Pro o Max en «otro producto» | **Zona gris.** Brote no usa el token: usa el programa oficial. Pero Brote es un producto que ejecuta Claude Code por el usuario, y las reglas para «ofrecer Claude Code en un producto» piden los Commercial Terms. |
| Uso individual y normal | **Zona gris.** Brote hace llamadas por su cuenta (la consulta mínima del plan, especialistas, comprobaciones). Poco, pero no es «tú escribiendo en Claude Code». |
| Nombre y marca | Brote no usa «Claude» ni «Anthropic» en su nombre ni logo. En la interfaz se dice «Claude» en texto plano, lo que está permitido. |

**Conclusión honesta:** para pruebas gratuitas con 3–5 personas el riesgo es bajo. **Para cobrar** hay una zona gris real: la lectura estricta es que un producto comercial que ejecuta Claude Code necesita acuerdo con Anthropic, y OpenClaw se apoya en una tolerancia verbal que puede cambiar. Hay que resolverlo **antes** de poner precio.

## 3. Qué hacer con esa zona gris (decisiones)

1. **Preguntarle a Anthropic por escrito** (formulario de ventas que enlaza su página legal) antes de cobrar. Preguntas concretas: (a) ¿un producto de pago que lanza el Claude Code del usuario, con su propio login, necesita Commercial Terms? (b) ¿cambia algo si Brote es gratis y solo se cobran funciones sin IA? (c) ¿un acuerdo con ellos permitiría que Brote use planes de los usuarios? (d) ¿es válida la tolerancia que cita OpenClaw para productos comerciales? Recomendado: **hacerlo ya**, en paralelo con las pruebas. Alternativa: esperar a tener usuarios (peor: se pregunta con presión).
2. **Plan B de la IA** si la respuesta es no: **clave de API propia del usuario** (permitido: el titular de la clave paga a Anthropic; hay que decirle que gasta por token y distinto de su plan), o **otros modelos** que OpenClaw ya soporta (Gemini, ChatGPT, Grok; con sus propios términos, y el plan gratis de Gemini puede usar lo que le mandes para entrenar). Hoy el proyecto exige lo contrario (nada de `ANTHROPIC_API_KEY`, solo el plan Pro), así que sería un cambio de diseño. Recomendado: **no cambiar nada hasta tener la respuesta**; dejar anotado que la IA es una pieza intercambiable.
3. **Regla para cualquier precio:** se cobra la **app**, nunca «la IA». El usuario trae su cuenta (o su clave). No se promociona «Claude incluido».

## 4. Dónde podría cobrarse (ideas, con recomendación)

Brote casi no cuesta nada de operar (corre en el computador del usuario, sin servidores y sin pagar la IA). Por eso se cobra lo que **tiene costo real** o lo que **no toca la promesa gratis** (privacidad, gastos al tiro, estudio básico).

1. **Brote en el celular y en la casa (sincronización cifrada).** El único punto con un servidor de verdad, y la suscripción más fácil de justificar («Brote Plus»). Depende del plan multiplataforma (en pausa). Recomendado como primer pago.
2. **Personalización estética:** accesorios, temas por fechas y los colores de «Brote único». Casi sin costo, no cambia lo que hace Brote. Reglas ya decididas: la rareza **no se compra**, sin cajas ni sorteos pagados, y todo se vende como artículo concreto.
3. **Estudio Plus, solo con lo que tenga costo:** exportar a Anki, compartir paquetes con el grupo, lectura de PDFs escaneados (OCR), transcripción con modelos grandes. Lo básico de estudio queda gratis (es el gancho y los estudiantes pagan poco).
4. **Licencias para instituciones** (universidades, centros de estudiantes, bootcamps): «Brote del campus» con Canvas o Moodle ya configurados. Venta lenta y grande. Sin que los datos de los estudiantes lleguen a la institución (rompería la privacidad).
5. **Finanzas abiertas (2027).** La conexión oficial con bancos (Ley 21.521; entrada en vigencia postergada a julio de 2027, según la CMF) podría ser una función de pago por su costo de cumplimiento. Hoy es solo una idea.

**No cobrar ni hacer:** anuncios, venta de datos o rankings; comisiones por recomendar productos financieros (conflicto de interés y terreno regulado); cobrar por privacidad o por borrar tus datos; cajas o sorteos pagados; poner el agente básico detrás de un muro.

**Precio de referencia (sin validar):** entre $1.990 y $2.990 al mes en Chile, o un pago único. Antes de ponerlo, manda la prueba con personas: si menos de 3 de 5 dicen que lo seguirían usando, no hay nada que cobrar todavía.

## 5. Orden recomendado

1. Pruebas gratis con 3–5 personas (ya listas).
2. En paralelo, la consulta a Anthropic (decisión 1) y, si hace falta, una revisión legal.
3. Con la respuesta: decidir el camino de la IA (plan del usuario con acuerdo, clave propia o varios modelos).
4. Recién entonces, un «Brote Plus» que junte lo estético (2) y la sincronización (1) cuando exista, sin tocar nada de lo gratuito.
5. Instituciones (4) cuando ya haya usuarios reales.

## 6. Fuentes

- [Claude Code: Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) (Anthropic)
- [Anthropic clarifies ban on third-party tool access to Claude](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/) (The Register, 20-2-2026)
- [OpenClaw: proveedor Anthropic](https://docs.openclaw.ai/providers/anthropic) y [repositorio (licencia MIT)](https://github.com/openclaw/openclaw)
- [Commercial Terms](https://www.anthropic.com/legal/commercial-terms), [Consumer Terms](https://www.anthropic.com/legal/consumer-terms) y [Usage Policy](https://www.anthropic.com/legal/aup): enlazados desde la página legal, **no leídos completos** aquí.

## 7. Carta a Anthropic (borrador para que el usuario la envíe; nadie la ha mandado)

**Dónde se manda:** el formulario de ventas, [anthropic.com/contact-sales](https://www.anthropic.com/contact-sales). Es el que la propia página [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) indica para preguntas sobre métodos de autenticación permitidos en un caso de uso. Si el formulario no calza, probar el soporte (support.claude.com; no verificado que sirva para esto). Se manda **desde una cuenta de correo propia, a nombre del usuario**, y se guarda la respuesta (fecha, quién, texto) en este documento. Completar lo que está entre [corchetes] antes de enviar.

**Asunto:** Question about permitted use: free desktop assistant that runs the user's own Claude Code

> Hello,
>
> I'm [nombre], founder of [nombre del proyecto / empresa, o «an early-stage project based in Chile»]. I'm writing to ask how your terms apply to a product we are building, before we launch or charge for anything.
>
> **What the product is.** Brote is a desktop assistant for university students (macOS and Windows). It runs locally on the user's computer. For conversation it uses an open-source agent framework (OpenClaw, MIT license) that launches the user's **own, unmodified Claude Code binary**, signed in by the user with **their own Claude subscription**. We never read, store, copy or transmit the user's Claude credentials or session tokens, we do not offer a Claude login inside our app, and we do not pay for or resell Claude usage. Most of the app (expense tracking, timers, study tools) works locally without any AI. We do not use "Claude" or "Anthropic" in our product name or logo.
>
> **What we are considering charging for** (none of this is the AI): optional features that don't involve Claude, and possibly physical products. We would not sell or advertise "Claude included".
>
> **Our questions:**
> 1. Under your Claude Code terms, does a product like this, which runs the end user's own unmodified Claude Code on the user's machine with the user's own plan, require us to accept the Commercial Terms?
> 2. Does the answer change if the software is free and we only charge for features that don't involve Claude, or for physical products?
> 3. If a commercial agreement is required, what would be the right path for a small, early-stage company, and could end users still authenticate with their own Claude Pro/Max plans?
> 4. One open-source framework we use states that Anthropic staff told them that "OpenClaw-style" use of the Claude CLI is allowed. Does that apply to commercial products built on top of it, or only to individual use?
> 5. If none of this is allowed, would you recommend the API key route (user-provided key) or a commercial agreement with our own key?
>
> We want to build this correctly. Any guidance, or a pointer to the right team, would be very helpful. Happy to share a demo or more technical detail.
>
> Thank you,
> [nombre] · [correo] · [sitio web o repositorio, si se puede compartir]

**Qué opción elegir en el formulario (visto el 6-10-2026):** la página de contacto dice que su equipo de ventas «solo puede apoyar acuerdos complejos», como despliegues de 500+ puestos y BAA, y ofrece un chat con su agente de compras como vía más rápida. Las opciones de «What can we help you with?» son: Contact sales, Increase rate limits, Business associate agreement, Zero data retention y **Product support**. Para Brote conviene **Product support** (es una pregunta sobre cómo aplican los términos a un producto, no un acuerdo grande); si no, «Contact sales» aclarando en la primera línea que es un proyecto en etapa inicial, o el chat del agente de compras con la versión corta de abajo. Es probable que ventas redirija una consulta de este tamaño.

**Versión corta (por si el formulario limita el largo):**

> Hello, I'm [nombre], founder of an early-stage project in Chile. We're building Brote, a free desktop assistant for students. It runs locally and uses an open-source framework (OpenClaw, MIT) that launches the user's own, unmodified Claude Code, signed in with the user's own Claude subscription. We never touch their credentials and don't resell Claude usage. We're considering charging only for features without AI, or for physical products, never "Claude included". Questions: (1) Does a product like this require the Commercial Terms? (2) Does the answer change if the software is free and we only charge for non-AI features or physical products? (3) If an agreement is needed, what's the path for a small company, and can users keep using their own Pro/Max plans? (4) Does the "OpenClaw-style CLI use is allowed" guidance apply to commercial products? Thank you.

**Versión en español (solo para el usuario, no se envía):** me presento como fundador de un asistente de escritorio para estudiantes que corre en el computador del usuario y usa un framework de código abierto (OpenClaw, licencia MIT) que lanza el **Claude Code propio y sin modificar** de cada persona, con **su propia suscripción**; nunca leemos ni guardamos sus credenciales ni revendemos Claude; casi todo funciona sin IA; no usamos «Claude» ni «Anthropic» en el nombre. Qué podríamos cobrar: funciones sin IA y quizá productos físicos, nunca «Claude incluido». Preguntas: (1) ¿esto exige los Commercial Terms? (2) ¿cambia si el software es gratis y solo se cobran funciones sin IA o productos físicos? (3) si hace falta un acuerdo, ¿cuál es el camino para una empresa chica y pueden los usuarios seguir usando sus planes Pro o Max? (4) la tolerancia que cita OpenClaw, ¿sirve para productos comerciales o solo uso individual? (5) si nada de esto se permite, ¿clave de API del usuario o acuerdo comercial con clave propia?

**Antes de enviar:** no adjuntar capturas con datos personales, no pegar claves ni conversaciones, y no prometer nada que no sea cierto (por ejemplo, no decir que hay empresa constituida si no la hay).

## 8. Idea anotada: cobrar solo por Brote físico (6-10-2026, sin decidir)

Propuesta del usuario: **no hay suscripciones de pago en el software**; la IA la pone el usuario (Claude u otro proveedor) y **solo se cobra por versiones físicas de Brote**.
- **A favor:** el cobro queda separado de la IA (el caso de menor riesgo con Anthropic entre los analizados); encaja con el diseño del plan multiplataforma (el PC es el centro y el aparato de la casa es un cliente por red privada, así que la IA sigue corriendo en el PC del usuario); Brote casi no cuesta nada de operar, así que el software gratis es sostenible.
- **En contra:** hardware = capital, inventario, soporte, certificaciones y garantía al consumidor en Chile (no investigado); los ingresos llegan tarde; el aparato depende de que el PC esté encendido; no resuelve que el estudiante necesite su propia IA; igual sigue siendo una empresa que distribuye un producto que ejecuta Claude Code (menos expuesta, no libre de la pregunta).
- **Cómo validarlo barato:** lista de espera o preventa; empezar por algo sin electrónica (peluche, láminas, stickers de Brote) para medir cariño por el personaje; recién con demanda real, diseñar el aparato.
- **Orden recomendado:** primero pruebas gratis con personas y la respuesta de Anthropic; si lo siguen usando, abrir la lista de espera; mientras tanto, mantener abierta la opción de un «Brote Plus» sin IA por si el hardware tarda.
- **Pendiente de diseño:** nada de esto se empieza sin pedirlo; el plan multiplataforma sigue en pausa.

## 9. Qué hacer según la respuesta de Anthropic (completar al recibirla)

Registro: fecha de envío [ ] · fecha de respuesta [ ] · quién respondió [ ] · texto o resumen [ ].

| Si responden… | Entonces |
|---|---|
| «Sí, hace falta Commercial Terms» | Evaluar el acuerdo comercial (costo, condiciones). Mientras, Brote sigue **gratis** para pruebas, sin cobro. Decidir entre acuerdo (los usuarios siguen con sus planes) o clave de API propia («IA incluida»). |
| «No hace falta si es el Claude Code del usuario y no lo revendes» | Pedir que lo confirmen **por escrito** y guardar el texto. Se puede cobrar lo que no sea IA (incluidos los productos físicos), con la regla de no vender ni anunciar «Claude incluido». |
| «Solo clave de API» | Cambiar el diseño: el usuario pone su propia clave (paga por token a Anthropic) o se arma «IA incluida» con clave propia (servidor, cuota mensual, ver la comparación del modelo Fitia). Revisar la promesa de privacidad. |
| «No, ni siquiera eso» | La IA pasa a ser intercambiable: otros modelos que OpenClaw ya soporta (con sus propios términos) o clave de API. Brote sigue sin depender de Claude para su parte sin IA. |
| Sin respuesta | Insistir una vez; mientras tanto, no cobrar nada que dependa de la IA. Pedir a un abogado que lea los Consumer y Commercial Terms completos. |

Hasta recibir la respuesta: **sin cobros y sin promocionar «IA incluida» ni «Claude»** en nada público (página, video, tienda).

