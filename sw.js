/* Explicit, verified offline downloads. Installing this worker downloads no assets. */
'use strict';

const SCOPE = new URL(self.registration.scope);
const PREFIX = `adventure-offline:${encodeURIComponent(SCOPE.href)}:`;
const META = `${PREFIX}metadata`;
const INTERNAL = new URL('__offline_metadata__/', SCOPE).href;
const VERSION = /^[a-zA-Z0-9._-]{1,128}$/;
const pins = new Map();
const inFlight = new Map();
let job = null;
let lock = Promise.resolve();

function serialized(action) {
  const result = lock.then(action, action);
  lock = result.catch(() => {});
  return result;
}
function cacheName(version) { return `${PREFIX}assets:${version}`; }
function metaURL(key) { return INTERNAL + key; }
async function readMeta(key) {
  const response = await (await caches.open(META)).match(metaURL(key));
  if (!response) return null;
  try { return await response.json(); } catch (_) { return null; }
}
async function writeMeta(key, value) {
  await (await caches.open(META)).put(metaURL(key), new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }));
}
function controlled(url) { return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname); }
function validateManifest(value) {
  if (!value || !VERSION.test(value.version || '') || value.version === 'network' || !Array.isArray(value.files) || !value.files.length) throw Error('離線清單格式錯誤。');
  const seen = new Set();
  let totalBytes = 0;
  const files = value.files.map(file => {
    if (!file || typeof file.url !== 'string' || !file.url || /^[\/\\]|^[a-z][a-z\d+.-]*:/i.test(file.url) || file.url.includes('\\')) throw Error('離線清單包含不安全的路徑。');
    const decodedPath = decodeURIComponent(file.url);
    if (decodedPath.includes('\\') || decodedPath.split('/').some(segment => segment === '..')) throw Error('離線清單包含不安全的路徑。');
    const url = new URL(file.url, SCOPE);
    if (!controlled(url) || url.search || url.hash || seen.has(url.href) || url.href.startsWith(INTERNAL)) throw Error('離線清單包含越界或重複的路徑。');
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f\d]{64}$/i.test(file.sha256 || '')) throw Error('離線清單缺少檔案驗證資料。');
    seen.add(url.href); totalBytes += file.bytes;
    if (!Number.isSafeInteger(totalBytes)) throw Error('離線清單容量無效。');
    return { url: file.url, bytes: file.bytes, sha256: file.sha256.toLowerCase() };
  });
  if (value.totalBytes !== totalBytes || !seen.has(new URL('index.html', SCOPE).href)) throw Error('離線清單容量或首頁資料不完整。');
  return { version: value.version, totalBytes, files };
}
async function manifestFor(version) {
  if (!version || !VERSION.test(version)) return null;
  try {
    const manifest = validateManifest(await readMeta(`manifest/${version}`));
    return manifest.version === version ? manifest : null;
  } catch (_) { return null; }
}
async function digest(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function validCached(response, file, version, rehash = false) {
  if (!response || response.status !== 200 || response.headers.get('X-Offline-Version') !== version || response.headers.get('X-Offline-SHA256') !== file.sha256 || response.headers.get('Content-Length') !== String(file.bytes)) return false;
  try {
    const buffer = await response.arrayBuffer();
    return buffer.byteLength === file.bytes && (!rehash || await digest(buffer) === file.sha256);
  } catch (_) { return false; }
}
async function inspect(manifest, rehash = false) {
  const cache = await caches.open(cacheName(manifest.version));
  let completed = 0;
  let completedBytes = 0;
  for (const file of manifest.files) {
    if (await validCached(await cache.match(new URL(file.url, SCOPE).href), file, manifest.version, rehash)) {
      completed++; completedBytes += file.bytes;
    }
  }
  return { completed, completedBytes, total: manifest.files.length, totalBytes: manifest.totalBytes };
}
async function activeVersion() {
  const pointer = await readMeta('active');
  if (!pointer || !VERSION.test(pointer.version || '')) return null;
  const manifest = await manifestFor(pointer.version);
  const complete = await readMeta(`complete/${pointer.version}`);
  if (!manifest || !complete || complete.version !== manifest.version || complete.files !== manifest.files.length || complete.totalBytes !== manifest.totalBytes) return null;
  return pointer.version;
}
async function getPin(id) {
  if (!id) return null;
  if (pins.has(id)) return pins.get(id);
  const saved = await readMeta(`client/${encodeURIComponent(id)}`);
  if (saved && (saved.version === 'network' || VERSION.test(saved.version || ''))) {
    pins.set(id, saved.version); return saved.version;
  }
  return null;
}
async function setPin(id, version) {
  if (!id) return;
  pins.set(id, version);
  await writeMeta(`client/${encodeURIComponent(id)}`, { version });
}
async function cleanup() {
  // Only this registration's unused generations can be deleted. Keep the
  // current resumable candidate, but remove abandoned partial downloads too.
  // Active windows keep their generation across worker restarts via metadata.
  const live = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
  const candidate = await readMeta('candidate');
  const keep = new Set([await activeVersion(), candidate?.version, job?.manifest?.version]);
  for (const client of live) keep.add(await getPin(client.id));
  for (const [version, count] of inFlight) if (count) keep.add(version);
  const metadata = await caches.open(META);
  const assetPrefix = `${PREFIX}assets:`;
  for (const name of await caches.keys()) {
    if (!name.startsWith(assetPrefix)) continue;
    const version = name.slice(assetPrefix.length);
    if (!VERSION.test(version) || keep.has(version)) continue;
    await caches.delete(name);
    await metadata.delete(metaURL(`complete/${version}`));
    await metadata.delete(metaURL(`manifest/${version}`));
  }
  for (const request of await metadata.keys()) {
    const kind = ['complete/', 'manifest/'].find(prefix => request.url.startsWith(metaURL(prefix)));
    if (!kind) continue;
    const version = request.url.slice(metaURL(kind).length);
    if (!VERSION.test(version) || keep.has(version)) continue;
    await caches.delete(cacheName(version));
    await metadata.delete(metaURL(`complete/${version}`));
    await metadata.delete(metaURL(`manifest/${version}`));
  }
  const alive = new Set(live.map(client => client.id));
  for (const request of await metadata.keys()) {
    if (!request.url.startsWith(metaURL('client/'))) continue;
    const id = decodeURIComponent(request.url.slice(metaURL('client/').length));
    if (!alive.has(id)) { pins.delete(id); await metadata.delete(request); }
  }
}
function send(port, message) { try { port?.postMessage(message); } catch (_) { /* The initiating page may have closed. */ } }
function errorMessage(error, fallback) {
  if (error?.name === 'QuotaExceededError') return '裝置儲存空間不足，釋放空間後可接續下載；已驗證的內容會保留。';
  return error?.message || fallback;
}
function ensureRunning(current) { if (current.cancelled) throw new DOMException('已取消下載。', 'AbortError'); }
async function download(port) {
  if (job) { send(port, { type: 'ERROR', message: '已有離線下載正在進行。' }); return; }
  const current = { controller: new AbortController(), cancelled: false, port, manifest: null, committed: false };
  job = current;
  try {
    const response = await fetch(new URL('offline-manifest.json', SCOPE).href, { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: current.controller.signal });
    if (!response.ok || response.redirected) throw Error('無法取得離線清單。');
    const manifest = current.manifest = validateManifest(await response.json());
    ensureRunning(current);
    const existing = await manifestFor(manifest.version);
    if (existing && JSON.stringify(existing) !== JSON.stringify(manifest)) throw Error('相同版本的離線清單內容不一致。');
    await writeMeta(`manifest/${manifest.version}`, manifest);
    await writeMeta('candidate', { version: manifest.version });
    const cache = await caches.open(cacheName(manifest.version));
    const progress = { type: 'PROGRESS', completed: 0, total: manifest.files.length, completedBytes: 0, totalBytes: manifest.totalBytes };
    send(port, { ...progress });
    for (const file of manifest.files) {
      ensureRunning(current);
      const url = new URL(file.url, SCOPE).href;
      if (!await validCached(await cache.match(url), file, manifest.version, true)) {
        const asset = await fetch(url, { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: current.controller.signal });
        if (asset.status !== 200 || asset.redirected) throw Error(`下載失敗：${file.url}`);
        const buffer = await asset.arrayBuffer();
        ensureRunning(current);
        if (buffer.byteLength !== file.bytes || await digest(buffer) !== file.sha256) throw Error(`檔案驗證失敗：${file.url}`);
        ensureRunning(current);
        const headers = new Headers(asset.headers);
        // Stored bodies are decoded bytes, never preserve wire compression headers.
        headers.delete('Content-Encoding'); headers.delete('Content-Range');
        headers.set('Content-Length', String(buffer.byteLength));
        headers.set('X-Offline-Version', manifest.version);
        headers.set('X-Offline-SHA256', file.sha256);
        headers.set('Accept-Ranges', 'bytes');
        await cache.put(url, new Response(buffer, { status: 200, headers }));
      }
      progress.completed++; progress.completedBytes += file.bytes;
      send(port, { ...progress });
    }
    ensureRunning(current);
    const checked = await inspect(manifest);
    if (checked.completed !== manifest.files.length) throw Error('離線檔案尚未完整儲存，請重試。');
    await serialized(async () => {
      ensureRunning(current);
      const previous = await activeVersion();
      const live = await self.clients.matchAll({ type: 'window', includeUncontrolled: false });
      for (const client of live) if (!await getPin(client.id)) await setPin(client.id, previous || manifest.version);
      ensureRunning(current);
      await writeMeta(`complete/${manifest.version}`, { version: manifest.version, files: manifest.files.length, totalBytes: manifest.totalBytes });
      ensureRunning(current);
      // One cache entry is the commit point. Previous assets stay intact until this succeeds.
      await writeMeta('active', { version: manifest.version });
      current.committed = true;
      await cleanup().catch(() => {}); // Cleanup failure never invalidates a successful commit.
    });
    send(port, { type: 'COMPLETE', version: manifest.version, files: manifest.files.length, totalBytes: manifest.totalBytes });
  } catch (error) {
    send(port, current.cancelled && !current.committed
      ? { type: 'CANCELLED' }
      : { type: 'ERROR', message: errorMessage(error, '離線下載未完成，請重試。') });
  } finally { if (job === current) job = null; }
}
async function status(port) {
  try {
    const active = await activeVersion();
    const candidate = await readMeta('candidate');
    const manifest = await manifestFor(active || candidate?.version);
    const progress = manifest ? await inspect(manifest) : { completed: 0, total: 0, totalBytes: 0 };
    send(port, { type: 'STATUS', ready: Boolean(active && manifest && progress.completed === progress.total), version: manifest?.version || null, completed: progress.completed, total: progress.total, totalBytes: progress.totalBytes });
    await serialized(cleanup);
  } catch (error) { send(port, { type: 'ERROR', message: errorMessage(error, '無法檢查離線內容。') }); }
}
async function rangeResponse(response, range) {
  const buffer = await response.arrayBuffer();
  const size = buffer.byteLength;
  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start; let end;
  if (match && (match[1] || match[2])) {
    if (!match[1]) { const suffix = Number(match[2]); start = Math.max(0, size - suffix); end = size - 1; if (!suffix) start = size; }
    else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    headers.set('Content-Range', `bytes */${size}`); headers.set('Content-Length', '0');
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(buffer.slice(start, end + 1), { status: 206, headers });
}
async function serve(event) {
  const request = event.request;
  const version = await serialized(async () => {
    const navigation = request.mode === 'navigate';
    const clientId = navigation ? event.resultingClientId || event.clientId : event.clientId;
    let selected = navigation ? await activeVersion() : await getPin(clientId);
    if (!selected) selected = await activeVersion() || 'network';
    await setPin(clientId, selected);
    if (selected !== 'network') inFlight.set(selected, (inFlight.get(selected) || 0) + 1);
    return selected;
  });
  try {
    if (version !== 'network') {
      const manifest = await manifestFor(version);
      if (manifest) {
        const url = new URL(request.url);
        const file = manifest.files.find(item => new URL(item.url, SCOPE).href === url.href);
        const cache = await caches.open(cacheName(version));
        let cached = file ? await cache.match(url.href) : null;
        if (cached && !await validCached(cached.clone(), file, version)) cached = null;
        if (!cached && request.mode === 'navigate') {
          const home = manifest.files.find(item => new URL(item.url, SCOPE).href === new URL('index.html', SCOPE).href);
          cached = home ? await cache.match(new URL('index.html', SCOPE).href) : null;
          if (cached && !await validCached(cached.clone(), home, version)) cached = null;
        }
        if (cached) return request.headers.has('Range') ? rangeResponse(cached, request.headers.get('Range')) : cached;
        // A pinned generation cannot silently load an updated network asset.
        if (file) return new Response('Offline asset unavailable. Please download the offline content again.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    }
    return fetch(request);
  } finally {
    if (version !== 'network') inFlight.set(version, Math.max(0, (inFlight.get(version) || 1) - 1));
  }
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  const port = event.ports?.[0];
  if (!port) return;
  // Registration-scoped client messages only; downloads never start from install/fetch.
  if (event.source?.url && !controlled(new URL(event.source.url))) { send(port, { type: 'ERROR', message: '不允許跨網站操作離線內容。' }); return; }
  if (event.data?.type === 'DOWNLOAD_OFFLINE') event.waitUntil(download(port));
  else if (event.data?.type === 'CHECK_OFFLINE') event.waitUntil(status(port));
  else if (event.data?.type === 'CANCEL_DOWNLOAD') {
    const cancelling = job;
    event.waitUntil(serialized(() => {
      // Cancellation and the atomic commit cannot claim conflicting outcomes.
      if (cancelling?.committed) {
        const manifest = cancelling.manifest;
        send(port, { type: 'COMPLETE', version: manifest.version, files: manifest.files.length, totalBytes: manifest.totalBytes });
      } else {
        if (cancelling) { cancelling.cancelled = true; cancelling.controller.abort(); }
        send(port, { type: 'CANCELLED' });
      }
    }));
  }
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !controlled(url) || url.href.startsWith(INTERNAL)) return;
  event.respondWith(serve(event));
});
