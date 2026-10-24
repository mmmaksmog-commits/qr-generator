/* global qrcode */
// QR-матрицу считает библиотека qrcode-generator, рисование (цвета, форма точек, экспорт) — своё.
const $ = (s) => document.querySelector(s);
const form = $('#form');
const PRESETS = [['#18181b', '#ffffff'], ['#4c1d95', '#f5f3ff'], ['#0f766e', '#ecfdf5'], ['#be123c', '#fff1f2'], ['#1d4ed8', '#eff6ff'], ['#ffffff', '#18181b']];

let type = 'url';
let matrix = null;

if (window.qrcode) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

// ---------- Данные для кода ----------
const esc = (s) => s.replace(/([\\;,:"])/g, '\\$1'); // экранирование для Wi-Fi и vCard

function payload() {
  const f = Object.fromEntries(new FormData(form));
  if (type === 'url') {
    const u = f.url.trim();
    return u && !/^[a-z]+:/i.test(u) ? `https://${u}` : u;
  }
  if (type === 'text') return f.text;
  if (type === 'wifi') {
    if (!f.ssid?.trim()) return '';
    const enc = f.enc;
    return `WIFI:T:${enc};S:${esc(f.ssid)};${enc !== 'nopass' ? `P:${esc(f.wpass || '')};` : ''}${f.hidden ? 'H:true;' : ''};`;
  }
  if (type === 'vcard') {
    if (!(f.first || f.last || f.tel || f.email)) return '';
    return [
      'BEGIN:VCARD', 'VERSION:3.0',
      `N:${esc(f.last || '')};${esc(f.first || '')};;;`,
      `FN:${esc(`${f.first || ''} ${f.last || ''}`.trim())}`,
      f.org && `ORG:${esc(f.org)}`,
      f.tel && `TEL;TYPE=CELL:${f.tel.replace(/[^\d+]/g, '')}`,
      f.email && `EMAIL:${f.email.trim()}`,
      'END:VCARD',
    ].filter(Boolean).join('\n');
  }
  return '';
}

// ---------- Матрица ----------
function build(text) {
  if (!window.qrcode || !text) return null;
  try {
    const qr = qrcode(0, $('#ecc').value);
    qr.addData(text, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
  } catch {
    return 'too-long';
  }
}

// Три больших «глаза» по углам рисуем отдельно, чтобы они выглядели аккуратно в любом стиле
const isFinder = (r, c, n) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

function draw(ctx, size, m, opts) {
  const n = m.length;
  const margin = 4;
  const cell = size / (n + margin * 2);
  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = opts.fg;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!m[r][c] || isFinder(r, c, n)) continue;
      const x = (c + margin) * cell;
      const y = (r + margin) * cell;
      if (opts.shape === 'dots') { ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * 0.42, 0, Math.PI * 2); ctx.fill(); } else if (opts.shape === 'round') { roundRect(ctx, x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.3); } else ctx.fillRect(x, y, cell + 0.4, cell + 0.4);
    }
  }
  const radius = opts.shape === 'square' ? 0 : cell * (opts.shape === 'dots' ? 2.2 : 1.4);
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = (c + margin) * cell;
    const y = (r + margin) * cell;
    ctx.fillStyle = opts.fg;
    roundRect(ctx, x, y, cell * 7, cell * 7, radius);
    ctx.fillStyle = opts.bg;
    roundRect(ctx, x + cell, y + cell, cell * 5, cell * 5, radius * 0.7);
    ctx.fillStyle = opts.fg;
    roundRect(ctx, x + cell * 2, y + cell * 2, cell * 3, cell * 3, radius * 0.6);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect && r) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  ctx.fill();
}

