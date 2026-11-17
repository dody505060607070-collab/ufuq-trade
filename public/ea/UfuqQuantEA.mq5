//+------------------------------------------------------------------+
//|                                              UfuqQuantEA.mq5     |
//|  Ufuq Trade - Quant Portfolio EA v2.00                           |
//|                                                                  |
//|  A rules-only, back-tested portfolio. No AI decides entries.     |
//|  Strategies (all tested 2017-2026 on M1 data with costs):        |
//|   GOLD_TREND     XAUUSD H4  Donchian-55 breakout, D1 EMA200 regime|
//|   GOLD_TREND_H1  XAUUSD H1  Donchian-100 breakout, same regime   |
//|   NAS_TREND      NAS100 H4  Donchian-55, long only above EMA200  |
//|   NAS_TREND_H1   NAS100 H1  Donchian-100, long only              |
//|   SPX_TREND      US500  H4  Donchian-55, long only               |
//|   NAS_DIP        NAS100 D1  RSI(2)<10 above SMA200, exit > SMA5   |
//|   SPX_DIP        US500  D1  same                                 |
//|  Exits: initial stop = k*ATR, chandelier trailing stop, no TP.    |
//|                                                                  |
//|  Install:                                                         |
//|   1. Copy to MQL5/Experts, compile in MetaEditor (F7).            |
//|   2. Tools > Options > Expert Advisors > Allow Algo Trading and   |
//|      add https://ufuq-trade.lovable.app to Allow WebRequest.      |
//|   3. Attach to ONE chart only (any symbol, e.g. XAUUSD H1).       |
//|      It trades all symbols from that one chart.                   |
//|   4. Remove the old ArrissaEA from this account first.            |
//+------------------------------------------------------------------+
#property copyright "Ufuq Trade"
#property version   "2.00"

#include <Trade/Trade.mqh>

//--- Risk
input group "=== Risk ==="
input double InpRiskPct          = 0.75;   // Base risk per trade, % of equity (0.5 safe, 1.0 aggressive)
input double InpMaxOpenRiskPct   = 5.0;    // Max total open risk of all EA trades, % of equity
input double InpDailyLossPct     = 3.0;    // Stop new entries for the day after this % loss (equity vs day start)
input double InpMaxDrawdownPct   = 20.0;   // Kill switch: pause new entries if equity falls this % below its peak
input double InpMinLotTolerance  = 1.5;    // Allow broker min lot if its risk <= this x intended risk, else skip
input double InpMaxSpreadPctStop = 8.0;    // Skip entry while spread > this % of the stop distance
input bool   InpPaused           = false;  // Start paused (no new entries; open trades still managed)

//--- Strategy switches and weights (weight multiplies base risk)
input group "=== Strategies (on/off, weight) ==="
input bool   InpGoldTrend   = true;  input double InpWGoldTrend   = 1.0;
input bool   InpGoldTrendH1 = true;  input double InpWGoldTrendH1 = 0.5;
input bool   InpNasTrend    = true;  input double InpWNasTrend    = 1.0;
input bool   InpNasTrendH1  = true;  input double InpWNasTrendH1  = 0.5;
input bool   InpSpxTrend    = true;  input double InpWSpxTrend    = 0.5;
input bool   InpNasDip      = true;  input double InpWNasDip      = 0.5;
input bool   InpSpxDip      = true;  input double InpWSpxDip      = 0.5;

//--- Symbols: comma separated candidates, first one that exists at the broker is used
input group "=== Broker symbols ==="
input string InpGoldNames = "XAUUSD,XAUUSDm,XAUUSD.,XAUUSD+,XAUUSDc,GOLD,GOLDm";
input string InpNasNames  = "USTEC,USTECm,NAS100,NAS100m,US100,US100m,NDX100,NQ100,USTEC.";
input string InpSpxNames  = "US500,US500m,SPX500,SPX500m,SP500,US500.,SPX";

//--- Filters
input group "=== Filters ==="
input bool   InpNewsFilter     = true;   // Block entries around HIGH impact USD news (MT5 calendar)
input int    InpNewsBeforeMin  = 30;     // minutes before the event
input int    InpNewsAfterMin   = 15;     // minutes after the event
input int    InpNoEntryFromHHMM = 2055;  // Server time: no new entries from (rollover, wide spreads)
input int    InpNoEntryToHHMM   = 2310;  // ... until

//--- Website link (dashboard + remote control). Trading never depends on it.
input group "=== Ufuq Trade website ==="
input bool   InpSyncEnabled  = true;
input string InpUsername     = "";
input string InpApiKey       = "";
input string InpApiUrl       = "https://ufuq-trade.lovable.app/api/public/ea";
input int    InpSyncSeconds  = 10;
input bool   InpRemoteSettings = true;   // Let the website change risk / pause / strategy switches
input bool   InpAcceptSiteTrades = false; // Execute open_trade commands from the old AI Auto-Pilot (keep OFF)
input long   InpMagicBase    = 880100;

//+------------------------------------------------------------------+
enum StratKind { KIND_TREND = 0, KIND_DIP = 1 };

struct Strat
  {
   string            name;
   string            sym;
   ENUM_TIMEFRAMES   tf;
   int               kind;
   int               n;          // Donchian length (trend) / max bars in trade (dip)
   double            slMult;
   double            trailMult;
   bool              allowShort;
   bool              enabled;
   double            weight;
   long              magic;
   datetime          lastBar;
   int               pendDir;    // pending entry direction from the last closed bar
   double            pendAtr;
   datetime          pendUntil;
   string            lastNote;
   ulong             pendClose;  // close that failed and must be retried
   int               tries;      // failed entry attempts for the current signal
   datetime          nextTry;
  };

