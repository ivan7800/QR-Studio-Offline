'use strict';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'qr-studio-offline-history-v2';
const LEGACY_STORAGE_KEY = 'qr-studio-offline-history-v1';
const THEME_KEY = 'qr-studio-offline-theme';
const DB_NAME = 'qr-studio-offline-db';
const DB_VERSION = 1;
const HISTORY_STORE = 'history';
const MAX_HISTORY = 30;
const MAX_TEXT_BYTES = 1200;

let dbPromise = null;
let memoryHistory = [];

const types = {
  text: {
    label: 'Texto libre',
    fields: [{ id: 'text', label: 'Texto', type: 'textarea', required: true, placeholder: 'Escribe el texto que irá dentro del QR', maxLength: 1200 }],
    build: (v) => normalizeMultiline(v.text).trim()
  },
  url: {
    label: 'URL',
    fields: [{ id: 'url', label: 'Dirección web', type: 'url', required: true, placeholder: 'https://ejemplo.com', inputMode: 'url', autocomplete: 'url' }],
    build: (v) => normalizeUrl(v.url)
  },
  wifi: {
    label: 'WiFi',
    sensitive: true,
    fields: [
      { id: 'ssid', label: 'Nombre de red', required: true, autocomplete: 'off' },
      { id: 'password', label: 'Contraseña', type: 'password', autocomplete: 'new-password' },
      { id: 'encryption', label: 'Seguridad', type: 'select', options: ['WPA', 'WEP', 'nopass'], value: 'WPA' },
      { id: 'hidden', label: 'Red oculta', type: 'checkbox' }
    ],
    build: (v) => buildWifi(v)
  },
  email: {
    label: 'Email',
    fields: [
      { id: 'email', label: 'Email', type: 'email', required: true, inputMode: 'email', autocomplete: 'email' },
      { id: 'subject', label: 'Asunto', maxLength: 160 },
      { id: 'body', label: 'Mensaje', type: 'textarea', maxLength: 800 }
    ],
    build: (v) => buildMailto(v)
  },
  phone: {
    label: 'Teléfono',
    fields: [{ id: 'phone', label: 'Número', type: 'tel', required: true, placeholder: '+34600111222', inputMode: 'tel', autocomplete: 'tel' }],
    build: (v) => buildPhone(v.phone)
  },
  whatsapp: {
    label: 'WhatsApp',
    fields: [
      { id: 'phone', label: 'Número con prefijo', type: 'tel', required: true, placeholder: '34600111222', inputMode: 'tel', autocomplete: 'tel' },
      { id: 'message', label: 'Mensaje', type: 'textarea', maxLength: 700 }
    ],
    build: (v) => buildWhatsapp(v)
  },
  vcard: {
    label: 'vCard / contacto',
    sensitive: true,
    fields: [
      { id: 'name', label: 'Nombre completo', required: true, autocomplete: 'name' },
      { id: 'org', label: 'Empresa', autocomplete: 'organization' },
      { id: 'phone', label: 'Teléfono', type: 'tel', inputMode: 'tel', autocomplete: 'tel' },
      { id: 'email', label: 'Email', type: 'email', inputMode: 'email', autocomplete: 'email' },
      { id: 'url', label: 'Web', type: 'url', inputMode: 'url', autocomplete: 'url' }
    ],
    build: (v) => buildVCard(v)
  },
  location: {
    label: 'Ubicación',
    fields: [
      { id: 'lat', label: 'Latitud', required: true, placeholder: '41.686', inputMode: 'decimal' },
      { id: 'lng', label: 'Longitud', required: true, placeholder: '2.287', inputMode: 'decimal' },
      { id: 'label', label: 'Etiqueta', maxLength: 120 }
    ],
    build: (v) => buildLocation(v)
  },
  event: {
    label: 'Evento calendario',
    fields: [
      { id: 'title', label: 'Título', required: true, maxLength: 160 },
      { id: 'start', label: 'Inicio', type: 'datetime-local', required: true },
      { id: 'end', label: 'Fin', type: 'datetime-local', required: true },
      { id: 'location', label: 'Lugar', maxLength: 160 },
      { id: 'description', label: 'Descripción', type: 'textarea', maxLength: 700 }
    ],
    build: (v) => buildCalendar(v)
  }
};

