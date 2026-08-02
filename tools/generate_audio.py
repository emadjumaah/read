#!/usr/bin/env python3
"""توليد ملفات الصوت للتطبيق عبر edge-tts (أصوات مايكروسوفت العصبية، مجاناً).

الاستعمال:
    pip install edge-tts
    python3 tools/generate_audio.py            # يولّد الناقص فقط
    python3 tools/generate_audio.py --force    # يعيد توليد الكل
    python3 tools/generate_audio.py --voice ar-SA-ZariyahNeural

يستخرج قائمة النصوص من app/js/curriculum.js (أسماء الحروف، الحرف مع كل حركة،
مقاطع الكلمات، الكلمات كاملة) وينتج app/audio/<key>.mp3
والفهرس app/audio/manifest.json الذي يربط كل مفتاح بنصّه.

أسماء الملفات مفاتيح ثابتة (hash للنص العربي) — استبدال أي ملف بتسجيل بشري
لاحقاً لا يتطلب أي تغيير في الشيفرة.
"""

import argparse
import asyncio
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURRICULUM = ROOT / "app" / "js" / "curriculum.js"
OUT_DIR = ROOT / "app" / "audio"

HARAKAT = {"fatha": "َ", "kasra": "ِ", "damma": "ُ"}


def key_for(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def parse_curriculum(src: str):
    """يستخرج النصوص المطلوب نطقها من curriculum.js دون تشغيل جافاسكربت."""
    texts = set()

    # الحروف وأسماؤها:  'ب': { name: 'باء', ...
    for m in re.finditer(r"'(.)':\s*\{\s*name:\s*'([^']+)'", src):
        letter, name = m.group(1), m.group(2)
        texts.add(name)                      # اسم الحرف
        for mark in HARAKAT.values():        # الحرف بالحركات الثلاث
            texts.add(letter + mark)

    # مقاطع الكلمات والكلمات كاملة
    for m in re.finditer(r"tiles:\s*\[([^\]]+)\]", src):
        for t in re.findall(r"'([^']+)'", m.group(1)):
            texts.add(t)
    for m in re.finditer(r"say:\s*'([^']+)'", src):
        texts.add(m.group(1))

    return sorted(texts)


async def synthesize(texts, voice: str, force: bool):
    import edge_tts

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {}
    made = skipped = failed = 0

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

    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"\nتم: {made} مولّد، {skipped} موجود مسبقاً، {failed} فشل.")
    print(f"الفهرس: {OUT_DIR / 'manifest.json'}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="ar-SA-HamedNeural",
                    help="مثل ar-SA-HamedNeural أو ar-SA-ZariyahNeural أو ar-EG-SalmaNeural")
    ap.add_argument("--force", action="store_true", help="إعادة توليد الملفات الموجودة")
    args = ap.parse_args()

    try:
        import edge_tts  # noqa: F401
    except ImportError:
        sys.exit("ثبّت الحزمة أولاً:  pip install edge-tts")

    src = CURRICULUM.read_text(encoding="utf-8")
    texts = parse_curriculum(src)
    print(f"عدد النصوص المستخرجة من المنهج: {len(texts)}")
    asyncio.run(synthesize(texts, args.voice, args.force))


if __name__ == "__main__":
    main()
