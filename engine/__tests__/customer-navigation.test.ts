import fs from 'node:fs';
import path from 'node:path';

function readWebFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', 'web', 'src', ...segments), 'utf8');
}

describe('customer navigation focus', () => {
  it('keeps raw inventory out of the primary dashboard experience', () => {
    const dashboard = readWebFile('app', 'dashboard', 'page.tsx');

    expect(dashboard).toContain('For You');
    expect(dashboard).toContain('Cards found for you');
    expect(dashboard).toContain('Numbered');
    expect(dashboard).toContain('getUserWatchlistFilterFacets');
    expect(dashboard).toContain('getUserWatchlistFilterFacets(user.id, cleanFilters)');
    expect(dashboard).not.toContain('getFilterFacets');
    expect(dashboard).toContain('redirect(profile.role === "admin" ? "/admin/inventory" : "/dashboard")');
    expect(dashboard).not.toContain('Browse All');
    expect(dashboard).not.toContain('cached listings');
  });

  it('keeps global admin navigation to a single Admin link', () => {
    const layout = readWebFile('app', 'layout.tsx');

    expect(layout).toContain('For You');
    expect(layout).toContain('Watchlists');
    expect(layout).toContain('href="/saved"');
    expect(layout).toContain('Saved');
    expect(layout).toContain('href="/admin"');
    expect(layout).not.toContain('href="/admin/stores"');
    expect(layout).not.toContain('href="/admin/scans"');
    expect(layout).not.toContain('href="/admin/inventory"');
  });

  it('exposes inventory only through admin tooling', () => {
    const inventory = readWebFile('app', 'admin', 'inventory', 'page.tsx');
    const admin = readWebFile('app', 'admin', 'page.tsx');

    expect(inventory).toContain('await requireAdmin()');
    expect(inventory).toContain('Scanned product inventory');
    expect(inventory).toContain('getFilterFacets');
    expect(admin).toContain('href="/admin/inventory"');
    expect(admin).toContain('Admin Console');
    expect(admin).toContain('Store Sources');
    expect(admin).toContain('Scan Runs');
    expect(admin).toContain('Inventory QA');
    expect(admin).not.toContain('legacy admin watchlist management');
  });

  it('adds customer saved cards and card feedback controls', () => {
    const savedPage = readWebFile('app', 'saved', 'page.tsx');
    const listingCard = readWebFile('app', 'components', 'listing-card.tsx');
    const dashboard = readWebFile('app', 'dashboard', 'page.tsx');

    expect(savedPage).toContain('getUserSavedCards');
    expect(savedPage).toContain('await requireUser()');
    expect(savedPage).toContain('Saved');
    expect(dashboard).toContain('showFeedbackControls');
    expect(listingCard).toContain('saveCardAction');
    expect(listingCard).toContain('unsaveCardAction');
    expect(listingCard).toContain('dismissCardAction');
    expect(listingCard).toContain('notMatchCardAction');
    expect(listingCard).toContain('Not a match');
    expect(listingCard).toContain('Open store');
  });

  it('records feedback only after verifying user watchlist ownership', () => {
    const actions = readWebFile('lib', 'actions.ts');

    expect(actions).toContain('assertUserCanAccessProduct');
    expect(actions).toContain('from public.watchlist_matches wm');
    expect(actions).toContain('join public.watchlists w on w.id = wm.watchlist_id');
    expect(actions).toContain('w.user_id = $1');
    expect(actions).toContain('insert into public.match_feedback');
    expect(actions).toContain('"save"');
    expect(actions).toContain('"unsave"');
    expect(actions).toContain('"dismiss"');
    expect(actions).toContain('"undo_dismiss"');
    expect(actions).toContain('"not_match"');
    expect(actions).toContain('revalidatePath("/dashboard")');
    expect(actions).toContain('revalidatePath("/saved")');
  });

  it('exposes conservative watchlist email alert controls', () => {
    const newWatchlist = readWebFile('app', 'watchlists', 'new', 'page.tsx');
    const watchlistsPage = readWebFile('app', 'watchlists', 'page.tsx');
    const watchlistDetail = readWebFile('app', 'watchlists', '[id]', 'page.tsx');
    const watchlistActions = readWebFile('lib', 'watchlist-actions.ts');

    expect(newWatchlist).toContain('name="notification_enabled"');
    expect(newWatchlist).toContain('Email alerts');
    expect(watchlistsPage).toContain('toggleWatchlistNotificationsAction');
    expect(watchlistsPage).toContain('Alerts {watchlist.notification_enabled ? "on" : "off"}');
    expect(watchlistDetail).toContain('Turn Alerts On');
    expect(watchlistDetail).toContain('Turn Alerts Off');
    expect(watchlistActions).toContain('notification_enabled: formBoolean(formData, "notification_enabled")');
    expect(watchlistActions).toContain('toggleWatchlistNotificationsAction');
    expect(watchlistActions).toContain('enqueueAndProcessWatchlistAlerts');
  });
});
