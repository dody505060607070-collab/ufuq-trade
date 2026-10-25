//+------------------------------------------------------------------+
//| ArrissaEA.mq5 — connects MetaTrader 5 to the Arrissa platform    |
//| 1. Tools > Options > Expert Advisors > Allow WebRequest for URL: |
//|    add your API URL (shown in Arrissa > MT5 EA Configuration).   |
//| 2. Compile in MetaEditor, attach to any chart, fill the inputs,  |
//|    enable Algo Trading.                                          |
//+------------------------------------------------------------------+
#property copyright "Arrissa"
#property version   "1.41"
#property strict

#include <Trade/Trade.mqh>

input string InpUsername    = "";                                              // Arrissa username
input string InpApiKey      = "";                                              // Arrissa API key
input string InpApiUrl      = "https://build-log-fix-friend.lovable.app/api/public/ea"; // API URL
input int    InpSyncSeconds = 2;                                               // Sync interval (seconds)
input long   InpMagic       = 777001;                                          // Magic number
input int    InpSlippage    = 30;                                              // Max slippage (points)

CTrade   trade;
datetime g_lastHistory = 0;
datetime g_histNext = 0;      // when a history page was cut, resume from here
string   g_results[];
string   g_fired[];
double   g_capLoss = 0;       // negative amount; 0 = off
double   g_trailStart = 0;    // profit that arms the trail; 0 = off
double   g_trailPeak = 0;
bool     g_trailArmed = false;
string   g_watchId[];
string   g_watchSym[];
double   g_watchPrice[];
int      g_watchSide[];       // -1 = price was below level, +1 = above, 0 = unknown
bool     g_warned = false;
int      g_syncCount = 0;
string   g_executor = "";     // unique id of this EA instance (account ownership on the server)
bool     g_execAllowed = true; // false while the server says another instance owns this account
#define  EA_VERSION "1.41"
#define  PROTOCOL   2
input string InpDataSymbol  = "XAUUSD";                                        // Symbol whose broker data is sent for analysis
input bool   InpProtect     = true;                                            // Auto-protect trades: half close + breakeven at 1R, trail after 1.5R

//+------------------------------------------------------------------+
int OnInit()
  {
   if(StringLen(InpUsername) == 0 || StringLen(InpApiKey) == 0)
     {
      Alert("ArrissaEA: enter your Arrissa Username and API Key in the Inputs tab.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippage);
   g_lastHistory = TimeCurrent() - 3 * 86400;
   MathSrand((uint)GetTickCount());
   g_executor = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "-" + IntegerToString((long)ChartID()) + "-" + IntegerToString((long)GetTickCount()) + "-" + IntegerToString(MathRand());
   EventSetTimer(MathMax(1, InpSyncSeconds));
   Print("ArrissaEA started for account ", AccountInfoInteger(ACCOUNT_LOGIN));
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason) { EventKillTimer(); }

void OnTimer()
  {
   CheckCapTrail();
   ProtectPositions();
   CheckWatches();
   Sync();
  }

//+------------------------------------------------------------------+
//| Helpers                                                          |
//+------------------------------------------------------------------+
string Esc(string s)
  {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\n", " ");
   StringReplace(s, "\r", " ");
   return s;
  }

string Iso(datetime serverTime)
  {
   long offset = (long)(TimeTradeServer() - TimeGMT());
   offset = (long)MathRound(offset / 1800.0) * 1800;   // round to 30 min
   datetime utc = (datetime)(serverTime - offset);
   string s = TimeToString(utc, TIME_DATE | TIME_SECONDS);
   StringReplace(s, ".", "-");
   StringReplace(s, " ", "T");
   return s + "Z";
  }

string Num(double v, int digits = 5) { return DoubleToString(v, digits); }

void PushStatus(string id, string status, string msg, int filled = -1)
  {
   int n = ArraySize(g_results);
   ArrayResize(g_results, n + 1);
   g_results[n] = "{\"id\":\"" + id + "\",\"status\":\"" + status + "\",\"result\":\"" + Esc(StringSubstr(msg, 0, 400)) + "\"" + (filled >= 0 ? ",\"filled\":" + IntegerToString(filled) : "") + "}";
  }
void PushResult(string id, bool ok, string msg) { PushStatus(id, ok ? "done" : "failed", msg); }

bool TrySymbol(string name)
  {
   if(SymbolInfoInteger(name, SYMBOL_EXIST) == 0) return false;
   SymbolSelect(name, true);
   return true;
  }

// Map platform symbols to the broker's naming (suffixes like XAUUSDm, aliases like XTIUSD).
string ResolveSymbol(string sym)
  {
   if(TrySymbol(sym)) return sym;
   string cands[];
   ArrayResize(cands, 1); cands[0] = sym;
   if(sym == "USOIL")  { ArrayResize(cands, 4); cands[1] = "XTIUSD"; cands[2] = "WTI"; cands[3] = "USOUSD"; }
   if(sym == "USTEC")  { ArrayResize(cands, 4); cands[1] = "NAS100"; cands[2] = "US100"; cands[3] = "NDX"; }
   if(sym == "US30")   { ArrayResize(cands, 4); cands[1] = "DJ30"; cands[2] = "WS30"; cands[3] = "DJI"; }
   if(sym == "DE30")   { ArrayResize(cands, 4); cands[1] = "GER40"; cands[2] = "DE40"; cands[3] = "GER30"; }
   if(sym == "UK100")  { ArrayResize(cands, 3); cands[1] = "FTSE100"; cands[2] = "UK100Cash"; }
   if(sym == "DXY")    { ArrayResize(cands, 3); cands[1] = "USDX"; cands[2] = "DX"; }
   int total = SymbolsTotal(false);
   for(int c = 0; c < ArraySize(cands); c++)
     {
      if(TrySymbol(cands[c])) return cands[c];
      for(int i = 0; i < total; i++)
        {
         string s = SymbolName(i, false);
         if(StringFind(s, cands[c]) == 0 && StringLen(s) <= StringLen(cands[c]) + 5) { SymbolSelect(s, true); return s; }
        }
     }
   return "";
  }

double NormLot(string sym, double lot)
  {
   double step = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
   double mn = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double mx = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   lot = MathFloor(lot / step + 0.0000001) * step;
   // Never round up to the broker minimum (that would raise risk): 0 = rejected by the caller.
   if(lot < mn - 1e-9 || lot > mx + 1e-9) return 0;
   return NormalizeDouble(lot, 8);
  }

double NormPrice(string sym, double p)
  {
   if(p <= 0) return 0;
   return NormalizeDouble(p, (int)SymbolInfoInteger(sym, SYMBOL_DIGITS));
  }

double FloatingProfit()
  {
   double t = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
      if(PositionGetTicket(i) > 0) t += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
   return t;
  }

int g_closeFail = 0;
int CloseAll()
  {
   int n = 0; g_closeFail = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(trade.PositionClose(t) && trade.ResultRetcode() == TRADE_RETCODE_DONE) n++; else g_closeFail++;
     }
   return n;
  }

//+------------------------------------------------------------------+
//| Command execution                                                |
//+------------------------------------------------------------------+
//+------------------------------------------------------------------+
//| Command journal: survives restarts so a command ID never runs twice |
//| state 1 = started (outcome unknown), 2 = done, 3 = failed          |
//+------------------------------------------------------------------+
// Keys include the account login so two accounts on one terminal never share state. Old 1.30 keys are still read.
string Acct() { return IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)); }
string CmdKey(string id) { string t = id; StringReplace(t, "-", ""); return "UFC" + Acct() + "_" + t; }
int    CmdState(string id)
  {
   if(GlobalVariableCheck(CmdKey(id))) return (int)GlobalVariableGet(CmdKey(id));
   if(GlobalVariableCheck("UFC_" + id)) return (int)GlobalVariableGet("UFC_" + id);
   return 0;
  }
