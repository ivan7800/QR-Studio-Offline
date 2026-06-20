const { test, expect } = require('@playwright/test');

async function indexedDbCount(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('qr-studio-offline-db', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'id' });
    };
    request.onerror = () => resolve(-1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('history', 'readonly');
      const countRequest = tx.objectStore('history').count();
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => resolve(-1);
    };
  }));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.open('qr-studio-offline-db', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'id' });
      };
      request.onerror = () => resolve();
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('history', 'readwrite');
        tx.objectStore('history').clear();
        tx.oncomplete = tx.onerror = tx.onabort = () => { db.close(); resolve(); };
      };
    });
  });
  await page.reload();
});

test('genera QR de texto y permite guardar historial en IndexedDB sin localStorage', async ({ page }) => {
  await page.locator('#field-text').fill('QR Studio Offline prueba E2E');
  await expect(page.locator('#downloadPng')).toBeEnabled();
  await page.locator('#saveHistory').click();
  await expect(page.locator('#historyList')).toContainText('Texto libre');
  await expect.poll(() => indexedDbCount(page)).toBe(1);

  const historyKeys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.toLowerCase().includes('history')));
  expect(historyKeys).toEqual([]);
});

test('rechaza URL peligrosa y acepta URL HTTPS válida', async ({ page }) => {
  await page.locator('#qrType').selectOption('url');
  await page.locator('#field-url').fill('javascript:alert(1)');
  await expect(page.locator('#errorBox')).toContainText('URL válida');
  await page.locator('#field-url').fill('https://example.com');
  await expect(page.locator('#downloadSvg')).toBeEnabled();
});

test('oculta contraseña WiFi en el historial', async ({ page }) => {
  await page.locator('#qrType').selectOption('wifi');
  await page.locator('#field-ssid').fill('Mi Red');
  await page.locator('#field-password').fill('Secreto12345');
  await page.locator('#saveHistory').click();
  await expect(page.locator('#historyList')).toContainText('contraseña oculta');
  await expect(page.locator('#historyList')).not.toContainText('Secreto12345');
});

test('validación móvil: WhatsApp inválido no activa descarga', async ({ page }) => {
  await page.locator('#qrType').selectOption('whatsapp');
  await page.locator('#field-phone').fill('123');
  await expect(page.locator('#downloadPng')).toBeDisabled();
  await expect(page.locator('#errorBox')).toContainText('WhatsApp válido');
});
