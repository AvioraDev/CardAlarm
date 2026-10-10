---
name: cardalarm-untrusted-store-content
description: How CardAlarm renders store-controlled text, links and images safely. Use whenever a change displays scraped fields (title, description, image_url, product URL, reasons) or adds a new place that links out to a store.
---

# Untrusted store content

Everything scraped from a store is attacker-controllable. Helpers live in `web/src/lib/match-display.ts` (pure, unit-tested in `engine/__tests__/match-display.test.ts`).

## Rules
- **Text** renders only as React text. Never `dangerouslySetInnerHTML`, never HTML from descriptions.
- **Links**: use `safeListingHref()` - http(s) only, no embedded credentials; anything else becomes `#`. Outbound links use `target="_blank" rel="noopener noreferrer"`.
- **Images**: use `cardImageSrc()` / `cardImageSrcSet()` - http(s) only, no credentials, upgraded to https, Shopify `?width=` resizing for known Shopify hosts. Render with `CardImage`: `loading` (eager for the first two cards, lazy otherwise), `decoding="async"`, intrinsic `width/height` and `aspect-[5/7]`, `referrerPolicy="no-referrer"`, and a fallback panel on error.
- **Plain `<img>`, not `next/image`** (Decision D-a): store image hosts are dynamic; `next/image` would need a wildcard `remotePatterns`, turning `/_next/image` into an open image proxy (SSRF surface, bandwidth cost). Revisit only if a CSP `img-src` allowlist is introduced.
- **Alt text** comes from parsed card fields via `cardAltText()`, never the raw store title.
- **Reasons** go through `customerReasons()` (maps engine strings to plain English, drops internal wording, caps length, strips control characters).
- **Ingest side**: validate and normalise URLs when scanning where feasible (https only, allow-listed hosts is a future hardening); never trust handles in URL construction - encode them.

## Checks
- A test for each new sanitiser covering `javascript:`, `data:`, `ftp:`, credentials in URLs, protocol-relative URLs, and `<script>` in text.
- `landing-and-card.test.ts` asserts the card contains no `dangerouslySetInnerHTML` and no direct `href={listing.url`; extend it when adding components that show store data.