void   CmdMark(string id, int st) { GlobalVariableSet(CmdKey(id), st); GlobalVariablesFlush(); }
string CmdTag(string id) { string t = id; StringReplace(t, "-", ""); return "UF" + StringSubstr(t, 0, 29); }
// Per-execution tag for multi-trade commands: "U" + 26 chars of the id + "_" + 2-digit index (30 chars).
string SubPrefix(string id) { string t = id; StringReplace(t, "-", ""); return "U" + StringSubstr(t, 0, 26) + "_"; }
string SubTag(string id, int k) { return SubPrefix(id) + StringFormat("%02d", k); }
// Number of distinct broker executions (positions, pending orders, filled entry deals) carrying this command's sub-tags.
int CountSubTags(string id)
  {
   string pre = SubPrefix(id); int L = StringLen(pre);
   string seen = "|"; int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--) if(PositionGetTicket(i) > 0) { string c = PositionGetString(POSITION_COMMENT); if(StringSubstr(c, 0, L) == pre && StringFind(seen, "|" + c + "|") < 0) { seen += c + "|"; n++; } }
   for(int i = OrdersTotal() - 1; i >= 0; i--) if(OrderGetTicket(i) > 0) { string c = OrderGetString(ORDER_COMMENT); if(StringSubstr(c, 0, L) == pre && StringFind(seen, "|" + c + "|") < 0) { seen += c + "|"; n++; } }
   if(HistorySelect(TimeCurrent() - 7 * 86400, TimeCurrent() + 60))
      for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
        {
         ulong d = HistoryDealGetTicket(i);
         if(d == 0 || HistoryDealGetInteger(d, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
         string c = HistoryDealGetString(d, DEAL_COMMENT);
         if(StringSubstr(c, 0, L) == pre && StringFind(seen, "|" + c + "|") < 0) { seen += c + "|"; n++; }
        }
   return n;
  }
bool HasSubTag(string tag)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--) if(PositionGetTicket(i) > 0 && PositionGetString(POSITION_COMMENT) == tag) return true;
   for(int i = OrdersTotal() - 1; i >= 0; i--) if(OrderGetTicket(i) > 0 && OrderGetString(ORDER_COMMENT) == tag) return true;
   if(HistorySelect(TimeCurrent() - 7 * 86400, TimeCurrent() + 60))
      for(int i = HistoryDealsTotal() - 1; i >= 0; i--) { ulong d = HistoryDealGetTicket(i); if(d > 0 && HistoryDealGetString(d, DEAL_COMMENT) == tag) return true; }
   return false;
  }

// Broker-side proof that an order with this tag exists (open position, pending order or history).
bool BrokerHasTag(string tag)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--) if(PositionGetTicket(i) > 0 && PositionGetString(POSITION_COMMENT) == tag) return true;
   for(int i = OrdersTotal() - 1; i >= 0; i--) if(OrderGetTicket(i) > 0 && OrderGetString(ORDER_COMMENT) == tag) return true;
   if(HistorySelect(TimeCurrent() - 7 * 86400, TimeCurrent() + 60))
     {
      for(int i = HistoryDealsTotal() - 1; i >= 0; i--) { ulong d = HistoryDealGetTicket(i); if(d > 0 && HistoryDealGetString(d, DEAL_COMMENT) == tag) return true; }
      for(int i = HistoryOrdersTotal() - 1; i >= 0; i--) { ulong o = HistoryOrderGetTicket(i); if(o > 0 && HistoryOrderGetString(o, ORDER_COMMENT) == tag && HistoryOrderGetInteger(o, ORDER_STATE) == ORDER_STATE_FILLED) return true; }
     }
   return false;
  }

