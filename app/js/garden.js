// بساتين الموضوعات — «حديقة الكلمات» (الحزمة ٧، ROADMAP §المرحلة ب).
//
// موضعها من الرحلة: بعد المرحلة القرآنية، فحصيلة الطفل كاملة — كل الحروف وكل
// العلامات — ولذلك تُقاس هنا **كلمةٌ جديدة** لا حرفٌ جديد: الرصيد لا الشيفرة.
//
// حلقة الباقة ثلاث خطوات، كل واحدة ترث ميكانيكية مجرَّبة بدل أن تخترع للطفل ثالثةً:
//   ١) شاهد واسمع — الكلمة مكتوبة مع صورتها، نقرةٌ تُسمعها (نمط كلمات المرحلة القرآنية).
//   ٢) اقرأ واختر — صورة ← ثلاث كلمات مكتوبة، ولا صوت قبل الاختيار (ميكانيكية الجلسة ٦).
//   ٣) ركّب الكلمة — من مقاطعها ومشتّتاتها (ميكانيكية لعبة الكلمات، الجلسة ٣).
//
// **القياس موصول** (بند الحزمة ٧): تمرين التركيب يسجّل كل محاولة بمفتاح
// (حرف × حركة × تمرين) كما في `words.js` تماماً، فتدخل مباشرةً في التكرار المتباعد
// وجلسة المراجعة اليومية. أمّا «اقرأ واختر» فالمقيس فيه كلمةٌ كاملة لا حرفٌ بحركة،
// فلا يُكتب في سجلّ المهارات (كما في دروس المهارات والمرحلة القرآنية) — انظر التقرير.

import { syllableSkill } from './curriculum.js';
import { bundleById } from './lexicon.js';
import * as progress from './progress.js';
import * as audio from './audio.js';
import { buildBoard, starsForGame } from './words.js';
import { steppedScreen, readQuizStep, nextButton } from './screens.js';
import { h, arNum, arCount, accentForGarden, shake } from './ui.js';

const BEFORE_SAY_MS = 250;   // سكتة بين آخر مقطع والكلمة كاملة
const AFTER_WORD_MS = 700;   // مهلة بعد سماع الكلمة قبل الانتقال إلى التي بعدها

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const nodeIdOf = (bundleId) => `garden:${bundleId}`;

/**
 * مقاطع الباقة ومشتّتاتها: مقاطع كلمات البستان كله.
 * كلها مفكوكة بالضرورة (البساتين بعد الرحلة كلها)، والقرب يجعل الطفل يقرأ لا يخمّن.
 */
export const bundlePool = (bundle) =>
  [...new Set(bundle.garden.words.flatMap((w) => w.tiles))];

// ————— ١) شاهد واسمع —————

function showStep(bundle, { next }, heard) {
  heard.clear();               // إعادة الباقة تبدأ العدّ من جديد
  const foot = h('p', { class: 'hint' });
  const paintFoot = () => {
    foot.textContent = `سمعتَ ${arNum(heard.size)} من `
      + arCount(bundle.words.length, ['كلمة', 'كلمتين', 'كلمات', 'كلمة']);
  };

  const row = h('div', { class: 'row wordrow' }, bundle.words.map((word) => {
    const btn = h('button', {
      class: 'example-word',
      'aria-label': `اسمع كلمة ${word.text}`,
      onclick: () => {
        btn.classList.add('good');
        heard.add(word.word);
        paintFoot();
        audio.play(word.say);
      },
    },
      h('span', { class: 'word-emoji' }, word.emoji),
      h('span', { class: 'word-text' }, word.text),
    );
    return btn;
  }));

  paintFoot();
  audio.preload(bundle.words.map((w) => w.say));
  return h('div', {},
    h('h2', {}, 'شاهد واسمع'),
    h('p', { class: 'hint' }, 'اضغط كل كلمة لتسمعها، وانظر إلى حروفها وأنت تسمع'),
    row,
    foot,
    nextButton(next),
  );
}

// ————— ٣) ركّب الكلمة —————