Strat    S[];
CTrade   trade;
string   g_events[];       // outbox of events for the website
string   g_results[];      // command results for the website
datetime g_lastHistory = 0;
datetime g_lastSync = 0, g_lastQuant = 0;
bool     g_paused = false;
string   g_pauseWhy = "";
double   g_riskPct = 0;
double   g_dailyLossPct = 0;
int      g_failStreak = 0;
bool     g_warned = false;
int      g_syncSkip = 0;   // website down: skip this many sync slots (trading is never blocked)
string   GV_PEAK, GV_DAY, GV_DAYEQ, GV_KILL;

//+------------------------------------------------------------------+
//| Helpers                                                          |
//+------------------------------------------------------------------+
string Num(double v, int d = 5) { return DoubleToString(v, d); }
string Iso(datetime t) { MqlDateTime m; TimeToStruct(t, m); return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ", m.year, m.mon, m.day, m.hour, m.min, m.sec); }
string Esc(string s) { StringReplace(s, "\\", "\\\\"); StringReplace(s, "\"", "\\\""); StringReplace(s, "\n", " "); StringReplace(s, "\r", " "); StringReplace(s, "\t", " "); return s; }
bool   IsTester() { return (bool)MQLInfoInteger(MQL_TESTER) || (bool)MQLInfoInteger(MQL_OPTIMIZATION); }

void Event(string level, string strat, string sym, string msg)
  {
   PrintFormat("[UfuqQuant] %s %s %s: %s", level, strat, sym, msg);
   if(IsTester() || !InpSyncEnabled) return;
   int n = ArraySize(g_events);
   if(n >= 100) { for(int i = 1; i < n; i++) g_events[i - 1] = g_events[i]; n--; ArrayResize(g_events, n); }
   ArrayResize(g_events, n + 1);
   g_events[n] = "{\"at\":\"" + Iso(TimeCurrent()) + "\",\"level\":\"" + level + "\",\"strategy\":\"" + Esc(strat) + "\",\"symbol\":\"" + Esc(sym) + "\",\"message\":\"" + Esc(msg) + "\"}";
  }

string ResolveSymbol(string candidates)
  {
   string parts[];
   int n = StringSplit(candidates, ',', parts);
   for(int i = 0; i < n; i++)
     {
      string s = parts[i];
      StringTrimLeft(s); StringTrimRight(s);
      if(s == "") continue;
      bool custom = false;
      if(SymbolExist(s, custom) && SymbolSelect(s, true)) return s;
     }
   return "";
  }

double NormPrice(string s, double p) { double ts = SymbolInfoDouble(s, SYMBOL_TRADE_TICK_SIZE); if(ts <= 0) ts = SymbolInfoDouble(s, SYMBOL_POINT); return NormalizeDouble(MathRound(p / ts) * ts, (int)SymbolInfoInteger(s, SYMBOL_DIGITS)); }

//--- Wilder ATR (same as the Python backtest: ewm alpha=1/n, adjust=False)
double ATR(string s, ENUM_TIMEFRAMES tf, int shift, int n = 14)
  {
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int need = n * 20 + shift + 2;
   int got = CopyRates(s, tf, shift, need, r);          // oldest first, last element = bar 'shift'
   if(got < n + 2) return 0;
   double a = r[0].high - r[0].low;
   for(int i = 1; i < got; i++)
     {
      double pc = r[i - 1].close;
      double tr = MathMax(r[i].high - r[i].low, MathMax(MathAbs(r[i].high - pc), MathAbs(r[i].low - pc)));
      a += (tr - a) / n;
     }
   return a;
  }

double EMA(string s, ENUM_TIMEFRAMES tf, int shift, int span)
  {
   double c[];
   ArraySetAsSeries(c, false);
   int got = CopyClose(s, tf, shift, span * 5, c);
   if(got < span * 3) return 0;   // need a converged seed
   double k = 2.0 / (span + 1.0), e = c[0];
   for(int i = 1; i < got; i++) e += k * (c[i] - e);
   return e;
  }

double SMA(string s, ENUM_TIMEFRAMES tf, int shift, int n)
  {
   double c[];
   if(CopyClose(s, tf, shift, n, c) < n) return 0;
   double sum = 0; for(int i = 0; i < n; i++) sum += c[i];
   return sum / n;
  }

//--- Wilder RSI
double RSI(string s, ENUM_TIMEFRAMES tf, int shift, int n = 2)
  {
   double c[];
   ArraySetAsSeries(c, false);
   int got = CopyClose(s, tf, shift, 300, c);
   if(got < 50) return 50;
   double up = 0, dn = 0; bool init = false;
   for(int i = 1; i < got; i++)
     {
      double d = c[i] - c[i - 1];
      double u = d > 0 ? d : 0, w = d < 0 ? -d : 0;
      if(!init) { up = u; dn = w; init = true; }
      else { up += (u - up) / n; dn += (w - dn) / n; }
     }
   if(dn <= 0) return 100;
   return 100.0 - 100.0 / (1.0 + up / dn);
  }

double CloseAt(string s, ENUM_TIMEFRAMES tf, int shift) { double c[]; return CopyClose(s, tf, shift, 1, c) == 1 ? c[0] : 0; }

//--- Find this strategy's open position (one per strategy)
ulong FindPos(const Strat &st)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) == st.magic && PositionGetString(POSITION_SYMBOL) == st.sym) return t;
     }
   return 0;
  }

bool IsOurMagic(long m) { return m >= InpMagicBase && m < InpMagicBase + 100; }
string StratByMagic(long m) { for(int i = 0; i < ArraySize(S); i++) if(S[i].magic == m) return S[i].name; return ""; }

