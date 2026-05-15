import fs from 'node:fs';
import path from 'node:path';

function readWebFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', 'web', 'src', ...segments), 'utf8');
}

describe('admin scan QA page', () => {
  it('is protected through the admin-only query helper', () => {
    const page = readWebFile('app', 'admin', 'scan-qa', 'page.tsx');
    const helper = readWebFile('lib', 'admin-scan-qa.ts');

    expect(page).toContain('getAdminScanQaData');
    expect(helper).toContain('await requireAdmin()');
  });

  it('uses bounded recent match queries with scan evidence joins', () => {
    const helper = readWebFile('lib', 'admin-scan-qa.ts');

    expect(helper).toContain('const DEFAULT_MATCH_LIMIT = 100');
    expect(helper).toContain('const MAX_MATCH_LIMIT = 200');
    expect(helper).toContain('Math.min(Math.max(parsed, 1), MAX_MATCH_LIMIT)');
    expect(helper).toContain('from public.watchlist_matches wm');
    expect(helper).toContain('join public.store_products sp on sp.id = wm.store_product_id');
    expect(helper).toContain('from public.product_classifications pc');
    expect(helper).toContain("pc.classifier_type = 'deterministic'");
    expect(helper).toContain('left join public.product_card_matches pcm on pcm.id = wm.product_card_match_id');
    expect(helper).toContain('limit $${params.length}');
  });

  it('loads latest scan job/run and per-store progress projections', () => {
    const helper = readWebFile('lib', 'admin-scan-qa.ts');

    expect(helper).toContain('from public.scan_jobs sj');
    expect(helper).toContain('left join public.scan_runs sr on sr.id = sj.scan_run_id');
    expect(helper).toContain('from public.store_scan_runs ssr');
    expect(helper).toContain("ssr.metadata->>'pagesFetched'");
    expect(helper).toContain("ssr.metadata->>'stopReason'");
  });

  it('renders scan summary, store progress, and recent match evidence', () => {
    const page = readWebFile('app', 'admin', 'scan-qa', 'page.tsx');

    expect(page).toContain('Scan progress and match evidence');
    expect(page).toContain('Latest Scan');
    expect(page).toContain('Store Progress');
    expect(page).toContain('Recent Match Evidence');
    expect(page).toContain('Classification');
    expect(page).toContain('Identity Match');
    expect(page).toContain('Watchlist Match');
  });

  it('stays read-only and does not expose match correction actions', () => {
    const page = readWebFile('app', 'admin', 'scan-qa', 'page.tsx');
    const helper = readWebFile('lib', 'admin-scan-qa.ts');

    expect(page).not.toContain('use server');
    expect(helper).not.toContain('execute(');
    expect(helper).not.toContain('insert into');
    expect(helper).not.toContain('update public');
    expect(helper).not.toContain('delete from');
    expect(page).not.toContain('dismiss');
    expect(page).not.toContain('not-a-match');
    expect(page).not.toContain('approve');
  });
});
