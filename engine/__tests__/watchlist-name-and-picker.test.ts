import fs from 'node:fs';
import path from 'node:path';
import { parseWatchlistForm } from '../../web/src/lib/watchlist-form';
import { linkWatchlistPlayers } from '../src/watchlist-players';

/**
 * Acceptance test findings, step 8 and 9: a watchlist's name is a label, never a search term, and the player
 * picker offers every person once.
 */
const read = (...segments: string[]) => fs.readFileSync(path.join(__dirname, '../..', ...segments), 'utf8');

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

describe('the watchlist name is never a search term', () => {
  it('a player watchlist with any name has no include terms, so it matches by the player alone', () => {
    for (const name of ['Anthony Edwards', 'Acceptance test - Anthony Edwards', 'My Ant collection']) {
      const result = parseWatchlistForm(form({ name, player_id: '2297' }));
      expect(result).toMatchObject({ ok: true, value: { playerId: 2297, includeTerms: null, rookieOnly: false } });
    }
  });

  it('a watchlist called "Rookies" does not become a rookies-only watchlist by its name', () => {
    const result = parseWatchlistForm(form({ name: 'Rookies', player_id: '5' }));
    expect(result).toMatchObject({ ok: true, value: { rookieOnly: false, includeTerms: null } });
    // The checkbox is the way to ask for rookies.
    expect(parseWatchlistForm(form({ name: 'Rookies', player_id: '5', rookie_only: 'on' }))).toMatchObject({ ok: true, value: { rookieOnly: true } });
  });

  it('the words typed into "Must include words" are the only terms searched', () => {
    const result = parseWatchlistForm(form({ name: 'Anything', player_id: '5', include_terms: 'Prizm, Silver' }));
    expect(result).toMatchObject({ ok: true, value: { includeTerms: 'Prizm, Silver' } });
  });

  it('neither create nor update copies the name into the rule', () => {
    const source = read('web/src/lib/watchlist-actions.ts');
    expect(source).not.toMatch(/include_terms:[^,]*watchlistInput\.name/s);
    expect(source.match(/include_terms: watchlistInput\.includeTerms,/g)).toHaveLength(2);
  });

  it('linking a words-only rule to its player reads the include terms, never the watchlist name', async () => {
    const queries: string[] = [];
    await linkWatchlistPlayers({ query: async (sql: string) => { queries.push(sql); return { rows: [], rowCount: 0 }; } } as never);
    expect(queries[0]).not.toMatch(/\bw\.name\b/);
  });

  it('a migration clears names already copied into rules that name a catalogue pick', () => {
    const sql = read('supabase/migrations/20261012040000_watchlist_name_not_a_search_term.sql');
    expect(sql).toContain('lower(trim(wr.include_terms)) = lower(trim(w.name))');
    expect(sql).toContain('wr.player_id is not null');
    expect(sql).toContain('set include_terms = null');
  });
});

describe('the player picker', () => {
  const options = read('web/src/lib/catalogue-options.ts');

  it('offers every person once, not the first 300 and not multi-player card strings', () => {
    const playerOptions = options.slice(options.indexOf('async function playerOptions'), options.indexOf('export async function searchPlayerOptions'));
    expect(playerOptions).not.toMatch(/limit\s+\d+/i);
    expect(playerOptions).toContain('distinct on (normalized_name)');
    expect(playerOptions).toContain('${SINGLE_PLAYER_SQL}');
    // "Kevin Durant/Kevin Durant" and "A / B / C" are card strings: a slash, an ampersand or "and" between names.
    const pattern = new RegExp(/full_name !~ '(\[\/&\])'/.exec(options)![1]!);
    for (const card of ['Kevin Durant/Kevin Durant', 'Dwyane Wade / LeBron James / Chris Bosh', 'A & B']) expect(pattern.test(card)).toBe(true);
    for (const person of ['Kevin Durant', 'Karl-Anthony Towns', "De'Aaron Fox", 'Jaren Jackson Jr.']) expect(pattern.test(person)).toBe(false);
  });

  it('gives every option list numeric ids, because pg returns bigint as text', () => {
    for (const list of ['player.id', 'team.id', 'set.id', 'card.id', 'variant.id']) expect(options).toContain(`Number(${list})`);
  });

  it('the quick start looks the chosen player up by id and searches by name instead of a 300-name list', () => {
    const page = read('web/src/app/watchlists/new/page.tsx');
    expect(page).toContain('getPlayerOption(selected.playerId)');
    expect(page).not.toContain('catalogueOptions.players.find');
    const picker = read('web/src/app/watchlists/new/quick-start.tsx');
    expect(picker).toContain('type="search"');
    expect(picker).not.toContain('<select');
    expect(picker).toContain('No players match');
  });
});
