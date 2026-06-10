# 📧 قوالب البريد الإلكتروني — AnalyzingHub

دليل كامل لرسائل البريد الآلية: الترحيب، رمز التحقق (OTP)، استعادة كلمة المرور،
والتنبيهات — مع قوالب احترافية ثنائية اللغة (عربي + إنجليزي) مطابقة لهوية المنصة،
وطريقة ربطها بإيميل الدومين الخاص بك.

---

## 1) ما هو وضع رسائلك الحالي؟

| نوع الرسالة | من يرسلها؟ | الحالة قبل هذا التحديث | بعد هذا التحديث |
|---|---|---|---|
| **رمز التحقق (OTP)** | دالة `send-otp-email` عبر **ZeptoMail** | ✅ تعمل، لكن القالب إنجليزي وبسيط | ✅ قالب احترافي **عربي + إنجليزي** |
| **الترحيب / تأكيد التسجيل** | **Supabase Auth** (`signUp`) | قالب Supabase الافتراضي | جاهز للصق `confirm-signup.html` |
| **استعادة كلمة المرور** | **Supabase Auth** (`resetPasswordForEmail`) | قالب Supabase الافتراضي | جاهز للصق `reset-password.html` |
| **رابط الدخول السحري** | **Supabase Auth** (Magic Link) | قالب افتراضي | `magic-link.html` |
| **تغيير البريد** | **Supabase Auth** | قالب افتراضي | `change-email.html` |
| **إعادة المصادقة (OTP داخلي)** | **Supabase Auth** | قالب افتراضي | `reauthentication.html` |
| **دعوة مستخدم** | **Supabase Auth** | قالب افتراضي | `invite.html` |
| **التنبيهات المخصّصة** | (أنت ترسلها عبر ZeptoMail عند الحاجة) | غير موجود كقالب | قالب جاهز `notification.html` |

> 🔑 **الخلاصة:** عندك مصدران لإرسال البريد:
> 1. **ZeptoMail** (خدمة Zoho) → تُستخدم حاليًا لرسائل OTP فقط.
> 2. **Supabase Auth** → يرسل الترحيب/تأكيد التسجيل/استعادة كلمة المرور تلقائيًا.
>
> لكي تصل كل الرسائل من **إيميل الدومين** `noreply@analyzhub.com` بشكل احترافي،
> يجب توثيق الدومين في ZeptoMail **وكذلك** توجيه Supabase ليستخدم نفس الـ SMTP.

---

## 2) محتويات المجلد

```
email-templates/
├── README.md                       ← هذا الملف (الدليل)
├── notification.html               ← قالب تنبيهات عام (عربي/إنجليزي)
├── supabase-auth/                  ← قوالب تُلصق في لوحة تحكم Supabase
│   ├── confirm-signup.html         ← الترحيب وتأكيد التسجيل
│   ├── reset-password.html         ← استعادة كلمة المرور
│   ├── magic-link.html             ← رابط الدخول السحري
│   ├── change-email.html           ← تأكيد تغيير البريد
│   ├── reauthentication.html       ← رمز OTP لإعادة المصادقة
│   └── invite.html                 ← دعوة مستخدم
└── preview/
    └── otp-bilingual.html          ← معاينة لرسالة OTP (افتحها في المتصفح)
```

أما رسالة OTP الفعلية فمُولّدة برمجيًا داخل:
`supabase/functions/send-otp-email/index.ts` (تم تحديثها لتكون ثنائية اللغة).

---

## 3) إعداد إيميل الدومين (الخطوة الأهم) 🌐

حتى تصل الرسائل من `@analyzhub.com` ولا تذهب إلى "السبام"، يجب توثيق الدومين.
أنت تستخدم **ZeptoMail**، إليك الخطوات:

### أ. توثيق الدومين في ZeptoMail

