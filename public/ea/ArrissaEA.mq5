//+------------------------------------------------------------------+
//| ArrissaEA.mq5 — connects MetaTrader 5 to the Arrissa platform    |
//| 1. Tools > Options > Expert Advisors > Allow WebRequest for URL: |
//|    add your API URL (shown in Arrissa > MT5 EA Configuration).   |
//| 2. Compile in MetaEditor, attach to any chart, fill the inputs,  |
//|    enable Algo Trading.                                          |
//| Several terminals on one VPS: install MT5 in separate folders,   |
//| add the URL in EACH terminal's WebRequest list, attach this EA   |
//| to one chart per terminal with the same Username + API key.     |
//| Each MT5 login is registered automatically on the website.      |
//| 1.60: closes are confirmed before being logged, the $ profit     |
//| close works even with Auto-protect off, no Sleep() inside the   |
//| command loop, execution timings are reported, and an optional   |
//| local Fast Scalping engine (switched on per account on the      |
//| website; scalps use magic number + 1).                          |
//+------------------------------------------------------------------+
#property copyright "Arrissa"
#property version   "1.60"
#property strict

#include <Trade/Trade.mqh>

input string InpUsername    = "";                                              // Arrissa username
input string InpApiKey      = "";                                              // Arrissa API key
input string InpApiUrl      = "https://ufuq-trade.lovable.app/api/public/ea"; // API URL
input int    InpSyncSeconds = 2;                                               // Sync interval (seconds)
input long   InpMagic       = 777001;                                          // Magic number
input int    InpSlippage    = 30;                                              // Max slippage (points)

CTrade   trade;
CTrade   strade;          // fast scalps (magic + 1)
datetime g_lastHistory = 0;
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
bool     g_connected = false;
int      g_failStreak = 0;
bool     g_marketDue = true;   // send broker data on the next successful sync
input string InpDataSymbol  = "XAUUSD";                                        // Symbol whose broker data is sent for analysis
input double InpProfitClose = 20.0;                                             // Close a trade fully once its profit reaches this many dollars (0 = off)
input bool   InpProtect     = true;                                            // Auto-protect trades: half close + breakeven at 1R, trail after 1.5R
input string InpQuoteSymbols = "EURUSD,GBPUSD,EURJPY,US30,UK100";            // Extra markets whose live broker price is sent (real trades need it)

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
   strade.SetExpertMagicNumber(InpMagic + 1);
   strade.SetDeviationInPoints(InpSlippage);
   g_lastHistory = TimeCurrent() - 3 * 86400;
   EventSetTimer(MathMax(1, InpSyncSeconds));
   Print("ArrissaEA 1.60 started for account ", AccountInfoInteger(ACCOUNT_LOGIN), " on ", AccountInfoString(ACCOUNT_SERVER), " -> ", InpApiUrl);
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)) Print("ArrissaEA: Algo Trading button is OFF - the EA syncs but cannot open trades.");
   Sync();   // connect immediately instead of waiting for the first timer tick
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason) { EventKillTimer(); }

// Fast local work first (protection, profit close, scalps), the website sync last: WebRequest blocks this EA
// until it returns, so it must never sit in front of trade management.
void LocalWork()
  {
   CheckCapTrail();
   CheckProfitClose();
   ProtectPositions();
   ScalpManage();
   ScalpEntries();
   ProcessQueue();
  }

void OnTimer()
  {
   LocalWork();
   CheckWatches();
   Sync();
  }

