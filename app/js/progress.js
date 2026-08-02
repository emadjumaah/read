// تقدّم الطفل: نجوم كل عقدة + قواعد فتح المجموعات + سجلّ المهارات ودقائق الاستخدام،
// محفوظ كله في localStorage. حساب واحد في هذه المرحلة.
//
// سجلّ المهارات (الجلسة ٥ · METHOD §٦): كل تمرين يسجَّل على مستوى
// **الحرف × الحركة × نوع التمرين**، ومنه يُبنى التكرار المتباعد وجلسة المراجعة
// ولوحة وليّ الأمر. لا نصّ منطوق جديد هنا — القياس لا يضيف محتوى.

import { GROUPS, SKILLS, STORIES, QURAN, quranParts, bareLetters } from './curriculum.js';

const STORE_KEY = 'muallim.progress.v1';
export const VERSION = 2;            // ١ = نجوم فقط (تُرقّى تلقائياً بلا فقد)
export const MAX_STARS = 3;
export const WORDS_PART = 'words';   // عقدة لعبة الكلمات في آخر كل مجموعة

/** أنواع التمارين المقيسة — أسماؤها ثابتة لأنها تُخزَّن في مفاتيح المهارات. */
export const KINDS = { QUIZ: 'quiz', HARAKA: 'haraka', BUILD: 'build' };

/** تباعد ليتنر بالأيام: كل إجابة صحيحة ترفع الصندوق، والخطأ يعيده إلى الصفر. */
export const BOX_DAYS = [0, 1, 2, 4, 8, 16];
export const MAX_BOX = BOX_DAYS.length - 1;
export const MASTERED_BOX = 3;       // من بلغه في كل تمارينه يُعدّ متقناً

const listeners = new Set();

