// أدوات واجهة مشتركة بين الشاشات (بلا إطار عمل): بناء DOM، أرقام عربية، رسائل عابرة.
// لا تلمس هذه الوحدة الـDOM وقت التحميل، فتبقى قابلة للاستيراد في اختبارات node.

import { GROUPS, LETTERS } from './curriculum.js';

export const DEV = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('dev') === '1';

// لون لكل مجموعة على الخريطة (يتغيّر المشهد كلما تقدّم الطفل)
export const ACCENTS = ['#e8590c', '#2f9e44', '#1971c2', '#9c36b5', '#0c8599', '#c92a2a', '#f08c00'];

/** لون محطات ما بين المجموعات (المهارات والقصص) — يميّزها عن محطات الحروف. */
export const PAUSE_ACCENT = '#5f3dc4';

export function accentFor(group) {
  return ACCENTS[Math.max(0, GROUPS.indexOf(group)) % ACCENTS.length];
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export const arNum = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[+d]);

/**
 * صياغة المعدود بالعربية الصحيحة: [مفرد، مثنى، جمع قلة (٣–١٠)، مفرد منصوب (١١+)].
 * الشاشة يقرؤها وليّ أمر عربي — «٨ دقيقة» غلط لا يليق بتطبيق يعلّم العربية.
 */
export function arCount(n, [one, two, few, many]) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${arNum(n)} ${few}`;
  return `${arNum(n)} ${many}`;
}

/** اسم الحرف كما يُقرأ في العناوين: «حرف باء». */
export const letterTitle = (ch) => `حرف ${LETTERS[ch]?.name ?? ch}`;

/** الكلمة كما تُعرض للطفل: تركيب مقاطعها المشكولة. */
export const wordText = (word) => word.tiles.join('');

/** اسم عقدة الخريطة كما يُعرض للطفل ولوليّ أمره (حرف · لعبة · مهارة · قصة). */
export function nodeTitle(node) {
  if (node.type === 'letter') return letterTitle(node.letter);
  if (node.type === 'words') return 'لعبة الكلمات';
  if (node.type === 'skill') return node.skill.title;
  if (node.type === 'story') return `قصة «${node.story.title}»`;
  return '';
}

/** موضع العقدة في الرحلة: اسم مجموعتها، أو محطة ما بين المجموعتين. */
export function nodeWhere(node) {
  if (node.type === 'letter' || node.type === 'words') {
    return GROUPS.find((g) => g.id === node.groupId)?.title ?? '';
  }
  return 'محطة المهارات والقصص';
}

/** وجه العقدة على الخريطة: الحرف نفسه، أو رمز يدلّ على نوعها. */
export function nodeFace(node) {
  if (node.type === 'letter') return node.letter;
  if (node.type === 'words') return '🧩';
  if (node.type === 'skill') return node.skill.face;
  if (node.type === 'story') return node.story.emoji;
  return '';
}

// ————— بناء DOM —————

export function h(tag, props = {}, ...children) {
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
export function toast(message) {
  const toastEl = document.getElementById('toast');
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

export function go(hash) {
  location.hash = hash;
}

export function topbar(...extra) {
  return h('header', { class: 'topbar' }, extra);
}

export function starsRow(count, className = 'node-stars') {
  return h('span', { class: className, 'aria-hidden': 'true' },
    [0, 1, 2].map((i) => h('span', { class: i < count ? 'on' : '' }, i < count ? '★' : '☆')));
}

/** هزّة قصيرة تنبّه الطفل إلى خطأ دون كلام. */
export function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;   // إعادة تشغيل الحركة
  el.classList.add('shake');
}

// ————— عشوائية (قابلة للحقن في الاختبارات) —————

export function shuffle(list, rnd = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const pick = (list, rnd = Math.random) => list[Math.floor(rnd() * list.length)];
