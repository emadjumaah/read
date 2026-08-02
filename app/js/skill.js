// درس المهارة — العلامات التي تُدرَّس بين المجموعات (METHOD §٥):
// المدّ الطبيعي، السكون، الشدّة، التنوين، اللام الشمسية والقمرية.
//
// بنيته نفس حلقة الدرس (§٤) بثلاث خطوات بدل أربع — لا خطوة تتبّع، فالمرسوم هنا
// علامة لا حرف: ١) القاعدة والأمثلة ٢) قارن بأذنك ٣) ميّز بأذنك ← نجوم واحتفال.
//
// المفكوكية ١٠٠٪: كل ما يُقرأ هنا (الأزواج والكلمات) من مادة الدرس نفسها، وموضعه
// في الخريطة مختار كي تكون حروفه وعلاماته مدروسة كلها — يفحص ذلك tools/check_decodable.py.
//
// لا قياس هنا: وحدة القياس في §٦ هي (حرف × حركة × تمرين)، والمقيس في هذا الدرس علامة
// لا حرف بعينه، فلا يُسجَّل في سجلّ المهارات كي لا تكذب لوحة وليّ الأمر ولا تُبنى منه
// مراجعةٌ لا تمرين لها.

import { skillById, skillExamples } from './curriculum.js';
import * as progress from './progress.js';
import * as audio from './audio.js';
import { starsForErrors } from './lesson.js';
import {
  h, toast, go, arNum, starsRow, topbar,
  PAUSE_ACCENT, mascot, shuffle, pick, shake, DEV,
} from './ui.js';

const ROUNDS = 3;
const OPTIONS = 3;

/**
 * جولات «ميّز بأذنك»: الهدف أحد طرفَي زوج، ومعه الطرف الآخر (وهو ألصق المشتّتات به)
 * ثم نصّ من زوج آخر — كلها من مادة هذا الدرس فلا يظهر ما لم يُدرَّس.
 * تفشل مغلقةً: درس بلا أزواج ⇒ لا خطوة تمييز أصلاً.
 */
export function buildSkillRounds(skill, rnd = Math.random) {
  const pairs = skill?.compare?.pairs || [];
  if (pairs.length < 2) return [];

  const order = shuffle(pairs, rnd);
  const rounds = [];
  for (let i = 0; i < ROUNDS; i++) {
    const pair = order[i % order.length];
    const others = shuffle(pairs.filter((p) => p !== pair), rnd).flat();
    const options = [...pair, ...others].filter((t, k, all) => all.indexOf(t) === k);
    rounds.push({
      target: pick(pair, rnd),
      options: shuffle(options.slice(0, OPTIONS), rnd),
    });
  }
  return rounds;
}

// ————— الشاشة —————

