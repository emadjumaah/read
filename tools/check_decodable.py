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
QURAN_SOURCE = ROOT / "tools" / "quran_source.txt"

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


def region(text: str, key: str, opener: str = "[", closer: str = "]") -> str:
    """محتوى القوس الذي يلي مفتاحاً، بعدّ الأقواس (تحتمل التعشيش: pairs، signs…)."""
    i = text.find(key)
    if i < 0:
        return ""
    start = text.find(opener, i)
    if start < 0:
        return ""
    depth = 0
    for j in range(start, len(text)):
        if text[j] == opener:
            depth += 1
        elif text[j] == closer:
            depth -= 1
            if depth == 0:
                return text[start:j + 1]
    return text[start:]


def bracket_region(text: str, key: str) -> str:
    return region(text, key)


def chunks_by_key(src: str, key: str):
    """يقطّع نصّاً عند كل ظهور لمفتاح (sign: أو read:) — لقوائم الكائنات المتشابهة."""
    marks = [m.start() for m in re.finditer(rf"\b{key}:", src)]
    for i, pos in enumerate(marks):
        yield src[pos:(marks[i + 1] if i + 1 < len(marks) else len(src))]


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


def parse_quran(src: str) -> dict:
    """يقرأ قسم QURAN: الحرفان الجديدان، الكلمات، علامات الرسم، المقطَّعة، السور."""
    # الأقسام بالترتيب: كل قسم يُقتطع مما بعد سابقه — فلا يلتبس `words:` الأعلى
    # بـ`words:` الذي داخل بطاقة الحرف (الربط بالتسلسل لا بالتنسيق).
    rest = src
    cut = {}
    for key in ("letters", "words", "rasm", "muqattaat"):
        cut[key] = region(rest, f"{key}:", "{", "}")
        i = rest.find(cut[key]) + len(cut[key]) if cut[key] else 0
        rest = rest[i:]
    letters, words, rasm, muq = (cut[k] for k in ("letters", "words", "rasm", "muqattaat"))
    surahs_src = region(rest, "surahs:")

    def worded(chunk):
        return re.findall(r"read:\s*'([^']*)'\s*,\s*emoji:\s*'([^']*)'", chunk)

    signs = []
    for chunk in chunks_by_key(region(letters, "signs:"), "sign"):
        signs.append({
            "sign": one(r"sign:\s*'([^']*)'", chunk, ""),
            "name": one(r"name:\s*'([^']*)'", chunk, ""),
            "shapes": re.findall(r"'([^']*)'", bracket_region(chunk, "shapes:")),
            "words": worded(chunk),
        })

    rasm_signs = []
    for chunk in chunks_by_key(region(rasm, "signs:"), "sign"):
        rasm_signs.append({
            "sign": one(r"sign:\s*'([^']*)'", chunk, ""),
            "name": one(r"name:\s*'([^']*)'", chunk, ""),
            "rule": one(r"rule:\s*'([^']*)'", chunk, ""),
            "read": one(r"read:\s*'([^']*)'", chunk, ""),
            "from": one(r"from:\s*'([^']*)'", chunk, ""),
        })

    muq_items = []
    for chunk in chunks_by_key(region(muq, "items:"), "read"):
        muq_items.append({
            "read": one(r"read:\s*'([^']*)'", chunk, ""),
            "surah": one(r"surah:\s*'([^']*)'", chunk, ""),
            "parts": re.findall(r"ch:\s*'([^']*)'\s*,\s*say:\s*'([^']*)'", chunk),
        })

    surahs = []
    for ident, chunk in chunks_by_id(surahs_src):
        surahs.append({
            "id": ident,
            "number": int(one(r"number:\s*(\d+)", chunk, "0")),
            "name": one(r"name:\s*'([^']*)'", chunk, ""),
            "emoji": one(r"emoji:\s*'([^']*)'", chunk, ""),
            "basmalaIsAyah": one(r"basmalaIsAyah:\s*(true|false)", chunk, "false") == "true",
            "ayat": re.findall(r"'([^']*)'", bracket_region(chunk, "ayat:")),
        })

    return {
        "after": one(r"after:\s*'([^']+)'", src, ""),
        "title": one(r"title:\s*'([^']*)'", src, ""),
        "basmala": one(r"basmala:\s*'([^']*)'", src, ""),
        "letters": {"title": one(r"title:\s*'([^']*)'", letters, ""),
                    "face": one(r"face:\s*'([^']*)'", letters, ""),
                    "rule": one(r"rule:\s*'([^']*)'", letters, ""),
                    "signs": signs},
        "words": {"title": one(r"title:\s*'([^']*)'", words, ""),
                  "face": one(r"face:\s*'([^']*)'", words, ""),
                  "rule": one(r"rule:\s*'([^']*)'", words, ""),
                  "items": worded(words)},
        "rasm": {"title": one(r"title:\s*'([^']*)'", rasm, ""),
                 "face": one(r"face:\s*'([^']*)'", rasm, ""),
                 "rule": one(r"rule:\s*'([^']*)'", rasm, ""),
                 "signs": rasm_signs},
        "muqattaat": {"title": one(r"title:\s*'([^']*)'", muq, ""),
                      "face": one(r"face:\s*'([^']*)'", muq, ""),
                      "rule": one(r"rule:\s*'([^']*)'", muq, ""),
                      "items": muq_items},
        "surahs": surahs,
    }


