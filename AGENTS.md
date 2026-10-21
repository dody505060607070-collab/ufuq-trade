<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Backend is Lovable Cloud; every user-owned table is protected by RLS scoped to auth.uid(), admin access goes through public.has_role(). Why: browser writes directly to the DB.
- Roles live only in public.user_roles; the signup trigger grants admin to the first user when no admin exists. Why: bootstraps the owner without hardcoded emails.
- The MT5 EA (public/ea/ArrissaEA.mq5) talks only to POST /api/public/ea/sync, authenticated by X-Username + X-API-Key (user-level key in ea_credentials; unknown logins are auto-registered) or the legacy per-account X-EA-Key; `?format=text` returns pipe-separated command lines for MQL5. Dashboard actions insert rows into trade_commands (queued → sent → done/failed). Why: the web app never holds broker credentials and MQL5 has no JSON parser.
- Hedge plans are converted into open_trade commands inside the EA sync handler (time triggers when due, price triggers when the EA reports hedge_fired). Why: no cron needed.
- AI analysis runs in analyzeMarket (src/lib/ai.functions.ts): reuses any analysis of the same symbol/timeframe from the last 15 min for all users, else calls Google Gemini with GEMINI_API_KEY and falls back to Lovable AI (default ai_models row) when Gemini fails. Why: minimise AI cost.
- Admin CRUD pages reuse src/components/admin/AdminCrud.tsx. Why: one consistent table/edit UI.
- Live prices, candles, news and the economic calendar come from free public sources via src/lib/market.server.ts (Yahoo chart API keyed by instruments.yahoo_symbol, RSS feeds, ForexFactory JSON) and also feed the AI analysis prompt. Why: no paid data keys needed.
- UI text is translated with useT() from src/lib/i18n.tsx: the exact English string is the key, Arabic lives in src/i18n/ar-*.ts and falls back to English; language is saved in the browser and sets html dir=rtl. Why: one source of copy, no key bookkeeping.
- Auto-Pilot: a scheduled job (every 15 min) calls POST /api/public/autopilot/run (cron-secret auth); it reuses shared analyses via src/lib/analysis.server.ts, applies the pure rules in src/lib/autopilot.ts, and queues open_trade commands (payload.autopilot=true) for accounts with auto_trading on. Why: trading runs 24/7 without a browser open.
