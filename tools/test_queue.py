#!/usr/bin/env python3
"""فحص تصريف قائمة الانتظار الصوتية (docs/AUDIO_QUEUE.md) بلا أي طلب شبكي.

    python3 tools/test_queue.py

يستبدل نداء Gemini بمولّد صامت، ويتحقّق من: الترتيب بالأولوية فالأقدمية،
احترام style_hint، تحديث الحالة إلى done مع التاريخ، دخول نصوص القائمة في الفهرس،
حفظ التقدّم بعد كل نصّ، وأن المنتظِر لا يُعدّ نقصاً في التحقّق الختامي.
"""

import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_audio as gen  # noqa: E402

PASS, FAIL = [], []


def ok(cond, label):
    (PASS if cond else FAIL).append(label)
    print(("  ✓ " if cond else "  ✗ ") + label)


def sandbox(entries):
    """بيئة معزولة: مجلد أصوات وقائمة مؤقتان بدل الحقيقيين."""
    tmp = Path(tempfile.mkdtemp())
    gen.OUT_DIR = tmp / "audio"
    gen.QUEUE_FILE = tmp / "audio_queue.json"
    gen.RECITATIONS_FILE = tmp / "recitations.json"   # لا تلاوات في البيئة المعزولة
    gen.QUEUE_FILE.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
    return tmp


def stub(calls, fail_on=None, quota_on=None, empty_on=()):
    def fake(text, style, *a, **k):
        calls.append((text, style))
        if text == quota_on:
            raise gen.QuotaExhausted(1234)
        if text in empty_on:
            raise gen.EmptyAudio("لا صوت في الاستجابة")
        if text == fail_on:
            raise gen.TTSError("خطأ مصطنع")
        return b"\x00\x01" * 24000, 24000
    gen.gemini_pcm = fake


