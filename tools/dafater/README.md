# تشغيل خادم دفاتر محليًا

دفاتر يعمل بخادمه الخاص (`packages/backend/server`)، ولا يعتمد على أي خدمة خارجية.

## ١. قاعدة البيانات وRedis

```bash
docker run -d --name dafater-postgres -e POSTGRES_PASSWORD=dafater -e POSTGRES_USER=dafater \
  -e POSTGRES_DB=dafater -p 127.0.0.1:55440:5432 -v dafater_pg:/var/lib/postgresql/data pgvector/pgvector:pg16
docker run -d --name dafater-redis -p 127.0.0.1:63790:6379 redis:7.4-alpine
```

ملف `packages/backend/server/.env`:

```env
DATABASE_URL="postgres://dafater:dafater@localhost:55440/dafater"
REDIS_SERVER_HOST=localhost
REDIS_SERVER_PORT=63790
```

وملف `packages/backend/server/config.json` يكفي أن يحتوي على `{}`.

## ٢. البناء والترحيل والتشغيل

```bash
(cd packages/backend/native && corepack yarn build:debug)   # الوحدة الأصلية (Rust)
(cd packages/backend/server && corepack yarn prisma migrate deploy && corepack yarn data-migration run)
corepack yarn affine @affine/server dev     # الخادم على :3010
corepack yarn dev -p @affine/web            # التطبيق على :8080
```

## ٣. أول حساب = مدير النظام

افتح التطبيق، ثم «تسجيل الدخول إلى دفاتر»، وأدخل بريدك. أول من يسجّل في خادم فارغ
يصبح مدير النظام تلقائيًا، ومن يسجّل بعده يحصل على حساب عادي. لا يوجد تحقق بالبريد.

## ٤. الذكاء الاصطناعي (للمدير فقط)

الإعدادات ← «إدارة الخادم» ← «الذكاء الاصطناعي»:

- **عنوان الواجهة**، مثل `https://api.openai.com/v1` أو `https://openrouter.ai/api/v1`
  أو `http://localhost:11434/v1` (Ollama).
- **مفتاح الواجهة** و**النموذج**، مثل `gpt-4o-mini` أو `llama3.1`.
- للخوادم المحلية فعّل «السماح بالشبكة المحلية» من الإعدادات المتقدّمة.
- استخدم «اختبار الاتصال»، ثم «حفظ»، وفعّل الذكاء الاصطناعي.

### التفريغ النصي (ملاحظات الاجتماعات بالذكاء الاصطناعي)

في قسم «التفريغ النصي» من الصفحة نفسها:

- **نموذج التفريغ النصي**، مثل `whisper-1` أو `gpt-4o-mini-transcribe` (OpenAI)،
  أو `whisper-large-v3` (Groq). اتركه فارغًا لإيقاف التفريغ النصي.
- **مزوّد مستقل للتفريغ النصي** (اختياري): عنوان أساسي ومفتاح خاصّان بالتفريغ، مثل
  `https://api.groq.com/openai/v1`، أو `http://localhost:8000/v1` لخادم Whisper محلي
  مثل Speaches أو faster-whisper. إن تُرك العنوان فارغًا استُخدم العنوان والمفتاح أعلاه.
  يُترك المفتاح فارغًا للإبقاء على المفتاح المحفوظ ما دام العنوان لم يتغيّر.
- «اختبار التفريغ النصي» يرسل ثانية صامتة إلى `‎/audio/transcriptions` ويعرض النتيجة.

يحفظ الخادم هذه القيم داخل ملف تعريف المزوّد (`copilot.providers.profiles`، المعرّف
`dafater-openai-compatible`) في الحقول `transcriptionModel` و`transcriptionBaseURL`
و`transcriptionApiKey`، ولا تُعاد المفاتيح أبدًا في الواجهة البرمجية.

واجهات ملاحظات الاجتماعات (لكل مستخدم مسجّل الدخول، ولا تحتاج مساحة عمل):

- `GET /api/copilot/meeting-notes/capabilities` ← `{ "summary": bool, "transcription": bool }`
- `POST /api/copilot/meeting-notes/transcribe?mimeType=audio/webm&language=ar&prompt=…`
  مع بايتات الصوت في جسم الطلب (حتى 25 ميغابايت) ← `{ "text": "…" }`
- `POST /api/copilot/meeting-notes/summarize` (JSON) ← `{ "title": "…", "markdown": "…" }`

يتوفّر التفريغ النصي للتسجيلات بعد تحديد نموذج للتفريغ النصي، أما توليد الصور والبحث
الدلالي فلا يتوفّران مع المزوّد المخصّص.

## الاختبار دون مفتاح حقيقي

`node tools/dafater/mock-openai.mjs` يشغّل مزوّدًا تجريبيًا متوافقًا مع OpenAI على
`http://localhost:18080/v1` (النموذج `mock-model`). يدعم أيضًا `‎/v1/audio/transcriptions`
(يعيد جملًا عربية ثابتة بالتناوب، وجملًا إنجليزية مع `language=en`، ونصًا فارغًا لملف WAV
صامت)، ويعيد ملخص اجتماع عربيًا بالصيغة المطلوبة عند طلب التلخيص. لتجربة ملاحظات الاجتماعات:
اضبط النموذج `mock-model` والعنوان `http://127.0.0.1:18080/v1` مع «السماح بالشبكة المحلية»،
ونموذج التفريغ النصي `whisper-1`، ثم «اختبار التفريغ النصي».

اختبارات الخادم الخاصة بملاحظات الاجتماعات (على قاعدة بيانات الاختبار):

```bash
cd packages/backend/server
NODE_OPTIONS="--import=$(realpath ../../../tools/cli/register.js)" \
DATABASE_URL=postgres://dafater:dafater@localhost:55440/dafater_test \
npx ava src/__tests__/copilot/meeting-notes.spec.ts src/__tests__/copilot/meeting-notes.e2e.ts
```

الاختبارات الآلية الأخرى:

- `tests/affine-cloud/e2e/dafater-sign-up.spec.ts`: إنشاء الحسابات، وأول مسجّل يصبح المدير.
- `tests/affine-cloud/e2e/dafater-admin-ai.spec.ts`: إعداد المزوّد، ثم محادثة.
- `flock /tmp/dafater-users.lock bash tools/dafater/e2e-admin-ai.sh`: فحص الواجهات البرمجية.

تحتاج هذه الاختبارات خادمًا بلا مستخدمين، وتحذف كل ما تنشئه.
