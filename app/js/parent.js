// لوحة وليّ الأمر (METHOD §٦) — خلف بوابة عملية حسابية بسيطة لا يحلّها طفل السادسة:
// أين يتعثّر بالضبط، وكم دقيقة تعلّم، وما توصية اليوم.
//
// الشاشة لا تنطق شيئاً (لا صوت فيها أصلاً)، وتُبنى من نفس مفردات التنسيق القائمة
// (pill · vchip · note · chip) وتُلوَّن بمتغيّر --accent، فلا تحتاج تنسيقاً جديداً.

import * as progress from './progress.js';
import { h, go, arNum, arCount, topbar, letterTitle, nodeTitle, nodeWhere, shake } from './ui.js';

const ACCENT = 'var(--accent-skills)';
const GOOD = 'var(--ok)';
const BAD = 'var(--err)';
const DAY_NAMES = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const ENOUGH_MINUTES = 20;   // نصيب اليوم لطفل السادسة — بعده تُنصح الاستراحة

let unlocked = false;        // البوابة تُفتح لهذه الجلسة فقط (لا تُحفظ في التخزين)

/** ثوانٍ ← نصّ عربي مقروء. */
export function minutesText(seconds) {
  if (!seconds) return 'لا شيء';
  if (seconds < 60) return 'أقل من دقيقة';
  return arCount(Math.round(seconds / 60), ['دقيقة واحدة', 'دقيقتان', 'دقائق', 'دقيقة']);
}

/** «مهارة واحدة» · «مهارتين» · «٥ مهارات» · «١٢ مهارة» — مفعولاً به في سياق التثبيت. */
export const skillsText = (n) => arCount(n, ['مهارة واحدة', 'مهارتين', 'مهارات', 'مهارة']);

/**
 * توصية اليوم — دالّة خالصة تُختبر وحدها.
 * الترتيب مقصود: صحّة الطفل (سقف الوقت) قبل التحصيل، والمراجعة قبل الجديد
 * (ما تعثّر فيه أولى بالتثبيت من درس جديد يُبنى على متزعزع).
 */
export function recommend({ letters = 0, dueCount = 0, secondsToday = 0, reviewDone = false, next = null } = {}) {
  const minutes = Math.round(secondsToday / 60);
  if (!letters) {
    return { title: 'ابدآ الرحلة معاً', body: 'أول درس في المجموعة الأولى — اجلس معه في أول درسين حتى تتضح له اللعبة.', action: next && { label: 'افتح درسه الأول', hash: '#/' } };
  }
  if (minutes >= ENOUGH_MINUTES) {
    return { title: 'أخذ نصيبه اليوم', body: `تعلّم اليوم ${minutesText(secondsToday)} — الزيادة على هذا تُتعب طفل السادسة أكثر مما تنفعه. أعِده غداً.`, action: null };
  }
  if (dueCount && !reviewDone) {
    return { title: 'ابدأ بمراجعة اليوم', body: `حان وقت تثبيت ${skillsText(dueCount)} (تمارين قصيرة مما درسه). المراجعة قبل الدرس الجديد.`, action: { label: 'ابدأ المراجعة', hash: '#/review' } };
  }
  if (next) {
    return { title: 'واصِلا الدرس التالي', body: `التالي في رحلته: ${nodeTitle(next)}.`, action: { label: 'افتح الخريطة', hash: '#/' } };
  }
  return { title: 'أتمّ رحلة الحروف كلها', body: 'أعِد معه المراجعة اليومية حتى تُفتح المرحلة القرآنية.', action: { label: 'ابدأ المراجعة', hash: '#/review' } };
}

// ————— البوابة الحسابية —————

function question() {
  const a = 6 + Math.floor(Math.random() * 7);    // ٦…١٢
  const b = 7 + Math.floor(Math.random() * 6);    // ٧…١٢
  return { a, b, answer: a * b };
}

/** يقبل الرقمين العربي والهندي معاً. */
export function readNumber(text) {
  const normalized = String(text ?? '').trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return /^\d+$/.test(normalized) ? Number(normalized) : NaN;
}

function gateScreen(onPass) {
  let q = question();
  const prompt = h('div', { class: 'giant', css: { '--accent': ACCENT, 'font-size': '2.6rem' } },
    `${arNum(q.a)} × ${arNum(q.b)}`);
  const input = h('input', {
    class: 'chip',
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    'aria-label': 'ناتج الضرب',
    css: { 'min-width': '8rem', 'text-align': 'center', border: '2px solid var(--line)', font: 'inherit' },
  });
  const hint = h('p', { class: 'hint' }, 'هذه الشاشة لوليّ الأمر — أجب لتدخل.');

  function check() {
    if (readNumber(input.value) === q.answer) return onPass();
    shake(input);
    input.value = '';
    q = question();
    prompt.textContent = `${arNum(q.a)} × ${arNum(q.b)}`;
    hint.textContent = 'ليس هذا الناتج — جرّب هذه.';
    input.focus();
  }

  return h('div', { class: 'screen', css: { '--accent': ACCENT } },
    topbar(
      h('button', { class: 'btn', onclick: () => go('#/') }, '→ الخريطة'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, 'لوحة وليّ الأمر'),
    ),
    h('main', { class: 'screen-card' },
      h('h2', {}, 'كم الناتج؟'),
      prompt,
      hint,
      h('div', { class: 'row' },
        input,
        h('button', { class: 'btn btn--primary', onclick: check }, 'ادخل'),
      ),
    ),
  );
}

// ————— اللوحة —————

