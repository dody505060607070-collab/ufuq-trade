# خطة: أيقونات حقيقية + صفحات عامة + موافقة الأدمن + Whale Radar

## 1. أيقونات حقيقية بألوانها
- استبدال الأيقونات المرسومة بشعارات حقيقية: MetaTrader 5، TradeLocker، HyperLiquid، الوسطاء (Exness، FxPro…)، الذهب، الفضة، البترول، البيتكوين، الإيثيريوم، المؤشرات (US30/NAS100/SP500)، الأسهم (Apple، Tesla، Nvidia)، وأعلام العملات.
- الشعارات تتحفظ كملفات داخل الموقع (مش من مواقع خارجية وقت التشغيل) عشان تفضل ثابتة وسريعة.
- تتطبق في: الصفحة الرئيسية، صفحة المنصات، إضافة حساب، الوسطاء، Dashboard، Whale Radar، Auto-Pilot.

## 2. صفحات عامة بنفس شكل الصفحة الرئيسية
- صفحات منفصلة: Features، Markets، Pricing، About، وزرار Home في القائمة يرجع للرئيسية.
- نفس الشريط العلوي والفوتر في كل الصفحات، وكل صفحة ليها عنوان ووصف خاص في جوجل.
- مترجمة عربي.

## 3. التسجيل بموافقة الأدمن
- أي حد يسجل جديد يشوف رسالة: «بانتظار موافقة الأدمن» وما يقدرش يدخل لوحة التحكم.
- في لوحة الأدمن صفحة «طلبات التسجيل»: زرار قبول / رفض لكل شخص.
- أنت (الأدمن) والحسابات الموجودة حاليًا تفضل شغالة عادي.
- الحماية من جوه قاعدة البيانات، مش بس في الشاشة.

## 4. صفحة Whale Radar بشكل الصورة
- 3 كروت كبيرة: الذهب، البترول، اليورو/دولار — نسبة المشترين/البائعين، التغير الأسبوعي، وشريط آخر 8 أسابيع.
- جدول «Institutional Positioning» بالنسب والاتجاه، وكارت «How to read this».
- تبويبات Overview / Markets / History.
- بيانات CFTC الحقيقية الموجودة عندنا، بدون أي تكلفة إضافية.

## 5. أفكار لتقوية التفكير والصرامة (للعرض عليك، مش هتتنفذ دلوقتي)
1. **فلتر تعدد الأطر الزمنية:** ممنوع الدخول إلا لو M15 و H1 و H4 متفقين.
2. **لجنة تصويت:** الخبراء الستة يصوّتوا، والدخول بس لو 4 من 6 متفقين.
3. **مراجع شيطان (Devil's advocate):** خبير سابع مهمته يلاقي سبب لعدم الدخول.
4. **حد خسارة يومي صارم** يوقف كل شيء لحد اليوم التالي.
5. **ذاكرة أعمق:** يقارن الفرصة الحالية بأشبه 20 صفقة قديمة قبل الدخول.
6. **Backtest تلقائي أسبوعي** لكل قاعدة متعلمة ويلغي القواعد اللي بتخسر.
7. **ربط Whale Radar بالقرار:** ممنوع الشراء لو الحيتان بايعين بقوة.
8. **فلتر جلسات:** تداول الذهب بس في لندن ونيويورك.

## Technical details
- Logos: download official SVG/PNG sources, store via lovable-assets pointers; central `BrandIcon` component mapping symbol/platform/broker → asset.
- Public routes: `features.tsx`, `markets.tsx`, `pricing.tsx`, update `about.tsx`; extract landing nav/footer into a shared public layout component; replace `#hash` links with `<Link>`.
- Approval: `profiles.approval_status` (pending/approved/rejected), existing rows backfilled to approved, `handle_new_user` sets pending (admin bootstrap stays approved); `is_approved()` security-definer used in RLS of user-owned tables; `_authenticated` gate shows a "pending approval" screen; admin page `admin.approvals.tsx` updates status (admin-only policy).
- Whale Radar: rewrite `whales.tsx` from `whale_signals` history (last 8 reports per symbol).
