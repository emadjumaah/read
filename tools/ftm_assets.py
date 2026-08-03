#!/usr/bin/env python3
"""جرد أصوات «Feed the Monster» العربية ومطابقتها بنواقصنا — **بلا أي حصة TTS**.

    python3 tools/ftm_assets.py --inventory     # تقرير التغطية (بلا تنزيل)
    python3 tools/ftm_assets.py --audition      # تنزيل المطابِق + صفحة معاينة

**الاستيراد مغلق بقرار المالك والمدير (٤ أغسطس ٢٠٢٦)** — تبقى الأداة للتوثيق:
«وحدة الصوت داخل الفئة المعروضة معاً مقدَّمة على بشرية متفرقة» (docs/AUDIO_QUEUE.md).

المصدر: <https://github.com/curiouslearning/ftm-languagepacks> — حزمة `ARABIC`،
وترخيصه المعلن **BSD-2-Clause** (لا CC-BY). ولا إسناد له عندنا: لم نستعمل منه شيئاً.

المطابقة **محافِظة**: أسماء ملفات FTM هي النصّ العربي نفسه، لكنها في المدود غير
مشكولة (`با` لا `بَا`). فيُطابَق نصّنا المشكول بنظيره غير المشكول **للمدود وحدها**
(حرفان فأكثر)، ولا يُطابَق الحرف المفرد أبداً: ملف `ب.mp3` عند FTM صوتُ الحرف
مجرّداً لا اسمُه ولا هو بحركة، فمطابقته بنصّ «بَ» أو «باء» تعليمٌ خاطئ.
"""

import argparse
import hashlib
import json
import re
import shutil
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURRICULUM = ROOT / "app" / "js" / "curriculum.js"
OUT_DIR = ROOT / "app" / "audio"
WORK = ROOT / "scratch" / "ftm"
AUDITION = ROOT / "scratch" / "ftm_audition"

REPO = "curiouslearning/ftm-languagepacks"
BRANCH = "master"
RAW = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}"
PACK = "ARABIC"
SOUND_DIRS = ("letters", "words")

HARAKAT = {"fatha": "َ", "kasra": "ِ", "damma": "ُ"}
MADD = [("fatha", "ا"), ("kasra", "ي"), ("damma", "و")]
DIACRITICS = "ًٌٍَُِّْ"

