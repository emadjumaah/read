// نقطة الدخول: خريطة الرحلة (المجموعات السبع) والتوجيه بين الشاشات.
// درس الحرف في app/js/lesson.js، ولعبة تركيب الكلمات في app/js/words.js.

import { GROUPS, LETTERS, HARAKAT, QURAN } from './curriculum.js';
import * as progress from './progress.js';
import * as audio from './audio.js';
import * as recitation from './recitation.js';
import { renderLesson } from './lesson.js';
import { renderWordsGame } from './words.js';
import { renderReview } from './review.js';
import { renderSkillLesson } from './skill.js';
import { renderStory } from './story.js';
import { renderQuran } from './quran.js';
import { renderGarden } from './garden.js';
import { renderLadder } from './ladder.js';
import { renderParent, skillsText } from './parent.js';
import {
  h, toast, go, arNum, arCount, starsRow, topbar, letterTitle, nodeTitle, nodeFace, nodeWhere,
  ACCENTS, PAUSE_ACCENT, STORY_ACCENT, QURAN_ACCENT, SENTENCE_ACCENT,
  accentFor, accentForGarden, landmark, DEV,
} from './ui.js';

const app = document.getElementById('app');

// ————— خريطة الرحلة —————

function renderMap() {
  const earned = progress.totalStars();
  const next = progress.nextNode();

  const screen = h('div', {},
    topbar(
      h('h1', {}, 'المُعلِّم'),
      h('span', { class: 'spacer' }),
      DEV && h('button', { class: 'btn btn--ghost', onclick: () => go('#/audio') }, '🔊 فحص الأصوات'),
      h('button', {
        class: 'btn btn--ghost',
        'aria-label': 'لوحة وليّ الأمر',
        onclick: () => go('#/parent'),
      }, '👪'),
      h('span', { class: 'pill pill--stars' }, `★ ${arNum(earned)} / ${arNum(progress.maxTotalStars())}`),
    ),
  );

  const main = h('main', { class: 'map' });

  const review = reviewCard();
  if (review) main.append(review);

  if (next) {
    const group = progress.findGroup(next.groupId);
    main.append(h('button', {
      class: 'continue',
      css: { '--accent': accentOf(next, group) },
      onclick: () => openNode(next),
    },
      h('span', { class: 'continue-face' }, nodeFace(next)),
      h('span', { class: 'continue-text' },
        h('b', {}, nodeTitle(next)),
        h('small', {}, `تابع من هنا · ${nodeWhere(next)}`)),
    ));
  } else {
    main.append(h('p', { class: 'note' },
      '🎉 أتممتَ الرحلة كلها — من الحرف الأول إلى المصحف وحديقة الكلمات وسلّم الجمل!'));
  }

  // الدرب المتعرج: انعطافة خيط بين كل محطتين، يمنةً مرة ويسرةً مرة (DESIGN §٦)
  let groupIndex = 0;
  let stations = 0;
  for (const section of progress.journey()) {
    if (stations++) main.append(trailEl(stations % 2 === 0));
    main.append(section.kind === 'group' ? stationEl(section, groupIndex++, next)
      : section.kind === 'quran' ? quranEl(section, next)
        : section.kind === 'garden' ? gardenEl(section, next)
          : section.kind === 'ladder' ? ladderEl(section, next)
            : interludeEl(section, next));
  }

  if (DEV) {
    main.append(h('div', { class: 'dev' },
      h('div', { class: 'dev-title' }, 'أدوات التجربة (?dev=1) — لا تظهر للطفل'),
      h('div', { class: 'dev-row' },
        h('button', { class: 'btn', onclick: () => fillAll(1) }, 'أنجِز الكل بنجمة'),
        h('button', { class: 'btn', onclick: () => fillAll(3) }, 'أنجِز الكل بثلاث'),
        h('button', {
          class: 'btn',
          onclick: () => {
            if (!confirm('محو كل تقدّم الطفل؟')) return;
            progress.reset();
            toast('حُذف التقدّم');
            render();
          },
        }, 'محو التقدّم'),
      )));
  }

  screen.append(main);
  return screen;
}

