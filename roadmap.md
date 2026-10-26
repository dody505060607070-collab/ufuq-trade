# Roadmap — match arrissa.trade app screens (Oct 21 screenshots)

- [x] Icon-rail app shell (Back link, avatar, logout, docs)
- [x] Dashboard: recent analysis column, balance/equity/profit bar, account picker + Set Default, instrument picker modal (search, favorites, flags), BUY/SELL, order type/trades/interval, SL/TP, Execute Trade, EA-not-connected modal, Global Manage, open trades column
- [x] Geopolitics news + Economic calendar (free live sources)
- [x] AI analysis fed with live prices/candles, calendar and headlines; 5-minute auto analysis
- [x] Hedge page layout + live price
- [x] MT5 EA Configuration page (username, API key, refresh, API URL, steps)
- [x] Add MT5 page: broker cards, configure, connected cards, disconnect
- [x] Brokers page cards (Exness, FxPro)
- [x] Performance: account filter, refresh, period groups
- [x] Preferences toggles (push, voice, tooltips, copy TP/SL)
- [x] Personal profile (names, username, change password)
- [x] EA source file (MQL5) that talks to the sync endpoint
- [x] Verify in browser

# Arabic language
- [x] English/Arabic switch on every page (RTL) + explanation box on each page

# Auto-Pilot
- [x] Settings page, rules, 15-min scheduled runner, activity log

# Current request
- [x] Use 0.02 for new account/settings forms and save lot edits when leaving the field.
- [x] Existing lot is 0.02 on the owner's Auto-Pilot settings.
- [x] Add OAuth-only read-only assistant tools, consent, revocation, and browser-local settings read.
- [ ] Verify approved/denied OAuth flow with real assistant — blocked: requesting user session and external OAuth client required; republish needed.
- [x] Run basic security review, harden redirect handling, and verify anonymous MCP requests are refused.
- [ ] Complete remaining security review — blocked: deep scan is running; findings need its report before further changes.

# Stability release (EA 1.40)
- [x] Live-price risk, command lifecycle/expiry/unknown, executor ownership, owner lease, deal-based daily P/L, snapshot safety, shadow mode, EA 1.40 source, compile script, demo plan, report.
- [ ] Compile EA 1.40 — blocked: needs Windows VPS with MetaEditor (user runs compile-ea.ps1).
- [ ] Demo tests after market open — blocked: market closed, admin-supervised.

# Deferred items (Oct 25)
- [x] Review five-minute cadence, choose M15 for owner with confidence 60%, and preserve capital safety.
- [x] Audit simultaneous opportunities, personal AI learning, GitHub references, and improve Auto-Pilot monitoring (TRADING-REVIEW.md).
- [x] Verify owner settings and visible Brain/Auto-Pilot flows; report external MT5 limitations.
- [x] Opening commissions in P/L (EA 1.41 fees + entry_fee deals)
- [x] Broker session hours per symbol (EA reports, Auto-Pilot and EA both block)
- [x] Broker candle validation (fallback to Yahoo)
- [x] Automatic comparison with MT5 + "why not trading" health check
- [x] Load test: 40 parallel syncs, each order delivered once, second EA refused
- [x] Market-closed message instead of silence
- [ ] Install/compile EA 1.41 on VPS — blocked: user's Windows VPS
- [x] Verify owner's Auto-Pilot is already enabled with EA 1.41 online.
- [ ] Broker execution demo tests — blocked: supervised MT5 execution/MetaEditor outside this sandbox.

