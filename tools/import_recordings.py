#!/usr/bin/env python3
"""استيراد تسجيلات بشرية إلى app/audio/ مكان الأصوات المولَّدة.

    python3 tools/import_recordings.py ~/rec              # يستورد ما طابق
    python3 tools/import_recordings.py ~/rec --dry-run    # عرض ما سيحدث فقط
    python3 tools/import_recordings.py ~/rec --keep-generated   # بلا نسخ احتياطي

المطابقة باسم الملف: إمّا مفتاح النصّ (<key>.wav) كما تنتجه tools/recording_list.py،
وإمّا النصّ العربي نفسه (سلام.wav). المعالجة: تحويل إلى أحادي ١٦-بت، قصّ الصمت من
الطرفين مع هامش قصير، تطبيع الذروة، ثم mp3 باسم المفتاح — فلا تتغيّر شيفرة التطبيق
ولا الفهرس، ويكفي استيراد بعض الملفات (البقية تبقى مولَّدة).

WAV يُعالَج ببايثون وحده؛ الصيغ الأخرى (mp3/m4a/…) تحتاج ffmpeg لفكّ ترميزها.
"""

import argparse
import array
import shutil
import subprocess
import sys
import unicodedata
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_audio as gen  # noqa: E402

MP3_RATES = {8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000}
SILENCE_RATIO = 0.02      # ٢٪ من الذروة يُعدّ صمتاً
PAD_MS = 60               # هامش يبقى قبل الصوت وبعده
TARGET_PEAK = 0.94        # تطبيع الذروة دون قصّ
AUDIO_EXT = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".aiff", ".aif", ".caf"}


# ————————————————————————— قراءة الصوت —————————————————————————

