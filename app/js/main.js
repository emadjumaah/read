// نقطة الدخول: خريطة الرحلة (المجموعات السبع) والتوجيه بين الشاشات.
// درس الحرف (الجلسة ٢) ولعبة الكلمات (الجلسة ٣) لهما هنا شاشتان مؤقتتان
// تعرضان الحرف/الكلمات للاستماع فقط، وتُستبدلان بالكامل في جلستيهما.

import { GROUPS, LETTERS, HARAKAT } from './curriculum.js';
import * as progress from './progress.js';
import * as audio from './audio.js';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const DEV = new URLSearchParams(location.search).get('dev') === '1';

// لون لكل مجموعة على الخريطة (يتغيّر المشهد كلما تقدّم الطفل)
const ACCENTS = ['#e8590c', '#2f9e44', '#1971c2', '#9c36b5', '#0c8599', '#c92a2a', '#f08c00'];

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arNum = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[+d]);

// ————— أدوات بناء DOM (بلا إطار عمل) —————

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'css') for (const [k, v] of Object.entries(value)) el.style.setProperty(k, v);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value);
  }
  for (const child of children.flat(2)) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

let toastTimer = 0;
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

function go(hash) {
  location.hash = hash;
}

function starsRow(count, className = 'node-stars') {
  return h('span', { class: className, 'aria-hidden': 'true' },
    [0, 1, 2].map((i) => h('span', { class: i < count ? 'on' : '' }, i < count ? '★' : '☆')));
}

/** اسم الحرف كما يُقرأ في العناوين: «حرف باء». */
const letterTitle = (ch) => `حرف ${LETTERS[ch]?.name ?? ch}`;

/** الكلمة كما تُعرض للطفل: تركيب مقاطعها المشكولة. */
const wordText = (word) => word.tiles.join('');

// ————— خريطة الرحلة —————

function topbar(...extra) {
  return h('header', { class: 'topbar' }, extra);
}

