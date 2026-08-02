// المرحلة القرآنية — خاتمة الرحلة (METHOD §١.٢ و§٥.٦).
//
// خمس شاشات على خمس درجات: حرفان جديدان ← كلمات قرآنية مألوفة ← رسم المصحف ←
// الحروف المقطَّعة ← السور الأربع بالرسم العثماني.
//
// **قاعدة هذا الملف الأولى**: نصّ المصحف يُعرض ولا يُنطق آلياً. لا تمرّ آيةٌ ولا كلمةٌ
// عثمانية على `audio.play()` أبداً — التلاوة بصوت قارئ متقن لا بمولّد (METHOD §٥.٦)،
// وحتى تأتي تسجيلاتها تبقى شاشات السور شاشات قراءة بالعين. المنطوق هنا ثلاثة أصناف
// لا رابع لها: قواعدُنا نحن، وكلماتٌ بالرسم الإملائي، وأسماءُ حروف.
//
// **الثانية**: لا قياس (كما في دروس المهارات) — المقيس في §٦ حرفٌ بحركة في تمرين،
// والمقيس هنا علامةُ رسم أو كلمة كاملة، فلا يُبنى منه تكرارٌ متباعد لا تمرين له.

import { QURAN, surahById } from './curriculum.js';
import * as progress from './progress.js';
import * as audio from './audio.js';
import { starsForGame } from './words.js';
import { starsForStory } from './story.js';
import {
  h, toast, go, arNum, arCount, starsRow, topbar,
  QURAN_ACCENT, shuffle, shake, DEV,
} from './ui.js';

const QUIZ_OPTIONS = 3;
const RASM_ROUNDS = 3;
const AFTER_PICK_MS = 750;

const nodeIdOf = (part) => `quran:${part}`;

/**
 * جولات «اقرأ واختر»: الصورة معروضة والكلمات مكتوبة — لا يُسمَع شيء قبل الاختيار
 * كي يقع الحكم على القراءة لا على السمع. المشتّتات من كلمات الشاشة نفسها (مفكوكة
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

/** جولات رسم المصحف: كلمة عثمانية معروضة، وأيّ علامةٍ فيها؟ (بصريّ صامت). */
export function buildRasmRounds(signs, rnd = Math.random) {
  if (signs.length < QUIZ_OPTIONS) return [];
  return shuffle(signs, rnd).slice(0, RASM_ROUNDS).map((target) => {
    const others = shuffle(signs.filter((s) => s.sign !== target.sign), rnd);
    return { target, options: shuffle([target, ...others.slice(0, QUIZ_OPTIONS - 1)], rnd) };
  });
}

// ————— هيكل مشترك: شاشة بخطوات وشريط تقدّم واحتفال —————