def read_wav(path: Path) -> tuple[array.array, int]:
    """WAV ← (عيّنات ١٦-بت أحادية، معدّل العيّنات) ببايثون وحدها."""
    with wave.open(str(path), "rb") as w:
        channels, width, rate, frames = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(frames)
    if width == 2:
        samples = array.array("h")
        samples.frombytes(raw)
        if sys.byteorder == "big":
            samples.byteswap()
    elif width == 1:                                  # 8-bit غير مُوقَّع
        samples = array.array("h", ((b - 128) << 8 for b in raw))
    else:
        raise ValueError(f"عمق {width * 8} بت غير مدعوم ببايثون — ثبّت ffmpeg أو صدّر ١٦ بت")
    if channels > 1:                                  # خلط القنوات إلى أحادي
        mono = array.array("h", (0 for _ in range(len(samples) // channels)))
        for i in range(len(mono)):
            chunk = samples[i * channels:(i + 1) * channels]
            mono[i] = sum(chunk) // channels
        samples = mono
    return samples, rate


def read_via_ffmpeg(path: Path, rate: int = 24000) -> tuple[array.array, int]:
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1",
         "-ar", str(rate), "pipe:1"],
        check=True, stdout=subprocess.PIPE,
    ).stdout
    samples = array.array("h")
    samples.frombytes(out)
    if sys.byteorder == "big":
        samples.byteswap()
    return samples, rate


def load(path: Path) -> tuple[array.array, int]:
    have_ffmpeg = bool(shutil.which("ffmpeg"))
    if path.suffix.lower() == ".wav":
        samples, rate = read_wav(path)
        if rate not in MP3_RATES:                     # معدّل لا يقبله mp3 → إعادة تشكيل
            if not have_ffmpeg:
                raise ValueError(f"معدّل {rate}Hz لا يقبله mp3 — صدّر بـ24000 أو ثبّت ffmpeg")
            return read_via_ffmpeg(path)
        return samples, rate
    if not have_ffmpeg:
        raise ValueError(f"{path.suffix} يحتاج ffmpeg — أو صدّر التسجيل WAV")
    return read_via_ffmpeg(path)


# ————————————————————————— المعالجة —————————————————————————

def trim_and_normalize(samples: array.array, rate: int) -> array.array:
    """قصّ الصمت من الطرفين (بهامش) ثم تطبيع الذروة."""
    if not samples:
        return samples
    peak = max(max(samples), -min(samples))
    if peak == 0:
        return array.array("h")
    threshold = peak * SILENCE_RATIO

    start, end = 0, len(samples) - 1
    while start < len(samples) and abs(samples[start]) < threshold:
        start += 1
    while end > start and abs(samples[end]) < threshold:
        end -= 1
    pad = int(rate * PAD_MS / 1000)
    start = max(0, start - pad)
    end = min(len(samples) - 1, end + pad)
    cut = samples[start:end + 1]

    gain = (TARGET_PEAK * 32767) / peak
    if abs(gain - 1.0) > 0.01:
        cut = array.array("h", (max(-32768, min(32767, int(s * gain))) for s in cut))
    return cut


def to_bytes(samples: array.array) -> bytes:
    if sys.byteorder == "big":
        samples = array.array("h", samples)
        samples.byteswap()
    return samples.tobytes()


# ————————————————————————— المطابقة —————————————————————————

def build_index(texts: dict) -> dict:
    """اسم محتمل (مفتاح أو نصّ مطبَّع) ← النصّ."""
    idx = {}
    for text in texts:
        idx[gen.key_for(text)] = text
        idx[unicodedata.normalize("NFC", text)] = text
    return idx


def main():
    ap = argparse.ArgumentParser(description="استيراد تسجيلات بشرية")
    ap.add_argument("src", help="مجلد التسجيلات")
    ap.add_argument("--dry-run", action="store_true", help="عرض دون كتابة")
    ap.add_argument("--keep-generated", action="store_true",
                    help="بلا نسخ احتياطي للملف المولَّد المستبدَل")
    ap.add_argument("--backup-dir", default="archive/audio-generated")
    args = ap.parse_args()

    src = Path(args.src).expanduser()
    if not src.is_dir():
        sys.exit(f"ليس مجلداً: {src}")

    texts = gen.parse_curriculum(gen.CURRICULUM.read_text(encoding="utf-8"))
    index = build_index(texts)
    backup = gen.ROOT / args.backup_dir

    done = skipped = failed = 0
    files = sorted(p for p in src.rglob("*") if p.suffix.lower() in AUDIO_EXT)
    if not files:
        sys.exit(f"لا ملفات صوت في {src}")

    for path in files:
        stem = unicodedata.normalize("NFC", path.stem.strip())
        text = index.get(stem) or index.get(stem.lower())
        if not text:
            print(f"  ؟ {path.name}: لا نصّ في المنهج بهذا الاسم — تُخطّى", file=sys.stderr)
            skipped += 1
            continue
        dest = gen.OUT_DIR / f"{gen.key_for(text)}.mp3"
        try:
            samples, rate = load(path)
            cut = trim_and_normalize(samples, rate)
            if len(cut) < rate * 0.15:
                raise ValueError("أقصر من ١٥٠ مِلّي ثانية بعد قصّ الصمت — أعِد التسجيل")
            secs = len(cut) / rate
            if args.dry_run:
                print(f"  ⟶ {path.name}: «{text}» {secs:.2f}ث → {dest.name}")
                done += 1
                continue
            if dest.exists() and not args.keep_generated:
                backup.mkdir(parents=True, exist_ok=True)
                if not (backup / dest.name).exists():
                    shutil.copy2(dest, backup / dest.name)
            gen.pcm_to_mp3(to_bytes(cut), rate, dest)
            done += 1
            print(f"  ✓ «{text}» {secs:.2f}ث → {dest.name} ({dest.stat().st_size // 1024}KB)")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ✗ {path.name}: {e}", file=sys.stderr)

    print(f"\nتم: {done} مستورداً، {skipped} بلا مطابقة، {failed} فشل.")
    if done and not args.dry_run:
        print("الفهرس لم يتغيّر (الأسماء هي الأسماء). راجع بالأذن عبر شاشة «فحص الأصوات» في ?dev=1")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