const state = { currentText: '', currentType: 'text', lastQr: null, lastValues: {}, lastDesign: null };

window.addEventListener('DOMContentLoaded', () => {
  init().catch((err) => {
    setError(err.message || 'No se pudo inicializar la aplicación.');
  });
});

async function init() {
  restoreTheme();
  renderTypeOptions();
  bindEvents();
  renderFields();
  updateQr();
  await migrateLegacyHistory();
  await renderHistory();
  registerServiceWorker();
}

function renderTypeOptions() {
  const select = $('qrType');
  select.replaceChildren(...Object.entries(types).map(([key, t]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = t.label;
    return option;
  }));
}

function bindEvents() {
  $('qrType').addEventListener('change', () => {
    state.currentType = $('qrType').value;
    renderFields();
    updateQr();
  });
  ['qrSize', 'qrMargin', 'qrColor', 'bgColor'].forEach((id) => $(id).addEventListener('input', updateQr));
  $('downloadPng').addEventListener('click', downloadPng);
  $('downloadSvg').addEventListener('click', downloadSvg);
  $('copyPng').addEventListener('click', copyPng);
  $('saveHistory').addEventListener('click', saveCurrentToHistory);
  $('clearHistory').addEventListener('click', clearHistory);
  $('resetForm').addEventListener('click', resetForm);
  $('themeToggle').addEventListener('click', toggleTheme);
}

function renderFields(values = {}) {
  const schema = types[state.currentType];
  const fragment = document.createDocumentFragment();
  for (const field of schema.fields) fragment.appendChild(createField(field, values[field.id] ?? field.value ?? ''));
  $('dynamicFields').replaceChildren(fragment);
  $('dynamicFields').querySelectorAll('input, textarea, select').forEach((el) => {
    el.addEventListener('input', debounce(updateQr, 120));
    el.addEventListener('change', updateQr);
  });
}

function createField(field, value) {
  const label = document.createElement('label');
  label.className = field.type === 'checkbox' ? 'field check-field' : 'field';

  const span = document.createElement('span');
  span.textContent = field.label;

  let input;
  if (field.type === 'select') {
    input = document.createElement('select');
    for (const optionValue of field.options || []) {
      const option = document.createElement('option');
      option.value = optionValue;
      option.textContent = optionValue === 'nopass' ? 'Sin contraseña' : optionValue;
      input.appendChild(option);
    }
    input.value = String(value || field.options?.[0] || '');
  } else if (field.type === 'textarea') {
    input = document.createElement('textarea');
    input.value = String(value || '');
  } else {
    input = document.createElement('input');
    input.type = field.type || 'text';
    if (field.type === 'checkbox') input.checked = Boolean(value);
    else input.value = String(value || '');
  }

  input.id = `field-${field.id}`;
  input.name = field.id;
  if (field.required) input.required = true;
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.inputMode) input.inputMode = field.inputMode;
  if (field.autocomplete) input.autocomplete = field.autocomplete;
  if (field.maxLength) input.maxLength = field.maxLength;

  label.append(span, input);
  return label;
}

function collectValues() {
  const values = {};
  const missing = [];
  for (const field of types[state.currentType].fields) {
    const el = $(`field-${field.id}`);
    values[field.id] = field.type === 'checkbox' ? el.checked : normalizeMultiline(el.value);
    if (field.required && !String(values[field.id]).trim()) missing.push(field.label);
  }
  if (missing.length) throw new Error(`Faltan datos obligatorios: ${missing.join(', ')}.`);
  return values;
}