ulong g_lastTickWork = 0;
void OnTick()
  {
   // Light: at most 4 times a second, no network.
   ulong now = GetMicrosecondCount();
   if(now - g_lastTickWork < 250000) return;
   g_lastTickWork = now;
   LocalWork();
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

void PushResult(string id, bool ok, string msg)
  {
   int n = ArraySize(g_results);
   ArrayResize(g_results, n + 1);
   g_results[n] = "{\"id\":\"" + id + "\",\"status\":\"" + (ok ? "done" : "failed") + "\",\"result\":\"" + Esc(StringSubstr(msg, 0, 400)) + "\"}";
  }

string g_exec[];
void PushExec(string kind, string sym, string ticket, double ms, bool ok, string reason, long spread = -1)
  {
   int n = ArraySize(g_exec);
   if(n >= 100) return;
   ArrayResize(g_exec, n + 1);
   g_exec[n] = "{\"kind\":\"" + kind + "\",\"symbol\":\"" + Esc(sym) + "\",\"ticket\":\"" + ticket + "\",\"ms\":" + DoubleToString(ms, 1) + ",\"ok\":" + (ok ? "true" : "false") + ",\"reason\":\"" + Esc(StringSubstr(reason, 0, 190)) + "\"" + (spread >= 0 ? ",\"spread\":" + IntegerToString(spread) : "") + "}";
  }

double MsSince(ulong t0) { return (double)(GetMicrosecondCount() - t0) / 1000.0; }
bool   Done(CTrade &t) { uint rc = t.ResultRetcode(); return rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED || rc == TRADE_RETCODE_DONE_PARTIAL; }

// Close requests: one per ticket per 10 s; logged as closed only after the broker confirms.
ulong  g_crTk[];
ulong  g_crAt[];
string g_crWhy[];
int CrIndex(ulong tk) { for(int i = 0; i < ArraySize(g_crTk); i++) if(g_crTk[i] == tk) return i; return -1; }

bool CloseReq(CTrade &t, ulong tk, string why)
  {
   int k = CrIndex(tk);
   if(k >= 0 && GetMicrosecondCount() - g_crAt[k] < 10000000) return false;
   if(!PositionSelectByTicket(tk)) return false;
   string sym = PositionGetString(POSITION_SYMBOL);
   ulong t0 = GetMicrosecondCount();
   bool sent = t.PositionClose(tk);
   bool ok = sent && Done(t);
   double ms = MsSince(t0);
   if(k < 0) { k = ArraySize(g_crTk); ArrayResize(g_crTk, k + 1); ArrayResize(g_crAt, k + 1); ArrayResize(g_crWhy, k + 1); }
   g_crTk[k] = tk; g_crAt[k] = GetMicrosecondCount(); g_crWhy[k] = why;
   PushExec(ok ? "close" : "close_fail", sym, IntegerToString((long)tk), ms, ok, why + (ok ? "" : " | " + t.ResultRetcodeDescription()), SymbolInfoInteger(sym, SYMBOL_SPREAD));
   if(ok) Print("ArrissaEA: ", why, " - #", tk, " closed (confirmed in ", DoubleToString(ms, 0), " ms)");
   else   Print("ArrissaEA: ", why, " - close of #", tk, " FAILED: ", t.ResultRetcodeDescription(), " (will retry in 10 s)");
   return ok;
  }

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
   return MathMax(mn, MathMin(mx, lot));
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

int CloseAll()
  {
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t > 0 && trade.PositionClose(t)) n++;
     }
   return n;
  }

//+------------------------------------------------------------------+
//| Order queue (replaces Sleep between repeated orders)             |
//+------------------------------------------------------------------+
string g_qId[], g_qSym[], g_qSide[], g_qType[], g_qErr[];
double g_qLot[], g_qSl[], g_qTp[], g_qPx[];
int    g_qLeft[], g_qDelay[], g_qOpened[];
ulong  g_qNext[];
bool   g_qUntil[];

void QueueDrop(int i)
  {
   int last = ArraySize(g_qId) - 1;
   if(i != last)
     {
      g_qId[i] = g_qId[last]; g_qSym[i] = g_qSym[last]; g_qSide[i] = g_qSide[last]; g_qType[i] = g_qType[last]; g_qErr[i] = g_qErr[last];
      g_qLot[i] = g_qLot[last]; g_qSl[i] = g_qSl[last]; g_qTp[i] = g_qTp[last]; g_qPx[i] = g_qPx[last];
      g_qLeft[i] = g_qLeft[last]; g_qDelay[i] = g_qDelay[last]; g_qOpened[i] = g_qOpened[last]; g_qNext[i] = g_qNext[last]; g_qUntil[i] = g_qUntil[last];
     }
   ArrayResize(g_qId, last); ArrayResize(g_qSym, last); ArrayResize(g_qSide, last); ArrayResize(g_qType, last); ArrayResize(g_qErr, last);
   ArrayResize(g_qLot, last); ArrayResize(g_qSl, last); ArrayResize(g_qTp, last); ArrayResize(g_qPx, last);
   ArrayResize(g_qLeft, last); ArrayResize(g_qDelay, last); ArrayResize(g_qOpened, last); ArrayResize(g_qNext, last); ArrayResize(g_qUntil, last);
  }