function blank() {
  return {
    v: VERSION,
    stars: {},        // معرّف عقدة ← نجوم
    skills: {},       // «حرف|حركة|تمرين» ← {right, wrong, box, due, seen}
    days: {},         // «YYYY-MM-DD» ← ثوانٍ من الاستعمال الفعلي
    reviews: {},      // «YYYY-MM-DD» ← {items, right, at}
    seconds: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** ترقية حالة قديمة إلى النسخة الحالية دون فقد نجوم الطفل. */
function migrate(data) {
  if (!data || typeof data !== 'object' || typeof data.stars !== 'object') return null;
  if (data.v !== 1 && data.v !== VERSION) return null;
  const { errors, ...rest } = data;   // errors: حقل النسخة ١ المحجوز، حلّت محلّه skills
  return { ...blank(), ...rest, v: VERSION };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return blank();
    return migrate(JSON.parse(raw)) || blank();
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

/**
 * عقد ما بين المجموعات (الجلسة ٤): دروس المهارات ثم القصص التي تلي مجموعةً ما.
 * المهارة قبل القصة لأن القصة تُوظّف علامتها (شدّة ← قصة فيها شدّة).
 */
export function interludeNodes(groupId) {
  return [
    ...SKILLS.filter((s) => s.after === groupId).map((skill) => ({
      id: `skill:${skill.id}`, type: 'skill', groupId, part: skill.id, skill,
    })),
    ...STORIES.filter((s) => s.after === groupId).map((story) => ({
      id: `story:${story.id}`, type: 'story', groupId, part: story.id, story,
    })),
  ];
}

/**
 * عقد المرحلة القرآنية (الجلسة ٦): خاتمة الرحلة بعد المجموعة السابعة وما تلاها.
 * ترتيبها من `quranParts()` — بيانات المنهج وحدها تحدّد ما فيها.
 */
export function quranNodes() {
  return quranParts().map(({ part, title, face }) => ({
    id: `quran:${part}`, type: 'quran', groupId: QURAN.after, part, title, face,
  }));
}

/** الرحلة كاملةً بأقسامها بالترتيب: مجموعة ← ما بعدها من مهارات وقصص ← … ← المرحلة القرآنية. */
export function journey() {
  const out = [];
  for (const group of GROUPS) {
    out.push({ kind: 'group', id: group.id, group, nodes: groupNodes(group) });
    const nodes = interludeNodes(group.id);
    if (nodes.length) out.push({ kind: 'interlude', id: `after:${group.id}`, after: group.id, nodes });
  }
  out.push({ kind: 'quran', id: 'quran', nodes: quranNodes() });
  return out;
}

let nodesCache = null;   // بيانات المنهج ثابتة وقت التشغيل، فتُبنى القائمة مرة واحدة

/** كل عقد الرحلة بالترتيب — عليها يقوم القفل التسلسلي وحساب النجوم. */
export function allNodes() {
  if (!nodesCache) nodesCache = journey().flatMap((section) => section.nodes);
  return nodesCache;
}

export function findNode(id) {
  return allNodes().find((n) => n.id === id) || null;
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
  return allNodes().reduce((sum, n) => sum + getStars(n.id), 0);
}

export function maxTotalStars() {
  return allNodes().length * MAX_STARS;
}

// ————— القفل التسلسلي —————
// قاعدة واحدة تحكم الرحلة كلها: العقدة تُفتح بإتمام كل ما قبلها في `allNodes()`.
// فينتظم في حبل واحد: حروف المجموعة، ثم لعبة كلماتها، ثم مهارات ما بعدها وقصصه.

/** العقدة مفتوحة = كل ما سبقها في الرحلة مُنجَز. */
export function isNodeUnlockedById(id) {
  const nodes = allNodes();
  const index = nodes.findIndex((n) => n.id === id);
  if (index < 0) return false;
  return nodes.slice(0, index).every((n) => isDone(n.id));
}

/** المجموعة مكتملة = كل حروفها ولعبة كلماتها أُنجزت. */
export function isGroupComplete(group) {
  return groupNodes(group).every((n) => isDone(n.id));
}

/** تُفتح المجموعة الأولى دائماً، وما بعدها بإتمام سابقتها وما تلاها من مهارات وقصص. */
export function isGroupUnlocked(groupId) {
  const group = findGroup(groupId);
  return group ? isNodeUnlockedById(groupNodes(group)[0].id) : false;
}

/** عقدة داخل مجموعة (حرف أو لعبة كلمات) بمعرّفها المركّب. */
export function isNodeUnlocked(groupId, part) {
  return isNodeUnlockedById(nodeId(groupId, part));
}

/** أول عقدة لم تُنجَز في الرحلة — «تابع من هنا». */
export function nextNode() {
  return allNodes().find((n) => !isDone(n.id)) || null;   // null = اكتملت الرحلة
}

// ————— حصيلة الطفل (ما يجوز أن يظهر له في المراجعة) —————

/** الحروف التي أتمّ دروسها فعلاً، بترتيب المنهج — مرجع المفكوكية في المراجعة. */
export function studiedLetters() {
  const out = [];
  for (const group of GROUPS) {
    for (const letter of group.letters) {
      if (isDone(nodeId(group.id, letter))) out.push(letter);
    }
  }
  return out;
}

/** كلمات المنهج المفكوكة بحصيلته: كل حروفها مدروسة (لا يشترط إتمام لعبة مجموعتها). */
export function studiedWords(letters = studiedLetters()) {
  const known = new Set(letters);
  const out = [];
  for (const group of GROUPS) {
    for (const word of group.words) {
      if ([...bareLetters(word.tiles.join(''))].every((c) => known.has(c))) out.push(word);
    }
  }
  return out;
}

// ————— سجلّ المهارات والتكرار المتباعد —————

/** رقم اليوم المحلي (لا UTC): وحدة الجدولة في التكرار المتباعد. */
export function dayNumber(date = new Date()) {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);
}

/** مفتاح اليوم «YYYY-MM-DD» بالتقويم المحلي (لسجلّ الدقائق والمراجعات). */
export function dayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** مفتاح المهارة: حرف × حركة × نوع تمرين. */
export function skillKey(letter, haraka, kind) {
  return `${letter}|${haraka || 'none'}|${kind}`;
}

export function parseSkillKey(key) {
  const [letter, haraka, kind] = String(key).split('|');
  return { letter, haraka, kind };
}

export function getSkill(key) {
  return state.skills[key] || null;
}

/** كل المهارات المسجّلة: [{key, letter, haraka, kind, right, wrong, box, due, seen}] */
export function skills() {
  return Object.entries(state.skills).map(([key, s]) => ({ key, ...parseSkillKey(key), ...s }));
}

/**
 * تسجيل محاولة واحدة. الصحيحة ترفع صندوق ليتنر فيتباعد موعدها،
 * والخاطئة تعيده إلى الصفر فتعود المهارة في مراجعة اليوم نفسه (METHOD §٦).
 * @returns {object|null} حالة المهارة بعد التسجيل
 */
export function recordAttempt(letter, haraka, kind, correct, today = dayNumber()) {
  if (!letter || !kind) return null;
  const key = skillKey(letter, haraka, kind);
  const s = state.skills[key] || { right: 0, wrong: 0, box: 0, due: today, seen: today };
  if (correct) {
    s.right++;
    s.box = Math.min(MAX_BOX, s.box + 1);
  } else {
    s.wrong++;
    s.box = 0;
  }
  s.due = today + BOX_DAYS[s.box];
  s.seen = today;
  state.skills[key] = s;
  save();
  return s;
}

/**
 * المستحقّ للمراجعة اليوم، الأضعف أولاً: أدنى صندوق، ثم أكثر أخطاءً، ثم أقدم استحقاقاً.
 * (المهارة التي لم تُلمس بعدُ ليست هنا — المراجعة تراجع ما مرّ به الطفل فعلاً.)
 */
export function dueSkills(today = dayNumber()) {
  return skills()
    .filter((s) => s.due <= today)
    .sort((a, b) => a.box - b.box || b.wrong - a.wrong || a.due - b.due || a.key.localeCompare(b.key));
}

/**
 * حصيلة كل حرف من سجلّه: متقن (كل تمارينه بلغت صندوق الإتقان)،
 * أو متعثّر (خطآن فأكثر وما زال في الصناديق الدنيا)، أو قيد التعلّم.
 */
export function letterStats() {
  const byLetter = new Map();
  for (const s of skills()) {
    const acc = byLetter.get(s.letter)
      || { letter: s.letter, right: 0, wrong: 0, minBox: MAX_BOX, kinds: 0, seen: 0 };
    acc.right += s.right;
    acc.wrong += s.wrong;
    acc.minBox = Math.min(acc.minBox, s.box);
    acc.kinds++;
    acc.seen = Math.max(acc.seen, s.seen);
    byLetter.set(s.letter, acc);
  }
  const order = GROUPS.flatMap((g) => g.letters);
  return [...byLetter.values()]
    .map((a) => ({
      ...a,
      attempts: a.right + a.wrong,
      mastered: a.minBox >= MASTERED_BOX,
      struggling: a.wrong >= 2 && a.minBox <= 1,
    }))
    .sort((a, b) => order.indexOf(a.letter) - order.indexOf(b.letter));
}

// ————— دقائق الاستخدام —————

/** إضافة زمن استعمال فعلي (يُستدعى بنبضة من main.js وقت انتباه الطفل فقط). */
export function addSeconds(sec, key = dayKey()) {
  const n = Math.max(0, Math.round(sec));
  if (!n) return;
  state.seconds += n;
  state.days[key] = (state.days[key] || 0) + n;
  save();
}

export function secondsOn(key = dayKey()) {
  return state.days[key] || 0;
}

export function totalSeconds() {
  return state.seconds;
}

/** آخر N يوماً منتهيةً باليوم: [{key, seconds}] — للوحة وليّ الأمر. */
export function usageDays(count = 7, today = new Date()) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out.push({ key: dayKey(d), seconds: secondsOn(dayKey(d)) });
  }
  return out;
}

// ————— جلسة المراجعة اليومية —————

export function reviewOf(key = dayKey()) {
  return state.reviews[key] || null;
}

/**
 * تسجيل مراجعة أُتمّت اليوم. الوحدة **محاولة** لا تمرين — تمرين التركيب فيه
 * محاولة لكل مقطع، فخلطهما يكذب على وليّ الأمر في نسبة الإصابة.
 */
export function markReview(tries, right, key = dayKey()) {
  const before = state.reviews[key];
  state.reviews[key] = {
    tries: (before?.tries || 0) + tries,
    right: (before?.right || 0) + right,
    at: Date.now(),
  };
  save();
  return state.reviews[key];
}

/** أيام المراجعة المتتالية المنتهية باليوم أو بالأمس (لا تنكسر السلسلة قبل نوم الطفل). */
export function reviewStreak(today = new Date()) {
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    if (state.reviews[dayKey(d)]) streak++;
    else if (i > 0 || streak) break;
  }
  return streak;
}

// ————— إدارة —————

export function snapshot() {
  return JSON.parse(JSON.stringify(state));
}

export function reset() {
  state = blank();
  save();
}
