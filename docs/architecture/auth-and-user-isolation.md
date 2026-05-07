# Auth And User Isolation

## Status

Supabase Auth is now wired into the Next.js app using cookie-based SSR helpers.
This phase establishes the route protection needed before replacing the legacy global watchlist with user-owned watchlists.

## Implemented

- Installed `@supabase/ssr` and `@supabase/supabase-js` in the web app.
- Added server Supabase client helpers under `web/src/lib/supabase`.
- Added auth server actions for sign up, sign in, and sign out.
- Added public `/login` and `/signup` routes.
- Added `/auth/callback` for PKCE callback handling.
- Added `/auth/confirm` for SSR-safe email confirmation links using Supabase `token_hash`.
- Added Next.js 16 `proxy.ts` route protection for authenticated and admin paths.
- Added profile creation/upsert on first authenticated access.
- Added `profiles_insert_own` RLS so authenticated users can create their own profile row.
- Moved the existing feed from `/` to protected `/dashboard`.
- Converted `/` into a public product landing route.
- Protected `/admin` with `profiles.role = 'admin'`.
- Guarded legacy global mutations behind authenticated/admin checks.

## Route Protection

Authenticated routes:

- `/dashboard`
- `/search`
- `/watchlists`
- `/settings`

Admin routes:

- `/admin`

The Proxy guard performs fast request-time checks and redirects unauthenticated users to `/login`.
Server pages and server actions still enforce authorization because Proxy is not treated as the only security layer.
Profile creation uses the authenticated Supabase client so it respects RLS instead of depending on the server Postgres URL.

## Compatibility Notes

The dashboard still reads from compatibility tables:

- `listings_feed`
- `scan_runs`
- `watchlist`

This is intentional for the migration bridge. The next MVP task should move watchlist creation and dashboard matching onto:

- `watchlists`
- `watchlist_rules`
- `watchlist_matches`

## Supabase Email Confirmation

For SSR apps, Supabase recommends email templates that send `token_hash` to a server route.
If email confirmation is enabled, update the Supabase Confirm Signup email template to point at CardAlarm's confirm endpoint:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
```

If using Supabase redirect allow-listing, ensure these local URLs are allowed:

- `http://localhost:3000/auth/callback`
- `http://localhost:3000/auth/confirm`

The app still supports `/auth/callback?code=...` because Supabase can also redirect PKCE flows with an auth code.

## Manual Test Plan

1. Start the app with `npm run web:dev`.
2. Visit `/dashboard` while signed out and confirm it redirects to `/login`.
3. Create an account at `/signup`.
4. Confirm email if Supabase email confirmation is enabled.
5. Sign in at `/login`.
6. Confirm `/dashboard` loads.
7. Confirm `/watchlists` loads as a protected placeholder.
8. Confirm `/admin` redirects non-admin users to `/dashboard`.
9. Set a test profile to admin in Supabase, then confirm `/admin` loads for that user.
10. Sign out and confirm protected routes require login again.

## Commands

```powershell
npx tsc --noEmit
npm test -- --runInBand
cd web
npm run lint
npm run build
```

## Next MVP Task

Build user-owned watchlist CRUD and structured rules.
This should replace the current admin-only legacy watchlist workflow and trigger immediate backfill against cached inventory.
