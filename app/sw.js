// عامل الخدمة — التطبيق يعمل دون إنترنت (الجلسة ٦).
//
// لماذا هذا مهمّ هنا بالذات: الصوت كله ملفات مخزونة أصلاً (قاعدة المشروع الثابتة)،
// فلا ينقص التطبيقَ للعمل دون شبكة إلا خزنُ الهيكل والملفات. بعد أول فتح يعمل
// «المُعلِّم» كاملاً في الطائرة وفي السيارة وفي بيت بلا إنترنت — وهو حال أكثر
// من يحتاجه.
//
// استراتيجيتان لا ثالثة:
//   • الهيكل (HTML/CSS/JS/الفهارس): اعرض المخزون فوراً وحدِّثه في الخلفية
//     (stale-while-revalidate) — فتحٌ فوريّ، والتحديث يظهر في الفتحة التالية.
//   • الصوت (mp3): من المخزون دائماً — اسم كل ملف sha1 نصّه، فمحتواه لا يتغيّر
//     تحت اسمه أبداً، وأيّ تسجيل بشري بديل يأتي باسم جديد أو بترقية النسخة أدناه.
//
// عند تغيير أي ملف من ملفات الهيكل: ارفع VERSION فيُمحى المخزون القديم كله.
// ويحرس اختبار `tools/test_pwa.mjs` أن قائمة SHELL لا تنسى ملفاً موجوداً في app/.

const VERSION = 'v4';   // v4: سلّم الجمل (الحزمة ٨) — ملفّا `sentences.js` و`ladder.js`
const SHELL_CACHE = `muallim-shell-${VERSION}`;
const AUDIO_CACHE = `muallim-audio-${VERSION}`;
const KEEP = [SHELL_CACHE, AUDIO_CACHE];

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'data/lexicon.json',
  'fonts/NotoNaskhArabic-arabic.woff2',
  'fonts/NotoNaskhArabic-latin.woff2',
  'fonts/BalooBhaijaan2-arabic.woff2',
  'fonts/BalooBhaijaan2-latin.woff2',
  'fonts/KFGQPCUthmanicHafs.woff2',
  'js/audio.js',
  'js/curriculum.js',
  'js/garden.js',
  'js/ladder.js',
  'js/lesson.js',
  'js/lexicon.js',
  'js/main.js',
  'js/parent.js',
  'js/progress.js',
  'js/quran.js',
  'js/review.js',
  'js/screens.js',
  'js/sentences.js',
  'js/skill.js',
  'js/story.js',
  'js/ui.js',
  'js/words.js',
  'audio/manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

const AUDIO_RE = /\/audio\/[0-9a-f]{12}\.mp3$/;

/** خزن الأصوات كلها من فهرسها — بعدها لا يحتاج التطبيق شبكةً البتّة. */
async function precacheAudio() {
  const cache = await caches.open(AUDIO_CACHE);
  const manifest = await fetch(new URL('audio/manifest.json', self.registration.scope))
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  const urls = Object.keys(manifest).map((key) => new URL(`audio/${key}.mp3`, self.registration.scope).href);
  // واحداً واحداً: ملفٌ ناقص لا يُسقِط الخزن كله (بخلاف cache.addAll)
  await Promise.all(urls.map((url) => cache.add(url).catch(() => {})));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map((path) =>
      cache.add(new URL(path, self.registration.scope)).catch(() => {})));
    await precacheAudio();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith('muallim-') && !KEEP.includes(n))
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function cacheFirst(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request).catch(() => null);
  if (response && response.ok) cache.put(request, response.clone());
  return response || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;      // لا مصدر خارجياً في هذا التطبيق أصلاً

  if (AUDIO_RE.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // التنقّل دائماً إلى index.html: التطبيق صفحة واحدة بمسارات hash
  if (request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(new Request(new URL('index.html', self.registration.scope))));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
