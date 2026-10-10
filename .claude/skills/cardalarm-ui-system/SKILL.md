---
name: cardalarm-ui-system
description: CardAlarm's customer UI system - design tokens, shared component classes, typography rules and card anatomy. Use whenever you add or change any customer-facing page or component in web/ so new UI stays consistent with the rest of the app.
---

# CardAlarm UI system

Source of truth: `web/src/app/globals.css` (tokens in `@theme`, shared classes in one `@layer components` block). Read it before inventing classes. Load `anthropic-skills:cardalarm-delivery` for the product rules; run `cardalarm-ux-review` before merging.

## Principles
1. **Cards first.** On a 360x740 phone the first match card should start near the top; chrome collapses or comes after content.
2. **Sans for words, mono for data.** Headings, body, nav, buttons and labels are Inter, sentence case. JetBrains Mono (tabular numerals) is only for prices, counts, percentages, card numbers, print runs and tags. No uppercase text except the 2-3 letter `RC` tag. Never combine `uppercase` with `btn`.
3. **Trust is visible, not loud.** A card shows store, price with currency, last-checked time, a match tier and at most two plain-English reasons.
4. **Possible is distinct by three cues**: dashed border (`card-possible`), a "Possible match" badge (`badge-possible`), and an inline caution line - and possible matches render in their own labelled section after confirmed ones.
5. **Every view has loading, empty (one specific empty state per cause) and error states.** Route-level `loading.tsx`, `error.tsx`, `not-found.tsx` and `global-error.tsx` exist; use `ErrorPanel` and the `SubmitButton` / `ConfirmSubmitButton` client components for pending and destructive actions.

## Tokens
`--color-bg/surface/card/elevated/border/text/text-muted/accent/danger`, plus `--color-confirmed` (blue) and `--color-possible` (purple). Use them through Tailwind utilities (`text-confirmed`, `bg-possible/10`, `border-possible/50`).

## Shared classes (use these, do not re-style per page)
`panel`, `eyebrow`, `data`, `field-label`, `field`, `btn` + `btn-sm` + (`btn-primary` | `btn-secondary` | `btn-ghost` | `btn-danger`), `nav-link`, `chip`, `badge` + (`badge-confirmed` | `badge-possible` | `badge-neutral` | `badge-example`), `card-possible`, `tag` (+ `tag-accent|warning|rookie`).

## Card anatomy (`ListingCard`)
5:7 portrait image (`CardImage`, fallback panel on missing/failed image) - on phones a horizontal row so more cards fit. Title/player, store + price + `Checked ... ago`, tier badge and percent, up to 2 reasons from `customerReasons()`, then actions (Save, Hide, Not a match) and `Open store`. Admin pages reuse the same component without feedback controls.

## Rules for changes
- Add a class to `globals.css` only when two or more places need it; name it by role, not by look.
- Touch targets at least 40px; visible `:focus-visible` ring is global - do not remove it.
- Customer copy never contains `backfill`, `canonical`, `MVP`, `cached listings`; "Serialized" reads "Numbered". `engine/__tests__/customer-copy.test.ts` enforces this - extend it rather than bypass it.
- Landing/example content must be labelled as an example (`badge-example`, "Illustrative example").
- Update this skill when the token or class contract changes.
