#!/usr/bin/env python3
"""نسخ نصّ المصحف من مصدره المرجعي إلى app/js/curriculum.js — حرفاً بحرف.

    python3 tools/sync_quran.py            # ينسخ ما اختلف ويطبع ما غيّره
    python3 tools/sync_quran.py --check    # يتحقّق فقط (بلا كتابة)

**لماذا هذا الملف موجود**: نصّ المصحف لا يُكتب بأيدينا ولا يُنسخ باللصق من شاشة —
حرفٌ واحد يزيغ (آ المركّبة بدل ا + مدّة مثلاً) يغيّر كلام الله في تطبيق يقرؤه طفل.
فالمصدر الوحيد هو `tools/quran_source.txt` (مشروع تنزيل، الرسم العثماني)، وهذا
السكربت ينقله بالبايت، و`tools/check_decodable.py` يرفض أي فرق بعده.

ما يُنسَخ: البسملة، وآيات السور الأربع، وأمثلة درس الرسم، والحروف المقطَّعة —
كلٌّ محدَّد أدناه بموضعه من المصحف (سورة:آية + رقم الكلمة)، لا بنصّه.
"""

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURRICULUM = ROOT / "app" / "js" / "curriculum.js"
SOURCE = ROOT / "tools" / "quran_source.txt"

SURAHS = [("s1", 1, 7), ("s112", 112, 4), ("s113", 113, 5), ("s114", 114, 6)]

# أمثلة درس الرسم وحروفه المقطَّعة: (المفتاح في الملف، سورة:آية، رقم الكلمة من صفر)
RASM_WORDS = [
    ("ٱ", "1:2", 0),          # ٱلْحَمْدُ — ألف الوصل
    ("ـٰ", "1:3", 0),         # ٱلرَّحْمَـٰنِ — الألف الخنجرية
    ("ٓ", "1:7", -1),         # ٱلضَّآلِّينَ — المدّة
    ("ى", "114:5", 0),        # ٱلَّذِى — الياء بلا نقطتين
    ("ۥ", "112:4", 2),        # لَّهُۥ — الواو الصغيرة
    ("ۢ", "112:4", -1),       # أَحَدٌۢ — الميم الصغيرة
]
MUQATTAAT = [("البقرة", "2:1", 4), ("طه", "20:1", 4), ("يس", "36:1", 4), ("القلم", "68:1", 4)]


def source_rows() -> dict:
    rows = {}
    for line in SOURCE.read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or "|" not in line:
            continue
        ref, text = line.split("|", 1)
        rows[ref.strip()] = text
    return rows


def main():
    ap = argparse.ArgumentParser(description="نسخ نصّ المصحف إلى المنهج")
    ap.add_argument("--check", action="store_true", help="تحقّق بلا كتابة")
    args = ap.parse_args()

    if not SOURCE.exists():
        sys.exit(f"لا مصدر مرجعي: {SOURCE}")
    rows = source_rows()
    src = CURRICULUM.read_text(encoding="utf-8")
    original = src
    changed = []

    basmala = rows["1:1"]
    src, n = re.subn(r"(basmala: ')[^']*(')", lambda m: m.group(1) + basmala + m.group(2), src, count=1)
    if n and basmala not in original:
        changed.append("البسملة")

    # آيات كل سورة: تُكتب في مكانها بنفس التنسيق، والبسملة تُنزَع من الآية الأولى
    for ident, number, count in SURAHS:
        ayat = [rows[f"{number}:{i}"] for i in range(1, count + 1)]
        if number != 1:
            assert ayat[0].startswith(basmala + " "), f"{ident}: البسملة ليست في أول الآية"
            ayat[0] = ayat[0][len(basmala) + 1:]
        block = "".join(f"        '{a}',\n" for a in ayat)
        pattern = re.compile(rf"(id: '{ident}',.*?ayat: \[\n)(.*?)(      \],)", re.S)
        if not pattern.search(src):
            sys.exit(f"لم يُعثر على آيات {ident} في curriculum.js")
        before = pattern.search(src).group(2)
        src = pattern.sub(lambda m: m.group(1) + block + m.group(3), src, count=1)
        if before != block:
            changed.append(f"سورة {ident} ({count} آية)")

    # كلمة بموضعها من المصحف (سالب = من الآخر)
    def word_at(ref: str, index: int) -> str:
        return rows[ref].split(" ")[index]

    for sign, ref, index in RASM_WORDS:
        want = word_at(ref, index)
        pattern = re.compile(rf"(sign: '{re.escape(sign)}',.*?read: ')[^']*(')", re.S)
        if not pattern.search(src):
            sys.exit(f"لم يُعثر على علامة الرسم «{sign}» في curriculum.js")
        if pattern.search(src).group(0).split("read: '")[1] != want + "'":
            changed.append(f"مثال العلامة «{sign}» ← {want}")
        src = pattern.sub(lambda m: m.group(1) + want + m.group(2), src, count=1)

    for surah, ref, index in MUQATTAAT:
        want = word_at(ref, index)
        pattern = re.compile(rf"(read: ')[^']*(',\n        surah: '{re.escape(surah)}')")
        if not pattern.search(src):
            sys.exit(f"لم يُعثر على الحروف المقطَّعة لسورة {surah} في curriculum.js")
        if pattern.search(src).group(0).split("read: '")[1].split("'")[0] != want:
            changed.append(f"مقطَّعة سورة {surah} ← {want}")
        src = pattern.sub(lambda m: m.group(1) + want + m.group(2), src, count=1)

    if src == original:
        print("✓ نصّ المصحف في المنهج مطابق للمصدر المرجعي حرفاً بحرف")
        return 0

    for line in changed:
        print(f"  ~ {line}")
    if args.check:
        print(f"\n{len(changed)} موضعاً يخالف المصدر — شغّل python3 tools/sync_quran.py")
        return 1
    CURRICULUM.write_text(src, encoding="utf-8")
    print(f"\nنُسخ {len(changed)} موضعاً من المصدر إلى curriculum.js")
    return 0


if __name__ == "__main__":
    sys.exit(main())
