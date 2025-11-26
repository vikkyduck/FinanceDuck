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
      access_tokens: {
        Row: {
          client_id: string | null
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          partner_id: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          client_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          partner_id?: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          client_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          partner_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "access_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_tokens_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_bonuses: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assistant_token_id: string | null
          client_acts_count: number
          created_at: string
          executor_receipts_count: number
          id: string
          paid_at: string | null
          paid_by: string | null
          payment_method: string | null
          payment_notes: string | null
          payment_reference: string | null
          payment_status: string | null
          total_bonus_amount: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assistant_token_id?: string | null
          client_acts_count?: number
          created_at?: string
          executor_receipts_count?: number
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          total_bonus_amount?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assistant_token_id?: string | null
          client_acts_count?: number
          created_at?: string
          executor_receipts_count?: number
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          total_bonus_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_bonuses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_bonuses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      client_partners: {
        Row: {
          client_id: string
          created_at: string
          id: string
          partner_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          partner_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_partners_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_partners_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      client_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date: string
          payment_method?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string | null
          telegram: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          telegram?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          telegram?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      executor_expenses: {
        Row: {
          amount: number
          commission_rate: number | null
          created_at: string
          created_by: string
          date: string
          description: string
          id: string
          invoice_id: string
          is_admin_expense: boolean | null
          scheme: Database["public"]["Enums"]["invoice_scheme"] | null
        }
        Insert: {
          amount: number
          commission_rate?: number | null
          created_at?: string
          created_by: string
          date?: string
          description: string
          id?: string
          invoice_id: string
          is_admin_expense?: boolean | null
          scheme?: Database["public"]["Enums"]["invoice_scheme"] | null
        }
        Update: {
          amount?: number
          commission_rate?: number | null
          created_at?: string
          created_by?: string
          date?: string
          description?: string
          id?: string
          invoice_id?: string
          is_admin_expense?: boolean | null
          scheme?: Database["public"]["Enums"]["invoice_scheme"] | null
        }
        Relationships: [
          {
            foreignKeyName: "executor_expenses_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_calculations: {
        Row: {
          admin_share_50: number | null
          admin_share_from_margin: number | null
          agency_margin: number | null
          amount_to_admin: number | null
          assistant_bonus_client_acts: number | null
          assistant_bonus_executor_receipts: number | null
          assistant_bonus_paid: boolean | null
          assistant_bonus_total: number | null
          cat_share_50: number | null
          client_base_after_margin: number | null
          client_bill: number
          client_remaining: number | null
          client_spent: number | null
          commission_amount: number | null
          commission_rate: number | null
          created_at: string
          executor_expenses_total: number | null
          id: string
          invoice_id: string
          net_profit_admin: number | null
          partner_share_from_margin: number | null
          updated_at: string
        }
        Insert: {
          admin_share_50?: number | null
          admin_share_from_margin?: number | null
          agency_margin?: number | null
          amount_to_admin?: number | null
          assistant_bonus_client_acts?: number | null
          assistant_bonus_executor_receipts?: number | null
          assistant_bonus_paid?: boolean | null
          assistant_bonus_total?: number | null
          cat_share_50?: number | null
          client_base_after_margin?: number | null
          client_bill: number
          client_remaining?: number | null
          client_spent?: number | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string
          executor_expenses_total?: number | null
          id?: string
          invoice_id: string
          net_profit_admin?: number | null
          partner_share_from_margin?: number | null
          updated_at?: string
        }
        Update: {
          admin_share_50?: number | null
          admin_share_from_margin?: number | null
          agency_margin?: number | null
          amount_to_admin?: number | null
          assistant_bonus_client_acts?: number | null
          assistant_bonus_executor_receipts?: number | null
          assistant_bonus_paid?: boolean | null
          assistant_bonus_total?: number | null
          cat_share_50?: number | null
          client_base_after_margin?: number | null
          client_bill?: number
          client_remaining?: number | null
          client_spent?: number | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string
          executor_expenses_total?: number | null
          id?: string
          invoice_id?: string
          net_profit_admin?: number | null
          partner_share_from_margin?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_calculations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_documents: {
        Row: {
          document_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          invoice_id: string
          mime_type: string | null
          notes: string | null
          uploaded_at: string | null
          uploaded_by_token_id: string | null
        }
        Insert: {
          document_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          invoice_id: string
          mime_type?: string | null
          notes?: string | null
          uploaded_at?: string | null
          uploaded_by_token_id?: string | null
        }
        Update: {
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          invoice_id?: string
          mime_type?: string | null
          notes?: string | null
          uploaded_at?: string | null
          uploaded_by_token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_documents_uploaded_by_token_id_fkey"
            columns: ["uploaded_by_token_id"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          actual_payment_date: string | null
          client_id: string
          created_at: string
          created_by: string
          hidden_from_assistant: boolean
          id: string
          invoice_number: string
          notes: string | null
          partner_commission_rate: number | null
          partner_id: string
          payment_date: string | null
          priority_level: string | null
          scheme: Database["public"]["Enums"]["invoice_scheme"]
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }
        Insert: {
          actual_payment_date?: string | null
          client_id: string
          created_at?: string
          created_by: string
          hidden_from_assistant?: boolean
          id?: string
          invoice_number: string
          notes?: string | null
          partner_commission_rate?: number | null
          partner_id: string
          payment_date?: string | null
          priority_level?: string | null
          scheme: Database["public"]["Enums"]["invoice_scheme"]
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Update: {
          actual_payment_date?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          hidden_from_assistant?: boolean
          id?: string
          invoice_number?: string
          notes?: string | null
          partner_commission_rate?: number | null
          partner_id?: string
          payment_date?: string | null
          priority_level?: string | null
          scheme?: Database["public"]["Enums"]["invoice_scheme"]
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          access_code: string
          created_at: string | null
          failure_reason: string | null
          id: string
          ip_address: string | null
          success: boolean
          token_id: string | null
          user_agent: string | null
        }
        Insert: {
          access_code: string
          created_at?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success: boolean
          token_id?: string | null
          user_agent?: string | null
        }
        Update: {
          access_code?: string
          created_at?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          token_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_attempts_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_financial_plans: {
        Row: {
          created_at: string
          created_by: string
          id: string
          month: number
          planned_admin_share: number
          planned_cat_share: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          month: number
          planned_admin_share?: number
          planned_cat_share?: number
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          month?: number
          planned_admin_share?: number
          planned_cat_share?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      partner_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          invoice_id: string | null
          notes: string | null
          partner_id: string
          payment_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          partner_id: string
          payment_date: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          partner_id?: string
          payment_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_payments_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string | null
          telegram: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          telegram?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          telegram?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_state: {
        Row: {
          blocked_until: string | null
          limit_type: Database["public"]["Enums"]["rate_limit_type"]
          request_count: number | null
          user_identifier: string
          violation_count: number | null
          window_start: string | null
        }
        Insert: {
          blocked_until?: string | null
          limit_type: Database["public"]["Enums"]["rate_limit_type"]
          request_count?: number | null
          user_identifier: string
          violation_count?: number | null
          window_start?: string | null
        }
        Update: {
          blocked_until?: string | null
          limit_type?: Database["public"]["Enums"]["rate_limit_type"]
          request_count?: number | null
          user_identifier?: string
          violation_count?: number | null
          window_start?: string | null
        }
        Relationships: []
      }
      rate_limit_violations: {
        Row: {
          blocked_until: string | null
          created_at: string | null
          id: string
          last_violation_at: string | null
          limit_type: Database["public"]["Enums"]["rate_limit_type"]
          user_identifier: string
          violation_count: number | null
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string | null
          id?: string
          last_violation_at?: string | null
          limit_type: Database["public"]["Enums"]["rate_limit_type"]
          user_identifier: string
          violation_count?: number | null
        }
        Update: {
          blocked_until?: string | null
          created_at?: string | null
          id?: string
          last_violation_at?: string | null
          limit_type?: Database["public"]["Enums"]["rate_limit_type"]
          user_identifier?: string
          violation_count?: number | null
        }
        Relationships: []
      }
      reconciliation_records: {
        Row: {
          actual_client_payment: number | null
          actual_partner_payment: number | null
          client_variance: number | null
          created_at: string | null
          expected_client_payment: number
          expected_partner_payment: number | null
          id: string
          invoice_id: string
          partner_variance: number | null
          reconciled_at: string | null
          reconciled_by: string | null
          reconciliation_notes: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          actual_client_payment?: number | null
          actual_partner_payment?: number | null
          client_variance?: number | null
          created_at?: string | null
          expected_client_payment: number
          expected_partner_payment?: number | null
          id?: string
          invoice_id: string
          partner_variance?: number | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_notes?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_client_payment?: number | null
          actual_partner_payment?: number | null
          client_variance?: number | null
          created_at?: string | null
          expected_client_payment?: number
          expected_partner_payment?: number | null
          id?: string
          invoice_id?: string
          partner_variance?: number | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_notes?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_records_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_records_reconciled_by_fkey"
            columns: ["reconciled_by"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoices: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          day_of_month: number
          frequency: string
          id: string
          is_active: boolean
          last_generated_at: string | null
          next_invoice_date: string
          notes: string | null
          partner_commission_rate: number | null
          partner_id: string
          scheme: Database["public"]["Enums"]["invoice_scheme"]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          day_of_month: number
          frequency: string
          id?: string
          is_active?: boolean
          last_generated_at?: string | null
          next_invoice_date: string
          notes?: string | null
          partner_commission_rate?: number | null
          partner_id: string
          scheme: Database["public"]["Enums"]["invoice_scheme"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          day_of_month?: number
          frequency?: string
          id?: string
          is_active?: boolean
          last_generated_at?: string | null
          next_invoice_date?: string
          notes?: string | null
          partner_commission_rate?: number | null
          partner_id?: string
          scheme?: Database["public"]["Enums"]["invoice_scheme"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          created_at: string | null
          details: Json | null
          event_type: Database["public"]["Enums"]["security_event_type"]
          id: string
          ip_address: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["security_severity"]
          token_id: string | null
          user_agent: string | null
          user_identifier: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_type: Database["public"]["Enums"]["security_event_type"]
          id?: string
          ip_address?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["security_severity"]
          token_id?: string | null
          user_agent?: string | null
          user_identifier?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_type?: Database["public"]["Enums"]["security_event_type"]
          id?: string
          ip_address?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["security_severity"]
          token_id?: string | null
          user_agent?: string | null
          user_identifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_events_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          access_token_id: string | null
          created_at: string
          id: string
          partner_id: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          access_token_id?: string | null
          created_at?: string
          id?: string
          partner_id?: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          access_token_id?: string | null
          created_at?: string
          id?: string
          partner_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_access_token_id_fkey"
            columns: ["access_token_id"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          access_token_id: string
          created_at: string
          csrf_token: string
          expires_at: string
          id: string
          ip_address: string | null
          last_activity: string
          revoked: boolean | null
          session_id: string
          user_agent: string | null
        }
        Insert: {
          access_token_id: string
          created_at?: string
          csrf_token: string
          expires_at: string
          id?: string
          ip_address?: string | null
          last_activity?: string
          revoked?: boolean | null
          session_id: string
          user_agent?: string | null
        }
        Update: {
          access_token_id?: string
          created_at?: string
          csrf_token?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          last_activity?: string
          revoked?: boolean | null
          session_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_access_token_id_fkey"
            columns: ["access_token_id"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      working_capital_balance: {
        Row: {
          amount: number
          id: string
          notes: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount?: number
          id?: string
          notes?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number
          id?: string
          notes?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "working_capital_balance_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_executor_expense: {
        Args: {
          _amount: number
          _date?: string
          _description: string
          _invoice_id: string
          _is_admin_expense?: boolean
          _token_id: string
        }
        Returns: string
      }
      assistant_can_see_invoice: {
        Args: { _invoice_id: string }
        Returns: boolean
      }
      can_add_expense_to_invoice: {
        Args: { _invoice_id: string; _token_id: string }
        Returns: boolean
      }
      check_login_lockout: {
        Args: { _access_code: string }
        Returns: {
          attempt_count: number
          is_locked: boolean
          locked_until: string
        }[]
      }
      cleanup_deleted_partners: { Args: never; Returns: undefined }
      cleanup_expired_sessions: { Args: never; Returns: number }
      create_invoice_with_context: {
        Args: {
          _calculations?: Json
          _client_id: string
          _hidden_from_assistant?: boolean
          _invoice_number: string
          _notes?: string
          _partner_commission_rate?: number
          _partner_id: string
          _payment_date?: string
          _scheme: Database["public"]["Enums"]["invoice_scheme"]
          _status?: Database["public"]["Enums"]["invoice_status"]
          _token_id: string
        }
        Returns: {
          invoice_id: string
          message: string
          success: boolean
        }[]
      }
      create_session: {
        Args: {
          _access_token_id: string
          _ip_address?: string
          _user_agent?: string
        }
        Returns: {
          csrf_token: string
          expires_at: string
          session_id: string
        }[]
      }
      get_admin_cashflow_forecast: {
        Args: { _token_id: string }
        Returns: {
          current_balance: number
          month_name: string
          month_index: number
          expected_income: number
          expected_expenses: number
          net_flow: number
          cumulative_balance: number
        }[]
      }
      get_admin_forecast: {
        Args: { _months_ahead?: number; _token_id: string }
        Returns: {
          expected_amount: number
          month_index: number
          month_name: string
          received_amount: number
          year_num: number
        }[]
      }
      get_admin_hero_metrics: {
        Args: { _period?: string; _token_id: string }
        Returns: {
          leverage_ratio: number
          my_net_profit: number
          working_capital: number
          working_capital_warning: boolean
        }[]
      }
      get_admin_monthly_data: {
        Args: { _token_id: string; _year: number }
        Returns: {
          admin_share: number
          cat_share: number
          cumulative_profit: number
          expenses: number
          invoice_count: number
          month_name: string
          month_number: number
          total_profit: number
          total_sales: number
        }[]
      }
      get_admin_stats: {
        Args: { _token_id: string }
        Returns: {
          current_month_admin_share: number
          current_month_cat_share: number
          current_month_invoices_count: number
          current_month_profit: number
          current_month_revenue: number
          expected_revenue_3months: number
          previous_month_profit: number
          previous_month_revenue: number
          profit_trend: number
          revenue_trend: number
          total_client_remaining: number
        }[]
      }
      get_assistant_stats_invoices: {
        Args: { _token_id: string; _year: number }
        Returns: {
          actual_payment_date: string
          agency_margin: number
          assistant_bonus_total: number
          client_bill: number
          client_id: string
          client_id_ref: string
          client_name: string
          client_spent: number
          commission_amount: number
          created_at: string
          executor_expenses_total: number
          id: string
          invoice_number: string
          partner_id: string
          partner_id_ref: string
          partner_name: string
          partner_share_from_margin: number
          scheme: Database["public"]["Enums"]["invoice_scheme"]
          status: Database["public"]["Enums"]["invoice_status"]
        }[]
      }
      get_client_partners: {
        Args: { _client_id: string }
        Returns: {
          id: string
          name: string
          phone: string
          telegram: string
        }[]
      }
      get_clients_for_user: {
        Args: { _token_id: string }
        Returns: {
          created_at: string
          id: string
          name: string
          phone: string
          telegram: string
          updated_at: string
        }[]
      }
      get_invoice_details: {
        Args: { _invoice_id: string; _token_id: string }
        Returns: {
          actual_payment_date: string
          client_id: string
          client_name: string
          client_phone: string
          client_telegram: string
          created_at: string
          created_by: string
          hidden_from_assistant: boolean
          id: string
          invoice_number: string
          notes: string
          partner_commission_rate: number
          partner_id: string
          partner_name: string
          partner_phone: string
          partner_telegram: string
          payment_date: string
          priority_level: string
          scheme: Database["public"]["Enums"]["invoice_scheme"]
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }[]
      }
      get_invoices_for_user: {
        Args: { _client_id?: string; _partner_id?: string; _token_id: string }
        Returns: {
          actual_payment_date: string
          admin_share_50: number
          admin_share_from_margin: number
          agency_margin: number
          amount_to_admin: number
          assistant_bonus_total: number
          cat_share_50: number
          client_base_after_margin: number
          client_bill: number
          client_id: string
          client_name: string
          client_remaining: number
          client_spent: number
          commission_amount: number
          commission_rate: number
          created_at: string
          created_by: string
          executor_expenses_total: number
          hidden_from_assistant: boolean
          id: string
          invoice_number: string
          net_profit_admin: number
          notes: string
          partner_commission_rate: number
          partner_id: string
          partner_name: string
          partner_share_from_margin: number
          payment_date: string
          priority_level: string
          scheme: Database["public"]["Enums"]["invoice_scheme"]
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }[]
      }
      get_or_create_project: {
        Args: { _client_id: string; _created_by: string; _partner_id: string }
        Returns: string
      }
      get_partner_debt_to_admin: {
        Args: { _partner_id: string }
        Returns: {
          admin_expenses: number
          client_remaining_total: number
          debt_to_admin: number
          partner_commission: number
          partner_expenses: number
          remaining_debt: number
          total_inflow: number
          total_paid_to_admin: number
        }[]
      }
      get_partner_debt_to_admin_by_project: {
        Args: { _project_id: string }
        Returns: {
          admin_expenses: number
          debt_to_admin: number
          partner_commission: number
          partner_expenses: number
          total_inflow: number
        }[]
      }
      get_partners_for_user: {
        Args: { _token_id: string }
        Returns: {
          created_at: string
          id: string
          name: string
          phone: string
          telegram: string
          updated_at: string
        }[]
      }
      get_project_finances: { Args: { _project_id: string }; Returns: Json }
      get_project_remaining_budget: {
        Args: { _client_id: string; _partner_id: string }
        Returns: number
      }
      get_project_remaining_budget_by_id: {
        Args: { _project_id: string }
        Returns: number
      }
      get_session_token_id: { Args: never; Returns: string }
      get_token_client_id: { Args: { _token_id: string }; Returns: string }
      get_token_partner_id: { Args: { _token_id: string }; Returns: string }
      is_admin: { Args: { _token_id: string }; Returns: boolean }
      is_assistant: { Args: { _token_id: string }; Returns: boolean }
      is_client: { Args: { _token_id: string }; Returns: boolean }
      is_partner: { Args: { _token_id: string }; Returns: boolean }
      log_data_export: {
        Args: {
          _export_type: string
          _record_count: number
          _token_id?: string
        }
        Returns: undefined
      }
      manage_clients_add: {
        Args: {
          _name: string
          _partner_ids?: string[]
          _phone?: string
          _telegram?: string
          _token_id: string
        }
        Returns: string
      }
      manage_clients_delete: {
        Args: { _client_id: string; _token_id: string }
        Returns: Json
      }
      manage_clients_list: {
        Args: { _token_id: string }
        Returns: {
          created_at: string
          id: string
          name: string
          partner_ids: string[]
          partner_names: string[]
          phone: string
          telegram: string
          updated_at: string
        }[]
      }
      manage_clients_update_partners: {
        Args: { _client_id: string; _partner_ids: string[]; _token_id: string }
        Returns: undefined
      }
      manage_partners_add: {
        Args: {
          _name: string
          _phone?: string
          _telegram: string
          _token_id: string
        }
        Returns: string
      }
      manage_partners_delete: {
        Args: { _partner_id: string; _token_id: string }
        Returns: Json
      }
      manage_partners_list: {
        Args: { _token_id: string }
        Returns: {
          created_at: string
          id: string
          name: string
          phone: string
          telegram: string
          updated_at: string
        }[]
      }
      recalculate_all_invoices: {
        Args: { _invoice_id?: string }
        Returns: Json
      }
      refresh_session: { Args: { _session_id: string }; Returns: string }
      resolve_security_event: {
        Args: { _event_id: string; _resolved_by?: string }
        Returns: undefined
      }
      revoke_session: { Args: { _session_id: string }; Returns: undefined }
      set_session_context: { Args: { _token_id: string }; Returns: undefined }
      validate_session: {
        Args: { _csrf_token?: string; _session_id: string }
        Returns: {
          access_token_id: string
          client_id: string
          csrf_token: string
          is_valid: boolean
          partner_id: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      validate_session_token: { Args: { _token_id: string }; Returns: boolean }
      verify_access_code:
        | {
            Args: { _code: string; _ip_address?: string; _user_agent?: string }
            Returns: {
              attempts_remaining: number
              client_id: string
              is_locked: boolean
              is_valid: boolean
              locked_until: string
              partner_id: string
              role: Database["public"]["Enums"]["user_role"]
              token_id: string
            }[]
          }
        | {
            Args: { _code: string }
            Returns: {
              client_id: string
              is_valid: boolean
              partner_id: string
              role: Database["public"]["Enums"]["user_role"]
              token_id: string
            }[]
          }
    }
    Enums: {
      invoice_scheme: "agency_30" | "commission_based"
      invoice_status:
        | "draft"
        | "pending_approval"
        | "sent"
        | "paid"
        | "cancelled"
      payer_type: "admin" | "partner" | "client"
      rate_limit_type: "api" | "form" | "search" | "login" | "export" | "bulk"
      security_event_type:
        | "login_success"
        | "login_failure"
        | "rate_limit_exceeded"
        | "bulk_operation"
        | "data_export"
        | "admin_action"
        | "suspicious_pattern"
        | "account_locked"
        | "account_unlocked"
        | "missing_session_context"
        | "token_mismatch_attack"
      security_severity: "low" | "medium" | "high" | "critical"
      transaction_type: "income" | "expense"
      user_role: "assistant" | "partner" | "admin" | "client"
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
      invoice_scheme: ["agency_30", "commission_based"],
      invoice_status: [
        "draft",
        "pending_approval",
        "sent",
        "paid",
        "cancelled",
      ],
      payer_type: ["admin", "partner", "client"],
      rate_limit_type: ["api", "form", "search", "login", "export", "bulk"],
      security_event_type: [
        "login_success",
        "login_failure",
        "rate_limit_exceeded",
        "bulk_operation",
        "data_export",
        "admin_action",
        "suspicious_pattern",
        "account_locked",
        "account_unlocked",
        "missing_session_context",
        "token_mismatch_attack",
      ],
      security_severity: ["low", "medium", "high", "critical"],
      transaction_type: ["income", "expense"],
      user_role: ["assistant", "partner", "admin", "client"],
    },
  },
} as const
