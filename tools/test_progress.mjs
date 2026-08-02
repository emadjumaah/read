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
const { GROUPS } = await import(new URL('curriculum.js', APP));

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

ok(p.maxTotalStars() === GROUPS.reduce((s,g)=>s+(g.letters.length+1)*3,0), 'سقف النجوم الكلي');
ok(store.size === 1, 'الحفظ في localStorage تمّ');

const reloaded = JSON.parse(store.get('muallim.progress.v1'));
ok(reloaded.stars['g1:ا'] === 3, 'الحالة محفوظة ويمكن استرجاعها');

p.reset();
ok(p.totalStars() === 0 && !p.isGroupUnlocked('g2'), 'المحو يعيد كل شيء');

console.log(fails ? `\n${fails} فشل` : '\nكل اختبارات التقدّم ناجحة');
process.exit(fails ? 1 : 0);