void Execute(string &f[])
  {
   string id = f[1];
   int st = CmdState(id);
   if(st == 2) { PushResult(id, true, "Already executed (duplicate ignored)"); return; }
   if(st == 3) { PushResult(id, false, "Already failed earlier (not repeated)"); return; }
   if(st == 4) { PushStatus(id, "unknown", "Outcome unknown earlier - check the broker (not repeated)"); return; }
   bool isOpen = f[2] == "open_trade";
   // Expired market orders must not run after a reconnect or at market open.
   long exp = ArraySize(f) > 15 ? StringToInteger(f[15]) : 0;
   if(st == 0 && exp > 0 && (long)TimeGMT() > exp) { CmdMark(id, 3); PushStatus(id, "expired", "Expired before execution - not sent to broker"); return; }
   if(isOpen && st == 0 && BrokerHasTag(CmdTag(id))) { CmdMark(id, 2); PushResult(id, true, "Verified at broker: already executed (1.30 tag)"); return; }
   if(st == 1)
     {
      // Interrupted after start: never blindly repeat. A missing tag alone is not proof that nothing was sent.
      int have = isOpen ? CountSubTags(id) : 0;
      if(isOpen && have > 0) { CmdMark(id, 2); PushStatus(id, "partial", "Recovered after restart: " + IntegerToString(have) + " execution(s) found at broker", have); return; }
      CmdMark(id, 4); PushStatus(id, "unknown", "Interrupted before broker confirmation - check MT5 history; not repeated"); return;
     }
   CmdMark(id, 1);
   int before = ArraySize(g_results);
   ExecuteCmd(f);
   string last = ArraySize(g_results) > before ? g_results[ArraySize(g_results) - 1] : "";
   bool ok = StringFind(last, "\"status\":\"done\"") >= 0 || StringFind(last, "\"status\":\"partial\"") >= 0;
   CmdMark(id, ok ? 2 : 3);
  }

// Is the broker's trading session open for this symbol right now (broker server time)?
bool InTradeSession(string sym)
  {
   long mode = SymbolInfoInteger(sym, SYMBOL_TRADE_MODE);
   if(mode == SYMBOL_TRADE_MODE_DISABLED || mode == SYMBOL_TRADE_MODE_CLOSEONLY) return false;
   MqlDateTime dt; TimeToStruct(TimeTradeServer(), dt);
   long secs = dt.hour * 3600 + dt.min * 60 + dt.sec;
   datetime from, to;
   for(uint i = 0; i < 10; i++)
     {
      if(!SymbolInfoSessionTrade(sym, (ENUM_DAY_OF_WEEK)dt.day_of_week, i, from, to)) break;
      if(secs >= (long)from && secs < (long)to) return true;
     }
   return false;   // no session covers now (or none defined for today)
  }