void ProcessQueue()
  {
   for(int i = ArraySize(g_qId) - 1; i >= 0; i--)
     {
      bool finished = false;
      while(g_qLeft[i] > 0 && GetMicrosecondCount() >= g_qNext[i])
        {
         string sym = g_qSym[i]; bool buy = g_qSide[i] == "buy"; double lot = g_qLot[i];
         if(g_qUntil[i])
           {
            double need = 0, px = buy ? SymbolInfoDouble(sym, SYMBOL_ASK) : SymbolInfoDouble(sym, SYMBOL_BID);
            if(!OrderCalcMargin(buy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, sym, lot, px, need) || need >= AccountInfoDouble(ACCOUNT_MARGIN_FREE) * 0.95) { g_qLeft[i] = 0; break; }
           }
         ulong t0 = GetMicrosecondCount();
         bool ok = false;
         if(g_qType[i] == "limit")      ok = buy ? trade.BuyLimit(lot, g_qPx[i], sym, g_qSl[i], g_qTp[i]) : trade.SellLimit(lot, g_qPx[i], sym, g_qSl[i], g_qTp[i]);
         else if(g_qType[i] == "stop")  ok = buy ? trade.BuyStop(lot, g_qPx[i], sym, g_qSl[i], g_qTp[i]) : trade.SellStop(lot, g_qPx[i], sym, g_qSl[i], g_qTp[i]);
         else                           ok = buy ? trade.Buy(lot, sym, 0, g_qSl[i], g_qTp[i], "Arrissa") : trade.Sell(lot, sym, 0, g_qSl[i], g_qTp[i], "Arrissa");
         ok = ok && Done(trade);
         PushExec(ok ? "open" : "open_fail", sym, IntegerToString((long)trade.ResultOrder()), MsSince(t0), ok, ok ? g_qSide[i] + " " + g_qType[i] : trade.ResultRetcodeDescription(), SymbolInfoInteger(sym, SYMBOL_SPREAD));
         g_qLeft[i]--;
         if(ok) g_qOpened[i]++;
         else { g_qErr[i] = trade.ResultRetcodeDescription(); if(g_qUntil[i]) { g_qLeft[i] = 0; break; } }
         if(g_qDelay[i] > 0) { g_qNext[i] = GetMicrosecondCount() + (ulong)g_qDelay[i] * 1000000; break; }
        }
      if(g_qLeft[i] <= 0) finished = true;
      if(finished)
        {
         PushResult(g_qId[i], g_qOpened[i] > 0, "Opened " + IntegerToString(g_qOpened[i]) + " " + g_qSide[i] + " " + g_qSym[i] + (g_qErr[i] != "" ? " | " + g_qErr[i] : ""));
         QueueDrop(i);
        }
     }
  }

//+------------------------------------------------------------------+
//| Command execution                                                |
//+------------------------------------------------------------------+
void Execute(string &f[])
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
      if(lot <= 0) lot = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
      lot = NormLot(sym, lot);
      sl = NormPrice(sym, sl); tp = NormPrice(sym, tp); price = NormPrice(sym, price);
      int target = untilNoMargin ? 200 : MathMax(1, MathMin(50, count));
      // Queue: the first order goes now; delayed ones are sent by the timer (no Sleep blocking protection).
      int q = ArraySize(g_qId);
      ArrayResize(g_qId, q + 1); ArrayResize(g_qSym, q + 1); ArrayResize(g_qSide, q + 1); ArrayResize(g_qType, q + 1); ArrayResize(g_qLot, q + 1);
      ArrayResize(g_qSl, q + 1); ArrayResize(g_qTp, q + 1); ArrayResize(g_qPx, q + 1); ArrayResize(g_qLeft, q + 1); ArrayResize(g_qDelay, q + 1);
      ArrayResize(g_qNext, q + 1); ArrayResize(g_qOpened, q + 1); ArrayResize(g_qErr, q + 1); ArrayResize(g_qUntil, q + 1);
      g_qId[q] = id; g_qSym[q] = sym; g_qSide[q] = side; g_qType[q] = otype; g_qLot[q] = lot; g_qSl[q] = sl; g_qTp[q] = tp; g_qPx[q] = price;
      g_qLeft[q] = target; g_qDelay[q] = MathMax(0, MathMin(delay, 60)); g_qNext[q] = 0; g_qOpened[q] = 0; g_qErr[q] = ""; g_qUntil[q] = untilNoMargin;
      ProcessQueue();
      return;
     }
   if(cmd == "close_all")    { PushResult(id, true, "Closed " + IntegerToString(CloseAll())); return; }
   if(cmd == "close_trade")
     {
      if(!PositionSelectByTicket(ticket)) { PushResult(id, true, "#" + IntegerToString((long)ticket) + " already closed"); return; }
      bool scalp = PositionGetInteger(POSITION_MAGIC) == InpMagic + 1;
      bool ok = scalp ? CloseReq(strade, ticket, "website close") : CloseReq(trade, ticket, "website close");
      PushResult(id, ok, ok ? "Closed #" + IntegerToString((long)ticket) + " (confirmed)" : "Close not confirmed: " + (scalp ? strade.ResultRetcodeDescription() : trade.ResultRetcodeDescription()));
      return;
     }
   if(cmd == "break_even" || cmd == "delete_sl" || cmd == "set_sl_tp")
     {
      int n = 0;
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
            if(trade.PositionModify(t, NormPrice(s, open), cur_tp)) n++;
           }
         else if(cmd == "delete_sl") { if(trade.PositionModify(t, 0, cur_tp)) n++; }
         else
           {
            if(want != "" && s != want) continue;
            if(trade.PositionModify(t, sl > 0 ? NormPrice(s, sl) : cur_sl, tp > 0 ? NormPrice(s, tp) : cur_tp)) n++;
           }
        }
      PushResult(id, true, "Modified " + IntegerToString(n));
      return;
     }
   if(cmd == "clear_pending")
     {
      int n = 0;
      for(int i = OrdersTotal() - 1; i >= 0; i--) { ulong t = OrderGetTicket(i); if(t > 0 && trade.OrderDelete(t)) n++; }
      PushResult(id, true, "Deleted " + IntegerToString(n) + " pending");
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
ulong  g_protTicket[];
double g_protRisk[];
bool   g_protHalf[];

int ProtIndex(ulong ticket, double risk)
  {
   for(int i = 0; i < ArraySize(g_protTicket); i++) if(g_protTicket[i] == ticket) return i;
   if(risk <= 0) return -1;
   int n = ArraySize(g_protTicket);
   ArrayResize(g_protTicket, n + 1); ArrayResize(g_protRisk, n + 1); ArrayResize(g_protHalf, n + 1);
   g_protTicket[n] = ticket; g_protRisk[n] = risk; g_protHalf[n] = false;
   return n;
  }

// Fixed $ profit close for platform trades. Independent of Auto-protect (1.50 skipped it when protect was off).
// POSITION_PROFIT is in the account currency and excludes commission.
void CheckProfitClose()
  {
   if(InpProfitClose <= 0) return;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0 || !PositionSelectByTicket(tk)) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      if(PositionGetDouble(POSITION_PROFIT) >= InpProfitClose)
         CloseReq(trade, tk, "profit target " + DoubleToString(InpProfitClose, 2) + " " + AccountInfoString(ACCOUNT_CURRENCY) + " reached");
     }
  }

