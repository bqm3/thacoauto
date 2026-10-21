'use strict';

const DEFAULTS = {
  slug: '', name: '', sheetUrl: '', sheetName: 'LichHen', mode: 'auto', pageSize: 6,
  minRowH: 70, interval: 10, refresh: 60, anim: 'slide', dateMode: 'today', date: '',
  sortTime: true, title: 'KHÁCH HÀNG ĐẶT LỊCH HẸN', dateLabel: 'NGÀY:', logo: '', fontScale: 1,
  colorHead: '#4472c4', color1: '#cfd5ea', color2: '#e9ebf5', colorText: '#00529c',
  colorTitle: '#ff0000', emptyMessage: 'Hôm nay chưa có lịch hẹn',
  loadErrorMessage: 'Không thể tải dữ liệu từ Google Sheet'
};

const fields = Object.keys(DEFAULTS);
const numberFields = new Set(['pageSize', 'minRowH', 'interval', 'refresh', 'fontScale']);
const loginView = document.querySelector('#loginView');
const dashboardView = document.querySelector('#dashboardView');
const screenList = document.querySelector('#screenList');
const emptyState = document.querySelector('#emptyState');
const form = document.querySelector('#screenForm');
const modal = new bootstrap.Modal('#screenModal');
const toastElement = document.querySelector('#appToast');
const toast = new bootstrap.Toast(toastElement, { delay: 3000 });
let screens = [];

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Có lỗi xảy ra');
    error.status = response.status;
    throw error;
  }
  return data;
}

function notify(message, type = 'success') {
  document.querySelector('#toastBody').textContent = message;
  toastElement.className = `toast border-0 text-bg-${type}`;
  toast.show();
}

function setView(loggedIn) {
  loginView.classList.toggle('d-none', loggedIn);
  dashboardView.classList.toggle('d-none', !loggedIn);
}

function render() {
  emptyState.classList.toggle('d-none', screens.length > 0);
  screenList.innerHTML = screens.map(screen => {
    const displayUrl = `${location.origin}/${screen.slug}`;
    return `<div class="col-md-6 col-xl-4">
      <article class="card screen-card shadow-sm">
        <div class="card-body p-4">
          <div class="d-flex justify-content-between align-items-start gap-2 mb-3">
            <h2 class="h5 mb-0">${escapeHtml(screen.name)}</h2>
            <span class="badge text-bg-light">${escapeHtml(screen.sheetName)}</span>
          </div>
          <a class="screen-link fw-semibold text-decoration-none d-block mb-2" href="/${encodeURIComponent(screen.slug)}" target="_blank">${escapeHtml(displayUrl)} ↗</a>
          <div class="sheet-link small text-secondary mb-4" title="${escapeHtml(screen.sheetUrl)}">${escapeHtml(screen.sheetUrl || 'Chưa nhập Google Sheet')}</div>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-primary" data-action="edit" data-slug="${escapeHtml(screen.slug)}">Chỉnh sửa</button>
            <button class="btn btn-sm btn-outline-secondary" data-action="copy" data-slug="${escapeHtml(screen.slug)}">Sao chép link</button>
            <button class="btn btn-sm btn-outline-danger ms-auto" data-action="delete" data-slug="${escapeHtml(screen.slug)}">Xóa</button>
          </div>
        </div>
      </article>
    </div>`;
  }).join('');
}

async function loadScreens() {
  try {
    screens = await api('/api/admin/screens');
    setView(true);
    render();
  } catch (error) {
    if (error.status === 401) return setView(false);
    notify(error.message, 'danger');
  }
}

function openForm(screen = DEFAULTS) {
  const values = { ...DEFAULTS, ...screen };
  fields.forEach(key => {
    const input = document.querySelector(`#${key}`);
    if (!input) return;
    if (input.type === 'checkbox') input.checked = Boolean(values[key]);
    else input.value = values[key] ?? '';
  });
  document.querySelector('#originalSlug').value = screen.slug || '';
  document.querySelector('#modalTitle').textContent = screen.slug ? 'Chỉnh sửa màn hình' : 'Thêm màn hình';
  modal.show();
}

function formValue() {
  return Object.fromEntries(fields.map(key => {
    const input = document.querySelector(`#${key}`);
    if (input.type === 'checkbox') return [key, input.checked];
    if (numberFields.has(key)) return [key, Number(input.value)];
    return [key, input.value.trim()];
  }));
}

document.querySelector('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: document.querySelector('#password').value }) });
    document.querySelector('#password').value = '';
    await loadScreens();
  } catch (error) {
    notify(error.message, 'danger');
  }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  setView(false);
});

document.querySelector('#addButton').addEventListener('click', () => openForm());
emptyState.addEventListener('click', event => {
  if (event.target.closest('[data-action="add"]')) openForm();
});

screenList.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const screen = screens.find(item => item.slug === button.dataset.slug);
  if (!screen) return;
  if (button.dataset.action === 'edit') return openForm(screen);
  if (button.dataset.action === 'copy') {
    await navigator.clipboard.writeText(`${location.origin}/${screen.slug}`);
    return notify('Đã sao chép đường dẫn màn hình');
  }
  if (button.dataset.action === 'delete') {
    if (!confirm(`Xóa màn hình “${screen.name}”? Thao tác này sẽ cập nhật config.json.`)) return;
    try {
      await api(`/api/admin/screens/${encodeURIComponent(screen.slug)}`, { method: 'DELETE' });
      await loadScreens();
      notify('Đã xóa màn hình');
    } catch (error) {
      notify(error.message, 'danger');
    }
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const originalSlug = document.querySelector('#originalSlug').value;
  const value = formValue();
  const saveButton = document.querySelector('#saveButton');
  saveButton.disabled = true;
  try {
    const url = originalSlug ? `/api/admin/screens/${encodeURIComponent(originalSlug)}` : '/api/admin/screens';
    await api(url, { method: originalSlug ? 'PUT' : 'POST', body: JSON.stringify(value) });
    modal.hide();
    await loadScreens();
    notify('Đã lưu và áp dụng cấu hình');
  } catch (error) {
    notify(error.message, 'danger');
  } finally {
    saveButton.disabled = false;
  }
});

loadScreens();
