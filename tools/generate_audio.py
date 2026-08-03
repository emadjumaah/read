#!/usr/bin/env python3
"""توليد ملفات الصوت للتطبيق — محرّكان: Gemini TTS (الافتراضي) و edge-tts (احتياط).

الاستعمال:
    python3 tools/generate_audio.py                    # الناقص فقط بمحرّك gemini
    python3 tools/generate_audio.py --force            # إعادة توليد الكل
    python3 tools/generate_audio.py --engine edge      # المحرّك القديم (مايكروسوفت)
    python3 tools/generate_audio.py --audition         # صفحة مفاضلة أصوات في scratch/audition/
    python3 tools/generate_audio.py --archive-current  # نسخ أصوات app/audio الحالية إلى archive/

يستخرج النصوص من app/js/curriculum.js (أسماء الحروف، الحرف مع كل حركة، مقاطع
التهجّي، الكلمات كاملة) وينتج app/audio/<key>.mp3 والفهرس app/audio/manifest.json.

أسماء الملفات مفاتيح ثابتة (sha1 للنص العربي، أول ١٢ خانة) — استبدال أي ملف
بتسجيل بشري لاحقاً لا يتطلب أي تغيير في الشيفرة.

المفتاح: GEMINI_API_KEY من البيئة أو من ملف .env (غير مُتَتبَّع في git) — لا يُطبع أبداً.
"""

import argparse
import asyncio
import base64
import collections
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURRICULUM = ROOT / "app" / "js" / "curriculum.js"
OUT_DIR = ROOT / "app" / "audio"
ENV_FILE = ROOT / ".env"
QUEUE_FILE = ROOT / "tools" / "audio_queue.json"
RECITATIONS_FILE = ROOT / "tools" / "recitations.json"   # يكتبه tools/fetch_recitation.py
TODAY = datetime.date.today().isoformat()

HARAKAT = {"fatha": "َ", "kasra": "ِ", "damma": "ُ"}

GEMINI_HOST = "https://generativelanguage.googleapis.com"
DEFAULT_MODEL = "gemini-3.1-flash-tts-preview"
DEFAULT_VOICE = "Sulafat"          # اختيار المالك بالأذن (٢ أغسطس ٢٠٢٦) بعد صفحة المفاضلة

# ————— سياسة النماذج الثلاثة (docs/AUDIO_QUEUE.md — قرار المالك ٤ أغسطس ٢٠٢٦) —————
# ثلاث حصص مستقلة بنفس الصوت Sulafat، والتقسيم **بالمحتوى** كي لا يقع اختلاف مسحة
# صوتية داخل التمرين الواحد. نفاد حصة نموذج لا يوقف النموذجين الآخرين.
MODEL_CORE = "gemini-3.1-flash-tts-preview"      # نواة المرحلة أ + العاجل (١٠٠/يوم)
MODEL_LEXICON = "gemini-2.5-flash-preview-tts"   # كلمات المعجم ومقاطعها (١٠٠/يوم)
MODEL_SENTENCE = "gemini-2.5-pro-preview-tts"    # الجمل الطويلة وحدها (٥٠/يوم)
LEXICON_SOURCES = {"session-7"}                  # الجلسات التي مادتها معجم «حديقة الكلمات»
URGENT_PRIORITY = 10                             # إصلاح عيب مسموع: يذهب للنموذج الأمتن
EMPTY_STREAK_LIMIT = 3                           # استجابات متتابعة بلا صوت ← تنحية النموذج
# «2.5 جيد للكلمات، ولا يعطي مقاطع» (حكم المالك السمعي ٤ أغسطس ٢٠٢٦):
# كل نصّ قصير على نموذج النواة أياً كان مصدره، والكلمة الكاملة وحدها تذهب لـ2.5-flash.
SHORT_CATEGORIES = ("syllable", "letter_haraka", "letter_name")
APPROVAL_FILE = ROOT / "tools" / "model_approval.json"

# تعليمة الأداء تُكتب قبل النص فتوجّه الأداء ولا تُنطق (سلوك مثبَّت في Gemini TTS).
STYLE = {
    "letter_name": "انطق بتأنٍّ شديد ووضوح تام، بمخرج صحيح، كمعلم قرآن يعلّم طفلاً في السادسة: ",
    "letter_haraka": "انطق بتأنٍّ شديد ووضوح تام، بمخرج صحيح، كمعلم قرآن يعلّم طفلاً في السادسة: ",
    "syllable": "انطق هذا المقطع بتأنٍّ ووضوح لطفل يتعلم التهجئة: ",
    "word": "انطق الكلمة بوضوح وودّ لطفل: ",
    # فئتان تخصّان قائمة الانتظار (docs/AUDIO_QUEUE.md)
    "sentence": "اقرأ هذه الجملة بتأنٍّ ووضوح وودّ، كمعلم يقرأ لطفل في السادسة: ",
    "story_word": "انطق الكلمة بوضوح وودّ لطفل يتابع قصة: ",
}
CATEGORY_AR = {
    "letter_name": "اسم حرف",
    "letter_haraka": "حرف بحركة",
    "syllable": "مقطع",
    "word": "كلمة",
    "sentence": "جملة",
    "story_word": "كلمة قصة",
}
# الأدقّ أولاً: نصّ ورد في موضعين يأخذ فئته الأضيق.
CATEGORY_ORDER = ["letter_name", "letter_haraka", "syllable", "word"]


# ————————————————————————— المنهج —————————————————————————

