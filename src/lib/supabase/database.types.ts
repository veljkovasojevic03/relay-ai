export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      action_runs: {
        Row: {
          action_name: string;
          bot_id: string;
          conversation_id: string;
          created_at: string;
          duration_ms: number | null;
          error: string | null;
          id: string;
          params: NonNullable<Json>;
          result: Json | null;
          simulated: boolean;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          action_name: string;
          bot_id: string;
          conversation_id: string;
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          id?: string;
          params?: NonNullable<Json>;
          result?: Json | null;
          simulated?: boolean;
          status?: string;
          updated_at?: string;
        };
        Update: {
          action_name?: string;
          bot_id?: string;
          conversation_id?: string;
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          id?: string;
          params?: NonNullable<Json>;
          result?: Json | null;
          simulated?: boolean;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "action_runs_action_name_fkey";
            columns: ["action_name"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["name"];
          },
          {
            foreignKeyName: "action_runs_conversation_id_bot_id_fkey";
            columns: ["conversation_id", "bot_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id", "bot_id"];
          },
        ];
      };
      actions: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          n8n_path: string;
          name: string;
          params_schema: NonNullable<Json>;
          requires_confirmation: boolean;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description: string;
          id?: string;
          n8n_path: string;
          name: string;
          params_schema: NonNullable<Json>;
          requires_confirmation?: boolean;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          n8n_path?: string;
          name?: string;
          params_schema?: NonNullable<Json>;
          requires_confirmation?: boolean;
        };
        Relationships: [];
      };
      bot_actions: {
        Row: {
          action_id: string;
          bot_id: string;
          created_at: string;
          enabled: boolean;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          action_id: string;
          bot_id: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
        };
        Update: {
          action_id?: string;
          bot_id?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bot_actions_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bot_actions_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
        ];
      };
      bots: {
        Row: {
          active: boolean;
          allowed_origins: string[];
          brand_color: string;
          created_at: string;
          default_language: string;
          description: string;
          featured_questions: NonNullable<Json>;
          greeting: NonNullable<Json>;
          id: string;
          is_demo: boolean;
          logo_path: string | null;
          name: string;
          owner_id: string;
          position: string;
          public_key: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          allowed_origins?: string[];
          brand_color?: string;
          created_at?: string;
          default_language?: string;
          description?: string;
          featured_questions?: NonNullable<Json>;
          greeting?: NonNullable<Json>;
          id?: string;
          is_demo?: boolean;
          logo_path?: string | null;
          name: string;
          owner_id?: string;
          position?: string;
          public_key?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          allowed_origins?: string[];
          brand_color?: string;
          created_at?: string;
          default_language?: string;
          description?: string;
          featured_questions?: NonNullable<Json>;
          greeting?: NonNullable<Json>;
          id?: string;
          is_demo?: boolean;
          logo_path?: string | null;
          name?: string;
          owner_id?: string;
          position?: string;
          public_key?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bots_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          action_flow: Json | null;
          bot_id: string;
          created_at: string;
          first_response_ms: number | null;
          handed_off_at: string | null;
          id: string;
          ip_hash: string | null;
          language: string;
          last_message_at: string;
          last_message_preview: string | null;
          last_message_role: string | null;
          last_visitor_activity_at: string;
          mode: string;
          owner_unread: boolean;
          rating: string | null;
          realtime_channel: string;
          resolved_by: string | null;
          status: string;
          token_hash: string;
          unknown_streak: number;
          visitor_email: string | null;
          visitor_message_count: number;
        };
        ComputedFields: never;
        Insert: {
          action_flow?: Json | null;
          bot_id: string;
          created_at?: string;
          first_response_ms?: number | null;
          handed_off_at?: string | null;
          id?: string;
          ip_hash?: string | null;
          language?: string;
          last_message_at?: string;
          last_message_preview?: string | null;
          last_message_role?: string | null;
          last_visitor_activity_at?: string;
          mode?: string;
          owner_unread?: boolean;
          rating?: string | null;
          realtime_channel: string;
          resolved_by?: string | null;
          status?: string;
          token_hash: string;
          unknown_streak?: number;
          visitor_email?: string | null;
          visitor_message_count?: number;
        };
        Update: {
          action_flow?: Json | null;
          bot_id?: string;
          created_at?: string;
          first_response_ms?: number | null;
          handed_off_at?: string | null;
          id?: string;
          ip_hash?: string | null;
          language?: string;
          last_message_at?: string;
          last_message_preview?: string | null;
          last_message_role?: string | null;
          last_visitor_activity_at?: string;
          mode?: string;
          owner_unread?: boolean;
          rating?: string | null;
          realtime_channel?: string;
          resolved_by?: string | null;
          status?: string;
          token_hash?: string;
          unknown_streak?: number;
          visitor_email?: string | null;
          visitor_message_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
        ];
      };
      demo_orders: {
        Row: {
          created_at: string;
          email: string;
          eta: string | null;
          id: string;
          items: NonNullable<Json>;
          order_number: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          eta?: string | null;
          id?: string;
          items?: NonNullable<Json>;
          order_number: string;
          status: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          eta?: string | null;
          id?: string;
          items?: NonNullable<Json>;
          order_number?: string;
          status?: string;
        };
        Relationships: [];
      };
      faqs: {
        Row: {
          answer: string;
          bot_id: string;
          created_at: string;
          embedding: string | null;
          embedding_status: string;
          featured: boolean;
          fts: unknown;
          id: string;
          language: string;
          question: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          answer: string;
          bot_id: string;
          created_at?: string;
          embedding?: string | null;
          embedding_status?: string;
          featured?: boolean;
          fts?: never;
          id?: string;
          language?: string;
          question: string;
          updated_at?: string;
        };
        Update: {
          answer?: string;
          bot_id?: string;
          created_at?: string;
          embedding?: string | null;
          embedding_status?: string;
          featured?: boolean;
          fts?: never;
          id?: string;
          language?: string;
          question?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "faqs_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          bot_id: string;
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          meta: NonNullable<Json>;
          role: string;
          source_faq_ids: string[];
        };
        ComputedFields: never;
        Insert: {
          bot_id: string;
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          meta?: NonNullable<Json>;
          role: string;
          source_faq_ids?: string[];
        };
        Update: {
          bot_id?: string;
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          meta?: NonNullable<Json>;
          role?: string;
          source_faq_ids?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_bot_id_fkey";
            columns: ["conversation_id", "bot_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id", "bot_id"];
          },
        ];
      };
      n8n_outbox: {
        Row: {
          attempts: number;
          created_at: string;
          delivered_at: string | null;
          event_id: string;
          id: string;
          last_error: string | null;
          next_attempt_at: string;
          owner_id: string | null;
          payload: NonNullable<Json>;
          status: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          created_at?: string;
          delivered_at?: string | null;
          event_id?: string;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          owner_id?: string | null;
          payload: NonNullable<Json>;
          status?: string;
          type: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          delivered_at?: string | null;
          event_id?: string;
          id?: string;
          last_error?: string | null;
          next_attempt_at?: string;
          owner_id?: string | null;
          payload?: NonNullable<Json>;
          status?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "n8n_outbox_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          current_period_end: string | null;
          display_name: string | null;
          id: string;
          is_sandbox: boolean;
          notification_email: string | null;
          plan: string;
          sandbox_expires_at: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          subscription_status: string | null;
          ui_language: string;
          updated_at: string;
          weekly_digest: boolean;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          current_period_end?: string | null;
          display_name?: string | null;
          id: string;
          is_sandbox?: boolean;
          notification_email?: string | null;
          plan?: string;
          sandbox_expires_at?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: string | null;
          ui_language?: string;
          updated_at?: string;
          weekly_digest?: boolean;
        };
        Update: {
          created_at?: string;
          current_period_end?: string | null;
          display_name?: string | null;
          id?: string;
          is_sandbox?: boolean;
          notification_email?: string | null;
          plan?: string;
          sandbox_expires_at?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_status?: string | null;
          ui_language?: string;
          updated_at?: string;
          weekly_digest?: boolean;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          count: number;
          created_at: string;
          id: string;
          key: string;
          window_start: string;
        };
        ComputedFields: never;
        Insert: {
          count?: number;
          created_at?: string;
          id?: string;
          key: string;
          window_start: string;
        };
        Update: {
          count?: number;
          created_at?: string;
          id?: string;
          key?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      seen_event_ids: {
        Row: {
          created_at: string;
          event_id: string;
          id: string;
          seen_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          id?: string;
          seen_at?: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          id?: string;
          seen_at?: string;
        };
        Relationships: [];
      };
      stripe_events: {
        Row: {
          created_at: string;
          id: string;
          processed_at: string | null;
          stripe_event_id: string;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          processed_at?: string | null;
          stripe_event_id: string;
          type: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          processed_at?: string | null;
          stripe_event_id?: string;
          type?: string;
        };
        Relationships: [];
      };
      tickets: {
        Row: {
          bot_id: string;
          conversation_id: string | null;
          created_at: string;
          description: string;
          id: string;
          reference: string | null;
          status: string;
          subject: string;
          updated_at: string;
          visitor_email: string | null;
        };
        ComputedFields: never;
        Insert: {
          bot_id: string;
          conversation_id?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          reference?: string | null;
          status?: string;
          subject: string;
          updated_at?: string;
          visitor_email?: string | null;
        };
        Update: {
          bot_id?: string;
          conversation_id?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          reference?: string | null;
          status?: string;
          subject?: string;
          updated_at?: string;
          visitor_email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tickets_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tickets_conversation_id_bot_id_fkey";
            columns: ["conversation_id", "bot_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id", "bot_id"];
          },
        ];
      };
      unknown_questions: {
        Row: {
          bot_id: string;
          conversation_id: string | null;
          created_at: string;
          id: string;
          language: string;
          question: string;
          status: string;
          suggested_answer: string | null;
          suggestion_source: string;
        };
        ComputedFields: never;
        Insert: {
          bot_id: string;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          language?: string;
          question: string;
          status?: string;
          suggested_answer?: string | null;
          suggestion_source?: string;
        };
        Update: {
          bot_id?: string;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          language?: string;
          question?: string;
          status?: string;
          suggested_answer?: string | null;
          suggestion_source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "unknown_questions_bot_id_fkey";
            columns: ["bot_id"];
            isOneToOne: false;
            referencedRelation: "bots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "unknown_questions_conversation_id_bot_id_fkey";
            columns: ["conversation_id", "bot_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id", "bot_id"];
          },
        ];
      };
      usage_counters: {
        Row: {
          conversations_started: number;
          created_at: string;
          id: string;
          period: string;
          profile_id: string;
        };
        ComputedFields: never;
        Insert: {
          conversations_started?: number;
          created_at?: string;
          id?: string;
          period: string;
          profile_id: string;
        };
        Update: {
          conversations_started?: number;
          created_at?: string;
          id?: string;
          period?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usage_counters_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_visitor_message: {
        Args: {
          p_bot_id: string;
          p_content: string;
          p_conversation_id: string;
          p_language: string;
          p_max_messages: number;
        };
        Returns: Json;
      };
      analytics_summary: { Args: { p_bot_id?: string; p_days?: number }; Returns: Json };
      apply_n8n_callback: {
        Args: { p_error: string; p_event_id: string; p_status: string };
        Returns: Json;
      };
      bot_accepts_conversations: { Args: { p_bot_id: string }; Returns: boolean };
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      claim_outbox: {
        Args: { p_lease_seconds: number; p_limit: number };
        Returns: {
          attempts: number;
          created_at: string;
          delivered_at: string | null;
          event_id: string;
          id: string;
          last_error: string | null;
          next_attempt_at: string;
          owner_id: string | null;
          payload: NonNullable<Json>;
          status: string;
          type: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "n8n_outbox";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      digest_stats: { Args: { p_since: string }; Returns: Json };
      health_check: { Args: Record<PropertyKey, never>; Returns: string };
      is_valid_origin_list: { Args: { origins: string[] }; Returns: boolean };
      match_faqs: {
        Args: {
          p_bot_id: string;
          p_hybrid?: boolean;
          p_k?: number;
          p_language?: string;
          p_query_embedding: string;
          p_query_text: string;
        };
        Returns: {
          answer: string;
          featured: boolean;
          id: string;
          keyword_overlap: number;
          language: string;
          question: string;
          rrf_score: number;
          similarity: number;
          text_rank: number;
          vector_rank: number;
        }[];
      };
      owner_reply: {
        Args: { p_content: string; p_conversation_id: string; p_reply_email: Json };
        Returns: Json;
      };
      plan_bot_limit: { Args: { p_plan: string }; Returns: number };
      plan_conversation_limit: { Args: { p_plan: string }; Returns: number };
      purge_expired_data: { Args: Record<PropertyKey, never>; Returns: Json };
      record_bot_reply: {
        Args: {
          p_bot_id: string;
          p_content: string;
          p_conversation_id: string;
          p_first_response_ms: number;
          p_language: string;
          p_meta: Json;
          p_outcome: string;
          p_question: string;
          p_source_faq_ids: string[];
        };
        Returns: Json;
      };
      request_handoff: {
        Args: {
          p_bot_id: string;
          p_conversation_id: string;
          p_email: string;
          p_escalation: Json;
          p_reason: string;
          p_system_message: string;
        };
        Returns: Json;
      };
      search_normalize: { Args: { p_text: string }; Returns: string };
      start_conversation: {
        Args: { p_bot_id: string; p_ip_hash: string; p_language: string; p_token_hash: string };
        Returns: Json;
      };
      touch_visitor_activity: {
        Args: { p_bot_id: string; p_conversation_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
