// اختبار «سلّم الجمل» (الحزمة ٨) بلا متصفّح:
//   node tools/test_sentences.mjs
//
// المحروس هنا ستة:
//   ١) بنية السلّم: كل جملة في درجةٍ واحدة، والدرجات بعد باقات بستانها على الخريطة.
//   ٢) **لا كلمة خارج المدروس**: كل كلمة في كل جملة إمّا كلمة معجمٍ من باقةٍ **سبقتها
//      في الرحلة فعلاً** (لا في بستانها فحسب)، أو كلمة منهجٍ درسها، أو من المعجم
//      المساند المعلَن في `lexicon.json` — يُقاس على ترتيب `allNodes()` نفسه.
//   ٣) الميكانيكيات الثلاث بالتناوب، وثباتُها (عليه تُبنى قائمة الصوت).
//   ٤) سلامة كل جولة: خيارات «اقرأ ونفّذ» و«أكمل»، وألواح «رتّب» في كل جملة.
//   ٥) **القياس موصول**: لكل كلمةٍ مهارةٌ تُسجَّل، ومهارةُ «رتّب» تجد تمرينها في
//      مراجعة اليوم (وإلا لبقيت في صندوق ليتنر الأول فكذبت لوحةُ وليّ الأمر).
//   ٦) الصوت: كل منطوق له ملف مولَّد أو مكان في قائمة الانتظار — ولا مولّد يُشغَّل.

import { readFileSync } from 'node:fs';

const APP = new URL('../app/js/', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { GROUPS, SKILLS, QURAN, bareLetters, wordSkill, skillExamples } =
  await import(new URL('curriculum.js', APP));
const { GARDENS, GRADED, WORDS } = await import(new URL('lexicon.js', APP));
const {
  LADDERS, RUNGS, SENTENCES, MECHANICS, RUNG_MAX, ORDER_MAX_WORDS, stemOf, ladderOf, rungById,
  orderPool, ladderTexts,
} = await import(new URL('sentences.js', APP));
const { buildBoard, starsForGame } = await import(new URL('words.js', APP));
const { pickOptions, nodeIdOf } = await import(new URL('ladder.js', APP));
const { buildSession, itemTexts, MAX_ORDER } = await import(new URL('review.js', APP));
const p = await import(new URL('progress.js', APP));

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };
const bad = (msg) => { fails++; console.log('  ✗', msg); };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ————— ١. بنية السلّم —————

ok(SENTENCES.length === WORDS.length + GRADED.length && GRADED.length >= 150,
  `السلّم: ${SENTENCES.length} جملة في ${RUNGS.length} درجة على ${LADDERS.length} بساتين `
  + `(${WORDS.length} من كلمتين + ${GRADED.length} متدرّجة)`);
ok(new Set(SENTENCES.map((s) => s.id)).size === SENTENCES.length,
  'كل جملة مرة واحدة في السلّم كله (لا تتكرّر ولا تسقط)');
ok(RUNGS.every((r) => r.sentences.length && r.sentences.length <= RUNG_MAX),
  `ولا درجة تتجاوز ${RUNG_MAX} جمل (${RUNGS.map((r) => r.sentences.length).join('،')})`);
ok(new Set(RUNGS.map((r) => r.id)).size === RUNGS.length && RUNGS.every((r) => rungById(r.id) === r),
  'ولكل درجة معرّف فريد يُعثر عليه');
ok(LADDERS.every((l) => l.rungs.length >= 1 && ladderOf(l.garden.id) === l),
  'ولكل بستان سلّمٌ لا يقلّ عن درجة');
ok(SENTENCES.every((s) => s.words.length >= 2 && s.text === s.words.join(' ')),
  'وكل جملة كلمتان فأكثر، ونصّها المنطوق هو كلماتها بعينها (لا مصدر ثانٍ)');
ok(SENTENCES.every((s) => s.blank >= 0 && s.blank < s.words.length),
  'ولكل جملة موضعُ كلمتها المصوَّرة (فراغ «أكمل الجملة»)');
ok(SENTENCES.every((s) => stemOf(s.words[s.blank]).startsWith(stemOf(s.target.word))),
  'والفراغ هو كلمة المعجم نفسها ولو بزيادةٍ عليها («أُخْتْ» ← «أُخْتِي»)');

