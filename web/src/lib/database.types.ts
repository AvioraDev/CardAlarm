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
      stores: {
        Row: {
          id: number;
          slug: string;
          name: string;
          base_url: string;
          source_type: string;
          country_code: string | null;
          currency: string | null;
          is_active: boolean;
          scan_frequency_minutes: number;
          scan_strategy: "incremental" | "full";
          early_stop_enabled: boolean;
          early_stop_unchanged_pages: number;
          last_successful_scan_at: string | null;
          last_failed_scan_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      store_scan_runs: {
        Row: {
          id: number;
          store_id: number | null;
          store_slug: string;
          status: string;
          started_at: string;
          completed_at: string | null;
          products_seen: number;
          products_created: number;
          products_updated: number;
          products_processed: number;
          products_matched: number;
          products_marked_unavailable: number;
          error_message: string | null;
          metadata: Json | null;
          created_at: string;
        };
      };
      source_products: { Row: Record<string, unknown> };
      store_products: { Row: Record<string, unknown> };
      product_snapshots: { Row: Record<string, unknown> };
      product_card_matches: { Row: Record<string, unknown> };
      product_classifications: {
        Row: {
          id: number;
          store_product_id: number;
          classifier_version: string;
          classifier_type: string;
          status: string;
          year: string | null;
          category: string | null;
          brand: string | null;
          product_line: string | null;
          set_name: string | null;
          card_number: string | null;
          player_name: string | null;
          team_name: string | null;
          variant_name: string | null;
          parallel_name: string | null;
          insert_name: string | null;
          is_rookie: boolean;
          is_auto: boolean;
          is_serial: boolean;
          serial_number: string | null;
          serial_current: string | null;
          serial_limit: string | null;
          confidence: number | null;
          raw_signals: Json | null;
          created_at: string;
          updated_at: string;
        };
      };
      reference_checklists: { Row: Record<string, unknown> };
    };
  };
}
