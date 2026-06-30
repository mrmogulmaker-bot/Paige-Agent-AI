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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      _internal_secrets: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      account_modifications: {
        Row: {
          account_id: string | null
          account_table: string
          client_id: string | null
          created_at: string
          id: string
          modification_source: string
          modification_type: string
          modified_by_user_id: string
          new_value: Json | null
          notes: string | null
          previous_value: Json | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          account_table?: string
          client_id?: string | null
          created_at?: string
          id?: string
          modification_source: string
          modification_type: string
          modified_by_user_id: string
          new_value?: Json | null
          notes?: string | null
          previous_value?: Json | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          account_table?: string
          client_id?: string | null
          created_at?: string
          id?: string
          modification_source?: string
          modification_type?: string
          modified_by_user_id?: string
          new_value?: Json | null
          notes?: string | null
          previous_value?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_modifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_modifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "account_modifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "account_modifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      affiliate_applications: {
        Row: {
          audience_description: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          requested_tier_key: string
          resulting_affiliate_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          social_links: string | null
          status: string
          updated_at: string
          user_id: string | null
          website_url: string | null
          why_join: string | null
        }
        Insert: {
          audience_description?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          phone?: string | null
          requested_tier_key?: string
          resulting_affiliate_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          social_links?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
          why_join?: string | null
        }
        Update: {
          audience_description?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          requested_tier_key?: string
          resulting_affiliate_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          social_links?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
          why_join?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_applications_resulting_affiliate_id_fkey"
            columns: ["resulting_affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_applications_resulting_affiliate_id_fkey"
            columns: ["resulting_affiliate_id"]
            isOneToOne: false
            referencedRelation: "v_affiliate_stats"
            referencedColumns: ["affiliate_id"]
          },
        ]
      }
      affiliate_commission_tiers: {
        Row: {
          commission_rate: number
          created_at: string
          display_name: string
          duration_months: number | null
          id: string
          is_recurring: boolean
          notes: string | null
          tier_key: string
          updated_at: string
        }
        Insert: {
          commission_rate: number
          created_at?: string
          display_name: string
          duration_months?: number | null
          id?: string
          is_recurring?: boolean
          notes?: string | null
          tier_key: string
          updated_at?: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          display_name?: string
          duration_months?: number | null
          id?: string
          is_recurring?: boolean
          notes?: string | null
          tier_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      affiliate_profiles: {
        Row: {
          active: boolean
          commission_tier_id: string | null
          created_at: string
          enrolled_from: string | null
          id: string
          referral_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          commission_tier_id?: string | null
          created_at?: string
          enrolled_from?: string | null
          id?: string
          referral_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          commission_tier_id?: string | null
          created_at?: string
          enrolled_from?: string | null
          id?: string
          referral_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_profiles_commission_tier_id_fkey"
            columns: ["commission_tier_id"]
            isOneToOne: false
            referencedRelation: "affiliate_commission_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_templates: {
        Row: {
          body_markdown: string
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_forkable: boolean
          layer: string
          merge_fields: Json
          required_at_signup: boolean
          slug: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          body_markdown: string
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_forkable?: boolean
          layer: string
          merge_fields?: Json
          required_at_signup?: boolean
          slug: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          body_markdown?: string
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_forkable?: boolean
          layer?: string
          merge_fields?: Json
          required_at_signup?: boolean
          slug?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          device_type: string | null
          event_category: string
          event_name: string
          id: string
          page_path: string | null
          properties: Json
          referral_code: string | null
          referrer: string | null
          session_id: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          event_category: string
          event_name: string
          id?: string
          page_path?: string | null
          properties?: Json
          referral_code?: string | null
          referrer?: string | null
          session_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          device_type?: string | null
          event_category?: string
          event_name?: string
          id?: string
          page_path?: string | null
          properties?: Json
          referral_code?: string | null
          referrer?: string | null
          session_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          created_at: string
          function_name: string
          id: string
          request_count: number
          user_id: string | null
          window_start: string
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: string
          request_count?: number
          user_id?: string | null
          window_start?: string
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: string
          request_count?: number
          user_id?: string | null
          window_start?: string
        }
        Relationships: []
      }
      app_settings_owner: {
        Row: {
          owner_email: string
        }
        Insert: {
          owner_email: string
        }
        Update: {
          owner_email?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          data: Json | null
          entity: string
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          data?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          data?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      balance_snapshots: {
        Row: {
          account_id: string
          available: number | null
          balance: number
          created_at: string | null
          id: string
          snapshot_date: string
          user_id: string
        }
        Insert: {
          account_id: string
          available?: number | null
          balance: number
          created_at?: string | null
          id?: string
          snapshot_date: string
          user_id: string
        }
        Update: {
          account_id?: string
          available?: number | null
          balance?: number
          created_at?: string | null
          id?: string
          snapshot_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "connected_bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      banking_relationships: {
        Row: {
          account_open_date: string | null
          account_standing: string
          average_monthly_balance: number | null
          business_id: string | null
          created_at: string
          current_balance: number | null
          has_direct_deposit: boolean
          id: string
          institution_name: string
          institution_type: string
          is_primary_institution: boolean
          months_at_institution: number | null
          nsf_count_last_12_months: number
          overdraft_count_last_12_months: number
          qb_account_id: string | null
          qb_synced_at: string | null
          relationship_type: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_open_date?: string | null
          account_standing?: string
          average_monthly_balance?: number | null
          business_id?: string | null
          created_at?: string
          current_balance?: number | null
          has_direct_deposit?: boolean
          id?: string
          institution_name: string
          institution_type: string
          is_primary_institution?: boolean
          months_at_institution?: number | null
          nsf_count_last_12_months?: number
          overdraft_count_last_12_months?: number
          qb_account_id?: string | null
          qb_synced_at?: string | null
          relationship_type: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_open_date?: string | null
          account_standing?: string
          average_monthly_balance?: number | null
          business_id?: string | null
          created_at?: string
          current_balance?: number | null
          has_direct_deposit?: boolean
          id?: string
          institution_name?: string
          institution_type?: string
          is_primary_institution?: boolean
          months_at_institution?: number | null
          nsf_count_last_12_months?: number
          overdraft_count_last_12_months?: number
          qb_account_id?: string | null
          qb_synced_at?: string | null
          relationship_type?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banking_relationships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_client_relationships: {
        Row: {
          added_at: string
          broker_id: string
          broker_notes: string | null
          client_email: string
          client_first_name: string
          client_goal: string | null
          client_last_name: string
          client_phone: string | null
          client_stripe_subscription_id: string | null
          client_subscription_status: string
          client_user_id: string | null
          created_at: string
          discount_code: string | null
          id: string
          is_active: boolean
          last_session_at: string | null
          last_session_summary: string | null
          notes: string | null
          relationship_stage: string | null
          session_count: number
          shared_goal: string | null
          updated_at: string
        }
        Insert: {
          added_at?: string
          broker_id: string
          broker_notes?: string | null
          client_email: string
          client_first_name: string
          client_goal?: string | null
          client_last_name: string
          client_phone?: string | null
          client_stripe_subscription_id?: string | null
          client_subscription_status?: string
          client_user_id?: string | null
          created_at?: string
          discount_code?: string | null
          id?: string
          is_active?: boolean
          last_session_at?: string | null
          last_session_summary?: string | null
          notes?: string | null
          relationship_stage?: string | null
          session_count?: number
          shared_goal?: string | null
          updated_at?: string
        }
        Update: {
          added_at?: string
          broker_id?: string
          broker_notes?: string | null
          client_email?: string
          client_first_name?: string
          client_goal?: string | null
          client_last_name?: string
          client_phone?: string | null
          client_stripe_subscription_id?: string | null
          client_subscription_status?: string
          client_user_id?: string | null
          created_at?: string
          discount_code?: string | null
          id?: string
          is_active?: boolean
          last_session_at?: string | null
          last_session_summary?: string | null
          notes?: string | null
          relationship_stage?: string | null
          session_count?: number
          shared_goal?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_client_relationships_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "broker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_paige_sessions: {
        Row: {
          broker_id: string
          client_relationship_id: string
          conversation: Json
          created_at: string
          id: string
          key_insights: Json | null
          session_type: string
          summary: string | null
          summary_shared_at: string | null
          team_member_id: string | null
          updated_at: string
        }
        Insert: {
          broker_id: string
          client_relationship_id: string
          conversation?: Json
          created_at?: string
          id?: string
          key_insights?: Json | null
          session_type?: string
          summary?: string | null
          summary_shared_at?: string | null
          team_member_id?: string | null
          updated_at?: string
        }
        Update: {
          broker_id?: string
          client_relationship_id?: string
          conversation?: Json
          created_at?: string
          id?: string
          key_insights?: Json | null
          session_type?: string
          summary?: string | null
          summary_shared_at?: string | null
          team_member_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_paige_sessions_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "broker_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_paige_sessions_client_relationship_id_fkey"
            columns: ["client_relationship_id"]
            isOneToOne: false
            referencedRelation: "broker_client_relationships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_paige_sessions_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "broker_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_profiles: {
        Row: {
          approved_at: string | null
          bio: string | null
          broker_client_discount_code: string | null
          broker_referral_code: string | null
          broker_type: string
          business_name: string
          client_count: number
          client_count_quoted: number | null
          created_at: string
          current_client_count: number
          decline_reason: string | null
          declined_at: string | null
          firm_description: string | null
          id: string
          license_number: string | null
          monthly_fee: number
          paige_context_notes: string | null
          preferred_greeting: string | null
          referral_code: string | null
          specializations: string[] | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          typical_client_profile: string | null
          updated_at: string
          use_case: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          approved_at?: string | null
          bio?: string | null
          broker_client_discount_code?: string | null
          broker_referral_code?: string | null
          broker_type: string
          business_name: string
          client_count?: number
          client_count_quoted?: number | null
          created_at?: string
          current_client_count?: number
          decline_reason?: string | null
          declined_at?: string | null
          firm_description?: string | null
          id?: string
          license_number?: string | null
          monthly_fee?: number
          paige_context_notes?: string | null
          preferred_greeting?: string | null
          referral_code?: string | null
          specializations?: string[] | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          typical_client_profile?: string | null
          updated_at?: string
          use_case?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          approved_at?: string | null
          bio?: string | null
          broker_client_discount_code?: string | null
          broker_referral_code?: string | null
          broker_type?: string
          business_name?: string
          client_count?: number
          client_count_quoted?: number | null
          created_at?: string
          current_client_count?: number
          decline_reason?: string | null
          declined_at?: string | null
          firm_description?: string | null
          id?: string
          license_number?: string | null
          monthly_fee?: number
          paige_context_notes?: string | null
          preferred_greeting?: string | null
          referral_code?: string | null
          specializations?: string[] | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          typical_client_profile?: string | null
          updated_at?: string
          use_case?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      broker_referral_commissions: {
        Row: {
          commission_rate: number
          created_at: string
          duration_months: number
          expires_at: string | null
          id: string
          monthly_amount: number
          referred_broker_id: string
          referring_broker_id: string
          started_at: string
          status: string
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          duration_months?: number
          expires_at?: string | null
          id?: string
          monthly_amount: number
          referred_broker_id: string
          referring_broker_id: string
          started_at?: string
          status?: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          duration_months?: number
          expires_at?: string | null
          id?: string
          monthly_amount?: number
          referred_broker_id?: string
          referring_broker_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_referral_commissions_referred_broker_id_fkey"
            columns: ["referred_broker_id"]
            isOneToOne: false
            referencedRelation: "broker_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_referral_commissions_referring_broker_id_fkey"
            columns: ["referring_broker_id"]
            isOneToOne: false
            referencedRelation: "broker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_session_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_session_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "broker_paige_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_team_members: {
        Row: {
          accepted_at: string | null
          auth_user_id: string | null
          broker_id: string
          created_at: string
          email: string
          first_name: string | null
          id: string
          invitation_expires_at: string | null
          invitation_token: string | null
          invited_at: string
          last_name: string | null
          last_sign_in_at: string | null
          permissions: Json
          role: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          auth_user_id?: string | null
          broker_id: string
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          invitation_expires_at?: string | null
          invitation_token?: string | null
          invited_at?: string
          last_name?: string | null
          last_sign_in_at?: string | null
          permissions?: Json
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          auth_user_id?: string | null
          broker_id?: string
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          invitation_expires_at?: string | null
          invitation_token?: string | null
          invited_at?: string
          last_name?: string | null
          last_sign_in_at?: string | null
          permissions?: Json
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_team_members_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "broker_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      browser_use_sessions: {
        Row: {
          completed_at: string | null
          cost_cents: number
          created_at: string
          duration_ms: number | null
          error: string | null
          goal: string
          id: string
          invoker_kind: string
          invoker_user_id: string | null
          related_business_id: string | null
          related_contact_id: string | null
          result: Json
          screenshots: string[]
          session_replay_url: string | null
          start_url: string | null
          status: string
          steps: Json
        }
        Insert: {
          completed_at?: string | null
          cost_cents?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          goal: string
          id?: string
          invoker_kind?: string
          invoker_user_id?: string | null
          related_business_id?: string | null
          related_contact_id?: string | null
          result?: Json
          screenshots?: string[]
          session_replay_url?: string | null
          start_url?: string | null
          status?: string
          steps?: Json
        }
        Update: {
          completed_at?: string | null
          cost_cents?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          goal?: string
          id?: string
          invoker_kind?: string
          invoker_user_id?: string | null
          related_business_id?: string | null
          related_contact_id?: string | null
          result?: Json
          screenshots?: string[]
          session_replay_url?: string | null
          start_url?: string | null
          status?: string
          steps?: Json
        }
        Relationships: [
          {
            foreignKeyName: "browser_use_sessions_related_business_id_fkey"
            columns: ["related_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "browser_use_sessions_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "browser_use_sessions_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "browser_use_sessions_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "browser_use_sessions_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      btf_document_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          description: string | null
          document_id: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          id: string
          phase_item_id: string | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string | null
          status: Database["public"]["Enums"]["btf_doc_status"]
          storage_path: string | null
          title: string
          updated_at: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string
          description?: string | null
          document_id?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          phase_item_id?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["btf_doc_status"]
          storage_path?: string | null
          title: string
          updated_at?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string
          description?: string | null
          document_id?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          phase_item_id?: string | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string | null
          status?: Database["public"]["Enums"]["btf_doc_status"]
          storage_path?: string | null
          title?: string
          updated_at?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "btf_document_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "btf_document_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "btf_document_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "btf_document_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "btf_document_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "btf_document_requests_phase_item_id_fkey"
            columns: ["phase_item_id"]
            isOneToOne: false
            referencedRelation: "btf_phase_items"
            referencedColumns: ["id"]
          },
        ]
      }
      btf_messages: {
        Row: {
          attachments: Json
          body: string
          client_id: string
          created_at: string
          id: string
          pinned: boolean
          read_at: string | null
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          attachments?: Json
          body: string
          client_id: string
          created_at?: string
          id?: string
          pinned?: boolean
          read_at?: string | null
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          attachments?: Json
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          pinned?: boolean
          read_at?: string | null
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "btf_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "btf_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "btf_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "btf_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      btf_phase_item_templates: {
        Row: {
          assigned_to: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          item_key: string
          phase: Database["public"]["Enums"]["btf_phase"]
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          item_key: string
          phase: Database["public"]["Enums"]["btf_phase"]
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          item_key?: string
          phase?: Database["public"]["Enums"]["btf_phase"]
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      btf_phase_items: {
        Row: {
          assigned_to: string
          client_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          item_key: string
          notes: string | null
          phase: Database["public"]["Enums"]["btf_phase"]
          sort_order: number
          status: Database["public"]["Enums"]["btf_item_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string
          client_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          item_key: string
          notes?: string | null
          phase: Database["public"]["Enums"]["btf_phase"]
          sort_order?: number
          status?: Database["public"]["Enums"]["btf_item_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          client_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          item_key?: string
          notes?: string | null
          phase?: Database["public"]["Enums"]["btf_phase"]
          sort_order?: number
          status?: Database["public"]["Enums"]["btf_item_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "btf_phase_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "btf_phase_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "btf_phase_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "btf_phase_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      btf_workspace_invites: {
        Row: {
          btf_deal_id: string | null
          client_id: string
          created_at: string
          created_by_user_id: string | null
          created_via: string
          email: string
          expires_at: string
          id: string
          metadata: Json
          token_hash: string
          used_at: string | null
        }
        Insert: {
          btf_deal_id?: string | null
          client_id: string
          created_at?: string
          created_by_user_id?: string | null
          created_via?: string
          email: string
          expires_at: string
          id?: string
          metadata?: Json
          token_hash: string
          used_at?: string | null
        }
        Update: {
          btf_deal_id?: string | null
          client_id?: string
          created_at?: string
          created_by_user_id?: string | null
          created_via?: string
          email?: string
          expires_at?: string
          id?: string
          metadata?: Json
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "btf_workspace_invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "btf_workspace_invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "btf_workspace_invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "btf_workspace_invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      btf_workspace_settings: {
        Row: {
          client_id: string
          created_at: string
          current_phase: Database["public"]["Enums"]["btf_phase"]
          id: string
          intake_data: Json
          intake_submitted_at: string | null
          last_activity_at: string | null
          mma_os_btf_deal_id: string | null
          portal_first_login_at: string | null
          portal_invited_at: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          current_phase?: Database["public"]["Enums"]["btf_phase"]
          id?: string
          intake_data?: Json
          intake_submitted_at?: string | null
          last_activity_at?: string | null
          mma_os_btf_deal_id?: string | null
          portal_first_login_at?: string | null
          portal_invited_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          current_phase?: Database["public"]["Enums"]["btf_phase"]
          id?: string
          intake_data?: Json
          intake_submitted_at?: string | null
          last_activity_at?: string | null
          mma_os_btf_deal_id?: string | null
          portal_first_login_at?: string | null
          portal_invited_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "btf_workspace_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "btf_workspace_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "btf_workspace_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "btf_workspace_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      build_milestones: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          id: string
          milestone_key: string
          phase: string
          required_for_phase: boolean
          sort_order: number
          track: string
          verification_type: string
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          milestone_key: string
          phase: string
          required_for_phase?: boolean
          sort_order?: number
          track: string
          verification_type: string
          weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          milestone_key?: string
          phase?: string
          required_for_phase?: boolean
          sort_order?: number
          track?: string
          verification_type?: string
          weight?: number
        }
        Relationships: []
      }
      build_progress: {
        Row: {
          business_id: string | null
          created_at: string
          current_phase: string
          id: string
          last_assessed_at: string
          overall_score: number
          phase_started_at: string
          phase_target_completion: string | null
          track: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          current_phase?: string
          id?: string
          last_assessed_at?: string
          overall_score?: number
          phase_started_at?: string
          phase_target_completion?: string | null
          track: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          current_phase?: string
          id?: string
          last_assessed_at?: string
          overall_score?: number
          phase_started_at?: string
          phase_target_completion?: string | null
          track?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_progress_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      build_recommendations: {
        Row: {
          acted_at: string | null
          action_type: string
          body: string
          created_at: string
          external_url: string | null
          id: string
          milestone_key: string | null
          phase: string
          priority: number
          status: string
          title: string
          track: string
          user_id: string
          vendor_or_product: string | null
        }
        Insert: {
          acted_at?: string | null
          action_type: string
          body: string
          created_at?: string
          external_url?: string | null
          id?: string
          milestone_key?: string | null
          phase: string
          priority?: number
          status?: string
          title: string
          track: string
          user_id: string
          vendor_or_product?: string | null
        }
        Update: {
          acted_at?: string | null
          action_type?: string
          body?: string
          created_at?: string
          external_url?: string | null
          id?: string
          milestone_key?: string | null
          phase?: string
          priority?: number
          status?: string
          title?: string
          track?: string
          user_id?: string
          vendor_or_product?: string | null
        }
        Relationships: []
      }
      build_scores: {
        Row: {
          active_vendors: number | null
          activity_recency_score: number | null
          build_score: number | null
          bureau_health_score: number | null
          compliance_pass: boolean | null
          compliance_score: number | null
          created_at: string | null
          current_tier: string | null
          duns_verified: boolean | null
          funding_readiness_score: number | null
          id: string
          intelliscore: number | null
          last_calculated_at: string | null
          months_clean_reporting: number | null
          paydex: number | null
          tier_b_unlocked: boolean | null
          tier_d_unlocked: boolean | null
          tier_i_unlocked: boolean | null
          tier_l_unlocked: boolean | null
          tier_u_unlocked: boolean | null
          updated_at: string | null
          user_id: string
          vendors_score: number | null
        }
        Insert: {
          active_vendors?: number | null
          activity_recency_score?: number | null
          build_score?: number | null
          bureau_health_score?: number | null
          compliance_pass?: boolean | null
          compliance_score?: number | null
          created_at?: string | null
          current_tier?: string | null
          duns_verified?: boolean | null
          funding_readiness_score?: number | null
          id?: string
          intelliscore?: number | null
          last_calculated_at?: string | null
          months_clean_reporting?: number | null
          paydex?: number | null
          tier_b_unlocked?: boolean | null
          tier_d_unlocked?: boolean | null
          tier_i_unlocked?: boolean | null
          tier_l_unlocked?: boolean | null
          tier_u_unlocked?: boolean | null
          updated_at?: string | null
          user_id: string
          vendors_score?: number | null
        }
        Update: {
          active_vendors?: number | null
          activity_recency_score?: number | null
          build_score?: number | null
          bureau_health_score?: number | null
          compliance_pass?: boolean | null
          compliance_score?: number | null
          created_at?: string | null
          current_tier?: string | null
          duns_verified?: boolean | null
          funding_readiness_score?: number | null
          id?: string
          intelliscore?: number | null
          last_calculated_at?: string | null
          months_clean_reporting?: number | null
          paydex?: number | null
          tier_b_unlocked?: boolean | null
          tier_d_unlocked?: boolean | null
          tier_i_unlocked?: boolean | null
          tier_l_unlocked?: boolean | null
          tier_u_unlocked?: boolean | null
          updated_at?: string | null
          user_id?: string
          vendors_score?: number | null
        }
        Relationships: []
      }
      business_certifications: {
        Row: {
          applied_at: string | null
          business_id: string
          certification_number: string | null
          certification_type: string
          certified_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          notes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          business_id: string
          certification_number?: string | null
          certification_type: string
          certified_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          business_id?: string
          certification_number?: string | null
          certification_type?: string
          certified_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_certifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_credit_history: {
        Row: {
          bureau: string
          business_id: string
          created_at: string
          id: string
          metric_name: string
          recorded_at: string
          score_value: number
          user_id: string
        }
        Insert: {
          bureau: string
          business_id: string
          created_at?: string
          id?: string
          metric_name: string
          recorded_at?: string
          score_value: number
          user_id: string
        }
        Update: {
          bureau?: string
          business_id?: string
          created_at?: string
          id?: string
          metric_name?: string
          recorded_at?: string
          score_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_credit_history_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_credit_reports: {
        Row: {
          bureau: string
          business_id: string | null
          created_at: string
          days_beyond_terms: number | null
          derogatory_count: number | null
          extraction_error: string | null
          extraction_status: string
          file_path: string | null
          file_url: string | null
          highest_credit_extended: number | null
          id: string
          intelliscore: number | null
          paydex_score: number | null
          payment_trend: string | null
          raw_text: string | null
          report_date: string | null
          sbfe_score: number | null
          trade_line_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bureau: string
          business_id?: string | null
          created_at?: string
          days_beyond_terms?: number | null
          derogatory_count?: number | null
          extraction_error?: string | null
          extraction_status?: string
          file_path?: string | null
          file_url?: string | null
          highest_credit_extended?: number | null
          id?: string
          intelliscore?: number | null
          paydex_score?: number | null
          payment_trend?: string | null
          raw_text?: string | null
          report_date?: string | null
          sbfe_score?: number | null
          trade_line_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bureau?: string
          business_id?: string | null
          created_at?: string
          days_beyond_terms?: number | null
          derogatory_count?: number | null
          extraction_error?: string | null
          extraction_status?: string
          file_path?: string | null
          file_url?: string | null
          highest_credit_extended?: number | null
          id?: string
          intelliscore?: number | null
          paydex_score?: number | null
          payment_trend?: string | null
          raw_text?: string | null
          report_date?: string | null
          sbfe_score?: number | null
          trade_line_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_credit_reports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_financial_docs: {
        Row: {
          business_id: string
          created_at: string | null
          doc_type: string
          document_id: string | null
          expiry_date: string | null
          id: string
          notes: string | null
          status: string
          updated_at: string | null
          upload_date: string | null
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          doc_type: string
          document_id?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string | null
          upload_date?: string | null
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          doc_type?: string
          document_id?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string | null
          upload_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_financial_docs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_financial_docs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      business_public_presence: {
        Row: {
          business_id: string
          created_at: string | null
          facebook_address_match: boolean | null
          facebook_name_match: boolean | null
          facebook_phone_match: boolean | null
          facebook_url: string | null
          google_address_match: boolean | null
          google_business_claimed: boolean | null
          google_business_url: string | null
          google_name_match: boolean | null
          google_phone_match: boolean | null
          id: string
          linkedin_address_match: boolean | null
          linkedin_name_match: boolean | null
          linkedin_phone_match: boolean | null
          linkedin_url: string | null
          listyourself_address_match: boolean | null
          listyourself_name_match: boolean | null
          listyourself_phone_match: boolean | null
          listyourself_url: string | null
          official_address: string | null
          official_name: string | null
          official_phone: string | null
          other_listings: string | null
          other1_address_match: boolean | null
          other1_label: string | null
          other1_name_match: boolean | null
          other1_phone_match: boolean | null
          other1_url: string | null
          other2_address_match: boolean | null
          other2_label: string | null
          other2_name_match: boolean | null
          other2_phone_match: boolean | null
          other2_url: string | null
          updated_at: string | null
          user_id: string
          website_address_match: boolean | null
          website_live: boolean | null
          website_name_match: boolean | null
          website_phone_match: boolean | null
          website_url: string | null
          yelp_address_match: boolean | null
          yelp_exists: boolean | null
          yelp_name_match: boolean | null
          yelp_phone_match: boolean | null
          yelp_url: string | null
        }
        Insert: {
          business_id: string
          created_at?: string | null
          facebook_address_match?: boolean | null
          facebook_name_match?: boolean | null
          facebook_phone_match?: boolean | null
          facebook_url?: string | null
          google_address_match?: boolean | null
          google_business_claimed?: boolean | null
          google_business_url?: string | null
          google_name_match?: boolean | null
          google_phone_match?: boolean | null
          id?: string
          linkedin_address_match?: boolean | null
          linkedin_name_match?: boolean | null
          linkedin_phone_match?: boolean | null
          linkedin_url?: string | null
          listyourself_address_match?: boolean | null
          listyourself_name_match?: boolean | null
          listyourself_phone_match?: boolean | null
          listyourself_url?: string | null
          official_address?: string | null
          official_name?: string | null
          official_phone?: string | null
          other_listings?: string | null
          other1_address_match?: boolean | null
          other1_label?: string | null
          other1_name_match?: boolean | null
          other1_phone_match?: boolean | null
          other1_url?: string | null
          other2_address_match?: boolean | null
          other2_label?: string | null
          other2_name_match?: boolean | null
          other2_phone_match?: boolean | null
          other2_url?: string | null
          updated_at?: string | null
          user_id: string
          website_address_match?: boolean | null
          website_live?: boolean | null
          website_name_match?: boolean | null
          website_phone_match?: boolean | null
          website_url?: string | null
          yelp_address_match?: boolean | null
          yelp_exists?: boolean | null
          yelp_name_match?: boolean | null
          yelp_phone_match?: boolean | null
          yelp_url?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string | null
          facebook_address_match?: boolean | null
          facebook_name_match?: boolean | null
          facebook_phone_match?: boolean | null
          facebook_url?: string | null
          google_address_match?: boolean | null
          google_business_claimed?: boolean | null
          google_business_url?: string | null
          google_name_match?: boolean | null
          google_phone_match?: boolean | null
          id?: string
          linkedin_address_match?: boolean | null
          linkedin_name_match?: boolean | null
          linkedin_phone_match?: boolean | null
          linkedin_url?: string | null
          listyourself_address_match?: boolean | null
          listyourself_name_match?: boolean | null
          listyourself_phone_match?: boolean | null
          listyourself_url?: string | null
          official_address?: string | null
          official_name?: string | null
          official_phone?: string | null
          other_listings?: string | null
          other1_address_match?: boolean | null
          other1_label?: string | null
          other1_name_match?: boolean | null
          other1_phone_match?: boolean | null
          other1_url?: string | null
          other2_address_match?: boolean | null
          other2_label?: string | null
          other2_name_match?: boolean | null
          other2_phone_match?: boolean | null
          other2_url?: string | null
          updated_at?: string | null
          user_id?: string
          website_address_match?: boolean | null
          website_live?: boolean | null
          website_name_match?: boolean | null
          website_phone_match?: boolean | null
          website_url?: string | null
          yelp_address_match?: boolean | null
          yelp_exists?: boolean | null
          yelp_name_match?: boolean | null
          yelp_phone_match?: boolean | null
          yelp_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_public_presence_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_vendors: {
        Row: {
          account_number: string | null
          account_opened_date: string | null
          business_id: string | null
          created_at: string | null
          credit_limit: number | null
          early_payments: number | null
          id: string
          is_active: boolean | null
          last_payment_date: string | null
          late_payments: number | null
          on_time_payments: number | null
          payment_terms: string | null
          reports_to_bureaus: boolean | null
          total_payments: number | null
          updated_at: string | null
          user_id: string
          vendor_name: string
          vendor_type: string
        }
        Insert: {
          account_number?: string | null
          account_opened_date?: string | null
          business_id?: string | null
          created_at?: string | null
          credit_limit?: number | null
          early_payments?: number | null
          id?: string
          is_active?: boolean | null
          last_payment_date?: string | null
          late_payments?: number | null
          on_time_payments?: number | null
          payment_terms?: string | null
          reports_to_bureaus?: boolean | null
          total_payments?: number | null
          updated_at?: string | null
          user_id: string
          vendor_name: string
          vendor_type: string
        }
        Update: {
          account_number?: string | null
          account_opened_date?: string | null
          business_id?: string | null
          created_at?: string | null
          credit_limit?: number | null
          early_payments?: number | null
          id?: string
          is_active?: boolean | null
          last_payment_date?: string | null
          late_payments?: number | null
          on_time_payments?: number | null
          payment_terms?: string | null
          reports_to_bureaus?: boolean | null
          total_payments?: number | null
          updated_at?: string | null
          user_id?: string
          vendor_name?: string
          vendor_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_vendors_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_verification_runs: {
        Row: {
          business_id: string | null
          completed_at: string | null
          composite_score: number | null
          contact_id: string | null
          created_at: string
          error: string | null
          id: string
          mismatches: Json
          status: string
          summary: Json
          triggered_by: string
          triggered_by_user_id: string | null
        }
        Insert: {
          business_id?: string | null
          completed_at?: string | null
          composite_score?: number | null
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          mismatches?: Json
          status?: string
          summary?: Json
          triggered_by?: string
          triggered_by_user_id?: string | null
        }
        Update: {
          business_id?: string | null
          completed_at?: string | null
          composite_score?: number | null
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          mismatches?: Json
          status?: string
          summary?: Json
          triggered_by?: string
          triggered_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_verification_runs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_verification_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_verification_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "business_verification_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "business_verification_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      business_verifications: {
        Row: {
          business_id: string | null
          confidence: number | null
          created_at: string
          error: string | null
          id: string
          matched_fields: string[]
          mismatched_fields: string[]
          normalized: Json
          raw_payload: Json
          run_id: string
          source: string
          source_kind: string
          source_url: string | null
          status: string
        }
        Insert: {
          business_id?: string | null
          confidence?: number | null
          created_at?: string
          error?: string | null
          id?: string
          matched_fields?: string[]
          mismatched_fields?: string[]
          normalized?: Json
          raw_payload?: Json
          run_id: string
          source: string
          source_kind?: string
          source_url?: string | null
          status?: string
        }
        Update: {
          business_id?: string | null
          confidence?: number | null
          created_at?: string
          error?: string | null
          id?: string
          matched_fields?: string[]
          mismatched_fields?: string[]
          normalized?: Json
          raw_payload?: Json
          run_id?: string
          source?: string
          source_kind?: string
          source_url?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_verifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_verifications_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "business_verification_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          bank_account_opened_date: string | null
          bank_name: string | null
          build_assessed_at: string | null
          build_assessment_answers: Json | null
          build_score: number | null
          business_address_type: string | null
          business_city: string | null
          business_credit_last_updated: string | null
          business_email: string | null
          business_phone: string | null
          business_state: string | null
          business_street_address: string | null
          business_type:
            | Database["public"]["Enums"]["business_hierarchy_type"]
            | null
          business_zip: string | null
          created_at: string | null
          dba: string | null
          display_order: number | null
          dnb_delinquency_predictor: number | null
          dnb_delinquency_score: number | null
          dnb_duns: string | null
          dnb_duns_number: string | null
          dnb_failure_score: number | null
          dnb_financial_stress_score: number | null
          dnb_last_verified: string | null
          dnb_paydex: number | null
          dnb_paydex_score: number | null
          dnb_report_date: string | null
          ein: string | null
          employee_count: number | null
          entity_role: string | null
          entity_type: Database["public"]["Enums"]["entity_type"] | null
          equifax_credit_risk: number | null
          equifax_failure_score: number | null
          equifax_last_verified: string | null
          equifax_payment_index: number | null
          equifax_payment_index_score: number | null
          equifax_report_date: string | null
          equifax_sbfe_score: number | null
          estimated_annual_revenue: number | null
          experian_days_beyond_terms: number | null
          experian_financial_stability_risk: number | null
          experian_intelliscore: number | null
          experian_intelliscore_score: number | null
          experian_last_verified: string | null
          experian_report_date: string | null
          fico_sbss: number | null
          fico_sbss_last_verified: string | null
          formation_date: string | null
          formation_status: string | null
          has_8a_certification: boolean | null
          has_bank_account: boolean | null
          has_vetcert_certification: boolean | null
          has_wosb_certification: boolean | null
          id: string
          is_active: boolean
          is_hubzone_located: boolean | null
          is_minority_owned: boolean | null
          is_primary: boolean
          is_service_disabled_veteran_owned: boolean | null
          is_veteran_owned: boolean | null
          is_women_owned: boolean | null
          legal_name: string
          naics: string | null
          organizational_level: number | null
          owner_user_id: string
          parent_business_id: string | null
          phone_411_listed: boolean | null
          registered_agent_address: string | null
          registered_agent_name: string | null
          registered_agent_renewal_date: string | null
          registered_agent_state: string | null
          revenue_band: string | null
          state_of_formation: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          bank_account_opened_date?: string | null
          bank_name?: string | null
          build_assessed_at?: string | null
          build_assessment_answers?: Json | null
          build_score?: number | null
          business_address_type?: string | null
          business_city?: string | null
          business_credit_last_updated?: string | null
          business_email?: string | null
          business_phone?: string | null
          business_state?: string | null
          business_street_address?: string | null
          business_type?:
            | Database["public"]["Enums"]["business_hierarchy_type"]
            | null
          business_zip?: string | null
          created_at?: string | null
          dba?: string | null
          display_order?: number | null
          dnb_delinquency_predictor?: number | null
          dnb_delinquency_score?: number | null
          dnb_duns?: string | null
          dnb_duns_number?: string | null
          dnb_failure_score?: number | null
          dnb_financial_stress_score?: number | null
          dnb_last_verified?: string | null
          dnb_paydex?: number | null
          dnb_paydex_score?: number | null
          dnb_report_date?: string | null
          ein?: string | null
          employee_count?: number | null
          entity_role?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          equifax_credit_risk?: number | null
          equifax_failure_score?: number | null
          equifax_last_verified?: string | null
          equifax_payment_index?: number | null
          equifax_payment_index_score?: number | null
          equifax_report_date?: string | null
          equifax_sbfe_score?: number | null
          estimated_annual_revenue?: number | null
          experian_days_beyond_terms?: number | null
          experian_financial_stability_risk?: number | null
          experian_intelliscore?: number | null
          experian_intelliscore_score?: number | null
          experian_last_verified?: string | null
          experian_report_date?: string | null
          fico_sbss?: number | null
          fico_sbss_last_verified?: string | null
          formation_date?: string | null
          formation_status?: string | null
          has_8a_certification?: boolean | null
          has_bank_account?: boolean | null
          has_vetcert_certification?: boolean | null
          has_wosb_certification?: boolean | null
          id?: string
          is_active?: boolean
          is_hubzone_located?: boolean | null
          is_minority_owned?: boolean | null
          is_primary?: boolean
          is_service_disabled_veteran_owned?: boolean | null
          is_veteran_owned?: boolean | null
          is_women_owned?: boolean | null
          legal_name: string
          naics?: string | null
          organizational_level?: number | null
          owner_user_id: string
          parent_business_id?: string | null
          phone_411_listed?: boolean | null
          registered_agent_address?: string | null
          registered_agent_name?: string | null
          registered_agent_renewal_date?: string | null
          registered_agent_state?: string | null
          revenue_band?: string | null
          state_of_formation?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          bank_account_opened_date?: string | null
          bank_name?: string | null
          build_assessed_at?: string | null
          build_assessment_answers?: Json | null
          build_score?: number | null
          business_address_type?: string | null
          business_city?: string | null
          business_credit_last_updated?: string | null
          business_email?: string | null
          business_phone?: string | null
          business_state?: string | null
          business_street_address?: string | null
          business_type?:
            | Database["public"]["Enums"]["business_hierarchy_type"]
            | null
          business_zip?: string | null
          created_at?: string | null
          dba?: string | null
          display_order?: number | null
          dnb_delinquency_predictor?: number | null
          dnb_delinquency_score?: number | null
          dnb_duns?: string | null
          dnb_duns_number?: string | null
          dnb_failure_score?: number | null
          dnb_financial_stress_score?: number | null
          dnb_last_verified?: string | null
          dnb_paydex?: number | null
          dnb_paydex_score?: number | null
          dnb_report_date?: string | null
          ein?: string | null
          employee_count?: number | null
          entity_role?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          equifax_credit_risk?: number | null
          equifax_failure_score?: number | null
          equifax_last_verified?: string | null
          equifax_payment_index?: number | null
          equifax_payment_index_score?: number | null
          equifax_report_date?: string | null
          equifax_sbfe_score?: number | null
          estimated_annual_revenue?: number | null
          experian_days_beyond_terms?: number | null
          experian_financial_stability_risk?: number | null
          experian_intelliscore?: number | null
          experian_intelliscore_score?: number | null
          experian_last_verified?: string | null
          experian_report_date?: string | null
          fico_sbss?: number | null
          fico_sbss_last_verified?: string | null
          formation_date?: string | null
          formation_status?: string | null
          has_8a_certification?: boolean | null
          has_bank_account?: boolean | null
          has_vetcert_certification?: boolean | null
          has_wosb_certification?: boolean | null
          id?: string
          is_active?: boolean
          is_hubzone_located?: boolean | null
          is_minority_owned?: boolean | null
          is_primary?: boolean
          is_service_disabled_veteran_owned?: boolean | null
          is_veteran_owned?: boolean | null
          is_women_owned?: boolean | null
          legal_name?: string
          naics?: string | null
          organizational_level?: number | null
          owner_user_id?: string
          parent_business_id?: string | null
          phone_411_listed?: boolean | null
          registered_agent_address?: string | null
          registered_agent_name?: string | null
          registered_agent_renewal_date?: string | null
          registered_agent_state?: string | null
          revenue_band?: string | null
          state_of_formation?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_parent_business_id_fkey"
            columns: ["parent_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_embeddings: {
        Row: {
          client_user_id: string | null
          content_excerpt: string
          created_at: string
          embedding: string | null
          id: string
          message_id: string
          role: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          client_user_id?: string | null
          content_excerpt: string
          created_at?: string
          embedding?: string | null
          id?: string
          message_id: string
          role: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          client_user_id?: string | null
          content_excerpt?: string
          created_at?: string
          embedding?: string | null
          id?: string
          message_id?: string
          role?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_embeddings_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          audio_transcript: string | null
          content: string
          created_at: string
          function_call: Json | null
          id: string
          metadata: Json | null
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          audio_transcript?: string | null
          content: string
          created_at?: string
          function_call?: Json | null
          id?: string
          metadata?: Json | null
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          audio_transcript?: string | null
          content?: string
          created_at?: string
          function_call?: Json | null
          id?: string
          metadata?: Json | null
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      client_files: {
        Row: {
          contact_id: string
          created_at: string
          description: string | null
          id: string
          mime_type: string | null
          original_filename: string
          size_bytes: number | null
          storage_path: string
          tenant_id: string | null
          updated_at: string
          uploaded_by_user_id: string
          visibility: Database["public"]["Enums"]["client_file_visibility"]
        }
        Insert: {
          contact_id: string
          created_at?: string
          description?: string | null
          id?: string
          mime_type?: string | null
          original_filename: string
          size_bytes?: number | null
          storage_path: string
          tenant_id?: string | null
          updated_at?: string
          uploaded_by_user_id: string
          visibility?: Database["public"]["Enums"]["client_file_visibility"]
        }
        Update: {
          contact_id?: string
          created_at?: string
          description?: string | null
          id?: string
          mime_type?: string | null
          original_filename?: string
          size_bytes?: number | null
          storage_path?: string
          tenant_id?: string | null
          updated_at?: string
          uploaded_by_user_id?: string
          visibility?: Database["public"]["Enums"]["client_file_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "client_files_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "client_files_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "client_files_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_goals: {
        Row: {
          created_at: string
          goal_category: string
          goal_description: string | null
          id: string
          progress_notes: string | null
          status: string
          target_amount: number | null
          target_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_category: string
          goal_description?: string | null
          id?: string
          progress_notes?: string | null
          status?: string
          target_amount?: number | null
          target_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal_category?: string
          goal_description?: string | null
          id?: string
          progress_notes?: string | null
          status?: string
          target_amount?: number | null
          target_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_memory: {
        Row: {
          client_id: string | null
          client_user_id: string
          content: string
          created_at: string
          embedding: string | null
          id: string
          is_active: boolean
          memory_type: string
          metadata: Json | null
          source_session_id: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          client_user_id: string
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          is_active?: boolean
          memory_type: string
          metadata?: Json | null
          source_session_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          client_user_id?: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          is_active?: boolean
          memory_type?: string
          metadata?: Json | null
          source_session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "client_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "client_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          author_user_id: string
          body: string
          contact_id: string
          created_at: string
          id: string
          pinned: boolean
          tags: string[]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body: string
          contact_id: string
          created_at?: string
          id?: string
          pinned?: boolean
          tags?: string[]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          contact_id?: string
          created_at?: string
          id?: string
          pinned?: boolean
          tags?: string[]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "client_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "client_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          agreement_signed_at: string | null
          assigned_coach_user_id: string | null
          city: string | null
          created_at: string
          created_by: string
          cs_primary_user_id: string | null
          current_notes: string | null
          do_not_contact: boolean
          email: string | null
          entity_name: string | null
          entity_type: string | null
          first_name: string
          funding_goal: number | null
          ghl_contact_id: string | null
          id: string
          journey_stage_entered_at: string | null
          journey_stage_id: number | null
          last_contacted_at: string | null
          last_mirrored_at: string | null
          last_name: string
          lead_owner_user_id: string | null
          lead_score: number
          lifecycle_stage: string
          linked_user_id: string | null
          linkedin_url: string | null
          mirror_source: string | null
          monthly_revenue: number | null
          onboarding_completed_at: string | null
          onboarding_stage: string | null
          onboarding_started_at: string | null
          phone: string | null
          primary_business_id: string | null
          primary_offer: string | null
          source: string | null
          state: string | null
          status: string
          street_address: string | null
          tags: string[]
          tenant_id: string | null
          tier: string | null
          title: string | null
          updated_at: string
          website: string | null
          zip_code: string | null
        }
        Insert: {
          agreement_signed_at?: string | null
          assigned_coach_user_id?: string | null
          city?: string | null
          created_at?: string
          created_by: string
          cs_primary_user_id?: string | null
          current_notes?: string | null
          do_not_contact?: boolean
          email?: string | null
          entity_name?: string | null
          entity_type?: string | null
          first_name: string
          funding_goal?: number | null
          ghl_contact_id?: string | null
          id?: string
          journey_stage_entered_at?: string | null
          journey_stage_id?: number | null
          last_contacted_at?: string | null
          last_mirrored_at?: string | null
          last_name: string
          lead_owner_user_id?: string | null
          lead_score?: number
          lifecycle_stage?: string
          linked_user_id?: string | null
          linkedin_url?: string | null
          mirror_source?: string | null
          monthly_revenue?: number | null
          onboarding_completed_at?: string | null
          onboarding_stage?: string | null
          onboarding_started_at?: string | null
          phone?: string | null
          primary_business_id?: string | null
          primary_offer?: string | null
          source?: string | null
          state?: string | null
          status?: string
          street_address?: string | null
          tags?: string[]
          tenant_id?: string | null
          tier?: string | null
          title?: string | null
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          agreement_signed_at?: string | null
          assigned_coach_user_id?: string | null
          city?: string | null
          created_at?: string
          created_by?: string
          cs_primary_user_id?: string | null
          current_notes?: string | null
          do_not_contact?: boolean
          email?: string | null
          entity_name?: string | null
          entity_type?: string | null
          first_name?: string
          funding_goal?: number | null
          ghl_contact_id?: string | null
          id?: string
          journey_stage_entered_at?: string | null
          journey_stage_id?: number | null
          last_contacted_at?: string | null
          last_mirrored_at?: string | null
          last_name?: string
          lead_owner_user_id?: string | null
          lead_score?: number
          lifecycle_stage?: string
          linked_user_id?: string | null
          linkedin_url?: string | null
          mirror_source?: string | null
          monthly_revenue?: number | null
          onboarding_completed_at?: string | null
          onboarding_stage?: string | null
          onboarding_started_at?: string | null
          phone?: string | null
          primary_business_id?: string | null
          primary_offer?: string | null
          source?: string | null
          state?: string | null
          status?: string
          street_address?: string | null
          tags?: string[]
          tenant_id?: string | null
          tier?: string | null
          title?: string | null
          updated_at?: string
          website?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_journey_stage_id_fkey"
            columns: ["journey_stage_id"]
            isOneToOne: false
            referencedRelation: "paige_journey_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_primary_business_id_fkey"
            columns: ["primary_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_clients: {
        Row: {
          client_user_id: string
          coach_user_id: string
          created_at: string
          id: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_user_id: string
          coach_user_id: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_user_id?: string
          coach_user_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      commission_payments: {
        Row: {
          affiliate_id: string
          amount_cents: number
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          status: string
        }
        Insert: {
          affiliate_id: string
          amount_cents: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
        }
        Update: {
          affiliate_id?: string
          amount_cents?: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_payments_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_payments_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "v_affiliate_stats"
            referencedColumns: ["affiliate_id"]
          },
        ]
      }
      communication_log: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          message_type: string
          preview: string | null
          provider_message_id: string | null
          status: string
          subject: string | null
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_type: string
          preview?: string | null
          provider_message_id?: string | null
          status: string
          subject?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_type?: string
          preview?: string | null
          provider_message_id?: string | null
          status?: string
          subject?: string | null
          user_id?: string
        }
        Relationships: []
      }
      communication_preferences: {
        Row: {
          created_at: string
          email_affiliate_program: boolean
          email_coaching_reminders: boolean
          email_credit_alerts: boolean
          email_enabled: boolean
          email_funding_alerts: boolean
          email_onboarding: boolean
          email_score_milestones: boolean
          email_weekly_summary: boolean
          id: string
          sms_coaching_reminders: boolean
          sms_credit_alerts: boolean
          sms_enabled: boolean
          sms_funding_alerts: boolean
          sms_phone_number: string | null
          sms_phone_verified: boolean
          sms_score_milestones: boolean
          unsubscribed_all: boolean
          unsubscribed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_affiliate_program?: boolean
          email_coaching_reminders?: boolean
          email_credit_alerts?: boolean
          email_enabled?: boolean
          email_funding_alerts?: boolean
          email_onboarding?: boolean
          email_score_milestones?: boolean
          email_weekly_summary?: boolean
          id?: string
          sms_coaching_reminders?: boolean
          sms_credit_alerts?: boolean
          sms_enabled?: boolean
          sms_funding_alerts?: boolean
          sms_phone_number?: string | null
          sms_phone_verified?: boolean
          sms_score_milestones?: boolean
          unsubscribed_all?: boolean
          unsubscribed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_affiliate_program?: boolean
          email_coaching_reminders?: boolean
          email_credit_alerts?: boolean
          email_enabled?: boolean
          email_funding_alerts?: boolean
          email_onboarding?: boolean
          email_score_milestones?: boolean
          email_weekly_summary?: boolean
          id?: string
          sms_coaching_reminders?: boolean
          sms_credit_alerts?: boolean
          sms_enabled?: boolean
          sms_funding_alerts?: boolean
          sms_phone_number?: string | null
          sms_phone_verified?: boolean
          sms_score_milestones?: boolean
          unsubscribed_all?: boolean
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      compliance_checkpoints: {
        Row: {
          api_endpoint: string | null
          checkpoint_type: string
          consent_event_id: string | null
          created_at: string
          error_message: string | null
          id: string
          status: string
          user_id: string
          validation_result: Json | null
        }
        Insert: {
          api_endpoint?: string | null
          checkpoint_type: string
          consent_event_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string
          user_id: string
          validation_result?: Json | null
        }
        Update: {
          api_endpoint?: string | null
          checkpoint_type?: string
          consent_event_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string
          user_id?: string
          validation_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_checkpoints_consent_event_id_fkey"
            columns: ["consent_event_id"]
            isOneToOne: false
            referencedRelation: "consent_events"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_bank_account_secrets: {
        Row: {
          account_row_id: string
          created_at: string
          plaid_access_token: string
          updated_at: string
        }
        Insert: {
          account_row_id: string
          created_at?: string
          plaid_access_token: string
          updated_at?: string
        }
        Update: {
          account_row_id?: string
          created_at?: string
          plaid_access_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_bank_account_secrets_account_row_id_fkey"
            columns: ["account_row_id"]
            isOneToOne: true
            referencedRelation: "connected_bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_bank_accounts: {
        Row: {
          account_id: string
          account_mask: string | null
          account_name: string | null
          account_subtype: string | null
          account_type: string | null
          business_id: string | null
          created_at: string | null
          id: string
          institution_id: string
          institution_name: string
          is_active: boolean | null
          last_sync_at: string | null
          plaid_item_id: string
          transactions_cursor: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          account_mask?: string | null
          account_name?: string | null
          account_subtype?: string | null
          account_type?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          institution_id: string
          institution_name: string
          is_active?: boolean | null
          last_sync_at?: string | null
          plaid_item_id: string
          transactions_cursor?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          account_mask?: string | null
          account_name?: string | null
          account_subtype?: string | null
          account_type?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string
          institution_id?: string
          institution_name?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          plaid_item_id?: string
          transactions_cursor?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_bank_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_events: {
        Row: {
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at: string
          disclosure_version: string
          granted: boolean
          id: string
          ip_address: string | null
          metadata: Json | null
          session_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          consent_type: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          disclosure_version: string
          granted?: boolean
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          session_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          consent_type?: Database["public"]["Enums"]["consent_type"]
          created_at?: string
          disclosure_version?: string
          granted?: boolean
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      conversation_context: {
        Row: {
          active_scope: string | null
          context_stack: Json | null
          created_at: string | null
          entities: Json | null
          expires_at: string | null
          id: string
          intent: string | null
          session_id: string
          turn_number: number
          user_id: string
          utterance: string
        }
        Insert: {
          active_scope?: string | null
          context_stack?: Json | null
          created_at?: string | null
          entities?: Json | null
          expires_at?: string | null
          id?: string
          intent?: string | null
          session_id: string
          turn_number?: number
          user_id: string
          utterance: string
        }
        Update: {
          active_scope?: string | null
          context_stack?: Json | null
          created_at?: string | null
          entities?: Json | null
          expires_at?: string | null
          id?: string
          intent?: string | null
          session_id?: string
          turn_number?: number
          user_id?: string
          utterance?: string
        }
        Relationships: []
      }
      course_certificates: {
        Row: {
          certificate_url: string | null
          course_id: string
          created_at: string
          id: string
          issued_at: string
          user_id: string
          verification_code: string
        }
        Insert: {
          certificate_url?: string | null
          course_id: string
          created_at?: string
          id?: string
          issued_at?: string
          user_id: string
          verification_code?: string
        }
        Update: {
          certificate_url?: string | null
          course_id?: string
          created_at?: string
          id?: string
          issued_at?: string
          user_id?: string
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string | null
          description: string | null
          difficulty_level: string | null
          duration_minutes: number | null
          framework: string
          id: string
          is_active: boolean | null
          module_count: number | null
          sort_order: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          difficulty_level?: string | null
          duration_minutes?: number | null
          framework: string
          id?: string
          is_active?: boolean | null
          module_count?: number | null
          sort_order?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          difficulty_level?: string | null
          duration_minutes?: number | null
          framework?: string
          id?: string
          is_active?: boolean | null
          module_count?: number | null
          sort_order?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      credit_accounts: {
        Row: {
          account_close_date: string | null
          account_number: string | null
          account_open_date: string | null
          balance: number | null
          bureau_source: string | null
          client_id: string | null
          created_at: string | null
          credit_limit: number | null
          creditor: string
          current_balance: number | null
          duplicate_of_id: string | null
          id: string
          is_authorized_user: boolean | null
          is_disputed_ownership: boolean | null
          is_open: boolean | null
          last_reported_date: string | null
          limit_amount: number | null
          needs_review: boolean
          opened_on: string | null
          original_amount: number | null
          payment_history_json: Json | null
          status: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string | null
          user_id: string
          utilization: number | null
          validation_flags: Json | null
        }
        Insert: {
          account_close_date?: string | null
          account_number?: string | null
          account_open_date?: string | null
          balance?: number | null
          bureau_source?: string | null
          client_id?: string | null
          created_at?: string | null
          credit_limit?: number | null
          creditor: string
          current_balance?: number | null
          duplicate_of_id?: string | null
          id?: string
          is_authorized_user?: boolean | null
          is_disputed_ownership?: boolean | null
          is_open?: boolean | null
          last_reported_date?: string | null
          limit_amount?: number | null
          needs_review?: boolean
          opened_on?: string | null
          original_amount?: number | null
          payment_history_json?: Json | null
          status?: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string | null
          user_id: string
          utilization?: number | null
          validation_flags?: Json | null
        }
        Update: {
          account_close_date?: string | null
          account_number?: string | null
          account_open_date?: string | null
          balance?: number | null
          bureau_source?: string | null
          client_id?: string | null
          created_at?: string | null
          credit_limit?: number | null
          creditor?: string
          current_balance?: number | null
          duplicate_of_id?: string | null
          id?: string
          is_authorized_user?: boolean | null
          is_disputed_ownership?: boolean | null
          is_open?: boolean | null
          last_reported_date?: string | null
          limit_amount?: number | null
          needs_review?: boolean
          opened_on?: string | null
          original_amount?: number | null
          payment_history_json?: Json | null
          status?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string | null
          user_id?: string
          utilization?: number | null
          validation_flags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "credit_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "credit_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_accounts_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_alerts: {
        Row: {
          alert_description: string
          alert_severity: string
          alert_title: string
          alert_type: string
          bureau: string | null
          client_id: string
          created_at: string
          dismissed_at: string | null
          dismissed_by: string | null
          id: string
          is_dismissed: boolean
          is_read: boolean
          new_value: string | null
          previous_value: string | null
          read_at: string | null
          related_account_id: string | null
        }
        Insert: {
          alert_description: string
          alert_severity: string
          alert_title: string
          alert_type: string
          bureau?: string | null
          client_id: string
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          new_value?: string | null
          previous_value?: string | null
          read_at?: string | null
          related_account_id?: string | null
        }
        Update: {
          alert_description?: string
          alert_severity?: string
          alert_title?: string
          alert_type?: string
          bureau?: string | null
          client_id?: string
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          new_value?: string | null
          previous_value?: string | null
          read_at?: string | null
          related_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "credit_alerts_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      credit_factor_scores: {
        Row: {
          active_negatives: number | null
          aggregate_utilization: number | null
          average_account_age_months: number | null
          calculated_at: string | null
          cards_over_30_pct: number | null
          cards_over_50_pct: number | null
          cards_over_70_pct: number | null
          client_id: string | null
          credit_age_score: number | null
          credit_mix_score: number | null
          data_sources: Json | null
          id: string
          inquiry_budget_remaining: number | null
          inquiry_score: number | null
          installment_count: number | null
          mortgage_count: number | null
          newest_account_age_months: number | null
          oldest_account_age_months: number | null
          oldest_negative_date: string | null
          overall_fundability_score: number | null
          payment_history_score: number | null
          removed_negatives: number | null
          revolving_count: number | null
          total_balance: number | null
          total_credit_limit: number | null
          total_inquiries_eq: number | null
          total_inquiries_ex: number | null
          total_inquiries_tu: number | null
          total_negatives: number | null
          user_id: string
          utilization_score: number | null
        }
        Insert: {
          active_negatives?: number | null
          aggregate_utilization?: number | null
          average_account_age_months?: number | null
          calculated_at?: string | null
          cards_over_30_pct?: number | null
          cards_over_50_pct?: number | null
          cards_over_70_pct?: number | null
          client_id?: string | null
          credit_age_score?: number | null
          credit_mix_score?: number | null
          data_sources?: Json | null
          id?: string
          inquiry_budget_remaining?: number | null
          inquiry_score?: number | null
          installment_count?: number | null
          mortgage_count?: number | null
          newest_account_age_months?: number | null
          oldest_account_age_months?: number | null
          oldest_negative_date?: string | null
          overall_fundability_score?: number | null
          payment_history_score?: number | null
          removed_negatives?: number | null
          revolving_count?: number | null
          total_balance?: number | null
          total_credit_limit?: number | null
          total_inquiries_eq?: number | null
          total_inquiries_ex?: number | null
          total_inquiries_tu?: number | null
          total_negatives?: number | null
          user_id: string
          utilization_score?: number | null
        }
        Update: {
          active_negatives?: number | null
          aggregate_utilization?: number | null
          average_account_age_months?: number | null
          calculated_at?: string | null
          cards_over_30_pct?: number | null
          cards_over_50_pct?: number | null
          cards_over_70_pct?: number | null
          client_id?: string | null
          credit_age_score?: number | null
          credit_mix_score?: number | null
          data_sources?: Json | null
          id?: string
          inquiry_budget_remaining?: number | null
          inquiry_score?: number | null
          installment_count?: number | null
          mortgage_count?: number | null
          newest_account_age_months?: number | null
          oldest_account_age_months?: number | null
          oldest_negative_date?: string | null
          overall_fundability_score?: number | null
          payment_history_score?: number | null
          removed_negatives?: number | null
          revolving_count?: number | null
          total_balance?: number | null
          total_credit_limit?: number | null
          total_inquiries_eq?: number | null
          total_inquiries_ex?: number | null
          total_inquiries_tu?: number | null
          total_negatives?: number | null
          user_id?: string
          utilization_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_factor_scores_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_factor_scores_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "credit_factor_scores_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "credit_factor_scores_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_inquiries: {
        Row: {
          bureau: string
          created_at: string | null
          creditor_name: string
          dispute_id: string | null
          fall_off_date: string | null
          id: string
          inquiry_date: string
          is_authorized: boolean | null
          is_rate_shopping: boolean | null
          rate_shopping_group_id: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          bureau: string
          created_at?: string | null
          creditor_name: string
          dispute_id?: string | null
          fall_off_date?: string | null
          id?: string
          inquiry_date: string
          is_authorized?: boolean | null
          is_rate_shopping?: boolean | null
          rate_shopping_group_id?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          bureau?: string
          created_at?: string | null
          creditor_name?: string
          dispute_id?: string | null
          fall_off_date?: string | null
          id?: string
          inquiry_date?: string
          is_authorized?: boolean | null
          is_rate_shopping?: boolean | null
          rate_shopping_group_id?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_inquiries_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_negative_items: {
        Row: {
          account_number: string | null
          account_number_masked: string | null
          amount: number | null
          bureau: string
          client_id: string | null
          created_at: string | null
          creditor_name: string | null
          date_of_occurrence: string | null
          date_reported: string | null
          dispute_id: string | null
          duplicate_of_id: string | null
          id: string
          is_disputed_ownership: boolean | null
          is_removable: boolean | null
          item_type: string
          needs_review: boolean
          notes: string | null
          original_amount: number | null
          removal_probability: number | null
          removal_reason: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          validation_flags: Json | null
        }
        Insert: {
          account_number?: string | null
          account_number_masked?: string | null
          amount?: number | null
          bureau: string
          client_id?: string | null
          created_at?: string | null
          creditor_name?: string | null
          date_of_occurrence?: string | null
          date_reported?: string | null
          dispute_id?: string | null
          duplicate_of_id?: string | null
          id?: string
          is_disputed_ownership?: boolean | null
          is_removable?: boolean | null
          item_type: string
          needs_review?: boolean
          notes?: string | null
          original_amount?: number | null
          removal_probability?: number | null
          removal_reason?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          validation_flags?: Json | null
        }
        Update: {
          account_number?: string | null
          account_number_masked?: string | null
          amount?: number | null
          bureau?: string
          client_id?: string | null
          created_at?: string | null
          creditor_name?: string | null
          date_of_occurrence?: string | null
          date_reported?: string | null
          dispute_id?: string | null
          duplicate_of_id?: string | null
          id?: string
          is_disputed_ownership?: boolean | null
          is_removable?: boolean | null
          item_type?: string
          needs_review?: boolean
          notes?: string | null
          original_amount?: number | null
          removal_probability?: number | null
          removal_reason?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          validation_flags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_negative_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_negative_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "credit_negative_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "credit_negative_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_negative_items_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_negative_items_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "credit_negative_items"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_predictions: {
        Row: {
          account_id: string | null
          action_required: string | null
          action_url: string | null
          bureau: string | null
          confidence: Database["public"]["Enums"]["credit_prediction_confidence"]
          created_at: string
          deadline_date: string | null
          description: string
          expires_at: string | null
          id: string
          impact_score: number | null
          is_acted_on: boolean
          is_dismissed: boolean
          metadata: Json | null
          prediction_type: Database["public"]["Enums"]["credit_prediction_type"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          action_required?: string | null
          action_url?: string | null
          bureau?: string | null
          confidence?: Database["public"]["Enums"]["credit_prediction_confidence"]
          created_at?: string
          deadline_date?: string | null
          description: string
          expires_at?: string | null
          id?: string
          impact_score?: number | null
          is_acted_on?: boolean
          is_dismissed?: boolean
          metadata?: Json | null
          prediction_type: Database["public"]["Enums"]["credit_prediction_type"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          action_required?: string | null
          action_url?: string | null
          bureau?: string | null
          confidence?: Database["public"]["Enums"]["credit_prediction_confidence"]
          created_at?: string
          deadline_date?: string | null
          description?: string
          expires_at?: string | null
          id?: string
          impact_score?: number | null
          is_acted_on?: boolean
          is_dismissed?: boolean
          metadata?: Json | null
          prediction_type?: Database["public"]["Enums"]["credit_prediction_type"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_predictions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_report_personal_info: {
        Row: {
          bureau_source: string
          client_id: string | null
          created_at: string
          credit_report_upload_id: string
          date_range: string | null
          extracted_at: string
          field_type: string
          field_value: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bureau_source: string
          client_id?: string | null
          created_at?: string
          credit_report_upload_id: string
          date_range?: string | null
          extracted_at?: string
          field_type: string
          field_value: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bureau_source?: string
          client_id?: string | null
          created_at?: string
          credit_report_upload_id?: string
          date_range?: string | null
          extracted_at?: string
          field_type?: string
          field_value?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_report_personal_info_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_report_personal_info_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "credit_report_personal_info_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "credit_report_personal_info_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_report_personal_info_credit_report_upload_id_fkey"
            columns: ["credit_report_upload_id"]
            isOneToOne: false
            referencedRelation: "credit_report_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_report_uploads: {
        Row: {
          analysis_result: Json | null
          analysis_status: string
          backfill_completed_at: string | null
          backfill_fields_updated: Json | null
          backfill_status: string | null
          bureau_detected: string | null
          client_id: string | null
          created_at: string
          error_message: string | null
          estimated_score_impact: number | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          last_analyzed_at: string | null
          negative_items_extracted: Json | null
          positive_accounts_extracted: Json | null
          profile_summary: string | null
          report_type: string
          updated_at: string
          uploaded_by: string
          user_id: string
        }
        Insert: {
          analysis_result?: Json | null
          analysis_status?: string
          backfill_completed_at?: string | null
          backfill_fields_updated?: Json | null
          backfill_status?: string | null
          bureau_detected?: string | null
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          estimated_score_impact?: number | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          last_analyzed_at?: string | null
          negative_items_extracted?: Json | null
          positive_accounts_extracted?: Json | null
          profile_summary?: string | null
          report_type?: string
          updated_at?: string
          uploaded_by: string
          user_id: string
        }
        Update: {
          analysis_result?: Json | null
          analysis_status?: string
          backfill_completed_at?: string | null
          backfill_fields_updated?: Json | null
          backfill_status?: string | null
          bureau_detected?: string | null
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          estimated_score_impact?: number | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          last_analyzed_at?: string | null
          negative_items_extracted?: Json | null
          positive_accounts_extracted?: Json | null
          profile_summary?: string | null
          report_type?: string
          updated_at?: string
          uploaded_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_report_uploads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_report_uploads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "credit_report_uploads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "credit_report_uploads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_report_verifications: {
        Row: {
          created_at: string | null
          date_of_birth: string | null
          equifax_api_user_id: string | null
          equifax_expires_at: string | null
          equifax_verified: boolean | null
          equifax_verified_at: string | null
          experian_api_user_id: string | null
          experian_expires_at: string | null
          experian_verified: boolean | null
          experian_verified_at: string | null
          id: string
          kba_attempts: number | null
          kba_completed: boolean | null
          kba_last_attempt_at: string | null
          ssn_last_4: string | null
          transunion_api_user_id: string | null
          transunion_expires_at: string | null
          transunion_verified: boolean | null
          transunion_verified_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date_of_birth?: string | null
          equifax_api_user_id?: string | null
          equifax_expires_at?: string | null
          equifax_verified?: boolean | null
          equifax_verified_at?: string | null
          experian_api_user_id?: string | null
          experian_expires_at?: string | null
          experian_verified?: boolean | null
          experian_verified_at?: string | null
          id?: string
          kba_attempts?: number | null
          kba_completed?: boolean | null
          kba_last_attempt_at?: string | null
          ssn_last_4?: string | null
          transunion_api_user_id?: string | null
          transunion_expires_at?: string | null
          transunion_verified?: boolean | null
          transunion_verified_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date_of_birth?: string | null
          equifax_api_user_id?: string | null
          equifax_expires_at?: string | null
          equifax_verified?: boolean | null
          equifax_verified_at?: string | null
          experian_api_user_id?: string | null
          experian_expires_at?: string | null
          experian_verified?: boolean | null
          experian_verified_at?: string | null
          id?: string
          kba_attempts?: number | null
          kba_completed?: boolean | null
          kba_last_attempt_at?: string | null
          ssn_last_4?: string | null
          transunion_api_user_id?: string | null
          transunion_expires_at?: string | null
          transunion_verified?: boolean | null
          transunion_verified_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_utilization_snapshots: {
        Row: {
          balance: number | null
          created_at: string | null
          credit_account_id: string | null
          credit_limit: number | null
          id: string
          snapshot_date: string | null
          source: string | null
          user_id: string
          utilization_pct: number | null
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          credit_account_id?: string | null
          credit_limit?: number | null
          id?: string
          snapshot_date?: string | null
          source?: string | null
          user_id: string
          utilization_pct?: number | null
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          credit_account_id?: string | null
          credit_limit?: number | null
          id?: string
          snapshot_date?: string | null
          source?: string | null
          user_id?: string
          utilization_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_utilization_snapshots_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      data_deletion_requests: {
        Row: {
          completed_at: string | null
          id: string
          metadata: Json | null
          requested_at: string
          status: string
          user_id: string
          verification_code: string | null
        }
        Insert: {
          completed_at?: string | null
          id?: string
          metadata?: Json | null
          requested_at?: string
          status?: string
          user_id: string
          verification_code?: string | null
        }
        Update: {
          completed_at?: string | null
          id?: string
          metadata?: Json | null
          requested_at?: string
          status?: string
          user_id?: string
          verification_code?: string | null
        }
        Relationships: []
      }
      deal_activities: {
        Row: {
          actor_user_id: string | null
          created_at: string
          deal_id: string
          id: string
          payload: Json
          summary: string | null
          type: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          deal_id: string
          id?: string
          payload?: Json
          summary?: string | null
          type: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          payload?: Json
          summary?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          actual_close_date: string | null
          contact_client_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          expected_close_date: string | null
          id: string
          lost_reason: string | null
          notes: string | null
          offer_type: string | null
          owner_user_id: string | null
          pipeline_id: string
          source: string | null
          stage_id: string
          status: string
          tags: string[]
          tenant_id: string | null
          title: string
          updated_at: string
          value_cents: number
        }
        Insert: {
          actual_close_date?: string | null
          contact_client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          offer_type?: string | null
          owner_user_id?: string | null
          pipeline_id: string
          source?: string | null
          stage_id: string
          status?: string
          tags?: string[]
          tenant_id?: string | null
          title: string
          updated_at?: string
          value_cents?: number
        }
        Update: {
          actual_close_date?: string | null
          contact_client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          offer_type?: string | null
          owner_user_id?: string | null
          pipeline_id?: string
          source?: string | null
          stage_id?: string
          status?: string
          tags?: string[]
          tenant_id?: string | null
          title?: string
          updated_at?: string
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "deals_contact_client_id_fkey"
            columns: ["contact_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_client_id_fkey"
            columns: ["contact_client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "deals_contact_client_id_fkey"
            columns: ["contact_client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "deals_contact_client_id_fkey"
            columns: ["contact_client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      disclosure_templates: {
        Row: {
          content: string
          created_at: string | null
          disclosure_type: Database["public"]["Enums"]["disclosure_type"]
          effective_date: string
          id: string
          is_active: boolean | null
          metadata: Json | null
          title: string
          updated_at: string | null
          version: string
        }
        Insert: {
          content: string
          created_at?: string | null
          disclosure_type: Database["public"]["Enums"]["disclosure_type"]
          effective_date?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          title: string
          updated_at?: string | null
          version: string
        }
        Update: {
          content?: string
          created_at?: string | null
          disclosure_type?: Database["public"]["Enums"]["disclosure_type"]
          effective_date?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          title?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: []
      }
      dispute_letters: {
        Row: {
          account_number: string | null
          bureau: string | null
          business_name: string | null
          created_at: string | null
          dispute_ids: string[] | null
          dispute_round: number | null
          dispute_type: string
          id: string
          letter_content: string | null
          status: Database["public"]["Enums"]["letter_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_number?: string | null
          bureau?: string | null
          business_name?: string | null
          created_at?: string | null
          dispute_ids?: string[] | null
          dispute_round?: number | null
          dispute_type: string
          id?: string
          letter_content?: string | null
          status?: Database["public"]["Enums"]["letter_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_number?: string | null
          bureau?: string | null
          business_name?: string | null
          created_at?: string | null
          dispute_ids?: string[] | null
          dispute_round?: number | null
          dispute_type?: string
          id?: string
          letter_content?: string | null
          status?: Database["public"]["Enums"]["letter_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      dispute_outcomes: {
        Row: {
          admin_notes: string | null
          bureau: string
          client_id: string | null
          created_at: string
          creditor_name: string
          dispute_id: string
          dispute_round: number | null
          id: string
          outcome_type: string
          recorded_by: string
          response_date: string | null
          response_time_days: number | null
          score_impact: number | null
          submission_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          bureau: string
          client_id?: string | null
          created_at?: string
          creditor_name: string
          dispute_id: string
          dispute_round?: number | null
          id?: string
          outcome_type: string
          recorded_by: string
          response_date?: string | null
          response_time_days?: number | null
          score_impact?: number | null
          submission_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          bureau?: string
          client_id?: string | null
          created_at?: string
          creditor_name?: string
          dispute_id?: string
          dispute_round?: number | null
          id?: string
          outcome_type?: string
          recorded_by?: string
          response_date?: string | null
          response_time_days?: number | null
          score_impact?: number | null
          submission_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_outcomes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_outcomes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "dispute_outcomes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "dispute_outcomes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_outcomes_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          account_number_masked: string | null
          bureau: string
          client_id: string | null
          created_at: string | null
          creditor_name: string
          dispute_round: number | null
          due_date: string | null
          id: string
          is_auto_staged: boolean | null
          item_type: string | null
          narrative: string | null
          open_date: string | null
          reason_code: string
          resolution_note: string | null
          round_submitted_at: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_number_masked?: string | null
          bureau: string
          client_id?: string | null
          created_at?: string | null
          creditor_name: string
          dispute_round?: number | null
          due_date?: string | null
          id?: string
          is_auto_staged?: boolean | null
          item_type?: string | null
          narrative?: string | null
          open_date?: string | null
          reason_code: string
          resolution_note?: string | null
          round_submitted_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_number_masked?: string | null
          bureau?: string
          client_id?: string | null
          created_at?: string | null
          creditor_name?: string
          dispute_round?: number | null
          due_date?: string | null
          id?: string
          is_auto_staged?: boolean | null
          item_type?: string | null
          narrative?: string | null
          open_date?: string | null
          reason_code?: string
          resolution_note?: string | null
          round_submitted_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "disputes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "disputes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          bucket_name: string
          business_id: string | null
          client_id: string | null
          document_type: string
          file_name: string
          file_path: string
          file_size: number
          folder_path: string | null
          id: string
          metadata: Json | null
          mime_type: string
          tags: string[] | null
          updated_at: string | null
          uploaded_at: string | null
          user_id: string
        }
        Insert: {
          bucket_name: string
          business_id?: string | null
          client_id?: string | null
          document_type: string
          file_name: string
          file_path: string
          file_size: number
          folder_path?: string | null
          id?: string
          metadata?: Json | null
          mime_type: string
          tags?: string[] | null
          updated_at?: string | null
          uploaded_at?: string | null
          user_id: string
        }
        Update: {
          bucket_name?: string
          business_id?: string | null
          client_id?: string | null
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number
          folder_path?: string | null
          id?: string
          metadata?: Json | null
          mime_type?: string
          tags?: string[] | null
          updated_at?: string | null
          uploaded_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      economic_rates_cache: {
        Row: {
          created_at: string
          expires_at: string
          fetched_at: string
          id: string
          observation_date: string
          series_id: string
          series_name: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          observation_date: string
          series_id: string
          series_name: string
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          observation_date?: string
          series_id?: string
          series_name?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      elite_waitlist: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          notes: string | null
          phone: string | null
          source: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          sender_account: string | null
          status: string
          template_name: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          sender_account?: string | null
          status: string
          template_name: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          sender_account?: string | null
          status?: string
          template_name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_send_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          active: boolean
          body_html: string | null
          body_markdown: string
          category: string
          created_at: string
          created_by_user_id: string | null
          notes: string | null
          preheader: string | null
          product_scope: string
          subject: string
          template_key: string
          tenant_id: string | null
          updated_at: string
          updated_by_user_id: string | null
          variables: Json
        }
        Insert: {
          active?: boolean
          body_html?: string | null
          body_markdown: string
          category: string
          created_at?: string
          created_by_user_id?: string | null
          notes?: string | null
          preheader?: string | null
          product_scope: string
          subject: string
          template_key: string
          tenant_id?: string | null
          updated_at?: string
          updated_by_user_id?: string | null
          variables?: Json
        }
        Update: {
          active?: boolean
          body_html?: string | null
          body_markdown?: string
          category?: string
          created_at?: string
          created_by_user_id?: string | null
          notes?: string | null
          preheader?: string | null
          product_scope?: string
          subject?: string
          template_key?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by_user_id?: string | null
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string | null
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token?: string | null
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string | null
          token_hash?: string
          used_at?: string | null
        }
        Relationships: []
      }
      extraction_quality_log: {
        Row: {
          account_count_original: number | null
          account_count_reextracted: number | null
          client_id: string | null
          created_at: string
          creditor_consistency_check: Json | null
          extraction_date: string
          id: string
          overall_quality_score: number | null
          quality_flags: Json | null
          report_id: string | null
          required_fields_percentage: number | null
          score_consistency_check: Json | null
          user_id: string
        }
        Insert: {
          account_count_original?: number | null
          account_count_reextracted?: number | null
          client_id?: string | null
          created_at?: string
          creditor_consistency_check?: Json | null
          extraction_date?: string
          id?: string
          overall_quality_score?: number | null
          quality_flags?: Json | null
          report_id?: string | null
          required_fields_percentage?: number | null
          score_consistency_check?: Json | null
          user_id: string
        }
        Update: {
          account_count_original?: number | null
          account_count_reextracted?: number | null
          client_id?: string | null
          created_at?: string
          creditor_consistency_check?: Json | null
          extraction_date?: string
          id?: string
          overall_quality_score?: number | null
          quality_flags?: Json | null
          report_id?: string | null
          required_fields_percentage?: number | null
          score_consistency_check?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "extraction_quality_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_quality_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "extraction_quality_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "extraction_quality_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_quality_log_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_report_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_request_votes: {
        Row: {
          created_at: string
          feature_request_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feature_request_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feature_request_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_request_votes_feature_request_id_fkey"
            columns: ["feature_request_id"]
            isOneToOne: false
            referencedRelation: "feature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          admin_response: string | null
          category: string
          created_at: string
          description: string
          id: string
          planned_release: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          vote_count: number
        }
        Insert: {
          admin_response?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          planned_release?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          vote_count?: number
        }
        Update: {
          admin_response?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          planned_release?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          vote_count?: number
        }
        Relationships: []
      }
      financial_api_logs: {
        Row: {
          api_endpoint: string
          api_provider: string
          consent_event_id: string | null
          created_at: string
          id: string
          lenders_displayed: Json | null
          metadata: Json | null
          request_type: string
          response_status: number | null
          session_id: string | null
          user_id: string
        }
        Insert: {
          api_endpoint: string
          api_provider: string
          consent_event_id?: string | null
          created_at?: string
          id?: string
          lenders_displayed?: Json | null
          metadata?: Json | null
          request_type: string
          response_status?: number | null
          session_id?: string | null
          user_id: string
        }
        Update: {
          api_endpoint?: string
          api_provider?: string
          consent_event_id?: string | null
          created_at?: string
          id?: string
          lenders_displayed?: Json | null
          metadata?: Json | null
          request_type?: string
          response_status?: number | null
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_api_logs_consent_event_id_fkey"
            columns: ["consent_event_id"]
            isOneToOne: false
            referencedRelation: "consent_events"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_document_analyses: {
        Row: {
          analysis_status: string
          avg_daily_balance: number | null
          avg_monthly_revenue: number | null
          business_id: string | null
          created_at: string
          doc_type_detected: string | null
          document_id: string
          error_message: string | null
          full_analysis: Json | null
          id: string
          largest_deposit: number | null
          largest_deposit_description: string | null
          largest_withdrawal: number | null
          largest_withdrawal_description: string | null
          lender_red_flags: Json | null
          lender_summary_path: string | null
          nsf_count: number | null
          overdraft_count: number | null
          period_end: string | null
          period_start: string | null
          revenue_trend: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_status?: string
          avg_daily_balance?: number | null
          avg_monthly_revenue?: number | null
          business_id?: string | null
          created_at?: string
          doc_type_detected?: string | null
          document_id: string
          error_message?: string | null
          full_analysis?: Json | null
          id?: string
          largest_deposit?: number | null
          largest_deposit_description?: string | null
          largest_withdrawal?: number | null
          largest_withdrawal_description?: string | null
          lender_red_flags?: Json | null
          lender_summary_path?: string | null
          nsf_count?: number | null
          overdraft_count?: number | null
          period_end?: string | null
          period_start?: string | null
          revenue_trend?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_status?: string
          avg_daily_balance?: number | null
          avg_monthly_revenue?: number | null
          business_id?: string | null
          created_at?: string
          doc_type_detected?: string | null
          document_id?: string
          error_message?: string | null
          full_analysis?: Json | null
          id?: string
          largest_deposit?: number | null
          largest_deposit_description?: string | null
          largest_withdrawal?: number | null
          largest_withdrawal_description?: string | null
          lender_red_flags?: Json | null
          lender_summary_path?: string | null
          nsf_count?: number | null
          overdraft_count?: number | null
          period_end?: string | null
          period_start?: string | null
          revenue_trend?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_document_analyses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_analyses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_kpis: {
        Row: {
          avg_balance_30d: number | null
          avg_balance_90d: number | null
          created_at: string | null
          dscr: number | null
          id: string
          last_calculated_at: string | null
          monthly_inflow: number | null
          monthly_outflow: number | null
          nsf_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avg_balance_30d?: number | null
          avg_balance_90d?: number | null
          created_at?: string | null
          dscr?: number | null
          id?: string
          last_calculated_at?: string | null
          monthly_inflow?: number | null
          monthly_outflow?: number | null
          nsf_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avg_balance_30d?: number | null
          avg_balance_90d?: number | null
          created_at?: string | null
          dscr?: number | null
          id?: string
          last_calculated_at?: string | null
          monthly_inflow?: number | null
          monthly_outflow?: number | null
          nsf_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      funding_application_outcomes: {
        Row: {
          admin_notes: string | null
          amount_requested: number
          application_date: string
          approved_amount: number | null
          client_id: string | null
          created_at: string
          decline_reason: string | null
          decline_reason_other: string | null
          factor_rate: number | null
          follow_up_date: string | null
          id: string
          interest_rate: number | null
          lender_name: string
          outcome: string
          predicted_match_score: number | null
          product_type: string
          recorded_by: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount_requested: number
          application_date: string
          approved_amount?: number | null
          client_id?: string | null
          created_at?: string
          decline_reason?: string | null
          decline_reason_other?: string | null
          factor_rate?: number | null
          follow_up_date?: string | null
          id?: string
          interest_rate?: number | null
          lender_name: string
          outcome: string
          predicted_match_score?: number | null
          product_type: string
          recorded_by: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount_requested?: number
          application_date?: string
          approved_amount?: number | null
          client_id?: string | null
          created_at?: string
          decline_reason?: string | null
          decline_reason_other?: string | null
          factor_rate?: number | null
          follow_up_date?: string | null
          id?: string
          interest_rate?: number | null
          lender_name?: string
          outcome?: string
          predicted_match_score?: number | null
          product_type?: string
          recorded_by?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_application_outcomes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_application_outcomes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "funding_application_outcomes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "funding_application_outcomes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_application_sequence: {
        Row: {
          created_at: string | null
          estimated_amount: number | null
          id: string
          lender_product_id: string | null
          reason: string | null
          sequence_order: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          estimated_amount?: number | null
          id?: string
          lender_product_id?: string | null
          reason?: string | null
          sequence_order: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          estimated_amount?: number | null
          id?: string
          lender_product_id?: string | null
          reason?: string | null
          sequence_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_application_sequence_lender_product_id_fkey"
            columns: ["lender_product_id"]
            isOneToOne: false
            referencedRelation: "lender_products"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_applications: {
        Row: {
          amount_requested: number
          application_type: string
          business_id: string | null
          created_at: string | null
          funded_at: string | null
          id: string
          metadata: Json | null
          notes: string | null
          offer_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          status: string
          submitted_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_requested: number
          application_type: string
          business_id?: string | null
          created_at?: string | null
          funded_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          offer_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_requested?: number
          application_type?: string
          business_id?: string | null
          created_at?: string | null
          funded_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          offer_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_applications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_applications_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "funding_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_journey_applications: {
        Row: {
          amount_approved: number | null
          amount_requested: number | null
          application_date: string
          bureau_pulled: string | null
          business_id: string | null
          created_at: string
          credit_score_at_application: number | null
          decision_date: string | null
          denial_letter_url: string | null
          denial_reason_category:
            | Database["public"]["Enums"]["denial_reason_category"]
            | null
          denial_reason_detail: string | null
          id: string
          interest_rate: number | null
          lender_id: string | null
          lender_name: string
          next_steps: string | null
          notes: string | null
          product_category: string | null
          product_name: string | null
          status: Database["public"]["Enums"]["funding_journey_status"]
          term_months: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_approved?: number | null
          amount_requested?: number | null
          application_date?: string
          bureau_pulled?: string | null
          business_id?: string | null
          created_at?: string
          credit_score_at_application?: number | null
          decision_date?: string | null
          denial_letter_url?: string | null
          denial_reason_category?:
            | Database["public"]["Enums"]["denial_reason_category"]
            | null
          denial_reason_detail?: string | null
          id?: string
          interest_rate?: number | null
          lender_id?: string | null
          lender_name: string
          next_steps?: string | null
          notes?: string | null
          product_category?: string | null
          product_name?: string | null
          status?: Database["public"]["Enums"]["funding_journey_status"]
          term_months?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_approved?: number | null
          amount_requested?: number | null
          application_date?: string
          bureau_pulled?: string | null
          business_id?: string | null
          created_at?: string
          credit_score_at_application?: number | null
          decision_date?: string | null
          denial_letter_url?: string | null
          denial_reason_category?:
            | Database["public"]["Enums"]["denial_reason_category"]
            | null
          denial_reason_detail?: string | null
          id?: string
          interest_rate?: number | null
          lender_id?: string | null
          lender_name?: string
          next_steps?: string | null
          notes?: string | null
          product_category?: string | null
          product_name?: string | null
          status?: Database["public"]["Enums"]["funding_journey_status"]
          term_months?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_journey_applications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_matches: {
        Row: {
          ai_generated: boolean | null
          applied: boolean | null
          business_id: string | null
          client_id: string | null
          created_at: string | null
          dismissed: boolean | null
          id: string
          match_reasons: Json | null
          match_score: number | null
          match_type: string
          offer_id: string
          updated_at: string | null
          user_id: string
          viewed: boolean | null
        }
        Insert: {
          ai_generated?: boolean | null
          applied?: boolean | null
          business_id?: string | null
          client_id?: string | null
          created_at?: string | null
          dismissed?: boolean | null
          id?: string
          match_reasons?: Json | null
          match_score?: number | null
          match_type: string
          offer_id: string
          updated_at?: string | null
          user_id: string
          viewed?: boolean | null
        }
        Update: {
          ai_generated?: boolean | null
          applied?: boolean | null
          business_id?: string | null
          client_id?: string | null
          created_at?: string | null
          dismissed?: boolean | null
          id?: string
          match_reasons?: Json | null
          match_score?: number | null
          match_type?: string
          offer_id?: string
          updated_at?: string | null
          user_id?: string
          viewed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "funding_matches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_matches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_matches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "funding_matches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "funding_matches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_matches_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "funding_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_milestones: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          lender_name: string | null
          milestone_date: string
          milestone_type: Database["public"]["Enums"]["funding_milestone_type"]
          notes: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          lender_name?: string | null
          milestone_date?: string
          milestone_type: Database["public"]["Enums"]["funding_milestone_type"]
          notes?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          lender_name?: string | null
          milestone_date?: string
          milestone_type?: Database["public"]["Enums"]["funding_milestone_type"]
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      funding_offers: {
        Row: {
          accepted_naics_risk_categories:
            | Database["public"]["Enums"]["naics_risk_category"][]
            | null
          affiliate_tag: string | null
          apply_url: string
          approval_timeframe: string | null
          apr_range: string | null
          created_at: string | null
          funding_category: string | null
          funding_speed: string | null
          id: string
          industry_specialization: string[] | null
          is_active: boolean | null
          lender_type: string | null
          limits_range: string | null
          max_business_age_months: number | null
          max_credit_score: number | null
          max_revenue: number | null
          min_business_age_months: number | null
          min_credit_score: number | null
          min_revenue: number | null
          name: string
          product_type: string
          requirements: string | null
          requires_collateral: boolean | null
          specific_naics_codes: string[] | null
          updated_at: string | null
        }
        Insert: {
          accepted_naics_risk_categories?:
            | Database["public"]["Enums"]["naics_risk_category"][]
            | null
          affiliate_tag?: string | null
          apply_url: string
          approval_timeframe?: string | null
          apr_range?: string | null
          created_at?: string | null
          funding_category?: string | null
          funding_speed?: string | null
          id?: string
          industry_specialization?: string[] | null
          is_active?: boolean | null
          lender_type?: string | null
          limits_range?: string | null
          max_business_age_months?: number | null
          max_credit_score?: number | null
          max_revenue?: number | null
          min_business_age_months?: number | null
          min_credit_score?: number | null
          min_revenue?: number | null
          name: string
          product_type: string
          requirements?: string | null
          requires_collateral?: boolean | null
          specific_naics_codes?: string[] | null
          updated_at?: string | null
        }
        Update: {
          accepted_naics_risk_categories?:
            | Database["public"]["Enums"]["naics_risk_category"][]
            | null
          affiliate_tag?: string | null
          apply_url?: string
          approval_timeframe?: string | null
          apr_range?: string | null
          created_at?: string | null
          funding_category?: string | null
          funding_speed?: string | null
          id?: string
          industry_specialization?: string[] | null
          is_active?: boolean | null
          lender_type?: string | null
          limits_range?: string | null
          max_business_age_months?: number | null
          max_credit_score?: number | null
          max_revenue?: number | null
          min_business_age_months?: number | null
          min_credit_score?: number | null
          min_revenue?: number | null
          name?: string
          product_type?: string
          requirements?: string | null
          requires_collateral?: boolean | null
          specific_naics_codes?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      funding_plans: {
        Row: {
          business_id: string | null
          created_at: string | null
          current_tier: string | null
          id: string
          plan_steps: Json | null
          readiness_score: number | null
          status: string
          target_amount: number
          timeline: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string | null
          current_tier?: string | null
          id?: string
          plan_steps?: Json | null
          readiness_score?: number | null
          status?: string
          target_amount: number
          timeline?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string | null
          current_tier?: string | null
          id?: string
          plan_steps?: Json | null
          readiness_score?: number | null
          status?: string
          target_amount?: number
          timeline?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_plans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_projections: {
        Row: {
          calculated_at: string | null
          id: string
          new_products_unlocked: Json | null
          projected_matches: number | null
          projected_score: number | null
          projected_total_funding: number | null
          scenario_name: string
          scenario_params: Json
          user_id: string
        }
        Insert: {
          calculated_at?: string | null
          id?: string
          new_products_unlocked?: Json | null
          projected_matches?: number | null
          projected_score?: number | null
          projected_total_funding?: number | null
          scenario_name: string
          scenario_params?: Json
          user_id: string
        }
        Update: {
          calculated_at?: string | null
          id?: string
          new_products_unlocked?: Json | null
          projected_matches?: number | null
          projected_score?: number | null
          projected_total_funding?: number | null
          scenario_name?: string
          scenario_params?: Json
          user_id?: string
        }
        Relationships: []
      }
      funding_readiness_scores: {
        Row: {
          banking_history_score: number
          business_credit_score: number
          created_at: string
          entity_structure_score: number
          id: string
          last_calculated_at: string | null
          lender_alignment_score: number
          overall_score: number
          personal_credit_score: number
          revenue_documentation_score: number
          score_explanations: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          banking_history_score?: number
          business_credit_score?: number
          created_at?: string
          entity_structure_score?: number
          id?: string
          last_calculated_at?: string | null
          lender_alignment_score?: number
          overall_score?: number
          personal_credit_score?: number
          revenue_documentation_score?: number
          score_explanations?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          banking_history_score?: number
          business_credit_score?: number
          created_at?: string
          entity_structure_score?: number
          id?: string
          last_calculated_at?: string | null
          lender_alignment_score?: number
          overall_score?: number
          personal_credit_score?: number
          revenue_documentation_score?: number
          score_explanations?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      funding_secured: {
        Row: {
          amount: number
          client_user_id: string
          created_at: string
          date_secured: string
          factor_rate: number | null
          id: string
          interest_rate: number | null
          lender_name: string
          notes: string | null
          product_type: string
          term_length_months: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          client_user_id: string
          created_at?: string
          date_secured?: string
          factor_rate?: number | null
          id?: string
          interest_rate?: number | null
          lender_name: string
          notes?: string | null
          product_type: string
          term_length_months?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          client_user_id?: string
          created_at?: string
          date_secured?: string
          factor_rate?: number | null
          id?: string
          interest_rate?: number | null
          lender_name?: string
          notes?: string | null
          product_type?: string
          term_length_months?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      growth_external_sources: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          field_map_json: Json
          id: string
          label: string
          last_seen_at: string | null
          provider: string
          target_form_id: string | null
          tenant_id: string
          updated_at: string
          webhook_token: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          field_map_json?: Json
          id?: string
          label: string
          last_seen_at?: string | null
          provider: string
          target_form_id?: string | null
          tenant_id: string
          updated_at?: string
          webhook_token?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          field_map_json?: Json
          id?: string
          label?: string
          last_seen_at?: string | null
          provider?: string
          target_form_id?: string | null
          tenant_id?: string
          updated_at?: string
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_external_sources_target_form_id_fkey"
            columns: ["target_form_id"]
            isOneToOne: false
            referencedRelation: "growth_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_external_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_form_submissions: {
        Row: {
          consent_json: Json
          contact_id: string | null
          created_at: string
          deal_id: string | null
          external_source_id: string | null
          form_id: string
          funnel_session_id: string | null
          id: string
          ip: string | null
          payload_json: Json
          processed: boolean
          processed_at: string | null
          referrer: string | null
          source: string
          tenant_id: string
          user_agent: string | null
          utm_json: Json
        }
        Insert: {
          consent_json?: Json
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          external_source_id?: string | null
          form_id: string
          funnel_session_id?: string | null
          id?: string
          ip?: string | null
          payload_json?: Json
          processed?: boolean
          processed_at?: string | null
          referrer?: string | null
          source?: string
          tenant_id: string
          user_agent?: string | null
          utm_json?: Json
        }
        Update: {
          consent_json?: Json
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          external_source_id?: string | null
          form_id?: string
          funnel_session_id?: string | null
          id?: string
          ip?: string | null
          payload_json?: Json
          processed?: boolean
          processed_at?: string | null
          referrer?: string | null
          source?: string
          tenant_id?: string
          user_agent?: string | null
          utm_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "growth_form_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_form_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "growth_form_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "growth_form_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "growth_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_form_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_forms: {
        Row: {
          auto_create_contact: boolean
          auto_create_deal: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          notify_user_ids: string[]
          pipeline_id: string | null
          schema_json: Json
          slug: string
          stage_id: string | null
          status: string
          success_action_json: Json
          template_key: string | null
          tenant_id: string
          updated_at: string
          workflow_slug: string | null
        }
        Insert: {
          auto_create_contact?: boolean
          auto_create_deal?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notify_user_ids?: string[]
          pipeline_id?: string | null
          schema_json?: Json
          slug: string
          stage_id?: string | null
          status?: string
          success_action_json?: Json
          template_key?: string | null
          tenant_id: string
          updated_at?: string
          workflow_slug?: string | null
        }
        Update: {
          auto_create_contact?: boolean
          auto_create_deal?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notify_user_ids?: string[]
          pipeline_id?: string | null
          schema_json?: Json
          slug?: string
          stage_id?: string | null
          status?: string
          success_action_json?: Json
          template_key?: string | null
          tenant_id?: string
          updated_at?: string
          workflow_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "growth_forms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_funnel_steps: {
        Row: {
          config_json: Json
          created_at: string
          form_id: string | null
          funnel_id: string
          id: string
          order_index: number
          page_id: string | null
          step_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config_json?: Json
          created_at?: string
          form_id?: string | null
          funnel_id: string
          id?: string
          order_index?: number
          page_id?: string | null
          step_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config_json?: Json
          created_at?: string
          form_id?: string | null
          funnel_id?: string
          id?: string
          order_index?: number
          page_id?: string | null
          step_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_funnel_steps_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "growth_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_funnel_steps_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "growth_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_funnel_steps_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "growth_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_funnel_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_funnels: {
        Row: {
          created_at: string
          created_by: string | null
          entry_page_id: string | null
          goal: string | null
          id: string
          name: string
          slug: string
          status: string
          success_page_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_page_id?: string | null
          goal?: string | null
          id?: string
          name: string
          slug: string
          status?: string
          success_page_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_page_id?: string | null
          goal?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
          success_page_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_funnels_entry_page_id_fkey"
            columns: ["entry_page_id"]
            isOneToOne: false
            referencedRelation: "growth_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_funnels_success_page_id_fkey"
            columns: ["success_page_id"]
            isOneToOne: false
            referencedRelation: "growth_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "growth_funnels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      growth_pages: {
        Row: {
          blocks_json: Json
          created_at: string
          created_by: string | null
          id: string
          og_image_url: string | null
          published_at: string | null
          seo_json: Json
          slug: string
          status: string
          template_key: string | null
          tenant_id: string
          theme_json: Json
          title: string
          updated_at: string
        }
        Insert: {
          blocks_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          og_image_url?: string | null
          published_at?: string | null
          seo_json?: Json
          slug: string
          status?: string
          template_key?: string | null
          tenant_id: string
          theme_json?: Json
          title: string
          updated_at?: string
        }
        Update: {
          blocks_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          og_image_url?: string | null
          published_at?: string | null
          seo_json?: Json
          slug?: string
          status?: string
          template_key?: string | null
          tenant_id?: string
          theme_json?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "growth_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          metadata: Json
          role: Database["public"]["Enums"]["app_role"]
          template_name: string | null
          tenant_id: string | null
          token: string | null
          token_hash: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          metadata?: Json
          role?: Database["public"]["Enums"]["app_role"]
          template_name?: string | null
          tenant_id?: string | null
          token?: string | null
          token_hash?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          metadata?: Json
          role?: Database["public"]["Enums"]["app_role"]
          template_name?: string | null
          tenant_id?: string | null
          token?: string | null
          token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_coverage_signal: {
        Row: {
          date: string
          doc_count: number
          id: string
          query_count: number
          tenant_id: string | null
          topic_cluster: string
          unanswered_count: number
        }
        Insert: {
          date?: string
          doc_count?: number
          id?: string
          query_count?: number
          tenant_id?: string | null
          topic_cluster: string
          unanswered_count?: number
        }
        Update: {
          date?: string
          doc_count?: number
          id?: string
          query_count?: number
          tenant_id?: string | null
          topic_cluster?: string
          unanswered_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "kb_coverage_signal_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_query_telemetry: {
        Row: {
          created_at: string
          feedback: string | null
          had_global_match: boolean
          had_tenant_match: boolean
          id: string
          query_hash: string
          query_intent_tags: string[] | null
          query_length: number | null
          result_count: number
          tenant_id: string | null
          top_similarity: number | null
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          had_global_match?: boolean
          had_tenant_match?: boolean
          id?: string
          query_hash: string
          query_intent_tags?: string[] | null
          query_length?: number | null
          result_count?: number
          tenant_id?: string | null
          top_similarity?: number | null
        }
        Update: {
          created_at?: string
          feedback?: string | null
          had_global_match?: boolean
          had_tenant_match?: boolean
          id?: string
          query_hash?: string
          query_intent_tags?: string[] | null
          query_length?: number | null
          result_count?: number
          tenant_id?: string | null
          top_similarity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_query_telemetry_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          category: Database["public"]["Enums"]["knowledge_category"]
          content: string
          created_at: string | null
          framework: string
          id: string
          metadata: Json | null
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["knowledge_category"]
          content: string
          created_at?: string | null
          framework: string
          id?: string
          metadata?: Json | null
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["knowledge_category"]
          content?: string
          created_at?: string | null
          framework?: string
          id?: string
          metadata?: Json | null
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          context: Json
          created_at: string
          document_id: string | null
          document_slug: string
          document_version: number
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          context?: Json
          created_at?: string
          document_id?: string | null
          document_slug: string
          document_version: number
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          context?: Json
          created_at?: string
          document_id?: string | null
          document_slug?: string
          document_version?: number
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_acceptances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          audience: string
          body_md: string
          created_at: string
          created_by: string | null
          effective_date: string
          id: string
          is_current: boolean
          required_at_signup: boolean
          slug: string
          summary: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          audience?: string
          body_md: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          is_current?: boolean
          required_at_signup?: boolean
          slug: string
          summary?: string | null
          title: string
          updated_at?: string
          version: number
        }
        Update: {
          audience?: string
          body_md?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          is_current?: boolean
          required_at_signup?: boolean
          slug?: string
          summary?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      lender_bureau_preferences: {
        Row: {
          application_url: string | null
          business_credit_bureaus: string[] | null
          confidence_level: string
          confidence_source: string
          created_at: string
          fdic_cert: string | null
          funding_speed: string | null
          geographic_scope: string
          id: string
          institution_name: string
          institution_type: string
          interest_rate_range: string | null
          is_active: boolean | null
          is_sba_approved: boolean | null
          max_loan_amount: number | null
          min_annual_revenue: number | null
          min_credit_score: number | null
          min_loan_amount: number | null
          min_time_in_business_months: number | null
          ncua_charter: string | null
          notes: string | null
          personal_credit_impact: string | null
          primary_bureau: string
          product_category: string | null
          product_subcategory: string | null
          requires_collateral: boolean | null
          requires_personal_guarantee: boolean | null
          sba_preferred_lender: boolean | null
          secondary_bureau: string | null
          serves_bad_credit: boolean | null
          serves_minority_owned: boolean | null
          serves_startups: boolean | null
          serves_veterans: boolean | null
          serves_women_owned: boolean | null
          states_applicable: string[] | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          application_url?: string | null
          business_credit_bureaus?: string[] | null
          confidence_level?: string
          confidence_source?: string
          created_at?: string
          fdic_cert?: string | null
          funding_speed?: string | null
          geographic_scope?: string
          id?: string
          institution_name: string
          institution_type?: string
          interest_rate_range?: string | null
          is_active?: boolean | null
          is_sba_approved?: boolean | null
          max_loan_amount?: number | null
          min_annual_revenue?: number | null
          min_credit_score?: number | null
          min_loan_amount?: number | null
          min_time_in_business_months?: number | null
          ncua_charter?: string | null
          notes?: string | null
          personal_credit_impact?: string | null
          primary_bureau?: string
          product_category?: string | null
          product_subcategory?: string | null
          requires_collateral?: boolean | null
          requires_personal_guarantee?: boolean | null
          sba_preferred_lender?: boolean | null
          secondary_bureau?: string | null
          serves_bad_credit?: boolean | null
          serves_minority_owned?: boolean | null
          serves_startups?: boolean | null
          serves_veterans?: boolean | null
          serves_women_owned?: boolean | null
          states_applicable?: string[] | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          application_url?: string | null
          business_credit_bureaus?: string[] | null
          confidence_level?: string
          confidence_source?: string
          created_at?: string
          fdic_cert?: string | null
          funding_speed?: string | null
          geographic_scope?: string
          id?: string
          institution_name?: string
          institution_type?: string
          interest_rate_range?: string | null
          is_active?: boolean | null
          is_sba_approved?: boolean | null
          max_loan_amount?: number | null
          min_annual_revenue?: number | null
          min_credit_score?: number | null
          min_loan_amount?: number | null
          min_time_in_business_months?: number | null
          ncua_charter?: string | null
          notes?: string | null
          personal_credit_impact?: string | null
          primary_bureau?: string
          product_category?: string | null
          product_subcategory?: string | null
          requires_collateral?: boolean | null
          requires_personal_guarantee?: boolean | null
          sba_preferred_lender?: boolean | null
          secondary_bureau?: string | null
          serves_bad_credit?: boolean | null
          serves_minority_owned?: boolean | null
          serves_startups?: boolean | null
          serves_veterans?: boolean | null
          serves_women_owned?: boolean | null
          states_applicable?: string[] | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      lender_products: {
        Row: {
          affiliate_commission_pct: number | null
          affiliate_url: string | null
          application_url: string | null
          apr_range_high: number | null
          apr_range_low: number | null
          business_credit_bureaus: string[] | null
          confidence_level: string | null
          created_at: string | null
          ein_only: boolean | null
          funding_speed: string | null
          id: string
          interest_rate_range: string | null
          is_active: boolean | null
          is_sba_approved: boolean | null
          last_verified: string | null
          lender_name: string
          max_amount: number | null
          max_derogatory_items: number | null
          max_inquiries_12mo: number | null
          max_inquiries_6mo: number | null
          max_utilization_pct: number | null
          min_account_age_months: number | null
          min_amount: number | null
          min_annual_revenue: number | null
          min_build_phase_business: string | null
          min_build_phase_personal: string | null
          min_business_age_months: number | null
          min_dscr: number | null
          min_fico_score: number | null
          min_intelliscore: number | null
          min_months_clean_reporting: number | null
          min_open_accounts: number | null
          min_paydex: number | null
          notes: string | null
          personal_credit_impact: string | null
          primary_bureau: string | null
          product_category: string | null
          product_name: string
          product_subcategory: string | null
          product_type: string
          requires_collateral: boolean | null
          requires_duns: boolean
          requires_personal_guarantee: boolean | null
          requires_pg: boolean | null
          sba_preferred_lender: boolean | null
          secondary_bureau: string | null
          serves_bad_credit: boolean | null
          serves_minority_owned: boolean | null
          serves_startups: boolean | null
          serves_veterans: boolean | null
          serves_women_owned: boolean | null
          term_months: number | null
          updated_at: string | null
        }
        Insert: {
          affiliate_commission_pct?: number | null
          affiliate_url?: string | null
          application_url?: string | null
          apr_range_high?: number | null
          apr_range_low?: number | null
          business_credit_bureaus?: string[] | null
          confidence_level?: string | null
          created_at?: string | null
          ein_only?: boolean | null
          funding_speed?: string | null
          id?: string
          interest_rate_range?: string | null
          is_active?: boolean | null
          is_sba_approved?: boolean | null
          last_verified?: string | null
          lender_name: string
          max_amount?: number | null
          max_derogatory_items?: number | null
          max_inquiries_12mo?: number | null
          max_inquiries_6mo?: number | null
          max_utilization_pct?: number | null
          min_account_age_months?: number | null
          min_amount?: number | null
          min_annual_revenue?: number | null
          min_build_phase_business?: string | null
          min_build_phase_personal?: string | null
          min_business_age_months?: number | null
          min_dscr?: number | null
          min_fico_score?: number | null
          min_intelliscore?: number | null
          min_months_clean_reporting?: number | null
          min_open_accounts?: number | null
          min_paydex?: number | null
          notes?: string | null
          personal_credit_impact?: string | null
          primary_bureau?: string | null
          product_category?: string | null
          product_name: string
          product_subcategory?: string | null
          product_type: string
          requires_collateral?: boolean | null
          requires_duns?: boolean
          requires_personal_guarantee?: boolean | null
          requires_pg?: boolean | null
          sba_preferred_lender?: boolean | null
          secondary_bureau?: string | null
          serves_bad_credit?: boolean | null
          serves_minority_owned?: boolean | null
          serves_startups?: boolean | null
          serves_veterans?: boolean | null
          serves_women_owned?: boolean | null
          term_months?: number | null
          updated_at?: string | null
        }
        Update: {
          affiliate_commission_pct?: number | null
          affiliate_url?: string | null
          application_url?: string | null
          apr_range_high?: number | null
          apr_range_low?: number | null
          business_credit_bureaus?: string[] | null
          confidence_level?: string | null
          created_at?: string | null
          ein_only?: boolean | null
          funding_speed?: string | null
          id?: string
          interest_rate_range?: string | null
          is_active?: boolean | null
          is_sba_approved?: boolean | null
          last_verified?: string | null
          lender_name?: string
          max_amount?: number | null
          max_derogatory_items?: number | null
          max_inquiries_12mo?: number | null
          max_inquiries_6mo?: number | null
          max_utilization_pct?: number | null
          min_account_age_months?: number | null
          min_amount?: number | null
          min_annual_revenue?: number | null
          min_build_phase_business?: string | null
          min_build_phase_personal?: string | null
          min_business_age_months?: number | null
          min_dscr?: number | null
          min_fico_score?: number | null
          min_intelliscore?: number | null
          min_months_clean_reporting?: number | null
          min_open_accounts?: number | null
          min_paydex?: number | null
          notes?: string | null
          personal_credit_impact?: string | null
          primary_bureau?: string | null
          product_category?: string | null
          product_name?: string
          product_subcategory?: string | null
          product_type?: string
          requires_collateral?: boolean | null
          requires_duns?: boolean
          requires_personal_guarantee?: boolean | null
          requires_pg?: boolean | null
          sba_preferred_lender?: boolean | null
          secondary_bureau?: string | null
          serves_bad_credit?: boolean | null
          serves_minority_owned?: boolean | null
          serves_startups?: boolean | null
          serves_veterans?: boolean | null
          serves_women_owned?: boolean | null
          term_months?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      lender_research_results: {
        Row: {
          client_user_id: string | null
          created_at: string
          id: string
          is_deep_research: boolean
          market_commentary: string | null
          results: Json
          search_criteria: Json
          search_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_user_id?: string | null
          created_at?: string
          id?: string
          is_deep_research?: boolean
          market_commentary?: string | null
          results?: Json
          search_criteria?: Json
          search_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_user_id?: string | null
          created_at?: string
          id?: string
          is_deep_research?: boolean
          market_commentary?: string | null
          results?: Json
          search_criteria?: Json
          search_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lessons: {
        Row: {
          content_markdown: string | null
          content_type: string | null
          content_url: string | null
          course_id: string
          created_at: string | null
          duration_minutes: number | null
          id: string
          is_required: boolean | null
          module_number: number
          sort_order: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content_markdown?: string | null
          content_type?: string | null
          content_url?: string | null
          course_id: string
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_required?: boolean | null
          module_number: number
          sort_order?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content_markdown?: string | null
          content_type?: string | null
          content_url?: string | null
          course_id?: string
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          is_required?: boolean | null
          module_number?: number
          sort_order?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      letters: {
        Row: {
          body_markdown: string | null
          created_at: string | null
          dispute_id: string
          id: string
          letter_type: string
          mail_tracking_url: string | null
          mailed: boolean | null
          pdf_url: string | null
          updated_at: string | null
        }
        Insert: {
          body_markdown?: string | null
          created_at?: string | null
          dispute_id: string
          id?: string
          letter_type: string
          mail_tracking_url?: string | null
          mailed?: boolean | null
          pdf_url?: string | null
          updated_at?: string | null
        }
        Update: {
          body_markdown?: string | null
          created_at?: string | null
          dispute_id?: string
          id?: string
          letter_type?: string
          mail_tracking_url?: string | null
          mailed?: boolean | null
          pdf_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "letters_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_banking_entries: {
        Row: {
          accounts_separated: boolean | null
          avg_daily_balance: number | null
          avg_monthly_revenue: number | null
          created_at: string
          id: string
          monthly_nsf_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accounts_separated?: boolean | null
          avg_daily_balance?: number | null
          avg_monthly_revenue?: number | null
          created_at?: string
          id?: string
          monthly_nsf_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accounts_separated?: boolean | null
          avg_daily_balance?: number | null
          avg_monthly_revenue?: number | null
          created_at?: string
          id?: string
          monthly_nsf_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mcc_service_requests: {
        Row: {
          broker_id: string
          client_relationship_id: string
          created_at: string
          id: string
          notes: string | null
          priority: string
          service_type: string
          status: string
          updated_at: string
          webhook_dispatched_at: string | null
          webhook_response: Json | null
        }
        Insert: {
          broker_id: string
          client_relationship_id: string
          created_at?: string
          id?: string
          notes?: string | null
          priority?: string
          service_type: string
          status?: string
          updated_at?: string
          webhook_dispatched_at?: string | null
          webhook_response?: Json | null
        }
        Update: {
          broker_id?: string
          client_relationship_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          priority?: string
          service_type?: string
          status?: string
          updated_at?: string
          webhook_dispatched_at?: string | null
          webhook_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "mcc_service_requests_broker_id_fkey"
            columns: ["broker_id"]
            isOneToOne: false
            referencedRelation: "broker_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcc_service_requests_client_relationship_id_fkey"
            columns: ["client_relationship_id"]
            isOneToOne: false
            referencedRelation: "broker_client_relationships"
            referencedColumns: ["id"]
          },
        ]
      }
      mma_os_bridge_outbox: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          id: string
          last_error: string | null
          next_retry_at: string
          payload: Json
          updated_at: string
          verb: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          next_retry_at?: string
          payload: Json
          updated_at?: string
          verb: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          id?: string
          last_error?: string | null
          next_retry_at?: string
          payload?: Json
          updated_at?: string
          verb?: string
        }
        Relationships: []
      }
      naics_codes: {
        Row: {
          created_at: string | null
          description: string | null
          funding_notes: string | null
          id: string
          industry_title: string
          naics_code: string
          risk_category: Database["public"]["Enums"]["naics_risk_category"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          funding_notes?: string | null
          id?: string
          industry_title: string
          naics_code: string
          risk_category?: Database["public"]["Enums"]["naics_risk_category"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          funding_notes?: string | null
          id?: string
          industry_title?: string
          naics_code?: string
          risk_category?: Database["public"]["Enums"]["naics_risk_category"]
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          alert_type: string
          channel: string
          created_at: string | null
          enabled: boolean | null
          id: string
          metadata: Json | null
          threshold_operator: string | null
          threshold_value: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          alert_type: string
          channel: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          metadata?: Json | null
          threshold_operator?: string | null
          threshold_value?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          alert_type?: string
          channel?: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          metadata?: Json | null
          threshold_operator?: string | null
          threshold_value?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          id: string
          plan_type: string
          status: Database["public"]["Enums"]["order_status"]
          stripe_session_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          id?: string
          plan_type: string
          status?: Database["public"]["Enums"]["order_status"]
          stripe_session_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          plan_type?: string
          status?: Database["public"]["Enums"]["order_status"]
          stripe_session_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      outbound_webhook_configs: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          label: string
          subscribed_events: string[]
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          label: string
          subscribed_events?: string[]
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          label?: string
          subscribed_events?: string[]
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      outreach_drafts: {
        Row: {
          admin_edited: boolean
          client_user_id: string
          compliance_flag_count: number
          compliance_flags: Json | null
          compliance_status: string
          created_at: string
          created_by: string
          downloaded_at: string | null
          edited_content: string | null
          funding_product: string | null
          generated_content: string
          id: string
          lender_name: string | null
          metadata: Json | null
          outreach_type: string
          updated_at: string
        }
        Insert: {
          admin_edited?: boolean
          client_user_id: string
          compliance_flag_count?: number
          compliance_flags?: Json | null
          compliance_status?: string
          created_at?: string
          created_by: string
          downloaded_at?: string | null
          edited_content?: string | null
          funding_product?: string | null
          generated_content: string
          id?: string
          lender_name?: string | null
          metadata?: Json | null
          outreach_type: string
          updated_at?: string
        }
        Update: {
          admin_edited?: boolean
          client_user_id?: string
          compliance_flag_count?: number
          compliance_flags?: Json | null
          compliance_status?: string
          created_at?: string
          created_by?: string
          downloaded_at?: string | null
          edited_content?: string | null
          funding_product?: string | null
          generated_content?: string
          id?: string
          lender_name?: string | null
          metadata?: Json | null
          outreach_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      paige_admin_notifications: {
        Row: {
          assigned_role: string | null
          assigned_user_id: string | null
          body: string | null
          contact_id: string | null
          created_at: string
          id: string
          link_to: string | null
          read_at: string | null
          scope: string
          severity: string
          source_workflow_key: string | null
          title: string
        }
        Insert: {
          assigned_role?: string | null
          assigned_user_id?: string | null
          body?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          link_to?: string | null
          read_at?: string | null
          scope?: string
          severity?: string
          source_workflow_key?: string | null
          title: string
        }
        Update: {
          assigned_role?: string | null
          assigned_user_id?: string | null
          body?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          link_to?: string | null
          read_at?: string | null
          scope?: string
          severity?: string
          source_workflow_key?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_admin_notifications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_admin_notifications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_admin_notifications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_admin_notifications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_approval_comments: {
        Row: {
          approval_id: string
          author_id: string
          body: string
          created_at: string
          id: string
        }
        Insert: {
          approval_id: string
          author_id: string
          body: string
          created_at?: string
          id?: string
        }
        Update: {
          approval_id?: string
          author_id?: string
          body?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_approval_comments_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "paige_approval_queue_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_approval_comments_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "paige_pending_approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_approval_policies: {
        Row: {
          active: boolean | null
          auto_assign_role: Database["public"]["Enums"]["app_role"] | null
          auto_assign_user_id: string | null
          category: string
          created_at: string | null
          id: string
          match_predicate: Json | null
          priority: number | null
          requires_role: Database["public"]["Enums"]["app_role"] | null
          risk_level: string | null
          sla_minutes: number | null
          tenant_id: string | null
          updated_at: string | null
          visible_to_roles: Database["public"]["Enums"]["app_role"][] | null
        }
        Insert: {
          active?: boolean | null
          auto_assign_role?: Database["public"]["Enums"]["app_role"] | null
          auto_assign_user_id?: string | null
          category: string
          created_at?: string | null
          id?: string
          match_predicate?: Json | null
          priority?: number | null
          requires_role?: Database["public"]["Enums"]["app_role"] | null
          risk_level?: string | null
          sla_minutes?: number | null
          tenant_id?: string | null
          updated_at?: string | null
          visible_to_roles?: Database["public"]["Enums"]["app_role"][] | null
        }
        Update: {
          active?: boolean | null
          auto_assign_role?: Database["public"]["Enums"]["app_role"] | null
          auto_assign_user_id?: string | null
          category?: string
          created_at?: string | null
          id?: string
          match_predicate?: Json | null
          priority?: number | null
          requires_role?: Database["public"]["Enums"]["app_role"] | null
          risk_level?: string | null
          sla_minutes?: number | null
          tenant_id?: string | null
          updated_at?: string | null
          visible_to_roles?: Database["public"]["Enums"]["app_role"][] | null
        }
        Relationships: []
      }
      paige_assignment_policy: {
        Row: {
          eligible_user_ids: string[]
          strategy: string
          target_role: string
          tier: string
          updated_at: string
        }
        Insert: {
          eligible_user_ids?: string[]
          strategy?: string
          target_role?: string
          tier: string
          updated_at?: string
        }
        Update: {
          eligible_user_ids?: string[]
          strategy?: string
          target_role?: string
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      paige_audit_log: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          payload: Json
          target_id: string | null
          target_type: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          target_id?: string | null
          target_type?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          payload?: Json
          target_id?: string | null
          target_type?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_bank_connections: {
        Row: {
          accounts: Json
          connected_at: string
          contact_id: string
          created_at: string
          id: string
          institution_name: string | null
          last_synced_at: string | null
          plaid_access_token_encrypted: string | null
          plaid_item_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accounts?: Json
          connected_at?: string
          contact_id: string
          created_at?: string
          id?: string
          institution_name?: string | null
          last_synced_at?: string | null
          plaid_access_token_encrypted?: string | null
          plaid_item_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accounts?: Json
          connected_at?: string
          contact_id?: string
          created_at?: string
          id?: string
          institution_name?: string | null
          last_synced_at?: string | null
          plaid_access_token_encrypted?: string | null
          plaid_item_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_bank_connections_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_bank_connections_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_bank_connections_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_bank_connections_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_bank_transactions: {
        Row: {
          account_id: string | null
          amount_cents: number
          bank_connection_id: string
          category: Json | null
          created_at: string
          date: string
          id: string
          name: string | null
          pending: boolean
          plaid_transaction_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount_cents: number
          bank_connection_id: string
          category?: Json | null
          created_at?: string
          date: string
          id?: string
          name?: string | null
          pending?: boolean
          plaid_transaction_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount_cents?: number
          bank_connection_id?: string
          category?: Json | null
          created_at?: string
          date?: string
          id?: string
          name?: string | null
          pending?: boolean
          plaid_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_bank_transactions_bank_connection_id_fkey"
            columns: ["bank_connection_id"]
            isOneToOne: false
            referencedRelation: "paige_bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_bookings: {
        Row: {
          attendee_email: string | null
          attendee_name: string | null
          attendee_responses: Json
          cal_event_id: string
          cal_event_type_id: string | null
          contact_id: string | null
          created_at: string
          duration_min: number | null
          event_type: Database["public"]["Enums"]["paige_booking_event_type"]
          id: string
          metadata: Json
          scheduled_at: string
          status: Database["public"]["Enums"]["paige_booking_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          attendee_email?: string | null
          attendee_name?: string | null
          attendee_responses?: Json
          cal_event_id: string
          cal_event_type_id?: string | null
          contact_id?: string | null
          created_at?: string
          duration_min?: number | null
          event_type?: Database["public"]["Enums"]["paige_booking_event_type"]
          id?: string
          metadata?: Json
          scheduled_at: string
          status?: Database["public"]["Enums"]["paige_booking_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          attendee_email?: string | null
          attendee_name?: string | null
          attendee_responses?: Json
          cal_event_id?: string
          cal_event_type_id?: string | null
          contact_id?: string | null
          created_at?: string
          duration_min?: number | null
          event_type?: Database["public"]["Enums"]["paige_booking_event_type"]
          id?: string
          metadata?: Json
          scheduled_at?: string
          status?: Database["public"]["Enums"]["paige_booking_status"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_bridge_auth_failures: {
        Row: {
          alerted_at: string | null
          function_name: string
          id: string
          ip: string | null
          occurred_at: string
          reason: string | null
          status: number
          user_agent: string | null
          verb: string | null
        }
        Insert: {
          alerted_at?: string | null
          function_name: string
          id?: string
          ip?: string | null
          occurred_at?: string
          reason?: string | null
          status: number
          user_agent?: string | null
          verb?: string | null
        }
        Update: {
          alerted_at?: string | null
          function_name?: string
          id?: string
          ip?: string | null
          occurred_at?: string
          reason?: string | null
          status?: number
          user_agent?: string | null
          verb?: string | null
        }
        Relationships: []
      }
      paige_btf_documents: {
        Row: {
          category: string
          client_id: string
          id: string
          mime: string | null
          original_filename: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          category: string
          client_id: string
          id?: string
          mime?: string | null
          original_filename?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          client_id?: string
          id?: string
          mime?: string | null
          original_filename?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_btf_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_btf_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_btf_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_btf_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_business_credit_profiles: {
        Row: {
          business_name: string | null
          contact_id: string
          created_at: string
          ein: string | null
          history: Json
          id: string
          last_pulled_at: string | null
          nav_profile_id: string | null
          scores: Json
          trade_lines: Json
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          contact_id: string
          created_at?: string
          ein?: string | null
          history?: Json
          id?: string
          last_pulled_at?: string | null
          nav_profile_id?: string | null
          scores?: Json
          trade_lines?: Json
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          contact_id?: string
          created_at?: string
          ein?: string | null
          history?: Json
          id?: string
          last_pulled_at?: string | null
          nav_profile_id?: string | null
          scores?: Json
          trade_lines?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_business_credit_profiles_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_business_credit_profiles_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_business_credit_profiles_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_business_credit_profiles_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_cash_flow_snapshots: {
        Row: {
          avg_daily_balance_cents: number
          contact_id: string
          created_at: string
          funding_readiness_score: number | null
          generated_at: string
          id: string
          period_end: string
          period_start: string
          runway_days: number | null
          total_deposits_cents: number
          total_withdrawals_cents: number
        }
        Insert: {
          avg_daily_balance_cents?: number
          contact_id: string
          created_at?: string
          funding_readiness_score?: number | null
          generated_at?: string
          id?: string
          period_end: string
          period_start: string
          runway_days?: number | null
          total_deposits_cents?: number
          total_withdrawals_cents?: number
        }
        Update: {
          avg_daily_balance_cents?: number
          contact_id?: string
          created_at?: string
          funding_readiness_score?: number | null
          generated_at?: string
          id?: string
          period_end?: string
          period_start?: string
          runway_days?: number | null
          total_deposits_cents?: number
          total_withdrawals_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "paige_cash_flow_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_cash_flow_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_cash_flow_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_cash_flow_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_client_intake_submissions: {
        Row: {
          client_id: string
          created_at: string
          id: string
          payload: Json
          section: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          payload?: Json
          section: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          payload?: Json
          section?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_client_intake_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_client_intake_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_client_intake_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_client_intake_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_coach_assignments: {
        Row: {
          active: boolean
          assigned_at: string
          assigned_role: string | null
          coach_id: string | null
          contact_id: string | null
          created_at: string
          id: string
          metadata: Json
          notes: string | null
          rep_user_id: string | null
          role: string | null
          tenant_id: string | null
          unassigned_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          assigned_at?: string
          assigned_role?: string | null
          coach_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          rep_user_id?: string | null
          role?: string | null
          tenant_id?: string | null
          unassigned_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          assigned_at?: string
          assigned_role?: string | null
          coach_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          rep_user_id?: string | null
          role?: string | null
          tenant_id?: string | null
          unassigned_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_coach_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_coach_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_coach_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_coach_assignments_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_coach_assignments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_coach_assignments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_coach_assignments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_coach_assignments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_coach_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_config: {
        Row: {
          apollo_auto_enrich: boolean
          cal_default_event_type_id: string | null
          cal_event_type_map: Json
          created_at: string
          default_from_email: string | null
          default_from_sms_number: string | null
          docusign_default_brand_id: string | null
          docusign_enabled: boolean
          docusign_templates: Json
          ghl_fallback_enabled: boolean
          ghl_location_id: string | null
          ghl_pit_ref: string | null
          gmail_default_sender: string | null
          id: number
          langsmith_project: string | null
          meta_ads_features_enabled: boolean
          meta_capi_access_token: string | null
          meta_capi_test_event_code: string | null
          meta_default_page_id: string | null
          meta_pixel_id: string | null
          meta_pixel_tracked_paths: Json
          nav_partner_id: string | null
          nav_threshold_delta: number | null
          plaid_activated: boolean | null
          plaid_env: string | null
          posthog_project_url: string | null
          resend_domain_verified: boolean
          sentry_org_slug: string | null
          sentry_project_slug: string | null
          smartcredit_enabled: boolean | null
          stripe_price_tier_map: Json | null
          telegram_command_surface_enabled: boolean
          twilio_a2p_status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          apollo_auto_enrich?: boolean
          cal_default_event_type_id?: string | null
          cal_event_type_map?: Json
          created_at?: string
          default_from_email?: string | null
          default_from_sms_number?: string | null
          docusign_default_brand_id?: string | null
          docusign_enabled?: boolean
          docusign_templates?: Json
          ghl_fallback_enabled?: boolean
          ghl_location_id?: string | null
          ghl_pit_ref?: string | null
          gmail_default_sender?: string | null
          id?: number
          langsmith_project?: string | null
          meta_ads_features_enabled?: boolean
          meta_capi_access_token?: string | null
          meta_capi_test_event_code?: string | null
          meta_default_page_id?: string | null
          meta_pixel_id?: string | null
          meta_pixel_tracked_paths?: Json
          nav_partner_id?: string | null
          nav_threshold_delta?: number | null
          plaid_activated?: boolean | null
          plaid_env?: string | null
          posthog_project_url?: string | null
          resend_domain_verified?: boolean
          sentry_org_slug?: string | null
          sentry_project_slug?: string | null
          smartcredit_enabled?: boolean | null
          stripe_price_tier_map?: Json | null
          telegram_command_surface_enabled?: boolean
          twilio_a2p_status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          apollo_auto_enrich?: boolean
          cal_default_event_type_id?: string | null
          cal_event_type_map?: Json
          created_at?: string
          default_from_email?: string | null
          default_from_sms_number?: string | null
          docusign_default_brand_id?: string | null
          docusign_enabled?: boolean
          docusign_templates?: Json
          ghl_fallback_enabled?: boolean
          ghl_location_id?: string | null
          ghl_pit_ref?: string | null
          gmail_default_sender?: string | null
          id?: number
          langsmith_project?: string | null
          meta_ads_features_enabled?: boolean
          meta_capi_access_token?: string | null
          meta_capi_test_event_code?: string | null
          meta_default_page_id?: string | null
          meta_pixel_id?: string | null
          meta_pixel_tracked_paths?: Json
          nav_partner_id?: string | null
          nav_threshold_delta?: number | null
          plaid_activated?: boolean | null
          plaid_env?: string | null
          posthog_project_url?: string | null
          resend_domain_verified?: boolean
          sentry_org_slug?: string | null
          sentry_project_slug?: string | null
          smartcredit_enabled?: boolean | null
          stripe_price_tier_map?: Json | null
          telegram_command_surface_enabled?: boolean
          twilio_a2p_status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      paige_conversations: {
        Row: {
          body: string
          channel: string
          contact_id: string | null
          created_at: string
          direction: string
          id: string
          metadata: Json
          source_message_id: string | null
          status: string
          subject: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          body: string
          channel: string
          contact_id?: string | null
          created_at?: string
          direction: string
          id?: string
          metadata?: Json
          source_message_id?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          contact_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          metadata?: Json
          source_message_id?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_enrichment_log: {
        Row: {
          contact_id: string | null
          created_at: string
          error: string | null
          id: string
          payload: Json
          provider: string
          subject_key: string
          subject_type: Database["public"]["Enums"]["paige_enrichment_subject_type"]
          succeeded: boolean
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          provider?: string
          subject_key: string
          subject_type: Database["public"]["Enums"]["paige_enrichment_subject_type"]
          succeeded?: boolean
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          provider?: string
          subject_key?: string
          subject_type?: Database["public"]["Enums"]["paige_enrichment_subject_type"]
          succeeded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "paige_enrichment_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_enrichment_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_enrichment_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_enrichment_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_health_snapshots: {
        Row: {
          components: Json
          computed_at: string
          contact_id: string | null
          created_at: string
          id: string
          metadata: Json
          score: number
        }
        Insert: {
          components?: Json
          computed_at?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          score: number
        }
        Update: {
          components?: Json
          computed_at?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "paige_health_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_health_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_health_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_health_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_ingestion_proposals: {
        Row: {
          actor_label: string | null
          actor_role: string
          actor_user_id: string | null
          applied_row_ids: Json | null
          client_id: string | null
          confidence: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          diff: Json
          expires_at: string
          external_llm_model: string | null
          id: string
          payload: Json
          review_reason: string | null
          source: string
          status: string
          target_table: string | null
          tenant_id: string | null
          tool_name: string
        }
        Insert: {
          actor_label?: string | null
          actor_role?: string
          actor_user_id?: string | null
          applied_row_ids?: Json | null
          client_id?: string | null
          confidence?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          diff?: Json
          expires_at?: string
          external_llm_model?: string | null
          id?: string
          payload?: Json
          review_reason?: string | null
          source?: string
          status?: string
          target_table?: string | null
          tenant_id?: string | null
          tool_name: string
        }
        Update: {
          actor_label?: string | null
          actor_role?: string
          actor_user_id?: string | null
          applied_row_ids?: Json | null
          client_id?: string | null
          confidence?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          diff?: Json
          expires_at?: string
          external_llm_model?: string | null
          id?: string
          payload?: Json
          review_reason?: string | null
          source?: string
          status?: string
          target_table?: string | null
          tenant_id?: string | null
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_ingestion_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_ingestion_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_ingestion_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_ingestion_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_invoices: {
        Row: {
          amount_total_cents: number
          contact_id: string
          created_at: string
          created_by: string | null
          currency: string
          deal_id: string | null
          due_date: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_number: string
          line_items: Json
          memo: string | null
          paid_at: string | null
          payment_plan_key: string | null
          sent_at: string | null
          sent_to_email: string | null
          status: string
          stripe_invoice_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_total_cents: number
          contact_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_id?: string | null
          due_date?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_number: string
          line_items?: Json
          memo?: string | null
          paid_at?: string | null
          payment_plan_key?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          status?: string
          stripe_invoice_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_total_cents?: number
          contact_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_id?: string | null
          due_date?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_number?: string
          line_items?: Json
          memo?: string | null
          paid_at?: string | null
          payment_plan_key?: string | null
          sent_at?: string | null
          sent_to_email?: string | null
          status?: string
          stripe_invoice_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_invoices_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_journey_stage_transitions: {
        Row: {
          contact_id: string
          from_stage_id: number | null
          id: string
          metadata: Json
          source_event: string | null
          to_stage_id: number
          transitioned_at: string
          transitioned_by: string | null
        }
        Insert: {
          contact_id: string
          from_stage_id?: number | null
          id?: string
          metadata?: Json
          source_event?: string | null
          to_stage_id: number
          transitioned_at?: string
          transitioned_by?: string | null
        }
        Update: {
          contact_id?: string
          from_stage_id?: number | null
          id?: string
          metadata?: Json
          source_event?: string | null
          to_stage_id?: number
          transitioned_at?: string
          transitioned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_journey_stage_transitions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_journey_stage_transitions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_journey_stage_transitions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_journey_stage_transitions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_journey_stage_transitions_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "paige_journey_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_journey_stage_transitions_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "paige_journey_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_journey_stages: {
        Row: {
          color_hex: string | null
          created_at: string
          description: string | null
          display_order: number
          id: number
          label: string
          slug: string
        }
        Insert: {
          color_hex?: string | null
          created_at?: string
          description?: string | null
          display_order: number
          id: number
          label: string
          slug: string
        }
        Update: {
          color_hex?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: number
          label?: string
          slug?: string
        }
        Relationships: []
      }
      paige_mcp_connections: {
        Row: {
          auth_token_last4: string | null
          auth_token_ref: string | null
          created_at: string
          enabled: boolean
          id: string
          label: string
          last_probed_at: string | null
          server_url: string
          tools_cache: Json | null
          transport: string
          updated_at: string
        }
        Insert: {
          auth_token_last4?: string | null
          auth_token_ref?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          label: string
          last_probed_at?: string | null
          server_url: string
          tools_cache?: Json | null
          transport?: string
          updated_at?: string
        }
        Update: {
          auth_token_last4?: string | null
          auth_token_ref?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          last_probed_at?: string | null
          server_url?: string
          tools_cache?: Json | null
          transport?: string
          updated_at?: string
        }
        Relationships: []
      }
      paige_mcp_oauth_clients: {
        Row: {
          client_id: string
          client_name: string
          client_uri: string | null
          created_at: string
          created_by_user_id: string | null
          grant_types: string[]
          redirect_uris: string[]
          response_types: string[]
          scope: string
          token_endpoint_auth_method: string
          updated_at: string
        }
        Insert: {
          client_id: string
          client_name: string
          client_uri?: string | null
          created_at?: string
          created_by_user_id?: string | null
          grant_types?: string[]
          redirect_uris: string[]
          response_types?: string[]
          scope?: string
          token_endpoint_auth_method?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_name?: string
          client_uri?: string | null
          created_at?: string
          created_by_user_id?: string | null
          grant_types?: string[]
          redirect_uris?: string[]
          response_types?: string[]
          scope?: string
          token_endpoint_auth_method?: string
          updated_at?: string
        }
        Relationships: []
      }
      paige_mcp_oauth_codes: {
        Row: {
          client_id: string
          code_challenge: string
          code_challenge_method: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          redirect_uri: string
          scopes: string[]
          user_id: string
        }
        Insert: {
          client_id: string
          code_challenge: string
          code_challenge_method?: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          redirect_uri: string
          scopes: string[]
          user_id: string
        }
        Update: {
          client_id?: string
          code_challenge?: string
          code_challenge_method?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          redirect_uri?: string
          scopes?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_mcp_oauth_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_mcp_oauth_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      paige_mcp_oauth_tokens: {
        Row: {
          access_expires_at: string
          access_token_hash: string
          client_id: string
          client_name_cache: string | null
          created_at: string
          id: string
          last_used_at: string | null
          refresh_expires_at: string | null
          refresh_token_hash: string | null
          revoked_at: string | null
          scopes: string[]
          user_id: string
        }
        Insert: {
          access_expires_at: string
          access_token_hash: string
          client_id: string
          client_name_cache?: string | null
          created_at?: string
          id?: string
          last_used_at?: string | null
          refresh_expires_at?: string | null
          refresh_token_hash?: string | null
          revoked_at?: string | null
          scopes: string[]
          user_id: string
        }
        Update: {
          access_expires_at?: string
          access_token_hash?: string
          client_id?: string
          client_name_cache?: string | null
          created_at?: string
          id?: string
          last_used_at?: string | null
          refresh_expires_at?: string | null
          refresh_token_hash?: string | null
          revoked_at?: string | null
          scopes?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_mcp_oauth_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_mcp_oauth_clients"
            referencedColumns: ["client_id"]
          },
        ]
      }
      paige_messages_audit: {
        Row: {
          body: string | null
          channel: string
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          error: string | null
          from_address: string | null
          id: string
          pipe_used: string
          sent_at: string | null
          status: string
          subject: string | null
          to_address: string
          updated_at: string
          vendor_message_id: string | null
        }
        Insert: {
          body?: string | null
          channel: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          from_address?: string | null
          id?: string
          pipe_used: string
          sent_at?: string | null
          status: string
          subject?: string | null
          to_address: string
          updated_at?: string
          vendor_message_id?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          from_address?: string | null
          id?: string
          pipe_used?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_address?: string
          updated_at?: string
          vendor_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_messages_audit_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_messages_audit_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_messages_audit_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_messages_audit_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_messages_audit_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "paige_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_n8n_connections: {
        Row: {
          api_key_last4: string | null
          api_key_ref: string | null
          base_url: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          last_sync_at: string | null
          updated_at: string
          workflows_cache: Json | null
        }
        Insert: {
          api_key_last4?: string | null
          api_key_ref?: string | null
          base_url: string
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          last_sync_at?: string | null
          updated_at?: string
          workflows_cache?: Json | null
        }
        Update: {
          api_key_last4?: string | null
          api_key_ref?: string | null
          base_url?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          last_sync_at?: string | null
          updated_at?: string
          workflows_cache?: Json | null
        }
        Relationships: []
      }
      paige_nps_responses: {
        Row: {
          campaign_or_survey: string | null
          contact_id: string | null
          created_at: string
          feedback: string | null
          follow_up_status: string
          id: string
          metadata: Json
          score: number
          submitted_at: string
          updated_at: string
        }
        Insert: {
          campaign_or_survey?: string | null
          contact_id?: string | null
          created_at?: string
          feedback?: string | null
          follow_up_status?: string
          id?: string
          metadata?: Json
          score: number
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          campaign_or_survey?: string | null
          contact_id?: string | null
          created_at?: string
          feedback?: string | null
          follow_up_status?: string
          id?: string
          metadata?: Json
          score?: number
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_nps_responses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_nps_responses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_nps_responses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_nps_responses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_owner_credit_snapshots: {
        Row: {
          alerts_triggered: Json
          bureau: Database["public"]["Enums"]["owner_credit_bureau"]
          contact_id: string
          created_at: string
          factors: Json
          id: string
          pulled_at: string
          score: number | null
        }
        Insert: {
          alerts_triggered?: Json
          bureau: Database["public"]["Enums"]["owner_credit_bureau"]
          contact_id: string
          created_at?: string
          factors?: Json
          id?: string
          pulled_at?: string
          score?: number | null
        }
        Update: {
          alerts_triggered?: Json
          bureau?: Database["public"]["Enums"]["owner_credit_bureau"]
          contact_id?: string
          created_at?: string
          factors?: Json
          id?: string
          pulled_at?: string
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_owner_credit_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_owner_credit_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_owner_credit_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_owner_credit_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_payment_authorizations: {
        Row: {
          authorized_at: string
          client_id: string
          created_at: string
          id: string
          ip: unknown
          plan_selected: string
          recurring_auth_text_snapshot: string | null
          status: string
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          stripe_subscription_id: string | null
          user_agent: string | null
        }
        Insert: {
          authorized_at?: string
          client_id: string
          created_at?: string
          id?: string
          ip?: unknown
          plan_selected: string
          recurring_auth_text_snapshot?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_subscription_id?: string | null
          user_agent?: string | null
        }
        Update: {
          authorized_at?: string
          client_id?: string
          created_at?: string
          id?: string
          ip?: unknown
          plan_selected?: string
          recurring_auth_text_snapshot?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_subscription_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_payment_authorizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_payment_authorizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_payment_authorizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_payment_authorizations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_pending_approvals: {
        Row: {
          assigned_to_user_id: string | null
          category: string | null
          claimed_at: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          created_by_n8n_workflow_key: string | null
          decision_rationale: string | null
          draft_content: Json
          escalation_note: string | null
          id: string
          metadata: Json
          priority: number | null
          requires_role: Database["public"]["Enums"]["app_role"] | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          risk_level: string | null
          sent_at: string | null
          sent_message_audit_id: string | null
          sla_due_at: string | null
          source: string | null
          status: string
          submitted_by_user_id: string | null
          summary: string | null
          tenant_id: string | null
          type: string
          updated_at: string
          visible_to_roles: string[]
        }
        Insert: {
          assigned_to_user_id?: string | null
          category?: string | null
          claimed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by_n8n_workflow_key?: string | null
          decision_rationale?: string | null
          draft_content: Json
          escalation_note?: string | null
          id?: string
          metadata?: Json
          priority?: number | null
          requires_role?: Database["public"]["Enums"]["app_role"] | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          risk_level?: string | null
          sent_at?: string | null
          sent_message_audit_id?: string | null
          sla_due_at?: string | null
          source?: string | null
          status?: string
          submitted_by_user_id?: string | null
          summary?: string | null
          tenant_id?: string | null
          type: string
          updated_at?: string
          visible_to_roles?: string[]
        }
        Update: {
          assigned_to_user_id?: string | null
          category?: string | null
          claimed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by_n8n_workflow_key?: string | null
          decision_rationale?: string | null
          draft_content?: Json
          escalation_note?: string | null
          id?: string
          metadata?: Json
          priority?: number | null
          requires_role?: Database["public"]["Enums"]["app_role"] | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          risk_level?: string | null
          sent_at?: string | null
          sent_message_audit_id?: string | null
          sla_due_at?: string | null
          source?: string | null
          status?: string
          submitted_by_user_id?: string | null
          summary?: string | null
          tenant_id?: string | null
          type?: string
          updated_at?: string
          visible_to_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "paige_pending_approvals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_pending_approvals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_pending_approvals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_pending_approvals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_pending_approvals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "paige_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_pending_approvals_sent_message_audit_id_fkey"
            columns: ["sent_message_audit_id"]
            isOneToOne: false
            referencedRelation: "paige_messages_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_pending_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_referrals: {
        Row: {
          conversion_event: string | null
          created_at: string
          credit_amount_cents: number | null
          credited_at: string | null
          id: string
          metadata: Json
          referred_at: string
          referred_contact_id: string | null
          referred_email: string | null
          referrer_contact_id: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          conversion_event?: string | null
          created_at?: string
          credit_amount_cents?: number | null
          credited_at?: string | null
          id?: string
          metadata?: Json
          referred_at?: string
          referred_contact_id?: string | null
          referred_email?: string | null
          referrer_contact_id?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          conversion_event?: string | null
          created_at?: string
          credit_amount_cents?: number | null
          credited_at?: string | null
          id?: string
          metadata?: Json
          referred_at?: string
          referred_contact_id?: string | null
          referred_email?: string | null
          referrer_contact_id?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_referrals_referred_contact_id_fkey"
            columns: ["referred_contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_referrals_referred_contact_id_fkey"
            columns: ["referred_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_referrals_referred_contact_id_fkey"
            columns: ["referred_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_referrals_referred_contact_id_fkey"
            columns: ["referred_contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_referrals_referrer_contact_id_fkey"
            columns: ["referrer_contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_referrals_referrer_contact_id_fkey"
            columns: ["referrer_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_referrals_referrer_contact_id_fkey"
            columns: ["referrer_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_referrals_referrer_contact_id_fkey"
            columns: ["referrer_contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_signature_envelopes: {
        Row: {
          completed_pdf_url: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          envelope_id: string
          envelope_type: Database["public"]["Enums"]["paige_envelope_type"]
          id: string
          metadata: Json
          sent_at: string
          signed_at: string | null
          status: Database["public"]["Enums"]["paige_envelope_status"]
          template_id: string | null
          updated_at: string
        }
        Insert: {
          completed_pdf_url?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          envelope_id: string
          envelope_type?: Database["public"]["Enums"]["paige_envelope_type"]
          id?: string
          metadata?: Json
          sent_at?: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["paige_envelope_status"]
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_pdf_url?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          envelope_id?: string
          envelope_type?: Database["public"]["Enums"]["paige_envelope_type"]
          id?: string
          metadata?: Json
          sent_at?: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["paige_envelope_status"]
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_signature_envelopes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_signature_envelopes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_signature_envelopes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_signature_envelopes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_signed_agreements: {
        Row: {
          agreement_template_key: string
          agreement_text_snapshot: string
          agreement_version: string
          client_id: string
          created_at: string
          id: string
          ip: unknown
          signature_data: Json
          signed_at: string
          signed_pdf_path: string | null
          user_agent: string | null
        }
        Insert: {
          agreement_template_key: string
          agreement_text_snapshot: string
          agreement_version: string
          client_id: string
          created_at?: string
          id?: string
          ip?: unknown
          signature_data?: Json
          signed_at?: string
          signed_pdf_path?: string | null
          user_agent?: string | null
        }
        Update: {
          agreement_template_key?: string
          agreement_text_snapshot?: string
          agreement_version?: string
          client_id?: string
          created_at?: string
          id?: string
          ip?: unknown
          signature_data?: Json
          signed_at?: string
          signed_pdf_path?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_signed_agreements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_signed_agreements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_signed_agreements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_signed_agreements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_skill_proposals: {
        Row: {
          allowed_tools: string[]
          category: string
          created_at: string
          decided_at: string | null
          description: string | null
          id: string
          input_schema: Json
          proposed_name: string
          proposed_slug: string
          published_skill_id: string | null
          rationale: string | null
          reviewer_notes: string | null
          reviewer_user_id: string | null
          risk_level: string
          source_pattern: Json
          status: string
          steps: Json
          trigger_phrases: string[]
        }
        Insert: {
          allowed_tools?: string[]
          category?: string
          created_at?: string
          decided_at?: string | null
          description?: string | null
          id?: string
          input_schema?: Json
          proposed_name: string
          proposed_slug: string
          published_skill_id?: string | null
          rationale?: string | null
          reviewer_notes?: string | null
          reviewer_user_id?: string | null
          risk_level?: string
          source_pattern?: Json
          status?: string
          steps?: Json
          trigger_phrases?: string[]
        }
        Update: {
          allowed_tools?: string[]
          category?: string
          created_at?: string
          decided_at?: string | null
          description?: string | null
          id?: string
          input_schema?: Json
          proposed_name?: string
          proposed_slug?: string
          published_skill_id?: string | null
          rationale?: string | null
          reviewer_notes?: string | null
          reviewer_user_id?: string | null
          risk_level?: string
          source_pattern?: Json
          status?: string
          steps?: Json
          trigger_phrases?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "paige_skill_proposals_published_skill_id_fkey"
            columns: ["published_skill_id"]
            isOneToOne: false
            referencedRelation: "paige_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_skill_runs: {
        Row: {
          completed_at: string | null
          contact_id: string | null
          cost_cents: number
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          inputs: Json
          invoker_kind: string
          invoker_user_id: string | null
          outputs: Json
          skill_id: string
          skill_slug: string
          status: string
          steps_log: Json
        }
        Insert: {
          completed_at?: string | null
          contact_id?: string | null
          cost_cents?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          inputs?: Json
          invoker_kind?: string
          invoker_user_id?: string | null
          outputs?: Json
          skill_id: string
          skill_slug: string
          status?: string
          steps_log?: Json
        }
        Update: {
          completed_at?: string | null
          contact_id?: string | null
          cost_cents?: number
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          inputs?: Json
          invoker_kind?: string
          invoker_user_id?: string | null
          outputs?: Json
          skill_id?: string
          skill_slug?: string
          status?: string
          steps_log?: Json
        }
        Relationships: [
          {
            foreignKeyName: "paige_skill_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_skill_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_skill_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_skill_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_skill_runs_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "paige_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_skills: {
        Row: {
          allowed_tools: string[]
          category: string
          cost_estimate_cents: number
          created_at: string
          created_by: string
          created_by_user_id: string | null
          description: string | null
          external_send: boolean | null
          id: string
          input_schema: Json
          metadata: Json
          mutating: boolean | null
          name: string
          require_admin_confirm_first_n: number
          risk_level: string
          run_count: number
          slug: string
          status: string
          steps: Json
          success_count: number
          trigger_phrases: string[]
          updated_at: string
          version: number
        }
        Insert: {
          allowed_tools?: string[]
          category?: string
          cost_estimate_cents?: number
          created_at?: string
          created_by?: string
          created_by_user_id?: string | null
          description?: string | null
          external_send?: boolean | null
          id?: string
          input_schema?: Json
          metadata?: Json
          mutating?: boolean | null
          name: string
          require_admin_confirm_first_n?: number
          risk_level?: string
          run_count?: number
          slug: string
          status?: string
          steps?: Json
          success_count?: number
          trigger_phrases?: string[]
          updated_at?: string
          version?: number
        }
        Update: {
          allowed_tools?: string[]
          category?: string
          cost_estimate_cents?: number
          created_at?: string
          created_by?: string
          created_by_user_id?: string | null
          description?: string | null
          external_send?: boolean | null
          id?: string
          input_schema?: Json
          metadata?: Json
          mutating?: boolean | null
          name?: string
          require_admin_confirm_first_n?: number
          risk_level?: string
          run_count?: number
          slug?: string
          status?: string
          steps?: Json
          success_count?: number
          trigger_phrases?: string[]
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      paige_sla_alert_log: {
        Row: {
          category: string
          client_id: string | null
          hours_unassigned: number | null
          id: string
          metadata: Json
          sent_at: string
          severity: string
        }
        Insert: {
          category: string
          client_id?: string | null
          hours_unassigned?: number | null
          id?: string
          metadata?: Json
          sent_at?: string
          severity: string
        }
        Update: {
          category?: string
          client_id?: string | null
          hours_unassigned?: number | null
          id?: string
          metadata?: Json
          sent_at?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_sla_alert_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_sla_alert_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_sla_alert_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_sla_alert_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_social_posts: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          id: string
          media_urls: Json
          metrics: Json
          platform: Database["public"]["Enums"]["paige_social_platform"]
          platform_post_id: string | null
          posted_at: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["paige_social_post_status"]
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          media_urls?: Json
          metrics?: Json
          platform: Database["public"]["Enums"]["paige_social_platform"]
          platform_post_id?: string | null
          posted_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["paige_social_post_status"]
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          media_urls?: Json
          metrics?: Json
          platform?: Database["public"]["Enums"]["paige_social_platform"]
          platform_post_id?: string | null
          posted_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["paige_social_post_status"]
          updated_at?: string
        }
        Relationships: []
      }
      paige_subagent_factory_quota: {
        Row: {
          created_at: string
          hard_shipped: number
          id: string
          proposals_count: number
          quota_date: string
          soft_shipped: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hard_shipped?: number
          id?: string
          proposals_count?: number
          quota_date?: string
          soft_shipped?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hard_shipped?: number
          id?: string
          proposals_count?: number
          quota_date?: string
          soft_shipped?: number
          updated_at?: string
        }
        Relationships: []
      }
      paige_subagent_invocations: {
        Row: {
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          error: string | null
          id: string
          input: Json | null
          invoked_by: string | null
          langgraph_run_id: string | null
          latency_ms: number | null
          output: Json | null
          status: string
          subagent_slug: string
        }
        Insert: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          invoked_by?: string | null
          langgraph_run_id?: string | null
          latency_ms?: number | null
          output?: Json | null
          status?: string
          subagent_slug: string
        }
        Update: {
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          invoked_by?: string | null
          langgraph_run_id?: string | null
          latency_ms?: number | null
          output?: Json | null
          status?: string
          subagent_slug?: string
        }
        Relationships: []
      }
      paige_subagent_proposals: {
        Row: {
          approval_id: string | null
          config: Json
          created_at: string
          data_scopes: string[]
          description: string
          domain: string
          error: string | null
          id: string
          input_schema: Json
          output_schema: Json
          proposed_by: string | null
          proposed_by_agent: string | null
          proposed_name: string
          proposed_slug: string
          rationale: string
          resulting_subagent_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          runtime: string
          status: string
          system_prompt: string
          triggers: string[]
          updated_at: string
        }
        Insert: {
          approval_id?: string | null
          config?: Json
          created_at?: string
          data_scopes?: string[]
          description: string
          domain: string
          error?: string | null
          id?: string
          input_schema?: Json
          output_schema?: Json
          proposed_by?: string | null
          proposed_by_agent?: string | null
          proposed_name: string
          proposed_slug: string
          rationale: string
          resulting_subagent_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          runtime: string
          status?: string
          system_prompt: string
          triggers?: string[]
          updated_at?: string
        }
        Update: {
          approval_id?: string | null
          config?: Json
          created_at?: string
          data_scopes?: string[]
          description?: string
          domain?: string
          error?: string | null
          id?: string
          input_schema?: Json
          output_schema?: Json
          proposed_by?: string | null
          proposed_by_agent?: string | null
          proposed_name?: string
          proposed_slug?: string
          rationale?: string
          resulting_subagent_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          runtime?: string
          status?: string
          system_prompt?: string
          triggers?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_subagent_proposals_resulting_subagent_id_fkey"
            columns: ["resulting_subagent_id"]
            isOneToOne: false
            referencedRelation: "paige_subagents"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_subagents: {
        Row: {
          auto_disabled_reason: string | null
          auto_generated: boolean
          config: Json
          created_at: string
          created_by: string | null
          daily_invocation_cap: number | null
          description: string
          display_order: number
          domain: string
          edge_function: string | null
          enabled: boolean
          id: string
          input_schema: Json
          langgraph_graph: string | null
          monthly_token_cap: number | null
          name: string
          output_schema: Json
          requires_role: string[]
          runtime: string
          slug: string
          system_prompt: string | null
          triggers: string[]
          updated_at: string
        }
        Insert: {
          auto_disabled_reason?: string | null
          auto_generated?: boolean
          config?: Json
          created_at?: string
          created_by?: string | null
          daily_invocation_cap?: number | null
          description: string
          display_order?: number
          domain: string
          edge_function?: string | null
          enabled?: boolean
          id?: string
          input_schema?: Json
          langgraph_graph?: string | null
          monthly_token_cap?: number | null
          name: string
          output_schema?: Json
          requires_role?: string[]
          runtime: string
          slug: string
          system_prompt?: string | null
          triggers?: string[]
          updated_at?: string
        }
        Update: {
          auto_disabled_reason?: string | null
          auto_generated?: boolean
          config?: Json
          created_at?: string
          created_by?: string | null
          daily_invocation_cap?: number | null
          description?: string
          display_order?: number
          domain?: string
          edge_function?: string | null
          enabled?: boolean
          id?: string
          input_schema?: Json
          langgraph_graph?: string | null
          monthly_token_cap?: number | null
          name?: string
          output_schema?: Json
          requires_role?: string[]
          runtime?: string
          slug?: string
          system_prompt?: string | null
          triggers?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      paige_subscription_events: {
        Row: {
          contact_id: string | null
          created_at: string
          currency: string | null
          event_type: string
          id: string
          mrr_delta_cents: number | null
          processed_at: string | null
          raw: Json | null
          stripe_customer_id: string | null
          stripe_event_id: string
          tier_after: string | null
          tier_before: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          currency?: string | null
          event_type: string
          id?: string
          mrr_delta_cents?: number | null
          processed_at?: string | null
          raw?: Json | null
          stripe_customer_id?: string | null
          stripe_event_id: string
          tier_after?: string | null
          tier_before?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          mrr_delta_cents?: number | null
          processed_at?: string | null
          raw?: Json | null
          stripe_customer_id?: string | null
          stripe_event_id?: string
          tier_after?: string | null
          tier_before?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_subscription_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_subscription_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_subscription_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_subscription_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_telegram_config: {
        Row: {
          bot_token_last4: string | null
          bot_token_ref: string | null
          default_admin_chat_id: string | null
          enabled: boolean
          id: number
          updated_at: string
        }
        Insert: {
          bot_token_last4?: string | null
          bot_token_ref?: string | null
          default_admin_chat_id?: string | null
          enabled?: boolean
          id?: number
          updated_at?: string
        }
        Update: {
          bot_token_last4?: string | null
          bot_token_ref?: string | null
          default_admin_chat_id?: string | null
          enabled?: boolean
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      paige_workflow_registry: {
        Row: {
          allowed_roles: string[]
          category: string
          connection_id: string | null
          created_at: string
          description: string | null
          direct_function_name: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          langgraph_graph_id: string | null
          n8n_webhook_url: string | null
          n8n_workflow_id: string | null
          needs_n8n_link: boolean
          parameters_schema: Json
          provider: Database["public"]["Enums"]["workflow_provider"]
          requires_approval: boolean
          sort_order: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          allowed_roles?: string[]
          category: string
          connection_id?: string | null
          created_at?: string
          description?: string | null
          direct_function_name?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          langgraph_graph_id?: string | null
          n8n_webhook_url?: string | null
          n8n_workflow_id?: string | null
          needs_n8n_link?: boolean
          parameters_schema?: Json
          provider?: Database["public"]["Enums"]["workflow_provider"]
          requires_approval?: boolean
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          allowed_roles?: string[]
          category?: string
          connection_id?: string | null
          created_at?: string
          description?: string | null
          direct_function_name?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          langgraph_graph_id?: string | null
          n8n_webhook_url?: string | null
          n8n_workflow_id?: string | null
          needs_n8n_link?: boolean
          parameters_schema?: Json
          provider?: Database["public"]["Enums"]["workflow_provider"]
          requires_approval?: boolean
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_workflow_registry_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "paige_n8n_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_workflow_registry_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_workflow_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          langgraph_thread_id: string | null
          last_dispatched_at: string | null
          n8n_execution_id: string | null
          payload: Json
          registry_id: string
          result: Json | null
          retry_count: number
          status: string
          tenant_id: string | null
          triggered_at: string
          triggered_by_user_id: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          langgraph_thread_id?: string | null
          last_dispatched_at?: string | null
          n8n_execution_id?: string | null
          payload?: Json
          registry_id: string
          result?: Json | null
          retry_count?: number
          status?: string
          tenant_id?: string | null
          triggered_at?: string
          triggered_by_user_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          langgraph_thread_id?: string | null
          last_dispatched_at?: string | null
          n8n_execution_id?: string | null
          payload?: Json
          registry_id?: string
          result?: Json | null
          retry_count?: number
          status?: string
          tenant_id?: string | null
          triggered_at?: string
          triggered_by_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paige_workflow_runs_registry_id_fkey"
            columns: ["registry_id"]
            isOneToOne: false
            referencedRelation: "paige_workflow_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_workflow_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pii_access_log: {
        Row: {
          access_type: string
          accessed_at: string | null
          accessed_user_id: string
          accessor_user_id: string
          field_names: string[]
          id: string
          ip_address: unknown
          table_name: string
          user_agent: string | null
        }
        Insert: {
          access_type: string
          accessed_at?: string | null
          accessed_user_id: string
          accessor_user_id: string
          field_names: string[]
          id?: string
          ip_address?: unknown
          table_name: string
          user_agent?: string | null
        }
        Update: {
          access_type?: string
          accessed_at?: string | null
          accessed_user_id?: string
          accessor_user_id?: string
          field_names?: string[]
          id?: string
          ip_address?: unknown
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          label: string
          order_index: number
          pipeline_id: string
          probability: number
          stage_type: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          label: string
          order_index?: number
          pipeline_id: string
          probability?: number
          stage_type?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          label?: string
          order_index?: number
          pipeline_id?: string
          probability?: number
          stage_type?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_notifications: {
        Row: {
          channel: string
          id: string
          metadata: Json | null
          sent_at: string | null
          template: string
          user_id: string
        }
        Insert: {
          channel: string
          id?: string
          metadata?: Json | null
          sent_at?: string | null
          template: string
          user_id: string
        }
        Update: {
          channel?: string
          id?: string
          metadata?: Json | null
          sent_at?: string | null
          template?: string
          user_id?: string
        }
        Relationships: []
      }
      plaid_transactions: {
        Row: {
          account_id: string
          amount: number
          category: string[] | null
          created_at: string | null
          date: string
          id: string
          merchant_name: string | null
          name: string | null
          pending: boolean | null
          transaction_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category?: string[] | null
          created_at?: string | null
          date: string
          id?: string
          merchant_name?: string | null
          name?: string | null
          pending?: boolean | null
          transaction_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          category?: string[] | null
          created_at?: string | null
          date?: string
          id?: string
          merchant_name?: string | null
          name?: string | null
          pending?: boolean | null
          transaction_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaid_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "connected_bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      plaid_webhook_events: {
        Row: {
          created_at: string | null
          error: string | null
          event_id: string | null
          id: string
          item_id: string
          payload: Json
          processed: boolean | null
          processed_at: string | null
          tasks_created: string[] | null
          user_id: string | null
          webhook_code: string
          webhook_type: string
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          event_id?: string | null
          id?: string
          item_id: string
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
          tasks_created?: string[] | null
          user_id?: string | null
          webhook_code: string
          webhook_type: string
        }
        Update: {
          created_at?: string | null
          error?: string | null
          event_id?: string | null
          id?: string
          item_id?: string
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
          tasks_created?: string[] | null
          user_id?: string | null
          webhook_code?: string
          webhook_type?: string
        }
        Relationships: []
      }
      platform_api_keys: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          label: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          label?: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          label?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      platform_legal_profile: {
        Row: {
          created_at: string
          entity_type: string | null
          governing_law_state: string
          id: string
          legal_entity_name: string
          product_name: string
          registered_address: string | null
          singleton: boolean
          state_of_formation: string | null
          support_email: string
          support_phone: string | null
          updated_at: string
          website_url: string
        }
        Insert: {
          created_at?: string
          entity_type?: string | null
          governing_law_state?: string
          id?: string
          legal_entity_name?: string
          product_name?: string
          registered_address?: string | null
          singleton?: boolean
          state_of_formation?: string | null
          support_email?: string
          support_phone?: string | null
          updated_at?: string
          website_url?: string
        }
        Update: {
          created_at?: string
          entity_type?: string | null
          governing_law_state?: string
          id?: string
          legal_entity_name?: string
          product_name?: string
          registered_address?: string | null
          singleton?: boolean
          state_of_formation?: string | null
          support_email?: string
          support_phone?: string | null
          updated_at?: string
          website_url?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_tenant_id: string | null
          address: string | null
          avatar_url: string | null
          biggest_obstacle: string | null
          city: string | null
          coach_accepting_clients: boolean
          coach_bio: string | null
          coach_capacity: number | null
          coach_specialties: string[]
          coach_timezone: string | null
          consent_data_usage: boolean
          consent_marketing: boolean
          consent_privacy_policy: boolean
          consent_timestamp: string | null
          created_at: string | null
          credit_goals: Json | null
          credit_report_consent: boolean
          credit_report_consent_timestamp: string | null
          cross_bureau_discrepancies: Json | null
          dashboard_mode: string
          date_of_birth: string | null
          dob_last4: string | null
          estimated_fico_eq: number | null
          estimated_fico_ex: number | null
          estimated_fico_tu: number | null
          ethnicity: string[] | null
          experience_level: string | null
          financing_preference: string | null
          full_name: string | null
          funding_goals: Json | null
          gender_identity: string | null
          ghl_contact_id: string | null
          goal_amount: number | null
          goal_timeline: string | null
          has_broker_access: boolean
          has_discrepancies: boolean | null
          has_equipment_assets: boolean
          has_investment_accounts: boolean
          has_invoice_receivables: boolean
          has_real_estate_equity: boolean
          id: string
          intake_completed: boolean
          intake_completed_at: string | null
          intake_responses: Json | null
          investment_account_value_range: string | null
          is_complimentary: boolean
          is_permanent_resident: boolean | null
          is_service_disabled_veteran: boolean | null
          is_us_citizen: boolean | null
          is_veteran: boolean | null
          last_fundability_calculated: string | null
          last_fundability_snapshot: Json | null
          last_report_analyzed_at: string | null
          last_report_source: string | null
          monthly_revenue_range: string | null
          onboarding_completed: boolean | null
          onboarding_step: string | null
          phone: string | null
          pme_phase: string | null
          postal_code: string | null
          primary_bank_average_balance: number | null
          primary_bank_months: number | null
          primary_bank_name: string | null
          primary_goal: string | null
          primary_goal_category: string | null
          real_estate_equity_range: string | null
          referral_code: string | null
          score_model: string | null
          ssn_encrypted: string | null
          ssn_last_4: string | null
          state: string | null
          stripe_customer_id: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspended_reason: string | null
          total_liquid_assets_range: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active_tenant_id?: string | null
          address?: string | null
          avatar_url?: string | null
          biggest_obstacle?: string | null
          city?: string | null
          coach_accepting_clients?: boolean
          coach_bio?: string | null
          coach_capacity?: number | null
          coach_specialties?: string[]
          coach_timezone?: string | null
          consent_data_usage?: boolean
          consent_marketing?: boolean
          consent_privacy_policy?: boolean
          consent_timestamp?: string | null
          created_at?: string | null
          credit_goals?: Json | null
          credit_report_consent?: boolean
          credit_report_consent_timestamp?: string | null
          cross_bureau_discrepancies?: Json | null
          dashboard_mode?: string
          date_of_birth?: string | null
          dob_last4?: string | null
          estimated_fico_eq?: number | null
          estimated_fico_ex?: number | null
          estimated_fico_tu?: number | null
          ethnicity?: string[] | null
          experience_level?: string | null
          financing_preference?: string | null
          full_name?: string | null
          funding_goals?: Json | null
          gender_identity?: string | null
          ghl_contact_id?: string | null
          goal_amount?: number | null
          goal_timeline?: string | null
          has_broker_access?: boolean
          has_discrepancies?: boolean | null
          has_equipment_assets?: boolean
          has_investment_accounts?: boolean
          has_invoice_receivables?: boolean
          has_real_estate_equity?: boolean
          id?: string
          intake_completed?: boolean
          intake_completed_at?: string | null
          intake_responses?: Json | null
          investment_account_value_range?: string | null
          is_complimentary?: boolean
          is_permanent_resident?: boolean | null
          is_service_disabled_veteran?: boolean | null
          is_us_citizen?: boolean | null
          is_veteran?: boolean | null
          last_fundability_calculated?: string | null
          last_fundability_snapshot?: Json | null
          last_report_analyzed_at?: string | null
          last_report_source?: string | null
          monthly_revenue_range?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: string | null
          phone?: string | null
          pme_phase?: string | null
          postal_code?: string | null
          primary_bank_average_balance?: number | null
          primary_bank_months?: number | null
          primary_bank_name?: string | null
          primary_goal?: string | null
          primary_goal_category?: string | null
          real_estate_equity_range?: string | null
          referral_code?: string | null
          score_model?: string | null
          ssn_encrypted?: string | null
          ssn_last_4?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          total_liquid_assets_range?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active_tenant_id?: string | null
          address?: string | null
          avatar_url?: string | null
          biggest_obstacle?: string | null
          city?: string | null
          coach_accepting_clients?: boolean
          coach_bio?: string | null
          coach_capacity?: number | null
          coach_specialties?: string[]
          coach_timezone?: string | null
          consent_data_usage?: boolean
          consent_marketing?: boolean
          consent_privacy_policy?: boolean
          consent_timestamp?: string | null
          created_at?: string | null
          credit_goals?: Json | null
          credit_report_consent?: boolean
          credit_report_consent_timestamp?: string | null
          cross_bureau_discrepancies?: Json | null
          dashboard_mode?: string
          date_of_birth?: string | null
          dob_last4?: string | null
          estimated_fico_eq?: number | null
          estimated_fico_ex?: number | null
          estimated_fico_tu?: number | null
          ethnicity?: string[] | null
          experience_level?: string | null
          financing_preference?: string | null
          full_name?: string | null
          funding_goals?: Json | null
          gender_identity?: string | null
          ghl_contact_id?: string | null
          goal_amount?: number | null
          goal_timeline?: string | null
          has_broker_access?: boolean
          has_discrepancies?: boolean | null
          has_equipment_assets?: boolean
          has_investment_accounts?: boolean
          has_invoice_receivables?: boolean
          has_real_estate_equity?: boolean
          id?: string
          intake_completed?: boolean
          intake_completed_at?: string | null
          intake_responses?: Json | null
          investment_account_value_range?: string | null
          is_complimentary?: boolean
          is_permanent_resident?: boolean | null
          is_service_disabled_veteran?: boolean | null
          is_us_citizen?: boolean | null
          is_veteran?: boolean | null
          last_fundability_calculated?: string | null
          last_fundability_snapshot?: Json | null
          last_report_analyzed_at?: string | null
          last_report_source?: string | null
          monthly_revenue_range?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: string | null
          phone?: string | null
          pme_phase?: string | null
          postal_code?: string | null
          primary_bank_average_balance?: number | null
          primary_bank_months?: number | null
          primary_bank_name?: string | null
          primary_goal?: string | null
          primary_goal_category?: string | null
          real_estate_equity_range?: string | null
          referral_code?: string | null
          score_model?: string | null
          ssn_encrypted?: string | null
          ssn_last_4?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspended_reason?: string | null
          total_liquid_assets_range?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_tenant_id_fkey"
            columns: ["active_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notification_log: {
        Row: {
          body: string
          category: string
          created_at: string
          data: Json | null
          error_message: string | null
          id: string
          sent_at: string | null
          status: string
          subscription_id: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          data?: Json | null
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          data?: Json | null
          error_message?: string | null
          id?: string
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_log_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notification_preferences: {
        Row: {
          created_at: string
          id: string
          notify_credit_score_changes: boolean
          notify_dispute_updates: boolean
          notify_funding_matches: boolean
          notify_task_reminders: boolean
          prompt_dismiss_count: number
          prompt_dismissed_at: string | null
          push_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notify_credit_score_changes?: boolean
          notify_dispute_updates?: boolean
          notify_funding_matches?: boolean
          notify_task_reminders?: boolean
          prompt_dismiss_count?: number
          prompt_dismissed_at?: string | null
          push_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notify_credit_score_changes?: boolean
          notify_dispute_updates?: boolean
          notify_funding_matches?: boolean
          notify_task_reminders?: boolean
          prompt_dismiss_count?: number
          prompt_dismissed_at?: string | null
          push_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          device_type: string | null
          endpoint: string
          id: string
          is_active: boolean
          last_used_at: string
          p256dh_key: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          device_type?: string | null
          endpoint: string
          id?: string
          is_active?: boolean
          last_used_at?: string
          p256dh_key: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          device_type?: string | null
          endpoint?: string
          id?: string
          is_active?: boolean
          last_used_at?: string
          p256dh_key?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quickbooks_connections: {
        Row: {
          access_token_encrypted: string
          business_id: string | null
          created_at: string
          environment: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          last_webhook_received_at: string | null
          needs_expense_sync: boolean
          needs_revenue_sync: boolean
          qb_company_name: string | null
          qb_realm_id: string
          refresh_token_encrypted: string
          scope: string | null
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted: string
          business_id?: string | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          last_webhook_received_at?: string | null
          needs_expense_sync?: boolean
          needs_revenue_sync?: boolean
          qb_company_name?: string | null
          qb_realm_id: string
          refresh_token_encrypted: string
          scope?: string | null
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string
          business_id?: string | null
          created_at?: string
          environment?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          last_webhook_received_at?: string | null
          needs_expense_sync?: boolean
          needs_revenue_sync?: boolean
          qb_company_name?: string | null
          qb_realm_id?: string
          refresh_token_encrypted?: string
          scope?: string | null
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_financials: {
        Row: {
          accounts_payable: number | null
          accounts_receivable: number | null
          business_id: string | null
          cash_and_bank_balance: number | null
          cash_runway_months: number | null
          cogs: number | null
          created_at: string
          gross_margin_percent: number | null
          gross_profit: number | null
          id: string
          marketing_expenses: number | null
          monthly_burn_rate: number | null
          net_income: number | null
          net_margin_percent: number | null
          operating_expenses: number | null
          payroll_expenses: number | null
          period_end: string
          period_start: string
          professional_fees: number | null
          qb_connection_id: string
          revenue_per_month: Json | null
          synced_at: string
          top_expense_categories: Json | null
          total_expenses: number | null
          total_revenue: number | null
          user_id: string
        }
        Insert: {
          accounts_payable?: number | null
          accounts_receivable?: number | null
          business_id?: string | null
          cash_and_bank_balance?: number | null
          cash_runway_months?: number | null
          cogs?: number | null
          created_at?: string
          gross_margin_percent?: number | null
          gross_profit?: number | null
          id?: string
          marketing_expenses?: number | null
          monthly_burn_rate?: number | null
          net_income?: number | null
          net_margin_percent?: number | null
          operating_expenses?: number | null
          payroll_expenses?: number | null
          period_end: string
          period_start: string
          professional_fees?: number | null
          qb_connection_id: string
          revenue_per_month?: Json | null
          synced_at?: string
          top_expense_categories?: Json | null
          total_expenses?: number | null
          total_revenue?: number | null
          user_id: string
        }
        Update: {
          accounts_payable?: number | null
          accounts_receivable?: number | null
          business_id?: string | null
          cash_and_bank_balance?: number | null
          cash_runway_months?: number | null
          cogs?: number | null
          created_at?: string
          gross_margin_percent?: number | null
          gross_profit?: number | null
          id?: string
          marketing_expenses?: number | null
          monthly_burn_rate?: number | null
          net_income?: number | null
          net_margin_percent?: number | null
          operating_expenses?: number | null
          payroll_expenses?: number | null
          period_end?: string
          period_start?: string
          professional_fees?: number | null
          qb_connection_id?: string
          revenue_per_month?: Json | null
          synced_at?: string
          top_expense_categories?: Json | null
          total_expenses?: number | null
          total_revenue?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_financials_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_financials_qb_connection_id_fkey"
            columns: ["qb_connection_id"]
            isOneToOne: false
            referencedRelation: "quickbooks_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_transactions: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_business_expense: boolean | null
          qb_connection_id: string
          qb_transaction_id: string
          transaction_date: string
          transaction_type: string
          user_id: string
          vendor_or_customer: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_business_expense?: boolean | null
          qb_connection_id: string
          qb_transaction_id: string
          transaction_date: string
          transaction_type: string
          user_id: string
          vendor_or_customer?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_business_expense?: boolean | null
          qb_connection_id?: string
          qb_transaction_id?: string
          transaction_date?: string
          transaction_type?: string
          user_id?: string
          vendor_or_customer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_transactions_qb_connection_id_fkey"
            columns: ["qb_connection_id"]
            isOneToOne: false
            referencedRelation: "quickbooks_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_documents: {
        Row: {
          client_id: string | null
          content: string
          created_at: string
          document_type: string
          embedding: string | null
          helpful_count: number
          id: string
          is_anonymized: boolean
          is_published: boolean
          metadata: Json
          quality_score: number
          source: string
          summary: string | null
          title: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          client_id?: string | null
          content: string
          created_at?: string
          document_type: string
          embedding?: string | null
          helpful_count?: number
          id?: string
          is_anonymized?: boolean
          is_published?: boolean
          metadata?: Json
          quality_score?: number
          source?: string
          summary?: string | null
          title: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          client_id?: string | null
          content?: string
          created_at?: string
          document_type?: string
          embedding?: string | null
          helpful_count?: number
          id?: string
          is_anonymized?: boolean
          is_published?: boolean
          metadata?: Json
          quality_score?: number
          source?: string
          summary?: string | null
          title?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "rag_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      rag_retrieval_log: {
        Row: {
          created_at: string
          id: string
          query_embedding: string | null
          query_text: string | null
          retrieved_document_ids: string[]
          user_id: string | null
          was_helpful: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          query_embedding?: string | null
          query_text?: string | null
          retrieved_document_ids?: string[]
          user_id?: string | null
          was_helpful?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          query_embedding?: string | null
          query_text?: string | null
          retrieved_document_ids?: string[]
          user_id?: string | null
          was_helpful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_retrieval_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      referral_clicks: {
        Row: {
          affiliate_id: string | null
          clicked_at: string
          country: string | null
          id: number
          ip_hash: string | null
          landing_path: string | null
          referral_code: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          affiliate_id?: string | null
          clicked_at?: string
          country?: string | null
          id?: number
          ip_hash?: string | null
          landing_path?: string | null
          referral_code: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          affiliate_id?: string | null
          clicked_at?: string
          country?: string | null
          id?: number
          ip_hash?: string | null
          landing_path?: string | null
          referral_code?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_clicks_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_clicks_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "v_affiliate_stats"
            referencedColumns: ["affiliate_id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          active: boolean
          affiliate_id: string
          code: string
          created_at: string
        }
        Insert: {
          active?: boolean
          affiliate_id: string
          code: string
          created_at?: string
        }
        Update: {
          active?: boolean
          affiliate_id?: string
          code?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_codes_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "v_affiliate_stats"
            referencedColumns: ["affiliate_id"]
          },
        ]
      }
      referral_conversions: {
        Row: {
          affiliate_id: string
          amount_cents: number
          commission_cents: number
          converted_at: string
          id: string
          referral_code: string
          referred_user_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          affiliate_id: string
          amount_cents?: number
          commission_cents?: number
          converted_at?: string
          id?: string
          referral_code: string
          referred_user_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          affiliate_id?: string
          amount_cents?: number
          commission_cents?: number
          converted_at?: string
          id?: string
          referral_code?: string
          referred_user_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_conversions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_conversions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "v_affiliate_stats"
            referencedColumns: ["affiliate_id"]
          },
        ]
      }
      response_quality_feedback: {
        Row: {
          correction_note: string | null
          created_at: string
          id: string
          message_content: string | null
          message_id: string
          rated_by: string
          rating: string
          reason_category: string | null
          reason_other: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          session_id: string
        }
        Insert: {
          correction_note?: string | null
          created_at?: string
          id?: string
          message_content?: string | null
          message_id: string
          rated_by: string
          rating: string
          reason_category?: string | null
          reason_other?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id: string
        }
        Update: {
          correction_note?: string | null
          created_at?: string
          id?: string
          message_content?: string | null
          message_id?: string
          rated_by?: string
          rating?: string
          reason_category?: string | null
          reason_other?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string
        }
        Relationships: []
      }
      security_canary_runs: {
        Row: {
          created_at: string
          error_message: string | null
          http_status: number | null
          id: string
          leaked_columns: string[]
          probe_name: string
          sample_payload: Json | null
          status: string
          target: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          leaked_columns?: string[]
          probe_name: string
          sample_payload?: Json | null
          status: string
          target: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          leaked_columns?: string[]
          probe_name?: string
          sample_payload?: Json | null
          status?: string
          target?: string
        }
        Relationships: []
      }
      sms_verifications: {
        Row: {
          attempts: number
          code_hashed: boolean
          created_at: string
          expires_at: string
          id: string
          phone_number: string
          user_id: string
          verification_code: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code_hashed?: boolean
          created_at?: string
          expires_at: string
          id?: string
          phone_number: string
          user_id: string
          verification_code: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code_hashed?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          phone_number?: string
          user_id?: string
          verification_code?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      stripe_event_log: {
        Row: {
          account_id: string | null
          event_id: string
          livemode: boolean | null
          metadata: Json
          payload_digest: string | null
          processed_at: string | null
          received_at: string
          type: string
        }
        Insert: {
          account_id?: string | null
          event_id: string
          livemode?: boolean | null
          metadata?: Json
          payload_digest?: string | null
          processed_at?: string | null
          received_at?: string
          type: string
        }
        Update: {
          account_id?: string | null
          event_id?: string
          livemode?: boolean | null
          metadata?: Json
          payload_digest?: string | null
          processed_at?: string | null
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          ai_chat_limit: number | null
          created_at: string | null
          dispute_limit: number | null
          features: Json
          has_business_credit: boolean | null
          has_business_document_upload: boolean
          has_document_upload: boolean
          has_funding_tools: boolean | null
          has_personal_document_upload: boolean
          id: string
          name: string
          price: number
          slug: string
          updated_at: string | null
        }
        Insert: {
          ai_chat_limit?: number | null
          created_at?: string | null
          dispute_limit?: number | null
          features?: Json
          has_business_credit?: boolean | null
          has_business_document_upload?: boolean
          has_document_upload?: boolean
          has_funding_tools?: boolean | null
          has_personal_document_upload?: boolean
          id?: string
          name: string
          price: number
          slug: string
          updated_at?: string | null
        }
        Update: {
          ai_chat_limit?: number | null
          created_at?: string | null
          dispute_limit?: number | null
          features?: Json
          has_business_credit?: boolean | null
          has_business_document_upload?: boolean
          has_document_upload?: boolean
          has_funding_tools?: boolean | null
          has_personal_document_upload?: boolean
          id?: string
          name?: string
          price?: number
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      support_ticket_last_seen: {
        Row: {
          last_seen_at: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_last_seen_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          created_at: string
          id: string
          is_internal: boolean
          message: string
          sender_type: string
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_internal?: boolean
          message: string
          sender_type: string
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_internal?: boolean
          message?: string
          sender_type?: string
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          description: string
          id: string
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          subject: string
          ticket_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          created_at?: string
          description: string
          id?: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          ticket_number?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          ticket_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          biz_id: string | null
          created_at: string | null
          deal_id: string | null
          description: string | null
          due_date: string | null
          id: string
          metadata: Json | null
          reminder_sent: boolean
          status: Database["public"]["Enums"]["task_status"]
          tenant_id: string | null
          title: string
          track: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          biz_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          reminder_sent?: boolean
          status?: Database["public"]["Enums"]["task_status"]
          tenant_id?: string | null
          title: string
          track?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          biz_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          reminder_sent?: boolean
          status?: Database["public"]["Enums"]["task_status"]
          tenant_id?: string | null
          title?: string
          track?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_biz_id_fkey"
            columns: ["biz_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_agreement_versions: {
        Row: {
          base_template_id: string | null
          body_markdown: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          rendered_sha256: string | null
          source_mode: string
          template_slug: string
          tenant_id: string
          title: string
          updated_at: string
          uploaded_file_mime: string | null
          uploaded_file_path: string | null
          version: number
        }
        Insert: {
          base_template_id?: string | null
          body_markdown?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          rendered_sha256?: string | null
          source_mode: string
          template_slug: string
          tenant_id: string
          title: string
          updated_at?: string
          uploaded_file_mime?: string | null
          uploaded_file_path?: string | null
          version?: number
        }
        Update: {
          base_template_id?: string | null
          body_markdown?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          rendered_sha256?: string | null
          source_mode?: string
          template_slug?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          uploaded_file_mime?: string | null
          uploaded_file_path?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_agreement_versions_base_template_id_fkey"
            columns: ["base_template_id"]
            isOneToOne: false
            referencedRelation: "agreement_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_agreement_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_email_domains: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          dns_records: Json
          domain: string
          from_email_local: string
          from_name: string
          id: string
          is_default: boolean
          resend_domain_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          dns_records?: Json
          domain: string
          from_email_local?: string
          from_name: string
          id?: string
          is_default?: boolean
          resend_domain_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          dns_records?: Json
          domain?: string
          from_email_local?: string
          from_name?: string
          id?: string
          is_default?: boolean
          resend_domain_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_email_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invite_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          default_role: Database["public"]["Enums"]["tenant_role"]
          expires_at: string
          id: string
          kind: string
          last_used_at: string | null
          max_uses: number | null
          revoked_at: string | null
          tenant_id: string
          token: string
          updated_at: string
          uses: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_role?: Database["public"]["Enums"]["tenant_role"]
          expires_at?: string
          id?: string
          kind?: string
          last_used_at?: string | null
          max_uses?: number | null
          revoked_at?: string | null
          tenant_id: string
          token: string
          updated_at?: string
          uses?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_role?: Database["public"]["Enums"]["tenant_role"]
          expires_at?: string
          id?: string
          kind?: string
          last_used_at?: string | null
          max_uses?: number | null
          revoked_at?: string | null
          tenant_id?: string
          token?: string
          updated_at?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invite_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          doc_id: string
          embedding: string | null
          id: string
          tenant_id: string
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          doc_id: string
          embedding?: string | null
          id?: string
          tenant_id: string
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          doc_id?: string
          embedding?: string | null
          id?: string
          tenant_id?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_knowledge_chunks_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "tenant_knowledge_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_knowledge_chunks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_knowledge_docs: {
        Row: {
          category: string | null
          chunk_count: number
          content: string
          created_at: string
          created_by: string
          id: string
          network_review_status: string
          network_reviewed_at: string | null
          network_reviewed_by: string | null
          promoted_to_canon_id: string | null
          share_to_network: boolean
          source: string
          source_url: string | null
          summary: string | null
          tags: string[] | null
          tenant_id: string
          title: string
          token_count: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          chunk_count?: number
          content: string
          created_at?: string
          created_by: string
          id?: string
          network_review_status?: string
          network_reviewed_at?: string | null
          network_reviewed_by?: string | null
          promoted_to_canon_id?: string | null
          share_to_network?: boolean
          source?: string
          source_url?: string | null
          summary?: string | null
          tags?: string[] | null
          tenant_id: string
          title: string
          token_count?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          chunk_count?: number
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          network_review_status?: string
          network_reviewed_at?: string | null
          network_reviewed_by?: string | null
          promoted_to_canon_id?: string | null
          share_to_network?: boolean
          source?: string
          source_url?: string | null
          summary?: string | null
          tags?: string[] | null
          tenant_id?: string
          title?: string
          token_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_knowledge_docs_promoted_to_canon_id_fkey"
            columns: ["promoted_to_canon_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_knowledge_docs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_legal_profile: {
        Row: {
          created_at: string
          dba_name: string | null
          ein_last_4: string | null
          entity_type: string | null
          governing_law_state: string | null
          id: string
          legal_business_name: string
          logo_url: string | null
          registered_address: string | null
          signatory_name: string | null
          signatory_title: string | null
          state_of_formation: string | null
          support_email: string | null
          support_phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dba_name?: string | null
          ein_last_4?: string | null
          entity_type?: string | null
          governing_law_state?: string | null
          id?: string
          legal_business_name: string
          logo_url?: string | null
          registered_address?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          state_of_formation?: string | null
          support_email?: string | null
          support_phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dba_name?: string | null
          ein_last_4?: string | null
          entity_type?: string | null
          governing_law_state?: string | null
          id?: string
          legal_business_name?: string
          logo_url?: string | null
          registered_address?: string | null
          signatory_name?: string | null
          signatory_title?: string | null
          state_of_formation?: string | null
          support_email?: string | null
          support_phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_legal_profile_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          joined_at: string | null
          role: Database["public"]["Enums"]["tenant_role"]
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["tenant_role"]
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_orders: {
        Row: {
          amount_total: number | null
          application_fee_amount: number | null
          created_at: string
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          id: string
          metadata: Json
          price_id: string | null
          product_id: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_total?: number | null
          application_fee_amount?: number | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          metadata?: Json
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_total?: number | null
          application_fee_amount?: number | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          metadata?: Json
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_orders_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "tenant_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "tenant_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_prices: {
        Row: {
          active: boolean
          billing_interval: string | null
          created_at: string
          currency: string
          id: string
          installments_total: number | null
          interval_count: number | null
          kind: string
          nickname: string | null
          product_id: string
          sort_order: number
          stripe_price_id: string | null
          tenant_id: string
          unit_amount: number
        }
        Insert: {
          active?: boolean
          billing_interval?: string | null
          created_at?: string
          currency?: string
          id?: string
          installments_total?: number | null
          interval_count?: number | null
          kind?: string
          nickname?: string | null
          product_id: string
          sort_order?: number
          stripe_price_id?: string | null
          tenant_id: string
          unit_amount: number
        }
        Update: {
          active?: boolean
          billing_interval?: string | null
          created_at?: string
          currency?: string
          id?: string
          installments_total?: number | null
          interval_count?: number | null
          kind?: string
          nickname?: string | null
          product_id?: string
          sort_order?: number
          stripe_price_id?: string | null
          tenant_id?: string
          unit_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "tenant_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_prices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_products: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          metadata: Json
          name: string
          product_type: string
          status: string
          stripe_product_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json
          name: string
          product_type?: string
          status?: string
          stripe_product_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json
          name?: string
          product_type?: string
          status?: string
          stripe_product_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_stripe_accounts: {
        Row: {
          account_type: string
          charges_enabled: boolean
          country: string | null
          created_at: string
          default_currency: string | null
          details_submitted: boolean
          payouts_enabled: boolean
          requirements: Json | null
          stripe_account_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_type?: string
          charges_enabled?: boolean
          country?: string | null
          created_at?: string
          default_currency?: string | null
          details_submitted?: boolean
          payouts_enabled?: boolean
          requirements?: Json | null
          stripe_account_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_type?: string
          charges_enabled?: boolean
          country?: string | null
          created_at?: string
          default_currency?: string | null
          details_submitted?: boolean
          payouts_enabled?: boolean
          requirements?: Json | null
          stripe_account_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_stripe_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          brand: Json
          created_at: string
          customer_limit: number
          features: Json
          id: string
          name: string
          owner_user_id: string | null
          plan_offer: string | null
          platform_fee_bps: number
          seat_limit: number
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          storefront_enabled: boolean
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          brand?: Json
          created_at?: string
          customer_limit?: number
          features?: Json
          id?: string
          name: string
          owner_user_id?: string | null
          plan_offer?: string | null
          platform_fee_bps?: number
          seat_limit?: number
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          storefront_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          brand?: Json
          created_at?: string
          customer_limit?: number
          features?: Json
          id?: string
          name?: string
          owner_user_id?: string | null
          plan_offer?: string | null
          platform_fee_bps?: number
          seat_limit?: number
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          storefront_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tier_state: {
        Row: {
          client_id: string | null
          contact_email: string
          created_at: string
          current_period_end: string | null
          id: string
          last_payment_at: string | null
          organization_id: string | null
          payment_status: string
          source: string | null
          stripe_account_id: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          tier: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          contact_email: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          last_payment_at?: string | null
          organization_id?: string | null
          payment_status?: string
          source?: string | null
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          contact_email?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          last_payment_at?: string | null
          organization_id?: string | null
          payment_status?: string
          source?: string | null
          stripe_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tier_state_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tier_state_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "tier_state_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "tier_state_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      user_build_milestones: {
        Row: {
          business_id: string | null
          completed_at: string | null
          created_at: string
          evidence: Json | null
          id: string
          milestone_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id?: string | null
          completed_at?: string | null
          created_at?: string
          evidence?: Json | null
          id?: string
          milestone_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string | null
          completed_at?: string | null
          created_at?: string
          evidence?: Json | null
          id?: string
          milestone_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_build_milestones_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_build_milestones_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "build_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      user_business_limits: {
        Row: {
          additional_business_monthly_fee: number
          additional_businesses_count: number
          created_at: string
          id: string
          max_businesses: number
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_business_monthly_fee?: number
          additional_businesses_count?: number
          created_at?: string
          id?: string
          max_businesses?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_business_monthly_fee?: number
          additional_businesses_count?: number
          created_at?: string
          id?: string
          max_businesses?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_funding_matches: {
        Row: {
          applied_at: string | null
          blocking_factors: Json | null
          calculated_at: string | null
          estimated_approval_amount: number | null
          id: string
          improvement_path: Json | null
          lender_product_id: string | null
          match_score: number | null
          match_status: string | null
          notified_at: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          blocking_factors?: Json | null
          calculated_at?: string | null
          estimated_approval_amount?: number | null
          id?: string
          improvement_path?: Json | null
          lender_product_id?: string | null
          match_score?: number | null
          match_status?: string | null
          notified_at?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string | null
          blocking_factors?: Json | null
          calculated_at?: string | null
          estimated_approval_amount?: number | null
          id?: string
          improvement_path?: Json | null
          lender_product_id?: string | null
          match_score?: number | null
          match_status?: string | null
          notified_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_funding_matches_lender_product_id_fkey"
            columns: ["lender_product_id"]
            isOneToOne: false
            referencedRelation: "lender_products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_progress: {
        Row: {
          completed_at: string | null
          course_id: string
          created_at: string | null
          id: string
          lesson_id: string | null
          notes: string | null
          progress_percentage: number | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          notes?: string | null
          progress_percentage?: number | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          created_at?: string | null
          id?: string
          lesson_id?: string | null
          notes?: string | null
          progress_percentage?: number | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_slug: string
          status: string
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_slug: string
          status?: string
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_slug?: string
          status?: string
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_usage: {
        Row: {
          ai_chats_used: number | null
          created_at: string | null
          disputes_used: number | null
          id: string
          reset_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_chats_used?: number | null
          created_at?: string | null
          disputes_used?: number | null
          id?: string
          reset_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_chats_used?: number | null
          created_at?: string | null
          disputes_used?: number | null
          id?: string
          reset_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vendor_offers: {
        Row: {
          affiliate_tag: string | null
          apply_url: string
          benefits: string | null
          category: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          requirements: string | null
          updated_at: string | null
        }
        Insert: {
          affiliate_tag?: string | null
          apply_url: string
          benefits?: string | null
          category: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          requirements?: string | null
          updated_at?: string | null
        }
        Update: {
          affiliate_tag?: string | null
          apply_url?: string
          benefits?: string | null
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          requirements?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      voice_command_logs: {
        Row: {
          action: Json | null
          confirmation_required: boolean | null
          created_at: string | null
          id: string
          intent: string | null
          latency_ms: number | null
          scope: string | null
          slots: Json | null
          status: string
          turn_id: string
          user_id: string
          utterance: string
        }
        Insert: {
          action?: Json | null
          confirmation_required?: boolean | null
          created_at?: string | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          scope?: string | null
          slots?: Json | null
          status: string
          turn_id: string
          user_id: string
          utterance: string
        }
        Update: {
          action?: Json | null
          confirmation_required?: boolean | null
          created_at?: string | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          scope?: string | null
          slots?: Json | null
          status?: string
          turn_id?: string
          user_id?: string
          utterance?: string
        }
        Relationships: []
      }
      webhook_event_log: {
        Row: {
          created_at: string
          direction: string
          event_type: string
          http_status: number | null
          id: string
          payload_summary: Json | null
          request_payload: Json | null
          response_body: string | null
          retry_count: number
          status: string
          target_url: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          event_type: string
          http_status?: number | null
          id?: string
          payload_summary?: Json | null
          request_payload?: Json | null
          response_body?: string | null
          retry_count?: number
          status?: string
          target_url?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          event_type?: string
          http_status?: number | null
          id?: string
          payload_summary?: Json | null
          request_payload?: Json | null
          response_body?: string | null
          retry_count?: number
          status?: string
          target_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      _bank_rollup: {
        Row: {
          bank_connections: number | null
          bank_connections_active: number | null
          contact_id: string | null
          last_bank_sync_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_bank_connections_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_bank_connections_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_bank_connections_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_bank_connections_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      _latest_cash_flow: {
        Row: {
          avg_daily_balance_cents: number | null
          contact_id: string | null
          funding_readiness_score: number | null
          generated_at: string | null
          period_end: string | null
          period_start: string | null
          runway_days: number | null
          total_deposits_cents: number | null
          total_withdrawals_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_cash_flow_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_cash_flow_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_cash_flow_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_cash_flow_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      _latest_owner_credit: {
        Row: {
          bureau: Database["public"]["Enums"]["owner_credit_bureau"] | null
          contact_id: string | null
          pulled_at: string | null
          score: number | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_owner_credit_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_owner_credit_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_owner_credit_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_owner_credit_snapshots_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      _signature_rollup: {
        Row: {
          contact_id: string | null
          envelopes_completed: number | null
          envelopes_pending: number | null
          envelopes_total: number | null
          last_signed_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_signature_envelopes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_signature_envelopes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_signature_envelopes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_signature_envelopes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_daily_summary: {
        Row: {
          active_users: number | null
          churned_mrr: number | null
          credit_uploads: number | null
          date: string | null
          funding_applications: number | null
          new_mrr: number | null
          new_signups: number | null
          paige_sessions: number | null
          voice_sessions: number | null
        }
        Relationships: []
      }
      analytics_feature_usage: {
        Row: {
          date: string | null
          feature_name: string | null
          unique_users: number | null
          usage_count: number | null
        }
        Relationships: []
      }
      contact_deal_rollup: {
        Row: {
          contact_id: string | null
          open_deals: number | null
          open_value_cents: number | null
          won_deals: number | null
          won_value_cents: number | null
        }
        Relationships: []
      }
      contact_readiness_rollup: {
        Row: {
          assigned_coach_user_id: string | null
          avg_daily_balance_cents: number | null
          bank_connections: number | null
          bank_connections_active: number | null
          business_pulled_at: string | null
          business_scores: Json | null
          cash_flow_period_end: string | null
          cash_flow_readiness: number | null
          contact_id: string | null
          email: string | null
          entity_name: string | null
          envelopes_completed: number | null
          envelopes_pending: number | null
          envelopes_total: number | null
          first_name: string | null
          funding_goal: number | null
          last_bank_sync_at: string | null
          last_contacted_at: string | null
          last_name: string | null
          last_signed_at: string | null
          lifecycle_stage: string | null
          linked_user_id: string | null
          owner_bureau:
            | Database["public"]["Enums"]["owner_credit_bureau"]
            | null
          owner_fico: number | null
          owner_pulled_at: string | null
          readiness_score: number | null
          runway_days: number | null
          stored_overall_score: number | null
          stored_score_at: string | null
          tags: string[] | null
        }
        Relationships: []
      }
      paige_approval_queue_v: {
        Row: {
          age_seconds: number | null
          assigned_to_user_id: string | null
          category: string | null
          contact_email: string | null
          contact_first_name: string | null
          contact_id: string | null
          contact_last_name: string | null
          contact_lifecycle_stage: string | null
          conversation_id: string | null
          created_at: string | null
          draft_content: Json | null
          id: string | null
          metadata: Json | null
          priority: number | null
          requires_role: Database["public"]["Enums"]["app_role"] | null
          reviewed_at: string | null
          risk_level: string | null
          sent_at: string | null
          sla_due_at: string | null
          sla_state: string | null
          source: string | null
          status: string | null
          submitted_by_user_id: string | null
          summary: string | null
          tenant_id: string | null
          type: string | null
          visible_to_roles: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "paige_pending_approvals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_pending_approvals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_deal_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_pending_approvals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact_readiness_rollup"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "paige_pending_approvals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "paige_unassigned_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_pending_approvals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "paige_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paige_pending_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      paige_unassigned_queue: {
        Row: {
          created_at: string | null
          email: string | null
          first_name: string | null
          ghl_contact_id: string | null
          id: string | null
          last_mirrored_at: string | null
          last_name: string | null
          priority_rank: number | null
          tier: string | null
          unassigned_for_hours: number | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          ghl_contact_id?: string | null
          id?: string | null
          last_mirrored_at?: string | null
          last_name?: string | null
          priority_rank?: never
          tier?: string | null
          unassigned_for_hours?: never
        }
        Update: {
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          ghl_contact_id?: string | null
          id?: string | null
          last_mirrored_at?: string | null
          last_name?: string | null
          priority_rank?: never
          tier?: string | null
          unassigned_for_hours?: never
        }
        Relationships: []
      }
      v_affiliate_stats: {
        Row: {
          active: boolean | null
          affiliate_id: string | null
          clicks: number | null
          commission_owed_cents: number | null
          commission_paid_ytd_cents: number | null
          commission_rate: number | null
          email: string | null
          full_name: string | null
          paid_conversions: number | null
          referral_code: string | null
          signups: number | null
          tier_key: string | null
          tier_name: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_referral_funnel_daily: {
        Row: {
          clicks: number | null
          day: string | null
          paid: number | null
          signups: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invitation: {
        Args: { _token: string; _user_id: string }
        Returns: Json
      }
      accept_tenant_invite: { Args: { _token: string }; Returns: string }
      admin_bulk_assign_coach: {
        Args: { _client_ids: string[]; _coach: string }
        Returns: Json
      }
      admin_meta_capi_token_is_set: { Args: never; Returns: boolean }
      admin_remove_coach_role: { Args: { _user_id: string }; Returns: Json }
      admin_set_meta_capi_token: {
        Args: { _token: string }
        Returns: undefined
      }
      admin_set_user_business_limit: {
        Args: { _max_businesses: number; _target_user_id: string }
        Returns: Json
      }
      approve_affiliate_application: {
        Args: { _application_id: string; _notes?: string; _tier_key?: string }
        Returns: Json
      }
      assignment_role_for: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: string
      }
      attribute_conversion: {
        Args: {
          p_amount_cents: number
          p_event_type: string
          p_stripe_customer_id: string
          p_stripe_sub_id: string
          p_user_id: string
        }
        Returns: string
      }
      can_access_contact: {
        Args: { _contact_id: string; _user_id: string }
        Returns: boolean
      }
      check_feature_access: {
        Args: { _feature: string; _user_id: string }
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          _function_name: string
          _max_requests?: number
          _user_id: string
          _window_minutes?: number
        }
        Returns: boolean
      }
      claim_client: {
        Args: { _client_id: string }
        Returns: {
          active: boolean
          assigned_at: string
          assigned_role: string | null
          coach_id: string | null
          contact_id: string | null
          created_at: string
          id: string
          metadata: Json
          notes: string | null
          rep_user_id: string | null
          role: string | null
          tenant_id: string | null
          unassigned_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "paige_coach_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      client_has_role_assigned: {
        Args: { _assignment_role: string; _client: string }
        Returns: boolean
      }
      coach_can_access_user: {
        Args: { _coach: string; _user: string }
        Returns: boolean
      }
      compute_contact_readiness: {
        Args: { _contact_id: string }
        Returns: number
      }
      create_tenant_invite_token: {
        Args: {
          _default_role?: Database["public"]["Enums"]["tenant_role"]
          _expires_in_days?: number
          _kind?: string
          _max_uses?: number
          _tenant_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          default_role: Database["public"]["Enums"]["tenant_role"]
          expires_at: string
          id: string
          kind: string
          last_used_at: string | null
          max_uses: number | null
          revoked_at: string | null
          tenant_id: string
          token: string
          updated_at: string
          uses: number
        }
        SetofOptions: {
          from: "*"
          to: "tenant_invite_tokens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_roles: { Args: never; Returns: string[] }
      current_user_tenant_id: { Args: never; Returns: string }
      default_max_businesses_for_plan: {
        Args: { _plan_slug: string }
        Returns: number
      }
      delete_credit_report_upload: {
        Args: { _calling_user_id: string; _upload_id: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enforce_subagent_doctrine_116: {
        Args: never
        Returns: {
          out_action: string
          out_match: string
          out_slug: string
        }[]
      }
      enforce_subagent_doctrine_124: {
        Args: never
        Returns: {
          out_action: string
          out_pattern: string
          out_slug: string
        }[]
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_owner_admin: { Args: never; Returns: undefined }
      factory_reset_delete_dispute_related: {
        Args: { _user_id: string }
        Returns: undefined
      }
      fire_team_event: { Args: { payload: Json }; Returns: undefined }
      get_analytics_daily_summary: {
        Args: { _end?: string; _start?: string }
        Returns: {
          active_users: number | null
          churned_mrr: number | null
          credit_uploads: number | null
          date: string | null
          funding_applications: number | null
          new_mrr: number | null
          new_signups: number | null
          paige_sessions: number | null
          voice_sessions: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "analytics_daily_summary"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_analytics_feature_usage: {
        Args: { _end?: string; _start?: string }
        Returns: {
          date: string | null
          feature_name: string | null
          unique_users: number | null
          usage_count: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "analytics_feature_usage"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_approval_queue_counts: { Args: never; Returns: Json }
      get_broker_team_member: {
        Args: { _auth_user_id: string }
        Returns: {
          broker_id: string
          business_name: string
          email: string
          firm_description: string
          first_name: string
          id: string
          last_name: string
          permissions: Json
          role: string
          status: string
        }[]
      }
      get_business_hierarchy: {
        Args: { _user_id: string }
        Returns: {
          business_type: Database["public"]["Enums"]["business_hierarchy_type"]
          child_count: number
          display_order: number
          ein: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          legal_name: string
          organizational_level: number
          parent_business_id: string
        }[]
      }
      get_outstanding_consents: {
        Args: { _user_id: string }
        Returns: {
          effective_date: string
          slug: string
          summary: string
          title: string
          version: number
        }[]
      }
      get_profile_with_pii_log: {
        Args: { _user_id: string }
        Returns: {
          active_tenant_id: string | null
          address: string | null
          avatar_url: string | null
          biggest_obstacle: string | null
          city: string | null
          coach_accepting_clients: boolean
          coach_bio: string | null
          coach_capacity: number | null
          coach_specialties: string[]
          coach_timezone: string | null
          consent_data_usage: boolean
          consent_marketing: boolean
          consent_privacy_policy: boolean
          consent_timestamp: string | null
          created_at: string | null
          credit_goals: Json | null
          credit_report_consent: boolean
          credit_report_consent_timestamp: string | null
          cross_bureau_discrepancies: Json | null
          dashboard_mode: string
          date_of_birth: string | null
          dob_last4: string | null
          estimated_fico_eq: number | null
          estimated_fico_ex: number | null
          estimated_fico_tu: number | null
          ethnicity: string[] | null
          experience_level: string | null
          financing_preference: string | null
          full_name: string | null
          funding_goals: Json | null
          gender_identity: string | null
          ghl_contact_id: string | null
          goal_amount: number | null
          goal_timeline: string | null
          has_broker_access: boolean
          has_discrepancies: boolean | null
          has_equipment_assets: boolean
          has_investment_accounts: boolean
          has_invoice_receivables: boolean
          has_real_estate_equity: boolean
          id: string
          intake_completed: boolean
          intake_completed_at: string | null
          intake_responses: Json | null
          investment_account_value_range: string | null
          is_complimentary: boolean
          is_permanent_resident: boolean | null
          is_service_disabled_veteran: boolean | null
          is_us_citizen: boolean | null
          is_veteran: boolean | null
          last_fundability_calculated: string | null
          last_fundability_snapshot: Json | null
          last_report_analyzed_at: string | null
          last_report_source: string | null
          monthly_revenue_range: string | null
          onboarding_completed: boolean | null
          onboarding_step: string | null
          phone: string | null
          pme_phase: string | null
          postal_code: string | null
          primary_bank_average_balance: number | null
          primary_bank_months: number | null
          primary_bank_name: string | null
          primary_goal: string | null
          primary_goal_category: string | null
          real_estate_equity_range: string | null
          referral_code: string | null
          score_model: string | null
          ssn_encrypted: string | null
          ssn_last_4: string | null
          state: string | null
          stripe_customer_id: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspended_reason: string | null
          total_liquid_assets_range: string | null
          updated_at: string | null
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_tenant_sender: {
        Args: { _tenant_id: string }
        Returns: {
          from_email: string
          from_name: string
          source: string
        }[]
      }
      get_user_business_limit: { Args: { _user_id: string }; Returns: number }
      get_user_primary_tenant: {
        Args: { _user_id: string }
        Returns: {
          member_role: string
          tenant_id: string
          tenant_name: string
        }[]
      }
      has_any_role: {
        Args: { _roles: string[]; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tenant_role: {
        Args: { _role: string; _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_assigned_to_client: {
        Args: { _assignment_role?: string; _client: string; _user: string }
        Returns: boolean
      }
      is_broker_team_member_of: {
        Args: { _broker_id: string }
        Returns: boolean
      }
      is_btf_assigned_coach: { Args: { _client_id: string }; Returns: boolean }
      is_btf_client_owner: { Args: { _client_id: string }; Returns: boolean }
      is_platform_owner: { Args: never; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_admin: { Args: { _tenant: string }; Returns: boolean }
      is_tenant_member: { Args: { _tenant: string }; Returns: boolean }
      is_tenant_owner: {
        Args: { _tenant_id?: string; _user_id: string }
        Returns: boolean
      }
      match_paige_memory: {
        Args: {
          _match_threshold?: number
          _memory_count?: number
          _message_count?: number
          _query_embedding: string
          _target_client_id?: string
          _target_user_id: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          memory_type: string
          similarity: number
          source: string
        }[]
      }
      match_rag_documents: {
        Args: {
          _document_types?: string[]
          _match_count?: number
          _match_threshold?: number
          _metadata_filter?: Json
          _query_embedding: string
          _query_text?: string
        }
        Returns: {
          content: string
          document_type: string
          id: string
          metadata: Json
          quality_score: number
          similarity: number
          summary: string
          title: string
        }[]
      }
      match_tenant_knowledge: {
        Args: {
          p_match_count?: number
          p_query_embedding: string
          p_tenant_id: string
        }
        Returns: {
          chunk_id: string
          content: string
          doc_id: string
          similarity: number
          source_tier: string
          title: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      peek_tenant_invite: {
        Args: { _token: string }
        Returns: {
          brand: Json
          default_role: Database["public"]["Enums"]["tenant_role"]
          expires_at: string
          is_valid: boolean
          kind: string
          tenant_id: string
          tenant_name: string
          tenant_slug: string
        }[]
      }
      qb_decrypt_token: { Args: { _ciphertext: string }; Returns: string }
      qb_encrypt_token: { Args: { _plaintext: string }; Returns: string }
      rag_recalibrate_quality: {
        Args: never
        Returns: {
          boosted_high: number
          flagged_low: number
        }[]
      }
      reactivate_user: { Args: { _user_id: string }; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reassign_coach_clients: {
        Args: { _from_coach: string; _to_coach: string }
        Returns: number
      }
      refresh_analytics_views: { Args: never; Returns: undefined }
      reject_affiliate_application: {
        Args: { _application_id: string; _notes?: string }
        Returns: Json
      }
      resolve_client_id_by_email: { Args: { _email: string }; Returns: string }
      revoke_platform_access: { Args: { _user_id: string }; Returns: undefined }
      scan_soft_subagents_for_tool_refs: {
        Args: never
        Returns: {
          out_pattern: string
          out_slug: string
        }[]
      }
      set_journey_stage: {
        Args: {
          _contact_id: string
          _source_event?: string
          _stage_slug: string
        }
        Returns: Json
      }
      suspend_user: {
        Args: { _reason: string; _user_id: string }
        Returns: undefined
      }
      tenant_has_feature: { Args: { _feature: string }; Returns: boolean }
      tenant_sender_identity: { Args: { _tenant_id: string }; Returns: Json }
      tier_pool_for_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: string[]
      }
      trigger_business_credit_sync: {
        Args: { _user_id: string }
        Returns: Json
      }
      unassigned_queue_for_caller: {
        Args: never
        Returns: {
          created_at: string | null
          email: string | null
          first_name: string | null
          ghl_contact_id: string | null
          id: string | null
          last_mirrored_at: string | null
          last_name: string | null
          priority_rank: number | null
          tier: string | null
          unassigned_for_hours: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "paige_unassigned_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      update_profile_ssn: {
        Args: {
          _date_of_birth: string
          _ssn_encrypted: string
          _ssn_last_4: string
          _user_id: string
        }
        Returns: undefined
      }
      verify_certificate_by_code: {
        Args: { _verification_code: string }
        Returns: {
          certificate_url: string
          course_id: string
          issued_at: string
          verification_code: string
        }[]
      }
    }
    Enums: {
      account_type:
        | "credit_card"
        | "auto_loan"
        | "mortgage"
        | "personal_loan"
        | "student_loan"
        | "collections"
      app_role:
        | "admin"
        | "moderator"
        | "user"
        | "affiliate"
        | "coach"
        | "broker"
        | "broker_team_member"
        | "super_admin"
        | "sales_rep"
        | "cs_rep"
        | "finance"
        | "viewer"
        | "client"
      btf_doc_status: "pending" | "uploaded" | "approved" | "rejected"
      btf_item_status: "pending" | "in_progress" | "complete"
      btf_phase: "build" | "stack" | "fund" | "complete"
      business_hierarchy_type:
        | "holding"
        | "parent"
        | "subsidiary"
        | "standalone"
      client_file_visibility: "internal" | "shared" | "client_upload"
      consent_type:
        | "credit_report_access"
        | "croa_rights"
        | "data_sharing"
        | "offer_display"
        | "adverse_action"
      credit_prediction_confidence: "high" | "medium" | "low"
      credit_prediction_type:
        | "score_drop_warning"
        | "score_increase_opportunity"
        | "reporting_date_optimization"
        | "account_age_risk"
        | "utilization_spike_warning"
        | "inquiry_strategy"
        | "new_account_timing"
        | "payment_history_risk"
        | "credit_mix_opportunity"
        | "funding_window_alert"
      denial_reason_category:
        | "credit_score_too_low"
        | "insufficient_time_in_business"
        | "insufficient_revenue"
        | "too_much_existing_debt"
        | "no_collateral"
        | "incomplete_application"
        | "industry_restriction"
        | "too_many_recent_inquiries"
        | "derogatory_items"
        | "insufficient_cash_flow"
        | "personal_guarantee_declined"
        | "entity_structure_issue"
        | "other"
      disclosure_type:
        | "credit_report_access"
        | "croa_rights_notice"
        | "data_sharing_consent"
        | "offer_display_disclaimer"
        | "adverse_action_routing"
        | "educational_purposes"
      dispute_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "resolved"
        | "rejected"
      entity_type: "LLC" | "Corporation" | "Sole Proprietorship" | "Partnership"
      funding_journey_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "approved"
        | "denied"
        | "withdrawn"
        | "funded"
      funding_milestone_type:
        | "first_application"
        | "first_approval"
        | "first_funding"
        | "score_threshold_crossed"
        | "debt_cleared"
        | "business_credit_established"
        | "dscr_qualified"
        | "sba_eligible"
      knowledge_category:
        | "framework"
        | "principle"
        | "practice"
        | "model"
        | "stage"
        | "implementation"
      letter_status: "draft" | "generated" | "sent" | "delivered"
      naics_risk_category:
        | "low_risk"
        | "moderate_risk"
        | "high_risk"
        | "specialized"
      notification_type:
        | "dispute_update"
        | "payment_success"
        | "subscription_change"
        | "task_reminder"
        | "credit_report_ready"
        | "welcome"
        | "system"
      order_status: "pending" | "completed" | "failed" | "refunded"
      owner_credit_bureau: "experian" | "equifax" | "transunion"
      paige_booking_event_type:
        | "vip_intro"
        | "dfy_discovery"
        | "coffee_hour"
        | "workshop"
        | "other"
      paige_booking_status:
        | "confirmed"
        | "canceled"
        | "rescheduled"
        | "no_show"
        | "completed"
      paige_enrichment_subject_type: "person" | "company"
      paige_envelope_status:
        | "sent"
        | "delivered"
        | "completed"
        | "declined"
        | "voided"
      paige_envelope_type:
        | "vip_app"
        | "coach_agreement"
        | "dfy_engagement"
        | "refund"
        | "term_sheet"
        | "other"
      paige_social_platform: "facebook" | "instagram"
      paige_social_post_status: "scheduled" | "posted" | "failed" | "deleted"
      task_status: "pending" | "in_progress" | "completed" | "cancelled"
      tenant_role: "owner" | "admin" | "coach" | "member"
      tenant_status: "trial" | "active" | "past_due" | "canceled" | "suspended"
      workflow_provider:
        | "n8n"
        | "langgraph"
        | "direct_edge_function"
        | "cron_only"
        | "langgraph_bridge"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      account_type: [
        "credit_card",
        "auto_loan",
        "mortgage",
        "personal_loan",
        "student_loan",
        "collections",
      ],
      app_role: [
        "admin",
        "moderator",
        "user",
        "affiliate",
        "coach",
        "broker",
        "broker_team_member",
        "super_admin",
        "sales_rep",
        "cs_rep",
        "finance",
        "viewer",
        "client",
      ],
      btf_doc_status: ["pending", "uploaded", "approved", "rejected"],
      btf_item_status: ["pending", "in_progress", "complete"],
      btf_phase: ["build", "stack", "fund", "complete"],
      business_hierarchy_type: [
        "holding",
        "parent",
        "subsidiary",
        "standalone",
      ],
      client_file_visibility: ["internal", "shared", "client_upload"],
      consent_type: [
        "credit_report_access",
        "croa_rights",
        "data_sharing",
        "offer_display",
        "adverse_action",
      ],
      credit_prediction_confidence: ["high", "medium", "low"],
      credit_prediction_type: [
        "score_drop_warning",
        "score_increase_opportunity",
        "reporting_date_optimization",
        "account_age_risk",
        "utilization_spike_warning",
        "inquiry_strategy",
        "new_account_timing",
        "payment_history_risk",
        "credit_mix_opportunity",
        "funding_window_alert",
      ],
      denial_reason_category: [
        "credit_score_too_low",
        "insufficient_time_in_business",
        "insufficient_revenue",
        "too_much_existing_debt",
        "no_collateral",
        "incomplete_application",
        "industry_restriction",
        "too_many_recent_inquiries",
        "derogatory_items",
        "insufficient_cash_flow",
        "personal_guarantee_declined",
        "entity_structure_issue",
        "other",
      ],
      disclosure_type: [
        "credit_report_access",
        "croa_rights_notice",
        "data_sharing_consent",
        "offer_display_disclaimer",
        "adverse_action_routing",
        "educational_purposes",
      ],
      dispute_status: [
        "draft",
        "submitted",
        "under_review",
        "resolved",
        "rejected",
      ],
      entity_type: ["LLC", "Corporation", "Sole Proprietorship", "Partnership"],
      funding_journey_status: [
        "draft",
        "submitted",
        "under_review",
        "approved",
        "denied",
        "withdrawn",
        "funded",
      ],
      funding_milestone_type: [
        "first_application",
        "first_approval",
        "first_funding",
        "score_threshold_crossed",
        "debt_cleared",
        "business_credit_established",
        "dscr_qualified",
        "sba_eligible",
      ],
      knowledge_category: [
        "framework",
        "principle",
        "practice",
        "model",
        "stage",
        "implementation",
      ],
      letter_status: ["draft", "generated", "sent", "delivered"],
      naics_risk_category: [
        "low_risk",
        "moderate_risk",
        "high_risk",
        "specialized",
      ],
      notification_type: [
        "dispute_update",
        "payment_success",
        "subscription_change",
        "task_reminder",
        "credit_report_ready",
        "welcome",
        "system",
      ],
      order_status: ["pending", "completed", "failed", "refunded"],
      owner_credit_bureau: ["experian", "equifax", "transunion"],
      paige_booking_event_type: [
        "vip_intro",
        "dfy_discovery",
        "coffee_hour",
        "workshop",
        "other",
      ],
      paige_booking_status: [
        "confirmed",
        "canceled",
        "rescheduled",
        "no_show",
        "completed",
      ],
      paige_enrichment_subject_type: ["person", "company"],
      paige_envelope_status: [
        "sent",
        "delivered",
        "completed",
        "declined",
        "voided",
      ],
      paige_envelope_type: [
        "vip_app",
        "coach_agreement",
        "dfy_engagement",
        "refund",
        "term_sheet",
        "other",
      ],
      paige_social_platform: ["facebook", "instagram"],
      paige_social_post_status: ["scheduled", "posted", "failed", "deleted"],
      task_status: ["pending", "in_progress", "completed", "cancelled"],
      tenant_role: ["owner", "admin", "coach", "member"],
      tenant_status: ["trial", "active", "past_due", "canceled", "suspended"],
      workflow_provider: [
        "n8n",
        "langgraph",
        "direct_edge_function",
        "cron_only",
        "langgraph_bridge",
      ],
    },
  },
} as const