// جذع الكلمة: نظير `stem` في tools/check_lexicon.py — القاعدة واحدة في الجهتين
ok(stemOf('الْغُرْفَةُ') === stemOf('غُرْفَةْ') && stemOf('السَّرِيرُ') === stemOf('سَرِيرْ'),
  `جذع الكلمة يوحّد المعرَّفة المُعرَبة بالمفردة الموقوفة (${stemOf('الْغُرْفَةُ')})`);
ok(stemOf('الرَّجُلُ') !== stemOf('رِجْلْ') && stemOf('فِي') === 'فِي',
  'ويميّز بالحركات لا بالحروف وحدها، ولا يمسّ ما ليس معرَّفاً');

// ————— ٢. موضع الدرجات من الرحلة وقفلها —————

const nodes = p.allNodes();
const ids = nodes.map((n) => n.id);
const rungIds = RUNGS.map((r) => nodeIdOf(r.id));
ok(rungIds.every((id) => ids.includes(id)), `عقد السلّم في الرحلة (${rungIds.length} درجة)`);

const misplaced = LADDERS.filter((ladder) => {
  const lastBundle = ids.indexOf(`garden:${ladder.garden.bundles.at(-1).id}`);
  const firstRung = ids.indexOf(nodeIdOf(ladder.rungs[0].id));
  return !(firstRung === lastBundle + 1);
});
ok(misplaced.length === 0,
  `ودرجات كل بستان تلي باقاته مباشرةً${misplaced.length ? ' — ' + misplaced.map((l) => l.id).join('، ') : ''}`);
ok(ids.at(-1) === rungIds.at(-1), 'وآخر الرحلة درجةُ جملٍ لا باقةُ كلمات');
ok(p.allNodes().length === ids.length && p.maxTotalStars() === ids.length * p.MAX_STARS,
  `والرحلة صارت ${ids.length} عقدة و${p.maxTotalStars()} نجمة`);

p.reset();
const firstRung = RUNGS[0];
ok(!p.isNodeUnlockedById(nodeIdOf(firstRung.id)), 'السلّم مقفل في بداية الرحلة');
for (const n of nodes) {
  if (n.id === nodeIdOf(firstRung.id)) break;
  p.setStars(n.id, 3);
}
ok(p.isNodeUnlockedById(nodeIdOf(firstRung.id)) && p.nextNode().id === nodeIdOf(firstRung.id),
  'وأول درجة تُفتح بإتمام باقات بستانها كلها (بند الحزمة)');
ok(!p.isNodeUnlockedById(nodeIdOf(RUNGS[1].id)), 'والدرجة الثانية تنتظر التي قبلها');

// ————— ٣. لا كلمة خارج المدروس — بمقياس ترتيب الرحلة نفسه —————

const data = JSON.parse(readFileSync(new URL('../app/data/lexicon.json', import.meta.url), 'utf8'));
// المطابقة بالجذع كما في `tools/check_lexicon.py`: المفردة المعلَنة موقوفةً («صَغِيرْ»)
// تغطّي صورَها في الجملة («الصَّغِيرَةُ»)، فالمعلَن معجمُ أصولٍ لا جدولُ صرف.
const support = new Map((data.support || []).map((t) => [stemOf(t), t]));
const curriculum = new Set([
  ...GROUPS.flatMap((g) => g.words).map((w) => bareLetters(w.tiles.join(''))),
  ...SKILLS.flatMap(skillExamples).map((w) => bareLetters(w.say)),
  ...QURAN.words.items.map((w) => bareLetters(w.read)),
  ...QURAN.letters.signs.flatMap((s) => s.words.map((w) => bareLetters(w.read))),
]);

/** كلمات المعجم التي أتمّ الطفل باقاتها قبل هذه العقدة — حصيلتُه الحقيقية عندها. */
function stemsBefore(nodeId) {
  const out = new Set();
  for (const node of nodes) {
    if (node.id === nodeId) return out;
    if (node.type === 'garden') for (const w of node.bundle.words) out.add(stemOf(w.word));
  }
  return out;
}

