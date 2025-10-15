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
      affiliate_profiles: {
        Row: {
          application_note: string | null
          applied_at: string | null
          approved_at: string | null
          approved_by: string | null
          commission_rate: number | null
          company_name: string | null
          created_at: string | null
          id: string
          rejection_reason: string | null
          social_media_links: Json | null
          status: string
          updated_at: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          application_note?: string | null
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          commission_rate?: number | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          rejection_reason?: string | null
          social_media_links?: Json | null
          status?: string
          updated_at?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          application_note?: string | null
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          commission_rate?: number | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          rejection_reason?: string | null
          social_media_links?: Json | null
          status?: string
          updated_at?: string | null
          user_id?: string
          website?: string | null
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
      businesses: {
        Row: {
          business_type:
            | Database["public"]["Enums"]["business_hierarchy_type"]
            | null
          created_at: string | null
          dba: string | null
          display_order: number | null
          ein: string | null
          entity_type: Database["public"]["Enums"]["entity_type"] | null
          formation_status: string | null
          id: string
          legal_name: string
          naics: string | null
          organizational_level: number | null
          owner_user_id: string
          parent_business_id: string | null
          registered_agent_renewal_date: string | null
          registered_agent_state: string | null
          revenue_band: string | null
          state_of_formation: string | null
          updated_at: string | null
        }
        Insert: {
          business_type?:
            | Database["public"]["Enums"]["business_hierarchy_type"]
            | null
          created_at?: string | null
          dba?: string | null
          display_order?: number | null
          ein?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          formation_status?: string | null
          id?: string
          legal_name: string
          naics?: string | null
          organizational_level?: number | null
          owner_user_id: string
          parent_business_id?: string | null
          registered_agent_renewal_date?: string | null
          registered_agent_state?: string | null
          revenue_band?: string | null
          state_of_formation?: string | null
          updated_at?: string | null
        }
        Update: {
          business_type?:
            | Database["public"]["Enums"]["business_hierarchy_type"]
            | null
          created_at?: string | null
          dba?: string | null
          display_order?: number | null
          ein?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          formation_status?: string | null
          id?: string
          legal_name?: string
          naics?: string | null
          organizational_level?: number | null
          owner_user_id?: string
          parent_business_id?: string | null
          registered_agent_renewal_date?: string | null
          registered_agent_state?: string | null
          revenue_band?: string | null
          state_of_formation?: string | null
          updated_at?: string | null
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
      commission_payments: {
        Row: {
          affiliate_id: string
          amount: number
          conversion_ids: string[]
          created_at: string | null
          id: string
          paid_at: string | null
          payment_method: string | null
          payment_reference: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          affiliate_id: string
          amount: number
          conversion_ids: string[]
          created_at?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          affiliate_id?: string
          amount?: number
          conversion_ids?: string[]
          created_at?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_payments_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
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
          plaid_access_token: string
          plaid_item_id: string
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
          plaid_access_token: string
          plaid_item_id: string
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
          plaid_access_token?: string
          plaid_item_id?: string
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
      credit_accounts: {
        Row: {
          balance: number | null
          created_at: string | null
          creditor: string
          id: string
          limit_amount: number | null
          opened_on: string | null
          status: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string | null
          user_id: string
          utilization: number | null
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          creditor: string
          id?: string
          limit_amount?: number | null
          opened_on?: string | null
          status?: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string | null
          user_id: string
          utilization?: number | null
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          creditor?: string
          id?: string
          limit_amount?: number | null
          opened_on?: string | null
          status?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string | null
          user_id?: string
          utilization?: number | null
        }
        Relationships: []
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
      dispute_letters: {
        Row: {
          account_number: string | null
          business_name: string | null
          created_at: string | null
          dispute_type: string
          id: string
          letter_content: string | null
          status: Database["public"]["Enums"]["letter_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_number?: string | null
          business_name?: string | null
          created_at?: string | null
          dispute_type: string
          id?: string
          letter_content?: string | null
          status?: Database["public"]["Enums"]["letter_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_number?: string | null
          business_name?: string | null
          created_at?: string | null
          dispute_type?: string
          id?: string
          letter_content?: string | null
          status?: Database["public"]["Enums"]["letter_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      disputes: {
        Row: {
          account_number_masked: string | null
          bureau: string
          created_at: string | null
          creditor_name: string
          due_date: string | null
          id: string
          narrative: string | null
          open_date: string | null
          reason_code: string
          resolution_note: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_number_masked?: string | null
          bureau: string
          created_at?: string | null
          creditor_name: string
          due_date?: string | null
          id?: string
          narrative?: string | null
          open_date?: string | null
          reason_code: string
          resolution_note?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_number_masked?: string | null
          bureau?: string
          created_at?: string | null
          creditor_name?: string
          due_date?: string | null
          id?: string
          narrative?: string | null
          open_date?: string | null
          reason_code?: string
          resolution_note?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          bucket_name: string
          business_id: string | null
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
        ]
      }
      funding_offers: {
        Row: {
          affiliate_tag: string | null
          apply_url: string
          apr_range: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          limits_range: string | null
          name: string
          product_type: string
          requirements: string | null
          updated_at: string | null
        }
        Insert: {
          affiliate_tag?: string | null
          apply_url: string
          apr_range?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          limits_range?: string | null
          name: string
          product_type: string
          requirements?: string | null
          updated_at?: string | null
        }
        Update: {
          affiliate_tag?: string | null
          apply_url?: string
          apr_range?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          limits_range?: string | null
          name?: string
          product_type?: string
          requirements?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      pii_access_log: {
        Row: {
          access_type: string
          accessed_at: string | null
          accessed_user_id: string
          accessor_user_id: string
          field_names: string[]
          id: string
          ip_address: unknown | null
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
          ip_address?: unknown | null
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
          ip_address?: unknown | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string | null
          created_at: string | null
          date_of_birth: string | null
          dob_last4: string | null
          full_name: string | null
          id: string
          phone: string | null
          postal_code: string | null
          ssn_encrypted: string | null
          state: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          dob_last4?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          postal_code?: string | null
          ssn_encrypted?: string | null
          state?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          dob_last4?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          postal_code?: string | null
          ssn_encrypted?: string | null
          state?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          affiliate_id: string
          clicks: number | null
          code: string
          conversions: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          affiliate_id: string
          clicks?: number | null
          code: string
          conversions?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          affiliate_id?: string
          clicks?: number | null
          code?: string
          conversions?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_conversions: {
        Row: {
          affiliate_id: string
          commission_amount: number
          commission_rate: number
          converted_at: string | null
          created_at: string | null
          id: string
          order_amount: number
          order_id: string | null
          referral_code_id: string
          referred_user_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          affiliate_id: string
          commission_amount: number
          commission_rate: number
          converted_at?: string | null
          created_at?: string | null
          id?: string
          order_amount: number
          order_id?: string | null
          referral_code_id: string
          referred_user_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          affiliate_id?: string
          commission_amount?: number
          commission_rate?: number
          converted_at?: string | null
          created_at?: string | null
          id?: string
          order_amount?: number
          order_id?: string | null
          referral_code_id?: string
          referred_user_id?: string
          status?: string
          updated_at?: string | null
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
            foreignKeyName: "referral_conversions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_conversions_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          ai_chat_limit: number | null
          created_at: string | null
          dispute_limit: number | null
          features: Json
          has_business_credit: boolean | null
          has_funding_tools: boolean | null
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
          has_funding_tools?: boolean | null
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
          has_funding_tools?: boolean | null
          id?: string
          name?: string
          price?: number
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          biz_id: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          metadata: Json | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          track: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          biz_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          track?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          biz_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          metadata?: Json | null
          status?: Database["public"]["Enums"]["task_status"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: {
          _function_name: string
          _max_requests?: number
          _user_id: string
          _window_minutes?: number
        }
        Returns: boolean
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      validate_referral_code: {
        Args: { _code: string }
        Returns: {
          affiliate_id: string
          is_valid: boolean
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
      app_role: "admin" | "moderator" | "user" | "affiliate"
      business_hierarchy_type:
        | "holding"
        | "parent"
        | "subsidiary"
        | "standalone"
      dispute_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "resolved"
        | "rejected"
      entity_type: "LLC" | "Corporation" | "Sole Proprietorship" | "Partnership"
      knowledge_category:
        | "framework"
        | "principle"
        | "practice"
        | "model"
        | "stage"
        | "implementation"
      letter_status: "draft" | "generated" | "sent" | "delivered"
      order_status: "pending" | "completed" | "failed" | "refunded"
      task_status: "pending" | "in_progress" | "completed" | "cancelled"
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
      app_role: ["admin", "moderator", "user", "affiliate"],
      business_hierarchy_type: [
        "holding",
        "parent",
        "subsidiary",
        "standalone",
      ],
      dispute_status: [
        "draft",
        "submitted",
        "under_review",
        "resolved",
        "rejected",
      ],
      entity_type: ["LLC", "Corporation", "Sole Proprietorship", "Partnership"],
      knowledge_category: [
        "framework",
        "principle",
        "practice",
        "model",
        "stage",
        "implementation",
      ],
      letter_status: ["draft", "generated", "sent", "delivered"],
      order_status: ["pending", "completed", "failed", "refunded"],
      task_status: ["pending", "in_progress", "completed", "cancelled"],
    },
  },
} as const
