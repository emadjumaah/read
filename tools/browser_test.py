#!/usr/bin/env python3
"""تشغيل اختبارات الواجهة في متصفّح حقيقي (Chrome بلا واجهة) بلا أي تبعيات.

    python3 tools/browser_test.py              # يسوق التطبيق ويطبع التقرير
    python3 tools/browser_test.py --shots out.png   # لقطة لخطوات الدرس للمراجعة البصرية
    python3 tools/browser_test.py --show       # بمتصفّح مرئي لتتبّع ما يجري

كيف يعمل: خادم صغير يخدم مجلد app/ ويضيف مسارين للاختبار فقط
(/__test.html و/__shots.html من هذا المجلد) ويستقبل النتيجة بـPOST /result،
فلا تبقى في app/ صفحة اختبار تُخدَم للطفل.

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
PAGES = {"/__test.html": TOOLS / "browser_test.html", "/__shots.html": TOOLS / "browser_shots.html"}
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
    ap.add_argument("--shots", metavar="PNG", help="لقطة لخطوات الدرس بدل تشغيل الاختبارات")
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
            proc = run_chrome(f"{base}/__shots.html?dev=1", profile,
                              [f"--screenshot={out}", "--window-size=980,2650", "--hide-scrollbars"],
                              args.show)
            deadline = time.time() + args.timeout
            while time.time() < deadline and not out.exists():
                time.sleep(0.5)
            proc.kill()
            print(f"اللقطة: {out}" if out.exists() else "تعذّرت اللقطة")
            return 0 if out.exists() else 1

        proc = run_chrome(f"{base}/__test.html", profile, ["--hide-scrollbars"], args.show)
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
