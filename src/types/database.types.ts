
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": NonNullable<Json>,"entity": string,"entity_id": string | null,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity": string,"entity_id"?: string | null,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"entity"?: string,"entity_id"?: string | null,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "active": boolean,"color": string,"created_at": string,"id": number,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"color": string,"created_at"?: string,"id"?: never,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"color"?: string,"created_at"?: string,"id"?: never,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"data": NonNullable<Json>,"id": number,"kind": string,"read_at": string | null,"reminder_id": number | null,"reminder_title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: never,"kind": string,"read_at"?: string | null,"reminder_id"?: number | null,"reminder_title": string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: never,"kind"?: string,"read_at"?: string | null,"reminder_id"?: number | null,"reminder_title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_reminder_id_fkey"
      columns: ["reminder_id"]
isOneToOne: false
      referencedRelation: "reminders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"color": string,"created_at": string,"full_name": string,"id": string,"must_change_password": boolean,"role": Database["public"]['Enums']["user_role"],"theme": string,"updated_at": string,"username": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"color": string,"created_at"?: string,"full_name": string,"id": string,"must_change_password"?: boolean,"role"?: Database["public"]['Enums']["user_role"],"theme"?: string,"updated_at"?: string,"username": string
                  }
                  Update: {
                    "active"?: boolean,"color"?: string,"created_at"?: string,"full_name"?: string,"id"?: string,"must_change_password"?: boolean,"role"?: Database["public"]['Enums']["user_role"],"theme"?: string,"updated_at"?: string,"username"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reminder_alerts": {
                  Row: {
                    "armed_at": string,"fired_for": string | null,"minutes_before": number,"reminder_id": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "armed_at"?: string,"fired_for"?: string | null,"minutes_before": number,"reminder_id": number,"user_id": string
                  }
                  Update: {
                    "armed_at"?: string,"fired_for"?: string | null,"minutes_before"?: number,"reminder_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminder_alerts_reminder_id_fkey"
      columns: ["reminder_id"]
isOneToOne: false
      referencedRelation: "reminders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminder_alerts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reminder_decisions": {
                  Row: {
                    "alerts": (number)[],"all_day": boolean,"category_id": number | null,"created_at": string,"decision": string | null,"description": string | null,"end_at": string | null,"former_owner_id": string | null,"id": number,"kept_reminder_id": number | null,"location": string | null,"note": string | null,"reason": string,"reminder_id": number | null,"resolved_at": string | null,"start_at": string,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alerts"?: (number)[],"all_day": boolean,"category_id"?: number | null,"created_at"?: string,"decision"?: string | null,"description"?: string | null,"end_at"?: string | null,"former_owner_id"?: string | null,"id"?: never,"kept_reminder_id"?: number | null,"location"?: string | null,"note"?: string | null,"reason": string,"reminder_id"?: number | null,"resolved_at"?: string | null,"start_at": string,"title": string,"user_id": string
                  }
                  Update: {
                    "alerts"?: (number)[],"all_day"?: boolean,"category_id"?: number | null,"created_at"?: string,"decision"?: string | null,"description"?: string | null,"end_at"?: string | null,"former_owner_id"?: string | null,"id"?: never,"kept_reminder_id"?: number | null,"location"?: string | null,"note"?: string | null,"reason"?: string,"reminder_id"?: number | null,"resolved_at"?: string | null,"start_at"?: string,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminder_decisions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminder_decisions_former_owner_id_fkey"
      columns: ["former_owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminder_decisions_kept_reminder_id_fkey"
      columns: ["kept_reminder_id"]
isOneToOne: false
      referencedRelation: "reminders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminder_decisions_reminder_id_fkey"
      columns: ["reminder_id"]
isOneToOne: false
      referencedRelation: "reminders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminder_decisions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reminder_participants": {
                  Row: {
                    "added_at": string,"reminder_id": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"reminder_id": number,"user_id": string
                  }
                  Update: {
                    "added_at"?: string,"reminder_id"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminder_participants_reminder_id_fkey"
      columns: ["reminder_id"]
isOneToOne: false
      referencedRelation: "reminders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminder_participants_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reminders": {
                  Row: {
                    "all_day": boolean,"category_id": number,"created_at": string,"description": string | null,"end_at": string | null,"id": number,"location": string | null,"note": string | null,"owner_id": string,"start_at": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_day"?: boolean,"category_id": number,"created_at"?: string,"description"?: string | null,"end_at"?: string | null,"id"?: never,"location"?: string | null,"note"?: string | null,"owner_id"?: string,"start_at": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "all_day"?: boolean,"category_id"?: number,"created_at"?: string,"description"?: string | null,"end_at"?: string | null,"id"?: never,"location"?: string | null,"note"?: string | null,"owner_id"?: string,"start_at"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminders_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminders_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_delete_category":
{ Args: { "p_category_id": number }; Returns: string
                           },
"admin_flag_password_reset":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"admin_update_user":
{ Args: { "p_active": boolean,"p_color": string,"p_full_name": string,"p_role": Database["public"]['Enums']["user_role"],"p_user_id": string }; Returns: undefined
                           },
"calendar_reminders":
{ Args: { "p_from": string,"p_to": string,"p_user_ids": (string)[] }; Returns: {
              "all_day": boolean,
"category_id": number,
"created_at": string,
"description": string | null,
"end_at": string | null,
"id": number,
"location": string | null,
"note": string | null,
"owner_id": string,
"start_at": string,
"title": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "reminders"
        isOneToOne: false
        isSetofReturn: true
      } },
"complete_password_change":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"resolve_reminder_decision":
{ Args: { "p_id": number,"p_keep": boolean }; Returns: number
                           },
"save_reminder":
{ Args: { "p_alerts"?: (number)[],"p_all_day": boolean,"p_category_id": number,"p_description": string,"p_end_at": string,"p_id": number,"p_location": string,"p_note": string,"p_participants": (string)[],"p_start_at": string,"p_title": string }; Returns: number
                           },
"set_my_theme":
{ Args: { "p_theme": string }; Returns: undefined
                           },
"set_reminder_alerts":
{ Args: { "p_minutes": (number)[],"p_reminder_id": number }; Returns: undefined
                           }
          }
          Enums: {
            "user_role": "admin"|"user"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "user_role": ["admin", "user"]
          }
        }
} as const