1. ادخل [zeptomail.zoho.com](https://www.zoho.com/zeptomail/) → **Domains** → أضف `analyzhub.com`.
2. أضف سجلّات DNS التالية عند مزوّد الدومين (مثل Cloudflare / GoDaddy / Namecheap):

   | النوع | الاسم | القيمة |
   |---|---|---|
   | **TXT (SPF)** | `@` | `v=spf1 include:zeptomail.zoho.com ~all` |
   | **TXT (DKIM)** | `zmail._domainkey` | (القيمة التي يعرضها ZeptoMail لدومينك) |
   | **CNAME / TXT (التحقق)** | (حسب ما يطلبه ZeptoMail) | (القيمة المعروضة) |

3. اضغط **Verify** بعد إضافة السجلات (قد يستغرق الانتشار حتى ساعة).
4. أنشئ **Mail Agent** و**Send Mail Token** — هذا هو المفتاح الذي يوضع في
   متغيّر البيئة `SMTP_PASSWORD`.

> ✅ يُفضّل أيضًا إضافة سجل **DMARC**:
> النوع `TXT`، الاسم `_dmarc`، القيمة `v=DMARC1; p=quarantine; rua=mailto:dmarc@analyzhub.com`

### ب. متغيّرات البيئة المطلوبة

تأكد من ضبط هذه القيم في بيئة المشروع (وفي **Supabase → Edge Functions → Secrets**):

```bash
SMTP_HOST=smtp.zeptomail.com
SMTP_PORT=587
SMTP_USER=emailapikey
SMTP_PASSWORD=<Send-Mail-Token من ZeptoMail>
SMTP_FROM_EMAIL=noreply@analyzhub.com
SMTP_FROM_NAME=AnalyzingHub
APP_BASE_URL=https://analyzhub.com
# اختياري: رابط شعار مخصّص يظهر في الرسائل
EMAIL_LOGO_URL=https://analyzhub.com/logo.png
```

> ⚠️ متغيّر `SMTP_PASSWORD` هو نفسه مفتاح ZeptoMail API الذي تستخدمه دالة OTP.

---

## 4) توجيه Supabase ليرسل من إيميل الدومين 📨

افتراضيًا، Supabase يرسل رسائل الترحيب/استعادة كلمة المرور من بريده الخاص
(`noreply@mail.app.supabase.io`) وبحدّ يومي منخفض. لجعلها تخرج من `@analyzhub.com`:

1. **Supabase Dashboard → Project Settings → Authentication → SMTP Settings**
2. فعّل **Enable Custom SMTP** واملأ:
   - **Host:** `smtp.zeptomail.com`
   - **Port:** `587`
   - **Username:** `emailapikey`
   - **Password:** `<Send-Mail-Token>` (نفس قيمة `SMTP_PASSWORD`)
   - **Sender email:** `noreply@analyzhub.com`
   - **Sender name:** `AnalyzingHub`
3. احفظ. الآن كل رسائل Supabase ستخرج من دومينك.

### لصق القوالب الاحترافية

**Supabase Dashboard → Authentication → Emails** ولكل قالب:

| القسم في Supabase | الملف الذي تلصقه |
|---|---|
| Confirm signup | `supabase-auth/confirm-signup.html` |
| Reset Password | `supabase-auth/reset-password.html` |
| Magic Link | `supabase-auth/magic-link.html` |
| Change Email Address | `supabase-auth/change-email.html` |
| Reauthentication | `supabase-auth/reauthentication.html` |
| Invite user | `supabase-auth/invite.html` |

افتح الملف، انسخ كامل محتواه، والصقه في خانة **Message body (HTML)**، ثم احفظ.

> 💡 المتغيّرات مثل `{{ .ConfirmationURL }}` و`{{ .Token }}` يملؤها Supabase تلقائيًا — لا تعدّلها.

---

## 5) تفعيل رسائل OTP 🔐

رسائل OTP **جاهزة وتعمل** عبر دالة `send-otp-email`. للتأكد من تفعيلها:

1. تأكد أن الدالة منشورة:
   ```bash
   supabase functions deploy send-otp-email
   ```
2. تأكد من ضبط الأسرار في Supabase:
   ```bash
   supabase secrets set SMTP_PASSWORD=<token> SMTP_FROM_EMAIL=noreply@analyzhub.com SMTP_FROM_NAME=AnalyzingHub
   ```
3. تدفّق الطلب: الواجهة تستدعي `/api/auth/otp/request` → التي تولّد رمزًا
   من 6 أرقام، تخزّنه في جدول `otp_codes`، ثم تستدعي دالة `send-otp-email`.

### تخصيص اللغة في OTP

الدالة الآن تدعم حقلًا اختياريًا `language`:

- `"ar"` → الرسالة بالعربية فقط
- `"en"` → بالإنجليزية فقط
- بدون تمريره → **ثنائية اللغة** (عربي ثم إنجليزي) ← الوضع الافتراضي

لإرسال الرسالة بلغة المستخدم الحالية، مرّر `language` من المسار
`app/api/auth/otp/request/route.ts` عند استدعاء الدالة:

```ts
body: JSON.stringify({
  to: email,
  code: otpCode,
  type: existingUser ? 'login' : 'signup',
  language: 'ar', // أو 'en' حسب لغة واجهة المستخدم
}),
```

---

## 6) إرسال تنبيه مخصّص (اختياري)

استخدم `notification.html` كقالب: استبدل العناصر النائبة
(`{{TITLE_AR}}`, `{{BODY_AR}}`, `{{CTA_URL}}` ...إلخ) ثم أرسله عبر ZeptoMail
بنفس طريقة دالة OTP. مفيد لتنبيهات الاشتراك، الصفقات، أو الإعلانات.

---

## 7) قائمة تحقق سريعة ✅

- [ ] توثيق `analyzhub.com` في ZeptoMail (SPF + DKIM + DMARC)
- [ ] ضبط متغيّرات `SMTP_*` و`APP_BASE_URL`
- [ ] إضافة الأسرار في Supabase Edge Functions
- [ ] تفعيل Custom SMTP في Supabase Auth
- [ ] لصق القوالب الستة في Supabase → Authentication → Emails
- [ ] نشر دالة `send-otp-email`
- [ ] إرسال رسالة تجريبية لكل نوع والتأكد من وصولها لصندوق الوارد (لا السبام)

---

## ملاحظات تصميمية

- **الألوان:** متدرّج أزرق→سماوي (`#2563EB → #06B6D4`) مطابق للون المنصة الأساسي.
- **الخط:** Cairo للعربية مع بدائل آمنة لكل عملاء البريد.
- **الاتجاه:** كل رسالة تعرض قسمًا عربيًا (RTL) ثم قسمًا إنجليزيًا (LTR) — مناسب
  لكل المستخدمين دون الحاجة لمعرفة لغتهم مسبقًا.
- **الشعار:** يُسحب من `https://analyzhub.com/logo.png`. غيّره عبر `EMAIL_LOGO_URL`
  أو بتعديل الرابط داخل ملفات HTML.
