# CardAlarm MVP Prompt Roadmap

This document contains the implementation prompts to bring CardAlarm from the current working build to an MVP-ready product.

Current product focus:

```text
NBA singles only.
Admin-controlled store scanning.
Customer watchlists backfill against cached inventory.
The customer experience is focused on cards found for the user, not browsing raw cached inventory.
```

## MVP target

CardAlarm should let a collector create NBA singles watchlists, check those watchlists against controlled AU/NZ store inventory, show relevant cards in a focused For You dashboard, and notify the user when new relevant cards are found.

## Product principles

```text
1. The cache is infrastructure, not the customer product.
2. The customer product is relevance and timing.
3. Users should not trigger external store scans.
4. Admins/system control store sources and scan cadence.
5. User actions should only touch CardAlarm data and backfill against existing inventory.
6. Bad matches are worse than no matches.
7. Keep NBA singles narrow until the MVP loop is genuinely useful.
8. Do not expand into NBA sealed, Pokémon sealed, or Shopify push until alerts and events exist.
```

## Current state summary

```text
Overall MVP status: approximately 70–75% complete.
Functional MVP core: approximately 75% complete.
Customer MVP: approximately 60% complete.
Launch-ready MVP: approximately 50–55% complete.
```

What is already working:

```text
- Store scanning into cached inventory.
- Product cache using store_products.
- Product classifications are persisted.
- Watchlists exist.
- Watchlist creation triggers backfill against existing inventory.
- User-specific watchlist matches exist.
- Focused For You dashboard exists.
- Raw inventory is now admin-only.
- Admin stores/scans/inventory pages exist.
- Admin routes are protected by requireAdmin.
```

Known priority gaps:

```text
1. For You filters still use global inventory facets.
2. Remaining customer/internal wording needs cleanup.
3. Save/dismiss/match feedback is not complete.
4. Alerts/notifications are missing.
5. Availability events are missing.
6. Backfill currently runs synchronously.
7. Scan locking/cooldowns need hardening.
8. Non-functional controls need a first pass.
```

---

# Prompt 1: Scope For You filters to user watchlist matches

## Role

You are a senior full-stack engineer working on CardAlarm, a watchlist-driven NBA card discovery app.

## Context

CardAlarm has moved raw scanned inventory out of the normal customer dashboard and into admin-only inventory. The For You dashboard is now focused on user watchlist matches.

However, the For You filter dropdowns are still using global inventory facets.

Current issue:

```text
web/src/app/dashboard/page.tsx calls getFilterFacets().
getFilterFacets() is inventory-scoped and builds dropdown values from all active cached store_products.
This means the For You dashboard shows players, years, variants, and sources from the entire scanned inventory instead of only the current user's watchlist matches.
```

## Target audience

The implementation should preserve the current MVP user experience while fixing data correctness.

## Task instructions

Implement watchlist-scoped facets for the For You dashboard.

Acceptance criteria:

