// «سلّم الجمل» — طبقة البيانات (الحزمة ٨ · ROADMAP §المرحلة ج).
//
// **المادّة مدّخرة من الحزمة ٧ ولا تُؤلَّف هنا**: لكل كلمة من كلمات المعجم جملةُ مثالٍ
// مشكولةٌ مفحوصةُ المفكوكية في `app/data/lexicon.json`، كُتبت هناك ولم تُعرض ولا تُنطق
// (قرار الحزمة ٧ الخامس: موضعها «سلّم الجمل»). هذا الملف يرتّبها سلّماً لا أكثر:
// درجاتٍ بعد كل بستان، ولكل جملةٍ ميكانيكيتُها بالتناوب.
//
// **قاعدة موضع الجملة** (امتداد قاعدة الجلسة ٤ في مواضع دروس المهارات): الجملة تظهر
// في أوّل موضعٍ تكون فيه كلماتها كلها مدروسة. فجملةٌ من بستان «البيت» تستعمل كلمةً من
// بستان الألوان (الأخير) تُؤجَّل إلى درجاته — «لا جملة تعرض كلمة خارج المدروس» مفروضةً
// بالبنية نفسها لا بالوعد، ويحرسها `tools/check_lexicon.py` و`tools/test_sentences.mjs`.
//
// **الميكانيكية بالتناوب لا بالعشوائية**: ثابتةٌ لكل جملة (دالّة موضعها في السلّم)،
// فيُعرف سلفاً أيُّ نصٍّ سيُنطق — وعليه تُبنى قائمة الانتظار الصوتية بلا تخمين.

import { bareLetters } from './curriculum.js';
import { GARDENS, WORDS } from './lexicon.js';

/** أكثر ما تحمله الدرجة الواحدة من جمل — حلقةٌ في دقائق كالباقة (٢٥ جملة تُرهق طفلاً). */
export const RUNG_MAX = 9;

/** الميكانيكيات الثلاث بترتيب تناوبها (بند الحزمة ٨). */
export const MECHANICS = ['read', 'order', 'fill'];

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

/** موضع الجملة: أبعدُ بستانٍ تنتمي إليه كلمةٌ من كلماتها (وبستانُها أدناه). */
function placeOf(entry) {
  let place = gardenIndex.get(entry.theme) ?? 0;
  for (const token of sentenceWords(entry.sentence)) {
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
function blankIndex(entry, words) {
  const stem = stemOf(entry.word);
  const exact = words.findIndex((w) => stemOf(w) === stem);
  return exact >= 0 ? exact : words.findIndex((w) => stemOf(w).startsWith(stem));
}

const byPlace = GARDENS.map(() => []);
for (const entry of WORDS) byPlace[placeOf(entry)]?.push(entry);

let serial = 0;   // ترتيب الدرجة في السلّم كله — به تدور الميكانيكيات فلا تبدأ الدرجات كلها بواحدة

/**
 * السلالم: سلّمٌ لكل بستان، ودرجاته عقدٌ على الخريطة بعد باقاته.
 * كل درجة: جملٌ لكل واحدة ميكانيكيتها ({read, order, fill} بالتناوب).
 */
export const LADDERS = GARDENS.map((garden, index) => {
  const ladder = { id: garden.id, garden, rungs: [] };
  ladder.rungs = chunk(byPlace[index], RUNG_MAX).map((slice, i) => {
    const rung = { id: `${garden.id}:${i + 1}`, index: i + 1, garden, ladder, sentences: [] };
    const start = serial++;
    rung.sentences = slice.map((entry, k) => {
      const words = sentenceWords(entry.sentence);
      return {
        id: entry.word,
        rung,
        target: entry,
        text: entry.sentence,
        words,
        blank: blankIndex(entry, words),
        mechanic: MECHANICS[(start + k) % MECHANICS.length],
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
