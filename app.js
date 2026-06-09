'use strict';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'qr-studio-offline-history-v1';
const THEME_KEY = 'qr-studio-offline-theme';

const types = {
  text: { label: 'Texto libre', fields: [{ id: 'text', label: 'Texto', type: 'textarea', required: true, placeholder: 'Escribe el texto que irá dentro del QR' }], build: v => v.text.trim() },
  url: { label: 'URL', fields: [{ id: 'url', label: 'Dirección web', type: 'url', required: true, placeholder: 'https://ejemplo.com' }], build: v => normalizeUrl(v.url) },
  wifi: { label: 'WiFi', fields: [{ id: 'ssid', label: 'Nombre de red', required: true }, { id: 'password', label: 'Contraseña', type: 'password' }, { id: 'encryption', label: 'Seguridad', type: 'select', options: ['WPA', 'WEP', 'nopass'] }, { id: 'hidden', label: 'Red oculta', type: 'checkbox' }], build: v => `WIFI:T:${v.encryption};S:${escapeWifi(v.ssid)};P:${escapeWifi(v.password)};H:${v.hidden ? 'true' : 'false'};;` },
  email: { label: 'Email', fields: [{ id: 'email', label: 'Email', type: 'email', required: true }, { id: 'subject', label: 'Asunto' }, { id: 'body', label: 'Mensaje', type: 'textarea' }], build: v => `mailto:${v.email.trim()}?subject=${encodeURIComponent(v.subject)}&body=${encodeURIComponent(v.body)}` },
  phone: { label: 'Teléfono', fields: [{ id: 'phone', label: 'Número', type: 'tel', required: true, placeholder: '+34600111222' }], build: v => `tel:${v.phone.trim()}` },
  whatsapp: { label: 'WhatsApp', fields: [{ id: 'phone', label: 'Número con prefijo', type: 'tel', required: true, placeholder: '34600111222' }, { id: 'message', label: 'Mensaje', type: 'textarea' }], build: v => `https://wa.me/${digits(v.phone)}${v.message.trim() ? `?text=${encodeURIComponent(v.message.trim())}` : ''}` },
  vcard: { label: 'vCard / contacto', fields: [{ id: 'name', label: 'Nombre completo', required: true }, { id: 'org', label: 'Empresa' }, { id: 'phone', label: 'Teléfono', type: 'tel' }, { id: 'email', label: 'Email', type: 'email' }, { id: 'url', label: 'Web', type: 'url' }], build: v => ['BEGIN:VCARD','VERSION:3.0',`FN:${v.name}`,v.org&&`ORG:${v.org}`,v.phone&&`TEL:${v.phone}`,v.email&&`EMAIL:${v.email}`,v.url&&`URL:${normalizeUrl(v.url)}`,'END:VCARD'].filter(Boolean).join('\n') },
  location: { label: 'Ubicación', fields: [{ id: 'lat', label: 'Latitud', required: true, placeholder: '41.686' }, { id: 'lng', label: 'Longitud', required: true, placeholder: '2.287' }, { id: 'label', label: 'Etiqueta' }], build: v => `geo:${v.lat.trim()},${v.lng.trim()}?q=${encodeURIComponent(`${v.lat.trim()},${v.lng.trim()} ${v.label || ''}`.trim())}` },
  event: { label: 'Evento calendario', fields: [{ id: 'title', label: 'Título', required: true }, { id: 'start', label: 'Inicio', type: 'datetime-local', required: true }, { id: 'end', label: 'Fin', type: 'datetime-local', required: true }, { id: 'location', label: 'Lugar' }, { id: 'description', label: 'Descripción', type: 'textarea' }], build: v => ['BEGIN:VEVENT',`SUMMARY:${v.title}`,`DTSTART:${icsDate(v.start)}`,`DTEND:${icsDate(v.end)}`,v.location&&`LOCATION:${v.location}`,v.description&&`DESCRIPTION:${v.description}`,'END:VEVENT'].filter(Boolean).join('\n') }
};

const state = { currentText: '', currentType: 'text', lastQr: null };

window.addEventListener('DOMContentLoaded', init);

function init() {
  restoreTheme();
  $('qrType').innerHTML = Object.entries(types).map(([key, t]) => `<option value="${key}">${t.label}</option>`).join('');
  bindEvents();
  renderFields();
  renderHistory();
  updateQr();
  registerServiceWorker();
}

function bindEvents() {
  $('qrType').addEventListener('change', () => { state.currentType = $('qrType').value; renderFields(); updateQr(); });
  ['qrSize','qrMargin','qrColor','bgColor'].forEach(id => $(id).addEventListener('input', updateQr));
  $('downloadPng').addEventListener('click', downloadPng);
  $('downloadSvg').addEventListener('click', downloadSvg);
  $('copyPng').addEventListener('click', copyPng);
  $('clearHistory').addEventListener('click', clearHistory);
  $('themeToggle').addEventListener('click', toggleTheme);
}

function renderFields(values = {}) {
  const schema = types[state.currentType];
  $('dynamicFields').innerHTML = schema.fields.map(f => fieldTemplate(f, values[f.id])).join('');
  $('dynamicFields').querySelectorAll('input,textarea,select').forEach(el => el.addEventListener('input', debounce(updateQr, 120)));
}