def main():
    real_out, real_queue, real_tts = gen.OUT_DIR, gen.QUEUE_FILE, gen.gemini_pcm
    real_recit = gen.RECITATIONS_FILE

    # ————— ١. الترتيب والحالة والفهرس —————
    print("تصريف كامل:")
    tmp = sandbox([
        {"text": "الشَّمْس", "category": "word", "priority": 100, "status": "pending", "doneAt": None},
        {"text": "مَدّ", "category": "letter_name", "style_hint": "انطق ببطء شديد",
         "priority": 10, "status": "pending", "doneAt": None},
        {"text": "قَديم", "category": "word", "priority": 100, "status": "done", "doneAt": "2026-08-01"},
    ])
    calls = []
    stub(calls)
    failed = gen.drain_queue("m", "v", "k")
    queue = gen.load_queue()
    manifest = json.loads((gen.OUT_DIR / "manifest.json").read_text(encoding="utf-8"))
    curriculum = gen.parse_curriculum(gen.CURRICULUM.read_text(encoding="utf-8"))

    ok(failed == 0, "التصريف بلا فشل")
    ok([t for t, _ in calls] == ["مَدّ", "الشَّمْس"], "الترتيب: الأولوية الأصغر أولاً ثم الأقدمية")
    ok(calls[0][1].startswith("انطق ببطء شديد: "), "style_hint يسبق النص بدل افتراضي الفئة")
    ok(calls[1][1] == gen.STYLE["word"], "بلا style_hint: تعليمة الفئة الافتراضية")
    ok("قَديم" not in [t for t, _ in calls], "المُصرَّف سابقاً (done) لا يُعاد توليده")
    ok(all(e["status"] == "done" for e in queue), "كل مدخل صار done")
    ok(queue[1]["doneAt"] == gen.TODAY, "doneAt بتاريخ اليوم")
    ok((gen.OUT_DIR / f"{gen.key_for('مَدّ')}.mp3").exists(), "الملف كُتب باسم مفتاح النص")
    ok(manifest.get(gen.key_for("الشَّمْس")) == "الشَّمْس", "نصوص القائمة دخلت الفهرس")
    ok(len(manifest) == len(curriculum) + 3, f"الفهرس = المنهج + منجَز القائمة ({len(manifest)})")
    shutil.rmtree(tmp)

    # ————— ٢. التوقف على الحصة يحفظ ما سبق —————
    print("توقّف على نفاد الحصة:")
    tmp = sandbox([
        {"text": "أوّل", "category": "word", "priority": 1, "status": "pending", "doneAt": None},
        {"text": "ثانٍ", "category": "word", "priority": 2, "status": "pending", "doneAt": None},
        {"text": "ثالث", "category": "word", "priority": 3, "status": "pending", "doneAt": None},
    ])
    calls = []
    stub(calls, quota_on="ثانٍ")
    gen.drain_queue("m", "v", "k")
    queue = gen.load_queue()
    ok([e["status"] for e in queue] == ["done", "pending", "pending"],
       "ما قبل نفاد الحصة محفوظ done والباقي pending")
    ok(len(calls) == 2, "لا طلبات بعد نفاد الحصة (لا إحراق محاولات)")
    ok([e["text"] for _i, e in gen.queue_pending(queue)] == ["ثانٍ", "ثالث"],
       "التصريف التالي يستأنف من حيث توقّف")
    shutil.rmtree(tmp)

    # ————— ٣. نصّ فاشل يبقى منتظِراً، والتحقّق لا يعدّ المنتظِر نقصاً —————
    print("الفشل والتحقّق:")
    tmp = sandbox([
        {"text": "سليم", "category": "word", "priority": 1, "status": "pending", "doneAt": None},
        {"text": "عاطل", "category": "word", "priority": 2, "status": "pending", "doneAt": None},
    ])
    calls = []
    stub(calls, fail_on="عاطل")
    failed = gen.drain_queue("m", "v", "k")
    queue = gen.load_queue()
    ok(failed == 1, "الفشل يُحصى")
    ok([e["status"] for e in queue] == ["done", "pending"], "الفاشل يبقى منتظِراً للمحاولة القادمة")

    texts, pending = gen.expected_texts()
    ok("عاطل" in pending and "عاطل" not in texts, "المنتظِر خارج المتوقَّع وداخل قائمة الانتظار")
    problems = gen.verify({"سليم": "word"}, pending)
    ok(problems == 0, "التحقّق: وجود ملف المُصرَّف يكفي، والمنتظِر لا يُعدّ نقصاً ولا يتيماً")
    shutil.rmtree(tmp)

    # ————— ٤. سياسة النماذج الثلاثة: التوجيه بالمحتوى مع حفظ الوحدة الذرية —————
    print("توجيه النماذج:")
    entries = [
        {"text": "جملة طويلة فيها شرح قاعدة.", "category": "sentence", "requestedBy": "session-4"},
        {"text": "سُكَّرْ", "category": "word", "requestedBy": "session-4"},
        {"text": "سُكْ كَرْ", "category": "syllable", "requestedBy": "session-4"},
        {"text": "مَاءْ", "category": "word", "requestedBy": "session-6"},
        {"text": "غُرْفَةْ", "category": "word", "requestedBy": "session-7"},
        {"text": "فَةْ", "category": "syllable", "requestedBy": "session-7"},
        {"text": "زَيْ", "category": "syllable", "requestedBy": "manager", "priority": 10},
        {"text": "بَابٌ", "category": "word", "requestedBy": "session-4"},
    ]
    route = gen.route_model

    ok(route(entries[0], True) == gen.MODEL_SENTENCE, "الجملة الطويلة ← 2.5-pro")
    ok(route(entries[6], True) == gen.MODEL_CORE, "أولوية ≤١٠ (إصلاح مسموع) ← نموذج النواة")
    ok(route(entries[2], True) == route(entries[5], True) == gen.MODEL_CORE,
       "كل المقاطع على 3.1 أياً كان مصدرها (معجم أو غيره)")
    ok(route({"text": "بً", "category": "letter_haraka", "requestedBy": "session-7"}, True)
       == gen.MODEL_CORE, "الحرف بحركته على 3.1 كذلك — 2.5 عاجز عن القصير")
    ok(route(entries[1], True) == route(entries[4], True) == gen.MODEL_LEXICON,
       "الكلمة الكاملة (معجماً كانت أو غيره) ← 2.5-flash بعد الإجازة")
    ok(route(entries[3], True) == gen.MODEL_LEXICON, "الكلمة الإملائية المفردة ← 2.5-flash")
    ok(route(entries[4], False) == "" and route(entries[5], False) == gen.MODEL_CORE,
       "قبل الإجازة: الكلمة محبوسة والمقطع يمضي على 3.1")
    ok(route({"text": "س", "category": "word", "model": "x-model"}, True) == "x-model",
       "التعيين الصريح في المدخل يعلو على القاعدة")
    ok(route(entries[1], True) != route(entries[2], True),
       "الذرّية بصيغتها المعدَّلة: المقاطع موحّدة على 3.1 والكلمة على 2.5")

    # ————— ٥. نفاد حصة نموذج لا يوقف الآخرين —————
    print("استقلال الحصص:")
    tmp = sandbox([
        {"text": "جملة أولى طويلة.", "category": "sentence", "requestedBy": "session-4",
         "priority": 100, "status": "pending", "doneAt": None},
        {"text": "جملة ثانية طويلة.", "category": "sentence", "requestedBy": "session-4",
         "priority": 100, "status": "pending", "doneAt": None},
        {"text": "قِطَارْ", "category": "story_word", "requestedBy": "session-4",
         "priority": 100, "status": "pending", "doneAt": None},
    ])
    calls = []
    stub(calls, quota_on="جملة أولى طويلة.")
    gen.drain_queue(None, "Sulafat", "k")
    queue = gen.load_queue()
    done = {e["text"]: e.get("model") for e in queue if e["status"] == "done"}
    ok("قِطَارْ" in done, "نفاد حصة 2.5-pro لم يوقف تصريف نموذج آخر")
    ok(all(e["status"] == "pending" for e in queue if e["category"] == "sentence"),
       "جمل النموذج الذي نفدت حصته تبقى منتظِرة")
    ok(len([t for t, _ in calls if t.startswith("جملة")]) == 1,
       "لا محاولة ثانية على النموذج الذي نفدت حصته")
    ok(done.get("قِطَارْ") == gen.MODEL_LEXICON, "النموذج المستعمل يُسجَّل في المدخل")
    shutil.rmtree(tmp)

    # ————— ٥ب. الكتابة دمجٌ لا استبدال: إضافات جلسة أخرى أثناء التصريف تبقى —————
    print("الدمج أثناء التصريف:")
    tmp = sandbox([
        {"text": "أَوَّلْ", "category": "story_word", "requestedBy": "session-4",
         "priority": 1, "status": "pending", "doneAt": None},
        {"text": "ثَانْ", "category": "story_word", "requestedBy": "session-4",
         "priority": 2, "status": "pending", "doneAt": None},
    ])
    calls = []

    def racing(text, style, *a, **k):
        """تحاكي جلسة تطوير تُضيف نصوصاً إلى الملف بينما التصريف جارٍ."""
        calls.append(text)
        if len(calls) == 1:
            disk = gen.load_queue()
            disk.append({"text": "وَافِدْ", "category": "story_word", "requestedBy": "session-8",
                         "priority": 100, "status": "pending", "doneAt": None})
            gen.save_queue(disk)
        return b"\x00\x01" * 24000, 24000

    gen.gemini_pcm = racing
    gen.drain_queue(None, "Sulafat", "k")
    after = gen.load_queue()
    texts = [e["text"] for e in after]
    ok("وَافِدْ" in texts, "النصّ الذي أُضيف أثناء التصريف لم يُمحَ (الدمج بدل الاستبدال)")
    ok(len(after) == 3, f"لا فقدان ولا تكرار في الملف ({len(after)} مدخلات)")
    ok([e["status"] for e in after[:2]] == ["done", "done"], "والمصروف سُجِّل done كالمعتاد")
    ok(gen.load_queue()[2]["status"] == "pending", "والوافد الجديد يبقى منتظِراً لجولة تالية")
    shutil.rmtree(tmp)

    # ————— ٦. نموذج بدأ يردّ بلا صوت: يُنحّى بدل حرق بقية حصته —————
    print("صون الحصة من الاستجابات الفارغة:")
    words = ["أَلِفْ", "بَاءْ", "تَاءْ", "ثَاءْ", "جِيمْ"]
    tmp = sandbox([{"text": w, "category": "story_word", "requestedBy": "session-4",
                    "priority": 100, "status": "pending", "doneAt": None} for w in words])
    calls = []
    stub(calls, empty_on=set(words))
    gen.drain_queue(None, "Sulafat", "k")
    ok(len(calls) == gen.EMPTY_STREAK_LIMIT,
       f"يتوقف بعد {gen.EMPTY_STREAK_LIMIT} استجابات فارغة متتابعة ({len(calls)} طلباً لا {len(words)})")
    ok(all(e["status"] == "pending" for e in gen.load_queue()),
       "كلها تبقى منتظِرة لجولة أخرى")
    shutil.rmtree(tmp)

    gen.OUT_DIR, gen.QUEUE_FILE, gen.gemini_pcm = real_out, real_queue, real_tts
    gen.RECITATIONS_FILE = real_recit
    print(f"\n{len(PASS)}/{len(PASS) + len(FAIL)} تحقّقاً ناجحاً")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
