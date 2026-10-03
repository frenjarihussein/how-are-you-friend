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
      accounts: {
        Row: {
          code: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          is_active: boolean
          is_group: boolean
          name: string
          nature: Database["public"]["Enums"]["account_nature"]
          notes: string | null
          parent_id: string | null
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_active?: boolean
          is_group?: boolean
          name: string
          nature?: Database["public"]["Enums"]["account_nature"]
          notes?: string | null
          parent_id?: string | null
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_active?: boolean
          is_group?: boolean
          name?: string
          nature?: Database["public"]["Enums"]["account_nature"]
          notes?: string | null
          parent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          attach_type: string
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          notes: string | null
          size_bytes: number | null
          tenant_id: string
        }
        Insert: {
          attach_type?: string
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          size_bytes?: number | null
          tenant_id: string
        }
        Update: {
          attach_type?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          size_bytes?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      backups: {
        Row: {
          created_at: string
          file_path: string
          id: string
          size_bytes: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          size_bytes?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          size_bytes?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      banks: {
        Row: {
          account_id: string | null
          account_no: string | null
          branch: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          account_id?: string | null
          account_no?: string | null
          branch?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          account_id?: string | null
          account_no?: string | null
          branch?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      boq_items: {
        Row: {
          created_at: string
          id: string
          item_name: string
          project_id: string
          qty: number
          tenant_id: string
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          project_id: string
          qty?: number
          tenant_id: string
          unit?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          project_id?: string
          qty?: number
          tenant_id?: string
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "boq_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boq_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cheques: {
        Row: {
          amount: number
          bank_id: string | null
          cheque_no: string
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          direction: string
          due_date: string
          id: string
          issue_date: string
          notes: string | null
          partner_id: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          amount: number
          bank_id?: string | null
          cheque_no: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          direction?: string
          due_date?: string
          id?: string
          issue_date?: string
          notes?: string | null
          partner_id?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          bank_id?: string | null
          cheque_no?: string
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          direction?: string
          due_date?: string
          id?: string
          issue_date?: string
          notes?: string | null
          partner_id?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cheques_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          symbol: string | null
          tenant_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          symbol?: string | null
          tenant_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          symbol?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "currencies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_lines: {
        Row: {
          created_at: string
          document_id: string
          id: string
          product_id: string
          qty: number
          tenant_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          product_id: string
          qty: number
          tenant_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          product_id?: string
          qty?: number
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          account_id: string | null
          amount: number
          converted_document_id: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          doc_date: string
          doc_no: number | null
          doc_type: string
          exchange_rate: number
          id: string
          journal_entry_id: string | null
          notes: string | null
          partner_id: string | null
          project_id: string | null
          settles_document_id: string | null
          status: string
          tenant_id: string
          terms: string | null
          to_warehouse_id: string | null
          valid_until: string | null
          warehouse_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number
          converted_document_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          doc_date?: string
          doc_no?: number | null
          doc_type: string
          exchange_rate?: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          partner_id?: string | null
          project_id?: string | null
          settles_document_id?: string | null
          status?: string
          tenant_id: string
          terms?: string | null
          to_warehouse_id?: string | null
          valid_until?: string | null
          warehouse_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          converted_document_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          doc_date?: string
          doc_no?: number | null
          doc_type?: string
          exchange_rate?: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          partner_id?: string | null
          project_id?: string | null
          settles_document_id?: string | null
          status?: string
          tenant_id?: string
          terms?: string | null
          to_warehouse_id?: string | null
          valid_until?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_converted_document_id_fkey"
            columns: ["converted_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_settles_document_id_fkey"
            columns: ["settles_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_adjustments: {
        Row: {
          adj_date: string
          amount: number
          applied: boolean
          created_at: string
          employee_id: string
          id: string
          kind: string
          notes: string | null
          payroll_month: string | null
          tenant_id: string
        }
        Insert: {
          adj_date?: string
          amount?: number
          applied?: boolean
          created_at?: string
          employee_id: string
          id?: string
          kind?: string
          notes?: string | null
          payroll_month?: string | null
          tenant_id: string
        }
        Update: {
          adj_date?: string
          amount?: number
          applied?: boolean
          created_at?: string
          employee_id?: string
          id?: string
          kind?: string
          notes?: string | null
          payroll_month?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_adjustments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_advances: {
        Row: {
          adv_date: string
          amount: number
          created_at: string
          deducted: boolean
          employee_id: string
          id: string
          notes: string | null
          payroll_month: string | null
          tenant_id: string
        }
        Insert: {
          adv_date?: string
          amount?: number
          created_at?: string
          deducted?: boolean
          employee_id: string
          id?: string
          notes?: string | null
          payroll_month?: string | null
          tenant_id: string
        }
        Update: {
          adv_date?: string
          amount?: number
          created_at?: string
          deducted?: boolean
          employee_id?: string
          id?: string
          notes?: string | null
          payroll_month?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_advances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_leaves: {
        Row: {
          created_at: string
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          notes: string | null
          start_date: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          leave_type?: string
          notes?: string | null
          start_date: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          notes?: string | null
          start_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_leaves_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leaves_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          account_id: string | null
          address: string | null
          allowances: number
          bank_account: string | null
          base_salary: number
          code: string | null
          created_at: string
          currency: string
          department: string | null
          email: string | null
          hire_date: string | null
          id: string
          is_active: boolean
          job_title: string | null
          name: string
          national_id: string | null
          notes: string | null
          phone: string | null
          tenant_id: string
        }
        Insert: {
          account_id?: string | null
          address?: string | null
          allowances?: number
          bank_account?: string | null
          base_salary?: number
          code?: string | null
          created_at?: string
          currency?: string
          department?: string | null
          email?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          name: string
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          tenant_id: string
        }
        Update: {
          account_id?: string | null
          address?: string | null
          allowances?: number
          bank_account?: string | null
          base_salary?: number
          code?: string | null
          created_at?: string
          currency?: string
          department?: string | null
          email?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          name?: string
          national_id?: string | null
          notes?: string | null
          phone?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          rate_date: string
          rate_to_usd: number
          tenant_id: string
        }
        Insert: {
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          rate_date?: string
          rate_to_usd: number
          tenant_id: string
        }
        Update: {
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          rate_date?: string
          rate_to_usd?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_assets: {
        Row: {
          account_id: string | null
          code: string | null
          cost: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          name: string
          notes: string | null
          purchase_date: string
          salvage_value: number
          tenant_id: string
          useful_life_years: number
        }
        Insert: {
          account_id?: string | null
          code?: string | null
          cost: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          name: string
          notes?: string | null
          purchase_date?: string
          salvage_value?: number
          tenant_id: string
          useful_life_years?: number
        }
        Update: {
          account_id?: string | null
          code?: string | null
          cost?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          name?: string
          notes?: string | null
          purchase_date?: string
          salvage_value?: number
          tenant_id?: string
          useful_life_years?: number
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          audited: boolean
          audited_at: string | null
          audited_by: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          doc_type: string
          document_id: string | null
          entry_date: string
          entry_no: number
          exchange_rate: number
          id: string
          tenant_id: string
        }
        Insert: {
          audited?: boolean
          audited_at?: string | null
          audited_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          doc_type?: string
          document_id?: string | null
          entry_date?: string
          entry_no: number
          exchange_rate?: number
          id?: string
          tenant_id: string
        }
        Update: {
          audited?: boolean
          audited_at?: string | null
          audited_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          doc_type?: string
          document_id?: string | null
          entry_date?: string
          entry_no?: number
          exchange_rate?: number
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          credit: number
          debit: number
          description: string | null
          entry_id: string
          id: string
          partner_id: string | null
          project_id: string | null
          tenant_id: string
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id: string
          id?: string
          partner_id?: string | null
          project_id?: string | null
          tenant_id: string
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id?: string
          id?: string
          partner_id?: string | null
          project_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_project_fk"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id?: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string | null
          link: string | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string | null
          link?: string | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string | null
          link?: string | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          account_id: string | null
          address: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          partner_type: string
          phone: string | null
          tenant_id: string
        }
        Insert: {
          account_id?: string | null
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          partner_type?: string
          phone?: string | null
          tenant_id: string
        }
        Update: {
          account_id?: string | null
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          partner_type?: string
          phone?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          journal_entry_id: string | null
          month: string
          tenant_id: string
          total_advances: number
          total_gross: number
          total_net: number
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          journal_entry_id?: string | null
          month: string
          tenant_id: string
          total_advances?: number
          total_gross?: number
          total_net?: number
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          journal_entry_id?: string | null
          month?: string
          tenant_id?: string
          total_advances?: number
          total_gross?: number
          total_net?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          avg_cost: number
          barcode: string | null
          category: string | null
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          default_warehouse_id: string | null
          id: string
          is_active: boolean
          is_group: boolean
          last_purchase_price: number
          name: string
          parent_id: string | null
          qty_on_hand: number
          reorder_level: number
          sale_price: number
          sku: string
          tenant_id: string
          unit: string
        }
        Insert: {
          avg_cost?: number
          barcode?: string | null
          category?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          default_warehouse_id?: string | null
          id?: string
          is_active?: boolean
          is_group?: boolean
          last_purchase_price?: number
          name: string
          parent_id?: string | null
          qty_on_hand?: number
          reorder_level?: number
          sale_price?: number
          sku: string
          tenant_id: string
          unit?: string
        }
        Update: {
          avg_cost?: number
          barcode?: string | null
          category?: string | null
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          default_warehouse_id?: string | null
          id?: string
          is_active?: boolean
          is_group?: boolean
          last_purchase_price?: number
          name?: string
          parent_id?: string | null
          qty_on_hand?: number
          reorder_level?: number
          sale_price?: number
          sku?: string
          tenant_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_default_warehouse_id_fkey"
            columns: ["default_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_kind: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          is_auditor: boolean
          is_super_admin: boolean
          is_tenant_admin: boolean
          notif_seen_at: string
          tenant_id: string | null
        }
        Insert: {
          account_kind?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          is_auditor?: boolean
          is_super_admin?: boolean
          is_tenant_admin?: boolean
          notif_seen_at?: string
          tenant_id?: string | null
        }
        Update: {
          account_kind?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_auditor?: boolean
          is_super_admin?: boolean
          is_tenant_admin?: boolean
          notif_seen_at?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_expenses: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string
          expense_date: string
          id: string
          project_id: string
          tenant_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description: string
          expense_date?: string
          id?: string
          project_id: string
          tenant_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string
          expense_date?: string
          id?: string
          project_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          amount: number
          created_at: string
          due_date: string | null
          id: string
          invoiced: boolean
          is_done: boolean
          name: string
          project_id: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          invoiced?: boolean
          is_done?: boolean
          name: string
          project_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string | null
          id?: string
          invoiced?: boolean
          is_done?: boolean
          name?: string
          project_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string | null
          code: string | null
          completion_pct: number
          contract_value: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          end_date: string | null
          id: string
          is_active: boolean
          is_group: boolean
          name: string
          notes: string | null
          parent_id: string | null
          start_date: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          client_id?: string | null
          code?: string | null
          completion_pct?: number
          contract_value?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          end_date?: string | null
          id?: string
          is_active?: boolean
          is_group?: boolean
          name: string
          notes?: string | null
          parent_id?: string | null
          start_date?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          client_id?: string | null
          code?: string | null
          completion_pct?: number
          contract_value?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          end_date?: string | null
          id?: string
          is_active?: boolean
          is_group?: boolean
          name?: string
          notes?: string | null
          parent_id?: string | null
          start_date?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_entries: {
        Row: {
          amount: number
          approval_mode: string
          created_at: string
          credit_account_id: string
          currency: string
          debit_account_id: string
          description: string | null
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean
          name: string
          next_date: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          approval_mode?: string
          created_at?: string
          credit_account_id: string
          currency?: string
          debit_account_id: string
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name: string
          next_date?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          approval_mode?: string
          created_at?: string
          credit_account_id?: string
          currency?: string
          debit_account_id?: string
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          next_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_entries_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_entries_debit_account_id_fkey"
            columns: ["debit_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_moves: {
        Row: {
          created_at: string
          direction: string
          document_id: string | null
          id: string
          move_date: string
          partner_id: string | null
          product_id: string
          project_id: string | null
          qty: number
          reference: string | null
          tenant_id: string
          unit_cost: number
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          direction: string
          document_id?: string | null
          id?: string
          move_date?: string
          partner_id?: string | null
          product_id: string
          project_id?: string | null
          qty: number
          reference?: string | null
          tenant_id: string
          unit_cost?: number
          warehouse_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          document_id?: string | null
          id?: string
          move_date?: string
          partner_id?: string | null
          product_id?: string
          project_id?: string | null
          qty?: number
          reference?: string | null
          tenant_id?: string
          unit_cost?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_moves_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_moves_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_history: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          notes: string | null
          plan: string
          start_date: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          notes?: string | null
          plan: string
          start_date: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          notes?: string | null
          plan?: string
          start_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_features: {
        Row: {
          enabled: boolean
          id: string
          module: string
          tenant_id: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          module: string
          tenant_id: string
        }
        Update: {
          enabled?: boolean
          id?: string
          module?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_features_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          pay_date: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          pay_date?: string
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          pay_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          advances_account_id: string | null
          auto_backup: boolean
          backup_every_days: number
          cash_account_id: string | null
          closed_until: string | null
          cogs_account_id: string | null
          cost_method: string
          customers_account_id: string | null
          fiscal_end: string | null
          fiscal_start: string | null
          fx_account_id: string | null
          inventory_account_id: string | null
          inventory_adjust_account_id: string | null
          last_backup_at: string | null
          logo_url: string | null
          onboarding_done: boolean
          period_type: string
          primary_color: string | null
          project_cost_account_id: string | null
          retained_earnings_account_id: string | null
          salaries_account_id: string | null
          sales_account_id: string | null
          suppliers_account_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          advances_account_id?: string | null
          auto_backup?: boolean
          backup_every_days?: number
          cash_account_id?: string | null
          closed_until?: string | null
          cogs_account_id?: string | null
          cost_method?: string
          customers_account_id?: string | null
          fiscal_end?: string | null
          fiscal_start?: string | null
          fx_account_id?: string | null
          inventory_account_id?: string | null
          inventory_adjust_account_id?: string | null
          last_backup_at?: string | null
          logo_url?: string | null
          onboarding_done?: boolean
          period_type?: string
          primary_color?: string | null
          project_cost_account_id?: string | null
          retained_earnings_account_id?: string | null
          salaries_account_id?: string | null
          sales_account_id?: string | null
          suppliers_account_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          advances_account_id?: string | null
          auto_backup?: boolean
          backup_every_days?: number
          cash_account_id?: string | null
          closed_until?: string | null
          cogs_account_id?: string | null
          cost_method?: string
          customers_account_id?: string | null
          fiscal_end?: string | null
          fiscal_start?: string | null
          fx_account_id?: string | null
          inventory_account_id?: string | null
          inventory_adjust_account_id?: string | null
          last_backup_at?: string | null
          logo_url?: string | null
          onboarding_done?: boolean
          period_type?: string
          primary_color?: string | null
          project_cost_account_id?: string | null
          retained_earnings_account_id?: string | null
          salaries_account_id?: string | null
          sales_account_id?: string | null
          suppliers_account_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_advances_account_id_fkey"
            columns: ["advances_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_cogs_account_id_fkey"
            columns: ["cogs_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_customers_account_id_fkey"
            columns: ["customers_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_fx_account_id_fkey"
            columns: ["fx_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_inventory_account_id_fkey"
            columns: ["inventory_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_inventory_adjust_account_id_fkey"
            columns: ["inventory_adjust_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_project_cost_account_id_fkey"
            columns: ["project_cost_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_retained_earnings_account_id_fkey"
            columns: ["retained_earnings_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_salaries_account_id_fkey"
            columns: ["salaries_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_sales_account_id_fkey"
            columns: ["sales_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_suppliers_account_id_fkey"
            columns: ["suppliers_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          max_users: number
          name: string
          notes: string | null
          phone: string | null
          plan: string
          sub_end: string
          sub_start: string
          subscription_fee: number
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_users?: number
          name: string
          notes?: string | null
          phone?: string | null
          plan?: string
          sub_end?: string
          sub_start?: string
          subscription_fee?: number
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_users?: number
          name?: string
          notes?: string | null
          phone?: string | null
          plan?: string
          sub_end?: string
          sub_start?: string
          subscription_fee?: number
        }
        Relationships: []
      }
      units: {
        Row: {
          base_unit: string | null
          created_at: string
          factor: number
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          base_unit?: string | null
          created_at?: string
          factor?: number
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          base_unit?: string | null
          created_at?: string
          factor?: number
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          id: string
          module: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          module: string
          tenant_id: string
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          module?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_prefs: {
        Row: {
          dashboard: Json | null
          notif: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          dashboard?: Json | null
          notif?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          dashboard?: Json | null
          notif?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_group: boolean
          location: string | null
          name: string
          parent_id: string | null
          tenant_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_group?: boolean
          location?: string | null
          name: string
          parent_id?: string | null
          tenant_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_group?: boolean
          location?: string | null
          name?: string
          parent_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_currency: {
        Args: { _code: string; _name: string; _symbol: string }
        Returns: undefined
      }
      attach_module: { Args: { _t: string }; Returns: string }
      claim_super_admin: { Args: never; Returns: boolean }
      clear_tenant_data:
        | { Args: never; Returns: undefined }
        | { Args: { _id: string }; Returns: undefined }
      close_fiscal_year: { Args: never; Returns: undefined }
      current_tenant_id: { Args: never; Returns: string }
      has_perm: {
        Args: {
          _action: Database["public"]["Enums"]["perm_action"]
          _module: string
        }
        Returns: boolean
      }
      is_auditor: { Args: never; Returns: boolean }
      is_auditor_or_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: never; Returns: boolean }
      mark_notifications_seen: { Args: never; Returns: undefined }
      my_tenant_id: { Args: never; Returns: string }
      post_document: { Args: { _id: string }; Returns: string }
      purge_tenant:
        | { Args: never; Returns: undefined }
        | { Args: { _id: string }; Returns: undefined }
      reopen_fiscal_period: { Args: never; Returns: undefined }
      restore_tenant: { Args: { _data: Json; _id: string }; Returns: undefined }
      set_entry_audited: {
        Args: { _id: string; _ok: boolean }
        Returns: undefined
      }
      tenant_active: { Args: never; Returns: boolean }
      unpost_document: { Args: { _id: string }; Returns: undefined }
      update_company_info: {
        Args: {
          _address: string
          _code: string
          _name: string
          _notes: string
          _phone: string
        }
        Returns: undefined
      }
    }
    Enums: {
      account_nature: "closing" | "balance_sheet" | "profit_loss"
      currency_code: "USD" | "SYP"
      perm_action: "view" | "create" | "edit" | "delete"
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
      account_nature: ["closing", "balance_sheet", "profit_loss"],
      currency_code: ["USD", "SYP"],
      perm_action: ["view", "create", "edit", "delete"],
    },
  },
} as const
