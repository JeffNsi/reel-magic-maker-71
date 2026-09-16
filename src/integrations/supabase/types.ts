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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      clip_purchases: {
        Row: {
          amount: number
          buyer_email: string | null
          buyer_user_id: string | null
          created_at: string
          currency: string
          delivery_token: string
          environment: string
          id: string
          paid_at: string | null
          provider: string
          reference: string | null
          scene_id: string
          status: string
          story_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          buyer_email?: string | null
          buyer_user_id?: string | null
          created_at?: string
          currency?: string
          delivery_token: string
          environment?: string
          id?: string
          paid_at?: string | null
          provider: string
          reference?: string | null
          scene_id: string
          status?: string
          story_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_email?: string | null
          buyer_user_id?: string | null
          created_at?: string
          currency?: string
          delivery_token?: string
          environment?: string
          id?: string
          paid_at?: string | null
          provider?: string
          reference?: string | null
          scene_id?: string
          status?: string
          story_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clip_purchases_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "story_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clip_purchases_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_purchases: {
        Row: {
          amount: number
          created_at: string | null
          currency: string
          environment: string
          id: string
          pack: string
          provider: string
          reference: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string
          environment?: string
          id?: string
          pack: string
          provider: string
          reference: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string
          environment?: string
          id?: string
          pack?: string
          provider?: string
          reference?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      director_sessions: {
        Row: {
          blueprint: string | null
          breakthrough: string | null
          breakthroughs: Json
          challenge: Json | null
          confidence: Json
          created_at: string
          creative_truth: Json | null
          evolution: Json | null
          film_bible: Json | null
          film_model: Json | null
          id: string
          idea: string
          question_count: number
          recommendation: Json | null
          session_id: string
          simplify_rejections: number
          status: string
          style: string
          understanding: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          blueprint?: string | null
          breakthrough?: string | null
          breakthroughs?: Json
          challenge?: Json | null
          confidence?: Json
          created_at?: string
          creative_truth?: Json | null
          evolution?: Json | null
          film_bible?: Json | null
          film_model?: Json | null
          id?: string
          idea: string
          question_count?: number
          recommendation?: Json | null
          session_id: string
          simplify_rejections?: number
          status?: string
          style?: string
          understanding?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          blueprint?: string | null
          breakthrough?: string | null
          breakthroughs?: Json
          challenge?: Json | null
          confidence?: Json
          created_at?: string
          creative_truth?: Json | null
          evolution?: Json | null
          film_bible?: Json | null
          film_model?: Json | null
          id?: string
          idea?: string
          question_count?: number
          recommendation?: Json | null
          session_id?: string
          simplify_rejections?: number
          status?: string
          style?: string
          understanding?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "director_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      director_turns: {
        Row: {
          answer: string
          created_at: string
          dimension: string
          director_session_id: string
          id: string
          position: number
          question: string
          skipped: boolean
          updated_at: string
        }
        Insert: {
          answer?: string
          created_at?: string
          dimension?: string
          director_session_id: string
          id?: string
          position: number
          question: string
          skipped?: boolean
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          dimension?: string
          director_session_id?: string
          id?: string
          position?: number
          question?: string
          skipped?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "director_turns_director_session_id_fkey"
            columns: ["director_session_id"]
            isOneToOne: false
            referencedRelation: "director_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dramas: {
        Row: {
          cover_url: string
          created_at: string
          description: string | null
          id: string
          is_vip_only: boolean
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          cover_url: string
          created_at?: string
          description?: string | null
          id?: string
          is_vip_only?: boolean
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          cover_url?: string
          created_at?: string
          description?: string | null
          id?: string
          is_vip_only?: boolean
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      episodes: {
        Row: {
          coin_cost: number
          created_at: string
          drama_id: string
          episode_number: number
          id: string
          is_free: boolean
          source_generation_id: string | null
          storage_path: string | null
          title: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          coin_cost?: number
          created_at?: string
          drama_id: string
          episode_number: number
          id?: string
          is_free?: boolean
          source_generation_id?: string | null
          storage_path?: string | null
          title?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          coin_cost?: number
          created_at?: string
          drama_id?: string
          episode_number?: number
          id?: string
          is_free?: boolean
          source_generation_id?: string | null
          storage_path?: string | null
          title?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episodes_drama_id_fkey"
            columns: ["drama_id"]
            isOneToOne: false
            referencedRelation: "dramas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_source_generation_id_fkey"
            columns: ["source_generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      film_watchlist: {
        Row: {
          created_at: string
          id: string
          session_id: string
          story_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_id: string
          story_id: string
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "film_watchlist_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          coins_spent: number
          created_at: string
          director_session_id: string | null
          episode_id: string | null
          error_message: string | null
          fal_request_id: string | null
          id: string
          idea: string
          music_track: string | null
          narration: string | null
          prompt_final: string | null
          provider: string
          scene_number: number | null
          session_id: string
          status: string
          story_id: string | null
          style: string
          updated_at: string
          user_id: string | null
          video_url: string | null
          voiceover_url: string | null
        }
        Insert: {
          coins_spent?: number
          created_at?: string
          director_session_id?: string | null
          episode_id?: string | null
          error_message?: string | null
          fal_request_id?: string | null
          id?: string
          idea: string
          music_track?: string | null
          narration?: string | null
          prompt_final?: string | null
          provider?: string
          scene_number?: number | null
          session_id: string
          status?: string
          story_id?: string | null
          style: string
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
          voiceover_url?: string | null
        }
        Update: {
          coins_spent?: number
          created_at?: string
          director_session_id?: string | null
          episode_id?: string | null
          error_message?: string | null
          fal_request_id?: string | null
          id?: string
          idea?: string
          music_track?: string | null
          narration?: string | null
          prompt_final?: string | null
          provider?: string
          scene_number?: number | null
          session_id?: string
          status?: string
          story_id?: string | null
          style?: string
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
          voiceover_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generations_director_session_id_fkey"
            columns: ["director_session_id"]
            isOneToOne: false
            referencedRelation: "director_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      my_list: {
        Row: {
          created_at: string
          drama_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          drama_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          drama_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "my_list_drama_id_fkey"
            columns: ["drama_id"]
            isOneToOne: false
            referencedRelation: "dramas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "my_list_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bonus_coins: number
          checkin_streak: number
          created_at: string
          email: string | null
          id: string
          is_vip: boolean
          last_checkin_date: string | null
          paid_coins: number
          updated_at: string
          vip_until: string | null
        }
        Insert: {
          bonus_coins?: number
          checkin_streak?: number
          created_at?: string
          email?: string | null
          id: string
          is_vip?: boolean
          last_checkin_date?: string | null
          paid_coins?: number
          updated_at?: string
          vip_until?: string | null
        }
        Update: {
          bonus_coins?: number
          checkin_streak?: number
          created_at?: string
          email?: string | null
          id?: string
          is_vip?: boolean
          last_checkin_date?: string | null
          paid_coins?: number
          updated_at?: string
          vip_until?: string | null
        }
        Relationships: []
      }
      stories: {
        Row: {
          blueprint: string | null
          characters: Json
          created_at: string
          director_session_id: string | null
          id: string
          logline: string
          session_id: string
          setting: string
          style: string
          theme: string
          title: string
          updated_at: string
        }
        Insert: {
          blueprint?: string | null
          characters?: Json
          created_at?: string
          director_session_id?: string | null
          id?: string
          logline?: string
          session_id: string
          setting?: string
          style?: string
          theme?: string
          title?: string
          updated_at?: string
        }
        Update: {
          blueprint?: string | null
          characters?: Json
          created_at?: string
          director_session_id?: string | null
          id?: string
          logline?: string
          session_id?: string
          setting?: string
          style?: string
          theme?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      story_scenes: {
        Row: {
          clarity_note: string | null
          clarity_verdict: string | null
          complexity: number | null
          created_at: string
          credit_cost: number
          generation_id: string | null
          id: string
          idea: string
          narration: string
          queue_position: number | null
          queued: boolean
          scene_number: number
          story_id: string
          title: string
          truth: Json | null
          updated_at: string
        }
        Insert: {
          clarity_note?: string | null
          clarity_verdict?: string | null
          complexity?: number | null
          created_at?: string
          credit_cost?: number
          generation_id?: string | null
          id?: string
          idea?: string
          narration?: string
          queue_position?: number | null
          queued?: boolean
          scene_number: number
          story_id: string
          title?: string
          truth?: Json | null
          updated_at?: string
        }
        Update: {
          clarity_note?: string | null
          clarity_verdict?: string | null
          complexity?: number | null
          created_at?: string
          credit_cost?: number
          generation_id?: string | null
          id?: string
          idea?: string
          narration?: string
          queue_position?: number | null
          queued?: boolean
          scene_number?: number
          story_id?: string
          title?: string
          truth?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_scenes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      team_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["team_role"]
          status: string
          team_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["team_role"]
          status?: string
          team_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["team_role"]
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          member_limit: number
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_limit?: number
          name?: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          member_limit?: number
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_unlocked_episodes: {
        Row: {
          episode_id: string
          id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          episode_id: string
          id?: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          episode_id?: string
          id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_unlocked_episodes_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_unlocked_episodes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      team_role: "owner" | "editor" | "viewer"
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
      team_role: ["owner", "editor", "viewer"],
    },
  },
} as const