export function renderSkillLesson(skillId) {
  const skill = skillById(skillId);
  if (!skill) return null;

  const nodeId = `skill:${skill.id}`;
  const examples = skillExamples(skill);
  let rounds = buildSkillRounds(skill);

  audio.preload([skill.rule, ...skill.compare.pairs.flat(), ...examples.map((w) => w.say)]);

  const state = { step: 0, errors: 0, round: 0, done: false };

  const steps = [
    { title: 'القاعدة', build: stepRule },
    { title: 'قارِن', build: stepCompare },
    ...(rounds.length ? [{ title: 'ميّز بأذنك', build: stepQuiz }] : []),
  ];

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
    body.replaceChildren(steps[state.step].build());
  }

  function next() {
    if (state.step < steps.length - 1) {
      state.step++;
      paint();
    } else {
      finish();
    }
  }

  const nextButton = (label = 'تابع ←') =>
    h('button', { class: 'btn btn--primary btn--wide next', onclick: next }, label);

  // ————— ١) القاعدة وأمثلتها —————

  function stepRule() {
    return h('div', {},
      mascot('mascot mascot--hello'),
      h('h2', {}, skill.title),
      h('button', {
        class: 'giant',
        'aria-label': `اسمع قاعدة ${skill.title}`,
        onclick: () => audio.play(skill.rule),
      }, skill.face),
      h('p', { class: 'rule' }, skill.rule),
      h('div', { class: 'row' },
        h('button', {
          class: 'btn btn--primary',
          onclick: () => audio.play(skill.rule),
        }, '🔊 اسمع القاعدة'),
      ),
      h('h3', { class: 'sub' }, 'أمثلة'),
      h('div', { class: 'row wordrow' }, examples.map((word) => h('button', {
        class: 'example-word',
        'aria-label': `اسمع كلمة ${word.say}`,
        onclick: () => audio.play(word.say),
      },
        h('span', { class: 'word-emoji' }, word.emoji),
        h('span', { class: 'word-text' }, word.text),
      ))),
      nextButton(),
    );
  }

  // ————— ٢) قارِن بأذنك: طرفا كل زوج جنباً إلى جنب —————

  function stepCompare() {
    const [left, right] = skill.compare.labels;
    const chip = (text) => h('button', {
      class: 'vchip vchip--pair',
      'aria-label': text,
      onclick: () => audio.play(text),
    }, h('span', { class: 'vchip-face' }, text));

    return h('div', {},
      h('h2', {}, 'قارِن بأذنك'),
      h('p', { class: 'hint' }, 'اضغط الاثنين واسمع الفرق'),
      h('div', { class: 'pairs' },
        h('div', { class: 'pair pair--head' },
          h('small', {}, left),
          h('small', {}, right)),
        ...skill.compare.pairs.map(([a, b]) => h('div', { class: 'pair' }, chip(a), chip(b))),
      ),
      nextButton(),
    );
  }

  // ————— ٣) ميّز بأذنك —————

  function stepQuiz() {
    const prompt = h('h2', {});
    const counter = h('p', { class: 'hint' });
    const row = h('div', { class: 'row vrow' });
    let locked = false;

    const playTarget = () => audio.play(rounds[state.round].target);

    function startRound() {
      const r = rounds[state.round];
      locked = false;
      prompt.textContent = 'أيَّ واحدة سمعت؟';
      counter.textContent = `الجولة ${arNum(state.round + 1)} من ${arNum(rounds.length)}`;
      row.replaceChildren(...r.options.map((text) => {
        const btn = h('button', {
          class: 'vchip vchip--pair',
          'aria-label': text,
          onclick: () => onPick(text, btn, r),
        }, h('span', { class: 'vchip-face' }, text));
        return btn;
      }));
      setTimeout(playTarget, 250);
    }

    function onPick(text, btn, r) {
      if (locked) return;
      if (text === r.target) {
        locked = true;
        btn.classList.add('good');
        audio.play(text);
        setTimeout(() => {
          state.round++;
          if (state.round < rounds.length) startRound();
          else finish();
        }, 750);
      } else {
        state.errors++;
        shake(btn);
        btn.classList.add('bad');
        setTimeout(() => btn.classList.remove('bad'), 700);
        audio.play(text);                       // يسمع ما اختاره ليقارنه (بلا تلقين)
        setTimeout(playTarget, 900);
      }
    }

    const screen = h('div', {},
      prompt,
      counter,
      h('div', { class: 'row foot' },
        h('button', { class: 'btn btn--primary', onclick: playTarget }, '🔊 اسمع مرة أخرى')),
      row,
    );
    startRound();
    return screen;
  }

  // ————— الختام —————

  function finish() {
    audio.stop();
    const stars = starsForErrors(state.errors);
    const before = progress.getStars(nodeId);
    progress.setStars(nodeId, stars);

    state.step = steps.length;
    state.done = true;
    paintSteps();

    body.replaceChildren(h('div', { class: 'celebrate' },
      mascot('mascot mascot--cheer'),
      h('div', { class: 'celebrate-face' }, skill.face),
      h('h2', {}, 'أحسنت!'),
      starsRow(stars, 'big-stars'),
      h('p', { class: 'hint' }, state.errors === 0
        ? `عرفتَ ${skill.title} بلا خطأ! 🎉`
        : 'صارت في يدك — وستراها في القصص والكلمات بعدها.'),
      before > stars && h('p', { class: 'hint' }, `نجومك السابقة محفوظة: ${arNum(before)} ★`),
      h('div', { class: 'row foot' },
        h('button', { class: 'btn btn--primary', onclick: () => go('#/') }, '→ الخريطة'),
        h('button', {
          class: 'btn',
          onclick: () => {
            Object.assign(state, { step: 0, errors: 0, round: 0, done: false });
            rounds = buildSkillRounds(skill);
            paint();
          },
        }, '↻ أعِد الدرس'),
      ),
    ));
  }

  paint();

  return h('div', { class: 'screen lesson', css: { '--accent': PAUSE_ACCENT } },
    topbar(
      h('button', {
        class: 'btn',
        onclick: () => {
          if (state.step === 0 || state.done || confirm('تريد الخروج قبل إتمام الدرس؟')) go('#/');
        },
      }, '→ الخريطة'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, 'مهارة'),
    ),
    h('main', { class: 'screen-card' },
      stepsBar,
      body,
      DEV && h('div', { class: 'dev' },
        h('div', { class: 'dev-title' }, 'أدوات التجربة (?dev=1)'),
        h('div', { class: 'dev-row' },
          h('span', {}, `الأزواج: ${skill.compare.pairs.length}`),
          h('button', { class: 'btn', onclick: () => toast(`أخطاء: ${arNum(state.errors)}`) }, 'عدّ الأخطاء'),
          h('button', { class: 'btn', onclick: finish }, 'إنهاء الدرس الآن'),
        )),
    ),
  );
}