def quran_source() -> dict:
    """نصّ المصحف المرجعي: «سورة:آية» ← النصّ حرفياً (مشروع تنزيل، الرسم العثماني)."""
    if not QURAN_SOURCE.exists():
        return {}
    rows = {}
    for line in QURAN_SOURCE.read_text(encoding="utf-8").splitlines():
        if line.startswith("#") or "|" not in line:
            continue
        ref, text = line.split("|", 1)
        rows[ref.strip()] = text
    return rows


def check_quran(quran, taught, letters, source):
    """فحص المرحلة القرآنية: مفكوكيةُ الإملائي، وأصالةُ العثماني، وحرمةُ نطقه آلياً.

    ثلاث قواعد يفرضها هذا الفحص:
    ١) كلمات هذه المرحلة بالرسم الإملائي مفكوكة كغيرها (حروف مدروسة + الحرفان الجديدان).
    ٢) كل رمز في نصّ المصحف إما حرفٌ مدروس أو علامةٌ معروضة في درس الرسم قبله —
       فسورةٌ فيها علامة بلا درس لا تمرّ، والفاحص يشتقّ «المعروض» من البيانات نفسها.
    ٣) كل نصّ عثماني يطابق tools/quran_source.txt حرفاً بحرف (لا يُكتب المصحف بيدنا).
    """
    errors, warnings = [], []
    spoken, silent = [], []

    # ١. الحرفان الجديدان يوسّعان الحروف المدروسة في هذه المرحلة وحدها
    new_signs = [s["sign"] for s in quran["letters"]["signs"]]
    shapes = [sh for s in quran["letters"]["signs"] for sh in s["shapes"]]
    hamza_forms = set("".join(shapes)) - {TATWEEL}
    quran_letters = dict(letters)
    for ch in set(new_signs) | hamza_forms:
        if ch and ch not in quran_letters:
            quran_letters[ch] = "حرف المرحلة القرآنية"
    quran_taught = set(taught) | set(new_signs) | hamza_forms

    if not new_signs:
        errors.append("[قرآن] لا حرف جديد معروض قبل السور")

    # ٢. مادة القراءة بالرسم الإملائي: مفكوكة بكل قواعد المنهج
    allowed = set(MARKS) | TANWEEN | {SHADDA, SUN_RULE}
    imla = [(text, emoji, "درس الحرفين") for s in quran["letters"]["signs"] for text, emoji in s["words"]]
    imla += [(text, emoji, "كلمات القرآن") for text, emoji in quran["words"]["items"]]
    if len(quran["words"]["items"]) < 5:
        errors.append("[قرآن] كلمات المرحلة أقلّ من خمس")
    for text, emoji, where in imla:
        errors += text_errors(text, f"[قرآن/{where}]", quran_taught, quran_letters, allowed)
        spoken.append(text)
        if not emoji:
            warnings.append(f"[قرآن/{where}]: «{text}» بلا صورة (emoji)")

    for sign in quran["letters"]["signs"]:
        if not sign["words"]:
            errors.append(f"[قرآن] الحرف «{sign['sign']}» بلا كلمات تمثّله")
        for shape in sign["shapes"]:
            outside = [c for c in shape if c not in quran_letters and c != TATWEEL]
            if outside:
                errors.append(f"[قرآن] صورة الحرف «{shape}» فيها رمز مجهول: "
                              + "، ".join(f"«{c}»" for c in outside))

    # ٣. رموز المصحف المسموح بها = حروفٌ مدروسة + علاماتٌ يعرضها درس الرسم
    rasm_marks = set()
    for s in quran["rasm"]["signs"]:
        rasm_marks |= set(s["sign"])
        spoken.append(s["rule"])
    mushaf_allowed = (quran_taught | set(MARKS) | TANWEEN | {SHADDA, TATWEEL, " "} | rasm_marks)

    def mushaf_errors(text, label):
        bad = sorted({c for c in text if c not in mushaf_allowed})
        if not bad:
            return []
        names = "، ".join(f"«{c}» (U+{ord(c):04X})" for c in bad)
        return [f"{label}: «{text}» فيه رمز لم يُعرَض في درس الرسم ولا في الحروف: {names}"]

    # ٤. أصالة النصّ: مطابقة حرفية للمصدر المرجعي
    if not source:
        warnings.append("لا يوجد tools/quran_source.txt — لم تُفحص أصالة نصّ المصحف")
    else:
        joined = "\n".join(source.values())
        if quran["basmala"] and source.get("1:1") != quran["basmala"]:
            errors.append("[قرآن] البسملة لا تطابق المصدر المرجعي حرفاً بحرف")
        for surah in quran["surahs"]:
            for i, ayah in enumerate(surah["ayat"], 1):
                ref = f"{surah['number']}:{i}"
                expected = source.get(ref)
                if expected is None:
                    errors.append(f"[قرآن/{surah['id']}] الآية {ref} ليست في المصدر المرجعي")
                    continue
                actual = (quran["basmala"] + " " + ayah) if (i == 1 and not surah["basmalaIsAyah"]) else ayah
                if actual != expected:
                    errors.append(f"[قرآن/{surah['id']}] الآية {ref} لا تطابق المصدر حرفاً بحرف")
            missing = [r for r in source if r.startswith(f"{surah['number']}:")
                       and int(r.split(':')[1]) > len(surah["ayat"])]
            if missing:
                errors.append(f"[قرآن/{surah['id']}] السورة ناقصة {len(missing)} آية عن المصدر")
        for item in quran["muqattaat"]["items"]:
            if item["read"] and item["read"] not in joined:
                errors.append(f"[قرآن/المقطَّعة] «{item['read']}» ليست في المصدر المرجعي")
        for s in quran["rasm"]["signs"]:
            if s["read"] and s["read"] not in joined:
                errors.append(f"[قرآن/الرسم] المثال «{s['read']}» ليس في المصدر المرجعي")

    # ٥. رموز كل نصّ عثماني + جمعُه في قائمة «ما لا يُنطق آلياً»
    if not quran["surahs"]:
        errors.append("[قرآن] لا سورة في المرحلة")
    for s in quran["rasm"]["signs"]:
        errors += mushaf_errors(s["read"], "[قرآن/الرسم]")
        silent.append(s["read"])
    for item in quran["muqattaat"]["items"]:
        errors += mushaf_errors(item["read"], "[قرآن/المقطَّعة]")
        silent.append(item["read"])
        for ch, say in item["parts"]:
            if ch not in taught:
                errors.append(f"[قرآن/المقطَّعة] الحرف «{ch}» غير مدروس")
            if ch not in bare(item["read"]):
                errors.append(f"[قرآن/المقطَّعة] الحرف «{ch}» ليس في «{item['read']}»")
            spoken.append(say)
        if not item["parts"]:
            errors.append(f"[قرآن/المقطَّعة] «{item['read']}» بلا أسماء حروف")
    silent.append(quran["basmala"])
    for surah in quran["surahs"]:
        for i, ayah in enumerate(surah["ayat"], 1):
            errors += mushaf_errors(ayah, f"[قرآن/{surah['id']}:{i}]")
        silent += surah["ayat"]

    for text in (quran["letters"]["rule"], quran["words"]["rule"],
                 quran["rasm"]["rule"], quran["muqattaat"]["rule"]):
        if text:
            spoken.append(text)

    return errors, warnings, spoken, [t for t in silent if t]


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
        # ترتيب الشدّة مع الحركة يختلف بين المصادر (شّـَ / شـَّ) فلا نتعلّق به —
        # ولذلك تكفي الحركةُ المجانسة في علامات ما قبل حرف المدّ حيثما وقعت («سِكِّينْ»).
        if u["letter"] in MADD_MATE and prev and MADD_MATE[u["letter"]] in prev["marks"]:
            continue
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