void ExecuteCmd(string &f[])
  {
   string id = f[1], cmd = f[2], symIn = f[3], side = f[4], otype = f[5];
   double lot = StringToDouble(f[6]), sl = StringToDouble(f[7]), tp = StringToDouble(f[8]), price = StringToDouble(f[9]);
   int count = (int)StringToInteger(f[10]);
   int delay = (int)StringToInteger(f[11]);
   double threshold = StringToDouble(f[12]);
   ulong ticket = (ulong)StringToInteger(f[13]);
   bool untilNoMargin = f[14] == "1";

   if(cmd == "open_trade")
     {
      string sym = ResolveSymbol(symIn);
      if(sym == "") { PushResult(id, false, "Symbol " + symIn + " not found at this broker"); return; }
      if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) { PushResult(id, false, "Algo Trading is disabled in MT5"); return; }
      if(lot <= 0) { PushResult(id, false, "Missing lot size"); return; }
      if(otype == "market" && !InTradeSession(sym)) { PushResult(id, false, "Broker trading session is closed for " + sym + " - not sent"); return; }
      double want = lot;
      lot = NormLot(sym, lot);
      if(lot <= 0 || MathAbs(lot - want) > SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP) / 2) { PushResult(id, false, "Lot " + Num(want, 2) + " does not match broker min/max/step - rejected (never rounded up)"); return; }
      sl = NormPrice(sym, sl); tp = NormPrice(sym, tp); price = NormPrice(sym, price);
      bool buy = side == "buy";
      bool guard = ArraySize(f) > 16 && f[16] == "1";
      double minRR = ArraySize(f) > 17 ? StringToDouble(f[17]) : 1.5;
      if(guard && otype == "market")
        {
         // Re-check at the live fill price right before sending; the server's earlier approval is not enough.
         double lp = buy ? SymbolInfoDouble(sym, SYMBOL_ASK) : SymbolInfoDouble(sym, SYMBOL_BID);
         if(lp <= 0 || sl <= 0 || tp <= 0) { PushResult(id, false, "Live price, stop or target missing - not sent"); return; }
         if(buy ? !(sl < lp && lp < tp) : !(tp < lp && lp < sl)) { PushResult(id, false, "Price moved past stop or target - not sent"); return; }
         double rr = MathAbs(tp - lp) / MathAbs(lp - sl);
         if(rr < minRR) { PushResult(id, false, "R/R " + Num(rr, 2) + " at live price is below " + Num(minRR, 2) + " - not sent"); return; }
         double loss = 0;
         if(!OrderCalcProfit(buy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, sym, lot, lp, sl, loss)) { PushResult(id, false, "Broker could not calculate the stop loss amount - not sent"); return; }
         Print("UfuqEA: pre-trade check ok, R/R ", Num(rr, 2), ", loss at stop ", Num(loss, 2), " ", AccountInfoString(ACCOUNT_CURRENCY));
        }
      int target = untilNoMargin ? 200 : MathMax(1, MathMin(50, count));
      int opened = 0; string err = "";
      for(int k = 0; k < target; k++)
        {
         if(untilNoMargin)
           {
            double need = 0;
            double px = buy ? SymbolInfoDouble(sym, SYMBOL_ASK) : SymbolInfoDouble(sym, SYMBOL_BID);
            if(!OrderCalcMargin(buy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, sym, lot, px, need) || need >= AccountInfoDouble(ACCOUNT_MARGIN_FREE) * 0.95) break;
           }
         bool ok = false;
         string tag = SubTag(id, k);
         if(HasSubTag(tag)) { opened++; continue; }   // this execution already exists at the broker
         if(otype == "limit")      ok = buy ? trade.BuyLimit(lot, price, sym, sl, tp, ORDER_TIME_GTC, 0, tag) : trade.SellLimit(lot, price, sym, sl, tp, ORDER_TIME_GTC, 0, tag);
         else if(otype == "stop")  ok = buy ? trade.BuyStop(lot, price, sym, sl, tp, ORDER_TIME_GTC, 0, tag) : trade.SellStop(lot, price, sym, sl, tp, ORDER_TIME_GTC, 0, tag);
         else                      ok = buy ? trade.Buy(lot, sym, 0, sl, tp, tag) : trade.Sell(lot, sym, 0, sl, tp, tag);
         uint rc = trade.ResultRetcode();
         // A sent request is not proof: only broker retcodes DONE/DONE_PARTIAL/PLACED with a deal or order ticket count.
         if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_DONE_PARTIAL || rc == TRADE_RETCODE_PLACED) && (trade.ResultDeal() > 0 || trade.ResultOrder() > 0)) opened++;
         else { err = trade.ResultRetcodeDescription(); if(!untilNoMargin) continue; else break; }
         if(delay > 0 && k < target - 1) Sleep(MathMin(delay, 60) * 1000);
        }
      string msg = "Opened " + IntegerToString(opened) + "/" + IntegerToString(untilNoMargin ? opened : target) + " " + side + " " + sym + (err != "" ? " | " + err : "");
      if(opened == 0) PushStatus(id, "failed", msg, 0);
      else if(!untilNoMargin && opened < target) PushStatus(id, "partial", msg, opened);
      else PushStatus(id, "done", msg, opened);
      return;
     }
   if(cmd == "close_all")    { int c = CloseAll(); PushResult(id, g_closeFail == 0, "Closed " + IntegerToString(c) + (g_closeFail > 0 ? ", FAILED " + IntegerToString(g_closeFail) : "")); return; }
   if(cmd == "close_trade")
     {
      // The platform stores POSITION_IDENTIFIER; convert it to the live position ticket before closing.
      ulong real = 0;
      for(int i = PositionsTotal() - 1; i >= 0; i--) { ulong t = PositionGetTicket(i); if(t > 0 && (ulong)PositionGetInteger(POSITION_IDENTIFIER) == ticket) { real = t; break; } }
      if(real == 0) { PushResult(id, true, "Position #" + IntegerToString((long)ticket) + " already closed"); return; }
      ticket = real;
      bool ok = trade.PositionClose(ticket) && trade.ResultRetcode() == TRADE_RETCODE_DONE;
      PushResult(id, ok, ok ? "Closed #" + IntegerToString((long)ticket) : trade.ResultRetcodeDescription());
      return;
     }
   if(cmd == "break_even" || cmd == "delete_sl" || cmd == "set_sl_tp")
     {
      int n = 0, bad = 0;
      string want = symIn != "" ? ResolveSymbol(symIn) : "";
      for(int i = PositionsTotal() - 1; i >= 0; i--)
        {
         ulong t = PositionGetTicket(i);
         if(t == 0) continue;
         string s = PositionGetString(POSITION_SYMBOL);
         double open = PositionGetDouble(POSITION_PRICE_OPEN), cur_sl = PositionGetDouble(POSITION_SL), cur_tp = PositionGetDouble(POSITION_TP);
         if(cmd == "break_even")
           {
            if(PositionGetDouble(POSITION_PROFIT) <= 0) continue;
            if(trade.PositionModify(t, NormPrice(s, open), cur_tp) && RcOk()) n++; else bad++;
           }
         else if(cmd == "delete_sl") { if(trade.PositionModify(t, 0, cur_tp) && RcOk()) n++; else bad++; }
         else
           {
            if(want != "" && s != want) continue;
            if(trade.PositionModify(t, sl > 0 ? NormPrice(s, sl) : cur_sl, tp > 0 ? NormPrice(s, tp) : cur_tp) && RcOk()) n++; else bad++;
           }
        }
      PushResult(id, bad == 0, "Modified " + IntegerToString(n) + (bad > 0 ? ", FAILED " + IntegerToString(bad) : ""));
      return;
     }
   if(cmd == "clear_pending")
     {
      int n = 0, bad = 0;
      for(int i = OrdersTotal() - 1; i >= 0; i--) { ulong t = OrderGetTicket(i); if(t == 0) continue; if(trade.OrderDelete(t) && trade.ResultRetcode() == TRADE_RETCODE_DONE) n++; else bad++; }
      PushResult(id, bad == 0, "Deleted " + IntegerToString(n) + " pending" + (bad > 0 ? ", FAILED " + IntegerToString(bad) : ""));
      return;
     }
   if(cmd == "cap_loss")        { g_capLoss = -MathAbs(threshold); PushResult(id, true, "Cap loss at " + Num(g_capLoss, 2)); return; }
   if(cmd == "trailing_profit") { g_trailStart = MathAbs(threshold); g_trailPeak = 0; g_trailArmed = false; PushResult(id, true, "Trailing from " + Num(g_trailStart, 2)); return; }
   PushResult(id, false, "Unknown command " + cmd);
  }

