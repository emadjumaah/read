#!/usr/bin/env python3
"""توليد أيقونات التطبيق (PWA) بالتقاطها من tools/icon.html في Chrome — بلا أي تبعية.

    python3 tools/make_icons.py            # يولّد app/icons/*.png
    python3 tools/make_icons.py --check    # يتحقّق من وجودها وسلامتها بلا توليد

لماذا Chrome: المشروع بلا npm ولا مكتبات صور، وChrome موجود أصلاً لاختبارات الواجهة
(tools/browser_test.py) ويرسم العربية بخطوط النظام رسماً صحيحاً. الأيقونة مصدرها
`tools/icon.html` وحدها — فلا يُحرَّر ملف PNG يدوياً ولا يُفقَد أصله.

ملاحظة: هذه أصول رسومية لا صوت — قيد «لا تلمس app/audio/» لا يمسّها.
"""

import argparse
import http.server
import shutil
import socketserver
import struct
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
ICONS = ROOT / "app" / "icons"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# كل لقطة تُؤخذ بمقاس ٥١٢ (أصغر من ذلك تُهمله نافذة Chrome فتخرج بيضاء)،
# ثم تُصغَّر بـsips المرافق لـmacOS. (اسم الملف، المقاس، الهامش الآمن، حواف مستديرة، خلفية)
MASTER = 512
TARGETS = [
    ("icon-512.png", 512, 0.0, True, None),
    ("icon-192.png", 192, 0.0, True, None),
    ("maskable-512.png", 512, 0.20, False, "#f5a524"),
    ("apple-touch-icon.png", 180, 0.0, False, "#f5a524"),
]


def png_size(path: Path):
    """(العرض، الارتفاع) من ترويسة PNG — تحقّق بلا مكتبات."""
    data = path.read_bytes()[:24]
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", data[16:24])


def serve(port: int):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(TOOLS), **kw)

        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    return socketserver.TCPServer(("127.0.0.1", port), Handler)


def shoot(url: str, out: Path, size: int, profile: Path, timeout: int) -> bool:
    if out.exists():
        out.unlink()
    cmd = [CHROME, f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
           "--headless=new", "--disable-gpu", "--hide-scrollbars",
           "--default-background-color=00000000",
           f"--screenshot={out}", f"--window-size={size},{size}", url]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.time() + timeout
    while time.time() < deadline and not out.exists():
        time.sleep(0.3)
    time.sleep(0.4)          # مهلة كتابة الملف كاملاً
    proc.kill()
    return out.exists()


def check() -> int:
    missing = []
    for name, size, *_ in TARGETS:
        path = ICONS / name
        if not path.exists():
            missing.append(f"{name}: غير موجودة")
            continue
        dims = png_size(path)
        if dims != (size, size):
            missing.append(f"{name}: مقاسها {dims} والمطلوب ({size}, {size})")
    for line in missing:
        print("  ✗ " + line)
    if missing:
        print(f"\n{len(missing)} إخفاق — شغّل python3 tools/make_icons.py")
        return 1
    print(f"✓ أيقونات التطبيق كاملة ({len(TARGETS)} ملفاً بمقاساتها الصحيحة)")
    return 0


def main():
    ap = argparse.ArgumentParser(description="توليد أيقونات المُعلِّم")
    ap.add_argument("--port", type=int, default=8791)
    ap.add_argument("--timeout", type=int, default=40)
    ap.add_argument("--check", action="store_true", help="تحقّق فقط بلا توليد")
    args = ap.parse_args()

    if args.check:
        return check()

    if not Path(CHROME).exists():
        sys.exit(f"لم يُعثر على Chrome في {CHROME}")

    ICONS.mkdir(parents=True, exist_ok=True)
    server = serve(args.port)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = Path(tempfile.mkdtemp(prefix="muallim-icons-"))
    made = 0
    try:
        for name, size, pad, round_, bg in TARGETS:
            out = ICONS / name
            url = (f"http://127.0.0.1:{args.port}/icon.html"
                   f"?size={MASTER}&pad={pad}&round={'1' if round_ else '0'}"
                   + (f"&bg={bg.replace('#', '%23')}" if bg else ""))
            if not shoot(url, out, MASTER, profile, args.timeout):
                print(f"  ✗ {name} — تعذّرت اللقطة")
                continue
            if size != MASTER:
                subprocess.run(["sips", "-z", str(size), str(size), str(out), "--out", str(out)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            if png_size(out) != (size, size):
                print(f"  ✗ {name} — تعذّر التصغير إلى {size} (sips؟)")
                continue
            made += 1
            print(f"  ✓ {name} ({size}×{size})")
    finally:
        server.shutdown()
        shutil.rmtree(profile, ignore_errors=True)

    print(f"\n{made}/{len(TARGETS)} أيقونة في app/icons/")
    return 0 if made == len(TARGETS) else 1


if __name__ == "__main__":
    sys.exit(main())
