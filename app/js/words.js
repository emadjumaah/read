// لعبة تركيب الكلمات — «ركّب واقرأ» (§٤.٤ من المنهج)، وهي عقدة ختام كل مجموعة:
// الطفل يرى الصورة، ويبني الكلمة من مقاطعها بالترتيب على طريقة القاعدة النورانية.
//
// المفكوكية ١٠٠٪: بلاطات اللوح = مقاطع الكلمة + مشتّت أو اثنان من مقاطع مدروسة،
// والمقاطع المدروسة هي مقاطع كلمات المجموعات حتى هذه المجموعة — وحروفها كلها
// مدروسة بالضرورة، فلا يظهر للطفل حرف ولا حركة لم يأتِ دورها.

import { GROUPS, bareLetters } from './curriculum.js';
import * as progress from './progress.js';
import * as audio from './audio.js';
import {
  h, toast, go, arNum, starsRow, topbar, wordText,
  accentFor, shuffle, shake, DEV,
} from './ui.js';

const MAX_DISTRACTORS = 2;   // «مشتّت أو اثنان» — والقصير (مقطعان) يكفيه واحد
const BEFORE_SAY_MS = 250;   // سكتة بين آخر مقطع والكلمة كاملة (بَيْ … تْ … بَيْتْ)
const AFTER_WORD_MS = 900;   // مهلة بعد سماع الكلمة كاملة قبل الانتقال تلقائياً

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * المقاطع المدروسة حتى نهاية مجموعة: مقاطع كلمات المجموعات حتى هذه (بلا تكرار).
 * تفشل مغلقةً: معرّف مجهول ⇒ لا مقطع مدروساً (لا مشتّتات أصلاً).
 */
export function syllablePool(groupId) {
  const out = [];
  for (const group of GROUPS) {
    for (const word of group.words) out.push(...word.tiles);
    if (group.id === groupId) return [...new Set(out)];
  }
  return [];
}

/** النجوم: ٣ للوح بلا خطأ، ٢ ما دامت الأخطاء ≤ عدد الكلمات (زلّة لكل كلمة)، وإلا ١. */
export const starsForGame = (errors, wordCount) => (errors === 0 ? 3 : errors <= wordCount ? 2 : 1);

/**
 * لوح كلمة: مقاطعها + المشتّتات، مخلوطة.
 * المشتّت يُفضَّل أن يكون قريباً كي يقرأ الطفل لا يخمّن: أولاً ما كان بنفس الحروف
 * وحركة أخرى («سَ» مقابل «سْ»)، ثم ما شارك الحرف الأول، ثم أيّ مقطع مدروس.
 * ويُعاد الخلط إن جاءت المقاطع مرتّبة أصلاً في أول اللوح.
 * @returns {{text:string, id:string, distractor:boolean}[]}
 */
export function buildBoard(word, pool, rnd = Math.random) {
  const need = word.tiles.length <= 2 ? 1 : MAX_DISTRACTORS;
  const avail = pool.filter((t) => !word.tiles.includes(t));
  const sameLetters = new Set(word.tiles.map(bareLetters));
  const sameFirst = new Set(word.tiles.map((t) => bareLetters(t)[0]));

  const near = [], kin = [], rest = [];
  for (const t of avail) {
    if (sameLetters.has(bareLetters(t))) near.push(t);
    else if (sameFirst.has(bareLetters(t)[0])) kin.push(t);
    else rest.push(t);
  }
  const distractors = [...shuffle(near, rnd), ...shuffle(kin, rnd), ...shuffle(rest, rnd)]
    .slice(0, Math.min(need, avail.length));

  const items = [
    ...word.tiles.map((text, i) => ({ text, id: `t${i}`, distractor: false })),
    ...distractors.map((text, i) => ({ text, id: `d${i}`, distractor: true })),
  ];

  let board = shuffle(items, rnd);
  for (let i = 0; i < 8 && word.tiles.every((t, k) => board[k].text === t); i++) {
    board = shuffle(items, rnd);
  }
  return board;
}

// ————— الشاشة —————

