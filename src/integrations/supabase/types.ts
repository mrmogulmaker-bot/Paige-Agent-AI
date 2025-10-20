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
          last_sync_at: string | null
          plaid_access_token: string
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
          plaid_access_token: string
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
          plaid_access_token?: string
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
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
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
          has_document_upload: boolean
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
          has_document_upload?: boolean
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
          has_document_upload?: boolean
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { _token: string; _user_id: string }
        Returns: Json
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
      trigger_business_credit_sync: {
        Args: { _user_id: string }
        Returns: Json
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
      validate_referral_code_secure: {
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
      app_role: "admin" | "moderator" | "user" | "affiliate" | "coach"
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
      notification_type:
        | "dispute_update"
        | "payment_success"
        | "subscription_change"
        | "task_reminder"
        | "credit_report_ready"
        | "welcome"
        | "system"
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
      app_role: ["admin", "moderator", "user", "affiliate", "coach"],
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
      task_status: ["pending", "in_progress", "completed", "cancelled"],
    },
  },
} as const
