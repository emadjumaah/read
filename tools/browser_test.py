#!/usr/bin/env python3
"""تشغيل اختبارات الواجهة في متصفّح حقيقي (Chrome بلا واجهة) بلا أي تبعيات.

    python3 tools/browser_test.py              # درس الحرف: يسوق التطبيق ويطبع التقرير
    python3 tools/browser_test.py --words      # لعبة تركيب الكلمات (المجموعات السبع)
    python3 tools/browser_test.py --review     # المراجعة اليومية ولوحة وليّ الأمر
    python3 tools/browser_test.py --shots out.png [--words|--review]   # لقطة للمراجعة البصرية
    python3 tools/browser_test.py --show       # بمتصفّح مرئي لتتبّع ما يجري

كيف يعمل: خادم صغير يخدم مجلد app/ ويضيف صفحات الاختبار وحدها من هذا المجلد
(/__test.html و/__shots.html و/__words.html و/__words_shots.html و/__review.html
و/__review_shots.html) ويستقبل النتيجة بـPOST /result، فلا تبقى في app/ صفحة اختبار
تُخدَم للطفل.

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
}
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def make_server(port: int, results: list):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(APP), **kw)

        def do_GET(self):
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
    ap.add_argument("--timeout", type=int, default=90, help="ثوانٍ قبل الاستسلام")
    ap.add_argument("--shots", metavar="PNG", help="لقطة للمراجعة البصرية بدل تشغيل الاختبارات")
    ap.add_argument("--words", action="store_true", help="لعبة تركيب الكلمات بدل درس الحرف")
    ap.add_argument("--review", action="store_true", help="المراجعة اليومية ولوحة وليّ الأمر")
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
            page, size = (("__review_shots.html", "1100,3050") if args.review
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

        page = "__review.html" if args.review else "__words.html" if args.words else "__test.html"
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
