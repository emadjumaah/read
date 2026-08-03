// جلسة المراجعة اليومية — تُولَّد بالتكرار المتباعد من سجلّ المهارات (METHOD §٦).
//
// قيدان يحكمان هذا الملف:
// ١) **لا محتوى جديداً**: المراجعة لا تعرض إلا تمارين المحتوى القائم (تمييز الحرف،
//    تمييز الحركة، تركيب كلمة من مقاطعها، ترتيب جملة قرأها في سلّمها)، فكلّ نصّ تنطقه
//    له ملف مولَّد أو مكانٌ في قائمة الانتظار — لا نصّ يُؤلَّف من أجل المراجعة.
// ٢) **المفكوكية ١٠٠٪**: الحروف من `progress.studiedLetters()` (ما أتمّ دروسه فعلاً)
//    والكلمات من `progress.studiedWords()` (كل حروفها مدروسة)، والجمل من
//    `progress.studiedSentences()` (درجاتٌ أتمّها)، والمشتّتات من مقاطعها وكلماتها.
//
// **لا مهارةَ تُقاس بلا تمرينٍ يراجعها**: بدخول تمرين «رتّب» في الحزمة ٨ صار لكل نوع
// في `KINDS` تمرينُه هنا — وإلا لبقيت مهاراتُه في صندوق ليتنر الأول أبداً، فيكذب
// «الحروف المتقنة» في لوحة وليّ الأمر على وليّ الأمر.

import { HARAKAT, markOf, syllableSkill, wordSkill } from './curriculum.js';
import * as progress from './progress.js';
import * as audio from './audio.js';
import { buildBoard } from './words.js';
import {
  h, toast, go, arNum, arCount, starsRow, topbar, letterTitle, wordText,
  mascot, shuffle, pick, shake, DEV,
} from './ui.js';

export const SESSION_SIZE = 6;    // جلسة قصيرة تُنجَز في دقائق (لا تُرهق طفل السادسة)
export const MAX_BUILD = 2;       // تركيب الكلمات أطول التمارين: اثنان على الأكثر
export const MAX_ORDER = 1;       // وترتيب الجملة أطولها: واحد
const OPTIONS = 3;
const ACCENT = 'var(--accent-skills)';   // المراجعة تثبيت مهارات — لونها لون المهارات

/** نجوم الجلسة: ٣ بلا خطأ، ٢ ما دامت الأخطاء ≤ عدد التمارين، وإلا ١ (عتبة متناسبة). */
export const starsForReview = (errors, items) => (errors === 0 ? 3 : errors <= items ? 2 : 1);

// ————— بناء التمارين —————

function quizItem(letter, haraka, letters, rnd) {
  const pool = [...new Set(letters)].filter((c) => c !== letter);
  if (!pool.length) return null;
  const mark = markOf(haraka) || HARAKAT[0].mark;
  const options = shuffle([letter, ...shuffle(pool, rnd).slice(0, OPTIONS - 1)], rnd);
  return { id: `quiz|${letter}|${haraka}`, kind: progress.KINDS.QUIZ, letter, haraka, mark, options };
}

function harakaItem(letter, haraka, rnd) {
  const target = HARAKAT.find((k) => k.key === haraka) || pick(HARAKAT, rnd);
  return {
    id: `haraka|${letter}`,
    kind: progress.KINDS.HARAKA,
    letter,
    haraka: target.key,
    mark: target.mark,
    options: HARAKAT.map((k) => ({ ...k })),
  };
}

function buildItem(word, words, rnd) {
  if (!word) return null;
  const pool = [...new Set(words.flatMap((w) => w.tiles))];
  return {
    id: `build|${word.say}`,
    kind: progress.KINDS.BUILD,
    word,
    board: buildBoard(word, pool, rnd),
  };
}

/**
 * تمرين «رتّب الجملة» — لوحٌ واحد من سلّم الجمل (الحزمة ٨).
 * مادّته جملةٌ أتمّ درجتها، وبلاطاته كلماتها ومشتّتاتٌ من كلمات جملٍ رتّبها مثلها
 * (فكلّها منطوقةٌ محسوبة، ولا نصّ جديد يدخل المراجعة).
 */