//+------------------------------------------------------------------+
//| Local trade protection (runs even if the website is unreachable) |
//| 1R profit -> close half + stop to breakeven; 1.5R -> trail at 1R |
//+------------------------------------------------------------------+
// State is kept in terminal global variables so it survives EA/MT5 restarts:
// UFR_<ticket> = original risk distance, UFS_<ticket> = steps done (1 half close, 2 breakeven), UFT_<ticket> = last attempt.
// Keys: <k><login>_<ticket>. Old 1.30 keys (<k><ticket>) are read once and migrated.
string ProtName(string k, ulong tk) { return k + Acct() + "_" + IntegerToString((long)tk); }
double ProtGet(string k, ulong tk)
  {
   string n = ProtName(k, tk);
   if(GlobalVariableCheck(n)) return GlobalVariableGet(n);
   string old = k + IntegerToString((long)tk);
   if(GlobalVariableCheck(old)) { double v = GlobalVariableGet(old); GlobalVariableSet(n, v); GlobalVariableDel(old); return v; }
   return 0;
  }
void   ProtSet(string k, ulong tk, double v) { GlobalVariableSet(ProtName(k, tk), v); GlobalVariablesFlush(); }
bool   g_netWarn = false;
bool   RcOk() { uint rc = trade.ResultRetcode(); return rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_DONE_PARTIAL || rc == TRADE_RETCODE_NO_CHANGES; }
int    g_protSweep = 0;

void ProtectPositions()
  {
   if(!InpProtect) return;
   // Half-close/breakeven is implemented for hedging accounts only.
   if(AccountInfoInteger(ACCOUNT_MARGIN_MODE) != ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
     { if(!g_netWarn) { Print("UfuqEA: protection disabled - netting/exchange accounts are not supported"); g_netWarn = true; } return; }
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0 || !PositionSelectByTicket(tk)) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      string sym  = PositionGetString(POSITION_SYMBOL);
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl   = PositionGetDouble(POSITION_SL);
      double tp   = PositionGetDouble(POSITION_TP);
      double vol  = PositionGetDouble(POSITION_VOLUME);
      bool   buy  = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY;
      double pt   = SymbolInfoDouble(sym, SYMBOL_POINT);           // this position's symbol, never the chart's _Point
      double risk = ProtGet("UFR_", tk);
      double vol0 = ProtGet("UFV_", tk);
      if(risk <= 0)
        {
         // Original risk is only known while the stop is still on the losing side of entry.
         if(sl > 0 && (buy ? sl < open : sl > open)) { risk = MathAbs(open - sl); ProtSet("UFR_", tk, risk); ProtSet("UFV_", tk, vol); vol0 = vol; }
         else { if(ProtGet("UFW_", tk) == 0) { Print("UfuqEA: ", tk, " original risk unknown - protection skipped (conservative)"); ProtSet("UFW_", tk, 1); } continue; }
        }
      if(vol0 <= 0) { vol0 = vol; ProtSet("UFV_", tk, vol0); }
      if(TimeCurrent() - (datetime)ProtGet("UFT_", tk) < 10) continue;   // retry failed steps every 10s
      int    stage = (int)ProtGet("UFS_", tk);
      double px    = buy ? SymbolInfoDouble(sym, SYMBOL_BID) : SymbolInfoDouble(sym, SYMBOL_ASK);
      double gain  = buy ? px - open : open - px;
      int    dg    = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      double minDist = (double)MathMax(SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL), SymbolInfoInteger(sym, SYMBOL_TRADE_FREEZE_LEVEL)) * pt;
      if(gain < risk) continue;

      // Step 1: close half (verified by the broker result and the new volume).
      if((stage & 1) == 0)
        {
         ProtSet("UFT_", tk, (double)TimeCurrent());
         double step = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP), vmin = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
         if(step <= 0) step = 0.01;
         // Target remaining volume is fixed from the ORIGINAL volume, so a lost flag never closes half of the rest again.
         double keep = vol0 - MathFloor(vol0 / 2 / step + 0.0000001) * step;
         double todo = NormalizeDouble(vol - keep, 8);
         if(keep < vmin || vol0 - keep < vmin) { stage |= 1; ProtSet("UFS_", tk, stage); Print("UfuqEA: ", tk, " too small to half-close, skipping to breakeven"); }
         else if(todo < step / 2) { stage |= 1; ProtSet("UFS_", tk, stage); Print("UfuqEA: ", tk, " half already closed at broker (recovered)"); }
         else if(trade.PositionClosePartial(tk, todo) && RcOk() && PositionSelectByTicket(tk) && PositionGetDouble(POSITION_VOLUME) < vol - step / 2)
           {
            if(PositionGetDouble(POSITION_VOLUME) <= keep + step / 2) { stage |= 1; ProtSet("UFS_", tk, stage); Print("UfuqEA: 1R on ", tk, " - half closed (verified)"); }
            else Print("UfuqEA: ", tk, " half close partly filled - remaining part retried");
           }
         else Print("UfuqEA: half close FAILED on ", tk, ": ", trade.ResultRetcodeDescription(), " - will retry");
        }
      // Step 2: stop to breakeven (independent of step 1; verified by reading the stop back).
      if((stage & 2) == 0)
        {
         if(!PositionSelectByTicket(tk)) continue;
         sl = PositionGetDouble(POSITION_SL); tp = PositionGetDouble(POSITION_TP);
         double be = NormalizeDouble(open, dg);
         double cur = buy ? SymbolInfoDouble(sym, SYMBOL_BID) : SymbolInfoDouble(sym, SYMBOL_ASK);
         if(buy ? sl >= be - pt : (sl > 0 && sl <= be + pt)) { stage |= 2; ProtSet("UFS_", tk, stage); }
         else if(MathAbs(cur - be) <= minDist) { ProtSet("UFT_", tk, (double)TimeCurrent()); Print("UfuqEA: ", tk, " breakeven inside stops/freeze level - waiting"); }
         else if(trade.PositionModify(tk, be, tp) && RcOk() && PositionSelectByTicket(tk) && MathAbs(PositionGetDouble(POSITION_SL) - be) <= pt * 2)
           { stage |= 2; ProtSet("UFS_", tk, stage); Print("UfuqEA: ", tk, " stop moved to breakeven (verified)"); }
         else { ProtSet("UFT_", tk, (double)TimeCurrent()); Print("UfuqEA: breakeven FAILED on ", tk, ": ", trade.ResultRetcodeDescription(), " - will retry"); }
         continue;
        }
      // Step 3: trail at 1R once 1.5R is reached.
      if(gain >= risk * 1.5)
        {
         double ns = NormalizeDouble(buy ? px - risk : px + risk, dg);
         if(MathAbs(px - ns) > minDist && (buy ? ns > sl + pt : (sl == 0 || ns < sl - pt)))
            if(!(trade.PositionModify(tk, ns, tp) && RcOk())) { ProtSet("UFT_", tk, (double)TimeCurrent()); Print("UfuqEA: trail FAILED on ", tk, ": ", trade.ResultRetcodeDescription()); }
        }
     }
   // Occasionally forget state of positions that no longer exist.
   if(++g_protSweep % 300 == 0)
      for(int g = GlobalVariablesTotal() - 1; g >= 0; g--)
        {
         string nm = GlobalVariableName(g);
         string pre = StringSubstr(nm, 0, 4);
         if(pre != "UFR_" && pre != "UFS_" && pre != "UFT_" && pre != "UFV_" && pre != "UFW_") continue;
         string rest = StringSubstr(nm, 4);
         int us = StringFind(rest, "_");
         if(us >= 0) { if(StringSubstr(rest, 0, us) != Acct()) continue; rest = StringSubstr(rest, us + 1); }
         if(!PositionSelectByTicket((ulong)StringToInteger(rest))) GlobalVariableDel(nm);
        }
  }

