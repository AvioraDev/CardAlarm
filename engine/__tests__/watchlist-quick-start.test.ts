import { readFileSync } from 'fs';
import { join } from 'path';

function readWebFile(...parts: string[]): string {
  return readFileSync(join(__dirname, '..', '..', 'web', 'src', ...parts), 'utf8');
}

describe('watchlist quick start', () => {
  const page = readWebFile('app', 'watchlists', 'new', 'page.tsx');
  const quickStart = readWebFile('app', 'watchlists', 'new', 'quick-start.tsx');
  const actions = readWebFile('lib', 'watchlist-actions.ts');
  const formFields = readWebFile('app', 'watchlists', 'watchlist-form-fields.tsx');

  it('wires quick mode into the new watchlist page', () => {
    expect(page).toContain('quick');
    expect(page).toContain('QuickStartPlayerPicker');
    expect(page).toContain('requireUser()');
    expect(page).not.toContain('startScan');
    expect(page).not.toContain('ScanPanel');
  });

  it('posts the field names the existing parser accepts', () => {
    expect(quickStart).toContain('name="player_id"');
    expect(quickStart).toContain('name="after" value="dashboard"');
    expect(quickStart).toContain('name="name"');
    expect(quickStart).toContain('Start watching');
    expect(quickStart).not.toContain('startScan');
  });

  it('redirects only through a literal whitelist', () => {
    expect(actions).toContain('after === "dashboard" ? `/dashboard?watchlistId=${watchlist.id}`');
    expect(actions).not.toMatch(/redirect\(String\(formData\.get\(/);
    expect(actions).not.toMatch(/redirect\(after\s*[,)]/);
  });

  it('lets the full form prefill the watchlist name', () => {
    expect(formFields).toContain('defaultName');
  });
});
