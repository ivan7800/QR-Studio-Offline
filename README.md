# QR Studio Offline v6

Aplicación web local, profesional y offline-first para generar códigos QR sin enviar datos a internet.

## Funciones

- QR para texto, URL, WiFi, email, teléfono, WhatsApp, vCard, ubicación y evento calendario.
- Descarga en PNG y SVG.
- Copia de imagen al portapapeles cuando el navegador lo permite.
- Tamaño, color, fondo y margen personalizables.
- Previsualización en tiempo real.
- Historial local manual en **IndexedDB**: no se guarda nada mientras escribes.
- Migración automática desde historiales antiguos en `localStorage` y borrado de esas claves heredadas.
- Modo claro/oscuro con preferencia guardada.
- Responsive para móvil, tablet y escritorio.
- PWA con `manifest.json`, `sw.js` e iconos instalables.
- Sin CDN: el motor QR está incluido en `vendor/qr-lite.js`.
- Pruebas E2E preparadas con Playwright.

## Estructura

```txt
qr-studio-offline/
├── index.html
├── style.css
├── app.js
├── sw.js
├── manifest.json
├── icon.svg
├── icon-192.png
├── icon-512.png
├── vendor/
│   └── qr-lite.js
├── tests/
│   └── e2e/
│       └── qr-studio.spec.js
├── playwright.config.js
├── package.json
├── package-lock.json
├── LICENSE
└── README.md
```

## Uso local

Puedes abrir `index.html` directamente en tu navegador para usar el generador.

Para probar la PWA y el service worker en local, sirve la carpeta con un servidor:

```bash
python3 -m http.server 8080
```

Después abre `http://localhost:8080`.

> El service worker solo se activa en HTTPS o `localhost`. En GitHub Pages funcionará como PWA completa e instalable.

## Publicar en GitHub Pages

1. Sube todos los archivos al repositorio, respetando la carpeta `vendor/`.
2. En GitHub, entra en **Settings → Pages**.
3. Selecciona la rama principal y la carpeta raíz.
4. Abre la URL publicada.

## Pruebas

Instala dependencias:

```bash
npm install
```

Comprueba sintaxis:

```bash
npm run check
```

Instala navegadores de Playwright si tu entorno no los tiene:

```bash
npx playwright install
```

Ejecuta las pruebas E2E:

```bash
npm run test:e2e
```

Las pruebas validan generación, validaciones peligrosas, guardado en IndexedDB, ausencia de historial en `localStorage` y ocultación de contraseñas WiFi en la vista de historial.

## Privacidad

La app no realiza peticiones externas. El historial no se guarda automáticamente: solo se escribe en **IndexedDB** cuando el usuario pulsa **Guardar en historial**. Las claves antiguas de historial en `localStorage` se migran y se eliminan. Si se guardan QR con datos sensibles, pueden borrarse desde **Borrar todo** o eliminando elementos individuales.

La preferencia de tema claro/oscuro sí puede guardarse en `localStorage`, pero no contiene contenido de QR ni datos personales.

## Seguridad y validaciones

- Renderizado de campos e historial mediante DOM seguro, sin inyectar HTML de usuario.
- Validación de URL, email, teléfono, WhatsApp, coordenadas y fechas de calendario.
- Eventos generados en formato `VCALENDAR` válido.
- vCard y calendario escapan caracteres especiales.
- Service worker limitado a recursos del mismo origen.
- Historial persistente en IndexedDB, no en `localStorage`.

## Motor QR local

`vendor/qr-lite.js` es un motor QR local basado en la implementación clásica de Kazuhiko Arase, empaquetado sin CDN y con generación Canvas/SVG. Soporta selección automática de versión QR, corrección de errores nivel M y exportación offline. Para uso corporativo certificado, conviene añadir validación con lectores físicos y una matriz de compatibilidad propia.