void ProtectPositions()
  {
   if(!InpProtect) return;
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
      int    k    = ProtIndex(tk, sl > 0 ? MathAbs(open - sl) : 0);
      if(k < 0) continue;
      double risk = g_protRisk[k];
      double px   = buy ? SymbolInfoDouble(sym, SYMBOL_BID) : SymbolInfoDouble(sym, SYMBOL_ASK);
      double gain = buy ? px - open : open - px;
      int    dg   = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      if(!g_protHalf[k] && gain >= risk)
        {
         double step = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP), vmin = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
         double half = MathFloor(vol / 2 / step) * step;
         bool partOk = true;
         if(half >= vmin && vol - half >= vmin) partOk = trade.PositionClosePartial(tk, half) && Done(trade);
         bool beOk = trade.PositionModify(tk, NormalizeDouble(open, dg), tp) && Done(trade);
         g_protHalf[k] = true;
         PushExec("protect_1r", sym, IntegerToString((long)tk), 0, partOk && beOk, (partOk ? "half closed" : "half close failed") + string(beOk ? ", stop at breakeven" : ", breakeven failed: " + trade.ResultRetcodeDescription()));
         Print("ArrissaEA: 1R reached on ", tk, partOk ? " - half closed" : " - half close FAILED", beOk ? ", stop at breakeven" : ", breakeven FAILED: " + trade.ResultRetcodeDescription());
         continue;
        }
      if(g_protHalf[k] && gain >= risk * 1.5)
        {
         double ns = NormalizeDouble(buy ? px - risk : px + risk, dg);
         if(buy ? ns > sl + _Point : (sl == 0 || ns < sl - _Point)) trade.PositionModify(tk, ns, tp);
        }
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
//| Fast Scalping (local; settings come from the website S/B lines)  |
//| Same rule as src/lib/scalp.ts: on a closed M1 bar, close breaks  |
//| the high/low of the previous N bars on the EMA side -> enter;    |
//| stop = k x ATR, target = R x stop (R >= 1.5), time exit.          |
//+------------------------------------------------------------------+
bool     g_sOn = false;
datetime g_sAt = 0;          // local time of the last settings line
string   g_sSyms[];
string   g_sRes[];
datetime g_sLastBar[];
datetime g_sLossAt[];
int      g_sLook = 20, g_sAtrLen = 14, g_sHold = 300, g_sEma = 50;
double   g_sSlAtr = 1.5, g_sRR = 1.5, g_sSpreadFrac = 0.25, g_sLot = 0.01, g_sDayLoss = 0;
string   g_sReason = "";
string   g_bSym[], g_bBias[];
double   g_dayPl = 0;
datetime g_dayPlAt = 0;