//--- Money lost if price moves from 'from' to 'to' with 'lots' (account currency, positive number)
double LossMoney(string s, bool buy, double lots, double from, double to)
  {
   double p = 0;
   if(!OrderCalcProfit(buy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, s, lots, from, to, p)) return -1;
   return MathAbs(p);
  }

double OpenRiskMoney()
  {
   double sum = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || !IsOurMagic(PositionGetInteger(POSITION_MAGIC))) continue;
      string s = PositionGetString(POSITION_SYMBOL);
      bool buy = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY;
      double sl = PositionGetDouble(POSITION_SL), cur = PositionGetDouble(POSITION_PRICE_CURRENT);
      if(sl <= 0) { sum += AccountInfoDouble(ACCOUNT_EQUITY) * g_riskPct / 100.0; continue; }
      if((buy && sl >= cur) || (!buy && sl <= cur)) continue;           // stop already in profit
      double l = LossMoney(s, buy, PositionGetDouble(POSITION_VOLUME), cur, sl);
      if(l > 0) sum += l;
     }
   return sum;
  }

int HHMM(datetime t) { MqlDateTime m; TimeToStruct(t, m); return m.hour * 100 + m.min; }
bool HHMMInWindow(int x)
  {
   if(InpNoEntryFromHHMM <= InpNoEntryToHHMM) return x >= InpNoEntryFromHHMM && x < InpNoEntryToHHMM;
   return x >= InpNoEntryFromHHMM || x < InpNoEntryToHHMM;
  }
bool InNoEntryWindow() { return HHMMInWindow(HHMM(TimeCurrent())); }

//--- High impact USD news within the window? (live only; the calendar is not available in the tester)
bool NewsBlocked(string &why)
  {
   if(!InpNewsFilter || IsTester()) return false;
   static datetime cacheAt = 0; static bool cacheVal = false; static string cacheWhy = "";
   if(TimeCurrent() - cacheAt < 60) { why = cacheWhy; return cacheVal; }
   cacheAt = TimeCurrent(); cacheVal = false; cacheWhy = "";
   MqlCalendarValue v[];
   datetime from = TimeTradeServer() - InpNewsAfterMin * 60, to = TimeTradeServer() + InpNewsBeforeMin * 60;
   if(CalendarValueHistory(v, from, to, NULL, "USD") > 0)
      for(int i = 0; i < ArraySize(v); i++)
        {
         MqlCalendarEvent ev;
         if(CalendarEventById(v[i].event_id, ev) && ev.importance == CALENDAR_IMPORTANCE_HIGH)
           { cacheVal = true; cacheWhy = "High impact USD news: " + ev.name + " at " + TimeToString(v[i].time, TIME_MINUTES); break; }
        }
   why = cacheWhy;
   return cacheVal;
  }

//+------------------------------------------------------------------+
//| Account-level guards                                             |
//+------------------------------------------------------------------+
bool AccountGuards(string &why)
  {
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   // day start equity (server day)
   MqlDateTime m; TimeToStruct(TimeCurrent(), m);
   double dayKey = m.year * 10000 + m.mon * 100 + m.day;
   if(GlobalVariableGet(GV_DAY) != dayKey) { GlobalVariableSet(GV_DAY, dayKey); GlobalVariableSet(GV_DAYEQ, eq); }
   double dayEq = GlobalVariableGet(GV_DAYEQ);
   // equity peak + kill switch
   double peak = GlobalVariableCheck(GV_PEAK) ? GlobalVariableGet(GV_PEAK) : 0;
   if(eq > peak) { GlobalVariableSet(GV_PEAK, eq); peak = eq; }
   if(GlobalVariableCheck(GV_KILL) && GlobalVariableGet(GV_KILL) > 0) { why = "Kill switch active (drawdown limit hit). Resume from the website or remove GlobalVariable " + GV_KILL; return false; }
   if(peak > 0 && eq < peak * (1.0 - InpMaxDrawdownPct / 100.0))
     {
      GlobalVariableSet(GV_KILL, 1);
      why = StringFormat("Drawdown %.1f%% from peak %.2f - kill switch ON", (1 - eq / peak) * 100, peak);
      Event("error", "", "", why);
      return false;
     }
   if(dayEq > 0 && eq < dayEq * (1.0 - g_dailyLossPct / 100.0)) { why = StringFormat("Daily loss limit %.1f%% reached", g_dailyLossPct); return false; }
   if(g_paused) { why = "Paused" + (g_pauseWhy != "" ? ": " + g_pauseWhy : ""); return false; }
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) { why = "Algo Trading is disabled in MT5"; return false; }
   return true;
  }

//+------------------------------------------------------------------+
//| Signals (evaluated on the last CLOSED bar = shift 1)             |
//+------------------------------------------------------------------+
int TrendSignal(const Strat &st)
  {
   double c1 = CloseAt(st.sym, st.tf, 1);
   int ih = iHighest(st.sym, st.tf, MODE_HIGH, st.n, 2), il = iLowest(st.sym, st.tf, MODE_LOW, st.n, 2);
   if(c1 <= 0 || ih < 0 || il < 0) return 0;
   double hh = iHigh(st.sym, st.tf, ih), ll = iLow(st.sym, st.tf, il);
   int ds = iBarShift(st.sym, PERIOD_D1, iTime(st.sym, st.tf, 1), false) + 1;   // the day BEFORE the signal bar
   if(ds < 1) return 0;
   double dClose = CloseAt(st.sym, PERIOD_D1, ds), dEma = EMA(st.sym, PERIOD_D1, ds, 200);
   if(dClose <= 0 || dEma <= 0) return 0;
   int regime = dClose > dEma ? 1 : (dClose < dEma ? -1 : 0);
   if(c1 > hh && regime > 0) return 1;
   if(c1 < ll && regime < 0 && st.allowShort) return -1;
   return 0;
  }