```text
1. Do not change scanner behaviour.
2. Do not change matcher behaviour.
3. Do not change classification logic.
4. Do not change database schema.
5. Keep getFilterFacets() for /admin/inventory.
6. Add a new function:
   getUserWatchlistFilterFacets(userId: string, filters?: FilterOptions): Promise<FilterFacets>
7. The new function must build facets from the same base result set as getUserWatchlistFeed().
8. The new function must join:
   - public.watchlist_matches wm
   - public.watchlists w
   - public.watchlist_rules wr
   - public.players p
   - public.store_products sp
   - watchlistInventoryMatchJoinSql()
   - inventoryClassificationJoinSql()
9. The new function must use buildWatchlistMatchWhereSql(userId, filters), not buildInventoryWhereSql().
10. For You dashboard must call getUserWatchlistFilterFacets(user.id, cleanFilters), not getFilterFacets().
11. /admin/inventory must continue using getFilterFacets().
12. Facets must only include values present in the user's matched watchlist result set.
13. Facets must only include active/current products:
   - w.user_id = userId
   - w.is_active = true
   - sp.is_active = true
   - sp.current_availability = true
14. Facets should include:
   - sources from sp.source
   - years from pc.year
   - setNames from coalesce(pc.set_name, pc.product_line)
   - players from coalesce(pcm.matched_player_name, pc.player_name, p.full_name, nullif(trim(split_part(coalesce(wr.include_terms, ''), ',', 1)), ''), w.name)
   - variants from coalesce(pc.variant_name, pc.parallel_name, pc.insert_name)
   - categories from pc.category
15. Facets should count distinct sp.id so one product matching multiple watchlists/rules does not inflate counts.
16. Facet values must exclude null and empty strings.
17. Facet values must be ordered alphabetically A-Z using case-insensitive ordering.
18. Keep the existing FilterBar component if possible.
19. Add tests covering:
   - dashboard imports/calls getUserWatchlistFilterFacets
   - dashboard does not call getFilterFacets for For You
   - getFilterFacets still exists for admin inventory
   - getUserWatchlistFilterFacets uses watchlist_matches and user_id scoping
   - getUserWatchlistFilterFacets does not use buildInventoryWhereSql
   - facet query counts distinct sp.id
20. Run:
   - npm test -- --runInBand
   - npx tsc --noEmit
   - npm run lint --prefix web
   - npm run web:build
```

Implementation guidance:

```text
Prefer correct scoping over advanced faceted-search behaviour.
It is acceptable for selected filters to narrow other dropdowns in this MVP patch.
Do not over-engineer multi-select faceting yet.
```

After implementation:

```text
- Summarise changed files.
- Confirm For You filters are user/watchlist scoped.
- Confirm Admin Inventory filters remain global inventory scoped.
- Confirm no scanner/matcher/classification/schema changes were made.
```

## Tone of voice

Precise, minimal, implementation-focused.

## Objective

The For You dashboard must only expose filter values from cards actually found for that user.

---

# Prompt 2: Final customer-facing wording cleanup

## Role

You are a senior product engineer and UX writer polishing CardAlarm for MVP.

## Context

The app now has the correct product shape: customer users see a focused For You dashboard, while raw inventory is admin-only.

Some internal/MVP wording remains in customer and admin pages.

Known wording to clean up:

```text
CardAlarm MVP
Current build focus
structured rules
Serialized
Operations
legacy admin watchlist management
scanner runtime
canonical
cached listings
backfill
```

## Target audience

Collectors using CardAlarm for NBA singles watchlists.

## Task instructions

Finish the customer-facing wording pass.

Acceptance criteria:

```text
1. Do not change scanner behaviour.
2. Do not change matcher behaviour.
3. Do not change classification logic.
4. Do not change database schema.
5. Do not change route structure.
6. Homepage:
   - Replace “CardAlarm MVP” with customer-facing wording.
   - Replace “Current build focus” with “How it works” or similar.
   - Keep “Never miss the card you're chasing.”
   - Avoid internal product-build language.
7. Admin home:
   - Replace “Operations” with “Admin Console”.
   - Remove the legacy watchlist management sentence.
   - Use “Store Sources”, “Scan Runs”, and “Inventory QA” style wording.
8. Watchlists page:
   - Replace “Tell CardAlarm what matters” with “Cards you're chasing”.
   - Replace “structured rules” with “filters” or “watchlist filters”.
   - Replace “No structured rules yet” with “No filters yet”.
9. Dashboard:
   - Replace “Serialized” metric label with “Numbered”.
10. Admin Inventory:
   - Replace “Serialized” with “Numbered”.
11. Avoid customer-facing references to:
   - MVP
   - cached listings
   - cached store inventory
   - backfill
   - scanner runtime
   - canonical
   - legacy
12. Do not redesign the visual system in this patch.
13. Run:
   - npm test -- --runInBand
   - npx tsc --noEmit
   - npm run lint --prefix web
   - npm run web:build
```

Suggested replacements:

