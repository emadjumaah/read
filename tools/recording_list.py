#!/usr/bin/env python3
"""قائمة التسجيل البشري: كل نصّ في المنهج مع مفتاح ملفه وملاحظة أداء.

    python3 tools/recording_list.py                 # CSV + صفحة طباعة في scratch/
    python3 tools/recording_list.py --out ~/rec     # مجلد آخر

الغرض: يُعطى المعلّم/القارئ هذه القائمة فيسجّل كل نصّ في ملف باسم مفتاحه
(<key>.wav أو .mp3)، ثم يُستورد بـ tools/import_recordings.py فيحلّ محلّ المولَّد
دون أي تغيير في شيفرة التطبيق (اسم الملف هو العقد الوحيد بين الصوت والشيفرة).
"""

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_audio as gen  # noqa: E402

NOTE = {
    "letter_name": "اسم الحرف وحده، بتأنٍّ ووقفة صغيرة بعده — لا تُتبعه بشيء.",
    "letter_haraka": "صوت الحرف بحركته بمخرج صحيح، ممدوداً قليلاً كما يُلقّن الطفل.",
    "syllable": "مقطع واحد متصل، بتأنٍّ ووضوح، كما في تهجّي القاعدة النورانية.",
    "word": "الكلمة كاملة بنبرة ودودة وإيقاع هادئ.",
}
ORDER = {c: i for i, c in enumerate(gen.CATEGORY_ORDER)}


def main():
    ap = argparse.ArgumentParser(description="قائمة التسجيل البشري")
    ap.add_argument("--out", default="scratch", help="مجلد المخرجات")
    args = ap.parse_args()

    out = Path(args.out)
    if not out.is_absolute():
        out = gen.ROOT / out
    out.mkdir(parents=True, exist_ok=True)

    texts = gen.parse_curriculum(gen.CURRICULUM.read_text(encoding="utf-8"))
    rows = sorted(
        ((t, c, gen.key_for(t)) for t, c in texts.items()),
        key=lambda r: (ORDER[r[1]], r[0]),
    )

    csv_path = out / "recording_list.csv"
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["النص", "الفئة", "اسم الملف", "ملاحظة الأداء"])
        for text, cat, key in rows:
            w.writerow([text, gen.CATEGORY_AR[cat], f"{key}.mp3", NOTE[cat]])

    md_path = out / "recording_list.md"
    lines = [
        "# قائمة التسجيل البشري — مشروع «المُعلِّم»",
        "",
        f"عدد النصوص: **{len(rows)}**. سجّل كل نصّ في ملف مستقل باسم عمود «اسم الملف»",
        "(wav أفضل، وmp3 مقبول)، ثم: `python3 tools/import_recordings.py <مجلد التسجيلات>`.",
        "",
    ]
    for cat in gen.CATEGORY_ORDER:
        part = [r for r in rows if r[1] == cat]
        if not part:
            continue
        lines += [f"## {gen.CATEGORY_AR[cat]} ({len(part)})", "", f"> {NOTE[cat]}", "",
                  "| # | النص | اسم الملف |", "|---|---|---|"]
        lines += [f"| {i} | {t} | `{k}.mp3` |" for i, (t, _c, k) in enumerate(part, 1)]
        lines.append("")
    md_path.write_text("\n".join(lines), encoding="utf-8")

    print(f"{len(rows)} نصاً → {csv_path}")
    print(f"                → {md_path}")
    for cat in gen.CATEGORY_ORDER:
        n = sum(1 for r in rows if r[1] == cat)
        if n:
            print(f"  {gen.CATEGORY_AR[cat]}: {n}")


if __name__ == "__main__":
    main()