function orderItem(sentence, sentences, rnd) {
  if (!sentence) return null;
  const pool = [...new Set(sentences.flatMap((s) => s.words))];
  return {
    id: `order|${sentence.id}`,
    kind: progress.KINDS.ORDER,
    sentence,
    board: buildBoard({ tiles: sentence.words }, pool, rnd),
  };
}

/** كلمة تحوي مقطعاً بهذه المهارة (حرف × حركة) — لإعادة ما تعثّر فيه في سياقه. */
function wordForSkill(letter, haraka, words, rnd) {
  const hits = words.filter((w) => w.tiles.some((t) => {
    const s = syllableSkill(t);
    return s && s.letter === letter && s.haraka === haraka;
  }));
  return hits.length ? pick(hits, rnd) : null;
}

/** جملةٌ فيها كلمةٌ بهذه المهارة — يُقاس فيها ما قِيس في السلّم (أول حرف متحرّك). */
function sentenceForSkill(letter, haraka, sentences, rnd) {
  const hits = sentences.filter((s) => s.words.some((w) => {
    const k = wordSkill(w);
    return k && k.letter === letter && k.haraka === haraka;
  }));
  return hits.length ? pick(hits, rnd) : null;
}

function itemForSkill(skill, letters, words, sentences, rnd) {
  if (skill.kind === progress.KINDS.QUIZ) return quizItem(skill.letter, skill.haraka, letters, rnd);
  if (skill.kind === progress.KINDS.HARAKA) return harakaItem(skill.letter, skill.haraka, rnd);
  if (skill.kind === progress.KINDS.BUILD) {
    return buildItem(wordForSkill(skill.letter, skill.haraka, words, rnd), words, rnd);
  }
  if (skill.kind === progress.KINDS.ORDER) {
    return orderItem(sentenceForSkill(skill.letter, skill.haraka, sentences, rnd), sentences, rnd);
  }
  return null;
}

/**
 * جلسة اليوم: المستحقّ من سجلّ المهارات أولاً (الأضعف أولاً)، ثم — إن لم يكتمل
 * العدد — تمارين من حصيلة الطفل تنويعاً. تعود [] إن لم يبلغ الطفل حرفين مدروسين.
 * دالّة خالصة: كل ما تحتاجه يُحقَن، فتُختبر في node بلا متصفّح.
 */
export function buildSession({
  letters = [], words = [], sentences = [], due = [], size = SESSION_SIZE, rnd = Math.random,
} = {}) {
  const known = [...new Set(letters)];
  if (known.length < 2) return [];

  const items = [];
  const seen = new Set();
  const longs = { [progress.KINDS.BUILD]: MAX_BUILD, [progress.KINDS.ORDER]: MAX_ORDER };
  const used = { [progress.KINDS.BUILD]: 0, [progress.KINDS.ORDER]: 0 };

  const add = (item) => {
    if (!item || seen.has(item.id)) return false;
    if (item.kind in longs) {
      if (used[item.kind] >= longs[item.kind]) return false;
      used[item.kind]++;
    }
    seen.add(item.id);
    items.push(item);
    return true;
  };

  for (const skill of due) {
    if (items.length >= size) break;
    // تمييز الحرف والحركة يحتاج الحرف في جدول حصيلته؛ أمّا التركيب والترتيب فمادّتهما
    // كلمةٌ أو جملةٌ من حصيلته — فشرطُهما وجودها (الهمزة والتاء المربوطة تُدرَّسان في
    // المرحلة القرآنية ولا تظهران في المجموعات، وترد في كلمات البساتين)، وإلا فلا تمرين.
    if (!(skill.kind in longs) && !known.includes(skill.letter)) continue;
    add(itemForSkill(skill, known, words, sentences, rnd));
  }

  // تنويع الباقي: تمييز الحرف والحركة على حروف مدروسة، وتركيب كلمة، وترتيب جملة
  const fillers = [
    ...shuffle(known, rnd).map((c) => () => quizItem(c, HARAKAT[0].key, known, rnd)),
    ...shuffle(known, rnd).map((c) => () => harakaItem(c, pick(HARAKAT, rnd).key, rnd)),
    ...shuffle(words, rnd).map((w) => () => buildItem(w, words, rnd)),
    ...shuffle(sentences, rnd).map((s) => () => orderItem(s, sentences, rnd)),
  ];
  for (let i = 0; items.length < size && i < fillers.length * 2; i++) {
    add(fillers[i % fillers.length]());
  }

  return items.slice(0, size);
}