```text
MVP → omit entirely
Current build focus → How it works
structured rules → filters
Serialized → Numbered
Operations → Admin Console
Manage scan sources → Store Sources
Run and monitor scans → Scan Runs
Review scanned products → Inventory QA
```

After implementation:

```text
- Summarise changed files.
- List all wording changes.
- Confirm no scanner/matcher/classification/schema changes were made.
```

## Tone of voice

Clear, commercial, collector-friendly, not hypey.

## Objective

Make the app feel like a real product rather than an internal MVP dashboard.

---

# Prompt 3: Add save, dismiss, and match feedback foundation

## Role

You are a senior full-stack engineer building the first customer feedback loop for CardAlarm.

## Context

The For You dashboard shows cards found for a user's watchlists. Users need basic control over what they see and a way to tell CardAlarm whether a result was useful.

This is important for UX now and for future AI/classification improvement later.

## Target audience

Collectors reviewing cards found for their watchlists.

## Task instructions

Add the foundation for user-level result state and feedback.

Acceptance criteria:

```text
1. Do not change scanner behaviour.
2. Do not change matcher behaviour.
3. Do not change classification logic.
4. Avoid large visual redesigns.
5. Add user-specific result controls for watchlist matches:
   - Save
   - Dismiss
   - Not a match
6. Result state must be user-specific.
7. Dismissing a result for one user must not remove the product or match globally.
8. Saving a result must persist for the user.
9. “Not a match” should record feedback without deleting canonical product data.
10. Add or use an appropriate user-level table, for example:
    user_match_feedback or saved_matches.
11. Table should support at least:
    - user_id
    - watchlist_match_id or store_product_id
    - feedback_type
    - created_at
    - updated_at
12. Feedback types should support:
    - saved
    - dismissed
    - not_a_match
13. The For You dashboard should hide dismissed matches by default.
14. Saved matches should be visually distinguishable on the card.
15. Add server actions for save/dismiss/not-a-match.
16. Server actions must require requireUser().
17. Server actions must verify the target match/product belongs to the current user's visible match set.
18. Do not expose admin inventory feedback controls unless intentionally designed.
19. Add tests for:
    - feedback actions require user
    - feedback is user-scoped
    - dismissed matches are excluded from For You by default
    - saving does not affect other users
20. Run:
    - npm test -- --runInBand
    - npx tsc --noEmit
    - npm run lint --prefix web
    - npm run web:build
```

Implementation guidance:

```text
Keep the first version simple.
Do not try to build a full saved page unless it is low effort.
The main goal is user-level state and feedback capture.
A later iteration can build Saved, History, and feedback analytics.
```

After implementation:

```text
- Summarise changed files.
- Explain the user-level feedback model.
- Confirm dismissed cards are hidden only for that user.
- Confirm no canonical product/match data is deleted by feedback.
```

## Tone of voice

Practical and guarded.

## Objective

Users should be able to clean up their For You feed and provide signal about match quality.

---

# Prompt 4: Add MVP email alerts for new watchlist matches

## Role

You are a senior full-stack engineer implementing the first notification capability for CardAlarm.

## Context

CardAlarm's brand promise is “Never miss the card you're chasing.” The dashboard can show matches, but users are not yet notified.

For MVP, use email alerts first. Do not implement browser push or mobile push yet.

## Target audience

Collectors who want to know when a new card matching their watchlist appears.

## Task instructions

Implement MVP email alerts for new watchlist matches.

Acceptance criteria:

```text
1. Do not change scanner fetch behaviour.
2. Do not change classification logic.
3. Do not add browser push notifications.
4. Do not add mobile push notifications.
5. Add an alerts table or equivalent persistent model.
6. Alerts must be user-specific.
7. Alerts must be deduped.
8. Alert generation should happen when a new watchlist match is created or first becomes alertable.
9. Do not send repeated alerts for the same user/watchlist/product event.
10. Respect watchlist notification settings.
11. Add user-facing setting to enable/disable alerts per watchlist.
12. Default notification_enabled should remain conservative unless explicitly changed.
13. Add email provider integration behind an environment-configured adapter.
14. In development, support a safe no-send/log-only mode.
15. Email content should include:
    - watchlist name
    - card/listing title
    - price
    - store/source
    - direct store URL
    - reason/confidence if available
16. Add alert statuses:
    - pending
    - sent
    - failed
    - suppressed
17. Add dedupe_key with a unique constraint.
18. Alert sending must be retry-safe.
19. Add an admin-visible alert log if low effort; otherwise leave table/logs only.
20. Add tests for:
    - dedupe key generation
    - disabled watchlist suppresses alerts
    - enabled watchlist creates alerts
    - same match does not create duplicate alerts
    - development no-send mode does not call provider
21. Run:
    - npm test -- --runInBand
    - npx tsc --noEmit
    - npm run lint --prefix web
    - npm run web:build
```

Suggested alert model:

```sql
alerts
- id
- user_id
- watchlist_id
- watchlist_match_id
- store_product_id
- event_type
- channel
- status
- dedupe_key
- error_message
- created_at
- sent_at
- updated_at
```

Suggested event type for first MVP:

```text
new_watchlist_match
```

Implementation guidance:

```text
Email first. Push later.
Do not notify from page loads.
Prefer alert creation from backfill/matching paths or a dedicated alert-generation function.
Do not let alert sending block normal user requests if it becomes slow; if needed, create pending alerts first and process separately.
```

After implementation:

```text
- Summarise changed files.
- Explain alert dedupe.
- Explain how to configure the email provider.
- Confirm alerts respect watchlist notification settings.
- Confirm no push notification code was added.
```

## Tone of voice

Reliability-first.

## Objective

A user can receive a deduped email when CardAlarm finds a new matching NBA single.

---

# Prompt 5: Add product availability events

## Role

You are a senior backend engineer adding event-driven foundations to CardAlarm.

## Context

CardAlarm currently stores current product state and snapshots. For restock alerts, price alerts, and future sealed product tracking, availability changes need to become first-class events.

## Target audience

This is backend infrastructure for future alerts, sealed product tracking, and observability.

## Task instructions

Add a first-class product availability event model.

Acceptance criteria:

```text
1. Do not change customer UX unless needed for admin visibility.
2. Do not change scanner fetch behaviour.
3. Do not change matching logic beyond event creation hooks.
4. Add product_availability_events table or equivalent migration.
5. Events should support:
   - first_seen
   - restocked
   - sold_out
   - price_changed
   - product_updated
6. Events should reference:
   - store_product_id
   - store_id if available
   - source
   - external_id
7. Events should store previous/current values where relevant:
   - previous_availability
   - current_availability
   - previous_price
   - current_price
8. Events should include source of detection:
   - scanner
   - webhook later
   - manual/admin later if needed
9. Event creation must be idempotent where practical.
10. Scanner upsert path should create events when product state changes.
11. OOS marking path should create sold_out events.
12. Restock should be detected when previous availability was false and current availability is true.
13. First seen should be detected for new active products.
14. Price changed should be detected when price changes meaningfully.
15. Add admin-only basic event visibility if low effort; otherwise table only is acceptable.
16. Add tests for:
    - first_seen event
    - restocked event
    - sold_out event
    - price_changed event
    - duplicate scan does not create repeated identical events
17. Run:
    - npm test -- --runInBand
    - npx tsc --noEmit
    - npm run lint --prefix web
    - npm run web:build
```

Suggested table:

```sql
product_availability_events
- id bigserial primary key
- store_product_id bigint not null
- store_id bigint null
- source text not null
- external_id text not null
- event_type text not null
- previous_availability boolean null
- current_availability boolean null
- previous_price numeric null
- current_price numeric null
- detection_source text not null default 'scanner'
- dedupe_key text not null unique
- detected_at timestamptz not null default now()
- created_at timestamptz not null default now()
```

Implementation guidance:

```text
Do not build sealed/restock UX in this patch.
This is an infrastructure patch.
Alerting can later use these events as triggers.
```

After implementation:

```text
- Summarise changed files.
- Explain event creation rules.
- Confirm duplicate scans do not spam repeated events.
- Confirm this prepares the app for restock alerts.
```

## Tone of voice

Backend-focused, cautious, observable.

## Objective

CardAlarm should know not just what products exist, but what changed and when.

---

# Prompt 6: Enforce controlled scan architecture

## Role

You are a senior backend/platform engineer hardening CardAlarm's scan control model.

## Context

CardAlarm should be cache-first. Users create watchlists and the system backfills against existing scanned inventory. Users must not trigger external store scans. Store scanning should be controlled by admin/system schedules only.

Product rule:

```text
No normal user action should call an external store or trigger a store scan.
```

## Target audience

MVP production hardening.

## Task instructions

Enforce controlled scan architecture and prevent user-triggered scanning.

Acceptance criteria:

```text
1. Do not change scanner fetch logic.
2. Do not change matching logic.
3. Do not change classification logic.
4. Confirm all scan trigger UI is admin-only.
5. Confirm scan trigger actions require requireAdmin or equivalent admin guard.
6. Confirm customer dashboard has no scan buttons or scan language.
7. Confirm watchlist creation/editing does not trigger store scans.
8. Watchlist creation/editing may trigger or prepare backfill/rematch against existing store_products only.
9. Add tests or code checks proving:
   - dashboard does not import scan runners/actions
   - watchlist pages do not import scan runners/actions
   - scan panel is only used under admin routes
   - scan trigger action validates admin role before running
10. Add a scan lock/cooldown check if not already present:
   - prevent duplicate running full scans
   - prevent duplicate running store scans for the same store
11. Add clear comments documenting:
   - scanning is admin/system controlled
   - user watchlists backfill against cached inventory
   - users do not trigger external store calls
12. Run:
   - npm test -- --runInBand
   - npx tsc --noEmit
   - npm run lint --prefix web
   - npm run web:build
```

Implementation guidance:

```text
The scalable model is:
controlled scans + shared cached inventory + user-specific matching.
Do not add user-facing scan controls.
```

After implementation:

```text
- Summarise changed files.
- Confirm no customer route can trigger a scan.
- Confirm admin scan functionality still works.
- Confirm watchlist actions only backfill against existing inventory.
```

## Tone of voice

Security and operations focused.

## Objective

Protect the architecture boundary between user watchlists and external store scanning.

---

# Prompt 7: Add baseline performance and index hardening

## Role

You are a senior database engineer hardening CardAlarm for MVP-scale usage.

## Context

The app currently works with tens of thousands of store products and user watchlist matches. Before broader testing, query performance and indexes need a baseline pass.

The customer dashboard should read precomputed data quickly. Heavy scanner/classifier/matcher work should happen outside customer page loads.

## Target audience

MVP beta users and admin operators.

## Task instructions

Add baseline performance hardening for the current MVP data model.

Acceptance criteria:

```text
1. Do not change product behaviour.
2. Do not change scanner fetch behaviour.
3. Do not change matching/classification semantics.
4. Review current migrations/indexes before adding new indexes.
5. Add missing indexes for common dashboard/admin/scanner query paths.
6. Add query timing logs in server-side DB helper behind an environment flag.
7. Query timing logs must not print sensitive user data or full SQL params.
8. Add pagination safeguards where missing.
9. Ensure admin inventory remains paginated.
10. Ensure For You dashboard does not query raw inventory unnecessarily.
11. Add tests or code checks for query functions where practical.
12. Run:
    - npm test -- --runInBand
    - npx tsc --noEmit
    - npm run lint --prefix web
    - npm run web:build
```

Indexes to consider, after checking existing migrations:

```sql
create index if not exists idx_store_products_active_available_seen
on public.store_products (is_active, current_availability, last_seen_at desc);

create index if not exists idx_store_products_source_external
on public.store_products (source, external_product_id);

create index if not exists idx_store_products_source_active
on public.store_products (source, is_active, current_availability);

create index if not exists idx_watchlist_matches_watchlist_product
on public.watchlist_matches (watchlist_id, store_product_id);

create index if not exists idx_watchlist_matches_last_matched
on public.watchlist_matches (last_matched_at desc);

create index if not exists idx_watchlists_user_active
on public.watchlists (user_id, is_active);

create index if not exists idx_product_classifications_product_classifier_updated
on public.product_classifications (store_product_id, classifier_type, classifier_version, updated_at desc);

create index if not exists idx_product_card_matches_store_product_confidence
on public.product_card_matches (store_product_id, confidence desc, updated_at desc);
```

Implementation guidance:

```text
Add indexes conservatively.
Do not add pg_trgm unless the extension/migration strategy is clear.
Do not optimise blindly; prioritise obvious joins and filters already used by the app.
```

After implementation:

```text
- List indexes added.
- Explain which query paths they support.
- Explain how to enable query timing logs.
- Confirm no product behaviour changed.
```

## Tone of voice

Database-focused, low-risk.

## Objective

Make the current MVP query paths safe enough for controlled beta usage.

---

# Prompt 8: Add input validation and ownership checks

## Role

You are a senior application security engineer hardening CardAlarm server actions.

## Context

CardAlarm has user watchlists, user matches, admin store/scanning tools, and server actions. Before MVP beta, server-side validation and object ownership checks need to be explicit.

## Target audience

Public or semi-public MVP beta.

## Task instructions

Add baseline input validation and ownership checks.

Acceptance criteria:

```text
1. Do not change product behaviour except to reject invalid/unauthorised input.
2. Do not change scanner/matcher/classification logic.
3. Add schema validation for watchlist form actions.
4. Validate:
   - watchlist name
   - include terms
   - exclude terms
   - price fields
   - confidence fields
   - booleans
   - watchlistId values
5. All user watchlist actions must verify the object belongs to the current user.
6. All user match feedback actions must verify the match/product belongs to the current user's visible match set.
7. All admin actions must require admin role.
8. Add clear error handling that does not leak sensitive details.
9. Add tests for:
   - user cannot modify another user's watchlist
   - invalid watchlistId is rejected
   - non-admin cannot access admin action
   - invalid numeric input is rejected or safely normalised
10. Run:
    - npm test -- --runInBand
    - npx tsc --noEmit
    - npm run lint --prefix web
    - npm run web:build
```

Implementation guidance:

```text
Use a validation library if already available or add one if acceptable.
If avoiding a new dependency, centralise validation helpers.
Do not rely on client-side validation only.
```

After implementation:

```text
- Summarise validation added.
- Summarise ownership checks added.
- Confirm admin-only actions remain admin-only.
```

## Tone of voice

Security-focused and practical.

## Objective

Server actions should be safe by default before wider testing.

---

# Prompt 9: Convert watchlist backfill to a job-ready model

## Role

You are a senior backend engineer preparing CardAlarm for larger watchlist volume.

## Context

Watchlist creation currently runs backfill synchronously. This is acceptable for MVP testing but may become slow as inventory and users grow.

The goal is not to build a full queue system yet. The goal is to make backfill job-ready and observable.

## Target audience

MVP beta users and future scale.

## Task instructions

Add a watchlist backfill job model while preserving current behaviour.

Acceptance criteria:

```text
1. Do not change scanner behaviour.
2. Do not change classification logic.
3. Do not change watchlist matching semantics.
4. Add a watchlist_backfill_jobs table or equivalent.
5. A backfill job should track:
   - user_id
   - watchlist_id
   - status
   - rules_processed
   - matches_created_or_updated
   - error_message
   - started_at
   - completed_at
   - created_at
6. Watchlist creation should create a backfill job record.
7. For MVP, it may still execute immediately/synchronously.
8. Backfill execution should update job status.
9. Failed backfill should be recorded clearly.
10. The dashboard/watchlists should not break if a backfill fails.
11. Add tests for:
    - job created on watchlist backfill
    - successful job records counts
    - failed job records error
12. Run:
    - npm test -- --runInBand
    - npx tsc --noEmit
    - npm run lint --prefix web
    - npm run web:build
```

