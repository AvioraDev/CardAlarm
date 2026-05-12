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
});