def key_for(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def parse_curriculum(src: str) -> dict:
    """نصوص المنهج ← فئتها، دون تشغيل جافاسكربت. (dict مرتّب أبجدياً)"""
    found = {c: set() for c in CATEGORY_ORDER}

    # الحروف وأسماؤها:  'ب': { name: 'باء', ...
    for m in re.finditer(r"'(.)':\s*\{\s*name:\s*'([^']+)'", src):
        letter, name = m.group(1), m.group(2)
        found["letter_name"].add(name)
        for mark in HARAKAT.values():
            found["letter_haraka"].add(letter + mark)

    # مقاطع التهجّي ثم الكلمات كاملة
    for m in re.finditer(r"tiles:\s*\[([^\]]+)\]", src):
        for t in re.findall(r"'([^']+)'", m.group(1)):
            found["syllable"].add(t)
    for m in re.finditer(r"say:\s*'([^']+)'", src):
        found["word"].add(m.group(1))

    texts = {}
    for cat in CATEGORY_ORDER:
        for t in found[cat]:
            texts.setdefault(t, cat)
    return {t: texts[t] for t in sorted(texts)}


# ————————————————————————— المفتاح والبيئة —————————————————————————

def read_env_key(name: str = "GEMINI_API_KEY") -> str | None:
    """المفتاح من البيئة أو .env بمحلّل بسيط (لا حزم جديدة، ولا طباعة للقيمة)."""
    val = os.environ.get(name)
    if val:
        return val.strip()
    if not ENV_FILE.exists():
        return None
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == name:
            return v.strip().strip("'\"") or None
    return None


# ————————————————————————— PCM ← Gemini —————————————————————————

class TTSError(RuntimeError):
    pass


class QuotaExhausted(TTSError):
    """الحصة اليومية (RPD) للنموذج نفدت — لا تُعاد المحاولة، يُنتظر التجدد."""

    def __init__(self, seconds: int, detail: str = ""):
        super().__init__(f"الحصة اليومية نفدت — التجدد بعد {seconds} ثانية. {detail}".strip())
        self.seconds = seconds


_MIN_INTERVAL = 0.0        # ثوانٍ بين طلبين لنفس النموذج (يضبطها --rpm)
_LAST_REQUEST = {}         # نموذج ← وقت آخر طلب له (حدّ الدقيقة لكل نموذج على حدة)


def set_rpm(rpm: float) -> None:
    """سقف الطلبات في الدقيقة **لكل نموذج** — دون حدّه كي لا تُحرق محاولات على 429."""
    global _MIN_INTERVAL
    _MIN_INTERVAL = 60.0 / rpm if rpm > 0 else 0.0


def _pace(model: str = "") -> None:
    if _MIN_INTERVAL:
        wait = _LAST_REQUEST.get(model, 0.0) + _MIN_INTERVAL - time.monotonic()
        if wait > 0:
            time.sleep(wait)
    _LAST_REQUEST[model] = time.monotonic()


def parse_429(body: str) -> tuple[bool, int]:
    """يفكّ جسم خطأ 429: (أهي حصة يومية؟، ثوانٍ حتى التجدد)."""
    per_day, seconds = False, 0
    try:
        err = json.loads(body).get("error", {})
    except json.JSONDecodeError:
        return "per_day" in body or "PerDay" in body, 0
    for det in err.get("details", []):
        for v in det.get("violations", []):
            qid = f'{v.get("quotaId", "")} {v.get("quotaMetric", "")}'
            if "PerDay" in qid or "per_day" in qid:
                per_day = True
        if det.get("@type", "").endswith("RetryInfo"):
            m = re.match(r"(\d+)", str(det.get("retryDelay", "")))
            if m:
                seconds = int(m.group(1))
    if not per_day:
        msg = err.get("message", "")
        per_day = "per_day" in msg or "per day" in msg
    return per_day, seconds


class EmptyAudio(TTSError):
    """استجابة ٢٠٠ بلا صوت (finishReason: OTHER) — عيب النموذج في نصّ بعينه."""


def gemini_pcm(text: str, style: str, model: str, voice: str, api_key: str,
               retries: int = 5, empty_retries: int = 2) -> tuple[bytes, int]:
    """يعيد (PCM خام 16-bit little-endian، معدّل العيّنات). يعيد المحاولة عند 429/5xx.

    `style` تعليمة الأداء التي تسبق النص (لا تُنطق) — انظر STYLE.
    """
    body = json.dumps({
        "contents": [{"parts": [{"text": style + text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}
            },
        },
    }, ensure_ascii=False).encode("utf-8")

    url = f"{GEMINI_HOST}/v1beta/models/{model}:generateContent"
    delay = 2.0
    last = None
    empty = 0
    for attempt in range(retries):
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        })
        try:
            _pace(model)
            with urllib.request.urlopen(req, timeout=180) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            return extract_audio(payload)
        except urllib.error.HTTPError as e:
            code = e.code
            body = e.read().decode("utf-8", "replace")
            detail = body[:300]
            # لا نطبع الرابط (يخلو من المفتاح أصلاً) ولا الترويسات.
            last = TTSError(f"HTTP {code}: {detail}")
            if code == 429:
                per_day, seconds = parse_429(body)
                if per_day:                     # لا فائدة من إعادة المحاولة قبل التجدد
                    raise QuotaExhausted(seconds or 3600)
                if seconds:                     # حدّ الدقيقة: انتظر ما يطلبه الخادم
                    delay = max(delay, min(seconds + 1, 120))
            if code not in (408, 429, 500, 502, 503, 504):
                raise last
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = TTSError(f"{type(e).__name__}: {e}")
        except EmptyAudio as e:
            # استجابة ٢٠٠ بلا صوت: غير حتمية فتُعاد المحاولة — لكن **مرّتين فقط**،
            # لأن كل محاولة طلبٌ يُخصم من حصة اليوم (تُحرق ٥ محاولات على نصّ عصيّ
            # فتضيع عشرات الطلبات كما وقع في تصريف ٣ أغسطس).
            last = e
            empty += 1
            if empty >= empty_retries:
                raise
        except TTSError as e:
            last = e
        if attempt < retries - 1:
            time.sleep(delay)
            delay = min(delay * 2, 60)
    raise last or TTSError("فشل غير معروف")


def extract_audio(payload: dict) -> tuple[bytes, int]:
    """يجمع كل أجزاء inlineData الصوتية ويستخرج معدّل العيّنات من mimeType."""
    chunks, rate = [], 24000
    for cand in payload.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if not inline:
                continue
            mime = inline.get("mimeType") or inline.get("mime_type") or ""
            if not mime.startswith("audio/"):
                continue
            m = re.search(r"rate=(\d+)", mime)
            if m:
                rate = int(m.group(1))
            chunks.append(base64.b64decode(inline["data"]))
    if not chunks:
        reason = payload.get("promptFeedback") or payload.get("candidates") or payload
        raise EmptyAudio(f"لا صوت في الاستجابة: {json.dumps(reason, ensure_ascii=False)[:200]}")
    return b"".join(chunks), rate


# ————————————————————————— PCM → MP3 —————————————————————————

_HAVE_FFMPEG = shutil.which("ffmpeg")
_ENCODER = None


