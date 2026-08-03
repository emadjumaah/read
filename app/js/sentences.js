// «سلّم الجمل» — طبقة البيانات (الحزم ٨ و٩أ · ROADMAP §المرحلة ج).
//
// **المادّة كلها في `app/data/lexicon.json` ولا تُؤلَّف هنا**، وهي مصدران:
//   ١) جملةُ مثالٍ لكل كلمة معجم (الحزمة ٧) — **كلمتان**، مدّخرةٌ مفحوصة؛
//   ٢) **الجمل المتدرّجة** (الحزمة ٩أ) — ٣–٥ كلمات، تُؤلَّف بمولّد مقيَّد
//      (`tools/make_sentences.py`) لا بيد، ويرفض `check_lexicon.py` ما خالف العقد.
// هذا الملف يرتّبهما سلّماً لا أكثر: درجاتٍ بعد كل بستان، ولكل جملةٍ ميكانيكيتُها.
//
// **التدرّج داخل السلّم** (بند الحزمة ٩أ): جمل البستان تُرتَّب بالطول قبل تقسيمها
// درجاتٍ — فالدرجات الأولى كلمتان، ثم ثلاث، ثم أربع وخمس. والترتيب **ثابتٌ** (فرزٌ
// مستقرّ على الطول وحده)، فموضع كل جملة معروفٌ سلفاً كما تعرفه قائمة الصوت.
//
// **قاعدة موضع الجملة** (امتداد قاعدة الجلسة ٤ في مواضع دروس المهارات): الجملة تظهر
// في أوّل موضعٍ تكون فيه كلماتها كلها مدروسة. فجملةٌ من بستان «البيت» تستعمل كلمةً من
// بستان الألوان (الأخير) تُؤجَّل إلى درجاته — «لا جملة تعرض كلمة خارج المدروس» مفروضةً
// بالبنية نفسها لا بالوعد، ويحرسها `tools/check_lexicon.py` و`tools/test_sentences.mjs`.
//
// **الميكانيكية بالتناوب لا بالعشوائية**: ثابتةٌ لكل جملة (دالّة موضعها في السلّم)،
// فيُعرف سلفاً أيُّ نصٍّ سيُنطق — وعليه تُبنى قائمة الانتظار الصوتية بلا تخمين.

import { bareLetters } from './curriculum.js';
import { GARDENS, GRADED, WORDS } from './lexicon.js';

/** أكثر ما تحمله الدرجة الواحدة من جمل — حلقةٌ في دقائق كالباقة (٢٥ جملة تُرهق طفلاً). */
export const RUNG_MAX = 9;

/** الميكانيكيات الثلاث بترتيب تناوبها (بند الحزمة ٨). */
export const MECHANICS = ['read', 'order', 'fill'];

/**
 * أطولُ جملةٍ تُعطى ميكانيكية «رتّب» (الحزمة ٩أ): الترتيب يُقرأ كلمةً كلمة ثم تُوضع،
 * وجملةُ خمسِ كلماتٍ تصير ستَّ بلاطاتٍ أو سبعاً — نشاطٌ يُرهق طفل السادسة ويُطيل
 * الدرجة. فالطويلة تدور بين «اقرأ ونفّذ» و«أكمل الجملة»، وهما عين ما تُحسنه:
 * سياقٌ أطول ⇒ جوابٌ **مقروءٌ** لا مخمَّن (وهي علّة تأليف هذه المادة أصلاً).
 */
export const ORDER_MAX_WORDS = 3;

export const MECHANIC_TITLES = {
  read: 'اقرأ ونفّذ',
  order: 'رتّب الجملة',
  fill: 'أكمل الجملة',
};

const SHADDA = 'ّ';
const AL = /^اْ?لْ?(.+)$/;   // «الْ» التعريف — والشمسية بلا سكون على لامها
const TAIL = /[ً-ِْ]+$/;                // علامة الإعراب الأخيرة وحدها (الشدّة ليست منها)

/**
 * جذع الكلمة للمطابقة: بلا «ال» ولا شدّة الشمسية ولا علامة إعرابها.
 * «الْغُرْفَةُ» و«غُرْفَةْ» جذعُهما واحد، و«الرَّجُلُ» ← «رَجُل» لا يطابق «رِجْل»
 * — فالمطابقة على الحروف **بحركاتها** لا على الرسم المجرّد.
 */
export function stemOf(text) {
  let out = String(text ?? '');
  const rest = AL.exec(out);
  if (rest && bareLetters(rest[1]).length >= 2) {   // «ال» تعريفٍ لا أوّلَ كلمة
    out = rest[1];
    out = out[0] + out.slice(1, 3).replace(SHADDA, '') + out.slice(3);
  }
  return out.replace(TAIL, '');
}

/** كلمات الجملة كما تُعرض وتُنطق — لا مصدر ثانٍ لها (الفراغ يفصلها). */
export const sentenceWords = (text) => String(text ?? '').split(/\s+/).filter(Boolean);

// ————— بناء السلّم —————

const gardenIndex = new Map(GARDENS.map((garden, i) => [garden.id, i]));

const stemGarden = new Map();
for (const word of WORDS) {
  const stem = stemOf(word.word);
  if (!stemGarden.has(stem)) stemGarden.set(stem, gardenIndex.get(word.theme) ?? 0);
}

/**
 * مادّة السلّم موحَّدةً من مصدريها: جملةُ كلِّ كلمةٍ (كلمتان) ثم الجملُ المتدرّجة
 * (٣–٥). لكلٍّ نصُّها وهدفُها — والهدف صورةُ الجملة وفراغُ «أكمل الجملة».
 */