function stepped({ part, pill, face, steps, celebrate }) {
  const nodeId = nodeIdOf(part);
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
    body.replaceChildren(steps[state.step].build({ next, fail: () => { state.errors++; } }));
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

    body.replaceChildren(h('div', { class: 'celebrate' },
      h('div', { class: 'celebrate-face' }, face),
      h('h2', {}, 'أحسنت!'),
      starsRow(stars, 'big-stars'),
      h('p', { class: 'hint' }, line),
      before > stars && h('p', { class: 'hint' }, `نجومك السابقة محفوظة: ${arNum(before)} ★`),
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

  return h('div', { class: 'screen lesson quran', css: { '--accent': QURAN_ACCENT } },
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

const nextButton = (onclick, label = 'تابع ←') =>
  h('button', { class: 'btn btn--primary btn--wide next', onclick }, label);

const ruleHead = (title, face, rule) => [
  h('h2', {}, title),
  h('button', {
    class: 'giant',
    'aria-label': `اسمع: ${rule}`,
    onclick: () => audio.play(rule),
  }, face),
  h('p', { class: 'rule' }, rule),
  h('div', { class: 'row' },
    h('button', { class: 'btn btn--primary', onclick: () => audio.play(rule) }, '🔊 اسمع القاعدة')),
];

/** كلمة إملائية تُنطق بنقرة (لا شيء من المصحف يمرّ من هنا). */
const spokenWord = (word) => h('button', {
  class: 'example-word',
  'aria-label': `اسمع كلمة ${word.read}`,
  onclick: () => audio.play(word.read),
},
  h('span', { class: 'word-emoji' }, word.emoji),
  h('span', { class: 'word-text' }, word.read),
);

/** خطوة «اقرأ واختر»: الصورة ثم ثلاث كلمات مكتوبة — والصوت بعد الاختيار لا قبله. */
function readQuizStep(items, { next, fail }) {
  const rounds = buildReadRounds(items);
  if (!rounds.length) {                     // مادة أقلّ من ثلاث كلمات: لا سؤال، ولا شاشة معلَّقة
    setTimeout(next, 0);
    return h('p', { class: 'hint' }, '…');
  }
  let index = 0;
  let locked = false;

  const pic = h('div', { class: 'quran-pic' });
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
        onclick: () => onPick(word, btn, r),
      }, h('span', { class: 'vchip-face' }, word.read));
      return btn;
    }));
  }

  function onPick(word, btn, r) {
    if (locked) return;
    if (word.read === r.target.read) {
      locked = true;
      btn.classList.add('good');
      audio.play(word.read);
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
      audio.play(word.read);          // يسمع ما اختاره فيقارنه بالصورة (بلا تلقين)
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

// ————— ١) الهمزة والتاء المربوطة —————

function renderQuranLetters() {
  const data = QURAN.letters;
  const words = data.signs.flatMap((s) => s.words);

  return stepped({
    part: data.id,
    pill: 'حروف',
    face: data.face,
    steps: [
      {
        title: 'الحرفان',
        build: ({ next }) => h('div', {},
          ...ruleHead(data.title, data.face, data.rule),
          ...data.signs.map((sign) => h('section', { class: 'sign-card' },
            h('div', { class: 'sign-head' },
              h('span', { class: 'sign-face' }, sign.sign),
              h('div', {},
                h('h3', {}, sign.name),
                h('p', { class: 'sign-shapes' }, sign.shapes.map((sh) =>
                  h('span', { class: 'sign-shape' }, sh))),
              ),
            ),
            h('div', { class: 'row wordrow' }, sign.words.map(spokenWord)),
          )),
          nextButton(next),
        ),
      },
      { title: 'اقرأ واختر', build: (api) => readQuizStep(words, api) },
    ],
    celebrate: (state) => ({
      stars: starsForGame(state.errors, words.length),
      line: state.errors === 0
        ? 'قرأتَ الهمزة والتاء المربوطة بلا خطأ! 🎉'
        : 'صارتا في يدك — وستلقاهما في المصحف كثيراً.',
    }),
  });
}

// ————— ٢) كلمات من القرآن —————

function renderQuranWords() {
  const data = QURAN.words;
  const items = data.items;

  return stepped({
    part: data.id,
    pill: 'كلمات',
    face: data.face,
    steps: [
      {
        title: 'الكلمات',
        build: ({ next }) => h('div', {},
          ...ruleHead(data.title, data.face, data.rule),
          h('div', { class: 'row wordrow' }, items.map(spokenWord)),
          nextButton(next),
        ),
      },
      { title: 'اقرأ واختر', build: (api) => readQuizStep(items, api) },
    ],
    celebrate: (state) => ({
      stars: starsForGame(state.errors, items.length),
      line: state.errors === 0
        ? 'قرأتَ كلمات القرآن كلها بلا خطأ! 🎉'
        : 'أحسنت — هذه الكلمات ستراها في المصحف كثيراً.',
    }),
  });
}

// ————— ٣) رسم المصحف —————

function renderQuranRasm() {
  const data = QURAN.rasm;

  return stepped({
    part: data.id,
    pill: 'رسم',
    face: data.face,
    steps: [
      {
        title: 'العلامات',
        build: ({ next }) => h('div', {},
          ...ruleHead(data.title, data.face, data.rule),
          h('div', { class: 'rasm-list' }, data.signs.map((sign) => h('button', {
            class: 'rasm-card',
            'aria-label': `${sign.name}: ${sign.rule}`,
            onclick: () => audio.play(sign.rule),      // القاعدة كلامنا، والمثال يبقى صامتاً
          },
            h('span', { class: 'rasm-sign' }, sign.sign),
            h('span', { class: 'rasm-text' },
              h('b', {}, sign.name),
              h('small', {}, sign.rule),
              h('span', { class: 'rasm-example' },
                h('span', { class: 'mushaf' }, sign.read),
                h('small', {}, `من سورة ${sign.from}`)),
            ),
          ))),
          h('p', { class: 'note' }, 'الكلمات هنا من المصحف — نقرؤها بأعيننا، وتلاوتها بصوت قارئ متقن.'),
          nextButton(next),
        ),
      },
      {
        title: 'ميّز العلامة',
        build: ({ next, fail }) => {
          const rounds = buildRasmRounds(data.signs);
          if (!rounds.length) {
            setTimeout(next, 0);
            return h('p', { class: 'hint' }, '…');
          }
          let index = 0;
          let locked = false;

          const word = h('p', { class: 'mushaf mushaf--big' });
          const counter = h('p', { class: 'hint' });
          const row = h('div', { class: 'row vrow' });

          function startRound() {
            const r = rounds[index];
            locked = false;
            word.textContent = r.target.read;
            counter.textContent = `الجولة ${arNum(index + 1)} من ${arNum(rounds.length)}`;
            row.replaceChildren(...r.options.map((sign) => {
              const btn = h('button', {
                class: 'vchip vchip--sign',
                'aria-label': sign.name,
                onclick: () => onPick(sign, btn, r),
              },
                h('span', { class: 'vchip-face' }, sign.sign),
                h('small', {}, sign.name),
              );
              return btn;
            }));
          }

          function onPick(sign, btn, r) {
            if (locked) return;
            if (sign.sign === r.target.sign) {
              locked = true;
              btn.classList.add('good');
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
              audio.play(sign.rule);      // يسمع قاعدة ما اختاره فيعرف لِمَ لم تكن هي
            }
          }

          const screen = h('div', {},
            h('h2', {}, 'أيّ علامة في هذه الكلمة؟'),
            word,
            counter,
            row,
          );
          startRound();
          return screen;
        },
      },
    ],
    celebrate: (state) => ({
      stars: starsForGame(state.errors, RASM_ROUNDS),
      line: state.errors === 0
        ? 'عرفتَ علامات المصحف بلا خطأ! 🎉'
        : 'صارت مألوفة لعينك — وستراها في كل صفحة.',
    }),
  });
}

// ————— ٤) الحروف المقطَّعة —————

function renderQuranMuqattaat() {
  const data = QURAN.muqattaat;
  const heard = new Set();

  return stepped({
    part: data.id,
    pill: 'مقطَّعة',
    face: data.face,
    steps: [
      {
        title: 'اقرأ بأسمائها',
        build: ({ next }) => {
          heard.clear();          // إعادة الدرس تبدأ العدّ من جديد
          const foot = h('p', { class: 'hint' });
          const paintFoot = () => {
            foot.textContent = `قرأتَ ${arNum(heard.size)} من `
              + arCount(data.items.length, ['واحدة', 'اثنتين', 'مجموعات', 'مجموعة']);
          };

          const list = h('div', { class: 'muq-list' }, data.items.map((item) => {
            const said = new Set();
            const chips = item.parts.map((p, i) => {
              const btn = h('button', {
                class: 'vchip vchip--name',
                'aria-label': `اسم الحرف ${p.say}`,
                onclick: () => {
                  btn.classList.add('good');
                  said.add(i);
                  if (said.size === item.parts.length) {
                    heard.add(item.read);
                    paintFoot();
                  }
                  audio.play(p.say);
                },
              }, h('span', { class: 'vchip-face' }, p.say));
              return btn;
            });

            return h('section', { class: 'muq-card' },
              h('div', { class: 'muq-head' },
                h('span', { class: 'mushaf mushaf--big' }, item.read),
                h('small', {}, `أول سورة ${item.surah}`),
              ),
              h('div', { class: 'row vrow' }, chips),
            );
          }));

          paintFoot();
          return h('div', {},
            ...ruleHead(data.title, data.face, data.rule),
            h('p', { class: 'hint' }, 'اضغط أسماء الحروف واقرأ بها'),
            list,
            foot,
            nextButton(next, 'أتممتُ ←'),
          );
        },
      },
    ],
    celebrate: () => ({
      stars: starsForStory(heard.size, data.items.length),
      line: heard.size >= data.items.length
        ? 'قرأتَ الحروف المقطَّعة بأسمائها كلها! 🎉'
        : 'أعِد واقرأ كل مجموعة بأسماء حروفها لتزيد نجومك.',
    }),
  });
}

// ————— ٥) شاشة السورة: قراءة بالعين، بلا صوت —————

export function renderSurah(surahId) {
  const surah = surahById(surahId);
  if (!surah) return null;

  const nodeId = nodeIdOf(surah.id);
  const total = surah.ayat.length;
  const read = new Set();
  let done = false;

  const body = h('div', { class: 'story-body' });
  const foot = h('div', { class: 'row foot' });

  function paintFoot() {
    foot.replaceChildren(
      h('p', { class: 'hint' },
        `قرأتَ ${arNum(read.size)} من ${arCount(total, ['آية', 'آيتين', 'آيات', 'آية'])}`),
      h('button', { class: 'btn btn--primary btn--wide next', onclick: finish }, 'أتممتُ القراءة ←'),
    );
  }

  function markRead(index) {
    if (read.has(index) || done) return;
    read.add(index);
    paintFoot();
  }

  function page() {
    const sheet = h('div', { class: 'sheet sheet--mushaf' },
      h('div', { class: 'surah-title' },
        h('span', { class: 'word-emoji' }, surah.emoji),
        h('span', { class: 'surah-title-text' }, `سورة ${surah.name}`),
        h('span', { class: 'pill' }, `${arNum(surah.number)}`),
      ),
    );

    // البسملة سطرٌ مستقلّ في السور الثلاث، وهي الآية الأولى في الفاتحة وحدها
    if (!surah.basmalaIsAyah) {
      sheet.append(h('p', { class: 'mushaf basmala' }, QURAN.basmala));
    }

    surah.ayat.forEach((ayah, index) => {
      const btn = h('button', {
        class: 'ayah',
        'aria-label': `الآية ${arNum(index + 1)}`,
        onclick: () => {
          btn.classList.add('ayah--read');
          markRead(index);
        },
      },
        h('span', { class: 'mushaf' }, ayah),
        h('span', { class: 'ayah-num' }, arNum(index + 1)),
      );
      sheet.append(btn);
    });

    return sheet;
  }

  function paint() {
    audio.stop();
    body.replaceChildren(page());
    paintFoot();
  }

  function finish() {
    done = true;
    const stars = starsForStory(read.size, total);
    const before = progress.getStars(nodeId);
    progress.setStars(nodeId, stars);
    const last = !progress.nextNode();

    body.replaceChildren(h('div', { class: 'celebrate' },
      h('div', { class: 'celebrate-face' }, surah.emoji),
      h('h2', {}, `قرأتَ سورة ${surah.name}!`),
      starsRow(stars, 'big-stars'),
      h('p', { class: 'hint' }, stars === 3
        ? 'قرأتَ آياتها كلها — بارك الله فيك 🎉'
        : 'أعِد القراءة على مهل، آيةً آية.'),
      before > stars && h('p', { class: 'hint' }, `نجومك السابقة محفوظة: ${arNum(before)} ★`),
      last && h('p', { class: 'note' }, '🎉 أتممتَ الرحلة كلها — من الحرف الأول إلى المصحف.'),
      h('div', { class: 'row foot' },
        h('button', { class: 'btn btn--primary', onclick: () => go('#/') }, '→ الخريطة'),
        h('button', {
          class: 'btn',
          onclick: () => { done = false; read.clear(); paint(); },
        }, '↻ أعِد القراءة'),
      ),
    ));
    foot.replaceChildren();
  }

  paint();

  return h('div', { class: 'screen story quran', css: { '--accent': QURAN_ACCENT } },
    topbar(
      h('button', { class: 'btn', onclick: () => go('#/') }, '→ الخريطة'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, 'سورة'),
    ),
    h('main', { class: 'screen-card' },
      h('p', { class: 'hint' }, 'اقرأ بعينك، واضغط الآية إذا أتممتها'),
      body,
      foot,
      h('p', { class: 'note' },
        'نصّ المصحف هنا للقراءة لا للسماع — التلاوة تأتي بصوت قارئ متقن بإذن الله.'),
      DEV && h('div', { class: 'dev' },
        h('div', { class: 'dev-title' }, 'أدوات التجربة (?dev=1)'),
        h('div', { class: 'dev-row' },
          h('span', {}, `الآيات: ${arNum(total)}`),
          h('button', { class: 'btn', onclick: () => toast(`قُرئت: ${arNum(read.size)}`) }, 'عدّ المقروء'),
          h('button', { class: 'btn', onclick: finish }, 'إنهاء القراءة الآن'),
        )),
    ),
  );
}

// ————— التوجيه داخل المرحلة —————

const SCREENS = {
  letters: renderQuranLetters,
  words: renderQuranWords,
  rasm: renderQuranRasm,
  muqattaat: renderQuranMuqattaat,
};

/** شاشة عقدة قرآنية بمعرّف جزئها — أو null إن كان مجهولاً (فيعود التوجيه بالطفل للخريطة). */
export function renderQuran(part) {
  if (SCREENS[part]) return SCREENS[part]();
  return renderSurah(part);
}