function renderMap() {
  const earned = progress.totalStars();
  const next = progress.nextNode();

  const screen = h('div', {},
    topbar(
      h('h1', {}, 'المُعلِّم'),
      h('span', { class: 'spacer' }),
      DEV && h('button', { class: 'btn btn--ghost', onclick: () => go('#/audio') }, '🔊 فحص الأصوات'),
      h('span', { class: 'pill pill--stars' }, `★ ${arNum(earned)} / ${arNum(progress.maxTotalStars())}`),
    ),
  );

  const main = h('main', { class: 'map' });

  if (next) {
    const group = progress.findGroup(next.groupId);
    main.append(h('button', {
      class: 'continue',
      css: { '--accent': ACCENTS[GROUPS.indexOf(group) % ACCENTS.length] },
      onclick: () => openNode(next),
    },
      h('span', { class: 'continue-face' }, next.type === 'letter' ? next.letter : '🧩'),
      h('span', { class: 'continue-text' },
        h('b', {}, next.type === 'letter' ? letterTitle(next.letter) : 'لعبة الكلمات'),
        h('small', {}, `تابع من هنا · ${group.title}`)),
    ));
  } else {
    main.append(h('p', { class: 'note' }, '🎉 أتممتَ كل المجموعات! المرحلة القرآنية تأتي لاحقاً بإذن الله.'));
  }

  GROUPS.forEach((group, index) => main.append(stationEl(group, index, next)));

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

function stationEl(group, index, next) {
  const unlocked = progress.isGroupUnlocked(group.id);
  const stats = progress.groupStars(group);
  const complete = progress.isGroupComplete(group);

  const station = h('section', {
    class: `station${unlocked ? '' : ' station--locked'}${complete ? ' station--done' : ''}`,
    css: { '--accent': ACCENTS[index % ACCENTS.length] },
    'aria-label': `${group.title}${unlocked ? '' : ' — مقفلة'}`,
  },
    h('div', { class: 'station-head' },
      h('span', { class: 'station-num' }, arNum(index + 1)),
      h('div', {},
        h('h2', {}, group.title),
        h('p', { class: 'station-letters' }, group.letters.join(' ')),
      ),
      h('div', { class: 'station-meta' }, unlocked
        ? [h('b', {}, `★ ${arNum(stats.earned)}`), ` / ${arNum(stats.max)}`]
        : '🔒 مقفلة'),
    ),
  );

  const track = h('ol', { class: 'track' });
  for (const node of progress.groupNodes(group)) {
    track.append(h('li', {}, nodeButton(group, node, next)));
  }
  station.append(track);
  return station;
}

function nodeButton(group, node, next) {
  const stars = progress.getStars(node.id);
  const open = progress.isNodeUnlocked(node.groupId, node.part);
  const isNext = next && next.id === node.id;
  const label = node.type === 'letter' ? letterTitle(node.letter) : `لعبة كلمات ${group.title}`;
  const state = !open ? 'locked' : stars ? 'done' : 'open';

  const btn = h('button', {
    class: `node node--${node.type === 'words' ? 'words' : 'letter'} node--${state}${isNext ? ' node--next' : ''}`,
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
      ? (node.type === 'letter' ? node.letter : '🧩')
      : h('span', { class: 'node-lock' }, '🔒')),
    starsRow(stars),
  );

  if (isNext) btn.dataset.next = '1';
  return btn;
}

function openNode(node) {
  if (node.type === 'letter') go(`#/lesson/${node.groupId}/${encodeURIComponent(node.letter)}`);
  else go(`#/words/${node.groupId}`);
}

function fillAll(stars) {
  for (const group of GROUPS) {
    for (const node of progress.groupNodes(group)) progress.setStars(node.id, stars);
  }
  toast('حُدِّث التقدّم');
  render();
}

// ————— شاشة مؤقتة: درس الحرف (تُبنى كاملةً في الجلسة ٢) —————

function renderLesson(groupId, letter) {
  const group = progress.findGroup(groupId);
  if (!group) return renderMap();
  const accent = ACCENTS[GROUPS.indexOf(group) % ACCENTS.length];
  const name = LETTERS[letter]?.name ?? letter;

  audio.preload([name, ...HARAKAT.map((k) => letter + k.mark)]);

  return h('div', { class: 'screen', css: { '--accent': accent } },
    topbar(
      h('button', { class: 'btn', onclick: () => go('#/') }, '→ الخريطة'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, group.title),
    ),
    h('main', { class: 'screen-card' },
      h('h2', {}, letterTitle(letter)),
      h('button', {
        class: 'giant',
        'aria-label': `اسمع اسم ${letterTitle(letter)}`,
        onclick: () => audio.play(name),
      }, letter),
      h('p', { class: 'hint' }, 'اضغط الحرف لتسمع اسمه'),
      h('div', { class: 'row' }, HARAKAT.map((k) => h('button', {
        class: 'chip',
        'aria-label': `${letter} بال${k.name}`,
        onclick: () => audio.play(letter + k.mark),
      }, letter + k.mark))),
      h('p', { class: 'note' },
        'هذه شاشة مؤقتة. درس الحرف الكامل (اسمع وشاهد · الحركات · تتبّع · ميّز بأذنك) يُبنى في الجلسة ٢.'),
      DEV && devStars(progress.nodeId(groupId, letter)),
    ),
  );
}

// ————— شاشة مؤقتة: كلمات المجموعة (اللعبة في الجلسة ٣) —————

function renderWords(groupId) {
  const group = progress.findGroup(groupId);
  if (!group) return renderMap();
  const accent = ACCENTS[GROUPS.indexOf(group) % ACCENTS.length];

  audio.preload(group.words.map((w) => w.say));

  return h('div', { class: 'screen', css: { '--accent': accent } },
    topbar(
      h('button', { class: 'btn', onclick: () => go('#/') }, '→ الخريطة'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, group.title),
    ),
    h('main', { class: 'screen-card' },
      h('h2', {}, 'كلمات المجموعة'),
      h('p', { class: 'hint' }, 'اضغط الكلمة لتسمعها'),
      h('ul', { class: 'words' }, group.words.map((word) => h('li', {},
        h('button', {
          class: 'word',
          'aria-label': `اسمع كلمة ${word.say}`,
          onclick: () => audio.play(word.say),
        },
          h('span', { class: 'word-emoji' }, word.emoji),
          h('span', { class: 'word-text' }, wordText(word)),
          h('span', { class: 'word-tiles' }, word.tiles.join(' · ')),
        )))),
      h('p', { class: 'note' },
        'هذه شاشة مؤقتة للاستماع. لعبة تركيب المقاطع تُبنى في الجلسة ٣.'),
      DEV && devStars(progress.nodeId(groupId, progress.WORDS_PART)),
    ),
  );
}

function devStars(nodeId) {
  return h('div', { class: 'dev' },
    h('div', { class: 'dev-title' }, 'أدوات التجربة — تُحذف مع بناء الشاشة الحقيقية'),
    h('div', { class: 'dev-row' }, [1, 2, 3].map((n) => h('button', {
      class: 'btn',
      onclick: () => { progress.setStars(nodeId, n); toast(`${arNum(n)} ★`); go('#/'); },
    }, `أنهِ بـ ${arNum(n)} ★`))),
  );
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
  const token = ++renderToken;
  const [name, arg1, arg2] = location.hash.replace(/^#\/?/, '').split('/');

  // القفل يُحرس في التوجيه أيضاً، لا في أزرار الخريطة وحدها
  const guard = (groupId, part) => {
    if (progress.isNodeUnlocked(groupId, part)) return true;
    toast('أكمِل ما قبله أولاً 😊');
    location.replace('#/');
    return false;
  };

  let screen;
  if (name === 'lesson' && arg1 && arg2) {
    const letter = decodeURIComponent(arg2);
    if (!guard(arg1, letter)) return;
    screen = renderLesson(arg1, letter);
  } else if (name === 'words' && arg1) {
    if (!guard(arg1, progress.WORDS_PART)) return;
    screen = renderWords(arg1);
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

window.addEventListener('hashchange', render);
audio.ready();
render();
