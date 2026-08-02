#!/usr/bin/env python3
"""فحص «حديقة الكلمات» — معجم ب١ في app/data/lexicon.json (الحزمة ٧).

يرث منطق فاحص المنهج (`check_decodable.py`) ولا يعيد كتابته: نفس قواعد المفكوكية
ونفس تعريف الحروف والعلامات، مأخوذةً من `app/js/curriculum.js` نفسه لا مكتوبةً هنا.
موضع البساتين من الرحلة **بعد المرحلة القرآنية**، فحصيلة الطفل عندها كاملة:
الحروف الثمانية والعشرون + الهمزة والتاء المربوطة، والحركات والسكون والشدّة
والتنوين واللام الشمسية — ومع ذلك يبقى الفحص صارماً على كل رمز خارج هذه الحصيلة.

ما يفحصه:
  ١) اكتمال الحقول وسلامة البنية (كل كلمة: نصّ مشكول، مقاطع، جذر، موضوع، صورة، جملة).
  ٢) مفكوكية ١٠٠٪ لكل كلمة ولكل جملة مثال (بنفس `text_errors` التي تحرس المنهج).
  ٣) **المقاطع مشتقّة لا مكتوبة**: مقطِّع نورانيّ يولّدها من الكلمة، والمخزون يجب أن
     يطابقه حرفاً بحرف — فلا يتسرّب خطأ تقطيع يدويّ إلى ٢٥٠ كلمة.
  ٤) تفرّد الكلمات والصور (صورتان متشابهتان في باقة واحدة تُفسدان «اقرأ واختر»).
  ٥) تغطية الصوت: كل منطوق له ملف مولَّد أو مكان في قائمة الانتظار (تنبيه لا خطأ).

الاستعمال:
    python3 tools/check_lexicon.py               # أخطاء + تنبيهات
    python3 tools/check_lexicon.py -q            # الأخطاء فقط
    python3 tools/check_lexicon.py --fill-tiles  # يكتب المقاطع المشتقّة في الملف
    python3 tools/check_lexicon.py --self-test   # فحص الفاحص: هل يمسك المخالفات؟

يخرج بـ ١ عند وجود خطأ واحد على الأقل، وبـ ٠ إن مرّ الفحص.
"""

import argparse
import contextlib
import io
import json
import sys
from pathlib import Path

from check_decodable import (
    AUDIO_DIR,
    CURRICULUM,
    MARKS,
    SHADDA,
    SUKUN,
    SUN_RULE,
    TANWEEN,
    TATWEEL,
    bare,
    key_for,
    parse_curriculum,
    parse_quran,
    parse_skills,
    queue_pending,
    text_errors,
)

ROOT = Path(__file__).resolve().parent.parent
LEXICON = ROOT / "app" / "data" / "lexicon.json"

MIN_WORDS = 250            # طبقة ب١ في الخارطة (ROADMAP §المرحلة ب)
MIN_THEMES = 8             # «٨–١٠ بساتين» (بند الحزمة ٧)
MAX_THEMES = 10
MIN_BUNDLES = 2            # بستان بأقلّ من باقتين لا يستحقّ محطةً على الخريطة
SENTENCE_WORDS = (2, 5)    # جملة المثال قصيرة: من كلمتين إلى خمس
ROOT_LETTERS = (3, 4)      # الجذر العربي ثلاثيّ أو رباعيّ
FIELDS = ("word", "tiles", "root", "theme", "emoji", "sentence")

HARAKA_MARKS = set(MARKS) - {SUKUN}     # فتحة، كسرة، ضمة
MADD_HARAKA = {"ا": "َ", "و": "ُ", "ي": "ِ"}   # حرف المدّ وحركته المجانسة قبله
LEEN = {"و", "ي"}                       # حرف اللين الساكن بعد فتحة («بَيْ»، «يَوْ»)
ATTACH_SILENT = {"ة"}                   # التاء المربوطة في الوقف تتبع ما قبلها


# ————— المقطِّع النورانيّ: من الكلمة المشكولة إلى مقاطع تهجّيها —————
#
# قاعدته سطر واحد: كل حرف متحرّك مقطعٌ، ويلتحق به ما بعده إن كان ساكناً لا يُبتدأ به
# (ألف مدّ، أو واو/ياء مدّاً أو ليناً، أو تاء مربوطة في الوقف). والشدّة تُفكّ أولاً
# إلى ساكن فمتحرّك — وهو عين ما يعلّمه درس الشدّة («سُكْ كَرْ» ← «سُكَّرْ»).


