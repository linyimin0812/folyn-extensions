[English](CONTRIBUTING.md) | [简体中文](CONTRIBUTING.zh.md) | [日本語](CONTRIBUTING.ja.md) | [Français](CONTRIBUTING.fr.md) | [Deutsch](CONTRIBUTING.de.md) | [Español](CONTRIBUTING.es.md)

# Contribuir extensiones al repositorio de Folyn

Este repositorio es el **directorio central** del repositorio de extensiones de [Folyn](https://github.com/linyimin0812/folyn). El archivo `catalog.json` en la raíz enumera todas las extensiones instalables; el zip de cada extensión se aloja en los Releases del **propio repositorio de GitHub del publicador**, y la aplicación Folyn obtiene la lista de este directorio y descarga e instala desde el repositorio del publicador.

Cualquier tercero puede contribuir extensiones: empaqueta tu extensión en un zip, publícala en tu propio GitHub Release y abre un PR en este repositorio para añadir una entrada en `catalog.json`. Los mantenedores revisan manifest / permisos / tier y luego fusionan; la extensión pasa a ser visible en el repositorio para todos los usuarios.

---

## Flujo de publicación (terceros)

### 1. Construir la extensión

Desarrolla la extensión según la [documentación de desarrollo de extensiones de Folyn](https://github.com/linyimin0812/folyn/blob/main/docs/extension-store.md) y genera el directorio `dist/`. La **raíz** de `dist/` debe contener `manifest.json` (Folyn lee el manifest desde la raíz del zip durante la instalación).

### 2. Empaquetar el zip

Empaqueta en un zip los **contenidos** de `dist/` (no la carpeta `dist` en sí), asegurando que `manifest.json` quede en la raíz del zip:

```sh
cd path/to/your-extension/dist
zip -r -X <id>-<version>.zip . -x "*.DS_Store"
```

Verifica:
```sh
unzip -l <id>-<version>.zip | head   # manifest.json debe estar en la raíz, sin prefijo de directorio
```

**Restricciones de contenido del zip** (impuestas por `extract_zip_filtered` durante la instalación en Folyn; las infracciones provocan el rechazo directo de la instalación):
- ❌ Código fuente: `src/`, `*.ts`
- ❌ Archivos de configuración/bloqueo: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `tsconfig.json`, etc.
- ❌ `node_modules/`
- ❌ Enlaces simbólicos, rutas absolutas, rutas con `..` (protección zip-slip)
- ⚠️ Se rechazan archivos individuales > 50 MB, totales > 100 MB o más de 1000 entradas

### 3. Publicar un GitHub Release

Crea una etiqueta `<id>-<version>` (p. ej. `my-ext-0.2.0`) en tu repositorio de extensión y sube el zip como Release asset:

```sh
gh release create <id>-<version> <id>-<version>.zip \
  --repo <your-github-username>/<your-extension-repo> \
  --title "<id> <version>"
```

Registra el enlace directo de descarga del asset, con la forma:
```
https://github.com/<your-github-username>/<your-extension-repo>/releases/download/<id>-<version>/<id>-<version>.zip
```

> ⚠️ El host de la URL de descarga **debe ser `github.com`**. El comando `install_extension_from_url` de Folyn solo permite `github.com` (protección SSRF); cualquier otro host se rechaza. El Release asset devuelve un 302 que redirige a `objects.githubusercontent.com`; el descargador lo sigue automáticamente, no requiere tratamiento.

### 4. Abrir un PR en este directorio

Haz un fork de este repositorio, edita `catalog.json` y añade una entrada al final del array `extensions`:

```json
{
  "id": "my-ext",
  "name": { "zh": "我的扩展", "en": "My Extension" },
  "version": "0.2.0",
  "description": { "zh": "一句话说明扩展做什么", "en": "One-line description" },
  "tier": "sandbox",
  "author": "your-github-username",
  "icon": "<svg viewBox="0 0 16 16" ...>...</svg>",
  "downloadUrl": "https://github.com/<your-github-username>/<your-extension-repo>/releases/download/my-ext-0.2.0/my-ext-0.2.0.zip"
}
```

> `name`/`description` también pueden escribirse como cadenas simples (p. ej. `"name": "DBML"`); en ese caso todos los idiomas muestran esa cadena. Con un objeto multilingüe se renderiza según el idioma actual del usuario y, si falta, se hace fallback zh → en → el primero disponible. `icon` debe coincidir con el `icon` del `manifest.json` de la extensión — se recomienda pegar directamente el contenido del archivo `.svg` de la extensión (o usar el mismo emoji).

Descripción de campos:

| campo | descripción |
|---|---|
| `id` | Debe coincidir con el `id` del `manifest.json` dentro del zip; kebab-case; globalmente único (ver comprobación de duplicados más abajo) |
| `name` / `version` / `description` / `author` | Para visualización; `version` coincide con la etiqueta del Release. `name`/`description` pueden ser una cadena simple (fallback para todos los idiomas) o un objeto multilingüe `{ "zh": "...", "en": "..." }`; la aplicación lo resuelve según el locale actual (fallback: locale actual → zh → en → el primero disponible) |
| `tier` | `sandbox` (iframe con origin independiente, restringido) o `trusted` (proceso principal, todas las capacidades del host; tras la instalación el usuario debe pulsar «Aprobar» en la aplicación para autorizar TOFU) |
| `icon` | Debe **coincidir** con el `icon` del `manifest.json` de la extensión: texto SVG inline (pega el contenido del archivo `.svg` de la extensión) o emoji. Una extensión ya instalada lee el SVG localmente, mientras que el repositorio lo renderiza desde el catalog — ambos deben coincidir para que el repositorio y la lista de instaladas muestren el mismo icono |
| `downloadUrl` | Enlace directo al Release asset de tu repositorio; el host debe ser `github.com` |

Abre el PR describiendo la funcionalidad de la extensión, los permisos declarados y por qué este tier.

---

## Checklist de revisión del mantenedor

Confirma cada elemento antes de fusionar el PR:

- [ ] **id único**: sin `id` duplicados en `catalog.json` y sin conflictos con las extensiones oficiales (`folyn-rich-text` / `folyn-dbml` / `folyn-file-viewer`)
- [ ] **id válido**: el `id` de `manifest.json` coincide con el `id` de la entrada del catalog; kebab-case, sin `.` / `/` / `\` (`is_valid_extension_id`)
- [ ] **downloadUrl**: el host es `github.com`; el nombre de la etiqueta/asset coincide con el `version` de la entrada; `curl -sIL` devuelve 200 + `content-type: application/zip`
- [ ] **manifest válido**: `manifest.json` en la raíz del zip; `id`/`name`/`version`/`tier`/`main` completos; `validate_manifest` pasa
- [ ] **tier razonable**: usa `sandbox` siempre que sea posible en lugar de `trusted`. `trusted` otorga todas las capacidades del proceso principal (leer/escribir el vault, invocar comandos Tauri, acceder a todo el React state) — solo se autoriza para extensiones que de verdad requieran integración profunda
- [ ] **permisos mínimos**: `permissions.fs`/`http`/`vault` etc. declarados según necesidad; el origin allowlist no contiene comodines; `contributes` declarado en consonancia con la funcionalidad
- [ ] **zip limpio**: sin `src/`, `*.ts`, `package*.json`, `node_modules`; sin enlaces simbólicos; tamaño dentro de los límites (archivo individual ≤50 MB / total ≤100 MB / ≤1000 entradas)
- [ ] **icon consistente con manifest**: el `icon` del catalog debe tener el mismo origen que el `icon` del `manifest.json` de la extensión (mismo SVG inline o mismo emoji); de lo contrario, el repositorio y la lista de instaladas muestran iconos distintos
- [ ] **multilingüe**: proporciona al menos en `name`/`description` los idiomas que puedan usar los usuarios; una cadena simple como fallback para todos los idiomas también es válido
- [ ] **firma** (opcional): si incluye `signature` + `publisherPublicKey`, verifica que la firma coincida (`verify_extension_signature`); si falta, se aplica el fallback de integridad SHA-256; en el MVP no es obligatorio
- [ ] **prueba de instalación local**: en la página «Instaladas» de la aplicación, usa «Instalar desde .zip» para seleccionar el zip y ejecuta una pasada, confirmando que se instala, se activa y los contribution points se registran correctamente

Tras la revisión, fusiona el PR. La próxima vez que un usuario abra el repositorio (o pulse «Refrescar») verá la nueva extensión.

---

## Actualizar una extensión publicada

Publicar una nueva versión = crear una nueva etiqueta `<id>-<new-version>` en tu repositorio + subir el nuevo zip asset y, después, abrir un PR en este repositorio para actualizar `version` y `downloadUrl` de esa entrada en `catalog.json`. El MVP de Folyn no hace comparación de versiones ni notifica actualizaciones — los usuarios que ya la tienen instalada deben desinstalar y reinstalar desde la página «Instaladas», o bien instalar en modo sobrescritura (`install_extension_zip` es wipe + new, basta con sobrescribir).

## Retirada

Basta con eliminar la entrada de `catalog.json`. Las extensiones ya instaladas no se ven afectadas (el `extensions.json` local y `~/.folyn/extensions/<id>/` se conservan; el usuario puede desinstalarlas manualmente).