function updateQr() {
  try {
    const values = collectValues();
    const text = types[state.currentType].build(values).trim();
    if (!text) throw new Error('Introduce contenido para generar el QR.');
    const bytes = byteLength(text);
    if (bytes > MAX_TEXT_BYTES) throw new Error(`El contenido es demasiado largo para esta versión ligera (${bytes}/${MAX_TEXT_BYTES} bytes).`);
    if (!window.QRLite) throw new Error('No se ha cargado la librería QR local. Revisa la carpeta vendor/.');

    state.currentText = text;
    state.lastValues = values;
    state.lastDesign = getDesignOptions();
    state.lastQr = QRLite.draw($('qrCanvas'), text, state.lastDesign);
    $('qrMeta').textContent = `V${state.lastQr.version} · ${state.lastQr.bytes} bytes`;
    $('downloadPng').disabled = false;
    $('downloadSvg').disabled = false;
    $('copyPng').disabled = false;
    $('saveHistory').disabled = false;
    setError('');
  } catch (err) {
    state.currentText = '';
    state.lastQr = null;
    $('qrMeta').textContent = 'Pendiente';
    $('downloadPng').disabled = true;
    $('downloadSvg').disabled = true;
    $('copyPng').disabled = true;
    $('saveHistory').disabled = true;
    clearCanvas();
    setError(err.message || 'No se pudo generar el QR.');
    $('statusText').textContent = '';
  }
}

function getDesignOptions() {
  return {
    size: clamp(Number($('qrSize').value) || 420, 160, 1200),
    margin: clamp(Number($('qrMargin').value) || 4, 4, 10),
    foreground: normalizeColor($('qrColor').value, '#111827'),
    background: normalizeColor($('bgColor').value, '#ffffff')
  };
}

function setError(message) {
  $('errorBox').hidden = !message;
  $('errorBox').textContent = message;
}

function clearCanvas() {
  const canvas = $('qrCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function downloadPng() {
  if (!state.currentText) return setError('No hay un QR válido para descargar.');
  const a = document.createElement('a');
  a.download = safeFileName(`qr-studio-${types[state.currentType].label}-${Date.now()}.png`);
  a.href = $('qrCanvas').toDataURL('image/png');
  a.click();
  notify('PNG descargado.');
}

function downloadSvg() {
  if (!state.currentText) return setError('No hay un QR válido para descargar.');
  const blob = new Blob([QRLite.svg(state.currentText, getDesignOptions())], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = safeFileName(`qr-studio-${types[state.currentType].label}-${Date.now()}.svg`);
  a.href = url;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  notify('SVG descargado.');
}

async function copyPng() {
  if (!state.currentText) return setError('No hay un QR válido para copiar.');
  if (!navigator.clipboard || !window.ClipboardItem) return notify('Tu navegador no permite copiar imágenes desde archivo local. Descarga el PNG como alternativa.');
  $('qrCanvas').toBlob(async (blob) => {
    if (!blob) return notify('No se pudo preparar la imagen. Descarga el PNG como alternativa.');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      notify('Imagen copiada al portapapeles.');
    } catch {
      notify('No se pudo copiar. El navegador puede exigir HTTPS, localhost o PWA instalada.');
    }
  }, 'image/png');
}

async function saveCurrentToHistory() {
  try {
    if (!state.currentText) throw new Error('No hay un QR válido para guardar.');
    const item = normalizeHistoryRecord({
      type: state.currentType,
      values: { ...state.lastValues },
      design: { ...state.lastDesign },
      text: state.currentText,
      createdAt: new Date().toISOString()
    });
    const list = (await getHistory()).filter((h) => h.text !== item.text || h.type !== item.type);
    list.unshift(item);
    const persisted = await setHistory(list.slice(0, MAX_HISTORY));
    await renderHistory();
    if (!persisted) {
      notify('IndexedDB no está disponible: historial temporal solo durante esta sesión.');
    } else {
      notify(types[state.currentType].sensitive ? 'Guardado en IndexedDB. Recuerda borrar el historial si incluye datos sensibles.' : 'Guardado en el historial local IndexedDB.');
    }
  } catch (err) {
    setError(err.message || 'No se pudo guardar en historial.');
  }
}

async function getHistory() {
  const db = await openHistoryDb();
  if (!db) return memoryHistory.filter(isValidHistoryItem).sort(sortHistoryDesc).slice(0, MAX_HISTORY);

  return new Promise((resolve) => {
    const tx = db.transaction(HISTORY_STORE, 'readonly');
    const store = tx.objectStore(HISTORY_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve((Array.isArray(request.result) ? request.result : []).filter(isValidHistoryItem).sort(sortHistoryDesc).slice(0, MAX_HISTORY));
    request.onerror = () => resolve([]);
  });
}

async function setHistory(list) {
  const clean = list.filter(isValidHistoryItem).map(normalizeHistoryRecord).sort(sortHistoryDesc).slice(0, MAX_HISTORY);
  const db = await openHistoryDb();
  if (!db) {
    memoryHistory = clean;
    return false;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, 'readwrite');
    const store = tx.objectStore(HISTORY_STORE);
    store.clear();
    clean.forEach((item) => store.put(item));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(new Error('No se pudo guardar en IndexedDB. El almacenamiento del navegador puede estar lleno o bloqueado.'));
    tx.onabort = () => reject(new Error('No se pudo completar la escritura del historial.'));
  });
}

