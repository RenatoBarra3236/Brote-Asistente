# Distribuir Brote a los testers (decisión 11 del bloque F)

Para las pruebas con 3–5 personas, el camino es **GitHub Releases**, no «te paso un archivo».

## Publicar una versión

1. Sube la versión en `apps/desktop/src-tauri/tauri.conf.json` y `apps/desktop/package.json` si cambió.
2. Crea y sube una etiqueta: `git tag v0.1.0 && git push origin v0.1.0` (desde GitHub Desktop: *Repository → Create tag*).
3. **Compilar Brote** (pestaña Actions) corre las pruebas, arma el `.dmg` (Mac) y el `.exe`/`.msi` (Windows) y deja un **borrador** de release con los instaladores.
4. En la pestaña **Releases**, revisa el borrador, pruébalo en un Mac (y, si puedes, en un Windows) y publícalo. Hasta que no lo publiques, nadie lo ve.
5. Pásale a cada tester el enlace a Releases y a [instalar.md](instalar.md). Nada más.

> **Falta probar:** el job `borrador` de `.github/workflows/compilar.yml` se escribió sin correrlo. Si falla, los instaladores siguen disponibles como artefactos de la ejecución (Actions → la ejecución → Artifacts) y el release se arma a mano.
>
> **El repositorio es privado** (decisión del 6-10-2026): a cada tester se le da acceso como colaborador con permiso de lectura (Settings → Collaborators → Add people) y necesita su cuenta de GitHub para ver Releases y bajar el instalador. Quien no tenga cuenta puede recibir el instalador por Drive o AirDrop. La **privacidad** no depende del repo: `docs/privacidad.md` viaja dentro de la app (menú 🌱 → Privacidad y el botón «Leer todo sobre tu privacidad» del asistente abren una ventana propia).
>
> **Node dentro de la app:** `pnpm empaquetar-node` (parte de `beforeBuildCommand`) copia el Node que corre el script a `recursos/node/` (122 MB en disco, unos 45 MB comprimido en el instalador). En CI es el que deja `actions/setup-node`. Con `ASISTENTE_NODE_PARA_EMPAQUETAR` se elige otro. Tiene que ser un Node oficial de un solo archivo (el de Homebrew se rechaza). Al firmar la app (más abajo) este ejecutable también hay que firmarlo y darle la autorización `com.apple.security.cs.allow-jit`, porque Node usa compilación JIT; sin ella, una app con *hardened runtime* lo mata al arrancar.

## Firmar y actualizar (después de las pruebas)

Hoy los instaladores **no están firmados**: el primer mal rato de un tester es el aviso de Gatekeeper (Mac) o SmartScreen (Windows). Se decide **después** de saber si a 3 de 5 les interesa:

| | Qué cuesta | Qué quita |
|---|---|---|
| Apple Developer Program | ~99 USD al año | El aviso de Gatekeeper (firma y notarización) |
| Certificado de firma de código de Windows | desde ~100 USD al año | La advertencia de SmartScreen (mejora con reputación) |
| Actualizaciones automáticas (updater de Tauri) | Una clave propia de firma de actualizaciones, sin costo | Pasar un instalador nuevo a mano |

Mientras tanto, `instalar.md` explica el aviso paso a paso. Si la primera prueba muestra que ese aviso hace desistir a alguien, es la primera señal para pagar la firma.
