// تصفية النصوص المنطوقة الجديدة إلى قائمة الانتظار الصوتية (docs/AUDIO_QUEUE.md).
//
//   node tools/queue_texts.mjs           # عرض الناقص فقط (لا يكتب شيئاً)
//   node tools/queue_texts.mjs --add     # إضافته إلى tools/audio_queue.json
//
// جلسات التطوير لا تشغّل المولّد ولا تلمس app/audio/ — تضيف نصوصها هنا فقط.
// المصدر: دروس المهارات والقصص في app/js/curriculum.js (لم يُضَمّا بعدُ لمستخرج المولّد).
// النصّ يُكتب حرفياً كما يُمرَّر إلى audio.play() — فالتطابق شرط لمفتاح sha1.

import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const QUEUE = new URL('tools/audio_queue.json', ROOT);
const MANIFEST = new URL('app/audio/manifest.json', ROOT);

const { SKILLS, STORIES, skillExamples, sentenceText, bareLetters } =
  await import(new URL('app/js/curriculum.js', ROOT));

/** فئة النصّ (تحدّد توجيه الأداء في المولّد). */
function categoryOf(text, fallback) {
  const bare = bareLetters(text);
  if (bare.length === 1) return 'letter_haraka';
  if (text.includes(' ')) return fallback === 'sentence' ? 'sentence' : 'syllable';
  if (fallback === 'story_word') return 'story_word';
  if (bare.length <= 2) return 'syllable';
  return 'word';
}

/** كل نصوص الجلسة ٤ المنطوقة ← فئتها، بترتيب ظهورها للطفل. */
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
console.log(`نصوص المهارات والقصص: ${wanted.size} | لها ملف: ${ready} `
  + `| في القائمة أصلاً: ${[...wanted].filter(([t]) => queued.has(t)).length} | ناقص: ${missing.length}`);
if (missing.length) {
  console.log(Object.entries(counts).map(([c, n]) => `${c}: ${n}`).join('، '));
  for (const [text, cat] of missing) console.log(`  + ${text}   (${cat})`);
}

if (process.argv.includes('--add') && missing.length) {
  queue.push(...missing.map(([text, category]) => ({
    text,
    category,
    requestedBy: 'session-4',
    priority: 100,
    status: 'pending',
    doneAt: null,
  })));
  writeFileSync(QUEUE, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
  console.log(`\nأُضيف ${missing.length} نصاً إلى tools/audio_queue.json`);
}
