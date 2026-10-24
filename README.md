# توكتوك النوبارية — النسخة المؤمَّنة

## الهيكل
- `public/` — الموقع (index.html + app.js + style.css)
- `database.rules.json` — قواعد Realtime Database (**دي خط الدفاع الأساسي**)
- `netlify/functions/` — `firebase-status` (فحص الاتصال) و`cleanup-trips` (بيمسح الرحلات الأقدم من 3 ساعات كل ساعة)
- `scripts/set-admin.mjs` — بيدّي حساب معيّن صلاحية الأدمن
- `netlify.toml` — Security headers + CSP

## خطوات التشغيل (بالترتيب)
1. **Firebase Console → Authentication → Sign-in method**: فعّل **Anonymous** و**Email/Password**.
2. **Authentication → Users**: أضف حساب الأدمن (إيميل + باسورد قوي).
3. حمّل مفتاح الخدمة (Project Settings → Service accounts → Generate new private key) واحفظه **محليًا فقط** (مش في الريبو). بعدها شغّل:
   `npm install && node scripts/set-admin.mjs ./serviceAccountKey.json admin@example.com`
4. **Realtime Database → Rules**: الصق محتوى `database.rules.json` واضغط Publish.
5. **Netlify → Environment variables**: أضف `FIREBASE_SERVICE_ACCOUNT` (محتوى ملف JSON كامل، secret) وأعد النشر.
6. ادخل الموقع، افتح «وضع الأدمن» من شاشة السائق، سجّل دخول، واضغط «تحميل الأماكن الافتراضية» مرة واحدة.
7. **Google Cloud Console → Credentials**: قيّد الـ API key بدومين موقعك، وفعّل **App Check**.

## طريقة العمل الجديدة
- كل مستخدم له حساب مجهول (Anonymous) في Firebase، ومعرّفه هو `auth.uid` بدل الرقم في `localStorage`.
- السائق يسجّل اسمه، ولازم الأدمن يوافق عليه قبل ما يشوف أي راكب أو موقع.
- الراكب يقدر يقرأ رحلته هو بس. إحداثياته بتتحفظ تقريبية (3 أرقام عشرية ≈ 100م).
- استلام الرحلة محمي من السباق: لو سائقين ضغطوا في نفس اللحظة، واحد بس ينجح.
- الأدمن (أماكن/أسعار/موافقة السائقين) بيتحقق منه الـ rules عن طريق `auth.token.admin`، مش زر مخفي.
- كل النصوص بتتعرض بـ `textContent` (مفيش `innerHTML`)، فلا يوجد XSS.

## ملاحظات مهمة
- **القواعد والـ CSP لم أجربهم على Firebase فعليًا** (مفيش وصول للـ emulator من بيئتي). اختبرهم في Rules Playground أولًا، وراجع الـ Console لو الـ CSP منع حاجة.
- دخول الأدمن بيستبدل الحساب المجهول بحساب الأدمن، وبعد الخروج بيتعمل حساب مجهول جديد.
- لسه عندك روابط مؤقتة في `index.html`: `SUBSCRIPTION_LINK` وروابط واتساب/تليجرام/فيسبوك (`XXXX`).
- حقل النوع (ذكر/أنثى) بيظهر للسائقين الموافق عليهم، فمهم تراجع مين بتوافق عليه.
