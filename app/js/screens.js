// هيكلان مشتركان بين شاشات المراحل المتأخّرة (أُخرجا من `quran.js` في الحزمة ٧
// حين احتاجتهما البساتين — نفس الميكانيكية لا نسخةٌ ثانية منها):
//
//   steppedScreen — شاشة درسٍ بخطوات: شريط الخطوات، جسمٌ يتبدّل، ثم احتفالٌ ونجوم.
//   readQuizStep  — «اقرأ واختر»: صورة ← ثلاث كلمات **مكتوبة**، ولا صوت قبل الاختيار
//                   كي يقع الحكم على القراءة لا على السمع، والخطأ يُسمعه ما اختاره
//                   ليقارنه بالصورة (لا يُلقَّن الجواب).

import * as progress from './progress.js';
import * as audio from './audio.js';
import { h, toast, go, arNum, starsRow, topbar, mascot, shuffle, shake, DEV } from './ui.js';

const QUIZ_OPTIONS = 3;
const AFTER_PICK_MS = 750;

/**
 * جولات «اقرأ واختر»: لكل كلمةٍ جولة، ومشتّتاتها من كلمات الشاشة نفسها (مفكوكة
 * بالضرورة)، ويُفضَّل ما شارك الكلمةَ حرفَها الأول فيقرأ الطفل الكلمة كلها لا أولها.
 */
export function buildReadRounds(items, rnd = Math.random) {
  if (items.length < QUIZ_OPTIONS) return [];
  return shuffle(items, rnd).map((target) => {
    const others = items.filter((w) => w.read !== target.read);
    const kin = others.filter((w) => w.read[0] === target.read[0]);
    const rest = others.filter((w) => w.read[0] !== target.read[0]);
    const distractors = [...shuffle(kin, rnd), ...shuffle(rest, rnd)].slice(0, QUIZ_OPTIONS - 1);
    return { target, options: shuffle([target, ...distractors], rnd) };
  });
}

/** خطوة «اقرأ واختر» كاملةً — تُستدعى من داخل خطوات `steppedScreen`. */
export function readQuizStep(items, { next, fail }, { onPick } = {}) {
  const rounds = buildReadRounds(items);
  if (!rounds.length) {                     // مادة أقلّ من ثلاث كلمات: لا سؤال، ولا شاشة معلَّقة
    setTimeout(next, 0);
    return h('p', { class: 'hint' }, '…');
  }
  let index = 0;
  let locked = false;

  const pic = h('div', { class: 'pick-pic' });
  const counter = h('p', { class: 'hint' });
  const row = h('div', { class: 'row vrow' });

  function startRound() {
    const r = rounds[index];
    locked = false;
    pic.replaceChildren(h('span', { class: 'pic-emoji' }, r.target.emoji));
    counter.textContent = `الكلمة ${arNum(index + 1)} من ${arNum(rounds.length)}`;
    row.replaceChildren(...r.options.map((word) => {
      const btn = h('button', {
        class: 'vchip vchip--word',
        'aria-label': word.read,
        onclick: () => pick(word, btn, r),
      }, h('span', { class: 'vchip-face' }, word.read));
      return btn;
    }));
  }

  function pick(word, btn, r) {
    if (locked) return;
    const correct = word.read === r.target.read;
    onPick?.(r.target, word, correct);
    if (correct) {
      locked = true;
      btn.classList.add('good');
      audio.play(word.say ?? word.read);
      setTimeout(() => {
        index++;
        if (index < rounds.length) startRound();
        else next();
      }, AFTER_PICK_MS);
    } else {
      fail();
      shake(btn);
      btn.classList.add('bad');
      setTimeout(() => btn.classList.remove('bad'), 700);
      audio.play(word.say ?? word.read);   // يسمع ما اختاره فيقارنه بالصورة (بلا تلقين)
    }
  }

  const screen = h('div', {},
    h('h2', {}, 'اقرأ واختر'),
    h('p', { class: 'hint' }, 'انظر الصورة، واقرأ الكلمات، واختر كلمتها'),
    pic,
    counter,
    row,
  );
  startRound();
  return screen;
}