function isValidHistoryItem(item) {
  return item && typeof item === 'object' && types[item.type] && typeof item.text === 'string' && item.values && typeof item.values === 'object';
}

function normalizeHistoryRecord(item) {
  return {
    id: item.id || createId(),
    type: item.type,
    values: sanitizeHistoryValues(item.type, item.values || {}),
    design: sanitizeDesign(item.design || {}),
    text: String(item.text || '').slice(0, MAX_TEXT_BYTES * 2),
    createdAt: isFiniteDate(item.createdAt) ? item.createdAt : new Date().toISOString()
  };
}

function sanitizeHistoryValues(type, values) {
  const schema = types[type];
  const clean = {};
  if (!schema) return clean;
  for (const field of schema.fields) {
    const value = values[field.id];
    clean[field.id] = field.type === 'checkbox' ? Boolean(value) : String(value ?? '').slice(0, field.maxLength || 1200);
  }
  return clean;
}

function sanitizeDesign(design) {
  return {
    size: clamp(Number(design.size) || 420, 160, 1200),
    margin: clamp(Number(design.margin) || 4, 4, 10),
    foreground: normalizeColor(design.foreground, '#111827'),
    background: normalizeColor(design.background, '#ffffff')
  };
}

function sortHistoryDesc(a, b) {
  return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
}

function isFiniteDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime());
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function openHistoryDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const store = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB está bloqueado por otra pestaña abierta.'));
  }).catch(() => null);

  return dbPromise;
}

async function clearHistory() {
  try {
    const db = await openHistoryDb();
    if (!db) memoryHistory = [];
    else {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(HISTORY_STORE, 'readwrite');
        tx.objectStore(HISTORY_STORE).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(new Error('No se pudo borrar el historial.'));
        tx.onabort = () => reject(new Error('No se pudo completar el borrado del historial.'));
      });
    }
    removeLegacyHistoryKeys();
    await renderHistory();
    notify('Historial IndexedDB borrado.');
  } catch (err) {
    setError(err.message || 'No se pudo borrar el historial.');
  }
}

async function renderHistory() {
  const list = await getHistory();
  const container = $('historyList');
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Todavía no hay historial. Se guarda en IndexedDB solo si pulsas “Guardar en historial”.';
    container.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'history-item';

    const top = document.createElement('div');
    top.className = 'history-top';

    const title = document.createElement('strong');
    title.textContent = types[item.type]?.label || item.type;

    const date = document.createElement('time');
    date.dateTime = item.createdAt || '';
    date.textContent = formatDate(item.createdAt);

    const snippet = document.createElement('small');
    snippet.textContent = historySnippet(item);

    const buttons = document.createElement('div');
    buttons.className = 'history-actions';

    const loadButton = document.createElement('button');
    loadButton.type = 'button';
    loadButton.className = 'secondary mini-btn';
    loadButton.textContent = 'Usar';
    loadButton.addEventListener('click', () => loadHistory(index));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger-mini mini-btn';
    deleteButton.textContent = 'Eliminar';
    deleteButton.addEventListener('click', () => deleteHistoryItem(index));

    top.append(title, date);
    buttons.append(loadButton, deleteButton);
    card.append(top, snippet, buttons);
    fragment.appendChild(card);
  });
  container.replaceChildren(fragment);
}

