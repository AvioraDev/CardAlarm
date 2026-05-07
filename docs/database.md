# Database Architecture: CardAlarm

## 1. Core Philosophy
CardAlarm uses a local-first database architecture utilizing SQLite (`cardalarm.db`) accessed synchronously via the `better-sqlite3` driver. 

**Constraints for Agents:**
*   **DO NOT** introduce ORMs (Prisma, Drizzle, TypeORM). Use raw SQL strings.
*   **DO NOT** write asynchronous database queries (`async/await`). `better-sqlite3` is synchronous by design, providing maximum performance for local, single-user applications.
*   **DO NOT** build complex migration systems. The MVP schema is managed via direct `CREATE TABLE IF NOT EXISTS` statements during initialization.

## 2. Schema Definition

### Table: `reference_checklists`
The "Brain" of the Stealth Match engine. Populated via local CSV/Excel ingestion.
*   `id` (INTEGER PRIMARY KEY)
*   `year` (INTEGER)
*   `set_name` (TEXT)
*   `card_number` (TEXT)
*   `player_name` (TEXT)
*   *Constraint:* `UNIQUE(set_name, card_number)`

### Table: `watchlist`
The user's active targets. 
*   `id` (INTEGER PRIMARY KEY)
*   `player_name` (TEXT) - Primary identifier.
*   `variants` (TEXT) - Comma-separated string of desired variants (e.g., "Silver, Prizm, Holo").
*   `target_numbers` (TEXT) - Optional. Comma-separated specific card numbers to bypass checklist lookup.
*   `is_active` (INTEGER) - Boolean flag (1/0) to pause hunting for a player.

### Table: `listings_feed`
The active procurement queue.
*   `id` (INTEGER PRIMARY KEY)
*   `external_id` (TEXT) - ID from TradeMe or Shopify to prevent duplicates.
*   `source` (TEXT) - Platform name (e.g., 'TradeMe', 'DimeCity').
*   `title` (TEXT) - Raw listing title.
*   `price` (REAL) - Extracted price in NZD.
*   `url` (TEXT) - Deep link to checkout/listing.
*   `image_url` (TEXT) - Primary listing image.
*   `match_type` (TEXT) - 'Direct' or 'Stealth'.
*   `is_dismissed` (INTEGER) - Boolean (1/0). Set to 1 when user clicks "Dismiss".
*   `is_oos` (INTEGER) - Boolean (1/0). Set to 1 if the availability watchdog detects it is sold.
*   `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)
*   *Constraint:* `UNIQUE(external_id, source)`

### Table: `source_products`
The raw Shopify product cache. Used to avoid rematching unchanged products every scan.
*   `source` (TEXT)
*   `external_id` (TEXT)
*   `handle` (TEXT)
*   `title` (TEXT)
*   `price` (REAL)
*   `available` (INTEGER)
*   `url` (TEXT)
*   `image_url` (TEXT)
*   `content_hash` (TEXT) - Hash of product fields relevant to matching/display.
*   `last_matched_hash` (TEXT) - Product hash last evaluated by the matcher.
*   `last_matched_context_hash` (TEXT) - Watchlist/matcher context used for last evaluation.
*   `first_seen_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)
*   `last_seen_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)
*   `last_seen_scan_token` (TEXT)
*   *Constraint:* `PRIMARY KEY(source, external_id)`

### MVP Development Tables
The local database now also includes MVP-shaped tables for the rebuild path:

*   `profiles` - Local user/admin profile records for future auth integration.
*   `stores` - Configurable store sources, replacing hardcoded source-only operation over time.
*   `store_scan_runs` - Per-store scan status and metrics.
*   `product_snapshots` - Product state observations for price and availability change detection.
*   `product_card_matches` - Explainable product-to-card match records with confidence, status, reasons, matcher version, and review fields.
*   `watchlist_matches` - Precomputed links between watchlist entries and matched store products.

`listings_feed` remains as the current dashboard compatibility table, but now carries confidence and explainability fields:

*   `match_confidence` (REAL)
*   `match_status` (TEXT) - `confirmed` or `possible`
*   `match_reasons` (TEXT JSON)
*   `unmatched_fields` (TEXT JSON)
*   `matcher_version` (TEXT)
*   `serial_current` (TEXT)
*   `serial_limit` (TEXT)

## 3. Access Patterns & Usage

### Initialization
The database connection should be instantiated once and shared.
```javascript
const Database = require('better-sqlite3');
const db = new Database('cardalarm.db');
db.pragma('journal_mode = WAL'); // Enable Write-Ahead Logging for performance