def pcm_to_mp3(pcm: bytes, rate: int, path: Path) -> None:
    """تحويل PCM (l16 mono) إلى mp3 — ffmpeg إن وُجد، وإلا lameenc داخل بايثون."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if _HAVE_FFMPEG:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(rate),
             "-ac", "1", "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "64k", str(path)],
            input=pcm, check=True,
        )
        return

    global _ENCODER
    if _ENCODER is None:
        try:
            import lameenc  # noqa: PLC0415
        except ImportError:
            sys.exit("يلزم ffmpeg أو الحزمة lameenc:  .venv/bin/pip install lameenc")
        _ENCODER = lameenc
    enc = _ENCODER.Encoder()
    enc.set_bit_rate(64)
    enc.set_in_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)          # ٠ الأبطأ/الأجود … ٩ الأسرع
    enc.silence()
    path.write_bytes(enc.encode(pcm) + enc.flush())


# ————————————————————————— التوليد —————————————————————————

def is_same_as(path: Path, ref_dir: Path) -> bool:
    """هل الملف ما زال نسخته القديمة في مجلد المرجع؟ (لم يُعَد توليده بعد)"""
    ref = ref_dir / path.name
    return ref.exists() and ref.read_bytes() == path.read_bytes()


def synthesize_gemini(texts: dict, model: str, voice: str, force: bool, api_key: str,
                      replace_same_as: Path | None = None, dry_run: bool = False) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # الفهرس يُبنى كاملاً قبل التوليد كي يبقى صحيحاً حتى لو توقّف التوليد في منتصفه،
    # ويضمّ منجَز قائمة الانتظار كي لا يسقط منه ما صُرِّف سابقاً.
    manifest = manifest_map()
    made = skipped = failed = 0
    total = len(texts)

    for i, (text, cat) in enumerate(texts.items(), 1):
        path = OUT_DIR / f"{key_for(text)}.mp3"
        stale = replace_same_as is not None and path.exists() and is_same_as(path, replace_same_as)
        if path.exists() and not force and not stale:
            skipped += 1
            continue
        if dry_run:
            made += 1
            print(f"  [{i}/{total}] ⟶ {text} ({CATEGORY_AR[cat]}) → {path.name}")
            continue
        try:
            pcm, rate = gemini_pcm(text, STYLE[cat], model, voice, api_key)
            pcm_to_mp3(pcm, rate, path)
            made += 1
            print(f"  [{i}/{total}] ✓ {text} ({CATEGORY_AR[cat]}) → {path.name} "
                  f"{path.stat().st_size // 1024}KB")
        except QuotaExhausted as e:
            print(f"\n  ⏸ {e}  (توقّف عند {i}/{total} بلا إحراق محاولات)", file=sys.stderr)
            print(f"RETRY_AFTER_SECONDS={e.seconds}")
            break
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  [{i}/{total}] ✗ {text}: {e}", file=sys.stderr)

    if dry_run:
        print(f"\nسيولَّد: {made}، ويُترك: {skipped}. (تجربة جافّة — لم يُطلب شيء)")
        return 0
    write_manifest(manifest)
    print(f"\nتم: {made} مولّد، {skipped} موجود مسبقاً، {failed} فشل.")
    return failed


async def synthesize_edge(texts: dict, voice: str, force: bool) -> int:
    import edge_tts

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = manifest_map()
    made = skipped = failed = 0

    for text in texts:
        path = OUT_DIR / f"{key_for(text)}.mp3"
        if path.exists() and not force:
            skipped += 1
            continue
        try:
            # rate أبطأ قليلاً يناسب أذن الطفل المتعلم
            tts = edge_tts.Communicate(text, voice=voice, rate="-20%")
            await tts.save(str(path))
            made += 1
            print(f"  ✓ {text}  →  {path.name}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ✗ {text}: {e}", file=sys.stderr)

    write_manifest(manifest)
    print(f"\nتم: {made} مولّد، {skipped} موجود مسبقاً، {failed} فشل.")
    return failed


def write_manifest(manifest: dict) -> None:
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"الفهرس: {OUT_DIR / 'manifest.json'} ({len(manifest)} نصاً)")


def recitation_texts() -> dict:
    """تلاوات قارئ متقن جلبها tools/fetch_recitation.py — ملفات لا يولّدها المولّد.

    بيانها مستقل عن `manifest.json` عمداً: الفهرس بيان الأصوات المولّدة، ونصّ
    المصحف ممنوع منه (METHOD §٥.٦ و`docs/AUDIO_QUEUE.md`).
    """
    if not RECITATIONS_FILE.exists():
        return {}
    try:
        data = json.loads(RECITATIONS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return {e["text"]: f"{e['surah']:03d}:{e['ayah']:03d}" for e in data if e.get("text")}


def verify(texts: dict, pending: dict | None = None, min_bytes: int = 1500) -> int:
    """تحقّق ختامي: لكل نص متوقَّع ملف، ولا ملف يتيم، ولا ملف أصغر من الحد المعقول.

    `pending` = نصوص قائمة الانتظار التي لم تُصرَّف بعد: غيابها متوقَّع لا خطأ.
    """
    pending = pending or {}
    recitations = recitation_texts()
    problems = []
    keys = {key_for(t) for t in texts}
    on_disk = {p.stem for p in OUT_DIR.glob("*.mp3")}
    for t in texts:
        p = OUT_DIR / f"{key_for(t)}.mp3"
        if not p.exists():
            problems.append(f"ناقص: {t}")
        elif p.stat().st_size < min_bytes:
            problems.append(f"صغير جداً ({p.stat().st_size}B): {t}")
    for t, ref in recitations.items():
        p = OUT_DIR / f"{key_for(t)}.mp3"
        if not p.exists():
            problems.append(f"تلاوة ناقصة ({ref})")
    known = keys | {key_for(t) for t in pending} | {key_for(t) for t in recitations}
    for orphan in sorted(on_disk - known):
        problems.append(f"يتيم (لا نصّ له في المنهج ولا في القائمة): {orphan}.mp3")

    print(f"\nالتحقّق الختامي: {len(texts)} نصاً متوقَّعاً، {len(on_disk)} ملفاً على القرص.")
    if recitations:
        print(f"  🎧 {len(recitations)} تلاوةً بصوت قارئ (خارج الفهرس عمداً — لا تولَّد).")
    if pending:
        print(f"  ⏳ {len(pending)} نصاً في قائمة الانتظار لم يُصرَّف بعد (غيابها متوقَّع).")
    for p in problems:
        print(f"  ✗ {p}", file=sys.stderr)
    if not problems:
        print("  ✓ كل نصّ متوقَّع له ملفه، ولا يتيم، ولا ملف مبتور.")
    return len(problems)


def archive_current(dest: Path) -> None:
    """نسخة احتياطية من أصوات app/audio الحالية خارج app/ قبل الاستبدال."""
    dest.mkdir(parents=True, exist_ok=True)
    n = 0
    for f in sorted(OUT_DIR.glob("*.mp3")) + [OUT_DIR / "manifest.json"]:
        if f.exists():
            shutil.copy2(f, dest / f.name)
            n += 1
    print(f"حُفظت نسخة من {n} ملفاً في {dest.relative_to(ROOT)}/")


# ————————————————————————— قائمة الانتظار (docs/AUDIO_QUEUE.md) —————————————————————————

def load_queue() -> list:
    """قائمة النصوص المطلوبة من جلسات التطوير — تُنشأ فارغة إن لم تكن موجودة."""
    if not QUEUE_FILE.exists():
        return []
    try:
        data = json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"{QUEUE_FILE.name} ليس JSON صالحاً: {e}")
    if not isinstance(data, list):
        sys.exit(f"{QUEUE_FILE.name} يجب أن يكون مصفوفة JSON")
    for i, entry in enumerate(data):
        if not isinstance(entry, dict) or not entry.get("text"):
            sys.exit(f"مدخل {i} في {QUEUE_FILE.name} بلا نصّ")
        cat = entry.get("category", "word")
        if cat not in STYLE:
            sys.exit(f"مدخل {i}: فئة غير معروفة «{cat}» — المتاح: {'، '.join(STYLE)}")
    return data


def save_queue(queue: list) -> None:
    """كتابة ذرّية: ملف مؤقت ثم استبدال — فلا يقرأ أحدٌ ملفاً نصفَ مكتوب."""
    tmp = QUEUE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(queue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, QUEUE_FILE)


def mark_done(text: str, model: str) -> None:
    """تسجيل نصّ مُصرَّفاً **بدمج** لا باستبدال.

    التصريف يستغرق دقائق، وجلسة تطوير قد تُضيف مئات النصوص أثناءه؛ فكتابة اللقطة
    القديمة كاملةً كانت تمحو إضافاتها. لذلك تُعاد قراءة الملف عند كل تسجيل ويُعدَّل
    فيه المدخل المطابق وحده (بنصّه)، ويبقى كل جديد على حاله.
    """
    disk = load_queue()
    changed = False
    for e in disk:
        if e.get("text") == text and e.get("status", "pending") != "done":
            e.update(status="done", doneAt=TODAY, model=model)
            changed = True
    if changed:
        save_queue(disk)


def queue_pending(queue: list) -> list:
    """المصفوفون بالأولوية (الأصغر أسبق) ثم بالأقدمية (ترتيب الإضافة)."""
    pending = [(i, e) for i, e in enumerate(queue) if e.get("status", "pending") != "done"]
    pending.sort(key=lambda p: (p[1].get("priority", 100), p[0]))
    return pending


def queue_texts(queue: list, status: str) -> dict:
    """نصوص القائمة بحالة معيّنة ← فئتها."""
    return {e["text"]: e.get("category", "word")
            for e in queue if e.get("status", "pending") == status}


def manifest_map() -> dict:
    """مفتاح ← نصّ لكل ما يُتوقَّع أن له ملفاً (المنهج + منجَز القائمة)."""
    texts, _ = expected_texts()
    return {key_for(t): t for t in texts}


def expected_texts() -> tuple[dict, dict]:
    """(المتوقع أن له ملف = المنهج + منجَز القائمة، المصفوف انتظاراً)."""
    texts = parse_curriculum(CURRICULUM.read_text(encoding="utf-8"))
    queue = load_queue()
    texts.update(queue_texts(queue, "done"))
    return texts, queue_texts(queue, "pending")


def load_approval() -> dict:
    """حالة إجازة النماذج بالأذن (يقرّها المالك) — نموذج ← معلومات الإجازة."""
    if not APPROVAL_FILE.exists():
        return {}
    try:
        return json.loads(APPROVAL_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def set_approval(model: str, approved: bool, note: str = "") -> None:
    data = load_approval()
    data[model] = {"approved": approved, "decidedAt": TODAY, "note": note}
    APPROVAL_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                             encoding="utf-8")
    print(f"{'أُجيز' if approved else 'رُفض'} {model} (بتاريخ {TODAY}).")


def is_approved(model: str) -> bool:
    return bool(load_approval().get(model, {}).get("approved"))


def route_model(entry: dict, lexicon_ok: bool | None = None) -> str:
    """أي نموذج يولّد هذا المدخل؟ (سياسة النماذج الثلاثة — حكم المالك ٤ أغسطس ٢٠٢٦)

    «2.5 جيد للكلمات، ولا يعطي مقاطع»: فكل قصير (مقطع/حرف بحركة/اسم حرف) على 3.1
    **أياً كان مصدره**، والكلمة الكاملة المفردة على 2.5-flash، والجملة على 2.5-pro.
    والذرّية بصيغتها المعدَّلة: المقاطع موحّدة كلها على نموذج واحد (3.1) فلا تتجاور
    مسحتان داخل صفّ البلاطات نفسه، والكلمة الكاملة تنفرد بنموذجها.
    """
    if entry.get("model"):                       # تعيين صريح من المدير يعلو على القاعدة
        return entry["model"]
    if lexicon_ok is None:
        lexicon_ok = is_approved(MODEL_LEXICON)
    if entry.get("category") in SHORT_CATEGORIES:
        return MODEL_CORE                        # القصير كله على 3.1 — بلا استثناء
    if entry.get("priority", 100) <= URGENT_PRIORITY:
        return MODEL_CORE                        # إصلاح عيب مسموع: الأمتن المجرَّب
    if entry.get("category") == "sentence":
        return MODEL_SENTENCE                    # الجمل الطويلة وحدها
    # كلمة كاملة مفردة: 2.5-flash بعد إجازة المالك، وقبلها تبقى محبوسة
    return MODEL_LEXICON if lexicon_ok else ""


def plan_queue(queue: list, lexicon_ok: bool | None = None) -> list:
    """[(الفهرس، المدخل، النموذج)] بترتيب التصريف — والمحبوس نموذجه ''."""
    if lexicon_ok is None:
        lexicon_ok = is_approved(MODEL_LEXICON)
    return [(i, e, route_model(e, lexicon_ok)) for i, e in queue_pending(queue)]


def style_for(entry: dict) -> str:
    hint = (entry.get("style_hint") or "").strip()
    if hint:
        return hint.rstrip(":：").rstrip() + ": "
    return STYLE[entry.get("category", "word")]


def short_model(model: str) -> str:
    return model.replace("gemini-", "").replace("-preview", "").replace("-tts", "")


def drain_queue(model: str | None, voice: str, api_key: str, dry_run: bool = False,
                only_model: str = "") -> int:
    """تصريف القائمة بالترتيب على حصص اليوم الثلاث (سياسة النماذج الثلاثة).

    `model` غير الفارغ يفرض نموذجاً واحداً على كل المدخلات (تجاوز يدوي).
    `only_model` يقصر التصريف على ما يوجَّه إلى نموذج بعينه.
    نفاد حصة نموذج يوقفه وحده ويمضي التصريف ببقية النماذج.
    """
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    queue = load_queue()
    lexicon_ok = is_approved(MODEL_LEXICON)
    plan = plan_queue(queue, lexicon_ok)
    if model:                                   # تجاوز صريح: نموذج واحد للكل
        plan = [(i, e, model) for i, e, _m in plan]
    if only_model:
        plan = [(i, e, m) for i, e, m in plan if m == only_model]

    if not plan:
        print("قائمة الانتظار فارغة — لا شيء يُصرَّف.")
        return 0

    held = [p for p in plan if not p[2]]
    plan = [p for p in plan if p[2]]
    by_model = collections.Counter(m for _i, _e, m in plan)
    print(f"قائمة الانتظار: {len(queue_pending(queue))} منتظِراً من {len(queue)}.")
    for m, n in by_model.most_common():
        print(f"  · {short_model(m)}: {n} نصاً")
    if held:
        print(f"  · محبوس حتى إجازة المالك ({short_model(MODEL_LEXICON)}): {len(held)} نصاً")

    made = failed = 0
    done_by_model = collections.Counter()
    exhausted = {}                              # نموذج ← ثوانٍ حتى تجدد حصته
    empty_streak = collections.Counter()        # إخفاقات «بلا صوت» متتابعة لكل نموذج
    for n, (_idx, entry, m) in enumerate(plan, 1):
        if m in exhausted:                      # حصته نفدت أو تدهورت — لا طلب آخر عليها
            continue
        text = entry["text"]
        cat = entry.get("category", "word")
        path = OUT_DIR / f"{key_for(text)}.mp3"
        label = (f"[{n}/{len(plan)}] {text} ({CATEGORY_AR[cat]}، أولوية "
                 f"{entry.get('priority', 100)}) · {short_model(m)}")
        if dry_run:
            print(f"  ⟶ {label} → {path.name}")
            made += 1
            continue
        try:
            pcm, rate = gemini_pcm(text, style_for(entry), m, voice, api_key)
            pcm_to_mp3(pcm, rate, path)
            mark_done(text, m)                  # دمجاً لا استبدالاً — وبعد كل نصّ
            made += 1
            done_by_model[m] += 1
            empty_streak[m] = 0
            print(f"  ✓ {label} → {path.name} {path.stat().st_size // 1024}KB")
        except QuotaExhausted as e:
            exhausted[m] = e.seconds
            print(f"\n  ⏸ {short_model(m)}: {e}", file=sys.stderr)
            if len(exhausted) >= len(by_model):
                print("  كل الحصص نفدت — يتوقف التصريف.", file=sys.stderr)
                break
            print(f"  يواصل ببقية النماذج ({len(by_model) - len(exhausted)} باقية).",
                  file=sys.stderr)
        except EmptyAudio as e:
            failed += 1
            empty_streak[m] += 1
            print(f"  ✗ {label}: {e}", file=sys.stderr)
            if empty_streak[m] >= EMPTY_STREAK_LIMIT:
                # نموذج بدأ يردّ بلا صوت متتابعاً: يُنحّى هذه الجولة بدل حرق بقية حصته.
                exhausted[m] = 3600
                print(f"  ⏸ {short_model(m)}: {EMPTY_STREAK_LIMIT} استجابات متتابعة بلا صوت "
                      f"— يُنحّى هذه الجولة صوناً لحصته.", file=sys.stderr)
                if len(exhausted) >= len(by_model):
                    break
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ✗ {label}: {e}", file=sys.stderr)

    if dry_run:
        print(f"\nسيُصرَّف: {made} (تجربة جافّة — لم يُطلب شيء)")
        return 0

    write_manifest(manifest_map())
    if exhausted:
        print(f"RETRY_AFTER_SECONDS={min(exhausted.values())}")
    left = plan_queue(load_queue(), lexicon_ok)
    left_by_model = collections.Counter(short_model(m) or "محبوس" for _i, _e, m in left)
    print(f"\nتم التصريف: {made} مولّد، {failed} فشل، {len(left)} ما زال منتظِراً.")
    if done_by_model:
        print("  المولَّد: " + "، ".join(f"{short_model(m)}: {n}"
                                          for m, n in done_by_model.most_common()))
    if left_by_model:
        print("  المتبقي: " + "، ".join(f"{m}: {n}" for m, n in left_by_model.most_common()))
    return failed


# ————————————————————————— إجازة نموذج (مفاضلة مصغّرة) —————————————————————————

# ٣ نصوص من جنس ما سيولّده المرشَّح فعلاً (كلمة، مقطع، كلمة أطول) — وتُختار من
# النصوص التي لها ملف 3.1 جاهز، فلا تُنفَق حصة النواة على المقارنة.
AUDITION_TRIO = [("بابا", "word"), ("بَا", "syllable"), ("حليب", "word")]


def run_model_audition(out_dir: Path, api_key: str, candidate: str, voice: str,
                       force: bool) -> int:
    """٣ طلبات على المرشَّح، ويُقابَل بملفات النواة الجاهزة + صفحة مقارنة بالأذن."""
    out_dir.mkdir(parents=True, exist_ok=True)
    models = [candidate, MODEL_CORE]
    rows, failed = [], 0
    archive = ROOT / "archive" / "audio-edge"
    for text, cat in AUDITION_TRIO:
        # جانب النواة: الملف الموجود في app/audio إن كان قد بُدِّل فعلاً إلى Sulafat
        core_src = OUT_DIR / f"{key_for(text)}.mp3"
        core_name = f"{short_model(MODEL_CORE)}__{key_for(text)}.mp3"
        if core_src.exists() and not is_same_as(core_src, archive):
            shutil.copy2(core_src, out_dir / core_name)
            rows.append((MODEL_CORE, text, cat, core_name, core_src.stat().st_size))
        else:
            print(f"  ! لا ملف نواة مبدَّل لـ«{text}» — يُعرض عمود المرشَّح وحده",
                  file=sys.stderr)

        # جانب المرشَّح: الطلب الوحيد لكل نصّ
        name = f"{short_model(candidate)}__{key_for(text)}.mp3"
        path = out_dir / name
        if path.exists() and not force:
            rows.append((candidate, text, cat, name, path.stat().st_size))
            continue
        try:
            pcm, rate = gemini_pcm(text, STYLE[cat], candidate, voice, api_key)
            pcm_to_mp3(pcm, rate, path)
            rows.append((candidate, text, cat, name, path.stat().st_size))
            print(f"  ✓ {short_model(candidate)} · {text}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ✗ {short_model(candidate)} · {text}: {e}", file=sys.stderr)

    write_model_audition_page(out_dir, rows, models, candidate, voice)
    print(f"\nالمفاضلة المصغّرة: {len(rows)} ملفاً، {failed} فشل.")
    print(f"افتحها: .venv/bin/python -m http.server 8020 -d {out_dir} → http://127.0.0.1:8020/")
    print(f"وبعد سماع المالك:  .venv/bin/python tools/generate_audio.py "
          f"--approve-model {candidate}   (أو --reject-model)")
    return failed


def write_model_audition_page(out_dir: Path, rows, models, candidate: str, voice: str) -> None:
    by = {(m, t): (n, s) for m, t, _c, n, s in rows}
    body = []
    for text, cat in AUDITION_TRIO:
        cells = []
        for model in models:
            hit = by.get((model, text))
            cells.append(f'<td><button data-src="{hit[0]}">▶ {short_model(model)}</button>'
                         f'<small>{hit[1] // 1024}KB</small></td>' if hit
                         else '<td class="miss">—</td>')
        body.append(f'<tr><th>{text}<small>{CATEGORY_AR[cat]}</small></th>{"".join(cells)}</tr>')
    html = f"""<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>إجازة نموذج — {short_model(candidate)} مقابل {short_model(MODEL_CORE)}</title>