let checkedWords = 0;
let usedSupport = new Set();
for (const rung of RUNGS) {
  const known = stemsBefore(nodeIdOf(rung.id));
  for (const sentence of rung.sentences) {
    for (const word of sentence.words) {
      checkedWords++;
      const stem = stemOf(word);
      if (known.has(stem)) continue;
      if (curriculum.has(bareLetters(stem)) || curriculum.has(bareLetters(word))) continue;
      if (support.has(stem)) { usedSupport.add(support.get(stem)); continue; }
      bad(`[${rung.id}] «${word}» في «${sentence.text}» خارج حصيلة الطفل عند هذه الدرجة`);
    }
  }
}
ok(true, `لا كلمة خارج المدروس في السلّم كله (${checkedWords} كلمة مفحوصة بترتيب الرحلة)`);
ok(usedSupport.size === support.size && support.size > 0,
  `والمعجم المساند المعلَن مستعمَل كلُّه (${usedSupport.size}/${support.size} مفردة)`);
ok(support.size === (data.support || []).length,
  'ولا مفردتان مساندتان بجذعٍ واحد (وإلا غطّت إحداهما الأخرى فبقيت ميتةً بلا كشف)');

const deferred = SENTENCES.filter((s) => s.rung.garden.id !== s.target.theme);
ok(deferred.length > 0 && deferred.every((s) => {
  const known = stemsBefore(nodeIdOf(s.rung.id));
  return s.words.every((w) => !GARDENS.some((g) => g.words.some((x) => stemOf(x.word) === stemOf(w)))
    || known.has(stemOf(w)));
}), `وجملةٌ تستعمل كلمةً من بستان لاحق أُجِّلت إلى درجاته (${deferred.length} جملة)`);

// ————— ٤. التدرّج: كلمتان ← ثلاث ← أربع فخمس (بند الحزمة ٩أ) —————

const lens = (rung) => rung.sentences.map((s) => s.words.length);
const rising = LADDERS.filter((l) => l.rungs.every((r, i) => !i
  || Math.max(...lens(r)) >= Math.max(...lens(l.rungs[i - 1]))));
ok(rising.length === LADDERS.length,
  `طولُ الجملة لا يقصر كلما صعد الطفل درجةً — في البساتين العشرة كلها `
  + `(${LADDERS[0].rungs.map((r) => `${Math.min(...lens(r))}–${Math.max(...lens(r))}`).join(' ← ')} في ${LADDERS[0].id})`);

const graded = LADDERS.filter((l) => l.rungs.some((r) => lens(r).every((n) => n === 2))
  && l.rungs.some((r) => lens(r).some((n) => n === 3))
  && l.rungs.some((r) => lens(r).every((n) => n >= 4)));
ok(graded.length === LADDERS.length,
  `ولكل بستان درجاتُ الكلمتين ثم الثلاث ثم الأربع فأكثر (${graded.length}/${LADDERS.length} بستان)`);
ok(LADDERS.every((l) => l.rungs[0].sentences.every((s) => s.words.length === 2))
  && LADDERS.every((l) => l.rungs.at(-1).sentences.some((s) => s.words.length >= 5)),
  'وأولى درجاته كلمتان، وآخرتها تبلغ الخمس');
ok(SENTENCES.filter((s) => s.words.length >= 4).length >= GRADED.length / 2
  && SENTENCES.every((s) => s.words.length >= 2 && s.words.length <= 5),
  `والمادّة كلها بين كلمتين وخمس (${[2, 3, 4, 5].map((n) => `${n}: ${SENTENCES.filter((s) => s.words.length === n).length}`).join('، ')})`);

// ————— ٥. الميكانيكيات الثلاث بالتناوب —————

ok(SENTENCES.every((s) => s.mechanic !== 'order' || s.words.length <= ORDER_MAX_WORDS),
  `«رتّب الجملة» لا تتجاوز ${ORDER_MAX_WORDS} كلمات (ستُّ بلاطاتٍ تُرهق طفل السادسة)`);
ok(RUNGS.every((r) => r.sentences.every((s, i) => i === 0 || r.sentences[i - 1].mechanic !== s.mechanic)),
  'ولا تتجاور جملتان بميكانيكية واحدة');
const cycle = RUNGS.every((r) => r.sentences.every((s, i) => i === 0
  || s.words.length > ORDER_MAX_WORDS || r.sentences[i - 1].words.length > ORDER_MAX_WORDS
  || MECHANICS[(MECHANICS.indexOf(r.sentences[i - 1].mechanic) + 1) % 3] === s.mechanic));
