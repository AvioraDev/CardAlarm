import fs from 'node:fs';
import path from 'node:path';

function readWebFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', 'web', 'src', ...segments), 'utf8');
}

describe('server action validation and ownership checks', () => {
  it('validates watchlist form data before creating records', () => {
    const actions = readWebFile('lib', 'watchlist-actions.ts');

    expect(actions).toContain('parseWatchlistForm(formData)');
    expect(actions).toContain('if (!parsed.ok) redirect(actionErrorPath("/watchlists/new", parsed.error))');
    expect(actions).toContain('watchlistInput.name');
    expect(actions).toContain('watchlistInput.minimumMatchConfidence');
    expect(actions).not.toContain('watchlistError.message');
    expect(actions).not.toContain('ruleError.message');
  });

  it('requires current-user ownership for every watchlist mutation', () => {
    const actions = readWebFile('lib', 'watchlist-actions.ts');

    expect(actions).toContain('async function requireOwnedWatchlist');
    expect(actions).toContain('.eq("user_id", userId)');
    expect(actions).toContain('parsePositiveFormId(formData, "watchlistId")');
    expect(actions).toContain('parseBooleanState(formData, "isActive")');
    expect(actions).toContain('parseBooleanState(formData, "notificationsEnabled")');
    expect((actions.match(/await requireOwnedWatchlist/g) ?? []).length).toBe(5);
    expect(actions).not.toContain('throw new Error(error.message)');
  });

  it('refreshes all watchlists only for the signed-in user and active watchlists', () => {
    const actions = readWebFile('lib', 'watchlist-actions.ts');
    const dashboard = readWebFile('app', 'dashboard', 'page.tsx');

    expect(actions).toContain('export async function refreshAllUserWatchlistsAction');
    expect(actions).toContain('.eq("user_id", user.id)');
    expect(actions).toContain('.eq("is_active", true)');
    expect(actions).toContain('await backfillWatchlist(user.id, watchlist.id)');
    expect(actions).toContain('await enqueueAndProcessWatchlistAlerts(watchlist.id)');
    expect(dashboard).toContain('refreshAllUserWatchlistsAction');
    expect(dashboard).toContain('Refresh Matches');
  });

  it('validates match feedback ids and visible match ownership', () => {
    const actions = readWebFile('lib', 'actions.ts');

    expect(actions).toContain('function parseFormId');
    expect(actions).toContain('/^[1-9]\\d*$/.test');
    expect(actions).toContain('async function assertUserCanAccessFeedbackTarget');
    expect(actions).toContain('from public.watchlist_matches wm');
    expect(actions).toContain('w.user_id = $1');
    expect(actions).toContain('sp.current_availability = true');
    expect(actions).toContain('wm.product_card_match_id = pcm.id or wm.product_card_match_id is null');
    expect(actions).toContain('insert into public.match_feedback');
  });

  it('keeps admin actions behind admin role and validates admin ids', () => {
    const storeActions = readWebFile('lib', 'store-actions.ts');
    const scanActions = readWebFile('lib', 'actions.ts');

    expect((storeActions.match(/await requireAdmin\(\)/g) ?? []).length).toBe(3);
    expect(storeActions).toContain('function parseStoreId');
    expect(storeActions).toContain('parseStoreId(formData)');
    expect(scanActions).toContain('await requireAdmin()');
    expect(scanActions).toContain('if (mode !== "watchlist" && mode !== "full")');
  });
});
