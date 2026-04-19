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
        ]
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
      businesses: {
        Row: {
          bank_account_opened_date: string | null
          bank_name: string | null
          build_assessed_at: string | null
          build_assessment_answers: Json | null
          build_score: number | null
          business_address_type: string | null
          business_city: string | null
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
          dnb_duns: string | null
          dnb_failure_score: number | null
          dnb_last_verified: string | null
          dnb_paydex: number | null
          ein: string | null
          entity_type: Database["public"]["Enums"]["entity_type"] | null
          equifax_credit_risk: number | null
          equifax_failure_score: number | null
          equifax_last_verified: string | null
          equifax_payment_index: number | null
          experian_intelliscore: number | null
          experian_last_verified: string | null
          fico_sbss: number | null
          fico_sbss_last_verified: string | null
          formation_date: string | null
          formation_status: string | null
          has_bank_account: boolean | null
          id: string
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
        }
        Insert: {
          bank_account_opened_date?: string | null
          bank_name?: string | null
          build_assessed_at?: string | null
          build_assessment_answers?: Json | null
          build_score?: number | null
          business_address_type?: string | null
          business_city?: string | null
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
          dnb_duns?: string | null
          dnb_failure_score?: number | null
          dnb_last_verified?: string | null
          dnb_paydex?: number | null
          ein?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          equifax_credit_risk?: number | null
          equifax_failure_score?: number | null
          equifax_last_verified?: string | null
          equifax_payment_index?: number | null
          experian_intelliscore?: number | null
          experian_last_verified?: string | null
          fico_sbss?: number | null
          fico_sbss_last_verified?: string | null
          formation_date?: string | null
          formation_status?: string | null
          has_bank_account?: boolean | null
          id?: string
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
        }
        Update: {
          bank_account_opened_date?: string | null
          bank_name?: string | null
          build_assessed_at?: string | null
          build_assessment_answers?: Json | null
          build_score?: number | null
          business_address_type?: string | null
          business_city?: string | null
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
          dnb_duns?: string | null
          dnb_failure_score?: number | null
          dnb_last_verified?: string | null
          dnb_paydex?: number | null
          ein?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"] | null
          equifax_credit_risk?: number | null
          equifax_failure_score?: number | null
          equifax_last_verified?: string | null
          equifax_payment_index?: number | null
          experian_intelliscore?: number | null
          experian_last_verified?: string | null
          fico_sbss?: number | null
          fico_sbss_last_verified?: string | null
          formation_date?: string | null
          formation_status?: string | null
          has_bank_account?: boolean | null
          id?: string
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
        ]
      }
      clients: {
        Row: {
          city: string | null
          created_at: string
          created_by: string
          current_notes: string | null
          email: string | null
          entity_name: string | null
          entity_type: string | null
          first_name: string
          funding_goal: number | null
          id: string
          last_name: string
          linked_user_id: string | null
          monthly_revenue: number | null
          phone: string | null
          state: string | null
          status: string
          street_address: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by: string
          current_notes?: string | null
          email?: string | null
          entity_name?: string | null
          entity_type?: string | null
          first_name: string
          funding_goal?: number | null
          id?: string
          last_name: string
          linked_user_id?: string | null
          monthly_revenue?: number | null
          phone?: string | null
          state?: string | null
          status?: string
          street_address?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string
          current_notes?: string | null
          email?: string | null
          entity_name?: string | null
          entity_type?: string | null
          first_name?: string
          funding_goal?: number | null
          id?: string
          last_name?: string
          linked_user_id?: string | null
          monthly_revenue?: number | null
          phone?: string | null
          state?: string | null
          status?: string
          street_address?: string | null
          updated_at?: string
          zip_code?: string | null
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
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
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
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
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
            foreignKeyName: "extraction_quality_log_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "credit_report_uploads"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "funding_matches_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "funding_offers"
            referencedColumns: ["id"]
          },
        ]
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
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["app_role"]
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
          role?: Database["public"]["Enums"]["app_role"]
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
          role?: Database["public"]["Enums"]["app_role"]
          token?: string | null
          token_hash?: string | null
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
          created_at: string | null
          ein_only: boolean | null
          id: string
          is_active: boolean | null
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
          product_name: string
          product_type: string
          requires_duns: boolean
          requires_pg: boolean | null
          term_months: number | null
          updated_at: string | null
        }
        Insert: {
          affiliate_commission_pct?: number | null
          affiliate_url?: string | null
          application_url?: string | null
          apr_range_high?: number | null
          apr_range_low?: number | null
          created_at?: string | null
          ein_only?: boolean | null
          id?: string
          is_active?: boolean | null
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
          product_name: string
          product_type: string
          requires_duns?: boolean
          requires_pg?: boolean | null
          term_months?: number | null
          updated_at?: string | null
        }
        Update: {
          affiliate_commission_pct?: number | null
          affiliate_url?: string | null
          application_url?: string | null
          apr_range_high?: number | null
          apr_range_low?: number | null
          created_at?: string | null
          ein_only?: boolean | null
          id?: string
          is_active?: boolean | null
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
          product_name?: string
          product_type?: string
          requires_duns?: boolean
          requires_pg?: boolean | null
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
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string | null
          created_at: string | null
          credit_goals: Json | null
          cross_bureau_discrepancies: Json | null
          dashboard_mode: string
          date_of_birth: string | null
          dob_last4: string | null
          estimated_fico_eq: number | null
          estimated_fico_ex: number | null
          estimated_fico_tu: number | null
          full_name: string | null
          funding_goals: Json | null
          ghl_contact_id: string | null
          has_discrepancies: boolean | null
          id: string
          last_report_analyzed_at: string | null
          last_report_source: string | null
          onboarding_completed: boolean | null
          onboarding_step: string | null
          phone: string | null
          pme_phase: string | null
          postal_code: string | null
          referral_code: string | null
          score_model: string | null
          ssn_encrypted: string | null
          ssn_last_4: string | null
          state: string | null
          stripe_customer_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string | null
          credit_goals?: Json | null
          cross_bureau_discrepancies?: Json | null
          dashboard_mode?: string
          date_of_birth?: string | null
          dob_last4?: string | null
          estimated_fico_eq?: number | null
          estimated_fico_ex?: number | null
          estimated_fico_tu?: number | null
          full_name?: string | null
          funding_goals?: Json | null
          ghl_contact_id?: string | null
          has_discrepancies?: boolean | null
          id?: string
          last_report_analyzed_at?: string | null
          last_report_source?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: string | null
          phone?: string | null
          pme_phase?: string | null
          postal_code?: string | null
          referral_code?: string | null
          score_model?: string | null
          ssn_encrypted?: string | null
          ssn_last_4?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string | null
          credit_goals?: Json | null
          cross_bureau_discrepancies?: Json | null
          dashboard_mode?: string
          date_of_birth?: string | null
          dob_last4?: string | null
          estimated_fico_eq?: number | null
          estimated_fico_ex?: number | null
          estimated_fico_tu?: number | null
          full_name?: string | null
          funding_goals?: Json | null
          ghl_contact_id?: string | null
          has_discrepancies?: boolean | null
          id?: string
          last_report_analyzed_at?: string | null
          last_report_source?: string | null
          onboarding_completed?: boolean | null
          onboarding_step?: string | null
          phone?: string | null
          pme_phase?: string | null
          postal_code?: string | null
          referral_code?: string | null
          score_model?: string | null
          ssn_encrypted?: string | null
          ssn_last_4?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
          description: string | null
          due_date: string | null
          id: string
          metadata: Json | null
          reminder_sent: boolean
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
          reminder_sent?: boolean
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
          reminder_sent?: boolean
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
      approve_affiliate_application: {
        Args: { _application_id: string; _notes?: string; _tier_key?: string }
        Returns: Json
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
      delete_credit_report_upload: {
        Args: { _calling_user_id: string; _upload_id: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
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
      get_profile_with_pii_log: {
        Args: { _user_id: string }
        Returns: {
          address: string | null
          avatar_url: string | null
          city: string | null
          created_at: string | null
          credit_goals: Json | null
          cross_bureau_discrepancies: Json | null
          dashboard_mode: string
          date_of_birth: string | null
          dob_last4: string | null
          estimated_fico_eq: number | null
          estimated_fico_ex: number | null
          estimated_fico_tu: number | null
          full_name: string | null
          funding_goals: Json | null
          ghl_contact_id: string | null
          has_discrepancies: boolean | null
          id: string
          last_report_analyzed_at: string | null
          last_report_source: string | null
          onboarding_completed: boolean | null
          onboarding_step: string | null
          phone: string | null
          pme_phase: string | null
          postal_code: string | null
          referral_code: string | null
          score_model: string | null
          ssn_encrypted: string | null
          ssn_last_4: string | null
          state: string | null
          stripe_customer_id: string | null
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_platform_owner: { Args: never; Returns: boolean }
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
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reject_affiliate_application: {
        Args: { _application_id: string; _notes?: string }
        Returns: Json
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
      app_role: "admin" | "moderator" | "user" | "affiliate" | "coach"
      business_hierarchy_type:
        | "holding"
        | "parent"
        | "subsidiary"
        | "standalone"
      consent_type:
        | "credit_report_access"
        | "croa_rights"
        | "data_sharing"
        | "offer_display"
        | "adverse_action"
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
      consent_type: [
        "credit_report_access",
        "croa_rights",
        "data_sharing",
        "offer_display",
        "adverse_action",
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
      task_status: ["pending", "in_progress", "completed", "cancelled"],
    },
  },
} as const