def check(letters, groups, skills=(), stories=(), parts=None, quiet=False, quran=None):
    errors, warnings = [], []
    seen_letters = set()   # الحروف المدروسة تراكمياً
    audio_texts = set()
    silent_texts = set()   # نصّ المصحف: يُعرض ولا يُنطق آلياً (METHOD §٥.٦)
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

    # ٣ج. المرحلة القرآنية (§١.٢ و§٥.٦): خاتمة الرحلة — حصيلة الطفل فيها كاملة.
    quran_literals = set()
    if quran:
        if quran["after"] != group_ids[-1]:
            errors.append(f"[قرآن] موضعها «{quran['after']}» وليس بعد المجموعة الأخيرة")
        q_errors, q_warnings, q_spoken, q_silent = check_quran(quran, taught, letters, quran_source())
        errors += q_errors
        warnings += q_warnings
        audio_texts.update(q_spoken)
        silent_texts.update(q_silent)
        quran_literals = set(q_spoken) | set(q_silent) | {
            quran["title"], quran["basmala"],
            *[quran[k][f] for k in ("letters", "words", "rasm", "muqattaat") for f in ("title", "face")],
            *[s[f] for s in quran["letters"]["signs"] for f in ("sign", "name")],
            *[sh for s in quran["letters"]["signs"] for sh in s["shapes"]],
            *[t for s in quran["letters"]["signs"] for w in s["words"] for t in w],
            *[t for w in quran["words"]["items"] for t in w],
            *[s[f] for s in quran["rasm"]["signs"] for f in ("sign", "name", "from")],
            *[i["surah"] for i in quran["muqattaat"]["items"]],
            *[c for i in quran["muqattaat"]["items"] for p in i["parts"] for c in p],
            *[s[f] for s in quran["surahs"] for f in ("name", "emoji")],
        }

    # ٣ب. حارس المحلّل: كل نصّ عربي مكتوب في هذه الأقسام لا بدّ أن يكون قد قُرئ،
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
        if quran:
            for lit in re.findall(r"'([^']*)'", parts.get("QURAN", "")):
                if re.search(r"[ء-ي]", lit) and lit not in quran_literals:
                    errors.append(f"[QURAN] نصّ لم يقرأه الفاحص: «{lit}» — راجع محلّل الملف")

    # ٤أ. حرمة النطق الآلي لنصّ المصحف (METHOD §٥.٦: التلاوة بصوت قارئ متقن لا بمولّد).
    #     الفاحص يمنعه من بابه: لا يدخل نصّ عثماني بيانَ الأصوات ولا قائمة الانتظار.
    for text in sorted(silent_texts & audio_texts):
        errors.append(f"[قرآن] نصّ من المصحف مطلوبٌ له صوت مولَّد: «{text}»")
    for text in sorted(silent_texts & pending_audio):
        errors.append(f"[قرآن] نصّ من المصحف في قائمة الانتظار الصوتية: «{text}»")

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
            recited = sorted(silent_texts & set(manifest.values()))
            for text in recited:
                errors.append(f"[قرآن] نصّ من المصحف له ملف صوت مولَّد: «{text}»")
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
    if quran:
        print(f"المرحلة القرآنية: {len(quran['surahs'])} سور "
              f"(في {sum(len(s['ayat']) for s in quran['surahs'])} آية) "
              f"| كلمات: {len(quran['words']['items'])} | علامات رسم: {len(quran['rasm']['signs'])} "
              f"| مقطَّعة: {len(quran['muqattaat']['items'])} "
              f"| نصوص مصحف لا تُنطق آلياً: {len(silent_texts)}")

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


