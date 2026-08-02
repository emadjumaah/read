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

// ————— دروس المهارات (METHOD §٥): العلامات التي تُدرَّس بين المجموعات —————
//
// كل درس يدخل الخريطة بعد مجموعة بعينها (`after`)، وموضعه مختار كي تكون مادّته
// مفكوكة ١٠٠٪ بحصيلة الطفل عندها:
//   المدّ والسكون بعد المجموعة ٣ (بها تكتمل حروف المدّ: ا و ي)،
//   الشدّة بعد ٤، التنوين بعد ٥، اللام الشمسية/القمرية بعد ٦ — وهو ترتيب §٥ نفسه.
//
// حقول الدرس:
//   marks    — العلامة التي يفتحها هذا الدرس، فيجوز استعمالها في نصوص ما بعده.
//   rule     — جملة القاعدة، تُقرأ للطفل بالصوت (نصّ واجهة، ليس مادة قراءة).
//   compare  — أزواج [قَبل، بَعد] تُعرض وتُنطق للمقارنة، ومنها تُبنى أسئلة التمييز.
//   wordRefs — كلمات من المنهج تُحال بـsay (لا تُكرَّر بياناتها هنا).
//   words    — كلمات جديدة يخصّها الدرس؛ نصّها المشكول هو نصّها المنطوق نفسه.
export const SKILLS = [
  {
    id: 'madd',
    after: 'g3',
    title: 'المَدّ الطبيعي',
    face: 'ـَا',
    marks: [],
    rule: 'الفتحة قبل الألف تُمَدّ، والضمة قبل الواو، والكسرة قبل الياء.',
    compare: {
      labels: ['قصير', 'ممدود'],
      pairs: [['بَ', 'بَا'], ['تُ', 'تُو'], ['تِ', 'تِي'], ['مَ', 'مَا']],
    },
    wordRefs: ['بابا', 'توت', 'تين'],
    words: [],
  },
  {
    id: 'sukun',
    after: 'g3',
    title: 'السُّكون',
    face: 'ـْ',
    marks: [],
    rule: 'الحرف الساكن لا حركة له، تصله بما قبله ثم تقف عليه.',
    compare: {
      labels: ['متحرّك', 'ساكن'],
      pairs: [['بَ', 'بْ'], ['مَ', 'مْ'], ['دَ', 'دْ'], ['رَ', 'رْ']],
    },
    wordRefs: ['باب', 'مال', 'يد'],
    words: [],
  },
  {
    id: 'shadda',
    after: 'g4',
    title: 'الشَّدّة',
    face: 'ـّ',
    marks: ['ّ'],
    rule: 'الشدّة حرفان: ساكن ثم متحرّك، يُنطقان حرفاً واحداً قويّاً.',
    compare: {
      labels: ['مفكوكة', 'مشدَّدة'],
      pairs: [['سُكْ كَرْ', 'سُكَّرْ'], ['سُلْ لَمْ', 'سُلَّمْ'], ['دُكْ كَانْ', 'دُكَّانْ']],
    },
    wordRefs: [],
    words: [
      { text: 'سُكَّرْ', emoji: '🍬' },
      { text: 'سُلَّمْ', emoji: '🪜' },
      { text: 'دُكَّانْ', emoji: '🏪' },
    ],
  },
  {
    id: 'tanween',
    after: 'g5',
    title: 'التَّنوين',
    face: 'ـً',
    marks: ['ً', 'ٌ', 'ٍ'],
    rule: 'التنوين نون ساكنة في آخر الكلمة، تُنطق ولا تُكتب.',
    compare: {
      labels: ['بحركة', 'بتنوين'],
      pairs: [['بَ', 'بً'], ['بُ', 'بٌ'], ['بِ', 'بٍ']],
    },
    wordRefs: [],
    words: [
      { text: 'بَابٌ', emoji: '🚪' },
      { text: 'قَلَمٌ', emoji: '✏️' },
      { text: 'وَلَدٌ', emoji: '👦' },
    ],
  },
  {
    id: 'lam',
    after: 'g6',
    title: 'اللام الشمسية والقمرية',
    face: 'الْ',
    marks: ['sun'],
    rule: 'اللام القمرية تُنطق ساكنة، واللام الشمسية لا تُنطق ويُشدَّد ما بعدها.',
    compare: {
      labels: ['قمرية: تُنطق اللام', 'شمسية: تُدغَم اللام'],
      pairs: [['الْقَمَرْ', 'الشَّمْسْ'], ['الْبَابْ', 'الدَّارْ'], ['الْفِيلْ', 'السَّمَكْ']],
    },
    wordRefs: [],
    words: [
      { text: 'الْقَمَرْ', emoji: '🌙' },
      { text: 'الشَّمْسْ', emoji: '☀️' },
      { text: 'السَّمَكْ', emoji: '🐟' },
    ],
  },
];