int DipSignal(const Strat &st)
  {
   double c1 = CloseAt(st.sym, st.tf, 1), sma = SMA(st.sym, st.tf, 1, 200), r = RSI(st.sym, st.tf, 1, 2);
   if(c1 <= 0 || sma <= 0) return 0;
   return (c1 > sma && r < 10) ? 1 : 0;
  }

//+------------------------------------------------------------------+
//| Position management on each new closed bar                       |
//+------------------------------------------------------------------+
void ManageOnNewBar(Strat &st, ulong ticket, int sig)
  {
   if(!PositionSelectByTicket(ticket)) return;
   bool buy = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY;
   int dir = buy ? 1 : -1;
   datetime opened = (datetime)PositionGetInteger(POSITION_TIME);
   int entryShift = iBarShift(st.sym, st.tf, opened, false);   // bar in which we entered
   double sl = PositionGetDouble(POSITION_SL), tp = PositionGetDouble(POSITION_TP);

   if(st.kind == KIND_TREND)
     {
      if(sig == -dir)
        {
         if(trade.PositionClose(ticket)) Event("info", st.name, st.sym, "Opposite breakout - closed to reverse");
         else st.pendClose = ticket;
         return;
        }
      if(entryShift >= 1)
        {
         // chandelier: best close since entry (inclusive of the entry bar) - trail x ATR
         double best = PositionGetDouble(POSITION_PRICE_OPEN);   // backtest starts 'best' at the entry price
         for(int k = 1; k <= entryShift; k++)
           {
            double c = CloseAt(st.sym, st.tf, k);
            if(c <= 0) continue;
            if(best == 0 || (buy && c > best) || (!buy && c < best)) best = c;
           }
         double a = ATR(st.sym, st.tf, 1);
         if(best > 0 && a > 0)
           {
            double ns = NormPrice(st.sym, best - dir * st.trailMult * a);
            double px = buy ? SymbolInfoDouble(st.sym, SYMBOL_BID) : SymbolInfoDouble(st.sym, SYMBOL_ASK);
            double lvl = (SymbolInfoInteger(st.sym, SYMBOL_TRADE_STOPS_LEVEL) + 1) * SymbolInfoDouble(st.sym, SYMBOL_POINT);
            bool better = sl <= 0 || (buy && ns > sl + SymbolInfoDouble(st.sym, SYMBOL_POINT)) || (!buy && ns < sl - SymbolInfoDouble(st.sym, SYMBOL_POINT));
            bool valid = buy ? ns < px - lvl : ns > px + lvl;
            if(better && !valid)
              {
               // trailing level is already through price: exit like the backtest would
               if(trade.PositionClose(ticket)) Event("info", st.name, st.sym, "Trailing stop crossed at bar close - closed");
               else st.pendClose = ticket;
              }
            else if(better && trade.PositionModify(ticket, ns, tp))
               st.lastNote = "Trail stop -> " + DoubleToString(ns, (int)SymbolInfoInteger(st.sym, SYMBOL_DIGITS));
           }
        }
     }
   else // KIND_DIP
     {
      if(entryShift >= 1)
        {
         double c1 = CloseAt(st.sym, st.tf, 1), s5 = SMA(st.sym, st.tf, 1, 5);
         if(c1 > 0 && s5 > 0 && c1 > s5) { if(trade.PositionClose(ticket)) Event("info", st.name, st.sym, "Close above SMA5 - target exit"); else st.pendClose = ticket; return; }
         if(entryShift >= st.n) { if(trade.PositionClose(ticket)) Event("info", st.name, st.sym, "Time exit after " + IntegerToString(st.n) + " bars"); else st.pendClose = ticket; return; }
        }
     }
  }

