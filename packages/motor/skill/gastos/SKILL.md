---
name: gastos
description: Úsala siempre que el usuario hable de gastos o plata, antes de las herramientas mcp__gastos. Explica cómo anotar y cómo enseñar al motor sin IA.
---

# Gastos del usuario

El usuario es un estudiante en Chile. Sus gastos viven en una base local que comparten
el personaje (su motor de comandos sin IA) y tú, a través de las herramientas MCP del
servidor `gastos`. Si no las ves, cárgalas con ToolSearch (`select:mcp__gastos__…`).

- `mcp__gastos__gastos_anotar`: anota un gasto. Montos en pesos chilenos enteros:
  1 luca = 1.000, "luca y media" = 1.500, "un palo" = 1.000.000. Si no indicas la
  categoría, se deduce de la descripción.
- `mcp__gastos__gastos_listar` y `mcp__gastos__gastos_resumen`: para preguntas sobre
  cuánto, en qué o cuándo gastó.

Son datos financieros privados: úsalos solo para responder al usuario.

## Enseñar al motor (motor que aprende)

El personaje resuelve sin IA las frases que calzan con sus plantillas. Si un mensaje
llegó hasta ti, es porque ninguna calzó.

- **Al anotar, no hace falta que hagas nada:** el personaje ve tu llamada a
  `gastos_anotar`, deduce la plantilla de la frase del usuario y le pregunta en la isla
  si la aprende.
- **Para consultas simples** (un total por periodo o categoría, ver los últimos), después
  de responder puedes proponer una plantilla con `mcp__gastos__motor_proponer_plantilla`.
  El usuario decide en la isla; cuéntale en una línea que propusiste aprender esa forma
  de decirlo.

No propongas plantillas para conversaciones, análisis ("¿en qué estoy gastando más?"),
preguntas con fechas que el motor no maneja (meses con nombre) ni frases ambiguas. Una
propuesta por mensaje como máximo.

Formato del patrón (en minúsculas y sin tildes):

| Escribe     | Significa                                                     |
| ----------- | ------------------------------------------------------------- |
| `palabra`   | debe aparecer tal cual                                        |
| `[a b]`     | opcional                                                      |
| `[a\|b]`    | opcional, una de varias                                       |
| `(a\|b c)`  | una de varias                                                 |
| `{monto}`   | el monto ("5 lucas", "1500", "luca y media")                  |
| `{cosa}`    | en qué se gastó                                               |
| `{periodo}` | hoy, ayer, esta semana, la semana pasada, este mes, el mes pasado, este ano |
| `{categoria}` | comida, transporte, estudio, salidas, salud, cuentas, otros |

Intenciones: `registrar-gasto`, `consultar-gastos`, `ultimos-gastos`, `borrar-ultimo-gasto`.

Ejemplos:

- «paque luca y media de micro» → `(pague|paque|pago) {monto} (de|en) {cosa}`, `registrar-gasto`
  (incluye la variante con el error de tipeo, que es justo lo que el usuario escribe).
- «anotame 3 lucas pa la micro» → `anotame {monto} (pa|para) [la|el] {cosa}`, `registrar-gasto`
- «cuanto e gastado esta semana» → `cuanto (e|he) gastado {periodo}`, `consultar-gastos`

Si la herramienta rechaza la propuesta, el motivo explica por qué: corrígela una vez o
déjalo. No insistas con una plantilla que el usuario rechazó.
