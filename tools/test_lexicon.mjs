// اختبار «حديقة الكلمات» — المعجم والبساتين (الحزمة ٧) بلا متصفّح:
//   node tools/test_lexicon.mjs
//
// المحروس هنا خمسة:
//   ١) بنية المعجم وباقاته وموضع البساتين من الرحلة وقفلها.
//   ٢) المفكوكية ١٠٠٪ بمعيار جافاسكربتي مستقلّ عن الفاحص البايثوني (حارسان لا واحد).
//   ٣) سلامة جولات «اقرأ واختر» وألواح «ركّب الكلمة» في **كل** باقة وكل كلمة.
//   ٤) **القياس موصول**: لكل مقطع مهارةٌ تُسجَّل، ومهارةٌ لا توجد إلا في كلمات المعجم
//      تجد تمرينها في جلسة المراجعة (وإلا لضاع ما قِيس في البستان).
//   ٥) الصوت: كل منطوق له ملف مولَّد أو مكان في قائمة الانتظار — ولا مولّد يُشغَّل.

import { readFileSync } from 'node:fs';

const APP = new URL('../app/js/', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { GROUPS, QURAN, bareLetters, syllableSkill } = await import(new URL('curriculum.js', APP));
const { GARDENS, WORDS, BUNDLE_SIZE, bundleById, lexiconTexts } =
  await import(new URL('lexicon.js', APP));
const { buildReadRounds } = await import(new URL('screens.js', APP));
const { buildBoard, starsForGame } = await import(new URL('words.js', APP));
const { bundlePool, nodeIdOf } = await import(new URL('garden.js', APP));
const { buildSession, itemTexts } = await import(new URL('review.js', APP));
const p = await import(new URL('progress.js', APP));

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };
const bad = (msg) => { fails++; console.log('  ✗', msg); };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ————— ١. بنية المعجم —————

const bundles = GARDENS.flatMap((g) => g.bundles);
ok(WORDS.length >= 250 && GARDENS.length >= 8 && GARDENS.length <= 10,
  `المعجم: ${WORDS.length} كلمة في ${GARDENS.length} بساتين (${bundles.length} باقة)`);
ok(bundles.every((b) => b.words.length === BUNDLE_SIZE),
  `كل باقة ${BUNDLE_SIZE} كلمات (حلقة لعبٍ في دقائق لا ٢٥ كلمة دفعةً)`);
ok(new Set(bundles.map((b) => b.id)).size === bundles.length
  && bundles.every((b) => bundleById(b.id) === b), 'ولكل باقة معرّف فريد يُعثر عليه');
ok(new Set(WORDS.map((w) => w.word)).size === WORDS.length, 'ولا كلمة مكرَّرة في المعجم');
ok(GARDENS.every((g) => g.title && g.emoji && g.words.length), 'ولكل بستان عنوانه وصورته وكلماته');
ok(WORDS.every((w) => w.text === w.word && w.read === w.word && w.say === w.word),
  'والكلمة تُعرض وتُقرأ وتُنطق بنصّ واحد (لا تفترق شاشة عن صوت)');

// ————— ٢. المفكوكية: حصيلة الطفل عند البساتين (بعد الرحلة كلها) —————

const taught = new Set(GROUPS.flatMap((g) => g.letters));
const quranSigns = QURAN.letters.signs.flatMap((s) => [s.sign, ...s.shapes.join('')]);
const known = new Set([...taught, ...quranSigns].filter((c) => c !== 'ـ'));

const outside = WORDS.flatMap((w) => [...bareLetters(w.word)]
  .filter((c) => !known.has(c)).map((c) => `«${c}» في «${w.word}»`));
ok(outside.length === 0,
  `كل حروف المعجم (${WORDS.length} كلمة) داخل حصيلة الطفل${outside.length ? ' — ' + outside.slice(0, 5).join('، ') : ''}`);

const tileOutside = WORDS.flatMap((w) => w.tiles.filter((t) => !known.has(bareLetters(t)[0])));
ok(tileOutside.length === 0, 'ومقاطعها كذلك (لا مقطع بحرف خارج الحصيلة)');
ok(WORDS.every((w) => w.tiles.length >= 2), 'ولكل كلمة مقطعان فأكثر (تصلح للتركيب)');
ok(WORDS.every((w) => bareLetters(w.tiles.join('')).length >= bareLetters(w.word).length),
  'وتركيب المقاطع يستوعب حروف الكلمة كلها (الشدّة تُفكّ حرفين)');