void ScalpSettings(string &f[], int k)
  {
   g_sAt = TimeLocal();
   bool on = f[1] == "1";
   if(on != g_sOn) Print("ArrissaEA: Fast Scalping ", on ? "ON" : "OFF", k > 12 && f[12] != "" ? " - " + f[12] : "");
   g_sOn = on;
   if(k > 12) g_sReason = f[12];
   if(k < 12) return;
   string parts[];
   int n = StringSplit(f[2], ',', parts);
   if(n != ArraySize(g_sSyms) || (n > 0 && parts[0] != g_sSyms[0]))
     {
      ArrayResize(g_sSyms, n); ArrayResize(g_sRes, n); ArrayResize(g_sLastBar, n); ArrayResize(g_sLossAt, n);
      for(int i = 0; i < n; i++) { g_sSyms[i] = parts[i]; g_sRes[i] = ResolveSymbol(parts[i]); g_sLastBar[i] = 0; g_sLossAt[i] = 0; }
     }
   g_sLook = (int)MathMax(5, StringToInteger(f[3])); g_sAtrLen = (int)MathMax(5, StringToInteger(f[4]));
   g_sSlAtr = MathMax(0.5, StringToDouble(f[5])); g_sRR = MathMax(1.5, StringToDouble(f[6]));
   g_sHold = (int)MathMax(30, StringToInteger(f[7])); g_sSpreadFrac = StringToDouble(f[8]); g_sEma = (int)MathMax(10, StringToInteger(f[9]));
   g_sLot = StringToDouble(f[10]); g_sDayLoss = StringToDouble(f[11]);
  }

void ScalpBias(string &f[], int k)
  {
   for(int i = 0; i < ArraySize(g_bSym); i++) if(g_bSym[i] == f[1]) { g_bBias[i] = f[2]; return; }
   int n = ArraySize(g_bSym); ArrayResize(g_bSym, n + 1); ArrayResize(g_bBias, n + 1);
   g_bSym[n] = f[1]; g_bBias[n] = f[2];
  }

string BiasOf(string sym) { for(int i = 0; i < ArraySize(g_bSym); i++) if(g_bSym[i] == sym) return g_bBias[i]; return "none"; }

int ScalpCount(string sym)
  {
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0 || PositionGetInteger(POSITION_MAGIC) != InpMagic + 1) continue;
      if(sym == "" || PositionGetString(POSITION_SYMBOL) == sym) n++;
     }
   return n;
  }

double TodayPl()
  {
   if(TimeLocal() - g_dayPlAt < 30) return g_dayPl;
   g_dayPlAt = TimeLocal();
   MqlDateTime d; TimeToStruct(TimeCurrent(), d); d.hour = 0; d.min = 0; d.sec = 0;
   double t = 0;
   if(HistorySelect(StructToTime(d), TimeCurrent() + 60))
      for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
        {
         ulong dl = HistoryDealGetTicket(i);
         long e = HistoryDealGetInteger(dl, DEAL_ENTRY);
         if(e == DEAL_ENTRY_OUT || e == DEAL_ENTRY_OUT_BY) t += HistoryDealGetDouble(dl, DEAL_PROFIT) + HistoryDealGetDouble(dl, DEAL_SWAP) + HistoryDealGetDouble(dl, DEAL_COMMISSION);
        }
   g_dayPl = t;
   return t;
  }

