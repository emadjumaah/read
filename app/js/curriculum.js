// المنهج: قاعدة نورانية مطوَّعة — ترتيب الحروف حسب التواتر وسهولة النطق والتمايز البصري،
// وكلمات من عالم الطفل مشتركة بين الفصحى واللهجات (مراعاة الازدواجية اللغوية).

export const HARAKAT = [
  { key: 'fatha', name: 'فَتحة', mark: 'َ' },
  { key: 'kasra', name: 'كَسرة', mark: 'ِ' },
  { key: 'damma', name: 'ضَمّة', mark: 'ُ' },
];

const TATWEEL = 'ـ';

// joins: هل يتصل الحرف بما بعده؟
export const LETTERS = {
  'ا': { name: 'أَلِف', joins: false },
  'ب': { name: 'باء', joins: true },
  'م': { name: 'ميم', joins: true },
  'ل': { name: 'لام', joins: true },
  'ن': { name: 'نون', joins: true },
  'ر': { name: 'راء', joins: false },
  'د': { name: 'دال', joins: false },
  'س': { name: 'سين', joins: true },
  'ت': { name: 'تاء', joins: true },
  'و': { name: 'واو', joins: false },
  'ي': { name: 'ياء', joins: true },
  'ه': { name: 'هاء', joins: true },
  'ع': { name: 'عَين', joins: true },
  'ف': { name: 'فاء', joins: true },
  'ك': { name: 'كاف', joins: true },
  'ق': { name: 'قاف', joins: true },
  'ح': { name: 'حاء', joins: true },
  'ج': { name: 'جيم', joins: true },
  'خ': { name: 'خاء', joins: true },
  'ش': { name: 'شين', joins: true },
  'ص': { name: 'صاد', joins: true },
  'ز': { name: 'زاي', joins: false },
  'ط': { name: 'طاء', joins: true },
  'ث': { name: 'ثاء', joins: true },
  'ذ': { name: 'ذال', joins: false },
  'ض': { name: 'ضاد', joins: true },
  'ظ': { name: 'ظاء', joins: true },
  'غ': { name: 'غَين', joins: true },
};

// أشكال الحرف حسب موضعه (باستخدام التطويل لعرض الشكل المتصل)
export function letterForms(ch) {
  const info = LETTERS[ch];
  if (!info) return { isolated: ch, initial: ch, medial: ch, final: ch };
  if (!info.joins) {
    return { isolated: ch, initial: ch, medial: TATWEEL + ch, final: TATWEEL + ch };
  }
  return {
    isolated: ch,
    initial: ch + TATWEEL,
    medial: TATWEEL + ch + TATWEEL,
    final: TATWEEL + ch,
  };
}

