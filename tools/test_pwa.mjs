// اختبار العمل دون إنترنت (PWA — الجلسة ٦):
//   node tools/test_pwa.mjs
// المحروس هنا ثلاثة:
//   ١) قائمة SHELL في app/sw.js لا تنسى ملفاً موجوداً في app/ ولا تعِد بملف غير موجود
//      — نسيانُ وحدة جافاسكربت واحدة يعني تطبيقاً معطوباً دون إنترنت، ولا يظهر إلا هناك.
//   ٢) بيان التطبيق (manifest) صالح: أيقوناته موجودة بمقاساتها، ولغته عربية.
//   ٣) الأصوات كلها مخزونة من فهرسها (لا قائمة يدوية تتخلّف عن المنهج).

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';

const APP = new URL('../app/', import.meta.url);
const read = (p) => readFileSync(new URL(p, APP), 'utf8');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };

const sw = read('sw.js');
const manifest = JSON.parse(read('manifest.webmanifest'));
const audioManifest = JSON.parse(read('audio/manifest.json'));

// ————— ١. قائمة الهيكل تطابق ما في app/ فعلاً —————

const shell = [...sw.matchAll(/^\s*'([^']+)',$/gm)].map((m) => m[1])
  .filter((p) => p !== './' && !p.includes('${'));

const onDisk = [];
const walk = (dir, prefix = '') => {
  for (const name of readdirSync(new URL(dir, APP))) {
    if (name.startsWith('.')) continue;
    const path = `${prefix}${name}`;
    if (statSync(new URL(path, APP)).isDirectory()) walk(`${path}/`, `${path}/`);
    else onDisk.push(path);
  }
};
walk('./');

// ملفات الهيكل: كل ما في app/ عدا الأصوات (تُخزَن من فهرسها) وعامل الخدمة نفسه
const wanted = onDisk.filter((p) => !p.startsWith('audio/') || p === 'audio/manifest.json')
  .filter((p) => p !== 'sw.js');

const forgotten = wanted.filter((p) => !shell.includes(p));
ok(forgotten.length === 0,
  `قائمة SHELL تشمل كل ملفات التطبيق (${wanted.length} ملفاً)${forgotten.length ? ' — نُسي: ' + forgotten.join('، ') : ''}`);

const phantom = shell.filter((p) => !existsSync(new URL(p, APP)));
ok(phantom.length === 0,
  `ولا تعِد بملف غير موجود${phantom.length ? ' — ' + phantom.join('، ') : ''}`);
ok(sw.includes("'./'") && /index\.html/.test(sw), 'وتشمل جذر التطبيق وصفحته');

// كل وحدة جافاسكربت مستوردة فعلاً من شجرة main.js (لا ملف ميت في القائمة)
const modules = onDisk.filter((p) => p.startsWith('js/'));
const reachable = new Set(['js/main.js']);
for (let changed = true; changed;) {
  changed = false;
  for (const mod of [...reachable]) {
    for (const m of read(mod).matchAll(/from '\.\/([\w.]+\.js)'/g)) {
      const path = `js/${m[1]}`;
      if (!reachable.has(path)) { reachable.add(path); changed = true; }
    }
  }
}
const dead = modules.filter((p) => !reachable.has(p));
ok(dead.length === 0, `كل وحدات js مستوردة من شجرة main.js${dead.length ? ' — ميتة: ' + dead.join('، ') : ''}`);

// ————— ٢. الاستراتيجيتان: الأصوات من المخزون، والهيكل يُحدَّث في الخلفية —————

ok(/AUDIO_RE\s*=\s*\/.*audio.*mp3/.test(sw), 'الأصوات لها مسار خزنٍ خاص (اسمها sha1 فلا يتغيّر محتواها)');
ok(sw.includes('cacheFirst') && sw.includes('staleWhileRevalidate'),
  'واستراتيجيتان: المخزون أولاً للصوت، والتحديث في الخلفية للهيكل');
ok(sw.includes('precacheAudio') && sw.includes('audio/manifest.json'),
  'وخزن الأصوات مشتقّ من الفهرس لا من قائمة يدوية '
  + `(${Object.keys(audioManifest).length} ملفاً اليوم)`);
ok(/request\.method !== 'GET'/.test(sw), 'ولا يعترض إلا طلبات GET');
ok(sw.includes('self.location.origin'), 'ولا يمسّ أي مصدر خارجي');
ok(/caches\.delete/.test(sw) && /VERSION/.test(sw),
  'ورفع النسخة يمحو المخزون القديم (لا يعلَق طفل على نسخة قديمة)');

// ————— ٣. بيان التطبيق —————

ok(manifest.name && manifest.short_name, `اسم التطبيق: ${manifest.short_name}`);
ok(manifest.lang === 'ar' && manifest.dir === 'rtl', 'لغته عربية واتجاهه من اليمين');
ok(manifest.display === 'standalone', 'ويُفتح كتطبيق مستقلّ (لا شريط متصفّح يشتّت الطفل)');
ok(manifest.start_url === './' && manifest.scope === './',
  'ومساره نسبيّ (يعمل من أي مجلد على أي خادم)');
ok(manifest.icons.length >= 3, `وله ${manifest.icons.length} أيقونات`);
ok(manifest.icons.some((i) => i.purpose === 'maskable'),
  'منها مقنَّعة (maskable) لأيقونة أندرويد المستديرة');

const png = (path) => {
  const data = readFileSync(new URL(path, APP));
  if (data.length < 24 || data.readUInt32BE(0) !== 0x89504e47) return null;
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
};
for (const icon of manifest.icons) {
  const [w] = png(icon.src) || [];
  ok(String(w) === icon.sizes.split('x')[0], `${icon.src}: ملف PNG بمقاس ${icon.sizes}`);
}
ok(!!png('icons/apple-touch-icon.png'), 'وأيقونة آيفون/آيباد موجودة');

// ————— ٤. الوصل في الصفحة والتسجيل في الشيفرة —————

const html = read('index.html');
ok(/rel="manifest"/.test(html), 'الصفحة توصل البيان (rel="manifest")');
ok(/apple-touch-icon/.test(html), 'وأيقونة آبل موصولة');
ok(/theme-color/.test(html) && html.includes(manifest.theme_color),
  `ولون الواجهة موحَّد بين الصفحة والبيان (${manifest.theme_color})`);

const main = read('js/main.js');
ok(main.includes('serviceWorker') && main.includes('sw.js'), 'وmain.js يسجّل عامل الخدمة');
ok(main.includes("location.protocol.startsWith('http')"),
  'ولا يحاول التسجيل من file:// (يرفضه المتصفّح فيلوّث السجلّ)');
ok(/\.catch\(/.test(main.slice(main.indexOf('registerServiceWorker'))),
  'ورفضُ التسجيل لا يُسقِط التطبيق');

console.log(fails ? `\n${fails} فشل` : '\nكل اختبارات العمل دون إنترنت ناجحة');
process.exit(fails ? 1 : 0);
