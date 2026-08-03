# الإسناد والتراخيص — أصول «المُعلِّم» الصوتية

هذا الملف يوثّق مصدر كل صوت في `app/audio/`، ويفي بواجب الإسناد الذي تفرضه تراخيص المصادر.

## ١. تلاوة القرآن الكريم — ٢٢ ملفاً

- **القارئ**: محمود خليل الحصري (المرتّل).
- **المصدر**: [everyayah.com](https://everyayah.com/) — مجموعة `Husary_64kbps`.
- **الملفات**: البسملة وآيات الفاتحة والإخلاص والفلق والناس، مسمّاةً بمفاتيح نصوصها؛ بيانها في `tools/recitations.json` و`app/data/recitations.json`.
- **الأداة**: `tools/fetch_recitation.py` (تنزيل مباشر بلا أي تعديل على الصوت).
- **السبب**: `docs/METHOD.md §٥.٦` — تلاوة القرآن بصوت قارئ متقن لا بمولّد آلي.

## ٢. أصوات المنهج المولّدة — الباقي

- **المحرّك**: Google Gemini TTS (`gemini-3.1-flash-tts-preview` · `gemini-2.5-flash-preview-tts` · `gemini-2.5-pro-preview-tts`) بصوت `Sulafat`.
- **الأداة**: `tools/generate_audio.py`، والسياسة في `docs/AUDIO_QUEUE.md`.
- **ملاحظة**: هذه الملفات مرحلة أولى قابلة للاستبدال بتسجيلات بشرية دون تغيير أي سطر في التطبيق (اسم الملف = مفتاح نصّه) — انظر `tools/recording_list.py` و`tools/import_recordings.py`.

<!-- ANTURA-CREDIT-START -->
## ٣. تسجيلات الحروف من Antura — 224 ملفاً

- **العمل**: *Antura and the Letters* (النسخة العربية) — الفائز بمبادرة EduApp4Syria.
- **المصدر**: <https://github.com/vgwb/Antura_arabic> (فرع `master`)، مجلدات الصوت `AudioArabic/Letters`.
- **الترخيص**: أصول المشروع الرقمية (ومنها التسجيلات) تحت
  [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/)
  — وشيفرته تحت BSD-2-Clause (لم نأخذ منها شيئاً).
- **حقوق النشر**: © TH Köln / Cologne Game Lab، Video Games Without Borders، Wixel Studios.
- **الأنواع المستوردة**: كل الأنواع المجرودة.
- **التعديل**: نُسخت التسجيلات كما هي إلى mp3 مع **قصّ الصمت من الطرفين وتطبيع الذروة**
  (`tools/import_recordings.py`) وتسميةٍ بمفتاح نصّها — ولم يُمسّ محتواها الصوتي.
- **قائمة المستورد بالتفصيل**: `scratch/antura/matched.json`.
<!-- ANTURA-CREDIT-END -->
