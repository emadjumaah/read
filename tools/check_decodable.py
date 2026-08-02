#!/usr/bin/env python3
"""فحص المفكوكية ١٠٠٪ في منهج «المُعلِّم».

القاعدة الملزمة (docs/METHOD.md §٢.٤): لا تُعرض على الطفل كلمة أو مقطع أو جملة
تحتوي حرفاً أو علامة لم تُدرَّس بعد. هذا السكربت يتحقّق من ذلك آلياً على
app/js/curriculum.js دون تشغيل جافاسكربت (قراءة نصّية بالتعابير النمطية)،
على المحتوى كله: كلمات المجموعات، ودروس المهارات، والقصص.

المقيس هو **مادة القراءة** وحدها (المقاطع والكلمات والجمل التي تُعرض للطفل ليقرأها)؛
أما عناوين الشاشات وجُمل القواعد فنصّ واجهة يقرؤه وليّ الأمر والمعلّم، شأنه شأن
بقية نصوص التطبيق («ميّز بأذنك»، «أحسنت»…) فلا يدخل في هذا الفحص.

الاستعمال:
    python3 tools/check_decodable.py            # أخطاء + تنبيهات
    python3 tools/check_decodable.py -q         # الأخطاء فقط
    python3 tools/check_decodable.py --self-test  # فحص الفاحص: هل يمسك المخالفات؟

يخرج بـ ١ عند وجود خطأ واحد على الأقل، وبـ ٠ إن مرّ الفحص.
التنبيهات (مثل نقص ملف صوت) لا تُفشل الفحص.
"""

import argparse
import contextlib
import hashlib
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURRICULUM = ROOT / "app" / "js" / "curriculum.js"
AUDIO_DIR = ROOT / "app" / "audio"
QUEUE_FILE = ROOT / "tools" / "audio_queue.json"

# العلامات المتاحة منذ المجموعة الأولى: الحركات الثلاث + السكون
# (السكون يظهر في نهايات الكلمات من البداية «بابْ» ويُفرد بدرس بعد المجموعة ٣ — METHOD §٥.٣).
MARKS = {
    "َ": "فتحة",
    "ِ": "كسرة",
    "ُ": "ضمة",
    "ْ": "سكون",
}
# علامات تُفتح بدروس المهارات (SKILLS في curriculum.js تعلن ما تفتحه في `marks`)،
# وما لم يُفتح منها بعدُ فوجودُه في مادة القراءة خطأ مفكوكية.
LATER_MARKS = {
    "ً": "تنوين فتح",
    "ٌ": "تنوين ضم",
    "ٍ": "تنوين كسر",
    "ّ": "شدّة",
}
# علامات لا يعرفها المنهج أصلاً في هذه المرحلة
FORBIDDEN_MARKS = {
    **LATER_MARKS,
    "ٓ": "مدّة",
    "ٔ": "همزة فوق",
    "ٕ": "همزة تحت",
    "ٰ": "ألف خنجرية",
}
TATWEEL = "ـ"
SHADDA = "ّ"
SUKUN = "ْ"
TANWEEN = set("ًٌٍ")
SUN_LETTERS = set("تثدذرزسشصضطظلن")   # الحروف الشمسية (تُدغَم فيها لام «ال»)
SUN_RULE = "sun"                       # مفتاح تُعلنه مهارة اللام الشمسية في `marks`
MADD_MATE = {"و": "ُ", "ي": "ِ"}       # حرف المدّ وحركته المجانسة قبله


def key_for(text: str) -> str:
    """نفس مفتاح tools/generate_audio.py — sha1 أول ١٢ خانة."""
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def queue_pending() -> set:
    """نصوص قائمة الانتظار الصوتية التي لم تُصرَّف بعد (docs/AUDIO_QUEUE.md)."""
    if not QUEUE_FILE.exists():
        return set()
    try:
        data = json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return set()
    return {e["text"] for e in data
            if isinstance(e, dict) and e.get("text") and e.get("status", "pending") != "done"}