ok(cycle, 'والدورة الثلاثية قائمةٌ حيث تصلح الثلاث (والطويلة تتخطّى «رتّب» وحدها)');
const counts = Object.fromEntries(MECHANICS.map((m) => [m, SENTENCES.filter((s) => s.mechanic === m).length]));
ok(MECHANICS.every((m) => counts[m] >= SENTENCES.length / 4),
  `والثلاث متوازنة في السلّم: لا واحدة دون ربع الجمل `
  + `(${MECHANICS.map((m) => `${m}: ${counts[m]}`).join('، ')})`);
ok(RUNGS.slice(0, 3).map((r) => r.sentences[0].mechanic).join('|') === MECHANICS.join('|'),
  'وكل درجة تبدأ بغير ما بدأت به التي قبلها (لا رتابة)');

// ————— ٥. سلامة كل جولة: خيارات وألواح في كل جملة —————

let rounds = 0;
let boards = 0;
for (const sentence of SENTENCES) {
  const garden = sentence.rung.garden;
  const pool = orderPool(garden);
  for (let seed = 1; seed <= 4; seed++) {
    const rnd = rng(seed * 13 + sentence.words.length + sentence.id.length);

    for (const byGender of [false, true]) {
      const options = pickOptions(sentence, rnd, byGender);
      rounds++;
      if (options.length !== 3) bad(`[${sentence.id}] خيارات ≠ ٣`);
      if (!options.includes(sentence.target)) bad(`[${sentence.id}] الهدف ليس بين الخيارات`);
      if (new Set(options).size !== 3) bad(`[${sentence.id}] خيار مكرَّر`);
      if (new Set(options.map((w) => w.emoji)).size !== 3) bad(`[${sentence.id}] صورتان متشابهتان`);
      const strangers = options.filter((w) => w !== sentence.target && !garden.words.includes(w));
      if (strangers.length) bad(`[${sentence.id}] خيار من خارج البستان`);
    }

    if (sentence.mechanic !== 'order') continue;
    const board = buildBoard({ tiles: sentence.words }, pool, rnd);
    boards++;
    const texts = board.map((t) => t.text);
    if (sentence.words.some((w) => !texts.includes(w))) bad(`[${sentence.id}] كلمة ناقصة من اللوح`);
    if (board.some((t) => t.distractor && sentence.words.includes(t.text))) {
      bad(`[${sentence.id}] مشتّت يطابق كلمةً من الجملة`);
    }
    if (texts.some((t) => !pool.includes(t))) bad(`[${sentence.id}] كلمة من خارج جمل البستان`);
    if (board.length <= sentence.words.length) bad(`[${sentence.id}] لوح بلا مشتّت`);
    if (sentence.words.every((w, i) => texts[i] === w)) bad(`[${sentence.id}] اللوح جاهز مرتَّباً`);
  }
}
ok(true, `خياراتٌ وألواحٌ سليمة في كل الجمل (${rounds} جولة اختيار، ${boards} لوح ترتيب)`);
ok(starsForGame(0, 9) === 3 && starsForGame(9, 9) === 2 && starsForGame(10, 9) === 1,
  'ونجوم الدرجة بعتبة «زلّة لكل جملة» (كالباقة واللعبة)');

// ————— ٦. القياس موصول: مهارة «رتّب» تجد تمرينها في المراجعة —————

const orderSentences = SENTENCES.filter((s) => s.mechanic === 'order');
const noSkill = orderSentences.flatMap((s) => s.words.filter((w) => !wordSkill(w)));
ok(noSkill.length === 0,
  `لكل كلمةٍ تُرتَّب مهارةٌ تُسجَّل (حرف متحرّك × حركته) — `
  + `${new Set(orderSentences.flatMap((s) => s.words)).size} كلمة فريدة`);
ok(wordSkill('الْغُرْفَةُ').letter === 'غ' && wordSkill('الرَّجُلُ').letter === 'ر',
  'والمهارة تتخطّى لام التعريف إلى أول حرف متحرّك (الْغُرْفَةُ ← غ)');

for (const n of nodes) p.setStars(n.id, 3);
const letters = p.studiedLetters();
const words = p.studiedWords(letters);
const studied = p.studiedSentences().filter((s) => s.mechanic === 'order');
ok(studied.length === orderSentences.length,
  `وجمل الدرجات المُنجَزة تدخل حصيلة المراجعة (${studied.length} جملة)`);