/**
 * بطاقة «مراجعة اليوم» فوق الخريطة: تظهر متى صار للطفل حصيلة يُراجَع فيها،
 * وتتقدّم على «تابع من هنا» لأن تثبيت المتزعزع أولى من درس جديد يُبنى عليه.
 * مراجعة اليوم إن تمّت تبقى مفتوحة للإعادة لكنها تفقد نبرة الإلحاح.
 */
function reviewCard() {
  const letters = progress.studiedLetters();
  if (letters.length < 2) return null;   // لا حصيلة بعدُ: لا مراجعة

  const due = progress.dueSkills().length;
  const done = Boolean(progress.reviewOf());
  const line = done ? 'تمّت مراجعة اليوم — يمكنك إعادتها'
    : due ? `حان وقت تثبيت ${skillsText(due)}`
      : 'تمارين سريعة مما درسته';

  return h('button', {
    class: `continue continue--review${done ? ' continue--done' : ''}`,
    onclick: () => go('#/review'),
  },
    h('span', { class: 'continue-face' }, done ? '✓' : '🔁'),
    h('span', { class: 'continue-text' },
      h('b', {}, 'مراجعة اليوم'),
      h('small', {}, line)),
  );
}

function stationEl(section, index, next) {
  const group = section.group;
  const unlocked = progress.isGroupUnlocked(group.id);
  const stats = progress.groupStars(group);
  const complete = progress.isGroupComplete(group);

  return trackEl({
    className: `station${unlocked ? '' : ' station--locked'}${complete ? ' station--done' : ''}`,
    accent: ACCENTS[index % ACCENTS.length],
    mark: 'house',
    label: `${group.title}${unlocked ? '' : ' — مقفلة'}`,
    badge: arNum(index + 1),
    title: group.title,
    sub: group.letters.join(' '),
    meta: unlocked ? [h('b', {}, `★ ${arNum(stats.earned)}`), ` / ${arNum(stats.max)}`] : '🔒 مقفلة',
    nodes: section.nodes,
    next,
  });
}

/**
 * محطة ما بين المجموعتين: دروس العلامات والقصص (§٥ من المنهج).
 * تُميَّز بلونها وشكلها كي يعرف الطفل — ووليّ أمره — أنها استراحة من الحروف.
 */
function interludeEl(section, next) {
  const unlocked = progress.isNodeUnlockedById(section.nodes[0].id);
  const complete = section.nodes.every((n) => progress.isDone(n.id));
  const earned = section.nodes.reduce((sum, n) => sum + progress.getStars(n.id), 0);

  return trackEl({
    className: `station station--pause${unlocked ? '' : ' station--locked'}${complete ? ' station--done' : ''}`,
    accent: PAUSE_ACCENT,
    mark: 'bridge',
    label: `محطة المهارات والقصص${unlocked ? '' : ' — مقفلة'}`,
    badge: '✦',
    title: 'مهارات وقصص',
    sub: section.nodes.map(nodeTitle).join(' · '),
    meta: unlocked
      ? [h('b', {}, `★ ${arNum(earned)}`), ` / ${arNum(section.nodes.length * progress.MAX_STARS)}`]
      : '🔒 مقفلة',
    nodes: section.nodes,
    next,
  });
}

/**
 * محطة الخاتمة: المرحلة القرآنية (§١.٢ و§٥.٦). خضرتها تميّزها عن كل ما قبلها،
 * ولا تُفتح إلا بإتمام الرحلة كلها — فهي تتويج التأسيس لا بديل عنه.
 */
function quranEl(section, next) {
  const unlocked = progress.isNodeUnlockedById(section.nodes[0].id);
  const complete = section.nodes.every((n) => progress.isDone(n.id));
  const earned = section.nodes.reduce((sum, n) => sum + progress.getStars(n.id), 0);

  return trackEl({
    className: `station station--quran${unlocked ? '' : ' station--locked'}${complete ? ' station--done' : ''}`,
    accent: QURAN_ACCENT,
    mark: 'dome',
    label: `${QURAN.title}${unlocked ? '' : ' — مقفلة'}`,
    badge: QURAN.face,
    title: QURAN.title,
    sub: 'كلمات ورسم المصحف وسور قصار',
    meta: unlocked
      ? [h('b', {}, `★ ${arNum(earned)}`), ` / ${arNum(section.nodes.length * progress.MAX_STARS)}`]
      : '🔒 مقفلة',
    nodes: section.nodes,
    next,
  });
}