def bare(text: str) -> str:
    """تجريد النص من الحركات والتطويل والمسافات — يبقى تسلسل الحروف فقط."""
    return "".join(
        c for c in text
        if c not in MARKS and c not in FORBIDDEN_MARKS and c != TATWEEL and not c.isspace()
    )


def sections(src: str) -> dict:
    """يقسّم الملف عند كل `export const/function` — فيُقرأ كل جزء في معزل عن غيره."""
    marks = [(m.start(), m.group(1))
             for m in re.finditer(r"^export (?:const|function) (\w+)", src, re.M)]
    out = {}
    for i, (pos, name) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(src)
        out[name] = src[pos:end]
    return out


def bracket_region(text: str, key: str) -> str:
    """محتوى المصفوفة التي تلي مفتاحاً، بعدّ الأقواس (تحتمل التعشيش: pairs)."""
    i = text.find(key)
    if i < 0:
        return ""
    start = text.find("[", i)
    if start < 0:
        return ""
    depth = 0
    for j in range(start, len(text)):
        if text[j] == "[":
            depth += 1
        elif text[j] == "]":
            depth -= 1
            if depth == 0:
                return text[start:j + 1]
    return text[start:]


def chunks_by_id(src: str):
    """يقطّع مصفوفة كائنات يبدأ كلٌّ منها بـ id — لدروس المهارات والقصص."""
    marks = [(m.start(), m.group(1)) for m in re.finditer(r"id:\s*'([^']+)'", src)]
    for i, (pos, ident) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(src)
        yield ident, src[pos:end]


def one(pattern: str, text: str, default=None):
    m = re.search(pattern, text)
    return m.group(1) if m else default


def parse_skills(src: str) -> list:
    out = []
    for ident, chunk in chunks_by_id(src):
        out.append({
            "id": ident,
            "after": one(r"after:\s*'([^']+)'", chunk),
            "title": one(r"title:\s*'([^']*)'", chunk, ""),
            "face": one(r"face:\s*'([^']*)'", chunk, ""),
            "rule": one(r"rule:\s*'([^']*)'", chunk, ""),
            "marks": re.findall(r"'([^']*)'", bracket_region(chunk, "marks:")),
            "labels": re.findall(r"'([^']*)'", bracket_region(chunk, "labels:")),
            "pairs": re.findall(r"\[\s*'([^']*)'\s*,\s*'([^']*)'\s*\]",
                                bracket_region(chunk, "pairs:")),
            "wordRefs": re.findall(r"'([^']*)'", bracket_region(chunk, "wordRefs:")),
            "words": re.findall(r"text:\s*'([^']*)'\s*,\s*emoji:\s*'([^']*)'",
                                bracket_region(chunk, "words:")),
        })
    return out


def parse_stories(src: str) -> list:
    out = []
    for ident, chunk in chunks_by_id(src):
        sentences = [
            {"words": re.findall(r"'([^']*)'", m.group(1)), "emoji": m.group(2)}
            for m in re.finditer(r"words:\s*\[([^\]]*)\]\s*,\s*emoji:\s*'([^']*)'",
                                 bracket_region(chunk, "sentences:"))
        ]
        out.append({
            "id": ident,
            "after": one(r"after:\s*'([^']+)'", chunk),
            "title": one(r"title:\s*'([^']*)'", chunk, ""),
            "emoji": one(r"emoji:\s*'([^']*)'", chunk, ""),
            "sentences": sentences,
        })
    return out


def parse_curriculum(src: str):
    """يستخرج LETTERS والمجموعات وكلماتها من curriculum.js.

    الربط بالموضع لا بالشكل: كل مصفوفة حروف وكل كلمة تُنسب إلى آخر id قبلها،
    فلا يكسر الفحصَ إعادةُ تنسيق الملف.
    """
    parts = sections(src)
    letters = {m.group(1): m.group(2)
               for m in re.finditer(r"'(.)':\s*\{\s*name:\s*'([^']+)'", parts.get("LETTERS", ""))}
    src = parts.get("GROUPS", "")

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

    return letters, [groups[g] for g in order], parts