function historySnippet(item) {
  if (item.type === 'wifi') return `Red: ${item.values?.ssid || 'sin nombre'} · contraseña oculta`;
  if (item.type === 'vcard') return `${item.values?.name || 'Contacto'} · datos de contacto guardados en IndexedDB`;
  return item.text.replace(/\s+/g, ' ').slice(0, 150);
}

async function loadHistory(index) {
  try {
    const item = (await getHistory())[index];
    if (!item) return;
    state.currentType = item.type;
    $('qrType').value = item.type;
    renderFields(item.values || {});
    applyDesign(item.design || {});
    updateQr();
    notify('QR recuperado del historial IndexedDB.');
  } catch (err) {
    setError(err.message || 'No se pudo recuperar el QR del historial.');
  }
}

async function deleteHistoryItem(index) {
  try {
    const list = await getHistory();
    list.splice(index, 1);
    await setHistory(list);
    await renderHistory();
    notify('Elemento eliminado del historial.');
  } catch (err) {
    setError(err.message || 'No se pudo eliminar el elemento del historial.');
  }
}

async function migrateLegacyHistory() {
  const legacy = [];
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) legacy.push(...parsed.filter(isValidHistoryItem));
    } catch {
      // Se ignora cualquier historial antiguo corrupto.
    }
  }

  if (legacy.length) {
    const existing = await getHistory();
    const merged = [...existing, ...legacy].map(normalizeHistoryRecord).filter(isValidHistoryItem);
    const unique = [];
    const seen = new Set();
    for (const item of merged.sort(sortHistoryDesc)) {
      const key = `${item.type}:${item.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    await setHistory(unique.slice(0, MAX_HISTORY));
  }
  removeLegacyHistoryKeys();
}

function removeLegacyHistoryKeys() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Si localStorage está bloqueado, la app sigue funcionando con IndexedDB.
  }
}

function resetForm() {
  renderFields();
  updateQr();
  notify('Formulario limpiado.');
}

function applyDesign(design) {
  if (design.size) $('qrSize').value = clamp(Number(design.size) || 420, 160, 1200);
  if (design.margin) $('qrMargin').value = clamp(Number(design.margin) || 4, 4, 10);
  if (design.foreground) $('qrColor').value = normalizeColor(design.foreground, '#111827');
  if (design.background) $('bgColor').value = normalizeColor(design.background, '#ffffff');
}

function toggleTheme() {
  const dark = !document.body.classList.contains('dark');
  document.body.classList.toggle('dark', dark);
  localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  $('themeToggle').textContent = dark ? '☀️' : '🌙';
}

function restoreTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const dark = stored === 'dark' || (!stored && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark', dark);
  $('themeToggle').textContent = dark ? '☀️' : '🌙';
}

function notify(text) {
  $('statusText').textContent = text;
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => {
    if ($('statusText').textContent === text) $('statusText').textContent = '';
  }, 3600);
}

function buildWifi(v) {
  const ssid = String(v.ssid || '').trim();
  const encryption = ['WPA', 'WEP', 'nopass'].includes(v.encryption) ? v.encryption : 'WPA';
  const password = String(v.password || '');
  if (!ssid) throw new Error('El nombre de red WiFi es obligatorio.');
  if (encryption !== 'nopass' && !password) throw new Error('Introduce contraseña o elige “Sin contraseña”.');
  return `WIFI:T:${encryption};S:${escapeWifi(ssid)};${encryption === 'nopass' ? '' : `P:${escapeWifi(password)};`}H:${v.hidden ? 'true' : 'false'};;`;
}

function buildMailto(v) {
  const email = String(v.email || '').trim();
  if (!isEmail(email)) throw new Error('Introduce un email válido.');
  const params = new URLSearchParams();
  if (String(v.subject || '').trim()) params.set('subject', String(v.subject).trim());
  if (String(v.body || '').trim()) params.set('body', String(v.body).trim());
  const query = params.toString();
  return `mailto:${email}${query ? `?${query}` : ''}`;
}

function buildPhone(value) {
  const raw = String(value || '').trim();
  const clean = raw.replace(/[\s().-]/g, '');
  if (!/^\+?\d{6,15}$/.test(clean)) throw new Error('Introduce un teléfono válido con 6 a 15 dígitos.');
  return `tel:${clean}`;
}

function buildWhatsapp(v) {
  const phone = digits(v.phone);
  if (!/^\d{8,15}$/.test(phone)) throw new Error('Introduce un número de WhatsApp válido con prefijo internacional.');
  const message = String(v.message || '').trim();
  return `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

function buildVCard(v) {
  const name = String(v.name || '').trim();
  if (!name) throw new Error('El nombre del contacto es obligatorio.');
  if (v.email && !isEmail(v.email)) throw new Error('El email del contacto no es válido.');
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCard(name)}`,
    `N:${escapeVCard(vCardName(name))}`
  ];
  if (v.org) lines.push(`ORG:${escapeVCard(v.org)}`);
  if (v.phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(buildPhone(v.phone).replace('tel:', ''))}`);
  if (v.email) lines.push(`EMAIL:${escapeVCard(String(v.email).trim())}`);
  if (v.url) lines.push(`URL:${normalizeUrl(v.url)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

function buildLocation(v) {
  const lat = parseCoordinate(v.lat, -90, 90, 'latitud');
  const lng = parseCoordinate(v.lng, -180, 180, 'longitud');
  const label = String(v.label || '').trim();
  const query = encodeURIComponent(`${lat},${lng}${label ? ` (${label})` : ''}`);
  return `geo:${lat},${lng}?q=${query}`;
}

function buildCalendar(v) {
  const title = String(v.title || '').trim();
  const start = parseLocalDate(v.start, 'inicio');
  const end = parseLocalDate(v.end, 'fin');
  if (!title) throw new Error('El título del evento es obligatorio.');
  if (end.getTime() <= start.getTime()) throw new Error('La fecha de fin debe ser posterior a la de inicio.');
  const now = icsDate(new Date());
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@qr-studio-offline`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QR Studio Offline//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `SUMMARY:${escapeICS(title)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    v.location ? `LOCATION:${escapeICS(v.location)}` : '',
    v.description ? `DESCRIPTION:${escapeICS(v.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');
}

function normalizeUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Introduce una URL válida.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Solo se permiten URL http o https.');
  const host = parsed.hostname;
  const isLocalhost = host === 'localhost';
  const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
  const isIPv6 = host.includes(':');
  if (!host || (!host.includes('.') && !isLocalhost && !isIPv4 && !isIPv6)) throw new Error('Introduce una URL con dominio, IP o localhost válido.');
  return parsed.toString();
}

function parseCoordinate(value, min, max, label) {
  const normalized = String(value || '').trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) throw new Error(`La ${label} debe ser numérica.`);
  const number = Number(normalized);
  if (number < min || number > max) throw new Error(`La ${label} debe estar entre ${min} y ${max}.`);
  return number.toFixed(6).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function parseLocalDate(value, label) {
  if (!value) throw new Error(`Introduce la fecha de ${label}.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`La fecha de ${label} no es válida.`);
  return date;
}

function icsDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

function escapeWifi(value = '') {
  return String(value).replace(/[\\;,":]/g, '\\$&');
}

function escapeVCard(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function escapeICS(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function vCardName(name) {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length <= 1) return `${parts[0] || ''};;;;`;
  const family = parts.pop();
  return `${family};${parts.join(' ')};;;`;
}

function digits(value = '') {
  return String(value).replace(/[^\d]/g, '');
}

function normalizeMultiline(value = '') {
  return String(value).replace(/\r\n?/g, '\n');
}

function normalizeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
}

function byteLength(value) {
  return new TextEncoder().encode(String(value)).length;
}

function safeFileName(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_.-]+/gi, '-').replace(/-+/g, '-').toLowerCase();
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function clamp(number, min, max) {
  return Math.min(max, Math.max(min, number));
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}


function registerServiceWorker() {
  if ('serviceWorker' in navigator && ['http:', 'https:'].includes(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