<style>
 body {{ font-family:"Noto Naskh Arabic","Geeza Pro",serif; margin:2rem; background:#faf7f2; color:#241f1a }}
 h1 {{ font-size:1.35rem }}
 p.note {{ background:#fff3d6; padding:.8rem 1rem; border-radius:.6rem; max-width:52rem; line-height:1.9 }}
 table {{ border-collapse:collapse; margin-top:1rem }}
 th, td {{ border:1px solid #ddd2c2; padding:.6rem .9rem; text-align:center; background:#fff }}
 th {{ background:#f0e8db; font-size:1.15rem }}
 th small {{ display:block; font-weight:normal; color:#8a7a66; font-size:.72rem }}
 button {{ font-size:1rem; padding:.4rem .9rem; cursor:pointer; border:1px solid #c9bba6;
           border-radius:.45rem; background:#fdfaf4; font-family:inherit }}
 button.playing {{ background:#2f7d4f; color:#fff }}
 td small {{ display:block; color:#a1937f; font-size:.65rem; font-family:system-ui }}
 code {{ background:#efe7da; padding:.15rem .4rem; border-radius:.3rem; font-size:.85rem }}
</style></head><body>
<h1>إجازة نموذج: {short_model(candidate)} مقابل {short_model(MODEL_CORE)}</h1>
<p class="note">الصوت واحد في الاثنين ({voice}) والنصّ واحد — الفرق في النموذج وحده.
اسمع كل صفّ مرّتين: هل تختلف المسحة الصوتية اختلافاً يُسمَع لو تجاورت الكلمة ومقطعها في اللعبة؟
<br>إن أجزتَه صُرِّفت به كلمات المعجم (٣٤٠ نصاً) على حصته المستقلة، وإلا بقي للجُمل الفائضة فقط.
<br>القرار يُسجَّل بـ<code>--approve-model</code> أو <code>--reject-model</code>.</p>
<table><thead><tr><th>النص</th><th>المرشَّح</th><th>النواة</th></tr></thead>
<tbody>{"".join(body)}</tbody></table>
<script>
let cur = null, btn = null;
document.addEventListener('click', (e) => {{
  const b = e.target.closest('button[data-src]'); if (!b) return;
  if (cur) cur.pause();
  if (btn) btn.classList.remove('playing');
  cur = new Audio(b.dataset.src); btn = b; b.classList.add('playing');
  cur.onended = () => b.classList.remove('playing');
  cur.play();
}});
</script></body></html>"""
    (out_dir / "index.html").write_text(html, encoding="utf-8")


# ————————————————————————— فحص الصمام (تجاور النموذجين) —————————————————————————

LEXICON_FILE = ROOT / "app" / "data" / "lexicon.json"


def seam_bundles() -> list:
    """كلمات المعجم مع مقاطعها من مصدر الحقيقة (لا تُكتب هنا)."""
    if not LEXICON_FILE.exists():
        return []
    data = json.loads(LEXICON_FILE.read_text(encoding="utf-8"))
    words = data.get("words") or [w for t in data.get("themes", []) for w in t.get("words", [])]
    return [w for w in words if w.get("word") and w.get("tiles")]


def run_seam_audition(out_dir: Path, size: int = 5) -> int:
    """صمام أمان السياسة: باقة كاملة تُسمع كما تُسمع في اللعبة — مقاطع 3.1 ثم كلمة 2.5.

    لا يطلب شيئاً من الشبكة: ينسخ الملفات المولّدة فعلاً ويبني صفحة تشغيل متتابع،
    فإن نشز الفرق بين المسحتين أُوقف المعجم على 2.5 فوراً.
    """
    queue = load_queue()
    model_of = {e["text"]: e.get("model") for e in queue if e.get("status") == "done"}
    ready = []
    for w in seam_bundles():
        parts = [w["word"], *w["tiles"]]
        if all((OUT_DIR / f"{key_for(t)}.mp3").exists() for t in parts):
            ready.append(w)
        if len(ready) >= size:
            break
    if not ready:
        print("لا باقة مكتملة الأصوات بعد — يُعاد الفحص بعد أول يوم تصريف.", file=sys.stderr)
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for w in ready:
        parts = []
        for text in [*w["tiles"], w["word"]]:
            name = f"{key_for(text)}.mp3"
            shutil.copy2(OUT_DIR / name, out_dir / name)
            parts.append({"text": text, "file": name,
                          "model": short_model(model_of.get(text) or MODEL_CORE),
                          "kind": "word" if text == w["word"] else "tile"})
        rows.append({"word": w["word"], "emoji": w.get("emoji", ""), "parts": parts})

    write_seam_page(out_dir, rows)
    print(f"فحص الصمام: {len(rows)} باقة → {out_dir}/index.html")
    print(f"افتحه: .venv/bin/python -m http.server 8030 -d {out_dir} → http://127.0.0.1:8030/")
    return 0


def write_seam_page(out_dir: Path, rows) -> None:
    cards = []
    for r in rows:
        chips = "".join(
            f'<button class="chip {p["kind"]}" data-src="{p["file"]}">{p["text"]}'
            f'<small>{p["model"]}</small></button>' for p in r["parts"])
        seq = json.dumps([p["file"] for p in r["parts"]], ensure_ascii=False)
        cards.append(
            f'<div class="card"><div class="head"><span class="emoji">{r["emoji"]}</span>'
            f'<span class="w">{r["word"]}</span>'
            f'<button class="play" data-seq=\'{seq}\'>▶ اسمعها كما في اللعبة</button></div>'
            f'<div class="chips">{chips}</div></div>')
    html = f"""<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>فحص الصمام — تجاور مقاطع 3.1 مع كلمة 2.5</title>
<style>
 body {{ font-family:"Noto Naskh Arabic","Geeza Pro",serif; margin:2rem; background:#faf7f2; color:#241f1a }}
 h1 {{ font-size:1.35rem }}
 p.note {{ background:#fff3d6; padding:.8rem 1rem; border-radius:.6rem; max-width:54rem; line-height:1.9 }}
 .card {{ background:#fff; border:1px solid #ddd2c2; border-radius:.8rem; padding:1rem 1.2rem;
          margin:1rem 0; max-width:54rem }}
 .head {{ display:flex; align-items:center; gap:1rem; margin-bottom:.7rem }}
 .emoji {{ font-size:1.8rem }}
 .w {{ font-size:1.6rem; flex:1 }}
 .chips {{ display:flex; gap:.5rem; flex-wrap:wrap; direction:rtl }}
 button {{ font-family:inherit; cursor:pointer; border:1px solid #c9bba6; border-radius:.5rem;
           background:#fdfaf4; padding:.5rem .9rem; font-size:1.15rem }}
 .chip.word {{ background:#e8f1ea; border-color:#8fb79d }}
 .chip small, .play small {{ display:block; font-size:.62rem; color:#8a7a66; font-family:system-ui }}
 .play {{ font-size:.95rem }}
 button.playing {{ background:#2f7d4f; color:#fff }}
</style></head><body>
<h1>فحص الصمام: هل تنشز المسحتان متجاورتين؟</h1>
<p class="note">كل باقة تُسمع كما يسمعها الطفل في لعبة التركيب: <strong>المقاطع أولاً (3.1) ثم الكلمة كاملة (2.5-flash)</strong>.
المطلوب حكمٌ واحد: هل يُحسّ الانتقال من المقاطع إلى الكلمة كأنه صوتان مختلفان؟
<br>إن نشز — يُوقف المعجم على 2.5-flash فوراً ويُعاد إلى 3.1 على مهل الحصص.</p>
{"".join(cards)}
<script>
let cur = null, btn = null;
function one(src) {{
  return new Promise((r) => {{ cur = new Audio(src); cur.onended = r; cur.onerror = r; cur.play(); }});
}}
document.addEventListener('click', async (e) => {{
  const b = e.target.closest('button'); if (!b) return;
  if (cur) cur.pause();
  if (btn) btn.classList.remove('playing');
  btn = b; b.classList.add('playing');
  if (b.dataset.seq) {{
    for (const f of JSON.parse(b.dataset.seq)) {{ await one(f); await new Promise(r => setTimeout(r, 200)); }}
  }} else {{ await one(b.dataset.src); }}
  b.classList.remove('playing');
}});
</script></body></html>"""
    (out_dir / "index.html").write_text(html, encoding="utf-8")


# ————————————————————————— المفاضلة —————————————————————————

AUDITION_TEXTS = [
    ("باء", "letter_name"),
    ("عَين", "letter_name"),
    ("بَ", "letter_haraka"),
    ("سِ", "letter_haraka"),
    ("بَا", "syllable"),
    ("سلام", "word"),
]
AUDITION_MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-pro-preview-tts"]
AUDITION_VOICES = ["Kore", "Leda", "Aoede", "Charon", "Sulafat", "Iapetus"]


def run_audition(out_dir: Path, api_key: str, models, voices, force: bool,
                 page_only: bool = False) -> int:
    """يولّد نفس النصوص بكل (نموذج × صوت) وصفحة HTML للمفاضلة بالأذن."""
    out_dir.mkdir(parents=True, exist_ok=True)
    rows, failed = [], 0
    total = len(models) * len(voices) * len(AUDITION_TEXTS)
    i = 0
    for model in models:
        short = model.replace("-preview", "").replace("gemini-", "")
        for voice in voices:
            for text, cat in AUDITION_TEXTS:
                i += 1
                name = f"{short}__{voice}__{key_for(text)}.mp3"
                path = out_dir / name
                if path.exists() and not force:
                    rows.append((model, voice, text, cat, name, path.stat().st_size))
                    continue
                if page_only:                       # إعادة بناء الصفحة مما على القرص فقط
                    continue
                try:
                    pcm, rate = gemini_pcm(text, STYLE[cat], model, voice, api_key)
                    pcm_to_mp3(pcm, rate, path)
                    rows.append((model, voice, text, cat, name, path.stat().st_size))
                    print(f"  [{i}/{total}] ✓ {model} · {voice} · {text}")
                except Exception as e:  # noqa: BLE001
                    failed += 1
                    print(f"  [{i}/{total}] ✗ {model} · {voice} · {text}: {e}", file=sys.stderr)
    write_audition_page(out_dir, rows, models, voices)
    print(f"\nالمفاضلة: {len(rows)} ملفاً، {failed} فشل.")
    print(f"افتحها: python3 -m http.server 8010 -d {out_dir} → http://127.0.0.1:8010/")
    return failed


def write_audition_page(out_dir: Path, rows, models, voices) -> None:
    by = {(m, v, t): (n, s) for m, v, t, _c, n, s in rows}
    head = "".join(f"<th>{t}<small>{CATEGORY_AR[c]}</small></th>" for t, c in AUDITION_TEXTS)
    body = []
    for model in models:
        for voice in voices:
            cells = []
            for text, _cat in AUDITION_TEXTS:
                hit = by.get((model, voice, text))
                cells.append(
                    f'<td><button data-src="{hit[0]}">▶</button>'
                    f'<small>{hit[1] // 1024}KB</small></td>' if hit
                    else '<td class="miss">—</td>'
                )
            body.append(
                f'<tr data-voice="{voice}"><th class="v">{voice}</th>'
                f'<td class="m">{model.replace("gemini-", "").replace("-preview", "")}</td>'
                f'{"".join(cells)}'
                f'<td><button class="all" data-voice="{voice}" data-model="{model}">▶ الكل</button></td></tr>'
            )
    html = f"""<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>مفاضلة أصوات Gemini TTS — مشروع المُعلِّم</title>
<style>
 body {{ font-family: "Noto Naskh Arabic", "Geeza Pro", serif; margin: 2rem; background:#faf7f2; color:#241f1a }}
 h1 {{ font-size: 1.4rem }}
 p.note {{ background:#fff3d6; padding:.8rem 1rem; border-radius:.6rem; max-width:52rem; line-height:1.9 }}
 table {{ border-collapse: collapse; margin-top:1rem }}
 th, td {{ border:1px solid #ddd2c2; padding:.45rem .6rem; text-align:center; background:#fff }}
 th.v {{ background:#f0e8db; font-size:1.05rem }}
 td.m {{ font-size:.8rem; color:#6b5f4f; font-family: system-ui }}
 th small {{ display:block; font-weight:normal; color:#8a7a66; font-size:.72rem }}
 button {{ font-size:1.1rem; padding:.35rem .8rem; cursor:pointer; border:1px solid #c9bba6;
           border-radius:.45rem; background:#fdfaf4 }}
 button.playing {{ background:#2f7d4f; color:#fff }}
 td small {{ display:block; color:#a1937f; font-size:.65rem; font-family: system-ui }}
 td.miss {{ color:#c0392b }}
</style></head><body>
<h1>مفاضلة أصوات Gemini TTS</h1>
<p class="note">اسمع الصفوف وقارن: أيّ صوت أوضح مخرجاً وأهدأ إيقاعاً لطفل في السادسة؟
الحكم بالأذن للمالك — ثم يُبلَّغ الاختيار (النموذج + الصوت) ليُولَّد المنهج كله به.
<br>«▶ الكل» يشغّل النصوص الستة للصف بالتتابع.</p>
<table><thead><tr><th>الصوت</th><th>النموذج</th>{head}<th></th></tr></thead>
<tbody>{"".join(body)}</tbody></table>
<script>
let cur = null, btn = null;
function play(src, b) {{
  if (cur) {{ cur.pause(); }}
  if (btn) btn.classList.remove('playing');
  cur = new Audio(src); btn = b; b && b.classList.add('playing');
  cur.play();
  return new Promise((r) => {{ cur.onended = r; cur.onerror = r; }});
}}
document.addEventListener('click', async (e) => {{
  const b = e.target.closest('button'); if (!b) return;
  if (b.classList.contains('all')) {{
    const row = b.closest('tr');
    for (const one of row.querySelectorAll('button[data-src]')) {{
      await play(one.dataset.src, one);
      await new Promise((r) => setTimeout(r, 250));
    }}
    if (btn) btn.classList.remove('playing');
    return;
  }}
  if (b.dataset.src) play(b.dataset.src, b);
}});
</script></body></html>"""
    (out_dir / "index.html").write_text(html, encoding="utf-8")


# ————————————————————————— main —————————————————————————

def main():
    ap = argparse.ArgumentParser(description="توليد أصوات المنهج")
    ap.add_argument("--engine", choices=["gemini", "edge"], default=None,
                    help="الافتراضي gemini إن وُجد GEMINI_API_KEY، وإلا edge")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="نموذج Gemini TTS")
    ap.add_argument("--tts-voice", default=DEFAULT_VOICE, help="صوت Gemini (مثل Kore)")
    ap.add_argument("--voice", default="ar-SA-HamedNeural", help="صوت edge-tts")
    ap.add_argument("--force", action="store_true", help="إعادة توليد الموجود")
    ap.add_argument("--replace-same-as", metavar="DIR", nargs="?", const="archive/audio-edge",
                    help="إكمال تبديل الصوت: يعيد توليد كل ملف ما زال مطابقاً لنسخته في DIR "
                         "(أي لم يُبدَّل بعد) ويترك ما بُدِّل — يستأنف بعد انقطاع الحصة")
    ap.add_argument("--dry-run", action="store_true", help="عرض ما سيُولَّد بلا أي طلب")
    ap.add_argument("--rpm", type=float, default=8.0,
                    help="سقف الطلبات في الدقيقة (افتراضي ٨ — دون حدّ النموذج ١٠)")
    ap.add_argument("--from-queue", action="store_true",
                    help="تصريف tools/audio_queue.json بالأولوية فالأقدمية (docs/AUDIO_QUEUE.md)")
    ap.add_argument("--only-model", default="",
                    help="مع --from-queue: اقتصر على ما يوجَّه إلى هذا النموذج")
    ap.add_argument("--route-report", action="store_true",
                    help="خريطة توجيه القائمة على النماذج الثلاثة بلا أي طلب")
    ap.add_argument("--seam-audition", action="store_true",
                    help="صمام السياسة: باقة كاملة (مقاطع 3.1 + كلمة 2.5) للسماع — بلا شبكة")
    ap.add_argument("--model-audition", action="store_true",
                    help="إجازة نموذج: ٣ نصوص متطابقة عليه وعلى نموذج النواة + صفحة مقارنة")
    ap.add_argument("--candidate-model", default=MODEL_LEXICON, help="النموذج المرشَّح للإجازة")
    ap.add_argument("--approve-model", metavar="MODEL", nargs="?", const=MODEL_LEXICON,
                    help="تسجيل إجازة المالك لنموذج (بعد سماعه)")
    ap.add_argument("--reject-model", metavar="MODEL", nargs="?", const=MODEL_LEXICON,
                    help="تسجيل رفض المالك لنموذج")
    ap.add_argument("--queue-status", action="store_true",
                    help="عرض حالة القائمة ونصوصها المنتظِرة (JSON) بلا أي طلب")
    ap.add_argument("--verify-only", action="store_true", help="تحقّق ختامي بلا توليد")
    ap.add_argument("--archive-current", metavar="DIR", nargs="?", const="archive/audio-edge",
                    help="نسخ أصوات app/audio الحالية إلى مجلد أرشيف ثم الخروج")
    ap.add_argument("--audition", action="store_true", help="توليد صفحة مفاضلة الأصوات")
    ap.add_argument("--page-only", action="store_true",
                    help="مع --audition: إعادة بناء الصفحة من الملفات الموجودة بلا طلبات")
    ap.add_argument("--audition-dir", default="scratch/audition")
    ap.add_argument("--audition-voices", default=",".join(AUDITION_VOICES))
    ap.add_argument("--audition-models", default=",".join(AUDITION_MODELS))
    args = ap.parse_args()

    if args.archive_current:
        archive_current(ROOT / args.archive_current)
        return

    if args.seam_audition:
        sys.exit(run_seam_audition(ROOT / "scratch" / "seam_audition"))

    if args.approve_model or args.reject_model:
        set_approval(args.approve_model or args.reject_model, bool(args.approve_model))
        return

    texts, pending = expected_texts()
    if args.route_report:
        queue = load_queue()
        lexicon_ok = is_approved(MODEL_LEXICON)
        plan = plan_queue(queue, lexicon_ok)
        counts = collections.Counter(short_model(m) or "محبوس حتى الإجازة" for _i, _e, m in plan)
        print(f"توجيه {len(plan)} نصاً منتظِراً "
              f"({short_model(MODEL_LEXICON)}: {'مُجاز' if lexicon_ok else 'غير مُجاز بعد'}):")
        for m, n in counts.most_common():
            print(f"  · {m}: {n}")
        by_cat = collections.Counter(
            (short_model(m) or "محبوس", e.get("category", "word")) for _i, e, m in plan)
        for (m, cat), n in sorted(by_cat.items()):
            print(f"      {m} ← {CATEGORY_AR[cat]}: {n}")
        return

    if args.queue_status:
        queue = load_queue()
        waiting = queue_pending(queue)
        print(f"قائمة الانتظار ({QUEUE_FILE.relative_to(ROOT)}): "
              f"{len(waiting)} منتظِراً، {len(queue) - len(waiting)} مُصرَّفاً.")
        print(json.dumps([e["text"] for _i, e in waiting], ensure_ascii=False))
        return
    if args.verify_only:
        sys.exit(1 if verify(texts, pending) else 0)

    api_key = read_env_key()
    engine = args.engine or ("gemini" if api_key else "edge")

    if args.model_audition:
        if not api_key:
            sys.exit("المفاضلة تحتاج GEMINI_API_KEY في البيئة أو .env")
        set_rpm(args.rpm)
        sys.exit(1 if run_model_audition(ROOT / "scratch" / "model_audition", api_key,
                                         args.candidate_model, args.tts_voice, args.force) else 0)

    if args.from_queue:
        if not api_key:
            sys.exit("التصريف يحتاج GEMINI_API_KEY في البيئة أو .env")
        set_rpm(args.rpm)
        # بلا --model صريح: التوجيه بالمحتوى (سياسة النماذج الثلاثة)
        forced = args.model if args.model != DEFAULT_MODEL else None
        print(f"تصريف القائمة · {'النموذج ' + forced if forced else 'توجيه بالمحتوى'} "
              f"· الصوت {args.tts_voice} · ≤{args.rpm:g} طلب/دقيقة لكل نموذج")
        failed = drain_queue(forced, args.tts_voice, api_key, args.dry_run, args.only_model)
        if args.dry_run:
            return
        texts, pending = expected_texts()
        sys.exit(1 if (failed or verify(texts, pending)) else 0)

    if args.audition:
        if not api_key and not args.page_only:
            sys.exit("المفاضلة تحتاج GEMINI_API_KEY في البيئة أو .env")
        failed = run_audition(
            ROOT / args.audition_dir, api_key or "",
            [m.strip() for m in args.audition_models.split(",") if m.strip()],
            [v.strip() for v in args.audition_voices.split(",") if v.strip()],
            args.force, args.page_only,
        )
        sys.exit(1 if failed else 0)

    # التوليد العام على نصوص المنهج وحدها؛ نصوص القائمة يصرّفها --from-queue.
    curriculum = parse_curriculum(CURRICULUM.read_text(encoding="utf-8"))
    counts = {}
    for cat in curriculum.values():
        counts[cat] = counts.get(cat, 0) + 1
    print(f"عدد النصوص المستخرجة من المنهج: {len(curriculum)}  "
          + "، ".join(f"{CATEGORY_AR[c]}: {n}" for c, n in counts.items()))

    if engine == "gemini":
        if not api_key:
            sys.exit("لا مفتاح GEMINI_API_KEY (البيئة أو .env) — استعمل --engine edge")
        set_rpm(args.rpm)
        print(f"المحرّك: Gemini · النموذج {args.model} · الصوت {args.tts_voice} "
              f"· ≤{args.rpm:g} طلب/دقيقة")
        ref = None
        if args.replace_same_as:
            ref = ROOT / args.replace_same_as
            if not ref.is_dir():
                sys.exit(f"مجلد المرجع غير موجود: {ref}")
        failed = synthesize_gemini(curriculum, args.model, args.tts_voice, args.force, api_key,
                                   ref, args.dry_run)
        if args.dry_run:
            return
    else:
        try:
            import edge_tts  # noqa: F401
        except ImportError:
            sys.exit("ثبّت الحزمة أولاً:  pip install edge-tts")
        print(f"المحرّك: edge-tts · الصوت {args.voice}")
        failed = asyncio.run(synthesize_edge(curriculum, args.voice, args.force))

    problems = verify(texts, pending)
    sys.exit(1 if (failed or problems) else 0)


if __name__ == "__main__":
    main()
