// «سلّم الجمل» — شاشة الدرجة (الحزمة ٨ · ROADMAP §المرحلة ج).
//
// من الكلمة إلى الجملة قبل القصة: الطفل يقرأ جملةً كاملةً مشكولة ويصنع بها شيئاً.
// موضع الدرجة من الرحلة: بعد باقات بستانها، فكلماتها كلها في رصيده (يضمنه `sentences.js`).
//
// ثلاث ميكانيكيات بالتناوب، كلها ترث ميكانيكيةً مجرَّبة لا تخترع للطفل رابعة:
//   ١) **اقرأ ونفّذ** — الجملة مكتوبة ← ثلاث صور، ولا صوت قبل الاختيار (نمط «اقرأ واختر»
//      في الجلسة ٦: الحكم على القراءة لا على السمع).
//   ٢) **رتّب الجملة** — كلماتٌ مبعثرة تُبنى بالترتيب، ببلاطات لعبة الكلمات نفسِها
//      (`buildBoard`) بمشتّتاتها: فلا يكفي الترتيب، بل تُقرأ الكلمة قبل وضعها.
//   ٣) **أكمل الجملة** — فراغٌ مكان الكلمة المصوَّرة ← ثلاث كلمات مصوَّرة من البستان.
//
// **القياس** (بند الحزمة ٨): «رتّب» وحده يُقاس، وعلى **الكلمة المطلوبة في موضعها** لا
// على ما لمسه الطفل — كما يُقاس المقطع المطلوب في `words.js`. ومهارتها أول حرف متحرّك
// في تلك الكلمة (`wordSkill`)، بنوع تمرين جديد `order` له تمرينه في مراجعة اليوم.
// أمّا «اقرأ ونفّذ» و«أكمل» فالمقيس فيهما كلمةٌ كاملة أو جملة، ووحدةُ §٦ حرفٌ بحركة —
// فلا قياس فيهما (امتداد قرارات الجلسات ٤ و٦ والحزمة ٧ المُقرَّة).

import { wordSkill } from './curriculum.js';
import { rungById, orderPool, MECHANIC_TITLES } from './sentences.js';
import * as progress from './progress.js';
import * as audio from './audio.js';
import { buildBoard, starsForGame } from './words.js';
import {
  h, toast, go, arNum, arCount, starsRow, topbar,
  SENTENCE_ACCENT, mascot, shuffle, shake, DEV,
} from './ui.js';

const OPTIONS = 3;           // «ثلاث صور» و«ثلاث كلمات مصوّرة» (بند الحزمة)
const AFTER_PICK_MS = 900;   // مهلة سماع الجملة كاملةً قبل الانتقال
const BLANK = ' ';      // فراغٌ لا يُقرأ: الخانة المنقّطة وحدها تدلّ عليه (لا يقرأ طفلنا «___»)

export const nodeIdOf = (rungId) => `ladder:${rungId}`;

/**
 * خيارات الاختيار: الهدف ومعه من كلمات بستانه.
 * في «أكمل» يُفضَّل المخالف في التأنيث (وَاسِعَةْ ← غُرْفَة لا سَرِير) كي يكون الجواب
 * **مقروءاً من النصّ** لا مخمَّناً من المعنى؛ وفي «اقرأ ونفّذ» يكفي اختلاف الصور.
 */
export function pickOptions(sentence, rnd = Math.random, byGender = false) {
  const target = sentence.target;
  const pool = sentence.rung.garden.words.filter((w) => w !== target);
  const feminine = (w) => w.word.includes('ة');
  const near = byGender ? pool.filter((w) => feminine(w) !== feminine(target)) : [];
  const rest = pool.filter((w) => !near.includes(w));
  const others = [...shuffle(near, rnd), ...shuffle(rest, rnd)].slice(0, OPTIONS - 1);
  return shuffle([target, ...others], rnd);
}