/**
 * بستان موضوعات (الحزمة ٧): محطةٌ لكل موضوع، عقدها باقات من خمس كلمات.
 * تأتي بعد المرحلة القرآنية — هنا يتوسّع الرصيد بعد أن اكتمل فكّ الشيفرة.
 */
function gardenEl(section, next) {
  const garden = section.garden;
  const unlocked = progress.isNodeUnlockedById(section.nodes[0].id);
  const complete = section.nodes.every((n) => progress.isDone(n.id));
  const earned = section.nodes.reduce((sum, n) => sum + progress.getStars(n.id), 0);

  return trackEl({
    className: `station station--garden${unlocked ? '' : ' station--locked'}${complete ? ' station--done' : ''}`,
    accent: accentForGarden(garden),
    mark: 'garden',
    label: `بستان ${garden.title}${unlocked ? '' : ' — مقفل'}`,
    badge: garden.emoji,
    title: `بستان ${garden.title}`,
    sub: unlocked
      ? `${arCount(garden.words.length, ['كلمة', 'كلمتان', 'كلمات', 'كلمة'])} في `
        + `${arCount(section.nodes.length, ['باقة', 'باقتين', 'باقات', 'باقة'])}`
      : `${arCount(garden.words.length, ['كلمة', 'كلمتان', 'كلمات', 'كلمة'])} جديدة`,
    meta: unlocked
      ? [h('b', {}, `★ ${arNum(earned)}`), ` / ${arNum(section.nodes.length * progress.MAX_STARS)}`]
      : '🔒 مقفل',
    nodes: section.nodes,
    next,
  });
}

/**
 * محطة «سلّم الجمل» (الحزمة ٨): درجاتٌ بعد كل بستان — من الكلمة إلى الجملة.
 * لونها لون القصص (قراءة متصلة)، ومعلمها سلّم يميّزها عن بستانها الزيتوني.
 */
function ladderEl(section, next) {
  const garden = section.garden;
  const unlocked = progress.isNodeUnlockedById(section.nodes[0].id);
  const complete = section.nodes.every((n) => progress.isDone(n.id));
  const earned = section.nodes.reduce((sum, n) => sum + progress.getStars(n.id), 0);
  const sentences = section.ladder.rungs.reduce((sum, r) => sum + r.sentences.length, 0);

  return trackEl({
    className: `station station--ladder${unlocked ? '' : ' station--locked'}${complete ? ' station--done' : ''}`,
    accent: SENTENCE_ACCENT,
    mark: 'ladder',
    label: `سلّم جمل ${garden.title}${unlocked ? '' : ' — مقفل'}`,
    badge: '📖',
    title: `جمل ${garden.title}`,
    sub: `${arCount(sentences, ['جملة', 'جملتان', 'جمل', 'جملة'])} في `
      + `${arCount(section.nodes.length, ['درجة', 'درجتين', 'درجات', 'درجة'])}`,
    meta: unlocked
      ? [h('b', {}, `★ ${arNum(earned)}`), ` / ${arNum(section.nodes.length * progress.MAX_STARS)}`]
      : '🔒 مقفل',
    nodes: section.nodes,
    next,
  });
}

/** لون العقدة في بطاقة «تابع من هنا»: لون مجموعتها، أو لون محطتها الخاصة. */
function accentOf(node, group) {
  if (node.type === 'quran') return QURAN_ACCENT;
  if (node.type === 'garden') return accentForGarden(node.garden);
  if (node.type === 'ladder') return SENTENCE_ACCENT;
  if (node.type === 'skill' || node.type === 'story') return PAUSE_ACCENT;
  return accentFor(group);
}