Implementation guidance:

```text
This is not a full queue implementation.
It is a stepping stone so future background workers can pick up pending backfill jobs.
```

After implementation:

```text
- Summarise job model.
- Confirm current synchronous UX still works.
- Explain how this prepares for async workers later.
```

## Tone of voice

Incremental, future-proof, no overengineering.

## Objective

Make watchlist backfill observable and ready to move out of request flow later.

---

# Prompt 10: Add an MVP production readiness checklist page or document

## Role

You are a senior technical lead preparing CardAlarm for MVP beta readiness.

## Context

CardAlarm now has enough moving parts that non-functional readiness must be tracked explicitly: performance, security, resilience, observability, data quality, and operations.

## Target audience

The project owner and any AI coding agent working on the repo.

## Task instructions

Add a production readiness checklist document to the repository.

Acceptance criteria:

```text
1. Add a markdown document under docs/.
2. Do not modify runtime code.
3. The document must cover:
   - performance
   - security
   - resilience
   - observability
   - data quality
   - operations
   - release readiness
4. Include concrete checks, not vague principles.
5. Include MVP thresholds where possible.
6. Include pre-launch blockers and post-launch follow-ups.
```

Suggested sections:

```text
1. Product scope
2. Architecture boundaries
3. Performance checks
4. Security checks
5. Resilience checks
6. Observability checks
7. Data quality checks
8. Admin operations checks
9. Alerting checks
10. Launch decision checklist
```

Example content:

```text
Performance target:
- For You dashboard p95 server response under 800ms in production for normal use.
- Admin inventory p95 under 1.5s for normal filtered use.
- Scan jobs must not materially degrade customer dashboard response.

Security target:
- Users can only read/update their own watchlists and feedback.
- Admin actions require requireAdmin.
- No service role keys in client code.
- Scan triggers are admin-only and rate limited.

Resilience target:
- Failed store scan does not fail all stores.
- Duplicate scans are prevented or safely ignored.
- Failed alerts retry without duplication.
```

After implementation:

```text
- Summarise the document created.
- Confirm no runtime code changed.
```

## Tone of voice

Technical-lead level, direct, actionable.

## Objective

Make MVP readiness visible and testable.

---

# Expansion backlog prompts

Do not run these until the NBA singles MVP is useful and alerting exists.

---

# Expansion Prompt A: Add NBA sealed product classification

## Role

You are a senior backend engineer expanding CardAlarm from NBA singles to NBA sealed product tracking.

## Context

CardAlarm currently focuses on NBA singles. The next expansion is NBA sealed product: hobby boxes, blasters, mega boxes, value boxes, packs, cases, and similar sealed products.

Do not start this until NBA singles MVP alerting exists.

## Task instructions

Add sealed product classification without breaking NBA singles.

Acceptance criteria:

```text
1. Do not degrade NBA singles classification.
2. Add product_kind support conceptually:
   - single
   - sealed
   - unknown
3. Add NBA sealed detection for:
   - hobby box
   - blaster box
   - mega box
   - value box
   - retail box
   - fast break box
   - choice box
   - Tmall box
   - hanger box
   - cello pack
   - fat pack
   - retail pack
   - sealed case
4. Preserve product_domain/category as NBA where appropriate.
5. Add tests for common NBA sealed titles.
6. Add tests proving sealed products are not treated as card singles.
7. Add admin inventory filter for product kind if schema supports it.
8. Do not add customer sealed watchlists yet unless explicitly requested.
```

## Objective

Admin inventory can distinguish NBA singles from NBA sealed products.

---

# Expansion Prompt B: Add availability-event-driven restock alerts

## Role

You are a senior backend engineer implementing restock alerts.

## Context

Availability events now exist. Restock alerts should fire from events, not from page loads or raw product rows.

## Task instructions

Implement restock alert generation from product_availability_events.

Acceptance criteria:

```text
1. Use product_availability_events as the trigger source.
2. Fire restock alerts when event_type = restocked.
3. Fire first-found alerts when event_type = first_seen if product matches an enabled watchlist.
4. Do not send repeated alerts for the same event/user/watchlist/product.
5. Reuse the existing alerts table and email pipeline.
6. Add dedupe keys.
7. Add tests for duplicate suppression.
```

## Objective

Users can be notified when a tracked sealed or single product appears/restocks.

---

# Expansion Prompt C: Add Pokémon sealed classification

## Role

You are a senior backend engineer adding a new product domain to CardAlarm.

## Context

CardAlarm has NBA singles and potentially NBA sealed. Pokémon sealed is a new domain and must not be mixed into NBA-specific classifier logic.

## Task instructions

Add Pokémon sealed classification as a separate domain classifier.

Acceptance criteria:

```text
1. Do not break NBA classification.
2. Add product_domain = pokemon where supported.
3. Add product_kind = sealed where supported.
4. Detect Pokémon sealed product types:
   - booster box
   - elite trainer box
   - Pokémon Center ETB
   - booster bundle
   - sleeved booster
   - triple blister
   - collection box
   - tin
   - mini tin
   - ultra premium collection
   - build and battle box
   - case
5. Add common Pokémon set dictionary.
6. Add explicit non-Pokémon exclusions where needed.
7. Add tests for common Pokémon sealed titles.
8. Do not add customer Pokémon watchlists until classification is acceptable.
```

## Objective

Admin inventory can identify Pokémon sealed products accurately enough to support later watchlists/restock alerts.

---

# Expansion Prompt D: Add Shopify webhook ingestion pilot

## Role

You are a senior integration engineer adding a push-based store integration pilot to CardAlarm.

## Context

CardAlarm currently uses pull-based Shopify scanning. Long term, partner stores may push product and inventory updates to CardAlarm through Shopify webhooks or a Shopify app.

Do not build a public Shopify app yet. Start with a private pilot webhook receiver.

## Task instructions

Add a private Shopify webhook ingestion pilot.

Acceptance criteria:

```text
1. Do not replace scanner functionality.
2. Scanner remains fallback/reconciliation.
3. Add admin-only store integration config.
4. Add inbound webhook endpoint.
5. Verify Shopify webhook HMAC signature.
6. Store inbound webhook event before processing.
7. Normalise Shopify product/inventory payload into the same product pipeline used by scans.
8. Upsert store_products.
9. Create product snapshots and availability events.
10. Trigger classification/matching for affected product only where practical.
11. Add idempotency for repeated webhook delivery.
12. Add tests for signature verification and duplicate webhook handling.
13. Do not build public Shopify OAuth/install flow in this patch.
```

## Objective

One friendly Shopify store can push product/inventory changes into CardAlarm without a scan.

---

# Recommended execution order

```text
1. Scope For You filters to user watchlist matches.
2. Final customer-facing wording cleanup.
3. Add save/dismiss/match feedback foundation.
4. Add MVP email alerts for new watchlist matches.
5. Add product availability events.
6. Enforce controlled scan architecture.
7. Add baseline performance and index hardening.
8. Add input validation and ownership checks.
9. Convert watchlist backfill to a job-ready model.
10. Add production readiness checklist.
```

Do not start the expansion backlog until the above MVP prompts are complete.

## Definition of MVP done

```text
MVP is done when:
1. A user can sign up/sign in.
2. A user can create an NBA singles watchlist.
3. The watchlist backfills against existing scanned inventory.
4. The For You dashboard shows only user-relevant matches.
5. Dashboard filters are scoped to the user's own matches.
6. The user can save, dismiss, or mark a result as not a match.
7. The user can enable email alerts for a watchlist.
8. A deduped email is sent when a new matching card is found.
9. Admins can manage stores and scans.
10. Raw inventory remains admin-only.
11. Normal users cannot trigger external store scans.
12. Basic performance, security, and resilience checks are documented and passing.
```
