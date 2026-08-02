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

HARAKAT = {"fatha": "َ", "kasra": "ِ", "damma": "ُ"}

GEMINI_HOST = "https://generativelanguage.googleapis.com"
DEFAULT_MODEL = "gemini-3.1-flash-tts-preview"
DEFAULT_VOICE = "Kore"

# تعليمة الأداء تُكتب قبل النص فتوجّه الأداء ولا تُنطق (سلوك مثبَّت في Gemini TTS).
STYLE = {
    "letter_name": "انطق بتأنٍّ شديد ووضوح تام، بمخرج صحيح، كمعلم قرآن يعلّم طفلاً في السادسة: ",
    "letter_haraka": "انطق بتأنٍّ شديد ووضوح تام، بمخرج صحيح، كمعلم قرآن يعلّم طفلاً في السادسة: ",
    "syllable": "انطق هذا المقطع بتأنٍّ ووضوح لطفل يتعلم التهجئة: ",
    "word": "انطق الكلمة بوضوح وودّ لطفل: ",
}
CATEGORY_AR = {
    "letter_name": "اسم حرف",
    "letter_haraka": "حرف بحركة",
    "syllable": "مقطع",
    "word": "كلمة",
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


def gemini_pcm(text: str, category: str, model: str, voice: str, api_key: str,
               retries: int = 5) -> tuple[bytes, int]:
    """يعيد (PCM خام 16-bit little-endian، معدّل العيّنات). يعيد المحاولة عند 429/5xx."""
    body = json.dumps({
        "contents": [{"parts": [{"text": STYLE[category] + text}]}],
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
    for attempt in range(retries):
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        })
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            return extract_audio(payload)
        except urllib.error.HTTPError as e:
            code = e.code
            detail = e.read().decode("utf-8", "replace")[:300]
            # لا نطبع الرابط (يخلو من المفتاح أصلاً) ولا الترويسات.
            last = TTSError(f"HTTP {code}: {detail}")
            if code not in (408, 429, 500, 502, 503, 504):
                raise last
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = TTSError(f"{type(e).__name__}: {e}")
        except TTSError as e:
            # استجابة ٢٠٠ بلا صوت (finishReason: OTHER) — تقع على النصوص القصيرة جداً
            # وهي غير حتمية، فتُعاد المحاولة كما يُعاد على 429.
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
        raise TTSError(f"لا صوت في الاستجابة: {json.dumps(reason, ensure_ascii=False)[:300]}")
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

def synthesize_gemini(texts: dict, model: str, voice: str, force: bool, api_key: str) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest, made, skipped, failed = {}, 0, 0, 0
    total = len(texts)

    for i, (text, cat) in enumerate(texts.items(), 1):
        key = key_for(text)
        manifest[key] = text
        path = OUT_DIR / f"{key}.mp3"
        if path.exists() and not force:
            skipped += 1
            continue
        try:
            pcm, rate = gemini_pcm(text, cat, model, voice, api_key)
            pcm_to_mp3(pcm, rate, path)
            made += 1
            print(f"  [{i}/{total}] ✓ {text} ({CATEGORY_AR[cat]}) → {path.name} "
                  f"{path.stat().st_size // 1024}KB")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  [{i}/{total}] ✗ {text}: {e}", file=sys.stderr)

    write_manifest(manifest)
    print(f"\nتم: {made} مولّد، {skipped} موجود مسبقاً، {failed} فشل.")
    return failed


async def synthesize_edge(texts: dict, voice: str, force: bool) -> int:
    import edge_tts

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest, made, skipped, failed = {}, 0, 0, 0

    for text in texts:
        key = key_for(text)
        manifest[key] = text
        path = OUT_DIR / f"{key}.mp3"
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


def verify(texts: dict, min_bytes: int = 1500) -> int:
    """تحقّق ختامي: لكل نص ملف، ولا ملف يتيم، ولا ملف أصغر من الحد المعقول."""
    problems = []
    keys = {key_for(t) for t in texts}
    on_disk = {p.stem for p in OUT_DIR.glob("*.mp3")}
    for t in texts:
        p = OUT_DIR / f"{key_for(t)}.mp3"
        if not p.exists():
            problems.append(f"ناقص: {t}")
        elif p.stat().st_size < min_bytes:
            problems.append(f"صغير جداً ({p.stat().st_size}B): {t}")
    for orphan in sorted(on_disk - keys):
        problems.append(f"يتيم (لا نصّ له في المنهج): {orphan}.mp3")

    print(f"\nالتحقّق الختامي: {len(texts)} نصاً، {len(on_disk)} ملفاً على القرص.")
    for p in problems:
        print(f"  ✗ {p}", file=sys.stderr)
    if not problems:
        print("  ✓ كل نصّ له ملفه، ولا يتيم، ولا ملف مبتور.")
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
                    pcm, rate = gemini_pcm(text, cat, model, voice, api_key)
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

    texts = parse_curriculum(CURRICULUM.read_text(encoding="utf-8"))
    if args.verify_only:
        sys.exit(1 if verify(texts) else 0)

    api_key = read_env_key()
    engine = args.engine or ("gemini" if api_key else "edge")

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

    counts = {}
    for cat in texts.values():
        counts[cat] = counts.get(cat, 0) + 1
    print(f"عدد النصوص المستخرجة من المنهج: {len(texts)}  "
          + "، ".join(f"{CATEGORY_AR[c]}: {n}" for c, n in counts.items()))

    if engine == "gemini":
        if not api_key:
            sys.exit("لا مفتاح GEMINI_API_KEY (البيئة أو .env) — استعمل --engine edge")
        print(f"المحرّك: Gemini · النموذج {args.model} · الصوت {args.tts_voice}")
        failed = synthesize_gemini(texts, args.model, args.tts_voice, args.force, api_key)
    else:
        try:
            import edge_tts  # noqa: F401
        except ImportError:
            sys.exit("ثبّت الحزمة أولاً:  pip install edge-tts")
        print(f"المحرّك: edge-tts · الصوت {args.voice}")
        failed = asyncio.run(synthesize_edge(texts, args.voice, args.force))

    problems = verify(texts)
    sys.exit(1 if (failed or problems) else 0)


if __name__ == "__main__":
    main()
