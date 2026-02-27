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
  public: {
    Tables: {
      account_addresses: {
        Row: {
          account_id: string
          city: string
          country: string
          created_at: string
          id: string
          line1: string
          line2: string | null
          postal_code: string
          state: string
        }
        Insert: {
          account_id: string
          city: string
          country: string
          created_at?: string
          id?: string
          line1: string
          line2?: string | null
          postal_code: string
          state: string
        }
        Update: {
          account_id?: string
          city?: string
          country?: string
          created_at?: string
          id?: string
          line1?: string
          line2?: string | null
          postal_code?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_addresses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_licenses: {
        Row: {
          account_id: string
          contact_department: string | null
          contact_designation: string | null
          contact_email: string
          contact_full_name: string
          contact_phone: string | null
          created_at: string
          end_date: string
          enterprise_id: string
          id: string
          notice_days: number
          number_of_users: number
          product_id: string
          renewal_notify: boolean
          service_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          account_id: string
          contact_department?: string | null
          contact_designation?: string | null
          contact_email: string
          contact_full_name: string
          contact_phone?: string | null
          created_at?: string
          end_date: string
          enterprise_id: string
          id?: string
          notice_days?: number
          number_of_users?: number
          product_id: string
          renewal_notify?: boolean
          service_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          contact_department?: string | null
          contact_designation?: string | null
          contact_email?: string
          contact_full_name?: string
          contact_phone?: string | null
          created_at?: string
          end_date?: string
          enterprise_id?: string
          id?: string
          notice_days?: number
          number_of_users?: number
          product_id?: string
          renewal_notify?: boolean
          service_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_licenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_licenses_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_licenses_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_licenses_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      account_technical_users: {
        Row: {
          account_id: string
          assigned_group: string
          assigned_role: string
          created_at: string
          email: string
          end_date: string | null
          enterprise_id: string | null
          first_name: string
          id: string
          is_technical_user: boolean
          last_name: string
          middle_name: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          assigned_group: string
          assigned_role: string
          created_at?: string
          email: string
          end_date?: string | null
          enterprise_id?: string | null
          first_name: string
          id?: string
          is_technical_user?: boolean
          last_name: string
          middle_name?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          assigned_group?: string
          assigned_role?: string
          created_at?: string
          email?: string
          end_date?: string | null
          enterprise_id?: string | null
          first_name?: string
          id?: string
          is_technical_user?: boolean
          last_name?: string
          middle_name?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_technical_users_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_technical_users_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          cloud_type: Database["public"]["Enums"]["cloud_type"]
          created_at: string
          id: string
          master_account_name: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          cloud_type: Database["public"]["Enums"]["cloud_type"]
          created_at?: string
          id?: string
          master_account_name: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          cloud_type?: Database["public"]["Enums"]["cloud_type"]
          created_at?: string
          id?: string
          master_account_name?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      credential_notification_history: {
        Row: {
          account_id: string
          created_at: string
          credential_id: string
          days_until_expiry: number
          error_message: string | null
          id: string
          notification_type: string
          recipient_email: string
          recipient_name: string
          sent_at: string
          status: string
          subject: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credential_id: string
          days_until_expiry: number
          error_message?: string | null
          id?: string
          notification_type?: string
          recipient_email: string
          recipient_name: string
          sent_at?: string
          status?: string
          subject: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credential_id?: string
          days_until_expiry?: number
          error_message?: string | null
          id?: string
          notification_type?: string
          recipient_email?: string
          recipient_name?: string
          sent_at?: string
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_notification_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_notification_history_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_workstreams: {
        Row: {
          created_at: string
          credential_id: string
          id: string
          workstream_id: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          id?: string
          workstream_id: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          id?: string
          workstream_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_workstreams_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_workstreams_workstream_id_fkey"
            columns: ["workstream_id"]
            isOneToOne: false
            referencedRelation: "workstreams"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          account_id: string
          auth_type: string
          category: string
          connector: string
          created_at: string
          created_by: string | null
          credentials: Json | null
          description: string | null
          enterprise_id: string
          expires_at: string | null
          expiry_notice_days: number
          expiry_notify: boolean
          id: string
          last_used_at: string | null
          name: string
          oauth_access_token: string | null
          oauth_refresh_token: string | null
          oauth_scope: string | null
          oauth_token_expires_at: string | null
          product_id: string | null
          service_id: string | null
          status: string
          updated_at: string
          workstream_id: string | null
        }
        Insert: {
          account_id: string
          auth_type: string
          category: string
          connector: string
          created_at?: string
          created_by?: string | null
          credentials?: Json | null
          description?: string | null
          enterprise_id: string
          expires_at?: string | null
          expiry_notice_days?: number
          expiry_notify?: boolean
          id?: string
          last_used_at?: string | null
          name: string
          oauth_access_token?: string | null
          oauth_refresh_token?: string | null
          oauth_scope?: string | null
          oauth_token_expires_at?: string | null
          product_id?: string | null
          service_id?: string | null
          status?: string
          updated_at?: string
          workstream_id?: string | null
        }
        Update: {
          account_id?: string
          auth_type?: string
          category?: string
          connector?: string
          created_at?: string
          created_by?: string | null
          credentials?: Json | null
          description?: string | null
          enterprise_id?: string
          expires_at?: string | null
          expiry_notice_days?: number
          expiry_notify?: boolean
          id?: string
          last_used_at?: string | null
          name?: string
          oauth_access_token?: string | null
          oauth_refresh_token?: string | null
          oauth_scope?: string | null
          oauth_token_expires_at?: string | null
          product_id?: string | null
          service_id?: string | null
          status?: string
          updated_at?: string
          workstream_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credentials_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credentials_workstream_id_fkey"
            columns: ["workstream_id"]
            isOneToOne: false
            referencedRelation: "workstreams"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_products: {
        Row: {
          created_at: string
          enterprise_id: string
          id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          enterprise_id: string
          id?: string
          product_id: string
        }
        Update: {
          created_at?: string
          enterprise_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_products_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: true
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_services: {
        Row: {
          created_at: string
          enterprise_id: string
          id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          enterprise_id: string
          id?: string
          service_id: string
        }
        Update: {
          created_at?: string
          enterprise_id?: string
          id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_services_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enterprise_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprises: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_roles: {
        Row: {
          created_at: string
          group_id: string
          id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          role_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_roles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          account_id: string | null
          created_at: string
          description: string | null
          enterprise_id: string | null
          id: string
          name: string
          product_id: string | null
          service_id: string | null
          updated_at: string
          workstream_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          description?: string | null
          enterprise_id?: string | null
          id?: string
          name: string
          product_id?: string | null
          service_id?: string | null
          updated_at?: string
          workstream_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          description?: string | null
          enterprise_id?: string | null
          id?: string
          name?: string
          product_id?: string | null
          service_id?: string | null
          updated_at?: string
          workstream_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_workstream_id_fkey"
            columns: ["workstream_id"]
            isOneToOne: false
            referencedRelation: "workstreams"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_history: {
        Row: {
          account_id: string
          created_at: string
          days_until_expiry: number
          error_message: string | null
          id: string
          license_id: string
          notification_type: string
          recipient_email: string
          recipient_name: string
          sent_at: string
          status: string
          subject: string
        }
        Insert: {
          account_id: string
          created_at?: string
          days_until_expiry: number
          error_message?: string | null
          id?: string
          license_id: string
          notification_type?: string
          recipient_email: string
          recipient_name: string
          sent_at?: string
          status?: string
          subject: string
        }
        Update: {
          account_id?: string
          created_at?: string
          days_until_expiry?: number
          error_message?: string | null
          id?: string
          license_id?: string
          notification_type?: string
          recipient_email?: string
          recipient_name?: string
          sent_at?: string
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_history_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "account_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          created_at: string
          credential_id: string | null
          expires_at: string
          id: string
          metadata: Json | null
          provider: string
          redirect_uri: string
          state: string
        }
        Insert: {
          created_at?: string
          credential_id?: string | null
          expires_at: string
          id?: string
          metadata?: Json | null
          provider: string
          redirect_uri: string
          state: string
        }
        Update: {
          created_at?: string
          credential_id?: string | null
          expires_at?: string
          id?: string
          metadata?: Json | null
          provider?: string
          redirect_uri?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_states_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          deployment_type: string
          description: string | null
          edges: Json
          enterprise_id: string
          id: string
          name: string
          nodes: Json
          product_id: string | null
          service_ids: string[] | null
          status: Database["public"]["Enums"]["pipeline_status"]
          updated_at: string
          yaml_content: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          deployment_type?: string
          description?: string | null
          edges?: Json
          enterprise_id: string
          id?: string
          name: string
          nodes?: Json
          product_id?: string | null
          service_ids?: string[] | null
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
          yaml_content?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          deployment_type?: string
          description?: string | null
          edges?: Json
          enterprise_id?: string
          id?: string
          name?: string
          nodes?: Json
          product_id?: string | null
          service_ids?: string[] | null
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
          yaml_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipelines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          can_create: boolean | null
          can_delete: boolean | null
          can_edit: boolean | null
          can_view: boolean | null
          created_at: string
          id: string
          is_visible: boolean | null
          menu_key: string
          menu_label: string
          role_id: string
          tabs: Json | null
          updated_at: string
        }
        Insert: {
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string
          id?: string
          is_visible?: boolean | null
          menu_key: string
          menu_label: string
          role_id: string
          tabs?: Json | null
          updated_at?: string
        }
        Update: {
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          created_at?: string
          id?: string
          is_visible?: boolean | null
          menu_key?: string
          menu_label?: string
          role_id?: string
          tabs?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_workstreams: {
        Row: {
          created_at: string
          id: string
          role_id: string
          workstream_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          workstream_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          workstream_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_workstreams_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_workstreams_workstream_id_fkey"
            columns: ["workstream_id"]
            isOneToOne: false
            referencedRelation: "workstreams"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          account_id: string | null
          created_at: string
          description: string | null
          enterprise_id: string | null
          id: string
          name: string
          permissions: number
          product_id: string | null
          service_id: string | null
          updated_at: string
          workstream_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          description?: string | null
          enterprise_id?: string | null
          id?: string
          name: string
          permissions?: number
          product_id?: string | null
          service_id?: string | null
          updated_at?: string
          workstream_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          description?: string | null
          enterprise_id?: string | null
          id?: string
          name?: string
          permissions?: number
          product_id?: string | null
          service_id?: string | null
          updated_at?: string
          workstream_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_workstream_id_fkey"
            columns: ["workstream_id"]
            isOneToOne: false
            referencedRelation: "workstreams"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_groups: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_groups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "account_technical_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          account_id: string | null
          created_at: string
          enterprise_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          enterprise_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          enterprise_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      user_workstreams: {
        Row: {
          created_at: string
          id: string
          user_id: string
          workstream_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          workstream_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          workstream_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_workstreams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "account_technical_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_workstreams_workstream_id_fkey"
            columns: ["workstream_id"]
            isOneToOne: false
            referencedRelation: "workstreams"
            referencedColumns: ["id"]
          },
        ]
      }
      workstream_tools: {
        Row: {
          category: string
          created_at: string
          id: string
          tool_name: string
          workstream_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          tool_name: string
          workstream_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          tool_name?: string
          workstream_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workstream_tools_workstream_id_fkey"
            columns: ["workstream_id"]
            isOneToOne: false
            referencedRelation: "workstreams"
            referencedColumns: ["id"]
          },
        ]
      }
      workstreams: {
        Row: {
          account_id: string
          created_at: string
          enterprise_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          enterprise_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          enterprise_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workstreams_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workstreams_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_account_id: { Args: { _user_id: string }; Returns: string }
      has_account_access: {
        Args: { _account_id: string; _user_id: string }
        Returns: boolean
      }
      has_enterprise_access: {
        Args: { _enterprise_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      update_expired_user_statuses: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "manager" | "user" | "viewer"
      cloud_type: "public" | "private" | "hybrid"
      pipeline_status: "draft" | "active" | "inactive" | "archived"
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
      app_role: ["super_admin", "admin", "manager", "user", "viewer"],
      cloud_type: ["public", "private", "hybrid"],
      pipeline_status: ["draft", "active", "inactive", "archived"],
    },
  },
} as const
