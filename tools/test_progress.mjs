// اختبار منطق التقدّم والقفل في app/js/progress.js — بلا متصفّح.
//   node tools/test_progress.mjs
// يخرج بـ١ عند أي إخفاق. أضِف هنا كل قاعدة قفل أو نجوم جديدة.

const APP = new URL('../app/js/', import.meta.url);

// بديل localStorage في بيئة node
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const p = await import(new URL('progress.js', APP));
const { GROUPS, SKILLS, STORIES, quranParts } = await import(new URL('curriculum.js', APP));
const { GARDENS } = await import(new URL('lexicon.js', APP));
const { RUNGS } = await import(new URL('sentences.js', APP));
const BUNDLES = GARDENS.reduce((s, g) => s + g.bundles.length, 0);

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };

const g1 = GROUPS[0], g2 = GROUPS[1];
ok(p.isGroupUnlocked('g1'), 'المجموعة ١ مفتوحة ابتداءً');
ok(!p.isGroupUnlocked('g2'), 'المجموعة ٢ مقفلة ابتداءً');
ok(p.isNodeUnlocked('g1', 'ا'), 'أول حرف مفتوح');
ok(!p.isNodeUnlocked('g1', 'ب'), 'ثاني حرف مقفل قبل الأول');
ok(!p.isNodeUnlocked('g1', p.WORDS_PART), 'لعبة الكلمات مقفلة قبل الحروف');
ok(p.nextNode().id === 'g1:ا', 'التالي = g1:ا');

p.setStars('g1:ا', 3);
ok(p.isNodeUnlocked('g1', 'ب'), 'ثاني حرف فُتح بإتمام الأول');
ok(p.nextNode().id === 'g1:ب', 'التالي انتقل إلى g1:ب');
p.setStars('g1:ا', 1);
ok(p.getStars('g1:ا') === 3, 'المحاولة الأضعف لا تُنقص النجوم');

for (const ch of g1.letters) p.setStars(p.nodeId('g1', ch), 2);
ok(p.isNodeUnlocked('g1', p.WORDS_PART), 'لعبة الكلمات فُتحت بإتمام الحروف');
ok(!p.isGroupUnlocked('g2'), 'المجموعة ٢ ما زالت مقفلة قبل لعبة الكلمات');
ok(p.groupStars(g1).earned === 9 && p.groupStars(g1).max === 15, 'حساب نجوم المجموعة ١ (٩/١٥ — الألف احتفظت بـ٣)');

p.setStars('g1:words', 3);
ok(p.isGroupComplete(g1), 'المجموعة ١ اكتملت');
ok(p.isGroupUnlocked('g2'), 'المجموعة ٢ فُتحت');
ok(p.nextNode().id === `g2:${g2.letters[0]}`, 'التالي = أول حرف في المجموعة ٢');

// سقف النجوم = عقد المجموعات + عقد ما بينها (المهارات والقصص — الجلسة ٤)
//              + عقد المرحلة القرآنية (الجلسة ٦) + باقات البساتين (الحزمة ٧)
//              + درجات سلّم الجمل (الحزمة ٨)
ok(p.maxTotalStars() === GROUPS.reduce((s, g) => s + (g.letters.length + 1) * 3, 0)
  + (SKILLS.length + STORIES.length + quranParts().length + BUNDLES + RUNGS.length) * 3,
  'سقف النجوم الكلي');
ok(store.size === 1, 'الحفظ في localStorage تمّ');

const reloaded = JSON.parse(store.get('muallim.progress.v1'));
ok(reloaded.stars['g1:ا'] === 3, 'الحالة محفوظة ويمكن استرجاعها');

p.reset();
ok(p.totalStars() === 0 && !p.isGroupUnlocked('g2'), 'المحو يعيد كل شيء');

// ————— الجلسة ٥: سجلّ المهارات والتكرار المتباعد —————

const today = p.dayNumber();
const K = p.skillKey('ب', 'fatha', p.KINDS.QUIZ);

p.recordAttempt('ب', 'fatha', p.KINDS.QUIZ, false);
let s = p.getSkill(K);
ok(s.wrong === 1 && s.box === 0 && s.due === today, 'الخطأ يُرجع المهارة إلى صندوق اليوم فتُراجَع اليوم');

p.recordAttempt('ب', 'fatha', p.KINDS.QUIZ, true);
s = p.getSkill(K);
ok(s.right === 1 && s.box === 1 && s.due === today + 1, 'الإصابة ترفع الصندوق وتباعد الموعد يوماً');

p.recordAttempt('ب', 'fatha', p.KINDS.QUIZ, true);
s = p.getSkill(K);
ok(s.box === 2 && s.due === today + 2, 'الإصابة الثانية تباعده يومين');
ok(p.dueSkills(today).length === 0, 'ما تباعد موعده لا يظهر في مراجعة اليوم');
ok(p.dueSkills(today + 2).some((x) => x.key === K), 'ويعود في موعده تماماً');

for (let i = 0; i < 9; i++) p.recordAttempt('ب', 'fatha', p.KINDS.QUIZ, true);
ok(p.getSkill(K).box === p.MAX_BOX && p.getSkill(K).due === today + 16,
  `الصندوق لا يتجاوز سقفه (${p.MAX_BOX} ← ١٦ يوماً)`);
p.recordAttempt('ب', 'fatha', p.KINDS.QUIZ, false);
ok(p.getSkill(K).box === 0 && p.getSkill(K).due === today, 'خطأ واحد بعد الإتقان يعيدها إلى مراجعة اليوم');