def word_units(text: str, letters: dict) -> list:
    """(حرف، علاماته) بالترتيب. الرموز المجهولة تُهمَل هنا ويمسكها `text_errors`."""
    units = []
    for ch in text:
        if ch in letters:
            units.append([ch, ""])
        elif ch in MARKS or ch in TANWEEN or ch == SHADDA:
            if units:
                units[-1][1] += ch
    return units


def unshadda(units: list) -> list:
    """فكّ الشدّة: «كَّ» ← «كْ» + «كَ» (طريقة النورانية في تهجّي المشدَّد)."""
    out = []
    for ch, marks in units:
        if SHADDA in marks:
            out.append([ch, SUKUN])
            out.append([ch, marks.replace(SHADDA, "")])
        else:
            out.append([ch, marks])
    return out


def attaches(marks: str, nxt: list) -> bool:
    """هل يلتحق الحرف التالي بالمقطع الحالي؟ (مدّ أو لين أو تاء مربوطة ساكنة)"""
    haraka = next((m for m in marks if m in HARAKA_MARKS), "")
    if not haraka:
        return False
    nch, nmarks = nxt
    if nch == "ا" and nmarks == "":
        return haraka == MADD_HARAKA["ا"]
    if nch in LEEN and nmarks in ("", SUKUN):
        return haraka == MADD_HARAKA[nch] or (haraka == "َ" and nmarks == SUKUN)
    if nch in ATTACH_SILENT and nmarks == SUKUN:
        return True
    return False


def syllabify(text: str, letters: dict) -> list:
    """مقاطع تهجّي كلمة مشكولة — مصدر الحقيقة الوحيد لحقل `tiles`."""
    units = unshadda(word_units(text, letters))
    tiles, i = [], 0
    while i < len(units):
        ch, marks = units[i]
        tile = ch + marks
        if i + 1 < len(units) and attaches(marks, units[i + 1]):
            tile += units[i + 1][0] + units[i + 1][1]
            i += 1
            # والتاء المربوطة الساكنة تلحق بحرف المدّ أيضاً: «مِمْحَاةْ» ← مِ + مْ + حَاةْ
            if (i + 1 < len(units) and units[i + 1][0] in ATTACH_SILENT
                    and units[i + 1][1] == SUKUN):
                tile += units[i + 1][0] + units[i + 1][1]
                i += 1
        tiles.append(tile)
        i += 1
    return tiles


def spelled(text: str, letters: dict) -> str:
    """الكلمة كما تُتهجّى (بفكّ الشدّة) — تركيب مقاطعها يساويها حرفاً بحرف."""
    return "".join(ch + marks for ch, marks in unshadda(word_units(text, letters)))


# ————— قراءة المنهج: الحروف والعلامات المتاحة للبساتين —————


def taught_letters() -> dict:
    """حروف الطفل عند البساتين: المجموعات السبع + حرفا المرحلة القرآنية وصورهما.

    تُشتقّ من `curriculum.js` نفسه (لا تُكتب هنا) كما يفعل `check_quran`، فحذفُ
    درس الهمزة من المنهج يُسقِط كل كلمة تستعملها في المعجم — لا يمرّ صامتاً.
    """
    letters, _groups, parts = parse_curriculum(CURRICULUM.read_text(encoding="utf-8"))
    quran = parse_quran(parts.get("QURAN", ""))
    signs = quran["letters"]["signs"]
    extra = {s["sign"] for s in signs} | set("".join(sh for s in signs for sh in s["shapes"]))
    out = dict(letters)
    for ch in extra - {TATWEEL, ""}:
        out.setdefault(ch, "حرف المرحلة القرآنية")
    return out


def taught_words() -> set:
    """كلمات المنهج مجرّدةً من الشكل — المعجم **يوسّع** الرصيد ولا يكرّره.

    قاعدة المشروع: لا تُكرَّر بيانات المنهج في ملف آخر؛ وتربوياً: البساتين تأتي بعد
    الرحلة كلها، فإعادةُ ما تعلّمه في مجموعاته ودروسه إهدارٌ لأثمن ما فيها.
    """
    src = CURRICULUM.read_text(encoding="utf-8")
    _letters, groups, parts = parse_curriculum(src)
    quran = parse_quran(parts.get("QURAN", ""))
    words = {bare("".join(w["tiles"])) for g in groups for w in g["words"]}
    for skill in parse_skills(parts.get("SKILLS", "")):
        words |= {bare(text) for text, _emoji in skill["words"]}
    words |= {bare(text) for sign in quran["letters"]["signs"] for text, _e in sign["words"]}
    words |= {bare(text) for text, _e in quran["words"]["items"]}
    return {w for w in words if w}


