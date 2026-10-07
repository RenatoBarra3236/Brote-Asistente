# Comparación con Taby (heytaby.com) — paréntesis del 6-10-2026

Taby es un proyecto con ideas muy parecidas a Brote. Este documento lo analiza y rescata lo que sirva. **Es solo un análisis: nada de esto está decidido ni programado.** Fuente: cuatro páginas de heytaby.com leídas ese día (inicio, funciones, el verificador de IA local y «Physical Taby»); no se probó el producto, no hay documentación técnica ni reseñas independientes, y lo que la web no dice está marcado como desconocido.

## 1. Qué es Taby

Un asistente con personaje para Mac y Windows, con **IA local** que corre sin internet y sin cuenta. Lleva tareas, notas, hábitos, recordatorios, planificador con calendario, **modo foco** (bloquea apps y sitios como YouTube), analítica de cuándo eres más productivo, edición de imágenes (difuminar correos, caras y nombres) y **voz** (escucha en 8 idiomas, habla en 11). Tiene también app web (Taby Cloud) y una app móvil enlazada desde el sitio (sin detalle).

| | Taby |
|---|---|
| IA local | **Qwen 3.5 4B**, elegida porque en su propia prueba de 114 tareas reales sacó ~96 contra ~72 de Gemma 4 E2B. Pide Mac con chip Apple y 8 GB o más, o Windows con tarjeta gráfica propia de 4 GB o más; si el equipo no alcanza, usa la nube |
| Plan gratis | IA local, sin cuenta |
| Premium | **8,99 €/mes**: Claude y Codex en la nube, mejor voz, personalidades (Hermano, Chica anime, Mayordomo, Italiano, Ruso…), búsqueda web, visión. Dicen «retención cero de datos» en la nube y que no entrenan con tus datos |
| Aparato físico | **79,99 € / 89,99 US$**, entrega en ~30 días. Una placa con pantalla chica de **Waveshare** (el chip no se dice), caja, **placa de acero con imán** para pegarlo al monitor, cable USB y **3 meses de Taby Cloud**. Se enlaza con la app gratis (cómo, no se dice). **Firmware, guías de instalación y archivos de impresión 3D son de código abierto en GitHub**: se puede armar uno mismo |
| Marca | Juguetona, mucha comunidad (Instagram, TikTok, YouTube, Discord, Reddit, X) y un «muro de amor» de testimonios |

## 2. Parecidos con Brote

- Un personaje chiquito que vive en el PC, con un aparato físico de escritorio y un celular como extensiones.
- La IA fuerte es opcional; hay algo útil sin ella.
- Productividad personal (recordatorios, hábitos, planificación, calendario) y la privacidad como promesa.
- **El aparato es una placa con pantalla chica que depende de la app**, igual que el plan de Brote (cliente delgado con ESP32 que depende del celular). Taby es la prueba de que ese camino se puede vender.

## 3. Diferencias

| | **Taby** | **Brote** |
|---|---|---|
| Público | Profesionales y gente que cuida su privacidad | Estudiantes (estudio y plata) |
| Inteligencia sin nube | **Un modelo de lenguaje local** (Qwen 4B): conversa, pero exige 8 GB y GPU en Windows | **Motor de plantillas, corrector y piezas**: no conversa, pero corre en cualquier computador, sin descarga, y no inventa |
| IA fuerte | **La vende** (Claude y Codex dentro del Premium) | **No la vende**: es la cuenta de cada usuario por OpenClaw; zona gris con Anthropic aún sin resolver |
| Plata del proyecto | Suscripción + aparato | Software gratis; ganancia solo del aparato |
| Estudio | Genérico | Ramos, notas y «cuánto necesitas», repaso, plan antes de pruebas, aula Canvas/Moodle, grabar y transcribir clases |
| Plata | No aparece | Gastos, presupuesto, proyección, metas de ahorro |
| Modo foco | Sí | No |
| Voz | Sí | No (solo grabar y transcribir) |
| Imágenes | Sí | No |
| Presencia | Sin detalle | Isla en el notch, mascotas del equipo de especialistas |
| Plataformas | Mac, Windows, web, móvil (sin detalle) | Mac listo, Windows sin probar, celular y aparato en plan |
| Comunidad | Fuerte | Todavía no |
| Código | App cerrada; **aparato abierto** | Prototipo privado |

