---
name: cardalarm-ui-system
description: CardAlarm's customer UI system ("Catalogue") - theme tokens, type, shared component classes, card anatomy and icons. Use whenever you add or change any customer-facing page or component in web/ so new UI stays consistent and does not drift back to a generic SaaS look.
---

# CardAlarm UI system: "Catalogue"

Source of truth: `web/src/app/globals.css` (raw values as `--ca-*` on `:root` with a dark `@media (prefers-color-scheme: dark)` override, mapped by `@theme inline`; shared classes in one `@layer components`). Read it before inventing classes. Load `anthropic-skills:cardalarm-delivery` for the product rules, run `cardalarm-visual-verification` to *look* at the result, and `cardalarm-ux-review` before merging.

The look is an auction catalogue or grading pop report: warm paper, black ink, hairline rules, cards shown on a neutral mat, aligned figures, one quiet green that means "this is the card". Not a SaaS dashboard.

## Principles
1. **Cards first.** On a 360x740 phone the first match card starts near the top; chrome collapses or follows content. At 1280x900 the first card's Open store button is above the fold.
2. **Serif names, sans works, mono identifies.** Newsreader (`font-serif`) for the wordmark, page/section/empty titles, watchlist names and the player name on a card. IBM Plex Sans for everything else, sentence case, no tracking. Prices, counts and percentages are Plex Sans with `.data` (tabular figures). IBM Plex Mono (`.ref`) only for card numbers, print runs and serials. No uppercase except `RC`. Minimum 12px. Never alpha-blend text.
3. **Trust is visible, not loud.** A card shows store, price with currency, last-checked time, a tier badge with percentage and at most two plain-English reasons.
4. **Possible is distinct by four cues:** dashed ochre border (`card-possible`), `badge-possible` with the question icon, the caution line, and its own section under a dashed rule. Customers see two tiers only (Confirmed, Possible); the percentage shows the gradation. ("Strong" exists internally in `matchTier` only.)
5. **Every view has loading, empty (one specific empty state per cause) and error states.** Use `loading.tsx`, `error.tsx`, `not-found.tsx`, `global-error.tsx`, `ErrorPanel`, `SubmitButton` / `ConfirmSubmitButton` for pending and destructive actions.
6. **Catalogue, not SaaS.** Light paper by default with system dark (no toggle). No gradients, glows, shadows, pills or nested boxes. Hairlines and tone separate things. One accent (ledger green) means link, focus, selected or confirmed. Primary buttons are ink.

## Tokens
`bg, surface, mat, border, border-strong, text, text-muted, accent, accent-hover, confirmed, possible, danger, danger-hover, focus` - light and dark values are defined in `globals.css` and were contrast-checked (text >= 4.5:1, UI >= 3:1). Re-check any new token with the same method. `card`, `elevated`, `surface-hover`, `stealth`, `direct` are legacy/admin-only aliases: do not use in customer code. Radii are `rounded-tag` (3px), `rounded-control` (4px), `rounded-card` (6px); `rounded-2xl/3xl` are shims for admin and banned in customer files. Shadows: none.

## Fonts
`next/font/google` in `layout.tsx`: `Newsreader` (`--font-newsreader`), `IBM_Plex_Sans` (`--font-plex-sans`), `IBM_Plex_Mono` (`--font-plex-mono`). Do not name a font variable `--font-sans` (collides with the Tailwind theme key).

## Shared classes (use these, do not re-style per page)
`panel`, `eyebrow` (rare), `data`, `ref`, `link`, `notice` + `notice-error` | `notice-success`, `display-title`, `page-title`, `section-title`, `card-title`, `section-head`, `field-label`, `field`, `btn` + `btn-sm` + (`btn-primary` | `btn-secondary` | `btn-ghost` | `btn-danger`), `nav-link`, `chip`, `badge` + (`badge-confirmed` | `badge-possible` | `badge-neutral` | `badge-example`), `card-possible`, `tag` (+ `tag-accent|warning|rookie`).
States are part of the contract: `btn-secondary[aria-pressed="true"]`, `chip[aria-current]` / `chip:has(input:checked)` / `chip[data-state=only|excluded]`, `nav-link[aria-current="page"]`, `field[aria-invalid]`, global `:focus-visible` ring.

## Card anatomy (`ListingCard`, `CardImage`)
- Phone: a 96px 5:7 mat thumbnail beside tier, name, detail, tags, price/store/checked; listed-as, reasons, caution and actions run full width.
- `sm`+: a 5:4 mat plate with centred art (`mix-blend-multiply` in light mode so white store backgrounds disappear), then the body. Max 4 columns.
- Open store is the only ink button; Save is secondary with `aria-pressed`; Hide and Not a match are ghost.
- No photo: the slab-label fallback (styled like a grading-slab label), never a broken image icon.

## Icons
Only the four inline SVGs in `components/icons.tsx` (`IconCheck`, `IconPossible`, `IconExternal`, `IconChevron`). No emoji, unicode glyph icons or icon packages.

## Rules for changes
- Add a class to `globals.css` only when two or more places need it; name it by role, not by look.
- Touch targets at least 40px; keep the global focus ring.
- Customer copy never contains `backfill`, `canonical`, `MVP`, `cached listings`; "Serialized" reads "Numbered" (`customer-copy.test.ts`).
- `visual-language.test.ts` bans `rounded-2xl/3xl/full`, `shadow-card`, gradients, sub-12px text, text opacity, uppercase, emoji and glyph icons in customer files. Extend it rather than bypass it.
- Example content is labelled as an example (`badge-example`, "Illustrative example").
- IDs from different data layers differ in type (node-pg returns bigint as strings, Supabase REST returns numbers): compare via `labelForCatalogueId` / `String()`, never `===` on raw ids.
- Update this skill when the token or class contract changes.
