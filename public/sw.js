// 离线缓存：首次访问后缓存静态资源，之后可离线游玩（stale-while-revalidate）
const BUILD = '__PWA_BUILD__';
const PINBALL_VERSION = '__PINBALL_VERSION__';
const CACHE = 'tower-odyssey-' + BUILD;
const ROOT = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const CORE = [
    ROOT + '/', ROOT + '/index.html', ROOT + '/manifest.webmanifest', ROOT + '/pinball.webmanifest', ROOT + '/offline-pinball.html', ROOT + '/pwa/icon.svg',
    ROOT + '/vendor/spacecadet/index.html?v=' + PINBALL_VERSION,
    ROOT + '/vendor/spacecadet/SpaceCadetPinball.js?v=' + PINBALL_VERSION,
    ROOT + '/vendor/spacecadet/SpaceCadetPinball.wasm?v=' + PINBALL_VERSION,
    ROOT + '/vendor/spacecadet/SpaceCadetPinball.data?v=' + PINBALL_VERSION,
];
self.addEventListener('install', function (e) {
    e.waitUntil(caches.open(CACHE).then(function (cache) {
        return Promise.all(CORE.map(function (resource) {
            return fetch(resource, { cache: 'no-store' }).then(function (response) {
                if (response.ok) return cache.put(resource, response);
                return null;
            }).catch(function () { return null; });
        }));
    }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
    e.waitUntil(caches.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) {
            return k.indexOf('tower-odyssey-') === 0 && k !== CACHE ? caches.delete(k) : undefined;
        }));
    }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);
    if (url.origin !== location.origin) return;            // 不缓存跨域（API/CDN）
    if (url.pathname.indexOf(ROOT + '/api/') === 0 || url.pathname === ROOT + '/sw.js' || url.pathname.indexOf(ROOT + '/ws/') === 0) return;
    // 导航请求（HTML）：network-first，失败回退缓存首页
    if (req.mode === 'navigate') {
        e.respondWith(fetch(req).then(function (r) {
            try { caches.open(CACHE).then(function (c) { c.put(ROOT + '/', r.clone()); }); } catch (_) {}
            return r;
        }).catch(function () { return caches.match(ROOT + '/').then(function (hit) { return hit || caches.match(ROOT + '/index.html'); }); }));
        return;
    }
    // 静态资源：cache-first，命中即返并后台更新
    e.respondWith(caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (r) {
            if (r && (r.status === 200 || r.status === 304)) { try { caches.open(CACHE).then(function (c) { c.put(req, r.clone()); }); } catch (_) {} }
            return r;
        }).catch(function () { return hit; });
        return hit || net;
    }));
});