// ————— القصص المفكوكة (METHOD §٥.٥) —————
//
// ثلاث قصص قصيرة مشكولة بالكامل، كل واحدة بعد المهارة التي تُوظّفها:
//   الأولى بعد الشدّة، والثانية بعد التنوين، والثالثة بعد اللام الشمسية.
// كل كلمة نصّها المعروض هو نصّها المنطوق (نقرة عليها تُسمعها)، والجملة تُنطق كاملةً
// بنصّ = كلماتها مفصولة بمسافة — فلا يفترق المعروض عن المسموع أبداً.
export const STORIES = [
  {
    id: 'st1',
    after: 'g4',
    title: 'بَيْتُ سَامِي',
    emoji: '🏡',
    sentences: [
      { words: ['سَامِي', 'وَلَدْ'], emoji: '👦' },
      { words: ['بَيْتُ', 'سَامِي', 'كَبِيرْ'], emoji: '🏡' },
      { words: ['فِي', 'الْبَيْتِ', 'سُلَّمْ'], emoji: '🪜' },
      { words: ['مَعَ', 'سَامِي', 'كَلْبْ'], emoji: '🐕' },
      { words: ['الْكَلْبُ', 'نَامْ'], emoji: '😴' },
    ],
  },
  {
    id: 'st2',
    after: 'g5',
    title: 'جَمَلُ حَسَنْ',
    emoji: '🐫',
    sentences: [
      { words: ['حَسَنٌ', 'وَلَدٌ', 'كَبِيرْ'], emoji: '👦' },
      { words: ['لِحَسَنٍ', 'جَمَلْ'], emoji: '🐫' },
      { words: ['الْجَمَلُ', 'يَحْمِلُ', 'الْحَلِيبْ'], emoji: '🥛' },
      { words: ['حَسَنٌ', 'يُحِبُّ', 'جَمَلَهْ'], emoji: '❤️' },
    ],
  },
  {
    id: 'st3',
    after: 'g6',
    title: 'الشَّمْسُ وَالْمَطَرْ',
    emoji: '🌦️',
    sentences: [
      { words: ['طَلَعَتِ', 'الشَّمْسْ'], emoji: '☀️' },
      { words: ['زَيْدٌ', 'يَلْعَبُ', 'فِي', 'الشَّارِعْ'], emoji: '⚽' },
      { words: ['نَزَلَ', 'الْمَطَرْ'], emoji: '🌧️' },
      { words: ['رَجَعَ', 'زَيْدٌ', 'لِلدَّارْ'], emoji: '🏃' },
      { words: ['زَيْدٌ', 'سَعِيدْ'], emoji: '😀' },
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

// ————— تحليل المقطع (يخدم القياس والمراجعة: مهارة = حرف × حركة) —————

export const SUKUN = 'ْ';

/** العلامة ← مفتاحها. السكون ليس حركةً في HARAKAT لكنه وجه من وجوه الحرف يُقاس. */
export const HARAKA_BY_MARK = {
  'َ': 'fatha',
  'ِ': 'kasra',
  'ُ': 'damma',
  [SUKUN]: 'sukun',
};

/** مفتاح الحركة ← علامتها (سلسلة فارغة للمجهول). */
export function markOf(haraka) {
  if (haraka === 'sukun') return SUKUN;
  return HARAKAT.find((k) => k.key === haraka)?.mark ?? '';
}

/**
 * مهارة المقطع: أول حرف فيه وحركته — «بَيْ» ← {ب, fatha}، «بْ» ← {ب, sukun}.
 * هي وحدة القياس في سجلّ الأخطاء (METHOD §٦: الحرف × الحركة × نوع التمرين).
 * تعود null لنصّ بلا حرف معروف.
 */
export function syllableSkill(text) {
  const chars = [...String(text ?? '')];
  const index = chars.findIndex((c) => LETTERS[c]);
  if (index < 0) return null;
  return { letter: chars[index], haraka: HARAKA_BY_MARK[chars[index + 1]] || 'none' };
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

// ————— قراءة دروس المهارات والقصص —————

export const skillById = (id) => SKILLS.find((s) => s.id === id) || null;
export const storyById = (id) => STORIES.find((s) => s.id === id) || null;

/** كلمة من كلمات المنهج بنصّها المنطوق (مرجع `wordRefs` في دروس المهارات). */
export const wordBySay = (say) => GROUPS.flatMap((g) => g.words).find((w) => w.say === say) || null;

/**
 * كلمات درس المهارة موحَّدة الشكل: {text المعروض، say المنطوق، emoji}.
 * المُحال إليها من المنهج تُعرض بمقاطعها المركّبة وتُنطق بـsay (صوتها موجود أصلاً)،
 * والجديدة نصّها المشكول هو المعروض والمنطوق معاً.
 */
export function skillExamples(skill) {
  return [
    ...(skill.wordRefs || []).map(wordBySay).filter(Boolean)
      .map((w) => ({ text: w.tiles.join(''), say: w.say, emoji: w.emoji })),
    ...(skill.words || []).map((w) => ({ text: w.text, say: w.text, emoji: w.emoji })),
  ];
}

/** نصّ الجملة كما يُعرض ويُنطق: كلماتها مفصولة بمسافة (لا مصدر ثانٍ لها). */
export const sentenceText = (sentence) => sentence.words.join(' ');

/** كل ما ينطقه درس مهارة (القاعدة، الأزواج، الكلمات). */
export function skillTexts(skill) {
  return [
    skill.rule,
    ...skill.compare.pairs.flat(),
    ...skillExamples(skill).map((w) => w.say),
  ];
}

/** كل ما تنطقه قصة (العنوان، الجمل، كلماتها). */
export function storyTexts(story) {
  return [
    story.title,
    ...story.sentences.flatMap((s) => [sentenceText(s), ...s.words]),
  ];
}
