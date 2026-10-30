#property service
#property copyright ""
#property version   "1.10"

input int SnapshotIntervalMs = 10 * 60 * 1000;
input int HeartbeatIntervalMs = 10 * 60 * 1000;
input string SnapshotFileName = "ea_scanner_live.json";

long g_sequence = 0;

string JsonEscape(const string value)
  {
   string result = value;
   StringReplace(result, "\\", "\\\\");
   StringReplace(result, "\"", "\\\"");
   StringReplace(result, "\r", "\\r");
   StringReplace(result, "\n", "\\n");
   StringReplace(result, "\t", "\\t");
   return result;
  }

string TimeframeToString(const ENUM_TIMEFRAMES timeframe)
  {
   string value = EnumToString(timeframe);
   if(StringFind(value, "PERIOD_") == 0)
      return StringSubstr(value, 7);
   return value;
  }

// Build only the observable terminal/chart state. It intentionally excludes
// timestamps and sequence so unchanged state can be compared without writing.
string BuildState()
  {
   bool terminal_trade_allowed = (bool)TerminalInfoInteger(TERMINAL_TRADE_ALLOWED);
   bool account_trade_allowed = (bool)AccountInfoInteger(ACCOUNT_TRADE_ALLOWED);
   bool expert_trade_allowed = (bool)AccountInfoInteger(ACCOUNT_TRADE_EXPERT);
   bool algotrading = terminal_trade_allowed && account_trade_allowed && expert_trade_allowed;

   string json = "\"terminal_trade_allowed\":" + (terminal_trade_allowed ? "true" : "false") + ",";
   json += "\"account_trade_allowed\":" + (account_trade_allowed ? "true" : "false") + ",";
   json += "\"expert_trade_allowed\":" + (expert_trade_allowed ? "true" : "false") + ",";
   json += "\"algotrading\":" + (algotrading ? "true" : "false") + ",";
   json += "\"charts\":[";

   long chart_id = ChartFirst();
   bool first = true;
   while(chart_id >= 0 && !IsStopped())
     {
      string expert_name = ChartGetString(chart_id, CHART_EXPERT_NAME);
      if(expert_name != "")
        {
         if(!first)
            json += ",";
         first = false;
         json += "{";
         json += "\"chart_id\":\"" + (string)chart_id + "\",";
         json += "\"symbol\":\"" + JsonEscape(ChartSymbol(chart_id)) + "\",";
         json += "\"timeframe\":\"" + JsonEscape(TimeframeToString(ChartPeriod(chart_id))) + "\",";
         json += "\"expert_name\":\"" + JsonEscape(expert_name) + "\"";
         json += "}";
        }
      chart_id = ChartNext(chart_id);
     }

   json += "]";
   return json;
  }

string BuildSnapshot(const string state)
  {
   string json = "{";
   json += "\"version\":1,";
   json += "\"sequence\":" + (string)g_sequence + ",";
   // Use UTC Unix time so the Python scanner can compare it across timezones.
   json += "\"timestamp\":" + (string)((long)TimeGMT() * 1000) + ",";
   json += state;
   json += "}";
   return json;
  }

bool WriteSnapshot(const string json)
  {
   string temporary_name = SnapshotFileName + ".tmp";
   ResetLastError();
   int handle = FileOpen(
      temporary_name,
      FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_READ | FILE_SHARE_WRITE
   );
   if(handle == INVALID_HANDLE)
     {
      PrintFormat("EA Scanner: cannot open snapshot temp file, error %d", GetLastError());
      return false;
     }

   FileWriteString(handle, json);
   FileFlush(handle);
   FileClose(handle);

   ResetLastError();
   if(!FileMove(temporary_name, 0, SnapshotFileName, FILE_REWRITE))
     {
      // Keep the previous complete snapshot if an external reader temporarily locks the destination.
      PrintFormat("EA Scanner: cannot replace snapshot file, error %d", GetLastError());
      return false;
     }
   return true;
  }

void OnStart()
  {
   int poll_interval = SnapshotIntervalMs;
   if(poll_interval < 250)
      poll_interval = 250;

   int heartbeat_interval = HeartbeatIntervalMs;
   if(heartbeat_interval < poll_interval)
      heartbeat_interval = poll_interval;

   string previous_state = "";
   ulong last_write_ms = 0;
   PrintFormat("EA Scanner service started, poll=%dms heartbeat=%dms", poll_interval, heartbeat_interval);

   while(!IsStopped())
     {
      string state = BuildState();
      ulong now_ms = GetTickCount64();
      bool state_changed = (state != previous_state);
      bool heartbeat_due = (last_write_ms == 0 || now_ms - last_write_ms >= (ulong)heartbeat_interval);

      if(state_changed || heartbeat_due)
        {
         g_sequence++;
         if(WriteSnapshot(BuildSnapshot(state)))
           {
            previous_state = state;
            last_write_ms = now_ms;
           }
        }

      Sleep(poll_interval);
     }
   Print("EA Scanner service stopped");
  }