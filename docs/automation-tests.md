# Automation & Unit Test Scripts

*Framework Requirement: Use Jest for core logic/engine testing. Ensure all tests run against an in-memory SQLite database (`:memory:`) to prevent polluting the local production database.*

## Test Suite: The Stealth Match Engine (US-2.3)
**Test: Correctly identifies player from raw card number**
1. Seed in-memory DB with Checklist: `[{ set: "2025 Prizm", number: "241", player: "Victor Wembanyama" }]`.
2. Seed Watchlist: `[{ player: "Victor Wembanyama", variants: ["Silver"] }]`.
3. Pass mock listing title to extractor: `"Panini Prizm Silver #241 Mint"`.
4. **Assert:** Extractor returns `241`.
5. **Assert:** Matcher queries checklist and returns `"Victor Wembanyama"`.
6. **Assert:** Listing is flagged as a valid `Stealth Match` and queued for insertion.

**Test: Ignores false positive number matches**
1. Seed in-memory DB with Checklist: `[{ set: "2025 Prizm", number: "15", player: "Steven Adams" }]`.
2. Seed Watchlist: `[{ player: "Victor Wembanyama", variants: ["Silver"] }]`.
3. Pass mock listing title: `"Panini Prizm Silver #15".`
4. **Assert:** Matcher identifies player as `"Steven Adams"`.
5. **Assert:** Listing is rejected because Steven Adams is not on the Watchlist.

## Test Suite: Availability Enforcement (US-2.2)
**Test: Discards Out-of-Stock JSON payloads**
1. Pass mock Shopify `products.json` response where target product has `available: false`.
2. Run ingestion node.
3. **Assert:** The product is not inserted into the `listings` table.

**Test: Purges stale dashboard items**
1. Insert mock listing into `listings` table with `is_oos = false`.
2. Trigger the Availability Watchdog function.
3. Mock the fetch response for that listing's URL to return a 404 or a payload indicating out-of-stock.
4. **Assert:** Database record is updated to `is_oos = true`.

## Test Suite: Dashboard Interaction (US-3.2)
**Test: The Kill Switch updates database state**
1. Insert active listing into DB.
2. Trigger the `dismissListing(id)` API route/server action.
3. **Assert:** Database record for that ID now reflects `is_dismissed = true`.
4. **Assert:** Querying the active feed no longer returns this ID.