const orderKeys = [...new Set(orderSentences.flatMap((s) => s.words).map((w) => {
  const k = wordSkill(w);
  return `${k.letter}|${k.haraka}`;
}))];
let reviewed = 0;
const heardTexts = new Set();
for (const key of orderKeys.slice(0, 12)) {
  const [letter, haraka] = key.split('|');
  const due = [{ key: `${key}|order`, letter, haraka, kind: p.KINDS.ORDER, right: 0, wrong: 2, box: 0, due: 0, seen: 0 }];
  const items = buildSession({ letters, words, sentences: studied, due, rnd: rng(key.length + 5) });
  const item = items.find((i) => i.kind === p.KINDS.ORDER);
  if (!item) { bad(`مهارة «${letter}|${haraka}» مستحقّة بلا تمرين في المراجعة`); continue; }
  if (!item.sentence.words.some((w) => `${wordSkill(w).letter}|${wordSkill(w).haraka}` === key)) {
    bad(`تمرين المراجعة لا يحوي المهارة «${key}»`);
  }
  if (items.filter((i) => i.kind === p.KINDS.ORDER).length > MAX_ORDER) {
    bad('أكثر من تمرين ترتيبٍ واحد في جلسة واحدة (تمرين طويل)');
  }
  reviewed++;
  for (const t of items.flatMap(itemTexts)) heardTexts.add(t);
}
ok(reviewed === Math.min(12, orderKeys.length),
  `ومهارةُ الترتيب تجد تمرينها في مراجعة اليوم (${reviewed} مهارة مجرَّبة)`);
ok(Object.values(p.KINDS).every((kind) => kind !== p.KINDS.ORDER || reviewed > 0),
  'فلا نوعَ تمرينٍ يُقاس بلا تمرينٍ يراجعه (وإلا بقيت مهاراته في صندوق ليتنر الأول)');

// ————— ٧. الصوت: منطوقٌ مُصرَّف أو منتظِر، ولا شيء خارج الحسبان —————

const manifest = JSON.parse(readFileSync(new URL('../app/audio/manifest.json', import.meta.url), 'utf8'));
const queue = JSON.parse(readFileSync(new URL('audio_queue.json', import.meta.url), 'utf8'));
const have = new Set(Object.values(manifest));
const pending = new Set(queue.filter((e) => e.status !== 'done').map((e) => e.text));
const voiced = (t) => have.has(t) || pending.has(t);

const texts = ladderTexts();
const orphan = texts.filter((t) => !voiced(t));
ok(orphan.length === 0,
  `نصوص السلّم كلها محسوبة (${texts.length} نصاً: ${texts.filter((t) => have.has(t)).length} جاهز، `
  + `${texts.filter((t) => pending.has(t) && !have.has(t)).length} منتظِر)`
  + `${orphan.length ? ' — بلا حساب: ' + orphan.slice(0, 6).join('، ') : ''}`);
ok(texts.length === new Set(texts).size, 'ولا تكرار في قائمة نصوصه');

// ما تنطقه الشاشة فعلاً: الجملة في كل ميكانيكية، وكلماتُها في «رتّب» وحدها،
// وكلمات المعجم المفردة في خطأ الاختيار (لها أصواتها من الحزمة ٧).
const screenTexts = new Set(SENTENCES.flatMap((s) => [
  s.text,
  s.target.say,
  ...(s.mechanic === 'order' ? s.words : []),
  ...s.rung.garden.words.map((w) => w.say),
]));
const silent = [...screenTexts].filter((t) => !voiced(t));
ok(silent.length === 0,
  `وكل ما تنطقه شاشات السلّم له ملف أو مكان في القائمة (${screenTexts.size} نصاً)`
  + `${silent.length ? ' — ' + silent.slice(0, 6).join('، ') : ''}`);
const silentInReview = [...heardTexts].filter((t) => !voiced(t));
ok(silentInReview.length === 0,
  `وكذلك ما تنطقه مراجعتُه (${heardTexts.size} نصاً)`
  + `${silentInReview.length ? ' — ' + silentInReview.slice(0, 6).join('، ') : ''}`);

console.log(fails ? `\n${fails} فشل` : '\nكل اختبارات سلّم الجمل ناجحة');
process.exit(fails ? 1 : 0);
