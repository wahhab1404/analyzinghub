# نشر الصفقات الناجحة على X (تويتر) — Twitter Deal Announcements

كل محلل يربط حساب X الخاص به، ثم ينشر صفقاته الرابحة (صورة بطاقة الصفقة + نص
عربي) يدويًا بضغطة زر، أو تلقائيًا عند إغلاق الصفقة بربح.

Each analyst links their own X account and announces winning trades (trade-card
image + Arabic text) — manually with a button, or automatically on profitable
close.

---

## كيف يعمل / How it works

1. **الربط (مرة واحدة):** المحلل يفتح `الإعدادات ← القناة ← نشر الصفقات الناجحة على X`
   ويضغط "ربط حساب X". يتم تفويض تطبيق المنصة عبر OAuth 2.0 (PKCE) على حساب المحلل.
2. **النشر اليدوي:** زر "نشر على X" يظهر على بطاقة أي صفقة رابحة (`TradeCard`).
3. **النشر التلقائي:** عند تفعيله من الإعدادات، تُنشر الصفقة تلقائيًا عند تحوّل حالتها
   إلى `completed` بربح موجب.

التوكنات تُخزَّن مشفّرة (AES-256-GCM)، وكل صفقة تُنشر مرة واحدة فقط (قيد فريد على
`social_posts(trade_id, platform)`).

---

## الإعداد / Setup

### 1) تطبيق X Developer (OAuth 2.0)

- أنشئ تطبيقًا في [X Developer Portal](https://developer.x.com) من نوع **Web App**
  (OAuth 2.0, Confidential client).
- **Callback / Redirect URI:** `<APP_BASE_URL>/api/twitter/callback`
  (مثال: `https://analyzhub.com/api/twitter/callback`).
- **Scopes:** `tweet.read tweet.write users.read offline.access media.write`.
- انسخ `Client ID` و `Client Secret`.

### 2) متغيرات البيئة / Environment variables

```bash
TWITTER_CLIENT_ID=...            # OAuth 2.0 Client ID
TWITTER_CLIENT_SECRET=...        # OAuth 2.0 Client Secret
TWITTER_REDIRECT_URI=https://analyzhub.com/api/twitter/callback
TWITTER_TOKEN_ENC_KEY=...        # أي سر عشوائي طويل لتشفير توكنات المحللين
```

### 3) قاعدة البيانات / Migration

طبّق الترحيل:

```
supabase/migrations/20260603000000_create_twitter_integration.sql
```

ينشئ جدولين: `twitter_accounts` (توكنات مشفّرة، حساب واحد لكل محلل) و
`social_posts` (سجل النشر + منع التكرار)، كلاهما محميّ بـ RLS لكل محلل.

---

## الباقة المجانية / Free tier

الباقة المجانية من X API تسمح بحد نشر محدود (~500 تغريدة/شهر على مستوى التطبيق).
هذا كافٍ لتجربة محلل واحد. عند توسيع عدد المحللين النشطين، رقِّ إلى Basic أو أعلى.
عند تجاوز الحد، يفشل النشر بأناقة ويُسجَّل في `social_posts.status = 'failed'`.

---

## بنية الكود / Code map

| المسار | الدور |
|---|---|
| `lib/twitter/config.ts` | قراءة إعدادات تطبيق X من البيئة |
| `lib/twitter/crypto.ts` | تشفير/فك تشفير التوكنات (AES-256-GCM) |
| `lib/twitter/oauth.ts` | روابط OAuth 2.0 PKCE والحالة |
| `lib/twitter/client.ts` | استدعاءات X API: تبادل/تجديد التوكن، الهوية، رفع وسائط، نشر |
| `lib/twitter/account.ts` | جلب توكن صالح للمحلل مع تجديد تلقائي |
| `lib/twitter/tweet-builder.ts` | نص التغريدة العربي (≤280 حرف) |
| `lib/twitter/announce.ts` | نواة النشر المشتركة (بوابة الربح، منع التكرار، الصورة، النشر، التسجيل) |
| `app/api/twitter/connect` | بدء تدفّق OAuth |
| `app/api/twitter/callback` | إكمال OAuth وتخزين التوكنات |
| `app/api/twitter/status` | حالة الربط للواجهة |
| `app/api/twitter/disconnect` | فكّ الربط |
| `app/api/twitter/settings` | تبديل النشر التلقائي |
| `app/api/trades/[id]/post-to-twitter` | النشر اليدوي |
| `app/api/trades/[id]/route.ts` (PATCH) | خطّاف النشر التلقائي عند الإغلاق |
| `components/settings/TwitterConnectSettings.tsx` | بطاقة الربط + مفتاح النشر التلقائي |
| `components/trades/TradeCard.tsx` | زر "نشر على X" |

---

## ملاحظات أمان / Security notes

- توكنات الوصول/التجديد لا تُخزَّن نصًّا صريحًا أبدًا — تُشفَّر قبل الإدخال.
- جميع المسارات تتحقق من ملكية المحلل للصفقة (أو دور SuperAdmin).
- `TWITTER_TOKEN_ENC_KEY` سرّ حسّاس: لا يُدرَج في الكود، ويجب تدويره إن تسرّب
  (وإلا تصبح التوكنات المخزّنة غير قابلة لفك التشفير).