void ScalpEntries()
  {
   if(!g_sOn || TimeLocal() - g_sAt > 120) return;   // website settings too old: no new scalps
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED)) return;
   if(ScalpCount("") >= 2) return;
   if(g_sDayLoss > 0 && TodayPl() <= -g_sDayLoss) return;
   for(int s = 0; s < ArraySize(g_sSyms); s++)
     {
      string sym = g_sRes[s];
      if(sym == "") continue;
      string bias = BiasOf(g_sSyms[s]);
      if(bias == "block") continue;
      if(ScalpCount(sym) > 0) continue;
      if(g_sLossAt[s] > 0 && TimeLocal() - g_sLossAt[s] < 600) continue;   // 10 min cool-down after a losing scalp
      int need = MathMin(1000, MathMax(g_sLook, g_sAtrLen) + g_sEma * 4 + 2);
      MqlRates r[];
      ArraySetAsSeries(r, false);
      int n = CopyRates(sym, PERIOD_M1, 1, need, r);   // closed bars only, oldest first
      if(n < MathMax(g_sLook, g_sAtrLen) + 2) continue;
      if(r[n - 1].time == g_sLastBar[s]) continue;
      g_sLastBar[s] = r[n - 1].time;
      if(TimeCurrent() - r[n - 1].time > 180) continue;   // stale bar (market closed)
      double kk = 2.0 / (g_sEma + 1), ema = r[0].close;
      for(int i = 1; i < n; i++) ema = r[i].close * kk + ema * (1 - kk);
      double atr = 0;
      for(int i = n - g_sAtrLen; i < n; i++) atr += MathMax(r[i].high - r[i].low, MathMax(MathAbs(r[i].high - r[i - 1].close), MathAbs(r[i].low - r[i - 1].close)));
      atr /= g_sAtrLen;
      if(atr <= 0) continue;
      double hi = -DBL_MAX, lo = DBL_MAX;
      for(int i = n - 1 - g_sLook; i < n - 1; i++) { hi = MathMax(hi, r[i].high); lo = MathMin(lo, r[i].low); }
      double c = r[n - 1].close;
      bool buy = c > hi && c > ema, sell = c < lo && c < ema;
      if(!buy && !sell) continue;
      if((buy && bias == "sell") || (sell && bias == "buy")) { Print("ArrissaEA scalp: ", sym, buy ? " buy" : " sell", " breakout skipped - against the AI bias"); continue; }
      double ask = SymbolInfoDouble(sym, SYMBOL_ASK), bid = SymbolInfoDouble(sym, SYMBOL_BID);
      double spread = ask - bid, slDist = g_sSlAtr * atr;
      if(spread > g_sSpreadFrac * slDist) continue;
      double stopsLvl = SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL) * SymbolInfoDouble(sym, SYMBOL_POINT);
      if(stopsLvl > 0 && slDist <= stopsLvl) continue;
      double entry = buy ? ask : bid;
      double sl = NormPrice(sym, buy ? entry - slDist : entry + slDist), tp = NormPrice(sym, buy ? entry + g_sRR * slDist : entry - g_sRR * slDist);
      double lot = NormLot(sym, g_sLot > 0 ? g_sLot : SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN));
      double loss = 0;
      if(!OrderCalcProfit(buy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, sym, lot, entry, sl, loss)) continue;
      if(MathAbs(loss) > AccountInfoDouble(ACCOUNT_BALANCE) * 0.02) { Print("ArrissaEA scalp: ", sym, " skipped - stop would risk more than 2% of balance"); continue; }
      ulong t0 = GetMicrosecondCount();
      bool ok = (buy ? strade.Buy(lot, sym, 0, sl, tp, "UfuqScalp") : strade.Sell(lot, sym, 0, sl, tp, "UfuqScalp")) && Done(strade);
      double ms = MsSince(t0);
      PushExec(ok ? "scalp_open" : "scalp_open_fail", g_sSyms[s], IntegerToString((long)strade.ResultOrder()), ms, ok, (buy ? "buy" : "sell") + string(" breakout") + (ok ? "" : " | " + strade.ResultRetcodeDescription()), SymbolInfoInteger(sym, SYMBOL_SPREAD));
      Print("ArrissaEA scalp: ", buy ? "BUY " : "SELL ", sym, " ", ok ? "opened" : "FAILED " + strade.ResultRetcodeDescription(), " in ", DoubleToString(ms, 0), " ms (sl ", sl, " tp ", tp, ")");
      if(ScalpCount("") >= 2) return;
     }
  }

// Time exit for scalps (stop and target sit at the broker). Runs even when the website is unreachable.
void ScalpManage()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0 || !PositionSelectByTicket(tk) || PositionGetInteger(POSITION_MAGIC) != InpMagic + 1) continue;
      long age = (long)(TimeCurrent() - (datetime)PositionGetInteger(POSITION_TIME));
      if(age >= g_sHold) CloseReq(strade, tk, "scalp time exit " + IntegerToString(g_sHold) + "s");
     }
  }

string ExitReason(ulong deal)
  {
   long r = HistoryDealGetInteger(deal, DEAL_REASON);
   if(r == DEAL_REASON_SL) return "sl";
   if(r == DEAL_REASON_TP) return "tp";
   if(r == DEAL_REASON_SO) return "stop_out";
   if(r == DEAL_REASON_EXPERT) return "ea";
   return "manual";
  }

// Confirmed fills and closes from the trade server.
void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD || trans.deal == 0 || !HistoryDealSelect(trans.deal)) return;
   long magic = HistoryDealGetInteger(trans.deal, DEAL_MAGIC);
   if(magic != InpMagic && magic != InpMagic + 1) return;
   long entry = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) return;
   string sym = HistoryDealGetString(trans.deal, DEAL_SYMBOL);
   double pl = HistoryDealGetDouble(trans.deal, DEAL_PROFIT) + HistoryDealGetDouble(trans.deal, DEAL_SWAP) + HistoryDealGetDouble(trans.deal, DEAL_COMMISSION);
   ulong pos = (ulong)HistoryDealGetInteger(trans.deal, DEAL_POSITION_ID);
   int k = CrIndex(pos);
   double ms = k >= 0 ? MsSince(g_crAt[k]) : -1;
   PushExec(magic == InpMagic + 1 ? "scalp_closed" : "closed", sym, IntegerToString((long)pos), ms, true, ExitReason(trans.deal) + " " + DoubleToString(pl, 2));
   g_dayPlAt = 0;
   if(magic == InpMagic + 1 && pl < 0)
      for(int s = 0; s < ArraySize(g_sRes); s++) if(g_sRes[s] == sym) g_sLossAt[s] = TimeLocal();
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
   m += "\"candles\":{\"M5\":" + CandlesJson(sym, PERIOD_M5, 120) + ",\"M15\":" + CandlesJson(sym, PERIOD_M15, 120) + ",\"H1\":" + CandlesJson(sym, PERIOD_H1, 120) + ",\"H4\":" + CandlesJson(sym, PERIOD_H4, 100) + ",\"D1\":" + CandlesJson(sym, PERIOD_D1, 60) + "}}";
   return m;
  }

