# Referencias técnicas (paso 2)

Revisado el 1 de octubre de 2026, leyendo el código publicado en GitHub y en npm, sin clonar los repositorios.

## Qué tomamos de cada proyecto

| Técnica | De dónde | Para qué paso | ¿Se puede copiar código? |
| --- | --- | --- | --- |
| Resortes, curvas de animación y bucle de dibujo | Coucou, versión Windows (`windows/src/core/anim.ts`, `windows/src/mochi/engine.ts`) | 4 | Sí, el código es MIT. El personaje Mochi, su nombre y sus sonidos no |
| Ojos proyectados sobre una esfera que siguen el cursor | Coucou (`engine.ts`, `drawEyes`) | 4 | Sí la técnica; el diseño del personaje es nuestro |
| Estados del personaje como configuración | Coucou (`BOT_STATES` en `engine.ts`) | 4 y 5 | Sí la idea |
| Ventana transparente, sin bordes y siempre visible | Coucou (`windows/src-tauri/tauri.conf.json`) | 4 | Sí |
| Transparencia y nivel de ventana en macOS | OC-Claw (`frontend/src-tauri/tauri.conf.json` y `src/lib.rs`) | 4 | El código es MIT; los dibujos no se pueden usar comercialmente |
| Mostrar y esconder con temporizadores | Coucou (`windows/src/island/fsm.ts`) | 5 | Sí |
| Conexión en vivo al Gateway | Paquete oficial `@openclaw/gateway-client` | 3 | Sí, es MIT y es la vía soportada |

KKClaw no se usa: su licencia es solo para uso personal y prohíbe cualquier uso comercial, y además no usa los eventos en vivo del Gateway.

## 1. Animación del personaje (paso 4)

Coucou dibuja a Mochi con Canvas 2D, sin imágenes. Lo que vale la pena replicar con nuestro propio personaje:

- **Resorte físico** (`Spring` en `anim.ts`): frecuencia `ω₀ = 2π / response` y amortiguación `ζ`, integrado en sub-pasos de 1/240 s para que un cuadro lento no lo desestabilice. Valores típicos: `response = 0.5`, `damping = 0.72`.
- **Suavizado independiente de los FPS:** cada propiedad se acerca a su objetivo con `k = 1 - Math.pow(base, dt)`, por ejemplo `base = 0.0025` para la mirada y `0.0008` para el cuerpo. Así se ve igual a 30 o a 120 FPS.
- **El personaje es un conjunto de números animables:** `yaw` y `pitch` (hacia dónde mira), `tilt` (inclinación), `open` (párpados), `sx`/`sy` (aplastar y estirar), `oy` (rebote) y el color. Cada estado solo cambia objetivos; el bucle `update(dt)` + `draw(ctx, W, H)` hace el resto.
- **Animaciones por tramos** con curvas (`Ease.out`, `Ease.inOut`, `Ease.back`): por ejemplo, el parpadeo es `open` → 0,06 en 70 ms y vuelve a 1 en 130 ms.
- **Ojos sobre una esfera** (`drawEyes`), el truco que más vida le da:
  - Cada ojo tiene un ángulo `eyeYaw = ±separación + yaw`.
  - Posición: `x = sin(eyeYaw) · cos(pitch) · radioX` e `y = −sin(pitch) · radioY`.
  - Se achica en el borde con `escalaX = max(0.18, cos(eyeYaw))`, como si girara sobre una esfera.
  - Se oculta si queda "detrás": `cos(eyeYaw) · cos(pitch) ≤ 0.04`.
  - Mirar el cursor: `yawObjetivo = mouseX · 0.62` y `pitchObjetivo = mouseY · 0.5`.
- **Detalles de vida:** parpadeo cada 2,2 a 5,4 s, con 22% de probabilidad de un doble parpadeo; respiración con `sy = 1 + sin(t · 1.8) · 0.035`; aplastarse al hacerle clic.
- **Cuerpo:** una superelipse (exponente 2/2,7) con degradado, sombra interior y un brillo. El nuestro debe tener otra forma y otros colores.

Estados de Coucou que calzan con nuestros cinco:

| Nuestro estado | Equivalente en Coucou | Cómo se ve |
| --- | --- | --- |
| En reposo | `idle` | Ojos normales, sigue el cursor |
| Pensando | `thinking` | Mira hacia arriba a la derecha, puntos animados |
| Trabajando | `working` | Color de trabajo, puntos animados |
| Pidiendo permiso | `approval` | Ojos grandes, signo de exclamación, rebota |
| Listo | `finished` | Ojos felices |
| Error (extra) | `error` | Ojos planos |

## 2. La ventana (paso 4)

**Configuración de Tauri** (de Coucou): `decorations: false`, `transparent: true`, `shadow: false`, `alwaysOnTop: true`, `skipTaskbar: true`, `focus: false`, `resizable: false`, y una política de seguridad de contenido (CSP) estricta.

**En macOS** (de OC-Claw):

- La transparencia exige `"macOSPrivateApi": true` en `tauri.conf.json`. Confirma el riesgo que anotamos en el plan: impide publicar en la Mac App Store, pero no afecta al prototipo.
- Para que la ventana aparezca sobre todo, OC-Claw usa AppKit desde Rust (`objc2`), en el hilo principal: `setLevel: 27` y `setCollectionBehavior` con "en todos los escritorios", "fija", "fuera del ciclo de ventanas" y "sobre apps a pantalla completa".
- Para ubicarla junto al notch calcula su ancho con `NSScreen.auxiliaryTopRightArea`. Nuestro prototipo es una ventana flotante, así que esto queda como opción para más adelante.

**Mostrar y esconder:** Coucou usa una máquina de estados pequeña (`hidden`, `petit`, `home`, `coucou`) con temporizadores y sin depender de la interfaz. Sirve como patrón para que el personaje se achique cuando no hay actividad.

## 3. Conexión al Gateway (paso 3)

Ninguna de las referencias usa los eventos en vivo:

- **OC-Claw** detecta actividad revisando qué archivos de sesión `.jsonl` de `~/.openclaw/agents/*/sessions/` están abiertos (con `lsof`). Es indirecto y no permite chatear ni aprobar.
- **KKClaw** envía mensajes por HTTP a `/v1/chat/completions` y espera la respuesta completa, sin eventos de tools.

Por eso usamos el **paquete oficial** `@openclaw/gateway-client` (MIT), fijado en la misma versión que el Gateway:

```bash
pnpm add -E @openclaw/gateway-client@2026.9.7 @openclaw/gateway-protocol@2026.9.7
```

Lo que muestran sus tipos:

- `new GatewayClient(opciones)`, luego `start()` y `stop()`, y `request(método, parámetros)` para llamar al Gateway.
- Opciones clave: `url` (`ws://127.0.0.1:18789`), `role: "operator"`, `scopes` (`operator.read`, `operator.write`, `operator.approvals`), `caps` con `GATEWAY_CLIENT_CAPS.TOOL_EVENTS` (desde `@openclaw/gateway-protocol/client-info`), `minProtocol: 4` y `maxProtocol: 4`, `deviceIdentity` o `token`, y los callbacks `onHelloOk`, `onEvent`, `onClose` y `onConnectError`.
- Los eventos del agente tienen la forma `{ runId, seq, stream, ts, data }`. En el protocolo aparecen los flujos `lifecycle`, `assistant`, `thinking`, `tool` y `error`, que es justo lo que necesitamos para los estados.
- Otros métodos y eventos documentados: `sessions.subscribe`, `chat.history`, `exec.approval.requested` y `exec.approval.resolved`.

Pendiente de confirmar en el paso 3, con el script de prueba:

- El método exacto para enviar un mensaje. La lista completa llega en `hello-ok.features.methods`.
- Qué trae `data` en cada flujo, y si con el runtime de Claude CLI llegan los eventos de tools con detalle.
- La autenticación local: usar el token compartido del Gateway (leído en tiempo de ejecución desde `~/.openclaw/openclaw.json`, nunca escrito en el repositorio) o el emparejamiento de dispositivo que recomienda la documentación.

## Licencias, en resumen

| Proyecto | Código | Personajes, dibujos y sonidos |
| --- | --- | --- |
| Coucou | MIT | Reservados por su autor |
| OC-Claw | MIT | Solo uso no comercial |
| KKClaw | Solo uso personal, sin uso comercial | — |
| `@openclaw/gateway-client` | MIT | — |

Si copiamos código MIT, se mantiene su aviso de copyright en el archivo correspondiente.