// المعرّف بنيويّ لا نصّي: نصّان في الحزمة ٧ متطابقان («الْمَوْزُ أَصْفَرْ» جملةُ
// «مَوْزْ» و«أَصْفَرْ» معاً)، فالنصّ لا يصلح معرّفاً — والفاحص ينبّه عليهما.
const MATERIAL = [
  ...WORDS.map((word) => ({ id: word.word, text: word.sentence, target: word })),
  ...GRADED.map((entry, i) => ({ id: `graded:${i + 1}`, ...entry })),
].filter((item) => item.text && item.target);

/** موضع الجملة: أبعدُ بستانٍ تنتمي إليه كلمةٌ من كلماتها (وبستانُ هدفها أدناه). */
function placeOf(item) {
  let place = gardenIndex.get(item.target.theme) ?? 0;
  for (const token of sentenceWords(item.text)) {
    const garden = stemGarden.get(stemOf(token));
    if (garden !== undefined && garden > place) place = garden;
  }
  return place;
}

/** تقسيمٌ متوازن إلى قطعٍ لا تتجاوز `max` (٢٢ جملة ← ٨+٧+٧ لا ٩+٩+٤). */
function chunk(list, max) {
  const parts = Math.max(1, Math.ceil(list.length / max));
  const out = [];
  for (let i = 0, start = 0; i < parts; i++) {
    const size = Math.floor(list.length / parts) + (i < list.length % parts ? 1 : 0);
    out.push(list.slice(start, start + size));
    start += size;
  }
  return out;
}

/**
 * موضع الكلمة المصوَّرة في جملتها — هي فراغ «أكمل الجملة» وصاحبة صورتها.
 * تُطابَق بجذعها، وإلا فبما بُني عليه («أُخْتْ» ← «أُخْتِي» بياء الإضافة).
 */
function blankIndex(target, words) {
  const stem = stemOf(target.word);
  const exact = words.findIndex((w) => stemOf(w) === stem);
  return exact >= 0 ? exact : words.findIndex((w) => stemOf(w).startsWith(stem));
}

// جمل كل بستان مرتَّبةً **بالطول** — به يتدرّج سلّمه: كلمتان ← ثلاث ← أربع فخمس.
// الفرز مستقرّ، فالمتساويات تبقى بترتيب مصدرها (لا عشوائية في موضع جملة).
const byPlace = GARDENS.map(() => []);
for (const item of MATERIAL) byPlace[placeOf(item)]?.push(item);
for (const list of byPlace) list.sort((a, b) => sentenceWords(a.text).length - sentenceWords(b.text).length);

let serial = 0;   // ترتيب الدرجة في السلّم كله — به تدور الميكانيكيات فلا تبدأ الدرجات كلها بواحدة

/**
 * السلالم: سلّمٌ لكل بستان، ودرجاته عقدٌ على الخريطة بعد باقاته.
 * كل درجة: جملٌ لكل واحدة ميكانيكيتها ({read, order, fill} بالتناوب) — والدورة
 * **تتخطّى «رتّب» في الجملة الطويلة** (≥٤ كلمات) فتبقى دورةَ اثنتين هناك. وبهذا
 * لا تتجاور جملتان بميكانيكية واحدة أبداً: العدّاد يتقدّم عند كل جملة.
 */
export const LADDERS = GARDENS.map((garden, index) => {
  const ladder = { id: garden.id, garden, rungs: [] };
  ladder.rungs = chunk(byPlace[index], RUNG_MAX).map((slice, i) => {
    const rung = { id: `${garden.id}:${i + 1}`, index: i + 1, garden, ladder, sentences: [] };
    let turn = serial++;
    rung.sentences = slice.map((item) => {
      const words = sentenceWords(item.text);
      while (MECHANICS[turn % MECHANICS.length] === 'order' && words.length > ORDER_MAX_WORDS) turn++;
      return {
        id: item.id,
        rung,
        target: item.target,
        text: item.text,
        words,
        blank: blankIndex(item.target, words),
        mechanic: MECHANICS[turn++ % MECHANICS.length],
      };
    });
    return rung;
  });
  return ladder;
});

export const RUNGS = LADDERS.flatMap((ladder) => ladder.rungs);
export const SENTENCES = RUNGS.flatMap((rung) => rung.sentences);

export const ladderOf = (gardenId) => LADDERS.find((l) => l.id === gardenId) || null;
export const rungById = (id) => RUNGS.find((r) => r.id === id) || null;

/**
 * كلمات «رتّب الجملة» في بستانٍ واحد — منها تُؤخذ بلاطات اللوح ومشتّتاته
 * (كما تُؤخذ مقاطع «ركّب الكلمة» من مقاطع البستان). كلها منطوقة بالضرورة:
 * جملُ «رتّب» وحدها هي التي تدخل كلماتُها قائمةَ الصوت.
 */
export function orderPool(garden) {
  const words = (ladderOf(garden.id)?.rungs || [])
    .flatMap((rung) => rung.sentences)
    .filter((s) => s.mechanic === 'order')
    .flatMap((s) => s.words);
  return [...new Set(words)];
}

/**
 * كل ما ينطقه السلّم، بترتيب لقاء الطفل به (وهو ترتيب تصريف قائمة الانتظار):
 * الجملة كاملةً في كل ميكانيكية، وكلماتُها مفردةً في «رتّب» وحدها — فما سواها
 * لا يُنقر فيه على كلمة (الخيارات صورٌ أو كلمات المعجم المفردة ولها أصواتها).
 */
export function ladderTexts() {
  const out = [];
  for (const rung of RUNGS) {
    for (const sentence of rung.sentences) {
      out.push(sentence.text);
      if (sentence.mechanic === 'order') out.push(...sentence.words);
    }
  }
  return [...new Set(out)];
}
