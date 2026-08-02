#!/usr/bin/env python3
"""فحص المفكوكية ١٠٠٪ في منهج «المُعلِّم».

القاعدة الملزمة (docs/METHOD.md §٢.٤): لا تُعرض على الطفل كلمة أو مقطع يحتوي
حرفاً أو علامة لم تُدرَّس بعد. هذا السكربت يتحقّق من ذلك آلياً على
app/js/curriculum.js دون تشغيل جافاسكربت (قراءة نصّية بالتعابير النمطية).

الاستعمال:
    python3 tools/check_decodable.py          # أخطاء + تنبيهات
    python3 tools/check_decodable.py -q       # الأخطاء فقط

يخرج بـ ١ عند وجود خطأ واحد على الأقل، وبـ ٠ إن مرّ الفحص.
التنبيهات (مثل نقص ملف صوت) لا تُفشل الفحص.
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURRICULUM = ROOT / "app" / "js" / "curriculum.js"
AUDIO_DIR = ROOT / "app" / "audio"

# العلامات المسموح بها في بيانات المنهج الحالية (الحركات الثلاث + السكون).
# الشدّة والتنوين يدخلان في الجلسة ٤، وحينها يُضافان هنا مع مواضع إدخالهما.
MARKS = {
    "َ": "فتحة",
    "ِ": "كسرة",
    "ُ": "ضمة",
    "ْ": "سكون",
}
# علامات عربية أخرى قد تتسرّب خطأً إلى البيانات قبل تدريسها
FORBIDDEN_MARKS = {
    "ً": "تنوين فتح",
    "ٌ": "تنوين ضم",
    "ٍ": "تنوين كسر",
    "ّ": "شدّة",
    "ٓ": "مدّة",
    "ٔ": "همزة فوق",
    "ٕ": "همزة تحت",
    "ٰ": "ألف خنجرية",
}
TATWEEL = "ـ"


def key_for(text: str) -> str:
    """نفس مفتاح tools/generate_audio.py — sha1 أول ١٢ خانة."""
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def bare(text: str) -> str:
    """تجريد النص من الحركات والتطويل والمسافات — يبقى تسلسل الحروف فقط."""
    return "".join(
        c for c in text
        if c not in MARKS and c not in FORBIDDEN_MARKS and c != TATWEEL and not c.isspace()
    )


def parse_curriculum(src: str):
    """يستخرج LETTERS والمجموعات وكلماتها من curriculum.js.

    الربط بالموضع لا بالشكل: كل مصفوفة حروف وكل كلمة تُنسب إلى آخر id قبلها،
    فلا يكسر الفحصَ إعادةُ تنسيق الملف.
    """
    letters = {m.group(1): m.group(2)
               for m in re.finditer(r"'(.)':\s*\{\s*name:\s*'([^']+)'", src)}

    marks = [(m.start(), m.group(1)) for m in re.finditer(r"id:\s*'(g\d+)'", src)]
    if not marks:
        sys.exit("لم يُعثر على أي مجموعة في curriculum.js")

    def owner(pos: int) -> str:
        gid = None
        for start, g in marks:
            if start <= pos:
                gid = g
            else:
                break
        return gid

    groups = {g: {"id": g, "letters": [], "words": [], "title": None} for _, g in marks}
    order = [g for _, g in marks]

    for m in re.finditer(r"title:\s*'([^']+)'", src):
        g = owner(m.start())
        if g and groups[g]["title"] is None:
            groups[g]["title"] = m.group(1)

    for m in re.finditer(r"letters:\s*\[([^\]]*)\]", src):
        g = owner(m.start())
        if g:
            groups[g]["letters"].extend(re.findall(r"'([^']+)'", m.group(1)))

    word_re = re.compile(
        r"\{\s*tiles:\s*\[([^\]]*)\]\s*,\s*say:\s*'([^']*)'\s*,\s*emoji:\s*'([^']*)'\s*\}"
    )
    for m in word_re.finditer(src):
        g = owner(m.start())
        if g:
            groups[g]["words"].append({
                "tiles": re.findall(r"'([^']+)'", m.group(1)),
                "say": m.group(2),
                "emoji": m.group(3),
            })

    return letters, [groups[g] for g in order]


def check(letters, groups, quiet=False):
    errors, warnings = [], []
    seen_letters = set()   # الحروف المدروسة تراكمياً
    audio_texts = set()

    # ١. سلامة جدول الحروف والمجموعات
    for g in groups:
        for ch in g["letters"]:
            if ch not in letters:
                errors.append(f"[{g['id']}] الحرف «{ch}» غير معرَّف في LETTERS")
            if ch in seen_letters:
                errors.append(f"[{g['id']}] الحرف «{ch}» مكرَّر في أكثر من مجموعة")
            seen_letters.add(ch)

    missing_from_groups = set(letters) - seen_letters
    if missing_from_groups:
        errors.append("حروف معرَّفة في LETTERS ولا تظهر في أي مجموعة: "
                      + "، ".join(sorted(missing_from_groups)))

    # ٢. المفكوكية التراكمية
    taught = set()
    for g in groups:
        taught |= set(g["letters"])
        new_letters = set(g["letters"])
        used_here = set()

        for w in g["words"]:
            joined = "".join(w["tiles"])
            label = f"[{g['id']}] «{w['say']}»"

            # ٢أ. حروف المقاطع والكلمة ⊆ المدروس
            for src_name, text in (("المقاطع", joined), ("say", w["say"])):
                unknown = [c for c in bare(text) if c not in taught]
                if unknown:
                    errors.append(
                        f"{label}: {src_name} يستعمل حرفاً غير مدروس بعد: "
                        + "، ".join(f"«{c}»" for c in dict.fromkeys(unknown))
                    )
                undefined = [c for c in bare(text) if c not in letters]
                if undefined:
                    errors.append(f"{label}: {src_name} فيه رمز ليس حرفاً معرَّفاً: "
                                  + "، ".join(f"«{c}»" for c in dict.fromkeys(undefined)))

            # ٢ب. العلامات المستعملة مسموح بها في هذه المرحلة
            for c in joined:
                if c in FORBIDDEN_MARKS:
                    errors.append(f"{label}: علامة لم تُدرَّس بعد ({FORBIDDEN_MARKS[c]})")

            # ٢ج. المقاطع مجموعةً = الكلمة المنطوقة (حرفياً)
            if bare(joined) != bare(w["say"]):
                errors.append(
                    f"{label}: تركيب المقاطع «{joined}» لا يطابق الكلمة «{w['say']}»"
                )

            # ٢د. مشكولة بالكامل (METHOD §٨): كل حرف يحمل حركة أو سكوناً،
            # عدا الألف وحرفَي المدّ (و/ي) المسبوقَين بحركتهما المجانسة.
            madd_mate = {"و": "ُ", "ي": "ِ"}
            for i, c in enumerate(joined):
                if c not in letters:
                    continue
                nxt = joined[i + 1] if i + 1 < len(joined) else ""
                if nxt in MARKS:
                    continue
                if c == "ا":
                    continue
                if c in madd_mate and i > 0 and joined[i - 1] == madd_mate[c]:
                    continue
                errors.append(f"{label}: الحرف «{c}» بلا حركة ولا سكون في «{joined}»")

            used_here |= set(bare(joined))
            audio_texts.update(w["tiles"])
            audio_texts.add(w["say"])

            if not w["emoji"]:
                warnings.append(f"{label}: بلا صورة (emoji)")

        # ٢هـ. كل حرف جديد في المجموعة يظهر في كلمة واحدة على الأقل
        unused = sorted(new_letters - used_here)
        if unused:
            errors.append(
                f"[{g['id']}] حروف تُدرَّس بلا كلمة تمثّلها: " + "، ".join(f"«{c}»" for c in unused)
            )

        if not g["words"]:
            errors.append(f"[{g['id']}] مجموعة بلا كلمات")

    # ٣. تغطية الصوت (تنبيه فقط — يعالجها tools/generate_audio.py)
    for ch, name in letters.items():
        audio_texts.add(name)
        for mark in ("َ", "ِ", "ُ"):
            audio_texts.add(ch + mark)

    if AUDIO_DIR.exists():
        missing_audio = sorted(t for t in audio_texts if not (AUDIO_DIR / f"{key_for(t)}.mp3").exists())
        if missing_audio:
            warnings.append(
                f"{len(missing_audio)} نصاً بلا ملف صوت (شغّل tools/generate_audio.py): "
                + "، ".join(missing_audio[:12]) + ("…" if len(missing_audio) > 12 else "")
            )
        manifest_path = AUDIO_DIR / "manifest.json"
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            stale = sorted(set(manifest.values()) - audio_texts)
            if stale:
                warnings.append(f"{len(stale)} ملف صوت لم يعد المنهج يستعمله: "
                                + "، ".join(stale[:12]) + ("…" if len(stale) > 12 else ""))
        else:
            warnings.append("لا يوجد app/audio/manifest.json")
    else:
        warnings.append("مجلد app/audio غير موجود — لم تُفحص تغطية الصوت")

    # ٤. التقرير
    total_words = sum(len(g["words"]) for g in groups)
    print(f"المجموعات: {len(groups)} | الحروف: {len(letters)} | الكلمات: {total_words} "
          f"| نصوص الصوت المطلوبة: {len(audio_texts)}")

    if warnings and not quiet:
        print(f"\nتنبيهات ({len(warnings)}):")
        for w in warnings:
            print(f"  ! {w}")

    if errors:
        print(f"\nأخطاء مفكوكية ({len(errors)}):")
        for e in errors:
            print(f"  ✗ {e}")
        return 1

    print("\n✓ المفكوكية ١٠٠٪: كل كلمة ومقطع داخل الحروف المدروسة حتى مجموعتها.")
    return 0


def main():
    ap = argparse.ArgumentParser(description="فحص مفكوكية منهج المُعلِّم")
    ap.add_argument("-q", "--quiet", action="store_true", help="إخفاء التنبيهات")
    args = ap.parse_args()

    letters, groups = parse_curriculum(CURRICULUM.read_text(encoding="utf-8"))
    sys.exit(check(letters, groups, quiet=args.quiet))


if __name__ == "__main__":
    main()
