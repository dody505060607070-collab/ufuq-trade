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
- [ ] Audit the 00:35 real command using read-only production records, trace simulator isolation and permissions, verify $100/2% background operation, run only isolated tests, and report proven facts separately from limitations. Applies to all three uploaded messages on Oct 27.
- [x] Use 0.02 for new account/settings forms and save lot edits when leaving the field.
- [ ] Update and verify the requesting user's existing lot — blocked: no matching authenticated account; user must sign in.
- [x] Add OAuth-only read-only assistant tools, consent, revocation, and browser-local settings read.
- [ ] Verify approved/denied OAuth flow with real assistant — blocked: requesting user session and external OAuth client required; republish needed.
- [x] Run basic security review, harden redirect handling, and verify anonymous MCP requests are refused.
- [ ] Complete remaining security review — blocked: deep scan is running; findings need its report before further changes.