/** انعطافة خيط الدرب بين محطتين — زخرفة صامتة. */
function trailEl(flip) {
  const el = h('div', { class: `trail${flip ? ' trail--flip' : ''}`, 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 72 36" fill="none">
    <path d="M14 2 C 40 10, 32 26, 58 34" stroke="var(--ink-soft)" stroke-width="3"
      stroke-linecap="round" stroke-dasharray="1 8" opacity=".55"/></svg>`;
  return el;
}

function trackEl({ className, accent, mark, label, badge, title, sub, meta, nodes, next }) {
  const station = h('section', { class: className, css: { '--accent': accent }, 'aria-label': label },
    h('div', { class: 'station-head' },
      h('span', { class: 'station-num' }, badge),
      h('div', {},
        h('h2', {}, title),
        h('p', { class: 'station-letters' }, sub),
      ),
      h('div', { class: 'station-meta' }, meta),
    ),
  );

  const track = h('ol', { class: 'track' });
  for (const node of nodes) track.append(h('li', {}, nodeButton(node, next)));
  station.append(track);
  if (mark) station.append(landmark(mark));
  return station;
}

function nodeButton(node, next) {
  const stars = progress.getStars(node.id);
  const open = progress.isNodeUnlockedById(node.id);
  const isNext = next && next.id === node.id;
  const label = nodeTitle(node);
  const state = !open ? 'locked' : stars ? 'done' : 'open';

  const btn = h('button', {
    class: `node node--${node.type} node--${state}${isNext ? ' node--next' : ''}`,
    css: node.type === 'story' ? { '--accent': STORY_ACCENT } : {},
    'aria-label': `${label} — ${open ? (stars ? `${arNum(stars)} نجوم` : 'مفتوح') : 'مقفل'}`,
    onclick: () => {
      if (!open) {
        btn.classList.remove('shake');
        void btn.offsetWidth;          // إعادة تشغيل الحركة
        btn.classList.add('shake');
        toast('أكمِل ما قبله أولاً 😊');
        return;
      }
      openNode(node);
    },
  },
    h('span', { class: 'node-face' }, open
      ? nodeFace(node)
      : h('span', { class: 'node-lock' }, '🔒')),
    starsRow(stars),
  );

  if (isNext) btn.dataset.next = '1';
  return btn;
}

function openNode(node) {
  if (node.type === 'letter') go(`#/lesson/${node.groupId}/${encodeURIComponent(node.letter)}`);
  else if (node.type === 'words') go(`#/words/${node.groupId}`);
  else go(`#/${node.type}/${encodeURIComponent(node.part)}`);
}

function fillAll(stars) {
  for (const node of progress.allNodes()) progress.setStars(node.id, stars);
  toast('حُدِّث التقدّم');
  render();
}

// ————— شاشة فحص الأصوات (للمراجعة بالأذن — dev فقط) —————

async function renderAudit() {
  await audio.ready();
  const main = h('main', { class: 'screen-card audit' },
    h('h2', {}, 'فحص الأصوات'),
    h('p', { class: 'hint' }, 'اضغط أي بطاقة لسماعها. المحاط بالأحمر بلا ملف مولَّد.'));

  const chip = (text, label) => h('button', {
    class: `chip${audio.hasFile(text) === false ? ' chip--missing' : ''}`,
    'aria-label': label || text,
    onclick: () => audio.play(text),
  }, text);

  for (const group of GROUPS) {
    main.append(h('h3', {}, `${group.title} — الحروف`));
    main.append(h('div', { class: 'audit-row' }, group.letters.flatMap((ch) => [
      chip(LETTERS[ch].name, `اسم ${letterTitle(ch)}`),
      ...HARAKAT.map((k) => chip(ch + k.mark)),
    ])));
    main.append(h('h3', {}, `${group.title} — المقاطع والكلمات`));
    main.append(h('div', { class: 'audit-row' }, group.words.flatMap((w) => [
      ...w.tiles.map((t) => chip(t)),
      chip(w.say, `كلمة ${w.say}`),
    ])));
  }

  return h('div', { class: 'screen' },
    topbar(h('button', { class: 'btn', onclick: () => go('#/') }, '→ الخريطة')),
    main);
}

// ————— التوجيه —————
// أي مسار غير معروف يعود بالطفل إلى الخريطة، ولا يعرض له خطأً.

let renderToken = 0;

async function render() {
  audio.stop();
  recitation.stop();     // ولا تتبع التلاوةُ الطفلَ إلى شاشةٍ أخرى
  const token = ++renderToken;
  const [name, arg1, arg2] = location.hash.replace(/^#\/?/, '').split('/');

  // القفل يُحرس في التوجيه أيضاً، لا في أزرار الخريطة وحدها
  const guard = (id) => {
    if (!progress.findNode(id)) return true;          // عقدة لا وجود لها: الشاشة تردّه للخريطة
    if (progress.isNodeUnlockedById(id)) return true;
    toast('أكمِل ما قبله أولاً 😊');
    location.replace('#/');
    return false;
  };

  let screen;
  if (name === 'lesson' && arg1 && arg2) {
    const letter = decodeURIComponent(arg2);
    if (!guard(progress.nodeId(arg1, letter))) return;
    screen = renderLesson(arg1, letter) || renderMap();
  } else if (name === 'words' && arg1) {
    if (!guard(progress.nodeId(arg1, progress.WORDS_PART))) return;
    screen = renderWordsGame(arg1) || renderMap();
  } else if (name === 'skill' && arg1) {
    if (!guard(`skill:${decodeURIComponent(arg1)}`)) return;
    screen = renderSkillLesson(decodeURIComponent(arg1)) || renderMap();
  } else if (name === 'story' && arg1) {
    if (!guard(`story:${decodeURIComponent(arg1)}`)) return;
    screen = renderStory(decodeURIComponent(arg1)) || renderMap();
  } else if (name === 'quran' && arg1) {
    if (!guard(`quran:${decodeURIComponent(arg1)}`)) return;
    screen = renderQuran(decodeURIComponent(arg1)) || renderMap();
  } else if (name === 'garden' && arg1) {
    if (!guard(`garden:${decodeURIComponent(arg1)}`)) return;
    screen = renderGarden(decodeURIComponent(arg1)) || renderMap();
  } else if (name === 'ladder' && arg1) {
    if (!guard(`ladder:${decodeURIComponent(arg1)}`)) return;
    screen = renderLadder(decodeURIComponent(arg1)) || renderMap();
  } else if (name === 'review') {
    screen = renderReview();
    if (!screen) {                       // لا حصيلة للمراجعة بعدُ
      toast('أتمِم درساً أولاً، ثم تأتي المراجعة 😊');
      location.replace('#/');
      return;
    }
  } else if (name === 'parent') {
    screen = renderParent(render);
  } else if (name === 'audio' && DEV) {
    screen = await renderAudit();
  } else {
    screen = renderMap();
  }

  if (token !== renderToken) return;   // سبقتنا وجهة أحدث
  app.replaceChildren(screen);
  if (!name) revealNext();
  else window.scrollTo(0, 0);
}

/** إبقاء العقدة التالية في مجال النظر عند العودة للخريطة. */
function revealNext() {
  const el = app.querySelector('[data-next]');
  if (!el) return;
  const box = el.getBoundingClientRect();
  if (box.top < 0 || box.bottom > innerHeight) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

// ————— ساعة الاستخدام —————
// تُحسب دقائق التعلّم الفعلي وحدها: الصفحة ظاهرة، وللطفل تفاعل قريب.
// (شاشة مفتوحة منسيّة لا تُحسب — وإلا كذبت لوحة وليّ الأمر على وليّ الأمر.)

const TICK_MS = 10000;
const IDLE_MS = 60000;
let lastTouch = Date.now();

function startClock() {
  const touched = () => { lastTouch = Date.now(); };
  for (const type of ['pointerdown', 'keydown', 'hashchange']) {
    window.addEventListener(type, touched, { passive: true });
  }
  document.addEventListener('visibilitychange', touched);
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastTouch > IDLE_MS) return;
    progress.addSeconds(TICK_MS / 1000);
  }, TICK_MS);
}

// ————— العمل دون إنترنت (PWA) —————
// عامل الخدمة يخزن الهيكل والأصوات كلها (app/sw.js)، فبعد أول فتح يعمل التطبيق
// بلا شبكة. لا يُسجَّل من file:// (لا يقبله المتصفّح) ولا يُسقِط التطبيق إن رُفض.

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  navigator.serviceWorker
    .register(new URL('../sw.js', import.meta.url), { scope: './' })
    .catch((e) => console.warn('[sw] لم يُسجَّل عامل الخدمة:', e));
}

window.addEventListener('hashchange', render);
audio.ready();
startClock();
render();
registerServiceWorker();