export function renderLadder(rungId) {
  const rung = rungById(rungId);
  if (!rung) return null;

  const sentences = rung.sentences;
  const nodeId = nodeIdOf(rung.id);
  const pool = orderPool(rung.garden);
  const state = { index: 0, errors: 0, done: false, token: 0 };

  const dots = h('ol', { class: 'dots' });
  const body = h('div', { class: 'lesson-body' });
  let root = null;

  /** ما زلنا في نفس الجملة وعلى نفس الشاشة؟ (تُوقِف الصوت والمهل المعلّقة) */
  const live = (token) => token === state.token && (!root || root.isConnected);

  const fail = () => { state.errors++; };

  function paintDots() {
    dots.replaceChildren(...sentences.map((s, i) => h('li', {
      class: `dot${!state.done && i === state.index ? ' dot--now' : ''}`
        + `${state.done || i < state.index ? ' dot--done' : ''}`,
      'aria-label': `${MECHANIC_TITLES[s.mechanic]} ${arNum(i + 1)}`,
    }, state.done || i < state.index ? '✓' : arNum(i + 1))));
  }

  function next() {
    state.token++;
    if (state.index < sentences.length - 1) {
      state.index++;
      paint();
    } else {
      finish();
    }
  }

  /** بعد الإجابة الصحيحة: تُسمع الجملة كاملةً — نموذج القراءة الذي يبني الطلاقة. */
  async function sayAndGo(sentence) {
    const token = state.token;
    await audio.play(sentence.text);
    if (!live(token)) return;
    await new Promise((r) => setTimeout(r, AFTER_PICK_MS));
    if (live(token)) next();
  }

  /** خطأ لطيف: هزّة وتلوين ويسمع ما اختاره ليقارنه بما قرأ (لا يُلقَّن الجواب). */
  function wrong(btn, text) {
    fail();
    shake(btn);
    btn.classList.add('bad');
    setTimeout(() => btn.classList.remove('bad'), 700);
    if (text) audio.play(text);
  }

  const sentenceEl = (sentence, blank) => h('p', { class: 'sentence' },
    sentence.words.map((word, i) => (i === blank
      ? h('span', { class: 'sentence-blank', 'aria-label': 'الكلمة الناقصة' }, BLANK)
      : h('span', { class: 'sentence-word' }, word))));

  // ————— ١) اقرأ ونفّذ: جملة ← ثلاث صور —————

  function readView(sentence) {
    let locked = false;
    const options = pickOptions(sentence);
    audio.preload([sentence.text, ...options.map((w) => w.say)]);

    const row = h('div', { class: 'row picrow' }, options.map((word) => {
      const btn = h('button', {
        class: 'piccard',
        'aria-label': word.word,
        onclick: () => {
          if (locked) return;
          if (word !== sentence.target) return wrong(btn, word.say);
          locked = true;
          btn.classList.add('good');
          sayAndGo(sentence);
        },
      }, h('span', { class: 'pic-emoji' }, word.emoji));
      return btn;
    }));

    return h('div', {},
      h('h2', {}, MECHANIC_TITLES.read),
      h('p', { class: 'hint' }, 'اقرأ الجملة، ثم اختر صورتها'),
      sentenceEl(sentence, -1),
      row,
    );
  }

  // ————— ٢) رتّب الجملة: كلمات مبعثرة ببلاطات لعبة الكلمات —————

  function orderView(sentence) {
    const board = buildBoard({ tiles: sentence.words }, pool);
    let filled = 0;
    audio.preload([...board.map((t) => t.text), sentence.text]);

    const slotEls = sentence.words.map(() => h('span', { class: 'slot slot--word' }));
    const slots = h('div', { class: 'slots' }, slotEls);
    const built = h('div', { class: 'built' });

    const tiles = h('div', { class: 'tiles tiles--words' }, board.map((item) => {
      const btn = h('button', {
        class: 'tile tile--word',
        'aria-label': `كلمة ${item.text}`,
        onclick: () => onTile(item, btn),
      }, h('span', { class: 'tile-face' }, item.text));
      return btn;
    }));

    function onTile(item, btn) {
      if (filled >= sentence.words.length) return;

      // القياس على الكلمة المطلوبة في موضعها لا على ما لُمس (بند الحزمة ٨)
      const expected = sentence.words[filled];
      const skill = wordSkill(expected);
      const correct = item.text === expected;
      if (skill) progress.recordAttempt(skill.letter, skill.haraka, progress.KINDS.ORDER, correct);

      if (!correct) return wrong(btn, item.text);

      btn.disabled = true;
      btn.classList.add('tile--used');
      slotEls[filled].textContent = item.text;
      slotEls[filled].classList.add('slot--filled');
      filled++;
      if (filled < sentence.words.length) return void audio.play(item.text);

      for (const b of tiles.children) b.disabled = true;
      slots.classList.add('slots--done');
      built.replaceChildren(h('p', { class: 'sentence sentence--built' }, sentence.text));
      sayAndGo(sentence);
    }

    return h('div', {},
      h('h2', {}, MECHANIC_TITLES.order),
      h('button', {
        class: 'wgame-pic',
        'aria-label': `اسمع كلمة ${sentence.target.word}`,
        onclick: () => audio.play(sentence.target.say),
      },
        h('span', { class: 'pic-emoji' }, sentence.target.emoji),
        h('span', { class: 'pic-ear' }, '🔊'),
      ),
      h('p', { class: 'hint' }, 'اقرأ الكلمات، ثم رتّبها جملةً'),
      slots,
      built,
      tiles,
    );
  }

  // ————— ٣) أكمل الجملة: فراغ ← ثلاث كلمات مصوّرة —————

  function fillView(sentence) {
    let locked = false;
    const options = pickOptions(sentence, Math.random, true);
    const line = sentenceEl(sentence, sentence.blank);
    audio.preload([sentence.text, ...options.map((w) => w.say)]);

    const row = h('div', { class: 'row vrow' }, options.map((word) => {
      const btn = h('button', {
        class: 'vchip vchip--pic',
        'aria-label': word.word,
        onclick: () => {
          if (locked) return;
          if (word !== sentence.target) return wrong(btn, word.say);
          locked = true;
          btn.classList.add('good');
          line.replaceChildren(...sentence.words.map((w, i) => h('span', {
            class: `sentence-word${i === sentence.blank ? ' sentence-word--filled' : ''}`,
          }, w)));
          sayAndGo(sentence);
        },
      },
        h('span', { class: 'vchip-pic' }, word.emoji),
        h('span', { class: 'vchip-face' }, word.word),
      );
      return btn;
    }));

    return h('div', {},
      h('h2', {}, MECHANIC_TITLES.fill),
      h('p', { class: 'hint' }, 'اقرأ الجملة، واختر الكلمة الناقصة'),
      line,
      row,
    );
  }

  // ————— الشاشة —————

  const VIEWS = { read: readView, order: orderView, fill: fillView };

  function paint() {
    audio.stop();
    paintDots();
    const sentence = sentences[state.index];
    const view = VIEWS[sentence.mechanic](sentence);
    // الشخصية المرشدة تستقبل الطفل في أول جملة (DESIGN §٦)
    if (state.index === 0) body.replaceChildren(mascot('mascot mascot--hello'), view);
    else body.replaceChildren(view);
  }

  function finish() {
    audio.stop();
    state.done = true;
    state.token++;
    paintDots();

    const stars = starsForGame(state.errors, sentences.length);
    const before = progress.getStars(nodeId);
    progress.setStars(nodeId, stars);
    const last = !progress.nextNode();

    body.replaceChildren(h('div', { class: 'celebrate' },
      mascot('mascot mascot--cheer'),
      h('div', { class: 'celebrate-face' }, '📖'),
      h('h2', {}, 'أحسنت!'),
      starsRow(stars, 'big-stars'),
      h('p', { class: 'hint' }, state.errors === 0
        ? `قرأتَ ${arCount(sentences.length, ['جملة', 'جملتين', 'جمل', 'جملة'])} بلا خطأ! 🎉`
        : 'كل جملة قرأتها تقرّبك من القصة.'),
      before > stars && h('p', { class: 'hint' }, `نجومك السابقة محفوظة: ${arNum(before)} ★`),
      last && h('p', { class: 'note' }, '🎉 أتممتَ الرحلة كلها — من الحرف الأول إلى سلّم الجمل.'),
      h('div', { class: 'row foot' },
        h('button', { class: 'btn btn--primary', onclick: () => go('#/') }, '→ الخريطة'),
        h('button', {
          class: 'btn',
          onclick: () => {
            Object.assign(state, { index: 0, errors: 0, done: false });
            state.token++;
            paint();
          },
        }, '↻ أعِد'),
      ),
    ));
  }

  paint();

  root = h('div', { class: 'screen lesson ladder', css: { '--accent': SENTENCE_ACCENT } },
    topbar(
      h('button', {
        class: 'btn',
        onclick: () => {
          if (state.index === 0 || state.done || confirm('تريد الخروج قبل الإتمام؟')) go('#/');
        },
      }, '→ الخريطة'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, `جمل ${rung.garden.title} · درجة ${arNum(rung.index)}`),
    ),
    h('main', { class: 'screen-card' },
      dots,
      body,
      DEV && h('div', { class: 'dev' },
        h('div', { class: 'dev-title' }, 'أدوات التجربة (?dev=1)'),
        h('div', { class: 'dev-row' },
          h('span', {}, sentences.map((s) => MECHANIC_TITLES[s.mechanic]).join('، ')),
          h('button', { class: 'btn', onclick: () => toast(`أخطاء: ${arNum(state.errors)}`) }, 'عدّ الأخطاء'),
          h('button', { class: 'btn', onclick: finish }, 'إنهاء الآن'),
        )),
    ),
  );
  return root;
}
