# Product Requirements & User Stories

## Epic 1: Configuration & Targeting
**US-1.1: Manage Watchlist Entities**
*   **As a** collector, **I want to** add and remove targets (Player Name, Variants, Target Card Numbers) to a local database **so that** the engine knows exactly what assets to hunt for.
*   **AC1:** User can insert a new target via a simple local UI or config file.
*   **AC2:** Targets must accept an array of variant strings (e.g., "Silver", "Prizm").

**US-1.2: Master Checklist Ingestion**
*   **As the** system, **I need to** hold a master reference of set checklists **so that** I can map a raw card number to a specific player name.
*   **Tech Task:** Create a utility script to parse a standard CSV checklist (Year, Set, Card #, Player) and seed the SQLite `reference_checklists` table.

## Epic 2: Ingestion & The Stealth Match
**US-2.1: Multi-Source Polling**
*   **As a** collector, **I want to** run a background worker that polls designated Shopify storefronts every 15 minutes **so that** I am constantly monitoring the market without manual effort.
*   **AC1:** The Node worker executes successfully on a 15-minute cron schedule.
*   **AC2:** The worker successfully parses `products.json` from configured Shopify targets.
*   **AC3:** The worker applies a 2-second delay between source requests to prevent IP bans.

**US-2.2: Live Availability Enforcement**
*   **As a** collector, **I want to** immediately discard out-of-stock items **so that** my feed only contains actionable purchases.
*   **AC1:** If `available: false` in the Shopify JSON, the listing is ignored.
*   **AC2:** If an existing listing on the dashboard becomes unavailable, it is marked `is_oos = true` and hidden.

**US-2.3: The Stealth Match Logic**
*   **As a** collector, **I want to** match listings based on their extracted card number against my checklist **so that** I can find listings where the seller forgot the player's name.
*   **AC1:** System extracts numeric patterns (e.g., `#241`) from the listing title.
*   **AC2:** System queries the checklist table to find the associated player name.
*   **AC3:** If the derived player name matches a Watchlist entity, insert the listing as a "Stealth Match".

## Epic 3: The Procurement Dashboard
**US-3.1: Brutalist Active Feed**
*   **As a** collector, **I want to** view a high-density grid of all active matches **so that** I can rapidly evaluate new inventory.
*   **AC1:** Next.js dashboard renders all rows in `listings` where `is_dismissed = false` and `is_oos = false`.
*   **AC2:** Each card displays: Image, Price, Source, Match Type (Direct/Stealth), and a "Buy Now" deep link.

**US-3.2: The Kill Switch**
*   **As a** collector, **I want to** dismiss a listing permanently **so that** I only ever see net-new opportunities.
*   **AC1:** Clicking "Dismiss" updates the SQLite record to `is_dismissed = true`.
*   **AC2:** The UI updates instantly to remove the card from the grid.
