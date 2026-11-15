// =========================================================
// sw.js — Service Worker (التصفح بلا إنترنت + PWA)
// ---------------------------------------------------------
// الاستراتيجية:
//   1) عند التثبيت: نخزّن الصفحات والملفات الأساسية مسبقاً (Precache).
//   2) ملفات الموقع نفسه (صفحات، مقالات .md، فهرس المقالات، صور):
//      "الشبكة أولاً" ← تحصل على أحدث نسخة دائماً، وإن انقطع الإنترنت
//      (أو تأخّر أكثر من NETWORK_TIMEOUT_MS) تُعرض النسخة المخزّنة.
//      وهكذا تعمل كل مقالة سبق أن زرتها بلا اتصال.
//   3) مكتبات CDN والخطوط: "المخزّن أولاً" (إصداراتها مثبّتة فلا تتغير).
//   4) لا نتدخل أبداً في: لوحة التحكم /admin/ ، Netlify Identity، الملفات الثقيلة
//      (mp3/mp4/zip/pdf) وطلبات Range، وأي طلب غير GET.
//
// عند تعديل style.css أو script.js غيّر CACHE_VERSION ليُحدَّث التخزين عند الزوار.
// =========================================================

const CACHE_VERSION = "v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

// ---------- OneSignal ----------
// غيّرها إلى true بعد وضع معرّف OneSignal الحقيقي في الصفحات.
// (OneSignal يسمح بـ Service Worker واحد فقط، لذلك نستورد ملفه هنا بدل تسجيل ملف ثانٍ.)
const USE_ONESIGNAL = false;
if (USE_ONESIGNAL) {
  try {
    importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
  } catch (error) {
    // حجب الإعلانات أو انقطاع الشبكة لا يجب أن يكسر الـ PWA
  }
}

// ---------- الملفات المخزّنة مسبقاً (مسارات نسبية لمكان هذا الملف) ----------
const PRECACHE_URLS = [
  "./",
  "index.html",
  "post.html",
  "about.html",
  "contact.html",
  "privacy.html",
  "offline.html",
  "style.css",
  "script.js",
  "icons.svg",
  "manifest.json",
  "favicon.ico",
  "icons/logo-72.png",
  "icons/favicon-32x32.png",
  "icons/apple-touch-icon.png",
  "icons/android-chrome-192x192.png",
  "icons/android-chrome-512x512.png",
  "content/posts/index.json"
];

// مكتبات خارجية (يجب أن تطابق الروابط في post.html و index.html)
const PRECACHE_CDN = [
  "https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css",
  "https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap"
];

// الأطراف الخارجية المسموح بتخزينها وقت التشغيل
const CACHEABLE_HOSTS = [
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com"
];

// ---------- دوال مساعدة ----------

// بعض الاستضافات تعيد توجيه /page.html إلى /page؛ المتصفح يرفض تقديم استجابة
// "معاد توجيهها" لطلب تنقّل، لذلك نعيد بناءها قبل تخزينها.
async function cleanResponse(response) {
  if (!response.redirected) return response;
  const body = await response.blob();
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function putInCache(cacheName, request, response) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, await cleanResponse(response));
  } catch (error) {
    // امتلاء المساحة أو استجابة غير قابلة للتخزين: نتجاهل بهدوء
  }
}

// البحث في كل المخازن (ignoreVary لأن Google Fonts تتغير حسب المتصفح)
const matchCache = (request, options = {}) => caches.match(request, { ignoreVary: true, ...options });

// ---------- التثبيت ----------
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);

    // كل ملف يُخزَّن على حدة: فشل ملف واحد (مثل index.json قبل أول نشر) لا يُفشل التثبيت
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try {
        const response = await fetch(new Request(url, { cache: "reload" }));
        if (response.ok) await cache.put(url, await cleanResponse(response));
      } catch (error) { /* تجاهل */ }
    }));

    // مكتبات CDN بوضع no-cors (استجابات opaque قابلة للتخزين والاستخدام في script/link)
    await Promise.all(PRECACHE_CDN.map(async (url) => {
      try {
        const response = await fetch(new Request(url, { mode: "no-cors" }));
        await cache.put(url, response);
      } catch (error) { /* تجاهل */ }
    }));

    await self.skipWaiting();
  })());
});

// ---------- التفعيل: حذف المخازن القديمة ----------
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = [STATIC_CACHE, RUNTIME_CACHE];
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => /^(static|runtime)-/.test(name) && !keep.includes(name))
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

// ---------- الاستراتيجيات ----------

// الشبكة أولاً مع مهلة، ثم المخزّن، ثم صفحة offline.html للتنقّل
async function networkFirst(event) {
  const request = event.request;

  const networkPromise = fetch(request).then((response) => {
    if (response && response.ok) event.waitUntil(putInCache(RUNTIME_CACHE, request, response.clone()));
    return response;
  });
  networkPromise.catch(() => {}); // منع تحذير Promise غير معالَج إذا فشلت بعد المهلة

  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_TIMEOUT_MS));
    return await Promise.race([networkPromise, timeout]);
  } catch (error) {
    // 1) نسخة مطابقة تماماً
    let cached = await matchCache(request);
    // 2) للتنقّل فقط: نفس الصفحة بدون الاستعلام (مثل post.html?slug=آخر-مقال)
    if (!cached && request.mode === "navigate") cached = await matchCache(request, { ignoreSearch: true });
    if (cached) return cached;

    // لا توجد نسخة: إن كانت المشكلة مجرد بطء ننتظر الشبكة
    try { return await networkPromise; } catch (e) { /* غير متصل فعلاً */ }

    if (request.mode === "navigate") {
      const offlinePage = await matchCache("offline.html");
      if (offlinePage) return offlinePage;
    }
    return new Response("", { status: 503, statusText: "Offline" });
  }
}

// المخزّن أولاً (للمكتبات الخارجية المثبّتة الإصدار)
async function cacheFirst(event) {
  const request = event.request;
  const cached = await matchCache(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    event.waitUntil(putInCache(RUNTIME_CACHE, request, response.clone()));
  }
  return response;
}

// ---------- اعتراض الطلبات ----------
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // لا نتدخل في لوحة التحكم ولا في خدمات Netlify
    if (/\/admin(\/|$)/.test(url.pathname) || url.pathname.startsWith("/.netlify/")) return;
    // الملفات الثقيلة تُحمَّل مباشرة من الشبكة
    if (/\.(mp3|mp4|webm|ogg|wav|zip|pdf)$/i.test(url.pathname)) return;
    event.respondWith(networkFirst(event));
    return;
  }

  if (CACHEABLE_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(event));
  }
});