def self_test(letters, skills, stories, parts, quran=None) -> int:
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

    # ————— المرحلة القرآنية —————
    if quran:
        all_letters = set(letters)
        source = quran_source()
        ok(len(quran["surahs"]) == 4 and [len(s["ayat"]) for s in quran["surahs"]] == [7, 4, 5, 6],
           f"محلّل السور يقرأ الأربع بآياتها ({[len(s['ayat']) for s in quran['surahs']]})")
        ok(len(quran["rasm"]["signs"]) >= 5 and all(s["read"] and s["rule"] for s in quran["rasm"]["signs"]),
           f"ومحلّل علامات الرسم يقرأ {len(quran['rasm']['signs'])} علامة بأمثلتها")
        ok(bool(source) and len(source) >= 22, f"والمصدر المرجعي مقروء ({len(source)} آية)")

        errs, _, spoken, silent = check_quran(quran, all_letters, letters, source)
        ok(not errs, f"والمرحلة القرآنية تمرّ نظيفةً{'' if not errs else ': ' + errs[0]}")
        ok(len(silent) > 25 and all(t not in spoken for t in silent),
           f"ولا نصّ مصحف واحد في المنطوق ({len(silent)} نصاً صامتاً، {len(spoken)} منطوقاً)")

        # عبث مقصود: آية محرَّفة، وعلامة بلا درس، وحرف جديد بلا كلمة
        broken = json.loads(json.dumps(quran))
        broken["surahs"][1]["ayat"][1] = broken["surahs"][1]["ayat"][1].replace("ُ", "َ")
        ok(any("لا تطابق المصدر" in e for e in check_quran(broken, all_letters, letters, source)[0]),
           "وتحريف حركة واحدة في آية يُمسَك بمطابقة المصدر")

        broken = json.loads(json.dumps(quran))
        broken["rasm"]["signs"] = [s for s in broken["rasm"]["signs"] if s["sign"] != "ٱ"]
        ok(any("لم يُعرَض في درس الرسم" in e for e in check_quran(broken, all_letters, letters, source)[0]),
           "وحذف درس علامةٍ تظهر في السور يُمسَك (المفكوكية تُشتقّ من الدروس نفسها)")

        broken = json.loads(json.dumps(quran))
        broken["words"]["items"] = [["كِتَاب", "📖"]] + broken["words"]["items"][1:]
        ok(any("بلا حركة" in e for e in check_quran(broken, all_letters, letters, source)[0]),
           "وكلمة إملائية ناقصة الشكل تُمسَك كغيرها من مادة القراءة")

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
    quran = parse_quran(parts.get("QURAN", ""))
    if args.self_test:
        sys.exit(self_test(letters, skills, stories, parts, quran))
    sys.exit(check(letters, groups, skills, stories, parts, quiet=args.quiet, quran=quran))


if __name__ == "__main__":
    main()
