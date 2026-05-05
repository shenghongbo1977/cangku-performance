const CACHE_NAME = 'warehouse-performance-v3';
const ASSETS = [
  '/manifest.json',
  '/generated-images/App_icon_for_a_warehouse_perfo_2026-04-22T14-55-48.png'
];

// 安装：只缓存静态资源，不缓存 HTML
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 激活：清理所有旧缓存
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => {
          console.log('[SW] 清除旧缓存:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截：HTML 始终走网络（保证最新版本），其他资源走缓存优先
self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith(self.location.origin)) return;

  const url = new URL(e.request.url);

  // HTML 页面：网络优先，网络失败再用缓存
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        return caches.match(e.request) || caches.match('/performance_app.html');
      })
    );
    return;
  }

  // 其他资源：缓存优先
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, clone);
        });
        return response;
      });
    })
  );
});
