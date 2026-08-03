// المعجم — «حديقة الكلمات»: طبقة ب١ من الرصيد اللغوي (ROADMAP §المرحلة ب، الحزمة ٧).
//
// **البيانات ليست هنا**: ٢٥٠ كلمة في `app/data/lexicon.json` وحدها، وهذا الملف شيفرةٌ
// تقرؤها وتقدّمها للشاشات في شكل واحد. سببُ فصلها ملفَّ بياناتٍ لا وحدةَ جافاسكربت:
// يقرؤها `tools/check_lexicon.py` قراءةً مباشرة بلا تحليل نصّي هشّ — فمقاييس المفكوكية
// والمقاطع والتفرّد كلها آليّة على الملف نفسه الذي يقرؤه التطبيق.
//
// تُقرأ **مرة واحدة عند تحميل الوحدة** (top-level await)، فتبقى بقية الشيفرة متزامنة
// كما كانت: `progress.journey()` تعرف عقد البساتين وقت بنائها، ولا خريطةَ تُرسم ناقصة.
// وإن تعذّرت القراءة يعمل التطبيق كاملاً بلا بساتين — لا شاشةَ بيضاء لطفل.
//
// المعجم يوسّع رصيد المنهج ولا يكرّره: لا تدخله كلمةٌ من `curriculum.js` (يفرضه الفاحص).

const DATA_URL = new URL('../data/lexicon.json', import.meta.url);
const EMPTY = { version: 0, bundleSize: 5, themes: [], words: [] };

async function readData() {
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      const { readFileSync } = await import('node:fs');    // اختبارات node تقرأ الملف مباشرة
      return JSON.parse(readFileSync(DATA_URL, 'utf8'));
    }
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('[lexicon] تعذّرت قراءة المعجم — تعمل الرحلة بلا بساتين:', e);
    return EMPTY;
  }
}

const DATA = await readData();

/** عدد كلمات الباقة الواحدة (عقدة على الخريطة) — من ملف البيانات لا من الشيفرة. */
export const BUNDLE_SIZE = DATA.bundleSize || 5;

/**
 * الكلمة في شكلٍ تفهمه شاشات التطبيق كلها بأسمائها المستقرّة:
 *   text — المعروض (بشدّته كما تُكتب)، وليس تركيب المقاطع (فهي تفكّ الشدّة تهجّياً)
 *   read — «اقرأ واختر» (ميكانيكية المرحلة القرآنية)
 *   say  — النصّ المنطوق = مفتاح ملفه الصوتي
 */
const asWord = (entry) => ({ ...entry, text: entry.word, read: entry.word, say: entry.word });

export const WORDS = (DATA.words || []).map(asWord);

/**
 * البساتين: موضوعٌ واحد لكل بستان، وكلماته تنقسم **باقات** كل واحدة عقدةٌ على الخريطة
 * (٢٥ كلمة دفعةً واحدة تُرهق طفل السادسة، وخمسٌ حلقةُ لعبٍ في دقائق كلعبة الكلمات).
 */
export const GARDENS = (DATA.themes || []).map((theme) => {
  const words = WORDS.filter((w) => w.theme === theme.id);
  const bundles = [];
  for (let i = 0; i < words.length; i += BUNDLE_SIZE) {
    const index = bundles.length + 1;
    bundles.push({ id: `${theme.id}:${index}`, index, theme: theme.id, words: words.slice(i, i + BUNDLE_SIZE) });
  }
  const garden = { ...theme, words, bundles };
  for (const bundle of bundles) bundle.garden = garden;
  return garden;
});

/**
 * **الجمل المتدرّجة** (٣–٥ كلمات — الحزمة ٩أ): مادّةٌ مستقلّة عن جملة الكلمة الواحدة
 * (كلمتان)، بها يتدرّج سلّم الجمل فعلاً كما أرادت الخارطة §المرحلة ج.
 * تُؤلَّف بمولّد مقيَّد (`tools/make_sentences.py`) لا تُكتب بيد، ويحرسها الفاحص.
 * `word` هدفُ الجملة: كلمةُ معجمٍ حاضرةٌ فيها — صورتُها وفراغُ «أكمل الجملة».
 */
export const GRADED = (DATA.sentences || [])
  .map((entry) => ({ text: entry.text, target: WORDS.find((w) => w.word === entry.word) }))
  .filter((entry) => entry.text && entry.target);

export const gardenById = (id) => GARDENS.find((g) => g.id === id) || null;

export const bundleById = (id) => GARDENS.flatMap((g) => g.bundles).find((b) => b.id === id) || null;

export const lexiconWord = (text) => WORDS.find((w) => w.word === text) || null;

/**
 * كل ما تنطقه البساتين — الكلمة ثم مقاطعها، بترتيب لقاء الطفل بها.
 * هذا الترتيب هو ترتيب تصريف قائمة الانتظار الصوتية (docs/AUDIO_QUEUE.md):
 * أوّلُ بستانٍ أوّلُ ما يُصرَّف، فيصير مسموعاً قبل أن يبلغه الطفل.
 */
export function lexiconTexts() {
  const out = [];
  for (const garden of GARDENS) {
    for (const bundle of garden.bundles) {
      for (const word of bundle.words) out.push(word.say, ...word.tiles);
    }
  }
  return [...new Set(out)];
}