//+------------------------------------------------------------------+
//| Entry                                                            |
//+------------------------------------------------------------------+
void TryEntry(Strat &st)
  {
   if(st.pendDir == 0) return;
   if(TimeCurrent() < st.nextTry) return;
   if(TimeCurrent() > st.pendUntil) { st.lastNote = "Signal expired (guards never cleared)"; Event("warn", st.name, st.sym, st.lastNote); st.pendDir = 0; return; }
   string why;
   if(!AccountGuards(why)) { st.lastNote = "Waiting: " + why; return; }
   if(InNoEntryWindow()) { st.lastNote = "Waiting: rollover window"; return; }
   if(NewsBlocked(why)) { st.lastNote = "Waiting: " + why; return; }
   if(SymbolInfoInteger(st.sym, SYMBOL_TRADE_MODE) != SYMBOL_TRADE_MODE_FULL &&
      !(st.pendDir > 0 && SymbolInfoInteger(st.sym, SYMBOL_TRADE_MODE) == SYMBOL_TRADE_MODE_LONGONLY))
     { st.lastNote = "Waiting: symbol not fully tradable"; return; }
   MqlTick tk;
   if(!SymbolInfoTick(st.sym, tk) || TimeCurrent() - tk.time > 300) { st.lastNote = "Waiting: no fresh price (market closed?)"; return; }

   bool buy = st.pendDir > 0;
   double px = buy ? tk.ask : tk.bid;
   double dist = st.slMult * st.pendAtr;
   double spread = tk.ask - tk.bid;
   if(dist <= 0) { st.pendDir = 0; return; }
   if(spread > dist * InpMaxSpreadPctStop / 100.0) { st.lastNote = StringFormat("Waiting: spread %.5g > %.1f%% of stop", spread, InpMaxSpreadPctStop); return; }

   double sl = NormPrice(st.sym, buy ? tk.bid - dist : tk.ask + dist);   // long stops trigger on bid, short on ask
   double lvl = (SymbolInfoInteger(st.sym, SYMBOL_TRADE_STOPS_LEVEL) + 1) * SymbolInfoDouble(st.sym, SYMBOL_POINT);
   if(MathAbs(px - sl) < lvl) { st.lastNote = "Skip: stop inside broker stop level"; st.pendDir = 0; return; }

   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   double riskMoney = eq * g_riskPct / 100.0 * st.weight;
   double perLot = LossMoney(st.sym, buy, 1.0, px, sl);
   if(perLot <= 0) { st.lastNote = "Skip: cannot price the stop"; st.pendDir = 0; return; }
   double step = SymbolInfoDouble(st.sym, SYMBOL_VOLUME_STEP), vmin = SymbolInfoDouble(st.sym, SYMBOL_VOLUME_MIN), vmax = SymbolInfoDouble(st.sym, SYMBOL_VOLUME_MAX);
   double lots = MathFloor(riskMoney / perLot / step) * step;
   if(lots < vmin)
     {
      if(vmin * perLot <= riskMoney * InpMinLotTolerance) lots = vmin;
      else
        {
         st.lastNote = StringFormat("Skip: min lot %.2f risks %.2f, budget %.2f. Account too small for %s (use a cent account or lower weight)", vmin, vmin * perLot, riskMoney, st.sym);
         Event("warn", st.name, st.sym, st.lastNote);
         st.pendDir = 0; return;
        }
     }
   lots = MathMin(lots, vmax);
   int vd = (int)MathMax(0, MathRound(-MathLog10(step)));
   lots = NormalizeDouble(lots, vd);
   double thisRisk = lots * perLot;
   if((OpenRiskMoney() + thisRisk) > eq * InpMaxOpenRiskPct / 100.0) { st.lastNote = "Waiting: portfolio open-risk cap"; return; }
   double margin = 0;
   if(!OrderCalcMargin(buy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, st.sym, lots, px, margin) || margin > AccountInfoDouble(ACCOUNT_MARGIN_FREE) * 0.8)
     { st.lastNote = "Waiting: not enough free margin"; return; }

   trade.SetExpertMagicNumber(st.magic);
   trade.SetTypeFillingBySymbol(st.sym);
   string cm = "UQ:" + st.name;
   bool ok = buy ? trade.Buy(lots, st.sym, 0, sl, 0, cm) : trade.Sell(lots, st.sym, 0, sl, 0, cm);
   if(ok && (trade.ResultRetcode() == TRADE_RETCODE_DONE || trade.ResultRetcode() == TRADE_RETCODE_PLACED))
     {
      st.lastNote = StringFormat("%s %.2f @ %s SL %s risk %.2f", buy ? "BUY" : "SELL", lots, DoubleToString(trade.ResultPrice(), (int)SymbolInfoInteger(st.sym, SYMBOL_DIGITS)), DoubleToString(sl, (int)SymbolInfoInteger(st.sym, SYMBOL_DIGITS)), thisRisk);
      Event("trade", st.name, st.sym, st.lastNote);
      st.pendDir = 0; st.tries = 0;
     }
   else
     {
      uint rc = trade.ResultRetcode();
      bool permanent = rc == TRADE_RETCODE_NO_MONEY || rc == TRADE_RETCODE_INVALID_VOLUME || rc == TRADE_RETCODE_INVALID_STOPS ||
                       rc == TRADE_RETCODE_TRADE_DISABLED || rc == TRADE_RETCODE_LIMIT_VOLUME || rc == TRADE_RETCODE_LIMIT_POSITIONS;
      st.tries++;
      st.nextTry = TimeCurrent() + 30;
      st.lastNote = "Order failed: " + trade.ResultRetcodeDescription();
      if(permanent || st.tries >= 3) { st.lastNote += " - signal dropped"; st.pendDir = 0; st.tries = 0; }
      else st.lastNote += " - retry in 30s";
      Event("error", st.name, st.sym, st.lastNote);
     }
  }

//+------------------------------------------------------------------+
//| Main loop for one strategy                                       |
//+------------------------------------------------------------------+
void RunStrategy(Strat &st)
  {
   if(st.sym == "") return;
   datetime b0 = iTime(st.sym, st.tf, 0);
   if(b0 == 0) return;
   if(st.pendClose > 0)
     {
      if(!PositionSelectByTicket(st.pendClose)) st.pendClose = 0;                 // already gone
      else if(trade.PositionClose(st.pendClose)) { Event("info", st.name, st.sym, "Retried close succeeded"); st.pendClose = 0; }
      else return;                                                                // keep trying, no new entries meanwhile
     }
   ulong pos = FindPos(st);
   if(b0 != st.lastBar)
     {
      bool first = st.lastBar == 0;
      st.lastBar = b0;
      int sig = st.kind == KIND_TREND ? TrendSignal(st) : DipSignal(st);
      if(pos > 0) ManageOnNewBar(st, pos, sig);
      pos = FindPos(st);
      if(!st.enabled) { st.pendDir = 0; }
      else if(pos == 0 && sig != 0 && !first)   // never act on a stale signal right after (re)start
        {
         st.pendDir = sig;
         st.pendAtr = ATR(st.sym, st.tf, 1);
         st.pendUntil = b0 + (int)MathMin(PeriodSeconds(st.tf) / 2, 4 * 3600);
         st.tries = 0; st.nextTry = 0;
         // the backtest takes signals from late bars too: if the validity overlaps the rollover window, extend it past the window
         for(datetime x = b0; x <= st.pendUntil; x += 300)
            if(HHMMInWindow(HHMM(x))) { st.pendUntil += 150 * 60; break; }
         Event("signal", st.name, st.sym, (sig > 0 ? "Long" : "Short") + string(" signal on bar close"));
        }
      else if(pos == 0 && sig != 0 && first) st.lastNote = "Signal present at start-up - waiting for the next fresh one";
     }
   if(pos == 0 && st.pendDir != 0 && st.enabled) TryEntry(st);
  }

