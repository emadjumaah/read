// تقدّم الطفل: نجوم كل عقدة + قواعد فتح المجموعات، محفوظة في localStorage.
// حساب واحد في هذه المرحلة. سجلّ الأخطاء (errors) و(seconds) محجوزان للجلسة ٥.

import { GROUPS } from './curriculum.js';

const STORE_KEY = 'muallim.progress.v1';
export const MAX_STARS = 3;
export const WORDS_PART = 'words';   // عقدة لعبة الكلمات في آخر كل مجموعة

const listeners = new Set();

function blank() {
  return { v: 1, stars: {}, seconds: 0, errors: {}, startedAt: Date.now(), updatedAt: Date.now() };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return blank();
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || typeof data.stars !== 'object') return blank();
    return { ...blank(), ...data };
  } catch {
    return blank();   // تخزين معطّل أو ممتلئ: نكمل في الذاكرة بلا انهيار
  }
}

let state = load();

function save() {
  state.updatedAt = Date.now();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    console.warn('[progress] تعذّر الحفظ في localStorage');
  }
  for (const fn of listeners) fn(state);
}

/** الاشتراك في تغيّر التقدّم (لإعادة رسم الخريطة). */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ————— العقد —————

/** معرّف عقدة: «g1:ب» لدرس حرف، «g1:words» للعبة الكلمات. */
export function nodeId(groupId, part) {
  return `${groupId}:${part}`;
}

/** عقد المجموعة بالترتيب: كل حرف ثم لعبة الكلمات. */
export function groupNodes(group) {
  const nodes = group.letters.map((letter) => ({
    id: nodeId(group.id, letter),
    type: 'letter',
    groupId: group.id,
    part: letter,
    letter,
  }));
  nodes.push({
    id: nodeId(group.id, WORDS_PART),
    type: 'words',
    groupId: group.id,
    part: WORDS_PART,
  });
  return nodes;
}

export function findGroup(groupId) {
  return GROUPS.find((g) => g.id === groupId) || null;
}

// ————— النجوم —————

export function getStars(id) {
  return state.stars[id] || 0;
}

export function isDone(id) {
  return getStars(id) > 0;
}

/**
 * تسجيل نتيجة عقدة. لا يُنقص ما سبق: تكرار الدرس يرفع النجوم ولا يخفضها.
 * @returns {boolean} هل تحسّنت النتيجة؟
 */
export function setStars(id, stars) {
  const n = Math.max(0, Math.min(MAX_STARS, Math.round(stars)));
  if (n <= getStars(id)) return false;
  state.stars[id] = n;
  save();
  return true;
}

/** نجوم المجموعة الحالية وسقفها. */
export function groupStars(group) {
  const nodes = groupNodes(group);
  return {
    earned: nodes.reduce((sum, n) => sum + getStars(n.id), 0),
    max: nodes.length * MAX_STARS,
    doneNodes: nodes.filter((n) => isDone(n.id)).length,
    totalNodes: nodes.length,
  };
}

export function totalStars() {
  return GROUPS.reduce((sum, g) => sum + groupStars(g).earned, 0);
}

export function maxTotalStars() {
  return GROUPS.reduce((sum, g) => sum + groupNodes(g).length * MAX_STARS, 0);
}

// ————— القفل التسلسلي —————

/** المجموعة مكتملة = كل حروفها ولعبة كلماتها أُنجزت. */
export function isGroupComplete(group) {
  return groupNodes(group).every((n) => isDone(n.id));
}

/** تُفتح المجموعة الأولى دائماً، وما بعدها بإتمام سابقتها (لعبة الكلمات آخرها). */
export function isGroupUnlocked(groupId) {
  const index = GROUPS.findIndex((g) => g.id === groupId);
  if (index <= 0) return index === 0;
  return isGroupComplete(GROUPS[index - 1]);
}

/**
 * داخل المجموعة: الحرف يُفتح بإتمام الحرف الذي قبله،
 * ولعبة الكلمات تُفتح بإتمام حروف المجموعة كلها.
 */
export function isNodeUnlocked(groupId, part) {
  const group = findGroup(groupId);
  if (!group || !isGroupUnlocked(groupId)) return false;
  const nodes = groupNodes(group);
  const index = nodes.findIndex((n) => n.part === part);
  if (index < 0) return false;
  return nodes.slice(0, index).every((n) => isDone(n.id));
}

/** أول عقدة مفتوحة لم تُنجَز — «تابع من هنا». */
export function nextNode() {
  for (const group of GROUPS) {
    if (!isGroupUnlocked(group.id)) return null;
    for (const node of groupNodes(group)) {
      if (!isDone(node.id)) return node;
    }
  }
  return null;   // اكتملت الرحلة
}

// ————— إدارة —————

export function snapshot() {
  return JSON.parse(JSON.stringify(state));
}

export function reset() {
  state = blank();
  save();
}