// Light quote (price + contract specs, no candles) so the website trades this market on the broker's own price.
string QuoteJson(string psym)
  {
   string sym = ResolveSymbol(psym);
   if(sym == "") return "";
   string m = "{\"symbol\":\"" + Esc(psym) + "\",\"broker_symbol\":\"" + Esc(sym) + "\",";
   m += "\"bid\":" + Num(SymbolInfoDouble(sym, SYMBOL_BID)) + ",\"ask\":" + Num(SymbolInfoDouble(sym, SYMBOL_ASK)) + ",";
   m += "\"spread\":" + IntegerToString(SymbolInfoInteger(sym, SYMBOL_SPREAD)) + ",\"point\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_POINT), 8) + ",";
   m += "\"tick_value\":" + DoubleToString(SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE) * SymbolInfoDouble(sym, SYMBOL_POINT) / MathMax(SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE), 1e-10), 8) + ",";
   m += "\"contract_size\":" + Num(SymbolInfoDouble(sym, SYMBOL_TRADE_CONTRACT_SIZE), 2) + ",\"min_lot\":" + Num(SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN), 2) + "}";
   return m;
  }

string QuotesJson()
  {
   string parts[];
   int n = StringSplit(InpQuoteSymbols, ',', parts);
   string out = "";
   for(int i = 0; i < n && i < 10; i++)
     {
      string ps = parts[i];
      StringTrimLeft(ps); StringTrimRight(ps); StringToUpper(ps);
      if(ps == "" || ps == InpDataSymbol) continue;
      string q = QuoteJson(ps);
      if(q != "") out += "," + q;
     }
   return out;
  }

string BuildBody(bool withMarket)
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
   bool firstPos = true;
   for(int i = 0; i < total; i++)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
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
      b += "\"strategy\":\"" + (PositionGetInteger(POSITION_MAGIC) == InpMagic + 1 ? "scalp" : "main") + "\",";
      b += "\"opened_at\":\"" + Iso((datetime)PositionGetInteger(POSITION_TIME)) + "\"}";
     }
   b += "],";

   b += "\"closed\":[";
   bool first = true;
   if(HistorySelect(g_lastHistory, TimeCurrent() + 60))
     {
      int deals = HistoryDealsTotal();
      for(int i = 0; i < deals && i < 400; i++)
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
         b += "\"volume\":" + Num(HistoryDealGetDouble(d, DEAL_VOLUME), 2) + ",";
         b += "\"close_price\":" + Num(HistoryDealGetDouble(d, DEAL_PRICE)) + ",";
         b += "\"profit\":" + Num(pl, 2) + ",";
         b += "\"strategy\":\"" + (HistoryDealGetInteger(d, DEAL_MAGIC) == InpMagic + 1 ? "scalp" : "main") + "\",";
         b += "\"exit_reason\":\"" + ExitReason(d) + "\",";
         b += "\"closed_at\":\"" + Iso((datetime)HistoryDealGetInteger(d, DEAL_TIME)) + "\"}";
        }
     }
   b += "],";

   b += "\"results\":[";
   for(int i = 0; i < ArraySize(g_results); i++) { if(i > 0) b += ","; b += g_results[i]; }
   b += "],\"hedge_fired\":[";
   for(int i = 0; i < ArraySize(g_fired); i++) { if(i > 0) b += ","; b += "\"" + g_fired[i] + "\""; }
   b += "],\"exec\":[";
   for(int i = 0; i < ArraySize(g_exec); i++) { if(i > 0) b += ","; b += g_exec[i]; }
   b += "]";
   if(withMarket) { string m = MarketJson(); string q = QuotesJson(); if(m == "" && q != "") q = StringSubstr(q, 1); if(m != "" || q != "") b += ",\"market\":[" + m + q + "]"; }
   b += "}";
   return b;
  }