// المجموعات: تراكمية — كلمات كل مجموعة لا تستعمل إلا حروفاً مدروسة (كلمات مفكوكة ١٠٠٪).
// tiles: مقاطع التهجّي (طريقة القاعدة النورانية في التركيب) — مشكولة بالكامل،
//        وتركيبها بالترتيب يعطي الكلمة كما تُعرض للطفل («بَا» + «بْ» = «بَابْ»).
// say:   نصّ الكلمة كما تُنطق كاملةً (بلا شكل — مفتاح ملف الصوت).
// يفحص tools/check_decodable.py هذين الشرطين آلياً قبل أي اعتماد.
export const GROUPS = [
  {
    id: 'g1',
    title: 'المجموعة الأولى',
    letters: ['ا', 'ب', 'م', 'ل'],
    words: [
      { tiles: ['بَا', 'بَا'], say: 'بابا', emoji: '👨' },
      { tiles: ['مَا', 'مَا'], say: 'ماما', emoji: '👩' },
      { tiles: ['بَا', 'بْ'], say: 'باب', emoji: '🚪' },
      { tiles: ['مَا', 'لْ'], say: 'مال', emoji: '💰' },
    ],
  },
  {
    id: 'g2',
    title: 'المجموعة الثانية',
    letters: ['ن', 'ر', 'د', 'س'],
    words: [
      { tiles: ['نَا', 'رْ'], say: 'نار', emoji: '🔥' },
      { tiles: ['دَا', 'رْ'], say: 'دار', emoji: '🏠' },
      { tiles: ['نَا', 'مْ'], say: 'نام', emoji: '😴' },
      { tiles: ['سَ', 'لَا', 'مْ'], say: 'سلام', emoji: '👋' },
      { tiles: ['دَ', 'رَ', 'سْ'], say: 'درس', emoji: '📖' },
    ],
  },
  {
    id: 'g3',
    title: 'المجموعة الثالثة',
    letters: ['ت', 'و', 'ي', 'ه'],
    words: [
      { tiles: ['بَيْ', 'تْ'], say: 'بيت', emoji: '🏡' },
      { tiles: ['تُو', 'تْ'], say: 'توت', emoji: '🫐' },
      { tiles: ['يَ', 'دْ'], say: 'يد', emoji: '✋' },
      { tiles: ['وَ', 'لَ', 'دْ'], say: 'ولد', emoji: '👦' },
      { tiles: ['تِي', 'نْ'], say: 'تين', emoji: '🍈' },
      { tiles: ['تَ', 'مْ', 'رْ'], say: 'تمر', emoji: '🌴' },
      { tiles: ['هِ', 'لَا', 'لْ'], say: 'هلال', emoji: '🌙' },
    ],
  },
  {
    id: 'g4',
    title: 'المجموعة الرابعة',
    letters: ['ع', 'ف', 'ك', 'ق'],
    words: [
      { tiles: ['عَيْ', 'نْ'], say: 'عين', emoji: '👁️' },
      { tiles: ['فِي', 'لْ'], say: 'فيل', emoji: '🐘' },
      { tiles: ['كَ', 'لْ', 'بْ'], say: 'كلب', emoji: '🐕' },
      { tiles: ['قَ', 'لَ', 'مْ'], say: 'قلم', emoji: '✏️' },
      { tiles: ['عِ', 'نَ', 'بْ'], say: 'عنب', emoji: '🍇' },
    ],
  },
  {
    id: 'g5',
    title: 'المجموعة الخامسة',
    letters: ['ح', 'ج', 'خ'],
    words: [
      { tiles: ['حُو', 'تْ'], say: 'حوت', emoji: '🐋' },
      { tiles: ['جَ', 'مَ', 'لْ'], say: 'جمل', emoji: '🐫' },
      { tiles: ['جَ', 'بَ', 'لْ'], say: 'جبل', emoji: '⛰️' },
      { tiles: ['حَ', 'لِي', 'بْ'], say: 'حليب', emoji: '🥛' },
      { tiles: ['خَ', 'رُو', 'فْ'], say: 'خروف', emoji: '🐑' },
    ],
  },
  {
    id: 'g6',
    title: 'المجموعة السادسة',
    letters: ['ش', 'ص', 'ز', 'ط'],
    words: [
      { tiles: ['شَ', 'مْ', 'سْ'], say: 'شمس', emoji: '☀️' },
      { tiles: ['مَ', 'طَ', 'رْ'], say: 'مطر', emoji: '🌧️' },
      { tiles: ['زَ', 'يْ', 'تْ'], say: 'زيت', emoji: '🫒' },
      { tiles: ['صَا', 'رُو', 'خْ'], say: 'صاروخ', emoji: '🚀' },
      { tiles: ['قِ', 'طَا', 'رْ'], say: 'قطار', emoji: '🚆' },
    ],
  },
  {
    id: 'g7',
    title: 'المجموعة السابعة',
    letters: ['ث', 'ذ', 'ض', 'ظ', 'غ'],
    words: [
      { tiles: ['ثَ', 'عْ', 'لَ', 'بْ'], say: 'ثعلب', emoji: '🦊' },
      { tiles: ['ذَ', 'هَ', 'بْ'], say: 'ذهب', emoji: '🥇' },
      { tiles: ['ضِ', 'فْ', 'دَ', 'عْ'], say: 'ضفدع', emoji: '🐸' },
      { tiles: ['غُ', 'رَا', 'بْ'], say: 'غراب', emoji: '🐦‍⬛' },
      { tiles: ['ظَ', 'رْ', 'فْ'], say: 'ظرف', emoji: '✉️' },
    ],
  },
];

// كل الحروف المدروسة حتى مجموعة معيّنة (لاختيار المشتِّتات في الاختبارات)
export function lettersUpTo(groupId) {
  const out = [];
  for (const g of GROUPS) {
    out.push(...g.letters);
    if (g.id === groupId) break;
  }
  return out;
}

/**
 * الحروف المدروسة لحظةَ درسِ حرفٍ بعينه: كل ما قبل مجموعته + حروف مجموعته حتى هذا الحرف.
 * القفل تسلسلي داخل المجموعة، فهذه هي حصيلة الطفل الحقيقية — وهي المرجع في اختيار
 * المشتّتات وكلمات الأمثلة كي لا يظهر حرف لم يُدرَّس (METHOD §٢.٤).
 * تفشل مغلقةً: معرّف مجهول ⇒ لا شيء مدروس.
 */
export function lettersThrough(groupId, letter) {
  const out = [];
  for (const g of GROUPS) {
    if (g.id !== groupId) {
      out.push(...g.letters);
      continue;
    }
    const index = g.letters.indexOf(letter);
    if (index < 0) return [];
    out.push(...g.letters.slice(0, index + 1));
    return out;
  }
  return [];
}

// الحركات والسكون والشدة والتنوين (U+064B–U+0652) + الألف الخنجرية + التطويل + الفراغ
const MARK_OR_TATWEEL = /[ً-ْٰـ\s]/g;

/** تجريد النص من الحركات والتطويل — يبقى تسلسل الحروف وحده. */
export function bareLetters(text) {
  return text.replace(MARK_OR_TATWEEL, '');
}

/**
 * كلمة مثال للحرف: أول كلمة في المنهج تحوي الحرف وكل حروفها مدروسة عند هذا الدرس.
 * قد تعود null (حروف أوائل المجموعات لا تُكوِّن كلمة بعدُ) فلا يُعرض مثال أصلاً،
 * ولا تُكسر المفكوكية بكلمة فيها حرف لم يأتِ دوره.
 */
export function exampleWordFor(groupId, letter) {
  const studied = new Set(lettersThrough(groupId, letter));
  if (!studied.has(letter)) return null;
  for (const group of GROUPS) {
    for (const word of group.words) {
      const chars = bareLetters(word.tiles.join(''));
      if (chars.includes(letter) && [...chars].every((c) => studied.has(c))) return word;
    }
  }
  return null;
}