def units_of(text: str, letters: dict) -> list:
    """تقطيع نصّ مشكول إلى وحدات (حرف + علاماته)، مع تسجيل ما سبقه فراغ."""
    units, gap = [], False
    for c in text:
        if c in letters:
            units.append({"letter": c, "marks": "", "gap": gap})
            gap = False
        elif c in MARKS or c in FORBIDDEN_MARKS:
            if units:
                units[-1]["marks"] += c
        else:
            gap = True          # فراغ أو تطويل أو رمز غير عربي
    return units


def text_errors(text, label, taught, letters, allowed):
    """أخطاء مادة قراءة واحدة: حرف لم يُدرَّس، علامة لم تُدرَّس، حرف بلا شكل.

    قاعدة الشكل الكامل (METHOD §٨): كل حرف يحمل حركة أو تنويناً أو سكوناً، إلا:
    الألف، وحرف المدّ (و/ي) بعد حركته المجانسة، ولام «ال» الشمسية (لا تُشكَّل ويُشدَّد
    ما بعدها) — وهذه الأخيرة لا تجوز قبل درس اللام الشمسية.
    """
    errors = []
    for c in bare(text):
        if c not in letters:
            errors.append(f"{label}: «{text}» فيه رمز ليس حرفاً معرَّفاً: «{c}»")
        elif c not in taught:
            errors.append(f"{label}: «{text}» يستعمل حرفاً غير مدروس بعد: «{c}»")

    for c in text:
        if c in FORBIDDEN_MARKS and c not in allowed:
            errors.append(f"{label}: «{text}» فيها علامة لم تُدرَّس بعد ({FORBIDDEN_MARKS[c]})")

    units = units_of(text, letters)
    for i, u in enumerate(units):
        prev, nxt = (units[i - 1] if i else None), (units[i + 1] if i + 1 < len(units) else None)
        vowels = set(u["marks"]) - {SHADDA}

        if u["letter"] == "ا":
            continue
        if vowels & (set(MARKS) | TANWEEN):
            continue
        if u["marks"] == SHADDA:
            errors.append(f"{label}: «{text}» فيها شدّة بلا حركة على «{u['letter']}»")
            continue
        if u["letter"] in MADD_MATE and prev and prev["marks"].endswith(MADD_MATE[u["letter"]]):
            continue
        # ترتيب الشدّة مع الحركة يختلف بين المصادر (شّـَ / شـَّ) فلا نتعلّق به
        shamsi = (u["letter"] == "ل" and nxt and not nxt["gap"]
                  and nxt["letter"] in SUN_LETTERS and SHADDA in nxt["marks"])
        if shamsi:
            if SUN_RULE not in allowed:
                errors.append(f"{label}: «{text}» فيها لام شمسية قبل درس اللام الشمسية")
            continue
        errors.append(f"{label}: الحرف «{u['letter']}» بلا حركة ولا سكون في «{text}»")

    # «الْ» قمرية قبل حرف شمسي: خطأ إملائي يقرؤه الطفل خطأً («الْشَّمْس»)
    for i, u in enumerate(units[:-1]):
        nxt = units[i + 1]
        if (u["letter"] == "ل" and SUKUN in u["marks"] and i and units[i - 1]["letter"] == "ا"
                and not u["gap"] and not nxt["gap"] and nxt["letter"] in SUN_LETTERS):
            errors.append(f"{label}: «{text}» لام «ال» ساكنة قبل حرف شمسي (تُكتب مدغمة)")
    return errors


