#!/usr/bin/env python3
"""جلب تلاوة قارئ متقن لآيات المرحلة القرآنية — **بلا أي مولّد ولا حصة TTS**.

    python3 tools/fetch_recitation.py                 # الناقص فقط
    python3 tools/fetch_recitation.py --force         # إعادة جلب الكل
    python3 tools/fetch_recitation.py --dry-run       # ما سيُجلب ومن أين
    python3 tools/fetch_recitation.py --reciter Husary_64kbps

المصدر: everyayah.com (ترقيم `سسسآآآ.mp3` = ٣ خانات للسورة و٣ للآية)، والقارئ
الافتراضي **الحصري المرتّل** بقرار المدير (٣ أغسطس ٢٠٢٦).

`METHOD §٥.٦`: تلاوة القرآن بصوت قارئ متقن لا بمولّد — فهذا السكربت هو الطريق
الوحيد لدخول صوتٍ لنصّ المصحف، ولا يمسّ `generate_audio.py` ولا حصته.

الملفات تُسمّى بمفتاح نصّ الآية (sha1 أول ١٢ خانة) كبقية أصوات التطبيق، وتُقيَّد
في `tools/recitations.json` (نصّ ← سورة:آية ← القارئ ← الملف) — وهو **بيان مستقل**
عن `app/audio/manifest.json` عمداً: الفهرس بيانُ الأصوات المولّدة، ونصّ المصحف
ممنوع منه (`docs/AUDIO_QUEUE.md`).
"""

import argparse
import hashlib
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURRICULUM = ROOT / "app" / "js" / "curriculum.js"
OUT_DIR = ROOT / "app" / "audio"
RECITATIONS = ROOT / "tools" / "recitations.json"

BASE = "https://everyayah.com/data"
DEFAULT_RECITER = "Husary_64kbps"      # الحصري المرتّل — قرار المدير
MIN_BYTES = 4000                        # أقصر آية بـ64kbps تتجاوز هذا بكثير


def key_for(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def surahs_from_curriculum() -> list:
    """نصوص الآيات من مصدر الحقيقة نفسه (لا تُكتب هنا يدوياً أبداً)."""
    js = ("import('file://%s').then(m => console.log(JSON.stringify("
          "{surahs: m.QURAN.surahs, basmala: m.QURAN.basmala})))" % CURRICULUM)
    out = subprocess.run(["node", "-e", js], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def plan(data: dict) -> list:
    """[(نصّ، سورة، آية)] — البسملة تُجلب مرة واحدة (١:١) وتخدم السور الثلاث."""
    items, seen = [], set()
    basmala = data["basmala"]
    items.append((basmala, 1, 1))
    seen.add(basmala)
    for surah in data["surahs"]:
        num = surah["number"]
        for i, ayah in enumerate(surah["ayat"], 1):
            if ayah in seen:                  # بسملة الفاتحة = الآية الأولى نفسها
                continue
            seen.add(ayah)
            items.append((ayah, num, i))
    return items


def fetch(url: str, retries: int = 4) -> bytes:
    delay = 2.0
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "muallim-fetch/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = RuntimeError(f"HTTP {e.code}")
            if e.code in (404, 403):
                raise last
        except Exception as e:  # noqa: BLE001
            last = RuntimeError(f"{type(e).__name__}: {e}")
        if attempt < retries - 1:
            time.sleep(delay)
            delay *= 2
    raise last or RuntimeError("فشل غير معروف")


def is_mp3(data: bytes) -> bool:
    return data[:3] == b"ID3" or (len(data) > 2 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0)


def main():
    ap = argparse.ArgumentParser(description="جلب التلاوة للمرحلة القرآنية")
    ap.add_argument("--reciter", default=DEFAULT_RECITER)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = surahs_from_curriculum()
    items = plan(data)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"القارئ: {args.reciter} · {len(items)} آية (منها البسملة).")
    record, made, skipped, failed = [], 0, 0, 0
    for text, surah, ayah in items:
        key = key_for(text)
        path = OUT_DIR / f"{key}.mp3"
        url = f"{BASE}/{args.reciter}/{surah:03d}{ayah:03d}.mp3"
        entry = {"text": text, "surah": surah, "ayah": ayah, "reciter": args.reciter,
                 "file": f"{key}.mp3", "source": url}
        if args.dry_run:
            print(f"  ⟶ {surah:03d}:{ayah:03d} → {path.name}  ({url})")
            record.append(entry)
            continue
        if path.exists() and not args.force:
            skipped += 1
            record.append(entry)
            continue
        try:
            blob = fetch(url)
            if not is_mp3(blob) or len(blob) < MIN_BYTES:
                raise RuntimeError(f"ليس mp3 صالحاً ({len(blob)} بايت)")
            path.write_bytes(blob)
            record.append(entry)
            made += 1
            print(f"  ✓ {surah:03d}:{ayah:03d} → {path.name} {len(blob) // 1024}KB")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ✗ {surah:03d}:{ayah:03d}: {e}", file=sys.stderr)

    if args.dry_run:
        print(f"\nسيُجلب: {len(record)} (تجربة جافّة — لم يُنزَّل شيء)")
        return 0

    RECITATIONS.write_text(json.dumps(record, ensure_ascii=False, indent=1) + "\n",
                           encoding="utf-8")
    print(f"\nتم: {made} مجلوب، {skipped} موجود مسبقاً، {failed} فشل.")
    print(f"البيان: {RECITATIONS.relative_to(ROOT)} ({len(record)} آية)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
