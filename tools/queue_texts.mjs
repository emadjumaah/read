// تصفية النصوص المنطوقة الجديدة إلى قائمة الانتظار الصوتية (docs/AUDIO_QUEUE.md).
//
//   node tools/queue_texts.mjs           # عرض الناقص فقط (لا يكتب شيئاً)
//   node tools/queue_texts.mjs --add     # إضافته إلى tools/audio_queue.json
//   node tools/queue_texts.mjs --prune   # إسقاط المنتظِر الذي لم يعد يُنطق
//
// جلسات التطوير لا تشغّل المولّد ولا تلمس app/audio/ — تضيف نصوصها هنا فقط.
// المصادر: دروس المهارات والقصص والمرحلة القرآنية في app/js/curriculum.js،
// **ومعجم البساتين** في app/data/lexicon.json (الحزمة ٧)، **وسلّم الجمل** المبنيّ منه
// (الحزمة ٨) — كلها خارج مستخرج المولّد بعدُ. النصّ يُكتب حرفياً كما يُمرَّر إلى
// audio.play() — فالتطابق شرط لمفتاح sha1.
//
// ترتيب الإضافة هو ترتيب التصريف: كلمات أول بستان ومقاطعها أولاً، ثم جمل سلّمه،
// فيصير مسموعاً قبل أن يبلغه الطفل (docs/AUDIO_QUEUE.md).
//
// **نصّ المصحف خارج هذا كله**: `quranMushafTexts()` لا يدخل القائمة أبداً، فالتلاوة
// بصوت قارئ متقن لا بمولّد (METHOD §٥.٦) — تُجلب تسجيلاً بـ`fetch_recitation.py`،
// ويرفض `check_decodable.py` صراحةً أن يُولَّد لها صوت.

