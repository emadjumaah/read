#!/usr/bin/env python3
"""تشغيل اختبارات الواجهة في متصفّح حقيقي (Chrome بلا واجهة) بلا أي تبعيات.

    python3 tools/browser_test.py              # درس الحرف: يسوق التطبيق ويطبع التقرير
    python3 tools/browser_test.py --words      # لعبة تركيب الكلمات (المجموعات السبع)
    python3 tools/browser_test.py --review     # المراجعة اليومية ولوحة وليّ الأمر
    python3 tools/browser_test.py --story      # دروس المهارات وشاشة قراءة القصص
    python3 tools/browser_test.py --quran      # المرحلة القرآنية والعمل دون إنترنت
    python3 tools/browser_test.py --garden     # بساتين الموضوعات (حديقة الكلمات)
    python3 tools/browser_test.py --sentences  # سلّم الجمل (المرحلة ج)
    python3 tools/browser_test.py --shots out.png [--words|--review|--story|--quran|--garden|--sentences]
    python3 tools/browser_test.py --show       # بمتصفّح مرئي لتتبّع ما يجري

كيف يعمل: خادم صغير يخدم مجلد app/ ويضيف صفحات الاختبار وحدها من هذا المجلد
(/__test.html و/__shots.html و/__words.html و/__words_shots.html و/__review.html
و/__review_shots.html و/__story.html و/__story_shots.html) ويستقبل النتيجة بـPOST /result،
فلا تبقى في app/ صفحة اختبار تُخدَم للطفل. ويخدم /__queue.json (نصوص قائمة الانتظار
الصوتية) كي تستثنيها الصفحات من فحص «لا لجوء للنطق الآلي».

ملاحظة: --dump-dom و--virtual-time-budget غير موثوقين مع fetch والصوت،
لذلك تُرسَل النتائج من الصفحة نفسها ثم يُقتل المتصفّح.
"""

import argparse
import http.server
import json
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
TOOLS = Path(__file__).resolve().parent
PAGES = {
    "/__test.html": TOOLS / "browser_test.html",
    "/__shots.html": TOOLS / "browser_shots.html",
    "/__words.html": TOOLS / "browser_words.html",
    "/__words_shots.html": TOOLS / "browser_words_shots.html",
    "/__review.html": TOOLS / "browser_review.html",
    "/__review_shots.html": TOOLS / "browser_review_shots.html",
    "/__story.html": TOOLS / "browser_story.html",
    "/__story_shots.html": TOOLS / "browser_story_shots.html",
    "/__quran.html": TOOLS / "browser_quran.html",
    "/__quran_shots.html": TOOLS / "browser_quran_shots.html",
    "/__garden.html": TOOLS / "browser_garden.html",
    "/__garden_shots.html": TOOLS / "browser_garden_shots.html",
    "/__sentences.html": TOOLS / "browser_sentences.html",
    "/__sentences_shots.html": TOOLS / "browser_sentences_shots.html",
}
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
QUEUE_FILE = ROOT / "tools" / "audio_queue.json"