ok(p.recordAttempt('', 'fatha', p.KINDS.QUIZ, true) === null, 'محاولة بلا حرف تُرفض (لا مفاتيح مشوّهة)');

// الترتيب: الأضعف أولاً (أدنى صندوق، ثم أكثر أخطاءً)
p.recordAttempt('م', 'kasra', p.KINDS.HARAKA, true);      // صندوق ١
p.recordAttempt('ل', 'damma', p.KINDS.BUILD, false);
p.recordAttempt('ل', 'damma', p.KINDS.BUILD, false);      // صندوق ٠ بخطأين
const dueNow = p.dueSkills(today + 1);
const order = dueNow.map((x) => x.key);
ok(dueNow[0].box === 0 && dueNow[0].wrong === 2, 'المستحقّ الأضعف يتصدّر (صندوق ٠ بخطأين)');
ok(order.indexOf(p.skillKey('ل', 'damma', p.KINDS.BUILD))
  < order.indexOf(p.skillKey('م', 'kasra', p.KINDS.HARAKA)), 'وما ارتفع صندوقه يتأخّر عمّا سقط');
ok(order.indexOf(p.skillKey('م', 'kasra', p.KINDS.HARAKA)) === order.length - 1,
  'الأعلى صندوقاً آخر القائمة');

// حصيلة الحرف: متقن / متعثّر
const stats = Object.fromEntries(p.letterStats().map((x) => [x.letter, x]));
ok(stats['ل'].struggling && !stats['ل'].mastered, 'الحرف بخطأين في صندوق دنيا = متعثّر');
for (let i = 0; i < 3; i++) p.recordAttempt('ن', 'fatha', p.KINDS.QUIZ, true);
ok(p.letterStats().find((x) => x.letter === 'ن').mastered, 'ثلاث إصابات متتابعة ⇒ متقن');
ok(p.letterStats().map((x) => x.letter).join('') === 'بملن', 'الحروف تُعرض بترتيب المنهج لا بترتيب الأخطاء');

// ————— دقائق الاستخدام —————

p.addSeconds(30);
p.addSeconds(90);
ok(p.secondsOn() === 120 && p.totalSeconds() === 120, 'الثواني تتراكم لليوم وللمجموع');
p.addSeconds(0);
p.addSeconds(-5);
ok(p.secondsOn() === 120, 'الصفر والسالب لا يغيّران شيئاً');
p.addSeconds(60, '2020-01-01');
ok(p.totalSeconds() === 180 && p.secondsOn() === 120, 'يوم آخر لا يخلط بيوم اليوم');
const week = p.usageDays(7);
ok(week.length === 7 && week[6].key === p.dayKey() && week[6].seconds === 120,
  'آخر سبعة أيام تنتهي باليوم');

// ————— المراجعة اليومية وسلسلتها —————

ok(!p.reviewOf() && p.reviewStreak() === 0, 'لا مراجعة اليوم ابتداءً');
p.markReview(6, 5);
p.markReview(2, 2);
ok(p.reviewOf().tries === 8 && p.reviewOf().right === 7,
  'مراجعتان في يوم تتراكمان بوحدة المحاولة (لا التمرين)');
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
p.markReview(6, 6, p.dayKey(yesterday));
ok(p.reviewStreak() === 2, 'سلسلة المراجعة تحسب اليوم وأمس');

// ————— حصيلة الطفل (ما يجوز أن يظهر في المراجعة) —————

p.reset();
ok(p.studiedLetters().length === 0 && p.studiedWords().length === 0, 'بلا دروس: لا حروف ولا كلمات');
p.setStars('g1:ا', 3);
p.setStars('g1:ب', 3);
ok(p.studiedLetters().join('') === 'اب', 'الحروف المدروسة = ما أُنجزت دروسه بترتيب المنهج');
ok(p.studiedWords().map((x) => x.say).join('،') === 'بابا،باب',
  'بحرفَي (ا ب) تُفتح «بابا» و«باب» وحدهما');
p.setStars('g1:م', 3);
const w = p.studiedWords().map((x) => x.say);
ok(w.includes('بابا') && w.includes('ماما') && !w.includes('مال'),
  `الكلمات المفكوكة بحصيلته فقط (${w.join('، ')} — «مال» تحتاج اللام)`);

// ————— ترقية حالة النسخة ١ (طفل بدأ قبل الجلسة ٥) —————

store.set('muallim.progress.v1', JSON.stringify({
  v: 1, stars: { 'g1:ا': 3, 'g1:ب': 2 }, seconds: 300, errors: { legacy: 1 }, startedAt: 1, updatedAt: 2,
}));
const p2 = await import(new URL('progress.js?fresh=1', APP));
const snap = p2.snapshot();
ok(p2.getStars('g1:ا') === 3 && p2.totalSeconds() === 300, 'الترقية تحفظ نجوم الطفل وثوانيه');
ok(snap.v === 2 && !('errors' in snap) && typeof snap.skills === 'object',
  'الحقل المحجوز القديم يسقط ويحلّ محلّه سجلّ المهارات');
ok(p2.dueSkills().length === 0 && p2.reviewStreak() === 0, 'الحالة المرقّاة تبدأ بسجلّ نظيف');

store.set('muallim.progress.v1', '}{ ليس json');
const p3 = await import(new URL('progress.js?fresh=2', APP));
ok(p3.totalStars() === 0, 'حالة معطوبة ⇒ بداية نظيفة بلا انهيار');

console.log(fails ? `\n${fails} فشل` : '\nكل اختبارات التقدّم ناجحة');
process.exit(fails ? 1 : 0);
