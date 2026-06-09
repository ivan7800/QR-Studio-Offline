# QR Studio Offline

Aplicación web local, profesional y offline-first para generar códigos QR sin enviar datos a internet.

## Funciones

- QR para texto, URL, WiFi, email, teléfono, WhatsApp, vCard, ubicación y evento calendario.
- Descarga en PNG y SVG.
- Copia de imagen al portapapeles cuando el navegador lo permite.
- Tamaño, color, fondo y margen personalizables.
- Previsualización en tiempo real.
- Historial local con `localStorage`.
- Modo claro/oscuro.
- Responsive para móvil, tablet y escritorio.
- PWA con `manifest.json`, `sw.js` e icono instalable.
- Sin CDN: la librería QR está incluida en `vendor/qr-lite.js`.

## Estructura

```
qr-studio-offline/
├── index.html
├── style.css
├── app.js
├── sw.js
├── manifest.json
├── icon.svg
├── vendor/
│   └── qr-lite.js
└── LICENSE
```

## Uso local

Abre `index.html` directamente en tu navegador.

> El service worker solo se activa en HTTPS o `localhost`. En GitHub Pages funcionará como PWA completa e instalable.

## Publicar en GitHub Pages

1. Sube todos los archivos al repositorio (respetando la carpeta `vendor/`).
2. En GitHub, entra en **Settings → Pages**.
3. Selecciona la rama principal y la carpeta raíz.
4. Abre la URL publicada.

## Privacidad

La app no realiza peticiones externas. El historial se guarda solo en el navegador del usuario mediante `localStorage`.

## Límites técnicos

La librería incluida prioriza ligereza y funcionamiento offline. Soporta modo byte con corrección de errores M en versiones QR 1–10. Para textos extremadamente largos, reduce el contenido o usa una librería QR completa, siempre como archivo local.