void CheckCapTrail()
  {
   if(PositionsTotal() == 0) { g_trailArmed = false; g_trailPeak = 0; return; }
   double p = FloatingProfit();
   if(g_capLoss < 0 && p <= g_capLoss) { CloseAll(); Print("ArrissaEA: cap loss hit"); g_capLoss = 0; }
   if(g_trailStart > 0)
     {
      if(p >= g_trailStart) g_trailArmed = true;
      if(g_trailArmed)
        {
         g_trailPeak = MathMax(g_trailPeak, p);
         if(p <= g_trailPeak * 0.7) { CloseAll(); Print("ArrissaEA: trailing profit locked"); g_trailStart = 0; g_trailArmed = false; g_trailPeak = 0; }
        }
     }
  }

void SetWatch(string id, string sym, double price)
  {
   for(int i = 0; i < ArraySize(g_watchId); i++) if(g_watchId[i] == id) return;
   int n = ArraySize(g_watchId);
   ArrayResize(g_watchId, n + 1); ArrayResize(g_watchSym, n + 1); ArrayResize(g_watchPrice, n + 1); ArrayResize(g_watchSide, n + 1);
   g_watchId[n] = id; g_watchSym[n] = ResolveSymbol(sym); g_watchPrice[n] = price; g_watchSide[n] = 0;
  }

void CheckWatches()
  {
   for(int i = ArraySize(g_watchId) - 1; i >= 0; i--)
     {
      if(g_watchSym[i] == "") continue;
      double bid = SymbolInfoDouble(g_watchSym[i], SYMBOL_BID);
      if(bid <= 0) continue;
      int side = bid >= g_watchPrice[i] ? 1 : -1;
      if(g_watchSide[i] == 0) { g_watchSide[i] = side; continue; }
      if(side != g_watchSide[i])
        {
         int n = ArraySize(g_fired); ArrayResize(g_fired, n + 1); g_fired[n] = g_watchId[i];
         g_watchSym[i] = "";   // fired; ignore until removed
        }
     }
  }

//+------------------------------------------------------------------+
//| Sync with Arrissa                                                |
//+------------------------------------------------------------------+
string CandlesJson(string sym, ENUM_TIMEFRAMES tf, int count)
  {
   MqlRates r[];
   ArraySetAsSeries(r, false);
   int n = CopyRates(sym, tf, 0, count, r);
   string s = "[";
   for(int i = 0; i < n; i++)
     {
      if(i > 0) s += ",";
      s += "[" + IntegerToString((long)r[i].time - (long)MathRound((TimeTradeServer() - TimeGMT()) / 1800.0) * 1800) + "," + Num(r[i].open) + "," + Num(r[i].high) + "," + Num(r[i].low) + "," + Num(r[i].close) + "," + IntegerToString(r[i].spread) + "]";
     }
   return s + "]";
  }

