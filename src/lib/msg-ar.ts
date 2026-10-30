// Arabic for the messages the trading engine writes (Auto-Pilot log, risk verdicts, challenge log).
// Pure: phrase rules applied in order; numbers, symbols and prices stay as they are.
// AI free text is not translated here — the AI writes its own Arabic copy (summary_ar, lesson_ar…).

const RULES: Array<[RegExp, string]> = [
  // Auto-Pilot status
  [/No connected account with auto trading on/g, "لا يوجد حساب متصل مفعّل عليه التداول التلقائي"],
  [/Daily AI budget used — slow mode: one analysis every (\d+) min, (\S+) goes first/g, "انتهى رصيد Gemini اليومي — الوضع البطيء: تحليل واحد كل $1 دقيقة، الدور الآن على $2"],
  [/Daily Gemini budget used — slow mode: one analysis every (\d+) min, (\S+) goes first/g, "انتهى رصيد Gemini اليومي — الوضع البطيء: تحليل واحد كل $1 دقيقة، الدور الآن على $2"],
  [/Daily AI budget used — slow mode: next Gemini analysis within 30 min/g, "انتهى رصيد Gemini اليومي — الوضع البطيء: التحليل القادم خلال 30 دقيقة"],
  [/Daily AI budget reached — resumes tomorrow \(keeps the \$5 Gemini credit lasting a month\)/g, "انتهى رصيد الذكاء الاصطناعي اليومي — يرجع بكرة (حتى يكفي الرصيد الشهر كله)"],
  [/Analysis unavailable/g, "التحليل غير متاح"],
  [/unknown error/g, "خطأ غير معروف"],
  [/Thin market hours \((\d+):00–0?(\d+):00 UTC\): no new trades — (?:every )?past trades opened here lost/g, "ساعات سيولة ضعيفة ($1:00–$2:00 UTC): لا صفقات جديدة — الصفقات السابقة في هذا الوقت خسرت"],
  [/Market closed - Auto-Pilot resumes when gold\/FX reopen \(Sunday (\d+):(\d+) UTC\)/g, "السوق مغلق — يرجع الطيار الآلي عند فتح الذهب والعملات (الأحد $1:$2 UTC)"],
  [/Resting (\d+) min after last close/g, "استراحة $1 دقيقة بعد آخر إغلاق"],
  [/Daily goal \$(\S+) reached — resting until tomorrow/g, "تم تحقيق هدف اليوم $$$1 — راحة حتى الغد"],
  [/Locked \$(\S+) after peak \$(\S+?)( \(runner\))?$/g, "تم تأمين $$$1 بعد أعلى ربح $$$2"],
  [/Target \$(\S+) reached \(\$(\S+)\)/g, "تم الوصول للهدف $$$1 ($$$2)"],
  // Skip reasons
  [/Confidence (\d+)% below (\d+)%/g, "الثقة $1% أقل من الحد $2%"],
  [/A trade is already open on this symbol \(a second needs (\d+)%\+\)/g, "توجد صفقة مفتوحة على هذا السوق (الصفقة الثانية تحتاج $1%+)"],
  [/A trade is already open on this symbol/g, "توجد صفقة مفتوحة على هذا السوق"],
  [/Already (\d+) trades open on this symbol/g, "يوجد بالفعل $1 صفقات مفتوحة على هذا السوق"],
  [/Same setup already traded in the last (\d+) min \(repeat needs (\d+)%\+\)/g, "نفس الإعداد تم تداوله خلال آخر $1 دقيقة (التكرار يحتاج $2%+)"],
  [/Already traded this symbol in the last hour \(repeat needs (\d+)%\+\)/g, "تم التداول على هذا السوق خلال الساعة الأخيرة (التكرار يحتاج $1%+)"],
  [/Already traded this symbol in the last hour/g, "تم التداول على هذا السوق خلال الساعة الأخيرة"],
  [/Max (\d+) open trades reached/g, "تم الوصول للحد الأقصى $1 صفقات مفتوحة"],
  [/Daily limit of (\d+) trades reached/g, "تم الوصول لحد اليوم $1 صفقات"],
  [/Daily loss limit of (\S+)% reached/g, "تم الوصول لحد الخسارة اليومي $1%"],
  [/Last (buy|sell) on this symbol lost; same direction locked (\d+) min \(needs (\d+)%\+\)/g, (_m: string) => _m] as unknown as [RegExp, string],
  [/High-impact news within 30 minutes/g, "خبر قوي خلال 30 دقيقة"],
  [/Missing SL\/TP levels/g, "لا يوجد وقف خسارة أو هدف"],
  [/Missing entry, stop or target/g, "لا يوجد دخول أو وقف أو هدف"],
  [/No clear direction/g, "لا يوجد اتجاه واضح"],
  [/Waiting for a setup/g, "في انتظار فرصة"],
  [/AI saw (BUY|SELL) (\d+)% but blocked: /g, "الذكاء الاصطناعي رأى $1 $2% لكن تم المنع: "],
  [/No trade \(/g, "لا صفقة ("],
  [/\. AI view: /g, ". رأي الذكاء الاصطناعي: "],
  [/AI not called to save credit\./g, "لم يتم استدعاء الذكاء الاصطناعي لتوفير الرصيد."],
  [/Price data is stale \((\d+) min old\)/g, "بيانات السعر قديمة (منذ $1 دقيقة)"],
  [/No price data/g, "لا توجد بيانات سعر"],
  [/(buy|sell) against (\S+) trend/g, "$1 عكس اتجاه $2"],
  [/H1 and H4 both ranging/g, "H1 وH4 كلاهما عرضي"],
  [/split H1\/H4 trade needs (\d+)%\+ confidence/g, "صفقة مع اختلاف H1/H4 تحتاج ثقة $1%+"],
  [/Weak signal \((\d+)% < (\d+)%\)/g, "إشارة ضعيفة ($1% < $2%)"],
  [/Stop\/target on the wrong side of entry/g, "الوقف أو الهدف في الجهة الخطأ من الدخول"],
  [/Reward\/risk (\S+) is below 1\.5/g, "العائد/المخاطرة $1 أقل من 1.5"],
  [/Reward\/risk (\S+) below (\S+)/g, "العائد/المخاطرة $1 أقل من $2"],
  [/Stop (\S+) ATR is inside market noise \(min (\S+)\)/g, "الوقف $1 ATR داخل ضوضاء السوق (الحد الأدنى $2)"],
  [/Stop (\S+) ATR is too wide \(max (\S+)\)/g, "الوقف $1 ATR واسع جدًا (الحد الأقصى $2)"],
  [/Waiting: /g, "انتظار: "],
  // Risk engine verdicts
  [/No trade: AI is neutral/g, "لا صفقة: الذكاء الاصطناعي محايد"],
  [/Broker price is stale \((\d+)s old\)/g, "سعر الوسيط قديم (منذ $1 ثانية)"],
  [/Entry is too far from the current price/g, "الدخول بعيد جدًا عن السعر الحالي"],
  [/Stop is tighter than market noise \(ATR\)/g, "الوقف أضيق من ضوضاء السوق (ATR)"],
  [/Stop is unrealistically wide \(ATR\)/g, "الوقف واسع بشكل غير واقعي (ATR)"],
  [/Spread is too high for this stop/g, "السبريد مرتفع جدًا لهذا الوقف"],
  [/Trade risks \$(\S+), more than (\S+)% of balance/g, "مخاطرة الصفقة $$$1، أكثر من $2% من الرصيد"],
  [/Approved · R\/R (\S+)/g, "مقبولة · العائد/المخاطرة $1"],
  [/Approved by (ChatGPT|Gemini|AI) (\d+)% \+ code risk checks \(single analysis\)/g, "وافق عليها $1 بثقة $2% + فحوصات المخاطر في الكود (تحليل واحد)"],
  [/Both AI checks agree \((\d+)% \+ (\d+)%\)/g, "التحليلان متفقان ($1% + $2%)"],
  [/Second AI check said no \((\d+)%, combined (\d+)%\): /g, "المراجعة الثانية رفضت ($1%، المتوسط $2%): "],
  // Challenge log
  [/Demo balance wiped out/g, "رصيد التجربة انتهى"],
  [/Demo target reached/g, "تم الوصول لهدف التجربة"],
  [/Target reached/g, "تم الوصول للهدف"],
  [/no live price — emergency close waits for the market/g, "لا يوجد سعر حي — الإغلاق الطارئ ينتظر فتح السوق"],
  [/ — closing early/g, " — إغلاق مبكر"],
  [/thesis invalidated/g, "فكرة الصفقة لم تعد صحيحة"],
  [/Drawdown limit (\S+)% reached — new trades blocked until you review and resume/g, "تم الوصول لحد التراجع $1% — الصفقات الجديدة متوقفة حتى تراجع وتستأنف"],
  [/Scanned (\d+) assets · no setup with score ≥ (\S+) \(best: /g, "تم فحص $1 سوق · لا إعداد بدرجة ≥ $2 (الأفضل: "],
  [/News · (\S+) — waiting for "/g, "أخبار · $1 — انتظار خبر \""],
  [/scanner AI unavailable/g, "ذكاء الماسح غير متاح"],
  [/AI says /g, "الذكاء الاصطناعي يقول "],
  [/Scanner · /g, "الماسح · "],
  [/Reviewer · /g, "المراجع · "],
  [/Supervisor · /g, "المشرف · "],
  [/ score /g, " درجة "],
  // Words
  [/\bBUY\b/g, "شراء"],
  [/\bSELL\b/g, "بيع"],
  [/\bNEUTRAL\b/g, "محايد"],
  [/\bbuy\b/g, "شراء"],
  [/\bsell\b/g, "بيع"],
  [/ lot · /g, " لوت · "],
  [/\bunavailable\b/g, "غير متاح"],
];

const lostLock = /Last (buy|sell) on this symbol lost; same direction locked (\d+) min \(needs (\d+)%\+\)/g;

/** Arabic version of an engine message. Unknown text (e.g. AI English) is kept as is. */
export function toArabic(msg: string | null | undefined): string {
  if (!msg) return "";
  let s = msg.replace(lostLock, (_m, side: string, min: string, c: string) => `آخر ${side === "buy" ? "شراء" : "بيع"} على هذا السوق خسر؛ نفس الاتجاه مقفول ${min} دقيقة (يحتاج ${c}%+)`);
  for (const [re, to] of RULES) if (typeof to === "string") s = s.replace(re, to);
  return s;
}

/** First sentence of a text (for short log lines). */
export function firstSentence(s: string | null | undefined, max = 160): string {
  const t = (s ?? "").trim();
  return (t.split(/(?<=[.!؟?])\s/)[0] ?? t).slice(0, max);
}