/**
 * شاشة درسٍ بخطوات ونجوم. `steps` قائمة {title, build({next, fail})}،
 * و`celebrate(state)` تعيد {stars, line} من عدد الأخطاء وما شاءت من حال الدرس.
 */
export function steppedScreen({ nodeId, className = '', accent, pill, face, steps, celebrate }) {
  const state = { step: 0, errors: 0, done: false };

  const stepsBar = h('ol', { class: 'steps' });
  const body = h('div', { class: 'lesson-body' });

  function paintSteps() {
    stepsBar.replaceChildren(...steps.map((s, i) => h('li', {
      class: `step${i === state.step ? ' step--now' : ''}${i < state.step ? ' step--done' : ''}`,
    },
      h('span', { class: 'step-dot' }, i < state.step ? '✓' : arNum(i + 1)),
      h('span', { class: 'step-name' }, s.title),
    )));
  }

  function paint() {
    audio.stop();
    paintSteps();
    const content = steps[state.step].build({ next, fail: () => { state.errors++; } });
    // الشخصية المرشدة تستقبل الطفل في أول خطوة (DESIGN §٦)
    if (state.step === 0) body.replaceChildren(mascot('mascot mascot--hello'), content);
    else body.replaceChildren(content);
  }

  function next() {
    if (state.step < steps.length - 1) {
      state.step++;
      paint();
    } else {
      finish();
    }
  }

  function finish() {
    audio.stop();
    state.done = true;
    state.step = steps.length;
    paintSteps();

    const { stars, line } = celebrate(state);
    const before = progress.getStars(nodeId);
    progress.setStars(nodeId, stars);
    const last = !progress.nextNode();   // بعد الحفظ: هل بقي في الرحلة شيء؟

    body.replaceChildren(h('div', { class: 'celebrate' },
      mascot('mascot mascot--cheer'),
      h('div', { class: 'celebrate-face' }, face),
      h('h2', {}, 'أحسنت!'),
      starsRow(stars, 'big-stars'),
      h('p', { class: 'hint' }, line),
      before > stars && h('p', { class: 'hint' }, `نجومك السابقة محفوظة: ${arNum(before)} ★`),
      last && h('p', { class: 'note' }, '🎉 أتممتَ الرحلة كلها — من الحرف الأول إلى سلّم الجمل.'),
      h('div', { class: 'row foot' },
        h('button', { class: 'btn btn--primary', onclick: () => go('#/') }, '→ الخريطة'),
        h('button', {
          class: 'btn',
          onclick: () => {
            Object.assign(state, { step: 0, errors: 0, done: false });
            paint();
          },
        }, '↻ أعِد'),
      ),
    ));
  }

  paint();

  return h('div', { class: `screen lesson ${className}`.trim(), css: { '--accent': accent } },
    topbar(
      h('button', {
        class: 'btn',
        onclick: () => {
          if (state.step === 0 || state.done || confirm('تريد الخروج قبل الإتمام؟')) go('#/');
        },
      }, '→ الخريطة'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, pill),
    ),
    h('main', { class: 'screen-card' },
      stepsBar,
      body,
      DEV && h('div', { class: 'dev' },
        h('div', { class: 'dev-title' }, 'أدوات التجربة (?dev=1)'),
        h('div', { class: 'dev-row' },
          h('button', { class: 'btn', onclick: () => toast(`أخطاء: ${arNum(state.errors)}`) }, 'عدّ الأخطاء'),
          h('button', { class: 'btn', onclick: finish }, 'إنهاء الآن'),
        )),
    ),
  );
}

/** زرّ «تابع» عريض في ذيل الخطوة. */
export const nextButton = (onclick, label = 'تابع ←') =>
  h('button', { class: 'btn btn--primary btn--wide next', onclick }, label);
