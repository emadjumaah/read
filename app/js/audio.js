// الصوت: ملفات mp3 مولَّدة مسبقاً في app/audio/ (انظر tools/generate_audio.py).
// اسم كل ملف = sha1 لنصّه العربي (أول ١٢ خانة) — نفس الاشتقاق هنا وفي بايثون،
// فاستبدال أي ملف بتسجيل بشري لاحقاً لا يمسّ الشيفرة.
// عند غياب الملف: احتياط بـ Web Speech API حتى لا يصمت الدرس أبداً.

const AUDIO_URL = new URL('../audio/', import.meta.url);
const MANIFEST_URL = new URL('manifest.json', AUDIO_URL);

let manifestKeys = null;   // Set لمفاتيح الملفات الموجودة (null = لم يُقرأ الفهرس بعد)
let manifestLoad = null;
let current = null;        // آخر عنصر صوت شُغِّل (لإيقافه قبل التالي)
const cache = new Map();   // نص → مفتاح (تفادي إعادة حساب sha1)

// ————— sha1 خالص (بلا اعتماد على crypto.subtle كي يعمل من file:// أيضاً) —————
function sha1Hex(bytes) {
  const total = ((((bytes.length + 8) >> 6) + 1) << 6);
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const dv = new DataView(buf.buffer);
  const bits = bytes.length * 8;
  dv.setUint32(total - 8, Math.floor(bits / 4294967296), false);
  dv.setUint32(total - 4, bits >>> 0, false);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let i = 0; i < total; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
    for (let j = 16; j < 80; j++) {
      const n = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = (n << 1) | (n >>> 31);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f, k;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) >>> 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((x) => x.toString(16).padStart(8, '0')).join('');
}

/** مفتاح النص = اسم ملفه الصوتي (بلا امتداد). */
export function keyFor(text) {
  let key = cache.get(text);
  if (!key) {
    key = sha1Hex(new TextEncoder().encode(text)).slice(0, 12);
    cache.set(text, key);
  }
  return key;
}

/** قراءة فهرس الأصوات مرة واحدة — لمعرفة الموجود قبل محاولة تشغيله. */
export function ready() {
  if (!manifestLoad) {
    manifestLoad = fetch(MANIFEST_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((m) => { manifestKeys = new Set(Object.keys(m)); })
      .catch(() => { manifestKeys = null; });   // بلا فهرس: نجرّب الملف ثم نحتاط بالنطق
  }
  return manifestLoad;
}

function urlFor(text) {
  return new URL(`${keyFor(text)}.mp3`, AUDIO_URL).href;
}

/** هل للنص ملف مولَّد؟ (null = الفهرس غير مقروء بعد — نادِ ready() أولاً). */
export function hasFile(text) {
  return manifestKeys ? manifestKeys.has(keyFor(text)) : null;
}

/** إيقاف ما يُشغَّل الآن (ملفاً كان أو نطقاً آلياً). */
export function stop() {
  if (current) {
    current.pause();
    current.currentTime = 0;
    current = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function playFile(text) {
  return new Promise((resolve, reject) => {
    const el = new Audio(urlFor(text));
    el.preload = 'auto';
    current = el;
    el.addEventListener('ended', () => resolve(true), { once: true });
    el.addEventListener('error', () => reject(new Error('audio')), { once: true });
    el.play().catch(reject);
  });
}

/** احتياط: نطق آلي من المتصفح — أبطأ قليلاً كي تتضح الحروف لأذن الطفل. */
function speak(text) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth || !window.SpeechSynthesisUtterance) return resolve(false);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ar-SA';
    u.rate = 0.75;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    synth.cancel();
    synth.speak(u);
  });
}

/**
 * تشغيل نصّ عربي: يبحث عن ملفه المولَّد، فإن غاب نطقه المتصفح.
 * يُوقِف أي صوت سابق كي لا تتداخل الأصوات على الطفل.
 * @returns {Promise<boolean>} صحيح إن سُمع شيء فعلاً.
 */
export async function play(text) {
  if (!text) return false;
  stop();
  await ready();

  if (manifestKeys && !manifestKeys.has(keyFor(text))) {
    console.warn(`[audio] لا ملف لـ «${text}» — احتياط بالنطق الآلي`);
    return speak(text);
  }
  try {
    return await playFile(text);
  } catch {
    return speak(text);
  }
}

/** تشغيل نصوص متتابعة (مقاطع كلمة مثلاً) مع فاصل قصير بينها. */
export async function playSequence(texts, gapMs = 220) {
  for (const t of texts) {
    await play(t);
    if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
  }
}

/** تحميل مسبق لأصوات الشاشة التالية (لا يشغّلها). */
export function preload(texts) {
  for (const t of texts) {
    if (manifestKeys && !manifestKeys.has(keyFor(t))) continue;
    const el = new Audio();
    el.preload = 'auto';
    el.src = urlFor(t);
  }
}
