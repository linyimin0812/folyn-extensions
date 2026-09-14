[English](README.md) | [简体中文](README.zh.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md)

# folyn-extensions

Directorio central del repositorio de extensiones de [Folyn](https://github.com/linyimin0812/folyn).

Este repositorio tiene un solo archivo: [`catalog.json`](./catalog.json) — enumera todas las extensiones instalables. La aplicación Folyn obtiene esta lista desde `https://raw.githubusercontent.com/linyimin0812/folyn-extensions/main/catalog.json` y descarga e instala cada extensión desde los GitHub Releases del propio publicador.

## Extensiones incluidas

| id | descripción | tier |
|---|---|---|
| `folyn-rich-text` | Editor de texto enriquecido: ProseMirror + exportación HTML | trusted |
| `folyn-dbml` | Modelado de bases de datos DBML: editor CodeMirror + vista previa de diagrama ER | trusted |
| `folyn-file-viewer` | Visor de archivos universal (Office/PDF/CAD/archivo/medios), extensión FileType de respaldo | trusted |

## Contribuir extensiones

El flujo para que terceros publiquen extensiones en este repositorio se describe en [CONTRIBUTING.md](./CONTRIBUTING.es.md).

En resumen: empaqueta la extensión en un zip y publícalo en tu propio GitHub Release → abre un PR en este repositorio para añadir una entrada en `catalog.json` (el `downloadUrl` apunta a tu Release) → los mantenedores revisan manifest/permisos/tier y fusionan.
