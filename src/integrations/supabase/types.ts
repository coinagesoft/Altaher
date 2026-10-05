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
      audit_events: {
        Row: {
          action: string
          actor_id: string
          candidate_id: string | null
          created_at: string
          details: Json
          id: string
          new_status: Database["public"]["Enums"]["candidate_status"] | null
          previous_status:
            | Database["public"]["Enums"]["candidate_status"]
            | null
          project_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          candidate_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          new_status?: Database["public"]["Enums"]["candidate_status"] | null
          previous_status?:
            | Database["public"]["Enums"]["candidate_status"]
            | null
          project_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          candidate_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          new_status?: Database["public"]["Enums"]["candidate_status"] | null
          previous_status?:
            | Database["public"]["Enums"]["candidate_status"]
            | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_assignments: {
        Row: {
          assigned_at: string
          candidate_id: string
          created_at: string
          created_by: string
          end_reason: string | null
          ended_at: string | null
          final_status: Database["public"]["Enums"]["candidate_status"] | null
          id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          candidate_id: string
          created_at?: string
          created_by: string
          end_reason?: string | null
          ended_at?: string | null
          final_status?: Database["public"]["Enums"]["candidate_status"] | null
          id?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          candidate_id?: string
          created_at?: string
          created_by?: string
          end_reason?: string | null
          ended_at?: string | null
          final_status?: Database["public"]["Enums"]["candidate_status"] | null
          id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_assignments_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_documents: {
        Row: {
          candidate_id: string
          created_at: string
          document_type_id: string
          expiry_date: string | null
          file_name: string
          id: string
          project_id: string | null
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          document_type_id: string
          expiry_date?: string | null
          file_name: string
          id?: string
          project_id?: string | null
          storage_path: string
          uploaded_by: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          document_type_id?: string
          expiry_date?: string | null
          file_name?: string
          id?: string
          project_id?: string | null
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_documents_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_history: {
        Row: {
          candidate_id: string
          created_at: string
          created_by: string
          details: Json
          event: string
          id: string
          project_id: string | null
          reason: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          created_by: string
          details?: Json
          event: string
          id?: string
          project_id?: string | null
          reason?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          created_by?: string
          details?: Json
          event?: string
          id?: string
          project_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_history_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_remarks: {
        Row: {
          author_id: string
          candidate_id: string
          created_at: string
          id: string
          text: string
        }
        Insert: {
          author_id: string
          candidate_id: string
          created_at?: string
          id?: string
          text: string
        }
        Update: {
          author_id?: string
          candidate_id?: string
          created_at?: string
          id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_remarks_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          address: string | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          bank_swift: string | null
          candidate_kind: string
          candidate_number: string
          category: string | null
          contact_no_2: string | null
          created_at: string
          created_by: string
          current_project_id: string | null
          date_of_birth: string | null
          duplicate_checked_of: string | null
          email: string | null
          employee_number: string | null
          experience_years: number
          id: string
          interview_rating: number | null
          name: string
          passport_expiry: string | null
          passport_issue_date: string | null
          passport_number: string | null
          passport_place_of_issue: string | null
          phone: string | null
          photo_path: string | null
          photo_source: string | null
          place_of_birth: string | null
          practical_rating: number | null
          rating: number
          reference: string | null
          rr_days: number | null
          rr_start_date: string | null
          skills: string[]
          status: Database["public"]["Enums"]["candidate_status"]
          surname: string | null
          trade: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          bank_swift?: string | null
          candidate_kind?: string
          candidate_number: string
          category?: string | null
          contact_no_2?: string | null
          created_at?: string
          created_by: string
          current_project_id?: string | null
          date_of_birth?: string | null
          duplicate_checked_of?: string | null
          email?: string | null
          employee_number?: string | null
          experience_years?: number
          id?: string
          interview_rating?: number | null
          name: string
          passport_expiry?: string | null
          passport_issue_date?: string | null
          passport_number?: string | null
          passport_place_of_issue?: string | null
          phone?: string | null
          photo_path?: string | null
          photo_source?: string | null
          place_of_birth?: string | null
          practical_rating?: number | null
          rating?: number
          reference?: string | null
          rr_days?: number | null
          rr_start_date?: string | null
          skills?: string[]
          status?: Database["public"]["Enums"]["candidate_status"]
          surname?: string | null
          trade?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          bank_swift?: string | null
          candidate_kind?: string
          candidate_number?: string
          category?: string | null
          contact_no_2?: string | null
          created_at?: string
          created_by?: string
          current_project_id?: string | null
          date_of_birth?: string | null
          duplicate_checked_of?: string | null
          email?: string | null
          employee_number?: string | null
          experience_years?: number
          id?: string
          interview_rating?: number | null
          name?: string
          passport_expiry?: string | null
          passport_issue_date?: string | null
          passport_number?: string | null
          passport_place_of_issue?: string | null
          phone?: string | null
          photo_path?: string | null
          photo_source?: string | null
          place_of_birth?: string | null
          practical_rating?: number | null
          rating?: number
          reference?: string | null
          rr_days?: number | null
          rr_start_date?: string | null
          skills?: string[]
          status?: Database["public"]["Enums"]["candidate_status"]
          surname?: string | null
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_current_project_id_fkey"
            columns: ["current_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          category: Database["public"]["Enums"]["document_category"]
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          normalized_name: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          category: Database["public"]["Enums"]["document_category"]
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          name: string
          normalized_name?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string
          normalized_name?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      mobilisation_clearances: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          medical_cleared: boolean
          medical_date: string | null
          police_cleared: boolean
          police_date: string | null
          project_id: string
          updated_at: string
          updated_by: string
          visa_cleared: boolean
          visa_expiry_date: string | null
          visa_issue_date: string | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          medical_cleared?: boolean
          medical_date?: string | null
          police_cleared?: boolean
          police_date?: string | null
          project_id: string
          updated_at?: string
          updated_by: string
          visa_cleared?: boolean
          visa_expiry_date?: string | null
          visa_issue_date?: string | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          medical_cleared?: boolean
          medical_date?: string | null
          police_cleared?: boolean
          police_date?: string | null
          project_id?: string
          updated_at?: string
          updated_by?: string
          visa_cleared?: boolean
          visa_expiry_date?: string | null
          visa_issue_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mobilisation_clearances_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobilisation_clearances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_employee_numbers: {
        Row: {
          candidate_id: string
          created_at: string
          created_by: string
          employee_number: string
          id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          created_by: string
          employee_number: string
          id?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          created_by?: string
          employee_number?: string
          id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_employee_numbers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_employee_numbers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_stage_requirements: {
        Row: {
          created_at: string
          created_by: string
          document_type_id: string
          id: string
          project_id: string
          stage: Database["public"]["Enums"]["requirement_stage"]
        }
        Insert: {
          created_at?: string
          created_by: string
          document_type_id: string
          id?: string
          project_id: string
          stage: Database["public"]["Enums"]["requirement_stage"]
        }
        Update: {
          created_at?: string
          created_by?: string
          document_type_id?: string
          id?: string
          project_id?: string
          stage?: Database["public"]["Enums"]["requirement_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "project_stage_requirements_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stage_requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_trade_requirements: {
        Row: {
          category: string
          created_at: string
          created_by: string
          id: string
          project_id: string
          required_count: number
          trade: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          id?: string
          project_id: string
          required_count?: number
          trade: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          required_count?: number
          trade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_trade_requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          client: string
          country: string
          created_at: string
          created_by: string
          id: string
          name: string
          required_headcount: number
          start_date: string
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          client: string
          country?: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          required_headcount?: number
          start_date: string
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          client?: string
          country?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          required_headcount?: number
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      trade_categories: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          trade_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          trade_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_categories_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      travel_details: {
        Row: {
          arrival_airport: string
          arrival_date: string | null
          arrival_time: string | null
          candidate_id: string
          connections: Json
          created_at: string
          departure_airport: string
          departure_time: string | null
          flight_date: string
          flight_number: string
          id: string
          ticket_number: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          arrival_airport: string
          arrival_date?: string | null
          arrival_time?: string | null
          candidate_id: string
          connections?: Json
          created_at?: string
          departure_airport: string
          departure_time?: string | null
          flight_date: string
          flight_number: string
          id?: string
          ticket_number?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          arrival_airport?: string
          arrival_date?: string | null
          arrival_time?: string | null
          candidate_id?: string
          connections?: Json
          created_at?: string
          departure_airport?: string
          departure_time?: string | null
          flight_date?: string
          flight_number?: string
          id?: string
          ticket_number?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_details_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_candidate: {
        Args: {
          _candidate_number: string
          _email: string
          _experience_years: number
          _name: string
          _passport_expiry?: string
          _passport_number?: string
          _phone: string
          _rating: number
          _skills: string[]
        }
        Returns: {
          address: string | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          bank_swift: string | null
          candidate_kind: string
          candidate_number: string
          category: string | null
          contact_no_2: string | null
          created_at: string
          created_by: string
          current_project_id: string | null
          date_of_birth: string | null
          duplicate_checked_of: string | null
          email: string | null
          employee_number: string | null
          experience_years: number
          id: string
          interview_rating: number | null
          name: string
          passport_expiry: string | null
          passport_issue_date: string | null
          passport_number: string | null
          passport_place_of_issue: string | null
          phone: string | null
          photo_path: string | null
          photo_source: string | null
          place_of_birth: string | null
          practical_rating: number | null
          rating: number
          reference: string | null
          rr_days: number | null
          rr_start_date: string | null
          skills: string[]
          status: Database["public"]["Enums"]["candidate_status"]
          surname: string | null
          trade: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "candidates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_stage_requirement: {
        Args: {
          _category?: Database["public"]["Enums"]["document_category"]
          _document_name: string
          _project_id: string
          _stage: Database["public"]["Enums"]["requirement_stage"]
        }
        Returns: {
          created_at: string
          created_by: string
          document_type_id: string
          id: string
          project_id: string
          stage: Database["public"]["Enums"]["requirement_stage"]
        }
        SetofOptions: {
          from: "*"
          to: "project_stage_requirements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      append_candidate_remark: {
        Args: { _candidate_id: string; _text: string }
        Returns: {
          author_id: string
          candidate_id: string
          created_at: string
          id: string
          text: string
        }
        SetofOptions: {
          from: "*"
          to: "candidate_remarks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_role: {
        Args: { _roles: Database["public"]["Enums"]["app_role"][] }
        Returns: undefined
      }
      assign_candidate_to_project: {
        Args: { _candidate_id: string; _project_id: string }
        Returns: {
          address: string | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          bank_swift: string | null
          candidate_kind: string
          candidate_number: string
          category: string | null
          contact_no_2: string | null
          created_at: string
          created_by: string
          current_project_id: string | null
          date_of_birth: string | null
          duplicate_checked_of: string | null
          email: string | null
          employee_number: string | null
          experience_years: number
          id: string
          interview_rating: number | null
          name: string
          passport_expiry: string | null
          passport_issue_date: string | null
          passport_number: string | null
          passport_place_of_issue: string | null
          phone: string | null
          photo_path: string | null
          photo_source: string | null
          place_of_birth: string | null
          practical_rating: number | null
          rating: number
          reference: string | null
          rr_days: number | null
          rr_start_date: string | null
          skills: string[]
          status: Database["public"]["Enums"]["candidate_status"]
          surname: string | null
          trade: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "candidates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_candidate_stage: {
        Args: {
          _candidate_id: string
          _next: Database["public"]["Enums"]["candidate_status"]
        }
        Returns: {
          address: string | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          bank_swift: string | null
          candidate_kind: string
          candidate_number: string
          category: string | null
          contact_no_2: string | null
          created_at: string
          created_by: string
          current_project_id: string | null
          date_of_birth: string | null
          duplicate_checked_of: string | null
          email: string | null
          employee_number: string | null
          experience_years: number
          id: string
          interview_rating: number | null
          name: string
          passport_expiry: string | null
          passport_issue_date: string | null
          passport_number: string | null
          passport_place_of_issue: string | null
          phone: string | null
          photo_path: string | null
          photo_source: string | null
          place_of_birth: string | null
          practical_rating: number | null
          rating: number
          reference: string | null
          rr_days: number | null
          rr_start_date: string | null
          skills: string[]
          status: Database["public"]["Enums"]["candidate_status"]
          surname: string | null
          trade: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "candidates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_initial_admin: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      deactivate_document_type: {
        Args: { _document_type_id: string }
        Returns: {
          category: Database["public"]["Enums"]["document_category"]
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          normalized_name: string | null
          updated_at: string
          usage_count: number
        }
        SetofOptions: {
          from: "*"
          to: "document_types"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      record_candidate_document: {
        Args: {
          _candidate_id: string
          _document_type_id: string
          _expiry_date?: string
          _file_name: string
          _storage_path: string
        }
        Returns: {
          candidate_id: string
          created_at: string
          document_type_id: string
          expiry_date: string | null
          file_name: string
          id: string
          project_id: string | null
          storage_path: string
          uploaded_by: string
        }
        SetofOptions: {
          from: "*"
          to: "candidate_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_travel_details: {
        Args: {
          _arrival: string
          _candidate_id: string
          _departure: string
          _flight_date: string
          _flight_number: string
        }
        Returns: {
          arrival_airport: string
          arrival_date: string | null
          arrival_time: string | null
          candidate_id: string
          connections: Json
          created_at: string
          departure_airport: string
          departure_time: string | null
          flight_date: string
          flight_number: string
          id: string
          ticket_number: string | null
          updated_at: string
          updated_by: string
        }
        SetofOptions: {
          from: "*"
          to: "travel_details"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_candidate_details: {
        Args: {
          _candidate_id: string
          _email: string
          _experience_years: number
          _name: string
          _passport_expiry?: string
          _passport_number?: string
          _phone: string
          _rating: number
          _skills: string[]
        }
        Returns: {
          address: string | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          bank_swift: string | null
          candidate_kind: string
          candidate_number: string
          category: string | null
          contact_no_2: string | null
          created_at: string
          created_by: string
          current_project_id: string | null
          date_of_birth: string | null
          duplicate_checked_of: string | null
          email: string | null
          employee_number: string | null
          experience_years: number
          id: string
          interview_rating: number | null
          name: string
          passport_expiry: string | null
          passport_issue_date: string | null
          passport_number: string | null
          passport_place_of_issue: string | null
          phone: string | null
          photo_path: string | null
          photo_source: string | null
          place_of_birth: string | null
          practical_rating: number | null
          rating: number
          reference: string | null
          rr_days: number | null
          rr_start_date: string | null
          skills: string[]
          status: Database["public"]["Enums"]["candidate_status"]
          surname: string | null
          trade: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "candidates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role:
        | "Data Entry"
        | "Recruiter"
        | "Project Coordinator"
        | "Mobilisation Executive"
        | "Admin"
        | "Super Admin"
      candidate_status:
        | "Available"
        | "Assigned"
        | "Shortlisted"
        | "Interview"
        | "Practical Test"
        | "Passed"
        | "Selected"
        | "Rejected"
        | "Medical"
        | "Visa"
        | "Mobilisation"
        | "On Site"
        | "R&R"
        | "EOC"
        | "Unavailable"
        | "Blacklisted"
      document_category: "candidate" | "project"
      requirement_stage:
        | "Assigned"
        | "Shortlisted"
        | "Interview"
        | "Selected"
        | "Medical"
        | "Visa"
        | "Mobilisation"
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
      app_role: [
        "Data Entry",
        "Recruiter",
        "Project Coordinator",
        "Mobilisation Executive",
        "Admin",
        "Super Admin",
      ],
      candidate_status: [
        "Available",
        "Assigned",
        "Shortlisted",
        "Interview",
        "Practical Test",
        "Passed",
        "Selected",
        "Rejected",
        "Medical",
        "Visa",
        "Mobilisation",
        "On Site",
        "R&R",
        "EOC",
        "Unavailable",
        "Blacklisted",
      ],
      document_category: ["candidate", "project"],
      requirement_stage: [
        "Assigned",
        "Shortlisted",
        "Interview",
        "Selected",
        "Medical",
        "Visa",
        "Mobilisation",
      ],
    },
  },
} as const