function pill(label, value) {
  return h('span', { class: 'pill' }, `${label}: `, h('b', {}, value));
}

function letterChip(stat, color) {
  return h('span', {
    class: 'vchip',
    css: { '--accent': color },
    title: `${letterTitle(stat.letter)} — ${arNum(stat.right)} صواب، ${arNum(stat.wrong)} خطأ`,
  },
    h('span', { class: 'vchip-face' }, stat.letter),
    h('small', {}, `${arNum(stat.right)} ✓ · ${arNum(stat.wrong)} ✗`));
}

function dashboard() {
  const letters = progress.studiedLetters();
  const stats = progress.letterStats();
  const mastered = stats.filter((s) => s.mastered);
  const weak = stats.filter((s) => s.struggling);
  const learning = stats.filter((s) => !s.mastered && !s.struggling);
  const due = progress.dueSkills();
  const next = progress.nextNode();
  const today = progress.secondsOn();
  const week = progress.usageDays(7);
  const streak = progress.reviewStreak();
  const tip = recommend({
    letters: letters.length,
    dueCount: due.length,
    secondsToday: today,
    reviewDone: Boolean(progress.reviewOf()),
    next,
  });

  const section = (title, ...children) => [h('h3', {}, title), ...children];
  const emptyNote = (text) => h('p', { class: 'hint' }, text);

  const main = h('main', { class: 'screen-card audit' },
    h('h2', {}, 'لوحة وليّ الأمر'),

    h('div', { class: 'audit-row' },
      pill('اليوم', minutesText(today)),
      pill('هذا الأسبوع', minutesText(week.reduce((s, d) => s + d.seconds, 0))),
      pill('المجموع', minutesText(progress.totalSeconds())),
      pill('النجوم', `${arNum(progress.totalStars())} / ${arNum(progress.maxTotalStars())}`),
      pill('حروف درسها', arNum(letters.length)),
      pill('مراجعات متتابعة', arNum(streak)),
    ),

    ...section('توصية اليوم',
      h('div', { class: 'note', css: { 'text-align': 'start' } },
        h('b', {}, tip.title),
        h('p', { class: 'hint', css: { margin: '.25rem 0 0' } }, tip.body)),
      tip.action && h('div', { class: 'row', css: { 'justify-content': 'flex-start', 'margin-top': '.75rem' } },
        h('button', { class: 'btn btn--primary', onclick: () => go(tip.action.hash) }, tip.action.label))),

    ...section(`الحروف المتقنة (${arNum(mastered.length)})`,
      mastered.length
        ? h('div', { class: 'audit-row' }, mastered.map((s) => letterChip(s, GOOD)))
        : emptyNote('لم يثبت حرف بعدُ — الإتقان يحتاج إصابات متتابعة في أيام متباعدة.')),

    ...section(`الحروف المتعثّرة (${arNum(weak.length)})`,
      weak.length
        ? [h('div', { class: 'audit-row' }, weak.map((s) => letterChip(s, BAD))),
          h('p', { class: 'hint' }, 'هذه تعود في مراجعة اليوم تلقائياً. أعِد معه أصواتها بصوتك أيضاً.')]
        : emptyNote('لا حرف متعثّر — ما أخطأ فيه لم يتكرّر خطؤه.')),

    ...section(`قيد التعلّم (${arNum(learning.length)})`,
      learning.length
        ? h('div', { class: 'audit-row' }, learning.map((s) => letterChip(s, ACCENT)))
        : emptyNote('لا شيء في المنتصف.')),

    ...section('دقائق آخر سبعة أيام',
      h('div', { class: 'audit-row' }, week.map((day) => {
        const d = new Date(`${day.key}T00:00:00`);
        const minutes = Math.round(day.seconds / 60);
        return h('span', {
          class: 'pill',
          css: day.seconds ? { color: 'var(--star-text)' } : { opacity: '.55' },
        }, `${DAY_NAMES[d.getDay()]}: `, h('b', {}, minutes ? arNum(minutes) : '—'));
      })),
      h('p', { class: 'hint' }, 'الزمن يُحسب وقت انتباهه للشاشة فقط (لا يُحسب إن تركها مفتوحة).')),

    ...section('أين هو الآن',
      h('p', { class: 'hint' }, next
        ? `التالي: ${nodeTitle(next)} — ${nodeWhere(next)}.`
        : 'أتمّ كل عقد الخريطة.'),
      h('p', { class: 'hint' },
        `بانتظار التثبيت الآن: ${arNum(due.length)} من ${arNum(progress.skills().length)} مهارة سُجّلت.`)),

    h('p', { class: 'note' }, 'المهارة = حرف × حركة × نوع تمرين. الخطأ يعيدها إلى مراجعة الغد، والإصابة تُباعد موعدها (١ ← ٢ ← ٤ ← ٨ ← ١٦ يوماً).'),
  );

  return h('div', { class: 'screen', css: { '--accent': ACCENT } },
    topbar(
      h('button', { class: 'btn', onclick: () => go('#/') }, '→ الخريطة'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, 'لوحة وليّ الأمر'),
    ),
    main,
  );
}

/** الشاشة: البوابة أولاً، ثم اللوحة — والفتح يبقى ما دامت الصفحة مفتوحة. */
export function renderParent(rerender) {
  if (unlocked) return dashboard();
  return gateScreen(() => {
    unlocked = true;
    rerender();
  });
}

/** لإعادة إغلاق البوابة في الاختبارات. */
export function lockGate() {
  unlocked = false;
}
