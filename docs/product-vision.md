# Product Vision: CardAlarm

## 1. The North Star
Deliver absolute "Procurement Alpha" to the user by eliminating manual market research. The system must identify, verify, and surface high-value trading card assets faster than the broader New Zealand collector market.

## 2. The Persona & Problem
**Persona:** Harry, 30. A data-driven collector who treats the hobby as an asset class. Values time efficiency and direct execution.
**Problem:** The NZ card market is fragmented across TradeMe and boutique Shopify stores. High-value listings often lack explicit player names, making standard keyword searches useless. 
**Impact:** Hours lost manually refreshing storefronts; missed procurement opportunities due to stale data and mislabeled inventory.

## 3. The Solution
A local background engine that acts as a Data Normalizer. It ingests raw listings, extracts card identifiers (numbers), and cross-references them against a master checklist database ("Stealth Match"). It strictly filters out sold or out-of-stock items, presenting a live-only gallery of immediately actionable targets.

## 4. MVP Milestones
*   **Milestone 1: The Local Brain.** Setup SQLite schema. Implement the `node-cron` worker to ingest Shopify JSON endpoints and extract identifiers.
*   **Milestone 2: The Stealth Engine.** Implement the checklist cross-referencing logic to match mislabeled listings against the Watchlist.
*   **Milestone 3: The Brutalist Feed.** Build the Next.js local dashboard. Display live matches with deep links to the checkout page.