// صورتان متطابقتان في باقة واحدة تجعلان «اقرأ واختر» بلا جواب صحيح
const dupEmoji = bundles.filter((b) => new Set(b.words.map((w) => w.emoji)).size !== b.words.length);
ok(dupEmoji.length === 0,
  `ولكل كلمة صورتها وحدها في باقتها${dupEmoji.length ? ' — ' + dupEmoji.map((b) => b.id).join('، ') : ''}`);

// ————— ٣. موضع البساتين من الرحلة وقفلها —————

const nodes = p.allNodes();
const ids = nodes.map((n) => n.id);
const gardenIds = bundles.map((b) => `garden:${b.id}`);
ok(gardenIds.every((id) => ids.includes(id)) && nodeIdOf(bundles[0].id) === gardenIds[0],
  `عقد البساتين في الرحلة (${gardenIds.length} عقدة)`);
ok(ids.slice(-gardenIds.length).join('|') === gardenIds.join('|'),
  'وهي خاتمة الرحلة، بعد المرحلة القرآنية');
ok(ids.indexOf(gardenIds[0]) > ids.indexOf('quran:s114'), 'وأول باقة بعد آخر سورة');

p.reset();
ok(!p.isNodeUnlockedById(gardenIds[0]), 'البساتين مقفلة في بداية الرحلة');
for (const n of nodes) {
  if (n.id === gardenIds[0]) break;
  p.setStars(n.id, 3);
}
ok(p.isNodeUnlockedById(gardenIds[0]) && p.nextNode().id === gardenIds[0],
  'وأول باقة تُفتح بإتمام الرحلة كلها');
ok(!p.isNodeUnlockedById(gardenIds[1]), 'والباقة الثانية تنتظر التي قبلها (تُفتح تباعاً)');
p.setStars(gardenIds[0], 3);
ok(p.isNodeUnlockedById(gardenIds[1]), 'فإذا أُتمّت فُتحت');

// ————— ٤. حلقة الباقة: «اقرأ واختر» و«ركّب الكلمة» في كل باقة وكل كلمة —————

let rounds = 0;
let boards = 0;
for (const bundle of bundles) {
  const pool = bundlePool(bundle);
  for (let seed = 1; seed <= 4; seed++) {
    const rnd = rng(seed * 7 + bundle.id.length);

    for (const r of buildReadRounds(bundle.words, rnd)) {
      rounds++;
      if (r.options.length !== 3) bad(`[${bundle.id}] خيارات ≠ ٣`);
      if (new Set(r.options.map((o) => o.read)).size !== 3) bad(`[${bundle.id}] خيار مكرَّر`);
      if (!r.options.includes(r.target)) bad(`[${bundle.id}] الهدف ليس بين الخيارات`);
      if (r.options.some((o) => !bundle.words.includes(o))) bad(`[${bundle.id}] خيار من خارج الباقة`);
    }

    for (const word of bundle.words) {
      const board = buildBoard(word, pool, rnd);
      boards++;
      const texts = board.map((t) => t.text);
      if (word.tiles.some((t) => !texts.includes(t))) bad(`[${word.word}] مقطع ناقص من اللوح`);
      if (board.some((t) => t.distractor && word.tiles.includes(t.text))) {
        bad(`[${word.word}] مشتّت يطابق مقطعاً من الكلمة`);
      }
      if (texts.some((t) => !pool.includes(t))) bad(`[${word.word}] مقطع من خارج البستان`);
      if (word.tiles.every((t, i) => texts[i] === t)) bad(`[${word.word}] اللوح جاهز مرتَّباً`);
    }
  }
}
ok(true, `جولات وألواح سليمة في كل الباقات (${rounds} جولة قراءة، ${boards} لوح تركيب)`);
ok(buildReadRounds(bundles[0].words).length === BUNDLE_SIZE, 'كل كلمة تأتي دورها مرة في باقتها');
ok(starsForGame(0, BUNDLE_SIZE) === 3 && starsForGame(BUNDLE_SIZE, BUNDLE_SIZE) === 2
  && starsForGame(BUNDLE_SIZE + 1, BUNDLE_SIZE) === 1,
  'ونجوم الباقة بعتبة «زلّة لكل كلمة» (كما لعبة الكلمات)');