//+------------------------------------------------------------------+
//| Website link                                                     |
//+------------------------------------------------------------------+
string PositionsJson()
  {
   string b = "[";
   bool first = true;
   for(int i = 0; i < PositionsTotal(); i++)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(!first) b += ",";
      first = false;
      b += "{\"ticket\":\"" + IntegerToString((long)PositionGetInteger(POSITION_IDENTIFIER)) + "\",";
      b += "\"symbol\":\"" + Esc(PositionGetString(POSITION_SYMBOL)) + "\",";
      b += "\"side\":\"" + (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "buy" : "sell") + "\",";
      b += "\"volume\":" + Num(PositionGetDouble(POSITION_VOLUME), 3) + ",";
      b += "\"open_price\":" + Num(PositionGetDouble(POSITION_PRICE_OPEN)) + ",";
      b += "\"stop_loss\":" + Num(PositionGetDouble(POSITION_SL)) + ",";
      b += "\"take_profit\":" + Num(PositionGetDouble(POSITION_TP)) + ",";
      b += "\"profit\":" + Num(PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP), 2) + ",";
      b += "\"opened_at\":\"" + Iso((datetime)PositionGetInteger(POSITION_TIME)) + "\"}";
     }
   return b + "]";
  }

string ClosedJson()
  {
   string b = "[";
   bool first = true;
   if(HistorySelect(g_lastHistory, TimeCurrent() + 60))
     {
      int deals = HistoryDealsTotal();
      for(int i = deals - 1; i >= 0 && i >= deals - 400; i--)   // newest first
        {
         ulong d = HistoryDealGetTicket(i);
         if(d == 0) continue;
         long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
         if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) continue;
         long dtype = HistoryDealGetInteger(d, DEAL_TYPE);
         if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL) continue;
         if(!first) b += ",";
         first = false;
         double pl = HistoryDealGetDouble(d, DEAL_PROFIT) + HistoryDealGetDouble(d, DEAL_SWAP) + HistoryDealGetDouble(d, DEAL_COMMISSION);
         b += "{\"ticket\":\"" + IntegerToString(HistoryDealGetInteger(d, DEAL_POSITION_ID)) + "\",";
         b += "\"symbol\":\"" + Esc(HistoryDealGetString(d, DEAL_SYMBOL)) + "\",";
         b += "\"side\":\"" + (dtype == DEAL_TYPE_SELL ? "buy" : "sell") + "\",";
         b += "\"volume\":" + Num(HistoryDealGetDouble(d, DEAL_VOLUME), 3) + ",";
         b += "\"close_price\":" + Num(HistoryDealGetDouble(d, DEAL_PRICE)) + ",";
         b += "\"profit\":" + Num(pl, 2) + ",";
         b += "\"closed_at\":\"" + Iso((datetime)HistoryDealGetInteger(d, DEAL_TIME)) + "\"}";
        }
     }
   return b + "]";
  }

int Post(string path, string body, string &text)
  {
   char data[], result[];
   int n = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(data, MathMax(0, n - 1));
   string headers = "Content-Type: application/json\r\nX-API-Key: " + InpApiKey + "\r\nX-Username: " + InpUsername + "\r\n";
   string resHeaders;
   ResetLastError();
   int code = WebRequest("POST", InpApiUrl + path, headers, 5000, data, result, resHeaders);
   text = code == -1 ? "" : CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   if(code == -1 && !g_warned) { g_warned = true; Alert("UfuqQuantEA: add ", InpApiUrl, " to Tools > Options > Expert Advisors > Allow WebRequest. Trading continues without the website. Error ", GetLastError()); }
   return code;
  }

void PushResult(string id, bool ok, string msg)
  {
   int n = ArraySize(g_results); ArrayResize(g_results, n + 1);
   g_results[n] = "{\"id\":\"" + id + "\",\"status\":\"" + (ok ? "done" : "failed") + "\",\"result\":\"" + Esc(StringSubstr(msg, 0, 400)) + "\"}";
  }

int CloseAllOurs()
  {
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t > 0 && IsOurMagic(PositionGetInteger(POSITION_MAGIC)) && trade.PositionClose(t)) n++;
     }
   return n;
  }

void ExecuteCommand(string &f[])
  {
   string id = f[1], cmd = f[2];
   ulong ticket = (ulong)StringToInteger(f[13]);
   if(cmd == "close_all")    { PushResult(id, true, "Closed " + IntegerToString(CloseAllOurs()) + " Quant EA trades"); return; }
   if(cmd == "close_trade")
     {
      // the website sends the position identifier
      bool ok = false;
      for(int i = PositionsTotal() - 1; i >= 0; i--)
        {
         ulong t = PositionGetTicket(i);
         if(t > 0 && (ulong)PositionGetInteger(POSITION_IDENTIFIER) == ticket) { ok = trade.PositionClose(t); break; }
        }
      PushResult(id, ok, ok ? "Closed #" + IntegerToString((long)ticket) : "Not closed: " + trade.ResultRetcodeDescription());
      return;
     }
   if(cmd == "quant_pause")  { g_paused = true;  g_pauseWhy = "from website"; PushResult(id, true, "Paused"); Event("info", "", "", "Paused from website"); return; }
   if(cmd == "quant_resume") { g_paused = false; g_pauseWhy = ""; GlobalVariableSet(GV_KILL, 0); GlobalVariableSet(GV_PEAK, AccountInfoDouble(ACCOUNT_EQUITY)); PushResult(id, true, "Resumed (kill switch reset)"); Event("info", "", "", "Resumed from website"); return; }
   if(cmd == "open_trade" && !InpAcceptSiteTrades) { PushResult(id, false, "Quant EA ignores AI open_trade commands (InpAcceptSiteTrades=false)"); return; }
   PushResult(id, false, "Command not supported by Quant EA: " + cmd);
  }