// Broker prices, spread and contract specs for the analysis engine (sent once a minute).
string MarketJson()
  {
   string sym = ResolveSymbol(InpDataSymbol);
   if(sym == "") return "";
   string m = "{\"symbol\":\"" + Esc(InpDataSymbol) + "\",\"broker_symbol\":\"" + Esc(sym) + "\",";
   m += "\"bid\":" + Num(SymbolInfoDouble(sym, SYMBOL_BID)) + ",\"ask\":" + Num(SymbolInfoDouble(sym, SYMBOL_ASK)) + ",";
   m += "\"spread\":" + IntegerToString(SymbolInfoInteger(sym, SYMBOL_SPREAD)) + ",\"point\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_POINT), 8) + ",";
   m += "\"tick_value\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE) * SymbolInfoDouble(sym, SYMBOL_POINT) / MathMax(SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE), 1e-10), 8) + ",";
   m += "\"contract_size\":" + Num(SymbolInfoDouble(sym, SYMBOL_TRADE_CONTRACT_SIZE), 2) + ",\"min_lot\":" + Num(SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN), 2) + ",";
   m += "\"max_lot\":" + Num(SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX), 2) + ",\"lot_step\":" + Num(SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP), 4) + ",";
   long qt = (long)SymbolInfoInteger(sym, SYMBOL_TIME) - (long)MathRound((TimeTradeServer() - TimeGMT()) / 1800.0) * 1800;
   m += "\"quote_time\":" + IntegerToString(qt) + "000,";
   m += "\"trade_allowed\":" + (InTradeSession(sym) ? "true" : "false") + ",";
   m += "\"candles\":{\"M5\":" + CandlesJson(sym, PERIOD_M5, 120) + ",\"M15\":" + CandlesJson(sym, PERIOD_M15, 120) + ",\"H1\":" + CandlesJson(sym, PERIOD_H1, 120) + ",\"H4\":" + CandlesJson(sym, PERIOD_H4, 100) + ",\"D1\":" + CandlesJson(sym, PERIOD_D1, 60) + "}}";
   return m;
  }

string BuildBody()
  {
   string b = "{\"account\":{";
   b += "\"login\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\",";
   b += "\"server\":\"" + Esc(AccountInfoString(ACCOUNT_SERVER)) + "\",";
   b += "\"company\":\"" + Esc(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   b += "\"currency\":\"" + Esc(AccountInfoString(ACCOUNT_CURRENCY)) + "\",";
   b += "\"balance\":" + Num(AccountInfoDouble(ACCOUNT_BALANCE), 2) + ",";
   b += "\"equity\":" + Num(AccountInfoDouble(ACCOUNT_EQUITY), 2) + ",";
   b += "\"free_margin\":" + Num(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 2) + ",";
   b += "\"leverage\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE)) + "},";

   b += "\"positions\":[";
   int total = PositionsTotal();
   bool posOk = true, firstPos = true;
   for(int i = 0; i < total; i++)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) { posOk = false; continue; }   // incomplete snapshot: the server will not close missing positions
      if(!firstPos) b += ",";
      firstPos = false;
      b += "{\"ticket\":\"" + IntegerToString((long)PositionGetInteger(POSITION_IDENTIFIER)) + "\",";
      b += "\"symbol\":\"" + Esc(PositionGetString(POSITION_SYMBOL)) + "\",";
      b += "\"side\":\"" + (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? "buy" : "sell") + "\",";
      b += "\"volume\":" + Num(PositionGetDouble(POSITION_VOLUME), 2) + ",";
      b += "\"open_price\":" + Num(PositionGetDouble(POSITION_PRICE_OPEN)) + ",";
      b += "\"stop_loss\":" + Num(PositionGetDouble(POSITION_SL)) + ",";
      b += "\"take_profit\":" + Num(PositionGetDouble(POSITION_TP)) + ",";
      b += "\"profit\":" + Num(PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP), 2) + ",";
      b += "\"opened_at\":\"" + Iso((datetime)PositionGetInteger(POSITION_TIME)) + "\"}";
     }
   b += "],";
   long mmode = AccountInfoInteger(ACCOUNT_MARGIN_MODE);
   string mm = mmode == ACCOUNT_MARGIN_MODE_RETAIL_HEDGING ? "hedging" : (mmode == ACCOUNT_MARGIN_MODE_RETAIL_NETTING ? "netting" : "exchange");
   b += "\"meta\":{\"ea_version\":\"" + EA_VERSION + "\",\"protocol\":" + IntegerToString(PROTOCOL) + ",\"executor\":\"" + Esc(g_executor) + "\",";
   b += "\"snapshot_at\":" + IntegerToString((long)TimeGMT()) + "000,\"positions_ok\":" + (posOk && PositionsTotal() == total ? "true" : "false") + ",\"margin_mode\":\"" + mm + "\",";
   b += "\"capabilities\":[\"expiry\",\"guard\",\"subtags\",\"partial\",\"unknown\",\"fees\",\"session\"]},";

   b += "\"closed\":[";
   string fees = "";
   bool first = true;
   g_histNext = 0;
   if(HistorySelect(g_lastHistory, TimeCurrent() + 60))
     {
      int deals = HistoryDealsTotal();
      int sent = 0;
      for(int i = 0; i < deals; i++)
        {
         ulong d = HistoryDealGetTicket(i);
         if(d == 0) continue;
         // Pages of 300: the window resumes from the last sent deal next time instead of dropping the rest.
         if(sent >= 300) { g_histNext = (datetime)HistoryDealGetInteger(d, DEAL_TIME) - 1; break; }
         long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
         if(entry == DEAL_ENTRY_IN)
           {
            // Opening commission is charged on the entry deal; report it so daily P/L is not overstated.
            double fee = HistoryDealGetDouble(d, DEAL_COMMISSION);
            if(fee != 0)
              {
               if(fees != "") fees += ",";
               fees += "{\"ticket\":\"" + IntegerToString(HistoryDealGetInteger(d, DEAL_POSITION_ID)) + "\",\"deal\":\"" + IntegerToString((long)d) + "\",";
               fees += "\"symbol\":\"" + Esc(HistoryDealGetString(d, DEAL_SYMBOL)) + "\",\"commission\":" + Num(fee, 2) + ",\"at\":\"" + Iso((datetime)HistoryDealGetInteger(d, DEAL_TIME)) + "\"}";
              }
            continue;
           }
         if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) continue;
         long dtype = HistoryDealGetInteger(d, DEAL_TYPE);
         if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL) continue;
         if(!first) b += ",";
         first = false; sent++;
         double pl = HistoryDealGetDouble(d, DEAL_PROFIT) + HistoryDealGetDouble(d, DEAL_SWAP) + HistoryDealGetDouble(d, DEAL_COMMISSION);
         b += "{\"ticket\":\"" + IntegerToString(HistoryDealGetInteger(d, DEAL_POSITION_ID)) + "\",";
         b += "\"deal\":\"" + IntegerToString((long)d) + "\",";
         b += "\"symbol\":\"" + Esc(HistoryDealGetString(d, DEAL_SYMBOL)) + "\",";
         b += "\"side\":\"" + (dtype == DEAL_TYPE_SELL ? "buy" : "sell") + "\",";
         b += "\"volume\":" + Num(HistoryDealGetDouble(d, DEAL_VOLUME), 2) + ",";
         b += "\"close_price\":" + Num(HistoryDealGetDouble(d, DEAL_PRICE)) + ",";
         b += "\"profit\":" + Num(pl, 2) + ",";
         b += "\"closed_at\":\"" + Iso((datetime)HistoryDealGetInteger(d, DEAL_TIME)) + "\"}";
        }
     }
   b += "],\"fees\":[" + fees + "],";

   b += "\"results\":[";
   for(int i = 0; i < ArraySize(g_results); i++) { if(i > 0) b += ","; b += g_results[i]; }
   b += "],\"hedge_fired\":[";
   for(int i = 0; i < ArraySize(g_fired); i++) { if(i > 0) b += ","; b += "\"" + g_fired[i] + "\""; }
   b += "]";
   if(g_syncCount % 30 == 0) { string m = MarketJson(); if(m != "") b += ",\"market\":[" + m + "]"; }
   g_syncCount++;
   b += "}";
   return b;
  }

