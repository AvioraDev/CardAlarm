import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'supabase', 'migrations', '20260513005000_consolidate_user_owned_rls_policies.sql'),
  'utf8',
);

describe('user-owned RLS policy consolidation migration', () => {
  it('drops legacy public-role duplicate policies on target tables', () => {
    expect(migration).toContain('drop policy if exists "profiles are owner readable" on public.profiles');
    expect(migration).toContain('drop policy if exists "profiles are owner writable" on public.profiles');
    expect(migration).toContain('drop policy if exists "watchlists are owner readable" on public.watchlists');
    expect(migration).toContain('drop policy if exists "watchlists are owner writable" on public.watchlists');
    expect(migration).toContain('drop policy if exists "watchlist rules are owner readable" on public.watchlist_rules');
    expect(migration).toContain('drop policy if exists "watchlist rules are owner writable" on public.watchlist_rules');
    expect(migration).toContain('drop policy if exists "match feedback is owner readable" on public.match_feedback');
    expect(migration).toContain('drop policy if exists "match feedback is owner writable" on public.match_feedback');
  });

  it('does not drop the modern authenticated owner policies', () => {
    expect(migration).not.toContain('drop policy if exists profiles_select_own');
    expect(migration).not.toContain('drop policy if exists profiles_update_own');
    expect(migration).not.toContain('drop policy if exists profiles_insert_own');
    expect(migration).not.toContain('drop policy if exists watchlists_select_own');
    expect(migration).not.toContain('drop policy if exists watchlists_insert_own');
    expect(migration).not.toContain('drop policy if exists watchlists_update_own');
    expect(migration).not.toContain('drop policy if exists watchlists_delete_own');
    expect(migration).not.toContain('drop policy if exists watchlist_rules_select_own');
    expect(migration).not.toContain('drop policy if exists watchlist_rules_insert_own');
    expect(migration).not.toContain('drop policy if exists watchlist_rules_update_own');
    expect(migration).not.toContain('drop policy if exists watchlist_rules_delete_own');
    expect(migration).not.toContain('drop policy if exists match_feedback_select_own');
    expect(migration).not.toContain('drop policy if exists match_feedback_insert_own');
  });

  it('documents verification queries and expected role access', () => {
    expect(migration).toContain('Verification SQL after deploy');
    expect(migration).toContain('pg_policies');
    expect(migration).toContain('Expected modern policies');
    expect(migration).toContain('no policies with roles = {public}');
    expect(migration).toContain('Advisor verification');
  });
});
