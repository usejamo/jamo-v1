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
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      _gap_debug: {
        Row: {
          created_at: string
          deduped_count: number | null
          dismissed_unchanged: string | null
          final_count: number | null
          haiku_raw: string | null
          id: number
          prompt_chars: number | null
          proposal_id: string | null
          resolved_count: number | null
          validated_count: number | null
        }
        Insert: {
          created_at?: string
          deduped_count?: number | null
          dismissed_unchanged?: string | null
          final_count?: number | null
          haiku_raw?: string | null
          id?: never
          prompt_chars?: number | null
          proposal_id?: string | null
          resolved_count?: number | null
          validated_count?: number | null
        }
        Update: {
          created_at?: string
          deduped_count?: number | null
          dismissed_unchanged?: string | null
          final_count?: number | null
          haiku_raw?: string | null
          id?: never
          prompt_chars?: number | null
          proposal_id?: string | null
          resolved_count?: number | null
          validated_count?: number | null
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          active_task: Json | null
          created_at: string | null
          current_focus_section: string | null
          id: string
          last_updated: string | null
          org_id: string
          pending_actions: Json | null
          pending_actions_content_hash: string | null
          pending_actions_generated_at: string | null
          proposal_id: string
          resolved_items: Json | null
          user_id: string
        }
        Insert: {
          active_task?: Json | null
          created_at?: string | null
          current_focus_section?: string | null
          id?: string
          last_updated?: string | null
          org_id: string
          pending_actions?: Json | null
          pending_actions_content_hash?: string | null
          pending_actions_generated_at?: string | null
          proposal_id: string
          resolved_items?: Json | null
          user_id: string
        }
        Update: {
          active_task?: Json | null
          created_at?: string | null
          current_focus_section?: string | null
          id?: string
          last_updated?: string | null
          org_id?: string
          pending_actions?: Json | null
          pending_actions_content_hash?: string | null
          pending_actions_generated_at?: string | null
          proposal_id?: string
          resolved_items?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_sessions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      chunks: {
        Row: {
          agency: string | null
          content: string
          created_at: string
          doc_type: string
          embedding: string | null
          guideline_type: string | null
          id: string
          metadata: Json
          org_id: string | null
          proposal_id: string | null
          regulatory_document_id: string | null
          search_vector: unknown
          source: string
          therapeutic_area: string | null
        }
        Insert: {
          agency?: string | null
          content: string
          created_at?: string
          doc_type: string
          embedding?: string | null
          guideline_type?: string | null
          id?: string
          metadata?: Json
          org_id?: string | null
          proposal_id?: string | null
          regulatory_document_id?: string | null
          search_vector?: unknown
          source: string
          therapeutic_area?: string | null
        }
        Update: {
          agency?: string | null
          content?: string
          created_at?: string
          doc_type?: string
          embedding?: string | null
          guideline_type?: string | null
          id?: string
          metadata?: Json
          org_id?: string | null
          proposal_id?: string | null
          regulatory_document_id?: string | null
          search_vector?: unknown
          source?: string
          therapeutic_area?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chunks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunks_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunks_regulatory_document_id_fkey"
            columns: ["regulatory_document_id"]
            isOneToOne: false
            referencedRelation: "regulatory_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_fixture_assumptions: {
        Row: {
          category: string | null
          confidence: string | null
          content: string
          fixture_id: string | null
          id: string
          status: string | null
          user_edited: boolean | null
        }
        Insert: {
          category?: string | null
          confidence?: string | null
          content: string
          fixture_id?: string | null
          id?: string
          status?: string | null
          user_edited?: boolean | null
        }
        Update: {
          category?: string | null
          confidence?: string | null
          content?: string
          fixture_id?: string | null
          id?: string
          status?: string | null
          user_edited?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_fixture_assumptions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "demo_fixtures"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_fixture_rfp_chunks: {
        Row: {
          content: string
          embedding: string | null
          fixture_id: string | null
          id: string
          metadata: Json | null
          source: string | null
        }
        Insert: {
          content: string
          embedding?: string | null
          fixture_id?: string | null
          id?: string
          metadata?: Json | null
          source?: string | null
        }
        Update: {
          content?: string
          embedding?: string | null
          fixture_id?: string | null
          id?: string
          metadata?: Json | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_fixture_rfp_chunks_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "demo_fixtures"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_fixture_sections: {
        Row: {
          compliance_flags: Json | null
          content: string
          fixture_id: string
          id: string
          position: number
          role: string
          section_name: string
        }
        Insert: {
          compliance_flags?: Json | null
          content: string
          fixture_id: string
          id?: string
          position: number
          role: string
          section_name: string
        }
        Update: {
          compliance_flags?: Json | null
          content?: string
          fixture_id?: string
          id?: string
          position?: number
          role?: string
          section_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_fixture_sections_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "demo_fixtures"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_fixtures: {
        Row: {
          captured_by: string | null
          created_at: string | null
          id: string
          label: string | null
          org_id: string
          rfp_extract_text: string | null
          rfp_fields: Json
          source_proposal_id: string | null
          status: string | null
          template_id: string
          version: number
        }
        Insert: {
          captured_by?: string | null
          created_at?: string | null
          id?: string
          label?: string | null
          org_id: string
          rfp_extract_text?: string | null
          rfp_fields: Json
          source_proposal_id?: string | null
          status?: string | null
          template_id: string
          version: number
        }
        Update: {
          captured_by?: string | null
          created_at?: string | null
          id?: string
          label?: string | null
          org_id?: string
          rfp_extract_text?: string | null
          rfp_fields?: Json
          source_proposal_id?: string | null
          status?: string | null
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "demo_fixtures_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_fixtures_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_runs: {
        Row: {
          created_at: string | null
          fixture_id: string | null
          id: string
          org_id: string
          proposal_id: string
          started_by: string | null
        }
        Insert: {
          created_at?: string | null
          fixture_id?: string | null
          id?: string
          org_id: string
          proposal_id: string
          started_by?: string | null
        }
        Update: {
          created_at?: string | null
          fixture_id?: string | null
          id?: string
          org_id?: string
          proposal_id?: string
          started_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_runs_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "demo_fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_runs_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_runs_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_extracts: {
        Row: {
          content: string
          document_id: string
          id: string
          org_id: string
          page_count: number | null
          parse_error: string | null
          parsed_at: string
          word_count: number | null
        }
        Insert: {
          content: string
          document_id: string
          id?: string
          org_id: string
          page_count?: number | null
          parse_error?: string | null
          parsed_at?: string
          word_count?: number | null
        }
        Update: {
          content?: string
          document_id?: string
          id?: string
          org_id?: string
          page_count?: number | null
          parse_error?: string | null
          parsed_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_extracts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "proposal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_extracts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          org_id: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          org_id: string
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_pending: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          org_id: string
          state: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at?: string
          org_id: string
          state: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          org_id?: string
          state?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          feature_flags: Json
          id: string
          is_active: boolean
          learn_from_lost: boolean
          learn_from_submitted: boolean
          learn_from_won: boolean
          name: string
          plan: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_flags?: Json
          id?: string
          is_active?: boolean
          learn_from_lost?: boolean
          learn_from_submitted?: boolean
          learn_from_won?: boolean
          name: string
          plan?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_flags?: Json
          id?: string
          is_active?: boolean
          learn_from_lost?: boolean
          learn_from_submitted?: boolean
          learn_from_won?: boolean
          name?: string
          plan?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      pending_action_dismissals: {
        Row: {
          action_id: string
          content_hash: string | null
          dismissed_at: string
          id: string
          proposal_id: string
          user_id: string
        }
        Insert: {
          action_id: string
          content_hash?: string | null
          dismissed_at?: string
          id?: string
          proposal_id: string
          user_id: string
        }
        Update: {
          action_id?: string
          content_hash?: string | null
          dismissed_at?: string
          id?: string
          proposal_id?: string
          user_id?: string
        }
        Relationships: []
      }
      proposal_assumptions: {
        Row: {
          category: string
          confidence: string
          content: string
          created_at: string
          id: string
          org_id: string
          proposal_id: string
          source_document: string | null
          status: string
          updated_at: string
          user_edited: boolean
        }
        Insert: {
          category: string
          confidence?: string
          content: string
          created_at?: string
          id?: string
          org_id: string
          proposal_id: string
          source_document?: string | null
          status?: string
          updated_at?: string
          user_edited?: boolean
        }
        Update: {
          category?: string
          confidence?: string
          content?: string
          created_at?: string
          id?: string
          org_id?: string
          proposal_id?: string
          source_document?: string | null
          status?: string
          updated_at?: string
          user_edited?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "proposal_assumptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_assumptions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_assumptions_source_document_fkey"
            columns: ["source_document"]
            isOneToOne: false
            referencedRelation: "proposal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_chats: {
        Row: {
          content: string
          created_at: string
          id: string
          message_type: string | null
          org_id: string
          proposal_id: string
          role: string
          section_target_id: string | null
          tool_data: Json | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          message_type?: string | null
          org_id: string
          proposal_id: string
          role: string
          section_target_id?: string | null
          tool_data?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message_type?: string | null
          org_id?: string
          proposal_id?: string
          role?: string
          section_target_id?: string | null
          tool_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_chats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_chats_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_documents: {
        Row: {
          created_at: string
          doc_type: string | null
          id: string
          mime_type: string
          name: string
          org_id: string
          parse_status: string
          proposal_id: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type?: string | null
          id?: string
          mime_type: string
          name: string
          org_id: string
          parse_status?: string
          proposal_id?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string | null
          id?: string
          mime_type?: string
          name?: string
          org_id?: string
          parse_status?: string
          proposal_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_documents_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_section_versions: {
        Row: {
          action_label: string
          content: string
          created_at: string | null
          id: string
          org_id: string
          proposal_id: string
          section_key: string
        }
        Insert: {
          action_label: string
          content: string
          created_at?: string | null
          id?: string
          org_id: string
          proposal_id: string
          section_key: string
        }
        Update: {
          action_label?: string
          content?: string
          created_at?: string | null
          id?: string
          org_id?: string
          proposal_id?: string
          section_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_section_versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_sections: {
        Row: {
          compliance_flags: Json
          content: string | null
          created_at: string
          description: string | null
          generated_at: string | null
          id: string
          is_locked: boolean
          last_saved_content: string | null
          name: string | null
          org_id: string
          position: number | null
          proposal_id: string
          role: string | null
          section_key: string
          section_name: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          compliance_flags?: Json
          content?: string | null
          created_at?: string
          description?: string | null
          generated_at?: string | null
          id?: string
          is_locked?: boolean
          last_saved_content?: string | null
          name?: string | null
          org_id: string
          position?: number | null
          proposal_id: string
          role?: string | null
          section_key: string
          section_name: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          compliance_flags?: Json
          content?: string | null
          created_at?: string
          description?: string | null
          generated_at?: string | null
          id?: string
          is_locked?: boolean
          last_saved_content?: string | null
          name?: string | null
          org_id?: string
          position?: number | null
          proposal_id?: string
          role?: string | null
          section_key?: string
          section_name?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_sections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_sections_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          client_name: string | null
          consistency_check_ran: boolean
          consistency_flags: Json
          created_at: string
          created_by: string
          currency: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          estimated_value: number | null
          geography: string[] | null
          id: string
          indication: string | null
          is_archived: boolean
          org_id: string
          reference_override: boolean | null
          selected_template_id: string | null
          services_requested: string[] | null
          status: string
          study_phase: string | null
          study_type: string | null
          therapeutic_area: string | null
          title: string
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          consistency_check_ran?: boolean
          consistency_flags?: Json
          created_at?: string
          created_by: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_value?: number | null
          geography?: string[] | null
          id?: string
          indication?: string | null
          is_archived?: boolean
          org_id: string
          reference_override?: boolean | null
          selected_template_id?: string | null
          services_requested?: string[] | null
          status?: string
          study_phase?: string | null
          study_type?: string | null
          therapeutic_area?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          consistency_check_ran?: boolean
          consistency_flags?: Json
          created_at?: string
          created_by?: string
          currency?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_value?: number | null
          geography?: string[] | null
          id?: string
          indication?: string | null
          is_archived?: boolean
          org_id?: string
          reference_override?: boolean | null
          selected_template_id?: string | null
          services_requested?: string[] | null
          status?: string
          study_phase?: string | null
          study_type?: string | null
          therapeutic_area?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_selected_template_id_fkey"
            columns: ["selected_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      regulatory_documents: {
        Row: {
          agency: string
          created_at: string
          document_key: string
          effective_date: string | null
          geography: string[]
          id: string
          phase: string[] | null
          source: string
          status: string
          superseded_by: string | null
          supersedes: string | null
          therapeutic_area: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agency: string
          created_at?: string
          document_key: string
          effective_date?: string | null
          geography: string[]
          id?: string
          phase?: string[] | null
          source: string
          status?: string
          superseded_by?: string | null
          supersedes?: string | null
          therapeutic_area?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          agency?: string
          created_at?: string
          document_key?: string
          effective_date?: string | null
          geography?: string[]
          id?: string
          phase?: string[] | null
          source?: string
          status?: string
          superseded_by?: string | null
          supersedes?: string | null
          therapeutic_area?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_documents_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "regulatory_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regulatory_documents_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "regulatory_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      salesforce_connections: {
        Row: {
          connected_at: string
          id: string
          instance_url: string
          is_sandbox: boolean
          org_id: string
          sf_org_id: string
          sf_username: string
          vault_secret_id: string
        }
        Insert: {
          connected_at?: string
          id?: string
          instance_url: string
          is_sandbox?: boolean
          org_id: string
          sf_org_id: string
          sf_username: string
          vault_secret_id: string
        }
        Update: {
          connected_at?: string
          id?: string
          instance_url?: string
          is_sandbox?: boolean
          org_id?: string
          sf_org_id?: string
          sf_username?: string
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salesforce_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      template_sections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string | null
          position: number
          role: string | null
          template_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id?: string | null
          position: number
          role?: string | null
          template_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string | null
          position?: number
          role?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_sections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          created_at: string
          description: string | null
          file_path: string | null
          id: string
          is_default: boolean
          low_confidence: boolean
          name: string
          org_id: string | null
          parse_status: string
          source: string
          style_inspection: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_path?: string | null
          id?: string
          is_default?: boolean
          low_confidence?: boolean
          name: string
          org_id?: string | null
          parse_status?: string
          source: string
          style_inspection?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          file_path?: string | null
          id?: string
          is_default?: boolean
          low_confidence?: boolean
          name?: string
          org_id?: string | null
          parse_status?: string
          source?: string
          style_inspection?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          org_id: string
          proposal_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          org_id: string
          proposal_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          org_id?: string
          proposal_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          org_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_resolved_item: {
        Args: {
          p_entry: Json
          p_org_id: string
          p_proposal_id: string
          p_user_id: string
        }
        Returns: Json
      }
      clone_demo_fixture_chunks: {
        Args: { p_fixture_id: string; p_org_id: string; p_proposal_id: string }
        Returns: number
      }
      ingest_regulatory_document: {
        Args: {
          p_agency: string
          p_chunks: Json
          p_document_key: string
          p_effective_date: string
          p_geography: string[]
          p_phase: string[]
          p_source: string
          p_status: string
          p_supersedes_document_key: string
          p_therapeutic_area: string
          p_title: string
        }
        Returns: string
      }
      match_chunks_fts: {
        Args: {
          agencies_filter: string[]
          geographies_filter: string[]
          match_count: number
          org_id_filter: string
          phases_filter: string[]
          query_text: string
          therapeutic_areas_filter: string[]
        }
        Returns: {
          agency: string
          content: string
          doc_type: string
          id: string
          source: string
          text_score: number
          therapeutic_area: string
        }[]
      }
      match_chunks_fts_proposals: {
        Args: {
          current_proposal_id: string
          match_count: number
          org_id_filter: string
          query_text: string
        }
        Returns: {
          agency: string
          content: string
          doc_type: string
          id: string
          source: string
          text_score: number
          therapeutic_area: string
        }[]
      }
      match_chunks_vector: {
        Args: {
          agencies_filter: string[]
          geographies_filter: string[]
          match_count: number
          org_id_filter: string
          phases_filter: string[]
          query_embedding: string
          similarity_threshold: number
          therapeutic_areas_filter: string[]
        }
        Returns: {
          agency: string
          content: string
          doc_type: string
          id: string
          source: string
          therapeutic_area: string
          vector_score: number
        }[]
      }
      match_chunks_vector_proposals: {
        Args: {
          current_proposal_id: string
          match_count: number
          org_id_filter: string
          query_embedding: string
          similarity_threshold: number
        }
        Returns: {
          agency: string
          content: string
          doc_type: string
          id: string
          source: string
          therapeutic_area: string
          vector_score: number
        }[]
      }
      reap_stuck_document_extractions: { Args: never; Returns: number }
      set_org_learning_switches: {
        Args: {
          p_learn_from_lost: boolean
          p_learn_from_submitted: boolean
          p_learn_from_won: boolean
        }
        Returns: undefined
      }
      set_reference_override: {
        Args: { p_proposal_id: string; p_value: boolean }
        Returns: undefined
      }
      vault_delete_sf_tokens: {
        Args: { p_secret_id: string }
        Returns: undefined
      }
      vault_get_sf_tokens: { Args: { p_secret_id: string }; Returns: Json }
      vault_store_sf_tokens: {
        Args: { p_name: string; p_payload: Json }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
