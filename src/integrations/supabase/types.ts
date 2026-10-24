export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_models: {
        Row: {
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          model_id: string
          name: string
        }
        Insert: {
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          model_id: string
          name: string
        }
        Update: {
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          model_id?: string
          name?: string
        }
        Relationships: []
      }
      analyses: {
        Row: {
          confidence: number | null
          created_at: string
          direction: string
          entry: number | null
          id: string
          stop_loss: number | null
          summary: string | null
          symbol: string
          take_profit: number | null
          timeframe: string | null
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          direction: string
          entry?: number | null
          id?: string
          stop_loss?: number | null
          summary?: string | null
          symbol: string
          take_profit?: number | null
          timeframe?: string | null
          user_id?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          direction?: string
          entry?: number | null
          id?: string
          stop_loss?: number | null
          summary?: string | null
          symbol?: string
          take_profit?: number | null
          timeframe?: string | null
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
        }
        Relationships: []
      }
      autopilot_events: {
        Row: {
          action: string
          created_at: string
          detail: string | null
          id: string
          symbol: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: string | null
          id?: string
          symbol: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: string | null
          id?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      autopilot_settings: {
        Row: {
          avoid_news: boolean
          cooldown_minutes: number
          daily_target_usd: number
          enabled: boolean
          giveback_pct: number
          lock_start_usd: number
          lot_size: number
          max_daily: number
          max_open: number
          min_confidence: number
          profit_target_usd: number
          symbols: string[]
          timeframe: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avoid_news?: boolean
          cooldown_minutes?: number
          daily_target_usd?: number
          enabled?: boolean
          giveback_pct?: number
          lock_start_usd?: number
          lot_size?: number
          max_daily?: number
          max_open?: number
          min_confidence?: number
          profit_target_usd?: number
          symbols?: string[]
          timeframe?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avoid_news?: boolean
          cooldown_minutes?: number
          daily_target_usd?: number
          enabled?: boolean
          giveback_pct?: number
          lock_start_usd?: number
          lot_size?: number
          max_daily?: number
          max_open?: number
          min_confidence?: number
          profit_target_usd?: number
          symbols?: string[]
          timeframe?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      broker_candles: {
        Row: {
          account_id: string
          c: number
          h: number
          l: number
          o: number
          spread: number
          symbol: string
          t: number
          timeframe: string
          user_id: string
        }
        Insert: {
          account_id: string
          c: number
          h: number
          l: number
          o: number
          spread?: number
          symbol: string
          t: number
          timeframe: string
          user_id: string
        }
        Update: {
          account_id?: string
          c?: number
          h?: number
          l?: number
          o?: number
          spread?: number
          symbol?: string
          t?: number
          timeframe?: string
          user_id?: string
        }
        Relationships: []
      }
      broker_quotes: {
        Row: {
          account_id: string
          ask: number | null
          bid: number | null
          broker_symbol: string | null
          contract_size: number | null
          min_lot: number | null
          point: number | null
          spread_points: number | null
          symbol: string
          tick_value: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          ask?: number | null
          bid?: number | null
          broker_symbol?: string | null
          contract_size?: number | null
          min_lot?: number | null
          point?: number | null
          spread_points?: number | null
          symbol: string
          tick_value?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          ask?: number | null
          bid?: number | null
          broker_symbol?: string | null
          contract_size?: number | null
          min_lot?: number | null
          point?: number | null
          spread_points?: number | null
          symbol?: string
          tick_value?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      brokers: {
        Row: {
          brand_color: string | null
          created_at: string
          description: string | null
          features: string[]
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          partner_url: string | null
          platforms: string[]
          regulation: string | null
          sort_order: number
        }
        Insert: {
          brand_color?: string | null
          created_at?: string
          description?: string | null
          features?: string[]
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          partner_url?: string | null
          platforms?: string[]
          regulation?: string | null
          sort_order?: number
        }
        Update: {
          brand_color?: string | null
          created_at?: string
          description?: string | null
          features?: string[]
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          partner_url?: string | null
          platforms?: string[]
          regulation?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          status: string
          subject: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          subject: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          subject?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
        }
        Relationships: []
      }
      decision_log: {
        Row: {
          account_id: string | null
          ai_confidence: number | null
          ai_direction: string | null
          command_id: string | null
          created_at: string
          data_source: string | null
          entry: number | null
          id: string
          risk_reason: string | null
          risk_verdict: string
          stop_loss: number | null
          symbol: string
          take_profit: number | null
          timeframe: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          ai_confidence?: number | null
          ai_direction?: string | null
          command_id?: string | null
          created_at?: string
          data_source?: string | null
          entry?: number | null
          id?: string
          risk_reason?: string | null
          risk_verdict: string
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
          timeframe?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          ai_confidence?: number | null
          ai_direction?: string | null
          command_id?: string | null
          created_at?: string
          data_source?: string | null
          entry?: number | null
          id?: string
          risk_reason?: string | null
          risk_verdict?: string
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
          timeframe?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ea_credentials: {
        Row: {
          api_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ea_releases: {
        Row: {
          created_at: string
          file_url: string | null
          id: string
          is_latest: boolean
          notes: string | null
          version: string
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          id?: string
          is_latest?: boolean
          notes?: string | null
          version: string
        }
        Update: {
          created_at?: string
          file_url?: string | null
          id?: string
          is_latest?: boolean
          notes?: string | null
          version?: string
        }
        Relationships: []
      }
      hedge_plans: {
        Row: {
          created_at: string
          group_a: string[]
          group_b: string[]
          id: string
          lot_size: number
          side_a: string
          status: string
          symbol: string
          trades_per_account: number | null
          trigger_at: string | null
          trigger_price: number | null
          trigger_type: string
          until_no_margin: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          group_a?: string[]
          group_b?: string[]
          id?: string
          lot_size?: number
          side_a?: string
          status?: string
          symbol: string
          trades_per_account?: number | null
          trigger_at?: string | null
          trigger_price?: number | null
          trigger_type?: string
          until_no_margin?: boolean
          user_id?: string
        }
        Update: {
          created_at?: string
          group_a?: string[]
          group_b?: string[]
          id?: string
          lot_size?: number
          side_a?: string
          status?: string
          symbol?: string
          trades_per_account?: number | null
          trigger_at?: string | null
          trigger_price?: number | null
          trigger_type?: string
          until_no_margin?: boolean
          user_id?: string
        }
        Relationships: []
      }
      instruments: {
        Row: {
          category: string
          flag: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          symbol: string
          tv_symbol: string
          yahoo_symbol: string | null
        }
        Insert: {
          category?: string
          flag?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          symbol: string
          tv_symbol: string
          yahoo_symbol?: string | null
        }
        Update: {
          category?: string
          flag?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          symbol?: string
          tv_symbol?: string
          yahoo_symbol?: string | null
        }
        Relationships: []
      }
      learned_rules: {
        Row: {
          created_at: string
          hits: number
          id: string
          is_active: boolean
          rule: string
          status: string
          symbol: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          hits?: number
          id?: string
          is_active?: boolean
          rule: string
          status?: string
          symbol?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          hits?: number
          id?: string
          is_active?: boolean
          rule?: string
          status?: string
          symbol?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approval_status: string
          copy_sl: boolean
          copy_tp: boolean
          country: string | null
          created_at: string
          default_account_id: string | null
          default_instrument: string | null
          email: string | null
          email_opt_out: boolean
          favorite_instruments: string[]
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          notifications_enabled: boolean
          phone: string | null
          push_notifications: boolean
          show_tooltips: boolean
          username: string | null
        }
        Insert: {
          approval_status?: string
          copy_sl?: boolean
          copy_tp?: boolean
          country?: string | null
          created_at?: string
          default_account_id?: string | null
          default_instrument?: string | null
          email?: string | null
          email_opt_out?: boolean
          favorite_instruments?: string[]
          first_name?: string | null
          full_name?: string | null
          id: string
          last_name?: string | null
          notifications_enabled?: boolean
          phone?: string | null
          push_notifications?: boolean
          show_tooltips?: boolean
          username?: string | null
        }
        Update: {
          approval_status?: string
          copy_sl?: boolean
          copy_tp?: boolean
          country?: string | null
          created_at?: string
          default_account_id?: string | null
          default_instrument?: string | null
          email?: string | null
          email_opt_out?: boolean
          favorite_instruments?: string[]
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          notifications_enabled?: boolean
          phone?: string | null
          push_notifications?: boolean
          show_tooltips?: boolean
          username?: string | null
        }
        Relationships: []
      }
      signals: {
        Row: {
          created_at: string
          created_by: string | null
          direction: string
          entry: number | null
          id: string
          is_active: boolean
          note: string | null
          stop_loss: number | null
          symbol: string
          take_profit: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          direction: string
          entry?: number | null
          id?: string
          is_active?: boolean
          note?: string | null
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          direction?: string
          entry?: number | null
          id?: string
          is_active?: boolean
          note?: string | null
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
        }
        Relationships: []
      }
      trade_commands: {
        Row: {
          account_id: string
          command: string
          created_at: string
          executed_at: string | null
          id: string
          payload: Json
          result: string | null
          status: string
          user_id: string
        }
        Insert: {
          account_id: string
          command: string
          created_at?: string
          executed_at?: string | null
          id?: string
          payload?: Json
          result?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          account_id?: string
          command?: string
          created_at?: string
          executed_at?: string | null
          id?: string
          payload?: Json
          result?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_commands_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "trading_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_lessons: {
        Row: {
          created_at: string
          exit_verdict: string | null
          giveback_usd: number | null
          id: string
          lesson: string | null
          missed_profit: number | null
          outcome: string
          peak_profit: number | null
          profit: number
          reason: string | null
          rule: string | null
          side: string
          symbol: string
          tags: string[]
          trade_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exit_verdict?: string | null
          giveback_usd?: number | null
          id?: string
          lesson?: string | null
          missed_profit?: number | null
          outcome: string
          peak_profit?: number | null
          profit?: number
          reason?: string | null
          rule?: string | null
          side: string
          symbol: string
          tags?: string[]
          trade_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          exit_verdict?: string | null
          giveback_usd?: number | null
          id?: string
          lesson?: string | null
          missed_profit?: number | null
          outcome?: string
          peak_profit?: number | null
          profit?: number
          reason?: string | null
          rule?: string | null
          side?: string
          symbol?: string
          tags?: string[]
          trade_id?: string
          user_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          account_id: string
          close_price: number | null
          closed_at: string | null
          id: string
          open_price: number | null
          opened_at: string | null
          peak_profit: number | null
          profit: number | null
          side: string
          status: string
          stop_loss: number | null
          symbol: string
          take_profit: number | null
          ticket: string
          user_id: string
          volume: number
        }
        Insert: {
          account_id: string
          close_price?: number | null
          closed_at?: string | null
          id?: string
          open_price?: number | null
          opened_at?: string | null
          peak_profit?: number | null
          profit?: number | null
          side: string
          status?: string
          stop_loss?: number | null
          symbol: string
          take_profit?: number | null
          ticket: string
          user_id: string
          volume: number
        }
        Update: {
          account_id?: string
          close_price?: number | null
          closed_at?: string | null
          id?: string
          open_price?: number | null
          opened_at?: string | null
          peak_profit?: number | null
          profit?: number | null
          side?: string
          status?: string
          stop_loss?: number | null
          symbol?: string
          take_profit?: number | null
          ticket?: string
          user_id?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "trades_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "trading_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      trading_accounts: {
        Row: {
          auto_trading: boolean
          balance: number | null
          broker_name: string | null
          connection_type: string
          created_at: string
          currency: string | null
          ea_key: string
          equity: number | null
          free_margin: number | null
          id: string
          label: string | null
          last_seen_at: string | null
          leverage: number | null
          login: string
          lot_size: number
          platform: string
          server: string | null
          user_id: string
        }
        Insert: {
          auto_trading?: boolean
          balance?: number | null
          broker_name?: string | null
          connection_type?: string
          created_at?: string
          currency?: string | null
          ea_key?: string
          equity?: number | null
          free_margin?: number | null
          id?: string
          label?: string | null
          last_seen_at?: string | null
          leverage?: number | null
          login: string
          lot_size?: number
          platform?: string
          server?: string | null
          user_id?: string
        }
        Update: {
          auto_trading?: boolean
          balance?: number | null
          broker_name?: string | null
          connection_type?: string
          created_at?: string
          currency?: string | null
          ea_key?: string
          equity?: number | null
          free_margin?: number | null
          id?: string
          label?: string | null
          last_seen_at?: string | null
          leverage?: number | null
          login?: string
          lot_size?: number
          platform?: string
          server?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_reviews: {
        Row: {
          created_at: string
          id: string
          net: number
          summary: string
          trades: number
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          net?: number
          summary: string
          trades?: number
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          net?: number
          summary?: string
          trades?: number
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      whale_signals: {
        Row: {
          change_long: number
          change_short: number
          created_at: string
          id: string
          long_pos: number
          report_date: string
          short_pos: number
          source: string
          symbol: string
        }
        Insert: {
          change_long?: number
          change_short?: number
          created_at?: string
          id?: string
          long_pos: number
          report_date: string
          short_pos: number
          source: string
          symbol: string
        }
        Update: {
          change_long?: number
          change_short?: number
          created_at?: string
          id?: string
          long_pos?: number
          report_date?: string
          short_pos?: number
          source?: string
          symbol?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      make_username: { Args: { _email: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
