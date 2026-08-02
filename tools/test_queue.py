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
    gen.QUEUE_FILE.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
    return tmp


def stub(calls, fail_on=None, quota_on=None):
    def fake(text, style, *a, **k):
        calls.append((text, style))
        if text == quota_on:
            raise gen.QuotaExhausted(1234)
        if text == fail_on:
            raise gen.TTSError("خطأ مصطنع")
        return b"\x00\x01" * 24000, 24000
    gen.gemini_pcm = fake


def main():
    real_out, real_queue, real_tts = gen.OUT_DIR, gen.QUEUE_FILE, gen.gemini_pcm

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

    gen.OUT_DIR, gen.QUEUE_FILE, gen.gemini_pcm = real_out, real_queue, real_tts
    print(f"\n{len(PASS)}/{len(PASS) + len(FAIL)} تحقّقاً ناجحاً")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
