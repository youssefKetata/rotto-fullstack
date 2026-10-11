export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      candidate_education: {
        Row: {
          candidate_id: string;
          degree: string;
          field: string;
          graduation_year: number | null;
          id: string;
          position: number;
          school: string;
        };
        Insert: {
          candidate_id: string;
          degree: string;
          field: string;
          graduation_year?: number | null;
          id?: string;
          position: number;
          school: string;
        };
        Update: {
          candidate_id?: string;
          degree?: string;
          field?: string;
          graduation_year?: number | null;
          id?: string;
          position?: number;
          school?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_education_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidate_experiences: {
        Row: {
          candidate_id: string;
          company_logo_url: string;
          company_name: string;
          company_type: string;
          description: string;
          end_year: number | null;
          id: string;
          position: number;
          start_year: number;
          title: string;
        };
        Insert: {
          candidate_id: string;
          company_logo_url: string;
          company_name: string;
          company_type: string;
          description: string;
          end_year?: number | null;
          id?: string;
          position: number;
          start_year: number;
          title: string;
        };
        Update: {
          candidate_id?: string;
          company_logo_url?: string;
          company_name?: string;
          company_type?: string;
          description?: string;
          end_year?: number | null;
          id?: string;
          position?: number;
          start_year?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidate_experiences_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      candidates: {
        Row: {
          avatar_url: string;
          city: string;
          country: string;
          current_company: string;
          current_company_logo_url: string;
          current_title: string;
          full_name: string;
          headline: string;
          id: string;
          open_to_work: boolean;
          role: string;
          seniority: string;
          skills: string[];
          state: string;
          years_experience: number;
        };
        Insert: {
          avatar_url: string;
          city: string;
          country: string;
          current_company: string;
          current_company_logo_url: string;
          current_title: string;
          full_name: string;
          headline: string;
          id: string;
          open_to_work: boolean;
          role: string;
          seniority: string;
          skills?: string[];
          state: string;
          years_experience: number;
        };
        Update: {
          avatar_url?: string;
          city?: string;
          country?: string;
          current_company?: string;
          current_company_logo_url?: string;
          current_title?: string;
          full_name?: string;
          headline?: string;
          id?: string;
          open_to_work?: boolean;
          role?: string;
          seniority?: string;
          skills?: string[];
          state?: string;
          years_experience?: number;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      recruiters: {
        Row: {
          company_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recruiters_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_briefs: {
        Row: {
          brief: string;
          company_id: string;
          created_at: string;
          created_by: string;
          filters: NonNullable<Json>;
          id: string;
        };
        Insert: {
          brief: string;
          company_id?: string;
          created_at?: string;
          created_by?: string;
          filters: NonNullable<Json>;
          id?: string;
        };
        Update: {
          brief?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string;
          filters?: NonNullable<Json>;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_briefs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_briefs_created_by_company_id_fkey";
            columns: ["created_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "recruiters";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      search_results: {
        Row: {
          candidate_id: string;
          position: number;
          search_id: string;
        };
        Insert: {
          candidate_id: string;
          position: number;
          search_id: string;
        };
        Update: {
          candidate_id?: string;
          position?: number;
          search_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "search_results_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_results_search_id_fkey";
            columns: ["search_id"];
            isOneToOne: false;
            referencedRelation: "searches";
            referencedColumns: ["id"];
          },
        ];
      };
      searches: {
        Row: {
          brief: string;
          company_id: string;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          filters: NonNullable<Json>;
          id: string;
          status: string;
          total: number;
        };
        Insert: {
          brief: string;
          company_id: string;
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          filters?: NonNullable<Json>;
          id?: string;
          status?: string;
          total?: number;
        };
        Update: {
          brief?: string;
          company_id?: string;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          filters?: NonNullable<Json>;
          id?: string;
          status?: string;
          total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "searches_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "searches_created_by_company_id_fkey";
            columns: ["created_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "recruiters";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      shortlist_people: {
        Row: {
          added_at: string;
          added_by: string;
          candidate_id: string;
          shortlist_id: string;
        };
        Insert: {
          added_at?: string;
          added_by?: string;
          candidate_id: string;
          shortlist_id: string;
        };
        Update: {
          added_at?: string;
          added_by?: string;
          candidate_id?: string;
          shortlist_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shortlist_people_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "recruiters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shortlist_people_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shortlist_people_shortlist_id_fkey";
            columns: ["shortlist_id"];
            isOneToOne: false;
            referencedRelation: "shortlists";
            referencedColumns: ["id"];
          },
        ];
      };
      shortlists: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          company_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shortlists_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shortlists_created_by_company_id_fkey";
            columns: ["created_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "recruiters";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
