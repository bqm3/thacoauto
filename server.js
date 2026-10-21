'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const sessions = new Map();
const SESSION_AGE = 12 * 60 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml'
};

const DEFAULT_SCREEN = {
  slug: '', name: '', sheetUrl: '', sheetName: 'LichHen', mode: 'auto', pageSize: 6,
  minRowH: 70, interval: 10, refresh: 60, anim: 'slide', dateMode: 'today', date: '',
  sortTime: true, title: 'KHÁCH HÀNG ĐẶT LỊCH HẸN', dateLabel: 'NGÀY:', logo: '', fontScale: 1,
  colorHead: '#4472c4', color1: '#cfd5ea', color2: '#e9ebf5', colorText: '#00529c',
  colorTitle: '#ff0000', emptyMessage: 'Hôm nay chưa có lịch hẹn',
  loadErrorMessage: 'Không thể tải dữ liệu từ Google Sheet'
};

async function readConfig() {
  const data = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
  data.screens = Array.isArray(data.screens) ? data.screens : [];
  return data;
}

async function writeConfig(data) {
  const temp = `${CONFIG_FILE}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(temp, CONFIG_FILE);
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': MIME['.json'], 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store'
  });
  res.end(body);
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1024 * 1024) throw new Error('Dữ liệu gửi lên quá lớn');
  }
  return raw ? JSON.parse(raw) : {};
}

function getCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const pos = part.indexOf('=');
    return [part.slice(0, pos).trim(), decodeURIComponent(part.slice(pos + 1))];
  }));
}

function isAuthenticated(req) {
  const token = getCookies(req).thaco_session;
  const expires = token && sessions.get(token);
  if (!expires || expires < Date.now()) {
    if (token) sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + SESSION_AGE);
  return true;
}

function cleanScreen(input) {
  const result = { ...DEFAULT_SCREEN };
  for (const key of Object.keys(result)) if (Object.hasOwn(input, key)) result[key] = input[key];
  result.slug = String(result.slug).trim().toLowerCase();
  result.name = String(result.name).trim();
  result.sheetUrl = String(result.sheetUrl).trim();
  result.sheetName = String(result.sheetName).trim() || 'LichHen';
  result.pageSize = Math.max(1, Number(result.pageSize) || 6);
  result.minRowH = Math.max(30, Number(result.minRowH) || 70);
  result.interval = Math.max(2, Number(result.interval) || 10);
  result.refresh = Math.max(10, Number(result.refresh) || 60);
  result.fontScale = Math.max(0.5, Number(result.fontScale) || 1);
  result.sortTime = Boolean(result.sortTime);
  return result;
}

const validSlug = slug => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !['admin', 'api', 'assets'].includes(slug);

async function serveFile(res, file) {
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': file.endsWith('.html') ? 'no-store' : 'public, max-age=3600'
    });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') return sendJson(res, 404, { error: 'Không tìm thấy tài nguyên' });
    throw error;
  }
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    const { password = '' } = await readBody(req);
    const config = await readConfig();
    const expected = process.env.ADMIN_PASSWORD || config.adminPassword || '123456';
    const enteredBuffer = Buffer.from(String(password));
    const expectedBuffer = Buffer.from(String(expected));
    if (enteredBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(enteredBuffer, expectedBuffer)) {
      return sendJson(res, 401, { error: 'Mật khẩu không đúng' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_AGE);
    res.setHeader('Set-Cookie', `thaco_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_AGE / 1000}`);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    const token = getCookies(req).thaco_session;
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'thaco_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return sendJson(res, 200, { ok: true });
  }

  const publicMatch = pathname.match(/^\/api\/screens\/([a-z0-9-]+)$/);
  if (publicMatch && req.method === 'GET') {
    const config = await readConfig();
    const screen = config.screens.find(item => item.slug === publicMatch[1]);
    return screen ? sendJson(res, 200, cleanScreen(screen)) : sendJson(res, 404, { error: 'Đường dẫn màn hình không tồn tại' });
  }

  if (!isAuthenticated(req)) return sendJson(res, 401, { error: 'Bạn chưa đăng nhập' });

  if (pathname === '/api/admin/screens' && req.method === 'GET') {
    const config = await readConfig();
    return sendJson(res, 200, config.screens.map(cleanScreen));
  }

  if (pathname === '/api/admin/screens' && req.method === 'POST') {
    const screen = cleanScreen(await readBody(req));
    if (!validSlug(screen.slug)) return sendJson(res, 400, { error: 'Đường dẫn chỉ gồm chữ thường, số và dấu gạch ngang' });
    if (!screen.name) return sendJson(res, 400, { error: 'Vui lòng nhập tên màn hình' });
    const config = await readConfig();
    if (config.screens.some(item => item.slug === screen.slug)) return sendJson(res, 409, { error: 'Đường dẫn này đã tồn tại' });
    config.screens.push(screen);
    await writeConfig(config);
    return sendJson(res, 201, screen);
  }

  const adminMatch = pathname.match(/^\/api\/admin\/screens\/([a-z0-9-]+)$/);
  if (adminMatch && req.method === 'PUT') {
    const screen = cleanScreen(await readBody(req));
    if (!validSlug(screen.slug)) return sendJson(res, 400, { error: 'Đường dẫn không hợp lệ' });
    if (!screen.name) return sendJson(res, 400, { error: 'Vui lòng nhập tên màn hình' });
    const config = await readConfig();
    const index = config.screens.findIndex(item => item.slug === adminMatch[1]);
    if (index < 0) return sendJson(res, 404, { error: 'Không tìm thấy màn hình' });
    if (config.screens.some((item, i) => i !== index && item.slug === screen.slug)) return sendJson(res, 409, { error: 'Đường dẫn mới đã tồn tại' });
    config.screens[index] = screen;
    await writeConfig(config);
    return sendJson(res, 200, screen);
  }

  if (adminMatch && req.method === 'DELETE') {
    const config = await readConfig();
    const index = config.screens.findIndex(item => item.slug === adminMatch[1]);
    if (index < 0) return sendJson(res, 404, { error: 'Không tìm thấy màn hình' });
    config.screens.splice(index, 1);
    await writeConfig(config);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'API không tồn tại' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (pathname === '/') {
      res.writeHead(302, { Location: '/admin' });
      return res.end();
    }
    if (pathname === '/admin') return await serveFile(res, path.join(PUBLIC_DIR, 'admin.html'));
    if (pathname.startsWith('/assets/')) {
      const file = path.resolve(PUBLIC_DIR, pathname.slice('/assets/'.length));
      if (!file.startsWith(`${PUBLIC_DIR}${path.sep}`)) return sendJson(res, 403, { error: 'Đường dẫn không hợp lệ' });
      return await serveFile(res, file);
    }
    if (/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathname)) {
      const config = await readConfig();
      const exists = config.screens.some(item => item.slug === pathname.slice(1));
      return await serveFile(res, path.join(PUBLIC_DIR, exists ? 'display.html' : 'not-found.html'));
    }
    return await serveFile(res, path.join(PUBLIC_DIR, 'not-found.html'));
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'Lỗi máy chủ' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`THACO Appointment Board: http://localhost:${PORT}`);
  console.log(`Trang quản trị: http://localhost:${PORT}/admin`);
});