// One HTTP attempt. Returns HTTP status, or -1 / MT5 internal code (>= 1000) when the request never got an answer.
int Post(string body, bool closeConn, string &text)
  {
   char data[], result[];
   int n = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(data, MathMax(0, n - 1));
   string headers = "Content-Type: application/json\r\nX-API-Key: " + InpApiKey + "\r\nX-Username: " + InpUsername + "\r\n";
   if(closeConn) headers += "Connection: close\r\n";
   string resHeaders;
   string url = InpApiUrl + "/sync?format=text";
   ResetLastError();
   int code = WebRequest("POST", url, headers, 7000, data, result, resHeaders);   // shorter wait: the EA cannot manage trades while this runs
   text = code == -1 ? "" : CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   return code;
  }

string Explain(int code, string text)
  {
   if(code == 401) return "Username or API key rejected by the website: " + text;
   if(code == 400) return "Website could not read the data: " + text;
   if(code == 429) return "Too many requests from this VPS - slowing down";
   if(code >= 500 && code < 600) return "Website temporarily unavailable, retrying";
   if(code == 1009) return "Connection reset (1009) between this VPS and the website. Usually too many requests from one VPS: set Sync interval to 5 or more in every terminal. Open https://ufuq-trade.lovable.app in the VPS browser to check the internet.";
   if(code >= 1000) return "Network error inside MT5 (" + IntegerToString(code) + ") - the request never reached the website. Check THIS terminal's Tools > Options > Expert Advisors > Allow WebRequest list contains https://ufuq-trade.lovable.app";
   return "HTTP " + IntegerToString(code) + ": " + text;
  }

int g_skip = 0;
double g_syncSum = 0, g_syncMax = 0;   // timer ticks to wait before the next attempt after a failure (back-off)

void Fail()
  {
   g_failStreak++; g_connected = false;
   // Back off 2, 4, 8 ... up to 60 seconds so several terminals on one VPS don't flood the website.
   int wait = (int)MathMin(60, MathPow(2, MathMin(g_failStreak, 6)));
   g_skip = (int)MathCeil((double)wait / MathMax(1, InpSyncSeconds));
  }

void Sync()
  {
   if(g_skip > 0) { g_skip--; return; }
   bool withMarket = g_marketDue && g_failStreak == 0;
   string text;
   ulong t0 = GetMicrosecondCount();
   int code = Post(BuildBody(withMarket), false, text);
   // One lighter retry only on the first failure (no bulky broker data, fresh connection).
   if(g_failStreak == 0 && (code == -1 || code >= 1000 || (code >= 500 && code < 600)))
     {
      withMarket = false;
      code = Post(BuildBody(false), true, text);
     }
   if(code == -1)
     {
      int err = GetLastError();
      if(!g_warned) { Alert("ArrissaEA: add ", InpApiUrl, " to Tools > Options > Expert Advisors > Allow WebRequest in this terminal, then restart it. Error ", err); g_warned = true; }
      if(g_failStreak % 10 == 0) Print("ArrissaEA: WebRequest blocked (error ", err, "). 4014 = URL not allowed in this terminal, 5200-5203 = network problem.");
      Fail();
      return;
     }
   if(code != 200)
     {
      if(g_failStreak % 10 == 0) Print("ArrissaEA sync failed (", code, "): ", Explain(code, text), " Retrying automatically.");
      Fail();
      return;
     }
   if(!g_connected) Print("ArrissaEA connected - account ", AccountInfoInteger(ACCOUNT_LOGIN), " is online on the website.");
   g_connected = true; g_failStreak = 0;
   g_syncCount++;
   double syncMs = MsSince(t0);
   g_syncSum += syncMs; g_syncMax = MathMax(g_syncMax, syncMs);
   if(g_syncCount % 30 == 0) { PushExec("sync", "", "", g_syncSum / 30.0, true, "avg of 30 syncs, max " + DoubleToString(g_syncMax, 0) + " ms"); g_syncSum = 0; g_syncMax = 0; }
   g_marketDue = withMarket ? false : g_marketDue;
   if(g_syncCount % 30 == 0) g_marketDue = true;

   // Delivered: clear the outbox and move the history window.
   ArrayResize(g_results, 0);
   ArrayResize(g_fired, 0);
   ArrayResize(g_exec, 0);
   g_lastHistory = TimeCurrent() - 120;

   string lines[];
   int cnt = StringSplit(text, '\n', lines);
   string seenWatch = "|";
   for(int i = 0; i < cnt; i++)
     {
      string f[];
      int k = StringSplit(lines[i], '|', f);
      if(k >= 15 && f[0] == "C") Execute(f);
      else if(k >= 4 && f[0] == "W") { SetWatch(f[1], f[2], StringToDouble(f[3])); seenWatch += f[1] + "|"; }
      else if(k >= 2 && f[0] == "S") ScalpSettings(f, k);
      else if(k >= 3 && f[0] == "B") ScalpBias(f, k);
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
