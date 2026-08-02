// درس الحرف — حلقة الدرس في §٤ من المنهج، بأربع خطوات متتابعة:
//   ١) اسمع وشاهد  ٢) الحركات  ٣) تتبّع  ٤) ميّز بأذنك  ← نجوم وعودة للخريطة.
//
// المفكوكية ١٠٠٪: كل حرف يظهر في هذه الشاشة (خياراتٍ كان أو كلمةَ مثال) مأخوذ من
// lettersThrough(group, letter) — أي المدروس فعلاً حتى هذا الدرس، لا حتى نهاية المجموعة.

import { LETTERS, HARAKAT, letterForms, lettersThrough, exampleWordFor } from './curriculum.js';
import * as progress from './progress.js';
import * as audio from './audio.js';
import {
  h, toast, go, arNum, starsRow, topbar, letterTitle, wordText,
  accentFor, shuffle, pick, shake, DEV,
} from './ui.js';

const ROUNDS = 3;              // جولات «ميّز بأذنك»
const OPTIONS = 3;             // خيارات كل جولة
const FATHA = HARAKAT[0].mark; // الفتحة أولاً (§٥.١)

/** النجوم من الأخطاء: ٣ بلا خطأ، ٢ بخطأ واحد، ١ بأكثر. */
export const starsForErrors = (errors) => (errors === 0 ? 3 : errors === 1 ? 2 : 1);

/**
 * جولات «ميّز بأذنك»: الهدف وكل المشتّتات من الحروف المدروسة فقط،
 * وحركة واحدة داخل الجولة كي يكون التمييز على الحرف لا على الحركة.
 * الجولة الأولى على الحرف المدروس بالفتحة، وما بعدها مراجعة لما سبق.
 * تعود [] إن لم يكن للطفل حرفان مدروسان بعدُ (أول درس في الرحلة) فتُطوى الخطوة.
 */
export function buildRounds(studied, letter, rnd = Math.random) {
  const pool = [...new Set(studied)];
  if (pool.length < 2) return [];
  const size = Math.min(OPTIONS, pool.length);

  const rounds = [];
  for (let i = 0; i < ROUNDS; i++) {
    const target = i === 0 ? letter : pick(pool, rnd);
    const others = shuffle(pool.filter((c) => c !== target), rnd).slice(0, size - 1);
    const mark = i === 0 ? FATHA : pick(HARAKAT, rnd).mark;
    rounds.push({ target, mark, options: shuffle([target, ...others], rnd) });
  }
  return rounds;
}

