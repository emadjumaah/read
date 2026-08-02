// اختبار المرحلة القرآنية (الجلسة ٦) بلا متصفّح:
//   node tools/test_quran.mjs
// المحروس هنا أربعة: موضع المرحلة من الرحلة وقفلها، وسلامة جولاتها،
// وأصالة نصّ المصحف (مطابقة المصدر المرجعي حرفاً بحرف — فحص مستقلّ عن البايثوني)،
// و**حرمة نطق المصحف آلياً**: لا آية ولا كلمة عثمانية في الأصوات ولا في قائمة الانتظار.

import { readFileSync } from 'node:fs';

const APP = new URL('../app/js/', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const {
  GROUPS, QURAN, quranParts, surahById, quranSpokenTexts, quranSilentTexts, bareLetters,
} = await import(new URL('curriculum.js', APP));
const { buildRasmRounds } = await import(new URL('quran.js', APP));
// «اقرأ واختر» انتقلت إلى screens.js في الحزمة ٧ (تشترك فيها المرحلة القرآنية والبساتين)
const { buildReadRounds } = await import(new URL('screens.js', APP));
const { starsForStory } = await import(new URL('story.js', APP));
const { starsForGame } = await import(new URL('words.js', APP));
const p = await import(new URL('progress.js', APP));
const { GARDENS } = await import(new URL('lexicon.js', APP));
const BUNDLES = GARDENS.reduce((s, g) => s + g.bundles.length, 0);

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ————— ١. موضع المرحلة من الرحلة وترتيب درجاتها —————

ok(QURAN.after === GROUPS.at(-1).id, `المرحلة القرآنية بعد المجموعة الأخيرة (${QURAN.after})`);

const parts = quranParts().map((x) => x.part);
ok(parts.join(' ← ') === 'letters words rasm muqattaat s1 s112 s113 s114'.split(' ').join(' ← '),
  `درجاتها بالترتيب: ${parts.join(' ← ')}`);
ok(parts.indexOf('letters') < parts.indexOf('words'),
  'درس الحرفين قبل الكلمات (كلماتها تستعملهما)');
ok(parts.indexOf('rasm') < parts.indexOf('muqattaat')
  && parts.indexOf('muqattaat') < parts.indexOf('s1'),
  'ودرس الرسم قبل كل نصّ عثماني — الحروف المقطَّعة ثم السور');
ok(quranParts().every((x) => x.title && x.face), 'ولكل عقدة عنوانها ووجهها على الخريطة');

const nodes = p.allNodes();
const ids = nodes.map((n) => n.id);
ok(ids.filter((id) => id.startsWith('quran:')).length === parts.length,
  `عقد المرحلة في الرحلة (${parts.length} عقدة)`);
const quranStart = ids.indexOf('quran:letters');
ok(ids.slice(quranStart, quranStart + parts.length).join('|') === parts.map((x) => `quran:${x}`).join('|')
  && ids.slice(0, quranStart).every((id) => !id.startsWith('quran:')),
  'وهي متتابعة بعد الرحلة كلها (من درس الحرفين إلى آخر سورة)');
ok(ids.slice(quranStart + parts.length).every((id) => id.startsWith('garden:')),
  'ولا يليها إلا بساتين الموضوعات (الحزمة ٧)');
ok(p.maxTotalStars() === nodes.length * p.MAX_STARS && nodes.length === 51 + BUNDLES,
  `سقف النجوم يشمل الخاتمة والبساتين (${nodes.length} عقدة، ${p.maxTotalStars()} نجمة)`);

const upTo = (id) => {
  p.reset();
  for (const n of nodes) {
    if (n.id === id) break;
    p.setStars(n.id, 3);
  }
};

p.reset();
ok(!p.isNodeUnlockedById('quran:letters'), 'المرحلة مقفلة في بداية الرحلة');
upTo('quran:letters');
ok(p.isNodeUnlockedById('quran:letters') && p.nextNode().id === 'quran:letters',
  'وتُفتح بإتمام كل ما قبلها (القصة الثالثة آخره)');
ok(!p.isNodeUnlockedById('quran:s1'), 'وسورة الفاتحة تنتظر دروس التهيئة قبلها');
upTo('quran:s114');
ok(p.isNodeUnlockedById('quran:s114'), 'وآخر سورة تُفتح بإتمام ما قبلها');
p.setStars('quran:s114', 3);
ok(p.nextNode()?.id === ids[quranStart + parts.length],
  `وبإتمامها يُفتح أول بستان (${p.nextNode()?.id})`);

// ————— ٢. جولات «اقرأ واختر» و«ميّز العلامة» —————

const readItems = QURAN.words.items;
let rounds = 0;
for (let seed = 1; seed <= 60; seed++) {
  const rnd = rng(seed);
  for (const items of [readItems, QURAN.letters.signs.flatMap((s) => s.words)]) {
    for (const r of buildReadRounds(items, rnd)) {
      rounds++;
      if (r.options.length !== 3) { fails++; console.log('  ✗ خيارات ≠ ٣'); }
      if (new Set(r.options.map((o) => o.read)).size !== 3) { fails++; console.log('  ✗ خيار مكرَّر'); }
      if (!r.options.includes(r.target)) { fails++; console.log('  ✗ الهدف ليس بين الخيارات'); }
      if (r.options.some((o) => !items.includes(o))) { fails++; console.log('  ✗ خيار من خارج الشاشة'); }
    }
  }
  for (const r of buildRasmRounds(QURAN.rasm.signs, rnd)) {
    if (!r.options.includes(r.target) || r.options.length !== 3) {
      fails++; console.log('  ✗ جولة رسم معطوبة');
    }
    if (r.options.filter((o) => o.sign === r.target.sign).length !== 1) {
      fails++; console.log('  ✗ علامة الهدف مكرَّرة بين الخيارات');
    }
  }
}
ok(true, `جولات سليمة في ٦٠ بذرة عشوائية (${rounds} جولة قراءة + جولات الرسم)`);
ok(buildReadRounds(readItems).length === readItems.length,
  `كل كلمة تأتي دورها مرة (${readItems.length} كلمة)`);
ok(buildReadRounds([{ read: 'أ', emoji: '' }]).length === 0
  && buildRasmRounds([QURAN.rasm.signs[0]]).length === 0,
  'ومادةٌ أقلّ من ثلاثة خيارات ⇒ لا جولات (يفشل مغلقاً)');

// ————— ٣. المفكوكية: مادة القراءة الإملائية داخل حصيلة الطفل —————

const taught = new Set(GROUPS.flatMap((g) => g.letters));
const newSigns = new Set(QURAN.letters.signs.flatMap((s) => [s.sign, ...s.shapes.join('')]));
const known = new Set([...taught, ...newSigns].filter((c) => c !== 'ـ'));
const imla = [...QURAN.letters.signs.flatMap((s) => s.words), ...QURAN.words.items].map((w) => w.read);
const outside = imla.flatMap((t) => [...bareLetters(t)].filter((c) => !known.has(c)).map((c) => `${c} في «${t}»`));
ok(outside.length === 0,
  `كلمات المرحلة الإملائية (${imla.length}) كلها بحروف مدروسة${outside.length ? ' — ' + outside.join('، ') : ''}`);
ok(QURAN.muqattaat.items.every((m) => m.parts.every((x) => taught.has(x.ch))),
  'وحروف المقطَّعة كلها مدروسة في المجموعات السبع');

// صورتان متطابقتان في شاشة واحدة تجعلان «اقرأ واختر» بلا جواب صحيح
for (const [where, items] of [
  ['درس الحرفين', QURAN.letters.signs.flatMap((s) => s.words)],
  ['كلمات القرآن', QURAN.words.items],
]) {
  const seen = items.map((w) => w.emoji);
  const dup = seen.filter((e, i) => seen.indexOf(e) !== i);
  ok(dup.length === 0 && seen.every(Boolean),
    `${where}: لكل كلمة صورتها وحدها${dup.length ? ' — مكرَّرة: ' + dup.join('،') : ''}`);
}

// ————— ٤. أصالة النصّ العثماني: مطابقة المصدر المرجعي حرفاً بحرف —————

const source = new Map();
for (const line of readFileSync(new URL('quran_source.txt', import.meta.url), 'utf8').split('\n')) {
  if (line.startsWith('#') || !line.includes('|')) continue;
  const [ref, text] = [line.slice(0, line.indexOf('|')), line.slice(line.indexOf('|') + 1)];
  source.set(ref.trim(), text);
}
ok(source.size >= 22, `المصدر المرجعي (مشروع تنزيل) مقروء: ${source.size} آية`);
ok(QURAN.basmala === source.get('1:1'), 'البسملة تطابق المصدر');

let ayat = 0;
const mismatch = [];
for (const surah of QURAN.surahs) {
  surah.ayat.forEach((ayah, i) => {
    ayat++;
    const expected = source.get(`${surah.number}:${i + 1}`);
    const actual = (i === 0 && !surah.basmalaIsAyah) ? `${QURAN.basmala} ${ayah}` : ayah;
    if (actual !== expected) mismatch.push(`${surah.number}:${i + 1}`);
  });
}
ok(mismatch.length === 0,
  `${QURAN.surahs.length} سور و${ayat} آية تطابق المصدر حرفاً بحرف${mismatch.length ? ' — ' + mismatch.join('، ') : ''}`);
ok(surahById('s1').ayat.length === 7 && surahById('s1').basmalaIsAyah,
  'والبسملة آيةٌ في الفاتحة وحدها');
ok(QURAN.surahs.slice(1).every((s) => !s.basmalaIsAyah),
  'وتُعرض سطراً مستقلاً في السور الثلاث');

const joined = [...source.values()].join('\n');
const quoted = [...QURAN.rasm.signs.map((s) => s.read), ...QURAN.muqattaat.items.map((m) => m.read)];
ok(quoted.every((t) => joined.includes(t)),
  `وأمثلة الرسم والمقطَّعة (${quoted.length}) منقولة من المصحف لا مكتوبة بأيدينا`);
ok(QURAN.rasm.signs.every((s) => s.read.includes(s.sign.replace('ـ', ''))),
  'وكل علامة رسم ظاهرة فعلاً في مثالها');

// ————— ٥. الصوت: منطوقٌ له ملف أو مكان في القائمة، وعثمانيٌّ لا يُنطق أبداً —————

const manifest = JSON.parse(readFileSync(new URL('../app/audio/manifest.json', import.meta.url), 'utf8'));
const queue = JSON.parse(readFileSync(new URL('audio_queue.json', import.meta.url), 'utf8'));
const have = new Set(Object.values(manifest));
const pending = new Set(queue.filter((e) => e.status !== 'done').map((e) => e.text));

const spoken = [...new Set(quranSpokenTexts())];
const orphan = spoken.filter((t) => !have.has(t) && !pending.has(t));
ok(orphan.length === 0,
  `كل منطوق له ملف أو مكان في القائمة (${spoken.length} نصاً: ${spoken.filter((t) => have.has(t)).length} جاهز، ${spoken.filter((t) => pending.has(t)).length} منتظِر)${orphan.length ? ' — ' + orphan.join('،') : ''}`);

const silent = [...new Set(quranSilentTexts())];
const voiced = silent.filter((t) => have.has(t) || pending.has(t));
ok(silent.length >= 30 && voiced.length === 0,
  `ولا نصّ من المصحف (${silent.length} نصاً) له صوت مولَّد ولا مكان في القائمة`
  + `${voiced.length ? ' — ' + voiced.join('،') : ''} (METHOD §٥.٦)`);
ok(silent.every((t) => !spoken.includes(t)),
  'والقائمتان منفصلتان تماماً: ما يُعرض من المصحف لا يُنطق');

// ————— ٦. النجوم —————

ok(starsForStory(7, 7) === 3 && starsForStory(4, 7) === 2 && starsForStory(1, 7) === 1,
  'نجوم السورة متابعةً لا إصابةً (كما نجوم القصة)');
ok(starsForGame(0, 8) === 3 && starsForGame(8, 8) === 2 && starsForGame(9, 8) === 1,
  'ونجوم «اقرأ واختر» بعتبة متناسبة مع طول النشاط');

console.log(fails ? `\n${fails} فشل` : '\nكل اختبارات المرحلة القرآنية ناجحة');
process.exit(fails ? 1 : 0);
