// اختبار منطق درس الحرف (app/js/lesson.js) ومفكوكيته — بلا متصفّح.
//   node tools/test_lesson.mjs
// القاعدة المحروسة هنا: لا يظهر في أي تمرين أو مثال حرفٌ لم يُدرَّس بعد.

const APP = new URL('../app/js/', import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { GROUPS, lettersThrough, exampleWordFor, bareLetters } = await import(new URL('curriculum.js', APP));
const { buildRounds, starsForErrors, clusters } = await import(new URL('lesson.js', APP));

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };

// مولّد عشوائي محدَّد البذرة كي تكون الاختبارات قابلة للإعادة
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ————— ١. الحروف المدروسة حتى كل درس —————

const cumulative = [];
let missingExample = [];
for (const g of GROUPS) {
  for (const letter of g.letters) {
    cumulative.push(letter);
    const studied = lettersThrough(g.id, letter);
    if (studied.join('') !== cumulative.join('')) {
      fails++;
      console.log(`  ✗ lettersThrough(${g.id}, ${letter}) = ${studied.join('')} ≠ ${cumulative.join('')}`);
    }
    const word = exampleWordFor(g.id, letter);
    if (!word) { missingExample.push(letter); continue; }
    const chars = [...bareLetters(word.tiles.join(''))];
    if (!chars.includes(letter)) {
      fails++;
      console.log(`  ✗ كلمة مثال «${word.say}» للحرف «${letter}» لا تحويه`);
    }
    const unknown = chars.filter((c) => !studied.includes(c));
    if (unknown.length) {
      fails++;
      console.log(`  ✗ كلمة مثال «${word.say}» عند «${letter}» فيها حرف غير مدروس: ${unknown.join('،')}`);
    }
  }
}
ok(true, `lettersThrough تراكمية ومطابقة لترتيب المنهج (${cumulative.length} حرفاً)`);
ok(true, 'كلمات الأمثلة كلها مفكوكة عند درسها');
// الألف وحدها بلا مثال (أول درس في الرحلة — لا كلمة ممكنة أصلاً)؛ التاء عولجت بإضافة «تَمْر» (إقرار المدير، ٢ أغسطس ٢٠٢٦)
ok(missingExample.join('') === 'ا', `بلا كلمة مثال (يُطوى العرض): ${missingExample.join('، ') || 'لا شيء'}`);

// ————— ٢. جولات «ميّز بأذنك» —————

let roundChecks = 0;
for (let seed = 1; seed <= 40; seed++) {
  const rnd = rng(seed);
  const acc = [];
  for (const g of GROUPS) {
    for (const letter of g.letters) {
      acc.push(letter);
      const studied = lettersThrough(g.id, letter);
      const rounds = buildRounds(studied, letter, rnd);
      const expected = studied.length < 2 ? 0 : 3;
      if (rounds.length !== expected) {
        fails++;
        console.log(`  ✗ عدد الجولات عند «${letter}» = ${rounds.length} (المتوقع ${expected})`);
      }
      for (const r of rounds) {
        roundChecks++;
        const outside = r.options.filter((c) => !studied.includes(c));
        if (outside.length) {
          fails++;
          console.log(`  ✗ خيار غير مدروس عند «${letter}»: ${outside.join('،')}`);
        }
        if (!r.options.includes(r.target)) {
          fails++;
          console.log(`  ✗ الهدف «${r.target}» غائب عن خيارات درس «${letter}»`);
        }
        if (new Set(r.options).size !== r.options.length) {
          fails++;
          console.log(`  ✗ خيارات مكرّرة عند «${letter}»: ${r.options.join('،')}`);
        }
        const size = Math.min(3, studied.length);
        if (r.options.length !== size) {
          fails++;
          console.log(`  ✗ عدد الخيارات عند «${letter}» = ${r.options.length} (المتوقع ${size})`);
        }
        if (!'َُِ'.includes(r.mark)) {
          fails++;
          console.log(`  ✗ حركة غير معروفة في جولة «${letter}»`);
        }
      }
      if (rounds.length && rounds[0].target !== letter) {
        fails++;
        console.log(`  ✗ الجولة الأولى في درس «${letter}» ليست على الحرف نفسه`);
      }
    }
  }
}
ok(true, `جولات مفكوكة وصحيحة التركيب في ٤٠ بذرة عشوائية (${roundChecks} جولة)`);

// الحالة الحدّية: أول درس في الرحلة (حرف واحد مدروس) تُطوى فيه خطوة التمييز
ok(buildRounds(['ا'], 'ا').length === 0, 'أول درس: لا جولات تمييز (لا مشتّت مدروس بعد)');
ok(buildRounds(['ا', 'ب'], 'ب').every((r) => r.options.length === 2), 'حرفان مدروسان ⇒ خياران لا ثلاثة');

// ————— ٣. النجوم والتلوين —————

ok(starsForErrors(0) === 3 && starsForErrors(1) === 2 && starsForErrors(2) === 1 && starsForErrors(9) === 1,
  'النجوم: ٣ بلا خطأ، ٢ بخطأ، ١ بأكثر');

ok(clusters('بَابْ').join('|') === 'بَ|ا|بْ', 'تقطيع الحروف بحركاتها لتلوين الحرف داخل الكلمة');
ok(clusters('مَا').filter((c) => c[0] === 'م').length === 1, 'الحرف المستهدف يُلتقط مرة واحدة في «مَا»');

console.log(fails ? `\n${fails} فشل` : '\nكل اختبارات درس الحرف ناجحة');
process.exit(fails ? 1 : 0);