// ————— ٥. القياس موصول: كل مقطع يُسجَّل، والمراجعة تجد تمرينه —————

const noSkill = WORDS.flatMap((w) => w.tiles.filter((t) => !syllableSkill(t)));
ok(noSkill.length === 0,
  `لكل مقاطع المعجم مهارةٌ تُسجَّل (حرف × حركة) — ${new Set(WORDS.flatMap((w) => w.tiles)).size} مقطعاً فريداً`);

const curriculumSkills = new Set(GROUPS.flatMap((g) => g.words).flatMap((w) => w.tiles)
  .map((t) => { const s = syllableSkill(t); return `${s.letter}|${s.haraka}`; }));
const onlyInLexicon = [...new Set(WORDS.flatMap((w) => w.tiles).map((t) => {
  const s = syllableSkill(t);
  return `${s.letter}|${s.haraka}`;
}))].filter((k) => !curriculumSkills.has(k));
ok(onlyInLexicon.length > 0,
  `والمعجم يأتي بمهارات جديدة لم تكن في المنهج (${onlyInLexicon.length} مهارة)`);

// أتمّ الرحلة كلها والبساتين: حصيلته الآن كلمات المنهج + كلمات البساتين
for (const n of nodes) p.setStars(n.id, 3);
const letters = p.studiedLetters();
const words = p.studiedWords(letters);
ok(p.studiedLexicon().length === WORDS.length && words.length > WORDS.length,
  `وكلمات الباقات المُنجَزة تدخل حصيلة المراجعة (${words.length} كلمة)`);

const manifest = JSON.parse(readFileSync(new URL('../app/audio/manifest.json', import.meta.url), 'utf8'));
const queue = JSON.parse(readFileSync(new URL('audio_queue.json', import.meta.url), 'utf8'));
const have = new Set(Object.values(manifest));
const pending = new Set(queue.filter((e) => e.status !== 'done').map((e) => e.text));
const voiced = (t) => have.has(t) || pending.has(t);

let reviewed = 0;
let heardTexts = new Set();
for (const key of onlyInLexicon.slice(0, 12)) {
  const [letter, haraka] = key.split('|');
  const due = [{ key: `${key}|build`, letter, haraka, kind: p.KINDS.BUILD, right: 0, wrong: 2, box: 0, due: 0, seen: 0 }];
  const items = buildSession({ letters, words, due, rnd: rng(key.length + 3) });
  const built = items.find((i) => i.kind === p.KINDS.BUILD);
  if (!built) { bad(`مهارة «${letter}|${haraka}» مستحقّة بلا تمرين في المراجعة`); continue; }
  reviewed++;
  for (const t of items.flatMap(itemTexts)) heardTexts.add(t);
}
ok(reviewed === Math.min(12, onlyInLexicon.length),
  `ومهارةٌ لا توجد إلا في المعجم تجد تمرينها في مراجعة اليوم (${reviewed} مهارة مجرَّبة)`);

const silentInReview = [...heardTexts].filter((t) => !voiced(t));
ok(silentInReview.length === 0,
  `وكل ما تنطقه المراجعة له ملف أو مكان في القائمة (${heardTexts.size} نصاً)`
  + `${silentInReview.length ? ' — ' + silentInReview.slice(0, 6).join('، ') : ''}`);

// ————— ٦. الصوت: منطوقٌ مُصرَّف أو منتظِر، ولا شيء خارج الحسبان —————

const texts = lexiconTexts();
const orphan = texts.filter((t) => !voiced(t));
ok(orphan.length === 0,
  `نصوص البساتين كلها محسوبة (${texts.length} نصاً: ${texts.filter((t) => have.has(t)).length} جاهز، `
  + `${texts.filter((t) => pending.has(t) && !have.has(t)).length} منتظِر)`
  + `${orphan.length ? ' — بلا حساب: ' + orphan.slice(0, 6).join('، ') : ''}`);
ok(texts.length === new Set(texts).size && texts.length >= WORDS.length,
  'ولا تكرار في قائمة نصوصها (الكلمة ومقاطعها مرة واحدة)');

console.log(fails ? `\n${fails} فشل` : '\nكل اختبارات حديقة الكلمات ناجحة');
process.exit(fails ? 1 : 0);