function svg(m, opts) {
  const n = m.length;
  const margin = 4;
  const total = n + margin * 2;
  let body = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!m[r][c] || isFinder(r, c, n)) continue;
      const x = c + margin;
      const y = r + margin;
      body += opts.shape === 'dots' ? `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.42"/>` : opts.shape === 'round' ? `<rect x="${x + 0.06}" y="${y + 0.06}" width="0.88" height="0.88" rx="0.3"/>` : `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`;
    }
  }
  const rad = opts.shape === 'square' ? 0 : opts.shape === 'dots' ? 2.2 : 1.4;
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    const x = c + margin;
    const y = r + margin;
    body += `<rect x="${x}" y="${y}" width="7" height="7" rx="${rad}"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="${rad * 0.7}" fill="${opts.bg}"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="${rad * 0.6}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="1024" height="1024"><rect width="100%" height="100%" fill="${opts.bg}"/><g fill="${opts.fg}">${body}</g></svg>`;
}

// ---------- Контраст ----------
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

// ---------- Рендер ----------
const opts = () => ({ fg: $('#fg').value, bg: $('#bg').value, shape: $('#shape').value });

function render() {
  const text = payload();
  const m = build(text);
  const canvas = $('#qr');
  const css = Math.min(320, canvas.parentElement.clientWidth - 32);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.style.width = `${css}px`;
  canvas.style.height = `${css}px`;
  canvas.width = css * dpr;
  canvas.height = css * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const o = opts();
  $('#qrCard').style.background = o.bg;
  if (!Array.isArray(m)) {
    matrix = null;
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(0, 0, css, css);
    ctx.fillStyle = '#71717a';
    ctx.font = '600 15px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(m === 'too-long' ? 'Слишком много данных' : !window.qrcode ? 'Нет связи с библиотекой' : 'Заполните поля', css / 2, css / 2);
    $('#info').textContent = '';
    $('#dlPng').disabled = true;
    $('#dlSvg').disabled = true;
  } else {
    matrix = m;
    draw(ctx, css, m, o);
    $('#info').textContent = `${m.length}×${m.length} модулей · ${new TextEncoder().encode(text).length} байт`;
    $('#dlPng').disabled = false;
    $('#dlSvg').disabled = false;
  }
  const k = contrast(o.fg, o.bg);
  const warn = $('#warn');
  warn.hidden = k >= 3.5 && luminance(o.fg) < luminance(o.bg);
  warn.textContent = k < 3.5 ? '⚠️ Мало контраста — телефон может не распознать код' : '⚠️ Светлые точки на тёмном фоне читают не все камеры';
}

// ---------- Скачивание ----------
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#dlPng').onclick = () => {
  if (!matrix) return;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  draw(c.getContext('2d'), 1024, matrix, opts());
  c.toBlob((b) => download(b, `qr-${type}.png`), 'image/png');
};
$('#dlSvg').onclick = () => { if (matrix) download(new Blob([svg(matrix, opts())], { type: 'image/svg+xml' }), `qr-${type}.svg`); };

// ---------- События ----------
document.querySelector('.types').addEventListener('click', (e) => {
  const b = e.target.closest('[data-type]');
  if (!b) return;
  type = b.dataset.type;
  document.querySelectorAll('.type').forEach((t) => t.classList.toggle('is-active', t === b));
  document.querySelectorAll('.fields').forEach((f) => { f.hidden = f.dataset.for !== type; });
  render();
});
form.addEventListener('input', render);
form.addEventListener('submit', (e) => e.preventDefault());
['fg', 'bg', 'shape', 'ecc'].forEach((id) => $(`#${id}`).addEventListener('input', render));

$('#presets').innerHTML = PRESETS.map(([fg, bg]) => `<button data-fg="${fg}" data-bg="${bg}" style="--fg:${fg};--bg:${bg}" aria-label="Цвета ${fg} на ${bg}"></button>`).join('');
$('#presets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fg]');
  if (!b) return;
  $('#fg').value = b.dataset.fg;
  $('#bg').value = b.dataset.bg;
  render();
});
window.addEventListener('resize', render);

render();