def key_for(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def bare(text: str) -> str:
    return "".join(c for c in text if c not in DIACRITICS)


def get(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "muallim-ftm/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        dest.write_bytes(r.read())
    return dest


def api_tree(path: str, cache: str) -> list:
    url = f"https://api.github.com/repos/{REPO}/git/trees/{BRANCH}:{urllib.parse.quote(path)}"
    return json.loads(get(url, WORK / cache).read_text(encoding="utf-8")).get("tree", [])


# ————————————————————————— ما نحتاجه —————————————————————————

def our_letters() -> dict:
    src = CURRICULUM.read_text(encoding="utf-8")
    return {m.group(1): m.group(2)
            for m in re.finditer(r"'(.)':\s*\{\s*name:\s*'([^']+)'", src)}


def our_needs() -> dict:
    """نصّ ← نوعه، لما ما زال على صوت مولَّد (أي ما لم يُستورد له تسجيل بشري)."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import generate_audio as gen  # noqa: PLC0415

    needs = {}
    for ch in our_letters():
        for haraka, letter in MADD:
            needs[ch + HARAKAT[haraka] + letter] = "madd"
    texts, pending = gen.expected_texts()
    for t, cat in {**texts, **pending}.items():
        if t in needs:
            continue
        needs[t] = {"word": "word", "story_word": "word", "syllable": "syllable",
                    "letter_haraka": "haraka", "letter_name": "name",
                    "sentence": "sentence"}.get(cat, cat)
    return needs


# ————————————————————————— ما تملكه FTM —————————————————————————

def ftm_index() -> dict:
    """نصّ الملف (كما سُمّي) ← مساره في المستودع."""
    index = {}
    for sub in SOUND_DIRS:
        for t in api_tree(f"{PACK}/sounds/{sub}", f"tree_{sub}.json"):
            name = t["path"]
            if name.lower().endswith((".mp3", ".wav", ".ogg")):
                index.setdefault(Path(name).stem, f"{PACK}/sounds/{sub}/{name}")
    return index


def match(needs: dict, index: dict) -> list:
    """مطابقة محافِظة: المشكول بالمشكول، والمدّ بغير المشكول — ولا حرف مفرد أبداً."""
    out = []
    for text, kind in needs.items():
        path = index.get(text)
        how = "مطابقة حرفية"
        if not path and len(bare(text)) >= 2:
            path = index.get(bare(text))
            how = "بلا تشكيل (المدّ)"
        if not path and kind == "word" and text.endswith("ْ"):
            path = index.get(bare(text[:-1])) or index.get(text[:-1])
            how = "بلا سكون الوقف"
        if path:
            out.append({"text": text, "kind": kind, "source": path, "how": how})
    return out


# ————————————————————————— التقرير والمعاينة —————————————————————————

def report(needs: dict, hits: list) -> dict:
    by_kind = {}
    for text, kind in needs.items():
        by_kind.setdefault(kind, [0, 0])[1] += 1
    for h in hits:
        by_kind[h["kind"]][0] += 1
    print(f"جرد FTM (حزمة {PACK}) مقابل نواقصنا:\n")
    for kind, (got, need) in sorted(by_kind.items(), key=lambda x: -x[1][0]):
        if not got and kind in ("sentence",):
            continue
        bar = "█" * round(12 * got / need) + "·" * (12 - round(12 * got / need))
        print(f"  {kind:<10} {got:>4}/{need:<5} {bar}")
    madd = [h for h in hits if h["kind"] == "madd"]
    have = {h["text"] for h in madd}
    missing = [t for t, k in needs.items() if k == "madd" and t not in have]
    print(f"\n  المدود: {len(madd)}/84 موجودة — الناقص {len(missing)}:")
    print("   ", " ".join(missing[:30]), "…" if len(missing) > 30 else "")
    return {"madd_have": sorted(have), "madd_missing": missing}


def build_audition(hits: list) -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import import_recordings as imp  # noqa: PLC0415

    AUDITION.mkdir(parents=True, exist_ok=True)
    rows = []
    for h in hits:
        src = WORK / "src" / f"{key_for(h['text'])}{Path(h['source']).suffix}"
        try:
            get(f"{RAW}/{urllib.parse.quote(h['source'])}", src)
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {h['text']}: {e}", file=sys.stderr)
            continue
        ftm_mp3 = AUDITION / f"ftm__{key_for(h['text'])}.mp3"
        if not ftm_mp3.exists():
            if src.suffix.lower() == ".mp3":
                shutil.copy2(src, ftm_mp3)         # المتصفّح يشغّل mp3 كما هي — لا تحويل
            else:
                try:
                    samples, rate = imp.load(src)
                    cut = imp.trim_and_normalize(samples, rate)
                    imp.gen.pcm_to_mp3(imp.to_bytes(cut), rate, ftm_mp3)
                except Exception as e:  # noqa: BLE001
                    print(f"  ✗ تحويل {h['text']}: {e}", file=sys.stderr)
                    continue
        ours = OUT_DIR / f"{key_for(h['text'])}.mp3"
        ours_name = ""
        if ours.exists():
            ours_name = f"ours__{key_for(h['text'])}.mp3"
            shutil.copy2(ours, AUDITION / ours_name)
        rows.append({**h, "ftm": ftm_mp3.name, "ours": ours_name})
    write_page(rows)
    (WORK / "matched.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1),
                                       encoding="utf-8")
    print(f"\nصفحة المعاينة: {AUDITION / 'index.html'} ({len(rows)} نصاً)")
    print(f"افتحها: .venv/bin/python -m http.server 8050 -d {AUDITION} → http://127.0.0.1:8050/")
    return 0 if rows else 1


def write_page(rows) -> None:
    groups = {}
    for r in rows:
        groups.setdefault(r["kind"], []).append(r)
    titles = {"madd": "المدود (بَا بِي بُو)", "haraka": "الحرف بحركته",
              "word": "كلمات", "syllable": "مقاطع", "name": "أسماء حروف"}
    blocks = []
    for kind, items in sorted(groups.items(), key=lambda x: -len(x[1])):
        cells = "".join(
            f'<tr><th>{r["text"]}</th>'
            f'<td><button data-src="{r["ftm"]}">▶ FTM</button></td>'
            + (f'<td><button class="ours" data-src="{r["ours"]}">▶ Sulafat</button></td>'
               if r["ours"] else '<td class="miss">لا ملف عندنا</td>')
            + f'<td class="how">{r["how"]}</td></tr>' for r in items)
        blocks.append(f'<h2>{titles.get(kind, kind)} <small>({len(items)})</small></h2>'
                      f'<table><tbody>{cells}</tbody></table>')
    html = f"""<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>معاينة أصوات Feed the Monster مقابل أصواتنا</title>
<style>
 body {{ font-family:"Noto Naskh Arabic","Geeza Pro",serif; margin:2rem; background:#faf7f2; color:#241f1a }}
 h1 {{ font-size:1.35rem }} h2 {{ font-size:1.05rem; margin-top:1.6rem }}
 h2 small {{ color:#8a7a66; font-weight:normal }}
 p.note {{ background:#fff3d6; padding:.8rem 1rem; border-radius:.6rem; max-width:54rem; line-height:1.9 }}
 table {{ border-collapse:collapse; margin-top:.5rem }}
 th, td {{ border:1px solid #ddd2c2; padding:.4rem .7rem; background:#fff; text-align:center }}
 th {{ background:#f0e8db; font-size:1.25rem; min-width:5rem }}
 button {{ font-family:inherit; font-size:.95rem; padding:.35rem .8rem; cursor:pointer;
           border:1px solid #c9bba6; border-radius:.45rem; background:#fdfaf4 }}
 button.ours {{ background:#eef3fb; border-color:#a9bcd6 }}
 button.playing {{ background:#2f7d4f; color:#fff }}
 td.miss {{ color:#a1937f; font-size:.85rem }}
 td.how {{ color:#8a7a66; font-size:.72rem; font-family:system-ui }}
</style></head><body>
<h1>أصوات Feed the Monster مقابل أصواتنا</h1>
<p class="note">تسجيلات بشرية من حزمة العربية في <strong>Feed the Monster</strong> بجوار ملفاتنا الحالية.
<br><strong>انتبه في المدود</strong>: ملفات FTM غير مشكولة (<span dir="rtl">با</span>) ونصُّنا مشكول (<span dir="rtl">بَا</span>) —
فالمطلوب حكمك: أيؤدّي التسجيلُ المدَّ الطبيعيَّ حركتين كما نعلّمه؟
<br>لا يُستبدل شيء قبل إجازتك.</p>
{"".join(blocks)}
<script>
let cur = null, btn = null;
document.addEventListener('click', (e) => {{
  const b = e.target.closest('button[data-src]'); if (!b) return;
  if (cur) cur.pause();
  if (btn) btn.classList.remove('playing');
  cur = new Audio(b.dataset.src); btn = b; b.classList.add('playing');
  cur.onended = () => b.classList.remove('playing');
  cur.play();
}});
</script></body></html>"""
    (AUDITION / "index.html").write_text(html, encoding="utf-8")


POLICY = """قرار المالك والمدير (٤ أغسطس ٢٠٢٦): **لا استيراد من FTM إطلاقاً.**
القاعدة المعتمدة: «وحدة الصوت داخل الفئة المعروضة معاً مقدَّمة على بشرية متفرقة» —
وتغطية FTM متفرقة (٢٣ مدّاً من ٨٤، و٤١ حركة من ١٠٤) داخل فئتين تُسمعان متجاورتين،
فاختلاف الصوت داخل التمرين أضرُّ من مسحةٍ مولَّدة متجانسة. انظر docs/AUDIO_QUEUE.md.

ولذلك لا إسناد لـFTM في CREDITS.md: لا يُسند ما لم يُستعمل.
الفجوة تُسدّ توليدياً:  tools/generate_audio.py --madd-batch"""


def approve(_kinds: list) -> int:
    """الاستيراد مغلق بقرارٍ مثبَّت — يبقى الجرد والمعاينة للتوثيق وحدهما."""
    print(POLICY, file=sys.stderr)
    return 2


def main():
    ap = argparse.ArgumentParser(description="أصوات Feed the Monster")
    ap.add_argument("--inventory", action="store_true")
    ap.add_argument("--audition", action="store_true")
    ap.add_argument("--approve", action="store_true")
    ap.add_argument("--kinds", default="")
    args = ap.parse_args()

    kinds = [k.strip() for k in args.kinds.split(",") if k.strip()]
    if args.approve:
        return approve(kinds)

    WORK.mkdir(parents=True, exist_ok=True)
    needs = our_needs()
    hits = match(needs, ftm_index())
    summary = report(needs, hits)
    (WORK / "coverage.json").write_text(json.dumps(
        {"summary": summary, "hits": hits}, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.audition:
        return build_audition(hits)
    return 0


if __name__ == "__main__":
    sys.exit(main())
