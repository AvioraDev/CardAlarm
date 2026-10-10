---
name: cardalarm-ux-review
description: Pre-merge UX and accessibility checklist for CardAlarm customer pages. Use before committing or reviewing any change to web/ pages, components, copy or forms, and when a UX bug or review comment comes in.
---

# CardAlarm UX review checklist

Run this on every customer-facing change, alongside the four required commands from `anthropic-skills:cardalarm-delivery`. Render it with `cardalarm-visual-verification` and **look at light and dark at 360px and 1280px**; where something cannot be rendered, say so in the summary rather than implying it was seen. A green test run is not a visual check: the watchlist detail page passed every test while a real id-type bug hid rows, and only the screenshot exposed it.

## Structure and states
- [ ] Content before chrome on the dashboard/saved pages; first card visible on a phone without scrolling past stat tiles.
- [ ] Loading (`loading.tsx` or Suspense), empty and error states exist; each empty state names its cause (no watchlists / no matches yet / filters hide everything / nothing saved) and offers the next action.
- [ ] Errors from actions are shown (`role="alert"`) with friendly copy, never raw slugs or decoded input echoed back (`friendlyError`).
- [ ] Destructive actions confirm (`ConfirmSubmitButton`); form submits show pending (`SubmitButton`).

- [ ] At 1280x900 the first card's Open store button is above the fold; no database IDs shown as labels (resolve to names or drop the row).

## Trust and honesty
- [ ] Possible matches are visibly different from confirmed (dashed border + badge + caution line + separate section).
- [ ] Counts are honest: totals, page ranges and confirmed/possible splits come from the same query.
- [ ] Example content is labelled; nothing implies a customer can trigger a store scan ("Refresh matches" only re-checks what is already found).
- [ ] Every match is explainable: tier, percent, plain-English reasons.

## Copy
- [ ] No `backfill`, `canonical`, `MVP`, `cached listings`; "Numbered", not "Serialized". Sentence case; no uppercase buttons/labels.
- [ ] Plain language a collector would use ("Found cards", "Filter details"), no database IDs shown as labels without names.

## Accessibility
- [ ] Every input has a linked label (`htmlFor`/`id` or `useId`); icon-only controls have `aria-label`.
- [ ] Toggles expose state (`aria-pressed`/`aria-expanded`); focus ring visible; colour is never the only signal.
- [ ] Images: decorative or alt text built from parsed fields (never raw store text); `prefers-reduced-motion` respected.
- [ ] Contrast of muted text and placeholders is adequate.

## Safety
- [ ] Store-controlled text/URLs/images follow `cardalarm-untrusted-store-content`.
- [ ] No customer page imports `ScanPanel` or calls `startScan` (`scan-architecture.test.ts`).

## After the review
Record new recurring failures here as checklist items so the next reviewer gets them for free.