import { readFileSync, renameSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const QUEUE = new URL('tools/audio_queue.json', ROOT);
const MANIFEST = new URL('app/audio/manifest.json', ROOT);

const {
  SKILLS, STORIES, QURAN, skillExamples, sentenceText, bareLetters,
  quranSpokenTexts, quranMushafTexts,
} = await import(new URL('app/js/curriculum.js', ROOT));
const { GARDENS } = await import(new URL('app/js/lexicon.js', ROOT));
const { RUNGS } = await import(new URL('app/js/sentences.js', ROOT));

const REQUESTED_BY = process.env.QUEUE_BY || 'session-7';

/** فئة النصّ (تحدّد توجيه الأداء في المولّد). */
function categoryOf(text, fallback) {
  const bare = bareLetters(text);
  if (bare.length === 1) return 'letter_haraka';
  if (text.includes(' ')) return fallback === 'sentence' ? 'sentence' : 'syllable';
  if (fallback === 'story_word') return 'story_word';
  if (bare.length <= 2) return 'syllable';
  return 'word';
}

/** كل النصوص المنطوقة خارج مستخرج المولّد ← فئتها، بترتيب ظهورها للطفل. */
function newTexts() {
  const out = new Map();
  const add = (text, fallback) => {
    if (text && !out.has(text)) out.set(text, categoryOf(text, fallback));
  };

  for (const skill of SKILLS) {
    add(skill.rule, 'sentence');
    for (const text of skill.compare.pairs.flat()) add(text, 'word');
    for (const word of skillExamples(skill)) add(word.say, 'word');
  }
  for (const story of STORIES) {
    add(story.title, 'sentence');
    for (const sentence of story.sentences) {
      add(sentenceText(sentence), 'sentence');
      for (const word of sentence.words) add(word, 'story_word');
    }
  }
  // المرحلة القرآنية: القواعد والكلمات الإملائية وأسماء الحروف وحدها
  for (const text of quranSpokenTexts()) {
    add(text, text.includes(' ') ? 'sentence' : 'word');
  }
  // البساتين: الكلمة ثم مقاطعها، بستاناً بستاناً وباقةً باقة (ترتيب لقاء الطفل بها).
  // فئة المقطع تُحدَّد بعدد حروفه لا بتخمين: حرفٌ واحد بحركته، أو مقطع.
  for (const garden of GARDENS) {
    for (const bundle of garden.bundles) {
      for (const word of bundle.words) {
        if (word.say && !out.has(word.say)) out.set(word.say, 'word');
        for (const tile of word.tiles) {
          if (!out.has(tile)) out.set(tile, bareLetters(tile).length === 1 ? 'letter_haraka' : 'syllable');
        }
      }
    }
  }
  // سلّم الجمل: الجملة كاملةً، وكلماتُها مفردةً في «رتّب» وحدها (بها تُنقر الكلمة).
  // بستاناً بستاناً ودرجةً درجة — يلي كلماتِ بستانه، فيكتمل البستان صوتاً قبل ما بعده.
  for (const rung of RUNGS) {
    for (const sentence of rung.sentences) {
      add(sentence.text, 'sentence');
      if (sentence.mechanic === 'order') for (const word of sentence.words) add(word, 'story_word');
    }
  }
  const forbidden = quranMushafTexts().filter((t) => out.has(t));
  if (forbidden.length) {
    console.error(`نصّ من المصحف كاد يدخل القائمة: ${forbidden.join('، ')}`);
    process.exit(1);
  }
  return out;
}

// ————— المقارنة بالموجود —————

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const have = new Set(Object.values(manifest));
const queue = JSON.parse(readFileSync(QUEUE, 'utf8'));
const queued = new Set(queue.map((e) => e.text));

const wanted = newTexts();
const missing = [...wanted].filter(([text]) => !have.has(text) && !queued.has(text));

const counts = {};
for (const [, cat] of missing) counts[cat] = (counts[cat] || 0) + 1;

const ready = [...wanted].filter(([t]) => have.has(t)).length;
console.log(`نصوص المهارات والقصص والقرآني والبساتين والجمل: ${wanted.size} | لها ملف: ${ready} `
  + `| في القائمة أصلاً: ${[...wanted].filter(([t]) => queued.has(t)).length} | ناقص: ${missing.length}`);
if (missing.length) {
  console.log(Object.entries(counts).map(([c, n]) => `${c}: ${n}`).join('، '));
  for (const [text, cat] of missing) console.log(`  + ${text}   (${cat})`);
}

/**
 * كتابةٌ ذرّية بنمط `mark_done` في المولّد: ملفٌّ مؤقّت ثم استبدال، **وإعادةُ قراءةٍ
 * قُبيل الكتابة** — فالمصرِّف عمليةٌ حيّة قد تُحوِّل مدخلاً إلى `done` بين قراءتنا
 * وكتابتنا، فلا نكتب لقطةً قديمة فوق عمله. التعديل يُبنى على ما في القرص لا على ما
 * في الذاكرة، ولا يُلمَس مدخلٌ `done` أبداً.
 */
function rewriteQueue(edit) {
  const disk = JSON.parse(readFileSync(QUEUE, 'utf8'));
  const next = edit(disk);
  const tmp = new URL('tools/audio_queue.json.tmp', ROOT);
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(tmp, QUEUE);
  return next;
}

if (process.argv.includes('--add') && missing.length) {
  const added = missing.map(([text, category]) => ({
    text,
    category,
    requestedBy: REQUESTED_BY,
    priority: 100,
    status: 'pending',
    doneAt: null,
  }));
  rewriteQueue((disk) => {
    const known = new Set(disk.map((e) => e.text));
    return [...disk, ...added.filter((e) => !known.has(e.text))];
  });
  console.log(`\nأُضيف ${missing.length} نصاً إلى tools/audio_queue.json`);
}

// ————— التقليم: إسقاط المنتظِر الذي لم يعد يُنطق —————
//
// تغييرُ تناوب الميكانيكيات (بدخول جملٍ جديدة تتغيّر قسمةُ الدرجات) ينقل جملاً من
// «رتّب» إلى غيرها، فكلماتُها المصفوفة لا تُنقر بعد اليوم — وتصريفُها إهدارٌ للحصة.
// والتقليم **محصورٌ حصراً**: `pending` فقط (لا يُمَسّ `done` ولا ملفٌّ مولَّد)، وما ليس
// في حاجة اليوم، **وما ليس من نصوص المنهج** — ونصوصُ المنهج تُعرَف بوجودها في الفهرس
// (`manifest.json` = نصوص المنهج + منجَز القائمة)، فلا يمسّ التقليمُ نظائرَ «زَيْ» و«يْ».

if (process.argv.includes('--prune')) {
  const keep = new Set([...wanted.keys(), ...have]);
  const dead = queue.filter((e) => (e.status ?? 'pending') !== 'done' && !keep.has(e.text));
  const deadTexts = new Set(dead.map((e) => e.text));

  if (!dead.length) {
    console.log('\nالتقليم: لا مدخل منتظِراً خارج الحاجة — القائمة نظيفة.');
  } else {
    const byWho = {};
    for (const e of dead) byWho[e.requestedBy] = (byWho[e.requestedBy] || 0) + 1;
    console.log(`\nالتقليم: ${dead.length} مدخلاً منتظِراً لم يعد يُنطق `
      + `(${Object.entries(byWho).map(([w, n]) => `${w}: ${n}`).join('، ')})`);
    for (const e of dead) console.log(`  − ${e.text}   (${e.category} · ${e.requestedBy})`);

    const before = queue.length;
    const next = rewriteQueue((disk) => disk.filter(
      (e) => !((e.status ?? 'pending') !== 'done' && deadTexts.has(e.text))));
    const kept = next.filter((e) => deadTexts.has(e.text));
    console.log(`\nحُذف ${before - next.length} مدخلاً من tools/audio_queue.json `
      + `(بقي ${next.length})`
      + (kept.length ? ` — واستُبقي ${kept.length} صُرِّف أثناء العمل` : ''));
  }
}
