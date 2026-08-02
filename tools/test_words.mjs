// اختبار منطق لعبة تركيب الكلمات (app/js/words.js) — بلا متصفّح.
//   node tools/test_words.mjs
// المحروس هنا: مفكوكية اللوح ١٠٠٪، وسلامة تركيبه، وتغطية الصوت لكل مقطع وكل كلمة.

import { readFileSync } from 'node:fs';

const APP = new URL('../app/js/', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { GROUPS, lettersUpTo, bareLetters } = await import(new URL('curriculum.js', APP));
const { syllablePool, buildBoard, starsForGame } = await import(new URL('words.js', APP));

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };

// مولّد عشوائي محدَّد البذرة كي تكون الاختبارات قابلة للإعادة
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ————— ١. المقاطع المدروسة —————

let poolGrows = true;
let prev = 0;
for (const g of GROUPS) {
  const pool = syllablePool(g.id);
  if (pool.length <= prev) poolGrows = false;
  prev = pool.length;

  const studied = lettersUpTo(g.id);
  const outside = pool.filter((t) => [...bareLetters(t)].some((c) => !studied.includes(c)));
  if (outside.length) {
    fails++;
    console.log(`  ✗ [${g.id}] مقطع خارج الحروف المدروسة: ${outside.join('،')}`);
  }
  if (new Set(pool).size !== pool.length) {
    fails++;
    console.log(`  ✗ [${g.id}] مقاطع مكرّرة في المخزن`);
  }
}
ok(poolGrows, `مخزن المقاطع تراكمي يكبر مع كل مجموعة (حتى ${syllablePool('g7').length} مقطعاً)`);
ok(true, 'كل مقطع في المخزن حروفه مدروسة عند مجموعته');
ok(syllablePool('لا-وجود-له').length === 0, 'معرّف مجهول ⇒ مخزن فارغ (يفشل مغلقاً)');

// ————— ٢. اللوح: تركيبه ومفكوكيته —————

let boards = 0;
for (let seed = 1; seed <= 60; seed++) {
  const rnd = rng(seed);
  for (const g of GROUPS) {
    const pool = syllablePool(g.id);
    const studied = lettersUpTo(g.id);
    for (const word of g.words) {
      const board = buildBoard(word, pool, rnd);
      boards++;
      const texts = board.map((t) => t.text);
      const need = word.tiles.length <= 2 ? 1 : 2;

      // كل مقاطع الكلمة حاضرة بعددها (الكلمة قد تكرّر مقطعاً: «بَا بَا»)
      const count = (list, t) => list.filter((x) => x === t).length;
      const missing = word.tiles.filter((t) => count(texts, t) < count(word.tiles, t));
      if (missing.length) {
        fails++;
        console.log(`  ✗ [${g.id}] «${word.say}»: مقطع ناقص من اللوح: ${missing.join('،')}`);
      }
      if (board.filter((t) => !t.distractor).length !== word.tiles.length) {
        fails++;
        console.log(`  ✗ [${g.id}] «${word.say}»: عدد بلاطات الكلمة ≠ عدد مقاطعها`);
      }
      const distractors = board.filter((t) => t.distractor).map((t) => t.text);
      if (distractors.length !== need) {
        fails++;
        console.log(`  ✗ [${g.id}] «${word.say}»: ${distractors.length} مشتّتاً (المتوقع ${need})`);
      }
      if (distractors.some((t) => word.tiles.includes(t))) {
        fails++;
        console.log(`  ✗ [${g.id}] «${word.say}»: مشتّت يطابق مقطعاً من الكلمة (${distractors.join('،')})`);
      }
      if (new Set(distractors).size !== distractors.length) {
        fails++;
        console.log(`  ✗ [${g.id}] «${word.say}»: مشتّتان متطابقان (${distractors.join('،')})`);
      }
      if (distractors.some((t) => !pool.includes(t))) {
        fails++;
        console.log(`  ✗ [${g.id}] «${word.say}»: مشتّت من خارج المقاطع المدروسة`);
      }
      const unknown = texts.flatMap((t) => [...bareLetters(t)]).filter((c) => !studied.includes(c));
      if (unknown.length) {
        fails++;
        console.log(`  ✗ [${g.id}] «${word.say}»: حرف غير مدروس على اللوح: ${unknown.join('،')}`);
      }
      if (new Set(board.map((t) => t.id)).size !== board.length) {
        fails++;
        console.log(`  ✗ [${g.id}] «${word.say}»: معرّفات بلاطات مكرّرة`);
      }
      // اللوح مرتّب أصلاً = لعبة بلا تركيب
      if (word.tiles.every((t, i) => board[i].text === t)) {
        fails++;
        console.log(`  ✗ [${g.id}] «${word.say}»: اللوح جاء مرتّباً كالكلمة`);
      }
    }
  }
}
ok(true, `ألواح سليمة ومفكوكة في ٦٠ بذرة عشوائية (${boards} لوحاً)`);

// المشتّت الأقرب أولاً: «سلام» ينافسها «سْ» من «درس» (نفس الحرف بحركة أخرى)
const g2 = GROUPS.find((g) => g.id === 'g2');
const salam = g2.words.find((w) => w.say === 'سلام');
const nearHits = Array.from({ length: 20 }, (_, i) => buildBoard(salam, syllablePool('g2'), rng(i + 1)))
  .filter((b) => b.some((t) => t.distractor && t.text === 'سْ')).length;
ok(nearHits === 20, `المشتّت الأقرب («سْ» أمام «سَ») يُقدَّم دائماً (${nearHits}/٢٠)`);

// ————— ٣. النجوم —————

ok(starsForGame(0, 5) === 3, 'بلا خطأ ⇒ ثلاث نجوم');
ok(starsForGame(5, 5) === 2 && starsForGame(1, 5) === 2, 'زلّة لكل كلمة تبقى نجمتين');
ok(starsForGame(6, 5) === 1, 'ما زاد على ذلك ⇒ نجمة');

// ————— ٤. تغطية الصوت: كل مقطع وكل كلمة له ملف مولَّد —————

const manifest = JSON.parse(readFileSync(new URL('../app/audio/manifest.json', import.meta.url), 'utf8'));
const haveAudio = new Set(Object.values(manifest));
// نصوص القائمة المنتظِرة مستثناة مؤقتاً (بروتوكول AUDIO_QUEUE.md) — يعود الفحص صارماً بعد تصريفها
const queue = JSON.parse(readFileSync(new URL('./audio_queue.json', import.meta.url), 'utf8'));
const pendingAudio = new Set(queue.filter((e) => e.status === 'pending').map((e) => e.text));
const needAudio = new Set(GROUPS.flatMap((g) => g.words.flatMap((w) => [...w.tiles, w.say])));
const noAudio = [...needAudio].filter((t) => !haveAudio.has(t) && !pendingAudio.has(t));
ok(noAudio.length === 0,
  `كل مقطع وكل كلمة له ملف صوت (${needAudio.size} نصاً${noAudio.length ? ' — الناقص: ' + noAudio.join('،') : ''})`);

console.log(fails ? `\n${fails} فشل` : '\nكل اختبارات لعبة الكلمات ناجحة');
process.exit(fails ? 1 : 0);