## 4. Qué nos conviene rescatar (y qué no)

**Rescatar, con poco costo**
1. **Medir los modelos locales con una prueba propia.** Taby eligió su modelo con 114 tareas reales. Si algún día se aprueba la capa G (modelo local pequeño), el corpus de `packages/motor/pruebas/` es exactamente esa vara (519 frases + 152 de validación). Dato útil: Qwen 3.5 4B le ganó a Gemma 4 E2B en su prueba (con sus reglas, no las nuestras). Ojo: 4B es más grande que los candidatos del plan (Qwen3-0.6B / 1.7B), y la capa G sigue sin aprobarse.
2. **Un verificador «¿corre en mi computador?»** Es chico y baja la fricción. A nosotros nos serviría distinto: no para la IA local, sino para decirle al tester si Node, Claude Code o su Mac alcanzan (hoy lo hace Configurar Brote).
3. **El aparato abierto y el «hazlo tú».** Publicar firmware, guía y archivos de impresión crea comunidad sin fabricar nada, y encaja con el prototipo en ESP32. Para pensar: su precio (79,99 €) y su paquete (imán + cable + 3 meses de nube) como referencia del Brote físico, y que **el imán a la pantalla** es un gesto bonito para un aparato de escritorio.
4. **Marca y comunidad temprana:** un Discord y testimonios reales de los primeros testers, que ya están en el plan de pruebas con 3–5 personas.

**Evaluar, sin decidir**
5. **Modo foco** (bloquear sitios o apps) encaja con «estudiantes», pero choca con la regla de no presionar. Solo si lo activa el usuario, nunca por defecto, y probablemente solo dentro de un bloque de pomodoro. Técnicamente exige permisos de sistema (editar `hosts` o accesibilidad), así que tiene costo de confianza.
6. **Difuminar datos personales en imágenes:** no es nuestro pilar; solo tendría sentido ligado a documentos.

**No seguir**
7. **Voz y personalidades de pago** (Chica anime, Mayordomo): contradicen la decisión de quedarnos con el personaje actual y la regla de no copiar personajes.
8. **Vender la IA dentro de una suscripción:** es justo lo que `docs/modelo-de-negocio.md` desaconseja mientras Anthropic no responda. Si Taby tiene contrato comercial con Anthropic no lo sabemos; si no lo tiene, comparte nuestro riesgo.

## 5. Dónde estamos mejor y dónde peor

**Mejor:** profundidad en estudio y plata, una parte sin IA que funciona en un notebook cualquiera (importante para un estudiante), la privacidad explicada punto por punto (`docs/privacidad.md`), y la isla en el notch.

**Peor:** no conversamos sin IA (ellos sí, con Qwen local); no hay voz, ni modo foco, ni comunidad, ni versión web o móvil; y todo está **sin probar en Windows** y en un Mac real. También tienen aparato real a la venta y nosotros solo un plan.

## 6. Qué haría con esto (sin comprometer nada)

1. **No cambiar el rumbo.** La diferencia (estudiantes + plata, liviano, sin vender IA) es real y hoy no está cubierta por Taby.
2. Anotar en el plan de pruebas: «¿te sirve más que Taby?» solo si el tester ya lo conoce.
3. **Instalar Taby y probarlo un rato** (gratis) para ver su asistente de instalación, la voz y el modo foco con ojos de usuario; este análisis sale solo de su web.
4. Mirar el repositorio del firmware cuando se pueda (la web no da el enlace en lo que leí): sirve para ver qué placa usan y cómo hablan con la app.
5. Retomar la idea del modo foco y de la comunidad al decidir qué viene después del paso 10.

## 7. Lo que no sabemos

- Qué chip tiene su aparato y cómo se enlaza (Bluetooth, WiFi o USB).
- Si la app móvil existe de verdad y qué hace.
- Cómo conversa su modelo de 4B en español chileno, cuánta memoria guarda y si recuerda entre días (la web no habla de memoria).
- Su relación con Anthropic y OpenAI para vender Claude y Codex.
- Cuánta gente lo usa.
