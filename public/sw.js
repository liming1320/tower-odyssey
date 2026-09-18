// 离线缓存：首次访问后缓存静态资源，之后可离线游玩（stale-while-revalidate）
const CACHE = 'tower-odyssey-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
    e.waitUntil(caches.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) { return k !== CACHE ? caches.delete(k) : undefined; }));
    }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);
    if (url.origin !== location.origin) return;            // 不缓存跨域（API/CDN）
    // 导航请求（HTML）：network-first，失败回退缓存首页
    if (req.mode === 'navigate') {
        e.respondWith(fetch(req).then(function (r) {
            try { caches.open(CACHE).then(function (c) { c.put('/', r.clone()); }); } catch (_) {}
            return r;
        }).catch(function () { return caches.match('/'); }));
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
