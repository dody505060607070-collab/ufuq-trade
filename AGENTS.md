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
- Remote assistant access uses OAuth-only read-only MCP tools with caller ownership filters and existing approval/RLS checks; never expose credentials or trading mutations. Why: assistant access must not widen account permissions.
- Browser assistant tools register in their owning visible screen with fail-open telemetry and no credentials. Why: the user's active view defines their scope.
- New trading settings share DEFAULT_TRADE_LOT; existing users are changed only through their authenticated settings. Why: avoid changing other users' trading risk.
- Backend is Lovable Cloud; every user-owned table is protected by RLS scoped to auth.uid(), admin access goes through public.has_role(). Why: browser writes directly to the DB.
- Roles live only in public.user_roles; the signup trigger grants admin to the first user when no admin exists. Why: bootstraps the owner without hardcoded emails.
- The MT5 EA (public/ea/ArrissaEA.mq5) talks only to POST /api/public/ea/sync, authenticated by X-Username + X-API-Key (user-level key in ea_credentials; unknown logins are auto-registered) or the legacy per-account X-EA-Key; `?format=text` returns pipe-separated lines. Dashboard actions insert trade_commands rows (queued → sent → done/failed). Why: no broker credentials on the web; MQL5 has no JSON parser.
- Hedge plans are converted into open_trade commands inside the EA sync handler (time triggers when due, price triggers when the EA reports hedge_fired). Why: no cron.
- AI analysis runs via src/lib/analysis.server.ts: reuses a shared analysis of the same symbol/timeframe/provider within CACHE_MINUTES, else calls the account's AI (trading_accounts.ai_provider: Gemini via GEMINI_MODEL, or ChatGPT via OPENAI_API_KEY/OPENAI_MODEL in src/lib/ai-provider.ts), no Lovable AI fallback; signal-guard records weak/stale/bad-level signals as no-trade (calendar cached in app_settings). Why: low AI cost, per-account comparison, gating in code.
- Admin CRUD pages reuse src/components/admin/AdminCrud.tsx. Why: one UI.
- Live prices, candles, news and the economic calendar come from free public sources via src/lib/market.server.ts (Yahoo chart API keyed by instruments.yahoo_symbol, RSS feeds, ForexFactory JSON) and feed the AI prompt. Why: no paid data keys.
- UI text is translated with useT() from src/lib/i18n.tsx (English string is the key, Arabic in src/i18n/ar-*.ts); engine messages go through pure src/lib/msg-ar.ts, and AI text is written in Arabic by the AI in the same call (*_ar columns) and shown via useAiText(). Why: full Arabic, no extra AI calls.
- Auto-Pilot: a scheduled job calls POST /api/public/autopilot/run (cron-secret auth); it reuses shared analyses via src/lib/analysis.server.ts, applies the pure rules in src/lib/autopilot.ts, and queues open_trade commands (payload.autopilot=true) for accounts with auto_trading on. Why: runs 24/7 without a browser. SINGLE_AI_CALL/REAL_SECOND_CHECK control extra AI checks; no trades or analysis in the QUIET_START_UTC–QUIET_END_UTC window; confidence floor and stacking limits live in src/lib/autopilot.ts.
- AI Brain & Whale Radar run inside each Auto-Pilot cycle (src/lib/brain.server.ts): one Gemini lesson per closed trade, rules merged in learned_rules, Monday weekly review, CFTC COT refreshed daily; both feed the runAI prompt. Why: no extra cron, cheap learning. Analyses with levels are graded later on broker candles (src/lib/hindsight.ts); stats feed the prompt.
- New sign-ups get profiles.approval_status='pending' (first user auto-approved); public.is_approved() gates the _authenticated layout (→ /pending) and restrictive RLS on trading tables; only admins can change approval (trigger guard). Why: owner approves traders first.
- Public marketing pages share src/components/site/SiteChrome.tsx ; logos are asset pointers in src/assets/logos rendered by BrandLogo. Why: one look and one logo source.
- AI only proposes; pure src/lib/risk-engine.ts vetoes, verdicts go to decision_log. Real trades need a fresh broker quote per symbol (brokerGate, EA InpQuoteSymbols; unpriced symbols aren't analysed) and risk uses the broker min lot. Learned rules reach the prompt only when approved, merged by topic (src/lib/brain.ts); last lessons always included. Why: explainable, measurable decisions.
- The free demo challenge is a multi-asset paper simulator (sim_challenges/sim_trades/sim_events/sim_decisions; pure specs, scanner, supervisor and fills in src/lib/challenge.ts; cycle in src/lib/sim-run.server.ts run by the Auto-Pilot cron with a per-challenge lock). Order: code scanner + Gemini proposal → code evidence/checklist (src/lib/evidence.ts) → deterministic supervisor veto → fill; closed trades get a process review (sim_reviews). It never writes trade_commands or touches trading_accounts; users can only insert a row and change status via column grants. Why: demo money fully separated from real execution; every veto explainable.
- No daily AI-call cap: AI cost is limited only by the shared CACHE_MINUTES analysis and stale-price analyses skipping the AI call. Accounts with ai_provider='mixed' alternate Gemini/ChatGPT per MIX_SLOT_MINUTES via accountProvider() in src/lib/ai-provider.ts. Why: owner removed the cap so trading never stalls; turns reuse shared analyses.
- News pauses (Auto-Pilot and paper challenge, before any AI call) come only from pure src/lib/news-guard.ts; oil also pauses on EIA/OPEC. Why: one tested rule.
- Time Machine (pure src/lib/timemachine.ts, seeded M5 replays from fetchM5History): vetoes paper and real trades (TM_REAL_VETO) only on a strong stop lean with enough decisive replays; fail-open. Why: no AI cost, owner approved it.