/** كل النصوص التي قد ينطقها تمرين — للتحميل المسبق ولفحص تغطية الصوت في الاختبارات. */
export function itemTexts(item) {
  if (item.kind === progress.KINDS.QUIZ) return item.options.map((c) => c + item.mark);
  if (item.kind === progress.KINDS.HARAKA) return item.options.map((k) => item.letter + k.mark);
  if (item.kind === progress.KINDS.BUILD) return [...item.board.map((t) => t.text), item.word.say];
  if (item.kind === progress.KINDS.ORDER) {
    return [...item.board.map((t) => t.text), item.sentence.text, item.sentence.target.say];
  }
  return [];
}

// ————— الشاشة —————

export function renderReview() {
  const letters = progress.studiedLetters();
  const words = progress.studiedWords(letters);
  const sentences = progress.studiedSentences().filter((s) => s.mechanic === 'order');
  const items = buildSession({ letters, words, sentences, due: progress.dueSkills() });
  if (!items.length) return null;   // لا حصيلة بعدُ: main.js يعيده إلى الخريطة

  const state = { index: 0, errors: 0, right: 0, done: false, token: 0 };

  const dots = h('ol', { class: 'dots' });
  const body = h('div', { class: 'lesson-body' });
  let root = null;

  audio.preload(items.slice(0, 2).flatMap(itemTexts));

  function paintDots() {
    dots.replaceChildren(...items.map((item, i) => h('li', {
      class: `dot${!state.done && i === state.index ? ' dot--now' : ''}${state.done || i < state.index ? ' dot--done' : ''}`,
      'aria-label': `تمرين ${arNum(i + 1)}`,
    }, i < state.index || state.done ? '✓' : arNum(i + 1))));
  }

  function paint() {
    audio.stop();
    state.token++;
    paintDots();
    const item = items[state.index];
    audio.preload(itemTexts(item));
    body.replaceChildren(
      item.kind === progress.KINDS.BUILD ? buildView(item)
        : item.kind === progress.KINDS.ORDER ? orderView(item)
          : item.kind === progress.KINDS.HARAKA ? harakaView(item)
            : quizView(item));
    const ahead = items[state.index + 1];
    if (ahead) audio.preload(itemTexts(ahead));
  }

  function next() {
    if (state.index < items.length - 1) {
      state.index++;
      paint();
    } else {
      finish();
    }
  }

  const score = (item, letter, haraka, correct) => {
    progress.recordAttempt(letter, haraka, item.kind, correct);
    if (correct) state.right++;
    else state.errors++;
  };

  /** خطأ: هزّة وتلوين ثم إعادة السماع — بلا تلقين الجواب (كما في الدرس واللعبة). */
  function wrong(btn, replay) {
    shake(btn);
    btn.classList.add('bad');
    setTimeout(() => btn.classList.remove('bad'), 700);
    if (replay) setTimeout(replay, 450);
  }

  // ————— ١) ميّز بأذنك: أيَّ حرف سمعت؟ —————

  function quizView(item) {
    let locked = false;
    const play = () => audio.play(item.letter + item.mark);
    const row = h('div', { class: 'row vrow' }, item.options.map((ch) => {
      const text = ch + item.mark;
      const btn = h('button', {
        class: 'vchip vchip--big',
        'aria-label': text,
        onclick: () => {
          if (locked) return;
          const correct = ch === item.letter;
          score(item, item.letter, item.haraka, correct);
          if (!correct) return wrong(btn, play);
          locked = true;
          btn.classList.add('good');
          audio.play(text);
          setTimeout(next, 750);
        },
      }, h('span', { class: 'vchip-face' }, text));
      return btn;
    }));

    setTimeout(play, 250);
    return h('div', {},
      h('h2', {}, 'أيَّ حرف سمعت؟'),
      h('div', { class: 'row foot' },
        h('button', { class: 'btn btn--primary', onclick: play }, '🔊 اسمع مرة أخرى')),
      row,
    );
  }

  // ————— ٢) الحركات: أيَّ حركة سمعت؟ —————

  function harakaView(item) {
    let locked = false;
    const play = () => audio.play(item.letter + item.mark);
    const row = h('div', { class: 'row vrow' }, item.options.map((k) => {
      const text = item.letter + k.mark;
      const btn = h('button', {
        class: 'vchip',
        'aria-label': `${item.letter} بال${k.name}`,
        onclick: () => {
          if (locked) return;
          const correct = k.key === item.haraka;
          score(item, item.letter, item.haraka, correct);
          if (!correct) return wrong(btn, play);
          locked = true;
          btn.classList.add('good');
          audio.play(text);
          setTimeout(next, 750);
        },
      },
        h('span', { class: 'vchip-face' }, text),
        h('small', {}, k.name));
      return btn;
    }));

    setTimeout(play, 250);
    return h('div', {},
      h('h2', {}, `أيَّ حركة سمعت مع ${letterTitle(item.letter)}؟`),
      h('div', { class: 'row foot' },
        h('button', { class: 'btn btn--primary', onclick: play }, '🔊 اسمع مرة أخرى')),
      row,
    );
  }

  // ————— ٣) ركّب الكلمة (لوح واحد من لعبة الكلمات) —————

  function buildView(item) {
    const { word, board } = item;
    let filled = 0;
    const token = state.token;

    const slotEls = word.tiles.map(() => h('span', { class: 'slot' }));
    const slots = h('div', { class: 'slots' }, slotEls);
    const built = h('div', { class: 'built' });

    const tiles = h('div', { class: 'tiles' }, board.map((tile) => {
      const btn = h('button', {
        class: 'tile',
        'aria-label': `مقطع ${tile.text}`,
        onclick: () => onTile(tile, btn),
      }, h('span', { class: 'tile-face' }, tile.text));
      return btn;
    }));

    function onTile(tile, btn) {
      if (filled >= word.tiles.length) return;
      const expected = word.tiles[filled];
      const skill = syllableSkill(expected) || {};
      const correct = tile.text === expected;
      score(item, skill.letter, skill.haraka, correct);
      if (!correct) {
        audio.play(tile.text);        // يسمع ما اختاره فيقارنه بما تحتاجه الكلمة
        return wrong(btn);
      }
      btn.disabled = true;
      btn.classList.add('tile--used');
      slotEls[filled].textContent = tile.text;
      slotEls[filled].classList.add('slot--filled');
      filled++;
      if (filled < word.tiles.length) return void audio.play(tile.text);

      for (const b of tiles.children) b.disabled = true;
      slots.classList.add('slots--done');
      built.replaceChildren(h('div', { class: 'word-built' }, wordText(word)));
      (async () => {
        await audio.play(word.say);
        if (token !== state.token || !root?.isConnected) return;   // سبقنا الطفل أو غادر
        next();
      })();
    }

    return h('div', {},
      h('h2', {}, 'ركّب الكلمة'),
      h('button', {
        class: 'wgame-pic',
        'aria-label': `اسمع كلمة ${word.say}`,
        onclick: () => audio.play(word.say),
      },
        h('span', { class: 'pic-emoji' }, word.emoji),
        h('span', { class: 'pic-ear' }, '🔊'),
      ),
      slots,
      built,
      tiles,
    );
  }

  // ————— ٤) رتّب الجملة (لوح واحد من سلّم الجمل) —————

  function orderView(item) {
    const { sentence, board } = item;
    let filled = 0;
    const token = state.token;

    const slotEls = sentence.words.map(() => h('span', { class: 'slot slot--word' }));
    const slots = h('div', { class: 'slots' }, slotEls);
    const built = h('div', { class: 'built' });

    const tiles = h('div', { class: 'tiles tiles--words' }, board.map((tile) => {
      const btn = h('button', {
        class: 'tile tile--word',
        'aria-label': `كلمة ${tile.text}`,
        onclick: () => onTile(tile, btn),
      }, h('span', { class: 'tile-face' }, tile.text));
      return btn;
    }));

    function onTile(tile, btn) {
      if (filled >= sentence.words.length) return;
      const expected = sentence.words[filled];
      const skill = wordSkill(expected) || {};
      const correct = tile.text === expected;
      score(item, skill.letter, skill.haraka, correct);
      if (!correct) {
        audio.play(tile.text);         // يسمع ما اختاره فيقارنه بما تحتاجه الجملة
        return wrong(btn);
      }
      btn.disabled = true;
      btn.classList.add('tile--used');
      slotEls[filled].textContent = tile.text;
      slotEls[filled].classList.add('slot--filled');
      filled++;
      if (filled < sentence.words.length) return void audio.play(tile.text);

      for (const b of tiles.children) b.disabled = true;
      slots.classList.add('slots--done');
      built.replaceChildren(h('p', { class: 'sentence sentence--built' }, sentence.text));
      (async () => {
        await audio.play(sentence.text);
        if (token !== state.token || !root?.isConnected) return;   // سبقنا الطفل أو غادر
        next();
      })();
    }

    return h('div', {},
      h('h2', {}, 'رتّب الجملة'),
      h('button', {
        class: 'wgame-pic',
        'aria-label': `اسمع كلمة ${sentence.target.word}`,
        onclick: () => audio.play(sentence.target.say),
      },
        h('span', { class: 'pic-emoji' }, sentence.target.emoji),
        h('span', { class: 'pic-ear' }, '🔊'),
      ),
      slots,
      built,
      tiles,
    );
  }

  // ————— الختام —————

  function finish() {
    audio.stop();
    state.done = true;
    state.token++;
    paintDots();
    progress.markReview(state.right + state.errors, state.right);

    const stars = starsForReview(state.errors, items.length);
    const streak = progress.reviewStreak();
    const line = state.errors === 0
      ? 'مراجعة بلا خطأ واحد! 🎉'
      : `أصبتَ ${arNum(state.right)} من ${arNum(state.right + state.errors)} محاولة — وما أخطأتَ فيه يعود غداً.`;

    body.replaceChildren(h('div', { class: 'celebrate' },
      mascot('mascot mascot--cheer'),
      h('div', { class: 'celebrate-face' }, '🔁'),
      h('h2', {}, 'أتممتَ مراجعة اليوم!'),
      starsRow(stars, 'big-stars'),
      h('p', { class: 'hint' }, line),
      streak > 1 && h('p', { class: 'note' },
        `🔥 ${arCount(streak, ['يوم', 'يومان متتاليان', 'أيام متتالية', 'يوماً متتالياً'])} من المراجعة`),
      h('div', { class: 'row foot' },
        h('button', { class: 'btn btn--primary', onclick: () => go('#/') }, '→ الخريطة')),
    ));
  }

  paint();

  root = h('div', { class: 'screen lesson', css: { '--accent': ACCENT } },
    topbar(
      h('button', {
        class: 'btn',
        onclick: () => {
          if (state.done || state.index === 0 || confirm('تريد الخروج قبل إتمام المراجعة؟')) go('#/');
        },
      }, '→ الخريطة'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, 'مراجعة اليوم'),
    ),
    h('main', { class: 'screen-card' },
      dots,
      body,
      DEV && h('div', { class: 'dev' },
        h('div', { class: 'dev-title' }, 'أدوات التجربة (?dev=1)'),
        h('div', { class: 'dev-row' },
          h('span', {}, `التمارين: ${items.map((i) => i.kind).join('، ')}`),
          h('button', { class: 'btn', onclick: () => toast(`أخطاء: ${arNum(state.errors)}`) }, 'عدّ الأخطاء'),
          h('button', { class: 'btn', onclick: finish }, 'إنهاء المراجعة الآن'),
        )),
    ),
  );
  return root;
}