function buildStep(bundle, { next, fail }) {
  const pool = bundlePool(bundle);
  const state = { index: 0, token: 0 };

  const wrap = h('div', {});
  const dots = h('ol', { class: 'dots' });
  const body = h('div', { class: 'wgame-body' });

  const paintDots = () => dots.replaceChildren(...bundle.words.map((word, i) => h('li', {
    class: `dot${i === state.index ? ' dot--now' : ''}${i < state.index ? ' dot--done' : ''}`,
    'aria-label': word.text,
  }, word.emoji)));

  /** ما زلنا في نفس الكلمة وعلى نفس الشاشة؟ (تُوقِف الصوت والمهل المعلّقة) */
  const live = (token) => token === state.token && wrap.isConnected;

  function nextWord() {
    state.token++;
    if (state.index < bundle.words.length - 1) {
      state.index++;
      paint();
    } else {
      next();
    }
  }

  function wordView() {
    const word = bundle.words[state.index];
    const board = buildBoard(word, pool);
    let filled = 0;

    audio.preload([...board.map((t) => t.text), word.say]);

    const slotEls = word.tiles.map(() => h('span', { class: 'slot' }));
    const slots = h('div', { class: 'slots' }, slotEls);
    const built = h('div', { class: 'built' });
    const foot = h('div', { class: 'row foot' });

    const tiles = h('div', { class: 'tiles' }, board.map((item) => {
      const btn = h('button', {
        class: 'tile',
        'aria-label': `مقطع ${item.text}`,
        onclick: () => onTile(item, btn),
      }, h('span', { class: 'tile-face' }, item.text));
      return btn;
    }));

    function onTile(item, btn) {
      if (filled >= word.tiles.length) return;

      // القياس على المقطع المطلوب لا على ما اختاره: الحرف × حركته × تمرين التركيب
      const expected = word.tiles[filled];
      const skill = syllableSkill(expected);
      const correct = item.text === expected;
      if (skill) progress.recordAttempt(skill.letter, skill.haraka, progress.KINDS.BUILD, correct);

      if (!correct) {
        fail();
        shake(btn);
        btn.classList.add('bad');
        setTimeout(() => btn.classList.remove('bad'), 700);
        audio.play(item.text);        // يسمع ما اختاره فيقارنه بما تحتاجه الكلمة
        return;
      }

      btn.disabled = true;
      btn.classList.add('tile--used');
      slotEls[filled].textContent = item.text;
      slotEls[filled].classList.add('slot--filled');
      filled++;

      if (filled < word.tiles.length) return void audio.play(item.text);
      complete(item.text);
    }

    async function complete(lastText) {
      for (const b of tiles.children) b.disabled = true;
      slots.classList.add('slots--done');
      built.replaceChildren(
        h('div', { class: 'word-built' }, word.text),
        h('p', { class: 'hint' }, 'أحسنت! ✓'),
      );
      foot.replaceChildren(h('button', {
        class: 'btn btn--primary btn--wide next',
        onclick: nextWord,
      }, state.index < bundle.words.length - 1 ? 'الكلمة التالية ←' : 'أنهِ الباقة ←'));

      const token = state.token;
      await audio.play(lastText);
      if (!live(token)) return;
      await sleep(BEFORE_SAY_MS);
      if (!live(token)) return;
      await audio.play(word.say);       // المقاطع ثم الكلمة كاملة (تهجّي النورانية)
      if (!live(token)) return;
      await sleep(AFTER_WORD_MS);
      if (!live(token)) return;
      nextWord();
    }

    return h('div', {},
      h('p', { class: 'hint' }, `الكلمة ${arNum(state.index + 1)} من ${arNum(bundle.words.length)}`),
      h('button', {
        class: 'wgame-pic',
        'aria-label': `اسمع كلمة ${word.text}`,
        onclick: () => audio.play(word.say),
      },
        h('span', { class: 'pic-emoji' }, word.emoji),
        h('span', { class: 'pic-ear' }, '🔊'),
      ),
      h('p', { class: 'hint' }, 'اضغط الصورة لتسمعها، ثم رتّب المقاطع'),
      slots,
      built,
      tiles,
      foot,
    );
  }

  function paint() {
    audio.stop();
    paintDots();
    body.replaceChildren(wordView());
  }

  paint();
  wrap.append(h('h2', {}, 'ركّب الكلمة'), dots, body);
  return wrap;
}

// ————— الشاشة —————

/** شاشة باقةٍ من بستان بمعرّفها («home:1») — أو null إن كان مجهولاً. */
export function renderGarden(bundleId) {
  const bundle = bundleById(bundleId);
  if (!bundle) return null;

  const garden = bundle.garden;
  const words = bundle.words;
  const heard = new Set();

  return steppedScreen({
    nodeId: nodeIdOf(bundle.id),
    className: 'garden',
    accent: accentForGarden(garden),
    pill: `${garden.title} · باقة ${arNum(bundle.index)}`,
    face: garden.emoji,
    steps: [
      { title: 'شاهد واسمع', build: (api) => showStep(bundle, api, heard) },
      { title: 'اقرأ واختر', build: (api) => readQuizStep(words, api) },
      { title: 'ركّب الكلمة', build: (api) => buildStep(bundle, api) },
    ],
    celebrate: (state) => ({
      stars: starsForGame(state.errors, words.length),
      line: state.errors === 0
        ? `${arCount(words.length, ['كلمة جديدة', 'كلمتان جديدتان', 'كلمات جديدة', 'كلمة جديدة'])} بلا خطأ! 🎉`
        : 'صارت هذه الكلمات في رصيدك — وستلقاها في قراءتك.',
    }),
  });
}