void Sync()
  {
   string body = BuildBody();
   char data[], result[];
   int n = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(data, MathMax(0, n - 1));
   string headers = "Content-Type: application/json\r\nX-API-Key: " + InpApiKey + "\r\nX-Username: " + InpUsername + "\r\n";
   string resHeaders;
   string url = InpApiUrl + "/sync?format=text";
   ResetLastError();
   int code = WebRequest("POST", url, headers, 8000, data, result, resHeaders);
   if(code == -1)
     {
      if(!g_warned) { Alert("ArrissaEA: add ", InpApiUrl, " to Tools > Options > Expert Advisors > Allow WebRequest. Error ", GetLastError()); g_warned = true; }
      return;
     }
   string text = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   if(code != 200) { Print("ArrissaEA sync failed (", code, "): ", text); return; }

   // Delivered: clear the outbox and move the history window.
   ArrayResize(g_results, 0);
   ArrayResize(g_fired, 0);
   g_lastHistory = g_histNext > 0 ? g_histNext : TimeCurrent() - 120;

   string lines[];
   int cnt = StringSplit(text, '\n', lines);
   g_execAllowed = StringFind(text, "\nE|") < 0;
   string seenWatch = "|";
   for(int i = 0; i < cnt; i++)
     {
      string f[];
      int k = StringSplit(lines[i], '|', f);
      if(k >= 2 && f[0] == "E") Print("UfuqEA: ", f[1]);
      else if(k >= 15 && f[0] == "C") { if(g_execAllowed) Execute(f); }
      else if(k >= 4 && f[0] == "W") { SetWatch(f[1], f[2], StringToDouble(f[3])); seenWatch += f[1] + "|"; }
     }
   // Drop watches the server no longer sends (executed or cancelled).
   for(int i = ArraySize(g_watchId) - 1; i >= 0; i--)
      if(StringFind(seenWatch, "|" + g_watchId[i] + "|") < 0)
        {
         int last = ArraySize(g_watchId) - 1;
         g_watchId[i] = g_watchId[last]; g_watchSym[i] = g_watchSym[last]; g_watchPrice[i] = g_watchPrice[last]; g_watchSide[i] = g_watchSide[last];
         ArrayResize(g_watchId, last); ArrayResize(g_watchSym, last); ArrayResize(g_watchPrice, last); ArrayResize(g_watchSide, last);
        }
   // Results produced by this batch are sent on the next sync.
  }
//+------------------------------------------------------------------+
