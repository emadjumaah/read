// شاشة القراءة — القصص المفكوكة (METHOD §٥.٥).
//
// صفحة كتاب لا لعبة: القصة كلها معروضة مشكولةً بالكامل، والطفل يقرأ بعينه؛
// فإن تعثّر في كلمة نقرها فسمعها، وإن أراد الجملة كاملةً فزرّها إلى جانبها.
// لا خطأ في هذه الشاشة ولا مشتّتات — القراءة نفسها هي النشاط.
//
// المفكوكية ١٠٠٪: موضع كل قصة في الخريطة بعد المهارة التي تُوظّفها (شدّة ← تنوين ←
// لام شمسية)، فكل حرف وكل علامة فيها مدروس — يفحص ذلك tools/check_decodable.py.

import { storyById, storyTexts, sentenceText } from './curriculum.js';
import * as progress from './progress.js';
import * as audio from './audio.js';
import {
  h, toast, go, arNum, arCount, starsRow, topbar,
  PAUSE_ACCENT, DEV,
} from './ui.js';

/**
 * نجوم القراءة: ٣ لمن استمع إلى الجمل كلها، ٢ لمن استمع إلى نصفها فأكثر، وإلا ١.
 * لا خطأ يُحتسب هنا (لا سؤال أصلاً)، فالمقياس هو المتابعة لا الإصابة.
 */
export function starsForStory(heard, total) {
  if (total && heard >= total) return 3;
  return heard * 2 >= total ? 2 : 1;
}

export function renderStory(storyId) {
  const story = storyById(storyId);
  if (!story) return null;

  const nodeId = `story:${story.id}`;
  const total = story.sentences.length;
  const heard = new Set();          // فهارس الجمل التي سمعها الطفل (كلمةً كلمةً أو كاملةً)
  let done = false;

  audio.preload(storyTexts(story));

  const body = h('div', { class: 'story-body' });
  const foot = h('div', { class: 'row foot' });

  function paint() {
    audio.stop();
    body.replaceChildren(page());
    paintFoot();
  }

  function paintFoot() {
    foot.replaceChildren(
      h('p', { class: 'hint' },
        `سمعتَ ${arNum(heard.size)} من ${arCount(total, ['جملة', 'جملتين', 'جمل', 'جملة'])}`),
      h('button', { class: 'btn btn--primary btn--wide next', onclick: finish }, 'أتممتُ القراءة ←'),
    );
  }

  // ————— صفحة القصة —————

  function page() {
    const sheet = h('div', { class: 'sheet' },
      h('button', {
        class: 'story-title',
        'aria-label': `اسمع عنوان القصة: ${story.title}`,
        onclick: () => audio.play(story.title),
      },
        h('span', { class: 'word-emoji' }, story.emoji),
        h('span', { class: 'story-title-text' }, story.title),
      ),
    );

    story.sentences.forEach((sentence, index) => {
      const text = sentenceText(sentence);
      const said = new Set();

      const words = sentence.words.map((word, i) => {
        const btn = h('button', {
          class: 'story-word',
          'aria-label': `اسمع كلمة ${word}`,
          onclick: () => {
            btn.classList.add('story-word--said');
            said.add(i);
            if (said.size === sentence.words.length) markHeard(index);
            audio.play(word);
          },
        }, word);
        return btn;
      });

      sheet.append(h('div', { class: 'line' },
        h('span', { class: 'line-emoji', 'aria-hidden': 'true' }, sentence.emoji),
        h('p', { class: 'line-words' }, words),
        h('button', {
          class: 'btn line-ear',
          'aria-label': `اسمع الجملة كاملة: ${text}`,
          onclick: () => {
            markHeard(index);
            audio.play(text);
          },
        }, '🔊'),
      ));
    });

    return sheet;
  }

  function markHeard(index) {
    if (heard.has(index) || done) return;
    heard.add(index);
    paintFoot();
  }

  // ————— الختام —————

  function finish() {
    audio.stop();
    done = true;
    const stars = starsForStory(heard.size, total);
    const before = progress.getStars(nodeId);
    progress.setStars(nodeId, stars);

    body.replaceChildren(h('div', { class: 'celebrate' },
      h('div', { class: 'celebrate-face' }, story.emoji),
      h('h2', {}, 'قرأتَ قصة كاملة!'),
      starsRow(stars, 'big-stars'),
      h('p', { class: 'hint' }, stars === 3
        ? 'سمعتَ الجمل كلها وقرأتها — أحسنت! 🎉'
        : 'أعِد القراءة واسمع كل جملة لتزيد نجومك.'),
      before > stars && h('p', { class: 'hint' }, `نجومك السابقة محفوظة: ${arNum(before)} ★`),
      h('div', { class: 'row foot' },
        h('button', { class: 'btn btn--primary', onclick: () => go('#/') }, '→ الخريطة'),
        h('button', {
          class: 'btn',
          onclick: () => {
            done = false;
            heard.clear();
            paint();
          },
        }, '↻ أعِد القراءة'),
      ),
    ));
    foot.replaceChildren();
  }

  paint();

  return h('div', { class: 'screen story', css: { '--accent': PAUSE_ACCENT } },
    topbar(
      // الخروج من القراءة لا يُستأذَن فيه (بخلاف الدرس واللعبة): لا شيء يضيع،
      // والقصة تبقى مفتوحة يعود إليها متى شاء.
      h('button', { class: 'btn', onclick: () => go('#/') }, '→ الخريطة'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'pill' }, 'قصة'),
    ),
    h('main', { class: 'screen-card' },
      h('p', { class: 'hint' }, 'اقرأ بعينك، وانقر أي كلمة لتسمعها'),
      body,
      foot,
      DEV && h('div', { class: 'dev' },
        h('div', { class: 'dev-title' }, 'أدوات التجربة (?dev=1)'),
        h('div', { class: 'dev-row' },
          h('span', {}, `الجمل: ${arNum(total)}`),
          h('button', { class: 'btn', onclick: () => toast(`سُمعت: ${arNum(heard.size)}`) }, 'عدّ المسموع'),
          h('button', { class: 'btn', onclick: finish }, 'إنهاء القراءة الآن'),
        )),
    ),
  );
}