def pending_texts() -> list:
    """النصوص المنتظِرة في قائمة الانتظار الصوتية (docs/AUDIO_QUEUE.md).

    صفحات الاختبار تستثنيها من فحص «لا لجوء للنطق الآلي»: لا ملف لها بعدُ لأن
    جلسة الصوتيات لم تصرّفها، فاحتياط النطق هو السلوك الصحيح مؤقتاً — وبعد التصريف
    تفرغ القائمة فيعود الفحص صارماً على كل نصّ بلا تعديل في الصفحات.
    """
    if not QUEUE_FILE.exists():
        return []
    try:
        data = json.loads(QUEUE_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    return [e["text"] for e in data
            if isinstance(e, dict) and e.get("text") and e.get("status", "pending") != "done"]


def make_server(port: int, results: list):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(APP), **kw)

        def do_GET(self):
            if self.path.split("?")[0] == "/__queue.json":
                body = json.dumps(pending_texts(), ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            page = PAGES.get(self.path.split("?")[0])
            if page:
                body = page.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

        def do_POST(self):
            raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            try:
                results[:] = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError:
                pass
            self.send_response(204)
            self.end_headers()

        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    return socketserver.TCPServer(("127.0.0.1", port), Handler)


def run_chrome(url: str, profile: Path, extra: list, show: bool):
    if not Path(CHROME).exists():
        sys.exit(f"لم يُعثر على Chrome في {CHROME}")
    cmd = [CHROME, f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check"]
    if not show:
        cmd += ["--headless=new", "--disable-gpu"]
    cmd += extra + [url]
    return subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8790)
    ap.add_argument("--timeout", type=int, default=140, help="ثوانٍ قبل الاستسلام")
    ap.add_argument("--shots", metavar="PNG", help="لقطة للمراجعة البصرية بدل تشغيل الاختبارات")
    ap.add_argument("--words", action="store_true", help="لعبة تركيب الكلمات بدل درس الحرف")
    ap.add_argument("--review", action="store_true", help="المراجعة اليومية ولوحة وليّ الأمر")
    ap.add_argument("--story", action="store_true", help="دروس المهارات وشاشة قراءة القصص")
    ap.add_argument("--quran", action="store_true", help="المرحلة القرآنية والعمل دون إنترنت")
    ap.add_argument("--garden", action="store_true", help="بساتين الموضوعات (حديقة الكلمات)")
    ap.add_argument("--sentences", action="store_true", help="سلّم الجمل (المرحلة ج)")
    ap.add_argument("--show", action="store_true", help="متصفّح مرئي")
    args = ap.parse_args()

    results = []
    server = make_server(args.port, results)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="muallim-chrome-"))
    base = f"http://127.0.0.1:{args.port}"

    try:
        if args.shots:
            out = Path(args.shots).resolve()
            out.unlink(missing_ok=True)   # وإلا لعُدَّت لقطةُ تشغيلٍ سابق نجاحاً فوريّاً
            page, size = (("__sentences_shots.html", "1100,3400") if args.sentences
                          else ("__review_shots.html", "1100,3050") if args.review
                          else ("__garden_shots.html", "1100,5200") if args.garden
                          else ("__quran_shots.html", "1100,9400") if args.quran
                          else ("__story_shots.html", "1100,5400") if args.story
                          else ("__words_shots.html", "980,2100") if args.words
                          else ("__shots.html", "980,2650"))
            proc = run_chrome(f"{base}/{page}?dev=1", profile,
                              [f"--screenshot={out}", f"--window-size={size}", "--hide-scrollbars"],
                              args.show)
            deadline = time.time() + args.timeout
            while time.time() < deadline and not out.exists():
                time.sleep(0.5)
            proc.kill()
            print(f"اللقطة: {out}" if out.exists() else "تعذّرت اللقطة")
            return 0 if out.exists() else 1

        page = ("__review.html" if args.review else "__story.html" if args.story
                else "__quran.html" if args.quran else "__garden.html" if args.garden
                else "__sentences.html" if args.sentences
                else "__words.html" if args.words else "__test.html")
        proc = run_chrome(f"{base}/{page}", profile, ["--hide-scrollbars"], args.show)
        deadline = time.time() + args.timeout
        while time.time() < deadline:
            time.sleep(0.5)
            if results and results[-1].get("msg", "").startswith(("لا أخطاء جافاسكربت", "استثناء", "انتهت المهلة")):
                break
        proc.kill()
    finally:
        server.shutdown()
        shutil.rmtree(profile, ignore_errors=True)

    if not results:
        print("لم تصل أي نتيجة من المتصفّح (تحقّق من تشغيل Chrome).")
        return 1

    failed = [r for r in results if not r["ok"]]
    for r in results:
        print(("  ✓ " if r["ok"] else "  ✗ ") + r["msg"])
    print(f"\n{len(results) - len(failed)}/{len(results)} تحقّقاً ناجحاً"
          + (f" — {len(failed)} إخفاق" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
