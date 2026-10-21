'use strict';

const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean)[0] || '');
const $ = selector => document.querySelector(selector);
const pad = number => String(number).padStart(2, '0');
const formatDate = date => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

let config;
let configSnapshot = '';
let rows = [];
let pages = [];
let currentPage = 0;
let pageTimer;
let refreshTimer;
let resizeTimer;
let animating = false;
let loadError = '';

function parseDate(value) {
  const text = String(value ?? '').trim();
  let match = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (match) return new Date(+match[3], +match[2] - 1, +match[1]);
  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return match ? new Date(+match[1], +match[2] - 1, +match[3]) : null;
}

function sameDay(first, second) {
  return first && second && first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

function normalizeTime(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  return match ? `${pad(+match[1])}:${match[2]}` : text;
}

function parseCsv(text) {
  const output = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); output.push(row); row = []; field = '';
    } else field += char;
  }
  if (field !== '' || row.length) { row.push(field); output.push(row); }
  return output;
}

function sheetCsvUrl() {
  const url = config.sheetUrl.trim();
  if (!url) return '';
  const match = url.match(/\/spreadsheets\/d\/(?:e\/)?([^/?#]+)/);
  if (match && !/\/pub\?|output=csv/.test(url)) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(config.sheetName || '')}`;
  }
  return url;
}

function setStatus(color, title) {
  $('#statusDot').style.background = color;
  $('#statusDot').title = title;
}

async function loadConfig() {
  const response = await fetch(`/api/screens/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Không tìm thấy cấu hình màn hình');
  const next = await response.json();
  const snapshot = JSON.stringify(next);
  const changed = snapshot !== configSnapshot;
  config = next;
  configSnapshot = snapshot;
  document.title = `${config.name} | THACO AUTO`;
  return changed;
}

async function loadData() {
  const url = sheetCsvUrl();
  if (!url) {
    rows = [];
    loadError = config.loadErrorMessage || 'Chưa cấu hình Google Sheet';
    setStatus('#c62828', loadError);
    return;
  }
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const table = parseCsv(await response.text()).filter(row => row.some(cell => cell.trim()));
    if (!table.length) throw new Error('Sheet rỗng');
    const headings = table[0].map(normalize);
    const findIndex = (keys, fallback) => {
      const index = headings.findIndex(heading => keys.some(key => heading.includes(key)));
      return index >= 0 ? index : fallback;
    };
    const indexes = {
      ngay: findIndex(['ngay'], 0), stt: findIndex(['stt'], 1), kh: findIndex(['khach'], 2),
      bs: findIndex(['bien'], 3), xe: findIndex(['mau'], 4), gio: findIndex(['thoi gian', 'gio'], 5),
      nd: findIndex(['noi dung', 'cong viec'], 6), tv: findIndex(['tu van', 'dich vu'], 7)
    };
    rows = table.slice(1).map(row => {
      const get = key => (row[indexes[key]] || '').trim();
      return { ngay: get('ngay'), stt: get('stt'), kh: get('kh'), bs: get('bs'), xe: get('xe'), gio: normalizeTime(get('gio')), nd: get('nd'), tv: get('tv') };
    }).filter(row => row.kh || row.bs);
    loadError = '';
    setStatus('#2e7d32', `Đồng bộ lúc ${new Date().toLocaleTimeString('vi-VN')}`);
  } catch (error) {
    loadError = `${config.loadErrorMessage}: ${error.message}`;
    setStatus('#c62828', loadError);
  }
}

function filteredRows() {
  let list = rows.slice();
  let target = null;
  if (config.dateMode === 'today') target = new Date();
  else if (config.dateMode === 'date') target = parseDate(config.date);
  if (target) list = list.filter(row => {
    const date = parseDate(row.ngay);
    return !date || sameDay(date, target);
  });
  if (config.sortTime) list.sort((a, b) => (a.gio || '99').localeCompare(b.gio || '99'));
  list.forEach((row, index) => { if (!row.stt || config.sortTime) row.stt = index + 1; });
  return { list, target };
}

function applyTheme() {
  const style = document.documentElement.style;
  style.setProperty('--head-color', config.colorHead);
  style.setProperty('--row-color-1', config.color1);
  style.setProperty('--row-color-2', config.color2);
  style.setProperty('--text-color', config.colorText);
  style.setProperty('--title-color', config.colorTitle);
  style.setProperty('--title-font-size', `${Number(config.titleFontSize) || 48}px`);
  style.setProperty('--date-font-size', `${Number(config.dateFontSize) || 31}px`);
  style.setProperty('--data-font-size', `${Number(config.dataFontSize) || 24}px`);
  const logoUrl = config.logo || '/assets/image/LOGO-THACO-AUTO-white.png';
  $('#logo').innerHTML = `<img src="${escapeHtml(logoUrl)}" alt="THACO AUTO">`;
  $('#title').textContent = config.title;
}

function calculatePageSize() {
  const bodyHeight = $('#body').clientHeight;
  const size = config.mode === 'fixed'
    ? Math.max(1, Number(config.pageSize) || 6)
    : Math.max(1, Math.floor(bodyHeight / Math.max(30, Number(config.minRowH) || 70)));
  const rowHeight = bodyHeight / size;
  const style = document.documentElement.style;
  style.setProperty('--row-height', `${rowHeight}px`);
  style.setProperty('--heading-font-size', `${Math.min(bodyHeight * .045, innerWidth * .016)}px`);
  return size;
}

function build() {
  applyTheme();
  const pageSize = calculatePageSize();
  const { list, target } = filteredRows();
  $('#dateTitle').textContent = `${config.dateLabel} ${formatDate(target || new Date())}`;
  pages = [];
  for (let index = 0; index < list.length; index += pageSize) pages.push(list.slice(index, index + pageSize));
  if (currentPage >= pages.length) currentPage = 0;
  const message = $('#message');
  message.style.display = list.length ? 'none' : 'flex';
  message.textContent = list.length ? '' : (loadError || config.emptyMessage);
  clearTimeout(pageTimer);
  showPage(currentPage, false);
}

function pageHtml(page) {
  return page.map(row => `<div class="data-row"><div>${escapeHtml(row.stt)}</div><div>${escapeHtml(row.kh)}</div><div>${escapeHtml(row.bs)}</div><div>${escapeHtml(row.xe)}</div><div>${escapeHtml(row.gio)}</div><div>${escapeHtml(row.nd)}</div><div>${escapeHtml(row.tv)}</div></div>`).join('');
}

async function showPage(index, animate = true) {
  if (animating) return;
  animating = true;
  const element = $('#page');
  try {
    if (animate && config.anim !== 'none') {
      const frames = config.anim === 'slide' ? [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-30%)', opacity: 0 }] : [{ opacity: 1 }, { opacity: 0 }];
      await element.animate(frames, { duration: 450, fill: 'forwards' }).finished;
    }
    element.innerHTML = pages[index] ? pageHtml(pages[index]) : '';
    if (animate && config.anim !== 'none') {
      const frames = config.anim === 'slide' ? [{ transform: 'translateY(30%)', opacity: 0 }, { transform: 'none', opacity: 1 }] : [{ opacity: 0 }, { opacity: 1 }];
      await element.animate(frames, { duration: 450, fill: 'both' }).finished;
    }
  } finally {
    element.getAnimations().forEach(animation => animation.cancel());
    $('#pageNumber').textContent = pages.length > 1 ? `Trang ${index + 1}/${pages.length}` : '';
    animating = false;
    clearTimeout(pageTimer);
    if (pages.length > 1) pageTimer = setTimeout(() => {
      currentPage = (currentPage + 1) % pages.length;
      showPage(currentPage);
    }, Math.max(2, Number(config.interval) || 10) * 1000);
  }
}

async function refreshData() {
  await loadData();
  build();
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshData, Math.max(10, Number(config.refresh) || 60) * 1000);
}

async function start() {
  try {
    await loadConfig();
    await refreshData();
    setInterval(async () => {
      try {
        const changed = await loadConfig();
        if (changed) await refreshData();
      } catch (error) {
        setStatus('#c62828', error.message);
      }
    }, 10000);
  } catch (error) {
    $('#message').style.display = 'flex';
    $('#message').textContent = error.message;
    setStatus('#c62828', error.message);
  }
}

addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(build, 200);
});

start();