void ApplySetting(string key, string val)
  {
   if(!InpRemoteSettings) return;
   if(key == "risk_pct")       { double v = StringToDouble(val); if(v > 0 && v <= 3.0) g_riskPct = v; return; }
   if(key == "daily_loss_pct") { double v = StringToDouble(val); if(v > 0 && v <= 20.0) g_dailyLossPct = v; return; }
   if(key == "paused")         { bool p = val == "1"; if(p != g_paused) { g_paused = p; g_pauseWhy = p ? "website setting" : ""; Event("info", "", "", p ? "Paused by website setting" : "Resumed by website setting"); } return; }
   if(StringFind(key, "enabled_") == 0)
     {
      string nm = StringSubstr(key, 8);
      for(int i = 0; i < ArraySize(S); i++) if(S[i].name == nm) S[i].enabled = val == "1";
     }
  }

void SyncWebsite()
  {
   if(!InpSyncEnabled || IsTester() || InpApiKey == "" || InpUsername == "") return;
   if(g_syncSkip > 0) { g_syncSkip--; return; }
   // 1) Standard sync: keeps the existing dashboard (balance, positions, closed trades) and commands working.
   string body = "{\"account\":{";
   body += "\"login\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\",";
   body += "\"server\":\"" + Esc(AccountInfoString(ACCOUNT_SERVER)) + "\",";
   body += "\"company\":\"" + Esc(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   body += "\"currency\":\"" + Esc(AccountInfoString(ACCOUNT_CURRENCY)) + "\",";
   body += "\"balance\":" + Num(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   body += "\"equity\":" + Num(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   body += "\"free_margin\":" + Num(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) + ",";
   body += "\"leverage\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + "},";
   body += "\"positions\":" + PositionsJson() + ",\"closed\":" + ClosedJson() + ",\"results\":[";
   for(int i = 0; i < ArraySize(g_results); i++) { if(i > 0) body += ","; body += g_results[i]; }
   body += "]}";
   string text;
   int code = Post("/sync?format=text", body, text);
   if(code != 200) { g_failStreak++; g_syncSkip = (int)MathMin(12, g_failStreak); if(g_failStreak % 20 == 1) Print("UfuqQuantEA: website sync failed (", code, ") ", StringSubstr(text, 0, 200), " - trading continues."); return; }
   g_failStreak = 0;
   ArrayResize(g_results, 0);
   g_lastHistory = TimeCurrent() - 120;
   string lines[];
   StringReplace(text, "\r", "");
   int cnt = StringSplit(text, '\n', lines);
   for(int i = 0; i < cnt; i++)
     {
      string f[];
      if(StringSplit(lines[i], '|', f) >= 15 && f[0] == "C") ExecuteCommand(f);
     }
  }

void SyncQuant()
  {
   if(!InpSyncEnabled || IsTester() || InpApiKey == "" || InpUsername == "" || g_failStreak > 0) return;
   string why = "";
   bool ok = AccountGuards(why);
   string b = "{\"login\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\",\"ea_version\":\"2.00\",";
   b += "\"status\":{\"trading\":" + (ok ? "true" : "false") + ",\"paused\":" + (g_paused ? "true" : "false") + ",\"reason\":\"" + Esc(why) + "\",\"risk_pct\":" + Num(g_riskPct, 2) + ",\"daily_loss_pct\":" + Num(g_dailyLossPct, 2);
   b += ",\"equity\":" + Num(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",\"peak\":" + Num(GlobalVariableGet(GV_PEAK), 2) + ",\"day_start\":" + Num(GlobalVariableGet(GV_DAYEQ), 2) + ",\"open_risk\":" + Num(OpenRiskMoney(), 2) + "},";
   b += "\"strategies\":[";
   for(int i = 0; i < ArraySize(S); i++)
     {
      if(i > 0) b += ",";
      b += "{\"name\":\"" + S[i].name + "\",\"symbol\":\"" + Esc(S[i].sym) + "\",\"timeframe\":\"" + EnumToString(S[i].tf) + "\",\"enabled\":" + (S[i].enabled ? "true" : "false");
      b += ",\"weight\":" + Num(S[i].weight, 2) + ",\"pending\":" + IntegerToString(S[i].pendDir) + ",\"note\":\"" + Esc(S[i].lastNote) + "\",\"magic\":" + IntegerToString(S[i].magic) + "}";
     }
   b += "],\"tags\":[";
   bool first = true;
   for(int i = 0; i < PositionsTotal(); i++)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || !IsOurMagic(PositionGetInteger(POSITION_MAGIC))) continue;
      if(!first) b += ",";
      first = false;
      b += "{\"ticket\":\"" + IntegerToString((long)PositionGetInteger(POSITION_IDENTIFIER)) + "\",\"strategy\":\"" + StratByMagic(PositionGetInteger(POSITION_MAGIC)) + "\"}";
     }
   b += "],\"events\":[";
   for(int i = 0; i < ArraySize(g_events); i++) { if(i > 0) b += ","; b += g_events[i]; }
   b += "]}";
   string text;
   int code = Post("/quant?format=text", b, text);
   if(code != 200) return;
   ArrayResize(g_events, 0);
   string lines[];
   StringReplace(text, "\r", "");
   int cnt = StringSplit(text, '\n', lines);
   for(int i = 0; i < cnt; i++)
     {
      string f[];
      if(StringSplit(lines[i], '|', f) >= 3 && f[0] == "S") ApplySetting(f[1], f[2]);
     }
  }

//+------------------------------------------------------------------+
//| Chart panel                                                      |
//+------------------------------------------------------------------+
void Panel()
  {
   if(IsTester() && !MQLInfoInteger(MQL_VISUAL_MODE)) return;
   string why = "";
   bool ok = AccountGuards(why);
   string s = "Ufuq Quant EA v2.00   risk " + DoubleToString(g_riskPct, 2) + "%   " + (ok ? "TRADING" : "NO NEW ENTRIES: " + why) + "\n";
   s += StringFormat("Equity %.2f   peak %.2f   day start %.2f   open risk %.2f\n", AccountInfoDouble(ACCOUNT_EQUITY), GlobalVariableGet(GV_PEAK), GlobalVariableGet(GV_DAYEQ), OpenRiskMoney());
   for(int i = 0; i < ArraySize(S); i++)
      s += StringFormat("%-14s %-10s %-4s %s  %s\n", S[i].name, S[i].sym == "" ? "(missing)" : S[i].sym, StringSubstr(EnumToString(S[i].tf), 7), S[i].enabled ? "on " : "off", S[i].lastNote);
   Comment(s);
  }

//+------------------------------------------------------------------+
void AddStrat(string name, string sym, ENUM_TIMEFRAMES tf, int kind, int n, double sl, double trail, bool shortOk, bool en, double w)
  {
   int k = ArraySize(S); ArrayResize(S, k + 1);
   S[k].name = name; S[k].sym = sym; S[k].tf = tf; S[k].kind = kind; S[k].n = n; S[k].slMult = sl; S[k].trailMult = trail;
   S[k].allowShort = shortOk; S[k].enabled = en && sym != ""; S[k].weight = w; S[k].magic = InpMagicBase + k;
   S[k].lastBar = 0; S[k].pendDir = 0; S[k].pendAtr = 0; S[k].pendUntil = 0; S[k].pendClose = 0; S[k].tries = 0; S[k].nextTry = 0;
   S[k].lastNote = sym == "" ? "Symbol not found at this broker - edit Broker symbols input" : "Ready";
  }

int OnInit()
  {
   if(AccountInfoInteger(ACCOUNT_MARGIN_MODE) != ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
     {
      Alert("UfuqQuantEA needs a HEDGING account (several strategies trade the same symbol). This account is netting.");
      return INIT_FAILED;
     }
   g_lastHistory = TimeCurrent() - 7 * 86400;
   g_riskPct = InpRiskPct; g_dailyLossPct = InpDailyLossPct; g_paused = InpPaused;
   string login = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   GV_PEAK = "UQ_peak_" + login; GV_DAY = "UQ_day_" + login; GV_DAYEQ = "UQ_dayeq_" + login; GV_KILL = "UQ_kill_" + login;
   if(IsTester()) { GlobalVariableDel(GV_PEAK); GlobalVariableDel(GV_DAY); GlobalVariableDel(GV_DAYEQ); GlobalVariableDel(GV_KILL); }
   trade.SetDeviationInPoints(50);

   string gold = ResolveSymbol(InpGoldNames), nas = ResolveSymbol(InpNasNames), spx = ResolveSymbol(InpSpxNames);
   ArrayResize(S, 0);
   //       name            symbol tf          kind        n    sl   trail short  enabled         weight
   AddStrat("GOLD_TREND",    gold, PERIOD_H4, KIND_TREND, 55,  2.0, 3.0, true,  InpGoldTrend,   InpWGoldTrend);
   AddStrat("GOLD_TREND_H1", gold, PERIOD_H1, KIND_TREND, 100, 2.0, 3.0, true,  InpGoldTrendH1, InpWGoldTrendH1);
   AddStrat("NAS_TREND",     nas,  PERIOD_H4, KIND_TREND, 55,  2.0, 3.0, false, InpNasTrend,    InpWNasTrend);
   AddStrat("NAS_TREND_H1",  nas,  PERIOD_H1, KIND_TREND, 100, 2.0, 3.0, false, InpNasTrendH1,  InpWNasTrendH1);
   AddStrat("SPX_TREND",     spx,  PERIOD_H4, KIND_TREND, 55,  2.0, 3.0, false, InpSpxTrend,    InpWSpxTrend);
   AddStrat("NAS_DIP",       nas,  PERIOD_D1, KIND_DIP,   10,  3.0, 0.0, false, InpNasDip,      InpWNasDip);
   AddStrat("SPX_DIP",       spx,  PERIOD_D1, KIND_DIP,   10,  3.0, 0.0, false, InpSpxDip,      InpWSpxDip);

   for(int i = 0; i < ArraySize(S); i++)
      if(S[i].sym == "") Print("UfuqQuantEA: ", S[i].name, " disabled - no matching symbol. Add your broker's name to the Broker symbols inputs.");
   PrintFormat("UfuqQuantEA started. Gold=%s  Nasdaq=%s  S&P=%s  risk=%.2f%%", gold, nas, spx, g_riskPct);
   EventSetTimer(IsTester() ? 60 : 5);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason) { EventKillTimer(); Comment(""); }

void Cycle()
  {
   for(int i = 0; i < ArraySize(S); i++) RunStrategy(S[i]);
   datetime now = TimeLocal();
   if(now - g_lastSync >= InpSyncSeconds) { g_lastSync = now; SyncWebsite(); }
   if(now - g_lastQuant >= 60) { g_lastQuant = now; SyncQuant(); }
   Panel();
  }

void OnTimer() { Cycle(); }
void OnTick()  { if(IsTester()) Cycle(); }   // in the tester ticks drive the loop too
//+------------------------------------------------------------------+