def load(path: Path = LEXICON) -> dict:
    if not path.exists():
        sys.exit(f"لا يوجد {path.relative_to(ROOT)}")
    return json.loads(path.read_text(encoding="utf-8"))


# ————— الفحص —————


def check(data: dict, letters: dict, known: set = None, quiet: bool = False) -> int:
    errors, warnings = [], []
    known = taught_words() if known is None else known
    taught = set(letters)
    allowed = set(MARKS) | TANWEEN | {SHADDA, SUN_RULE}   # حصيلته كاملة عند البساتين
    audio_texts = set()

    themes = data.get("themes") or []
    words = data.get("words") or []
    size = data.get("bundleSize") or 0

    # ١. البنية العامة
    if not isinstance(size, int) or size < 3:
        errors.append(f"[بنية] bundleSize غير صالح: {size!r}")
        size = 5
    if not MIN_THEMES <= len(themes) <= MAX_THEMES:
        errors.append(f"[بنية] البساتين {len(themes)} (المطلوب {MIN_THEMES}–{MAX_THEMES})")
    if len(words) < MIN_WORDS:
        errors.append(f"[بنية] الكلمات {len(words)} (طبقة ب١ لا تقلّ عن {MIN_WORDS})")

    theme_ids = []
    for i, theme in enumerate(themes, 1):
        for field in ("id", "title", "emoji"):
            if not theme.get(field):
                errors.append(f"[بستان {i}] بلا {field}")
        if theme.get("id") in theme_ids:
            errors.append(f"[بستان {i}] معرّف مكرَّر: «{theme.get('id')}»")
        theme_ids.append(theme.get("id"))
    known_themes = set(theme_ids)

    # ٢. كل كلمة: اكتمال الحقول، ومفكوكيتها، ومقاطعها المشتقّة، وجملتها
    seen_words, seen_emoji = {}, {}
    by_theme = {t: 0 for t in theme_ids}
    for i, entry in enumerate(words, 1):
        word = entry.get("word", "")
        label = f"[{entry.get('theme', '?')}/«{word or i}»]"

        missing = [f for f in FIELDS if f not in entry]
        if missing:
            errors.append(f"{label}: حقول ناقصة: {'، '.join(missing)}")
            continue
        for field in ("word", "theme", "emoji", "sentence"):
            if not str(entry[field]).strip():
                errors.append(f"{label}: الحقل «{field}» فارغ")

        if entry["theme"] not in known_themes:
            errors.append(f"{label}: موضوع مجهول «{entry['theme']}»")
        else:
            by_theme[entry["theme"]] += 1

        if word in seen_words:
            errors.append(f"{label}: كلمة مكرَّرة (سبقت في {seen_words[word]})")
        seen_words.setdefault(word, entry.get("theme"))
        emoji = entry["emoji"]
        if emoji in seen_emoji:
            errors.append(f"{label}: الصورة «{emoji}» مستعملة في «{seen_emoji[emoji]}» "
                          "(صورتان متشابهتان تُفسدان «اقرأ واختر»)")
        seen_emoji.setdefault(emoji, word)

        # ٢أ. الكلمة نفسها: مشكولة بالكامل بحروف وعلامات مدروسة
        errors += text_errors(word, label, taught, letters, allowed)
        if bare(word).startswith("ال"):
            errors.append(f"{label}: كلمات المعجم مفردة بلا «ال» (التعريف في جملة المثال)")
        if any(c in word for c in TANWEEN):
            errors.append(f"{label}: الكلمة المفردة تُعرض في الوقف بالسكون لا بالتنوين")
        if bare(word) in known:
            errors.append(f"{label}: كلمة درسها الطفل في المنهج — البساتين توسّع الرصيد "
                          "ولا تكرّره (ولا تُكرَّر بيانات المنهج في ملف آخر)")

        # ٢ب. المقاطع مشتقّة من الكلمة لا مكتوبة بيد
        tiles = entry["tiles"]
        want = syllabify(word, letters)
        if tiles != want:
            errors.append(f"{label}: المقاطع «{'+'.join(tiles)}» تخالف التقطيع "
                          f"«{'+'.join(want)}» (شغّل --fill-tiles)")
        elif "".join(tiles) != spelled(word, letters):
            errors.append(f"{label}: تركيب المقاطع لا يعيد الكلمة")
        if len(want) < 2:
            errors.append(f"{label}: مقطع واحد لا يُركَّب (لا تصلح للعبة التركيب)")
        for tile in want:
            if bare(tile) in ("ء", "ة"):
                errors.append(f"{label}: المقطع «{tile}» لا يُنطق وحده")
        audio_texts.add(word)
        audio_texts.update(want)

        # ٢ج. الجذر: حروف معروفة بطول جذر عربي (يجوز فراغه للجامد والأعجميّ)
        root = str(entry["root"])
        if root:
            outside = [c for c in root if c not in letters]
            if outside:
                errors.append(f"{label}: الجذر «{root}» فيه رمز ليس حرفاً: "
                              + "، ".join(f"«{c}»" for c in outside))
            elif not ROOT_LETTERS[0] <= len(root) <= ROOT_LETTERS[1]:
                errors.append(f"{label}: الجذر «{root}» من {len(root)} حروف "
                              f"(المطلوب {ROOT_LETTERS[0]}–{ROOT_LETTERS[1]})")

        # ٢د. جملة المثال: قصيرة، مفكوكة، وفيها الكلمة نفسها
        sentence = entry["sentence"]
        parts = sentence.split()
        if not SENTENCE_WORDS[0] <= len(parts) <= SENTENCE_WORDS[1]:
            errors.append(f"{label}: جملة المثال {len(parts)} كلمة "
                          f"(المطلوب {SENTENCE_WORDS[0]}–{SENTENCE_WORDS[1]})")
        for part in parts:
            errors += text_errors(part, f"{label} جملة", taught, letters, allowed)
        if bare(word) not in bare(sentence):
            errors.append(f"{label}: جملة المثال لا تحوي الكلمة «{word}»")

    # ٣. البساتين وباقاتها
    for theme in themes:
        count = by_theme.get(theme.get("id"), 0)
        if count % size:
            errors.append(f"[بستان {theme.get('id')}] {count} كلمة لا تنقسم "
                          f"باقاتٍ من {size}")
        if count < MIN_BUNDLES * size:
            errors.append(f"[بستان {theme.get('id')}] {count} كلمة "
                          f"(أقلّ من {MIN_BUNDLES} باقتين)")

    # ٤. تغطية الصوت (تنبيه: يعالجها بروتوكول قائمة الانتظار — docs/AUDIO_QUEUE.md)
    pending = queue_pending()
    manifest_path = AUDIO_DIR / "manifest.json"
    have = set()
    if manifest_path.exists():
        have = set(json.loads(manifest_path.read_text(encoding="utf-8")).values())
    if AUDIO_DIR.exists():
        ready = sorted(t for t in audio_texts if (AUDIO_DIR / f"{key_for(t)}.mp3").exists())
        queued = sorted(t for t in audio_texts if t not in ready and t in pending)
        orphan = sorted(t for t in audio_texts if t not in ready and t not in pending)
        if queued:
            warnings.append(f"{len(queued)} نصاً من المعجم في قائمة الانتظار الصوتية")
        if orphan:
            warnings.append(f"{len(orphan)} نصاً بلا ملف ولا مكان في القائمة "
                            "(node tools/queue_texts.mjs --add): "
                            + "، ".join(orphan[:12]) + ("…" if len(orphan) > 12 else ""))
    else:
        warnings.append("مجلد app/audio غير موجود — لم تُفحص تغطية الصوت")

    # ٥. التقرير
    bundles = sum(by_theme.get(t, 0) // size for t in theme_ids) if size else 0
    print(f"البساتين: {len(themes)} | الكلمات: {len(words)} | الباقات: {bundles} "
          f"(من {size} كلمات) | نصوص الصوت المطلوبة: {len(audio_texts)} "
          f"(جاهز: {len(audio_texts & have)})")
    print("  " + " · ".join(f"{t.get('emoji', '')}{t.get('title', '?')}: "
                            f"{by_theme.get(t.get('id'), 0)}" for t in themes))

    if warnings and not quiet:
        print(f"\nتنبيهات ({len(warnings)}):")
        for w in warnings:
            print(f"  ! {w}")

    if errors:
        print(f"\nأخطاء المعجم ({len(errors)}):")
        for e in errors[:60]:
            print(f"  ✗ {e}")
        if len(errors) > 60:
            print(f"  … و{len(errors) - 60} خطأ آخر")
        return 1

    print("\n✓ المعجم مفكوك ١٠٠٪: كل كلمة وجملة داخل حصيلة الطفل، ومقاطعها مشتقّة لا مكتوبة.")
    return 0


# ————— كتابة المقاطع المشتقّة في الملف —————


def dump(data: dict) -> str:
    """كتابة الملف بسطر لكل كلمة — يبقى مقروءاً للعين ومقارَناً في git."""
    j = lambda v: json.dumps(v, ensure_ascii=False)
    lines = ["{"]
    for key, value in data.items():
        if key in ("themes", "words"):
            lines.append(f"  {j(key)}: [")
            rows = [f"    {j(v)}" for v in value]
            lines.append(",\n".join(rows))
            lines.append("  ],")
        else:
            lines.append(f"  {j(key)}: {j(value)},")
    lines[-1] = lines[-1].rstrip(",")
    lines.append("}")
    return "\n".join(lines) + "\n"


def fill_tiles(data: dict, letters: dict) -> int:
    changed = 0
    for entry in data.get("words", []):
        want = syllabify(entry.get("word", ""), letters)
        if entry.get("tiles") != want:
            entry["tiles"] = want
            changed += 1
    if changed:
        LEXICON.write_text(dump(data), encoding="utf-8")
    print(f"المقاطع المشتقّة: {changed} كلمة حُدِّثت من {len(data.get('words', []))}")
    return 0


# ————— فحص الفاحص —————


def self_test(letters: dict) -> int:
    """فاحص لا يفشل أبداً لا يحرس شيئاً — ومقطِّع لا يوافق المنهج لا يُوثَق به."""
    fails = 0

    def ok(cond, msg):
        nonlocal fails
        if not cond:
            fails += 1
        print(("  ✓ " if cond else "  ✗ ") + msg)

    # ١. المقطِّع مقيسٌ على المنهج نفسه: يعيد بناء مقاطع كلمات المجموعات السبع
    _letters, groups, _parts = parse_curriculum(CURRICULUM.read_text(encoding="utf-8"))
    curriculum_words = [w for g in groups for w in g["words"]]
    mismatch = [w["say"] for w in curriculum_words
                if syllabify("".join(w["tiles"]), letters) != w["tiles"]]
    ok(set(mismatch) <= {"زيت"},
       f"المقطِّع يوافق مقاطع المنهج في {len(curriculum_words) - len(mismatch)}"
       f"/{len(curriculum_words)} كلمة"
       + (f" — يخالف: {'، '.join(mismatch)}" if mismatch else ""))
    ok("زيت" not in mismatch or syllabify("زَيْتْ", letters) == ["زَيْ", "تْ"],
       "والاستثناء «زيت» وحده: لينُه مفصول في المنهج وموصول في «بيت» و«عين» "
       "(تفاوت في بيانات الجلسة ١ — انظر التقرير)")

    ok(syllabify("سُكَّرْ", letters) == ["سُ", "كْ", "كَ", "رْ"],
       f"والشدّة تُفكّ ساكناً فمتحرّكاً كدرسها: سُكَّرْ ← {'+'.join(syllabify('سُكَّرْ', letters))} "
       "(والساكن مقطع وحده كما في «كَ+لْ+بْ»)")
    ok(syllabify("شَجَرَةْ", letters) == ["شَ", "جَ", "رَةْ"],
       f"والتاء المربوطة تتبع ما قبلها: {'+'.join(syllabify('شَجَرَةْ', letters))}")
    ok(syllabify("مِمْحَاةْ", letters) == ["مِ", "مْ", "حَاةْ"],
       f"وتتبع حرف المدّ كذلك: {'+'.join(syllabify('مِمْحَاةْ', letters))}")
    ok(syllabify("خُبْزْ", letters) == ["خُ", "بْ", "زْ"],
       f"والساكن الصريح مقطع وحده: {'+'.join(syllabify('خُبْزْ', letters))}")
    ok(syllabify("مِفْتَاحْ", letters) == ["مِ", "فْ", "تَا", "حْ"],
       f"والمدّ يلتحق بحركته المجانسة: {'+'.join(syllabify('مِفْتَاحْ', letters))}")
    ok("".join(syllabify("جَدَّةْ", letters)) == spelled("جَدَّةْ", letters),
       "وتركيب المقاطع يعيد الكلمة متهجَّاةً")

    # ٢. الفاحص يمسك المخالفات
    theme = {"id": "t", "title": "بستان", "emoji": "🌳"}
    good = {"word": "مِفْتَاحْ", "tiles": ["مِ", "فْ", "تَا", "حْ"], "root": "فتح",
            "theme": "t", "emoji": "🔑", "sentence": "الْمِفْتَاحُ صَغِيرْ"}
    known = taught_words()

    def run(entry_patch=None, words=None):
        entry = {**good, **(entry_patch or {})}
        data = {"bundleSize": 1, "themes": [theme],
                "words": words if words is not None else [entry]}
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check(data, letters, known, quiet=True)
        return buf.getvalue()

    ok("«مِفْتَاحْ»]" not in run(), "كلمة سليمة لا يُسجَّل عليها خطأ")
    ok("ليس حرفاً معرَّفاً" in run({"word": "مِفْتَاپْ", "tiles": ["مِ", "فْ", "تَا", "پْ"]}),
       "وحرف خارج المنهج يُمسَك")
    ok("بلا حركة" in run({"word": "مِفْتَاح", "tiles": ["مِ", "فْ", "تَا", "ح"]}),
       "وكلمة ناقصة الشكل تُمسَك")
    ok("تخالف التقطيع" in run({"tiles": ["مِفْ", "تَاحْ"]}),
       "ومقاطع مكتوبة بيدٍ تخالف المقطِّع تُمسَك")
    ok("بلا «ال»" in run({"word": "الْمِفْتَاحْ", "tiles": syllabify("الْمِفْتَاحْ", letters)}),
       "وكلمة معرَّفة بـ«ال» تُمسَك")
    ok("درسها الطفل في المنهج" in run({"word": "بَابْ", "tiles": ["بَا", "بْ"], "root": "بوب",
                                       "sentence": "الْبَابُ كَبِيرْ"}),
       "وكلمة من كلمات المنهج تُمسَك (المعجم يوسّع لا يكرّر)")
    ok("لا تحوي الكلمة" in run({"sentence": "الْبَيْتُ كَبِيرْ"}),
       "وجملة مثال بلا كلمتها تُمسَك")
    ok("بلا حركة" in run({"sentence": "المفتاح صغير"}), "وجملة غير مشكولة تُمسَك")
    ok("جملة المثال" in run({"sentence": "مِفْتَاحْ"}), "وجملة أقصر من كلمتين تُمسَك")
    ok("حقول ناقصة" in run(words=[{"word": "مِفْتَاحْ"}]), "وحقل ناقص يُمسَك")
    ok("مكرَّرة" in run(words=[dict(good), dict(good)]), "وكلمة مكرَّرة تُمسَك")
    ok("مستعملة في" in run(words=[dict(good), {**good, "word": "مِصْبَاحْ", "root": "صبح",
                                               "tiles": ["مِ", "صْ", "بَا", "حْ"],
                                               "sentence": "الْمِصْبَاحُ مُنِيرْ"}]),
       "وصورة مكرَّرة في بستان تُمسَك (لا جواب صحيح في «اقرأ واختر»)")
    ok("موضوع مجهول" in run({"theme": "x"}), "وموضوع لا بستان له يُمسَك")
    ok("الجذر" in run({"root": "فت"}), "وجذر بحرفين يُمسَك")
    ok("بالسكون لا بالتنوين" in run({"word": "مِفْتَاحٌ", "tiles": syllabify("مِفْتَاحٌ", letters)}),
       "وكلمة منوَّنة في المعجم تُمسَك (الوقف بالسكون)")

    print(f"\n{fails} فشل" if fails else "\n✓ الفاحص والمقطِّع يمسكان المخالفات كلها")
    return 1 if fails else 0


def main():
    ap = argparse.ArgumentParser(description="فحص معجم «حديقة الكلمات»")
    ap.add_argument("-q", "--quiet", action="store_true", help="إخفاء التنبيهات")
    ap.add_argument("--fill-tiles", action="store_true",
                    help="اشتقاق المقاطع من الكلمات وكتابتها في الملف")
    ap.add_argument("--self-test", action="store_true", help="فحص الفاحص والمقطِّع")
    args = ap.parse_args()

    letters = taught_letters()
    if args.self_test:
        sys.exit(self_test(letters))
    data = load()
    if args.fill_tiles:
        sys.exit(fill_tiles(data, letters))
    sys.exit(check(data, letters, quiet=args.quiet))


if __name__ == "__main__":
    main()
