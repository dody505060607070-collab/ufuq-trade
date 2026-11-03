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
- [x] Oct 27 links: add multi-candle patterns + Stochastic + Bollinger as demo-challenge evidence votes (strategy v2), tests added.
- [x] Audit the 00:35 real command using read-only production records, trace simulator isolation and permissions, verify $100/2% background operation, run 22 isolated tests, and deliver an evidence/limitations report. Applies to all three uploaded messages on Oct 27. No trading changes or manual cycles.
- [ ] Enforce simulator capability isolation, separate shared analysis, and correct live grants/ownership policies — blocked: user approval required before changes affecting real trading/access; audit only was requested.
- [x] Use 0.02 for new account/settings forms and save lot edits when leaving the field.
- [ ] Update and verify the requesting user's existing lot — blocked: no matching authenticated account; user must sign in.
- [x] Add OAuth-only read-only assistant tools, consent, revocation, and browser-local settings read.
- [ ] Verify approved/denied OAuth flow with real assistant — blocked: requesting user session and external OAuth client required; republish needed.
- [x] Run basic security review, harden redirect handling, and verify anonymous MCP requests are refused.
- [ ] Complete remaining security review — blocked: deep scan is running; findings need its report before further changes.

# Server request (Oct 27 21:27)
- [x] Read full server.log, check VPS reachability, challenge + MT5 status, deliver Windows repair kit.
- [ ] Run kit on the VPS — blocked: no remote-desktop tool from here; user runs it.

# Nov 3 — Fast execution + Evolution Lab (Ufuq_Trading_Evolution_and_Fast_Execution.md)
- [x] EA 1.60: confirmed closes, $ profit close independent of Auto-protect, no Sleep in the command loop, OnTick local work, execution timings
- [x] Fast scalping (local M1 breakout, time exit, magic+1), website S/B lines, on for both Exness demo accounts at user request
- [x] Evolution Lab (evolve → validate → test once vs 1,000 random) + live scalp results + timing report page
- [ ] Install EA 1.60 on both terminals — blocked: user must download and attach it on the VPS
- [ ] Judge results after 4 days — blocked: needs live trading time
