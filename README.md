# المُعلِّم — تعليم القراءة العربية لطفل السادسة

تطبيق ويب (بلا أدوات بناء) يعلّم الطفل القراءة العربية على أساس **القاعدة النورانية** مطوَّعةً بأربعة مبادئ:

1. **ترتيب الحروف بالتواتر** لا بالأبجدية — يقرأ الطفل كلمات حقيقية من الأيام الأولى.
2. **كلمات من عالم الطفل** مشتركة بين الفصحى واللهجات (مراعاة الازدواجية اللغوية).
3. **مفكوكية ١٠٠٪** — لا يُعرض على الطفل حرف أو علامة لم تُدرَّس بعد، ويُفحص ذلك آلياً.
4. **مسار واحد** ينتهي بالتهيئة لتلاوة القرآن الكريم.

## التشغيل

```bash
python3 -m http.server 8000 -d app
# ثم افتح http://127.0.0.1:8000/  (أضف ?dev=1 لأدوات التجربة وفحص الأصوات)
```

## بنية المشروع

| المسار | الدور |
|---|---|
| `docs/METHOD.md` | المنهج التعليمي الملزم |
| `docs/SESSIONS.md` | خطة جلسات التنفيذ وحالتها |
| `app/js/curriculum.js` | مصدر الحقيقة لبيانات المنهج |
| `app/audio/` | أصوات مولّدة مسبقاً (Gemini TTS) — تُستبدل بتسجيلات بشرية دون تغيير الشيفرة |
| `tools/` | توليد الأصوات، عدّة التسجيل البشري، فحص المفكوكية، اختبارات التقدّم |
| `ref/` | المرجعان: القاعدة النورانية والدروس الهجائية (PDF) |

## الأصوات

كل نصّ في المنهج له ملف `app/audio/<key>.mp3` واسمه sha1 لنصّه العربي — فاستبدال أي
ملف بتسجيل بشري لا يمسّ سطراً من الشيفرة.

```bash
.venv/bin/python tools/generate_audio.py                 # الناقص فقط (Gemini TTS)
.venv/bin/python tools/generate_audio.py --force         # إعادة توليد الكل
.venv/bin/python tools/generate_audio.py --audition      # صفحة مفاضلة أصوات
.venv/bin/python tools/generate_audio.py --verify-only   # تحقّق: لا ناقص ولا يتيم ولا مبتور
.venv/bin/python tools/generate_audio.py --engine edge   # المحرّك الاحتياطي (مايكروسوفت)

.venv/bin/python tools/recording_list.py                 # قائمة تسجيل للمعلّم البشري
.venv/bin/python tools/import_recordings.py ~/rec        # استيراد التسجيلات (قصّ + تطبيع)
```

المفتاح `GEMINI_API_KEY` يُقرأ من البيئة أو من `.env` (غير مُتتبَّع في git ولا يُطبع).

## الفحوص

```bash
python3 tools/check_decodable.py     # المفكوكية والتغطية
node tools/test_progress.mjs         # قواعد القفل والنجوم
node tools/test_lesson.mjs           # مفكوكية جولات درس الحرف
node tools/test_words.mjs            # مفكوكية ألواح لعبة الكلمات وتغطية أصواتها
python3 tools/browser_test.py        # درس الحرف في Chrome حقيقي
python3 tools/browser_test.py --words   # لعبة الكلمات في Chrome حقيقي (المجموعات السبع)
```
