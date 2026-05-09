# Supabase CLI Configuration

## Status

The Supabase CLI is installed and `supabase/config.toml` exists for this repo.

Formal `supabase link --project-ref quqcakgjoypgfuwylpbq` currently fails because the active Supabase CLI account does not have management API privileges for that project. Direct database CLI operations still work through `DATABASE_POSTGRES_URL_NON_POOLING`.

## Repo Commands

Use these wrappers from the repo root:

```powershell
npm run supabase:migrations:list
npm run supabase:migrations:dry-run
npm run supabase:migrations:push
```

The wrapper reads `DATABASE_POSTGRES_URL_NON_POOLING` or `DATABASE_URL` from `.env` / `web/.env.local` and passes it to the Supabase CLI via `--db-url`. It does not print the database password.

## Formal Link Requirement

To use linked-project commands such as `supabase db push --linked`, sign in with a Supabase account that has access to the CardAlarm project, then run:

```powershell
supabase link --project-ref quqcakgjoypgfuwylpbq
```

If prompted, use the remote Postgres password from the local environment file.

## Current Caveat

The remote migration history has manual/remote entries not represented by local migration files. Treat `npm run supabase:migrations:dry-run` as mandatory before pushing migrations.
