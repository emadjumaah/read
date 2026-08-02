// اختبار جلسة المراجعة (app/js/review.js) ولوحة وليّ الأمر (app/js/parent.js) — بلا متصفّح.
//   node tools/test_review.mjs
// المحروس هنا ثلاثة:
//   ١) **لا نصّ منطوق جديد**: كل ما تنطقه المراجعة له ملف في app/audio/manifest.json.
//   ٢) **مفكوكية ١٠٠٪**: لا حرف خارج حصيلة الطفل في أي تمرين.
//   ٣) بناء الجلسة: المستحقّ أولاً، بلا تكرار، وبسقف لتمارين التركيب الطويلة.

import { readFileSync } from 'node:fs';

const APP = new URL('../app/js/', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { GROUPS, HARAKAT, bareLetters, syllableSkill } = await import(new URL('curriculum.js', APP));
const progress = await import(new URL('progress.js', APP));
const { buildSession, itemTexts, starsForReview, SESSION_SIZE, MAX_BUILD } =
  await import(new URL('review.js', APP));
const { recommend, minutesText, skillsText, readNumber } = await import(new URL('parent.js', APP));

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };
const bad = (msg) => { fails++; console.log('  ✗', msg); };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const manifest = JSON.parse(readFileSync(new URL('../app/audio/manifest.json', import.meta.url), 'utf8'));
const haveAudio = new Set(Object.values(manifest));
const ALL_LETTERS = GROUPS.flatMap((g) => g.letters);

// ————— ١. تحليل المقطع (أساس القياس) —————

ok(syllableSkill('بَيْ').letter === 'ب' && syllableSkill('بَيْ').haraka === 'fatha',
  'مهارة «بَيْ» = الباء بالفتحة (أول حرف وحركته)');
ok(syllableSkill('بْ').haraka === 'sukun', 'مهارة «بْ» = الباء بالسكون');
ok(syllableSkill('لَا').letter === 'ل' && syllableSkill('لَا').haraka === 'fatha', 'مهارة «لَا» = اللام بالفتحة');
ok(syllableSkill('ا').haraka === 'none', 'حرف بلا علامة ⇒ حركة «none»');
ok(syllableSkill('🌙') === null && syllableSkill('') === null, 'نصّ بلا حرف عربي ⇒ null');

// ————— ٢. الجلسة: مفكوكيتها وتغطية صوتها في كل حالات التقدّم —————

/** سجلّ مهارات مصطنع يشبه ما ينتجه الاستعمال الحقيقي (تمارين الدرس واللعبة). */
function synthDue(letters, words, rnd) {
  const out = [];
  for (const letter of letters) {
    const haraka = HARAKAT[Math.floor(rnd() * HARAKAT.length)].key;
    out.push({ key: `${letter}|${haraka}|quiz`, letter, haraka, kind: 'quiz', box: 0, wrong: 2, due: 0 });
    if (rnd() < 0.5) {
      out.push({ key: `${letter}|${haraka}|haraka`, letter, haraka, kind: 'haraka', box: 1, wrong: 1, due: 0 });
    }
  }
  for (const word of words) {
    if (rnd() > 0.4) continue;
    const skill = syllableSkill(word.tiles[Math.floor(rnd() * word.tiles.length)]);
    if (skill) out.push({ key: `${skill.letter}|${skill.haraka}|build`, ...skill, kind: 'build', box: 0, wrong: 3, due: 0 });
  }
  return out;
}

let sessions = 0;
let builtItems = 0;
let sizeOk = true;
for (let n = 2; n <= ALL_LETTERS.length; n++) {
  const letters = ALL_LETTERS.slice(0, n);
  const known = new Set(letters);
  const words = progress.studiedWords(letters);

  for (let seed = 1; seed <= 12; seed++) {
    const rnd = rng(seed * 31 + n);
    const due = seed % 3 === 0 ? [] : synthDue(letters, words, rnd);   // ثلث الجلسات بلا مستحقّ
    const items = buildSession({ letters, words, due, rnd });
    sessions++;
    builtItems += items.length;
    if (items.length !== SESSION_SIZE) sizeOk = false;

    if (new Set(items.map((i) => i.id)).size !== items.length) {
      bad(`[${n} حرفاً · بذرة ${seed}] تمرين مكرّر في الجلسة`);
    }
    if (items.filter((i) => i.kind === 'build').length > MAX_BUILD) {
      bad(`[${n} حرفاً · بذرة ${seed}] تمارين تركيب فوق السقف`);
    }

    for (const item of items) {
      const texts = itemTexts(item);
      const missing = texts.filter((t) => !haveAudio.has(t));
      if (missing.length) bad(`[${n} حرفاً] نصّ بلا ملف صوت: ${missing.join('،')}`);

      const shown = [...texts, item.word ? item.word.tiles.join('') : ''].join('');
      const outside = [...bareLetters(shown)].filter((c) => !known.has(c));
      if (outside.length) bad(`[${n} حرفاً] حرف غير مدروس في التمرين: ${outside.join('،')}`);

      if (item.kind === 'quiz') {
        if (!item.options.includes(item.letter)) bad(`[${n}] الهدف غائب عن خيارات التمييز`);
        if (new Set(item.options).size !== item.options.length) bad(`[${n}] خيار مكرّر في التمييز`);
        if (item.options.length > 3) bad(`[${n}] خيارات أكثر من ثلاثة`);
      }
      if (item.kind === 'haraka') {
        if (item.options.length !== 3) bad(`[${n}] الحركات ليست ثلاثاً`);
        if (!item.options.some((k) => k.key === item.haraka)) bad(`[${n}] الحركة المستهدفة غائبة`);
      }
      if (item.kind === 'build') {
        const board = item.board.map((t) => t.text);
        const need = item.word.tiles.filter((t) => !board.includes(t));
        if (need.length) bad(`[${n}] «${item.word.say}»: مقطع ناقص من اللوح`);
        if (!words.includes(item.word)) bad(`[${n}] كلمة من خارج حصيلة الطفل`);
      }
    }
  }
}
ok(true, `${sessions} جلسة في كل حالات التقدّم (٢…٢٨ حرفاً): كل نصّ له ملف صوت مولَّد`);
ok(true, 'ولا حرف واحد خارج حصيلة الطفل في أي تمرين');
ok(sizeOk, `كل جلسة ${SESSION_SIZE} تمارين تماماً (${builtItems} تمريناً)`);