function fieldTemplate(f, value = '') {
  if (f.type === 'select') return `<label class="field"><span>${f.label}</span><select id="field-${f.id}">${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}</select></label>`;
  if (f.type === 'textarea') return `<label class="field"><span>${f.label}</span><textarea id="field-${f.id}" ${f.required ? 'required' : ''} placeholder="${f.placeholder || ''}">${value || ''}</textarea></label>`;
  if (f.type === 'checkbox') return `<label class="field"><span>${f.label}</span><input id="field-${f.id}" type="checkbox" ${value ? 'checked' : ''}></label>`;
  return `<label class="field"><span>${f.label}</span><input id="field-${f.id}" type="${f.type || 'text'}" value="${value || ''}" ${f.required ? 'required' : ''} placeholder="${f.placeholder || ''}"></label>`;
}

function collectValues() {
  const values = {};
  const missing = [];
  for (const f of types[state.currentType].fields) {
    const el = $(`field-${f.id}`);
    values[f.id] = f.type === 'checkbox' ? el.checked : el.value;
    if (f.required && !String(values[f.id]).trim()) missing.push(f.label);
  }
  if (missing.length) throw new Error(`Faltan datos obligatorios: ${missing.join(', ')}.`);
  return values;
}

function updateQr() {
  try {
    const values = collectValues();
    const text = types[state.currentType].build(values);
    if (!text) throw new Error('Introduce contenido para generar el QR.');
    state.currentText = text;
    state.lastQr = QRLite.draw($('qrCanvas'), text, getDesignOptions());
    $('qrMeta').textContent = `V${state.lastQr.version} · ${state.lastQr.bytes} bytes`;
    setError('');
    saveHistory({ type: state.currentType, values, text, createdAt: new Date().toISOString() });
  } catch (err) {
    setError(err.message);
    $('statusText').textContent = '';
  }
}

function getDesignOptions() {
  return { size: clamp(+$('qrSize').value || 420, 160, 1200), margin: clamp(+$('qrMargin').value || 0, 0, 10), foreground: $('qrColor').value, background: $('bgColor').value };
}

function setError(message) {
  $('errorBox').hidden = !message;
  $('errorBox').textContent = message;
}

function downloadPng() {
  if (!state.currentText) return setError('No hay un QR válido para descargar.');
  const a = document.createElement('a');
  a.download = `qr-studio-${Date.now()}.png`;
  a.href = $('qrCanvas').toDataURL('image/png');
  a.click();
  notify('PNG descargado.');
}

function downloadSvg() {
  if (!state.currentText) return setError('No hay un QR válido para descargar.');
  const blob = new Blob([QRLite.svg(state.currentText, getDesignOptions())], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.download = `qr-studio-${Date.now()}.svg`;
  a.href = URL.createObjectURL(blob);
  a.click();
  URL.revokeObjectURL(a.href);
  notify('SVG descargado.');
}

async function copyPng() {
  if (!navigator.clipboard || !window.ClipboardItem) return notify('Tu navegador no permite copiar imágenes desde archivo local. Descarga el PNG como alternativa.');
  $('qrCanvas').toBlob(async blob => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); notify('Imagen copiada al portapapeles.'); }
    catch { notify('No se pudo copiar. Es posible que el navegador exija HTTPS o PWA instalada.'); }
  });
}

function saveHistory(item) {
  const list = getHistory().filter(h => h.text !== item.text);
  list.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 20)));
  renderHistory();
}

function getHistory() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function clearHistory() { localStorage.removeItem(STORAGE_KEY); renderHistory(); notify('Historial borrado.'); }

function renderHistory() {
  const list = getHistory();
  $('historyList').innerHTML = list.length ? list.map((h, i) => `<button class="history-item" data-index="${i}" type="button"><strong>${types[h.type]?.label || h.type}</strong><small>${escapeHtml(h.text).slice(0, 140)}</small></button>`).join('') : '<div class="history-empty">Todavía no hay historial. Se guarda solo en este navegador.</div>';
  $('historyList').querySelectorAll('.history-item').forEach(btn => btn.addEventListener('click', () => loadHistory(+btn.dataset.index)));
}

function loadHistory(index) {
  const item = getHistory()[index];
  if (!item) return;
  state.currentType = item.type;
  $('qrType').value = item.type;
  renderFields(item.values || {});
  for (const [key, val] of Object.entries(item.values || {})) {
    const el = $(`field-${key}`);
    if (el) el.type === 'checkbox' ? el.checked = !!val : el.value = val;
  }
  updateQr();
}

function toggleTheme() { const dark = !document.body.classList.contains('dark'); document.body.classList.toggle('dark', dark); localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); $('themeToggle').textContent = dark ? '☀️' : '🌙'; }
function restoreTheme() { const dark = localStorage.getItem(THEME_KEY) === 'dark' || (!localStorage.getItem(THEME_KEY) && matchMedia('(prefers-color-scheme: dark)').matches); document.body.classList.toggle('dark', dark); $('themeToggle').textContent = dark ? '☀️' : '🌙'; }
function notify(text) { $('statusText').textContent = text; setTimeout(() => { if ($('statusText').textContent === text) $('statusText').textContent = ''; }, 3200); }
function normalizeUrl(url) { const v = url.trim().replace(/\s+/g, ''); if (!v) return ''; return /^https?:\/\//i.test(v) ? v : `https://${v}`; }
function escapeWifi(v='') { return String(v).replace(/[\\;,":]/g, '\\$&'); }
function digits(v='') { return String(v).replace(/[^\d]/g, ''); }
function icsDate(v) { return v ? v.replace(/[-:]/g, '').replace('T', 'T').slice(0, 15) : ''; }
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function registerServiceWorker() { if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {}); }