export function renderWordsGame(groupId) {
  const group = progress.findGroup(groupId);
  if (!group) return null;

  const words = group.words;
  const pool = syllablePool(groupId);
  const nodeId = progress.nodeId(groupId, progress.WORDS_PART);

  // token: يُبطل ما علّقناه من صوت ومهل حين ينتقل الطفل قبل أن ينتهي
  const state = { index: 0, errors: 0, filled: 0, token: 0, done: false };

  const dots = h('ol', { class: 'dots' });
  const body = h('div', { class: 'wgame-body' });
  let root = null;   // جذر الشاشة — يُستعمل لمعرفة أنها ما زالت معروضة

  /** هل ما زلنا في نفس الكلمة وعلى نفس الشاشة؟ (تُوقِف الصوت والمهل المعلّقة) */
  const live = (token) => token === state.token && (!root || root.isConnected);

  function paintDots() {
    dots.replaceChildren(...words.map((word, i) => h('li', {
      class: `dot${!state.done && i === state.index ? ' dot--now' : ''}${state.done || i < state.index ? ' dot--done' : ''}`,
      'aria-label': word.say,
    }, word.emoji)));
  }

  function paint() {
    audio.stop();
    paintDots();
    body.replaceChildren(wordView());
  }

  function nextWord() {
    state.token++;
    if (state.index < words.length - 1) {
      state.index++;
      paint();
    } else {
      finish();
    }
  }

  // ————— لوح كلمة واحدة —————

  function wordView() {
    const word = words[state.index];
    const board = buildBoard(word, pool);
    state.filled = 0;

    // تحميل أصوات هذا اللوح وحده (لا كل مقاطع المجموعات السابقة): ما سيُنقر لا أكثر
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
      if (state.filled >= word.tiles.length) return;      // اكتملت الكلمة

      if (item.text !== word.tiles[state.filled]) {
        state.errors++;
        shake(btn);
        btn.classList.add('bad');
        setTimeout(() => btn.classList.remove('bad'), 700);
        audio.play(item.text);        // يسمع ما اختاره فيقارنه بما تحتاجه الكلمة
        return;
      }

      btn.disabled = true;
      btn.classList.add('tile--used');
      const slot = slotEls[state.filled];
      slot.textContent = item.text;
      slot.classList.add('slot--filled');
      state.filled++;

      if (state.filled < word.tiles.length) audio.play(item.text);
      else complete(item.text);
    }

    async function complete(lastText) {
      for (const b of tiles.children) b.disabled = true;   // اللوح انتهى: لا نقر بعده
      slots.classList.add('slots--done');
      built.replaceChildren(
        h('div', { class: 'word-built' }, wordText(word)),
        h('p', { class: 'hint' }, 'أحسنت! ✓'),
      );
      foot.replaceChildren(h('button', {
        class: 'btn btn--primary btn--wide next',
        onclick: nextWord,
      }, state.index < words.length - 1 ? 'الكلمة التالية ←' : 'أنهِ اللعبة ←'));

      // المقطع الأخير ثم الكلمة كاملة ثم الانتقال — وكل خطوة تتوقّف إن سبقنا الطفل
      // بزرّ «التالي» أو غادر الشاشة، كي لا يتسرّب صوت كلمة إلى الكلمة التي بعدها.
      const token = state.token;
      await audio.play(lastText);
      if (!live(token)) return;
      await sleep(BEFORE_SAY_MS);
      if (!live(token)) return;
      await audio.play(word.say);
      if (!live(token)) return;
      await sleep(AFTER_WORD_MS);
      if (!live(token)) return;
      nextWord();
    }

    return h('div', {},
      h('p', { class: 'hint' }, `الكلمة ${arNum(state.index + 1)} من ${arNum(words.length)}`),
      h('button', {
        class: 'wgame-pic',
        'aria-label': `اسمع كلمة ${word.say}`,
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

  // ————— الختام —————

  function finish() {
    audio.stop();
    state.done = true;
    state.token++;
    paintDots();

    const stars = starsForGame(state.errors, words.length);
    const before = progress.getStars(nodeId);
    progress.setStars(nodeId, stars);

    const nextGroup = GROUPS[GROUPS.indexOf(group) + 1];
    const opened = nextGroup && progress.isGroupUnlocked(nextGroup.id);

    const line = state.errors === 0 ? 'بنيتَ الكلمات كلها بلا خطأ! 🎉'
      : stars === 2 ? 'أحسنت — كلمات المجموعة كلها صارت في يدك.'
        : 'أتممتَ اللعبة، وبالإعادة تزيد نجومك.';

    body.replaceChildren(h('div', { class: 'celebrate' },
      h('div', { class: 'celebrate-face' }, '🧩'),
      h('h2', {}, 'أحسنت!'),
      starsRow(stars, 'big-stars'),
      h('p', { class: 'hint' }, line),
      before > stars && h('p', { class: 'hint' }, `نجومك السابقة محفوظة: ${arNum(before)} ★`),
      opened && h('p', { class: 'note' }, `🎁 فُتحت ${nextGroup.title}!`),
      h('div', { class: 'row foot' },
        h('button', { class: 'btn btn--primary', onclick: () => go('#/') }, '→ الخريطة'),
        h('button', {
          class: 'btn',
          onclick: () => {
            Object.assign(state, { index: 0, errors: 0, filled: 0, done: false });
            state.token++;
            paint();
          },
        }, '↻ أعِد اللعبة'),
      ),
    ));
  }

  paint();

  root = h('div', { class: 'screen wgame', css: { '--accent': accentFor(group) } },
    topbar(
      h('button', {
        class: 'btn',
        // الخروج من منتصف اللعبة يُستأذَن فيه، أما قبل بدئها أو بعد إتمامها فلا
        onclick: () => {
          const started = state.index > 0 || state.filled > 0;
          if (!started || state.done || confirm('تريد الخروج قبل إتمام اللعبة؟')) go('#/');
        },
      }, '→ الخريطة'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, group.title),
    ),
    h('main', { class: 'screen-card' },
      h('h2', {}, 'ركّب الكلمة'),
      dots,
      body,
      DEV && h('div', { class: 'dev' },
        h('div', { class: 'dev-title' }, 'أدوات التجربة (?dev=1)'),
        h('div', { class: 'dev-row' },
          h('span', {}, `المقاطع المدروسة: ${arNum(pool.length)}`),
          h('button', { class: 'btn', onclick: () => toast(`أخطاء: ${arNum(state.errors)}`) }, 'عدّ الأخطاء'),
          h('button', { class: 'btn', onclick: finish }, 'إنهاء اللعبة الآن'),
        )),
    ),
  );
  return root;
}