def check(letters, groups, skills=(), stories=(), parts=None, quiet=False):
    errors, warnings = [], []
    seen_letters = set()   # الحروف المدروسة تراكمياً
    audio_texts = set()
    pending_audio = queue_pending()

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

            # ٢أ+ب+د. الحروف والعلامات والشكل الكامل (المقاطع مادةُ القراءة)
            errors += text_errors(joined, label, taught, letters, set(MARKS))
            for c in bare(w["say"]):
                if c not in taught:
                    errors.append(f"{label}: say يستعمل حرفاً غير مدروس بعد: «{c}»")

            # ٢ج. المقاطع مجموعةً = الكلمة المنطوقة (حرفياً)
            if bare(joined) != bare(w["say"]):
                errors.append(
                    f"{label}: تركيب المقاطع «{joined}» لا يطابق الكلمة «{w['say']}»"
                )

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

    # ٣. دروس المهارات والقصص (METHOD §٥): مادتها مفكوكة بحصيلة موضعها من الخريطة.
    #    ترتيب الرحلة: مجموعة ← مهاراتها ← قصصها ← المجموعة التالية،
    #    والعلامة التي يفتحها درسٌ تُستعمل في مادته وفيما بعده لا قبله.
    group_ids = [g["id"] for g in groups]
    words_by_say = {w["say"]: w for g in groups for w in g["words"]}
    for item, kind in [(s, "مهارة") for s in skills] + [(s, "قصة") for s in stories]:
        if item["after"] not in group_ids:
            errors.append(f"[{kind} {item['id']}] موضعها بعد مجموعة مجهولة: «{item['after']}»")

    allowed = set(MARKS)
    taught = set()
    for g in groups:
        taught |= set(g["letters"])

        for s in [x for x in skills if x["after"] == g["id"]]:
            label = f"[مهارة {s['id']}]"
            allowed |= set(s["marks"])          # الدرس يفتح علامته ثم يستعملها في مادته
            if len(s["pairs"]) < 2:
                errors.append(f"{label}: أقلّ من زوجين للمقارنة (لا تُبنى منها جولات تمييز)")
            if len(s["labels"]) != 2:
                errors.append(f"{label}: عنوانا المقارنة ليسا اثنين")
            for a, b in s["pairs"]:
                for text in (a, b):
                    errors += text_errors(text, label, taught, letters, allowed)
                    audio_texts.add(text)
            for say in s["wordRefs"]:
                word = words_by_say.get(say)
                if not word:
                    errors.append(f"{label}: إحالة إلى كلمة ليست في المنهج: «{say}»")
                    continue
                outside = [c for c in bare("".join(word["tiles"])) if c not in taught]
                if outside:
                    errors.append(f"{label}: الكلمة المُحال إليها «{say}» فيها حرف غير مدروس بعد: "
                                  + "، ".join(f"«{c}»" for c in dict.fromkeys(outside)))
            for text, emoji in s["words"]:
                errors += text_errors(text, label, taught, letters, allowed)
                audio_texts.add(text)
                if not emoji:
                    warnings.append(f"{label}: الكلمة «{text}» بلا صورة (emoji)")
            if not s["wordRefs"] and not s["words"]:
                errors.append(f"{label}: بلا كلمات أمثلة")
            if s["rule"]:
                audio_texts.add(s["rule"])

        for st in [x for x in stories if x["after"] == g["id"]]:
            label = f"[قصة {st['id']}]"
            if not 3 <= len(st["sentences"]) <= 5:
                errors.append(f"{label}: {len(st['sentences'])} جملة (المطلوب ٣–٥)")
            errors += text_errors(st["title"], label, taught, letters, allowed)
            audio_texts.add(st["title"])
            for i, sentence in enumerate(st["sentences"], 1):
                if not 1 <= len(sentence["words"]) <= 6:
                    errors.append(f"{label}: الجملة {i} فيها {len(sentence['words'])} كلمة "
                                  "(الجملة القصيرة أليق بالمبتدئ)")
                if not sentence["emoji"]:
                    warnings.append(f"{label}: الجملة {i} بلا صورة (emoji)")
                for word in sentence["words"]:
                    errors += text_errors(word, label, taught, letters, allowed)
                audio_texts.update(sentence["words"])
                audio_texts.add(" ".join(sentence["words"]))

    # ٣ب. حارس المحلّل: كل نصّ عربي مكتوب في هذين القسمين لا بدّ أن يكون قد قُرئ،
    #     كي لا يمرّ محتوى دون فحص بسبب تغيّر في شكل البيانات.
    if parts:
        seen_literals = set()
        for s in skills:
            seen_literals |= {s["title"], s["face"], s["rule"], *s["marks"], *s["labels"],
                              *[t for p in s["pairs"] for t in p], *s["wordRefs"],
                              *[t for w in s["words"] for t in w]}
        for st in stories:
            seen_literals |= {st["title"], st["emoji"],
                              *[w for sen in st["sentences"] for w in sen["words"]],
                              *[sen["emoji"] for sen in st["sentences"]]}
        for name in ("SKILLS", "STORIES"):
            for lit in re.findall(r"'([^']*)'", parts.get(name, "")):
                if re.search(r"[ء-ي]", lit) and lit not in seen_literals:
                    errors.append(f"[{name}] نصّ لم يقرأه الفاحص: «{lit}» — راجع محلّل الملف")

    # ٤. تغطية الصوت (تنبيه فقط — يعالجها tools/generate_audio.py وقائمة الانتظار)
    for ch, name in letters.items():
        audio_texts.add(name)
        for mark in ("َ", "ِ", "ُ"):
            audio_texts.add(ch + mark)

    if AUDIO_DIR.exists():
        missing_audio = sorted(t for t in audio_texts if not (AUDIO_DIR / f"{key_for(t)}.mp3").exists())
        queued = [t for t in missing_audio if t in pending_audio]
        missing_audio = [t for t in missing_audio if t not in pending_audio]
        if queued:
            warnings.append(f"{len(queued)} نصاً في قائمة الانتظار الصوتية "
                            "(احتياط النطق الآلي حتى تصرّفها جلسة الصوتيات)")
        if missing_audio:
            warnings.append(
                f"{len(missing_audio)} نصاً بلا ملف صوت ولا مكان في القائمة "
                "(node tools/queue_texts.mjs --add): "
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

    # ٥. التقرير
    total_words = sum(len(g["words"]) for g in groups)
    total_sentences = sum(len(s["sentences"]) for s in stories)
    print(f"المجموعات: {len(groups)} | الحروف: {len(letters)} | الكلمات: {total_words} "
          f"| المهارات: {len(skills)} | القصص: {len(stories)} (في {total_sentences} جملة) "
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

    print("\n✓ المفكوكية ١٠٠٪: كل كلمة ومقطع وجملة داخل الحروف والعلامات المدروسة عند موضعها.")
    return 0


def self_test(letters, skills, stories, parts) -> int:
    """يتحقّق أن الفاحص نفسه يُمسك المخالفات (فاحص لا يفشل أبداً لا يحرس شيئاً)."""
    fails = 0

    def ok(cond, msg):
        nonlocal fails
        if not cond:
            fails += 1
        print(("  ✓ " if cond else "  ✗ ") + msg)

    base = set(MARKS)
    shadda_on = base | {SHADDA}
    tanween_on = shadda_on | TANWEEN
    lam_on = tanween_on | {SUN_RULE}
    g1_3 = set("ابملنردستويه")
    err = lambda text, taught, allowed: text_errors(text, "س", taught, letters, allowed)

    ok(not err("بَابْ", g1_3, base), "«بَابْ» بالحركات والسكون تمرّ")
    ok(not err("تُوتْ", g1_3, base), "وحرف المدّ بعد حركته المجانسة يمرّ بلا حركة")
    ok(err("بَاب", g1_3, base), "وحرف بلا حركة ولا سكون يُمسَك")
    ok(err("باب", g1_3, base), "ونصّ غير مشكول يُمسَك")
    ok(err("بَيْتْ", set("اب"), base), "وحرف لم يُدرَّس بعدُ يُمسَك")
    ok(err("سُكَّرْ", g1_3 | set("ك"), base), "والشدّة قبل درسها تُمسَك")
    ok(not err("سُكَّرْ", g1_3 | set("ك"), shadda_on), "وبعد درسها تمرّ")
    ok(err("بّ", g1_3, shadda_on), "وشدّة بلا حركة تُمسَك")
    ok(err("بَابٌ", g1_3, shadda_on), "والتنوين قبل درسه يُمسَك")
    ok(not err("بَابٌ", g1_3, tanween_on), "وبعد درسه يمرّ")
    ok(err("الشَّمْسْ", g1_3 | set("ش"), tanween_on), "واللام الشمسية قبل درسها تُمسَك")
    ok(not err("الشَّمْسْ", g1_3 | set("ش"), lam_on), "وبعد درسها تمرّ")
    ok(not err("لِلدَّارْ", g1_3, lam_on), "و«لِلدَّارْ» شمسية بلا «ال» تمرّ")
    ok(err("الْشَّمْسْ", g1_3 | set("ش"), lam_on), "و«الْ» ساكنة قبل حرف شمسي تُمسَك")
    ok(not err("الْقَمَرْ", g1_3 | set("ق"), lam_on), "و«الْقَمَرْ» قمرية تمرّ")
    ok(not err("سُكْ كَرْ", g1_3 | set("ك"), base), "والفراغ بين مقطعين لا يخلط الجوار")

    ok(len(skills) == 5 and [s["id"] for s in skills] == ["madd", "sukun", "shadda", "tanween", "lam"],
       f"محلّل المهارات يقرأ الخمسة بالترتيب ({'، '.join(s['id'] for s in skills)})")
    ok(all(len(s["pairs"]) >= 3 and s["labels"] and s["rule"] for s in skills),
       "بأزواجها وعناوينها وقواعدها")
    ok(len(stories) == 3 and [len(s["sentences"]) for s in stories] == [5, 4, 5],
       f"ومحلّل القصص يقرأ الثلاث بجملها ({[len(s['sentences']) for s in stories]})")

    fake = "export const STORIES = [{ id: 'x', after: 'g1', title: 'عُنوان', hidden: 'كَلِمَة مَنسِيّة' }]"
    report = io.StringIO()
    with contextlib.redirect_stdout(report):
        check(letters, [], [], parse_stories(fake), {"SKILLS": "", "STORIES": fake}, quiet=True)
    ok("لم يقرأه الفاحص" in report.getvalue(),
       "وحارس المحلّل يمسك نصّاً عربياً لم يقرأه أحد (لا يمرّ محتوى دون فحص)")

    print(f"\n{fails} فشل" if fails else "\n✓ الفاحص يمسك المخالفات كلها")
    return 1 if fails else 0


def main():
    ap = argparse.ArgumentParser(description="فحص مفكوكية منهج المُعلِّم")
    ap.add_argument("-q", "--quiet", action="store_true", help="إخفاء التنبيهات")
    ap.add_argument("--self-test", action="store_true",
                    help="فحص الفاحص نفسه: هل يمسك المخالفات؟")
    args = ap.parse_args()

    letters, groups, parts = parse_curriculum(CURRICULUM.read_text(encoding="utf-8"))
    skills = parse_skills(parts.get("SKILLS", ""))
    stories = parse_stories(parts.get("STORIES", ""))
    if args.self_test:
        sys.exit(self_test(letters, skills, stories, parts))
    sys.exit(check(letters, groups, skills, stories, parts, quiet=args.quiet))


if __name__ == "__main__":
    main()