// ————— ٣. الأولوية للمستحقّ، والتنويع عند غيابه —————

const four = ALL_LETTERS.slice(0, 4);
const fourWords = progress.studiedWords(four);
const dueOnly = four.flatMap((letter) => HARAKAT.map((k) => ({
  key: `${letter}|${k.key}|quiz`, letter, haraka: k.key, kind: 'quiz', box: 0, wrong: 1, due: 0,
})));
const fromDue = buildSession({ letters: four, words: fourWords, due: dueOnly, rnd: rng(7) });
ok(fromDue.every((item, i) => item.id === `quiz|${dueOnly[i].letter}|${dueOnly[i].haraka}`),
  'المستحقّ يملأ الجلسة بترتيبه (الأضعف أولاً) ولا يزاحمه تنويع');

const noDue = buildSession({ letters: four, words: fourWords, due: [], rnd: rng(9) });
ok(noDue.length === SESSION_SIZE, 'بلا مستحقّ: الجلسة تُملأ من حصيلته (لا تُترك فارغة)');
ok(new Set(noDue.map((i) => i.kind)).size >= 2, 'وفيها أكثر من نوع تمرين (تنويع لا رتابة)');

const stale = buildSession({
  letters: four,
  words: fourWords,
  due: [{ key: 'غ|fatha|quiz', letter: 'غ', haraka: 'fatha', kind: 'quiz', box: 0, wrong: 9, due: 0 }],
  rnd: rng(11),
});
ok(stale.every((i) => i.letter !== 'غ' && (!i.word || !i.word.say.includes('غ'))),
  'مهارة لحرف خارج الحصيلة (بعد محو التقدّم) تُتخطّى ولا تكسر المفكوكية');

ok(buildSession({ letters: ['ا'], words: [], due: [] }).length === 0, 'حرف واحد ⇒ لا مراجعة بعد');
ok(buildSession().length === 0, 'بلا معطيات ⇒ جلسة فارغة (تفشل مغلقةً)');

// المقاطع الساكنة تُراجَع في تمرين التركيب (لا في تمييز الحرف — لا ملف صوت لكل ساكن)
const sukunDue = [{ key: 'ب|sukun|build', letter: 'ب', haraka: 'sukun', kind: 'build', box: 0, wrong: 2, due: 0 }];
const sukunSession = buildSession({ letters: four, words: fourWords, due: sukunDue, rnd: rng(13) });
ok(sukunSession[0].kind === 'build' && sukunSession[0].word.tiles.includes('بْ'),
  'مهارة «بْ» تعود في كلمة تحوي المقطع نفسه («بَاب»)');

// ————— ٤. النجوم —————

ok(starsForReview(0, 6) === 3, 'مراجعة بلا خطأ ⇒ ثلاث نجوم');
ok(starsForReview(6, 6) === 2 && starsForReview(1, 6) === 2, 'زلّة لكل تمرين تبقى نجمتين');
ok(starsForReview(7, 6) === 1, 'ما زاد ⇒ نجمة');

// ————— ٥. لوحة وليّ الأمر: التوصية والقراءات —————

ok(recommend({ letters: 0 }).title.includes('ابدآ'), 'طفل لم يبدأ ⇒ توصية البدء معاً');
ok(recommend({ letters: 4, dueCount: 5, secondsToday: 25 * 60 }).action === null,
  'تجاوز نصيب اليوم ⇒ لا توصية بعمل (الراحة قبل التحصيل)');
ok(recommend({ letters: 4, dueCount: 5, secondsToday: 300 }).action.hash === '#/review',
  'مستحقّ ولم يراجع ⇒ المراجعة أولاً');
ok(recommend({ letters: 4, dueCount: 5, secondsToday: 300, reviewDone: true, next: { type: 'letter', letter: 'ب' } })
  .action.hash === '#/', 'راجع اليوم ⇒ الدرس التالي');
ok(recommend({ letters: 40, dueCount: 0, next: null }).action.hash === '#/review',
  'أتمّ الخريطة ⇒ تبقى المراجعة');

ok(minutesText(0) === 'لا شيء' && minutesText(30) === 'أقل من دقيقة' && minutesText(60) === 'دقيقة واحدة'
  && minutesText(120) === 'دقيقتان' && minutesText(150) === '٣ دقائق' && minutesText(15 * 60) === '١٥ دقيقة',
  'صياغة الدقائق بالعربية الصحيحة (مفرد ومثنى وجمعا القلة والكثرة)');
ok(skillsText(1) === 'مهارة واحدة' && skillsText(2) === 'مهارتين' && skillsText(6) === '٦ مهارات'
  && skillsText(12) === '١٢ مهارة', 'وصياغة المهارات المستحقّة كذلك');
ok(readNumber('٧٢') === 72 && readNumber('72') === 72 && Number.isNaN(readNumber('س')),
  'بوابة وليّ الأمر تقبل الرقمين العربي والهندي وترفض ما سواهما');

console.log(fails ? `\n${fails} فشل` : '\nكل اختبارات المراجعة ولوحة وليّ الأمر ناجحة');
process.exit(fails ? 1 : 0);
