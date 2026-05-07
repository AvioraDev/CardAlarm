export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      listings_feed: {
        Row: {
          id: number;
          external_id: string;
          source: string;
          title: string | null;
          price: number | null;
          url: string | null;
          image_url: string | null;
          match_type: string | null;
          is_dismissed: boolean;
          is_oos: boolean;
          created_at: string;
          year: string | null;
          set_name: string | null;
          card_number: string | null;
          player_name: string | null;
          variant: string | null;
          is_serial: boolean;
          serial_number: string | null;
          serial_current: string | null;
          serial_limit: string | null;
          is_auto: boolean;
          is_rookie: boolean;
          category: string | null;
          match_confidence: number | null;
          match_status: string | null;
          match_reasons: Json | null;
          unmatched_fields: Json | null;
          matcher_version: string | null;
        };
      };
      watchlist: {
        Row: { id: number; player_name: string; variants: string; target_numbers: string | null; is_active: boolean };
      };
      scan_runs: {
        Row: {
          id: number;
          mode: string;
          status: string;
          processed: number;
          matched: number;
          error: string | null;
          started_at: string;
          completed_at: string | null;
        };
      };
      source_products: { Row: Record<string, unknown> };
      store_products: { Row: Record<string, unknown> };
      product_snapshots: { Row: Record<string, unknown> };
      product_card_matches: { Row: Record<string, unknown> };
      reference_checklists: { Row: Record<string, unknown> };
    };
  };
}
