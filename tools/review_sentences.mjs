// ورقة مراجعة المدير للجمل المؤلَّفة (الحزمة ٩أ) — ثالثةُ خطّ الإنتاج:
//   تأليف مقيَّد (make_sentences.py) ← فاحص آليّ (check_lexicon.py) ← **عينُ المدير**
//
// الفاحص يحكم في الحرف والمفردة والموضع، ولا يحكم في المعنى ولا في المطابقة —
// فهذه الورقة تعرض المادّة **بترتيب لقاء الطفل بها** (بستاناً فدرجةً فجملة) ومعها
// ميكانيكيّتُها وهدفُها، ليُقرأ كلٌّ في سياقه الذي سيراه فيه الطفل لا في قائمة مجرّدة.
//
//   node tools/review_sentences.mjs [docs/REVIEW_9A.md]

import { readFileSync, writeFileSync } from 'node:fs';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const ROOT = new URL('../', import.meta.url);
const { GARDENS } = await import(new URL('app/js/lexicon.js', ROOT));
const { LADDERS, MECHANIC_TITLES, ORDER_MAX_WORDS } = await import(new URL('app/js/sentences.js', ROOT));

const data = JSON.parse(readFileSync(new URL('app/data/lexicon.json', ROOT), 'utf8'));
const graded = new Set((data.sentences || []).map((s) => s.text));
const arNum = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
const countOf = (n) => arNum(n);

const all = LADDERS.flatMap((l) => l.rungs.flatMap((r) => r.sentences));
const mine = all.filter((s) => graded.has(s.text));
const byLen = (list, n) => list.filter((s) => s.words.length === n).length;

const lines = [];
const P = (s = '') => lines.push(s);

P('# ورقة مراجعة: «الجمل المتدرجة» — الحزمة ٩أ');
P();
P('> **المطلوب من المدير**: قراءةُ المعنى والمطابقة والذوق. أمّا الحرفُ والمفردةُ والموضع');
P('> فقد حكم فيها الفاحص آلياً: كل كلمة مشكولة بالكامل، ومن معجم البساتين أو كلمات المنهج');
P('> أو المعجم المساند المعلَن، ولا جملةَ تُعرض قبل أن تكتمل كلماتُها في حصيلة الطفل.');
P('>');
P('> التوليد: `python3 tools/make_sentences.py` — والنصّ **مشتقّ** من كلمات أساسٍ معلَنة');
P('> بأدوارٍ إعرابية، فلا شكلَ مكتوباً بيد. وإعادةُ توليده تعطي الملفَّ نفسه (`--check`).');
P();
P(`**المؤلَّف**: ${countOf(mine.length)} جملة — `
  + `${countOf(byLen(mine, 3))} من ثلاث كلمات، ${countOf(byLen(mine, 4))} من أربع، ${countOf(byLen(mine, 5))} من خمس.`);
P();
P(`**السلّم بعدها**: ${countOf(all.length)} جملة في `
  + `${countOf(LADDERS.reduce((n, l) => n + l.rungs.length, 0))} درجة — `
  + `${countOf(byLen(all, 2))} من كلمتين، ${countOf(byLen(all, 3))} من ثلاث، `
  + `${countOf(byLen(all, 4))} من أربع، ${countOf(byLen(all, 5))} من خمس.`);
P();
P(`**زيادةُ المعجم المساند**: ${countOf(data.support.length)} مفردة معلَنة الآن (كانت ١٣٠).`);
P();
P(`**الميكانيكية**: موضعٌ في السلّم لا اختيارَ مؤلِّف. و«رتّب الجملة» لا تتجاوز `
  + `${countOf(ORDER_MAX_WORDS)} كلمات — الطويلةُ تدور بين «اقرأ ونفّذ» و«أكمل الجملة».`);
P();
P('---');
P();

for (const ladder of LADDERS) {
  const rungs = ladder.rungs.filter((r) => r.sentences.some((s) => graded.has(s.text)));
  if (!rungs.length) continue;
  P(`## ${ladder.garden.emoji} ${ladder.garden.title}`);
  P();
  for (const rung of ladder.rungs) {
    const fresh = rung.sentences.filter((s) => graded.has(s.text));
    if (!fresh.length) continue;
    const lens = [...new Set(rung.sentences.map((s) => s.words.length))].sort();
    P(`### الدرجة ${arNum(rung.index)} — ${countOf(rung.sentences.length)} جمل `
      + `(${lens.map(arNum).join('/')} كلمات)`);
    P();
    P('| # | الجملة | الميكانيكية | الهدف |');
    P('|---|---|---|---|');
    for (const s of rung.sentences) {
      const mark = graded.has(s.text) ? '' : ' _(الحزمة ٧)_';
      P(`| ${arNum(rung.sentences.indexOf(s) + 1)} | ${s.text}${mark} `
        + `| ${MECHANIC_TITLES[s.mechanic]} | ${s.target.emoji} ${s.target.word} |`);
    }
    P();
  }
}

const path = process.argv[2] || 'docs/REVIEW_9A.md';
writeFileSync(new URL(path, ROOT), `${lines.join('\n')}\n`, 'utf8');
console.log(`ورقة المراجعة: ${path} — ${mine.length} جملة مؤلَّفة في `
  + `${LADDERS.reduce((n, l) => n + l.rungs.filter((r) => r.sentences.some((s) => graded.has(s.text))).length, 0)} درجة`);