/** تقطيع نص مشكول إلى «حرف + حركاته» لتلوين الحرف المستهدف داخل الكلمة. */
export function clusters(text) {
  const out = [];
  for (const ch of text) {
    if (out.length && /[ً-ْٰ]/.test(ch)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

// ————— الشاشة —————

export function renderLesson(groupId, letter) {
  const group = progress.findGroup(groupId);
  if (!group) return null;

  const name = LETTERS[letter]?.name ?? letter;
  const studied = lettersThrough(groupId, letter);
  const example = exampleWordFor(groupId, letter);
  let rounds = buildRounds(studied, letter);   // تُبنى من جديد عند إعادة الدرس (تنويع المراجعة)

  audio.preload([
    name,
    ...HARAKAT.map((k) => letter + k.mark),
    ...rounds.flatMap((r) => r.options.map((c) => c + r.mark)),
    ...(example ? [example.say] : []),
  ]);

  const state = { step: 0, errors: 0, round: 0, done: false };

  const steps = [
    { title: 'اسمع وشاهد', build: stepListen },
    { title: 'الحركات', build: stepHarakat },
    { title: 'تتبّع', build: stepTrace },
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

  /** زر «تابع» أسفل الخطوة — لا يظهر في خطوة سؤال إلا بعد الإجابة الصحيحة. */
  function nextButton(label = 'تابع ←') {
    return h('button', { class: 'btn btn--primary btn--wide next', onclick: next }, label);
  }

  // ————— ١) اسمع وشاهد —————

  function stepListen() {
    const forms = letterForms(letter);
    const cell = (label, text) => h('div', { class: 'form-cell' },
      h('span', { class: 'form-face' }, text),
      h('small', {}, label));

    return h('div', {},
      h('h2', {}, letterTitle(letter)),
      h('button', {
        class: 'giant',
        'aria-label': `اسمع صوت ${letterTitle(letter)}`,
        onclick: () => audio.play(letter + FATHA),
      }, letter),
      h('div', { class: 'row' },
        h('button', {
          class: 'btn',
          'aria-label': `اسمع اسم الحرف: ${name}`,
          onclick: () => audio.play(name),
        }, `🔊 اسمه: ${name}`),
        h('button', {
          class: 'btn btn--primary',
          'aria-label': `اسمع صوت الحرف: ${letter + FATHA}`,
          onclick: () => audio.play(letter + FATHA),
        }, `🔊 صوته: ${letter + FATHA}`),
      ),
      h('h3', { class: 'sub' }, 'أشكاله في الكلمة'),
      h('div', { class: 'forms' },
        cell('منفرد', forms.isolated),
        cell('في أوله', forms.initial),
        cell('في وسطه', forms.medial),
        cell('في آخره', forms.final),
      ),
      example && h('div', { class: 'example' },
        h('button', {
          class: 'example-word',
          'aria-label': `اسمع كلمة ${example.say}`,
          onclick: () => audio.play(example.say),
        },
          h('span', { class: 'word-emoji' }, example.emoji),
          h('span', { class: 'word-text' },
            clusters(wordText(example)).map((piece) => (piece[0] === letter
              ? h('span', { class: 'lit' }, piece)
              : piece))),
        ),
        h('p', { class: 'hint' }, 'اضغط الكلمة لتسمعها'),
      ),
      nextButton(),
    );
  }

  // ————— ٢) الحركات: استماع ثم «أيها سمعت؟» —————

  function stepHarakat() {
    const items = HARAKAT.map((k) => ({ ...k, text: letter + k.mark }));
    let target = null;
    let solved = false;

    const prompt = h('p', { class: 'hint' }, 'اضغط كلَّ واحدة لتسمعها');
    const foot = h('div', { class: 'row foot' });

    const cards = items.map((item) => {
      const btn = h('button', {
        class: 'vchip',
        'aria-label': `${letter} بال${item.name}`,
        onclick: () => onPick(item, btn),
      },
        h('span', { class: 'vchip-face' }, item.text),
        h('small', {}, item.name));
      return btn;
    });

    function onPick(item, btn) {
      if (!target || solved) {          // وضع الاستماع الحر
        audio.play(item.text);
        return;
      }
      if (item.text === target.text) {
        solved = true;
        btn.classList.add('good');
        prompt.textContent = `أحسنت! هذه ${target.name} ✓`;
        audio.play(item.text);
        foot.replaceChildren(nextButton());
      } else {
        state.errors++;
        shake(btn);
        btn.classList.add('bad');
        setTimeout(() => btn.classList.remove('bad'), 700);
        prompt.textContent = 'ليست هي… استمع مرة أخرى';
        setTimeout(() => audio.play(target.text), 450);
      }
    }

    function ask() {
      target = pick(items);
      solved = false;
      for (const c of cards) c.classList.remove('good', 'bad');
      prompt.textContent = 'اضغط ما سمعت';
      audio.play(target.text);
      foot.replaceChildren(h('button', {
        class: 'btn',
        onclick: () => audio.play(target.text),
      }, '🔊 أعِد السماع'));
    }

    foot.append(h('button', { class: 'btn btn--primary btn--wide', onclick: ask }, '🎧 أيها سمعت؟'));

    return h('div', {},
      h('h2', {}, `${letterTitle(letter)} مع الحركات`),
      prompt,
      h('div', { class: 'row vrow' }, cards),
      foot,
    );
  }

  // ————— ٣) تتبّع بالإصبع (بلا تحقّق من المسار في هذه الجلسة) —————

  function stepTrace() {
    const canvas = h('canvas', {
      class: 'trace',
      role: 'img',
      'aria-label': `تتبّع ${letterTitle(letter)} بإصبعك`,
    });
    const ctx = canvas.getContext('2d');
    let box = { width: 0, height: 0 };

    function guide() {
      ctx.clearRect(0, 0, box.width, box.height);
      const accent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#f5a524';
      const font = getComputedStyle(document.body).getPropertyValue('--font-letter').trim();
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = accent;
      ctx.font = `${Math.round(box.height * 0.72)}px ${font || 'serif'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, box.width / 2, box.height / 2);
      ctx.restore();
    }

    function size() {
      if (!canvas.isConnected) {          // استُبدلت الشاشة: أزِل المستمع ولا تعمل شيئاً
        window.removeEventListener('resize', size);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      box = { width: rect.width, height: rect.height };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = Math.max(10, rect.width * 0.055);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      guide();
    }

    let drawing = false;
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drawing = true;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* مؤشّر غير نشط */ }
      const p = at(e);
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#f5a524';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 0.01, p.y);   // نقطة واحدة تُرى ولو لم يتحرّك الإصبع
      ctx.stroke();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = at(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      canvas.addEventListener(type, () => { drawing = false; });
    }

    function at(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    requestAnimationFrame(size);
    window.addEventListener('resize', size);   // تُزال مع استبدال الشاشة (الرسم يُعاد بناؤه)

    return h('div', {},
      h('h2', {}, 'تتبّع بإصبعك'),
      h('p', { class: 'hint' }, `ارسم ${letterTitle(letter)} فوق النموذج الباهت`),
      canvas,
      h('div', { class: 'row foot' },
        h('button', { class: 'btn', onclick: guide }, '↺ امسح'),
        nextButton('تمّ ←'),
      ),
    );
  }

  // ————— ٤) ميّز بأذنك —————

  function stepQuiz() {
    const prompt = h('h2', {});
    const counter = h('p', { class: 'hint' });
    const row = h('div', { class: 'row vrow' });
    let locked = false;

    const playTarget = () => audio.play(rounds[state.round].target + rounds[state.round].mark);

    function startRound() {
      const r = rounds[state.round];
      locked = false;
      prompt.textContent = 'أيَّ حرف سمعت؟';
      counter.textContent = `الجولة ${arNum(state.round + 1)} من ${arNum(rounds.length)}`;
      row.replaceChildren(...r.options.map((ch) => {
        const text = ch + r.mark;
        const btn = h('button', {
          class: 'vchip vchip--big',
          'aria-label': text,
          onclick: () => onPick(ch, btn, r),
        }, h('span', { class: 'vchip-face' }, text));
        return btn;
      }));
      setTimeout(playTarget, 250);
    }

    function onPick(ch, btn, r) {
      if (locked) return;
      if (ch === r.target) {
        locked = true;
        btn.classList.add('good');
        audio.play(ch + r.mark);
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
        setTimeout(playTarget, 450);
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

  // ————— الختام: النجوم والاحتفال —————

  function finish() {
    audio.stop();
    const stars = starsForErrors(state.errors);
    const before = progress.getStars(progress.nodeId(groupId, letter));
    progress.setStars(progress.nodeId(groupId, letter), stars);

    state.step = steps.length;   // كل الخطوات مُنجزة
    state.done = true;
    paintSteps();

    const line = state.errors === 0 ? 'بلا خطأ واحد! 🎉'
      : state.errors === 1 ? 'خطأ واحد فقط — ممتاز!'
        : 'أتممتَ الدرس، وبالتكرار تزيد نجومك.';

    body.replaceChildren(h('div', { class: 'celebrate' },
      h('div', { class: 'celebrate-face' }, letter),
      h('h2', {}, 'أحسنت!'),
      starsRow(stars, 'big-stars'),
      h('p', { class: 'hint' }, line),
      before > stars && h('p', { class: 'hint' }, `نجومك السابقة محفوظة: ${arNum(before)} ★`),
      h('div', { class: 'row foot' },
        h('button', { class: 'btn btn--primary', onclick: () => go('#/') }, '→ الخريطة'),
        h('button', {
          class: 'btn',
          onclick: () => {
            Object.assign(state, { step: 0, errors: 0, round: 0, done: false });
            rounds = buildRounds(studied, letter);
            paint();
          },
        }, '↻ أعِد الدرس'),
      ),
    ));
  }

  paint();

  return h('div', { class: 'screen lesson', css: { '--accent': accentFor(group) } },
    topbar(
      h('button', {
        class: 'btn',
        // الخروج من منتصف الدرس يُستأذَن فيه (وليّ الأمر)، أما قبل بدئه أو بعد إتمامه فلا
        onclick: () => {
          if (state.step === 0 || state.done || confirm('تريد الخروج قبل إتمام الدرس؟')) go('#/');
        },
      }, '→ الخريطة'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, group.title),
    ),
    h('main', { class: 'screen-card' },
      stepsBar,
      body,
      DEV && h('div', { class: 'dev' },
        h('div', { class: 'dev-title' }, 'أدوات التجربة (?dev=1)'),
        h('div', { class: 'dev-row' },
          h('span', {}, `المدروس: ${studied.join(' ')}`),
          h('button', { class: 'btn', onclick: () => { toast(`أخطاء: ${arNum(state.errors)}`); } }, 'عدّ الأخطاء'),
          h('button', { class: 'btn', onclick: finish }, 'إنهاء الدرس الآن'),
        )),
    ),
  );
}
